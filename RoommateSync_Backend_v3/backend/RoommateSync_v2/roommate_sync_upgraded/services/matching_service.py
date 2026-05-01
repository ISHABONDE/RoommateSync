"""
Matching Service  (thin wrapper around the MatchingEngine)
───────────────────────────────────────────────────────────
Provides a clean service-layer interface for route handlers
that want compatibility scores without importing ML internals.
"""
from ml.matching_engine import get_matching_engine


def get_compatibility_matches(user_id: str) -> dict:
    """
    Return top compatibility matches for *user_id*.

    Delegates to MatchingEngine.get_matches().
    Response: { success, user_id, matches: [...] }
    """
    return get_matching_engine().get_matches(user_id)


def compute_pair_score(user_a: dict, user_b: dict) -> int:
    """
    Compute a 0-100 compatibility score between two user dicts.
    Does not require model training.
    """
    return get_matching_engine().score_pair(user_a, user_b)
