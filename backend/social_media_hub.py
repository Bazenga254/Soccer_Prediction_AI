"""
Social Media Management Hub for Spark AI
Core module: database schema, CRUD operations, SSE pub/sub, scheduled post checker.
Supports Telegram + WhatsApp (Phase 1), with extensible schema for Facebook, Instagram, X.
"""

import sqlite3
import json
import asyncio
import uuid
import os
import logging
import aiohttp
from datetime import datetime
from typing import Optional, Dict, List, Set
from pathlib import Path

logger = logging.getLogger(__name__)

DB_PATH = "community.db"
UPLOAD_DIR = Path(__file__).parent / "uploads" / "social"

# ─── SSE pub/sub for real-time inbox notifications ───
_social_subscribers: Dict[str, Set[asyncio.Event]] = {}
_social_signals: Dict[str, dict] = {}


def subscribe_social_inbox() -> asyncio.Event:
    event = asyncio.Event()
    _social_subscribers.setdefault("inbox", set()).add(event)
    return event


def unsubscribe_social_inbox(event: asyncio.Event):
    if "inbox" in _social_subscribers:
        _social_subscribers["inbox"].discard(event)


def get_social_signal() -> dict:
    return _social_signals.get("inbox", {})


def notify_social_inbox(message_data: dict):
    _social_signals["inbox"] = message_data
    for event in list(_social_subscribers.get("inbox", set())):
        event.set()


# ─── Database helpers ───

def _get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=3000")
    return conn


