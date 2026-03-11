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
    "goal_scored": "/live",
    "match_ended": "/live",
    "news_published": "/news",
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
    image: str = None,
    actions: list = None,
):
    """
    Send Web Push to ALL of a user's subscriptions.
    Runs in a background thread to avoid blocking.
    image: URL for a large preview image (shown like news card notifications)
    actions: list of {"action": "id", "title": "Label"} for notification buttons
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
            # Unique tags for goal notifications so multiple can coexist
            tag = notif_type
            if notif_type in ("goal_scored", "match_ended") and metadata:
                tag = f"{notif_type}_{metadata.get('fixture_id', '')}_{metadata.get('home_goals', '')}_{metadata.get('away_goals', '')}"
            payload_dict = {
                "title": title,
                "body": message,
                "icon": "/pwa-192x192.png",
                "badge": "/badge-96x96.png",
                "tag": tag,
                "data": {
                    "url": click_url,
                    "notif_id": notif_id,
                    "type": notif_type,
                },
            }
            if image:
                payload_dict["image"] = image
            if actions:
                payload_dict["actions"] = actions
            payload = json.dumps(payload_dict)

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
                    is_gone = False
                    if e.response and hasattr(e.response, 'status_code'):
                        is_gone = e.response.status_code in (404, 410)
                    elif '410' in str(e) or '404' in str(e) or 'unsubscribed' in str(e).lower() or 'expired' in str(e).lower():
                        is_gone = True
                    if is_gone:
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


def send_news_push_to_all(post_title: str, post_excerpt: str,
                           post_slug: str = "", cover_image: str = None):
    """Send push notification to ALL subscribed users when news is published."""
    def _broadcast():
        try:
            conn = _get_db()
            rows = conn.execute("SELECT DISTINCT user_id FROM push_subscriptions").fetchall()
            conn.close()

            user_ids = [r["user_id"] for r in rows]
            print(f"[Push] Broadcasting news to {len(user_ids)} users: {post_title[:50]}")

            # Build image URL (make absolute if relative)
            image = None
            if cover_image:
                if cover_image.startswith("/"):
                    image = f"https://spark-ai-prediction.com{cover_image}"
                else:
                    image = cover_image

            for uid in user_ids:
                try:
                    send_push_notification(
                        user_id=uid,
                        notif_type="news_published",
                        title=f"📰 {post_title[:60]}",
                        message=post_excerpt[:120] if post_excerpt else "New update posted!",
                        metadata={"slug": post_slug},
                        image=image,
                    )
                except Exception:
                    pass

            print(f"[Push] News broadcast complete ({len(user_ids)} users)")
        except Exception as e:
            print(f"[Push] News broadcast error: {e}")

    thread = threading.Thread(target=_broadcast, daemon=True)
    thread.start()
