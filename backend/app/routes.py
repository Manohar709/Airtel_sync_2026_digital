"""API routes: auth, guest + customer journey, orders, help, voice, i18n and the employee portal.

Thin layer over the engine modules. Guests (signed guest token) can browse, chat, build a quote and ask for help;
KYC, submission and order tracking need a signed-in customer account.
"""
import re
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from . import ai, kyc
from .auth import (Actor, actor, client_key, create_guest_token, create_token, current_user, customer_only,
                   employee_only, guest_id_from, hash_password, rate_limit, verify_password)
from .catalogue import (Requirements, evaluate, infer_segment, SEGMENT_CODE, load_products, lookup_city_tier,
                        product_details, default_quantity, NEED_LABELS)
from .config import settings
from .db import get_db
from .models import Application, ApplicationEvent, Document, RefHistoricalLead, User
from .quote import build_quote
from .recommend import recommend

router = APIRouter(prefix="/api")

# Application status state machine (backend-controlled).
TRANSITIONS = {
    "draft": {"submitted"},
    "submitted": {"in_review", "awaiting_customer", "closed"},
    "in_review": {"awaiting_customer", "ready_for_activation", "closed"},
    "awaiting_customer": {"in_review", "closed"},
    "ready_for_activation": {"closed", "in_review"},
    "closed": set(),
}
STATUS_LABELS = {"draft": "Draft", "submitted": "Submitted", "in_review": "In review",
                 "awaiting_customer": "Awaiting customer", "ready_for_activation": "Ready for activation", "closed": "Closed"}
