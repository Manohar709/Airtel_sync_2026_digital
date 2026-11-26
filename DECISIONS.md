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

## Phase 3 (supersedes the KYC and flow rules above where they differ)
- **Smart KYC verdict:** every check is ok / ask (customer can fix now) / hold (a person checks). One verdict per application: hold if any hold, else ask if anything to fix or upload, else pass. A clean application (pass) is **approved automatically at submit**; only holds reach the team.
- **Answer key for the 12 specimens** (asserted by `backend/tests/test_kyc_specimens.py`): K01 hold (cancelled GSTIN, blank Udyam number), K02 pass (7 degree tilt straightened), K03 pass, K04 ask (blurred), K05 ask (Udyam certificate missing), K06 hold (GSTIN digit changed, checksum fails, registry suggests the real one), K07 hold (legal name word changed), K08 pass (0/O look-alike), K09 pass, K10 pass (I/J look-alike), K11 ask (bill 257 days old), K12 pass.
- **Look-alike repair** only swaps OCR/print look-alikes (0/O/Q/D, 1/I/J/L, 5/S, 8/B, 2/Z, 6/G) and is accepted only if the checksum passes AND the registry has the result; any other difference is a real change. A checksum failure printed on the certificate = hold ("may be altered"); typed by the customer = ask ("did you mean").
- **Name check** compares words (OCR slips within a word tolerated); a changed distinctive word is a hold and shows which word changed.
- **Signatory:** the ID holder named in the registry legal name (proprietor) or a signing role (owner, partner, director, ...) passes; signing is confirmed by OTP e-sign. Other roles go to the team.
- **No GST / Udyam:** not sent to the team by default. ID (or DigiLocker) and bill must agree with each other and with the city given in chat; the registry is searched by name and city so a cancelled GSTIN cannot be hidden; the technician confirms the address at installation. GSTIN-only products stay blocked.
- **Mobile OTP** is required for everyone (unreachable or wrong numbers lost 1,124 leads). **DigiLocker** is simulated: name + last 4 Aadhaar digits + OTP; the full Aadhaar number is never accepted or stored. OTP codes are hashed, expire in 10 minutes, 5 attempts; with `DEMO_MODE=true` the code is shown on screen because there is no SMS gateway.
- **OCR performance:** PaddleOCR loads at startup in a background thread; inference runs in a worker thread (the API never blocks) and one at a time; results are cached by image SHA-256 (specimen results pre-seeded from `tests/ocr_results.json`).
- **Order lifecycle** (`backend/app/orders.py`): submitted -> approved -> confirmed (customer OTP e-sign + UPI AutoPay mandate, simulated; a failed first payment holds the order) -> scheduled (technician, date, window) -> installed -> live; side states in_review, awaiting_customer (team message shown to the customer), closed. Per-service ETA = confirmation date + `typical_install_days`; 21-day SLA flag.
- **Employee console:** one urgency-ranked work queue (call-backs, verification holds, installations at risk first) with waiting time, one-tap call (`tel:`) and WhatsApp (`wa.me`) links, call outcome logging, and a context-aware next-action panel. WhatsApp Business API is not used (needs Meta verification and paid templates); share links only.
- **One recommended plan** replaces Basic/Recommended/Advanced: the recommended bundle plus optional add-ons that build on it, and a "lower-cost version" switch. Every change is priced by the backend.
- **Privacy:** phone, email, GSTIN, PAN, Aadhaar and Udyam numbers are redacted from any text sent to Gemini; the advisor sends only the last 8 turns.

## Phase 4: UI and clean-up
- Visual system: Airtel red used with restraint plus a crimson-to-wine brand gradient and warm charcoal; Sora for headings, Plus Jakarta Sans for text (Noto for Indic scripts). Product artwork is drawn in code per category (no Airtel imagery or logo).
- Header: slim dark utility bar (audience, language, Staff login) above the main navigation; dark footer with the privacy summary.
- Demo-only controls removed from customer screens: the K01-K12 loader moved to the staff console ("KYC check", read-only, nothing stored); the payment-failure simulation is no longer shown (backend logic kept and tested); one-time codes appear as an SMS-style notification because there is no SMS gateway (DEMO_MODE).
- Chatbot: quick-reply taps are merged deterministically and answered with the next question without calling the model (no repetition, fewer tokens); typed messages acknowledge only what is new; the recommendation explanation talks about the single recommended plan.

## Final scope (supersedes earlier language and staff-console notes)
- Languages offered: English, Hindi and Telugu only (UI, advisor replies, voice). Other locales were removed from the UI and the backend.
- Staff console kept simple: work queue, KYC check, case page with one next-action panel. The AI brief, internal notes/history panel and call-outcome logging were removed from the UI. "Return to customer" sends an automatic message built from the held checks (no typing).
- Call and WhatsApp buttons on the staff side are a demo: they open the employee's phone dialer or WhatsApp (tel: / wa.me) and are not integrated with a call centre or the WhatsApp Business API. The customer-side WhatsApp share was removed.
