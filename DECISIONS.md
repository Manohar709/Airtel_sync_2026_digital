# Decisions

## Architecture (approved HLD, extended in Phase 2)
Next.js 16 (TypeScript, Tailwind v4) app with a public customer site and an `/employee` console; FastAPI modular monolith; PostgreSQL; Gemini behind a config adapter (`backend/app/ai.py`); PaddleOCR (local) for document text; JWT auth. See `docs/architecture/HLD.md` and `docs/architecture/LLD/`.

## Accounts and sessions (Phase 2)
- Visitors browse, chat, see plans and build a quote as **guests**: the backend issues a signed guest token (no table); their application row has `guest_id`, `user_id = NULL`.
- Sign-in / sign-up is required only to continue to verification. On sign-in the guest's chat, requirements and cart are merged into the account (`merge_guest`). Customers: name, email, mobile, bcrypt password.
- "My orders" lists all applications with an `application_events` timeline and an estimated activation date (submission date + longest `typical_install_days`, labelled estimate). Drafts can be resumed.
- Logout clears only browser state (customer token + guest token) so the next person on a shared device starts fresh.
- The **only** employee account comes from `.env` (`EMPLOYEE_EMAIL`, `EMPLOYEE_PASSWORD`), created/rehashed at startup; employee endpoints also check the email. Old demo accounts are deleted at startup. No demo buttons or passwords in the UI.

## Rules followed (unchanged)
- Datasets are the source of truth; CSVs never modified; loaded into `ref_*` tables; historical leads separate from applications.
- Eligibility = catalogue fields only (`available_city_tiers`, `min_employees`, `min_sites`, `requires_gstin`, `requires_one_of`). "Works with" = reverse of `requires_one_of`; "Alternatives" = same need tag. Devices/other add-ons are not in the catalogue and are not invented.
- City tier comes from `smb_leads.csv`; unknown city or site feasibility = pending.
- Pricing: range shown; estimate = midpoint, labelled; excludes taxes (no GST rate assumed); setup = per unit x quantity.
- LLM never decides eligibility, prices, KYC or application status; it never sees document images or raw GSTIN/PAN.

## Languages and voice
- UI in 10 languages (en, hi, te, ta, kn, ml, mr, bn, gu, pa) with **next-intl** (client provider, locale in localStorage and on the account). Indic fonts self-hosted via @fontsource (Noto Sans per script) + Plus Jakarta Sans.
- Backend returns **message codes + params** (eligibility checks, quote issues, recommendation reasons, all KYC checks); the frontend localises them. English `detail` text is kept for employees and logs.
- Non-English locale files are **machine translations** produced by Gemini (`frontend/scripts/translate_locales.py`, placeholders validated). **Native-speaker review is required before real use.** `node scripts/check-locales.mjs` checks key/placeholder parity.
- Catalogue descriptions are translated at runtime by Gemini and cached in `translation_cache`; product names, prices, units and rules are never translated. Shown with a "translated automatically" note.
- The advisor replies in the selected language (or the language the customer writes in); extraction stays canonical English. Quick-reply chips send a structured `{field, value}` answer that the backend merges deterministically, so they work in every language and in basic mode.
- Employee console is English; customer messages can be shown with an English translation (cached).
- Voice: browser Web Speech API for live dictation when available; otherwise MediaRecorder audio is sent to `/api/voice/transcribe` and transcribed by Gemini in memory (never stored, size-capped, rate-limited). One-time consent notice; no mic on KYC screens. Optional read-aloud via browser speechSynthesis when a voice exists. Mic needs HTTPS or localhost.

## KYC (dataset rules only)
- Registration type chosen by the customer: GSTIN, Udyam, both, or **neither**. Neither = no registry steps, only signatory ID + address proof, business registration -> "Needs manual review (pending employee review)", GSTIN-required products blocked (eligibility + an explicit KYC check).
- GSTIN: structure + checksum, `X` allowed as PAN 4th char; Udyam `UDYAM-XX-00-0000000`, district `00` allowed; Cancelled/Suspended = Action required; not found = Unable to verify.
- Address proof <= 90 days before 2026-07-15 (`KYC_REFERENCE_DATE`). Tolerant name/address matching; mismatches go to review, only clearly different names are Action required. Signatory authority is always manual review (registries hold no signatory field).
- OCR: PaddleOCR 3.x with `enable_mkldnn=False` (oneDNN path fails on Windows CPU). Before OCR the light-red "SYNTHETIC SPECIMEN" watermark is removed by colour; leftover fragments are stripped; rows are grouped in a de-skewed frame (handles tilted scans such as K02). Identifier comparison undoes common OCR confusions (O/0, S/5, ...) by GSTIN position; 1-2 remaining differences = "near" -> manual review, not rejection.
- Blur check calibrated on the specimens (K04 GST certificate ~1 vs 900+ for legible ones; threshold 100).

## Robustness
- Gemini calls retry on 429/500/503 with backoff; on failure the advisor uses the rule-based fallback and the UI shows "Basic mode" (last error exposed on `/health`).
- npm registry (`registry.npmjs.org`) resets TLS on this network; packages were installed via `registry.yarnpkg.com` (same packages, integrity hashes checked by npm).

## Simplifications / deferred
- Application keeps conversation, cart, quote snapshot, KYC state and notes as JSON on one row; events in `application_events`.
- In-memory rate limiting (per process). No email/SMS notifications, no password reset, no payment, no e-sign, no GIS feasibility.
- Needs confirmation before real use: DPDP/legal compliance, retention periods, tax treatment, document requirements, translation quality, speech-service data terms.
