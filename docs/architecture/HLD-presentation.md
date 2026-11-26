# Airtel SYNC – HLD (presentation version, as implemented)

```mermaid
flowchart LR
    %% 1. CHANNELS
    C1["Customer Web Portal<br/>English, Hindi, Telugu • Text + Voice<br/>Browse as Guest • My Orders"]
    C2["Employee Console<br/>Urgency-ranked work queue<br/>KYC check • Order fulfilment"]

    %% 2. SECURITY
    SEC["API Gateway & Privacy Shield<br/>JWT • Guest Token • bcrypt<br/>Consent • Masked GSTIN/PAN • Rate Limits"]

    %% 3. CORE ENGINE
    S1["1. AI Business Advisor<br/>Adaptive Questions • Quick Replies<br/>Voice-to-Text • Basic-Mode Fallback"]
    S2["2. Eligibility & Recommendation<br/>25 Products • Tier/Size/GSTIN Rules<br/>Prerequisites • Basic/Recommended/Advanced"]
    S3["3. Transparent Quote Engine<br/>Price Ranges + Midpoint Estimate<br/>Setup • First Month • Excl. Tax"]
    S4["4. Smart KYC Readiness<br/>GSTIN/Udyam/None • Checksum<br/>OCR • Cross-Checks • 5 Statuses"]
    S5["5. Application & Handoff<br/>Submit • Order Timeline<br/>Live Help • Status Workflow"]

    %% 4. AI, DATA & MOCK INTEGRATIONS
    AI["Gemini API<br/>Chat • Explain • Transcribe • Translate<br/>Text/Audio only - no documents"]
    D1[("PostgreSQL<br/>25 SKUs • 3,534 GSTIN • 2,723 Udyam<br/>5k Leads • Applications • Events")]
    D2["Local OCR & Document Store<br/>PaddleOCR • Watermark/Skew Fix<br/>Retention Purge"]
    D3["Mock Registries<br/>GST & Udyam CSV Lookups<br/>Prototype - not Govt APIs"]

    %% LEFT-TO-RIGHT FLOW
    C1 --> SEC
    C2 --> SEC
    SEC --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> S5
    S5 ==>|"Full context handoff"| C2

    %% DATA & SERVICE CONNECTIONS
    S1 -.-> AI
    S5 -.->|"Summary • English translation"| AI
    S2 --> D1
    S3 --> D1
    S4 --> D2
    S4 --> D3
    S5 --> D1

    %% PASTEL COLOURS
    style C1 fill:#ffe3e3,stroke:#e03131,stroke-width:2px,color:#1a1a1a
    style C2 fill:#ffe3e3,stroke:#e03131,stroke-width:2px,color:#1a1a1a
    style SEC fill:#ebfbee,stroke:#2f9e44,stroke-width:2px,color:#1a1a1a
    style S1 fill:#e7f5ff,stroke:#1971c2,stroke-width:2px,color:#1a1a1a
    style S2 fill:#e7f5ff,stroke:#1971c2,stroke-width:2px,color:#1a1a1a
    style S3 fill:#e7f5ff,stroke:#1971c2,stroke-width:2px,color:#1a1a1a
    style S4 fill:#e7f5ff,stroke:#1971c2,stroke-width:2px,color:#1a1a1a
    style S5 fill:#e7f5ff,stroke:#1971c2,stroke-width:2px,color:#1a1a1a
    style AI fill:#f3f0ff,stroke:#7048e8,stroke-width:2px,color:#1a1a1a
    style D1 fill:#fff9db,stroke:#f08c00,stroke-width:2px,color:#1a1a1a
    style D2 fill:#fff9db,stroke:#f08c00,stroke-width:2px,color:#1a1a1a
    style D3 fill:#f8f9fa,stroke:#495057,stroke-width:2px,stroke-dasharray: 5 5,color:#1a1a1a
```

**Key principle:** the AI understands and explains; the backend decides. Eligibility, prices, KYC status and application status are deterministic backend rules. Gemini never sees document images or raw identifiers.
