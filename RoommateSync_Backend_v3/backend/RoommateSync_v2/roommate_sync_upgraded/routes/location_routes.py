"""
Location Routes  (v2 — backward-compatible + new v1 endpoints)
───────────────────────────────────────────────────────────────
POST /location/update   → update current user's location  (legacy)
GET  /location/nearby   → nearby users for current user   (legacy)

Also available under /api/v1/location/* via blueprint re-registration in app.py
"""
from flask import Blueprint, request, jsonify

from routes.auth_routes import jwt_required
from services.location_service import update_user_location, get_nearby_users

location_bp = Blueprint("location", __name__, url_prefix="/location")


@location_bp.route("/update", methods=["POST"])
@jwt_required
def update_location():
    """
    Body: { latitude, longitude, city?, area?, pincode? }
    Response: { success, message }
    """
    data = request.get_json(silent=True) or {}
    lat  = data.get("latitude")
    lon  = data.get("longitude")

    if lat is None or lon is None:
        return jsonify({"success": False, "message": "latitude and longitude required."}), 400

    result = update_user_location(
        request.user_id, float(lat), float(lon),
        city    = data.get("city",    ""),
        area    = data.get("area",    ""),
        pincode = data.get("pincode", ""),
    )
    return jsonify(result), 200


@location_bp.route("/nearby", methods=["GET"])
@jwt_required
def nearby():
    """
    Query: radius (km, optional — defaults to user.preferred_distance)
    Response: { success, nearby_users: [...] }
    """
    radius = request.args.get("radius")
    result = get_nearby_users(request.user_id, float(radius) if radius else None)
    return jsonify({"success": True, "nearby_users": result}), 200
