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


def normalize_udyam(u: str | None) -> str:
    """Canonical UDYAM-XX-00-0000000 whatever the spacing or dashes typed (O read as 0 in the number part)."""
    raw = re.sub(r"[^A-Z0-9]", "", (u or "").upper())
    m = re.fullmatch(r"UDYAM([A-Z]{2})([0-9O]{2})([0-9O]{7})", raw)
    return f"UDYAM-{m.group(1)}-{m.group(2).replace('O', '0')}-{m.group(3).replace('O', '0')}" if m else (u or "").strip().upper()


def normalize_gstin(g: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (g or "").upper())


def validate_udyam(u: str) -> tuple[bool, str]:
    if not UDYAM_RE.match((u or "").strip().upper()):
        return False, "Udyam number must look like UDYAM-XX-00-0000000"
    return True, "Structure is valid"


# ---------- stage 1: extraction ----------
_ocr = None
import threading
_ocr_lock = threading.Lock()


_OCR_CACHE: dict = {}  # sha256 of image bytes -> OCR result (same photo uploaded again = instant)
SPECIMEN_OCR = Path(__file__).resolve().parents[1] / "tests" / "ocr_results.json"


def image_hash(content: bytes) -> str:
    import hashlib
    return hashlib.sha256(content).hexdigest()


def seed_ocr_cache():
    """Pre-load OCR text already computed for the case-pack specimens (scripts/ocr_specimens.py)."""
    import json
    if not SPECIMEN_OCR.exists():
        return
    res = json.loads(SPECIMEN_OCR.read_text(encoding="utf-8"))
    for name, r in res.items():
        f = settings.data_path / "kyc_documents" / name
        if f.exists() and r.get("available"):
            _OCR_CACHE[image_hash(f.read_bytes())] = {"engine": "paddleocr", "available": True, "lines": r["lines"],
                                                      "confidence": r.get("confidence"), "tilt_deg": r.get("tilt_deg")}


def extract_cached(path: str, content_hash: str) -> dict:
    if content_hash in _OCR_CACHE:
        return dict(_OCR_CACHE[content_hash])
    ex = extract_text(path)
    if ex.get("available"):
        _OCR_CACHE[content_hash] = ex
    return dict(ex)


def warmup():
    """Load PaddleOCR once at startup (in a background thread) so the first upload is not slow."""
    try:
        seed_ocr_cache()
        ocr = _get_ocr()
        with _ocr_lock:
            ocr.predict(np.full((64, 256, 3), 255, np.uint8))
    except Exception:
        pass


def _get_ocr():
    global _ocr
    with _ocr_lock:
        return _load_ocr()


def _load_ocr():
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
        with _ocr_lock:  # one inference at a time; PaddleOCR is not thread-safe
            raw = ocr.predict(img) if hasattr(ocr, "predict") else ocr.ocr(img, cls=False)
        items = _boxes(raw)
        conf = float(np.mean([i[1] for i in items])) if items else 0.0
        wide = [b[5] for b in items if b[6] > 3 * b[4]]
        tilt = round(float(np.degrees(np.median(wide))), 1) if wide else 0.0
        return {"engine": "paddleocr", "available": True, "lines": _rows(items), "confidence": round(conf, 3),
                "tilt_deg": tilt}
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
        toks = re.findall(r"\b[A-Z0-9]{15}\b", text.upper())
        raw = next((t for t in toks if GSTIN_RE.match(fix_gstin_ocr(t))), None)
        f["gstin"] = fix_gstin_ocr(raw) if raw else None
        if raw and raw != f["gstin"]:
            f["gstin_raw"] = raw  # a look-alike character was corrected by position (shown as 'fixed automatically')
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
# Characters that OCR (or a print) confuses. A repair is accepted only if the result passes the GSTIN checksum
# AND exists in the registry; any other difference is treated as a real change to the number.
LOOKALIKE = [set("0OQD"), set("1IJL"), set("5S"), set("8B"), set("2Z"), set("6G")]


def fix_gstin_ocr(v: str) -> str:
    v = re.sub(r"[^A-Z0-9]", "", (v or "").upper())
    if len(v) != 15:
        return v
    return "".join(ch.translate(_TO_DIGIT) if k == "D" else ch.translate(_TO_ALPHA) if k == "A" else ch
                   for ch, k in zip(v, GSTIN_SHAPE))


