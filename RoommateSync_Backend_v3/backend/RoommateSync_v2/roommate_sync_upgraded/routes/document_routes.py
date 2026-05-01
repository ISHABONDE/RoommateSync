"""
Document / Verification Routes  (v3 — document-only KYC, no selfie)
─────────────────────────────────────────────────────────────────────
POST /documents/upload-profile    → upload profile photo
POST /documents/upload-id         → upload ID document (standalone)
POST /documents/submit-kyc        → document-only KYC pipeline
POST /documents/verify            → admin: manually set verification status
GET  /documents/status/<user_id>  → get verification status
"""
import os
from flask import Blueprint, request, jsonify

from routes.auth_routes import jwt_required
from config import config
from services.user_service import update_profile_image
from verification.document_upload import (
    save_profile_image, save_id_document, absolute_path
)
from verification.ocr_service import extract_text_from_image
from verification.kyc_workflow import run_kyc
from database.models import users_col, documents_col, VerificationStatus
from bson import ObjectId

documents_bp = Blueprint("documents", __name__, url_prefix="/documents")


@documents_bp.route("/upload-profile", methods=["POST"])
@jwt_required
def upload_profile_image():
    """
    Form-data: file=<image>
    Response: { success, message, profile_image }
    """
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file part in request."}), 400

    file   = request.files["file"]
    result = save_profile_image(file)
    if not result["success"]:
        return jsonify(result), 400

    update_profile_image(request.user_id, result["path"])
    return jsonify({
        "success":       True,
        "message":       "Profile image uploaded.",
        "profile_image": result["path"],
    }), 200


@documents_bp.route("/upload-id", methods=["POST"])
@jwt_required
def upload_id_document():
    """
    Form-data: file=<image|pdf>
    Saves document, runs OCR, stores extracted text.
    Response: { success, message, id_document, ocr_data }
    """
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file part in request."}), 400

    file       = request.files["file"]
    doc_result = save_id_document(file)
    if not doc_result["success"]:
        return jsonify(doc_result), 400

    abs_path   = absolute_path(doc_result["path"])
    ocr_result = extract_text_from_image(abs_path)

    users_col().update_one(
        {"_id": ObjectId(request.user_id)},
        {"$set": {
            "id_document": doc_result["path"],
            "ocr_text":    ocr_result.get("raw_text", ""),
            "ocr_data": {
                "name":      ocr_result.get("name"),
                "id_number": ocr_result.get("id_number"),
            },
            "verification_status": VerificationStatus.PENDING,
        }},
    )

    return jsonify({
        "success":      True,
        "message":      "ID document uploaded and OCR extracted.",
        "id_document":  doc_result["path"],
        "ocr_data": {
            "name":      ocr_result.get("name"),
            "id_number": ocr_result.get("id_number"),
            "raw_text":  ocr_result.get("raw_text", "")[:500],
        },
    }), 200


@documents_bp.route("/submit-kyc", methods=["POST"])
@jwt_required
def submit_kyc():
    """
    Form-data: document=<image|pdf>
    Runs document-only KYC pipeline (OCR, no selfie required).
    Response: { success, message, verification_status, details }
    """
    if "document" not in request.files:
        return jsonify({
            "success": False,
            "message": "A 'document' file is required (government-issued ID).",
        }), 400

    document_file = request.files["document"]
    result        = run_kyc(request.user_id, document_file)
    status        = 200 if result["success"] else 400
    return jsonify(result), status


@documents_bp.route("/verify", methods=["POST"])
@jwt_required
def manual_verify():
    """
    Admin endpoint: manually set verification_status.
    Body: { user_id, status (0-3), reason? }
    """
    data    = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    status  = data.get("status")

    if user_id is None or status is None:
        return jsonify({"success": False, "message": "user_id and status are required."}), 400

    valid = {VerificationStatus.NOT_VERIFIED, VerificationStatus.PENDING,
             VerificationStatus.VERIFIED, VerificationStatus.REJECTED}
    if int(status) not in valid:
        return jsonify({"success": False, "message": "status must be 0, 1, 2 or 3."}), 400

    users_col().update_one(
        {"_id": ObjectId(str(user_id))},
        {"$set": {"verification_status": int(status)}},
    )
    documents_col().update_one(
        {"user_id": str(user_id)},
        {"$set": {"status": int(status), "admin_reason": data.get("reason", "")}},
    )
    return jsonify({"success": True, "message": "Verification status updated."}), 200


@documents_bp.route("/status/<user_id>", methods=["GET"])
@jwt_required
def verification_status(user_id: str):
    """
    Response: { success, user_id, verification_status, ocr_data }
    """
    try:
        user = users_col().find_one({"_id": ObjectId(user_id)})
    except Exception:
        return jsonify({"success": False, "message": "Invalid user_id."}), 400

    if not user:
        return jsonify({"success": False, "message": "User not found."}), 404

    return jsonify({
        "success":             True,
        "user_id":             user_id,
        "verification_status": user.get("verification_status", 0),
        "email_verified":      user.get("email_verified", False),
        "profile_image":       user.get("profile_image", ""),
        "id_document":         user.get("id_document", ""),
        "ocr_data":            user.get("ocr_data", {}),
    }), 200