EDITABLE = ("draft", "awaiting_customer")
LANG_CODES = set(ai.LANGS)
PHONE_RE = re.compile(r"^(\+?91[\s-]?)?[6-9]\d{9}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------- helpers ----------
def lang_of(v: str | None) -> str:
    return v if v in LANG_CODES else "en"


def add_event(db: Session, app: Application, kind: str, status: str | None = None, by: str = "system"):
    db.add(ApplicationEvent(application_id=app.id, kind=kind, status=status, by=by))


def current_app(db: Session, act: Actor) -> Application:
    """The visitor's working application: latest editable one for a customer, the guest's own for a guest."""
    q = db.query(Application)
    if act.user:
        app = (q.filter(Application.user_id == act.user.id, Application.status.in_(EDITABLE))
               .order_by(Application.updated_at.desc(), Application.id.desc()).first())
    else:
        app = (q.filter(Application.guest_id == act.guest_id, Application.user_id.is_(None))
               .order_by(Application.id.desc()).first())
    if not app:
        app = Application(user_id=act.user.id if act.user else None, guest_id=None if act.user else act.guest_id,
                          messages=[], requirements={}, cart=[], kyc={},
                          language=lang_of(act.user.language if act.user else None))
        db.add(app)
        db.commit()
        db.refresh(app)
        add_event(db, app, "created", "draft")
        db.commit()
    return app


def require_editable(app: Application):
    if app.status not in EDITABLE:
        raise HTTPException(409, "This application is already submitted")


def req_of(app: Application) -> Requirements:
    return Requirements(**(app.requirements or {}))


def segment(db, req: Requirements):
    return SEGMENT_CODE.get(infer_segment(db, req.business_type) or "")


def safe_fields(fields: dict) -> dict:
    out = dict(fields or {})
    for k in ("gstin", "udyam", "consumer", "id_no"):
        if out.get(k):
            out[k] = kyc.mask(out[k])
    return out


def doc_view(d: Document) -> dict:
    ex = d.extracted or {}
    return {"id": d.id, "doc_type": d.doc_type, "label": kyc.DOC_LABELS.get(d.doc_type), "filename": d.filename,
            "uploaded_at": d.uploaded_at, "quality": d.quality, "ocr_available": ex.get("available"),
            "ocr_confidence": ex.get("confidence"), "fields": safe_fields(ex.get("fields"))}


def kyc_result(db: Session, app: Application, products=None) -> dict:
    products = products or load_products(db)
    docs = db.query(Document).filter(Document.application_id == app.id).all()
    gp = [products[c["product_id"]].name for c in app.cart
          if c["product_id"] in products and products[c["product_id"]].requires_gstin]
    state = app.kyc or {}
    res = kyc.evaluate_kyc(db, state, docs, gp, req_of(app).business_type)
    res["consent"] = bool(state.get("consent"))
    res["mode"] = state.get("mode")
    res["business_name"] = state.get("business_name")
    res["gstin_masked"], res["udyam_masked"] = kyc.mask(state.get("gstin")), kyc.mask(state.get("udyam"))
    res["documents"] = [doc_view(d) for d in docs]
    res["gstin_products"] = gp
    return res


def events_of(db: Session, app: Application) -> list[dict]:
    return [{"at": e.at, "kind": e.kind, "status": e.status, "by": e.by} for e in
            db.query(ApplicationEvent).filter(ApplicationEvent.application_id == app.id).order_by(ApplicationEvent.id).all()]


def expected_activation(app: Application, quote: dict | None) -> str | None:
    if app.status in ("submitted", "in_review", "ready_for_activation") and app.submitted_at and quote:
        return (app.submitted_at + timedelta(days=quote.get("max_install_days", 0))).date().isoformat()
    return None


def app_view(db: Session, app: Application) -> dict:
    products = load_products(db)
    req = req_of(app)
    quote = build_quote(products, app.cart, req) if app.cart else None
    return {
        "id": app.id, "status": app.status, "language": app.language, "is_guest": app.user_id is None,
        "messages": app.messages, "requirements": req.model_dump(), "missing": ai.missing_fields(req),
        "ready": not ai.missing_fields(req) and bool(req.needs),
        "cart": app.cart, "quote": quote,
        "help": {"requested": app.help_requested, "status": app.help_status, "note": app.help_note, "at": app.help_at},
        "submitted_at": app.submitted_at,
        "kyc_overall": kyc_result(db, app, products)["overall"] if app.kyc else "pending",
        "events": events_of(db, app), "expected_activation": expected_activation(app, app.quote or quote),
    }


def merge_guest(db: Session, user: User, guest_token: str | None):
    """Move the guest's chat, requirements and cart into the account; drop empty guest drafts."""
    gid = guest_id_from(guest_token)
    if not gid:
        return
    for a in db.query(Application).filter(Application.guest_id == gid, Application.user_id.is_(None)).all():
        if a.messages or a.cart or a.help_requested:
            a.user_id, a.guest_id, a.updated_at = user.id, None, datetime.utcnow()
            add_event(db, a, "claimed", a.status, "customer")
        else:
            db.query(ApplicationEvent).filter(ApplicationEvent.application_id == a.id).delete()
            db.delete(a)
    db.commit()


# ---------- auth ----------
def user_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "role": u.role, "email": u.email, "phone": u.phone, "language": u.language}


@router.post("/guest")
def new_guest(request: Request):
    rate_limit("guest:" + client_key(request))
    _, token = create_guest_token()
    return {"guest_token": token}


class Signup(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str
    phone: str
    password: str = Field(min_length=8, max_length=128)
    guest_token: str | None = None
    language: str | None = None


@router.post("/auth/signup")
def signup(body: Signup, request: Request, db: Session = Depends(get_db)):
    rate_limit("signup:" + client_key(request), 30)
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Enter a valid email address")
    if not PHONE_RE.match(body.phone.strip()):
        raise HTTPException(422, "Enter a valid 10-digit Indian mobile number")
    if email == settings.employee_email.strip().lower() or db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "An account with this email already exists. Please sign in.")
    u = User(email=email, name=body.name.strip(), role="customer", phone=body.phone.strip(),
             password_hash=hash_password(body.password), language=lang_of(body.language))
    db.add(u)
    db.commit()
    merge_guest(db, u, body.guest_token)
    return {"token": create_token(u), "user": user_out(u)}


class Login(BaseModel):
    email: str
    password: str
    guest_token: str | None = None


