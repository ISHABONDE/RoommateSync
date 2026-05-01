"""
Auth Routes  (v2 — upgraded with rate limiting)
────────────────────────────────────────────────
POST /auth/register       → register + trigger OTP email     [5 req/min]
POST /auth/verify-otp     → verify OTP → unlock account
POST /auth/resend-otp     → resend OTP                       [3 req/min]
POST /auth/login          → JWT login (email_verified)       [5 req/min]
GET  /auth/me             → current user (JWT protected)

All routes are also available under the /api/v1/auth/* prefix
(registered in app.py via blueprint re-registration).
"""
from flask import Blueprint, request, jsonify
from functools import wraps

from services.user_service import register_user, login_user, get_user_by_id, decode_token
from services.email_service import verify_otp, resend_otp
# limiter is imported here so rate-limit decorators can reference it
from app import limiter
from config import config

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


# ── JWT guard ──────────────────────────────────────────────────────────────────

def jwt_required(f):
    """Decorator: validates Bearer JWT in Authorization header."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"success": False, "message": "Missing or invalid token."}), 401
        token   = auth_header.split(" ", 1)[1]
        payload = decode_token(token)
        if not payload:
            return jsonify({"success": False, "message": "Token expired or invalid."}), 401
        request.user_id = payload["sub"]
        return f(*args, **kwargs)
    return decorated


# ── Endpoints ──────────────────────────────────────────────────────────────────

@auth_bp.route("/register", methods=["POST"])
@limiter.limit(config.RATE_REGISTER)
def register():
    """
    Body: { name, email, password, phone? }
    Response: 201 { success, message, user_id }
    """
    data     = request.get_json(silent=True) or {}
    name     = (data.get("name")     or "").strip()
    email    = (data.get("email")    or "").strip()
    password = (data.get("password") or "").strip()
    phone    = (data.get("phone")    or "").strip()

    if not all([name, email, password]):
        return jsonify({"success": False, "message": "name, email and password are required."}), 400

    result = register_user(name, email, password, phone)
    status = 201 if result["success"] else 400
    return jsonify(result), status


@auth_bp.route("/verify-otp", methods=["POST"])
def verify_email_otp():
    """
    Body: { email, otp }
    Response: 200 { success, message }
    """
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    otp   = (data.get("otp")   or "").strip()

    if not email or not otp:
        return jsonify({"success": False, "message": "email and otp are required."}), 400

    result = verify_otp(email, otp)
    status = 200 if result["success"] else 400
    return jsonify(result), status


@auth_bp.route("/resend-otp", methods=["POST"])
@limiter.limit(config.RATE_OTP)
def resend_email_otp():
    """
    Body: { email }
    Response: 200 { success, message }
    """
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()

    if not email:
        return jsonify({"success": False, "message": "email is required."}), 400

    result = resend_otp(email)
    status = 200 if result["success"] else 500
    return jsonify(result), status


@auth_bp.route("/login", methods=["POST"])
@limiter.limit(config.RATE_LOGIN)
def login():
    """
    Body: { email, password }
    Response: 200 { success, message, token, user }
    """
    data     = request.get_json(silent=True) or {}
    email    = (data.get("email")    or "").strip()
    password = (data.get("password") or "").strip()

    if not email or not password:
        return jsonify({"success": False, "message": "email and password are required."}), 400

    result = login_user(email, password)
    status = 200 if result["success"] else 401
    return jsonify(result), status


@auth_bp.route("/me", methods=["GET"])
@jwt_required
def me():
    """
    Header: Authorization: Bearer <token>
    Response: 200 { success, user }
    """
    user = get_user_by_id(request.user_id)
    if not user:
        return jsonify({"success": False, "message": "User not found."}), 404
    return jsonify({"success": True, "user": user}), 200
