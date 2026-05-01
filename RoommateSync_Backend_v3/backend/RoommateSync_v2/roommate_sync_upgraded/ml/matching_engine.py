"""
Matching Engine  (v4 — KMeans + KNN + Cosine on live MongoDB users)
────────────────────────────────────────────────────────────────────

Pipeline
─────────
1. KMeans    — group all users into clusters by lifestyle similarity
2. KNN       — find K nearest neighbours inside the requester's cluster
3. Cosine    — rank those neighbours by actual compatibility score (0–100)

This is the correct full pipeline. Previous versions either used fake CSV
user IDs (always empty results) or skipped KMeans/KNN entirely. This
version fixes both and works with as few as 2 real MongoDB users.

Public API (unchanged)
──────────
get_matching_engine()               → MatchingEngine singleton
engine.get_matches(user_id)         → { success, user_id, matches: [...] }
engine.score_pair(user_a, user_b)   → int  (0-100)
"""
from __future__ import annotations

import logging
import math
from typing import Optional

import numpy as np
from sklearn.cluster import KMeans
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import MinMaxScaler

logger = logging.getLogger(__name__)

# ── Feature fields ─────────────────────────────────────────────────────────────
MATCH_FEATURES = [
    "sleep_time",       # 0=early, 1=normal, 2=late
    "cleanliness",      # 1–5
    "noise_tolerance",  # 1–5
    "smoking",          # 0/1
    "Alcohol",          # 0/1
    "study_habit",      # 0=none, 1=light, 2=heavy
    "social_level",     # 1–5
    "guest_frequency",  # 0–3
    "room_rent",        # budget
    "wake_time",        # encoded 0–2 or hour
]

# Known max value per feature — used for score_pair range normalisation
FEATURE_RANGES = {
    "sleep_time":      2,
    "cleanliness":     5,
    "noise_tolerance": 5,
    "smoking":         1,
    "Alcohol":         1,
    "study_habit":     2,
    "social_level":    5,
    "guest_frequency": 3,
    "room_rent":       30000,
    "wake_time":       23,
}

MIN_USERS   = 2    # minimum real users needed to run the pipeline
MIN_NONZERO = 1    # minimum non-zero features a user must have to be included


