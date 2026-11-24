# LLD: Eligibility, dependencies and recommendation

```mermaid
flowchart TD
    N["Need tags from advisor"] --> C["Candidate products per need (NEED_PRODUCTS)"]
    C --> H{"Hard checks per product"}
    H -->|"city tier not sold / below min employees / below min sites / GSTIN declared absent"| X["not_eligible (reason shown)"]
    H -->|pass| OK["eligible candidates, sorted by midpoint price"]
    OK --> P["Pick per tier: Basic = cheapest, Recommended = middle segment match, Advanced = highest segment match"]
    P --> D["Resolve requires_one_of: choose a link that satisfies all dependents; add cheapest eligible provider if missing"]
    D --> A["Advanced only: add connectivity products that list the chosen link as a prerequisite option"]
    A --> Q["Quote engine: qty x price range, setup, totals, excl. taxes"]
    Q --> S["Per-product status: eligible / prerequisite_required / not_eligible; pending: site feasibility, GSTIN check, unknown city"]
```

Hard constraints: city tier, `min_employees`, `min_sites`, `requires_gstin`, `requires_one_of`. Preferences (segment match, budget) only rank or flag; budget never removes a product.
