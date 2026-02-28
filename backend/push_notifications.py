"""
Web Push Notification support for Spark AI.
Uses the Web Push API with VAPID authentication.
"""

import json
import threading
import sqlite3
from datetime import datetime
from typing import Optional, Dict, List
import config

DB_PATH = "community.db"

# Notification type -> URL mapping for click navigation
NOTIFICATION_URL_MAP = {
    "comment": "/predictions",
    "rating": "/predictions",
    "new_prediction": "/predictions",
    "new_follower": "/profile",
    "prediction_result": "/predictions",
    "prediction_sale": "/creator",
    "referral_subscription": "/referrals",
    "referral_commission": "/referrals",
    "withdrawal": "/transactions",
    "refund": "/transactions",
    "first_prediction": "/predictions",
    "broadcast": "/",
    "broadcast_rejected": "/",
    "suspension": "/",
}

# Notification types that should NOT trigger push
PUSH_EXCLUDED_TYPES = {"keepalive_prompt"}


def _get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def save_subscription(user_id: int, subscription: dict, user_agent: str = "") -> bool:
    """Save or update a push subscription for a user."""
    endpoint = subscription.get("endpoint", "")
    keys = subscription.get("keys", {})
    p256dh = keys.get("p256dh", "")
    auth = keys.get("auth", "")

    if not endpoint or not p256dh or not auth:
        return False

    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute("""
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET
            user_id = excluded.user_id,
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            user_agent = excluded.user_agent
    """, (user_id, endpoint, p256dh, auth, user_agent, now))
    conn.commit()
    conn.close()
    return True


def remove_subscription(endpoint: str) -> bool:
    """Remove a push subscription by endpoint URL."""
    conn = _get_db()
    conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
    conn.commit()
    conn.close()
    return True


def remove_user_subscriptions(user_id: int) -> bool:
    """Remove all push subscriptions for a user."""
    conn = _get_db()
    conn.execute("DELETE FROM push_subscriptions WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return True


def get_user_subscriptions(user_id: int) -> List[Dict]:
    """Get all push subscriptions for a user."""
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM push_subscriptions WHERE user_id = ?", (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def send_push_notification(
    user_id: int,
    notif_type: str,
    title: str,
    message: str,
    metadata: dict = None,
    notif_id: int = None,
):
    """
    Send Web Push to ALL of a user's subscriptions.
    Runs in a background thread to avoid blocking.
    """
    if notif_type in PUSH_EXCLUDED_TYPES:
        return

    if not config.VAPID_PRIVATE_KEY or not config.VAPID_PUBLIC_KEY:
        return

    def _do_send():
        try:
            from pywebpush import webpush, WebPushException

            subscriptions = get_user_subscriptions(user_id)
            if not subscriptions:
                return

            click_url = NOTIFICATION_URL_MAP.get(notif_type, "/")
            payload = json.dumps({
                "title": title,
                "body": message,
                "icon": "/pwa-192x192.png",
                "badge": "/pwa-64x64.png",
                "tag": notif_type,
                "data": {
                    "url": click_url,
                    "notif_id": notif_id,
                    "type": notif_type,
                },
            })

            stale_endpoints = []

            for sub in subscriptions:
                try:
                    webpush(
                        subscription_info={
                            "endpoint": sub["endpoint"],
                            "keys": {
                                "p256dh": sub["p256dh"],
                                "auth": sub["auth"],
                            },
                        },
                        data=payload,
                        vapid_private_key=config.VAPID_PRIVATE_KEY,
                        vapid_claims={"sub": config.VAPID_CLAIMS_EMAIL},
                    )
                    # Update last_used_at on success
                    _update_last_used(sub["endpoint"])
                except WebPushException as e:
                    if e.response and e.response.status_code in (404, 410):
                        stale_endpoints.append(sub["endpoint"])
                    else:
                        print(f"[WARN] Push failed for user {user_id}: {e}")
                except Exception as e:
                    print(f"[WARN] Push send error for user {user_id}: {e}")

            # Clean up expired subscriptions
            if stale_endpoints:
                _remove_stale_subscriptions(stale_endpoints)

        except Exception as e:
            print(f"[WARN] Push notification error for user {user_id}: {e}")

    threading.Thread(target=_do_send, daemon=True).start()


def _update_last_used(endpoint: str):
    """Update the last_used_at timestamp for a subscription."""
    try:
        conn = _get_db()
        conn.execute(
            "UPDATE push_subscriptions SET last_used_at = ? WHERE endpoint = ?",
            (datetime.now().isoformat(), endpoint),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


def _remove_stale_subscriptions(endpoints: List[str]):
    """Remove subscriptions that returned 404/410 (expired)."""
    try:
        conn = _get_db()
        conn.executemany(
            "DELETE FROM push_subscriptions WHERE endpoint = ?",
            [(e,) for e in endpoints],
        )
        conn.commit()
        conn.close()
    except Exception:
        pass
