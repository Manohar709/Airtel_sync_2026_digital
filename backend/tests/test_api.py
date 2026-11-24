"""End-to-end API test on a throwaway SQLite DB (Gemini disabled, OCR stubbed).

Run from backend/:  python -m tests.test_api
"""
import os
import sys
import tempfile
from pathlib import Path

tmp = Path(tempfile.mkdtemp())
os.environ.update(DATABASE_URL=f"sqlite:///{tmp / 't.db'}", GEMINI_API_KEY="", UPLOAD_DIR=str(tmp / "uploads"),
                  EMPLOYEE_EMAIL="staff@sync.test", EMPLOYEE_PASSWORD="Staff-Pass-123", RATE_LIMIT_PER_HOUR="1000")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from fastapi.testclient import TestClient  # noqa: E402
import setup_data  # noqa: E402
from app import kyc  # noqa: E402
from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402

setup_data.main()
DOCS = settings.data_path / "kyc_documents"
OCR_LINES = {  # clean OCR rows for K01 (as PaddleOCR returns them, merged per row)
    "gst_certificate": ["Specimen: GST Registration Certificate", "GSTIN 37IHKXV5167L1ZS",
                        "Legal name Neha Kaur (Prop. Vindhya Tours & Travels)", "Trade name Vindhya Tours & Travels",
                        "Constitution Proprietorship", "Address of principal Shop/Unit 1, Tech Park Road, Visakhapatnam, A",
                        "place of business ndhra Pradesh - 118383", "Date of liability 2025-06-07"],
    "signatory_id": ["Name", "Neha Kaur", "Designation Office admin", "For business Vindhya Tours & Travels",
                     "ID no. SYN-ID-346190", "Valid till 2028-03-26"],
    "address_proof": ["Consumer no. 9566781101", "Billed to Vindhya Tours & Travels",
                      "Supply address Shop/Unit 1, Tech Park Road, Visakhapatnam, Andhra Pradesh", "- 118383",
                      "Bill date 2026-06-11"],
}
_cur = {}
kyc.extract_text = lambda path: {"engine": "stub", "available": True, "confidence": 0.99, "lines": _cur["lines"]}
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, "" if cond else extra)
    if not cond:
        fails.append(name)


