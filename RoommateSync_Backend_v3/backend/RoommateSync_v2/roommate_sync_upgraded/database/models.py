"""
Thin model layer — collection handles + schema helpers
(v2: added rooms_col index helper, no breaking changes)
"""
from datetime import datetime, timezone
from database.db import get_db


# ── Collection accessors ──────────────────────────────────────────────────────

def users_col():
    return get_db()["users"]

def documents_col():
    return get_db()["documents"]

def rooms_col():
    return get_db()["rooms"]

def matches_col():
    return get_db()["matches"]

def chat_requests_col():
    return get_db()["chat_requests"]

def messages_col():
    return get_db()["messages"]

def notifications_col():
    return get_db()["notifications"]

def admins_col():
    return get_db()["admins"]

def analytics_col():
    return get_db()["analytics"]

def otps_col():
    return get_db()["otps"]


# ── Verification status constants ─────────────────────────────────────────────

class VerificationStatus:
    NOT_VERIFIED = 0
    PENDING      = 1
    VERIFIED     = 2
    REJECTED     = 3


# ── Default user document ─────────────────────────────────────────────────────

def default_user(
    name: str,
    email: str,
    password_hash: str,
    phone: str = "",
) -> dict:
    return {
        "name":              name,
        "email":             email.lower().strip(),
        "phone":             phone,
        "password":          password_hash,

        # ── email verification ──────────────────────────────────────────────
        "email_verified":    False,

        # ── profile / documents ─────────────────────────────────────────────
        "profile_image":     "",
        "id_document":       "",
        "ocr_text":          "",
        "ocr_data":          {},

        # ── verification workflow ───────────────────────────────────────────
        "verification_status": VerificationStatus.NOT_VERIFIED,

        # ── lifestyle preferences ───────────────────────────────────────────
        "sleep_time":        None,
        "wake_time":         None,
        "cleanliness":       None,
        "noise_tolerance":   None,
        "smoking":           None,
        "Alcohol":           None,
        "study_habit":       None,
        "social_level":      None,
        "guest_frequency":   None,

        # ── room preferences ────────────────────────────────────────────────
        "room_rent":         None,
        "room_size":         None,
        "wifi":              None,
        "parking":           None,
        "furnished":         None,
        "room_status":       None,
        "roommates_needed":  None,
        "current_roommates": None,

        # ── location (flat + GeoJSON) ────────────────────────────────────────
        # Flat fields kept for backward compatibility with legacy services
        "city":              "",
        "area":              "",
        "pincode":           "",
        "latitude":          None,
        "longitude":         None,
        # GeoJSON Point — populated by location_service.update_user_location()
        # Format: { "type": "Point", "coordinates": [longitude, latitude] }
        "location":          None,

        # ── preferred location ───────────────────────────────────────────────
        "preferred_city":      "",
        "preferred_area":      "",
        "preferred_latitude":  None,
        "preferred_longitude": None,
        "preferred_distance":  5,

        # ── admin role ──────────────────────────────────────────────────────
        "is_admin":          False,

        "created_at": datetime.now(timezone.utc).isoformat(),
    }