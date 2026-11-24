"""KYC readiness engine (prototype).

Four separate stages, all deterministic - no LLM involved and nothing here claims official
verification or document authenticity:
  1 extraction          (PaddleOCR text + simple image-quality check)
  2 format validation   (GSTIN structure + checksum, Udyam structure; dataset rules)
  3 registry lookup     (supplied mock registries only)
  4 consistency checks  (name / address / dates, with tolerance; mismatches -> review, not rejection)

Dataset-specific rules (not universal legal rules): GSTIN embedded-PAN 4th char may be 'X';
Udyam district code '00' is accepted; address-proof freshness is measured against KYC_REFERENCE_DATE.
"""
import re
from datetime import date, datetime
from pathlib import Path
import numpy as np
from PIL import Image
from rapidfuzz import fuzz
from sqlalchemy.orm import Session
from .config import settings
from .models import RefGstin, RefUdyam

V, AR, MR, PEND, UNV = "verified", "action_required", "needs_manual_review", "pending", "unable_to_verify"
SEVERITY = {AR: 5, MR: 4, UNV: 3, PEND: 2, V: 1}
ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
GSTIN_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
UDYAM_RE = re.compile(r"^UDYAM-[A-Z]{2}-\d{2}-\d{7}$")
DOC_LABELS = {"gst_certificate": "GST registration certificate", "udyam_certificate": "Udyam certificate",
              "signatory_id": "Authorised signatory ID", "address_proof": "Address proof (electricity bill)"}


# ---------- masking ----------
def mask(v: str | None) -> str | None:
    if not v:
        return v
    return v[:2] + "*" * max(len(v) - 5, 3) + v[-3:]


# ---------- stage 2: format validation ----------
def gstin_checksum_ok(g: str) -> bool:
    total = 0
    for i, ch in enumerate(g[:14]):
        prod = ALPHA.index(ch) * (1 if i % 2 == 0 else 2)
        total += prod // 36 + prod % 36
    return ALPHA[(36 - total % 36) % 36] == g[14]


def validate_gstin(g: str) -> tuple[bool, str]:
    g = (g or "").strip().upper()
    if len(g) != 15 or not GSTIN_RE.match(g):
        return False, "GSTIN must be 15 characters in the standard GSTIN structure"
    if not gstin_checksum_ok(g):
        return False, "GSTIN check character does not match (possible typo)"
    return True, "Structure and check character are valid"


def validate_udyam(u: str) -> tuple[bool, str]:
    if not UDYAM_RE.match((u or "").strip().upper()):
        return False, "Udyam number must look like UDYAM-XX-00-0000000"
    return True, "Structure is valid"


# ---------- stage 1: extraction ----------
_ocr = None


def _get_ocr():
    global _ocr
    if _ocr is None:
        from paddleocr import PaddleOCR  # heavy import, loaded lazily
        try:
            # enable_mkldnn=False: Paddle 3.x oneDNN path raises NotImplementedError on Windows CPU
            _ocr = PaddleOCR(use_doc_orientation_classify=False, use_doc_unwarping=False,
                             use_textline_orientation=False, lang="en", enable_mkldnn=False)
        except TypeError:  # PaddleOCR 2.x
            _ocr = PaddleOCR(use_angle_cls=False, lang="en", show_log=False)
    return _ocr


def _boxes(raw) -> list[tuple]:
    """(text, score, cx, cy, height, angle) per detected text line."""
    out = []
    first = raw[0] if raw else None
    if isinstance(first, dict) or hasattr(first, "get"):  # PaddleOCR 3.x
        polys = first.get("rec_polys") if first.get("rec_polys") is not None else first.get("dt_polys", [])
        pairs = zip(first.get("rec_texts", []), first.get("rec_scores", []), polys)
    elif first:  # 2.x: [[box, (text, score)], ...]
        pairs = ((t, s, box) for box, (t, s) in first)
    else:
        pairs = []
    for t, sc, poly in pairs:
        pts = np.asarray(poly, dtype=float)
        w = np.hypot(*(pts[1] - pts[0])) if len(pts) >= 2 else 0
        ang = float(np.arctan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0])) if len(pts) >= 2 else 0.0
        h = max(pts[:, 1].max() - pts[:, 1].min() - abs(np.sin(ang)) * w, 8.0)
        out.append((t, float(sc), pts[:, 0].mean(), pts[:, 1].mean(), h, ang, w))
    return out


