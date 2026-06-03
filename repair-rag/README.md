# Electronic Repair RAG System

AI-powered repair assistant using **Groq** (Llama 3 / Llama 4 Vision) + **PostgreSQL/pgvector** + **Next.js 15**.

## Quick Start

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in your keys
psql $DATABASE_URL < schema.sql
uvicorn app.main:app --reload
```

### Ingest a repair guide
```bash
python scripts/ingest_guides.py \
  --file my_guide.txt \
  --title "iPhone 14 Screen Replacement" \
  --device smartphone \
  --manufacturer Apple \
  --model "iPhone 14"
```

### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local   # fill in your keys
npm run dev
```

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | No | Create account |
| POST | `/api/v1/auth/login` | No | Get JWT |
| GET | `/api/v1/auth/me` | Bearer | Current user |
| POST | `/api/v1/repair/query` | Bearer | **Main RAG endpoint** |
| GET | `/api/v1/repair/sessions` | Bearer | List sessions |
| GET | `/api/v1/repair/sessions/{id}` | Bearer | Session + messages |

### POST /repair/query — multipart/form-data

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text_query` | string | Yes | User's repair question |
| `image` | file | No | Repair photo (JPEG/PNG/WebP, max 10MB) |
| `session_id` | string | No | Continue existing session |
| `device_type` | string | No | Pre-filter vector search |

## Key Design Decisions

- **HNSW index** over IVFFlat for lower latency at moderate scale
- **Similarity threshold 0.3** in vector search — tune for your data
- **Chunk size 400 words with 80-word overlap** balances context and precision  
- **Vision model** (`llama-4-scout`) used only when image is present — saves tokens
- **Optimistic UI** in React — messages appear instantly before API responds
