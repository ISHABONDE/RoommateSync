"""
RoommateSync — Flask Application Entry Point  (v2 — Upgraded)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Upgrades in this version
─────────────────────────
• API versioning  : all legacy routes still work AND /api/v1/* aliases added
• Flask-Limiter   : rate-limits on auth endpoints
• Flask-SocketIO  : real-time WebSocket chat layer
• Room image upload folder created on startup
• MongoDB geospatial index ensured on startup
"""
import os
import logging

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_mail import Mail
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_socketio import SocketIO

from config import config
from database.db import MongoDB

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if config.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ── Shared extension instances (initialised inside create_app) ─────────────────
mail    = Mail()
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=config.RATELIMIT_STORAGE_URI,
    default_limits=[],          # no global limit; set per-route
)
socketio = SocketIO(cors_allowed_origins="*", async_mode="threading")


def create_app() -> Flask:
    app = Flask(__name__)

    # ── Config ─────────────────────────────────────────────────────────────────
    app.config["SECRET_KEY"]          = config.SECRET_KEY
    app.config["MAX_CONTENT_LENGTH"]  = config.MAX_CONTENT_LENGTH
    app.config["MAIL_SERVER"]         = config.MAIL_SERVER
    app.config["MAIL_PORT"]           = config.MAIL_PORT
    app.config["MAIL_USE_TLS"]        = config.MAIL_USE_TLS
    app.config["MAIL_USE_SSL"]        = config.MAIL_USE_SSL
    app.config["MAIL_USERNAME"]       = config.MAIL_USERNAME
    app.config["MAIL_PASSWORD"]       = config.MAIL_PASSWORD
    app.config["MAIL_DEFAULT_SENDER"] = config.MAIL_DEFAULT_SENDER
    # Expose limiter config so Flask-Limiter can read the storage URI
    app.config["RATELIMIT_STORAGE_URI"] = config.RATELIMIT_STORAGE_URI

    # ── Extensions ─────────────────────────────────────────────────────────────
    CORS(app, resources={r"/*": {"origins": "*"}})
    mail.init_app(app)
    limiter.init_app(app)
    socketio.init_app(app)

    # ── Database ────────────────────────────────────────────────────────────────
    MongoDB.connect()

    # Ensure geospatial 2dsphere index exists so $near queries work
    _ensure_indexes()

    # ── Upload directories ──────────────────────────────────────────────────────
    for folder in (
        config.UPLOAD_PROFILES,
        config.UPLOAD_DOCUMENTS,
        config.UPLOAD_SELFIES,
        config.UPLOAD_ROOMS,
        config.UPLOAD_AGREEMENTS,   # room agreements
    ):
        os.makedirs(folder, exist_ok=True)

    # ── Register blueprints (legacy prefixes) ────────────────────────────────
    from routes.auth_routes           import auth_bp
    from routes.user_routes           import users_bp
    from routes.document_routes       import documents_bp
    from routes.recommendation_routes import recommend_bp
    from routes.chat_routes           import chat_bp
    from routes.notification_routes   import notifications_bp
    from routes.location_routes       import location_bp
    from routes.room_routes           import rooms_bp
    from routes.admin_routes          import admin_bp

    legacy_blueprints = (
        auth_bp, users_bp, documents_bp, recommend_bp,
        chat_bp, notifications_bp, location_bp, rooms_bp, admin_bp,
    )
    for bp in legacy_blueprints:
        app.register_blueprint(bp)

    # ── Register blueprints again under /api/v1/* (versioned aliases) ─────────
    # Flask ≥ 2.x allows re-registration with a different `name`.
    # We strip the leading "/" from each blueprint's url_prefix and map it
    # under /api/v1/.
    versioned_map = {
        auth_bp:           "api/v1/auth",
        users_bp:          "api/v1/users",
        documents_bp:      "api/v1/documents",
        recommend_bp:      "api/v1/recommend",
        chat_bp:           "api/v1/chat",
        notifications_bp:  "api/v1/notifications",
        location_bp:       "api/v1/location",
        rooms_bp:          "api/v1/rooms",
        admin_bp:          "api/v1/admin",
    }
    for bp, prefix in versioned_map.items():
        app.register_blueprint(bp, url_prefix=f"/{prefix}", name=f"{bp.name}_v1")

    # ── Register additional v1-only blueprints ────────────────────────────────
    from routes.recommendation_routes import recommendations_v1_bp, roommates_v1_bp
    app.register_blueprint(recommendations_v1_bp)
    app.register_blueprint(roommates_v1_bp)

    # ── Register WebSocket events ────────────────────────────────────────────
    from chat.socket_events import register_socket_events
    register_socket_events(socketio)

    # ── Serve uploaded files ─────────────────────────────────────────────────
    @app.route("/uploads/<path:filename>", methods=["GET"])
    def serve_upload(filename):
        """
        Serve any file from the uploads/ folder.
        e.g. GET /uploads/profiles/abc.jpg → returns the image file.
        """
        return send_from_directory(config.UPLOAD_BASE, filename)

    # ── Health check ────────────────────────────────────────────────────────
    @app.route("/health", methods=["GET"])
    @app.route("/api/v1/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "app": "RoommateSync", "api_version": "v1"}), 200

    # ── Error handlers ────────────────────────────────────────────────────────
    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"success": False, "message": "Endpoint not found."}), 404

    @app.errorhandler(413)
    def too_large(_):
        return jsonify({"success": False, "message": "File too large (max 16 MB)."}), 413

    @app.errorhandler(429)
    def rate_limited(_):
        return jsonify({"success": False, "message": "Too many requests. Please slow down."}), 429

    @app.errorhandler(500)
    def server_error(exc):
        logger.exception(exc)
        return jsonify({"success": False, "message": "Internal server error."}), 500

    logger.info("RoommateSync app created ✓  (WebSockets + Rate-Limiting + API v1)")
    return app


def _ensure_indexes() -> None:
    """Create MongoDB indexes needed for geospatial queries and performance."""
    from database.db import get_db
    from pymongo import ASCENDING, GEOSPHERE

    db = get_db()
    try:
        # Geospatial index on users.location (GeoJSON Point)
        db["users"].create_index([("location", GEOSPHERE)], sparse=True)
        # Regular index for flat lat/lng queries (legacy service)
        db["users"].create_index([("latitude", ASCENDING), ("longitude", ASCENDING)], sparse=True)
        # Geospatial index on rooms.location
        db["rooms"].create_index([("location", GEOSPHERE)], sparse=True)
        logger.info("[DB] Geospatial indexes ensured ✓")
    except Exception as exc:
        logger.warning(f"[DB] Index creation warning: {exc}")


# Create app at module scope so production WSGI servers can import it.
application = create_app()

# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Use socketio.run instead of app.run so WebSocket transport works
    socketio.run(
        application,
        host="0.0.0.0",
        port=int(os.getenv("PORT", 5000)),
        debug=config.DEBUG,
        allow_unsafe_werkzeug=True,   # required when debug=True with SocketIO
    )