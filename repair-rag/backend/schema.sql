-- ============================================================
-- Electronic Repair RAG System — PostgreSQL + pgvector Schema
-- Run this once against your Supabase / managed Postgres DB
-- ============================================================

-- 1. Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS  (self-hosted auth with bcrypt password hashing)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,  -- bcrypt hash from passlib
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- REPAIR GUIDES  (chunked manual pages stored as embeddings)
-- ============================================================
CREATE TABLE IF NOT EXISTS repair_guides (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Human-readable metadata
    title           TEXT NOT NULL,                -- e.g. "iPhone 14 Screen Replacement"
    device_type     TEXT NOT NULL,                -- e.g. "smartphone", "laptop", "console"
    manufacturer    TEXT,                         -- e.g. "Apple", "Samsung"
    model           TEXT,                         -- e.g. "iPhone 14 Pro"
    -- The text chunk that was embedded
    chunk_text      TEXT NOT NULL,
    chunk_index     INT  NOT NULL DEFAULT 0,      -- position within original document
    source_url      TEXT,                         -- link to original manual / iFixit page
    -- pgvector column — 1536 dims for text-embedding-3-small / ada-002
    -- adjust to 768 for sentence-transformers/all-MiniLM-L6-v2 etc.
    embedding       VECTOR(1536) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for fast approximate nearest-neighbour search
-- (alternative: IVFFlat — better for very large datasets)
CREATE INDEX IF NOT EXISTS idx_repair_guides_embedding
    ON repair_guides
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Handy composite index for metadata filtering before vector search
CREATE INDEX IF NOT EXISTS idx_repair_guides_device
    ON repair_guides (device_type, manufacturer, model);

-- ============================================================
-- REPAIR SESSIONS  (one session = one conversation thread)
-- ============================================================
CREATE TABLE IF NOT EXISTS repair_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT,                          -- auto-generated summary title
    device_type     TEXT,
    manufacturer    TEXT,
    model           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_sessions_updated_at
    BEFORE UPDATE ON repair_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_repair_sessions_user
    ON repair_sessions (user_id, created_at DESC);

-- ============================================================
-- REPAIR HISTORY  (individual messages / turns in a session)
-- ============================================================
CREATE TABLE IF NOT EXISTS repair_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES repair_sessions(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- "user" | "assistant"
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    message         TEXT NOT NULL,
    -- Path/URL to the uploaded image (stored in Supabase Storage / S3)
    image_url       TEXT,
    -- Which guide chunks were used to answer (FK array for audit trail)
    retrieved_guide_ids  UUID[],
    -- Raw Groq model response metadata (token counts, latency, etc.)
    model_metadata  JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repair_history_session
    ON repair_history (session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_repair_history_user
    ON repair_history (user_id, created_at DESC);

-- ============================================================
-- HELPER VIEW  (full session transcript with user email)
-- ============================================================
CREATE OR REPLACE VIEW session_transcripts AS
SELECT
    rh.id           AS message_id,
    rs.id           AS session_id,
    u.email         AS user_email,
    rs.title        AS session_title,
    rs.device_type,
    rs.manufacturer,
    rs.model,
    rh.role,
    rh.message,
    rh.image_url,
    rh.retrieved_guide_ids,
    rh.created_at   AS message_time
FROM repair_history rh
JOIN repair_sessions rs ON rs.id = rh.session_id
JOIN users           u  ON u.id  = rh.user_id
ORDER BY rh.created_at;
