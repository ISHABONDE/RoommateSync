"""
Admin Routes  (v2 — proper role protection + expanded functionality)
────────────────────────────────────────────────────────────────────
All routes require is_admin: true on the user document.
Use the seed script or MongoDB shell to promote a user:

  db.users.updateOne({ email: "you@example.com" }, { $set: { is_admin: true } })

Endpoints
─────────
GET    /admin/analytics              → dashboard stats
GET    /admin/users                  → paginated user list
GET    /admin/users/<id>             → single user detail
DELETE /admin/users/<id>             → delete user
PATCH  /admin/users/<id>/promote     → grant/revoke admin role
POST   /admin/verify-document        → set KYC verification status
GET    /admin/pending-kyc            → list users pending KYC review
GET    /admin/rooms                  → all room listings
DELETE /admin/rooms/<id>             → delete a room
POST   /admin/retrain-model          → retrain ML matching engine
POST   /admin/upload-dataset         → upload new CSV dataset
"""
import os
from functools import wraps

from flask import Blueprint, request, jsonify
from bson import ObjectId

from routes.auth_routes import jwt_required
from services.user_service import get_user_by_id
from database.models import (
    users_col, documents_col, rooms_col,
    chat_requests_col, messages_col, VerificationStatus,
)
from ml.matching_engine import get_matching_engine
from config import config

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


# ── Admin role guard ───────────────────────────────────────────────────────────