@router.post("/auth/login")
def login(body: Login, request: Request, db: Session = Depends(get_db)):
    rate_limit("login:" + client_key(request), 60)
    u = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if not u or u.role != "customer" or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    merge_guest(db, u, body.guest_token)
    return {"token": create_token(u), "user": user_out(u)}


@router.post("/auth/employee/login")
def employee_login(body: Login, request: Request, db: Session = Depends(get_db)):
    rate_limit("elogin:" + client_key(request), 30)
    email = body.email.strip().lower()
    if not settings.employee_email or email != settings.employee_email.strip().lower():
        raise HTTPException(401, "Incorrect email or password")
    u = db.query(User).filter(User.email == email, User.role == "employee").first()
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    return {"token": create_token(u), "user": user_out(u)}


@router.get("/auth/me")
def me(u: User = Depends(current_user)):
    return user_out(u)


class LangBody(BaseModel):
    language: str


@router.put("/me/language")
def set_language(body: LangBody, u: User = Depends(customer_only), db: Session = Depends(get_db)):
    u.language = lang_of(body.language)
    db.commit()
    return user_out(u)


# ---------- journey (guest or customer) ----------
@router.get("/application")
def get_application(act: Actor = Depends(actor), db: Session = Depends(get_db)):
    return app_view(db, current_app(db, act))


class Msg(BaseModel):
    message: str = ""
    answer: dict | None = None  # quick-reply {field, value}
    lang: str | None = None


@router.post("/advisor/message")
def advisor_message(body: Msg, act: Actor = Depends(actor), db: Session = Depends(get_db)):
    app = current_app(db, act)
    require_editable(app)
    text = body.message.strip()[:1000]
    if not text and not body.answer:
        raise HTTPException(422, "Message is empty")
    lang = lang_of(body.lang or app.language)
    app.language = lang
    cities = [c[0] for c in db.query(RefHistoricalLead.city).distinct().all()]
    types = [t[0] for t in db.query(RefHistoricalLead.business_type).distinct().all()]
    reply, new, asked, used_llm = ai.advisor_turn(app.messages or [], req_of(app), text, cities, types, lang, body.answer)
    new.city_tier = lookup_city_tier(db, new.city)  # derived from dataset, never from the LLM
    ready = not ai.missing_fields(new) and bool(new.needs)
    if ready:
        products = load_products(db)
        rec = recommend(products, new, segment(db, new))
        summary = {"tiers": {k: {"items": [{"name": products[c["product_id"]].name, "qty": c["quantity"]} for c in v["cart"]],
                                 "monthly_estimate_mid": v["quote"]["monthly"]["mid"], "within_budget": v["within_budget"]}
                             for k, v in rec["tiers"].items()}, "unmet": [u["label"] for u in rec["unmet_needs"]],
                   "pending_checks": sorted({c["detail"] for i in rec["items"] for c in i["checks"]
                                             if c["status"] in ("pending", "missing")})}
        expl = ai.explain_recommendation(new, summary, lang) if used_llm else None
        if expl:
            reply = expl
    now = datetime.utcnow().isoformat()
    app.messages = (app.messages or []) + [
        {"role": "user", "text": text or str((body.answer or {}).get("label") or (body.answer or {}).get("value")), "at": now},
        {"role": "assistant", "text": reply, "asked": asked, "fallback": not used_llm, "ready": ready, "at": now}]
    app.requirements = new.model_dump()
    db.commit()
    return {"reply": reply, "llm": used_llm, "recommendation_ready": ready, "application": app_view(db, app)}


@router.post("/advisor/reset")
def advisor_reset(act: Actor = Depends(actor), db: Session = Depends(get_db)):
    app = current_app(db, act)
    require_editable(app)
    app.messages, app.requirements, app.cart = [], {}, []
    db.commit()
    return app_view(db, app)


@router.get("/recommendations")
def recommendations(act: Actor = Depends(actor), db: Session = Depends(get_db)):
    app = current_app(db, act)
    req, products = req_of(app), load_products(db)
    rec = recommend(products, req, segment(db, req))
    ids = {i["product_id"] for i in rec["items"]} | {pid for t in rec["tiers"].values() for pid in t["reasons"]}
    rec["products"] = {pid: product_details(products[pid], products) for pid in ids}
    rec["names"] = {p.product_id: p.name for p in products.values()}
    rec["ready"] = not ai.missing_fields(req) and bool(req.needs)
    return rec


