import asyncio
import os
import socket
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine
from alembic import context
from dotenv import load_dotenv

load_dotenv()

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from app.db.session import Base
target_metadata = Base.metadata


# ── IPv4 Patch ────────────────────────────────────────────────────────────────
# asyncpg calls socket.getaddrinfo() which returns IPv6 first on Windows.
# We monkey-patch it to filter results to AF_INET (IPv4) only.

_original_getaddrinfo = socket.getaddrinfo

def _ipv4_only_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    results = _original_getaddrinfo(host, port, family, type, proto, flags)
    # Filter to IPv4 only; fall back to all results if nothing returned
    ipv4_results = [r for r in results if r[0] == socket.AF_INET]
    return ipv4_results if ipv4_results else results

socket.getaddrinfo = _ipv4_only_getaddrinfo
# ─────────────────────────────────────────────────────────────────────────────


def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,         # detect column type changes
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL not found in environment!")

    # Alembic needs a sync-compatible URL for some internal checks,
    # but we drive it with an async engine.
    # Ensure the scheme is postgresql+asyncpg://
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)

    connectable = create_async_engine(
        db_url,
        poolclass=pool.NullPool,
        # Tells asyncpg not to use the cached DNS result across retries
        connect_args={"server_settings": {"application_name": "alembic"}},
    )

    async def run_async_migrations():
        async with connectable.connect() as connection:
            await connection.run_sync(do_run_migrations)
        await connectable.dispose()

    asyncio.run(run_async_migrations())


def run_migrations_offline() -> None:
    url = os.getenv("DATABASE_URL")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()