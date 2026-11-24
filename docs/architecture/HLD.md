# Airtel SYNC – High-Level Design (HLD)

Prototype only. All data is synthetic. Not an official Airtel product. No live government integrations.

## System overview

```mermaid
flowchart TB
    subgraph FE["Next.js + TypeScript + Tailwind (one app, two route groups)"]
        direction LR
        CP["Customer site (guest or signed in), 10 languages<br/>Advisor chat + voice · Plans · Catalogue & prerequisites<br/>Quote · Verify (KYC) · Review · My orders · Talk to a person"]
        EP["Employee console /employee<br/>Queues: live help, KYC exceptions, new, in progress<br/>Detail · status · notes · English translation · AI summary"]
    end

    subgraph BE["FastAPI backend (modular monolith, Pydantic + SQLAlchemy)"]
        direction TB
        AUTH["Auth & access control<br/>signed guest token · customer JWT · single employee from .env<br/>bcrypt · ownership checks · rate limits"]

        subgraph CORE["Deterministic business logic (source of truth)"]
            direction TB
            CAT["Catalogue module<br/>reads catalogue table<br/>prerequisites = requires_one_of only"]
            REC["Recommendation & eligibility engine<br/>hard: city tier, min employees/sites,<br/>requires_gstin, requires_one_of<br/>ranking: budget, stated needs"]
            QUO["Quote engine<br/>unit × quantity · setup · recurring<br/>price range + midpoint estimate<br/>excl. taxes · dependency re-check"]
            KYC["KYC readiness (4 separate stages)<br/>1 extraction · 2 format validation<br/>3 registry lookup · 4 consistency checks<br/>statuses only"]
            APP["Applications & handoff<br/>status state machine · help requests<br/>customer summary for employees"]
        end

        subgraph AIL["AI service (adapter, Gemini by config)"]
            direction TB
            ADV["Advisor<br/>follow-up questions +<br/>requirement extraction"]
            EXP["Explainer<br/>plain-language wording of engine output"]
            ESUM["Employee assistant<br/>summarise one application"]
            TOOLS["Whitelisted tools<br/>get_catalogue · recommend · build_quote<br/>check_prereqs · get_application_summary"]
        end

        LOAD["Data loader (pandas)<br/>CSV → reference tables<br/>run once at setup"]
    end

    subgraph DATA["PostgreSQL"]
        direction LR
        REF[("Reference tables (read-only)<br/>ref_products · ref_gstin · ref_udyam<br/>ref_historical_leads")]
        PORT[("Application tables<br/>users · business_profiles · conversations<br/>requirements · quotes · quote_items<br/>applications · kyc_checks · documents<br/>help_requests · audit_log")]
    end

    CSV[["Original CSV files<br/>unchanged, never written"]]
    FS[["Document storage<br/>local folder, owner/employee access only<br/>configurable retention"]]
    DOC["Docling (local)<br/>document extraction"]
    GEM(["Gemini API<br/>text only · no KYC images<br/>no raw GSTIN / PAN"])

    CP -->|REST + JWT| AUTH
    EP -->|REST + JWT| AUTH
    AUTH --> ADV & REC & QUO & KYC & APP

    ADV <-->|structured output / function calls| GEM
    EXP <--> GEM
    ESUM <--> GEM
    ADV --> TOOLS
    TOOLS --> REC & QUO & APP
    REC --> EXP

    REC --> CAT
    QUO --> CAT
    QUO --> REC
    CAT --> REF
    KYC --> REF
    KYC --> DOC
    KYC --> FS
    ADV -->|validated requirements| PORT
    QUO --> PORT
    KYC --> PORT
    APP --> PORT

    CSV -->|read only| LOAD --> REF

    QUO -. products + quote .-> APP
    KYC -. status + exceptions .-> APP
    ADV -. conversation summary .-> APP
    APP ==>|submitted application, full context| EP
```

