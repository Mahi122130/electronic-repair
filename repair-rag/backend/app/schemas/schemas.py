"""
app/schemas/repair.py & auth.py
────────────────────────────────
Pydantic v2 schemas used for request validation and response serialization.
Kept separate from ORM models to maintain a clean API contract.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# ── Auth ──────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: UUID
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Repair Query ──────────────────────────────────────────────────────────────

class RepairQueryResponse(BaseModel):
    """Returned by POST /repair/query"""
    session_id: UUID
    message_id: UUID
    answer: str
    retrieved_guides: list[GuideChunkOut]
    model_used: str
    image_url: str | None = None


class GuideChunkOut(BaseModel):
    id: UUID
    title: str
    device_type: str
    manufacturer: str | None
    model: str | None
    chunk_text: str
    similarity_score: float
    source_url: str | None = None

    model_config = {"from_attributes": True}


# ── Session / History ─────────────────────────────────────────────────────────

class SessionOut(BaseModel):
    id: UUID
    title: str | None
    device_type: str | None
    manufacturer: str | None
    model: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: UUID
    role: str
    message: str
    image_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionDetailOut(SessionOut):
    messages: list[MessageOut]


# ── Guide Ingestion (admin / background job) ──────────────────────────────────

class IngestGuideRequest(BaseModel):
    title: str
    device_type: str
    manufacturer: str | None = None
    model: str | None = None
    source_url: str | None = None
    # Full document text — will be chunked server-side
    full_text: str = Field(min_length=50)