@router.get("/catalogue")
def catalogue(act: Actor = Depends(actor), db: Session = Depends(get_db)):
    app = current_app(db, act)
    req, products = req_of(app), load_products(db)
    cart_ids = {c["product_id"] for c in app.cart}
    out = []
    for p in products.values():
        d = product_details(p, products)
        ev = evaluate(p, req, cart_ids, products)
        d.update(status=ev["status"], checks=ev["checks"], in_cart=p.product_id in cart_ids,
                 default_quantity=default_quantity(p, req))
        out.append(d)
    return {"products": out, "names": {p.product_id: p.name for p in products.values()},
            "profile_known": bool(req.employee_count and req.num_sites)}


class CartItem(BaseModel):
    product_id: str
    quantity: int = 1


@router.put("/cart")
def put_cart(items: list[CartItem], act: Actor = Depends(actor), db: Session = Depends(get_db)):
    app = current_app(db, act)
    require_editable(app)
    products = load_products(db)
    seen, cart = set(), []
    for i in items[:30]:
        if i.product_id not in products:
            raise HTTPException(422, f"Unknown product {i.product_id}")
        if i.product_id in seen:
            continue
        seen.add(i.product_id)
        cart.append({"product_id": i.product_id, "quantity": max(1, min(i.quantity, 500))})
    app.cart = cart
    db.commit()
    return {"cart": cart, "quote": build_quote(products, cart, req_of(app)) if cart else None}


@router.post("/cart/tier/{tier}")
def apply_tier(tier: str, act: Actor = Depends(actor), db: Session = Depends(get_db)):
    if tier not in ("basic", "recommended", "advanced"):
        raise HTTPException(404, "Unknown tier")
    app = current_app(db, act)
    require_editable(app)
    req, products = req_of(app), load_products(db)
    rec = recommend(products, req, segment(db, req))
    if tier not in rec["tiers"]:
        raise HTTPException(422, rec["no_match_message"] or "No configuration available")
    app.cart = rec["tiers"][tier]["cart"]
    db.commit()
    return {"cart": app.cart, "quote": build_quote(products, app.cart, req)}


# ---------- help (guest or customer) ----------
class Help(BaseModel):
    note: str = ""
    name: str | None = None
    phone: str | None = None


@router.post("/help")
def request_help(body: Help, request: Request, act: Actor = Depends(actor), db: Session = Depends(get_db)):
    rate_limit("help:" + client_key(request), 30)
    app = current_app(db, act)
    name = (act.user.name if act.user else (body.name or "").strip())[:120]
    phone = (body.phone or (act.user.phone if act.user else "") or "").strip()
    if not act.user and (len(name) < 2 or not PHONE_RE.match(phone)):
        raise HTTPException(422, "Please share your name and a valid 10-digit mobile number so we can call you")
    app.help_requested, app.help_note = True, body.note.strip()[:1000] or None
    app.help_name, app.help_phone = name, phone or None
    app.help_status, app.help_at = "open", datetime.utcnow()
    add_event(db, app, "help", "open", "customer")
    db.commit()
    return app_view(db, app)


# ---------- voice + i18n ----------
@router.post("/voice/transcribe")
async def voice_transcribe(request: Request, audio: UploadFile = File(...), lang: str = Form("en"),
                           act: Actor = Depends(actor)):
    rate_limit("voice:" + (str(act.user.id) if act.user else act.guest_id))
    data = await audio.read()  # processed in memory only; never written to disk
    if not data or len(data) < 800:
        raise HTTPException(422, "No speech was captured. Please try again.")
    if len(data) > settings.max_audio_kb * 1024:
        raise HTTPException(413, "Recording is too long. Keep it under about a minute.")
    mime = (audio.content_type or "audio/webm").split(";")[0]
    if not mime.startswith("audio/"):
        raise HTTPException(422, "Unsupported audio format")
    try:
        text = ai.transcribe(data, mime, lang_of(lang))
    except Exception:
        raise HTTPException(503, "Voice service is unavailable right now. Please type your message.")
    if not text:
        raise HTTPException(422, "We could not hear clear speech. Please try again or type.")
    return {"text": text[:1000]}


