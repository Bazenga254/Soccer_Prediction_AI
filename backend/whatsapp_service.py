"""
WhatsApp messaging via Twilio WhatsApp Business API for Spark AI Prediction.
Handles OTP verification and broadcast notifications.
"""

import os
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

# Twilio configuration from environment
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_WHATSAPP_NUMBER = os.environ.get("TWILIO_WHATSAPP_NUMBER", "")  # e.g. "+14155238886"

_twilio_client = None


def _get_twilio_client():
    """Lazy-load Twilio REST client. Returns None if not configured."""
    global _twilio_client
    if _twilio_client is not None:
        return _twilio_client
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER]):
        logger.warning("[WhatsApp] Twilio not configured - missing env vars")
        return None
    try:
        from twilio.rest import Client
        _twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        return _twilio_client
    except ImportError:
        logger.error("[WhatsApp] twilio package not installed. Run: pip install twilio")
        return None


def send_whatsapp_otp(phone_number: str, code: str) -> Dict:
    """
    Send a 6-digit OTP verification code via WhatsApp.
    phone_number: International format e.g. "+254712345678"
    code: 6-digit string
    Returns: {"success": bool, "error"?: str, "sid"?: str}
    """
    client = _get_twilio_client()
    if not client:
        return {"success": False, "error": "WhatsApp service not configured"}

    try:
        message = client.messages.create(
            from_=f"whatsapp:{TWILIO_WHATSAPP_NUMBER}",
            to=f"whatsapp:{phone_number}",
            body=(
                f"Your Spark AI Prediction verification code is: *{code}*\n\n"
                "This code expires in 10 minutes. Do not share it with anyone."
            ),
        )
        logger.info(f"[WhatsApp] OTP sent to ...{phone_number[-4:]}, SID: {message.sid}")
        return {"success": True, "sid": message.sid}
    except Exception as e:
        logger.error(f"[WhatsApp] Failed to send OTP to ...{phone_number[-4:]}: {e}")
        return {"success": False, "error": str(e)}


def send_whatsapp_message(phone_number: str, body_text: str) -> Dict:
    """
    Send a single text message via WhatsApp.
    Returns: {"success": bool, "error"?: str, "sid"?: str}
    """
    client = _get_twilio_client()
    if not client:
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
    """
    Send a broadcast message to multiple WhatsApp numbers.
    Iterates per-number (Twilio has no native bulk WhatsApp API).
    Returns: {"sent_count": int, "failed_count": int, "errors": list}
    """
    client = _get_twilio_client()
    if not client:
        return {"sent_count": 0, "failed_count": len(phone_numbers), "errors": ["WhatsApp not configured"]}

    import time
    body_text = f"*{title}*\n\n{message}\n\n— Spark AI Prediction"

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
        # Small delay to avoid rate limiting
        if sent_count % 10 == 0:
            time.sleep(0.5)

    logger.info(f"[WhatsApp] Broadcast: {sent_count} sent, {failed_count} failed out of {len(phone_numbers)}")
    return {"sent_count": sent_count, "failed_count": failed_count, "errors": errors}