def _rows(items) -> list[str]:
    """Merge boxes on the same visual row into one line ('Label value'), top to bottom.

    Rows are grouped in a de-skewed frame (median angle of wide boxes) so tilted scans still pair labels and values."""
    wide = [b[5] for b in items if b[6] > 3 * b[4]]
    ang = float(np.median(wide)) if wide else 0.0
    c, s_ = np.cos(-ang), np.sin(-ang)
    rot = [(b[0], b[2] * c - b[3] * s_, b[2] * s_ + b[3] * c, b[4]) for b in items]  # (text, x', y', h)
    rot.sort(key=lambda r: r[2])
    rows, cur, cur_y = [], [], None
    for r in rot:
        if cur and abs(r[2] - cur_y) > 0.6 * r[3]:
            rows.append(cur)
            cur = []
        cur.append(r)
        cur_y = r[2] if len(cur) == 1 else cur_y
    if cur:
        rows.append(cur)
    lines = [" ".join(x[0] for x in sorted(row, key=lambda x: x[1])) for row in rows]
    return [ln for ln in (strip_watermark(x) for x in lines) if ln]


# Fragments of the diagonal 'SYNTHETIC SPECIMEN - NOT A VALID DOCUMENT' watermark that survive cleaning
_WM = re.compile(r"\b(?:S?Y?N?T?H?ETIC|S?P?E?C?IME[NR]|[EFC]?CIMEN|NOT\s+A\s+VA\w*|A\s+VALID\s+DO\w*|VALID\s+DO\w*|"
                 r"LID\s+DO|DO[CZ]U\w*|HET)\b(?:\s*-\s*NO\b)?", re.I)


def strip_watermark(line: str) -> str:
    out = _WM.sub(" ", line)
    out = re.sub(r"^\s*-\s*NO\b", " ", out)
    return re.sub(r"\s{2,}", " ", out).strip(" -") if out.strip() != line.strip() else line.strip()


def image_quality(path: str) -> dict:
    im = Image.open(path)
    a = np.asarray(im.convert("L"), dtype=float)
    lap = 4 * a[1:-1, 1:-1] - a[:-2, 1:-1] - a[2:, 1:-1] - a[1:-1, :-2] - a[1:-1, 2:]
    var = float(lap.var())
    # Threshold calibrated on the supplied specimens: legible ones score ~900+, the blurred one ~1.
    return {"width": im.width, "height": im.height, "sharpness": round(var, 1),
            "blurry": var < 100, "low_resolution": im.width < 600}


def _clean_image(path: str) -> np.ndarray:
    """Remove light-red diagonal watermarks ('SYNTHETIC SPECIMEN') that cover fields; document text is dark ink.

    Returns a BGR array for PaddleOCR."""
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    reddish = (r - np.minimum(g, b) > 12) & (r > 120)  # watermark + its anti-aliased edges; dark ink untouched
    a[reddish] = 255
    return a[..., ::-1].astype(np.uint8).copy()


def extract_text(path: str) -> dict:
    try:
        ocr = _get_ocr()
    except Exception as e:  # not installed / failed to load
        return {"engine": "paddleocr", "available": False, "lines": [], "confidence": None,
                "error": f"OCR engine unavailable: {type(e).__name__}"}
    try:
        img = _clean_image(path)
        raw = ocr.predict(img) if hasattr(ocr, "predict") else ocr.ocr(img, cls=False)
        items = _boxes(raw)
        conf = float(np.mean([i[1] for i in items])) if items else 0.0
        return {"engine": "paddleocr", "available": True, "lines": _rows(items), "confidence": round(conf, 3)}
    except Exception as e:
        return {"engine": "paddleocr", "available": False, "lines": [], "confidence": None,
                "error": f"OCR failed: {type(e).__name__}"}