def admin_required(f):
    """
    Decorator: requires the caller to have is_admin: true in their user document.
    Must be applied AFTER @jwt_required so request.user_id is already set.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_user_by_id(request.user_id)
        if not user or not user.get("is_admin", False):
            return jsonify({
                "success": False,
                "message": "Admin access required.",
            }), 403
        return f(*args, **kwargs)
    return decorated


# ── Analytics ─────────────────────────────────────────────────────────────────

@admin_bp.route("/analytics", methods=["GET"])
@jwt_required
@admin_required
def analytics():
    """Dashboard summary statistics."""
    total_users  = users_col().count_documents({})
    verified     = users_col().count_documents({"verification_status": VerificationStatus.VERIFIED})
    pending_kyc  = users_col().count_documents({"verification_status": VerificationStatus.PENDING})
    rejected     = users_col().count_documents({"verification_status": VerificationStatus.REJECTED})
    email_ver    = users_col().count_documents({"email_verified": True})
    admins       = users_col().count_documents({"is_admin": True})
    total_rooms  = rooms_col().count_documents({})
    total_chats  = chat_requests_col().count_documents({})
    accepted_chats = chat_requests_col().count_documents({"status": "accepted"})
    total_msgs   = messages_col().count_documents({})

    return jsonify({
        "success": True,
        "analytics": {
            "total_users":       total_users,
            "email_verified":    email_ver,
            "kyc_verified":      verified,
            "kyc_pending":       pending_kyc,
            "kyc_rejected":      rejected,
            "admin_users":       admins,
            "total_rooms":       total_rooms,
            "total_chats":       total_chats,
            "accepted_chats":    accepted_chats,
            "total_messages":    total_msgs,
        },
    }), 200


# ── Users ─────────────────────────────────────────────────────────────────────

@admin_bp.route("/users", methods=["GET"])
@jwt_required
@admin_required
def list_users():
    """
    Paginated user list.
    Query: page, limit, search (name/email), verified (0/1/2/3)
    """
    page    = max(int(request.args.get("page",  1)),   1)
    limit   = min(int(request.args.get("limit", 20)), 100)
    skip    = (page - 1) * limit
    search  = request.args.get("search", "").strip()
    ver_filter = request.args.get("verified", "")

    query = {}
    if search:
        query["$or"] = [
            {"name":  {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    if ver_filter != "":
        query["verification_status"] = int(ver_filter)

    docs  = list(users_col().find(query, {"password": 0}).skip(skip).limit(limit).sort("created_at", -1))
    total = users_col().count_documents(query)

    for d in docs:
        d["id"] = str(d.pop("_id"))
        # Remove heavy fields not needed in list view
        d.pop("ocr_text", None)

    return jsonify({
        "success": True,
        "users":   docs,
        "total":   total,
        "page":    page,
        "pages":   (total + limit - 1) // limit,
    }), 200


@admin_bp.route("/users/<user_id>", methods=["GET"])
@jwt_required
@admin_required
def get_user_detail(user_id: str):
    """Full user document for the detail panel."""
    try:
        user = users_col().find_one({"_id": ObjectId(user_id)}, {"password": 0})
    except Exception:
        return jsonify({"success": False, "message": "Invalid user ID."}), 400

    if not user:
        return jsonify({"success": False, "message": "User not found."}), 404

    user["id"] = str(user.pop("_id"))
    return jsonify({"success": True, "user": user}), 200


@admin_bp.route("/users/<user_id>", methods=["DELETE"])
@jwt_required
@admin_required
def delete_user(user_id: str):
    """Delete a user and all their associated data."""
    try:
        oid = ObjectId(user_id)
    except Exception:
        return jsonify({"success": False, "message": "Invalid user ID."}), 400

    # Delete user + their rooms, chat messages, chat requests, notifications
    users_col().delete_one({"_id": oid})
    rooms_col().delete_many({"owner_id": user_id})
    chat_requests_col().delete_many({"$or": [{"from_user_id": user_id}, {"to_user_id": user_id}]})
    messages_col().delete_many({"sender_id": user_id})
    documents_col().delete_many({"user_id": user_id})

    return jsonify({"success": True, "message": "User and all associated data deleted."}), 200


@admin_bp.route("/users/<user_id>/promote", methods=["PATCH"])
@jwt_required
@admin_required
def promote_user(user_id: str):
    """
    Grant or revoke admin role.
    Body: { "is_admin": true | false }
    """
    data     = request.get_json(silent=True) or {}
    is_admin = bool(data.get("is_admin", False))

    try:
        users_col().update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"is_admin": is_admin}},
        )
    except Exception:
        return jsonify({"success": False, "message": "Invalid user ID."}), 400

    action = "granted admin role" if is_admin else "revoked admin role"
    return jsonify({"success": True, "message": f"User {action}."}), 200


# ── KYC Review ────────────────────────────────────────────────────────────────

@admin_bp.route("/pending-kyc", methods=["GET"])
@jwt_required
@admin_required
def pending_kyc():
    """All users currently pending KYC review."""
    docs = list(users_col().find(
        {"verification_status": VerificationStatus.PENDING},
        {"password": 0, "ocr_text": 0},
    ).sort("created_at", -1))

    for d in docs:
        d["id"] = str(d.pop("_id"))

    return jsonify({"success": True, "users": docs, "count": len(docs)}), 200


@admin_bp.route("/verify-document", methods=["POST"])
@jwt_required
@admin_required
def admin_verify_document():
    """
    Approve or reject a user's KYC submission.
    Body: { "user_id": "...", "status": 0|1|2|3, "reason": "..." }
    """
    data    = request.get_json(silent=True) or {}
    user_id = data.get("user_id", "").strip()
    status  = data.get("status")
    reason  = data.get("reason", "")

    if not user_id or status is None:
        return jsonify({"success": False, "message": "user_id and status required."}), 400

    valid = {
        VerificationStatus.NOT_VERIFIED,
        VerificationStatus.PENDING,
        VerificationStatus.VERIFIED,
        VerificationStatus.REJECTED,
    }
    if int(status) not in valid:
        return jsonify({"success": False, "message": "status must be 0, 1, 2 or 3."}), 400

    try:
        users_col().update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"verification_status": int(status)}},
        )
        documents_col().update_one(
            {"user_id": user_id},
            {"$set": {"status": int(status), "admin_reason": reason}},
            upsert=True,
        )
    except Exception:
        return jsonify({"success": False, "message": "Invalid user ID."}), 400

    labels = {0: "reset", 1: "set to pending", 2: "approved", 3: "rejected"}
    return jsonify({
        "success": True,
        "message": f"KYC {labels.get(int(status), 'updated')} for user.",
    }), 200


# ── Rooms ─────────────────────────────────────────────────────────────────────

@admin_bp.route("/rooms", methods=["GET"])
@jwt_required
@admin_required
def list_rooms():
    """All room listings with pagination."""
    page  = max(int(request.args.get("page",  1)),   1)
    limit = min(int(request.args.get("limit", 20)), 100)
    skip  = (page - 1) * limit

    docs  = list(rooms_col().find({}).skip(skip).limit(limit).sort("created_at", -1))
    total = rooms_col().count_documents({})

    for d in docs:
        d["id"] = str(d.pop("_id"))

    return jsonify({"success": True, "rooms": docs, "total": total, "page": page}), 200


@admin_bp.route("/rooms/<room_id>", methods=["DELETE"])
@jwt_required
@admin_required
def delete_room(room_id: str):
    """Delete any room regardless of owner."""
    try:
        result = rooms_col().delete_one({"_id": ObjectId(room_id)})
    except Exception:
        return jsonify({"success": False, "message": "Invalid room ID."}), 400

    if result.deleted_count:
        return jsonify({"success": True, "message": "Room deleted."}), 200
    return jsonify({"success": False, "message": "Room not found."}), 404


# ── ML Model ──────────────────────────────────────────────────────────────────

@admin_bp.route("/retrain-model", methods=["POST"])
@jwt_required
@admin_required
def retrain_model():
    """Manually trigger ML engine retraining."""
    result = get_matching_engine().train()
    return jsonify(result), 200 if result["success"] else 500


@admin_bp.route("/upload-dataset", methods=["POST"])
@jwt_required
@admin_required
def upload_dataset():
    """Upload a new CSV dataset file."""
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file provided."}), 400

    file = request.files["file"]
    if not file.filename.endswith(".csv"):
        return jsonify({"success": False, "message": "Only .csv files accepted."}), 400

    os.makedirs(os.path.dirname(config.DATASET_PATH), exist_ok=True)
    file.save(config.DATASET_PATH)
    return jsonify({"success": True, "message": "Dataset uploaded.", "path": config.DATASET_PATH}), 200