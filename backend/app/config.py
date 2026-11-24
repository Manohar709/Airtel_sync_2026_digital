from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    database_url: str = "postgresql+psycopg2://postgres:CHANGE_ME@localhost:5432/airtel_sync"
    jwt_secret: str = "dev-only-change-me"
    jwt_expire_minutes: int = 480
    llm_provider: str = "gemini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    kyc_reference_date: str = "2026-07-15"
    kyc_address_proof_max_days: int = 90
    upload_dir: str = "backend/uploads"
    upload_retention_days: int = 7
    max_upload_mb: int = 5
    data_dir: str = "6ae1873397bc1_digital/YTL_TrackA_Udyam_Digital_Data"
    cors_origins: str = "http://localhost:3000"
    # The only employee account; created/updated at startup (password stored hashed)
    employee_email: str = ""
    employee_password: str = ""
    employee_name: str = "Airtel SYNC Employee"
    guest_token_days: int = 7
    max_audio_kb: int = 2048
    rate_limit_per_hour: int = 120  # per client for guest creation, voice and help requests

    @property
    def upload_path(self) -> Path:
        p = Path(self.upload_dir)
        return p if p.is_absolute() else ROOT / p

    @property
    def data_path(self) -> Path:
        p = Path(self.data_dir)
        return p if p.is_absolute() else ROOT / p


settings = Settings()