# ---------- stage 1b: field parsing ----------
LABELS = {
    "gst_certificate": {"gstin": r"gstin", "legal_name": r"legal name", "trade_name": r"trade name",
                        "constitution": r"constitution", "address": r"address of principal",
                        "addr2": r"place of business", "date": r"date of liability", "type": r"type of registration"},
    "udyam_certificate": {"udyam": r"udyam reg\.? number", "name": r"enterprise name", "activity": r"major activity",
                          "city": r"city", "state": r"state", "date": r"date of registration"},
    "signatory_id": {"name": r"name", "designation": r"designation", "business": r"for business",
                     "id_no": r"id no\.?", "valid_till": r"valid till"},
    "address_proof": {"consumer": r"consumer no\.?", "billed_to": r"billed to", "address": r"supply address",
                      "date": r"bill date", "units": r"units consumed", "amount": r"amount due"},
}
REQUIRED_FIELDS = {
    "gst_certificate": ["gstin", "legal_name", "address"], "udyam_certificate": ["udyam", "name"],
    "signatory_id": ["name", "valid_till"], "address_proof": ["billed_to", "address", "date"],
}
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _grab(lines: list[str], doc_type: str, key: str) -> str | None:
    labels = LABELS[doc_type]
    pat = re.compile(rf"^\s*{labels[key]}\s*[:\-]?\s*(.*)$", re.I)
    other = [re.compile(rf"^\s*{p}\b", re.I) for k, p in labels.items() if k != key]
    for i, ln in enumerate(lines):
        m = pat.match(ln)
        if not m:
            continue
        rest = m.group(1).strip()
        if rest:
            return rest
        nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
        return nxt if nxt and not any(o.match(nxt) for o in other) else None
    return None


def parse_fields(doc_type: str, lines: list[str]) -> dict:
    text = "\n".join(lines)
    f = {k: _grab(lines, doc_type, k) for k in LABELS[doc_type]}
    if doc_type == "gst_certificate":
        # any 15-char token that has the GSTIN shape once common OCR confusions (O/0, S/5, ...) are undone
        cands = [fix_gstin_ocr(tok) for tok in re.findall(r"\b[A-Z0-9]{15}\b", text.upper())]
        f["gstin"] = next((c for c in cands if GSTIN_RE.match(c)), None)
        a, b = f.pop("address", None), f.pop("addr2", None)
        if a and b:
            f["address"] = a + ("" if a[-1].isalpha() and b[:1].islower() else " ") + b
        else:
            f["address"] = a or b
        if f.get("legal_name") and GSTIN_RE.match(fix_gstin_ocr(f["legal_name"].replace(" ", ""))):
            f.pop("legal_name")  # skewed scan put the GSTIN on the legal-name row
    elif doc_type == "udyam_certificate":
        m = re.search(r"UDYAM\s*-?\s*([A-Z]{2})\s*-?\s*([0-9O]{2})\s*-?\s*([0-9O]{7})", text.upper())
        f["udyam"] = f"UDYAM-{m.group(1)}-{m.group(2).replace('O', '0')}-{m.group(3).replace('O', '0')}" if m else None
    elif doc_type == "address_proof":
        dm = DATE_RE.search(f.get("date") or "") or DATE_RE.search(text)
        f["date"] = dm.group(0) if dm else None
        for i, ln in enumerate(lines):
            if re.match(r"^\s*supply address", ln, re.I) and i + 1 < len(lines) and re.match(r"^\s*-?\s*\d{5,6}\b", lines[i + 1]):
                f["address"] = (f["address"] or "") + " " + lines[i + 1].strip()
    elif doc_type == "signatory_id":
        f["valid_till"] = (DATE_RE.search(f["valid_till"] or "") or [None])[0]
    return {k: (v.strip() if isinstance(v, str) else v) for k, v in f.items() if v}


