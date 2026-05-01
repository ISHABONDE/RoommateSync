"""
Face Detection Service  (OpenCV only — face_recognition removed)
────────────────────────────────────────────────────────────────
Checks whether at least one face is present in a selfie image.
Does NOT perform identity matching or face encoding.
"""
import logging
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Use the bundled Haar cascade that ships with OpenCV
_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
_face_cascade = cv2.CascadeClassifier(_CASCADE_PATH)


def detect_face_in_image(image_path: str) -> dict:
    """
    Return::

        {
            "success":      bool,
            "face_found":   bool,
            "face_count":   int,
            "message":      str,
        }
    """
    path = Path(image_path)
    if not path.exists():
        return _result(success=False, face_found=False, count=0,
                       msg=f"File not found: {image_path}")

    image = cv2.imread(str(path))
    if image is None:
        return _result(success=False, face_found=False, count=0,
                       msg="Could not read image file.")

    gray   = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    faces  = _face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(60, 60),
    )
    count      = len(faces) if isinstance(faces, np.ndarray) else 0
    face_found = count > 0

    if face_found:
        msg = f"Face detected ({count} face(s) found)."
    else:
        msg = "No face detected in the image. Please upload a clear selfie."

    return _result(success=True, face_found=face_found, count=count, msg=msg)


# ── Internal ──────────────────────────────────────────────────────────────────

def _result(*, success: bool, face_found: bool, count: int, msg: str) -> dict:
    return {
        "success":    success,
        "face_found": face_found,
        "face_count": count,
        "message":    msg,
    }
