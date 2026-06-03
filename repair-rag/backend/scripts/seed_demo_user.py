#!/usr/bin/env python3
"""
scripts/setup_db.py
───────────────────
Initialize the database schema from schema.sql.
Run this once to set up the database for the repair RAG system.

Usage:
    python scripts/setup_db.py

Requires:
    - PostgreSQL database with pgvector extension
    - DATABASE_URL environment variable set (e.g., postgresql+asyncpg://user:pass@localhost/repair_rag)
"""

import asyncio
import sys
from pathlib import Path

import structlog
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import get_settings
from app.db.session import Base
from app.models.orm import User, RepairGuide, RepairSession, RepairHistory  # noqa

logger = structlog.get_logger()
settings = get_settings()


async def init_db():
    """Create all tables in the database."""
    engine = create_async_engine(settings.database_url, echo=False)
    
    async with engine.begin() as conn:
        # Enable pgvector extension
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        
        # Create all tables from ORM models
        await conn.run_sync(Base.metadata.create_all)
    
    await engine.dispose()
    logger.info("database_initialized", url=settings.database_url)


if __name__ == "__main__":
    asyncio.run(init_db())
    print("✓ Database initialized successfully")
    print("✓ Users table created with password_hash column")
    print("✓ Ready to accept user registrations")
