"""Evaluate every applicant K01-K12 end to end from saved OCR results; print non-verified checks per applicant."""
import csv, json, sys
from types import SimpleNamespace
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import kyc
from app.config import settings

R = json.load(open(sys.argv[1], encoding="utf-8"))
D = settings.data_path
G = list(csv.DictReader(open(D / "mock_gstin_registry.csv", encoding="utf-8")))
U = list(csv.DictReader(open(D / "mock_udyam_registry.csv", encoding="utf-8")))


class FakeDB:  # minimal db.get for registry lookups
    def get(self, model, key):
        rows = G if model.__name__ == "RefGstin" else U
        k = "gstin" if model.__name__ == "RefGstin" else "udyam_number"
        r = next((x for x in rows if x[k] == key), None)
        return SimpleNamespace(**{**r, "principal_place_of_business": r.get("principal_place_of_business")}) if r else None


out = {}
for app_id in [f"K{i:02d}" for i in range(1, 13)]:
    docs, names = [], []
    for fn, v in R.items():
        if fn.startswith(app_id):
            docs.append(SimpleNamespace(doc_type=v["doc_type"], quality=v["quality"],
                                        extracted={"available": v["available"], "fields": kyc.parse_fields(v["doc_type"], v["lines"])}))
            names.append(v["doc_type"])
    sig = next(d for d in docs if d.doc_type == "signatory_id").extracted["fields"]
    biz = sig.get("business", "")
    # the identifier the customer would type: registry record of the business named on the signatory ID
    g = next((x["gstin"] for x in G if x["trade_name"] == biz and sig.get("name", "") in x["legal_name"]), None) or \
        next((x["gstin"] for x in G if x["trade_name"] == biz), None)
    u = next((x["udyam_number"] for x in U if x["enterprise_name"] == biz), None)
    mode = "both" if g and u and "udyam_certificate" in names else "gstin" if g else "udyam" if u else "none"
    res = kyc.evaluate_kyc(FakeDB(), {"consent": True, "mode": mode, "gstin": g, "udyam": u}, docs, [], biz)
    issues = [(c["id"], c["status"], c["code"]) for c in res["checks"] if c["status"] != "verified"]
    out[app_id] = {"mode": mode, "overall": res["overall"], "issues": issues}
    print(app_id, mode, res["overall"], [f"{i}:{s[:6]}:{c}" for i, s, c in issues])
json.dump(out, open(sys.argv[1].replace("ocr_results", "kyc_table"), "w"), indent=1)