@router.get("/i18n/catalogue")
def catalogue_translations(lang: str, db: Session = Depends(get_db)):
    """Catalogue descriptions translated by Gemini and cached. Names, prices and rules are never translated."""
    lang = lang_of(lang)
    products = load_products(db)
    ids = list(products)
    if lang == "en":
        return {"lang": "en", "translated": False, "descriptions": {i: products[i].description for i in ids}}
    out = ai.cached_translate(db, [products[i].description for i in ids], lang)
    translated = any(o != products[i].description for o, i in zip(out, ids))
    return {"lang": lang, "translated": translated, "descriptions": dict(zip(ids, out))}


# ---------- customer-only: KYC, submit, orders ----------
def customer_app(db: Session, u: User) -> Application:
    return current_app(db, Actor(u, None))


class Identifiers(BaseModel):
    consent: bool
    mode: str | None = None  # gstin | udyam | both | none
    gstin: str | None = None
    udyam: str | None = None
    business_name: str | None = None


@router.put("/kyc/identifiers")
def kyc_identifiers(body: Identifiers, u: User = Depends(customer_only), db: Session = Depends(get_db)):
    app = customer_app(db, u)
    require_editable(app)
    if body.mode and body.mode not in kyc.MODES:
        raise HTTPException(422, "Unknown registration type")
    prev = app.kyc or {}
    keep = lambda new, old: (new or "").strip().upper() or old  # blank keeps the saved value
    app.kyc = {**prev, "consent": body.consent, "mode": body.mode or prev.get("mode"),
               "gstin": keep(body.gstin, prev.get("gstin")), "udyam": keep(body.udyam, prev.get("udyam")),
               "business_name": (body.business_name or "").strip()[:150] or prev.get("business_name"),
               "consent_at": prev.get("consent_at") or (datetime.utcnow().isoformat() if body.consent else None)}
    req = req_of(app)
    if app.kyc["mode"] in ("gstin", "both"):
        req.has_gstin = True
    elif app.kyc["mode"] == "none":
        req.has_gstin = False
    app.requirements = req.model_dump()
    db.commit()
    return kyc_result(db, app)


@router.get("/kyc")
def kyc_status(u: User = Depends(customer_only), db: Session = Depends(get_db)):
    return kyc_result(db, customer_app(db, u))


@router.post("/kyc/documents")
async def kyc_upload(doc_type: str = Form(...), file: UploadFile = File(...),
                     u: User = Depends(customer_only), db: Session = Depends(get_db)):
    app = customer_app(db, u)
    if not (app.kyc or {}).get("consent"):
        raise HTTPException(403, "Consent is required before uploading documents")
    require_editable(app)
    if doc_type not in kyc.DOC_LABELS:
        raise HTTPException(422, "Unknown document type")
    rate_limit(f"upload:{u.id}", 60)
    try:
        path, quality = kyc.save_upload(app.id, file.filename or "upload", await file.read())
    except ValueError as e:
        raise HTTPException(422, str(e))
    for old in db.query(Document).filter(Document.application_id == app.id, Document.doc_type == doc_type).all():
        Path(old.path).unlink(missing_ok=True)
        db.delete(old)
    ex = {"available": False, "lines": [], "error": "Skipped: image too blurry or small"}
    if not (quality["blurry"] or quality["low_resolution"]):
        ex = kyc.extract_text(path)
        ex["fields"] = kyc.parse_fields(doc_type, ex.get("lines", []))
    db.add(Document(application_id=app.id, doc_type=doc_type, filename=Path(file.filename or "upload").name[:150],
                    path=path, extracted=ex, quality=quality))
    db.commit()
    return kyc_result(db, app)


