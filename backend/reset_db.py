import sys
import os
import asyncio
import shutil
from pathlib import Path

# Add backend directory to sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.database import Base, init_db
import app.models  # Register all models


async def reset_sqlite_file(db_path: Path):
    """Recreate SQLite database with clean empty tables."""
    if db_path.exists():
        try:
            db_path.unlink()
            print(f"[OK] Deleted database file: {db_path}")
        except Exception as e:
            print(f"[WARN] Could not delete {db_path}: {e}")
    
    # Also check for WAL / SHM files
    for ext in ["-wal", "-shm"]:
        extra_file = Path(str(db_path) + ext)
        if extra_file.exists():
            try:
                extra_file.unlink()
            except Exception:
                pass


def clean_upload_folder(folder_path: Path):
    """Remove all uploaded files while preserving directory."""
    if folder_path.exists():
        count = 0
        for item in folder_path.iterdir():
            if item.is_file() and item.name != ".gitkeep":
                try:
                    item.unlink()
                    count += 1
                except Exception as e:
                    print(f"[WARN] Could not delete {item}: {e}")
            elif item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
                count += 1
        print(f"[OK] Cleaned {count} items from {folder_path}")
    else:
        folder_path.mkdir(parents=True, exist_ok=True)
        print(f"[OK] Created empty directory {folder_path}")


async def reset_postgres_db(db_url: str):
    """Reset PostgreSQL database by dropping and recreating public schema."""
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+asyncpg://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    print(f"Connecting to remote database...")
    engine = create_async_engine(db_url, isolation_level="AUTOCOMMIT")
    async with engine.connect() as conn:
        print("Dropping public schema...")
        await conn.execute(text("DROP SCHEMA public CASCADE;"))
        print("Re-creating public schema...")
        await conn.execute(text("CREATE SCHEMA public;"))
        print("Enabling vector extension if supported...")
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        except Exception as e:
            print(f"Notice: vector extension: {e}")
    await engine.dispose()
    print("[OK] Remote PostgreSQL database completely wiped and reset.")


async def main():
    target_url = sys.argv[1] if len(sys.argv) > 1 else None

    if target_url and ("postgres" in target_url):
        print("=== Resetting Remote PostgreSQL Database ===")
        await reset_postgres_db(target_url)
        return

    print("=== Resetting Local Databases and Uploads ===")
    
    # 1. Reset SQLite databases
    db_paths = [
        Path("D:/proj/studymind.db"),
        Path("D:/proj/backend/studymind.db"),
        BASE_DIR / "studymind.db",
        BASE_DIR.parent / "studymind.db"
    ]
    seen = set()
    for p in db_paths:
        resolved = p.resolve()
        if resolved not in seen:
            seen.add(resolved)
            await reset_sqlite_file(resolved)

    # 2. Re-initialize clean empty tables
    print("Re-initializing fresh empty tables...")
    await init_db()
    print("[OK] All tables re-created fresh and empty.")

    # 3. Clean all upload folders
    upload_folders = [
        Path("D:/proj/uploads"),
        Path("D:/proj/backend/uploads"),
        BASE_DIR / "uploads",
        BASE_DIR.parent / "uploads"
    ]
    seen_uploads = set()
    for uf in upload_folders:
        resolved_uf = uf.resolve()
        if resolved_uf not in seen_uploads:
            seen_uploads.add(resolved_uf)
            clean_upload_folder(resolved_uf)

    print("=== All local data successfully reset to zero! ===")


if __name__ == "__main__":
    asyncio.run(main())
