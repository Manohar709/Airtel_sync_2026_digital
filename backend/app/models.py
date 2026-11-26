from datetime import datetime
from sqlalchemy import String, Integer, Float, Text, DateTime, JSON, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


def now():
    return datetime.utcnow()


# ---- Reference tables (loaded from the supplied CSVs, read-only) ----
class RefProduct(Base):
    __tablename__ = "ref_products"
    product_id: Mapped[str] = mapped_column(String(10), primary_key=True)
    category: Mapped[str] = mapped_column(String(60))
    product_name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    unit: Mapped[str] = mapped_column(String(40))
    price_min_inr_per_month: Mapped[float] = mapped_column(Float)
    price_max_inr_per_month: Mapped[float] = mapped_column(Float)
    one_time_setup_inr: Mapped[float] = mapped_column(Float)
    min_contract_months: Mapped[int] = mapped_column(Integer)
    available_city_tiers: Mapped[str] = mapped_column(String(20))
    min_employees: Mapped[int] = mapped_column(Integer)
    min_sites: Mapped[int] = mapped_column(Integer)
    requires_gstin: Mapped[str] = mapped_column(String(1))
    requires_one_of: Mapped[str | None] = mapped_column(String(60), nullable=True)
    typical_install_days: Mapped[int] = mapped_column(Integer)
    target_segments: Mapped[str] = mapped_column(String(60))


class RefGstin(Base):
    __tablename__ = "ref_gstin"
    gstin: Mapped[str] = mapped_column(String(15), primary_key=True)
    legal_name: Mapped[str] = mapped_column(String(200))
    trade_name: Mapped[str] = mapped_column(String(200))
    constitution: Mapped[str] = mapped_column(String(80))
    principal_place_of_business: Mapped[str] = mapped_column(String(300))
    state: Mapped[str] = mapped_column(String(60))
    registration_date: Mapped[str] = mapped_column(String(12))
    status: Mapped[str] = mapped_column(String(20))


class RefUdyam(Base):
    __tablename__ = "ref_udyam"
    udyam_number: Mapped[str] = mapped_column(String(25), primary_key=True)
    enterprise_name: Mapped[str] = mapped_column(String(200))
    enterprise_type: Mapped[str] = mapped_column(String(30))
    major_activity: Mapped[str] = mapped_column(String(40))
    nic_description: Mapped[str] = mapped_column(String(120))
    state: Mapped[str] = mapped_column(String(60))
    city: Mapped[str] = mapped_column(String(60))
    date_of_registration: Mapped[str] = mapped_column(String(12))


class RefHistoricalLead(Base):
    """Historical Apr-Jun 2026 leads. Kept separate from portal applications."""
    __tablename__ = "ref_historical_leads"
    lead_id: Mapped[str] = mapped_column(String(10), primary_key=True)
    business_type: Mapped[str] = mapped_column(String(80))
    segment: Mapped[str] = mapped_column(String(60))
    city: Mapped[str] = mapped_column(String(60))
    city_tier: Mapped[int] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(60))
    raw: Mapped[dict] = mapped_column(JSON)  # full original row


# ---- Application tables ----
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(120), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20))  # customer | employee
    password_hash: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    language: Mapped[str | None] = mapped_column(String(8), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=now, nullable=True)


class Application(Base):
    """Central record: conversation, requirements, cart, quote, KYC and handoff.

    Owned by a guest (guest_id, user_id NULL) until the visitor signs in, then by the user."""
    __tablename__ = "applications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    guest_id: Mapped[str | None] = mapped_column(String(40), index=True, nullable=True)
    language: Mapped[str] = mapped_column(String(8), default="en")
    help_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    help_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    help_status: Mapped[str | None] = mapped_column(String(20), nullable=True)  # open | in_progress | resolved
    help_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="draft", index=True)
    messages: Mapped[list] = mapped_column(JSON, default=list)
    requirements: Mapped[dict] = mapped_column(JSON, default=dict)
    cart: Mapped[list] = mapped_column(JSON, default=list)  # [{product_id, quantity}]
    quote: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # snapshot at submit
    kyc: Mapped[dict] = mapped_column(JSON, default=dict)
    help_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    help_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    employee_notes: Mapped[list] = mapped_column(JSON, default=list)
    # fulfilment after submit: stage times, e-sign, AutoPay, technician slot, message to customer
    order: Mapped[dict | None] = mapped_column("fulfilment", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ApplicationEvent(Base):
    """Status timeline shown to the customer (My orders) and the employee."""
    __tablename__ = "application_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=now)
    kind: Mapped[str] = mapped_column(String(30))  # created | submitted | status | help | help_status
    status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    by: Mapped[str | None] = mapped_column(String(20), nullable=True)  # customer | employee | system


class TranslationCache(Base):
    __tablename__ = "translation_cache"
    id: Mapped[int] = mapped_column(primary_key=True)
    lang: Mapped[str] = mapped_column(String(8), index=True)
    key: Mapped[str] = mapped_column(String(64), index=True)  # sha1 of source text
    text: Mapped[str] = mapped_column(Text)


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"), index=True)
    doc_type: Mapped[str] = mapped_column(String(30))
    filename: Mapped[str] = mapped_column(String(200))
    path: Mapped[str] = mapped_column(String(400))
    extracted: Mapped[dict] = mapped_column(JSON, default=dict)
    quality: Mapped[dict] = mapped_column(JSON, default=dict)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=now)