@router.delete("/kyc/documents/{doc_id}")
def kyc_delete(doc_id: int, u: User = Depends(customer_only), db: Session = Depends(get_db)):
    app = customer_app(db, u)
    d = db.get(Document, doc_id)
    if not d or d.application_id != app.id:
        raise HTTPException(404, "Document not found")
    require_editable(app)
    Path(d.path).unlink(missing_ok=True)
    db.delete(d)
    db.commit()
    return kyc_result(db, app)


@router.get("/documents/{doc_id}/file")
def document_file(doc_id: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    d = db.get(Document, doc_id)
    if not d:
        raise HTTPException(404, "Document not found")
    app = db.get(Application, d.application_id)
    if u.role == "customer" and app.user_id != u.id:
        raise HTTPException(404, "Document not found")
    if u.role == "employee":
        employee_only(u)
        if app.status == "draft" and not app.help_requested:
            raise HTTPException(403, "Application not submitted")
    return FileResponse(d.path)


@router.post("/application/submit")
def submit(u: User = Depends(customer_only), db: Session = Depends(get_db)):
    app = customer_app(db, u)
    require_editable(app)
    products, req = load_products(db), req_of(app)
    q = build_quote(products, app.cart, req) if app.cart else None
    if not q or not q["valid"]:
        raise HTTPException(422, "Your quote has unresolved issues: " + "; ".join((q or {"issues": ["No products selected"]})["issues"]))
    k = kyc_result(db, app, products)
    if not k["consent"] or not k.get("mode"):
        raise HTTPException(422, "Complete the verification step (consent and registration type) first")
    missing_docs = [c for c in k["checks"] if c["code"] == "doc.not_uploaded"]
    if missing_docs:
        raise HTTPException(422, "Please upload: " + ", ".join(c["label"] for c in missing_docs))
    if k["overall"] == "action_required" and not app.help_requested:
        raise HTTPException(422, "Some verification items need your action. Fix them or request help from our team.")
    app.quote, app.status, app.submitted_at = q, "submitted", datetime.utcnow()
    app.kyc = {**app.kyc, "snapshot": {"overall": k["overall"], "checks": k["checks"], "registry": k["registry"]}}
    add_event(db, app, "submitted", "submitted", "customer")
    db.commit()
    return app_view(db, app)


@router.get("/orders")
def orders(u: User = Depends(customer_only), db: Session = Depends(get_db)):
    apps = db.query(Application).filter(Application.user_id == u.id).order_by(Application.id.desc()).all()
    products = load_products(db)
    out = []
    for a in apps:
        if a.status == "draft" and not (a.messages or a.cart):
            continue
        q = a.quote or (build_quote(products, a.cart, req_of(a)) if a.cart else None)
        r = a.requirements or {}
        out.append({"id": a.id, "status": a.status, "business_type": r.get("business_type"), "city": r.get("city"),
                    "items": [{"name": i["name"], "quantity": i["quantity"]} for i in (q or {}).get("items", [])],
                    "monthly": (q or {}).get("monthly"), "setup_total": (q or {}).get("setup_total"),
                    "created_at": a.created_at, "updated_at": a.updated_at, "submitted_at": a.submitted_at,
                    "help": {"requested": a.help_requested, "status": a.help_status},
                    "events": events_of(db, a), "expected_activation": expected_activation(a, q),
                    "editable": a.status in EDITABLE})
    return {"orders": out}


@router.post("/orders/{app_id}/resume")
def resume(app_id: int, u: User = Depends(customer_only), db: Session = Depends(get_db)):
    a = db.get(Application, app_id)
    if not a or a.user_id != u.id:
        raise HTTPException(404, "Order not found")
    if a.status not in EDITABLE:
        raise HTTPException(409, "This order is no longer editable")
    a.updated_at = datetime.utcnow()  # makes it the current working application
    db.commit()
    return app_view(db, a)


# ---------- employee portal ----------
def customer_label(db: Session, a: Application) -> tuple[str, str | None, str | None]:
    if a.user_id:
        cu = db.get(User, a.user_id)
        return cu.name, cu.email, cu.phone
    return (a.help_name or "Guest visitor"), None, a.help_phone


def row_view(db: Session, a: Application, kyc_overall: str) -> dict:
    r = a.requirements or {}
    name, email, phone = customer_label(db, a)
    q = a.quote or (build_quote(load_products(db), a.cart, req_of(a)) if a.cart else None)
    return {"id": a.id, "customer": name, "email": email, "phone": phone, "is_guest": a.user_id is None,
            "business_type": r.get("business_type"), "city": r.get("city"), "language": a.language,
            "status": a.status, "status_label": STATUS_LABELS[a.status], "kyc": kyc_overall,
            "help_requested": a.help_requested, "help_status": a.help_status, "help_at": a.help_at,
            "monthly_estimate": (q or {}).get("monthly", {}).get("mid"), "items": len((q or {}).get("items", [])),
            "submitted_at": a.submitted_at, "updated_at": a.updated_at}


def visible_apps(db: Session):
    return db.query(Application).filter((Application.status != "draft") | (Application.help_requested.is_(True)))


QUEUES = {
    "help": lambda r: r["help_requested"] and r["help_status"] in ("open", "in_progress"),
    "kyc": lambda r: r["status"] != "draft" and r["kyc"] in ("action_required", "needs_manual_review", "unable_to_verify"),
    "new": lambda r: r["status"] == "submitted",
    "active": lambda r: r["status"] in ("in_review", "awaiting_customer", "ready_for_activation"),
}


def all_rows(db: Session) -> list[dict]:
    products = load_products(db)
    rows = []
    for a in visible_apps(db).order_by(Application.updated_at.desc()).all():
        rows.append(row_view(db, a, kyc_result(db, a, products)["overall"] if a.kyc else "pending"))
    return rows


@router.get("/employee/summary")
def emp_summary_counts(u: User = Depends(employee_only), db: Session = Depends(get_db)):
    rows = all_rows(db)
    return {"queues": {k: sum(1 for r in rows if f(r)) for k, f in QUEUES.items()}, "total": len(rows)}


@router.get("/employee/applications")
def emp_list(queue: str | None = None, status: str | None = None, kyc_status: str | None = None, q: str | None = None,
             u: User = Depends(employee_only), db: Session = Depends(get_db)):
    rows = all_rows(db)
    if queue in QUEUES:
        rows = [r for r in rows if QUEUES[queue](r)]
    if status:
        rows = [r for r in rows if r["status"] == status]
    if kyc_status:
        rows = [r for r in rows if r["kyc"] == kyc_status]
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in f"{r['customer']} {r['business_type']} {r['city']} {r['id']} {r['email']}".lower()]
    return {"applications": rows, "status_options": STATUS_LABELS}