def init_social_media_db():
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS social_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            account_name TEXT NOT NULL,
            account_identifier TEXT DEFAULT '',
            credentials_json TEXT DEFAULT '{}',
            webhook_url TEXT DEFAULT '',
            webhook_secret TEXT DEFAULT '',
            status TEXT DEFAULT 'disconnected',
            error_message TEXT DEFAULT '',
            config_json TEXT DEFAULT '{}',
            connected_by INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sa_platform ON social_accounts(platform);
        CREATE INDEX IF NOT EXISTS idx_sa_status ON social_accounts(status);

        CREATE TABLE IF NOT EXISTS social_conversations (
            id TEXT PRIMARY KEY,
            account_id INTEGER NOT NULL,
            platform TEXT NOT NULL,
            contact_identifier TEXT NOT NULL,
            contact_name TEXT DEFAULT '',
            contact_avatar_url TEXT DEFAULT '',
            last_message_text TEXT DEFAULT '',
            last_message_at TEXT,
            unread_count INTEGER DEFAULT 0,
            is_archived INTEGER DEFAULT 0,
            is_muted INTEGER DEFAULT 0,
            assigned_employee_id INTEGER,
            assigned_employee_name TEXT DEFAULT '',
            tags TEXT DEFAULT '[]',
            metadata_json TEXT DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT,
            FOREIGN KEY (account_id) REFERENCES social_accounts(id)
        );
        CREATE INDEX IF NOT EXISTS idx_sc_account ON social_conversations(account_id);
        CREATE INDEX IF NOT EXISTS idx_sc_platform ON social_conversations(platform);
        CREATE INDEX IF NOT EXISTS idx_sc_assigned ON social_conversations(assigned_employee_id);
        CREATE INDEX IF NOT EXISTS idx_sc_last_msg ON social_conversations(last_message_at);

        CREATE TABLE IF NOT EXISTS social_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            platform TEXT NOT NULL,
            direction TEXT NOT NULL,
            sender_name TEXT DEFAULT '',
            sender_identifier TEXT DEFAULT '',
            content_type TEXT DEFAULT 'text',
            content_text TEXT DEFAULT '',
            media_url TEXT DEFAULT '',
            media_filename TEXT DEFAULT '',
            media_mime_type TEXT DEFAULT '',
            platform_message_id TEXT DEFAULT '',
            reply_to_message_id INTEGER,
            delivery_status TEXT DEFAULT 'sent',
            error_message TEXT DEFAULT '',
            metadata_json TEXT DEFAULT '{}',
            sent_by_user_id INTEGER,
            sent_by_name TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES social_conversations(id)
        );
        CREATE INDEX IF NOT EXISTS idx_sm_conv ON social_messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_sm_platform ON social_messages(platform);
        CREATE INDEX IF NOT EXISTS idx_sm_created ON social_messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_sm_platform_msg_id ON social_messages(platform_message_id);

        CREATE TABLE IF NOT EXISTS social_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT DEFAULT '',
            content_text TEXT DEFAULT '',
            media_urls TEXT DEFAULT '[]',
            target_platforms TEXT DEFAULT '[]',
            status TEXT DEFAULT 'draft',
            scheduled_at TEXT,
            published_at TEXT,
            publish_results TEXT DEFAULT '[]',
            created_by_user_id INTEGER,
            created_by_name TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sp_status ON social_posts(status);
        CREATE INDEX IF NOT EXISTS idx_sp_scheduled ON social_posts(scheduled_at);

        CREATE TABLE IF NOT EXISTS social_reply_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT DEFAULT 'general',
            shortcut TEXT DEFAULT '',
            platforms TEXT DEFAULT '["all"]',
            usage_count INTEGER DEFAULT 0,
            created_by INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS social_media_library (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_url TEXT NOT NULL,
            mime_type TEXT DEFAULT '',
            file_size INTEGER DEFAULT 0,
            media_type TEXT DEFAULT 'image',
            uploaded_by INTEGER,
            created_at TEXT NOT NULL
        );
    """)
    conn.commit()
    conn.close()
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("[Social Media Hub] Database initialized")


# ═══════════════════════════════════════════
#  ACCOUNT MANAGEMENT
# ═══════════════════════════════════════════

def get_accounts(platform: str = None) -> list:
    conn = _get_db()
    if platform:
        rows = conn.execute(
            "SELECT * FROM social_accounts WHERE platform = ? ORDER BY created_at DESC",
            (platform,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM social_accounts ORDER BY created_at DESC"
        ).fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        # Don't expose raw credentials
        d.pop("credentials_json", None)
        results.append(d)
    return results


def get_account(account_id: int) -> Optional[dict]:
    conn = _get_db()
    row = conn.execute("SELECT * FROM social_accounts WHERE id = ?", (account_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    # Parse credentials for internal use
    try:
        d["credentials"] = json.loads(d.get("credentials_json", "{}"))
    except:
        d["credentials"] = {}
    try:
        d["config"] = json.loads(d.get("config_json", "{}"))
    except:
        d["config"] = {}
    return d


def create_account(platform: str, account_name: str, account_identifier: str,
                   credentials: dict, webhook_url: str, webhook_secret: str,
                   config: dict = None, connected_by: int = None) -> dict:
    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute(
        """INSERT INTO social_accounts
        (platform, account_name, account_identifier, credentials_json,
         webhook_url, webhook_secret, status, config_json, connected_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'connected', ?, ?, ?, ?)""",
        (platform, account_name, account_identifier,
         json.dumps(credentials), webhook_url, webhook_secret,
         json.dumps(config or {}), connected_by, now, now)
    )
    account_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()
    return {"id": account_id, "platform": platform, "account_name": account_name,
            "status": "connected", "created_at": now}


def update_account_status(account_id: int, status: str, error_message: str = ""):
    conn = _get_db()
    conn.execute(
        "UPDATE social_accounts SET status = ?, error_message = ?, updated_at = ? WHERE id = ?",
        (status, error_message, datetime.now().isoformat(), account_id)
    )
    conn.commit()
    conn.close()


def delete_account(account_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM social_accounts WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()


# ═══════════════════════════════════════════
#  CONVERSATIONS
# ═══════════════════════════════════════════

def get_or_create_conversation(account_id: int, platform: str,
                                contact_id: str, contact_name: str = "",
                                contact_avatar: str = "") -> dict:
    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM social_conversations WHERE account_id = ? AND contact_identifier = ?",
        (account_id, str(contact_id))
    ).fetchone()
    if row:
        # Update contact name if changed
        if contact_name and contact_name != row["contact_name"]:
            conn.execute(
                "UPDATE social_conversations SET contact_name = ?, updated_at = ? WHERE id = ?",
                (contact_name, datetime.now().isoformat(), row["id"])
            )
            conn.commit()
        conn.close()
        return dict(row)

    conv_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    conn.execute(
        """INSERT INTO social_conversations
        (id, account_id, platform, contact_identifier, contact_name, contact_avatar_url,
         created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (conv_id, account_id, platform, str(contact_id), contact_name, contact_avatar, now, now)
    )
    conn.commit()
    result = dict(conn.execute(
        "SELECT * FROM social_conversations WHERE id = ?", (conv_id,)
    ).fetchone())
    conn.close()
    return result


