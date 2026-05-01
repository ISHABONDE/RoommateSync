"""
KYC Workflow  (v5 — document-only, no selfie / face comparison)
───────────────────────────────────────────────────────────────

Decision matrix
───────────────
VERIFIED  → ID number extracted  +  name matches profile name
PENDING   → ID number found but name doesn't match (could be outdated ID)
            OR name found but no ID number could be extracted
            → submitted for manual admin review
REJECTED  → OCR extracted nothing useful (completely unreadable document)

Selfie / face detection has been removed entirely.
"""
import re
import logging
from datetime import datetime, timezone

from bson import ObjectId

from database.models import users_col, documents_col, VerificationStatus
from verification.document_upload import save_id_document, absolute_path
from verification.ocr_service import extract_text_from_image

logger = logging.getLogger(__name__)


# ── Name comparison (Jaccard word-overlap) ─────────────────────────────────────

def _normalise(name: str) -> str:
    name = name.lower()
    name = re.sub(r"[^a-z\s]", "", name)
    return re.sub(r"\s+", " ", name).strip()


def _compare_names(profile_name: str, ocr_name: str) -> tuple[bool, float, str]:
    norm_p = _normalise(profile_name)
    norm_o = _normalise(ocr_name)
    wp     = norm_p.split()
    wo     = norm_o.split()

    if not wp or not wo:
        return False, 0.0, "empty name"

    if len(wp) == 1 and len(wo) == 1:
        m = wp[0] == wo[0]
        return m, 1.0 if m else 0.0, "single-word exact"

    if len(wo) == 1 and len(wp) > 1:
        return False, 0.0, "ocr one-word only"

    sp      = set(wp)
    so      = set(wo)
    overlap = sp & so
    score   = len(overlap) / len(sp | so)
    match   = score >= 0.5
    return match, round(score, 2), f"jaccard={score:.2f}"


def _name_in_raw_text(profile_name: str, raw_text: str) -> tuple[bool, str]:
    if not raw_text or not profile_name:
        return False, ""
    raw_upper     = raw_text.upper()
    profile_words = _normalise(profile_name).split()
    if not profile_words:
        return False, ""
    if all(w.upper() in raw_upper for w in profile_words):
        found_as = " ".join(w.upper() for w in profile_words)
        return True, found_as
    return False, ""


# ── Main KYC pipeline (document-only) ─────────────────────────────────────────

