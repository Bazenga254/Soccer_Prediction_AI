"""
Subscription System for Spark AI Prediction
Handles free/pro tier management, subscription tracking, and feature gating.
"""

import sqlite3
from datetime import datetime, timedelta
from typing import Optional, Dict, List

DB_PATH = "users.db"  # Same DB as user_auth


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_subscriptions_db():
    """Create subscription-related tables."""
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            plan TEXT NOT NULL DEFAULT 'weekly',
            price_amount REAL NOT NULL,
            price_currency TEXT NOT NULL DEFAULT 'USD',
            status TEXT NOT NULL DEFAULT 'active',
            payment_method TEXT DEFAULT '',
            payment_ref TEXT DEFAULT '',
            started_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            cancelled_at TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS subscription_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            details TEXT DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sub_user ON subscriptions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sub_status ON subscriptions(status);
        CREATE INDEX IF NOT EXISTS idx_sub_expires ON subscriptions(expires_at);
    """)
    conn.commit()
    conn.close()


# --- Subscription Plans ---

PLANS = {
    "weekly_usd": {
        "name": "Pro Weekly (USD)",
        "price": 15.0,
        "currency": "USD",
        "duration_days": 7,
        "features": [
            "Unlimited match analyses",
            "Unlimited jackpot analyses",
            "Unlimited AI chat prompts",
            "Advanced analytics & value betting",
            "Ad-free experience",
            "Priority support",
        ],
    },
    "weekly_kes": {
        "name": "Pro Weekly (KES)",
        "price": 1950.0,
        "currency": "KES",
        "duration_days": 7,
        "features": [
            "Unlimited match analyses",
            "Unlimited jackpot analyses",
            "Unlimited AI chat prompts",
            "Advanced analytics & value betting",
            "Ad-free experience",
            "Priority support",
        ],
    },
    "monthly_usd": {
        "name": "Pro Monthly (USD)",
        "price": 48.0,
        "currency": "USD",
        "duration_days": 30,
        "features": [
            "Everything in Weekly",
            "Save 20% vs weekly",
            "Monthly insights report",
        ],
    },
    "monthly_kes": {
        "name": "Pro Monthly (KES)",
        "price": 6200.0,
        "currency": "KES",
        "duration_days": 30,
        "features": [
            "Everything in Weekly",
            "Save 20% vs weekly",
            "Monthly insights report",
        ],
    },
}

# --- Free tier limits ---

FREE_LIMITS = {
    "predictions_per_day": 3,
    "community_shares_per_day": 1,
    "show_ads": True,
    "advanced_analytics": False,
    "value_betting": False,
}

PRO_LIMITS = {
    "predictions_per_day": -1,  # Unlimited
    "community_shares_per_day": -1,
    "show_ads": False,
    "advanced_analytics": True,
    "value_betting": True,
}


def get_plans() -> Dict:
    """Return available subscription plans."""
    return PLANS


def get_tier_limits(tier: str) -> Dict:
    """Return feature limits for a tier."""
    if tier == "pro":
        return PRO_LIMITS
    return FREE_LIMITS


def get_active_subscription(user_id: int) -> Optional[Dict]:
    """Get user's active subscription if any."""
    conn = _get_db()
    now = datetime.now().isoformat()
    row = conn.execute("""
        SELECT * FROM subscriptions
        WHERE user_id = ? AND status = 'active' AND expires_at > ?
        ORDER BY expires_at DESC LIMIT 1
    """, (user_id, now)).fetchone()
    conn.close()

    if not row:
        return None

    return {
        "id": row["id"],
        "plan": row["plan"],
        "price_amount": row["price_amount"],
        "price_currency": row["price_currency"],
        "status": row["status"],
        "payment_method": row["payment_method"],
        "started_at": row["started_at"],
        "expires_at": row["expires_at"],
        "days_remaining": max(0, (datetime.fromisoformat(row["expires_at"]) - datetime.now()).days),
    }


