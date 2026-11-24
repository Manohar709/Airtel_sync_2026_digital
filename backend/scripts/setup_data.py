"""Create/upgrade tables, load the supplied CSVs into reference tables (originals untouched), create the employee from .env.

Usage (from repo root):  python backend/scripts/setup_data.py
Safe to re-run: reference tables are reloaded; customer accounts and applications are kept.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pandas as pd  # noqa: E402
from app.auth import ensure_employee  # noqa: E402
from app.config import settings  # noqa: E402
from app.db import SessionLocal, migrate  # noqa: E402
from app import models as m  # noqa: E402

def load(df, model, db):
    db.query(model).delete()
    cols = [c.name for c in model.__table__.columns]
    rows = [{c: (None if pd.isna(r[c]) else r[c]) for c in cols} for r in df.to_dict("records")]
    db.bulk_insert_mappings(model, rows)


def main():
    d = settings.data_path
    migrate()
    with SessionLocal() as db:
        cat = pd.read_csv(d / "product_catalogue.csv").rename(columns={})
        load(cat, m.RefProduct, db)
        load(pd.read_csv(d / "mock_gstin_registry.csv"), m.RefGstin, db)
        load(pd.read_csv(d / "mock_udyam_registry.csv"), m.RefUdyam, db)
        leads = pd.read_csv(d / "smb_leads.csv")
        db.query(m.RefHistoricalLead).delete()
        db.bulk_insert_mappings(m.RefHistoricalLead, [{
            "lead_id": r["lead_id"], "business_type": r["business_type"], "segment": r["segment"], "city": r["city"],
            "city_tier": int(r["city_tier"]), "state": r["state"],
            "raw": {k: (None if pd.isna(v) else (v.item() if hasattr(v, "item") else v)) for k, v in r.items()},
        } for r in leads.to_dict("records")])
        db.commit()
        ensure_employee(db)
        print({"products": db.query(m.RefProduct).count(), "gstin": db.query(m.RefGstin).count(),
               "udyam": db.query(m.RefUdyam).count(), "historical_leads": db.query(m.RefHistoricalLead).count(),
               "users": db.query(m.User).count()})


if __name__ == "__main__":
    main()
