"""
WhatsApp Social Media Hub integration via Twilio.
Handles sending/receiving messages, media, and webhook verification.

Setup:
1. Go to Twilio Console → get Account SID, Auth Token, WhatsApp number
2. Connect via Social Media Hub
3. Copy the generated webhook URL → paste in Twilio's "When a message comes in" field
"""

import hmac
import hashlib
import logging
from urllib.parse import urlencode
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class WhatsAppSocialService:
    def __init__(self, account_sid: str, auth_token: str, from_number: str):
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.from_number = from_number  # e.g., "whatsapp:+14155238886"

    async def send_message(self, to_number: str, body: str) -> Dict:
        """Send a WhatsApp text message via Twilio API."""
        import aiohttp
        import base64

        # Ensure WhatsApp prefix
        if not to_number.startswith("whatsapp:"):
            to_number = f"whatsapp:{to_number}"
        from_num = self.from_number
        if not from_num.startswith("whatsapp:"):
            from_num = f"whatsapp:{from_num}"

        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        auth = base64.b64encode(f"{self.account_sid}:{self.auth_token}".encode()).decode()

        data = {
            "From": from_num,
            "To": to_number,
            "Body": body,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    data=data,
                    headers={"Authorization": f"Basic {auth}"},
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    result = await resp.json()
                    if resp.status >= 400:
                        logger.error(f"Twilio send failed: {result}")
                        return {"ok": False, "error": result.get("message", "Send failed"),
                                "sid": result.get("sid", "")}
                    return {"ok": True, "sid": result.get("sid", ""),
                            "status": result.get("status", "")}
        except Exception as e:
            logger.error(f"WhatsApp send error: {e}")
            return {"ok": False, "error": str(e)}

    async def send_media(self, to_number: str, media_url: str, body: str = "") -> Dict:
        """Send a WhatsApp media message."""
        import aiohttp
        import base64

        if not to_number.startswith("whatsapp:"):
            to_number = f"whatsapp:{to_number}"
        from_num = self.from_number
        if not from_num.startswith("whatsapp:"):
            from_num = f"whatsapp:{from_num}"

        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        auth = base64.b64encode(f"{self.account_sid}:{self.auth_token}".encode()).decode()

        data = {
            "From": from_num,
            "To": to_number,
            "MediaUrl": media_url,
        }
        if body:
            data["Body"] = body

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url, data=data,
                    headers={"Authorization": f"Basic {auth}"},
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    result = await resp.json()
                    return {"ok": resp.status < 400, "sid": result.get("sid", ""),
                            "status": result.get("status", "")}
        except Exception as e:
            logger.error(f"WhatsApp media send error: {e}")
            return {"ok": False, "error": str(e)}

    def verify_webhook(self, url: str, form_data: dict, signature: str) -> bool:
        """Verify Twilio webhook signature."""
        try:
            # Build the validation string
            data_string = url
            for key in sorted(form_data.keys()):
                data_string += key + form_data[key]

            expected = hmac.new(
                self.auth_token.encode("utf-8"),
                data_string.encode("utf-8"),
                hashlib.sha1
            ).digest()

            import base64
            expected_b64 = base64.b64encode(expected).decode()
            return hmac.compare_digest(expected_b64, signature)
        except Exception as e:
            logger.error(f"Webhook verification error: {e}")
            return False

    @staticmethod
    def parse_incoming_webhook(form_data: dict) -> Optional[dict]:
        """Parse a Twilio WhatsApp webhook into a normalized message dict."""
        body = form_data.get("Body", "")
        from_number = form_data.get("From", "")
        to_number = form_data.get("To", "")
        message_sid = form_data.get("MessageSid", "")
        num_media = int(form_data.get("NumMedia", "0"))
        profile_name = form_data.get("ProfileName", "")

        # Strip whatsapp: prefix for storage
        contact_id = from_number.replace("whatsapp:", "")

        content_type = "text"
        media_url = ""
        media_filename = ""
        media_mime_type = ""

        if num_media > 0:
            media_url = form_data.get("MediaUrl0", "")
            media_mime_type = form_data.get("MediaContentType0", "")
            if "image" in media_mime_type:
                content_type = "image"
                media_filename = "image.jpg"
            elif "video" in media_mime_type:
                content_type = "video"
                media_filename = "video.mp4"
            elif "audio" in media_mime_type:
                content_type = "audio"
                media_filename = "audio.ogg"
            else:
                content_type = "document"
                media_filename = "file"

        if not body and not media_url:
            return None

        return {
            "chat_id": contact_id,
            "sender_name": profile_name or contact_id,
            "sender_identifier": contact_id,
            "content_type": content_type,
            "content_text": body,
            "media_url": media_url,
            "media_filename": media_filename,
            "media_mime_type": media_mime_type,
            "platform_message_id": message_sid,
            "metadata": {
                "from_number": from_number,
                "to_number": to_number,
                "num_media": num_media,
                "account_sid": form_data.get("AccountSid", ""),
            },
        }
