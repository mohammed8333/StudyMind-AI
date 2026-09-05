import logging
from typing import AsyncGenerator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings

logger = logging.getLogger(__name__)

Base = declarative_base()

# Determine database URL: Try PostgreSQL or fallback to SQLite
db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+asyncpg://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

is_sqlite = "sqlite" in db_url.lower()

engine = create_async_engine(
    db_url,
    echo=False,
    future=True,
    # SQLite specific connection args with 30s timeout
    connect_args={"check_same_thread": False, "timeout": 30.0} if is_sqlite else {}
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

async def init_db():
    """Initialize database tables and pgvector extension if postgres."""
    global engine, AsyncSessionLocal, is_sqlite
    import app.models  # Ensure all model tables are registered in Base.metadata
    try:
        async with engine.begin() as conn:
            if not is_sqlite:
                try:
                    # Attempt to enable pgvector extension
                    await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
                except Exception as ext_err:
                    logger.warning(f"pgvector extension check failed (might already exist or not supported): {ext_err}")
            else:
                try:
                    await conn.execute(text("PRAGMA journal_mode=WAL;"))
                    await conn.execute(text("PRAGMA busy_timeout=30000;"))
                except Exception:
                    pass
            await conn.run_sync(Base.metadata.create_all)
            for col_stmt in [
                "ALTER TABLE documents ADD COLUMN file_type VARCHAR(50) DEFAULT 'pdf';",
                "ALTER TABLE document_chunks ADD COLUMN source_type VARCHAR(50) DEFAULT 'pdf';",
                "ALTER TABLE documents ADD COLUMN progress_percentage INTEGER DEFAULT 0;",
                "ALTER TABLE documents ADD COLUMN progress_stage VARCHAR(100) DEFAULT 'في قائمة الانتظار';",
                "ALTER TABLE documents ADD COLUMN retry_count INTEGER DEFAULT 0;"
            ]:
                try:
                    await conn.execute(text(col_stmt))
                except Exception:
                    pass
            logger.info("Database initialized successfully.")
    except Exception as e:
        if settings.USE_SQLITE_FALLBACK and not is_sqlite:
            logger.warning(f"PostgreSQL connection failed ({e}). Switching to SQLite fallback...")
            is_sqlite = True
            fallback_url = settings.SQLITE_FALLBACK_URL
            engine = create_async_engine(
                fallback_url,
                echo=False,
                future=True,
                connect_args={"check_same_thread": False, "timeout": 30.0}
            )
            AsyncSessionLocal = async_sessionmaker(
                bind=engine,
                class_=AsyncSession,
                expire_on_commit=False,
                autocommit=False,
                autoflush=False
            )
            async with engine.begin() as conn:
                try:
                    await conn.execute(text("PRAGMA journal_mode=WAL;"))
                    await conn.execute(text("PRAGMA busy_timeout=30000;"))
                except Exception:
                    pass
                await conn.run_sync(Base.metadata.create_all)
                for col_stmt in [
                    "ALTER TABLE documents ADD COLUMN file_type VARCHAR(50) DEFAULT 'pdf';",
                    "ALTER TABLE document_chunks ADD COLUMN source_type VARCHAR(50) DEFAULT 'pdf';",
                    "ALTER TABLE documents ADD COLUMN progress_percentage INTEGER DEFAULT 0;",
                    "ALTER TABLE documents ADD COLUMN progress_stage VARCHAR(100) DEFAULT 'في قائمة الانتظار';",
                    "ALTER TABLE documents ADD COLUMN retry_count INTEGER DEFAULT 0;"
                ]:
                    try:
                        await conn.execute(text(col_stmt))
                    except Exception:
                        pass
            logger.info("SQLite fallback database initialized successfully.")
        else:
            raise e

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for providing database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
