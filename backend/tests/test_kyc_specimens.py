"""Smart KYC on the 12 specimen applicants (K01-K12) from the case pack.

Uses OCR text saved by scripts/ocr_specimens.py (PaddleOCR is slow on CPU), then runs the real KYC engine
against the mock registries in the configured database, acting as each customer would: consent, verified mobile,
the GSTIN / Udyam number copied from their certificate, and their photos uploaded.

Run from backend/:  python -m tests.test_kyc_specimens      (add -v to print every check)
"""
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from app import kyc
from app.db import SessionLocal
from app.models import RefGstin, RefUdyam

# Answer key: the planted problem in each applicant and the decision it should get.
EXPECTED = {
    "K01": ("hold", "GSTIN cancelled in registry; Udyam number blank"),
    "K02": ("pass", "photo tilted ~7 degrees, straightened"),
    "K03": ("pass", "clean"),
    "K04": ("ask", "GST certificate too blurred"),
    "K05": ("ask", "Udyam certificate missing"),
    "K06": ("hold", "GSTIN digit changed (8 vs 5); checksum fails"),
    "K07": ("hold", "legal name edited vs registry"),
    "K08": ("pass", "printed 0 for O; corrected"),
    "K09": ("pass", "clean"),
    "K10": ("pass", "OCR I for J; corrected, registry confirms"),
    "K11": ("ask", "electricity bill 257 days old"),
    "K12": ("pass", "clean"),
}
OCR = Path(__file__).with_name("ocr_results.json")


def applicant_docs(results: dict, kid: str) -> list:
    docs = []
    for name, r in results.items():
        if not name.startswith(kid + "_"):
            continue
        ex = {"available": r["available"], "lines": r["lines"], "tilt_deg": r.get("tilt_deg"),
              "fields": kyc.parse_fields(r["doc_type"], r["lines"]) if r["available"] else {}}
        if r["quality"]["blurry"] or r["quality"]["low_resolution"]:
            ex = {"available": False, "lines": [], "fields": {}}
        docs.append(SimpleNamespace(doc_type=r["doc_type"], extracted=ex, quality=r["quality"]))
    return docs


def customer_state(db, docs: list) -> dict:
    f = {d.doc_type: d.extracted.get("fields", {}) for d in docs}
    gstin = (f.get("gst_certificate") or {}).get("gstin")
    udyam = (f.get("udyam_certificate") or {}).get("udyam")
    if not udyam and gstin and db.get(RefGstin, gstin):  # no readable certificate: the owner knows their number
        g = db.get(RefGstin, gstin)
        u = db.query(RefUdyam).filter(RefUdyam.enterprise_name == g.trade_name).all()
        u = [x for x in u if x.city.lower() in g.principal_place_of_business.lower()]
        udyam = u[0].udyam_number if u else None
    return {"consent": True, "phone_verified": True, "mode": "both", "gstin": gstin, "udyam": udyam}


def main(verbose: bool = False) -> int:
    results = json.loads(OCR.read_text(encoding="utf-8"))
    right = 0
    with SessionLocal() as db:
        for kid, (want, why) in EXPECTED.items():
            docs = applicant_docs(results, kid)
            res = kyc.evaluate_kyc(db, customer_state(db, docs), docs, [], None)
            got = res["verdict"]
            right += got == want
            flags = [f"{c['code']}({c['status'][:4]})" for c in res["checks"] if c["status"] != kyc.V]
            fixed = res.get("self_fixed") or []
            print(f"{'OK ' if got == want else 'XX '} {kid} want={want:<4} got={got:<4} | {why}")
            print(f"      flags: {', '.join(flags) or '-'}" + (f" | self-fixed: {', '.join(fixed)}" if fixed else ""))
            if verbose:
                for c in res["checks"]:
                    print(f"        {c['status'][:6]:<6} {c['code']:<28} {c['detail'][:110]}")
    print(f"\n{right}/12 verdicts correct")
    return 0 if right == 12 else 1


if __name__ == "__main__":
    sys.exit(main("-v" in sys.argv))