def emp_app(db: Session, app_id: int) -> Application:
    a = db.get(Application, app_id)
    if not a or (a.status == "draft" and not a.help_requested):
        raise HTTPException(404, "Application not found")
    return a


def emp_detail(db: Session, a: Application) -> dict:
    products = load_products(db)
    live = kyc_result(db, a, products)
    snap = (a.kyc or {}).get("snapshot", {})
    q = a.quote or (build_quote(products, a.cart, req_of(a)) if a.cart else None)
    return {
        **row_view(db, a, live["overall"]),
        "requirements": a.requirements, "needs_labels": [NEED_LABELS.get(n, n) for n in (a.requirements or {}).get("needs", [])],
        "messages": a.messages, "quote": q, "quote_is_snapshot": bool(a.quote),
        "kyc": {**live, "submitted_snapshot": snap.get("overall")}, "help_note": a.help_note,
        "notes": a.employee_notes or [], "events": events_of(db, a),
        "allowed_transitions": sorted(TRANSITIONS[a.status]), "expected_activation": expected_activation(a, q),
    }


@router.get("/employee/applications/{app_id}")
def emp_get(app_id: int, u: User = Depends(employee_only), db: Session = Depends(get_db)):
    return emp_detail(db, emp_app(db, app_id))


class StatusChange(BaseModel):
    status: str
    note: str = ""


