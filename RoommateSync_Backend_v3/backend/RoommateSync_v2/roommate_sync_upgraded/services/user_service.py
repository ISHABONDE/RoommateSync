from __future__ import annotations
"""
User Service
────────────
Handles registration, login, profile CRUD.
OTP sending is delegated to email_service.
"""
import logging
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from bson import ObjectId

from config import config
from database.models import users_col, default_user, VerificationStatus
from services.email_service import send_otp_email

logger = logging.getLogger(__name__)


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def _check_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _generate_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=config.JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, config.SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, config.SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


# ── Registration ──────────────────────────────────────────────────────────────

def register_user(name: str, email: str, password: str, phone: str = "") -> dict:
    """
    Create user + trigger OTP email.
    Returns {"success": bool, "message": str, "user_id": str | None}.
    """
    email = email.lower().strip()

    if users_col().find_one({"email": email}):
        return {"success": False, "message": "Email already registered.", "user_id": None}

    user_doc            = default_user(name, email, _hash_password(password), phone)
    result              = users_col().insert_one(user_doc)
    user_id             = str(result.inserted_id)

    otp_result = send_otp_email(email)
    logger.info(f"[UserService] Registered user={user_id}, OTP sent={otp_result['success']}")

    return {
        "success":  True,
        "message":  "Registration successful. Please verify your email with the OTP sent.",
        "user_id":  user_id,
        "_otp_sent": otp_result,
    }


# ── Login ─────────────────────────────────────────────────────────────────────

def login_user(email: str, password: str) -> dict:
    """
    Authenticate and return JWT.
    Only allows login when email_verified = True.
    """
    email = email.lower().strip()
    user  = users_col().find_one({"email": email})

    if not user:
        return {"success": False, "message": "Invalid email or password."}

    if not _check_password(password, user["password"]):
        return {"success": False, "message": "Invalid email or password."}

    if not user.get("email_verified", False):
        return {"success": False, "message": "Email not verified. Please check your inbox for the OTP."}

    token = _generate_token(str(user["_id"]))
    return {
        "success": True,
        "message": "Login successful.",
        "token":   token,
        "user": {
            "user_id":             str(user["_id"]),
            "name":                user.get("name"),
            "email":               user.get("email"),
            "email_verified":      user.get("email_verified"),
            "verification_status": user.get("verification_status"),
        },
    }


# ── Profile ───────────────────────────────────────────────────────────────────

def get_user_by_id(user_id: str) -> dict | None:
    try:
        user = users_col().find_one({"_id": ObjectId(user_id)})
    except Exception:
        return None

    if not user:
        return None

    user["user_id"] = str(user.pop("_id"))
    user.pop("password", None)
    return user


def update_user_profile(user_id: str, data: dict) -> dict:
    """Update allowed profile fields; returns updated user."""
    ALLOWED_FIELDS = {
        "name", "phone",
        "sleep_time", "wake_time", "cleanliness", "noise_tolerance",
        "smoking", "Alcohol", "study_habit", "social_level", "guest_frequency",
        "room_rent", "room_size", "wifi", "parking", "furnished",
        "room_status", "roommates_needed", "current_roommates",
        "city", "area", "pincode", "latitude", "longitude",
        "preferred_city", "preferred_area",
        "preferred_latitude", "preferred_longitude", "preferred_distance",
    }
    update = {k: v for k, v in data.items() if k in ALLOWED_FIELDS}
    if not update:
        return {"success": False, "message": "No valid fields to update."}

    users_col().update_one({"_id": ObjectId(user_id)}, {"$set": update})
    return {"success": True, "message": "Profile updated.", "updated_fields": list(update.keys())}


def update_profile_image(user_id: str, image_path: str) -> dict:
    users_col().update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"profile_image": image_path}},
    )
    return {"success": True, "message": "Profile image updated.", "profile_image": image_path}


def delete_user(user_id: str) -> dict:
    result = users_col().delete_one({"_id": ObjectId(user_id)})
    if result.deleted_count:
        return {"success": True, "message": "User deleted."}
    return {"success": False, "message": "User not found."}
