"""Order lifecycle after submission: approval, e-sign + AutoPay, technician visit, installation, service live.

Backend-controlled state machine. A clean KYC (verdict 'pass') is approved automatically, so only holds reach the
team. E-sign, UPI AutoPay and the technician roster are simulated in this prototype (no external services).
"""
from datetime import datetime, timedelta

# customer-facing journey, in order
STAGES = ["submitted", "approved", "confirmed", "scheduled", "installed", "live"]
STATUS_LABELS = {"draft": "Draft", "submitted": "Submitted", "in_review": "Team checking", "awaiting_customer": "Waiting for you",
                 "approved": "Approved", "confirmed": "Order confirmed", "scheduled": "Technician scheduled",
                 "installed": "Installed", "live": "Service live", "closed": "Closed"}
# who may move an order where (customer moves: draft->submitted/approved at submit, approved->confirmed at e-sign)
EMPLOYEE_TRANSITIONS = {
    "submitted": {"in_review", "approved", "awaiting_customer", "closed"},
    "in_review": {"approved", "awaiting_customer", "closed"},
    "awaiting_customer": {"in_review", "closed"},
    "approved": {"awaiting_customer", "closed"},
    "confirmed": {"scheduled", "closed"},
    "scheduled": {"scheduled", "installed", "closed"},
    "installed": {"live"},
    "live": set(), "closed": set(), "draft": set(),
}
EDITABLE = ("draft", "awaiting_customer")
WINDOWS = ("09:00-11:00", "11:00-13:00", "14:00-16:00", "16:00-18:00")
TECHNICIANS = ["Arjun Mehta", "Imran Shaikh", "Priya Nair", "Rahul Verma", "Kavita Rao", "Suresh Iyer"]
SLA_DAYS = 21  # leads drop when installation slips beyond 21 days (smb_leads.csv)
SIGN_WITHIN_DAYS = 3  # customer completes e-sign + AutoPay within 3 days of verification


def stage_index(status: str) -> int:
    if status in ("in_review", "awaiting_customer"):
        return 0
    return STAGES.index(status) if status in STAGES else -1


def services(quote: dict | None, start: datetime | None) -> list[dict]:
    """Per-service ETA from the catalogue's typical_install_days, counted from order confirmation."""
    base = start or datetime.utcnow()
    return [{"product_id": i["product_id"], "name": i["name"], "quantity": i["quantity"],
             "install_days": i["install_days"], "eta": (base + timedelta(days=i["install_days"])).date().isoformat()}
            for i in (quote or {}).get("items", [])]


def next_action(status: str, order: dict) -> dict | None:
    """The one thing the customer should do now (codes are localised in the UI)."""
    if status == "awaiting_customer":
        return {"code": "fix", "message": order.get("customer_message")}
    if status == "approved":
        approved = (order.get("stage_at") or {}).get("approved")
        due = (datetime.fromisoformat(approved) + timedelta(days=SIGN_WITHIN_DAYS)).isoformat() if approved else None
        return {"code": "sign", "payment_failed": bool((order.get("payment") or {}).get("failed")),
                "due": due, "within_days": SIGN_WITHIN_DAYS}
    return None


def tracking(app, quote: dict | None, events: list[dict]) -> dict:
    order = app.order or {}
    at = order.get("stage_at", {})
    cur = stage_index(app.status)
    confirmed = at.get("confirmed")
    svc = services(quote, datetime.fromisoformat(confirmed) if confirmed else None)
    live_eta = max((s["eta"] for s in svc), default=None)
    sla_due = (app.submitted_at + timedelta(days=SLA_DAYS)).date().isoformat() if app.submitted_at else None
    at_risk = bool(app.status not in ("live", "closed", "draft") and sla_due and live_eta and live_eta > sla_due)
    return {
        "status": app.status, "status_label": STATUS_LABELS.get(app.status, app.status),
        # reached stages are done; the next one is "current" (what we are waiting for now)
        "stages": [{"key": s, "done": i <= cur, "current": i == cur + 1, "at": at.get(s)}
                   for i, s in enumerate(STAGES)] if app.status != "closed" else [],
        "waiting_on": "team" if app.status in ("submitted", "in_review") else "customer" if app.status in ("awaiting_customer", "approved") else
                      "technician" if app.status in ("confirmed", "scheduled") else None,
        "services": svc, "expected_live": live_eta if app.status not in ("closed",) else None,
        "slot": order.get("slot"), "esign_at": order.get("esign_at"), "payment": order.get("payment"),
        "next_action": next_action(app.status, order), "sla_due": sla_due, "at_risk": at_risk,
    }


def set_stage(app, status: str):
    order = dict(app.order or {})
    order["stage_at"] = {**order.get("stage_at", {}), status: datetime.utcnow().isoformat()}
    app.order, app.status = order, status
