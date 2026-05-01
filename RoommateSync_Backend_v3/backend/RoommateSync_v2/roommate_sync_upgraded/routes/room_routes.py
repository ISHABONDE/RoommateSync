"""
Room Routes  (v2 — added image upload + nearby rooms)
──────────────────────────────────────────────────────
POST   /rooms/create            → create room
GET    /rooms                   → list rooms
GET    /rooms/<room_id>         → get room
PUT    /rooms/<room_id>         → update room
DELETE /rooms/<room_id>         → delete room
POST   /rooms/<room_id>/images  → NEW: upload room photos
GET    /rooms/nearby            → NEW: find rooms within radius
"""
import os
import uuid
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from bson import ObjectId
from pymongo import GEOSPHERE

from routes.auth_routes import jwt_required
from database.models import rooms_col
from config import config
from location.distance_calculator import haversine

rooms_bp = Blueprint("rooms", __name__, url_prefix="/rooms")

ROOM_FIELDS = {
    "title", "description", "city", "area", "pincode",
    "latitude", "longitude", "rent", "size", "wifi",
    "parking", "furnished", "room_status",
    "roommates_needed", "current_roommates", "photos",
}

ALLOWED_EXTENSIONS           = config.ALLOWED_IMAGE_EXTENSIONS
ALLOWED_AGREEMENT_EXTENSIONS = config.ALLOWED_AGREEMENT_EXTENSIONS


