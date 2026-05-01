"""
User Routes  (v2 — added POST /users/location)
───────────────────────────────────────────────
POST/PUT /users/profile          → upsert user profile
GET      /users/<user_id>        → get user by id
DELETE   /users/<user_id>        → delete user
POST     /users/profile/photo    → upload profile photo
POST     /users/location         → NEW: save GPS location (also /api/v1/users/location)
"""
from flask import Blueprint, request, jsonify

from routes.auth_routes import jwt_required
from services.user_service import (
    get_user_by_id, update_user_profile, delete_user, update_profile_image
)
from services.location_service import update_user_location
from verification.document_upload import save_profile_image

users_bp = Blueprint("users", __name__, url_prefix="/users")


@users_bp.route("/profile", methods=["POST", "PUT"])
@jwt_required
def upsert_profile():
    data   = request.get_json(silent=True) or {}
    result = update_user_profile(request.user_id, data)
    return jsonify(result), 200 if result["success"] else 400


@users_bp.route("/<user_id>", methods=["GET"])
@jwt_required
def get_user(user_id: str):
    user = get_user_by_id(user_id)
    if not user:
        return jsonify({"success": False, "message": "User not found."}), 404
    return jsonify({"success": True, "user": user}), 200


@users_bp.route("/<user_id>", methods=["DELETE"])
@jwt_required
def remove_user(user_id: str):
    result = delete_user(user_id)
    return jsonify(result), 200 if result["success"] else 404


@users_bp.route("/profile/photo", methods=["POST"])
@jwt_required
def upload_photo():
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file provided."}), 400
    result = save_profile_image(request.files["file"])
    if not result["success"]:
        return jsonify(result), 400
    update_profile_image(request.user_id, result["path"])
    return jsonify({"success": True, "profile_image": result["path"]}), 200


@users_bp.route("/location", methods=["POST"])
@jwt_required
def save_location():
    """
    Save / update the authenticated user's GPS coordinates.

    Body:
        { "latitude": 18.6298, "longitude": 73.7997,
          "city"?: "Pune", "area"?: "Hinjewadi", "pincode"?: "411057" }

    Response:
        { success, message, latitude, longitude }
    """
    data = request.get_json(silent=True) or {}
    lat  = data.get("latitude")
    lon  = data.get("longitude")

    if lat is None or lon is None:
        return jsonify({"success": False, "message": "latitude and longitude are required."}), 400

    try:
        lat = float(lat)
        lon = float(lon)
    except (TypeError, ValueError):
        return jsonify({"success": False, "message": "latitude and longitude must be numbers."}), 400

    result = update_user_location(
        request.user_id, lat, lon,
        city    = data.get("city",    ""),
        area    = data.get("area",    ""),
        pincode = data.get("pincode", ""),
    )
    result.update({"latitude": lat, "longitude": lon})
    return jsonify(result), 200
