# LLD: KYC workflow

```mermaid
flowchart TD
    A["Signed-in customer gives consent"] --> M{"Registration type"}
    M -- "GSTIN / Udyam / both" --> F["Stage 2 Format: GSTIN structure + checksum (PAN 4th char X allowed); Udyam pattern (district 00 allowed)"]
    F --> R["Stage 3 Registry: ref_gstin / ref_udyam. Cancelled/Suspended = Action required; not found = Unable to verify; prefill"]
    M -- "neither" --> N["Registration = Needs manual review; GSTIN-required products blocked"]
    R --> D["Required docs: GST cert and/or Udyam cert + signatory ID + address proof"]
    N --> D2["Required docs: signatory ID + address proof"]
    D --> U["Upload PNG/JPG (type, size, image check)"]
    D2 --> U
    U --> Q{"Stage 1 Quality: blurry / low-res?"}
    Q -- yes --> QA["Action required: re-upload a sharper photo"]
    Q -- no --> O["Remove red watermark -> PaddleOCR -> de-skewed rows -> strip watermark fragments -> parse fields"]
    O --> MF{"Required fields found?"}
    MF -- no --> MA["Action required: list unreadable fields"]
    MF -- yes --> C["Stage 4 Consistency: ID numbers (OCR-tolerant: match / near / mismatch), fuzzy name + address, bill date vs 2026-07-15 (90 days), ID validity"]
    C --> S["Status per check with code + params; overall = worst status"]
    S --> E["near match / name differs / signatory = Needs manual review (employee)"]
```

Statuses: Verified (within implemented checks), Action required, Needs manual review, Pending, Unable to verify. No LLM involved; documents never leave the server; no claim of authenticity or government verification.