def _allowed_image(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _allowed_agreement(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_AGREEMENT_EXTENSIONS


def _serialize(room: dict) -> dict:
    """Convert ObjectId → str and expose lat/lng for Maps."""
    room["id"] = str(room.pop("_id"))
    # Expose flat lat/lng for Google Maps frontend markers
    if "location" in room and isinstance(room["location"], dict):
        coords = room["location"].get("coordinates", [None, None])
        room.setdefault("longitude", coords[0])
        room.setdefault("latitude",  coords[1])
    # Ensure agreement field is always present
    room.setdefault("agreement", None)
    return room


# ── CRUD ───────────────────────────────────────────────────────────────────────

@rooms_bp.route("/create", methods=["POST"])
@jwt_required
def create_room():
    data = request.get_json(silent=True) or {}
    room = {k: data[k] for k in ROOM_FIELDS if k in data}
    room["owner_id"]   = request.user_id
    room["created_at"] = datetime.now(timezone.utc).isoformat()

    # Build GeoJSON Point for geospatial queries if coordinates provided
    lat = data.get("latitude")
    lon = data.get("longitude")
    if lat is not None and lon is not None:
        room["location"] = {
            "type":        "Point",
            "coordinates": [float(lon), float(lat)],  # GeoJSON: [lng, lat]
        }

    result = rooms_col().insert_one(room)
    return jsonify({"success": True, "room_id": str(result.inserted_id)}), 201


@rooms_bp.route("", methods=["GET"])
def list_rooms():
    docs = list(rooms_col().find().sort("created_at", -1).limit(50))
    return jsonify({"success": True, "rooms": [_serialize(d) for d in docs]}), 200


@rooms_bp.route("/<room_id>", methods=["GET"])
def get_room(room_id: str):
    room = rooms_col().find_one({"_id": ObjectId(room_id)})
    if not room:
        return jsonify({"success": False, "message": "Room not found."}), 404
    return jsonify({"success": True, "room": _serialize(room)}), 200


@rooms_bp.route("/<room_id>", methods=["PUT"])
@jwt_required
def update_room(room_id: str):
    data = request.get_json(silent=True) or {}
    upd  = {k: data[k] for k in ROOM_FIELDS if k in data}

    # Keep GeoJSON location in sync when lat/lng are updated
    lat = data.get("latitude")
    lon = data.get("longitude")
    if lat is not None and lon is not None:
        upd["location"] = {
            "type":        "Point",
            "coordinates": [float(lon), float(lat)],
        }

    rooms_col().update_one(
        {"_id": ObjectId(room_id), "owner_id": request.user_id},
        {"$set": upd},
    )
    return jsonify({"success": True, "message": "Room updated."}), 200


@rooms_bp.route("/<room_id>", methods=["DELETE"])
@jwt_required
def delete_room(room_id: str):
    result = rooms_col().delete_one({"_id": ObjectId(room_id), "owner_id": request.user_id})
    if result.deleted_count:
        return jsonify({"success": True, "message": "Room deleted."}), 200
    return jsonify({"success": False, "message": "Room not found or not authorised."}), 404


# ── Image Upload ────────────────────────────────────────────────────────────────

@rooms_bp.route("/<room_id>/images", methods=["POST"])
@jwt_required
def upload_room_images(room_id: str):
    """
    Upload one or more photos for a room.

    Form-data: images=<file1>, images=<file2>, ...
    Response:  { success, room_id, images: ["/uploads/rooms/xxx.jpg", ...] }
    """
    files = request.files.getlist("images")
    if not files:
        return jsonify({"success": False, "message": "No images provided."}), 400

    saved_paths = []
    for file in files:
        if not file or not _allowed_image(file.filename):
            continue
        ext      = file.filename.rsplit(".", 1)[1].lower()
        filename = f"{uuid.uuid4().hex}.{ext}"
        save_dir = config.UPLOAD_ROOMS
        os.makedirs(save_dir, exist_ok=True)
        file.save(os.path.join(save_dir, filename))
        saved_paths.append(f"/uploads/rooms/{filename}")

    if not saved_paths:
        return jsonify({"success": False, "message": "No valid images uploaded."}), 400

    # Append new image paths to the room document
    rooms_col().update_one(
        {"_id": ObjectId(room_id), "owner_id": request.user_id},
        {"$push": {"photos": {"$each": saved_paths}}},
    )

    return jsonify({
        "success": True,
        "room_id": room_id,
        "images":  saved_paths,
    }), 200


# ── Agreement Upload ────────────────────────────────────────────────────────────

@rooms_bp.route("/<room_id>/agreement", methods=["POST"])
@jwt_required
def upload_room_agreement(room_id: str):
    """
    Upload a rental/room agreement document for a listing.

    Form-data: agreement=<file (PDF or image)>
    Response:  { success, room_id, agreement: "/uploads/agreements/xxx.pdf" }
    """
    if "agreement" not in request.files:
        return jsonify({"success": False, "message": "No 'agreement' file provided."}), 400

    file = request.files["agreement"]
    if not file or not _allowed_agreement(file.filename):
        return jsonify({"success": False, "message": "Invalid file type. Allowed: PDF, JPG, PNG."}), 400

    ext      = file.filename.rsplit(".", 1)[1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    save_dir = config.UPLOAD_AGREEMENTS
    os.makedirs(save_dir, exist_ok=True)
    file.save(os.path.join(save_dir, filename))
    agreement_path = f"/uploads/agreements/{filename}"

    rooms_col().update_one(
        {"_id": ObjectId(room_id), "owner_id": request.user_id},
        {"$set": {"agreement": agreement_path}},
    )

    return jsonify({
        "success":   True,
        "room_id":   room_id,
        "agreement": agreement_path,
    }), 200


# ── Nearby Rooms (Geospatial) ──────────────────────────────────────────────────

@rooms_bp.route("/nearby", methods=["GET"])
def nearby_rooms():
    """
    Find rooms within a radius using MongoDB geospatial $near query.

    Query params:
        lat    – centre latitude
        lng    – centre longitude
        radius – search radius in km  (default 5)

    Response:
        {
          "center_location": { "lat": ..., "lng": ... },
          "radius_km": 5,
          "rooms": [
            { "room_id": "...", "title": "...", "latitude": ..., "longitude": ...,
              "distance_km": 1.2, "rent": 8000, ... }
          ]
        }
    """
    try:
        lat    = float(request.args["lat"])
        lng    = float(request.args["lng"])
        radius = float(request.args.get("radius", 5))
    except (KeyError, ValueError):
        return jsonify({"success": False, "message": "lat and lng query params are required."}), 400

    max_distance_m = radius * 1000  # MongoDB $maxDistance uses metres

    try:
        # Geospatial $near query — requires 2dsphere index on rooms.location
        cursor = rooms_col().find({
            "location": {
                "$near": {
                    "$geometry":    {"type": "Point", "coordinates": [lng, lat]},
                    "$maxDistance": max_distance_m,
                }
            }
        }).limit(50)
        rooms = list(cursor)
    except Exception:
        # Fallback: no geospatial index available → manual Haversine filter
        rooms = list(rooms_col().find({"latitude": {"$ne": None}}).limit(200))
        rooms = [
            r for r in rooms
            if haversine(lat, lng, float(r["latitude"]), float(r["longitude"])) <= radius
        ]

    result = []
    for r in rooms:
        r_lat = r.get("latitude")
        r_lng = r.get("longitude")
        # Extract from GeoJSON if flat fields missing
        if r_lat is None and "location" in r:
            coords = r["location"].get("coordinates", [None, None])
            r_lng, r_lat = coords[0], coords[1]

        dist = haversine(lat, lng, float(r_lat), float(r_lng)) if r_lat and r_lng else None
        result.append({
            "room_id":     str(r["_id"]),
            "title":       r.get("title", ""),
            "city":        r.get("city", ""),
            "area":        r.get("area", ""),
            "rent":        r.get("rent"),
            "latitude":    r_lat,
            "longitude":   r_lng,
            "distance_km": round(dist, 2) if dist is not None else None,
            "photos":      r.get("photos", []),
        })

    # Sort by distance
    result.sort(key=lambda x: (x["distance_km"] is None, x["distance_km"]))

    return jsonify({
        "success":         True,
        "center_location": {"lat": lat, "lng": lng},
        "radius_km":       radius,
        "rooms":           result,
    }), 200
