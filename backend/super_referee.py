"""
Super Referee System — Two-level referral earnings.

A Super Referee earns 30% of the referral commissions earned by their direct referrals.
Users apply → Admin approves → earnings flow automatically.
"""
import sqlite3
import os
from datetime import datetime
from typing import Dict, List, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "users.db")


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_super_referee_db():
    """Create super referee tables."""
    conn = _get_db()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS super_referee_applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            reason TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            applied_at TEXT NOT NULL,
            reviewed_at TEXT,
            reviewed_by TEXT,
            rejection_reason TEXT
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS super_referee_earnings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            super_referee_id INTEGER NOT NULL,
            referee_id INTEGER NOT NULL,
            referred_id INTEGER NOT NULL,
            original_commission REAL NOT NULL,
            super_rate REAL DEFAULT 0.30,
            super_amount REAL NOT NULL,
            payment_method TEXT DEFAULT '',
            created_at TEXT NOT NULL
        )
    """)

    # Add is_super_referee column to users if not exists
    try:
        conn.execute("ALTER TABLE users ADD COLUMN is_super_referee INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()
    print("[OK] Super referee DB initialized")


# ── Application Flow ─────────────────────────────────────

def apply_for_super_referee(user_id: int, reason: str = "") -> Dict:
    """User applies to become a super referee."""
    conn = _get_db()

    # Check if already a super referee
    user = conn.execute("SELECT is_super_referee FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        return {"success": False, "error": "User not found"}
    if user["is_super_referee"]:
        conn.close()
        return {"success": False, "error": "You are already a Super Referee"}

    # Check for existing application
    existing = conn.execute(
        "SELECT status FROM super_referee_applications WHERE user_id = ?", (user_id,)
    ).fetchone()
    if existing:
        if existing["status"] == "pending":
            conn.close()
            return {"success": False, "error": "You already have a pending application"}
        if existing["status"] == "approved":
            conn.close()
            return {"success": False, "error": "You are already approved"}

    now = datetime.now().isoformat()
    # Upsert (in case of rejected re-application)
    if existing:
        conn.execute(
            "UPDATE super_referee_applications SET status = 'pending', reason = ?, applied_at = ?, reviewed_at = NULL, reviewed_by = NULL, rejection_reason = NULL WHERE user_id = ?",
            (reason, now, user_id),
        )
    else:
        conn.execute(
            "INSERT INTO super_referee_applications (user_id, reason, status, applied_at) VALUES (?, ?, 'pending', ?)",
            (user_id, reason, now),
        )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Application submitted successfully"}


def get_application_status(user_id: int) -> Optional[Dict]:
    """Get a user's super referee application status."""
    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM super_referee_applications WHERE user_id = ?", (user_id,)
    ).fetchone()
    user = conn.execute(
        "SELECT is_super_referee FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    conn.close()
    if not row and not user:
        return None
    return {
        "is_super_referee": bool(user["is_super_referee"]) if user else False,
        "application": {
            "status": row["status"],
            "reason": row["reason"],
            "applied_at": row["applied_at"],
            "reviewed_at": row["reviewed_at"],
            "rejection_reason": row["rejection_reason"],
        } if row else None,
    }


# ── Admin Actions ─────────────────────────────────────────

def list_applications(status_filter: str = "all") -> List[Dict]:
    """List all super referee applications."""
    conn = _get_db()
    if status_filter == "all":
        rows = conn.execute("""
            SELECT a.*, u.display_name, u.username, u.avatar_color, u.email,
                   (SELECT COUNT(*) FROM users r WHERE r.referred_by = a.user_id) as referral_count
            FROM super_referee_applications a
            JOIN users u ON u.id = a.user_id
            ORDER BY a.applied_at DESC
        """).fetchall()
    else:
        rows = conn.execute("""
            SELECT a.*, u.display_name, u.username, u.avatar_color, u.email,
                   (SELECT COUNT(*) FROM users r WHERE r.referred_by = a.user_id) as referral_count
            FROM super_referee_applications a
            JOIN users u ON u.id = a.user_id
            WHERE a.status = ?
            ORDER BY a.applied_at DESC
        """, (status_filter,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def approve_application(user_id: int, admin_name: str = "admin") -> Dict:
    """Admin approves a super referee application."""
    conn = _get_db()
    app = conn.execute(
        "SELECT * FROM super_referee_applications WHERE user_id = ? AND status = 'pending'",
        (user_id,),
    ).fetchone()
    if not app:
        conn.close()
        return {"success": False, "error": "No pending application found"}

    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE super_referee_applications SET status = 'approved', reviewed_at = ?, reviewed_by = ? WHERE user_id = ?",
        (now, admin_name, user_id),
    )
    conn.execute("UPDATE users SET is_super_referee = 1 WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

    # Send in-app + push notification
    try:
        import community
        community.create_notification(
            user_id=user_id,
            notif_type="super_referee",
            title="You're Now a Super Referee!",
            message="Congratulations! Your Super Referee application has been approved. You now earn 30% of the referral commissions from your referrals' network. Visit your Creator Dashboard to see your team.",
        )
    except Exception as e:
        print(f"[WARN] Super referee approval notification failed: {e}")

    # Send email
    try:
        import user_auth
        community._send_notif_email(
            user_id=user_id,
            notif_type="super_referee",
            title="You're Now a Super Referee!",
            message=(
                "<strong>Congratulations!</strong><br><br>"
                "Your application to become a <strong>Super Referee</strong> on Spark AI has been <strong style='color:#22c55e'>approved</strong>!<br><br>"
                "<strong>What this means for you:</strong><br>"
                "- You earn <strong>30%</strong> of the referral commissions from anyone your referrals bring in<br>"
                "- Build your team and earn passively from two levels of referrals<br>"
                "- Track your team's performance on your Creator Dashboard<br><br>"
                "Head to your <strong>Creator Dashboard → Super Referee</strong> tab to see your team and earnings.<br><br>"
                "Keep growing your network!"
            ),
        )
    except Exception as e:
        print(f"[WARN] Super referee approval email failed: {e}")

    return {"success": True, "message": "Super Referee approved"}


def reject_application(user_id: int, reason: str = "", admin_name: str = "admin") -> Dict:
    """Admin rejects a super referee application."""
    conn = _get_db()
    app = conn.execute(
        "SELECT * FROM super_referee_applications WHERE user_id = ? AND status = 'pending'",
        (user_id,),
    ).fetchone()
    if not app:
        conn.close()
        return {"success": False, "error": "No pending application found"}

    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE super_referee_applications SET status = 'rejected', reviewed_at = ?, reviewed_by = ?, rejection_reason = ? WHERE user_id = ?",
        (now, admin_name, reason, user_id),
    )
    conn.commit()
    conn.close()

    # Send notification
    try:
        import community
        reason_text = f" Reason: {reason}" if reason else ""
        community.create_notification(
            user_id=user_id,
            notif_type="super_referee",
            title="Super Referee Application Update",
            message=f"Your Super Referee application was not approved at this time.{reason_text} You can re-apply from your Creator Dashboard.",
        )
    except Exception:
        pass

    return {"success": True, "message": "Application rejected"}


def revoke_super_referee(user_id: int) -> Dict:
    """Admin revokes super referee status."""
    conn = _get_db()
    conn.execute("UPDATE users SET is_super_referee = 0 WHERE id = ?", (user_id,))
    conn.execute(
        "UPDATE super_referee_applications SET status = 'revoked' WHERE user_id = ?",
        (user_id,),
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Super Referee status revoked"}


def list_super_referees() -> List[Dict]:
    """List all active super referees with stats."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT u.id, u.display_name, u.username, u.avatar_color, u.email,
               (SELECT COUNT(*) FROM users r WHERE r.referred_by = u.id) as direct_referrals,
               (SELECT COUNT(*) FROM users r2
                WHERE r2.referred_by IN (SELECT r3.id FROM users r3 WHERE r3.referred_by = u.id)
               ) as sub_referrals,
               COALESCE((SELECT SUM(super_amount) FROM super_referee_earnings WHERE super_referee_id = u.id), 0) as total_super_earnings
        FROM users u
        WHERE u.is_super_referee = 1
        ORDER BY direct_referrals DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Earnings Flow ─────────────────────────────────────────

def process_super_referee_cut(referee_id: int, referred_id: int, commission_amount: float, payment_method: str = "") -> Optional[Dict]:
    """
    Called when a normal referral commission is paid.
    Checks if the referee was referred by a super referee.
    If so, deducts 30% from referee's commission and credits super referee.

    Returns the super referee cut details, or None if no super referee.
    """
    conn = _get_db()

    # Find who referred the referee (the potential super referee)
    referee = conn.execute(
        "SELECT referred_by FROM users WHERE id = ?", (referee_id,)
    ).fetchone()

    if not referee or not referee["referred_by"]:
        conn.close()
        return None

    super_ref_id = referee["referred_by"]

    # Check if that person is a super referee
    super_ref = conn.execute(
        "SELECT id, is_super_referee FROM users WHERE id = ? AND is_super_referee = 1",
        (super_ref_id,),
    ).fetchone()

    if not super_ref:
        conn.close()
        return None

    # Calculate 30% cut
    super_rate = 0.30
    super_amount = round(commission_amount * super_rate, 2)

    if super_amount <= 0:
        conn.close()
        return None

    now = datetime.now().isoformat()

    # Record the super referee earning
    conn.execute(
        """INSERT INTO super_referee_earnings
           (super_referee_id, referee_id, referred_id, original_commission, super_rate, super_amount, payment_method, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (super_ref_id, referee_id, referred_id, commission_amount, super_rate, super_amount, payment_method, now),
    )
    conn.commit()
    conn.close()

    # Credit the super referee's wallet
    try:
        import community
        community.adjust_user_balance(
            super_ref_id,
            amount_usd=super_amount,
            reason=f"Super Referee commission (30% of referee's KES {commission_amount})",
            adjustment_type="super_referee_earning",
        )
    except Exception as e:
        print(f"[WARN] Failed to credit super referee wallet: {e}")

    return {
        "super_referee_id": super_ref_id,
        "referee_id": referee_id,
        "original_commission": commission_amount,
        "super_amount": super_amount,
        "net_referee_commission": round(commission_amount - super_amount, 2),
    }


# ── Dashboard Data ────────────────────────────────────────

def get_super_referee_dashboard(user_id: int) -> Dict:
    """Get full dashboard data for a super referee."""
    conn = _get_db()

    # Verify super referee status
    user = conn.execute("SELECT is_super_referee FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user or not user["is_super_referee"]:
        conn.close()
        return {"is_super_referee": False}

    # Direct referrals (level 1)
    direct_refs = conn.execute("""
        SELECT u.id, u.display_name, u.username, u.avatar_color, u.tier, u.created_at,
               (SELECT COUNT(*) FROM users sub WHERE sub.referred_by = u.id) as their_referrals,
               COALESCE((SELECT SUM(se.super_amount) FROM super_referee_earnings se
                WHERE se.super_referee_id = ? AND se.referee_id = u.id), 0) as earnings_from
        FROM users u
        WHERE u.referred_by = ?
        ORDER BY their_referrals DESC
    """, (user_id, user_id)).fetchall()

    # Sub-referrals (level 2) — people referred by my referrals
    sub_refs = conn.execute("""
        SELECT u.id, u.display_name, u.username, u.avatar_color, u.tier, u.created_at,
               ref.display_name as referred_by_name, ref.username as referred_by_username
        FROM users u
        JOIN users ref ON u.referred_by = ref.id
        WHERE ref.referred_by = ?
        ORDER BY u.created_at DESC
    """, (user_id,)).fetchall()

    # Total earnings
    earnings = conn.execute("""
        SELECT COALESCE(SUM(super_amount), 0) as total,
               COUNT(*) as transaction_count
        FROM super_referee_earnings
        WHERE super_referee_id = ?
    """, (user_id,)).fetchone()

    # Recent earnings history
    recent_earnings = conn.execute("""
        SELECT se.*, u1.display_name as referee_name, u1.username as referee_username,
               u2.display_name as referred_name, u2.username as referred_username
        FROM super_referee_earnings se
        JOIN users u1 ON u1.id = se.referee_id
        JOIN users u2 ON u2.id = se.referred_id
        WHERE se.super_referee_id = ?
        ORDER BY se.created_at DESC
        LIMIT 50
    """, (user_id,)).fetchall()

    conn.close()

    return {
        "is_super_referee": True,
        "direct_referrals": [dict(r) for r in direct_refs],
        "sub_referrals": [dict(r) for r in sub_refs],
        "total_direct": len(direct_refs),
        "total_sub": len(sub_refs),
        "total_earnings": earnings["total"] if earnings else 0,
        "transaction_count": earnings["transaction_count"] if earnings else 0,
        "recent_earnings": [dict(r) for r in recent_earnings],
        "top_performer": dict(direct_refs[0]) if direct_refs else None,
    }
