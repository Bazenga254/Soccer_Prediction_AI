"""
Phone verification via Twilio Verify API + WhatsApp broadcast for Spark AI Prediction.
Verify API handles SMS OTP automatically (code generation, expiry, rate limiting).
WhatsApp broadcast can be added later when Meta business verification is complete.
"""

import os
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

# Twilio configuration from environment
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_VERIFY_SID = os.environ.get("TWILIO_VERIFY_SID", "")  # Verify Service SID (VAxxxxxxxxx)
TWILIO_WHATSAPP_NUMBER = os.environ.get("TWILIO_WHATSAPP_NUMBER", "")  # For future WhatsApp broadcasts

_twilio_client = None


def _get_twilio_client():
    """Lazy-load Twilio REST client. Returns None if not configured."""
    global _twilio_client
    if _twilio_client is not None:
        return _twilio_client
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        logger.warning("[Twilio] Not configured - missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN")
        return None
    try:
        from twilio.rest import Client
        _twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        return _twilio_client
    except ImportError:
        logger.error("[Twilio] twilio package not installed. Run: pip install twilio")
        return None


def send_sms_otp(phone_number: str) -> Dict:
    """
    Send OTP via Twilio Verify API (SMS channel).
    Twilio generates and manages the code automatically.
    phone_number: International format e.g. "+254712345678"
    Returns: {"success": bool, "error"?: str}
    """
    client = _get_twilio_client()
    if not client:
        return {"success": False, "error": "Phone verification service not configured"}
    if not TWILIO_VERIFY_SID:
        return {"success": False, "error": "Verify service not configured (missing TWILIO_VERIFY_SID)"}

    try:
        verification = client.verify.v2 \
            .services(TWILIO_VERIFY_SID) \
            .verifications \
            .create(to=phone_number, channel="sms")
        logger.info(f"[Twilio Verify] OTP sent to ...{phone_number[-4:]}, status: {verification.status}")
        return {"success": True, "status": verification.status}
    except Exception as e:
        logger.error(f"[Twilio Verify] Failed to send OTP to ...{phone_number[-4:]}: {e}")
        return {"success": False, "error": str(e)}


def check_sms_otp(phone_number: str, code: str) -> Dict:
    """
    Verify the OTP code via Twilio Verify API.
    Returns: {"success": bool, "error"?: str}
    """
    client = _get_twilio_client()
    if not client:
        return {"success": False, "error": "Phone verification service not configured"}
    if not TWILIO_VERIFY_SID:
        return {"success": False, "error": "Verify service not configured"}

    try:
        verification_check = client.verify.v2 \
            .services(TWILIO_VERIFY_SID) \
            .verification_checks \
            .create(to=phone_number, code=code)
        if verification_check.status == "approved":
            logger.info(f"[Twilio Verify] OTP verified for ...{phone_number[-4:]}")
            return {"success": True}
        else:
            return {"success": False, "error": "Invalid verification code."}
    except Exception as e:
        error_msg = str(e)
        if "Max check attempts reached" in error_msg:
            return {"success": False, "error": "Too many attempts. Please request a new code."}
        if "not found" in error_msg.lower():
            return {"success": False, "error": "Verification expired. Please request a new code."}
        logger.error(f"[Twilio Verify] Check failed for ...{phone_number[-4:]}: {e}")
        return {"success": False, "error": "Verification failed. Please try again."}


# ==================== WhatsApp Broadcast (for future use) ====================

def send_whatsapp_message(phone_number: str, body_text: str) -> Dict:
    """Send a single text message via WhatsApp. Requires TWILIO_WHATSAPP_NUMBER."""
    client = _get_twilio_client()
    if not client or not TWILIO_WHATSAPP_NUMBER:
        return {"success": False, "error": "WhatsApp service not configured"}
    try:
        message = client.messages.create(
            from_=f"whatsapp:{TWILIO_WHATSAPP_NUMBER}",
            to=f"whatsapp:{phone_number}",
            body=body_text,
        )
        return {"success": True, "sid": message.sid}
    except Exception as e:
        logger.error(f"[WhatsApp] Failed to send message to ...{phone_number[-4:]}: {e}")
        return {"success": False, "error": str(e)}


def send_whatsapp_broadcast(title: str, message: str, phone_numbers: List[str]) -> Dict:
    """Send a broadcast message to multiple WhatsApp numbers."""
    client = _get_twilio_client()
    if not client or not TWILIO_WHATSAPP_NUMBER:
        return {"sent_count": 0, "failed_count": len(phone_numbers), "errors": ["WhatsApp not configured"]}

    import time
    body_text = f"*{title}*\n\n{message}\n\n\u2014 Spark AI Prediction"
    sent_count = 0
    failed_count = 0
    errors = []

    for phone in phone_numbers:
        try:
            client.messages.create(
                from_=f"whatsapp:{TWILIO_WHATSAPP_NUMBER}",
                to=f"whatsapp:{phone}",
                body=body_text,
            )
            sent_count += 1
        except Exception as e:
            failed_count += 1
            if len(errors) < 10:
                errors.append(f"...{phone[-4:]}: {str(e)}")
        if sent_count % 10 == 0:
            time.sleep(0.5)

    logger.info(f"[WhatsApp] Broadcast: {sent_count} sent, {failed_count} failed out of {len(phone_numbers)}")
    return {"sent_count": sent_count, "failed_count": failed_count, "errors": errors}