def lookalike(a: str, b: str) -> bool:
    return a == b or any(a in s and b in s for s in LOOKALIKE)


def compare_id(doc_value: str, entered: str, gstin: bool) -> str:
    """'match' | 'lookalike' (OCR/print look-alike, auto-corrected) | 'mismatch' (a real difference)."""
    d = fix_gstin_ocr(doc_value) if gstin else normalize_udyam(doc_value)
    e = normalize_gstin(entered) if gstin else normalize_udyam(entered)
    if d == e:
        return "match"
    if len(d) == len(e):
        diff = [i for i, (x, y) in enumerate(zip(d, e)) if x != y]
        if len(diff) <= 2 and all(lookalike(d[i], e[i]) for i in diff):
            return "lookalike"
    return "mismatch"


_GSTIN_ROWS: list | None = None


def _gstin_rows(db: Session) -> list:
    global _GSTIN_ROWS
    if _GSTIN_ROWS is None:
        _GSTIN_ROWS = [(r.gstin, r.legal_name, r.trade_name, r.principal_place_of_business, r.status)
                       for r in db.query(RefGstin).all()]
    return _GSTIN_ROWS


def repair_gstin(db: Session, g: str) -> str | None:
    """A look-alike swap (one character) that makes the checksum valid AND is found in the registry."""
    hits = set()
    for i, ch in enumerate(g):
        for s in LOOKALIKE:
            if ch in s:
                for alt in s - {ch}:
                    v = g[:i] + alt + g[i + 1:]
                    if GSTIN_RE.match(v) and gstin_checksum_ok(v) and db.get(RefGstin, v):
                        hits.add(v)
    return hits.pop() if len(hits) == 1 else None


def nearest_gstin(db: Session, g: str) -> str | None:
    """Registry GSTIN with exactly one real (non look-alike) difference, for a 'did you mean' suggestion."""
    near = []
    for r in _gstin_rows(db):
        diff = [(x, y) for x, y in zip(r[0], g) if x != y]
        if diff and sum(not lookalike(x, y) for x, y in diff) == 1 and len(diff) <= 3:
            near.append(r[0])
    return near[0] if len(near) == 1 else None


def find_registry_by_name(db: Session, name: str | None, city: str | None):
    """Registry row whose trade/legal name matches a business name (and city when given)."""
    if not name:
        return None
    n = norm(name)
    for g, legal, trade, addr, status in _gstin_rows(db):
        if max(fuzz.ratio(n, norm(trade)), fuzz.ratio(n, norm(legal))) >= 92 and (not city or norm(city) in norm(addr)):
            return {"gstin": g, "trade_name": trade, "status": status}
    return None


# ---------- stage 3 + 4: lookup and consistency ----------
STOP = {"prop", "llp", "pvt", "private", "ltd", "limited", "and", "the", "co", "m", "s", "ms", "of"}


def norm(s: str | None) -> str:
    s = re.sub(r"\bprop\.?\b", " ", (s or "").lower())
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", s)).strip()


def words(s: str | None) -> list[str]:
    return [w for w in norm(s).split() if w not in STOP]


def name_diff(doc: str | None, ref: str | None) -> tuple[list[str], list[str]]:
    """Words that differ between two names, tolerating small OCR spelling slips within a word."""
    a, b = words(doc), words(ref)
    only_a = [w for w in a if not any(fuzz.ratio(w, x) >= 80 for x in b)]
    only_b = [w for w in b if not any(fuzz.ratio(w, x) >= 80 for x in a)]
    return only_a, only_b


def names_match(doc: str | None, refs: list) -> tuple[bool, str | None, str | None]:
    """(matches, changed_doc_word, expected_word) against the best of several reference names."""
    best = None
    for r in [x for x in refs if x]:
        da, db_ = name_diff(doc, r)
        if not da and not db_:
            return True, None, None
        if not da and set(words(doc)) and len(words(r)) > len(words(doc)):
            return True, None, None  # document gives a shorter form of the same name
        if best is None or len(da) + len(db_) < len(best[0]) + len(best[1]):
            best = (da, db_)
    if not best:
        return False, None, None
    return False, " ".join(best[0]) or None, " ".join(best[1]) or None


def person_in(name: str | None, legal: str | None) -> bool:
    w = words(name)
    return bool(w) and all(any(fuzz.ratio(x, y) >= 80 for y in words(legal)) for x in w)


