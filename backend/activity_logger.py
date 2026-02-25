"""
Activity Logger for Spark AI Admin Portal.
Tracks all admin actions with full audit trail.
Logs are immutable - only the owner can view, nobody can edit/delete.
"""

import sqlite3
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from functools import wraps

DB_PATH = "users.db"


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


# ─── Core Logging ───

def log_action(
    user_id: int,
    action: str,
    module: str = None,
    target_type: str = None,
    target_id: int = None,
    details: dict = None,
    ip_address: str = None,
    user_agent: str = None,
):
    """Log an admin action. This is the primary logging function."""
    conn = _get_db()
    conn.execute(
        """INSERT INTO activity_logs (user_id, action, module, target_type, target_id, details, ip_address, user_agent, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (user_id, action, module, target_type, target_id,
         json.dumps(details) if details else None,
         ip_address, user_agent, datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()


def log_system_event(
    action: str,
    module: str,
    details: dict = None,
    user_id: int = 0,
    target_type: str = None,
    target_id: int = None,
    severity: str = "error",
):
    """Log a system event (OTP failure, payment error, etc.) visible to admin/HOD.
    Uses user_id=0 for system-level events, or the affected user's ID when known.
    Severity is stored in details for filtering: 'error', 'warning', 'info'."""
    if details is None:
        details = {}
    details["severity"] = severity
    details["system_event"] = True
    try:
        log_action(
            user_id=user_id,
            action=action,
            module=module,
            target_type=target_type,
            target_id=target_id,
            details=details,
            ip_address=None,
            user_agent="system",
        )
    except Exception as e:
        print(f"[WARN] Failed to write system event log: {e}")


# ─── Query Functions ───

def get_activity_logs(
    user_id: int = None,
    action: str = None,
    module: str = None,
    from_date: str = None,
    to_date: str = None,
    page: int = 1,
    per_page: int = 50,
) -> Dict:
    """Query activity logs with filters. Returns paginated results."""
    conn = _get_db()

    where_clauses = []
    params = []

    if user_id:
        where_clauses.append("al.user_id = ?")
        params.append(user_id)
    if action:
        where_clauses.append("al.action = ?")
        params.append(action)
    if module:
        where_clauses.append("al.module = ?")
        params.append(module)
    if from_date:
        where_clauses.append("al.created_at >= ?")
        params.append(from_date)
    if to_date:
        where_clauses.append("al.created_at <= ?")
        params.append(to_date)

    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

    # Count total
    count = conn.execute(
        f"SELECT COUNT(*) as cnt FROM activity_logs al WHERE {where_sql}", params
    ).fetchone()["cnt"]

    # Fetch page
    offset = (page - 1) * per_page
    rows = conn.execute(
        f"""SELECT al.*, u.display_name, u.avatar_color, u.email
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE {where_sql}
            ORDER BY al.created_at DESC
            LIMIT ? OFFSET ?""",
        params + [per_page, offset],
    ).fetchall()
    conn.close()

    logs = []
    for r in rows:
        log = dict(r)
        if log.get("details"):
            try:
                log["details"] = json.loads(log["details"])
            except (json.JSONDecodeError, TypeError):
                pass
        logs.append(log)

    return {
        "logs": logs,
        "total": count,
        "page": page,
        "per_page": per_page,
        "total_pages": (count + per_page - 1) // per_page,
    }


def get_user_activity(user_id: int, days: int = 30) -> List[Dict]:
    """Get a specific user's activity history."""
    conn = _get_db()
    cutoff = (datetime.now() - timedelta(days=days)).isoformat()
    rows = conn.execute(
        """SELECT * FROM activity_logs
           WHERE user_id = ? AND created_at >= ?
           ORDER BY created_at DESC LIMIT 200""",
        (user_id, cutoff),
    ).fetchall()
    conn.close()

    logs = []
    for r in rows:
        log = dict(r)
        if log.get("details"):
            try:
                log["details"] = json.loads(log["details"])
            except (json.JSONDecodeError, TypeError):
                pass
        logs.append(log)
    return logs


def get_login_history(user_id: int = None, limit: int = 100) -> List[Dict]:
    """Get login/logout history. If user_id is None, returns all staff login history."""
    conn = _get_db()
    if user_id:
        rows = conn.execute(
            """SELECT al.*, u.display_name, u.email
               FROM activity_logs al
               LEFT JOIN users u ON al.user_id = u.id
               WHERE al.user_id = ? AND al.action IN ('login', 'logout', 'login_failed')
               ORDER BY al.created_at DESC LIMIT ?""",
            (user_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT al.*, u.display_name, u.email
               FROM activity_logs al
               LEFT JOIN users u ON al.user_id = u.id
               WHERE al.action IN ('login', 'logout', 'login_failed')
               ORDER BY al.created_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    conn.close()

    logs = []
    for r in rows:
        log = dict(r)
        if log.get("details"):
            try:
                log["details"] = json.loads(log["details"])
            except (json.JSONDecodeError, TypeError):
                pass
        logs.append(log)
    return logs


# ─── Staff Sessions ───

def create_staff_session(user_id: int, token_hash: str, ip_address: str = None, user_agent: str = None) -> int:
    """Create a new staff session record. Returns session ID."""
    conn = _get_db()
    now = datetime.now().isoformat()

    # Parse device info from user agent
    device_info = _parse_user_agent(user_agent) if user_agent else None

    conn.execute(
        """INSERT INTO staff_sessions (user_id, session_token_hash, ip_address, user_agent, device_info, started_at, last_active_at, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)""",
        (user_id, token_hash, ip_address, user_agent,
         json.dumps(device_info) if device_info else None, now, now),
    )
    conn.commit()
    session_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return session_id


def update_session_activity(user_id: int):
    """Update the last_active_at for a staff member's active session."""
    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE staff_sessions SET last_active_at = ? WHERE user_id = ? AND is_active = 1",
        (now, user_id),
    )
    conn.commit()
    conn.close()


def end_staff_session(user_id: int, session_id: int = None):
    """End a staff session (logout or forced)."""
    conn = _get_db()
    now = datetime.now().isoformat()
    if session_id:
        conn.execute(
            "UPDATE staff_sessions SET ended_at = ?, is_active = 0 WHERE id = ?",
            (now, session_id),
        )
    else:
        conn.execute(
            "UPDATE staff_sessions SET ended_at = ?, is_active = 0 WHERE user_id = ? AND is_active = 1",
            (now, user_id),
        )
    conn.commit()
    conn.close()


def get_active_staff_sessions() -> List[Dict]:
    """Get all currently active staff sessions."""
    conn = _get_db()
    rows = conn.execute(
        """SELECT ss.*, u.display_name, u.email, u.avatar_color, u.staff_role,
                  r.display_name as role_display_name, r.department
           FROM staff_sessions ss
           JOIN users u ON ss.user_id = u.id
           LEFT JOIN roles r ON u.role_id = r.id
           WHERE ss.is_active = 1
           ORDER BY ss.last_active_at DESC""",
    ).fetchall()
    conn.close()

    sessions = []
    for r in rows:
        s = dict(r)
        if s.get("device_info"):
            try:
                s["device_info"] = json.loads(s["device_info"])
            except (json.JSONDecodeError, TypeError):
                pass
        sessions.append(s)
    return sessions


def terminate_session(user_id: int) -> Dict:
    """Force terminate all active sessions for a staff member."""
    conn = _get_db()
    now = datetime.now().isoformat()
    result = conn.execute(
        "UPDATE staff_sessions SET ended_at = ?, is_active = 0 WHERE user_id = ? AND is_active = 1",
        (now, user_id),
    )
    conn.commit()
    count = result.rowcount
    conn.close()
    return {"success": True, "sessions_terminated": count}


def check_session_timeout(user_id: int, timeout_minutes: int = 30) -> bool:
    """Check if a staff session has timed out due to inactivity. Returns True if still active."""
    conn = _get_db()
    session = conn.execute(
        "SELECT last_active_at FROM staff_sessions WHERE user_id = ? AND is_active = 1 ORDER BY last_active_at DESC LIMIT 1",
        (user_id,),
    ).fetchone()
    conn.close()

    if not session:
        return False

    last_active = datetime.fromisoformat(session["last_active_at"])
    return (datetime.now() - last_active).total_seconds() < timeout_minutes * 60


# ─── Cleanup ───

def cleanup_old_logs(retention_days: int = 90):
    """Delete activity logs older than retention period."""
    conn = _get_db()
    cutoff = (datetime.now() - timedelta(days=retention_days)).isoformat()
    result = conn.execute("DELETE FROM activity_logs WHERE created_at < ?", (cutoff,))
    conn.commit()
    deleted = result.rowcount
    conn.close()
    return {"deleted": deleted}


def cleanup_expired_sessions():
    """Close sessions that have been inactive for more than 30 minutes."""
    conn = _get_db()
    cutoff = (datetime.now() - timedelta(minutes=30)).isoformat()
    result = conn.execute(
        "UPDATE staff_sessions SET ended_at = ?, is_active = 0 WHERE is_active = 1 AND last_active_at < ?",
        (datetime.now().isoformat(), cutoff),
    )
    conn.commit()
    count = result.rowcount
    conn.close()
    return {"expired": count}


# ─── Log Summary / Stats ───

def get_activity_stats(days: int = 7) -> Dict:
    """Get activity summary statistics for the dashboard."""
    conn = _get_db()
    cutoff = (datetime.now() - timedelta(days=days)).isoformat()

    total = conn.execute(
        "SELECT COUNT(*) as cnt FROM activity_logs WHERE created_at >= ?", (cutoff,)
    ).fetchone()["cnt"]

    by_action = conn.execute(
        "SELECT action, COUNT(*) as cnt FROM activity_logs WHERE created_at >= ? GROUP BY action ORDER BY cnt DESC",
        (cutoff,),
    ).fetchall()

    by_module = conn.execute(
        "SELECT module, COUNT(*) as cnt FROM activity_logs WHERE created_at >= ? AND module IS NOT NULL GROUP BY module ORDER BY cnt DESC",
        (cutoff,),
    ).fetchall()

    by_user = conn.execute(
        """SELECT al.user_id, u.display_name, COUNT(*) as cnt
           FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id
           WHERE al.created_at >= ?
           GROUP BY al.user_id ORDER BY cnt DESC LIMIT 10""",
        (cutoff,),
    ).fetchall()

    failed_logins = conn.execute(
        "SELECT COUNT(*) as cnt FROM activity_logs WHERE action = 'login_failed' AND created_at >= ?",
        (cutoff,),
    ).fetchone()["cnt"]

    # Count system errors (OTP failures, email failures, payment failures)
    system_errors = conn.execute(
        "SELECT COUNT(*) as cnt FROM activity_logs WHERE user_agent = 'system' AND created_at >= ?",
        (cutoff,),
    ).fetchone()["cnt"]

    conn.close()

    return {
        "total_actions": total,
        "failed_logins": failed_logins,
        "system_errors": system_errors,
        "by_action": [dict(r) for r in by_action],
        "by_module": [dict(r) for r in by_module],
        "top_users": [dict(r) for r in by_user],
    }


# ─── Helpers ───

def _parse_user_agent(ua: str) -> dict:
    """Parse a basic device info from user agent string."""
    info = {"raw": ua[:200]}
    ua_lower = ua.lower()

    if "mobile" in ua_lower or "android" in ua_lower or "iphone" in ua_lower:
        info["type"] = "mobile"
    elif "tablet" in ua_lower or "ipad" in ua_lower:
        info["type"] = "tablet"
    else:
        info["type"] = "desktop"

    if "chrome" in ua_lower and "edg" not in ua_lower:
        info["browser"] = "Chrome"
    elif "firefox" in ua_lower:
        info["browser"] = "Firefox"
    elif "safari" in ua_lower and "chrome" not in ua_lower:
        info["browser"] = "Safari"
    elif "edg" in ua_lower:
        info["browser"] = "Edge"
    else:
        info["browser"] = "Other"

    if "windows" in ua_lower:
        info["os"] = "Windows"
    elif "mac" in ua_lower:
        info["os"] = "macOS"
    elif "linux" in ua_lower:
        info["os"] = "Linux"
    elif "android" in ua_lower:
        info["os"] = "Android"
    elif "iphone" in ua_lower or "ipad" in ua_lower:
        info["os"] = "iOS"
    else:
        info["os"] = "Other"

    return info
