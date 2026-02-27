"""
User Authentication System for Spark AI Prediction
Handles user registration, login, JWT tokens, and profiles using SQLite.
"""

import sqlite3
import hashlib
import hmac
import secrets
import random
import string
import re
import os
import json as _json
import urllib.request
import urllib.parse
import jwt
from datetime import datetime, timedelta
import threading
from typing import Optional, Dict, List

DB_PATH = "users.db"

# System event logger for admin visibility
def _log_system_event(action, module, details=None, user_id=0, target_type=None, target_id=None, severity="error"):
    """Log system events to activity_logs for admin/HOD visibility."""
    try:
        import activity_logger
        activity_logger.log_system_event(
            action=action, module=module, details=details,
            user_id=user_id, target_type=target_type, target_id=target_id,
            severity=severity,
        )
    except Exception as e:
        print(f"[WARN] Could not log system event: {e}")
JWT_SECRET = None  # Set on startup from env


def _get_jwt_secret():
    global JWT_SECRET
    if JWT_SECRET is None:
        import os
        JWT_SECRET = os.environ.get("JWT_SECRET", "")
        if not JWT_SECRET:
            raise RuntimeError(
                "CRITICAL: JWT_SECRET environment variable is not set. "
                "The server cannot start without a secure JWT secret."
            )
    return JWT_SECRET


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


HCAPTCHA_SECRET = None


def _get_hcaptcha_secret():
    global HCAPTCHA_SECRET
    if HCAPTCHA_SECRET is None:
        HCAPTCHA_SECRET = os.environ.get("HCAPTCHA_SECRET", "")
    return HCAPTCHA_SECRET


