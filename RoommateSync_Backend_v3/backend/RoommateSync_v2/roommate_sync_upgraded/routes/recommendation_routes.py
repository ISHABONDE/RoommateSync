"""
Recommendation Routes  (v2 — added v1 compatibility score endpoint)
────────────────────────────────────────────────────────────────────
GET  /recommend                         → recommendations for current user
POST /recommend/score                   → cosine score between two profiles
POST /recommend/train                   → retrain model (admin)

NEW — v1 endpoints (also registered under /api/v1/recommend/...):
GET  /api/v1/recommendations/<user_id>  → compatibility scores for a user
                                          (calls new matching_engine)
GET  /api/v1/roommates/nearby           → geospatial roommate search
"""
from flask import Blueprint, request, jsonify

from routes.auth_routes import jwt_required
from services.user_service import get_user_by_id
from ml.recommendation_model import get_model

recommend_bp = Blueprint("recommend", __name__, url_prefix="/recommend")


# ── Legacy endpoints (unchanged) ───────────────────────────────────────────────

@recommend_bp.route("", methods=["GET"])
@jwt_required
def get_recommendations():
    user = get_user_by_id(request.user_id)
    if not user:
        return jsonify({"success": False, "message": "User not found."}), 404

    recs = get_model().recommend(user)
    return jsonify({"success": True, "recommendations": recs, "count": len(recs)}), 200


@recommend_bp.route("/score", methods=["POST"])
@jwt_required
def compute_score():
    data   = request.get_json(silent=True) or {}
    user_a = data.get("profile_a") or get_user_by_id(request.user_id)
    user_b = data.get("profile_b")
    if not user_a or not user_b:
        return jsonify({"success": False, "message": "profile_a and profile_b required."}), 400

    from ml.recommendation_model import FEATURE_COLS
    import numpy as np
    from sklearn.metrics.pairwise import cosine_similarity

    model = get_model()
    if not model._trained:
        model.train()

    va = np.array([[float(user_a.get(f, 0) or 0) for f in FEATURE_COLS]])
    vb = np.array([[float(user_b.get(f, 0) or 0) for f in FEATURE_COLS]])
    if model.scaler:
        va = model.scaler.transform(va)
        vb = model.scaler.transform(vb)

    score = float(cosine_similarity(va, vb)[0][0])
    return jsonify({"success": True, "compatibility_score": round(score, 4)}), 200


@recommend_bp.route("/train", methods=["POST"])
@jwt_required
def retrain():
    result = get_model().train()
    return jsonify(result), 200 if result["success"] else 500


# ── NEW v1: Compatibility scores via matching engine ───────────────────────────
# Note: also reachable as GET /api/v1/recommend/matches/<user_id>
# A dedicated Blueprint for /api/v1/recommendations is registered below.

from flask import Blueprint as _BP

# Separate blueprint so it can be mounted at /api/v1/recommendations
recommendations_v1_bp = _BP("recommendations_v1", __name__, url_prefix="/api/v1/recommendations")


@recommendations_v1_bp.route("/<user_id>", methods=["GET"])
@jwt_required
def compatibility_scores(user_id: str):
    """
    Return top compatibility matches for *user_id* using the live
    MongoDB-trained matching engine.

    Response:
        {
          "user_id": "123",
          "matches": [
            { "user_id": "456", "name": "Ankit", "compatibility_score": 92,
              "latitude": 18.63, "longitude": 73.79 },
            ...
          ]
        }
    """
    from ml.matching_engine import get_matching_engine

    engine = get_matching_engine()
    result = engine.get_matches(user_id)
    return jsonify(result), 200 if result.get("success") else 404


# ── NEW v1: Nearby roommates (geospatial) ──────────────────────────────────────

roommates_v1_bp = _BP("roommates_v1", __name__, url_prefix="/api/v1/roommates")


@roommates_v1_bp.route("/nearby", methods=["GET"])
def nearby_roommates():
    """
    Find roommates within a geographic radius using MongoDB $near.

    Query params:
        lat    – latitude of search centre
        lng    – longitude of search centre
        radius – search radius in km (default 5)

    Response:
        {
          "center_location": { "lat": 18.6298, "lng": 73.7997 },
          "radius_km": 5,
          "roommates": [
            { "user_id": "456", "name": "Ankit", "distance_km": 1.2,
              "compatibility_score": 91, "latitude": ..., "longitude": ... }
          ]
        }
    """
    from services.location_service import find_nearby_users
    from ml.matching_engine import get_matching_engine

    try:
        lat    = float(request.args["lat"])
        lng    = float(request.args["lng"])
        radius = float(request.args.get("radius", 5))
    except (KeyError, ValueError):
        return jsonify({"success": False, "message": "lat and lng are required."}), 400

    nearby = find_nearby_users(lat, lng, radius)

    # Enrich each result with a compatibility score when a requester token exists
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        from services.user_service import decode_token, get_user_by_id
        token   = auth_header.split(" ", 1)[1]
        payload = decode_token(token)
        if payload:
            requester = get_user_by_id(payload["sub"])
            engine    = get_matching_engine()
            for u in nearby:
                candidate = get_user_by_id(u["user_id"])
                if candidate and requester:
                    u["compatibility_score"] = engine.score_pair(requester, candidate)

    return jsonify({
        "success":         True,
        "center_location": {"lat": lat, "lng": lng},
        "radius_km":       radius,
        "roommates":       nearby,
    }), 200
