from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import os

# Use environment variable or default to local Postgres
# Default credentials: user=postgres, password=postgres, db=ai4school
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:postgres@localhost/ai4school"
)

if "dpg-" in SQLALCHEMY_DATABASE_URL and "sslmode=" not in SQLALCHEMY_DATABASE_URL:
    delimiter = "&" if "?" in SQLALCHEMY_DATABASE_URL else "?"
    SQLALCHEMY_DATABASE_URL = f"{SQLALCHEMY_DATABASE_URL}{delimiter}sslmode=require"

# SQLite needs specific connect_args to allow multiple threads, Postgres does not
connect_args = {"check_same_thread": False} if "sqlite" in SQLALCHEMY_DATABASE_URL else {}

engine_kwargs = {
    "connect_args": connect_args,
}
if "sqlite" not in SQLALCHEMY_DATABASE_URL:
    # Keep pooled connections healthy after idle periods on hosted Postgres.
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_recycle": 300,
    })

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
