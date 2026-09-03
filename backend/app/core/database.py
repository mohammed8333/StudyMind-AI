import logging
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings

logger = logging.getLogger(__name__)

Base = declarative_base()

# Determine database URL: Try PostgreSQL or fallback to SQLite
db_url = settings.DATABASE_URL
is_sqlite = "sqlite" in db_url.lower()

engine = create_async_engine(
    db_url,
    echo=False,
    future=True,
    # SQLite specific connection args if needed
    connect_args={"check_same_thread": False} if is_sqlite else {}
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
            await conn.run_sync(Base.metadata.create_all)
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
                connect_args={"check_same_thread": False}
            )
            AsyncSessionLocal = async_sessionmaker(
                bind=engine,
                class_=AsyncSession,
                expire_on_commit=False,
                autocommit=False,
                autoflush=False
            )
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
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
