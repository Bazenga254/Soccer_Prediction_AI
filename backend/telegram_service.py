"""
Telegram Bot API integration for Social Media Hub.
Handles sending/receiving messages, media, and webhook management.

Setup:
1. Message @BotFather on Telegram → /newbot
2. Copy the bot token
3. Connect via Social Media Hub → system registers webhook automatically
"""

import aiohttp
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org/bot{token}"
TELEGRAM_FILE_BASE = "https://api.telegram.org/file/bot{token}"


class TelegramService:
    def __init__(self, bot_token: str, webhook_base_url: str):
        self.bot_token = bot_token
        self.api_base = TELEGRAM_API_BASE.format(token=bot_token)
        self.file_base = TELEGRAM_FILE_BASE.format(token=bot_token)
        self.webhook_base_url = webhook_base_url

    async def _api_call(self, method: str, data: dict = None) -> Dict:
        url = f"{self.api_base}/{method}"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=data or {}, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    return await resp.json()
        except Exception as e:
            logger.error(f"Telegram API call {method} failed: {e}")
            return {"ok": False, "description": str(e)}

    # ─── Bot Info ───

    async def get_me(self) -> Dict:
        """Verify bot token and get bot info."""
        return await self._api_call("getMe")

    # ─── Webhook ───

    async def set_webhook(self, account_id: int, secret: str) -> Dict:
        webhook_url = f"{self.webhook_base_url}/api/webhook/social/telegram/{account_id}"
        return await self._api_call("setWebhook", {
            "url": webhook_url,
            "secret_token": secret,
            "allowed_updates": ["message", "edited_message", "channel_post", "callback_query"],
            "max_connections": 40,
        })

    async def delete_webhook(self) -> Dict:
        return await self._api_call("deleteWebhook")

    async def get_webhook_info(self) -> Dict:
        return await self._api_call("getWebhookInfo")

    # ─── Sending Messages ───

    async def send_message(self, chat_id: str, text: str, reply_to: int = None,
                           parse_mode: str = "HTML") -> Dict:
        data = {"chat_id": chat_id, "text": text, "parse_mode": parse_mode}
        if reply_to:
            data["reply_to_message_id"] = reply_to
        return await self._api_call("sendMessage", data)

    async def send_photo(self, chat_id: str, photo: str, caption: str = "") -> Dict:
        data = {"chat_id": chat_id, "photo": photo}
        if caption:
            data["caption"] = caption
        return await self._api_call("sendPhoto", data)

    async def send_video(self, chat_id: str, video: str, caption: str = "") -> Dict:
        data = {"chat_id": chat_id, "video": video}
        if caption:
            data["caption"] = caption
        return await self._api_call("sendVideo", data)

    async def send_document(self, chat_id: str, document: str, caption: str = "") -> Dict:
        data = {"chat_id": chat_id, "document": document}
        if caption:
            data["caption"] = caption
        return await self._api_call("sendDocument", data)

    async def send_animation(self, chat_id: str, animation: str, caption: str = "") -> Dict:
        data = {"chat_id": chat_id, "animation": animation}
        if caption:
            data["caption"] = caption
        return await self._api_call("sendAnimation", data)

    async def send_sticker(self, chat_id: str, sticker: str) -> Dict:
        return await self._api_call("sendSticker", {"chat_id": chat_id, "sticker": sticker})

    # ─── File Downloads ───

    async def get_file(self, file_id: str) -> Dict:
        """Get file info including download path."""
        result = await self._api_call("getFile", {"file_id": file_id})
        if result.get("ok") and result.get("result", {}).get("file_path"):
            result["result"]["download_url"] = (
                f"{self.file_base}/{result['result']['file_path']}"
            )
        return result

    # ─── Chat Info ───

    async def get_chat(self, chat_id: str) -> Dict:
        return await self._api_call("getChat", {"chat_id": chat_id})

    # ─── Parsing Incoming Updates ───

    @staticmethod
    def parse_incoming_update(update: dict) -> Optional[dict]:
        """Parse a Telegram webhook update into a normalized message dict."""
        message = update.get("message") or update.get("edited_message") or update.get("channel_post")
        if not message:
            return None

        chat = message.get("chat", {})
        sender = message.get("from", {})
        chat_id = str(chat.get("id", ""))

        # Determine sender name
        sender_name = ""
        if sender:
            parts = [sender.get("first_name", ""), sender.get("last_name", "")]
            sender_name = " ".join(p for p in parts if p) or sender.get("username", "")

        # Determine content type and extract data
        content_type = "text"
        content_text = message.get("text", "")
        media_file_id = ""
        media_filename = ""
        media_mime_type = ""

        if message.get("photo"):
            content_type = "image"
            # Get largest photo
            photo = message["photo"][-1]
            media_file_id = photo.get("file_id", "")
            content_text = message.get("caption", "")
        elif message.get("video"):
            content_type = "video"
            video = message["video"]
            media_file_id = video.get("file_id", "")
            media_filename = video.get("file_name", "video.mp4")
            media_mime_type = video.get("mime_type", "video/mp4")
            content_text = message.get("caption", "")
        elif message.get("document"):
            content_type = "document"
            doc = message["document"]
            media_file_id = doc.get("file_id", "")
            media_filename = doc.get("file_name", "document")
            media_mime_type = doc.get("mime_type", "")
            content_text = message.get("caption", "")
        elif message.get("voice"):
            content_type = "audio"
            voice = message["voice"]
            media_file_id = voice.get("file_id", "")
            media_mime_type = voice.get("mime_type", "audio/ogg")
        elif message.get("audio"):
            content_type = "audio"
            audio = message["audio"]
            media_file_id = audio.get("file_id", "")
            media_filename = audio.get("file_name", "audio")
            media_mime_type = audio.get("mime_type", "")
            content_text = message.get("caption", "")
        elif message.get("sticker"):
            content_type = "sticker"
            sticker = message["sticker"]
            media_file_id = sticker.get("file_id", "")
            content_text = sticker.get("emoji", "")
        elif message.get("location"):
            content_type = "location"
            loc = message["location"]
            content_text = f"Location: {loc.get('latitude')}, {loc.get('longitude')}"

        return {
            "chat_id": chat_id,
            "sender_name": sender_name,
            "sender_username": sender.get("username", ""),
            "sender_identifier": str(sender.get("id", chat_id)),
            "content_type": content_type,
            "content_text": content_text,
            "media_file_id": media_file_id,
            "media_filename": media_filename,
            "media_mime_type": media_mime_type,
            "media_url": "",
            "platform_message_id": str(message.get("message_id", "")),
            "metadata": {
                "chat_type": chat.get("type", ""),
                "chat_title": chat.get("title", ""),
                "is_edited": "edited_message" in update,
                "date": message.get("date"),
            },
        }