with TestClient(app) as c:  # runs startup (migrate + employee from env)
    def guest():
        return {"X-Guest-Token": c.post("/api/guest").json()["guest_token"]}

    def upload(h, dt, file, lines=None):
        _cur["lines"] = lines or []
        return c.post("/api/kyc/documents", data={"doc_type": dt},
                      files={"file": (file, (DOCS / file).read_bytes(), "image/png")}, headers=h)

    # --- guest journey ---
    G = guest()
    check("no session -> 401", c.get("/api/application").status_code == 401)
    for m in ["I run a travel agency in Visakhapatnam and want reliable internet and CCTV monitoring",
              "12 employees, 1 location", "yes we have GST", "broadband"]:
        r = c.post("/api/advisor/message", json={"message": m, "lang": "hi"}, headers=G).json()
    r = c.post("/api/advisor/message", json={"answer": {"field": "monthly_budget_inr", "value": "skip"}}, headers=G).json()
    a = r["application"]
    check("guest: requirements ready (quick-reply skip works)", a["ready"], a["missing"])
    check("guest: fallback flag + asked field stored", a["messages"][-1]["fallback"] is True)
    t = c.post("/api/cart/tier/recommended", headers=G).json()
    check("guest: recommended quote valid", t["quote"]["valid"], t["quote"]["issues"])
    q = c.put("/api/cart", json=[i for i in t["cart"] if i["product_id"] not in ("P01", "P02", "P04")], headers=G).json()["quote"]
    check("removing prerequisite -> structured issue codes", not q["valid"] and q["issue_items"][0]["reasons"][0]["code"] == "elig.prereq_missing", q["issue_items"])
    c.put("/api/cart", json=t["cart"], headers=G)
    check("guest cannot do KYC", c.get("/api/kyc", headers=G).status_code == 401)
    check("guest help needs phone", c.post("/api/help", json={"note": "x", "name": "Ravi"}, headers=G).status_code == 422)
    h = c.post("/api/help", json={"note": "Call me about CCTV", "name": "Ravi Kumar", "phone": "9876543210"}, headers=G)
    check("guest help accepted", h.status_code == 200 and h.json()["help"]["status"] == "open", h.text)

    # --- employee sees the live help request (draft) ---
    check("employee login rejects wrong email", c.post("/api/auth/employee/login", json={"email": "x@y.z", "password": "Staff-Pass-123"}).status_code == 401)
    E = {"Authorization": "Bearer " + c.post("/api/auth/employee/login", json={"email": "staff@sync.test", "password": "Staff-Pass-123"}).json()["token"]}
    s = c.get("/api/employee/summary", headers=E).json()
    check("live help queue count", s["queues"]["help"] == 1, s)
    rows = c.get("/api/employee/applications?queue=help", headers=E).json()["applications"]
    check("help row shows guest name + phone", rows and rows[0]["customer"] == "Ravi Kumar" and rows[0]["phone"] == "9876543210", rows)
    hid = rows[0]["id"]
    check("employee can open draft with help", c.get(f"/api/employee/applications/{hid}", headers=E).status_code == 200)
    check("help status -> in_progress", c.post(f"/api/employee/applications/{hid}/help", json={"status": "in_progress"}, headers=E).json()["help_status"] == "in_progress")

    # --- sign up merges guest work ---
    bad = c.post("/api/auth/signup", json={"name": "Ravi", "email": "ravi@x.in", "phone": "12345", "password": "longpassword"})
    check("signup validates phone", bad.status_code == 422)
    su = c.post("/api/auth/signup", json={"name": "Ravi Kumar", "email": "ravi@x.in", "phone": "9876543210",
                                          "password": "longpassword", "guest_token": G["X-Guest-Token"]}).json()
    H = {"Authorization": "Bearer " + su["token"]}
    a = c.get("/api/application", headers=H).json()
    check("guest chat + cart merged into account", a["id"] == hid and len(a["cart"]) > 0 and not a["is_guest"], a["id"])
    check("customer blocked from employee API", c.get("/api/employee/applications", headers=H).status_code == 403)
    check("employee token blocked from customer API", c.get("/api/application", headers=E).status_code == 403)

    # --- KYC with GSTIN (K01: Cancelled in registry) ---
    check("upload blocked without consent", upload(H, "gst_certificate", "K01_gst_certificate.png").status_code == 403)
    k = c.put("/api/kyc/identifiers", json={"consent": True}, headers=H).json()
    check("consent without mode -> mode.missing", k["checks"][0]["code"] == "mode.missing")
    k = c.put("/api/kyc/identifiers", json={"consent": True, "mode": "gstin", "gstin": "37IHKXV5167L1ZS"}, headers=H).json()
    st = {x["id"]: x for x in k["checks"]}
    check("K01 GSTIN Cancelled -> action_required + code", st["gstin_registry"]["status"] == "action_required" and st["gstin_registry"]["code"] == "gstin_registry.inactive")
    check("docs requested immediately", k["required_documents"] == ["gst_certificate", "signatory_id", "address_proof"])
    check("identifiers masked", "37IHKXV5167L1ZS" not in str(k))
    for dt, f in [("gst_certificate", "K01_gst_certificate.png"), ("signatory_id", "K01_signatory_id.png"), ("address_proof", "K01_address_proof.png")]:
        k = upload(H, dt, f, OCR_LINES[dt]).json()
    st = {x["id"]: x["status"] for x in k["checks"]}
    check("K01 docs consistent; signatory = manual review", st["gst_doc_name"] == "verified" and st["bill_date"] == "verified" and st["signatory"] == "needs_manual_review", st)
    c2 = c.post("/api/auth/signup", json={"name": "Other", "email": "o@x.in", "phone": "9123456780", "password": "longpassword"}).json()
    H2 = {"Authorization": "Bearer " + c2["token"]}
    check("ownership: other customer can't read doc", c.get(f"/api/documents/{k['documents'][0]['id']}/file", headers=H2).status_code == 404)
    sub = c.post("/api/application/submit", headers=H)
    check("submit allowed with action_required because help was requested", sub.status_code == 200, sub.text)
    o = c.get("/api/orders", headers=H).json()["orders"]
    check("orders: timeline + expected activation", o[0]["status"] == "submitted" and o[0]["expected_activation"] and any(e["kind"] == "submitted" for e in o[0]["events"]), o[0])
    check("new working draft after submit", c.get("/api/application", headers=H).json()["id"] != hid)

    # --- business with neither GST nor Udyam (customer 2) ---
    for m in ["I have a small kirana store in Jaipur, 3 staff, one shop. Need internet and billing", "no GST", "mobile hotspot", "skip"]:
        r = c.post("/api/advisor/message", json={"message": m}, headers=H2).json()
    check("no-GST profile ready", r["application"]["ready"], r["application"]["missing"])
    rec = c.get("/api/recommendations", headers=H2).json()
    gst_items = [pid for t in rec["tiers"].values() for pid in t["reasons"] if rec["products"][pid]["requires_gstin"]]
    check("no GSTIN products recommended to no-GST shop", not gst_items, gst_items)
    c.post("/api/cart/tier/recommended", headers=H2)
    k = c.put("/api/kyc/identifiers", json={"consent": True, "mode": "none", "business_name": "Shree Ram Kirana"}, headers=H2).json()
    check("mode none: only ID + address proof", k["required_documents"] == ["signatory_id", "address_proof"])
    check("mode none: registration -> employee review", any(x["code"] == "registration.none" and x["status"] == "needs_manual_review" for x in k["checks"]))
    check("submit blocked until docs uploaded", c.post("/api/application/submit", headers=H2).status_code == 422)
    c.put("/api/cart", json=[{"product_id": "P05", "quantity": 1}], headers=H2)
    k = c.get("/api/kyc", headers=H2).json()
    check("GSTIN product in cart -> gstin_required", any(x["code"] == "gstin_required" for x in k["checks"]))
    c.post("/api/cart/tier/recommended", headers=H2)

    # --- blurry K04 ---
    c.put("/api/kyc/identifiers", json={"consent": True, "mode": "gstin", "gstin": "08YKZXS5189L1ZO"}, headers=H2)
    k = upload(H2, "gst_certificate", "K04_gst_certificate.png").json()
    check("blurry K04 -> doc.unclear", any(x["code"] == "doc.unclear" and x["status"] == "action_required" for x in k["checks"]))
    check("bad file type rejected", c.post("/api/kyc/documents", data={"doc_type": "signatory_id"},
                                           files={"file": ("x.exe", b"MZ", "application/octet-stream")}, headers=H2).status_code == 422)

    # --- login + resume ---
    lg = c.post("/api/auth/login", json={"email": "ravi@x.in", "password": "longpassword"})
    check("returning customer login", lg.status_code == 200)
    check("employee email cannot use customer login", c.post("/api/auth/login", json={"email": "staff@sync.test", "password": "Staff-Pass-123"}).status_code == 401)

    # --- employee actions ---
    lst = c.get("/api/employee/applications?queue=new", headers=E).json()["applications"]
    check("submitted app in New queue", any(r["id"] == hid for r in lst))
    check("illegal status jump rejected", c.post(f"/api/employee/applications/{hid}/status", json={"status": "ready_for_activation"}, headers=E).status_code == 409)
    check("valid status change", c.post(f"/api/employee/applications/{hid}/status", json={"status": "in_review"}, headers=E).status_code == 200)
    o = c.get("/api/orders", headers=H).json()["orders"]
    check("customer timeline shows in_review", any(e["status"] == "in_review" for e in o[0]["events"]))
    check("employee summary (fallback)", "Suggested next action" in c.post(f"/api/employee/applications/{hid}/summary", headers=E).json()["summary"])
    check("voice rejects empty audio", c.post("/api/voice/transcribe", data={"lang": "hi"}, files={"audio": ("a.webm", b"x", "audio/webm")}, headers=H).status_code == 422)
    check("catalogue i18n (en passthrough)", len(c.get("/api/i18n/catalogue?lang=en").json()["descriptions"]) == 25)

print("FAILED: " + ", ".join(fails) if fails else "ALL PASSED")
