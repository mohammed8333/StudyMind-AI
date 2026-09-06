import logging
from typing import AsyncGenerator
from sqlalchemy import text, event
from sqlalchemy.engine import Engine
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
    pool_pre_ping=True,
    # SQLite specific connection args with 30s timeout
    connect_args={"check_same_thread": False, "timeout": 30.0} if is_sqlite else {}
)

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enforces foreign key constraint checks strictly on SQLite connections."""
    conn_type = f"{type(dbapi_connection).__module__}.{type(dbapi_connection).__name__}".lower()
    if "sqlite" not in conn_type:
        return
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()
    except Exception:
        pass

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

async def init_db():
    """Initialize database tables and pgvector extension if postgres."""
    global engine, is_sqlite
    import app.models  # Ensure all model tables are registered in Base.metadata
    try:
        if not is_sqlite:
            # 1. Safely check / enable pgvector in an isolated autocommit connection
            try:
                async with engine.connect() as ext_conn:
                    await ext_conn.execution_options(isolation_level="AUTOCOMMIT").execute(
                        text("CREATE EXTENSION IF NOT EXISTS vector;")
                    )
                    logger.info("pgvector extension enabled or already present.")
            except Exception as ext_err:
                logger.warning(f"pgvector extension check skipped/not supported: {ext_err}")

        # 2. Initialize tables in a clean transaction
        async with engine.begin() as conn:
            if is_sqlite:
                try:
                    await conn.execute(text("PRAGMA journal_mode=WAL;"))
                    await conn.execute(text("PRAGMA busy_timeout=30000;"))
                    await conn.execute(text("PRAGMA foreign_keys=ON;"))
                except Exception:
                    pass

            await conn.run_sync(Base.metadata.create_all)

            # 3. Idempotent column migrations using nested transactions (SAVEPOINT)
            col_stmts = [
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_type VARCHAR(50) DEFAULT 'pdf';",
                "ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'pdf';",
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0;",
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS progress_stage VARCHAR(100) DEFAULT 'في قائمة الانتظار';",
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;",
                "ALTER TABLE student_mastery ADD COLUMN IF NOT EXISTS primary_error_type VARCHAR(50);",
                "ALTER TABLE student_mastery ADD COLUMN IF NOT EXISTS error_summary TEXT;",
                "ALTER TABLE student_mastery ADD COLUMN IF NOT EXISTS is_proficient BOOLEAN DEFAULT FALSE;",
                "ALTER TABLE student_mastery ADD COLUMN IF NOT EXISTS last_remediated_at TIMESTAMP;",
                "ALTER TABLE question_responses ADD COLUMN IF NOT EXISTS error_type VARCHAR(50);",
                "ALTER TABLE question_responses ADD COLUMN IF NOT EXISTS error_reason TEXT;",
                "ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS progress_percentage FLOAT DEFAULT 0.0;",
                "ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'weak_points_first';",
                "ALTER TABLE study_plan_tasks ADD COLUMN IF NOT EXISTS recommended_questions_count INTEGER DEFAULT 5;",
                "ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;",
                "ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;"
            ] if not is_sqlite else [
                "ALTER TABLE documents ADD COLUMN file_type VARCHAR(50) DEFAULT 'pdf';",
                "ALTER TABLE document_chunks ADD COLUMN source_type VARCHAR(50) DEFAULT 'pdf';",
                "ALTER TABLE documents ADD COLUMN progress_percentage INTEGER DEFAULT 0;",
                "ALTER TABLE documents ADD COLUMN progress_stage VARCHAR(100) DEFAULT 'في قائمة الانتظار';",
                "ALTER TABLE documents ADD COLUMN retry_count INTEGER DEFAULT 0;",
                "ALTER TABLE student_mastery ADD COLUMN primary_error_type VARCHAR(50);",
                "ALTER TABLE student_mastery ADD COLUMN error_summary TEXT;",
                "ALTER TABLE student_mastery ADD COLUMN is_proficient BOOLEAN DEFAULT 0;",
                "ALTER TABLE student_mastery ADD COLUMN last_remediated_at DATETIME;",
                "ALTER TABLE question_responses ADD COLUMN error_type VARCHAR(50);",
                "ALTER TABLE question_responses ADD COLUMN error_reason TEXT;",
                "ALTER TABLE study_plans ADD COLUMN progress_percentage FLOAT DEFAULT 0.0;",
                "ALTER TABLE study_plans ADD COLUMN priority VARCHAR(50) DEFAULT 'weak_points_first';",
                "ALTER TABLE study_plan_tasks ADD COLUMN recommended_questions_count INTEGER DEFAULT 5;",
                "ALTER TABLE flashcards ADD COLUMN is_suspended BOOLEAN DEFAULT 0;",
                "ALTER TABLE flashcards ADD COLUMN is_favorite BOOLEAN DEFAULT 0;"
            ]

            for col_stmt in col_stmts:
                try:
                    async with conn.begin_nested():
                        await conn.execute(text(col_stmt))
                except Exception:
                    pass

        logger.info(f"{'PostgreSQL' if not is_sqlite else 'SQLite'} database initialized successfully.")
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
            AsyncSessionLocal.configure(bind=engine)
            async with engine.begin() as conn:
                try:
                    await conn.execute(text("PRAGMA journal_mode=WAL;"))
                    await conn.execute(text("PRAGMA busy_timeout=30000;"))
                    await conn.execute(text("PRAGMA foreign_keys=ON;"))
                except Exception:
                    pass
                await conn.run_sync(Base.metadata.create_all)
                for col_stmt in [
                    "ALTER TABLE documents ADD COLUMN file_type VARCHAR(50) DEFAULT 'pdf';",
                    "ALTER TABLE document_chunks ADD COLUMN source_type VARCHAR(50) DEFAULT 'pdf';",
                    "ALTER TABLE documents ADD COLUMN progress_percentage INTEGER DEFAULT 0;",
                    "ALTER TABLE documents ADD COLUMN progress_stage VARCHAR(100) DEFAULT 'في قائمة الانتظار';",
                    "ALTER TABLE documents ADD COLUMN retry_count INTEGER DEFAULT 0;",
                    "ALTER TABLE student_mastery ADD COLUMN primary_error_type VARCHAR(50);",
                    "ALTER TABLE student_mastery ADD COLUMN error_summary TEXT;",
                    "ALTER TABLE student_mastery ADD COLUMN is_proficient BOOLEAN DEFAULT 0;",
                    "ALTER TABLE student_mastery ADD COLUMN last_remediated_at DATETIME;",
                    "ALTER TABLE question_responses ADD COLUMN error_type VARCHAR(50);",
                    "ALTER TABLE question_responses ADD COLUMN error_reason TEXT;",
                    "ALTER TABLE study_plans ADD COLUMN progress_percentage FLOAT DEFAULT 0.0;",
                    "ALTER TABLE study_plans ADD COLUMN priority VARCHAR(50) DEFAULT 'weak_points_first';",
                    "ALTER TABLE study_plan_tasks ADD COLUMN recommended_questions_count INTEGER DEFAULT 5;",
                    "ALTER TABLE flashcards ADD COLUMN is_suspended BOOLEAN DEFAULT 0;",
                    "ALTER TABLE flashcards ADD COLUMN is_favorite BOOLEAN DEFAULT 0;"
                ]:
                    try:
                        async with conn.begin_nested():
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