def get_conversations(platform: str = None, assigned_to: int = None,
                      is_archived: bool = False, search: str = None,
                      offset: int = 0, limit: int = 50) -> dict:
    conn = _get_db()
    conditions = ["is_archived = ?"]
    params = [1 if is_archived else 0]

    if platform:
        conditions.append("platform = ?")
        params.append(platform)
    if assigned_to:
        conditions.append("assigned_employee_id = ?")
        params.append(assigned_to)
    if search:
        conditions.append("(contact_name LIKE ? OR last_message_text LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])

    where = " AND ".join(conditions)
    total = conn.execute(
        f"SELECT COUNT(*) FROM social_conversations WHERE {where}", params
    ).fetchone()[0]

    rows = conn.execute(
        f"""SELECT * FROM social_conversations WHERE {where}
        ORDER BY last_message_at DESC NULLS LAST
        LIMIT ? OFFSET ?""",
        params + [limit, offset]
    ).fetchall()
    conn.close()
    return {"conversations": [dict(r) for r in rows], "total": total}


def get_conversation(conv_id: str) -> Optional[dict]:
    conn = _get_db()
    row = conn.execute("SELECT * FROM social_conversations WHERE id = ?", (conv_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_conversation_last_message(conv_id: str, text: str, increment_unread: bool = True):
    conn = _get_db()
    now = datetime.now().isoformat()
    if increment_unread:
        conn.execute(
            """UPDATE social_conversations
            SET last_message_text = ?, last_message_at = ?, unread_count = unread_count + 1,
                updated_at = ?
            WHERE id = ?""",
            (text[:200], now, now, conv_id)
        )
    else:
        conn.execute(
            """UPDATE social_conversations
            SET last_message_text = ?, last_message_at = ?, updated_at = ?
            WHERE id = ?""",
            (text[:200], now, now, conv_id)
        )
    conn.commit()
    conn.close()


def mark_conversation_read(conv_id: str):
    conn = _get_db()
    conn.execute(
        "UPDATE social_conversations SET unread_count = 0, updated_at = ? WHERE id = ?",
        (datetime.now().isoformat(), conv_id)
    )
    conn.commit()
    conn.close()


def archive_conversation(conv_id: str, archived: bool = True):
    conn = _get_db()
    conn.execute(
        "UPDATE social_conversations SET is_archived = ?, updated_at = ? WHERE id = ?",
        (1 if archived else 0, datetime.now().isoformat(), conv_id)
    )
    conn.commit()
    conn.close()


def assign_conversation(conv_id: str, employee_id: int, employee_name: str):
    conn = _get_db()
    conn.execute(
        """UPDATE social_conversations
        SET assigned_employee_id = ?, assigned_employee_name = ?, updated_at = ?
        WHERE id = ?""",
        (employee_id, employee_name, datetime.now().isoformat(), conv_id)
    )
    conn.commit()
    conn.close()


# ═══════════════════════════════════════════
#  MESSAGES
# ═══════════════════════════════════════════

def store_inbound_message(conv_id: str, platform: str, parsed: dict) -> dict:
    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute(
        """INSERT INTO social_messages
        (conversation_id, platform, direction, sender_name, sender_identifier,
         content_type, content_text, media_url, media_filename, media_mime_type,
         platform_message_id, metadata_json, created_at)
        VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (conv_id, platform,
         parsed.get("sender_name", ""),
         parsed.get("sender_identifier", ""),
         parsed.get("content_type", "text"),
         parsed.get("content_text", ""),
         parsed.get("media_url", ""),
         parsed.get("media_filename", ""),
         parsed.get("media_mime_type", ""),
         parsed.get("platform_message_id", ""),
         json.dumps(parsed.get("metadata", {})),
         now)
    )
    msg_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()

    # Update conversation
    preview = parsed.get("content_text", "") or f"[{parsed.get('content_type', 'media')}]"
    update_conversation_last_message(conv_id, preview, increment_unread=True)

    msg = dict(conn.execute("SELECT * FROM social_messages WHERE id = ?", (msg_id,)).fetchone())
    conn.close()
    return msg


def store_outbound_message(conv_id: str, platform: str, content_text: str,
                           content_type: str = "text", media_url: str = "",
                           media_filename: str = "", media_mime_type: str = "",
                           platform_message_id: str = "", sent_by_user_id: int = None,
                           sent_by_name: str = "", delivery_status: str = "sent") -> dict:
    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute(
        """INSERT INTO social_messages
        (conversation_id, platform, direction, sender_name, sender_identifier,
         content_type, content_text, media_url, media_filename, media_mime_type,
         platform_message_id, delivery_status, sent_by_user_id, sent_by_name, created_at)
        VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (conv_id, platform, sent_by_name, f"staff:{sent_by_user_id}",
         content_type, content_text, media_url, media_filename, media_mime_type,
         platform_message_id, delivery_status, sent_by_user_id, sent_by_name, now)
    )
    msg_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()

    preview = content_text or f"[{content_type}]"
    update_conversation_last_message(conv_id, f"You: {preview}", increment_unread=False)

    msg = dict(conn.execute("SELECT * FROM social_messages WHERE id = ?", (msg_id,)).fetchone())
    conn.close()
    return msg


def get_messages(conv_id: str, before_id: int = None, limit: int = 50) -> list:
    conn = _get_db()
    if before_id:
        rows = conn.execute(
            """SELECT * FROM social_messages
            WHERE conversation_id = ? AND id < ?
            ORDER BY id DESC LIMIT ?""",
            (conv_id, before_id, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT * FROM social_messages
            WHERE conversation_id = ?
            ORDER BY id DESC LIMIT ?""",
            (conv_id, limit)
        ).fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]


def get_message_by_id(msg_id: int) -> Optional[dict]:
    conn = _get_db()
    row = conn.execute("SELECT * FROM social_messages WHERE id = ?", (msg_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def search_messages(query: str, platform: str = None, limit: int = 50) -> list:
    conn = _get_db()
    if platform:
        rows = conn.execute(
            """SELECT m.*, c.contact_name FROM social_messages m
            JOIN social_conversations c ON m.conversation_id = c.id
            WHERE m.content_text LIKE ? AND m.platform = ?
            ORDER BY m.created_at DESC LIMIT ?""",
            (f"%{query}%", platform, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT m.*, c.contact_name FROM social_messages m
            JOIN social_conversations c ON m.conversation_id = c.id
            WHERE m.content_text LIKE ?
            ORDER BY m.created_at DESC LIMIT ?""",
            (f"%{query}%", limit)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ═══════════════════════════════════════════
#  CONTENT POSTS
# ═══════════════════════════════════════════

def create_post(title: str, content_text: str, media_urls: list,
                target_platforms: list, scheduled_at: str = None,
                created_by_user_id: int = None, created_by_name: str = "") -> dict:
    conn = _get_db()
    now = datetime.now().isoformat()
    status = "scheduled" if scheduled_at else "draft"
    conn.execute(
        """INSERT INTO social_posts
        (title, content_text, media_urls, target_platforms, status,
         scheduled_at, created_by_user_id, created_by_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (title, content_text, json.dumps(media_urls), json.dumps(target_platforms),
         status, scheduled_at, created_by_user_id, created_by_name, now, now)
    )
    post_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    row = conn.execute("SELECT * FROM social_posts WHERE id = ?", (post_id,)).fetchone()
    conn.close()
    return dict(row)


def get_posts(status: str = None, offset: int = 0, limit: int = 20) -> dict:
    conn = _get_db()
    if status:
        total = conn.execute(
            "SELECT COUNT(*) FROM social_posts WHERE status = ?", (status,)
        ).fetchone()[0]
        rows = conn.execute(
            "SELECT * FROM social_posts WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (status, limit, offset)
        ).fetchall()
    else:
        total = conn.execute("SELECT COUNT(*) FROM social_posts").fetchone()[0]
        rows = conn.execute(
            "SELECT * FROM social_posts ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset)
        ).fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        try:
            d["media_urls"] = json.loads(d.get("media_urls", "[]"))
        except:
            d["media_urls"] = []
        try:
            d["target_platforms"] = json.loads(d.get("target_platforms", "[]"))
        except:
            d["target_platforms"] = []
        try:
            d["publish_results"] = json.loads(d.get("publish_results", "[]"))
        except:
            d["publish_results"] = []
        results.append(d)
    return {"posts": results, "total": total}


def get_post(post_id: int) -> Optional[dict]:
    conn = _get_db()
    row = conn.execute("SELECT * FROM social_posts WHERE id = ?", (post_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    for field in ("media_urls", "target_platforms", "publish_results"):
        try:
            d[field] = json.loads(d.get(field, "[]"))
        except:
            d[field] = []
    return d


def update_post(post_id: int, **kwargs):
    conn = _get_db()
    sets = []
    params = []
    for key, val in kwargs.items():
        if key in ("title", "content_text", "status", "scheduled_at", "published_at"):
            sets.append(f"{key} = ?")
            params.append(val)
        elif key in ("media_urls", "target_platforms", "publish_results"):
            sets.append(f"{key} = ?")
            params.append(json.dumps(val) if isinstance(val, (list, dict)) else val)
    if not sets:
        conn.close()
        return
    sets.append("updated_at = ?")
    params.append(datetime.now().isoformat())
    params.append(post_id)
    conn.execute(f"UPDATE social_posts SET {', '.join(sets)} WHERE id = ?", params)
    conn.commit()
    conn.close()


def delete_post(post_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM social_posts WHERE id = ?", (post_id,))
    conn.commit()
    conn.close()


# ═══════════════════════════════════════════
#  REPLY TEMPLATES
# ═══════════════════════════════════════════

def get_templates(category: str = None) -> list:
    conn = _get_db()
    if category:
        rows = conn.execute(
            "SELECT * FROM social_reply_templates WHERE category = ? ORDER BY usage_count DESC",
            (category,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM social_reply_templates ORDER BY usage_count DESC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_template(title: str, content: str, category: str = "general",
                    shortcut: str = "", platforms: list = None, created_by: int = None) -> dict:
    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute(
        """INSERT INTO social_reply_templates
        (title, content, category, shortcut, platforms, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (title, content, category, shortcut,
         json.dumps(platforms or ["all"]), created_by, now, now)
    )
    tid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    row = conn.execute("SELECT * FROM social_reply_templates WHERE id = ?", (tid,)).fetchone()
    conn.close()
    return dict(row)


def update_template(template_id: int, **kwargs):
    conn = _get_db()
    sets = []
    params = []
    for key, val in kwargs.items():
        if key in ("title", "content", "category", "shortcut"):
            sets.append(f"{key} = ?")
            params.append(val)
        elif key == "platforms":
            sets.append("platforms = ?")
            params.append(json.dumps(val) if isinstance(val, list) else val)
    if not sets:
        conn.close()
        return
    sets.append("updated_at = ?")
    params.append(datetime.now().isoformat())
    params.append(template_id)
    conn.execute(f"UPDATE social_reply_templates SET {', '.join(sets)} WHERE id = ?", params)
    conn.commit()
    conn.close()


def delete_template(template_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM social_reply_templates WHERE id = ?", (template_id,))
    conn.commit()
    conn.close()


def increment_template_usage(template_id: int):
    conn = _get_db()
    conn.execute(
        "UPDATE social_reply_templates SET usage_count = usage_count + 1 WHERE id = ?",
        (template_id,)
    )
    conn.commit()
    conn.close()


# ═══════════════════════════════════════════
#  MEDIA LIBRARY
# ═══════════════════════════════════════════

def store_media(filename: str, original_filename: str, file_path: str,
                file_url: str, mime_type: str, file_size: int,
                media_type: str = "image", uploaded_by: int = None) -> dict:
    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute(
        """INSERT INTO social_media_library
        (filename, original_filename, file_path, file_url, mime_type,
         file_size, media_type, uploaded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (filename, original_filename, file_path, file_url,
         mime_type, file_size, media_type, uploaded_by, now)
    )
    mid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    row = conn.execute("SELECT * FROM social_media_library WHERE id = ?", (mid,)).fetchone()
    conn.close()
    return dict(row)


def get_media_library(media_type: str = None, limit: int = 50) -> list:
    conn = _get_db()
    if media_type:
        rows = conn.execute(
            "SELECT * FROM social_media_library WHERE media_type = ? ORDER BY created_at DESC LIMIT ?",
            (media_type, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM social_media_library ORDER BY created_at DESC LIMIT ?",
            (limit,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ═══════════════════════════════════════════
#  MEDIA DOWNLOAD HELPER
# ═══════════════════════════════════════════

async def download_and_store_media(url: str, filename: str) -> str:
    """Download a media file from a URL and store it locally. Returns the local URL."""
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        safe_name = f"{uuid.uuid4().hex}_{filename}"
        file_path = UPLOAD_DIR / safe_name

        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                if resp.status == 200:
                    content = await resp.read()
                    with open(file_path, "wb") as f:
                        f.write(content)
                    return f"/uploads/social/{safe_name}"
    except Exception as e:
        logger.error(f"Failed to download media: {e}")
    return url  # fallback to original URL


# ═══════════════════════════════════════════
#  ANALYTICS
# ═══════════════════════════════════════════

def get_analytics(period: str = "weekly") -> dict:
    conn = _get_db()
    # Total conversations and messages
    total_convs = conn.execute("SELECT COUNT(*) FROM social_conversations").fetchone()[0]
    total_msgs = conn.execute("SELECT COUNT(*) FROM social_messages").fetchone()[0]
    total_unread = conn.execute(
        "SELECT COALESCE(SUM(unread_count), 0) FROM social_conversations"
    ).fetchone()[0]

    # Messages by platform
    platform_stats = conn.execute(
        """SELECT platform,
           COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound,
           COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound
        FROM social_messages GROUP BY platform"""
    ).fetchall()

    # Posts stats
    post_stats = conn.execute(
        """SELECT status, COUNT(*) as count FROM social_posts GROUP BY status"""
    ).fetchall()

    conn.close()
    return {
        "total_conversations": total_convs,
        "total_messages": total_msgs,
        "total_unread": total_unread,
        "platform_stats": [dict(r) for r in platform_stats],
        "post_stats": [dict(r) for r in post_stats],
    }


# ═══════════════════════════════════════════
#  SCHEDULED POST CHECKER (background task)
# ═══════════════════════════════════════════

async def check_scheduled_posts():
    """Background task: find posts that reached their scheduled time and publish them."""
    while True:
        try:
            await asyncio.sleep(30)
            conn = _get_db()
            now = datetime.now().isoformat()
            pending = conn.execute(
                "SELECT id FROM social_posts WHERE status = 'scheduled' AND scheduled_at <= ?",
                (now,)
            ).fetchall()
            conn.close()
            for row in pending:
                try:
                    await _publish_post(row["id"])
                except Exception as e:
                    logger.error(f"Failed to publish scheduled post {row['id']}: {e}")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Scheduled post checker error: {e}")


async def _publish_post(post_id: int):
    """Publish a post to all target platforms. Called by scheduler or manual publish."""
    post = get_post(post_id)
    if not post:
        return

    update_post(post_id, status="publishing")
    results = []
    targets = post.get("target_platforms", [])

    for target in targets:
        platform = target.get("platform", "")
        account_id = target.get("account_id")
        account = get_account(account_id) if account_id else None

        if not account or account["status"] != "connected":
            results.append({"platform": platform, "account_id": account_id,
                           "success": False, "error": "Account not connected"})
            continue

        try:
            if platform == "telegram":
                from telegram_service import TelegramService
                creds = account.get("credentials", {})
                service = TelegramService(creds.get("bot_token", ""), "")
                channel_id = target.get("channel_id", "")
                if not channel_id:
                    results.append({"platform": "telegram", "success": False,
                                   "error": "No channel ID specified"})
                    continue

                # Send text
                if post["content_text"]:
                    resp = await service.send_message(channel_id, post["content_text"])
                    if not resp.get("ok"):
                        results.append({"platform": "telegram", "success": False,
                                       "error": resp.get("description", "Unknown error")})
                        continue

                # Send media
                for media_url in post.get("media_urls", []):
                    if any(media_url.lower().endswith(ext) for ext in (".mp4", ".mov", ".avi")):
                        await service.send_video(channel_id, media_url)
                    elif any(media_url.lower().endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".gif", ".webp")):
                        await service.send_photo(channel_id, media_url)
                    else:
                        await service.send_document(channel_id, media_url)

                results.append({"platform": "telegram", "account_id": account_id,
                               "success": True, "channel_id": channel_id})

            elif platform == "whatsapp":
                from whatsapp_social_service import WhatsAppSocialService
                creds = account.get("credentials", {})
                service = WhatsAppSocialService(
                    creds.get("account_sid", ""),
                    creds.get("auth_token", ""),
                    creds.get("from_number", "")
                )
                # WhatsApp broadcast to specified numbers
                numbers = target.get("numbers", [])
                if numbers:
                    for number in numbers:
                        try:
                            await service.send_message(number, post["content_text"])
                        except Exception as e:
                            logger.error(f"WhatsApp send to {number} failed: {e}")
                    results.append({"platform": "whatsapp", "account_id": account_id,
                                   "success": True, "sent_to": len(numbers)})
                else:
                    results.append({"platform": "whatsapp", "success": False,
                                   "error": "No recipient numbers specified"})

        except Exception as e:
            results.append({"platform": platform, "account_id": account_id,
                           "success": False, "error": str(e)})

    all_success = all(r.get("success") for r in results) if results else False
    any_success = any(r.get("success") for r in results) if results else False
    final_status = "published" if all_success else ("partial" if any_success else "failed")

    update_post(post_id, status=final_status, published_at=datetime.now().isoformat(),
                publish_results=results)
    return results
