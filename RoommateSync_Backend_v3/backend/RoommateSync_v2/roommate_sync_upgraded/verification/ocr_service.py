"""
OCR Service  (v2 — image preprocessing + robust name extraction)
─────────────────────────────────────────────────────────────────
Improvements over v1
─────────────────────
1. Image preprocessing pipeline:
     • Upscale to minimum 1000px wide (Tesseract accuracy drops on small images)
     • Convert to grayscale
     • CLAHE contrast enhancement
     • Adaptive threshold (handles uneven lighting on ID cards)
2. Multiple Tesseract PSM modes tried in order:
     PSM 6  — uniform block of text (default)
     PSM 3  — fully automatic page segmentation
     PSM 11 — sparse text (picks up scattered words on ID cards)
3. Much broader name extraction:
     • Explicit label patterns: "Name:", "नाम", "Applicant" etc.
     • Mixed-case proper noun lines (handles non-all-caps IDs)
     • ALL-CAPS fallback
     • Raw-text fuzzy search against profile name (in kyc_workflow.py)
4. Robust ID number patterns covering Aadhaar, PAN, Passport, Voter ID, DL
"""
import re
import logging
from pathlib import Path

import cv2
import numpy as np
import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)


# ── Public API ────────────────────────────────────────────────────────────────

def extract_text_from_image(image_path: str) -> dict:
    """
    Preprocess the image then run Tesseract.

    Returns:
        {
          "success": bool,
          "raw_text": str,        ← best OCR output from all PSM attempts
          "name": str | None,
          "id_number": str | None,
          "error": str | None,
        }
    """
    path = Path(image_path)
    if not path.exists():
        return _error(f"File not found: {image_path}")

    try:
        preprocessed = _preprocess(path)
    except Exception as exc:
        logger.error(f"[OCR] Preprocessing failed: {exc}")
        return _error(f"Image preprocessing error: {exc}")

    # Try multiple PSM modes and keep the longest result
    # (more text = better chance of picking up name + ID)
    best_text = ""
    for psm in (6, 3, 11):
        try:
            config = f"--psm {psm} --oem 3"
            text   = pytesseract.image_to_string(preprocessed, lang="eng", config=config)
            if len(text) > len(best_text):
                best_text = text
        except Exception as exc:
            logger.warning(f"[OCR] PSM {psm} failed: {exc}")

    if not best_text.strip():
        return _error("Tesseract returned no text. The image may be too blurry or low resolution.")

    logger.debug(f"[OCR] raw_text ({len(best_text)} chars):\n{best_text[:300]}")

    parsed = _parse_id_info(best_text)
    return {
        "success":   True,
        "raw_text":  best_text.strip(),
        "name":      parsed.get("name"),
        "id_number": parsed.get("id_number"),
        "error":     None,
    }


# ── Image preprocessing ───────────────────────────────────────────────────────

def _preprocess(path: Path) -> Image.Image:
    """
    OpenCV preprocessing pipeline for ID card images.
    Returns a PIL Image ready for Tesseract.
    """
    # Read with OpenCV
    img = cv2.imread(str(path))
    if img is None:
        # Fallback: try via PIL → numpy
        pil = Image.open(path).convert("RGB")
        img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

    # 1. Upscale if image is small (Tesseract needs at least ~1000px wide)
    h, w = img.shape[:2]
    if w < 1000:
        scale = 1000 / w
        img   = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    # 2. Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 3. CLAHE contrast enhancement (helps with faded/washed-out IDs)
    clahe     = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced  = clahe.apply(gray)

    # 4. Adaptive threshold (handles shadows and uneven lighting on ID cards)
    thresh = cv2.adaptiveThreshold(
        enhanced, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=15, C=8,
    )

    # 5. Mild denoise to remove speckle without losing text detail
    denoised = cv2.fastNlMeansDenoising(thresh, h=10)

    return Image.fromarray(denoised)


# ── ID number patterns ────────────────────────────────────────────────────────

_ID_PATTERNS = [
    # Aadhaar: 12 digits in groups of 4 (e.g. 1234 5678 9012)
    re.compile(r"\b\d{4}\s?\d{4}\s?\d{4}\b"),
    # PAN: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)
    re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"),
    # Passport: 1 letter + 7 digits (e.g. A1234567)
    re.compile(r"\b[A-Z]\d{7}\b"),
    # Voter ID: 3 letters + 7 digits (e.g. ABC1234567)
    re.compile(r"\b[A-Z]{3}\d{7}\b"),
    # Driving licence: state code + digits (e.g. MH12 20220012345)
    re.compile(r"\b[A-Z]{2}\d{2}\s?\d{4}\s?\d{7}\b"),
]


