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
    # starting plan from a single fact (relevance from what similar businesses asked for)
    G0 = guest()
    r0 = c.post("/api/advisor/message", json={"message": "I run a salon", "lang": "en"}, headers=G0).json()["application"]
    rec0 = c.get("/api/recommendations", headers=G0).json()
    check("one fact -> starting plan with a price", r0["has_plan"] and not r0["ready"] and rec0["tiers"]
          and rec0["needs_source"] == "similar" and rec0["tiers"][rec0["start_tier"]]["quote"]["monthly"]["mid"] > 0, rec0.get("needs_used"))
    pl = c.post("/api/cart/plan", json={"base": rec0["start_tier"], "addons": []}, headers=G0)
    check("starting plan can be priced and put in the cart", pl.status_code == 200 and pl.json()["quote"]["items"])
    for m in ["I run a travel agency in Visakhapatnam and want reliable internet and CCTV monitoring",
              "12 employees, 1 location", "yes we have GST", "broadband"]:
        r = c.post("/api/advisor/message", json={"message": m, "lang": "hi"}, headers=G).json()
    r = c.post("/api/advisor/message", json={"answer": {"field": "monthly_budget_inr", "value": "skip"}}, headers=G).json()
    a = r["application"]
    check("guest: requirements ready (quick-reply skip works)", a["ready"], a["missing"])
    check("guest: quick reply answered without the model, no repeat", a["messages"][-1]["quick"] is True and a["messages"][-1]["fallback"] is False)
    check("guest: typed turn in basic mode flagged", a["messages"][-3]["fallback"] is True)
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
    k = c.put("/api/kyc/consent", json={"consent": True}, headers=H).json()
    gst_needed = bool(k["gstin_products"])
    check("auto: nothing typed; GST certificate required only for GSTIN products",
          ("gst_certificate" in k["required_documents"]) == gst_needed and "udyam_certificate" in k["optional_documents"]
          and {"signatory_id", "address_proof"} <= set(k["required_documents"]), k["required_documents"])
    k = c.post("/api/kyc/demo/K03", headers=H).json()
    check("sample K03 loaded; numbers read from certificates", k["gstin_masked"] and k["registry"].get("gstin")
          and all(x["code"] != "doc.not_uploaded" for x in k["checks"]), [x["code"] for x in k["checks"] if x["status"] != "verified"])
    check("sample loader rejects unknown codes", c.post("/api/kyc/demo/K99", headers=H).status_code == 404)
    k = c.put("/api/kyc/identifiers", json={"consent": True, "mode": "gstin", "gstin": "37IHKXV5167L1ZS"}, headers=H).json()
    st = {x["id"]: x for x in k["checks"]}
    check("K01 GSTIN Cancelled -> team hold + code", st["gstin_registry"]["status"] == "needs_manual_review" and st["gstin_registry"]["code"] == "gstin_registry.inactive" and k["verdict"] == "hold")
    check("docs requested immediately", k["required_documents"] == ["gst_certificate", "signatory_id", "address_proof"])
    check("identifiers masked", "37IHKXV5167L1ZS" not in str(k))
    for dt, f in [("gst_certificate", "K01_gst_certificate.png"), ("signatory_id", "K01_signatory_id.png"), ("address_proof", "K01_address_proof.png")]:
        k = upload(H, dt, f, OCR_LINES[dt]).json()
    st = {x["id"]: x["status"] for x in k["checks"]}
    check("K01 docs consistent; owner signs", st["gst_doc_name"] == "verified" and st["bill_date"] == "verified" and st["signatory"] == "verified", st)
    check("phone OTP required", st["phone"] == "pending")
    o = c.post("/api/kyc/otp/send", json={"phone": "9876543210"}, headers=H).json()
    check("OTP sent (demo code shown)", o["sent"] and len(o["demo_code"]) == 6)
    bad = c.post("/api/kyc/otp/verify", json={"code": "000000" if o["demo_code"] != "000000" else "111111"}, headers=H)
    check("wrong OTP rejected", bad.status_code == 422)
    k = c.post("/api/kyc/otp/verify", json={"code": o["demo_code"]}, headers=H).json()
    check("OTP verified", k["phone_verified"] and "9876543210" not in str(k))
    d = c.post("/api/kyc/digilocker/start", headers=H).json()
    check("DigiLocker rejects full Aadhaar", c.post("/api/kyc/digilocker", json={"name": "Neha Kaur", "aadhaar_last4": "123456789012", "code": d["demo_code"]}, headers=H).status_code == 422)
    k = c.post("/api/kyc/digilocker", json={"name": "Neha Kaur", "aadhaar_last4": "4321", "code": d["demo_code"]}, headers=H).json()
    check("DigiLocker verified, ID photo no longer required", k["digilocker"]["last4"] == "4321" and "signatory_id" not in k["required_documents"])
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
    check("mode none: not sent to the team by default", any(x["code"] == "registration.self_declared" and x["status"] == "verified" for x in k["checks"]))
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
    lst = c.get("/api/employee/applications?queue=kyc", headers=E).json()["applications"]
    check("held app in KYC queue", any(r["id"] == hid for r in lst))
    work = c.get("/api/employee/applications?queue=work", headers=E).json()["applications"]
    check("work queue ranked, help first", work and work[0]["task"]["kind"] == "help", [w["task"] for w in work])
    st = lambda body: c.post(f"/api/employee/applications/{hid}/status", json=body, headers=E)
    check("illegal status jump rejected", st({"status": "live"}).status_code == 409)
    check("valid status change", st({"status": "in_review"}).status_code == 200)
    o = c.get("/api/orders", headers=H).json()["orders"]
    check("customer timeline shows in_review", any(e["status"] == "in_review" for e in o[0]["events"]))
    check("ask customer needs a message", st({"status": "awaiting_customer"}).status_code == 422)
    check("approve", st({"status": "approved"}).status_code == 200)
    o = c.get("/api/orders", headers=H).json()["orders"][0]
    check("customer next action = sign", o["tracking"]["next_action"]["code"] == "sign")
    check("employee cannot confirm for customer", st({"status": "confirmed"}).status_code == 409)
    d = c.post(f"/api/orders/{hid}/esign/start", headers=H).json()
    fail = c.post(f"/api/orders/{hid}/confirm", json={"code": d["demo_code"], "upi_app": "GPay", "simulate_failure": True}, headers=H)
    check("failed AutoPay holds the order", fail.status_code == 402 and c.get("/api/orders", headers=H).json()["orders"][0]["status"] == "approved")
    ok = c.post(f"/api/orders/{hid}/confirm", json={"code": d["demo_code"], "upi_app": "PhonePe"}, headers=H)
    check("e-sign + AutoPay confirms the order", ok.status_code == 200 and ok.json()["status"] == "confirmed", ok.text[:200])
    check("schedule needs a slot", st({"status": "scheduled"}).status_code == 422)
    import datetime as _dt
    day = (_dt.date.today() + _dt.timedelta(days=2)).isoformat()
    r = st({"status": "scheduled", "date": day, "window": "11:00-13:00"}).json()
    check("technician scheduled", r["tracking"]["slot"]["date"] == day and r["tracking"]["slot"]["technician"])
    check("call logged", c.post(f"/api/employee/applications/{hid}/call", json={"outcome": "reached", "note": "Confirmed visit"}, headers=E).json()["notes"][-1]["kind"] == "call")
    st({"status": "installed"}); r = st({"status": "live"}).json()
    o = c.get("/api/orders", headers=H).json()["orders"][0]
    check("order live; all stages done", o["status"] == "live" and all(x["done"] for x in o["tracking"]["stages"]), o["tracking"]["stages"])
    check("per-service ETAs", all(x["eta"] for x in o["tracking"]["services"]))
    check("employee summary (fallback)", "Suggested next action" in c.post(f"/api/employee/applications/{hid}/summary", headers=E).json()["summary"])
    check("voice rejects empty audio", c.post("/api/voice/transcribe", data={"lang": "hi"}, files={"audio": ("a.webm", b"x", "audio/webm")}, headers=H).status_code == 422)
    check("catalogue i18n (en passthrough)", len(c.get("/api/i18n/catalogue?lang=en").json()["descriptions"]) == 25)

print("FAILED: " + ", ".join(fails) if fails else "ALL PASSED")
