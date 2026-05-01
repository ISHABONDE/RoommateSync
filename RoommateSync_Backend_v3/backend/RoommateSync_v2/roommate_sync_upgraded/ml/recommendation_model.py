from __future__ import annotations
"""
Recommendation Model
────────────────────
Pipeline: Load CSV → Normalize → KMeans cluster → KNN → Cosine similarity
          → Location filter → Room scenario filter → Top-10
"""
import logging
import os

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import MinMaxScaler

from config import config
from location.distance_calculator import haversine

logger = logging.getLogger(__name__)

FEATURE_COLS = [
    "sleep_time", "wake_time", "cleanliness", "noise_tolerance",
    "smoking", "Alcohol", "study_habit", "social_level", "guest_frequency",
    "room_rent", "room_size", "wifi", "parking", "furnished",
]


class RecommendationModel:
    def __init__(self):
        self.scaler: MinMaxScaler | None      = None
        self.kmeans: KMeans | None            = None
        self.knn:    NearestNeighbors | None  = None
        self.df_scaled: np.ndarray | None     = None
        self.df: pd.DataFrame | None          = None
        self._trained = False

    # ── Training ──────────────────────────────────────────────────────────────

    def train(self, dataset_path: str = None) -> dict:
        path = dataset_path or config.DATASET_PATH
        if not os.path.exists(path):
            return {"success": False, "message": f"Dataset not found: {path}"}

        try:
            df = pd.read_csv(path)
        except Exception as exc:
            return {"success": False, "message": f"CSV read error: {exc}"}

        missing = [c for c in FEATURE_COLS if c not in df.columns]
        if missing:
            return {"success": False, "message": f"Missing columns: {missing}"}

        df = df.dropna(subset=FEATURE_COLS).reset_index(drop=True)
        X  = df[FEATURE_COLS].values.astype(float)

        self.scaler    = MinMaxScaler()
        X_scaled       = self.scaler.fit_transform(X)
        self.df_scaled = X_scaled
        self.df        = df

        self.kmeans = KMeans(
            n_clusters=min(config.KMEANS_CLUSTERS, len(df)),
            random_state=42,
            n_init="auto",
        )
        self.kmeans.fit(X_scaled)
        df["_cluster"] = self.kmeans.labels_

        self.knn = NearestNeighbors(
            n_neighbors=min(config.KNN_NEIGHBORS, len(df)),
            metric="euclidean",
        )
        self.knn.fit(X_scaled)

        self._trained = True
        logger.info(f"[ML] Model trained on {len(df)} records.")
        return {"success": True, "message": f"Model trained on {len(df)} records."}

    # ── Recommendation ────────────────────────────────────────────────────────

    def recommend(self, user_profile: dict) -> list[dict]:
        """
        Return up to TOP_RECOMMENDATIONS candidates for *user_profile*.

        user_profile must contain all FEATURE_COLS + optional location /
        room_status / preferred_* fields.
        """
        if not self._trained:
            self.train()

        if not self._trained:
            return []

        # Build feature vector
        user_vec = np.array(
            [[float(user_profile.get(f, 0) or 0) for f in FEATURE_COLS]]
        )
        user_vec_scaled = self.scaler.transform(user_vec)

        # Identify cluster
        user_cluster = int(self.kmeans.predict(user_vec_scaled)[0])
        cluster_mask = self.df["_cluster"] == user_cluster
        cluster_idx  = np.where(cluster_mask)[0]

        if len(cluster_idx) == 0:
            cluster_idx = np.arange(len(self.df))

        cluster_scaled = self.df_scaled[cluster_idx]

        # KNN inside cluster
        k       = min(config.KNN_NEIGHBORS, len(cluster_idx))
        nn      = NearestNeighbors(n_neighbors=k, metric="euclidean")
        nn.fit(cluster_scaled)
        _, indices = nn.kneighbors(user_vec_scaled)
        nn_global_idx = cluster_idx[indices[0]]

        # Cosine similarity
        nn_scaled    = self.df_scaled[nn_global_idx]
        cos_scores   = cosine_similarity(user_vec_scaled, nn_scaled)[0]

        # Build candidate list with scores
        candidates = []
        for rank, (g_idx, cos) in enumerate(zip(nn_global_idx, cos_scores)):
            row = self.df.iloc[g_idx]
            candidates.append({
                "dataset_user_id": str(row.get("user_id", g_idx)),
                "cos_score":       round(float(cos), 4),
                "city":            row.get("city", ""),
                "area":            row.get("area", ""),
                "latitude":        row.get("latitude"),
                "longitude":       row.get("longitude"),
                "room_status":     row.get("room_status"),
                "roommates_needed":row.get("roommates_needed"),
                "current_roommates": row.get("current_roommates", 0),
                "preferred_city":  row.get("preferred_city", ""),
                "preferred_distance": row.get("preferred_distance", 5),
                **{f: row.get(f) for f in FEATURE_COLS},
            })

        # Location filter
        candidates = self._filter_by_location(user_profile, candidates)

        # Room scenario filter
        candidates = self._filter_by_room_status(user_profile, candidates)

        # Sort by cosine score descending
        candidates.sort(key=lambda x: x["cos_score"], reverse=True)
        return candidates[: config.TOP_RECOMMENDATIONS]

    # ── Filters ───────────────────────────────────────────────────────────────

    @staticmethod
    def _filter_by_location(user: dict, candidates: list) -> list:
        pref_city = (user.get("preferred_city") or "").lower().strip()
        ulat      = user.get("preferred_latitude") or user.get("latitude")
        ulon      = user.get("preferred_longitude") or user.get("longitude")
        max_dist  = float(user.get("preferred_distance") or 5)

        filtered = []
        for c in candidates:
            # City match (if set)
            if pref_city and (c.get("city") or "").lower().strip() != pref_city:
                continue
            # Distance filter (if coordinates available)
            if ulat and ulon and c.get("latitude") and c.get("longitude"):
                dist = haversine(ulat, ulon, float(c["latitude"]), float(c["longitude"]))
                if dist > max_dist:
                    continue
            filtered.append(c)
        return filtered

    @staticmethod
    def _filter_by_room_status(user: dict, candidates: list) -> list:
        user_status = user.get("room_status")
        if user_status is None:
            return candidates

        us = int(user_status)
        result = []
        for c in candidates:
            cs = int(c.get("room_status") or 0)
            if us == 1 and cs in (2, 3):    # has room → wants people to join
                pass
            elif us == 2 and cs in (2, 3):  # wants to find together
                pass
            elif us == 3 and cs == 1:        # wants to join someone with room
                pass
            else:
                continue

            # Capacity check
            needed  = int(c.get("roommates_needed") or 1)
            current = int(c.get("current_roommates") or 0)
            if needed - current <= 0:
                continue
            result.append(c)
        return result


# Singleton
_model = RecommendationModel()


def get_model() -> RecommendationModel:
    return _model