def run_kyc(user_id: str, document_file) -> dict:
    """Run document-only KYC: save ID document, run OCR, decide status."""
    uid     = ObjectId(user_id)
    details = {}

    user_doc = users_col().find_one({"_id": uid}, {"name": 1})
    if not user_doc:
        return _fail("User not found.")
    profile_name: str = user_doc.get("name", "").strip()

    # Save & OCR the ID document
    doc_result = save_id_document(document_file)
    if not doc_result["success"]:
        return _fail(doc_result["message"])

    ocr_result    = extract_text_from_image(absolute_path(doc_result["path"]))
    details["ocr"] = ocr_result

    ocr_name      = (ocr_result.get("name")      or "").strip()
    ocr_id_number = (ocr_result.get("id_number") or "").strip()
    raw_text      = ocr_result.get("raw_text", "")

    # Name resolution with raw-text fallback
    name_used   = ocr_name
    name_source = "ocr_structured"

    if not ocr_name:
        found, found_as = _name_in_raw_text(profile_name, raw_text)
        if found:
            name_used   = found_as
            name_source = "raw_text_search"
            logger.info(f"[KYC] user={user_id}: raw-text fallback found '{found_as}'")

    name_matched      = None
    name_match_score  = None
    name_match_reason = None

    if not name_used and not ocr_id_number:
        # Nothing useful — unreadable document
        final_status  = VerificationStatus.REJECTED
        auto_decision = "rejected_unreadable_document"
        message = (
            "Verification rejected: could not extract any information from your document. "
            "Please upload a clearer, higher-resolution image of your government-issued ID."
        )

    elif not ocr_id_number:
        final_status  = VerificationStatus.PENDING
        auto_decision = "pending_id_number_not_found"
        message = (
            "Document submitted. Name was found but could not extract an ID number automatically. "
            "Your submission is under manual admin review."
        )
        name_match_reason = "id_number_missing"

    elif not name_used:
        final_status  = VerificationStatus.PENDING
        auto_decision = "pending_name_not_found"
        message = (
            f"Document submitted. ID number '{ocr_id_number}' was found but could not locate "
            "a name on the document. Your submission is under manual admin review."
        )
        name_match_reason = "name_not_found_in_doc"

    else:
        # Both name + ID found → compare
        name_matched, name_match_score, name_match_reason = _compare_names(
            profile_name, name_used
        )
        details["name_comparison"] = {
            "profile_name":  profile_name,
            "ocr_name":      name_used,
            "ocr_id_number": ocr_id_number,
            "name_source":   name_source,
            "match":         name_matched,
            "score":         name_match_score,
            "reason":        name_match_reason,
        }

        if name_matched:
            final_status  = VerificationStatus.VERIFIED
            auto_decision = "auto_verified"
            src_note      = " (found in raw text)" if name_source == "raw_text_search" else ""
            message = (
                f"Verification approved automatically. "
                f"Name '{name_used}'{src_note} matched your profile name "
                f"'{profile_name}' (score {name_match_score:.0%}). "
                f"ID: {ocr_id_number}."
            )
        else:
            # Name mismatch → pending for manual review (not hard-rejected,
            # user may have an older/different-format ID)
            final_status  = VerificationStatus.PENDING
            auto_decision = "pending_name_mismatch"
            message = (
                f"Document submitted. The name found on your ID ('{name_used}') "
                f"did not automatically match your registered name ('{profile_name}'). "
                "Your submission has been sent for manual admin review."
            )

    logger.info(
        f"[KYC] user={user_id} profile='{profile_name}' "
        f"ocr='{name_used}' id='{ocr_id_number}' "
        f"source={name_source} match={name_matched} → {auto_decision}"
    )

    _persist(
        user_id, uid, doc_result, ocr_result,
        {"profile_name": profile_name, "ocr_name": name_used,
         "match": name_matched, "score": name_match_score,
         "reason": name_match_reason, "source": name_source},
        final_status, auto_decision,
    )

    return {
        "success":             True,
        "message":             message,
        "verification_status": final_status,
        "auto_decision":       auto_decision,
        "details":             details,
    }


# ── Persistence ────────────────────────────────────────────────────────────────

def _persist(user_id, uid, doc_result, ocr_result,
             name_comparison, final_status, auto_decision):
    now = datetime.now(timezone.utc).isoformat()

    doc_set = {
        "user_id":       user_id,
        "auto_decision": auto_decision,
        "submitted_at":  now,
        "status":        final_status,
    }
    if doc_result:
        doc_set["doc_path"] = doc_result["path"]
    if ocr_result:
        doc_set.update({
            "raw_ocr_text":  ocr_result.get("raw_text", ""),
            "ocr_name":      ocr_result.get("name"),
            "ocr_id_number": ocr_result.get("id_number"),
        })
    if name_comparison:
        doc_set["name_comparison"] = name_comparison

    documents_col().update_one(
        {"user_id": user_id}, {"$set": doc_set}, upsert=True
    )

    user_set = {"verification_status": final_status}
    if doc_result:
        user_set["id_document"] = doc_result["path"]
    if ocr_result:
        user_set["ocr_text"] = ocr_result.get("raw_text", "")
        user_set["ocr_data"] = {
            "name":      ocr_result.get("name"),
            "id_number": ocr_result.get("id_number"),
        }

    users_col().update_one({"_id": uid}, {"$set": user_set})


def _fail(msg: str) -> dict:
    return {"success": False, "message": msg, "details": {}}