def registry_city(address: str | None) -> str | None:
    """City from a registry address like 'Shop/Unit 80, Civil Lines, Nagpur, Maharashtra - 411231'."""
    parts = [x.strip() for x in re.sub(r"-\s*\d{6}\s*$", "", address or "").split(",") if x.strip()]
    return parts[-2] if len(parts) >= 3 else None


def addr_score(a: str | None, b: str | None) -> float:
    return fuzz.token_set_ratio(norm(a), norm(b)) if a and b else 0


def parse_date(s: str | None) -> date | None:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date() if s else None
    except ValueError:
        return None


def chk(cid, stage, label, status, detail, doc_type=None, code=None, **params):
    return {"id": cid, "stage": stage, "label": label, "status": status, "detail": detail, "doc_type": doc_type,
            "code": code or cid, "params": params}


MODES = ("gstin", "udyam", "both", "none")
SIGNING_ROLES = ("proprietor", "owner", "partner", "director", "founder", "ceo", "managing", "authorised signatory",
                 "authorized signatory")
VERDICT_OVERALL = {"pass": V, "ask": AR, "hold": MR, "incomplete": PEND}


def verdict_of(checks: list) -> str:
    """hold = our team checks it (possible risk); ask = the customer can fix it now; pass = nothing to do."""
    st = {c["status"] for c in checks}
    if st & {MR, UNV}:
        return "hold"
    if st & {AR, PEND}:
        return "ask"
    return "pass"


def _name_check(cid, label, doc_name, refs, doc_type):
    ok, got, want = names_match(doc_name, refs)
    if ok:
        return chk(cid, "consistency", label, V, "Matches the registry", doc_type, "name.match")
    if got or want:
        return chk(cid, "consistency", label, MR,
                   f"'{doc_name}' differs from the registry: '{got or '-'}' instead of '{want or '-'}'. "
                   "The document may be outdated or edited, so our team will check it.", doc_type,
                   "name.word_changed", name=doc_name, got=got or "-", want=want or "-")
    return chk(cid, "consistency", label, MR, f"'{doc_name}' does not match the registry", doc_type,
               "name.mismatch", name=doc_name)


