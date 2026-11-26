# Project status

## Phase 3 checkpoint
- Smart KYC rebuilt (verdict pass / ask / hold, strict look-alike repair, registry suggestion, word-level name check, signatory roles, self-fixed notes, non-GST path with registry search). `python -m tests.test_kyc_specimens` runs the 12 specimen applicants against the answer key.
- Mobile OTP + simulated DigiLocker; OCR non-blocking, warmed at startup, cached by image hash; demo loader K01-K12 on the Verify page.
- Order lifecycle with auto-approval, OTP e-sign + AutoPay (simulated), technician scheduling, installed, live; per-service ETAs; customer dashboard (My orders) with the one next action; employee work queue with call / WhatsApp / outcome logging.
- One recommended plan with add-ons; Review is read-only and only reachable when verification allows submitting; chat typing bug fixed, side panel removed, "Talk to a person" always visible; PII redaction before Gemini.
- Tests: `python -m tests.test_api` (now includes OTP, DigiLocker, full order lifecycle) and core tests pass.

## Phase 2 checkpoint (in progress)

### Done
- Backend: guest sessions (signed guest token), customer sign-up/login with guest merge, single employee from `.env`, "My orders" + `application_events` timeline + resume, live help requests (guests give name + phone) visible to employees immediately, queue-first employee API, KYC modes (GSTIN / Udyam / both / neither), message codes for localisation, Gemini language-aware advisor + structured quick replies, voice transcription endpoint, cached catalogue/conversation translation, Gemini retries, idempotent PostgreSQL migration (verified on `Airtel_Sync`).
- KYC OCR: PaddleOCR 3.7 installed and working (`enable_mkldnn=False`), watermark removal, de-skew for tilted scans, OCR-tolerant GSTIN/Udyam comparison.
- Frontend rebuilt: landing, advisor (chips, voice, read-aloud, live panel), plans (3 tiers + comparison), catalogue, quote (+/- steppers, sticky summary), account (sign in / create), verify, review, my orders, help dialog everywhere, employee login + console (queues, detail, help, KYC, translation, AI). next-intl (now English, Hindi, Telugu; see DECISIONS "Final scope"); type-check clean.
- Tests: `python -m tests.test_api` (guest, merge, help, KYC modes, roles, orders) and core tests pass.
- Docs: DECISIONS.md, HLD.md, LLD (customer-flow, ai-workflow, kyc-workflow, database) updated.

- Basic-mode advisor hardened (comma-before-number crash fixed, a few Hindi keywords, never returns 500).
- Frontend `npx tsc --noEmit` clean and `npx next build` passes (13 routes). Locales layer over English, so untranslated keys show English.

### Not verified / remaining
1. **Translations:** only `hi` (8 newest keys missing) and `te` (16 missing) exist; 7 languages pending because the **Gemini free-tier quota was exhausted (429)**. After the quota resets (or with a paid key) run `python frontend/scripts/translate_locales.py` (fills only missing keys), then `node frontend/scripts/check-locales.mjs`. Until then those languages show English.
2. **12-applicant OCR batch test skipped by decision** (slow on CPU). OCR fixes were verified on K01/K02/K06 samples only; other applicants are not verified. Run later from repo root: `python backend/scripts/ocr_specimens.py` (resumable; ~15-30 s per image on CPU), then `python backend/scripts/kyc_specimen_table.py backend/tests/ocr_results.json` to print what each applicant triggers.
3. Live browser run of the full journey (customer + employee) and voice input in a real browser have not been exercised; backend journey is covered by `tests.test_api` with OCR stubbed.
4. Gemini-backed features (natural advisor replies, explanations, translation, voice transcription, employee AI) were blocked by the quota at the end; the fallback paths are tested.

### How to run
1. `.env` (see `.env.example`): `DATABASE_URL` (URL-encode special chars in the password), `JWT_SECRET`, `GEMINI_API_KEY`, **`EMPLOYEE_EMAIL`, `EMPLOYEE_PASSWORD`** (needed for the employee login).
2. `pip install -r backend/requirements.txt` and `pip install -r backend/requirements-ocr.txt` (PaddleOCR).
3. `python backend/scripts/setup_data.py` (tables/migration, CSV load, employee from `.env`).
4. `cd backend && uvicorn app.main:app --reload --port 8000`
5. `cd frontend && npm install --registry=https://registry.yarnpkg.com && npm run dev` -> http://localhost:3000 (employee: http://localhost:3000/employee/login). Microphone works only on localhost or HTTPS.
6. Tests: `cd backend && python -m tests.test_api`; locales: `cd frontend && node scripts/check-locales.mjs`.

### Demo data
- Clean path: Saffron Unisex Salon, Jaipur, GSTIN `08YKZXS5189L1ZO` (Active) + K06 documents.
- K01: GSTIN `37IHKXV5167L1ZS` Cancelled; Udyam number blank on certificate. K02: tilted GST scan. K04: blurry GST certificate. K05: no Udyam certificate.
- PPT says K06 bill is expired; it is dated 2026-06-11 (34 days before 2026-07-15), so it is fresh.