def verify_hcaptcha(token: str) -> bool:
    """Verify an hCaptcha response token server-side."""
    secret = _get_hcaptcha_secret()
    if not secret:
        return True  # Skip in dev if not configured

    try:
        data = urllib.parse.urlencode({
            "secret": secret,
            "response": token,
        }).encode()
        req = urllib.request.Request(
            "https://api.hcaptcha.com/siteverify",
            data=data,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = _json.loads(resp.read().decode())
            return result.get("success", False)
    except Exception as e:
        print(f"[ERROR] hCaptcha verification failed: {e}")
        return False


def check_captcha_required(email: str, client_ip: str) -> bool:
    """Check if CAPTCHA is required: IP changed or 3+ failed attempts in 30 min."""
    conn = _get_db()

    # Check 1: IP change detection
    user = conn.execute(
        "SELECT last_known_ip FROM users WHERE email = ?",
        (email.lower().strip(),)
    ).fetchone()

    if user and user["last_known_ip"] and user["last_known_ip"] != client_ip:
        conn.close()
        return True

    # Check 2: Failed attempts from this IP in last 30 minutes
    cutoff = (datetime.now() - timedelta(minutes=30)).isoformat()
    row = conn.execute(
        "SELECT COUNT(*) as cnt FROM login_attempts WHERE ip_address = ? AND attempted_at > ? AND success = 0",
        (client_ip, cutoff),
    ).fetchone()
    conn.close()

    if row and row["cnt"] >= 4:
        return True

    return False


def record_login_attempt(ip_address: str, email: str, success: bool):
    """Record a login attempt for rate limiting."""
    conn = _get_db()
    conn.execute(
        "INSERT INTO login_attempts (ip_address, email, attempted_at, success) VALUES (?, ?, ?, ?)",
        (ip_address, email.lower().strip(), datetime.now().isoformat(), 1 if success else 0),
    )
    # Clean up old attempts (older than 24 hours)
    cutoff = (datetime.now() - timedelta(hours=24)).isoformat()
    conn.execute("DELETE FROM login_attempts WHERE attempted_at < ?", (cutoff,))
    conn.commit()
    conn.close()


MAX_LOGIN_ATTEMPTS = 5


def check_account_locked(email: str) -> Dict:
    """Check if an account is locked. Returns lock status and remaining time."""
    conn = _get_db()
    user = conn.execute(
        "SELECT locked_until FROM users WHERE email = ?",
        (email.lower().strip(),)
    ).fetchone()
    conn.close()

    if not user or not user["locked_until"]:
        return {"locked": False}

    locked_until = datetime.fromisoformat(user["locked_until"])
    now = datetime.now()

    if now >= locked_until:
        # Lock expired - clear it
        conn = _get_db()
        conn.execute(
            "UPDATE users SET locked_until = NULL WHERE email = ?",
            (email.lower().strip(),)
        )
        conn.commit()
        conn.close()
        return {"locked": False}

    remaining_seconds = int((locked_until - now).total_seconds())
    return {
        "locked": True,
        "locked_until": user["locked_until"],
        "remaining_seconds": remaining_seconds,
    }


def get_failed_attempt_count(email: str) -> int:
    """Get the number of consecutive failed password attempts for this email (last 24h)."""
    conn = _get_db()
    # Count failed attempts since the last successful login (or in the last 24h)
    cutoff = (datetime.now() - timedelta(hours=24)).isoformat()

    # Get the last successful attempt time
    last_success = conn.execute(
        "SELECT MAX(attempted_at) as last_ok FROM login_attempts WHERE email = ? AND success = 1 AND attempted_at > ?",
        (email.lower().strip(), cutoff),
    ).fetchone()

    since = cutoff
    if last_success and last_success["last_ok"]:
        since = last_success["last_ok"]

    row = conn.execute(
        "SELECT COUNT(*) as cnt FROM login_attempts WHERE email = ? AND attempted_at > ? AND success = 0",
        (email.lower().strip(), since),
    ).fetchone()
    conn.close()

    return row["cnt"] if row else 0


def lock_account(email: str):
    """Lock an account for 24 hours."""
    conn = _get_db()
    locked_until = (datetime.now() + timedelta(hours=24)).isoformat()
    conn.execute(
        "UPDATE users SET locked_until = ? WHERE email = ?",
        (locked_until, email.lower().strip()),
    )
    conn.commit()
    conn.close()


PASSWORD_CHANGE_COOLDOWN_HOURS = 24
SENSITIVE_ACTION_LOCKOUT_HOURS = 24


def check_password_change_cooldown(user_id: int) -> Dict:
    """Check if user can change their password (24h cooldown after last change)."""
    conn = _get_db()
    user = conn.execute(
        "SELECT password_changed_at FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    conn.close()

    if not user or not user["password_changed_at"]:
        return {"allowed": True}

    changed_at = datetime.fromisoformat(user["password_changed_at"])
    cooldown_end = changed_at + timedelta(hours=PASSWORD_CHANGE_COOLDOWN_HOURS)
    now = datetime.now()

    if now >= cooldown_end:
        return {"allowed": True}

    remaining_seconds = int((cooldown_end - now).total_seconds())
    remaining_hours = remaining_seconds // 3600
    remaining_mins = (remaining_seconds % 3600) // 60
    return {
        "allowed": False,
        "remaining_seconds": remaining_seconds,
        "message": f"You can only change your password once every 24 hours. Please try again in {remaining_hours}h {remaining_mins}m.",
    }


def change_password(user_id: int, current_password: str, new_password: str) -> Dict:
    """Change password for a logged-in user. Requires current password verification."""
    # Check cooldown
    cooldown = check_password_change_cooldown(user_id)
    if not cooldown["allowed"]:
        return {"success": False, "error": cooldown["message"]}

    conn = _get_db()
    user = conn.execute(
        "SELECT password_hash FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if not user:
        conn.close()
        return {"success": False, "error": "User not found"}

    # Verify current password
    if not _verify_password(current_password, user["password_hash"]):
        conn.close()
        return {"success": False, "error": "Current password is incorrect"}

    # Validate new password strength
    if len(new_password) < 8:
        conn.close()
        return {"success": False, "error": "Password must be at least 8 characters"}
    if len(re.findall(r'[A-Z]', new_password)) < 2:
        conn.close()
        return {"success": False, "error": "Password must contain at least 2 uppercase letters"}
    if len(re.findall(r'[a-z]', new_password)) < 2:
        conn.close()
        return {"success": False, "error": "Password must contain at least 2 lowercase letters"}
    if len(re.findall(r'[0-9]', new_password)) < 2:
        conn.close()
        return {"success": False, "error": "Password must contain at least 2 numbers"}
    if len(re.findall(r'[^A-Za-z0-9]', new_password)) < 2:
        conn.close()
        return {"success": False, "error": "Password must contain at least 2 special characters"}

    # Hash and update
    new_hash = _hash_password(new_password)
    conn.execute(
        "UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?",
        (new_hash, datetime.now().isoformat(), user_id)
    )
    conn.commit()
    conn.close()
    return {"success": True}


def check_sensitive_action_allowed(user_id: int) -> Dict:
    """Check if user can perform sensitive actions (blocked for 24h after password change)."""
    conn = _get_db()
    user = conn.execute(
        "SELECT password_changed_at FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    conn.close()

    if not user or not user["password_changed_at"]:
        return {"allowed": True}

    changed_at = datetime.fromisoformat(user["password_changed_at"])
    lockout_end = changed_at + timedelta(hours=SENSITIVE_ACTION_LOCKOUT_HOURS)
    now = datetime.now()

    if now >= lockout_end:
        return {"allowed": True}

    remaining_seconds = int((lockout_end - now).total_seconds())
    remaining_hours = remaining_seconds // 3600
    remaining_mins = (remaining_seconds % 3600) // 60
    return {
        "allowed": False,
        "remaining_seconds": remaining_seconds,
        "lockout_until": lockout_end.isoformat(),
        "message": f"For your security, withdrawals and payment method changes are restricted for 24 hours after a password change. Please try again in {remaining_hours}h {remaining_mins}m.",
    }


def init_user_db():
    """Create users and related tables."""
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            avatar_color TEXT DEFAULT '#6c5ce7',
            tier TEXT DEFAULT 'free',
            is_active INTEGER DEFAULT 1,
            is_admin INTEGER DEFAULT 0,
            referral_code TEXT UNIQUE,
            referred_by INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL,
            last_login TEXT,
            login_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            token_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            is_active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT NOT NULL,
            email TEXT,
            attempted_at TEXT NOT NULL,
            success INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            token_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS analysis_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            match_key TEXT NOT NULL,
            viewed_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS analysis_view_locks (
            user_id INTEGER PRIMARY KEY REFERENCES users(id),
            locked_until TEXT NOT NULL
        );
    """)

    # Add columns via migration (for existing installs)
    for col_sql in [
        "ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN verification_code TEXT",
        "ALTER TABLE users ADD COLUMN verification_code_expires TEXT",
        "ALTER TABLE users ADD COLUMN verification_attempts INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN avatar_url TEXT",
        "ALTER TABLE users ADD COLUMN last_known_ip TEXT",
        "ALTER TABLE users ADD COLUMN locked_until TEXT",
        "ALTER TABLE users ADD COLUMN password_changed_at TEXT",
        "ALTER TABLE users ADD COLUMN full_name TEXT",
        "ALTER TABLE users ADD COLUMN date_of_birth TEXT",
        "ALTER TABLE users ADD COLUMN security_question TEXT",
        "ALTER TABLE users ADD COLUMN security_answer_hash TEXT",
        "ALTER TABLE users ADD COLUMN staff_role TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles(id)",
        "ALTER TABLE users ADD COLUMN department TEXT",
        "ALTER TABLE users ADD COLUMN password_expires_at TEXT",
        "ALTER TABLE users ADD COLUMN is_bot INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN bot_assigned_to INTEGER REFERENCES users(id)",
        "ALTER TABLE users ADD COLUMN terms_accepted_at TEXT",
        "ALTER TABLE users ADD COLUMN whop_user_id TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN mpesa_phone TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN suspension_reason TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN suspended_at TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN country TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN has_used_trial INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN whop_membership_id TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN whop_access_source TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN magic_login_token_hash TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN magic_login_expires TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN whatsapp_number TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN whatsapp_verified INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN whatsapp_code TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN whatsapp_code_expires TEXT DEFAULT NULL",
    ]:
        try:
            conn.execute(col_sql)
        except sqlite3.OperationalError:
            pass  # Column already exists

    # --- RBAC tables ---
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            level INTEGER NOT NULL DEFAULT 0,
            department TEXT,
            description TEXT DEFAULT '',
            is_system INTEGER DEFAULT 1,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role_id INTEGER NOT NULL REFERENCES roles(id),
            module TEXT NOT NULL,
            can_read INTEGER DEFAULT 0,
            can_write INTEGER DEFAULT 0,
            can_edit INTEGER DEFAULT 0,
            can_delete INTEGER DEFAULT 0,
            can_export INTEGER DEFAULT 0,
            can_approve INTEGER DEFAULT 0,
            data_scope TEXT DEFAULT 'own',
            UNIQUE(role_id, module)
        );

        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            module TEXT,
            target_type TEXT,
            target_id INTEGER,
            details TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_logs(action);
        CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_activity_module ON activity_logs(module);

        CREATE TABLE IF NOT EXISTS user_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            module TEXT NOT NULL,
            can_read INTEGER DEFAULT -1,
            can_write INTEGER DEFAULT -1,
            can_edit INTEGER DEFAULT -1,
            can_delete INTEGER DEFAULT -1,
            can_export INTEGER DEFAULT -1,
            can_approve INTEGER DEFAULT -1,
            UNIQUE(user_id, module)
        );
        CREATE INDEX IF NOT EXISTS idx_user_perms_user ON user_permissions(user_id);

        CREATE TABLE IF NOT EXISTS staff_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            session_token_hash TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            device_info TEXT,
            started_at TEXT NOT NULL,
            last_active_at TEXT NOT NULL,
            ended_at TEXT,
            is_active INTEGER DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_ss_user ON staff_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_ss_active ON staff_sessions(is_active);
    """)

    # Auto-verify all existing users (created before verification was required)
    conn.execute("""
        UPDATE users SET email_verified = 1
        WHERE email_verified = 0 AND verification_code IS NULL
    """)

    conn.commit()
    conn.close()


def init_tracking_db():
    """Create visitor tracking and cookie consent tables."""
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS visitor_tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            user_id INTEGER REFERENCES users(id),
            ip_address TEXT,
            user_agent TEXT,
            device_type TEXT,
            browser TEXT,
            os TEXT,
            page_visited TEXT,
            referrer TEXT,
            visit_timestamp TEXT NOT NULL,
            session_start TEXT,
            session_duration_seconds INTEGER DEFAULT 0,
            consent_given INTEGER DEFAULT 0,
            country TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_vt_session ON visitor_tracking(session_id);
        CREATE INDEX IF NOT EXISTS idx_vt_user ON visitor_tracking(user_id);
        CREATE INDEX IF NOT EXISTS idx_vt_timestamp ON visitor_tracking(visit_timestamp);

        CREATE TABLE IF NOT EXISTS cookie_consents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            user_id INTEGER REFERENCES users(id),
            ip_address TEXT,
            consent_given INTEGER NOT NULL,
            consent_timestamp TEXT NOT NULL,
            consent_type TEXT DEFAULT 'all'
        );
        CREATE INDEX IF NOT EXISTS idx_cc_session ON cookie_consents(session_id);
    """)
    conn.commit()
    conn.close()


def record_consent(session_id: str, ip_address: str, consent_given: bool, user_id: int = None):
    """Record a user's cookie consent decision."""
    conn = _get_db()
    conn.execute(
        """INSERT INTO cookie_consents (session_id, user_id, ip_address, consent_given, consent_timestamp, consent_type)
           VALUES (?, ?, ?, ?, ?, 'all')""",
        (session_id, user_id, ip_address, 1 if consent_given else 0, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()


def record_page_visit(session_id: str, ip_address: str, user_agent: str, device_type: str,
                      browser: str, os_name: str, page: str, referrer: str,
                      session_start: str, user_id: int = None, country: str = None):
    """Record a page visit for tracking (only called when user consented)."""
    conn = _get_db()
    conn.execute(
        """INSERT INTO visitor_tracking
           (session_id, user_id, ip_address, user_agent, device_type, browser, os,
            page_visited, referrer, visit_timestamp, session_start, consent_given, country, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
        (session_id, user_id, ip_address, user_agent, device_type, browser, os_name,
         page, referrer, datetime.now().isoformat(), session_start, country, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()


def update_session_duration(session_id: str, duration_seconds: int):
    """Update the session duration for the latest entry of a session."""
    conn = _get_db()
    conn.execute(
        """UPDATE visitor_tracking SET session_duration_seconds = ?
           WHERE session_id = ? AND id = (SELECT MAX(id) FROM visitor_tracking WHERE session_id = ?)""",
        (duration_seconds, session_id, session_id)
    )
    conn.commit()
    conn.close()


def _classify_referrer(referrer: str) -> str:
    """Classify a referrer URL into a traffic source name."""
    if not referrer:
        return "Direct"
    r = referrer.lower()
    if "google" in r and "youtube" not in r:
        return "Google"
    if "youtube" in r or "youtu.be" in r:
        return "YouTube"
    if "tiktok" in r:
        return "TikTok"
    if "twitter" in r or "x.com" in r or "t.co" in r:
        return "X (Twitter)"
    if "facebook" in r or "fb.com" in r:
        return "Facebook"
    if "instagram" in r:
        return "Instagram"
    if "reddit" in r:
        return "Reddit"
    if "linkedin" in r:
        return "LinkedIn"
    if "whatsapp" in r:
        return "WhatsApp"
    if "telegram" in r or "t.me" in r:
        return "Telegram"
    if "bing" in r:
        return "Bing"
    if "yahoo" in r:
        return "Yahoo"
    return referrer[:60]


def get_user_tracking_summary(user_id: int) -> dict:
    """Get aggregated tracking data for a user from visitor_tracking."""
    conn = _get_db()
    latest = conn.execute(
        """SELECT ip_address, device_type, browser, os, referrer, country, user_agent, visit_timestamp
           FROM visitor_tracking WHERE user_id = ? ORDER BY visit_timestamp DESC LIMIT 1""",
        (user_id,)
    ).fetchone()
    first = conn.execute(
        """SELECT referrer, ip_address, device_type, browser, os, country, visit_timestamp
           FROM visitor_tracking WHERE user_id = ? ORDER BY visit_timestamp ASC LIMIT 1""",
        (user_id,)
    ).fetchone()
    consent = conn.execute(
        """SELECT consent_given FROM cookie_consents WHERE user_id = ? ORDER BY consent_timestamp DESC LIMIT 1""",
        (user_id,)
    ).fetchone()
    sessions = conn.execute(
        "SELECT COUNT(DISTINCT session_id) as cnt FROM visitor_tracking WHERE user_id = ?",
        (user_id,)
    ).fetchone()
    pageviews = conn.execute(
        "SELECT COUNT(*) as cnt FROM visitor_tracking WHERE user_id = ?",
        (user_id,)
    ).fetchone()
    conn.close()

    result = {
        "has_tracking": latest is not None,
        "total_sessions": sessions["cnt"] if sessions else 0,
        "total_pageviews": pageviews["cnt"] if pageviews else 0,
        "cookie_consent": bool(consent["consent_given"]) if consent else None,
    }
    if latest:
        result["latest"] = {
            "ip_address": latest["ip_address"],
            "device_type": latest["device_type"],
            "browser": latest["browser"],
            "os": latest["os"],
            "country_ip": latest["country"],
            "last_seen": latest["visit_timestamp"],
        }
    if first:
        result["first_visit"] = {
            "referrer": first["referrer"],
            "source": _classify_referrer(first["referrer"]),
            "device_type": first["device_type"],
            "browser": first["browser"],
            "os": first["os"],
            "country_ip": first["country"],
            "timestamp": first["visit_timestamp"],
        }
    return result


def get_all_users_tracking_summary() -> dict:
    """Get tracking summary for all users (for admin users list). Returns dict keyed by user_id."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT vt.user_id, vt.ip_address, vt.device_type, vt.browser, vt.os, vt.referrer, vt.country
        FROM visitor_tracking vt
        INNER JOIN (
            SELECT user_id, MAX(visit_timestamp) as max_ts
            FROM visitor_tracking WHERE user_id IS NOT NULL
            GROUP BY user_id
        ) latest ON vt.user_id = latest.user_id AND vt.visit_timestamp = latest.max_ts
    """).fetchall()
    first_rows = conn.execute("""
        SELECT vt.user_id, vt.referrer
        FROM visitor_tracking vt
        INNER JOIN (
            SELECT user_id, MIN(visit_timestamp) as min_ts
            FROM visitor_tracking WHERE user_id IS NOT NULL
            GROUP BY user_id
        ) first ON vt.user_id = first.user_id AND vt.visit_timestamp = first.min_ts
    """).fetchall()
    conn.close()

    first_ref = {r["user_id"]: r["referrer"] for r in first_rows}
    result = {}
    for r in rows:
        uid = r["user_id"]
        result[uid] = {
            "country_ip": r["country"],
            "ip_address": r["ip_address"],
            "browser": r["browser"],
            "os": r["os"],
            "device_type": r["device_type"],
            "source": _classify_referrer(first_ref.get(uid, "")),
        }
    return result


def init_employee_tables():
    """Create employee-specific tables: invites, invoices, expenses."""
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS employee_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invite_token TEXT UNIQUE NOT NULL,
            role_name TEXT NOT NULL,
            department TEXT,
            created_by INTEGER NOT NULL,
            created_by_name TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used_by INTEGER,
            used_at TEXT,
            is_active INTEGER DEFAULT 1,
            note TEXT DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_invite_token ON employee_invites(invite_token);

        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            amount REAL NOT NULL,
            currency TEXT DEFAULT 'KES',
            category TEXT DEFAULT 'general',
            status TEXT DEFAULT 'pending',
            client_name TEXT DEFAULT '',
            created_by INTEGER NOT NULL,
            approved_by INTEGER,
            due_date TEXT,
            paid_at TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_invoice_status ON invoices(status);

        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT DEFAULT 'KES',
            category TEXT DEFAULT 'operational',
            submitted_by INTEGER NOT NULL,
            approved_by INTEGER,
            status TEXT DEFAULT 'pending',
            receipt_url TEXT,
            notes TEXT DEFAULT '',
            approved_at TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_expense_status ON expenses(status);
    """)
    conn.commit()
    conn.close()


# --- Analysis View Tracking ---

def get_analysis_views_status(user_id: int) -> dict:
    """Check how many analysis views a free user has used in the current 24h window.
    Returns dict with views_used, max_views, allowed, and reset_at (if blocked)."""
    from datetime import datetime, timedelta
    conn = _get_db()
    now = datetime.utcnow()

    # Check if there's an active lock
    lock = conn.execute(
        "SELECT locked_until FROM analysis_view_locks WHERE user_id = ?", (user_id,)
    ).fetchone()

    if lock and lock["locked_until"]:
        locked_until = datetime.fromisoformat(lock["locked_until"])
        if now < locked_until:
            conn.close()
            return {"views_used": 3, "max_views": 3, "allowed": False, "reset_at": locked_until.isoformat()}
        # Lock expired - count unique matches viewed since lock expired
        count = conn.execute(
            "SELECT COUNT(DISTINCT match_key) as cnt FROM analysis_views WHERE user_id = ? AND viewed_at > ?",
            (user_id, locked_until.isoformat())
        ).fetchone()["cnt"]
        conn.close()
        return {"views_used": count, "max_views": 3, "allowed": count < 3, "reset_at": None}

    # No lock ever - count all unique matches viewed
    count = conn.execute(
        "SELECT COUNT(DISTINCT match_key) as cnt FROM analysis_views WHERE user_id = ?", (user_id,)
    ).fetchone()["cnt"]
    conn.close()
    return {"views_used": count, "max_views": 3, "allowed": count < 3, "reset_at": None}



def has_viewed_analysis(user_id: int, match_key: str) -> bool:
    """Check if user has already viewed this match analysis (prevent double-charging)."""
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT id FROM analysis_views WHERE user_id = ? AND match_key = ?",
            (user_id, match_key)
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def record_analysis_view(user_id: int, match_key: str, balance_paid: bool = False) -> dict:
    """Record that a user viewed a match analysis. Returns updated status."""
    from datetime import datetime, timedelta
    conn = _get_db()
    now = datetime.utcnow()

    # Determine current window start
    lock = conn.execute(
        "SELECT locked_until FROM analysis_view_locks WHERE user_id = ?", (user_id,)
    ).fetchone()

    window_start = "1970-01-01T00:00:00"
    if lock and lock["locked_until"]:
        locked_until = datetime.fromisoformat(lock["locked_until"])
        if now < locked_until and not balance_paid:
            # Still locked - but allow re-viewing matches that were already viewed (free or paid)
            already_viewed = conn.execute(
                "SELECT id FROM analysis_views WHERE user_id = ? AND match_key = ?",
                (user_id, match_key)
            ).fetchone()
            if not already_viewed:
                conn.close()
                return {"views_used": 3, "max_views": 3, "allowed": False, "reset_at": locked_until.isoformat()}
            # Match was already viewed (free or paid) - allow re-access
            conn.close()
            return {"views_used": 3, "max_views": 3, "allowed": True, "reset_at": locked_until.isoformat()}
        if now < locked_until and balance_paid:
            # Paid via balance — bypass lock, use current window_start
            window_start = locked_until.isoformat()
        else:
            window_start = locked_until.isoformat()

    # Check if this match was already viewed in current window (don't double-count)
    already = conn.execute(
        "SELECT id FROM analysis_views WHERE user_id = ? AND match_key = ? AND viewed_at > ?",
        (user_id, match_key, window_start)
    ).fetchone()

    if already:
        # Already viewed this match in current window, just return status
        count = conn.execute(
            "SELECT COUNT(DISTINCT match_key) as cnt FROM analysis_views WHERE user_id = ? AND viewed_at > ?",
            (user_id, window_start)
        ).fetchone()["cnt"]
        conn.close()
        return {"views_used": count, "max_views": 3, "allowed": True, "reset_at": None}

    # Record the new view
    conn.execute(
        "INSERT INTO analysis_views (user_id, match_key, viewed_at) VALUES (?, ?, ?)",
        (user_id, match_key, now.isoformat())
    )

    # Count unique matches in current window
    count = conn.execute(
        "SELECT COUNT(DISTINCT match_key) as cnt FROM analysis_views WHERE user_id = ? AND viewed_at > ?",
        (user_id, window_start)
    ).fetchone()["cnt"]

    # If this was the 3rd unique match, set lock
    if count >= 3:
        new_lock = (now + timedelta(hours=24)).isoformat()
        conn.execute(
            "INSERT INTO analysis_view_locks (user_id, locked_until) VALUES (?, ?) "
            "ON CONFLICT(user_id) DO UPDATE SET locked_until = ?",
            (user_id, new_lock, new_lock)
        )

    conn.commit()
    conn.close()
    return {"views_used": count, "max_views": 3, "allowed": True, "reset_at": None}


# --- Username Generation (Discord-style) ---

ADJECTIVES = [
    "Swift", "Lucky", "Sharp", "Bold", "Clever", "Mighty", "Quick", "Brave",
    "Calm", "Fierce", "Silent", "Wild", "Keen", "Cool", "Smooth", "Rapid",
    "Bright", "Epic", "Grand", "Noble", "Prime", "Royal", "Ultra", "Vivid",
    "Alpha", "Cyber", "Flash", "Ghost", "Hyper", "Iron", "Lunar", "Neon",
    "Omega", "Pixel", "Sonic", "Storm", "Titan", "Turbo", "Vapor", "Blaze",
]

NOUNS = [
    "Striker", "Keeper", "Ace", "Fox", "Hawk", "Wolf", "Eagle", "Lion",
    "Tiger", "Falcon", "Phoenix", "Dragon", "Panther", "Viper", "Cobra",
    "Ninja", "Warrior", "Knight", "Wizard", "Sage", "Scout", "Raider",
    "Pilot", "Hunter", "Ranger", "Shadow", "Phantom", "Legend", "Chief",
    "Maven", "Prophet", "Oracle", "Genius", "Spark", "Bolt", "Star",
    "Rocket", "Blitz", "Thunder", "Storm", "Flame", "Frost", "Blade",
]


def _generate_username() -> str:
    """Generate a Discord-style username like SwiftStriker42."""
    adj = random.choice(ADJECTIVES)
    noun = random.choice(NOUNS)
    num = random.randint(10, 99)
    return f"{adj}{noun}{num}"


def _generate_unique_username(conn) -> str:
    """Generate a username that doesn't exist yet."""
    for _ in range(50):
        username = _generate_username()
        row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if not row:
            return username
    # Fallback with longer number
    return f"{random.choice(ADJECTIVES)}{random.choice(NOUNS)}{random.randint(100, 9999)}"


def _generate_referral_code() -> str:
    """Generate a short referral code."""
    chars = string.ascii_uppercase + string.digits
    return "SPARK" + "".join(secrets.choice(chars) for _ in range(5))


def _hash_password(password: str) -> str:
    """Hash password with salt using SHA-256."""
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return f"{salt}:{hashed}"


def _verify_password(password: str, password_hash: str) -> bool:
    """Verify password against stored hash."""
    salt, stored_hash = password_hash.split(":", 1)
    check_hash = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return check_hash == stored_hash


def _create_token(user_id: int, username: str, tier: str, is_admin: bool, staff_role: str = None) -> str:
    """Create a JWT token."""
    payload = {
        "user_id": user_id,
        "username": username,
        "tier": tier,
        "is_admin": is_admin,
        "staff_role": staff_role,
        "exp": datetime.utcnow() + timedelta(days=30),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, _get_jwt_secret(), algorithm="HS256")


def verify_token(token: str) -> Optional[Dict]:
    """Verify and decode a JWT token."""
    try:
        payload = jwt.decode(token, _get_jwt_secret(), algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def _generate_verification_code() -> str:
    """Generate a 6-digit numeric verification code."""
    return str(random.randint(100000, 999999))


# Zoho token cache — avoids refreshing on every email send
_zoho_token_cache = {"token": "", "expires_at": 0}
_zoho_token_lock = threading.Lock()

# Email rate limiter — max 20 emails per 10-minute window to avoid Zoho blocks
_email_send_times = []
_email_rate_lock = threading.Lock()
_EMAIL_RATE_LIMIT = 20       # max emails per window
_EMAIL_RATE_WINDOW = 600     # 10 minutes in seconds


def _get_zoho_access_token() -> str:
    """Get a Zoho access token, using cache when possible (tokens last ~55 min)."""
    import time as _t
    with _zoho_token_lock:
        if _zoho_token_cache["token"] and _t.time() < _zoho_token_cache["expires_at"]:
            return _zoho_token_cache["token"]

    client_id = os.environ.get("ZOHO_CLIENT_ID", "")
    client_secret = os.environ.get("ZOHO_CLIENT_SECRET", "")
    refresh_token = os.environ.get("ZOHO_REFRESH_TOKEN", "")

    if not all([client_id, client_secret, refresh_token]):
        print("[WARN] Zoho OAuth not configured")
        return ""

    try:
        data = urllib.parse.urlencode({
            "grant_type": "refresh_token",
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
        }).encode()
        req = urllib.request.Request("https://accounts.zoho.com/oauth/v2/token", data=data, method="POST")
        with urllib.request.urlopen(req, timeout=8) as resp:
            result = _json.loads(resp.read().decode())
            token = result.get("access_token", "")
            if token:
                import time as _t2
                with _zoho_token_lock:
                    _zoho_token_cache["token"] = token
                    _zoho_token_cache["expires_at"] = _t2.time() + 3300  # cache for 55 min
                print("[OK] Zoho access token refreshed and cached")
            return token
    except Exception as e:
        print(f"[ERROR] Failed to get Zoho access token: {e}")
        return ""


def _send_zoho_email(to_email: str, subject: str, html_content: str, from_email: str = "", sender_name: str = "Spark AI") -> bool:
    """Send an email via Zoho Mail API (HTTPS). Bypasses SMTP port blocking."""
    import time as _rate_t

    # Rate limiting — prevent Zoho from blocking us for unusual activity
    with _email_rate_lock:
        now = _rate_t.time()
        _email_send_times[:] = [t for t in _email_send_times if now - t < _EMAIL_RATE_WINDOW]
        if len(_email_send_times) >= _EMAIL_RATE_LIMIT:
            wait = _EMAIL_RATE_WINDOW - (now - _email_send_times[0]) + 1
            print("[WARN] Email rate limit hit ({}/{}s). Waiting {:.0f}s for {}".format(
                _EMAIL_RATE_LIMIT, _EMAIL_RATE_WINDOW, wait, to_email))
            _rate_t.sleep(min(wait, 30))  # wait up to 30s for window to clear
            _email_send_times[:] = [t for t in _email_send_times if _rate_t.time() - t < _EMAIL_RATE_WINDOW]
        _email_send_times.append(_rate_t.time())

    account_id = os.environ.get("ZOHO_ACCOUNT_ID", "")
    if not from_email:
        from_email = os.environ.get("ZOHO_FROM_EMAIL", "")

    if not account_id or not from_email:
        print("[WARN] Zoho Mail API not configured - skipping email send")
        return False

    import time as _time_mod

    for attempt in range(2):
        access_token = _get_zoho_access_token()
        if not access_token:
            print(f"[ERROR] No Zoho access token (attempt {attempt + 1})")
            if attempt == 0:
                _time_mod.sleep(0.5)
            continue

        try:
            payload = _json.dumps({
                "fromAddress": from_email,

                "toAddress": to_email,
                "subject": subject,
                "content": html_content,
                "askReceipt": "no",
            }).encode()

            req = urllib.request.Request(
                f"https://mail.zoho.com/api/accounts/{account_id}/messages",
                data=payload,
                method="POST",
                headers={
                    "Authorization": f"Zoho-oauthtoken {access_token}",
                    "Content-Type": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = _json.loads(resp.read().decode())
                if result.get("status", {}).get("code") == 200:
                    print(f"[OK] Email sent to {to_email}: {subject}")
                    return True
                print(f"[ERROR] Zoho API error (attempt {attempt + 1}): {result}")
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode()[:500]
            except Exception:
                pass
            print(f"[ERROR] Zoho HTTP {e.code} sending to {to_email} (attempt {attempt + 1}): {body}")
        except Exception as e:
            print(f"[ERROR] Failed to send email to {to_email} (attempt {attempt + 1}): {e}")

        if attempt == 0:
            _time_mod.sleep(0.5)

    _log_system_event(
        action="email_send_failed",
        module="email",
        details={"recipient": to_email, "subject": subject[:100], "error": "All retry attempts failed"},
        severity="error",
    )
    return False



def _send_email_background(func, *args, **kwargs):
    """Fire-and-forget email sending in a background thread."""
    def _worker():
        try:
            func(*args, **kwargs)
        except Exception as e:
            print(f"[ERROR] Background email send failed: {e}")
    t = threading.Thread(target=_worker, daemon=True)
    t.start()


def _send_verification_email(to_email: str, code: str, display_name: str = "") -> bool:
    """Send a 6-digit verification code via Zoho Mail API."""
    greeting = display_name or "there"
    subject = f"Your verification code: {code}"

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;
                background: #0f172a; color: #f1f5f9; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 48px;">&#9917;</span>
            <h1 style="color: #f1f5f9; margin: 8px 0;">Spark AI Prediction</h1>
        </div>
        <p style="color: #94a3b8;">Hey {greeting},</p>
        <p style="color: #94a3b8;">Your verification code is:</p>
        <div style="text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px;
                         color: #3b82f6; background: rgba(59,130,246,0.1);
                         padding: 16px 32px; border-radius: 12px;
                         border: 1px solid rgba(59,130,246,0.3);">
                {code}
            </span>
        </div>
        <p style="color: #64748b; font-size: 13px;">
            This code expires in 10 minutes. If you didn't request this, ignore this email.
        </p>
    </div>
    """

    return _send_zoho_email(to_email, subject, html_body)


def _send_welcome_email(to_email: str, display_name: str = "") -> bool:
    """Send a welcome email to new users via Zoho Mail API."""
    greeting = display_name or "there"

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;
                background: #0f172a; color: #f1f5f9; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 48px;">&#9917;</span>
            <h1 style="color: #f1f5f9; margin: 8px 0;">Welcome to Spark AI!</h1>
        </div>
        <p style="color: #94a3b8;">Hey {greeting},</p>
        <p style="color: #94a3b8;">
            Your account has been created successfully! You now have access to:
        </p>
        <ul style="color: #94a3b8; line-height: 1.8;">
            <li>AI-powered match predictions</li>
            <li>Live match tracking &amp; odds</li>
            <li>Community predictions &amp; tips</li>
            <li>Personalized match analysis</li>
        </ul>
        <div style="text-align: center; margin: 28px 0;">
            <a href="https://www.spark-ai-prediction.com"
               style="display: inline-block; background: #3b82f6; color: #ffffff;
                      text-decoration: none; padding: 14px 32px; border-radius: 8px;
                      font-weight: bold; font-size: 16px;">
                Start Exploring
            </a>
        </div>
        <p style="color: #64748b; font-size: 13px; text-align: center;">
            Thank you for joining Spark AI Prediction!
        </p>
    </div>
    """

    return _send_zoho_email(to_email, "Welcome to Spark AI Prediction!", html_body)


def _send_reset_email(to_email: str, reset_url: str, display_name: str = "") -> bool:
    """Send a password reset link via Zoho Mail API."""
    greeting = display_name or "there"

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;
                background: #0f172a; color: #f1f5f9; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 48px;">&#128274;</span>
            <h1 style="color: #f1f5f9; margin: 8px 0;">Reset Your Password</h1>
        </div>
        <p style="color: #94a3b8;">Hey {greeting},</p>
        <p style="color: #94a3b8;">
            We received a request to reset your password. Click the button below to create a new password:
        </p>
        <div style="text-align: center; margin: 28px 0;">
            <a href="{reset_url}"
               style="display: inline-block; background: #3b82f6; color: #ffffff;
                      text-decoration: none; padding: 14px 32px; border-radius: 8px;
                      font-weight: bold; font-size: 16px;">
                Reset Password
            </a>
        </div>
        <p style="color: #64748b; font-size: 13px;">
            This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
        </p>
        <p style="color: #475569; font-size: 12px; margin-top: 20px; word-break: break-all;">
            If the button doesn't work, copy this link:<br/>
            <span style="color: #3b82f6;">{reset_url}</span>
        </p>
    </div>
    """

    return _send_zoho_email(to_email, "Reset your password - Spark AI Prediction", html_body)


def _send_password_changed_email(to_email: str, display_name: str = "") -> bool:
    """Send a confirmation email after password change."""
    greeting = display_name or "there"

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;
                background: #0f172a; color: #f1f5f9; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 48px;">&#9989;</span>
            <h1 style="color: #f1f5f9; margin: 8px 0;">Password Changed</h1>
        </div>
        <p style="color: #94a3b8;">Hey {greeting},</p>
        <p style="color: #94a3b8;">
            Your password was changed successfully.
        </p>
        <div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
                    border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="color: #f87171; margin: 0; font-size: 14px;">
                <strong>Didn't make this change?</strong><br/>
                If you didn't change your password, please
                <a href="https://www.spark-ai-prediction.com/support" style="color: #3b82f6; text-decoration: underline;">contact support</a>
                immediately to prevent unauthorized access to your account.
            </p>
        </div>
        <p style="color: #64748b; font-size: 13px; text-align: center;">
            Spark AI Prediction
        </p>
    </div>
    """

    return _send_zoho_email(to_email, "Your password was changed - Spark AI Prediction", html_body)


def send_first_prediction_email(to_email: str, display_name: str = "") -> bool:
    """Send a congratulatory email for the user's first prediction of the day."""
    greeting = display_name or "there"

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;
                background: #0f172a; color: #f1f5f9; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 48px;">&#127942;</span>
            <h1 style="color: #f1f5f9; margin: 8px 0;">Nice One!</h1>
        </div>
        <p style="color: #94a3b8;">Hey {greeting},</p>
        <p style="color: #94a3b8;">
            Congratulations on posting your first prediction of the day!
            Every prediction you share helps build your reputation and grow your following.
        </p>
        <div style="background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3);
                    border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="color: #22c55e; margin: 0; font-size: 14px;">
                <strong>Keep the momentum going!</strong><br/>
                Consistent predictions build trust with the community.
                The more you share, the more followers and engagement you'll earn.
            </p>
        </div>
        <div style="text-align: center; margin: 28px 0;">
            <a href="https://www.spark-ai-prediction.com"
               style="display: inline-block; background: #22c55e; color: #ffffff;
                      text-decoration: none; padding: 14px 32px; border-radius: 8px;
                      font-weight: bold; font-size: 16px;">
                Keep Predicting
            </a>
        </div>
        <p style="color: #64748b; font-size: 13px; text-align: center;">
            Spark AI Prediction
        </p>
    </div>
    """

    return _send_zoho_email(to_email, "Your first prediction of the day! - Spark AI", html_body)


def send_notification_email(to_email: str, display_name: str, notif_type: str, title: str, message: str, metadata: dict = None, from_email: str = "") -> bool:
    """Send an email notification for important events. Returns True on success."""
    greeting = display_name or "there"
    meta = metadata or {}

    # Choose color/icon based on type
    type_styles = {
        "new_follower":        {"icon": "&#128101;", "color": "#6c5ce7", "label": "New Follower"},
        "new_prediction":      {"icon": "&#128276;", "color": "#6c5ce7", "label": "New Prediction"},
        "comment":             {"icon": "&#128172;", "color": "#a78bfa", "label": "New Comment"},
        "rating":              {"icon": "&#11088;",  "color": "#f97316", "label": "New Rating"},
        "withdrawal":          {"icon": "&#128176;", "color": "#f59e0b", "label": "Withdrawal"},
        "referral_subscription": {"icon": "&#129309;", "color": "#3b82f6", "label": "Referral"},
        "prediction_sale":     {"icon": "&#127881;", "color": "#22c55e", "label": "Sale"},
        "referral_commission": {"icon": "&#128176;", "color": "#22c55e", "label": "Commission"},
        "prediction_result":   {"icon": "&#9989;", "color": "#22c55e", "label": "Result"},
        "withdrawal_method_added":   {"icon": "&#128179;", "color": "#22c55e", "label": "Payment Method"},
        "withdrawal_method_removed": {"icon": "&#128179;", "color": "#f97316", "label": "Payment Method"},
        "withdrawal_completed":      {"icon": "&#128176;", "color": "#22c55e", "label": "Payout"},
        "withdrawal_failed":         {"icon": "&#128176;", "color": "#ef4444", "label": "Payout"},
    }
    style = type_styles.get(notif_type, {"icon": "&#128276;", "color": "#3b82f6", "label": "Notification"})

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;
                background: #0f172a; color: #f1f5f9; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 48px;">{style['icon']}</span>
            <h1 style="color: #f1f5f9; margin: 8px 0; font-size: 22px;">{title}</h1>
        </div>
        <p style="color: #94a3b8;">Hey {greeting},</p>
        <div style="background: rgba({_hex_to_rgb(style['color'])},0.1);
                    border: 1px solid rgba({_hex_to_rgb(style['color'])},0.3);
                    border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="color: {style['color']}; margin: 0; font-size: 14px;">
                {message}
            </p>
        </div>
        <div style="text-align: center; margin: 28px 0;">
            <a href="https://www.spark-ai-prediction.com/predictions"
               style="display: inline-block; background: {style['color']}; color: #ffffff;
                      text-decoration: none; padding: 14px 32px; border-radius: 8px;
                      font-weight: bold; font-size: 16px;">
                View on Spark AI
            </a>
        </div>
        <p style="color: #64748b; font-size: 13px; text-align: center;">
            Spark AI Prediction
        </p>
    </div>
    """

    subject = f"{title} - Spark AI"
    return _send_zoho_email(to_email, subject, html_body, from_email=from_email)


def _hex_to_rgb(hex_color: str) -> str:
    """Convert hex color like '#6c5ce7' to '108,92,231' for CSS rgba()."""
    h = hex_color.lstrip("#")
    return ",".join(str(int(h[i:i+2], 16)) for i in (0, 2, 4))


# ==================== INVOICE EMAIL ====================

def send_invoice_email(
    to_email: str,
    display_name: str,
    invoice_number: str,
    transaction_type: str,
    amount_kes: float = 0,
    amount_usd: float = 0,
    exchange_rate: float = 0,
    payment_method: str = "M-Pesa",
    receipt_number: str = "",
    reference_id: str = "",
    completed_at: str = "",
) -> bool:
    """Send a professional invoice/receipt email after successful payment."""
    greeting = display_name or "there"
    now = completed_at or datetime.now().isoformat()
    try:
        date_str = datetime.fromisoformat(now.replace("Z", "+00:00")).strftime("%B %d, %Y at %I:%M %p")
    except Exception:
        date_str = now[:19]

    # Determine description based on transaction type
    type_labels = {
        "subscription": "Pro Subscription",
        "prediction_purchase": "Prediction Purchase",
        "balance_topup": "Balance Top-Up",
    }
    description = type_labels.get(transaction_type, transaction_type.replace("_", " ").title())

    # Plan detail for subscriptions
    plan_detail = ""
    if transaction_type == "subscription" and reference_id:
        plan_map = {
            "trial_usd": "3-Day Trial (USD)",
            "trial_kes": "3-Day Trial (KES)",
            "weekly_usd": "Pro Weekly (USD)",
            "weekly_kes": "Pro Weekly (KES)",
            "monthly_usd": "Pro Monthly (USD)",
            "monthly_kes": "Pro Monthly (KES)",
        }
        plan_detail = plan_map.get(reference_id, reference_id.replace("_", " ").title())

    # Build amount display
    amount_display = ""
    if amount_kes and amount_usd:
        amount_display = f"KES {amount_kes:,.0f} (~${amount_usd:,.2f})"
    elif amount_kes:
        amount_display = f"KES {amount_kes:,.0f}"
    elif amount_usd:
        amount_display = f"${amount_usd:,.2f}"

    # Build line items
    line_items_html = f"""
        <tr>
            <td style="padding: 12px 0; color: #e2e8f0; border-bottom: 1px solid #1e293b;">
                {description}{f'<br><span style="color:#64748b;font-size:12px;">{plan_detail}</span>' if plan_detail else ''}
            </td>
            <td style="padding: 12px 0; color: #e2e8f0; text-align: right; border-bottom: 1px solid #1e293b; font-weight: bold;">
                {amount_display}
            </td>
        </tr>
    """

    # Exchange rate row
    exchange_row = ""
    if exchange_rate and amount_kes and amount_usd:
        exchange_row = f"""
        <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 12px;">Exchange Rate</td>
            <td style="padding: 8px 0; color: #64748b; font-size: 12px; text-align: right;">1 USD = KES {exchange_rate:,.2f}</td>
        </tr>"""

    # Receipt/reference details
    details_rows = ""
    if receipt_number:
        details_rows += f"""
        <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">Receipt No.</td>
            <td style="padding: 6px 0; color: #94a3b8; font-size: 13px; text-align: right; font-family: monospace;">{receipt_number}</td>
        </tr>"""
    details_rows += f"""
        <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">Payment Method</td>
            <td style="padding: 6px 0; color: #94a3b8; font-size: 13px; text-align: right;">{payment_method}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">Date</td>
            <td style="padding: 6px 0; color: #94a3b8; font-size: 13px; text-align: right;">{date_str}</td>
        </tr>
        <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">Invoice No.</td>
            <td style="padding: 6px 0; color: #94a3b8; font-size: 13px; text-align: right; font-family: monospace;">{invoice_number}</td>
        </tr>"""

    logo_url = "https://www.spark-ai-prediction.com/logo.png"

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;
                background: #0f172a; color: #f1f5f9; border-radius: 16px; overflow: hidden;">
        <!-- Header with logo -->
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
                    padding: 32px 40px 24px; text-align: center; border-bottom: 1px solid #1e293b;">
            <img src="{logo_url}" alt="Spark AI" width="60" height="60"
                 style="border-radius: 12px; margin-bottom: 12px;" />
            <h1 style="color: #f1f5f9; margin: 0; font-size: 22px;">Payment Receipt</h1>
            <p style="color: #64748b; margin: 6px 0 0; font-size: 13px;">Invoice #{invoice_number}</p>
        </div>

        <div style="padding: 32px 40px;">
            <!-- Greeting -->
            <p style="color: #94a3b8; margin: 0 0 20px;">Hey {greeting},</p>
            <p style="color: #94a3b8; margin: 0 0 24px;">
                Thank you for your payment! Here's your receipt for this transaction.
            </p>

            <!-- Amount highlight -->
            <div style="background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.25);
                        border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <p style="color: #64748b; margin: 0 0 4px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Amount Paid</p>
                <p style="color: #22c55e; margin: 0; font-size: 28px; font-weight: bold;">{amount_display}</p>
                <p style="color: #22c55e; margin: 4px 0 0; font-size: 13px;">&#10003; Payment Successful</p>
            </div>

            <!-- Line items table -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr>
                    <th style="text-align: left; color: #64748b; font-size: 11px; text-transform: uppercase;
                               letter-spacing: 1px; padding-bottom: 8px; border-bottom: 2px solid #1e293b;">Description</th>
                    <th style="text-align: right; color: #64748b; font-size: 11px; text-transform: uppercase;
                               letter-spacing: 1px; padding-bottom: 8px; border-bottom: 2px solid #1e293b;">Amount</th>
                </tr>
                {line_items_html}
                {exchange_row}
                <tr>
                    <td style="padding: 12px 0; color: #f1f5f9; font-weight: bold; font-size: 15px;">Total</td>
                    <td style="padding: 12px 0; color: #22c55e; font-weight: bold; font-size: 15px; text-align: right;">{amount_display}</td>
                </tr>
            </table>

            <!-- Transaction details -->
            <div style="background: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse;">
                    {details_rows}
                </table>
            </div>

            <!-- CTA -->
            <div style="text-align: center; margin: 28px 0;">
                <a href="https://www.spark-ai-prediction.com/transactions"
                   style="display: inline-block; background: #3b82f6; color: #ffffff;
                          text-decoration: none; padding: 14px 32px; border-radius: 8px;
                          font-weight: bold; font-size: 15px;">
                    View Transaction History
                </a>
            </div>

            <!-- Footer -->
            <div style="border-top: 1px solid #1e293b; padding-top: 20px; text-align: center;">
                <p style="color: #475569; font-size: 12px; margin: 0 0 4px;">
                    Spark AI Prediction &mdash; AI-Powered Football Predictions
                </p>
                <p style="color: #475569; font-size: 11px; margin: 0;">
                    Questions? Contact <a href="mailto:support@sparkaipredict.com" style="color: #60a5fa; text-decoration: none;">support@sparkaipredict.com</a>
                </p>
            </div>
        </div>
    </div>
    """

    subject = f"Payment Receipt #{invoice_number} - Spark AI"
    payment_email = os.environ.get("ZOHO_PAYMENT_EMAIL", "")
    return _send_zoho_email(to_email, subject, html_body, from_email=payment_email)


# ==================== SUSPENSION EMAIL ====================

SUSPENSION_REASONS = {
    "community_guidelines": {
        "label": "Community Guidelines Violation",
        "description": "Your account was found to be in violation of our community guidelines, including harassment, threats, or abusive behavior toward other users.",
        "tos_ref": "Sections 5 (User Responsibilities) and 6 (Prohibited Activities)",
    },
    "fraudulent_activity": {
        "label": "Fraudulent Activity",
        "description": "Your account was involved in fraudulent activity, including posting misleading or fraudulent predictions, or manipulating community metrics.",
        "tos_ref": "Section 6 (Prohibited Activities)",
    },
    "spam_misleading": {
        "label": "Spam or Misleading Content",
        "description": "Your account was found to be posting spam, misleading content, or false information on the platform.",
        "tos_ref": "Section 6 (Prohibited Activities)",
    },
    "multiple_accounts": {
        "label": "Multiple Accounts",
        "description": "Your account was found to be one of multiple accounts operated by the same person, which violates our one-account-per-person policy.",
        "tos_ref": "Sections 2 (Account Registration) and 6 (Prohibited Activities)",
    },
    "payment_abuse": {
        "label": "Payment/Earnings Abuse",
        "description": "Your account was involved in abuse of the referral, earnings, or payment system.",
        "tos_ref": "Section 6 (Prohibited Activities)",
    },
    "unauthorized_access": {
        "label": "Unauthorized Access Attempt",
        "description": "Your account was involved in attempting to access other users' accounts, scraping data, or exploiting platform vulnerabilities.",
        "tos_ref": "Section 6 (Prohibited Activities)",
    },
    "prohibited_content": {
        "label": "Prohibited Content",
        "description": "Your account was found to be promoting illegal services, sharing premium content without authorization, or posting prohibited material.",
        "tos_ref": "Section 6 (Prohibited Activities)",
    },
    "other": {
        "label": "Terms of Service Violation",
        "description": "Your account was suspended for violating our Terms of Service.",
        "tos_ref": "Section 7 (Account Termination)",
    },
}


def send_suspension_email(to_email: str, display_name: str, reason_key: str, custom_note: str = "") -> bool:
    """Send a suspension notification email to the user. Returns True on success."""
    greeting = display_name or "there"
    reason = SUSPENSION_REASONS.get(reason_key, SUSPENSION_REASONS["other"])

    note_section = ""
    if custom_note:
        note_section = f"""
        <div style="background: rgba(148,163,184,0.1); border: 1px solid rgba(148,163,184,0.2);
                    border-radius: 8px; padding: 14px; margin: 16px 0;">
            <p style="color: #94a3b8; margin: 0; font-size: 13px; font-weight: 600;">Additional Note from Admin:</p>
            <p style="color: #cbd5e1; margin: 8px 0 0; font-size: 14px;">{custom_note}</p>
        </div>
        """

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;
                background: #0f172a; color: #f1f5f9; padding: 40px; border-radius: 16px;">

        <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 48px;">&#9888;</span>
            <h1 style="color: #ef4444; margin: 8px 0; font-size: 22px;">Your Account Has Been Suspended</h1>
        </div>

        <p style="color: #94a3b8;">Hey {greeting},</p>
        <p style="color: #94a3b8; font-size: 14px;">
            We're writing to inform you that your Spark AI Prediction account has been suspended
            due to the following reason:
        </p>

        <div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
                    border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="color: #ef4444; margin: 0 0 8px; font-size: 16px; font-weight: bold;">
                {reason['label']}
            </p>
            <p style="color: #fca5a5; margin: 0; font-size: 14px;">
                {reason['description']}
            </p>
            <p style="color: #94a3b8; margin: 8px 0 0; font-size: 12px;">
                Reference: Terms of Service — {reason['tos_ref']}
            </p>
        </div>

        {note_section}

        <div style="background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.2);
                    border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="color: #f59e0b; margin: 0 0 8px; font-size: 14px; font-weight: bold;">
                What This Means:
            </p>
            <ul style="color: #cbd5e1; margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.8;">
                <li>All access to the Service has been revoked immediately</li>
                <li>You are not entitled to any refund or credit for unused subscription periods</li>
                <li>Any pending earnings, payouts, or creator revenue have been forfeited</li>
                <li>Your predictions have been hidden from the marketplace</li>
                <li>Purchases of your predictions have been refunded to the buyers</li>
            </ul>
        </div>

        <div style="background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.2);
                    border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="color: #60a5fa; margin: 0 0 8px; font-size: 14px; font-weight: bold;">
                Appeal Process
            </p>
            <p style="color: #94a3b8; margin: 0; font-size: 13px;">
                If you believe this suspension was made in error, you may submit an appeal by contacting us at
                <a href="mailto:support@sparkaipredict.com" style="color: #60a5fa; text-decoration: underline;">support@sparkaipredict.com</a>
                or through the in-app support chat. Appeals are reviewed at our discretion.
            </p>
        </div>

        <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 28px;">
            This email was sent by Spark AI Prediction. Please do not reply to this email.
        </p>
    </div>
    """

    subject = "Account Suspended - Spark AI Prediction"
    return _send_zoho_email(to_email, subject, html_body)


def get_user_email_by_id(user_id: int) -> dict:
    """Get a user's email and display_name by their ID. Returns dict or None."""
    conn = _get_db()
    row = conn.execute(
        "SELECT id, email, display_name FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    conn.close()
    if row:
        return {"id": row["id"], "email": row["email"], "display_name": row["display_name"]}
    return None


def request_password_reset(email: str) -> Dict:
    """Request a password reset. Sends reset link via email."""
    email = email.lower().strip()

    if not email or "@" not in email:
        return {"success": True}  # Silent success to prevent enumeration

    conn = _get_db()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

    if not user:
        conn.close()
        return {"success": True}  # Silent success to prevent enumeration

    # Check if account is locked
    if user["locked_until"]:
        locked_until = datetime.fromisoformat(user["locked_until"])
        if datetime.now() < locked_until:
            conn.close()
            return {
                "success": False,
                "error": "Account is temporarily locked. Please try again after the lockout period.",
                "account_locked": True,
            }

    # Invalidate existing unused tokens for this user
    conn.execute(
        "UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0",
        (user["id"],),
    )

    # Generate secure token
    raw_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    now = datetime.now()
    expires = (now + timedelta(hours=1)).isoformat()

    conn.execute(
        "INSERT INTO password_reset_tokens (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (user["id"], token_hash, now.isoformat(), expires),
    )
    conn.commit()
    conn.close()

    # Build reset URL
    reset_url = f"https://www.spark-ai-prediction.com/reset-password?token={raw_token}&email={urllib.parse.quote(email)}"
    _send_reset_email(email, reset_url, user["display_name"])

    return {"success": True}


def reset_password(email: str, token: str, new_password: str) -> Dict:
    """Reset a user's password using a valid reset token."""
    email = email.lower().strip()

    if not email or not token or not new_password:
        return {"success": False, "error": "Missing required fields."}

    # Validate new password
    if len(new_password) < 8:
        return {"success": False, "error": "Password must be at least 8 characters"}
    if len(re.findall(r'[A-Z]', new_password)) < 2:
        return {"success": False, "error": "Password must contain at least 2 uppercase letters"}
    if len(re.findall(r'[a-z]', new_password)) < 2:
        return {"success": False, "error": "Password must contain at least 2 lowercase letters"}
    if len(re.findall(r'[0-9]', new_password)) < 2:
        return {"success": False, "error": "Password must contain at least 2 numbers"}
    if len(re.findall(r'[^A-Za-z0-9]', new_password)) < 2:
        return {"success": False, "error": "Password must contain at least 2 special characters"}

    conn = _get_db()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user:
        conn.close()
        return {"success": False, "error": "Invalid or expired reset link."}

    # Check 24-hour password change cooldown
    cooldown = check_password_change_cooldown(user["id"])
    if not cooldown["allowed"]:
        conn.close()
        return {"success": False, "error": cooldown["message"]}

    # Verify token
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    now = datetime.now().isoformat()
    reset_row = conn.execute(
        "SELECT * FROM password_reset_tokens WHERE user_id = ? AND token_hash = ? AND used = 0 AND expires_at > ?",
        (user["id"], token_hash, now),
    ).fetchone()

    if not reset_row:
        conn.close()
        return {"success": False, "error": "Invalid or expired reset link. Please request a new one."}

    # Update password and set password_changed_at timestamp
    new_hash = _hash_password(new_password)
    now_ts = datetime.now().isoformat()
    conn.execute(
        "UPDATE users SET password_hash = ?, locked_until = NULL, password_changed_at = ? WHERE id = ?",
        (new_hash, now_ts, user["id"]),
    )

    # Mark token as used
    conn.execute("UPDATE password_reset_tokens SET used = 1 WHERE id = ?", (reset_row["id"],))

    # Clear failed login attempts for this email
    conn.execute("DELETE FROM login_attempts WHERE email = ? AND success = 0", (email,))

    conn.commit()
    conn.close()

    # Send confirmation email
    _send_password_changed_email(email, user["display_name"])

    return {"success": True, "message": "Password reset successfully. You can now log in with your new password."}


def _is_disposable_email(email: str) -> bool:
    """Check if an email uses a known disposable/temporary email domain."""
    domain = email.lower().strip().split("@")[-1]
    return domain in DISPOSABLE_EMAIL_DOMAINS


DISPOSABLE_EMAIL_DOMAINS = {
    "10minutemail.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
    "guerrillamailblock.com", "mailinator.com", "maildrop.cc", "tempmail.com",
    "throwaway.email", "temp-mail.org", "fakeinbox.com", "sharklasers.com",
    "guerrillamail.info", "grr.la", "guerrillamail.biz", "guerrillamail.de",
    "tempail.com", "dispostable.com", "yopmail.com", "yopmail.fr", "yopmail.net",
    "cool.fr.nf", "jetable.fr.nf", "nospam.ze.tc", "nomail.xl.cx",
    "mega.zik.dj", "speed.1s.fr", "courriel.fr.nf", "moncourrier.fr.nf",
    "monemail.fr.nf", "monmail.fr.nf", "mailnesia.com", "mailcatch.com",
    "trashmail.com", "trashmail.me", "trashmail.net", "trashmail.org",
    "trashmail.at", "trashmail.ws", "trashmail.io", "0-mail.com",
    "bugmenot.com", "deadaddress.com", "discard.email", "discardmail.com",
    "discardmail.de", "emailondeck.com", "example.com",
    "fakemailgenerator.com", "getnada.com", "getairmail.com",
    "harakirimail.com", "inboxkitten.com",
    "jetable.org", "kostenloseemail.de", "kurzepost.de",
    "luxusmail.org", "mailexpire.com", "mailforspam.com", "mailhub.top",
    "mailnator.com", "mailsac.com", "mailtemp.info", "mailtothis.com",
    "mohmal.com", "mt2015.com", "mytemp.email", "mytrashmail.com",
    "nowmymail.com", "objectmail.com", "one-time.email",
    "rcpt.at", "reallymymail.com", "safetymail.info",
    "shieldedmail.com", "spamavert.com",
    "spambox.us", "spamfree24.com", "spamfree24.de",
    "spamfree24.eu", "spamfree24.info", "spamfree24.net", "spamfree24.org",
    "spamgourmet.com", "spamgourmet.net", "spamgourmet.org",
    "spamherelots.com", "spamhereplease.com", "tempemail.co.za",
    "tempemail.net", "tempinbox.com", "tempinbox.co.uk",
    "tempomail.fr", "temporaryemail.net", "temporaryemail.us",
    "temporaryforwarding.com", "temporaryinbox.com", "temporarymailaddress.com",
    "thankyou2010.com", "thisisnotmyrealemail.com", "throwam.com",
    "tmail.ws", "tmpmail.net", "tmpmail.org", "trash-mail.at",
    "trash-mail.com", "trash-mail.de", "trash2009.com", "trashdevil.com",
    "trashdevil.de", "trashymail.com", "trashymail.net",
    "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org",
    "wh4f.org", "za.com", "zehnminutenmail.de", "zoemail.org",
    "tempmailo.com", "burpcollaborator.net", "mailseal.de",
    "crazymailing.com", "tempmailer.com", "mailtemp.net", "emailfake.com",
    "cuvox.de", "armyspy.com", "dayrep.com", "einrot.com", "fleckens.hu",
    "gustr.com", "jourrapide.com", "rhyta.com", "superrito.com", "teleworm.us",
}


# --- API Functions ---

AVATAR_COLORS = [
    "#6c5ce7", "#00b894", "#e17055", "#0984e3", "#fdcb6e",
    "#e84393", "#00cec9", "#d63031", "#a29bfe", "#55efc4",
    "#fab1a0", "#74b9ff", "#ffeaa7", "#fd79a8", "#81ecec",
]


def google_login(google_token: str, referral_code: str = "", captcha_token: str = "", client_ip: str = "", terms_accepted: bool = False) -> Dict:
    """Authenticate via Google OAuth. Creates account if new, logs in if existing."""
    # Verify the Google ID token
    try:
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={google_token}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status != 200:
                return {"success": False, "error": "Invalid Google token"}
            google_data = _json.loads(resp.read().decode())
    except Exception:
        return {"success": False, "error": "Invalid Google token"}

    email = google_data.get("email", "").lower().strip()
    if not email:
        return {"success": False, "error": "No email in Google token"}

    email_verified = google_data.get("email_verified", "false")
    if email_verified != "true":
        return {"success": False, "error": "Google email not verified"}

    google_name = google_data.get("name", "")

    conn = _get_db()
    existing = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

    if existing:
        # Existing user - log them in
        if not existing["is_active"]:
            conn.close()
            return {"success": False, "error": "Account has been suspended. Please check your email for details.", "suspended": True}

        now = datetime.now().isoformat()
        # Auto-verify if logging in with Google, update IP
        # Also auto-fill full_name from Google if not set
        if google_name and not existing["full_name"]:
            conn.execute(
                "UPDATE users SET last_login = ?, login_count = login_count + 1, email_verified = 1, last_known_ip = ?, full_name = ? WHERE id = ?",
                (now, client_ip or None, google_name.strip(), existing["id"]),
            )
        else:
            conn.execute(
                "UPDATE users SET last_login = ?, login_count = login_count + 1, email_verified = 1, last_known_ip = ? WHERE id = ?",
                (now, client_ip or None, existing["id"]),
            )
        conn.commit()
        conn.close()

        token = _create_token(existing["id"], existing["username"], existing["tier"], bool(existing["is_admin"]), existing["staff_role"])
        return {
            "success": True,
            "token": token,
            "user": {
                "id": existing["id"],
                "email": existing["email"],
                "display_name": existing["display_name"],
                "username": existing["username"],
                "avatar_color": existing["avatar_color"],
                "avatar_url": existing["avatar_url"],
                "tier": existing["tier"],
                "referral_code": existing["referral_code"],
                "is_admin": bool(existing["is_admin"]),
                "created_at": existing["created_at"],
                "profile_complete": bool(existing["security_question"] and existing["security_answer_hash"] and (existing["whatsapp_verified"] if "whatsapp_verified" in existing.keys() else 0)),
                "terms_accepted": bool(existing["terms_accepted_at"]),
                "staff_role": existing["staff_role"],
                "role_id": existing["role_id"],
                "department": existing["department"],
            },
        }
    else:
        # New user via Google - require terms acceptance
        if not terms_accepted:
            conn.close()
            return {"success": False, "error": "You must accept the Terms of Service to create an account."}

        # New user via Google - require CAPTCHA
        if not verify_hcaptcha(captcha_token):
            conn.close()
            return {"success": False, "error": "CAPTCHA verification failed. Please try again."}

        # New user - create account
        username = _generate_unique_username(conn)
        password_hash = _hash_password(secrets.token_hex(32))
        ref_code = _generate_referral_code()
        avatar_color = random.choice(AVATAR_COLORS)
        now = datetime.now().isoformat()
        display_name = username

        referred_by = None
        if referral_code:
            referrer = conn.execute(
                "SELECT id FROM users WHERE referral_code = ?", (referral_code.upper().strip(),)
            ).fetchone()
            if referrer:
                referred_by = referrer["id"]

        # Auto-fill full_name from Google profile
        google_full_name = google_name.strip() if google_name else None

        conn.execute(
            """INSERT INTO users (email, password_hash, display_name, username, avatar_color,
               referral_code, referred_by, created_at, email_verified, full_name, terms_accepted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
            (email, password_hash, display_name, username, avatar_color, ref_code, referred_by, now, google_full_name, now),
        )
        conn.commit()

        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        conn.close()

        # Send welcome email to new Google user
        _send_welcome_email(email, display_name)

        token = _create_token(user["id"], user["username"], user["tier"], bool(user["is_admin"]), user["staff_role"])
        return {
            "success": True,
            "token": token,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "display_name": user["display_name"],
                "username": user["username"],
                "avatar_color": user["avatar_color"],
                "avatar_url": user["avatar_url"],
                "tier": user["tier"],
                "referral_code": user["referral_code"],
                "is_admin": bool(user["is_admin"]),
                "created_at": user["created_at"],
                "profile_complete": bool(user["security_question"] and user["security_answer_hash"] and (user["whatsapp_verified"] if "whatsapp_verified" in user.keys() else 0)),
                "terms_accepted": bool(user["terms_accepted_at"]),
                "staff_role": user["staff_role"],
                "role_id": user["role_id"],
                "department": user["department"],
            },
        }


# ==================== WHOP MARKETPLACE INTEGRATION ====================

def create_account_from_whop(
    email: str,
    whop_user_id: str,
    whop_membership_id: str,
    whop_name: str = "",
    whop_username: str = "",
) -> Dict:
    """Create or upgrade a Spark AI account from a Whop marketplace purchase.

    Called when a membership.activated webhook is received from Whop.
    If an account with the same email exists, it upgrades it to Pro.
    If no account exists, creates a new one.
    Returns a magic login token for the welcome email.
    """
    email = email.lower().strip()
    if not email or "@" not in email:
        return {"success": False, "error": "Invalid email from Whop"}

    conn = _get_db()
    now = datetime.now().isoformat()

    existing = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

    if existing:
        # Existing user — upgrade to Pro and link Whop IDs
        user_id = existing["id"]
        conn.execute(
            """UPDATE users SET whop_user_id = COALESCE(NULLIF(whop_user_id, ''), ?),
               whop_membership_id = ?, whop_access_source = 'marketplace',
               tier = 'pro', email_verified = 1
               WHERE id = ?""",
            (whop_user_id, whop_membership_id, user_id),
        )
        conn.commit()
        conn.close()

        # Create subscription record
        import subscriptions
        subscriptions.create_subscription(
            user_id=user_id,
            plan_id="weekly_usd",
            payment_method="whop_marketplace",
            payment_ref=whop_membership_id,
        )

        magic_token = generate_magic_login_token(user_id)
        return {
            "success": True,
            "is_new": False,
            "user_id": user_id,
            "display_name": existing["display_name"],
            "magic_token": magic_token,
        }

    else:
        # New user — create account (follows google_login pattern)
        username = _generate_unique_username(conn)
        password_hash = _hash_password(secrets.token_hex(32))
        ref_code = _generate_referral_code()
        avatar_color = random.choice(AVATAR_COLORS)
        display_name = username
        full_name = whop_name.strip() if whop_name else None

        conn.execute(
            """INSERT INTO users (email, password_hash, display_name, username, avatar_color,
               referral_code, created_at, email_verified, full_name, terms_accepted_at,
               whop_user_id, whop_membership_id, whop_access_source, tier)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'marketplace', 'pro')""",
            (email, password_hash, display_name, username, avatar_color,
             ref_code, now, full_name, now,
             whop_user_id, whop_membership_id),
        )
        conn.commit()

        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        user_id = user["id"]
        conn.close()

        # Create subscription record
        import subscriptions
        subscriptions.create_subscription(
            user_id=user_id,
            plan_id="weekly_usd",
            payment_method="whop_marketplace",
            payment_ref=whop_membership_id,
        )

        magic_token = generate_magic_login_token(user_id)
        return {
            "success": True,
            "is_new": True,
            "user_id": user_id,
            "display_name": display_name,
            "magic_token": magic_token,
        }


def generate_magic_login_token(user_id: int) -> Optional[str]:
    """Generate a one-time magic login token for a user. Valid for 72 hours."""
    raw_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires = (datetime.now() + timedelta(hours=72)).isoformat()

    conn = _get_db()
    conn.execute(
        "UPDATE users SET magic_login_token_hash = ?, magic_login_expires = ? WHERE id = ?",
        (token_hash, expires, user_id),
    )
    conn.commit()
    conn.close()
    return raw_token


def verify_magic_login_token(email: str, token: str) -> Dict:
    """Verify a magic login token and log the user in. One-time use."""
    email = email.lower().strip()
    if not email or not token:
        return {"success": False, "error": "Missing email or token"}

    conn = _get_db()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

    if not user:
        conn.close()
        return {"success": False, "error": "Invalid login link"}

    if not user["magic_login_token_hash"] or not user["magic_login_expires"]:
        conn.close()
        return {"success": False, "error": "No active login link. Please use the login page."}

    # Check expiry
    expires = datetime.fromisoformat(user["magic_login_expires"])
    if datetime.now() > expires:
        conn.execute(
            "UPDATE users SET magic_login_token_hash = NULL, magic_login_expires = NULL WHERE id = ?",
            (user["id"],),
        )
        conn.commit()
        conn.close()
        return {"success": False, "error": "Login link has expired. Please use the login page or request a new link."}

    # Verify token
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    if not hmac.compare_digest(token_hash, user["magic_login_token_hash"]):
        conn.close()
        return {"success": False, "error": "Invalid login link"}

    # Token is valid — clear it (one-time use) and log the user in
    now = datetime.now().isoformat()
    conn.execute(
        """UPDATE users SET magic_login_token_hash = NULL, magic_login_expires = NULL,
           last_login = ?, login_count = login_count + 1 WHERE id = ?""",
        (now, user["id"]),
    )
    conn.commit()
    conn.close()

    jwt_token = _create_token(user["id"], user["username"], user["tier"], bool(user["is_admin"]), user["staff_role"])
    return {
        "success": True,
        "token": jwt_token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "display_name": user["display_name"],
            "username": user["username"],
            "avatar_color": user["avatar_color"],
            "avatar_url": user["avatar_url"],
            "tier": user["tier"],
            "referral_code": user["referral_code"],
            "is_admin": bool(user["is_admin"]),
            "created_at": user["created_at"],
            "profile_complete": bool(user["security_question"] and user["security_answer_hash"] and (user["whatsapp_verified"] if "whatsapp_verified" in user.keys() else 0)),
            "terms_accepted": bool(user["terms_accepted_at"]),
            "staff_role": user["staff_role"],
            "role_id": user["role_id"],
            "department": user["department"],
        },
    }


def whop_oauth_login(
    whop_user_id: str,
    email: str,
    name: str = "",
    username: str = "",
    terms_accepted: bool = False,
    client_ip: str = "",
) -> Dict:
    """Authenticate via Whop OAuth. Creates account if new, logs in if existing."""
    email = email.lower().strip()
    if not email:
        return {"success": False, "error": "No email from Whop"}

    conn = _get_db()
    now = datetime.now().isoformat()

    # Try to find by whop_user_id first, then by email
    existing = conn.execute("SELECT * FROM users WHERE whop_user_id = ?", (whop_user_id,)).fetchone()
    if not existing:
        existing = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

    if existing:
        # Existing user — log them in
        if not existing["is_active"]:
            conn.close()
            return {"success": False, "error": "Account has been suspended.", "suspended": True}

        # Link whop_user_id if not already set
        update_fields = "last_login = ?, login_count = login_count + 1, email_verified = 1, last_known_ip = ?"
        params = [now, client_ip or None]
        if not existing["whop_user_id"]:
            update_fields += ", whop_user_id = ?"
            params.append(whop_user_id)
        if name and not existing["full_name"]:
            update_fields += ", full_name = ?"
            params.append(name.strip())
        params.append(existing["id"])

        conn.execute(f"UPDATE users SET {update_fields} WHERE id = ?", params)
        conn.commit()
        conn.close()

        token = _create_token(existing["id"], existing["username"], existing["tier"], bool(existing["is_admin"]), existing["staff_role"])
        return {
            "success": True,
            "token": token,
            "user": {
                "id": existing["id"],
                "email": existing["email"],
                "display_name": existing["display_name"],
                "username": existing["username"],
                "avatar_color": existing["avatar_color"],
                "avatar_url": existing["avatar_url"],
                "tier": existing["tier"],
                "referral_code": existing["referral_code"],
                "is_admin": bool(existing["is_admin"]),
                "created_at": existing["created_at"],
                "profile_complete": bool(existing["security_question"] and existing["security_answer_hash"] and (existing["whatsapp_verified"] if "whatsapp_verified" in existing.keys() else 0)),
                "terms_accepted": bool(existing["terms_accepted_at"]),
                "staff_role": existing["staff_role"],
                "role_id": existing["role_id"],
                "department": existing["department"],
            },
        }

    else:
        # New user via Whop — require terms acceptance
        if not terms_accepted:
            conn.close()
            return {"success": False, "error": "You must accept the Terms of Service to create an account.", "needs_terms": True}

        new_username = _generate_unique_username(conn)
        password_hash = _hash_password(secrets.token_hex(32))
        ref_code = _generate_referral_code()
        avatar_color = random.choice(AVATAR_COLORS)
        display_name = new_username
        full_name = name.strip() if name else None

        conn.execute(
            """INSERT INTO users (email, password_hash, display_name, username, avatar_color,
               referral_code, created_at, email_verified, full_name, terms_accepted_at,
               whop_user_id, last_known_ip)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)""",
            (email, password_hash, display_name, new_username, avatar_color,
             ref_code, now, full_name, now, whop_user_id, client_ip or None),
        )
        conn.commit()

        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        conn.close()

        _send_welcome_email(email, display_name)

        token = _create_token(user["id"], user["username"], user["tier"], bool(user["is_admin"]), user["staff_role"])
        return {
            "success": True,
            "token": token,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "display_name": user["display_name"],
                "username": user["username"],
                "avatar_color": user["avatar_color"],
                "avatar_url": user["avatar_url"],
                "tier": user["tier"],
                "referral_code": user["referral_code"],
                "is_admin": bool(user["is_admin"]),
                "created_at": user["created_at"],
                "profile_complete": bool(user["security_question"] and user["security_answer_hash"] and (user["whatsapp_verified"] if "whatsapp_verified" in user.keys() else 0)),
                "terms_accepted": bool(user["terms_accepted_at"]),
                "staff_role": user["staff_role"],
                "role_id": user["role_id"],
                "department": user["department"],
            },
        }


def send_whop_welcome_email(to_email: str, display_name: str, magic_link: str, is_new: bool = True) -> bool:
    """Send welcome email to a Whop marketplace customer with magic login link."""
    greeting = display_name or "there"

    if is_new:
        subject = "Welcome to Spark AI — Your Pro Access is Ready!"
        intro_text = "Your account has been created and you now have <strong>Pro access</strong> to Spark AI!"
    else:
        subject = "Spark AI — Your Account Has Been Upgraded to Pro!"
        intro_text = "Your existing account has been upgraded to <strong>Pro access</strong> thanks to your Whop purchase!"

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;
                background: #0f172a; color: #f1f5f9; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 48px;">&#9917;</span>
            <h1 style="color: #f1f5f9; margin: 8px 0;">Spark AI Prediction</h1>
        </div>
        <p style="color: #94a3b8;">Hey {greeting},</p>
        <p style="color: #94a3b8;">{intro_text}</p>
        <div style="text-align: center; margin: 32px 0;">
            <a href="{magic_link}"
               style="display: inline-block; background: #3b82f6; color: #ffffff;
                      padding: 16px 40px; border-radius: 12px; text-decoration: none;
                      font-weight: bold; font-size: 16px;">
                Login to Spark AI
            </a>
        </div>
        <p style="color: #94a3b8;">With Pro access, you get:</p>
        <ul style="color: #94a3b8; line-height: 1.8;">
            <li>Unlimited AI match predictions &amp; analysis</li>
            <li>Jackpot Analyzer with AI chat</li>
            <li>Community predictions &amp; live chat</li>
            <li>Chrome extension for betting sites</li>
            <li>Priority support</li>
        </ul>
        <p style="color: #64748b; font-size: 13px; margin-top: 24px;">
            This login link expires in 72 hours. You can also visit
            <a href="https://www.spark-ai-prediction.com/login" style="color: #3b82f6;">spark-ai-prediction.com</a>
            and use "Continue with Whop" to log in anytime.
        </p>
    </div>
    """

    return _send_zoho_email(to_email, subject, html_body)


def revoke_whop_marketplace_access(whop_membership_id: str) -> Dict:
    """Revoke Pro access when a Whop marketplace membership is deactivated."""
    if not whop_membership_id:
        return {"success": False, "error": "No membership ID provided"}

    conn = _get_db()
    user = conn.execute(
        "SELECT * FROM users WHERE whop_membership_id = ?", (whop_membership_id,)
    ).fetchone()

    if not user:
        conn.close()
        return {"success": False, "error": "No user found for this membership"}

    # Only revoke if the access came from marketplace
    if user["whop_access_source"] != "marketplace":
        conn.close()
        return {"success": False, "error": "Access source is not marketplace, skipping revocation"}

    user_id = user["id"]
    conn.execute(
        """UPDATE users SET tier = 'free', whop_membership_id = NULL, whop_access_source = NULL
           WHERE id = ?""",
        (user_id,),
    )
    conn.commit()
    conn.close()

    # Cancel subscription record
    import subscriptions
    subscriptions.cancel_subscription(user_id)

    print(f"[Whop Marketplace] Revoked Pro access for user {user_id} (membership: {whop_membership_id})")
    return {"success": True, "user_id": user_id}


def register_user(email: str, password: str, display_name: str = "", referral_code: str = "", captcha_token: str = "") -> Dict:
    """Register a new user. Sends verification code instead of granting immediate access."""
    # Verify CAPTCHA (always required for registration)
    if not verify_hcaptcha(captcha_token):
        return {"success": False, "error": "CAPTCHA verification failed. Please try again."}

    email = email.lower().strip()

    if len(password) < 8:
        return {"success": False, "error": "Password must be at least 8 characters"}
    if len(re.findall(r'[A-Z]', password)) < 2:
        return {"success": False, "error": "Password must contain at least 2 uppercase letters"}
    if len(re.findall(r'[a-z]', password)) < 2:
        return {"success": False, "error": "Password must contain at least 2 lowercase letters"}
    if len(re.findall(r'[0-9]', password)) < 2:
        return {"success": False, "error": "Password must contain at least 2 numbers"}
    if len(re.findall(r'[^A-Za-z0-9]', password)) < 2:
        return {"success": False, "error": "Password must contain at least 2 special characters"}

    if not email or "@" not in email:
        return {"success": False, "error": "Valid email is required"}

    # Block disposable emails
    if _is_disposable_email(email):
        return {"success": False, "error": "Temporary/disposable email addresses are not allowed. Please use a real email."}

    conn = _get_db()

    # Check if email exists
    existing = conn.execute("SELECT id, email_verified FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        if not existing["email_verified"]:
            # Unverified user trying to register again - resend code
            code = _generate_verification_code()
            expires = (datetime.now() + timedelta(minutes=10)).isoformat()
            conn.execute(
                "UPDATE users SET verification_code = ?, verification_code_expires = ?, verification_attempts = 0 WHERE id = ?",
                (code, expires, existing["id"]),
            )
            conn.commit()
            conn.close()
            _send_email_background(_send_verification_email, email, code, display_name or email.split("@")[0])
            email_sent = True
            return {
                "success": True,
                "requires_verification": True,
                "email": email,
                "message": "Verification code sent to your email",
            }
        conn.close()
        return {"success": False, "error": "Email already registered"}

    username = _generate_unique_username(conn)
    password_hash = _hash_password(password)
    ref_code = _generate_referral_code()
    avatar_color = random.choice(AVATAR_COLORS)
    now = datetime.now().isoformat()

    display_name = username

    # Check referral
    referred_by = None
    if referral_code:
        referrer = conn.execute(
            "SELECT id FROM users WHERE referral_code = ?", (referral_code.upper().strip(),)
        ).fetchone()
        if referrer:
            referred_by = referrer["id"]

    # Generate verification code
    code = _generate_verification_code()
    expires = (datetime.now() + timedelta(minutes=10)).isoformat()

    conn.execute(
        """INSERT INTO users (email, password_hash, display_name, username, avatar_color,
           referral_code, referred_by, created_at, email_verified, verification_code, verification_code_expires)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
        (email, password_hash, display_name, username, avatar_color, ref_code, referred_by, now, code, expires),
    )
    conn.commit()
    conn.close()

    # Send verification email in background (non-blocking for faster registration)
    _send_email_background(_send_verification_email, email, code, display_name)
    email_sent = True  # Optimistic — failures logged asynchronously
    if False:  # Kept for structure; errors now logged inside _send_zoho_email
        _log_system_event(
            action="otp_delivery_failed",
            module="registration",
            details={"email": email, "context": "new account registration"},
            severity="error",
        )

    return {
        "success": True,
        "requires_verification": True,
        "email": email,
        "message": "Account created! Check your email for a verification code.",
    }


def login_user(email: str, password: str, captcha_token: str = "", client_ip: str = "") -> Dict:
    """Login an existing user."""
    email = email.lower().strip()

    # Check if account is locked
    lock_status = check_account_locked(email)
    if lock_status["locked"]:
        return {
            "success": False,
            "error": "Account is temporarily locked due to too many failed attempts.",
            "account_locked": True,
            "locked_until": lock_status["locked_until"],
            "remaining_seconds": lock_status["remaining_seconds"],
        }

    # Check if CAPTCHA is required for this login
    if client_ip:
        captcha_needed = check_captcha_required(email, client_ip)
        if captcha_needed and not verify_hcaptcha(captcha_token):
            record_login_attempt(client_ip, email, False)
            # Check if this triggers a lockout
            failed_count = get_failed_attempt_count(email)
            if failed_count >= MAX_LOGIN_ATTEMPTS:
                lock_account(email)
                lock_info = check_account_locked(email)
                return {
                    "success": False,
                    "error": "Too many failed attempts. Account locked for 24 hours.",
                    "account_locked": True,
                    "locked_until": lock_info.get("locked_until", ""),
                    "remaining_seconds": lock_info.get("remaining_seconds", 86400),
                    "attempts_remaining": 0,
                }
            remaining = MAX_LOGIN_ATTEMPTS - failed_count
            return {
                "success": False,
                "error": "CAPTCHA verification required",
                "captcha_required": True,
                "attempts_remaining": remaining,
            }

    conn = _get_db()

    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user:
        conn.close()
        if client_ip:
            record_login_attempt(client_ip, email, False)
            failed_count = get_failed_attempt_count(email)
            remaining = MAX_LOGIN_ATTEMPTS - failed_count
            if remaining <= 0:
                # For existing users, lock the account. For non-existent, just report locked.
                lock_account(email)
                return {
                    "success": False,
                    "error": "Too many failed attempts. Please try again later.",
                    "account_locked": True,
                    "locked_until": (datetime.now() + timedelta(hours=24)).isoformat(),
                    "remaining_seconds": 86400,
                    "attempts_remaining": 0,
                }
            return {"success": False, "error": "Invalid email or password", "attempts_remaining": remaining}
        return {"success": False, "error": "Invalid email or password"}

    if not user["is_active"]:
        conn.close()
        return {"success": False, "error": "Account has been suspended. Please check your email for details.", "suspended": True}

    if not _verify_password(password, user["password_hash"]):
        conn.close()
        if client_ip:
            record_login_attempt(client_ip, email, False)

        # Check how many failed attempts and lock if needed
        failed_count = get_failed_attempt_count(email)
        remaining = MAX_LOGIN_ATTEMPTS - failed_count
        if remaining <= 0:
            lock_account(email)
            lock_info = check_account_locked(email)
            return {
                "success": False,
                "error": "Too many failed attempts. Account locked for 24 hours.",
                "account_locked": True,
                "locked_until": lock_info.get("locked_until", ""),
                "remaining_seconds": lock_info.get("remaining_seconds", 86400),
                "attempts_remaining": 0,
            }
        return {
            "success": False,
            "error": "Invalid email or password",
            "attempts_remaining": remaining,
        }

    # Check email verification
    if not user["email_verified"]:
        # Resend verification code
        code = _generate_verification_code()
        expires = (datetime.now() + timedelta(minutes=10)).isoformat()
        conn.execute(
            "UPDATE users SET verification_code = ?, verification_code_expires = ?, verification_attempts = 0 WHERE id = ?",
            (code, expires, user["id"]),
        )
        conn.commit()
        conn.close()
        _send_email_background(_send_verification_email, email, code, user["display_name"])
        email_sent = True
        return {
            "success": False,
            "error": "Please verify your email. A new code has been sent.",
            "requires_verification": True,
            "email": email,
        }

    # Update login stats and IP
    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE users SET last_login = ?, login_count = login_count + 1, last_known_ip = ? WHERE id = ?",
        (now, client_ip or None, user["id"]),
    )
    conn.commit()
    conn.close()

    if client_ip:
        record_login_attempt(client_ip, email, True)

    token = _create_token(user["id"], user["username"], user["tier"], bool(user["is_admin"]), user["staff_role"])

    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "display_name": user["display_name"],
            "username": user["username"],
            "avatar_color": user["avatar_color"],
            "avatar_url": user["avatar_url"],
            "tier": user["tier"],
            "referral_code": user["referral_code"],
            "is_admin": bool(user["is_admin"]),
            "created_at": user["created_at"],
            "profile_complete": bool(user["security_question"] and user["security_answer_hash"] and (user["whatsapp_verified"] if "whatsapp_verified" in user.keys() else 0)),
            "terms_accepted": bool(user["terms_accepted_at"]),
            "staff_role": user["staff_role"],
            "role_id": user["role_id"],
            "department": user["department"],
        },
    }


def verify_email(email: str, code: str) -> Dict:
    """Verify email with the 6-digit code. Returns JWT token on success."""
    email = email.lower().strip()
    conn = _get_db()

    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user:
        conn.close()
        return {"success": False, "error": "Account not found"}

    if user["email_verified"]:
        conn.close()
        return {"success": False, "error": "Email already verified"}

    # Check attempts (max 5 to prevent brute force)
    if (user["verification_attempts"] or 0) >= 5:
        conn.close()
        _log_system_event(
            action="verification_max_attempts",
            module="verification",
            details={"email": email, "attempts": user["verification_attempts"]},
            user_id=user["id"],
            severity="error",
        )
        return {"success": False, "error": "Too many failed attempts. Request a new code."}

    # Check expiry
    expires = user["verification_code_expires"]
    if not expires or datetime.fromisoformat(expires) < datetime.now():
        conn.close()
        _log_system_event(
            action="verification_code_expired",
            module="verification",
            details={"email": email, "expired_at": expires},
            user_id=user["id"],
            severity="warning",
        )
        return {"success": False, "error": "Verification code has expired. Request a new one."}

    # Check code
    if user["verification_code"] != code.strip():
        conn.execute(
            "UPDATE users SET verification_attempts = COALESCE(verification_attempts, 0) + 1 WHERE id = ?",
            (user["id"],),
        )
        conn.commit()
        remaining = 5 - (user["verification_attempts"] or 0) - 1
        conn.close()
        _log_system_event(
            action="verification_code_wrong",
            module="verification",
            details={"email": email, "attempts_remaining": remaining},
            user_id=user["id"],
            severity="warning",
        )
        return {"success": False, "error": f"Invalid code. {remaining} attempts remaining."}

    # Success - mark as verified, clear code
    now = datetime.now().isoformat()
    conn.execute(
        """UPDATE users SET email_verified = 1, verification_code = NULL,
           verification_code_expires = NULL, verification_attempts = 0,
           last_login = ?, login_count = login_count + 1 WHERE id = ?""",
        (now, user["id"]),
    )
    conn.commit()
    conn.close()

    # Send welcome email after successful verification
    _send_welcome_email(email, user["display_name"])

    token = _create_token(user["id"], user["username"], user["tier"], bool(user["is_admin"]), user["staff_role"])

    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "display_name": user["display_name"],
            "username": user["username"],
            "avatar_color": user["avatar_color"],
            "avatar_url": user["avatar_url"],
            "tier": user["tier"],
            "referral_code": user["referral_code"],
            "is_admin": bool(user["is_admin"]),
            "created_at": user["created_at"],
            "profile_complete": bool(user["security_question"] and user["security_answer_hash"] and (user["whatsapp_verified"] if "whatsapp_verified" in user.keys() else 0)),
            "terms_accepted": bool(user["terms_accepted_at"]),
            "staff_role": user["staff_role"],
            "role_id": user["role_id"],
            "department": user["department"],
        },
    }


def resend_verification_code(email: str) -> Dict:
    """Resend a verification code. Rate limited to 1 per 60 seconds."""
    email = email.lower().strip()
    conn = _get_db()

    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user:
        conn.close()
        return {"success": True, "message": "If that email is registered, a new code has been sent."}

    if user["email_verified"]:
        conn.close()
        return {"success": False, "error": "Email is already verified"}

    # Rate limit: check if current code was sent less than 60 seconds ago
    if user["verification_code_expires"]:
        expires = datetime.fromisoformat(user["verification_code_expires"])
        created_at = expires - timedelta(minutes=10)
        seconds_since_sent = (datetime.now() - created_at).total_seconds()
        if seconds_since_sent < 60:
            wait = int(60 - seconds_since_sent)
            conn.close()
            return {"success": False, "error": f"Please wait {wait} seconds before requesting a new code."}

    # Generate and store new code
    code = _generate_verification_code()
    expires = (datetime.now() + timedelta(minutes=10)).isoformat()
    conn.execute(
        "UPDATE users SET verification_code = ?, verification_code_expires = ?, verification_attempts = 0 WHERE id = ?",
        (code, expires, user["id"]),
    )
    conn.commit()
    conn.close()

    _send_email_background(_send_verification_email, email, code, user["display_name"])

    return {"success": True, "message": "A new verification code has been sent to your email."}




def _get_account_activated(user_id: int) -> bool:
    """Check if user has activated their account (made initial deposit)."""
    try:
        import community
        return community.is_account_activated(user_id)
    except Exception:
        return True  # Default to activated to avoid blocking


def _get_user_credits_total(user_id: int) -> int:
    """Get user total credits for profile response."""
    try:
        import community
        credits = community.get_user_credits(user_id)
        return credits.get("total_credits", 0)
    except Exception:
        return 0

def get_user_profile(user_id: int) -> Optional[Dict]:
    """Get user profile by ID."""
    conn = _get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if not user:
        return None
    # Check if sensitive actions are restricted
    sensitive_check = check_sensitive_action_allowed(user_id)

    return {
        "id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"],
        "username": user["username"],
        "avatar_color": user["avatar_color"],
        "avatar_url": user["avatar_url"],
        "tier": user["tier"],
        "referral_code": user["referral_code"],
        "is_admin": bool(user["is_admin"]),
        "created_at": user["created_at"],
        "password_changed_at": user["password_changed_at"],
        "full_name": user["full_name"],
        "date_of_birth": user["date_of_birth"],
        "security_question": user["security_question"],
        "has_security_answer": bool(user["security_answer_hash"]),
        "profile_complete": bool(user["security_question"] and user["security_answer_hash"] and (user["whatsapp_verified"] if "whatsapp_verified" in user.keys() else 0)),
        "terms_accepted": bool(user["terms_accepted_at"]),
        "staff_role": user["staff_role"],
        "role_id": user["role_id"],
        "department": user["department"],
        "whop_user_id": user["whop_user_id"] if "whop_user_id" in user.keys() else None,
        "mpesa_phone": user["mpesa_phone"] if "mpesa_phone" in user.keys() else None,
        "whatsapp_number": user["whatsapp_number"] if "whatsapp_number" in user.keys() else None,
        "whatsapp_verified": bool(user["whatsapp_verified"]) if "whatsapp_verified" in user.keys() else False,
        "sensitive_actions_restricted": not sensitive_check["allowed"],
        "sensitive_actions_message": sensitive_check.get("message", ""),
        "sensitive_actions_remaining_seconds": sensitive_check.get("remaining_seconds", 0),
        "account_activated": _get_account_activated(user["id"]),
        "credits": _get_user_credits_total(user["id"]),
    }


def accept_terms(user_id: int) -> Dict:
    """Record that a user has accepted the Terms of Service."""
    conn = _get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        return {"success": False, "error": "User not found"}
    now = datetime.now().isoformat()
    conn.execute("UPDATE users SET terms_accepted_at = ? WHERE id = ?", (now, user_id))
    conn.commit()
    conn.close()
    return {"success": True, "terms_accepted_at": now}


def get_public_profile(username: str) -> Optional[Dict]:
    """Get public user profile by username (for referral links)."""
    conn = _get_db()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    if not user:
        return None
    return {
        "id": user["id"],
        "display_name": user["display_name"],
        "username": user["username"],
        "avatar_color": user["avatar_color"],
        "avatar_url": user["avatar_url"],
        "tier": user["tier"],
        "referral_code": user["referral_code"],
        "created_at": user["created_at"],
    }


def update_mpesa_phone(user_id: int, phone: str) -> Dict:
    """Save/update user's M-Pesa phone number. Normalizes to 254XXXXXXXXX format."""
    phone = phone.strip().replace(" ", "").replace("-", "")
    # Normalize: +254... → 254..., 07... → 2547..., 01... → 2541...
    if phone.startswith("+"):
        phone = phone[1:]
    if phone.startswith("0") and len(phone) == 10:
        phone = "254" + phone[1:]
    if not phone.startswith("254") or len(phone) != 12 or not phone.isdigit():
        return {"success": False, "error": "Invalid phone. Use format: 254XXXXXXXXX or 07XXXXXXXX"}
    conn = _get_db()
    conn.execute("UPDATE users SET mpesa_phone = ? WHERE id = ?", (phone, user_id))
    conn.commit()
    conn.close()
    return {"success": True, "mpesa_phone": phone}


def update_avatar_url(user_id: int, avatar_url: str) -> Dict:
    """Update a user's avatar URL after file upload."""
    conn = _get_db()
    conn.execute("UPDATE users SET avatar_url = ? WHERE id = ?", (avatar_url, user_id))
    conn.commit()
    conn.close()
    return {"success": True, "avatar_url": avatar_url}


def update_username(user_id: int, new_username: str) -> Dict:
    """Update a user's username (must be unique)."""
    new_username = new_username.strip()

    if len(new_username) < 3 or len(new_username) > 24:
        return {"success": False, "error": "Username must be 3-24 characters"}

    if not new_username.isalnum():
        return {"success": False, "error": "Username must be alphanumeric only"}

    conn = _get_db()
    existing = conn.execute(
        "SELECT id FROM users WHERE username = ? AND id != ?", (new_username, user_id)
    ).fetchone()
    if existing:
        conn.close()
        return {"success": False, "error": "Username already taken"}

    conn.execute("UPDATE users SET username = ?, display_name = ? WHERE id = ?", (new_username, new_username, user_id))
    conn.commit()
    conn.close()
    return {"success": True, "username": new_username, "display_name": new_username}


def update_display_name(user_id: int, new_name: str) -> Dict:
    """Update a user's display name."""
    new_name = new_name.strip()
    if len(new_name) < 1 or len(new_name) > 30:
        return {"success": False, "error": "Display name must be 1-30 characters"}

    conn = _get_db()
    conn.execute("UPDATE users SET display_name = ? WHERE id = ?", (new_name, user_id))
    conn.commit()
    conn.close()
    return {"success": True, "display_name": new_name}


def check_username_available(username: str) -> bool:
    """Check if a username is available."""
    conn = _get_db()
    row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    return row is None


# --- Admin Functions ---

def list_all_users() -> List[Dict]:
    """List all users (admin only)."""
    conn = _get_db()
    rows = conn.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
    conn.close()
    return [{
        "id": r["id"],
        "email": r["email"],
        "display_name": r["display_name"],
        "username": r["username"],
        "tier": r["tier"],
        "is_active": bool(r["is_active"]),
        "is_admin": bool(r["is_admin"]),
        "avatar_color": r["avatar_color"],
        "full_name": r["full_name"],
        "date_of_birth": r["date_of_birth"],
        "staff_role": r["staff_role"],
        "referral_code": r["referral_code"],
        "referred_by": r["referred_by"],
        "created_at": r["created_at"],
        "last_login": r["last_login"],
        "login_count": r["login_count"],
        "country": r["country"],
    } for r in rows]


def admin_reset_password(user_id: int, new_password: str) -> Dict:
    """Admin: reset a user's password without cooldown restrictions."""
    if len(new_password) < 8:
        return {"success": False, "error": "Password must be at least 8 characters"}

    conn = _get_db()
    user = conn.execute("SELECT id, email FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        return {"success": False, "error": "User not found"}

    new_hash = _hash_password(new_password)
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Password reset for {user['email']}"}


def toggle_user_active(user_id: int, is_active: bool, reason: str = None) -> bool:
    """Activate or deactivate a user (admin only)."""
    conn = _get_db()
    if is_active:
        conn.execute("UPDATE users SET is_active = 1, suspension_reason = NULL, suspended_at = NULL WHERE id = ?", (user_id,))
    else:
        now = datetime.now().isoformat()
        conn.execute("UPDATE users SET is_active = 0, suspension_reason = ?, suspended_at = ? WHERE id = ?", (reason, now, user_id))
    conn.commit()
    conn.close()
    return True


def get_user_tier(user_id: int) -> Optional[str]:
    """Get the current tier for a user directly from DB (lightweight)."""
    conn = _get_db()
    row = conn.execute("SELECT tier FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return row["tier"] if row else None


def get_user_tier_and_status(user_id: int) -> Optional[Dict]:
    """Get user's tier and active status from DB. Returns None if user not found."""
    conn = _get_db()
    row = conn.execute("SELECT tier, is_active FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return {"tier": row["tier"], "is_active": bool(row["is_active"])}


def has_used_trial(user_id: int) -> bool:
    """Check if user has already used their free trial."""
    conn = _get_db()
    row = conn.execute("SELECT has_used_trial FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return bool(row and row["has_used_trial"])


def mark_trial_used(user_id: int):
    """Mark that a user has used their free trial."""
    conn = _get_db()
    conn.execute("UPDATE users SET has_used_trial = 1 WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()


def set_user_tier(user_id: int, tier: str) -> bool:
    """Set user tier: 'free', 'pro', or 'trial' (admin only)."""
    if tier not in ("free", "pro", "trial"):
        return False
    conn = _get_db()
    conn.execute("UPDATE users SET tier = ? WHERE id = ?", (tier, user_id))
    conn.commit()
    conn.close()
    return True


def get_user_stats() -> Dict:
    """Get overall user statistics (admin only)."""
    conn = _get_db()
    total = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
    active = conn.execute("SELECT COUNT(*) as c FROM users WHERE is_active = 1").fetchone()["c"]
    pro = conn.execute("SELECT COUNT(*) as c FROM users WHERE tier = 'pro'").fetchone()["c"]
    today = datetime.now().strftime("%Y-%m-%d")
    new_today = conn.execute(
        "SELECT COUNT(*) as c FROM users WHERE created_at LIKE ?", (f"{today}%",)
    ).fetchone()["c"]
    total_referrals = conn.execute(
        "SELECT COUNT(*) as c FROM users WHERE referred_by IS NOT NULL"
    ).fetchone()["c"]
    conn.close()
    return {
        "total_users": total,
        "active_users": active,
        "pro_users": pro,
        "free_users": total - pro,
        "new_today": new_today,
        "total_referrals": total_referrals,
    }


# --- Personal Info & Account Deletion ---

def update_personal_info(user_id: int, full_name: str = None, date_of_birth: str = None,
                         security_question: str = None, security_answer: str = None,
                         country: str = None) -> Dict:
    """Update user's personal information fields."""
    conn = _get_db()
    user = conn.execute("SELECT id, security_question FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        return {"success": False, "error": "User not found"}

    updates = []
    params = []

    if full_name is not None:
        if len(full_name.strip()) > 100:
            conn.close()
            return {"success": False, "error": "Full name must be under 100 characters"}
        updates.append("full_name = ?")
        params.append(full_name.strip() or None)

    if date_of_birth is not None:
        if date_of_birth:
            # Validate date format YYYY-MM-DD
            try:
                datetime.strptime(date_of_birth, "%Y-%m-%d")
            except ValueError:
                conn.close()
                return {"success": False, "error": "Invalid date format. Use YYYY-MM-DD."}
        updates.append("date_of_birth = ?")
        params.append(date_of_birth or None)

    if security_question is not None:
        # Once set, security question cannot be changed — skip silently
        if not user["security_question"]:
            updates.append("security_question = ?")
            params.append(security_question.strip() or None)

    if security_answer is not None:
        # Only update answer if security question isn't already set
        if not user["security_question"]:
            if security_answer.strip():
                answer_hash = _hash_password(security_answer.strip().lower())
                updates.append("security_answer_hash = ?")
                params.append(answer_hash)
            else:
                updates.append("security_answer_hash = ?")
                params.append(None)

    if country is not None:
        updates.append("country = ?")
        params.append(country.strip() or None)

    if not updates:
        conn.close()
        return {"success": False, "error": "No fields to update"}

    params.append(user_id)
    conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"success": True}


def verify_security_answer(user_id: int, answer: str) -> bool:
    """Verify a user's security answer (for admin identity verification)."""
    conn = _get_db()
    user = conn.execute("SELECT security_answer_hash FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if not user or not user["security_answer_hash"]:
        return False
    return _verify_password(answer.strip().lower(), user["security_answer_hash"])



def send_whatsapp_verification(user_id: int, phone_number: str) -> Dict:
    """Save the phone number and send SMS OTP via Twilio Verify API."""
    import whatsapp_service

    # Normalize phone number to international format
    phone = phone_number.strip().replace(" ", "").replace("-", "")
    if not phone.startswith("+"):
        phone = "+" + phone
    # Basic validation: must be 10-15 digits after the +
    digits_only = phone[1:]
    if not digits_only.isdigit() or len(digits_only) < 10 or len(digits_only) > 15:
        return {"success": False, "error": "Invalid phone number. Use international format like +254712345678"}

    conn = _get_db()
    user = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        return {"success": False, "error": "User not found"}

    # Check if this phone number is already used by another verified user
    existing = conn.execute(
        "SELECT id FROM users WHERE whatsapp_number = ? AND whatsapp_verified = 1 AND id != ?",
        (phone, user_id)
    ).fetchone()
    if existing:
        conn.close()
        return {"success": False, "error": "This phone number is already linked to another account. Please use a different number."}

    # Save the phone number
    conn.execute("UPDATE users SET whatsapp_number = ? WHERE id = ?", (phone, user_id))
    conn.commit()
    conn.close()

    # Send OTP via Twilio Verify (handles rate limiting, code generation, expiry)
    result = whatsapp_service.send_sms_otp(phone)
    if not result["success"]:
        return {"success": False, "error": result.get("error", "Failed to send verification code")}

    return {"success": True, "message": "Verification code sent via SMS."}


def verify_whatsapp(user_id: int, code: str) -> Dict:
    """Verify the SMS OTP code via Twilio Verify API. On success, marks whatsapp_verified = 1."""
    import whatsapp_service

    conn = _get_db()
    user = conn.execute(
        "SELECT id, whatsapp_number FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()
    if not user:
        conn.close()
        return {"success": False, "error": "User not found"}

    if not user["whatsapp_number"]:
        conn.close()
        return {"success": False, "error": "No phone number found. Please enter your number first."}

    # Verify via Twilio Verify API (handles code checking, expiry, attempts)
    result = whatsapp_service.check_sms_otp(user["whatsapp_number"], code.strip())
    if not result["success"]:
        conn.close()
        return {"success": False, "error": result.get("error", "Invalid verification code.")}

    # Success - mark as verified
    conn.execute("UPDATE users SET whatsapp_verified = 1 WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

    return {"success": True, "message": "Phone number verified successfully."}


VALID_STAFF_ROLES = {'super_admin', 'customer_care', 'accounting', 'technical_support'}

# RBAC role names (new system) - these map to roles table
RBAC_ROLE_NAMES = {
    'owner', 'general_manager', 'sales_hod', 'customer_care_hod',
    'marketing_hod', 'predictions_hod', 'technical_hod', 'sales_agent',
    'customer_support_agent', 'prediction_analyst', 'technical_support_agent',
}

# All valid roles (legacy + RBAC)
ALL_VALID_ROLES = VALID_STAFF_ROLES | RBAC_ROLE_NAMES


def set_staff_role(user_id: int, role: str) -> Dict:
    """Assign or remove a staff role for a user. role=None removes the role.
    Supports both legacy roles and RBAC role names."""
    if role is not None and role not in ALL_VALID_ROLES:
        return {"success": False, "error": f"Invalid role. Must be one of: {', '.join(sorted(ALL_VALID_ROLES))}"}
    conn = _get_db()
    user = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        return {"success": False, "error": "User not found"}

    if role is None:
        # Remove role entirely
        conn.execute("UPDATE users SET staff_role = NULL, role_id = NULL, department = NULL WHERE id = ?", (user_id,))
    elif role in RBAC_ROLE_NAMES:
        # New RBAC role - look up role_id from roles table and set both fields
        rbac_role = conn.execute("SELECT id, department FROM roles WHERE name = ?", (role,)).fetchone()
        if rbac_role:
            conn.execute(
                "UPDATE users SET staff_role = ?, role_id = ?, department = ? WHERE id = ?",
                (role, rbac_role["id"], rbac_role["department"], user_id),
            )
        else:
            conn.execute("UPDATE users SET staff_role = ? WHERE id = ?", (role, user_id))
    else:
        # Legacy role
        conn.execute("UPDATE users SET staff_role = ? WHERE id = ?", (role, user_id))

    conn.commit()
    conn.close()
    return {"success": True, "role": role}


def create_staff_account(email: str, password: str, display_name: str, role: str) -> Dict:
    """Create a new staff account directly (bypasses captcha, email verification, and access codes)."""
    email = email.lower().strip()

    if not email or "@" not in email:
        return {"success": False, "error": "Valid email is required"}

    if len(password) < 6:
        return {"success": False, "error": "Password must be at least 6 characters"}

    if role not in ALL_VALID_ROLES:
        return {"success": False, "error": f"Invalid role. Must be one of: {', '.join(sorted(ALL_VALID_ROLES))}"}

    if not display_name.strip():
        return {"success": False, "error": "Display name is required"}

    conn = _get_db()

    existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        conn.close()
        return {"success": False, "error": "Email already registered"}

    username = _generate_unique_username(conn)
    password_hash = _hash_password(password)
    ref_code = _generate_referral_code()
    avatar_color = random.choice(AVATAR_COLORS)
    now = datetime.now().isoformat()

    # Look up RBAC role_id and department if it's an RBAC role
    role_id = None
    department = None
    if role in RBAC_ROLE_NAMES:
        rbac_role = conn.execute("SELECT id, department FROM roles WHERE name = ?", (role,)).fetchone()
        if rbac_role:
            role_id = rbac_role["id"]
            department = rbac_role["department"]

    conn.execute(
        """INSERT INTO users (email, password_hash, display_name, username, avatar_color,
           referral_code, created_at, email_verified, staff_role, full_name, role_id, department)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)""",
        (email, password_hash, display_name.strip(), username, avatar_color, ref_code, now, role, display_name.strip(), role_id, department),
    )
    conn.commit()

    user = conn.execute("SELECT id, username, display_name, email, staff_role, role_id, department FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()

    return {
        "success": True,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "username": user["username"],
            "display_name": user["display_name"],
            "staff_role": user["staff_role"],
            "role_id": user["role_id"],
            "department": user["department"],
        }
    }


def get_staff_members() -> list:
    """Get all users with a staff role, including RBAC role info."""
    conn = _get_db()
    rows = conn.execute(
        """SELECT u.id, u.email, u.display_name, u.username, u.avatar_color,
                  u.staff_role, u.is_active, u.created_at, u.role_id, u.department,
                  r.name AS role_name, r.display_name AS role_display_name, r.level AS role_level
           FROM users u
           LEFT JOIN roles r ON u.role_id = r.id
           WHERE u.staff_role IS NOT NULL OR u.role_id IS NOT NULL
           ORDER BY COALESCE(r.level, 99), u.display_name"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_staff_role(user_id: int):
    """Get a user's staff role. Returns None if not staff."""
    conn = _get_db()
    row = conn.execute("SELECT staff_role FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return row["staff_role"] if row else None


def delete_user(user_id: int) -> Dict:
    """Delete a user account from the database."""
    conn = _get_db()
    user = conn.execute("SELECT id, email FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        return {"success": False, "error": "User not found"}

    conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM login_attempts WHERE email = ?", (user["email"],))
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"success": True}


# --- Referral Functions ---

def get_referral_stats(user_id: int) -> Dict:
    """Get referral statistics for a user."""
    conn = _get_db()

    # Count direct referrals
    referrals = conn.execute(
        "SELECT id, display_name, username, tier, created_at FROM users WHERE referred_by = ? ORDER BY created_at DESC",
        (user_id,)
    ).fetchall()

    total_referred = len(referrals)
    pro_referred = sum(1 for r in referrals if r["tier"] == "pro")

    # Get user's referral code
    user = conn.execute("SELECT referral_code FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()

    return {
        "referral_code": user["referral_code"] if user else None,
        "total_referred": total_referred,
        "pro_referred": pro_referred,
        "referrals": [{
            "id": r["id"],
            "display_name": r["display_name"],
            "username": r["username"],
            "tier": r["tier"],
            "joined": r["created_at"],
        } for r in referrals[:20]],  # Cap at 20 for API response
    }


def get_all_referral_stats() -> List[Dict]:
    """Get referral leaderboard for admin (users sorted by referral count)."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT u.id, u.display_name, u.username, u.referral_code, u.avatar_color,
            COUNT(r.id) as referral_count,
            SUM(CASE WHEN r.tier = 'pro' THEN 1 ELSE 0 END) as pro_referrals
        FROM users u
        LEFT JOIN users r ON r.referred_by = u.id
        GROUP BY u.id
        HAVING referral_count > 0
        ORDER BY referral_count DESC
        LIMIT 50
    """).fetchall()
    conn.close()

    return [{
        "user_id": r["id"],
        "display_name": r["display_name"],
        "username": r["username"],
        "referral_code": r["referral_code"],
        "avatar_color": r["avatar_color"],
        "referral_count": r["referral_count"],
        "pro_referrals": r["pro_referrals"],
    } for r in rows]


def get_referred_users_detail(referrer_id: int) -> List[Dict]:
    """Get detailed info about all users referred by a specific user (for admin)."""
    conn = _get_db()
    referred = conn.execute(
        """SELECT id, email, display_name, username, avatar_color, tier,
               is_active, created_at, last_login, login_count, has_used_trial,
               country, email_verified
           FROM users WHERE referred_by = ? ORDER BY created_at DESC""",
        (referrer_id,)
    ).fetchall()
    conn.close()

    # Fetch balances and subscription info from other DBs
    results = []
    for u in referred:
        user_data = {
            "id": u["id"],
            "email": u["email"],
            "display_name": u["display_name"],
            "username": u["username"],
            "avatar_color": u["avatar_color"],
            "tier": u["tier"],
            "is_active": bool(u["is_active"]),
            "email_verified": bool(u["email_verified"]),
            "created_at": u["created_at"],
            "last_login": u["last_login"],
            "login_count": u["login_count"] or 0,
            "country": u["country"],
            "has_used_trial": bool(u["has_used_trial"]),
            "balance_usd": 0,
            "balance_kes": 0,
            "subscription": None,
        }

        # Get balance
        try:
            import community
            bal = community.get_user_balance(u["id"])
            if bal:
                user_data["balance_usd"] = bal.get("balance_usd", 0)
                user_data["balance_kes"] = bal.get("balance_kes", 0)
        except Exception:
            pass

        # Get active subscription
        try:
            import subscriptions
            sub = subscriptions.get_active_subscription(u["id"])
            if sub:
                user_data["subscription"] = {
                    "plan": sub.get("plan_id") or sub.get("plan", ""),
                    "status": sub.get("status", ""),
                    "expires_at": sub.get("expires_at", ""),
                }
        except Exception:
            pass

        results.append(user_data)

    return results
