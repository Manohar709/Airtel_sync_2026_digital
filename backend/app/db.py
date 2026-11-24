from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Idempotent schema upgrades for databases created by the first version (no Alembic).
PG_UPGRADES = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(8)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP",
    "ALTER TABLE applications ALTER COLUMN user_id DROP NOT NULL",
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS guest_id VARCHAR(40)",
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS language VARCHAR(8) DEFAULT 'en'",
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS help_name VARCHAR(120)",
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS help_phone VARCHAR(20)",
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS help_status VARCHAR(20)",
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS help_at TIMESTAMP",
    "CREATE INDEX IF NOT EXISTS ix_applications_guest_id ON applications (guest_id)",
]


def migrate():
    Base.metadata.create_all(engine)
    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            for stmt in PG_UPGRADES:
                conn.execute(text(stmt))
