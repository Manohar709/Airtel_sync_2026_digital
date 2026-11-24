"""Catalogue access + deterministic eligibility / dependency checks.

Only fields present in product_catalogue.csv are used. Nothing here is decided by the LLM.
"""
from dataclasses import dataclass, field
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from .models import RefProduct, RefHistoricalLead

# Need tags the advisor may extract -> catalogue products that serve the need.
# This mapping is a routing aid built from product names/descriptions in the catalogue;
# eligibility is still decided by the catalogue fields.
NEED_PRODUCTS: dict[str, list[str]] = {
    "internet": ["P01", "P02", "P03", "P04", "P05", "P06"],
    "backup_internet": ["P09"],
    "multisite_network": ["P10"],
    "mobile_lines": ["P07", "P08"],
    "phone_system": ["P12"],
    "toll_free": ["P13"],
    "bulk_sms": ["P14"],
    "whatsapp": ["P15"],
    "email_office": ["P16"],
    "data_backup": ["P17"],
    "website": ["P18"],
    "pos_billing": ["P19"],
    "endpoint_security": ["P20"],
    "firewall": ["P21"],
    "wifi": ["P22"],
    "cctv": ["P23"],
    "static_ip": ["P11"],
    "machine_monitoring": ["P24"],
    "fleet_tracking": ["P25"],
}
NEED_LABELS = {
    "internet": "Internet connectivity", "backup_internet": "Backup internet / failover",
    "multisite_network": "Managed network across sites", "mobile_lines": "Business mobile lines",
    "phone_system": "Business phone system (IVR, call recording)", "toll_free": "Toll-free number",
    "bulk_sms": "Bulk SMS alerts", "whatsapp": "WhatsApp customer messaging",
    "email_office": "Business email & office tools", "data_backup": "Cloud data backup",
    "website": "Website & domain", "pos_billing": "POS & billing",
    "endpoint_security": "Device security", "firewall": "Managed firewall",
    "wifi": "Managed Wi-Fi (incl. guest)", "cctv": "CCTV / remote camera monitoring",
    "static_ip": "Fixed public IP (remote access)", "machine_monitoring": "Machine monitoring (IoT)",
    "fleet_tracking": "Vehicle / fleet tracking",
}
NEEDS = list(NEED_PRODUCTS)


class Requirements(BaseModel):
    business_type: str | None = None
    employee_count: int | None = Field(default=None, ge=1, le=100000)
    num_sites: int | None = Field(default=None, ge=1, le=1000)
    city: str | None = None
    city_tier: int | None = None  # derived by backend from dataset, never by the LLM
    has_gstin: bool | None = None
    current_internet: str | None = None
    monthly_budget_inr: int | None = Field(default=None, ge=0)
    needs: list[str] = []
    skipped: list[str] = []  # optional fields the customer chose not to answer


@dataclass
class Product:
    product_id: str
    category: str
    name: str
    description: str
    unit: str
    price_min: float
    price_max: float
    setup: float
    contract_months: int
    tiers: list[int]
    min_employees: int
    min_sites: int
    requires_gstin: bool
    requires_one_of: list[str]
    install_days: int
    segments: list[str]

    @property
    def mid(self) -> float:
        return (self.price_min + self.price_max) / 2

    @property
    def is_range(self) -> bool:
        return self.price_min != self.price_max


def _to_product(r) -> Product:
    g = (lambda k: r[k]) if isinstance(r, dict) else (lambda k: getattr(r, k))
    req = g("requires_one_of")
    req = req if isinstance(req, str) and req.strip() else ""
    return Product(
        product_id=g("product_id"), category=g("category"), name=g("product_name"),
        description=g("description"), unit=g("unit"),
        price_min=float(g("price_min_inr_per_month")), price_max=float(g("price_max_inr_per_month")),
        setup=float(g("one_time_setup_inr")), contract_months=int(g("min_contract_months")),
        tiers=[int(x) for x in str(g("available_city_tiers")).split(";") if x],
        min_employees=int(g("min_employees")), min_sites=int(g("min_sites")),
        requires_gstin=str(g("requires_gstin")).upper() == "Y",
        requires_one_of=[x for x in req.split("|") if x],
        install_days=int(g("typical_install_days")),
        segments=[x for x in str(g("target_segments")).split(";") if x],
    )


def load_products(db: Session) -> dict[str, Product]:
    return {p.product_id: _to_product(p) for p in db.query(RefProduct).all()}


def products_from_csv(path) -> dict[str, Product]:
    import pandas as pd
    df = pd.read_csv(path)
    return {r["product_id"]: _to_product(r) for r in df.to_dict("records")}


def lookup_city_tier(db: Session, city: str | None) -> int | None:
    """City tier comes from the supplied historical leads (the only dataset that maps city->tier)."""
    if not city:
        return None
    row = db.query(RefHistoricalLead).filter(RefHistoricalLead.city.ilike(city.strip())).first()
    return row.city_tier if row else None


def infer_segment(db: Session, business_type: str | None) -> str | None:
    if not business_type:
        return None
    row = db.query(RefHistoricalLead).filter(RefHistoricalLead.business_type.ilike(business_type.strip())).first()
    return row.segment if row else None


SEGMENT_CODE = {
    "Micro retail & services": "micro", "Professional offices": "prof",
    "Small multi-site businesses": "multi", "Small manufacturers": "mfg",
}


