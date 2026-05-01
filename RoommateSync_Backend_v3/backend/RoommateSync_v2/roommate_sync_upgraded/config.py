import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # ── App ───────────────────────────────────────────────────────────────────
    SECRET_KEY: str = os.getenv("SECRET_KEY", "roommate-sync-secret-key-change-in-prod")
    DEBUG: bool     = os.getenv("DEBUG", "False").lower() == "true"

    # ── MongoDB ───────────────────────────────────────────────────────────────
    MONGO_URI: str     = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
    MONGO_DB_NAME: str = os.getenv("MONGO_DB_NAME", "roommate_sync")

    # ── JWT ───────────────────────────────────────────────────────────────────
    JWT_EXPIRY_HOURS: int = int(os.getenv("JWT_EXPIRY_HOURS", "24"))

    # ── Flask-Mail (SMTP) ─────────────────────────────────────────────────────
    MAIL_SERVER: str         = os.getenv("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT: int           = int(os.getenv("MAIL_PORT", "587"))
    MAIL_USE_TLS: bool       = os.getenv("MAIL_USE_TLS", "True").lower() == "true"
    MAIL_USE_SSL: bool       = os.getenv("MAIL_USE_SSL", "False").lower() == "true"
    MAIL_USERNAME: str       = os.getenv("MAIL_USERNAME", "")
    MAIL_PASSWORD: str       = os.getenv("MAIL_PASSWORD", "")
    MAIL_DEFAULT_SENDER: str = os.getenv("MAIL_DEFAULT_SENDER", "noreply@roomatesync.com")

    # ── OTP ───────────────────────────────────────────────────────────────────
    OTP_EXPIRY_MINUTES: int = int(os.getenv("OTP_EXPIRY_MINUTES", "10"))

    # ── File Uploads ──────────────────────────────────────────────────────────
    BASE_DIR: str          = os.path.dirname(os.path.abspath(__file__))
    UPLOAD_BASE: str       = os.path.join(BASE_DIR, "uploads")
    UPLOAD_PROFILES: str   = os.path.join(UPLOAD_BASE, "profiles")
    UPLOAD_DOCUMENTS: str  = os.path.join(UPLOAD_BASE, "documents")
    UPLOAD_SELFIES: str    = os.path.join(UPLOAD_BASE, "selfies")
    UPLOAD_ROOMS: str       = os.path.join(UPLOAD_BASE, "rooms")       # room photos
    UPLOAD_AGREEMENTS: str  = os.path.join(UPLOAD_BASE, "agreements")  # room agreements
    MAX_CONTENT_LENGTH: int = 16 * 1024 * 1024                         # 16 MB

    ALLOWED_IMAGE_EXTENSIONS: set     = {"png", "jpg", "jpeg", "webp"}
    ALLOWED_DOC_EXTENSIONS: set       = {"png", "jpg", "jpeg", "pdf"}
    ALLOWED_AGREEMENT_EXTENSIONS: set = {"pdf", "jpg", "jpeg", "png"}

    # ── ML / Dataset ──────────────────────────────────────────────────────────
    DATASET_PATH: str         = os.path.join(BASE_DIR, "dataset", "roommate_dataset.csv")
    KMEANS_CLUSTERS: int      = int(os.getenv("KMEANS_CLUSTERS", "5"))
    KNN_NEIGHBORS: int        = int(os.getenv("KNN_NEIGHBORS", "20"))
    TOP_RECOMMENDATIONS: int  = int(os.getenv("TOP_RECOMMENDATIONS", "10"))

    # ── Rate Limiting (Flask-Limiter) ─────────────────────────────────────────
    # Use "redis://localhost:6379" in production for distributed deployments
    RATELIMIT_STORAGE_URI: str = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATE_LOGIN: str            = os.getenv("RATE_LOGIN",    "5 per minute")
    RATE_REGISTER: str         = os.getenv("RATE_REGISTER", "5 per minute")
    RATE_OTP: str              = os.getenv("RATE_OTP",      "3 per minute")


config = Config()
