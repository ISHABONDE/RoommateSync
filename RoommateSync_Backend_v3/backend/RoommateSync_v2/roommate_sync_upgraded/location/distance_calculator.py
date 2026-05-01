"""
Distance Calculator — Haversine formula
"""
import math


EARTH_RADIUS_KM = 6371.0


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in kilometres."""
    r = EARTH_RADIUS_KM
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    Δφ = math.radians(lat2 - lat1)
    Δλ = math.radians(lon2 - lon1)
    a  = math.sin(Δφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(Δλ / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def within_radius(
    user_lat: float, user_lon: float,
    candidate_lat: float, candidate_lon: float,
    radius_km: float,
) -> bool:
    return haversine(user_lat, user_lon, candidate_lat, candidate_lon) <= radius_km