# ---------- OCR-tolerant identifier comparison ----------
_TO_DIGIT = str.maketrans({"O": "0", "D": "0", "Q": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "B": "8", "G": "6"})
_TO_ALPHA = str.maketrans({"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G"})
GSTIN_SHAPE = "DDAAAAADDDDAXZX"  # D digit, A letter, X any


def fix_gstin_ocr(v: str) -> str:
    v = re.sub(r"[^A-Z0-9]", "", (v or "").upper())
    if len(v) != 15:
        return v
    return "".join(ch.translate(_TO_DIGIT) if k == "D" else ch.translate(_TO_ALPHA) if k == "A" else ch
                   for ch, k in zip(v, GSTIN_SHAPE))


def edit_distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def compare_id(doc_value: str, entered: str, gstin: bool) -> str:
    """'match' | 'near' (likely an OCR misread - review) | 'mismatch'."""
    d = fix_gstin_ocr(doc_value) if gstin else re.sub(r"\s", "", (doc_value or "").upper()).replace("O", "0")
    e = entered if gstin else entered.replace("O", "0")
    if d == e:
        return "match"
    return "near" if edit_distance(d, e) <= 2 else "mismatch"


# ---------- stage 3 + 4: lookup and consistency ----------
def norm(s: str | None) -> str:
    s = re.sub(r"\(prop\.?[^)]*\)", " ", (s or "").lower())
    return re.sub(r"[^a-z0-9 ]+", " ", s).strip()


def name_score(a: str | None, b_list: list[str]) -> float:
    return max((fuzz.token_set_ratio(norm(a), norm(b)) for b in b_list if b), default=0)


def addr_score(a: str | None, b: str | None) -> float:
    return fuzz.partial_ratio(norm(a), norm(b)) if a and b else 0


def parse_date(s: str | None) -> date | None:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date() if s else None
    except ValueError:
        return None


def chk(cid, stage, label, status, detail, doc_type=None, code=None, **params):
    return {"id": cid, "stage": stage, "label": label, "status": status, "detail": detail, "doc_type": doc_type,
            "code": code or cid, "params": params}


def _name_check(cid, label, doc_name, ref_names, doc_type):
    s = name_score(doc_name, ref_names)
    if s >= 85:
        return chk(cid, "consistency", label, V, f"Matches the reference record (similarity {s:.0f}%)", doc_type,
                   "name.match", score=round(s))
    if s >= 50:
        return chk(cid, "consistency", label, MR,
                   f"'{doc_name}' differs from the reference name (similarity {s:.0f}%). Spelling variations are "
                   "allowed, so an employee will review it.", doc_type, "name.differs", name=doc_name, score=round(s))
    return chk(cid, "consistency", label, AR,
               f"'{doc_name}' does not appear to match the reference name. Correct the document or request help.",
               doc_type, "name.mismatch", name=doc_name)


MODES = ("gstin", "udyam", "both", "none")


def _number_check(cid, label, result, doc_type):
    if result == "match":
        return chk(cid, "consistency", label, V, "Matches the number you entered", doc_type, "number.match")
    if result == "near":
        return chk(cid, "consistency", label, MR, "Almost identical to the number you entered; one or two characters "
                   "may have been misread. An employee will confirm.", doc_type, "number.near")
    return chk(cid, "consistency", label, AR, "The number on the document differs from the one entered", doc_type,
               "number.mismatch")


