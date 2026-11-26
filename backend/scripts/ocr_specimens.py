"""Run PaddleOCR (with watermark cleaning + de-skew) over all KYC specimens; resumable, saves after every image."""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import kyc
from app.config import settings

DOCS = settings.data_path / "kyc_documents"
OUT = Path(__file__).resolve().parents[1] / "tests" / "ocr_results.json"
TYPES = {"gst": "gst_certificate", "udyam": "udyam_certificate", "signatory": "signatory_id", "address": "address_proof"}
res = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
t0 = time.time()
for f in sorted(DOCS.glob("*.png")):
    if res.get(f.name, {}).get("v") == 3:
        continue
    dt = next(v for k, v in TYPES.items() if f"_{k}" in f.name)
    ex = kyc.extract_text(str(f))
    res[f.name] = {"v": 3, "tilt_deg": ex.get("tilt_deg"), "doc_type": dt, "quality": kyc.image_quality(str(f)), "available": ex.get("available"),
                   "error": ex.get("error"), "confidence": ex.get("confidence"), "lines": ex.get("lines", [])}
    OUT.write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f.name, "ok" if ex.get("available") else ex.get("error"), round(time.time() - t0), "s", flush=True)
print("done", sum(1 for v in res.values() if v.get("v") == 3), "of 47")
