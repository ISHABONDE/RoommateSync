"""
Location Service  (v2 — geospatial MongoDB queries + Haversine fallback)
─────────────────────────────────────────────────────────────────────────
Public API
──────────
update_user_location(user_id, lat, lon, city, area, pincode) → dict
get_nearby_users(user_id, radius_km)                          → list
find_nearby_users(lat, lng, radius_km)                        → list   ← NEW
calculate_distance(lat1, lng1, lat2, lng2)                    → float  ← NEW
"""
import logging
from bson import ObjectId

from database.models import users_col
from location.distance_calculator import haversine

logger = logging.getLogger(__name__)


# ── Public helpers ─────────────────────────────────────────────────────────────

def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return great-circle distance in kilometres (Haversine formula)."""
    return haversine(lat1, lng1, lat2, lng2)


def update_user_location(
    user_id: str,
    lat: float,
    lon: float,
    city: str    = "",
    area: str    = "",
    pincode: str = "",
) -> dict:
    """
    Persist flat lat/lng fields AND a GeoJSON Point so both legacy queries
    and new $near geospatial queries work.
    """
    users_col().update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            # Legacy flat fields (backward compatibility)
            "latitude":  lat,
            "longitude": lon,
            "city":      city,
            "area":      area,
            "pincode":   pincode,
            # GeoJSON Point for $near / $geoWithin queries
            "location": {
                "type":        "Point",
                "coordinates": [lon, lat],   # GeoJSON convention: [lng, lat]
            },
        }},
    )
    logger.debug(f"[LocationService] Updated location for user={user_id} lat={lat} lon={lon}")
    return {"success": True, "message": "Location updated."}


def get_nearby_users(user_id: str, radius_km: float = None) -> list:
    """
    Find users near the authenticated user.
    Uses MongoDB $near when a 2dsphere index exists,
    falls back to Haversine iteration otherwise.
    """
    user = users_col().find_one({"_id": ObjectId(user_id)})
    if not user or user.get("latitude") is None:
        return []

    lat      = float(user["latitude"])
    lon      = float(user["longitude"])
    max_dist = float(radius_km or user.get("preferred_distance") or 5)

    return find_nearby_users(lat, lon, max_dist, exclude_user_id=user_id)


def find_nearby_users(
    lat: float,
    lng: float,
    radius_km: float,
    exclude_user_id: str = None,
) -> list:
    """
    Find all users within *radius_km* of (lat, lng).

    Strategy
    ────────
    1. Try MongoDB $near (fast — requires 2dsphere index on `location`).
    2. If the index is missing / query fails → fallback to Haversine scan.

    Returns a list of dicts with keys:
        user_id, name, city, distance_km, latitude, longitude
    """
    max_m = radius_km * 1000

    query: dict = {}
    if exclude_user_id:
        try:
            query["_id"] = {"$ne": ObjectId(exclude_user_id)}
        except Exception:
            pass

    # ── Attempt fast geospatial query ─────────────────────────────────────────
    try:
        geo_query = {
            **query,
            "location": {
                "$near": {
                    "$geometry":    {"type": "Point", "coordinates": [lng, lat]},
                    "$maxDistance": max_m,
                }
            },
        }
        candidates = list(users_col().find(geo_query, {"password": 0}).limit(100))
        return [_format_user(u, lat, lng) for u in candidates]

    except Exception as exc:
        logger.warning(f"[LocationService] Geospatial query failed ({exc}), using Haversine fallback.")

    # ── Haversine fallback ────────────────────────────────────────────────────
    flat_query = {
        **query,
        "latitude":  {"$ne": None},
        "longitude": {"$ne": None},
    }
    all_users  = list(users_col().find(flat_query, {"password": 0}))
    result     = []
    for u in all_users:
        try:
            dist = haversine(lat, lng, float(u["latitude"]), float(u["longitude"]))
        except Exception:
            continue
        if dist <= radius_km:
            result.append(_format_user(u, lat, lng, dist))

    result.sort(key=lambda x: x["distance_km"])
    return result


# ── Private helpers ────────────────────────────────────────────────────────────

def _format_user(user: dict, ref_lat: float, ref_lng: float, dist_km: float = None) -> dict:
    """Shape a user document into a public-facing roommate summary."""
    u_lat = user.get("latitude")
    u_lng = user.get("longitude")

    if dist_km is None and u_lat is not None and u_lng is not None:
        try:
            dist_km = round(haversine(ref_lat, ref_lng, float(u_lat), float(u_lng)), 2)
        except Exception:
            dist_km = None

    return {
        "user_id":       str(user["_id"]),
        "name":          user.get("name", ""),
        "city":          user.get("city", ""),
        "area":          user.get("area", ""),
        "latitude":      u_lat,
        "longitude":     u_lng,
        "distance_km":   round(dist_km, 2) if dist_km is not None else None,
        "profile_image": user.get("profile_image", ""),
    }