## Phase 2 additions
- Guests can browse, chat, see plans, build a quote and ask for help; sign-in is required at verification. Guest work is merged into the account.
- "My orders" timeline (`application_events`) and resume of drafts. Live help requests reach the employee queue immediately.
- KYC registration type: GSTIN, Udyam, both or neither.
- 10-language UI (next-intl) with backend message codes; Gemini replies in the customer's language, translates catalogue descriptions (cached) and transcribes voice (in memory).
- PaddleOCR runs locally with watermark removal and de-skew; documents never go to the AI service.
See `LLD/` for sequence, AI, KYC and database details.

## Responsibility split

| Decides | Owner |
|---|---|
| Eligibility, dependencies, prices, quote totals | Backend code only |
| KYC statuses and review flags | Backend code only |
| Application status transitions and access control | Backend code only |
| Understanding messages, follow-up questions, requirement extraction | Gemini |
| Plain-language explanation and summaries | Gemini, from backend output |

Gemini receives sanitised text only and can call only the whitelisted tools. It has no SQL access and cannot approve KYC or applications.

## Main customer-to-employee flow

```mermaid
flowchart LR
    A["Customer describes business"] --> B["Advisor asks follow-ups"]
    B --> C["Backend validates<br/>extracted requirements"]
    C --> D["Eligibility engine<br/>recommends products"]
    D --> E["Prerequisites &<br/>add-ons shown"]
    E --> F["Customer selects products"]
    F --> G["Quote engine<br/>(range + midpoint estimate)"]
    G --> H["KYC readiness checks"]
    H --> I{"Issues?"}
    I -->|fixable| H
    I -->|needs help| J["Help request"]
    I -->|clear| K["Submit application"]
    J --> K
    K --> L["Employee reviews<br/>full context"]
```

## KYC pipeline (dataset rules only)

```mermaid
flowchart LR
    U["Upload + consent"] --> X["1 Extraction<br/>Docling"]
    X --> F["2 Format validation<br/>GSTIN checksum, X allowed<br/>Udyam, district 00 allowed"]
    F --> R["3 Registry lookup<br/>ref_gstin / ref_udyam"]
    R --> C["4 Consistency checks<br/>name, address,<br/>proof date vs 15-Jul-2026"]
    C --> S["Status per check:<br/>Verified (scope of check) · Action required<br/>Needs manual review · Pending · Unable to verify"]
```

Anything the dataset cannot support (for example signatory verification, since the registries have no signatory column) is marked **Pending / Needs manual review**. OCR output is never treated as proof of authenticity.

## Planned project structure

```
Hackthon_Project/
├── .env.example            # placeholders only
├── .gitignore              # .env, uploads/, node_modules, venv
├── PROJECT_STATUS.md
├── DECISIONS.md
├── docs/architecture/
│   ├── HLD.md
│   └── LLD/ customer-flow.md · ai-workflow.md · product-recommendation.md · kyc-workflow.md · database.md
├── 6ae1873397bc1_digital/  # supplied data, untouched
├── backend/
│   ├── app/
│   │   ├── main.py · config.py · db.py
│   │   ├── auth/           # JWT, hashing, role + ownership deps
│   │   ├── models/ schemas/
│   │   ├── catalogue/ recommend/ quote/ kyc/ applications/ employee/
│   │   └── ai/             # adapter, prompts, tools (separate from business logic)
│   ├── scripts/            # load_reference_data.py (pandas), seed_demo_users.py
│   └── tests/
└── frontend/
    └── src/app/
        ├── login/
        ├── customer/       # advisor · catalogue · quote · kyc · applications
        └── employee/       # dashboard · application/[id]
```

## Notes
- Docling is the preferred extractor. It will be tested against the sample images first; if it cannot read them reliably, the fallback is to tell you before swapping.
- Quotes show price ranges per unit. The single estimate is the midpoint, labelled "estimate". All prices are excl. taxes.
