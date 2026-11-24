# LLD: Database

```mermaid
erDiagram
    users ||--o{ applications : "owns (after sign-in)"
    applications ||--o{ documents : has
    applications ||--o{ application_events : timeline
    ref_products ||--o{ applications : "cart items reference product_id"
    ref_gstin }o--o| applications : "looked up by kyc.gstin"
    ref_udyam }o--o| applications : "looked up by kyc.udyam"

    users { int id PK  string email  string name  string role  string phone  string language  string password_hash }
    applications {
        int id PK
        int user_id FK "NULL while guest"
        string guest_id "signed guest token id"
        string status
        string language
        json messages
        json requirements
        json cart
        json quote "snapshot at submit"
        json kyc "consent, mode, identifiers, snapshot"
        bool help_requested
        string help_status "open | in_progress | resolved"
        string help_name
        string help_phone
        json employee_notes
    }
    application_events { int id PK  int application_id FK  datetime at  string kind  string status  string by }
    documents { int id PK  int application_id FK  string doc_type  string path  json extracted  json quality  datetime uploaded_at }
    translation_cache { int id PK  string lang  string key "sha1 of source"  text text }
    ref_products { string product_id PK  string product_name  float price_min  float price_max  float setup  string requires_one_of }
    ref_gstin { string gstin PK  string legal_name  string trade_name  string status }
    ref_udyam { string udyam_number PK  string enterprise_name  string city }
    ref_historical_leads { string lead_id PK  string business_type  string segment  string city  int city_tier }
```

`ref_*` tables are loaded from the supplied CSVs and are read-only. Schema upgrades for existing databases are idempotent `ALTER ... IF NOT EXISTS` statements run at startup (`app/db.py`).