@router.post("/employee/applications/{app_id}/status")
def emp_status(app_id: int, body: StatusChange, u: User = Depends(employee_only), db: Session = Depends(get_db)):
    a = emp_app(db, app_id)
    if body.status not in TRANSITIONS[a.status]:
        raise HTTPException(409, f"Cannot move from {a.status} to {body.status}")
    a.employee_notes = (a.employee_notes or []) + [{
        "by": u.name, "at": datetime.utcnow().isoformat(), "text": body.note.strip()[:500] or f"Status changed to {body.status}",
        "status": body.status}]
    a.status = body.status
    add_event(db, a, "status", body.status, "employee")
    db.commit()
    return emp_detail(db, a)


class HelpStatus(BaseModel):
    status: str  # in_progress | resolved


@router.post("/employee/applications/{app_id}/help")
def emp_help(app_id: int, body: HelpStatus, u: User = Depends(employee_only), db: Session = Depends(get_db)):
    a = emp_app(db, app_id)
    if not a.help_requested or body.status not in ("in_progress", "resolved"):
        raise HTTPException(422, "Invalid help status")
    a.help_status = body.status
    add_event(db, a, "help_status", body.status, "employee")
    db.commit()
    return emp_detail(db, a)


class Note(BaseModel):
    text: str


@router.post("/employee/applications/{app_id}/notes")
def emp_note(app_id: int, body: Note, u: User = Depends(employee_only), db: Session = Depends(get_db)):
    a = emp_app(db, app_id)
    if not body.text.strip():
        raise HTTPException(422, "Note is empty")
    a.employee_notes = (a.employee_notes or []) + [{"by": u.name, "at": datetime.utcnow().isoformat(), "text": body.text.strip()[:500]}]
    db.commit()
    return emp_detail(db, a)


def ai_context(db: Session, a: Application) -> dict:
    """Sanitised application context for the LLM: masked identifiers, no documents or images."""
    d = emp_detail(db, a)
    k, q = d["kyc"], d["quote"]
    return {
        "application_id": a.id, "status": a.status, "customer_language": ai.LANGS.get(a.language, "English"),
        "requirements": a.requirements,
        "quote": q and {"items": [{"name": i["name"], "quantity": i["quantity"], "status": i["status"]} for i in q["items"]],
                        "monthly": q["monthly"], "setup_total": q["setup_total"], "note": "excl. taxes"},
        "kyc": {"overall": k["overall"], "mode": k.get("mode"), "gstin": k.get("gstin_masked"), "udyam": k.get("udyam_masked"),
                "checks": [{"label": c["label"], "status": c["status"], "detail": c["detail"]} for c in k["checks"]]},
        "help_requested": a.help_requested, "help_status": a.help_status, "help_note": a.help_note,
        "conversation": [{"role": m["role"], "text": m["text"]} for m in (a.messages or [])[-20:]],
        "employee_notes": a.employee_notes,
    }


@router.post("/employee/applications/{app_id}/summary")
def emp_summary(app_id: int, u: User = Depends(employee_only), db: Session = Depends(get_db)):
    ctx = ai_context(db, emp_app(db, app_id))
    text, used = ai.employee_answer(ctx, "In English, summarise this application in 5 short bullet points: the customer, "
                                    "requirements, selected products and quote, KYC issues, and the suggested next action.")
    return {"summary": text, "llm": used}


@router.post("/employee/applications/{app_id}/ask")
def emp_ask(app_id: int, body: Msg, u: User = Depends(employee_only), db: Session = Depends(get_db)):
    ctx = ai_context(db, emp_app(db, app_id))
    text, used = ai.employee_answer(ctx, "Answer in English. " + body.message[:500])
    return {"answer": text, "llm": used}


@router.post("/employee/applications/{app_id}/translate")
def emp_translate(app_id: int, u: User = Depends(employee_only), db: Session = Depends(get_db)):
    """English translation of the conversation (cached). Original text is kept alongside."""
    a = emp_app(db, app_id)
    texts = [m["text"] for m in (a.messages or [])]
    return {"english": ai.cached_translate(db, texts, "en") if texts else []}
