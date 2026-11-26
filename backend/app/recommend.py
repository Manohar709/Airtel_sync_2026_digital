"""Deterministic recommendation engine: hard constraints first, then simple ranking.

Tiers use only catalogue rules:
  Basic       - cheapest eligible product for each need (+ mandatory prerequisite products)
  Recommended - middle-priced eligible product that targets the customer's segment
  Advanced    - highest-priced segment-matching product, plus connectivity products that
                list the chosen link in their own requires_one_of (e.g. failover, static IP)
"""
from collections import Counter
from .catalogue import (Product, Requirements, NEED_PRODUCTS, NEED_LABELS, evaluate, default_quantity)

_NEED_OF = {pid: need for need, pids in NEED_PRODUCTS.items() for pid in pids}
_LEAD_NEEDS: dict | None = None


def _lead_needs(db) -> dict:
    """business type -> Counter of needs that leads of that type asked about (smb_leads.csv products_of_interest)."""
    global _LEAD_NEEDS
    if _LEAD_NEEDS is None:
        from .models import RefHistoricalLead
        out: dict[str, Counter] = {}
        for bt, raw in db.query(RefHistoricalLead.business_type, RefHistoricalLead.raw).all():
            c = out.setdefault((bt or "").lower(), Counter())
            for pid in str((raw or {}).get("products_of_interest") or "").split(";"):
                if pid.strip() in _NEED_OF:
                    c[_NEED_OF[pid.strip()]] += 1
        out["*"] = sum(out.values(), Counter())
        _LEAD_NEEDS = out
    return _LEAD_NEEDS


def effective_needs(db, req: Requirements) -> tuple[list[str], str]:
    """Needs to plan for now: what the customer said, else what similar businesses most often asked for."""
    if req.needs:
        return list(req.needs), "stated"
    data = _lead_needs(db)
    c = data.get((req.business_type or "").lower())
    if c:
        return [n for n, _ in c.most_common(3)], "similar"
    return [n for n, _ in data["*"].most_common(2)], "popular"


def has_preview(req: Requirements) -> bool:
    """Any useful fact is enough to show a starting plan."""
    return bool(req.business_type or req.needs or req.city or req.employee_count)
from .quote import build_quote


def _hard_ok(p, req, products):
    ev = evaluate(p, req, set(), products)
    return not any(c["status"] == "fail" for c in ev["checks"]), ev


def _add_prerequisites(selected: dict[str, str], products, req, codes: dict) -> dict[str, str]:
    """Ensure every selected product's requires_one_of is satisfied; add cheapest eligible provider."""
    for pid in list(selected):
        p = products[pid]
        if p.requires_one_of and not (set(selected) & set(p.requires_one_of)):
            opts = [products[i] for i in p.requires_one_of if i in products and _hard_ok(products[i], req, products)[0]]
            if opts:
                best = min(opts, key=lambda o: o.mid)
                selected[best.product_id] = f"Added because {p.name} requires a compatible connection"
                codes[best.product_id] = {"code": "reason.prereq", "params": {"product": p.name}}
    return selected