def evaluate_kyc(db: Session, state: dict, docs: list, gstin_products: list[str], business_name: str | None) -> dict:
    """state: {consent, mode, gstin, udyam, business_name}; docs: Document rows (doc_type, extracted, quality).

    mode: gstin | udyam | both | none. 'none' = business without GST/Udyam registration: registry steps are
    skipped, only signatory ID + address proof are requested, registration goes to employee review."""
    ref = parse_date(settings.kyc_reference_date) or date.today()
    base = {"registry": {}, "reference_date": str(ref), "required_documents": [],
            "note": "Prototype checks against supplied mock data only. "
                    "Not an official verification and not proof of document authenticity."}
    if not state.get("consent"):
        return {**base, "overall": PEND, "checks": [chk("consent", "format", "Consent", PEND,
                "Consent is required before identifiers and documents are collected", code="consent.required")]}
    mode = state.get("mode") if state.get("mode") in MODES else None
    checks = []
    if not mode:
        return {**base, "overall": PEND, "checks": [chk("mode", "format", "Registration type", PEND,
                "Choose whether you have a GSTIN, a Udyam number, both, or neither", code="mode.missing")]}

    gstin = (state.get("gstin") or "").strip().upper() if mode in ("gstin", "both") else ""
    udyam = (state.get("udyam") or "").strip().upper() if mode in ("udyam", "both") else ""
    own_name = (state.get("business_name") or "").strip() or business_name
    g_rec = u_rec = None
    registry = {}

    # stage 2 + 3: identifiers
    if mode in ("gstin", "both") and not gstin:
        checks.append(chk("gstin_format", "format", "GSTIN", PEND, "Enter your GSTIN", code="gstin.missing"))
    if mode in ("udyam", "both") and not udyam:
        checks.append(chk("udyam_format", "format", "Udyam number", PEND, "Enter your Udyam number", code="udyam.missing"))
    if gstin:
        ok, msg = validate_gstin(gstin)
        code = "gstin.ok" if ok else ("gstin.bad_checksum" if "check character" in msg else "gstin.bad_structure")
        checks.append(chk("gstin_format", "format", "GSTIN format", V if ok else AR, msg, code=code))
        if ok:
            g_rec = db.get(RefGstin, gstin)
            if not g_rec:
                checks.append(chk("gstin_registry", "registry", "GSTIN in mock registry", UNV,
                                  "Not found in the supplied mock GST registry", code="gstin_registry.not_found"))
            elif g_rec.status != "Active":
                checks.append(chk("gstin_registry", "registry", "GSTIN in mock registry", AR,
                                  f"GSTIN status is {g_rec.status} in the registry. Products that need a GSTIN "
                                  "cannot proceed until this is resolved.", code="gstin_registry.inactive",
                                  reg_status=g_rec.status))
            else:
                checks.append(chk("gstin_registry", "registry", "GSTIN in mock registry", V,
                                  "Found with status Active (mock registry only; not an official verification)",
                                  code="gstin_registry.active"))
            if g_rec:
                registry["gstin"] = {"legal_name": g_rec.legal_name, "trade_name": g_rec.trade_name,
                                     "constitution": g_rec.constitution, "address": g_rec.principal_place_of_business,
                                     "state": g_rec.state, "status": g_rec.status}
    if udyam:
        ok, msg = validate_udyam(udyam)
        checks.append(chk("udyam_format", "format", "Udyam format", V if ok else AR, msg,
                          code="udyam.ok" if ok else "udyam.bad"))
        if ok:
            u_rec = db.get(RefUdyam, udyam)
            checks.append(chk("udyam_registry", "registry", "Udyam in mock registry", V if u_rec else UNV,
                              "Found in mock Udyam registry (not an official verification)" if u_rec
                              else "Not found in the supplied mock Udyam registry",
                              code="udyam_registry.found" if u_rec else "udyam_registry.not_found"))
            if u_rec:
                registry["udyam"] = {"enterprise_name": u_rec.enterprise_name, "type": u_rec.enterprise_type,
                                     "activity": u_rec.major_activity, "city": u_rec.city, "state": u_rec.state}
    if mode == "none":
        checks.append(chk("registration", "registry", "Business registration", MR,
                          "No GSTIN or Udyam provided. Pending - an employee reviews the business registration.",
                          code="registration.none"))
    if gstin_products and not (g_rec and g_rec.status == "Active"):
        checks.append(chk("gstin_required", "registry", "GSTIN needed for selected products", AR,
                          "These products need a valid, active GSTIN: " + ", ".join(gstin_products),
                          code="gstin_required", products=", ".join(gstin_products)))

    reg_names = [n for n in [g_rec and g_rec.legal_name, g_rec and g_rec.trade_name,
                             u_rec and u_rec.enterprise_name] if n]
    ref_names = reg_names or ([own_name] if own_name else [])
    reg_addr = g_rec.principal_place_of_business if g_rec else None

    required = (["gst_certificate"] if mode in ("gstin", "both") else []) + \
               (["udyam_certificate"] if mode in ("udyam", "both") else []) + ["signatory_id", "address_proof"]
    by_type = {d.doc_type: d for d in docs}

    # stage 1 + 4: documents
    for dt in required:
        d = by_type.get(dt)
        label = DOC_LABELS[dt]
        if not d:
            checks.append(chk(f"{dt}_upload", "extraction", label, PEND, "Not uploaded yet", dt, "doc.not_uploaded"))
            continue
        q, ex = d.quality or {}, d.extracted or {}
        if q.get("blurry") or q.get("low_resolution"):
            checks.append(chk(f"{dt}_quality", "extraction", label, AR,
                              "The image is too blurry or small to read. Please upload a sharper, well-lit photo.",
                              dt, "doc.unclear"))
            continue
        if not ex.get("available", False):
            checks.append(chk(f"{dt}_ocr", "extraction", label, UNV,
                              (ex.get("error") or "Text could not be extracted") +
                              ". An employee will review this document manually.", dt, "doc.ocr_unavailable"))
            continue
        f = ex.get("fields", {})
        missing = [k for k in REQUIRED_FIELDS[dt] if not f.get(k)]
        if missing:
            checks.append(chk(f"{dt}_fields", "extraction", label, AR,
                              "Could not read or find: " + ", ".join(m.replace("_", " ") for m in missing) +
                              ". Please upload a clearer image or the complete document.", dt,
                              "doc.fields_missing", fields=missing))
            continue
        checks.append(chk(f"{dt}_fields", "extraction", label, V, "Required fields were extracted", dt, "doc.fields_ok"))

        if dt == "gst_certificate":
            if gstin:
                checks.append(_number_check("gst_doc_number", "GSTIN on certificate", compare_id(f["gstin"], gstin, True), dt))
            if g_rec:
                checks.append(_name_check("gst_doc_name", "Legal name on certificate", f["legal_name"],
                                          [g_rec.legal_name, g_rec.trade_name], dt))
                s = addr_score(f["address"], g_rec.principal_place_of_business)
                checks.append(chk("gst_doc_addr", "consistency", "Address on certificate", V if s >= 85 else MR,
                                  f"Matches registry address (similarity {s:.0f}%)" if s >= 85 else
                                  f"Address differs from registry (similarity {s:.0f}%); employee review", dt,
                                  "addr.match" if s >= 85 else "addr.differs", score=round(s)))
        elif dt == "udyam_certificate":
            if udyam:
                checks.append(_number_check("udyam_doc_number", "Udyam number on certificate", compare_id(f["udyam"], udyam, False), dt))
            if u_rec:
                checks.append(_name_check("udyam_doc_name", "Enterprise name on certificate", f["name"],
                                          [u_rec.enterprise_name], dt))
        elif dt == "address_proof":
            bd = parse_date(f["date"])
            lim = settings.kyc_address_proof_max_days
            if not bd:
                checks.append(chk("bill_date", "consistency", "Bill date", AR, "Bill date is not readable", dt,
                                  "bill_date.unreadable"))
            else:
                age = (ref - bd).days
                if age < 0:
                    checks.append(chk("bill_date", "consistency", "Address proof freshness", MR,
                                      f"Bill date {bd} is after the reference date {ref}", dt, "bill_date.future",
                                      date=str(bd), ref=str(ref)))
                elif age > lim:
                    checks.append(chk("bill_date", "consistency", "Address proof freshness", AR,
                                      f"Bill is {age} days old; address proof must be within {lim} days of {ref}", dt,
                                      "bill_date.stale", age=age, limit=lim, ref=str(ref)))
                else:
                    checks.append(chk("bill_date", "consistency", "Address proof freshness", V,
                                      f"Bill is {age} days old (limit {lim} days from {ref})", dt, "bill_date.ok",
                                      age=age, limit=lim, ref=str(ref)))
            if reg_addr:
                s = addr_score(f["address"], reg_addr)
                checks.append(chk("bill_addr", "consistency", "Supply address vs registry", V if s >= 85 else MR,
                                  f"Matches registry address (similarity {s:.0f}%)" if s >= 85 else
                                  f"Differs from registry address (similarity {s:.0f}%); correct or employee review",
                                  dt, "addr.match" if s >= 85 else "addr.differs", score=round(s)))
            elif u_rec:
                ok = norm(u_rec.city) in norm(f["address"])
                checks.append(chk("bill_addr", "consistency", "Supply city vs Udyam record", V if ok else MR,
                                  "City matches Udyam record" if ok else "City differs from Udyam record; employee review",
                                  dt, "city.match" if ok else "city.differs"))
            if ref_names:
                s = name_score(f["billed_to"], ref_names)
                checks.append(chk("bill_name", "consistency", "Billed-to name", V if s >= 85 else MR,
                                  "Billed-to name matches the business" if s >= 85 else
                                  "Billed-to name differs from the business name. This can be legitimate (e.g. owner "
                                  "or landlord); an employee will review.", dt,
                                  "billed_to.match" if s >= 85 else "billed_to.differs"))
        elif dt == "signatory_id":
            vt = parse_date(f["valid_till"])
            if vt and vt < ref:
                checks.append(chk("id_validity", "consistency", "ID validity", AR, f"ID expired on {vt}", dt,
                                  "id_validity.expired", date=str(vt)))
            else:
                checks.append(chk("id_validity", "consistency", "ID validity", V if vt else MR,
                                  f"Valid till {vt}" if vt else "Validity date unreadable", dt,
                                  "id_validity.ok" if vt else "id_validity.unreadable", date=str(vt) if vt else ""))
            if f.get("business") and ref_names:
                checks.append(_name_check("id_business", "Business named on ID", f["business"], ref_names, dt))
            if g_rec and norm(f["name"]) and norm(f["name"]) in norm(g_rec.legal_name + " " + g_rec.trade_name):
                checks.append(chk("signatory", "consistency", "Signatory vs registry", MR,
                                  "Signatory name appears in the registry legal name. Authority to sign is still "
                                  "confirmed by an employee.", dt, "signatory.name_in_registry"))
            else:
                checks.append(chk("signatory", "consistency", "Signatory authority", MR,
                                  "The mock registries hold no signatory data, so an employee confirms authority.", dt,
                                  "signatory.manual"))

    overall = max((c["status"] for c in checks), key=lambda s: SEVERITY[s]) if checks else PEND
    return {**base, "overall": overall, "checks": checks, "required_documents": required, "registry": registry,
            "mode": mode}


# ---------- storage ----------
def save_upload(app_id: int, filename: str, content: bytes) -> tuple[str, dict]:
    ext = Path(filename).suffix.lower()
    if ext not in (".png", ".jpg", ".jpeg"):
        raise ValueError("Only PNG or JPG images are accepted")
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise ValueError(f"File is larger than {settings.max_upload_mb} MB")
    folder = settings.upload_path / str(app_id)
    folder.mkdir(parents=True, exist_ok=True)
    import uuid
    path = folder / f"{uuid.uuid4().hex}{ext}"
    path.write_bytes(content)
    try:
        Image.open(path).verify()
    except Exception:
        path.unlink(missing_ok=True)
        raise ValueError("File is not a valid image")
    return str(path), image_quality(str(path))


def purge_expired(db: Session) -> int:
    """Delete uploaded documents older than UPLOAD_RETENTION_DAYS (rows and files)."""
    from datetime import timedelta
    from .models import Document
    cutoff = datetime.utcnow() - timedelta(days=settings.upload_retention_days)
    old = db.query(Document).filter(Document.uploaded_at < cutoff).all()
    for d in old:
        Path(d.path).unlink(missing_ok=True)
        db.delete(d)
    db.commit()
    return len(old)
