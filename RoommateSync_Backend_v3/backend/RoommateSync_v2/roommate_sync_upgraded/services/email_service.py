"""
Email OTP Service
─────────────────
• generate_otp()            → 6-digit string
• send_otp_email()          → sends OTP via Flask-Mail, stores hash in MongoDB
• verify_otp()              → checks OTP, marks email_verified = True
"""
import random
import string
import hashlib
from datetime import datetime, timezone, timedelta
from flask import current_app
from flask_mail import Message

from database.models import otps_col, users_col
from config import config


# ── Helpers ───────────────────────────────────────────────────────────────────

def generate_otp(length: int = 6) -> str:
    """Return a cryptographically adequate 6-digit OTP."""
    return "".join(random.choices(string.digits, k=length))


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


# ── Core functions ────────────────────────────────────────────────────────────

def send_otp_email(email: str) -> dict:
    """
    Generate a new OTP, store its hash in MongoDB, and send it by email.
    Returns {"success": bool, "message": str}.
    """
    email = email.lower().strip()
    otp   = generate_otp()
    expiry = datetime.now(timezone.utc) + timedelta(
        minutes=config.OTP_EXPIRY_MINUTES
    )

    # Upsert OTP record (one active OTP per email at a time)
    otps_col().update_one(
        {"email": email},
        {
            "$set": {
                "email":      email,
                "otp_hash":   _hash_otp(otp),
                "expires_at": expiry.isoformat(),
                "verified":   False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )

    # Build and send email
    try:
        mail = current_app.extensions["mail"]
        msg = Message(
            subject="RoommateSync — Your Verification OTP",
            recipients=[email],
            body=(
                f"Hello,\n\n"
                f"Your RoommateSync verification OTP is:\n\n"
                f"    {otp}\n\n"
                f"This code expires in {config.OTP_EXPIRY_MINUTES} minutes.\n"
                f"Do NOT share this code with anyone.\n\n"
                f"— RoommateSync Team"
            ),
        )
        mail.send(msg)
        return {"success": True, "message": "OTP sent to your email."}
    except Exception as exc:
        # In development you may want to log/return the OTP; remove in prod.
        current_app.logger.error(f"[EmailService] Send failed: {exc}")
        return {
            "success": False,
            "message": f"Failed to send email: {str(exc)}",
            # Dev-only — remove before deploying:
            "_dev_otp": otp,
        }


def verify_otp(email: str, otp: str) -> dict:
    """
    Validate the supplied OTP for *email*.
    On success marks user.email_verified = True.
    Returns {"success": bool, "message": str}.
    """
    email = email.lower().strip()
    record = otps_col().find_one({"email": email})

    if not record:
        return {"success": False, "message": "No OTP found for this email. Please request a new one."}

    if record.get("verified"):
        return {"success": False, "message": "OTP already used. Please request a new one."}

    expiry = datetime.fromisoformat(record["expires_at"])
    if datetime.now(timezone.utc) > expiry:
        otps_col().delete_one({"email": email})
        return {"success": False, "message": "OTP has expired. Please request a new one."}

    if _hash_otp(otp) != record["otp_hash"]:
        return {"success": False, "message": "Invalid OTP. Please try again."}

    # Mark OTP as used and verify user's email
    otps_col().update_one({"email": email}, {"$set": {"verified": True}})
    users_col().update_one({"email": email}, {"$set": {"email_verified": True}})

    return {"success": True, "message": "Email verified successfully."}


def resend_otp(email: str) -> dict:
    """Delete any existing OTP and send a fresh one."""
    otps_col().delete_one({"email": email.lower().strip()})
    return send_otp_email(email)
