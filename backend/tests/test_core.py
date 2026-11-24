from app.config import settings
from app.catalogue import products_from_csv, Requirements, evaluate
from app.recommend import recommend
from app.quote import build_quote

P = products_from_csv(settings.data_path / "product_catalogue.csv")


def dental():
    return Requirements(business_type="Dental clinic", employee_count=20, num_sites=1, city="Kochi",
                        city_tier=2, has_gstin=True, monthly_budget_inr=5000, needs=["internet", "cctv", "static_ip"])


def test_sdwan_needs_prereq_and_sites():
    r = Requirements(employee_count=20, num_sites=1, city_tier=1, has_gstin=True)
    assert evaluate(P["P10"], r, set(), P)["status"] == "not_eligible"  # needs 3 sites
    r.num_sites = 4
    assert evaluate(P["P10"], r, set(), P)["status"] == "prerequisite_required"
    assert evaluate(P["P10"], r, {"P02"}, P)["status"] == "eligible"


def test_gstin_gate_and_tier():
    r = Requirements(employee_count=30, num_sites=1, city_tier=2, has_gstin=False)
    assert evaluate(P["P05"], r, set(), P)["status"] == "not_eligible"
    assert evaluate(P["P03"], r, set(), P)["status"] == "not_eligible"  # tier 1 only


def test_recommendation_and_quote_math():
    rec = recommend(P, dental(), "prof")
    assert not rec["no_match"]
    q = rec["tiers"]["recommended"]["quote"]
    assert q["valid"], q["issues"]
    exp = sum(P[c["product_id"]].mid * c["quantity"] for c in rec["tiers"]["recommended"]["cart"])
    assert abs(q["monthly"]["mid"] - exp) < 0.01
    assert rec["tiers"]["basic"]["quote"]["monthly"]["mid"] <= q["monthly"]["mid"]


def test_removing_dependency_invalidates_quote():
    r = dental()
    q = build_quote(P, [{"product_id": "P23", "quantity": 2}], r)
    assert not q["valid"] and "Prerequisite" in " ".join(q["issues"]) or "Needs at least one of" in " ".join(q["issues"])


def test_no_match():
    r = Requirements(employee_count=2, num_sites=1, city_tier=2, has_gstin=False, needs=["machine_monitoring"])
    assert recommend(P, r, "micro")["no_match"]
