"""
Chat Routes  (v3 — fixed get_requests to return both sent AND received)
────────────────────────────────────────────────────────────────────────
POST /chat/request               → send chat request
POST /chat/accept                → accept chat request
POST /chat/reject                → reject chat request
GET  /chat/requests/<user_id>    → list ALL requests (sent OR received)  ← FIXED
POST /chat/message               → send message (REST fallback)
GET  /chat/messages/<chat_id>    → get messages for a chat
GET  /chat/status/<other_user_id>→ NEW: check request status with another user
"""
from datetime import datetime, timezone
 
from flask import Blueprint, request, jsonify
from bson import ObjectId
 
from routes.auth_routes import jwt_required
from database.models import chat_requests_col, messages_col
from services.notification_service import create_notification
 
chat_bp = Blueprint("chat", __name__, url_prefix="/chat")
 
 
@chat_bp.route("/request", methods=["POST"])
@jwt_required
def send_request():
    data  = request.get_json(silent=True) or {}
    to_id = data.get("to_user_id", "").strip()
    if not to_id:
        return jsonify({"success": False, "message": "to_user_id required."}), 400
 
    # Check if any request already exists between these two users in either direction
    existing = chat_requests_col().find_one({
        "$or": [
            {"from_user_id": request.user_id, "to_user_id": to_id},
            {"from_user_id": to_id, "to_user_id": request.user_id},
        ],
        "status": {"$in": ["pending", "accepted"]},
    })
    if existing:
        status = existing.get("status")
        msg    = "Request already pending." if status == "pending" else "You are already connected with this user."
        return jsonify({"success": False, "message": msg, "status": status,
                        "request_id": str(existing["_id"])}), 409
 
    doc = {
        "from_user_id": request.user_id,
        "to_user_id":   to_id,
        "status":       "pending",
        "created_at":   datetime.now(timezone.utc).isoformat(),
    }
    result = chat_requests_col().insert_one(doc)
    create_notification(to_id, "chat_request", "You have a new chat request.",
                        {"from": request.user_id, "request_id": str(result.inserted_id)})
    return jsonify({"success": True, "request_id": str(result.inserted_id)}), 201
 
 
@chat_bp.route("/accept", methods=["POST"])
@jwt_required
def accept_request():
    data       = request.get_json(silent=True) or {}
    request_id = data.get("request_id", "").strip()
    if not request_id:
        return jsonify({"success": False, "message": "request_id required."}), 400
 
    req = chat_requests_col().find_one({"_id": ObjectId(request_id), "to_user_id": request.user_id})
    if not req:
        return jsonify({"success": False, "message": "Request not found."}), 404
 
    chat_requests_col().update_one({"_id": ObjectId(request_id)}, {"$set": {"status": "accepted"}})
 
    # Notify the sender that their request was accepted
    create_notification(
        req["from_user_id"], "chat_accepted",
        "Your chat request was accepted.",
        {"request_id": request_id, "room_id": request_id},
    )
    return jsonify({
        "success":  True,
        "message":  "Chat request accepted.",
        "room_id":  request_id,
    }), 200
 
 
@chat_bp.route("/reject", methods=["POST"])
@jwt_required
def reject_request():
    data       = request.get_json(silent=True) or {}
    request_id = data.get("request_id", "").strip()
    if not request_id:
        return jsonify({"success": False, "message": "request_id required."}), 400
 
    req = chat_requests_col().find_one({"_id": ObjectId(request_id), "to_user_id": request.user_id})
    if not req:
        return jsonify({"success": False, "message": "Request not found."}), 404
 
    chat_requests_col().update_one({"_id": ObjectId(request_id)}, {"$set": {"status": "rejected"}})
    return jsonify({"success": True, "message": "Chat request rejected."}), 200
 
 
@chat_bp.route("/requests/<user_id>", methods=["GET"])
@jwt_required
def get_requests(user_id: str):
    """
    BUG FIX v3: Return ALL requests where this user is sender OR receiver.
    Previously only returned requests where to_user_id = user_id,
    which meant the sender (from_user_id) never saw their own accepted chats.
    """
    docs = list(chat_requests_col().find({
        "$or": [
            {"to_user_id":   user_id},
            {"from_user_id": user_id},
        ]
    }).sort("created_at", -1))
 
    for d in docs:
        d["id"] = str(d.pop("_id"))
 
    return jsonify({"success": True, "requests": docs}), 200
 
 
@chat_bp.route("/status/<other_user_id>", methods=["GET"])
@jwt_required
def get_chat_status(other_user_id: str):
    """
    NEW: Check the chat request status between the current user and another user.
    Used by UserProfile to show correct button state and prevent duplicate requests.
 
    Response:
        { success, status: "none"|"pending"|"accepted"|"rejected",
          request_id: str|null, is_sender: bool }
    """
    req = chat_requests_col().find_one({
        "$or": [
            {"from_user_id": request.user_id, "to_user_id": other_user_id},
            {"from_user_id": other_user_id,   "to_user_id": request.user_id},
        ],
        "status": {"$in": ["pending", "accepted"]},
    })
 
    if not req:
        return jsonify({"success": True, "status": "none", "request_id": None, "is_sender": False}), 200
 
    return jsonify({
        "success":    True,
        "status":     req.get("status"),
        "request_id": str(req["_id"]),
        "is_sender":  req.get("from_user_id") == request.user_id,
    }), 200
 
 
@chat_bp.route("/message", methods=["POST"])
@jwt_required
def send_message():
    """REST fallback — WebSocket (socket_events.py) is preferred for real-time."""
    data       = request.get_json(silent=True) or {}
    request_id = data.get("request_id", "").strip()
    text       = (data.get("message") or "").strip()
 
    if not request_id or not text:
        return jsonify({"success": False, "message": "request_id and message required."}), 400
 
    req = chat_requests_col().find_one({"_id": ObjectId(request_id), "status": "accepted"})
    if not req:
        return jsonify({"success": False, "message": "Accepted chat request not found."}), 403
 
    if request.user_id not in [req["from_user_id"], req["to_user_id"]]:
        return jsonify({"success": False, "message": "Not authorized."}), 403
 
    msg = {
        "chat_request_id": request_id,
        "sender_id":       request.user_id,
        "message":         text,
        "sent_at":         datetime.now(timezone.utc).isoformat(),
    }
    result = messages_col().insert_one(msg)
    return jsonify({"success": True, "message_id": str(result.inserted_id)}), 201
 
 
@chat_bp.route("/messages/<chat_id>", methods=["GET"])
@jwt_required
def get_messages(chat_id: str):
    msgs = list(messages_col().find({"chat_request_id": chat_id}).sort("sent_at", 1))
    for m in msgs:
        m["id"] = str(m.pop("_id"))
    return jsonify({"success": True, "messages": msgs}), 200