# ── Name extraction patterns ──────────────────────────────────────────────────

# Pattern 1 — explicit label before the name
# Handles: "Name: Rushikesh", "Name\nRushikesh", "DOB" stopping the capture
_LABEL_BEFORE = re.compile(
    r"(?:Name|NAME|Applicant|APPLICANT|नाम|FullName|Full\s*Name)"
    r"[:\s/|]+([A-Za-z][A-Za-z\s\.]{2,50}?)(?:\n|$|DOB|D\.O\.B|Date|Father|Gender|S/O|D/O|W/O)",
    re.IGNORECASE,
)

# Pattern 2 — "S/O", "D/O", "W/O" markers (son/daughter/wife of — line above is usually name)
_RELATION_MARKER = re.compile(
    r"([A-Z][A-Za-z\s\.]{3,40})\s*\n\s*(?:S/O|D/O|W/O|C/O)",
    re.IGNORECASE,
)

# Pattern 3 — proper-noun capitalised line (Title Case or ALL CAPS, no digits)
_PROPER_NOUN_LINE = re.compile(
    r"^([A-Z][A-Za-z]+(?:\s+[A-Za-z]+){1,4})\s*$",
    re.MULTILINE,
)


def _parse_id_info(text: str) -> dict:
    result: dict = {}

    # ── ID number ──────────────────────────────────────────────────────────────
    for pattern in _ID_PATTERNS:
        m = pattern.search(text)
        if m:
            result["id_number"] = re.sub(r"\s+", "", m.group())
            break

    # ── Name — try strategies in order, stop at first confident match ──────────

    # Strategy 1: explicit "Name:" label
    m = _LABEL_BEFORE.search(text)
    if m:
        candidate = m.group(1).strip()
        if _valid_name(candidate):
            result["name"] = _clean_name(candidate)
            return result

    # Strategy 2: relation marker (line above S/O or D/O)
    m = _RELATION_MARKER.search(text)
    if m:
        candidate = m.group(1).strip()
        if _valid_name(candidate):
            result["name"] = _clean_name(candidate)
            return result

    # Strategy 3: proper-noun Title Case line
    for m in _PROPER_NOUN_LINE.finditer(text):
        candidate = m.group(1).strip()
        if _valid_name(candidate) and not _is_noise(candidate):
            result["name"] = _clean_name(candidate)
            return result

    # Strategy 4: ALL-CAPS line fallback
    for line in text.splitlines():
        cleaned = line.strip()
        if (
            cleaned.isupper()
            and 5 <= len(cleaned) <= 60
            and not any(c.isdigit() for c in cleaned)
            and not _is_noise(cleaned)
        ):
            result["name"] = cleaned.title()
            return result

    return result


# ── Helpers ───────────────────────────────────────────────────────────────────

# Words that appear on ID cards but are NOT names
_NOISE_WORDS = {
    "GOVERNMENT", "INDIA", "REPUBLIC", "ELECTION", "COMMISSION", "AUTHORITY",
    "DEPARTMENT", "INCOME", "TAX", "AADHAAR", "DRIVING", "LICENSE", "LICENCE",
    "PASSPORT", "VOTER", "IDENTITY", "CARD", "UNIQUE", "IDENTIFICATION",
    "ENROLLMENT", "PERMANENT", "ACCOUNT", "NUMBER", "DATE", "BIRTH",
    "MALE", "FEMALE", "OTHER", "ADDRESS", "DISTRICT", "STATE", "PIN",
}

def _is_noise(name: str) -> bool:
    words = set(name.upper().split())
    return bool(words & _NOISE_WORDS) or len(words) == 0

def _valid_name(name: str) -> bool:
    """Must have at least 2 words, only letters/spaces/dots, length 4–60."""
    name = name.strip()
    if not name or len(name) < 4 or len(name) > 60:
        return False
    if not re.match(r"^[A-Za-z][A-Za-z\s\.]+$", name):
        return False
    words = name.split()
    return len(words) >= 2

def _clean_name(name: str) -> str:
    """Normalise to Title Case, collapse spaces."""
    name = re.sub(r"\s+", " ", name).strip()
    return name.title()


# ── Error helper ──────────────────────────────────────────────────────────────

def _error(msg: str) -> dict:
    return {
        "success":   False,
        "raw_text":  "",
        "name":      None,
        "id_number": None,
        "error":     msg,
    }