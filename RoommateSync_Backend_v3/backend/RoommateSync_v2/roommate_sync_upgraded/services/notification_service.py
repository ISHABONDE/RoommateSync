"""
Notification Service
"""
from datetime import datetime, timezone
from bson import ObjectId
from database.models import notifications_col


def create_notification(user_id: str, notif_type: str, message: str, data: dict = None) -> str:
    doc = {
        "user_id":    user_id,
        "type":       notif_type,
        "message":    message,
        "data":       data or {},
        "read":       False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = notifications_col().insert_one(doc)
    return str(result.inserted_id)


def get_user_notifications(user_id: str) -> list:
    docs = notifications_col().find({"user_id": user_id}).sort("created_at", -1).limit(50)
    out = []
    for d in docs:
        d["id"] = str(d.pop("_id"))
        out.append(d)
    return out


def mark_read(notif_id: str) -> bool:
    r = notifications_col().update_one({"_id": ObjectId(notif_id)}, {"$set": {"read": True}})
    return r.modified_count > 0


def delete_notification(notif_id: str) -> bool:
    r = notifications_col().delete_one({"_id": ObjectId(notif_id)})
    return r.deleted_count > 0
