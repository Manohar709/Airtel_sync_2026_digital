# LLD: AI workflow (advisor, voice, translation, employee assistant)

```mermaid
flowchart TD
    V["Voice (optional)"] -->|"Web Speech API, or audio -> /api/voice/transcribe -> Gemini (in memory)"| M
    M["Customer message or quick-reply {field, value}"] --> QR{"Quick reply?"}
    QR -- yes --> DM["Merge value deterministically"]
    QR -- no --> K{"Gemini reachable? (retries 429/503)"}
    DM --> K
    K -- yes --> G["Gemini JSON: reply in customer's language + extracted fields"]
    K -- "no / error" --> F["Rule-based fallback; UI shows Basic mode; question text localised by the frontend"]
    G --> VAL["Backend validation (pydantic), need tags whitelisted"]
    F --> VAL
    VAL --> T["City tier from dataset"]
    T --> R{"Core fields complete?"}
    R -- no --> Q["Ask next 1-2 questions"]
    R -- yes --> E["Recommendation engine (deterministic)"]
    E --> X["Gemini explains results in the customer's language (no new numbers)"]

    subgraph Translation
        TC["Catalogue descriptions / customer messages"] --> CACHE{"translation_cache hit?"}
        CACHE -- no --> GT["Gemini batch translate (numbers, names, IDs unchanged)"] --> CACHE
    end
    subgraph Employee
        EQ["Question about one application"] --> CTX["Sanitised context: masked IDs, no images"]
        CTX --> EA["Gemini answer in English, or deterministic summary"]
    end
```

Guardrails: customer text is data; Gemini never names products or prices in the chat, never decides eligibility, KYC or status, and has no database access.