def evaluate(p: Product, req: Requirements, cart_ids: set[str], products: dict[str, Product]) -> dict:
    """Per-product checks + overall status.

    status: eligible | prerequisite_required | not_eligible
    check status: ok | fail | pending | missing. Each check carries a stable `code` + `params`
    so the frontend can localise it; `label`/`detail` stay in English for logs and employees.
    """
    checks = []

    def add(label, status, detail, code, **params):
        checks.append({"label": label, "status": status, "detail": detail, "code": code, "params": params})

    tiers = "/".join(map(str, p.tiers))
    if req.city_tier is None:
        add("City tier", "pending", "City not recognised in dataset; location check pending", "elig.tier_unknown")
    elif req.city_tier in p.tiers:
        add("City tier", "ok", f"Sold in tier {req.city_tier} cities", "elig.tier_ok", tier=req.city_tier)
    else:
        add("City tier", "fail", f"Sold only in tier {tiers} cities; yours is tier {req.city_tier}",
            "elig.tier_fail", tiers=tiers, tier=req.city_tier)

    if req.employee_count is None:
        add("Minimum employees", "pending", f"Needs at least {p.min_employees}; your headcount is not known yet",
            "elig.emp_unknown", min=p.min_employees)
    elif req.employee_count >= p.min_employees:
        add("Minimum employees", "ok", f"Needs at least {p.min_employees}", "elig.emp_ok", min=p.min_employees)
    else:
        add("Minimum employees", "fail", f"Needs at least {p.min_employees} employees; you have {req.employee_count}",
            "elig.emp_fail", min=p.min_employees, have=req.employee_count)

    if req.num_sites is None:
        add("Minimum sites", "pending", f"Needs at least {p.min_sites} site(s)", "elig.sites_unknown", min=p.min_sites)
    elif req.num_sites >= p.min_sites:
        add("Minimum sites", "ok", f"Needs at least {p.min_sites} site(s)", "elig.sites_ok", min=p.min_sites)
    else:
        add("Minimum sites", "fail", f"Needs at least {p.min_sites} sites; you have {req.num_sites}",
            "elig.sites_fail", min=p.min_sites, have=req.num_sites)

    if p.requires_gstin:
        if req.has_gstin is False:
            add("GSTIN", "fail", "A valid, active GSTIN is mandatory for this product", "elig.gstin_fail")
        elif req.has_gstin is None:
            add("GSTIN", "pending", "Valid, active GSTIN is mandatory; to be checked in KYC", "elig.gstin_pending")
        else:
            add("GSTIN", "pending", "Mandatory. You said you have one; it is checked in KYC", "elig.gstin_declared")

    if p.category == "Connectivity" and p.unit == "per site":
        add("Site feasibility", "pending", "Not in the dataset; confirmed by an Airtel representative", "elig.feasibility")

    if p.requires_one_of:
        ids = [i for i in p.requires_one_of if i in products]
        names = ", ".join(f"{products[i].name} ({i})" for i in ids)
        if cart_ids & set(p.requires_one_of):
            add("Prerequisite product", "ok", f"Covered by selected product (needs one of: {names})", "elig.prereq_ok", ids=ids)
        else:
            add("Prerequisite product", "missing", f"Needs at least one of: {names}", "elig.prereq_missing", ids=ids)

    if any(c["status"] == "fail" for c in checks):
        status = "not_eligible"
    elif any(c["status"] == "missing" for c in checks):
        status = "prerequisite_required"
    else:
        status = "eligible"
    return {"status": status, "checks": checks}


def product_details(p: Product, products: dict[str, Product]) -> dict:
    """Static product view with the 'Requirements & Prerequisites' section (catalogue-backed only)."""
    mandatory = []
    if p.requires_one_of:
        ids = [i for i in p.requires_one_of if i in products]
        mandatory.append({"kind": "product", "code": "req.one_of", "ids": ids,
                          "text": "One of: " + ", ".join(f"{products[i].name} ({i})" for i in ids)})
    if p.requires_gstin:
        mandatory.append({"kind": "registration", "code": "req.gstin", "text": "Valid, active GSTIN"})
    if p.min_employees > 1:
        mandatory.append({"kind": "size", "code": "req.min_employees", "n": p.min_employees,
                          "text": f"At least {p.min_employees} employees"})
    if p.min_sites > 1:
        mandatory.append({"kind": "size", "code": "req.min_sites", "n": p.min_sites, "text": f"At least {p.min_sites} sites"})
    mandatory.append({"kind": "location", "code": "req.tiers", "tiers": "/".join(map(str, p.tiers)),
                      "text": f"Available in city tier {'/'.join(map(str, p.tiers))}"})
    dependents = [q.product_id for q in products.values() if p.product_id in q.requires_one_of]
    group = next((v for v in NEED_PRODUCTS.values() if p.product_id in v and len(v) > 1), [])
    return {
        "product_id": p.product_id, "name": p.name, "category": p.category, "description": p.description,
        "unit": p.unit, "price_min": p.price_min, "price_max": p.price_max, "is_range": p.is_range,
        "setup": p.setup, "contract_months": p.contract_months, "install_days": p.install_days,
        "segments": p.segments, "requires_gstin": p.requires_gstin, "mandatory": mandatory,
        "compatible_addons": dependents,  # products that list this one as a prerequisite option
        "alternatives": [i for i in group if i != p.product_id],
        "needs": [n for n, v in NEED_PRODUCTS.items() if p.product_id in v],
    }


def default_quantity(p: Product, req: Requirements) -> int:
    if p.unit == "per site":
        return req.num_sites or 1
    if p.unit in ("per user", "per device") and p.category in ("Cloud & Productivity", "Security"):
        return req.employee_count or 1
    return 1
