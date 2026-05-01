from __future__ import annotations
"""
Document / Image Upload Helpers
────────────────────────────────
Validates file extensions and saves uploads to the correct sub-folder.
"""
import os
import uuid
import logging
from pathlib import Path
from werkzeug.datastructures import FileStorage

from config import config

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _allowed(filename: str, allowed: set[str]) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _unique_filename(original: str) -> str:
    ext = original.rsplit(".", 1)[1].lower() if "." in original else "bin"
    return f"{uuid.uuid4().hex}.{ext}"


# ── Public API ────────────────────────────────────────────────────────────────

def save_profile_image(file: FileStorage) -> dict:
    """
    Validate and save a profile photo.
    Returns {"success": bool, "path": str | None, "message": str}.
    """
    if not file or not file.filename:
        return {"success": False, "path": None, "message": "No file provided."}

    if not _allowed(file.filename, config.ALLOWED_IMAGE_EXTENSIONS):
        return {
            "success": False,
            "path":    None,
            "message": f"Invalid image type. Allowed: {', '.join(config.ALLOWED_IMAGE_EXTENSIONS)}",
        }

    _ensure_dir(config.UPLOAD_PROFILES)
    filename  = _unique_filename(file.filename)
    full_path = os.path.join(config.UPLOAD_PROFILES, filename)
    file.save(full_path)

    relative = f"/uploads/profiles/{filename}"   # URL path — always forward slashes
    logger.info(f"[Upload] Profile image saved → {relative}")
    return {"success": True, "path": relative, "message": "Profile image uploaded."}


def save_id_document(file: FileStorage) -> dict:
    """
    Validate and save an ID document (image or PDF).
    Returns {"success": bool, "path": str | None, "message": str}.
    """
    if not file or not file.filename:
        return {"success": False, "path": None, "message": "No file provided."}

    if not _allowed(file.filename, config.ALLOWED_DOC_EXTENSIONS):
        return {
            "success": False,
            "path":    None,
            "message": f"Invalid document type. Allowed: {', '.join(config.ALLOWED_DOC_EXTENSIONS)}",
        }

    _ensure_dir(config.UPLOAD_DOCUMENTS)
    filename  = _unique_filename(file.filename)
    full_path = os.path.join(config.UPLOAD_DOCUMENTS, filename)
    file.save(full_path)

    relative = f"/uploads/documents/{filename}"  # URL path — always forward slashes
    logger.info(f"[Upload] ID document saved → {relative}")
    return {"success": True, "path": relative, "message": "ID document uploaded."}


def save_selfie(file: FileStorage) -> dict:
    """
    Validate and save a selfie image.
    Returns {"success": bool, "path": str | None, "message": str}.
    """
    if not file or not file.filename:
        return {"success": False, "path": None, "message": "No file provided."}

    if not _allowed(file.filename, config.ALLOWED_IMAGE_EXTENSIONS):
        return {
            "success": False,
            "path":    None,
            "message": f"Invalid image type. Allowed: {', '.join(config.ALLOWED_IMAGE_EXTENSIONS)}",
        }

    _ensure_dir(config.UPLOAD_SELFIES)
    filename  = _unique_filename(file.filename)
    full_path = os.path.join(config.UPLOAD_SELFIES, filename)
    file.save(full_path)

    relative = f"/uploads/selfies/{filename}"    # URL path — always forward slashes
    logger.info(f"[Upload] Selfie saved → {relative}")
    return {"success": True, "path": relative, "message": "Selfie uploaded."}


def absolute_path(relative: str) -> str:
    """Convert a stored relative path back to a filesystem absolute path."""
    return os.path.join(config.BASE_DIR, relative)