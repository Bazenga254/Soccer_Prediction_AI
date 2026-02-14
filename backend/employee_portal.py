"""
Employee Portal Module for Spark AI.
Handles invite system, finance (invoices/expenses), technical monitoring, and dashboard.
"""

import sqlite3
import secrets
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, List

DB_PATH = "users.db"
COMMUNITY_DB_PATH = "community.db"


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _get_community_db():
    conn = sqlite3.connect(COMMUNITY_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


# ─── Invite System ───

def create_invite(role_name: str, department: str, created_by: int, created_by_name: str,
                  expires_hours: int = 72, note: str = "") -> Dict:
    """Generate a unique invite token for hiring new employees."""
    token = secrets.token_urlsafe(32)
    now = datetime.now().isoformat()
    expires = (datetime.now() + timedelta(hours=expires_hours)).isoformat()

    conn = _get_db()
    conn.execute(
        """INSERT INTO employee_invites (invite_token, role_name, department, created_by, created_by_name,
           expires_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (token, role_name, department, created_by, created_by_name, expires, note.strip(), now),
    )
    conn.commit()
    conn.close()

    base_url = os.environ.get("FRONTEND_URL", "https://www.spark-ai-prediction.com")
    return {
        "success": True,
        "token": token,
        "invite_url": f"{base_url}/invite/{token}",
        "expires_at": expires,
    }


def validate_invite(token: str) -> Optional[Dict]:
    """Check if an invite token is valid, not expired, not used."""
    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM employee_invites WHERE invite_token = ? AND is_active = 1",
        (token,),
    ).fetchone()
    conn.close()

    if not row:
        return None

    if row["used_by"] is not None:
        return None

    if datetime.fromisoformat(row["expires_at"]) < datetime.now():
        return None

    return {
        "id": row["id"],
        "role_name": row["role_name"],
        "department": row["department"],
        "created_by_name": row["created_by_name"],
        "note": row["note"],
        "expires_at": row["expires_at"],
    }


def use_invite(token: str, user_id: int) -> Dict:
    """Mark invite as used by a new user."""
    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE employee_invites SET used_by = ?, used_at = ? WHERE invite_token = ?",
        (user_id, now, token),
    )
    row = conn.execute("SELECT role_name, department FROM employee_invites WHERE invite_token = ?", (token,)).fetchone()
    conn.commit()
    conn.close()
    return {"role_name": row["role_name"], "department": row["department"]} if row else {}


def get_invites(created_by: int = None) -> List[Dict]:
    """List all invites, optionally filtered by creator."""
    conn = _get_db()
    if created_by:
        rows = conn.execute(
            "SELECT * FROM employee_invites WHERE created_by = ? ORDER BY created_at DESC", (created_by,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM employee_invites ORDER BY created_at DESC").fetchall()
    conn.close()

    result = []
    now = datetime.now()
    for r in rows:
        expired = datetime.fromisoformat(r["expires_at"]) < now
        status = "used" if r["used_by"] else ("expired" if expired else ("revoked" if not r["is_active"] else "active"))
        result.append({
            "id": r["id"],
            "token": r["invite_token"],
            "role_name": r["role_name"],
            "department": r["department"],
            "created_by_name": r["created_by_name"],
            "note": r["note"],
            "status": status,
            "expires_at": r["expires_at"],
            "used_by": r["used_by"],
            "used_at": r["used_at"],
            "created_at": r["created_at"],
        })
    return result


def revoke_invite(invite_id: int) -> Dict:
    """Deactivate an invite link."""
    conn = _get_db()
    conn.execute("UPDATE employee_invites SET is_active = 0 WHERE id = ?", (invite_id,))
    conn.commit()
    conn.close()
    return {"success": True}


# ─── Finance: Invoices ───

def _next_invoice_number() -> str:
    """Generate next invoice number like INV-2026-0001."""
    conn = _get_db()
    year = datetime.now().year
    prefix = f"INV-{year}-"
    row = conn.execute(
        "SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1",
        (f"{prefix}%",),
    ).fetchone()
    conn.close()

    if row:
        last_num = int(row["invoice_number"].split("-")[-1])
        return f"{prefix}{last_num + 1:04d}"
    return f"{prefix}0001"


def create_invoice(title: str, amount: float, category: str, created_by: int,
                   currency: str = "KES", client_name: str = "", due_date: str = None,
                   description: str = "") -> Dict:
    """Create a new invoice."""
    inv_num = _next_invoice_number()
    now = datetime.now().isoformat()

    conn = _get_db()
    conn.execute(
        """INSERT INTO invoices (invoice_number, title, description, amount, currency, category,
           client_name, created_by, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (inv_num, title.strip(), description.strip(), amount, currency, category,
         client_name.strip(), created_by, due_date, now),
    )
    conn.commit()
    inv = conn.execute("SELECT * FROM invoices WHERE invoice_number = ?", (inv_num,)).fetchone()
    conn.close()
    return {"success": True, "invoice": dict(inv)}


def get_invoices(status: str = None, page: int = 1, per_page: int = 20) -> Dict:
    """List invoices with optional status filter and pagination."""
    conn = _get_db()
    offset = (page - 1) * per_page

    if status and status != "all":
        total = conn.execute("SELECT COUNT(*) as c FROM invoices WHERE status = ?", (status,)).fetchone()["c"]
        rows = conn.execute(
            "SELECT * FROM invoices WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (status, per_page, offset),
        ).fetchall()
    else:
        total = conn.execute("SELECT COUNT(*) as c FROM invoices").fetchone()["c"]
        rows = conn.execute(
            "SELECT * FROM invoices ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (per_page, offset),
        ).fetchall()
    conn.close()

    return {
        "invoices": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "total_pages": max(1, (total + per_page - 1) // per_page),
    }


def update_invoice_status(invoice_id: int, status: str, approved_by: int = None) -> Dict:
    """Update invoice status: pending, approved, paid, overdue, cancelled."""
    conn = _get_db()
    inv = conn.execute("SELECT id FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    if not inv:
        conn.close()
        return {"success": False, "error": "Invoice not found"}

    updates = ["status = ?"]
    params = [status]

    if status == "approved" and approved_by:
        updates.append("approved_by = ?")
        params.append(approved_by)
    if status == "paid":
        updates.append("paid_at = ?")
        params.append(datetime.now().isoformat())

    params.append(invoice_id)
    conn.execute(f"UPDATE invoices SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    updated = conn.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    conn.close()
    return {"success": True, "invoice": dict(updated)}


# ─── Finance: Expenses ───

def create_expense(title: str, amount: float, category: str, submitted_by: int,
                   currency: str = "KES", notes: str = "", receipt_url: str = None) -> Dict:
    """Submit a new expense."""
    now = datetime.now().isoformat()
    conn = _get_db()
    conn.execute(
        """INSERT INTO expenses (title, amount, currency, category, submitted_by, notes, receipt_url, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (title.strip(), amount, currency, category, submitted_by, notes.strip(), receipt_url, now),
    )
    conn.commit()
    exp = conn.execute("SELECT * FROM expenses ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    return {"success": True, "expense": dict(exp)}


def get_expenses(status: str = None, page: int = 1, per_page: int = 20) -> Dict:
    """List expenses with optional status filter and pagination."""
    conn = _get_db()
    offset = (page - 1) * per_page

    if status and status != "all":
        total = conn.execute("SELECT COUNT(*) as c FROM expenses WHERE status = ?", (status,)).fetchone()["c"]
        rows = conn.execute(
            "SELECT * FROM expenses WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (status, per_page, offset),
        ).fetchall()
    else:
        total = conn.execute("SELECT COUNT(*) as c FROM expenses").fetchone()["c"]
        rows = conn.execute(
            "SELECT * FROM expenses ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (per_page, offset),
        ).fetchall()
    conn.close()

    return {
        "expenses": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "total_pages": max(1, (total + per_page - 1) // per_page),
    }


def approve_expense(expense_id: int, approved_by: int, approve: bool = True) -> Dict:
    """Approve or reject an expense."""
    conn = _get_db()
    exp = conn.execute("SELECT id FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    if not exp:
        conn.close()
        return {"success": False, "error": "Expense not found"}

    status = "approved" if approve else "rejected"
    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE expenses SET status = ?, approved_by = ?, approved_at = ? WHERE id = ?",
        (status, approved_by, now, expense_id),
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    conn.close()
    return {"success": True, "expense": dict(updated)}


def get_financial_summary(period: str = "month") -> Dict:
    """Get P&L summary for the current period."""
    conn = _get_db()
    now = datetime.now()

    if period == "month":
        start = now.replace(day=1).strftime("%Y-%m-%d")
    elif period == "quarter":
        q_month = ((now.month - 1) // 3) * 3 + 1
        start = now.replace(month=q_month, day=1).strftime("%Y-%m-%d")
    else:
        start = now.replace(month=1, day=1).strftime("%Y-%m-%d")

    # Invoice totals (only approved/paid)
    inv_row = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE status IN ('approved', 'paid') AND created_at >= ?",
        (start,),
    ).fetchone()

    # Expense totals (only approved)
    exp_row = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE status = 'approved' AND created_at >= ?",
        (start,),
    ).fetchone()

    # By category
    inv_cats = conn.execute(
        "SELECT category, SUM(amount) as total FROM invoices WHERE status IN ('approved', 'paid') AND created_at >= ? GROUP BY category",
        (start,),
    ).fetchall()

    exp_cats = conn.execute(
        "SELECT category, SUM(amount) as total FROM expenses WHERE status = 'approved' AND created_at >= ? GROUP BY category",
        (start,),
    ).fetchall()

    # Counts
    inv_count = conn.execute("SELECT COUNT(*) as c FROM invoices WHERE created_at >= ?", (start,)).fetchone()["c"]
    exp_count = conn.execute("SELECT COUNT(*) as c FROM expenses WHERE created_at >= ?", (start,)).fetchone()["c"]
    pending_inv = conn.execute("SELECT COUNT(*) as c FROM invoices WHERE status = 'pending' AND created_at >= ?", (start,)).fetchone()["c"]
    pending_exp = conn.execute("SELECT COUNT(*) as c FROM expenses WHERE status = 'pending' AND created_at >= ?", (start,)).fetchone()["c"]

    conn.close()

    total_invoiced = inv_row["total"]
    total_expenses = exp_row["total"]

    return {
        "period": period,
        "start_date": start,
        "total_invoiced": total_invoiced,
        "total_expenses": total_expenses,
        "net": total_invoiced - total_expenses,
        "invoice_count": inv_count,
        "expense_count": exp_count,
        "pending_invoices": pending_inv,
        "pending_expenses": pending_exp,
        "invoice_by_category": {r["category"]: r["total"] for r in inv_cats},
        "expense_by_category": {r["category"]: r["total"] for r in exp_cats},
    }


# ─── Technical Monitoring ───

def get_system_health() -> Dict:
    """Get system health stats: DB sizes, table counts."""
    result = {}

    for db_name, db_path in [("users.db", DB_PATH), ("community.db", COMMUNITY_DB_PATH), ("predictions.db", "predictions.db")]:
        try:
            size = os.path.getsize(db_path) if os.path.exists(db_path) else 0
            result[db_name] = {"size_bytes": size, "size_mb": round(size / (1024 * 1024), 2)}
        except Exception:
            result[db_name] = {"size_bytes": 0, "size_mb": 0}

    # User counts
    conn = _get_db()
    result["total_users"] = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
    result["active_users"] = conn.execute("SELECT COUNT(*) as c FROM users WHERE is_active = 1").fetchone()["c"]
    result["staff_count"] = conn.execute("SELECT COUNT(*) as c FROM users WHERE staff_role IS NOT NULL").fetchone()["c"]
    result["pro_users"] = conn.execute("SELECT COUNT(*) as c FROM users WHERE tier = 'pro'").fetchone()["c"]
    conn.close()

    # Community counts
    try:
        cconn = _get_community_db()
        result["total_predictions"] = cconn.execute("SELECT COUNT(*) as c FROM community_predictions").fetchone()["c"]
        result["total_notifications"] = cconn.execute("SELECT COUNT(*) as c FROM notifications").fetchone()["c"]
        result["active_conversations"] = cconn.execute(
            "SELECT COUNT(*) as c FROM support_conversations WHERE status = 'active'"
        ).fetchone()["c"]
        cconn.close()
    except Exception:
        result["total_predictions"] = 0
        result["total_notifications"] = 0
        result["active_conversations"] = 0

    return result


def get_api_usage_stats() -> Dict:
    """Get API-Football usage stats from environment/cache."""
    return {
        "api_football": {
            "daily_limit": 100,
            "note": "Free tier: 100 requests/day",
        },
        "cache_ttls": {
            "fixtures": "2 minutes",
            "live_matches": "30 seconds",
            "injuries": "12 hours",
            "coach": "24 hours",
        },
    }


def get_recent_errors(limit: int = 50) -> List[Dict]:
    """Get recent error entries from activity_logs."""
    conn = _get_db()
    rows = conn.execute(
        """SELECT * FROM activity_logs
           WHERE action LIKE '%error%' OR action LIKE '%fail%' OR details LIKE '%error%'
           ORDER BY created_at DESC LIMIT ?""",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_moderation_queue() -> List[Dict]:
    """Get community predictions that may need moderation (reported or flagged)."""
    try:
        cconn = _get_community_db()
        rows = cconn.execute(
            """SELECT cp.id, cp.user_id, cp.fixture_id, cp.team_a_name, cp.team_b_name,
                      cp.predicted_result, cp.analysis_summary, cp.visibility, cp.created_at,
                      u.display_name, u.username
               FROM community_predictions cp
               LEFT JOIN users u ON cp.user_id = u.id
               WHERE cp.visibility = 'public'
               ORDER BY cp.created_at DESC LIMIT 50""",
        ).fetchall()
        cconn.close()
        return [dict(r) for r in rows]
    except Exception:
        return []


def moderate_prediction(prediction_id: int, action: str) -> Dict:
    """Moderate a community prediction: hide or remove."""
    try:
        cconn = _get_community_db()
        if action == "hide":
            cconn.execute(
                "UPDATE community_predictions SET visibility = 'hidden' WHERE id = ?",
                (prediction_id,),
            )
        elif action == "remove":
            cconn.execute("DELETE FROM community_predictions WHERE id = ?", (prediction_id,))
        cconn.commit()
        cconn.close()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── Employee Dashboard ───

def get_employee_dashboard(user_id: int) -> Dict:
    """Get dashboard data for an employee."""
    conn = _get_db()

    # Basic user info
    user = conn.execute(
        "SELECT display_name, username, staff_role, department, role_id FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()

    if not user:
        conn.close()
        return {}

    # Get role info
    role_info = None
    if user["role_id"]:
        role = conn.execute("SELECT * FROM roles WHERE id = ?", (user["role_id"],)).fetchone()
        if role:
            role_info = dict(role)

    # Recent activity (last 10 actions by this user)
    activities = conn.execute(
        "SELECT action, module, details, created_at FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 10",
        (user_id,),
    ).fetchall()

    # Staff sessions (last login info)
    last_session = conn.execute(
        "SELECT started_at, last_active_at FROM staff_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 1",
        (user_id,),
    ).fetchone()

    conn.close()

    # Support stats (if applicable)
    support_stats = {}
    try:
        cconn = _get_community_db()
        # Messages sent by this agent
        msg_count = cconn.execute(
            "SELECT COUNT(*) as c FROM support_messages WHERE agent_id = ? AND sender = 'admin'",
            (user_id,),
        ).fetchone()["c"]

        # Conversations handled
        conv_count = cconn.execute(
            "SELECT COUNT(*) as c FROM support_conversations WHERE assigned_agent_id = ?",
            (user_id,),
        ).fetchone()["c"]

        # Average rating
        avg_rating = cconn.execute(
            "SELECT AVG(rating) as avg FROM support_ratings WHERE agent_id = ?",
            (user_id,),
        ).fetchone()["avg"]

        support_stats = {
            "messages_sent": msg_count,
            "conversations_handled": conv_count,
            "avg_rating": round(avg_rating, 1) if avg_rating else None,
        }
        cconn.close()
    except Exception:
        pass

    return {
        "user": {
            "display_name": user["display_name"],
            "username": user["username"],
            "department": user["department"],
        },
        "role": role_info,
        "recent_activity": [dict(a) for a in activities],
        "last_session": dict(last_session) if last_session else None,
        "support_stats": support_stats,
    }
