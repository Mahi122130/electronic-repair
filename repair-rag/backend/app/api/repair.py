"""
app/api/repair.py
──────────────────
POST /repair/query — the primary RAG endpoint.

Accepts multipart/form-data with:
  - text_query : str      (required)
  - image      : File     (optional)
  - session_id : UUID str (optional — creates new session if omitted)
  - device_type: str      (optional — used to pre-filter vector search)

Flow:
  1. Validate + upload image (if present) with graceful Supabase fallback
  2. Embed text query
  3. Vector search pgvector
  4. Send context + query (+ image) to Groq
  5. Persist user message + assistant response to DB
  6. Return structured JSON
"""

from __future__ import annotations

import uuid
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.orm import RepairHistory, RepairSession
from app.schemas.schemas import GuideChunkOut, RepairQueryResponse, SessionDetailOut, SessionOut
from app.services import image_service, rag_service

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/repair", tags=["repair"])


# ── POST /repair/query ────────────────────────────────────────────────────────

@router.post("/query", response_model=RepairQueryResponse, status_code=status.HTTP_200_OK)
async def query_repair(
    # ── Form fields ──────────────────────────────────────────
    text_query: Annotated[str, Form(min_length=3, max_length=2000)],
    session_id: Annotated[str | None, Form()] = None,
    device_type: Annotated[str | None, Form()] = None,
    # ── Optional image file ───────────────────────────────────
    image: Annotated[UploadFile | None, File()] = None,
    # ── Dependencies ─────────────────────────────────────────
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> RepairQueryResponse:
    """
    Main RAG query endpoint. Handles both text-only and multimodal (text + image) inputs.
    Gracefully handles remote storage upload issues if buckets or keys are missing.
    """
    log = logger.bind(user_id=str(user_id))

    # ── Step 1: Process image (if provided) ──────────────────────────────────
    image_b64: str | None = None
    image_url: str | None = None
    mime: str = "image/jpeg"

    if image and image.filename and image.size and image.size > 0:
        log.info("processing_image", filename=image.filename, size=image.size)
        try:
            image_b64, mime, file_path = await image_service.validate_and_process_image(image)
            
            # Try to upload to Supabase, but do not fail the request if storage isn't configured/ready
            try:
                image_url = await image_service.upload_image_to_storage(image_b64, file_path)
            except Exception as upload_err:
                log.warning("image_upload_failed_falling_back_to_local_b64", error=str(upload_err))
                image_url = None
                
        except HTTPException:
            raise
        except Exception as e:
            log.warning("image_processing_failed", error=str(e))
            image_b64 = None

    # ── Step 2: Resolve or create session ────────────────────────────────────
    session = await _resolve_session(
        db=db,
        user_id=user_id,
        session_id_str=session_id,
        device_type=device_type,
        first_query=text_query,
    )
    log = log.bind(session_id=str(session.id))

    try:
        # ── Step 3: Embed the query ───────────────────────────────────────────────
        log.info("embedding_query")
        query_embedding = await rag_service.embed_query(text_query)

        # ── Step 4: Vector search ─────────────────────────────────────────────────
        log.info("vector_search_start")
        chunks = await rag_service.vector_search(
            db=db,
            query_embedding=query_embedding,
            top_k=5,
            device_type=device_type or session.device_type,
        )

        # ── Step 5: Groq inference ────────────────────────────────────────────────
        log.info("groq_inference_start", has_image=bool(image_b64), chunks_found=len(chunks))
        rag_result = await rag_service.generate_answer(
            user_query=text_query,
            retrieved_chunks=chunks,
            image_base64=image_b64,
            image_mime=mime,
        )

    except Exception as e:
        log.error("rag_pipeline_execution_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process AI inference components: {str(e)}"
        )

    # ── Step 6: Persist user message ─────────────────────────────────────────
    user_msg = RepairHistory(
        session_id=session.id,
        user_id=user_id,
        role="user",
        message=text_query,
        image_url=image_url,
    )
    db.add(user_msg)

    # ── Step 7: Persist assistant response ───────────────────────────────────
    assistant_msg = RepairHistory(
        session_id=session.id,
        user_id=user_id,
        role="assistant",
        message=rag_result.answer,
        retrieved_guide_ids=[c.id for c in rag_result.retrieved_chunks],
        model_metadata={
            "model": rag_result.model_used,
            "prompt_tokens": rag_result.prompt_tokens,
            "completion_tokens": rag_result.completion_tokens,
        },
    )
    db.add(assistant_msg)
    
    await db.flush()  # Extract auto-generated database IDs
    await db.commit()  # Save changes permanently to PostgreSQL/Supabase

    log.info("query_complete", model=rag_result.model_used)

    return RepairQueryResponse(
        session_id=session.id,
        message_id=assistant_msg.id,
        answer=rag_result.answer,
        retrieved_guides=[
            GuideChunkOut(
                id=c.id,
                title=c.title,
                device_type=c.device_type,
                manufacturer=c.manufacturer,
                model=c.model,
                chunk_text=c.chunk_text,
                similarity_score=c.similarity_score,
                source_url=c.source_url,
            )
            for c in rag_result.retrieved_chunks
        ],
        model_used=rag_result.model_used,
        image_url=image_url,
    )


# ── GET /repair/sessions ──────────────────────────────────────────────────────

@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    limit: int = 20,
    offset: int = 0,
) -> list[SessionOut]:
    """Return the authenticated user's repair session history."""
    from sqlalchemy import select
    from app.models.orm import RepairSession

    result = await db.execute(
        select(RepairSession)
        .where(RepairSession.user_id == user_id)
        .order_by(RepairSession.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [SessionOut.model_validate(s) for s in result.scalars()]


# ── GET /repair/sessions/{session_id} ────────────────────────────────────────

@router.get("/sessions/{session_id}", response_model=SessionDetailOut)
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> SessionDetailOut:
    """Return a single session with its full message history."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.orm import RepairSession

    result = await db.execute(
        select(RepairSession)
        .options(selectinload(RepairSession.history))
        .where(RepairSession.id == session_id, RepairSession.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionDetailOut.model_validate(session)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _resolve_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id_str: str | None,
    device_type: str | None,
    first_query: str,
) -> RepairSession:
    """Get existing session or create a new one."""
    from sqlalchemy import select

    if session_id_str:
        result = await db.execute(
            select(RepairSession).where(
                RepairSession.id == uuid.UUID(session_id_str),
                RepairSession.user_id == user_id,
            )
        )
        session = result.scalar_one_or_none()
        if session:
            return session

    # Create new session with auto-generated title
    title = first_query[:60] + ("…" if len(first_query) > 60 else "")
    session = RepairSession(
        user_id=user_id,
        title=title,
        device_type=device_type,
    )
    db.add(session)
    await db.flush()
    return session