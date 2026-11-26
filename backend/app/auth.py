"""Authentication: JWT for customers and the single employee, signed guest tokens for visitors."""
import secrets
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from .models import User

bearer = HTTPBearer(auto_error=False)
DEMO_EMAILS = {"customer@demo.in", "customer2@demo.in", "employee@demo.in"}


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    exp = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({"sub": str(user.id), "role": user.role, "exp": exp}, settings.jwt_secret, algorithm="HS256")


def create_guest_token() -> tuple[str, str]:
    gid = secrets.token_hex(16)
    exp = datetime.utcnow() + timedelta(days=settings.guest_token_days)
    return gid, jwt.encode({"guest": gid, "exp": exp}, settings.jwt_secret, algorithm="HS256")


def guest_id_from(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"]).get("guest")
    except jwt.PyJWTError:
        return None


def _user_from(cred, db) -> User | None:
    if not cred:
        return None
    try:
        data = jwt.decode(cred.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired session")
    user = db.get(User, int(data.get("sub", 0)))
    if not user:
        raise HTTPException(401, "Unknown user")
    return user


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    user = _user_from(cred, db)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user


def customer_only(user: User = Depends(current_user)) -> User:
    if user.role != "customer":
        raise HTTPException(403, "Customer access only")
    return user


def employee_only(user: User = Depends(current_user)) -> User:
    if user.role != "employee" or user.email != settings.employee_email.strip().lower():
        raise HTTPException(403, "Employee access only")
    return user


@dataclass
class Actor:
    user: User | None
    guest_id: str | None


def actor(cred: HTTPAuthorizationCredentials | None = Depends(bearer),
          x_guest_token: str | None = Header(default=None), db: Session = Depends(get_db)) -> Actor:
    """A signed-in customer, or a guest identified by a server-signed guest token."""
    user = _user_from(cred, db)
    if user:
        if user.role != "customer":
            raise HTTPException(403, "Customer access only")
        return Actor(user, None)
    gid = guest_id_from(x_guest_token)
    if not gid:
        raise HTTPException(401, "Start a session first")
    return Actor(None, gid)


# Simple in-memory rate limiter (prototype): N calls per hour per key.
_hits: dict[str, list[float]] = defaultdict(list)


def rate_limit(key: str, limit: int | None = None):
    limit = limit or settings.rate_limit_per_hour
    now = time.time()
    hits = [t for t in _hits[key] if now - t < 3600]
    if len(hits) >= limit:
        raise HTTPException(429, "Too many requests. Please try again later.")
    hits.append(now)
    _hits[key] = hits


def client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def ensure_employee(db: Session):
    """Create/refresh the single employee account from .env and remove the old demo accounts."""
    from .models import Application, Document, ApplicationEvent
    email = settings.employee_email.strip().lower()
    for u in db.query(User).filter(User.email.in_(DEMO_EMAILS - {email})).all():
        for a in db.query(Application).filter(Application.user_id == u.id).all():
            db.query(Document).filter(Document.application_id == a.id).delete()
            db.query(ApplicationEvent).filter(ApplicationEvent.application_id == a.id).delete()
            db.delete(a)
        db.delete(u)
    if email and settings.employee_password:
        u = db.query(User).filter(User.email == email).first()
        if not u:
            db.add(User(email=email, name=settings.employee_name, role="employee",
                        password_hash=hash_password(settings.employee_password)))
        else:
            if u.role != "employee" or not verify_password(settings.employee_password, u.password_hash):
                u.role, u.password_hash = "employee", hash_password(settings.employee_password)
            u.name = settings.employee_name  # display name follows .env
    db.commit()
