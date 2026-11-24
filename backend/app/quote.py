"""Quote engine. All arithmetic lives here; the LLM never calculates prices.

Prices are per catalogue unit per month, excluding taxes. Where the catalogue gives a range we show
the range, and the single estimate is the midpoint (labelled as an estimate). One-time setup is
charged per unit (quantity x catalogue setup fee).
"""
from .catalogue import Product, Requirements, evaluate


def build_quote(products: dict[str, Product], cart: list[dict], req: Requirements) -> dict:
    cart_ids = {c["product_id"] for c in cart}
    items, issues, issue_items = [], [], []
    for c in cart:
        p = products.get(c["product_id"])
        if not p:
            issues.append(f"Unknown product {c['product_id']}")
            continue
        qty = max(1, int(c.get("quantity") or 1))
        ev = evaluate(p, req, cart_ids, products)
        bad = [x for x in ev["checks"] if x["status"] in ("fail", "missing")]
        if ev["status"] != "eligible":
            issues.append(f"{p.name}: " + "; ".join(x["detail"] for x in bad))
            issue_items.append({"product_id": p.product_id, "name": p.name,
                                "reasons": [{"code": x["code"], "params": x["params"]} for x in bad]})
        items.append({
            "product_id": p.product_id, "name": p.name, "unit": p.unit, "quantity": qty,
            "unit_price_min": p.price_min, "unit_price_max": p.price_max, "is_range": p.is_range,
            "monthly_min": p.price_min * qty, "monthly_max": p.price_max * qty, "monthly_mid": p.mid * qty,
            "setup": p.setup * qty, "contract_months": p.contract_months,
            "status": ev["status"], "checks": ev["checks"], "install_days": p.install_days,
        })
    t = lambda k: round(sum(i[k] for i in items), 2)
    monthly = {"min": t("monthly_min"), "max": t("monthly_max"), "mid": t("monthly_mid")}
    setup = t("setup")
    return {
        "items": items, "valid": bool(items) and not issues, "issues": issues, "issue_items": issue_items,
        "monthly": monthly, "setup_total": setup,
        "first_month": {k: round(v + setup, 2) for k, v in monthly.items()},
        "has_range": any(i["is_range"] for i in items),
        "max_contract_months": max([i["contract_months"] for i in items], default=0),
        "max_install_days": max([i["install_days"] for i in items], default=0),
        "currency": "INR", "tax_note": "Prices exclude applicable taxes.",
        "estimate_note": "Where a price range applies, the estimate is the midpoint of the range and is indicative only.",
    }