class MatchingEngine:
    def __init__(self):
        self._user_vectors: Optional[np.ndarray] = None
        self._user_ids:     list[str]            = []
        self._scaler:       Optional[MinMaxScaler] = None
        self._kmeans:       Optional[KMeans]     = None
        self._knn_per_cluster: dict              = {}  # cluster_id → NearestNeighbors
        self._cluster_indices: dict              = {}  # cluster_id → list of row indices
        self._trained:      bool                 = False

    # ── Load users from MongoDB ────────────────────────────────────────────────

    def _load_users(self) -> tuple[list[str], np.ndarray]:
        """
        Pull all MongoDB users who have at least MIN_NONZERO features set.
        Returns (user_id_list, raw_feature_matrix).
        """
        from database.models import users_col

        ids, rows = [], []
        for u in users_col().find({}, {"password": 0}):
            vec = [float(u.get(f) or 0) for f in MATCH_FEATURES]
            if sum(v != 0 for v in vec) >= MIN_NONZERO:
                ids.append(str(u["_id"]))
                rows.append(vec)

        if not rows:
            return [], np.empty((0, len(MATCH_FEATURES)))
        return ids, np.array(rows, dtype=float)

    # ── Train  ─────────────────────────────────────────────────────────────────

    def train(self) -> dict:
        """
        Full pipeline training:
          1. Load users from MongoDB
          2. MinMaxScaler normalise (with augmented row to prevent zero-collapse)
          3. KMeans — decide number of clusters dynamically
          4. For each cluster, fit a NearestNeighbors model

        Called automatically on every get_matches() so new users appear instantly.
        """
        ids, X = self._load_users()
        n = len(ids)

        if n < MIN_USERS:
            self._trained = False
            return {
                "success": False,
                "message": f"Need at least {MIN_USERS} users with preferences set. Found {n}.",
                "users_found": n,
            }

        # ── Step 1: Scale ───────────────────────────────────────────────────
        # Add an augmented max row so MinMaxScaler never collapses identical
        # columns to zero (which causes cosine similarity to return 0).
        aug   = X.max(axis=0) + 1e-6
        X_aug = np.vstack([X, aug])
        self._scaler = MinMaxScaler()
        self._scaler.fit(X_aug)
        X_scaled = self._scaler.transform(X)

        # ── Step 2: KMeans clustering ──────────────────────────────────────
        # Dynamic cluster count: sqrt(n/2) capped between 2 and 10.
        # With 2–4 users → 2 clusters, 10 users → 3, 50 users → 5, 200+ → 10.
        n_clusters = max(2, min(10, math.isqrt(n // 2 + 1)))
        # Ensure we don't request more clusters than users
        n_clusters = min(n_clusters, n)

        self._kmeans = KMeans(
            n_clusters=n_clusters,
            random_state=42,
            n_init="auto",
        )
        labels = self._kmeans.fit_predict(X_scaled)

        # ── Step 3: KNN per cluster ────────────────────────────────────────
        # Build a NearestNeighbors model for each cluster so we can quickly
        # retrieve the K most similar users within the requester's cluster.
        self._knn_per_cluster  = {}
        self._cluster_indices  = {}

        for c in range(n_clusters):
            idx = np.where(labels == c)[0]
            self._cluster_indices[c] = idx

            if len(idx) == 0:
                continue

            # K = min(all users in cluster, 20) — never exceed cluster size
            k = min(len(idx), 20)
            knn = NearestNeighbors(n_neighbors=k, metric="euclidean")
            knn.fit(X_scaled[idx])
            self._knn_per_cluster[c] = knn

        # Store the full scaled matrix and ids for final cosine scoring
        self._user_vectors = X_scaled
        self._user_ids     = ids
        self._trained      = True

        logger.info(
            f"[MatchingEngine] Trained — {n} users, {n_clusters} KMeans clusters, "
            f"KNN per cluster, cosine final ranking."
        )
        return {
            "success":    True,
            "message":    f"Trained on {n} users with {n_clusters} clusters.",
            "users_found": n,
            "clusters":   n_clusters,
        }

    # ── score_pair ─────────────────────────────────────────────────────────────

    def score_pair(self, user_a: dict, user_b: dict) -> int:
        """
        Compute a 0–100 compatibility score for any two user dicts.
        Uses range-normalised cosine similarity so:
          identical profiles  → 100
          opposite profiles   → ~40
          both empty          → 50 (neutral)
        """
        va, vb = [], []
        for f in MATCH_FEATURES:
            r = FEATURE_RANGES.get(f, 1) or 1
            va.append(float(user_a.get(f) or 0) / r)
            vb.append(float(user_b.get(f) or 0) / r)

        va = np.array([va])
        vb = np.array([vb])

        if not va.any() and not vb.any():
            return 50
        if np.array_equal(va, vb):
            return 100

        cos = float(cosine_similarity(va, vb)[0][0])
        if np.isnan(cos):
            return 50
        return max(0, min(100, round(cos * 100)))

    # ── get_matches ────────────────────────────────────────────────────────────

    def get_matches(self, user_id: str) -> dict:
        """
        Full KMeans → KNN → Cosine pipeline for user_id.

        Steps
        ─────
        1. Retrain from live MongoDB (fast, ensures new users appear)
        2. Vectorise the requester using the trained scaler
        3. KMeans.predict → find the requester's cluster
        4. KNN on that cluster → get top K nearest neighbours
        5. Cosine similarity → compute 0–100 score for each neighbour
        6. Sort by score, return top N with full profile fields

        Response
        ────────
        {
          "success": True,
          "user_id": "...",
          "pipeline": "kmeans+knn+cosine",
          "clusters": N,
          "users_found": N,
          "matches": [
            { "user_id", "name", "compatibility_score", "profile_image",
              "city", "area", "latitude", "longitude",
              "room_rent", "sleep_time", "smoking", "verification_status" }
          ]
        }
        """
        from services.user_service import get_user_by_id
        from config import config

        # Always retrain so newly registered users are visible immediately
        train_result = self.train()
        if not train_result["success"]:
            return {
                "success": False,
                "message": train_result["message"],
                "users_found": train_result.get("users_found", 0),
                "matches": [],
            }

        requester = get_user_by_id(user_id)
        if not requester:
            return {"success": False, "message": "User not found.", "matches": []}

        # ── Step A: vectorise requester ──────────────────────────────────────
        req_raw    = np.array([[float(requester.get(f) or 0) for f in MATCH_FEATURES]])
        req_scaled = self._scaler.transform(req_raw)

        # ── Step B: KMeans → find requester's cluster ────────────────────────
        cluster_id = int(self._kmeans.predict(req_scaled)[0])
        logger.debug(f"[MatchingEngine] User {user_id} → cluster {cluster_id}")

        cluster_idx = self._cluster_indices.get(cluster_id, np.array([]))

        # If the cluster is empty or the user is alone in it, fall back to
        # all users so we never return an empty list
        if len(cluster_idx) <= 1:
            logger.info("[MatchingEngine] Cluster too small — using all users.")
            candidate_global_idx = list(range(len(self._user_ids)))
        else:
            # ── Step C: KNN inside the cluster ──────────────────────────────
            knn_model  = self._knn_per_cluster[cluster_id]
            cluster_X  = self._user_vectors[cluster_idx]
            # Request min(20, cluster_size) neighbours
            k_ask      = min(20, len(cluster_idx))
            distances, local_idx = knn_model.kneighbors(req_scaled, n_neighbors=k_ask)
            # Map local cluster indices back to global row indices
            candidate_global_idx = cluster_idx[local_idx[0]].tolist()

        # ── Step D: Cosine similarity → rank candidates ──────────────────────
        candidate_vectors = self._user_vectors[candidate_global_idx]
        cos_scores        = cosine_similarity(req_scaled, candidate_vectors)[0]

        # Pair up (global_index, score), exclude requester
        ranked = sorted(
            [
                (self._user_ids[gi], float(s))
                for gi, s in zip(candidate_global_idx, cos_scores)
                if self._user_ids[gi] != user_id
            ],
            key=lambda x: x[1],
            reverse=True,
        )[:config.TOP_RECOMMENDATIONS]

        # ── Step E: Build response with full profile fields ──────────────────
        matches = []
        for match_uid, _ in ranked:
            candidate = get_user_by_id(match_uid)
            if not candidate:
                continue
            # Use score_pair for the final displayed score — it uses
            # range-normalised cosine which is more interpretable than
            # the raw MinMaxScaler cosine used for ranking
            score = self.score_pair(requester, candidate)
            matches.append({
                "user_id":             match_uid,
                "name":                candidate.get("name", ""),
                "compatibility_score": score,
                "profile_image":       candidate.get("profile_image", ""),
                "city":                candidate.get("city", ""),
                "area":                candidate.get("area", ""),
                "latitude":            candidate.get("latitude"),
                "longitude":           candidate.get("longitude"),
                "room_rent":           candidate.get("room_rent"),
                "sleep_time":          candidate.get("sleep_time"),
                "smoking":             candidate.get("smoking"),
                "verification_status": candidate.get("verification_status", 0),
            })

        # Re-sort by final score
        matches.sort(key=lambda x: x["compatibility_score"], reverse=True)

        return {
            "success":     True,
            "user_id":     user_id,
            "pipeline":    "kmeans+knn+cosine",
            "clusters":    train_result.get("clusters"),
            "users_found": train_result.get("users_found"),
            "matches":     matches,
        }


# ── Singleton ──────────────────────────────────────────────────────────────────
_engine = MatchingEngine()


def get_matching_engine() -> MatchingEngine:
    return _engine