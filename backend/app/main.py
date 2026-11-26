import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .db import SessionLocal, migrate
from . import models  # noqa: F401  (register tables)
from .routes import router
import threading
from .kyc import purge_expired, warmup
from .auth import ensure_employee

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("startup")


@asynccontextmanager
async def lifespan(app: FastAPI):
    migrate()
    with SessionLocal() as db:
        ensure_employee(db)
        purge_expired(db)  # retention: remove documents older than UPLOAD_RETENTION_DAYS
    threading.Thread(target=warmup, daemon=True).start()  # load OCR in the background
    if not settings.employee_email or not settings.employee_password:
        log.warning("EMPLOYEE_EMAIL / EMPLOYEE_PASSWORD not set in .env: employee login is disabled")
    yield


app = FastAPI(title="Airtel Vyapaar Connect prototype API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(router)


@app.get("/health")
def health():
    from . import ai
    return {"ok": True, "llm_configured": ai.llm_enabled(), "llm_last_error": ai.last_llm_error,
            "employee_login_configured": bool(settings.employee_email and settings.employee_password)}
