from flask import Blueprint, jsonify
from routes.auth_routes import jwt_required
from services.notification_service import get_user_notifications, mark_read, delete_notification

notifications_bp = Blueprint("notifications", __name__, url_prefix="/notifications")


@notifications_bp.route("/<user_id>", methods=["GET"])
@jwt_required
def get_notifications(user_id: str):
    notifs = get_user_notifications(user_id)
    return jsonify({"success": True, "notifications": notifs}), 200


@notifications_bp.route("/read/<notif_id>", methods=["PUT"])
@jwt_required
def read_notification(notif_id: str):
    ok = mark_read(notif_id)
    return jsonify({"success": ok}), 200


@notifications_bp.route("/<notif_id>", methods=["DELETE"])
@jwt_required
def delete_notif(notif_id: str):
    ok = delete_notification(notif_id)
    return jsonify({"success": ok}), 200