def evaluate_kyc(db: Session, state: dict, docs: list, gstin_products: list[str], business_name: str | None,
                 city: str | None = None) -> dict:
    """state: {consent, mode, gstin, udyam, business_name, phone_verified, digilocker}; docs: Document rows.

    Returns checks (each ok / ask / hold) and one verdict: pass | ask | hold | incomplete.
    mode none = no GSTIN/Udyam: the ID and bill must agree with each other and with what the customer told us;
    a registry search makes sure a cancelled GSTIN is not being hidden; the address is confirmed at installation."""
    ref = parse_date(settings.kyc_reference_date) or date.today()
    base = {"registry": {}, "reference_date": str(ref), "required_documents": [],
            "note": "Prototype checks against supplied mock data only. "
                    "Not an official verification and not proof of document authenticity."}
    if not state.get("consent"):
        return {**base, "overall": PEND, "verdict": "incomplete", "checks": [chk("consent", "format", "Consent", PEND,
                "Consent is required before identifiers and documents are collected", code="consent.required")]}
    by_type0 = {d.doc_type: ((d.extracted or {}).get("fields") or {}) for d in docs}
    # auto (customer app): nothing is typed. Registration numbers are read from the uploaded certificates; the GST
    # certificate is required only when the plan has a GSTIN-only product; Udyam is optional; ID + bill always.
    auto = state.get("mode") not in MODES
    if auto:
        has_g, has_u = "gst_certificate" in by_type0 or bool(gstin_products), "udyam_certificate" in by_type0
        mode = "both" if has_g and has_u else "gstin" if has_g else "udyam" if has_u else "none"
    else:
        mode = state["mode"]
    checks = []
    # number typed by the customer; if left empty, the one read from their certificate
    gstin = normalize_gstin(state.get("gstin") or by_type0.get("gst_certificate", {}).get("gstin")) if mode in ("gstin", "both") else ""
    udyam = normalize_udyam(state.get("udyam") or by_type0.get("udyam_certificate", {}).get("udyam")) if mode in ("udyam", "both") else ""
    own_name = (state.get("business_name") or "").strip() or business_name
    by_type = {d.doc_type: d for d in docs}
    doc_fields = lambda dt: ((by_type[dt].extracted or {}).get("fields", {}) if dt in by_type else {})
    g_rec = u_rec = None
    registry = {}

    # identity: verified mobile (all modes) + optional DigiLocker in place of the ID photo
    if state.get("phone_verified"):
        checks.append(chk("phone", "format", "Mobile number", V, "Mobile number confirmed by OTP", code="phone.ok"))
    else:
        checks.append(chk("phone", "format", "Mobile number", PEND, "Confirm your mobile number with a one-time code",
                          code="phone.pending"))
    dl = state.get("digilocker")

    # stage 2 + 3: identifiers
    if mode in ("gstin", "both") and not gstin and not auto:
        checks.append(chk("gstin_format", "format", "GSTIN", PEND, "Enter your GSTIN", code="gstin.missing"))
    if mode in ("udyam", "both") and not udyam and not auto:
        checks.append(chk("udyam_format", "format", "Udyam number", PEND, "Enter your Udyam number", code="udyam.missing"))
    if gstin:
        ok, msg = validate_gstin(gstin)
        if not ok and GSTIN_RE.match(gstin):  # structure fine, checksum fails: look-alike or a real change?
            fixed = repair_gstin(db, gstin)
            if fixed:
                checks.append(chk("gstin_format", "format", "GSTIN format", V,
                                  f"Read as {mask(gstin)}; a look-alike character was corrected to {mask(fixed)} "
                                  "(check character and registry confirm it)", code="gstin.repaired",
                                  read=mask(gstin), fixed=mask(fixed)))
                gstin, ok = fixed, True
            else:
                near = nearest_gstin(db, gstin)
                on_doc = compare_id(doc_fields("gst_certificate").get("gstin", ""), gstin, True) == "match"
                checks.append(chk("gstin_format", "format", "GSTIN format", MR if on_doc else AR,
                                  ("The GSTIN printed on the certificate fails the check character"
                                   if on_doc else "The GSTIN check character does not match (possible typo)") +
                                  (f". The registry has {mask(near)} for this business. A digit differs, which is not "
                                   "an OCR look-alike, so the certificate may be altered." if near and on_doc else
                                   f". Did you mean {mask(near)}?" if near else ""),
                                  code=("gstin.altered" if on_doc else "gstin.typo") + ("_suggest" if near else ""),
                                  suggestion=mask(near) if near else ""))
                if near:
                    base["suggested_gstin"] = near
        elif not ok:
            checks.append(chk("gstin_format", "format", "GSTIN format", AR, msg, code="gstin.bad_structure"))
        else:
            checks.append(chk("gstin_format", "format", "GSTIN format", V, msg, code="gstin.ok"))
        if ok:
            g_rec = db.get(RefGstin, gstin)
            if not g_rec:
                checks.append(chk("gstin_registry", "registry", "GSTIN in registry", MR,
                                  "Not found in the GST registry. Our team will check it.", code="gstin_registry.not_found"))
            elif g_rec.status != "Active":
                checks.append(chk("gstin_registry", "registry", "GSTIN in registry", MR,
                                  f"GSTIN status is {g_rec.status} in the registry. Our team must review this.",
                                  code="gstin_registry.inactive", reg_status=g_rec.status))
            else:
                checks.append(chk("gstin_registry", "registry", "GSTIN in registry", V,
                                  "Found with status Active (mock registry)", code="gstin_registry.active"))
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
            checks.append(chk("udyam_registry", "registry", "Udyam in registry", V if u_rec else MR,
                              "Found in the Udyam registry (mock)" if u_rec else
                              "Not found in the Udyam registry. Our team will check it.",
                              code="udyam_registry.found" if u_rec else "udyam_registry.not_found"))
            if u_rec:
                registry["udyam"] = {"enterprise_name": u_rec.enterprise_name, "type": u_rec.enterprise_type,
                                     "activity": u_rec.major_activity, "city": u_rec.city, "state": u_rec.state}
    if g_rec and u_rec:
        same = names_match(u_rec.enterprise_name, [g_rec.trade_name, g_rec.legal_name])[0]
        checks.append(chk("gst_udyam_same", "registry", "GST and Udyam records", V if same else MR,
                          "Both records are for the same business" if same else
                          "The GST and Udyam records name different businesses", code="registry.same" if same else
                          "registry.different"))
    # The city the customer gave in chat drives city-tier eligibility, so it must match the registered business.
    reg_city = (u_rec.city if u_rec else None) or (registry_city(g_rec.principal_place_of_business) if g_rec else None)
    if city and reg_city:
        if norm(city) == norm(reg_city) or norm(city) in norm(g_rec.principal_place_of_business if g_rec else reg_city):
            checks.append(chk("city_match", "registry", "City", V, f"{reg_city}, as you told us", code="city.chat_ok", city=reg_city))
        else:
            checks.append(chk("city_match", "registry", "City", AR,
                              f"You told us {city}, but this registration is in {reg_city}. Plans and prices depend on the "
                              f"city: use {reg_city}, or ask our team if you are installing at another branch.",
                              code="city.chat_differs", chat=city, registry=reg_city))
            base["registry_city"] = reg_city
    if gstin_products and not (g_rec and g_rec.status == "Active"):
        checks.append(chk("gstin_required", "registry", "GSTIN needed for selected products", AR,
                          "These products need a valid, active GSTIN: " + ", ".join(gstin_products) +
                          ". Remove them or add an active GSTIN.", code="gstin_required", products=", ".join(gstin_products)))

    reg_names = [n for n in [g_rec and g_rec.trade_name, g_rec and g_rec.legal_name, u_rec and u_rec.enterprise_name] if n]
    ref_names = reg_names or ([own_name] if own_name else [])
    reg_addr = g_rec.principal_place_of_business if g_rec else None
    person = g_rec.legal_name if g_rec else None

    if auto:
        required = (["gst_certificate"] if gstin_products else []) + ([] if dl else ["signatory_id"]) + ["address_proof"]
        optional = [dt for dt in ("gst_certificate", "udyam_certificate") if dt not in required]
    else:
        required = (["gst_certificate"] if mode in ("gstin", "both") else []) + \
                   (["udyam_certificate"] if mode in ("udyam", "both") else []) + \
                   ([] if dl else ["signatory_id"]) + ["address_proof"]
        optional = []
    base["optional_documents"] = optional

    if dl:
        checks.append(chk("digilocker", "consistency", "Identity (DigiLocker)", V,
                          "Identity confirmed with DigiLocker (simulated in this prototype)", code="digilocker.ok"))
        if person and not person_in(dl.get("name"), person) and g_rec and g_rec.constitution == "Proprietorship":
            checks.append(chk("digilocker_name", "consistency", "DigiLocker name vs proprietor", MR,
                              "The DigiLocker name is not the registered proprietor", code="digilocker.not_owner"))

    # stage 1 + 4: documents
    for dt in required + [o for o in optional if o in by_type]:
        d = by_type.get(dt)
        label = DOC_LABELS[dt]
        if not d:
            checks.append(chk(f"{dt}_upload", "extraction", label, PEND, "Not uploaded yet", dt, "doc.not_uploaded"))
            continue
        q, ex = d.quality or {}, d.extracted or {}
        if q.get("blurry") or q.get("low_resolution"):
            checks.append(chk(f"{dt}_quality", "extraction", label, AR,
                              "The photo is too blurry or small to read. Please retake it in good light.",
                              dt, "doc.unclear"))
            continue
        if not ex.get("available", False):
            checks.append(chk(f"{dt}_ocr", "extraction", label, MR,
                              (ex.get("error") or "Text could not be read") + ". Our team will read it.", dt,
                              "doc.ocr_unavailable"))
            continue
        tilt = abs(ex.get("tilt_deg") or 0)
        if tilt > 20:
            checks.append(chk(f"{dt}_tilt", "extraction", label, AR, "The photo is too tilted. Hold the phone straight "
                              "above the document and retake it.", dt, "doc.too_tilted", deg=round(tilt)))
            continue
        f = ex.get("fields", {})
        missing = [k for k in REQUIRED_FIELDS[dt] if not f.get(k)]
        if missing:
            blank_id = dt == "udyam_certificate" and missing == ["udyam"]
            checks.append(chk(f"{dt}_fields", "extraction", label, AR,
                              ("The Udyam number on the certificate is blank. Upload the complete certificate."
                               if blank_id else "Could not read: " + ", ".join(m.replace("_", " ") for m in missing) +
                               ". Please upload a clearer photo of the complete document."), dt,
                              "doc.number_blank" if blank_id else "doc.fields_missing", fields=missing))
            continue
        if tilt >= 2:
            checks.append(chk(f"{dt}_fields", "extraction", label, V, f"Photo was tilted {tilt:.0f}°; straightened and "
                              "read automatically", dt, "doc.straightened", deg=round(tilt)))
        else:
            checks.append(chk(f"{dt}_fields", "extraction", label, V, "Read successfully", dt, "doc.fields_ok"))

        if dt == "gst_certificate":
            if gstin:
                r = compare_id(f["gstin"], gstin, True)
                if r == "match" and f.get("gstin_raw"):
                    checks.append(chk("gst_doc_number", "consistency", "GSTIN on certificate", V,
                                      f"Matches after correcting a look-alike character (read {mask(f['gstin_raw'])})",
                                      dt, "number.lookalike"))
                elif r == "match":
                    checks.append(chk("gst_doc_number", "consistency", "GSTIN on certificate", V, "Matches", dt, "number.match"))
                elif r == "lookalike":
                    checks.append(chk("gst_doc_number", "consistency", "GSTIN on certificate", V,
                                      "Matches after correcting an OCR look-alike character (0/O, 1/I/J, 5/S, 8/B)",
                                      dt, "number.lookalike"))
                elif not any(c["code"].startswith("gstin.altered") for c in checks):
                    checks.append(chk("gst_doc_number", "consistency", "GSTIN on certificate", MR,
                                      "The GSTIN on the certificate differs from the one entered", dt, "number.mismatch"))
            if g_rec:
                checks.append(_name_check("gst_doc_name", "Legal name on certificate", f["legal_name"],
                                          [g_rec.legal_name], dt))
                s = addr_score(f["address"], reg_addr)
                checks.append(chk("gst_doc_addr", "consistency", "Address on certificate", V if s >= 85 else MR,
                                  "Matches the registry address" if s >= 85 else "Address differs from the registry",
                                  dt, "addr.match" if s >= 85 else "addr.differs", score=round(s)))
        elif dt == "udyam_certificate":
            if udyam:
                r = compare_id(f["udyam"], udyam, False)
                checks.append(chk("udyam_doc_number", "consistency", "Udyam number on certificate",
                                  V if r != "mismatch" else MR, "Matches" if r != "mismatch" else
                                  "The Udyam number on the certificate differs from the one entered", dt,
                                  "number.match" if r != "mismatch" else "number.mismatch"))
            if u_rec:
                checks.append(_name_check("udyam_doc_name", "Enterprise name on certificate", f["name"],
                                          [u_rec.enterprise_name], dt))
        elif dt == "address_proof":
            bd = parse_date(f["date"])
            lim = settings.kyc_address_proof_max_days
            if not bd:
                checks.append(chk("bill_date", "consistency", "Bill date", AR, "The bill date is not readable", dt,
                                  "bill_date.unreadable"))
            else:
                age = (ref - bd).days
                if age < 0:
                    checks.append(chk("bill_date", "consistency", "Address proof freshness", MR,
                                      f"Bill date {bd} is after {ref}", dt, "bill_date.future", date=str(bd), ref=str(ref)))
                elif age > lim:
                    checks.append(chk("bill_date", "consistency", "Address proof freshness", AR,
                                      f"The bill is {age} days old; it must be within {lim} days. Upload a newer bill.",
                                      dt, "bill_date.stale", age=age, limit=lim, ref=str(ref)))
                else:
                    checks.append(chk("bill_date", "consistency", "Address proof freshness", V,
                                      f"Bill is {age} days old (limit {lim})", dt, "bill_date.ok", age=age, limit=lim, ref=str(ref)))
            if reg_addr:
                s = addr_score(f["address"], reg_addr)
                checks.append(chk("bill_addr", "consistency", "Supply address vs registry", V if s >= 85 else MR,
                                  "Matches the registry address" if s >= 85 else "Differs from the registry address",
                                  dt, "addr.match" if s >= 85 else "addr.differs", score=round(s)))
            elif u_rec:
                ok = norm(u_rec.city) in norm(f["address"])
                checks.append(chk("bill_addr", "consistency", "Supply city vs Udyam record", V if ok else MR,
                                  "City matches the Udyam record" if ok else "City differs from the Udyam record",
                                  dt, "city.match" if ok else "city.differs"))
            elif city:
                ok = norm(city) in norm(f["address"])
                checks.append(chk("bill_addr", "consistency", "Supply city", V if ok else AR,
                                  "The bill is for the city you told us" if ok else
                                  f"The bill address is not in {city}. Upload a bill for the business address.",
                                  dt, "city.declared_ok" if ok else "city.declared_differs", city=city))
            names = ref_names + ([person] if person else [])
            if names:
                ok = names_match(f["billed_to"], names)[0] or (person and person_in(f["billed_to"], person))
                checks.append(chk("bill_name", "consistency", "Billed-to name", V if ok else AR,
                                  "The bill is in the business or owner's name" if ok else
                                  "The bill is not in the business or owner's name. Upload a bill in the business name.",
                                  dt, "billed_to.match" if ok else "billed_to.differs"))
        elif dt == "signatory_id":
            vt = parse_date(f["valid_till"])
            if vt and vt < ref:
                checks.append(chk("id_validity", "consistency", "ID validity", AR, f"The ID expired on {vt}. Upload a "
                                  "valid ID or use DigiLocker.", dt, "id_validity.expired", date=str(vt)))
            else:
                checks.append(chk("id_validity", "consistency", "ID validity", V if vt else AR,
                                  f"Valid till {vt}" if vt else "Validity date unreadable", dt,
                                  "id_validity.ok" if vt else "id_validity.unreadable", date=str(vt) if vt else ""))
            if f.get("business") and ref_names:
                checks.append(_name_check("id_business", "Business named on ID", f["business"], ref_names, dt))
            role = (f.get("designation") or "").lower()
            if person and person_in(f["name"], person):
                checks.append(chk("signatory", "consistency", "Signatory", V,
                                  "The ID holder is the registered owner" + (
                                      "; signing is confirmed by OTP e-sign" if role and not any(r in role for r in SIGNING_ROLES) else ""),
                                  dt, "signatory.owner"))
            elif any(r in role for r in SIGNING_ROLES):
                checks.append(chk("signatory", "consistency", "Signatory", V,
                                  f"Signs as {f.get('designation')}; confirmed by OTP e-sign", dt, "signatory.role_ok",
                                  role=f.get("designation")))
            else:
                checks.append(chk("signatory", "consistency", "Signatory", MR,
                                  f"{f.get('designation') or 'This person'} may not be allowed to sign for the business; "
                                  "our team will confirm", dt, "signatory.authority", role=f.get("designation") or "-"))

    if mode == "none":
        sid, bill = doc_fields("signatory_id"), doc_fields("address_proof")
        biz = sid.get("business") or own_name
        if sid.get("business") and bill.get("billed_to"):
            same = names_match(bill["billed_to"], [sid["business"]])[0] or person_in(bill["billed_to"], sid.get("name"))
            checks.append(chk("id_bill_same", "consistency", "ID and bill", V if same else AR,
                              "The ID and the bill are for the same business" if same else
                              "The ID and the bill name different businesses", code="docs.same" if same else "docs.different"))
        hit = find_registry_by_name(db, biz or bill.get("billed_to"), city)
        if hit and hit["status"] != "Active":
            checks.append(chk("registration", "registry", "Registry search", MR,
                              f"A {hit['status'].lower()} GST registration ({mask(hit['gstin'])}) exists for this business",
                              code="registry.found_inactive", reg_status=hit["status"], gstin=mask(hit["gstin"])))
        elif hit:
            checks.append(chk("registration", "registry", "Registry search", V,
                              f"Your business has an active GST registration ({mask(hit['gstin'])}); your plan does not "
                              "need it.", code="registry.found_active", gstin=mask(hit["gstin"])))
        else:
            checks.append(chk("registration", "registry", "No GST / Udyam", V,
                              "Approved for services that don't need a GSTIN. The technician confirms the address at "
                              "installation.", code="registration.self_declared"))

    verdict = verdict_of(checks)
    return {**base, "overall": VERDICT_OVERALL[verdict], "verdict": verdict, "checks": checks,
            "required_documents": required, "registry": registry, "mode": mode, "_gstin": gstin, "_udyam": udyam,
            "self_fixed": [c["code"] for c in checks if c["code"] in ("gstin.repaired", "number.lookalike", "doc.straightened")]}


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
