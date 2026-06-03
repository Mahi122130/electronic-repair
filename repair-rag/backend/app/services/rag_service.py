"""
app/services/rag_service.py
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

import structlog
from groq import AsyncGroq
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

_groq_client: AsyncGroq | None = None
_embedding_model = None


def _groq() -> AsyncGroq:
    global _groq_client
    if _groq_client is None:
        _groq_client = AsyncGroq(api_key=settings.groq_api_key)
    return _groq_client


def _get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("loading_embedding_model", model="all-MiniLM-L6-v2")
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        _embedding_model_loaded = True
        logger.info("embedding_model_loaded")
    return _embedding_model


@dataclass
class RetrievedChunk:
    id: uuid.UUID
    title: str
    device_type: str
    manufacturer: str | None
    model: str | None
    chunk_text: str
    source_url: str | None
    similarity_score: float


@dataclass
class RAGResult:
    answer: str
    retrieved_chunks: list[RetrievedChunk]
    model_used: str
    prompt_tokens: int
    completion_tokens: int


async def embed_query(text_query: str) -> list[float]:
    import asyncio
    model = _get_embedding_model()
    loop = asyncio.get_event_loop()
    embedding = await loop.run_in_executor(
        None,
        lambda: model.encode(text_query, normalize_embeddings=True).tolist()
    )
    return embedding


async def vector_search(
    db: AsyncSession,
    query_embedding: list[float],
    top_k: int = 6,
    device_type: str | None = None,
) -> list[RetrievedChunk]:
    vec_literal = str(query_embedding)
    where_clause = "WHERE device_type = :device_type" if device_type else ""

    sql = text(f"""
        SELECT
            id, title, device_type, manufacturer, model,
            chunk_text, source_url,
            1 - (embedding <=> CAST(:embedding AS vector)) AS similarity_score
        FROM repair_guides
        {where_clause}
        ORDER BY embedding <=> CAST(:embedding AS vector)
        LIMIT :top_k
    """)

    params: dict = {"embedding": vec_literal, "top_k": top_k}
    if device_type:
        params["device_type"] = device_type

    result = await db.execute(sql, params)
    rows = result.fetchall()

    return [
        RetrievedChunk(
            id=row.id,
            title=row.title,
            device_type=row.device_type,
            manufacturer=row.manufacturer,
            model=row.model,
            chunk_text=row.chunk_text,
            source_url=row.source_url,
            similarity_score=float(row.similarity_score),
        )
        for row in rows
        if float(row.similarity_score) > 0.15  # lower threshold = more results
    ]


# ── System prompt — handles broken English and unclear requests ───────────────
_SYSTEM_PROMPT = """You are an expert electronics repair technician with 20+ years of experience.
You help people fix their devices — phones, laptops, consoles, tablets, and all electronics.

CRITICAL INSTRUCTIONS:
1. The user may write in broken, incomplete, or unclear English. ALWAYS try to understand what device/problem they mean and help them. Never say "I don't understand" — make your best guess and answer.
2. If they upload an image, describe what you see damaged/broken and give repair steps for it.
3. Use the REPAIR MANUAL CONTEXT provided to give accurate, specific steps.
4. If context has relevant info, use it directly with specific part names, screw sizes, tools needed.
5. If context is limited, still give the best repair guidance you can from your expertise.
6. EXCEPTION FOR INTERACTION / GREETINGS / IDENTITY QUESTIONS:
   If the user's input is a casual greeting (e.g., 'hi', 'hello'), a general conversational remark, or a question targeting your identity (e.g., 'who are you', 'whoa re u'), DO NOT use the structural troubleshooting template listed below. Instead, ignore the template rules, reply politely as an expert Electronic Repair Assistant, and invite them to describe the hardware issue or upload an image of the device they want to diagnose today.

   Otherwise, for all explicit diagnostic requests, ALWAYS structure your response as:

**🔍 Issue Identified:** [what problem you understood]
**🛠 Tools Needed:** [list tools]
**⚠️ Safety Warning:** [any relevant safety warnings]
**📋 Step-by-Step Repair:**
1. [step]
2. [step]
...
**💡 Tips:** [pro tips]
**🔗 Difficulty:** Easy/Medium/Hard

7. Be specific — mention exact screw types, temperatures, part numbers when available.
8. Always warn about ESD, battery safety, and voiding warranty where relevant."""


def _build_context_block(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return "No specific repair manual found — use your expert knowledge."
    sections = []
    for i, chunk in enumerate(chunks, 1):
        header = f"[Source {i}] {chunk.title}"
        if chunk.manufacturer or chunk.model:
            header += f" — {chunk.manufacturer or ''} {chunk.model or ''}".strip()
        if chunk.source_url:
            header += f" ({chunk.source_url})"
        sections.append(f"{header}\n{chunk.chunk_text}")
    return "\n\n---\n\n".join(sections)


async def generate_answer(
    user_query: str,
    retrieved_chunks: list[RetrievedChunk],
    image_base64: str | None = None,
    image_mime: str = "image/jpeg",
) -> RAGResult:
    context = _build_context_block(retrieved_chunks)

    user_content_text = (
        f"REPAIR MANUAL CONTEXT:\n{context}\n\n"
        f"USER REQUEST: {user_query}\n\n"
        "Please identify the device/issue and provide complete repair instructions."
    )

    if image_base64:
        model = settings.groq_vision_model
        user_content = [
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{image_mime};base64,{image_base64}",
                    "detail": "high",
                },
            },
            {
                "type": "text",
                "text": (
                    f"REPAIR MANUAL CONTEXT:\n{context}\n\n"
                    f"USER REQUEST: {user_query}\n\n"
                    "First describe what damage or issue you can see in the image. "
                    "Then provide complete step-by-step repair instructions."
                ),
            },
        ]
    else:
        model = settings.groq_chat_model
        user_content = user_content_text

    logger.info("groq_request", model=model, has_image=bool(image_base64))

    response = await _groq().chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        temperature=0.1,
        max_tokens=2048,
    )

    choice = response.choices[0]
    usage = response.usage

    return RAGResult(
        answer=choice.message.content,
        retrieved_chunks=retrieved_chunks,
        model_used=model,
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
    )