def recommend(products: dict[str, Product], req: Requirements, segment_code: str | None) -> dict:
    per_need, unmet = {}, []
    for need in req.needs:
        cands = [products[i] for i in NEED_PRODUCTS.get(need, []) if i in products]
        eligible, blocked = [], []
        for p in cands:
            ok, ev = _hard_ok(p, req, products)
            (eligible if ok else blocked).append((p, ev))
        if not eligible:
            unmet.append({
                "need": need, "label": NEED_LABELS[need],
                "reasons": sorted({c["detail"] for _, ev in blocked for c in ev["checks"] if c["status"] == "fail"}),
                "reason_codes": list({(c["code"], str(sorted(c["params"].items()))): {"code": c["code"], "params": c["params"]}
                                      for _, ev in blocked for c in ev["checks"] if c["status"] == "fail"}.values()),
                "next_step": "Ask an Airtel representative to review alternatives for this requirement.",
            })
            continue
        eligible.sort(key=lambda t: t[0].mid)
        per_need[need] = [t[0] for t in eligible]

    def pick(cands, name):
        seg = [p for p in cands if segment_code in p.segments] or cands
        return {"basic": cands[0], "recommended": seg[len(seg) // 2], "advanced": seg[-1]}[name]

    def tier(name):
        sel: dict[str, str] = {}
        codes: dict[str, dict] = {}
        # 1) needs whose products depend on another product are chosen first ...
        dependents = {n: c for n, c in per_need.items() if all(p.requires_one_of for p in c)}
        for need, cands in dependents.items():
            p = pick(cands, name)
            sel[p.product_id] = f"Addresses your need: {NEED_LABELS[need]}"
            codes[p.product_id] = {"code": "reason.need", "params": {"need": need}}
        allowed = None  # providers that satisfy every selected dependent product
        for pid in sel:
            r = set(products[pid].requires_one_of)
            allowed = r if allowed is None else (allowed & r or allowed)
        # 2) ... then the remaining needs, restricted to compatible providers where possible
        for need, cands in per_need.items():
            if need in dependents:
                continue
            fit = [p for p in cands if allowed and p.product_id in allowed] or cands
            pid = pick(fit, name).product_id
            sel[pid] = f"Addresses your need: {NEED_LABELS[need]}"
            codes[pid] = {"code": "reason.need", "params": {"need": need}}
        _add_prerequisites(sel, products, req, codes)
        if name == "advanced":
            links = [i for i in sel if products[i].category == "Connectivity" and not products[i].requires_one_of]
            extras = [q for q in products.values()
                      if q.category == "Connectivity" and q.product_id not in sel
                      and set(q.requires_one_of) & set(links) and _hard_ok(q, req, products)[0]]
            for q in sorted(extras, key=lambda x: x.mid)[:2]:
                sel[q.product_id] = "Optional upgrade: compatible with your chosen connection"
                codes[q.product_id] = {"code": "reason.upgrade", "params": {}}
        cart = [{"product_id": i, "quantity": default_quantity(products[i], req)} for i in sel]
        quote = build_quote(products, cart, req)
        budget = req.monthly_budget_inr
        return {
            "cart": cart, "reasons": sel, "reason_codes": codes, "quote": quote,
            "optional": [i for i, c in codes.items() if c["code"] == "reason.upgrade"],
            "within_budget": None if not budget else quote["monthly"]["mid"] <= budget,
        }

    tiers = {n: tier(n) for n in ("basic", "recommended", "advanced")} if per_need else {}

    # One recommended plan + optional add-ons: eligible products that build on what the plan already includes
    # (e.g. static IP or failover for the chosen connection). The customer switches them on or off.
    addons = []
    if tiers:
        base = set(tiers["recommended"]["reasons"])
        for q in sorted(products.values(), key=lambda x: x.mid):
            if q.product_id not in base and q.requires_one_of and set(q.requires_one_of) & base and _hard_ok(q, req, products)[0]:
                addons.append({"product_id": q.product_id, "quantity": default_quantity(q, req)})
    lower = tiers and {c["product_id"] for c in tiers["basic"]["cart"]} != {c["product_id"] for c in tiers["recommended"]["cart"]}

    items = []
    rec_ids = tiers.get("recommended", {}).get("reasons", {})
    for pid, why in rec_ids.items():
        p = products[pid]
        need = next((n for n, c in per_need.items() if pid in [x.product_id for x in c]), None)
        cheaper = [q.product_id for q in per_need[need] if q.mid < p.mid] if need else []
        ev = evaluate(p, req, set(rec_ids), products)
        items.append({
            "product_id": pid, "why": why, "need": need, "status": ev["status"], "checks": ev["checks"],
            "cheaper_eligible_alternatives": cheaper,
            "additional_products_needed": [i for i in p.requires_one_of if i not in rec_ids],
        })
    return {
        "items": items, "tiers": tiers, "unmet_needs": unmet, "addons": addons[:6], "has_lower_cost": bool(lower),
        "no_match": not per_need,
        "no_match_message": (
            "No catalogue product matches your stated needs and business profile. "
            "A representative can review options with you." if not per_need else None),
    }