def create_subscription(
    user_id: int,
    plan_id: str,
    payment_method: str = "",
    payment_ref: str = "",
) -> Dict:
    """Create a new subscription for a user."""
    if plan_id not in PLANS:
        return {"success": False, "error": "Invalid plan"}

    plan = PLANS[plan_id]
    conn = _get_db()
    now = datetime.now()
    expires = now + timedelta(days=plan["duration_days"])

    conn.execute("""
        INSERT INTO subscriptions (user_id, plan, price_amount, price_currency,
            status, payment_method, payment_ref, started_at, expires_at, created_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
    """, (
        user_id, plan_id, plan["price"], plan["currency"],
        payment_method, payment_ref,
        now.isoformat(), expires.isoformat(), now.isoformat(),
    ))

    # Upgrade user tier
    conn.execute("UPDATE users SET tier = 'pro' WHERE id = ?", (user_id,))
    conn.commit()

    # Log action
    conn.execute("""
        INSERT INTO subscription_history (user_id, action, details, created_at)
        VALUES (?, 'subscribe', ?, ?)
    """, (user_id, f"Plan: {plan_id}, Payment: {payment_method}", now.isoformat()))
    conn.commit()

    # Check if this user was referred by someone - notify the referrer
    user_row = conn.execute(
        "SELECT referred_by, display_name FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    conn.close()

    if user_row and user_row["referred_by"]:
        try:
            import community
            community.create_referral_notification(
                referrer_user_id=user_row["referred_by"],
                subscriber_name=user_row["display_name"],
                plan=plan_id,
            )
        except Exception as e:
            print(f"[WARN] Failed to create referral notification: {e}")

    return {
        "success": True,
        "expires_at": expires.isoformat(),
        "plan": plan_id,
    }


def cancel_subscription(user_id: int) -> Dict:
    """Cancel user's active subscription."""
    conn = _get_db()
    now = datetime.now().isoformat()

    sub = conn.execute("""
        SELECT id FROM subscriptions
        WHERE user_id = ? AND status = 'active'
        ORDER BY expires_at DESC LIMIT 1
    """, (user_id,)).fetchone()

    if not sub:
        conn.close()
        return {"success": False, "error": "No active subscription"}

    conn.execute(
        "UPDATE subscriptions SET status = 'cancelled', cancelled_at = ? WHERE id = ?",
        (now, sub["id"]),
    )
    conn.execute("UPDATE users SET tier = 'free' WHERE id = ?", (user_id,))
    conn.commit()

    conn.execute("""
        INSERT INTO subscription_history (user_id, action, details, created_at)
        VALUES (?, 'cancel', 'User cancelled subscription', ?)
    """, (user_id, now))
    conn.commit()
    conn.close()

    return {"success": True}


def check_expired_subscriptions():
    """Check and expire any overdue subscriptions. Call periodically."""
    conn = _get_db()
    now = datetime.now().isoformat()

    expired = conn.execute("""
        SELECT s.id, s.user_id FROM subscriptions s
        WHERE s.status = 'active' AND s.expires_at <= ?
    """, (now,)).fetchall()

    for sub in expired:
        conn.execute("UPDATE subscriptions SET status = 'expired' WHERE id = ?", (sub["id"],))
        conn.execute("UPDATE users SET tier = 'free' WHERE id = ?", (sub["user_id"],))
        conn.execute("""
            INSERT INTO subscription_history (user_id, action, details, created_at)
            VALUES (?, 'expired', 'Subscription expired', ?)
        """, (sub["user_id"], now))

    conn.commit()
    conn.close()
    return len(expired)


def get_subscription_history(user_id: int) -> List[Dict]:
    """Get subscription history for a user."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT * FROM subscription_history
        WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
    """, (user_id,)).fetchall()
    conn.close()

    return [{
        "action": r["action"],
        "details": r["details"],
        "created_at": r["created_at"],
    } for r in rows]


def get_subscription_stats() -> Dict:
    """Get subscription statistics for admin dashboard."""
    conn = _get_db()

    total_subs = conn.execute("SELECT COUNT(*) as c FROM subscriptions").fetchone()["c"]
    active_subs = conn.execute(
        "SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active' AND expires_at > ?",
        (datetime.now().isoformat(),)
    ).fetchone()["c"]
    cancelled = conn.execute(
        "SELECT COUNT(*) as c FROM subscriptions WHERE status = 'cancelled'"
    ).fetchone()["c"]
    expired = conn.execute(
        "SELECT COUNT(*) as c FROM subscriptions WHERE status = 'expired'"
    ).fetchone()["c"]

    # Revenue
    total_revenue_usd = conn.execute(
        "SELECT COALESCE(SUM(price_amount), 0) as t FROM subscriptions WHERE price_currency = 'USD'"
    ).fetchone()["t"]
    total_revenue_kes = conn.execute(
        "SELECT COALESCE(SUM(price_amount), 0) as t FROM subscriptions WHERE price_currency = 'KES'"
    ).fetchone()["t"]

    conn.close()

    return {
        "total_subscriptions": total_subs,
        "active": active_subs,
        "cancelled": cancelled,
        "expired": expired,
        "revenue_usd": round(total_revenue_usd, 2),
        "revenue_kes": round(total_revenue_kes, 2),
    }
