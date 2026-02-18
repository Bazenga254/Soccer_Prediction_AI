"""
Bot Account Manager for Spark AI.
Creates, manages, and controls bot accounts that boost engagement.
Bots are real users (is_bot=1) so they work with all existing community functions.
"""

import sqlite3
import asyncio
import random
import uuid
import secrets
import string
from datetime import datetime
from typing import Dict, List, Optional

import community

DB_PATH = "users.db"

# ─── Name Generation ───

FIRST_NAMES = [
    "James", "Mary", "John", "Sarah", "David", "Emma", "Michael", "Lisa",
    "Daniel", "Anna", "Chris", "Jessica", "Brian", "Laura", "Kevin", "Rachel",
    "Andrew", "Nicole", "Ryan", "Megan", "Mark", "Emily", "Paul", "Ashley",
    "Alex", "Sophie", "Tom", "Hannah", "Ben", "Chloe", "Jake", "Olivia",
    "Sam", "Grace", "Luke", "Katie", "Adam", "Diana", "Peter", "Natalie",
    "Eric", "Zara", "Ian", "Maria", "Leo", "Stella", "Oscar", "Amara",
    "Felix", "Priya", "Kofi", "Nia", "Jamal", "Aisha", "Carlos", "Fatima",
    "Abdul", "Chen", "Yuki", "Hassan", "Dmitri", "Sana", "Kwame", "Lila",
    "Victor", "Rose", "Simon", "Faith", "Dennis", "Joy", "George", "Mercy",
    "Patrick", "Hope", "Martin", "Esther", "Joseph", "Ruth", "Francis", "Ivy",
    "Stephen", "Pearl", "Robert", "Daisy", "William", "Iris", "Henry", "Luna",
    "Arthur", "Maya", "Owen", "Nora", "Ethan", "Lily", "Noah", "Ella",
    "Liam", "Mia", "Jack", "Ava", "Logan", "Zoe", "Tyler", "Ruby",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Davis", "Miller",
    "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White",
    "Harris", "Martin", "Garcia", "Martinez", "Robinson", "Clark", "Lewis",
    "Lee", "Walker", "Hall", "Allen", "Young", "King", "Wright", "Scott",
    "Green", "Baker", "Adams", "Nelson", "Hill", "Campbell", "Mitchell",
    "Okafor", "Patel", "Nakamura", "Osei", "Mwangi", "Kiptoo", "Otieno",
    "Njoroge", "Kamau", "Wanjiku", "Muthoni", "Kimani", "Ngugi", "Okello",
    "Fisher", "Brooks", "Rivera", "Cooper", "Howard", "Ward", "Torres",
    "Morgan", "Reed", "Cook", "Rogers", "Murray", "Bell", "Bailey",
    "Sullivan", "Price", "Bennett", "Ross", "Henderson", "Perry", "Fox",
]

AVATAR_COLORS = [
    "#6c5ce7", "#00b894", "#e17055", "#0984e3", "#fdcb6e",
    "#e84393", "#00cec9", "#d63031", "#a29bfe", "#55efc4",
    "#fab1a0", "#74b9ff", "#ffeaa7", "#fd79a8", "#81ecec",
]

ADJECTIVES = [
    "Swift", "Bright", "Cool", "Bold", "Lucky", "Quick", "Smart", "Happy",
    "Sharp", "Wild", "Calm", "Keen", "True", "Pure", "Wise", "Free",
    "Gold", "Iron", "Star", "Blue", "Red", "Sky", "Sun", "Storm",
]

NOUNS = [
    "Fox", "Hawk", "Wolf", "Bear", "Lion", "Tiger", "Eagle", "Falcon",
    "Rider", "Scout", "Blade", "Flash", "Spark", "Flame", "Arrow", "Knight",
    "Ace", "Sage", "Viper", "Cobra", "Lynx", "Puma", "Raven", "Phoenix",
]


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _generate_bot_username(conn) -> str:
    """Generate a unique username for a bot."""
    for _ in range(50):
        adj = random.choice(ADJECTIVES)
        noun = random.choice(NOUNS)
        num = random.randint(10, 99)
        username = f"{adj}{noun}{num}"
        row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if not row:
            return username
    return f"Bot{uuid.uuid4().hex[:8]}"


def _generate_bot_display_name(name_prefix: str = "") -> str:
    """Generate a realistic display name."""
    if name_prefix:
        return f"{name_prefix} {random.choice(LAST_NAMES)}"
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def _generate_referral_code() -> str:
    chars = string.ascii_uppercase + string.digits
    return "SPARK" + "".join(secrets.choice(chars) for _ in range(5))


# ─── Bot CRUD ───

def create_bots(count: int, name_prefix: str = "") -> Dict:
    """Create multiple bot accounts in bulk. Max 500 per call."""
    if count < 1:
        return {"success": False, "error": "Count must be at least 1"}
    if count > 500:
        return {"success": False, "error": "Maximum 500 bots per batch"}

    conn = _get_db()
    now = datetime.now().isoformat()
    created_ids = []

    for _ in range(count):
        email = f"bot_{uuid.uuid4().hex[:10]}@spark-bot.internal"
        password_hash = secrets.token_hex(32)  # Random, bot never logs in
        display_name = _generate_bot_display_name(name_prefix)
        username = _generate_bot_username(conn)
        avatar_color = random.choice(AVATAR_COLORS)
        ref_code = _generate_referral_code()

        cur = conn.execute("""
            INSERT INTO users (email, password_hash, display_name, username, avatar_color,
                               tier, is_active, is_admin, referral_code, email_verified,
                               is_bot, created_at)
            VALUES (?, ?, ?, ?, ?, 'free', 0, 0, ?, 1, 1, ?)
        """, (email, password_hash, display_name, username, avatar_color, ref_code, now))
        created_ids.append(cur.lastrowid)

    conn.commit()
    conn.close()
    return {"success": True, "created": len(created_ids), "bot_ids": created_ids}


def get_all_bots(page: int = 1, per_page: int = 50,
                 assigned_to: int = None, is_active: int = None,
                 search: str = None) -> Dict:
    """List bot accounts with pagination and optional filters."""
    conn = _get_db()
    offset = (page - 1) * per_page

    where = "WHERE u.is_bot = 1"
    params = []
    if assigned_to is not None:
        where += " AND u.bot_assigned_to = ?"
        params.append(assigned_to)
    if is_active is not None:
        where += " AND u.is_active = ?"
        params.append(is_active)
    if search:
        where += " AND (u.display_name LIKE ? OR u.username LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    total = conn.execute(
        f"SELECT COUNT(*) as c FROM users u {where}", params
    ).fetchone()["c"]

    rows = conn.execute(f"""
        SELECT u.id, u.display_name, u.username, u.avatar_color, u.is_active,
               u.bot_assigned_to, u.created_at,
               a.display_name as assigned_to_name
        FROM users u
        LEFT JOIN users a ON u.bot_assigned_to = a.id
        {where}
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?
    """, params + [per_page, offset]).fetchall()

    bots = [{
        "id": r["id"],
        "display_name": r["display_name"],
        "username": r["username"],
        "avatar_color": r["avatar_color"],
        "is_active": bool(r["is_active"]),
        "assigned_to": r["bot_assigned_to"],
        "assigned_to_name": r["assigned_to_name"],
        "created_at": r["created_at"],
    } for r in rows]

    conn.close()
    return {"bots": bots, "total": total, "page": page, "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page if total > 0 else 1}


def get_bot_stats() -> Dict:
    """Summary stats for admin dashboard."""
    conn = _get_db()
    total = conn.execute("SELECT COUNT(*) as c FROM users WHERE is_bot = 1").fetchone()["c"]
    active = conn.execute("SELECT COUNT(*) as c FROM users WHERE is_bot = 1 AND is_active = 1").fetchone()["c"]
    assigned = conn.execute("SELECT COUNT(*) as c FROM users WHERE is_bot = 1 AND bot_assigned_to IS NOT NULL").fetchone()["c"]
    conn.close()
    return {
        "total": total,
        "active": active,
        "assigned": assigned,
        "unassigned": total - assigned,
    }


def activate_bots(bot_ids: List[int] = None, all_bots: bool = False) -> Dict:
    """Activate specified bots or all bots."""
    conn = _get_db()
    if all_bots:
        conn.execute("UPDATE users SET is_active = 1 WHERE is_bot = 1")
        affected = conn.execute("SELECT changes()").fetchone()[0]
    elif bot_ids:
        ph = ",".join("?" * len(bot_ids))
        conn.execute(f"UPDATE users SET is_active = 1 WHERE is_bot = 1 AND id IN ({ph})", bot_ids)
        affected = len(bot_ids)
    else:
        conn.close()
        return {"success": False, "error": "No bots specified"}
    conn.commit()
    conn.close()
    return {"success": True, "affected": affected}


def deactivate_bots(bot_ids: List[int] = None, all_bots: bool = False) -> Dict:
    """Deactivate specified bots or all bots. Also removes them from online tracking."""
    conn = _get_db()
    removed_ids = []
    if all_bots:
        # Get all active bot IDs first for online removal
        rows = conn.execute("SELECT id FROM users WHERE is_bot = 1 AND is_active = 1").fetchall()
        removed_ids = [r["id"] for r in rows]
        conn.execute("UPDATE users SET is_active = 0 WHERE is_bot = 1")
        affected = conn.execute("SELECT changes()").fetchone()[0]
    elif bot_ids:
        ph = ",".join("?" * len(bot_ids))
        conn.execute(f"UPDATE users SET is_active = 0 WHERE is_bot = 1 AND id IN ({ph})", bot_ids)
        affected = len(bot_ids)
        removed_ids = bot_ids
    else:
        conn.close()
        return {"success": False, "error": "No bots specified"}
    conn.commit()
    conn.close()
    # Remove from online tracking immediately
    if removed_ids:
        community.remove_active_users(removed_ids)
    return {"success": True, "affected": affected}


def assign_bots_to_employee(bot_ids: List[int], employee_user_id: int) -> Dict:
    """Delegate bots to an employee."""
    conn = _get_db()
    # Verify employee exists and has a staff role
    emp = conn.execute(
        "SELECT id, display_name, staff_role, role_id FROM users WHERE id = ? AND (staff_role IS NOT NULL OR role_id IS NOT NULL)",
        (employee_user_id,)
    ).fetchone()
    if not emp:
        conn.close()
        return {"success": False, "error": "Employee not found or has no staff role"}

    ph = ",".join("?" * len(bot_ids))
    conn.execute(
        f"UPDATE users SET bot_assigned_to = ? WHERE is_bot = 1 AND id IN ({ph})",
        [employee_user_id] + bot_ids
    )
    conn.commit()
    conn.close()
    return {"success": True, "assigned": len(bot_ids), "employee": emp["display_name"]}


def unassign_bots(bot_ids: List[int]) -> Dict:
    """Remove employee assignment from bots."""
    conn = _get_db()
    ph = ",".join("?" * len(bot_ids))
    conn.execute(f"UPDATE users SET bot_assigned_to = NULL WHERE is_bot = 1 AND id IN ({ph})", bot_ids)
    conn.commit()
    conn.close()
    return {"success": True, "unassigned": len(bot_ids)}


def get_employee_bots(employee_user_id: int, is_active: int = None) -> Dict:
    """Get bots assigned to a specific employee."""
    conn = _get_db()
    where = "WHERE is_bot = 1 AND bot_assigned_to = ?"
    params = [employee_user_id]
    if is_active is not None:
        where += " AND is_active = ?"
        params.append(is_active)

    rows = conn.execute(f"""
        SELECT id, display_name, username, avatar_color, is_active, created_at
        FROM users {where} ORDER BY display_name
    """, params).fetchall()
    conn.close()

    return {"bots": [{
        "id": r["id"],
        "display_name": r["display_name"],
        "username": r["username"],
        "avatar_color": r["avatar_color"],
        "is_active": bool(r["is_active"]),
        "created_at": r["created_at"],
    } for r in rows], "total": len(rows)}


def delete_bots(bot_ids: List[int]) -> Dict:
    """Permanently delete bot accounts and their community data."""
    conn = _get_db()
    ph = ",".join("?" * len(bot_ids))

    # Verify they are bots
    actual = conn.execute(
        f"SELECT id FROM users WHERE is_bot = 1 AND id IN ({ph})", bot_ids
    ).fetchall()
    actual_ids = [r["id"] for r in actual]

    if not actual_ids:
        conn.close()
        return {"success": False, "error": "No valid bot accounts found"}

    aph = ",".join("?" * len(actual_ids))
    conn.execute(f"DELETE FROM users WHERE id IN ({aph})", actual_ids)
    conn.commit()
    conn.close()

    # Clean up community data (separate DB)
    try:
        cconn = sqlite3.connect("community.db")
        cconn.execute("PRAGMA journal_mode=WAL")
        for table_col in [
            ("match_chats", "user_id"),
            ("prediction_chats", "user_id"),
            ("prediction_comments", "user_id"),
            ("user_follows", "follower_id"),
            ("user_follows", "following_id"),
            ("prediction_reactions", "user_id"),
        ]:
            try:
                cconn.execute(
                    f"DELETE FROM {table_col[0]} WHERE {table_col[1]} IN ({aph})", actual_ids
                )
            except Exception:
                pass
        cconn.commit()
        cconn.close()
    except Exception:
        pass

    return {"success": True, "deleted": len(actual_ids)}


# ─── Bot Actions ───

def _get_bot(bot_id: int, required_assignee: int = None) -> Optional[Dict]:
    """Fetch a bot and optionally verify assignment."""
    conn = _get_db()
    bot = conn.execute(
        "SELECT id, display_name, username, avatar_color, is_active, bot_assigned_to FROM users WHERE id = ? AND is_bot = 1",
        (bot_id,)
    ).fetchone()
    conn.close()
    if not bot:
        return None
    if required_assignee is not None and bot["bot_assigned_to"] != required_assignee:
        return None
    return dict(bot)


def execute_bot_action(bot_id: int, action: str, target_id: str = "",
                       message: str = "", reaction: str = "",
                       required_assignee: int = None) -> Dict:
    """Execute an action as a bot. Used by both admin and employee endpoints."""
    bot = _get_bot(bot_id, required_assignee=required_assignee)
    if not bot:
        return {"success": False, "error": "Bot not found or not assigned to you"}

    try:
        if action == "match_chat":
            if not target_id or not message.strip():
                return {"success": False, "error": "Match key and message required"}
            result = community.send_match_chat_message(
                target_id, bot["id"], bot["username"],
                bot["display_name"], bot["avatar_color"], message.strip()
            )
            return result

        elif action == "prediction_chat":
            if not target_id or not message.strip():
                return {"success": False, "error": "Prediction ID and message required"}
            result = community.send_chat_message(
                int(target_id), bot["id"], bot["username"],
                bot["display_name"], bot["avatar_color"], message.strip()
            )
            return result

        elif action == "comment":
            if not target_id or not message.strip():
                return {"success": False, "error": "Prediction ID and comment required"}
            result = community.add_comment(
                int(target_id), bot["id"], bot["username"],
                bot["display_name"], bot["avatar_color"], message.strip()
            )
            return result

        elif action == "follow":
            if not target_id:
                return {"success": False, "error": "Target user ID required"}
            result = community.follow_user(bot["id"], int(target_id))
            return result

        elif action == "unfollow":
            if not target_id:
                return {"success": False, "error": "Target user ID required"}
            result = community.unfollow_user(bot["id"], int(target_id))
            return result

        elif action == "react":
            if not target_id or reaction not in ("like", "dislike"):
                return {"success": False, "error": "Prediction ID and reaction (like/dislike) required"}
            result = community.react_prediction(int(target_id), bot["id"], reaction)
            return result

        else:
            return {"success": False, "error": f"Unknown action: {action}"}

    except Exception as e:
        return {"success": False, "error": str(e)}


def execute_batch_action(bot_ids: List[int], action: str, target_id: str = "",
                         message: str = "", reaction: str = "",
                         required_assignee: int = None) -> Dict:
    """Execute the same action for multiple bots. Returns summary."""
    successes = 0
    failures = 0
    errors = []
    for bid in bot_ids:
        result = execute_bot_action(bid, action, target_id, message, reaction, required_assignee)
        if result.get("success", False) or "error" not in result:
            successes += 1
        else:
            failures += 1
            if len(errors) < 3:
                errors.append(f"Bot {bid}: {result.get('error', 'Unknown')}")
    return {
        "success": True,
        "total": len(bot_ids),
        "successes": successes,
        "failures": failures,
        "errors": errors,
    }


def get_real_users(search: str = "", limit: int = 20) -> List[Dict]:
    """Get real (non-bot) users for targeting. Used by action UI."""
    conn = _get_db()
    where = "WHERE (is_bot = 0 OR is_bot IS NULL)"
    params = []
    if search:
        where += " AND (display_name LIKE ? OR username LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
    rows = conn.execute(f"""
        SELECT id, display_name, username, avatar_color
        FROM users {where}
        ORDER BY id DESC LIMIT ?
    """, params + [limit]).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_predictions_for_bots(page: int = 1, per_page: int = 20, search: str = "") -> Dict:
    """Get community predictions for admin bot UI to browse and interact with."""
    cconn = sqlite3.connect("community.db")
    cconn.row_factory = sqlite3.Row
    cconn.execute("PRAGMA journal_mode=WAL")
    offset = (page - 1) * per_page

    where = "WHERE cp.visibility = 'public'"
    params = []
    if search:
        where += " AND (cp.display_name LIKE ? OR cp.team_a_name LIKE ? OR cp.team_b_name LIKE ? OR cp.predicted_result LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%"])

    total = cconn.execute(
        f"SELECT COUNT(*) as c FROM community_predictions cp {where}", params
    ).fetchone()["c"]

    rows = cconn.execute(f"""
        SELECT cp.id, cp.user_id, cp.display_name, cp.username, cp.avatar_color,
               cp.team_a_name, cp.team_b_name, cp.competition,
               cp.predicted_result, cp.analysis_summary, cp.created_at,
               COUNT(DISTINCT pc.id) as comment_count,
               SUM(CASE WHEN pr.reaction = 'like' THEN 1 ELSE 0 END) as likes,
               SUM(CASE WHEN pr.reaction = 'dislike' THEN 1 ELSE 0 END) as dislikes
        FROM community_predictions cp
        LEFT JOIN prediction_comments pc ON pc.prediction_id = cp.id
        LEFT JOIN prediction_reactions pr ON pr.prediction_id = cp.id
        {where}
        GROUP BY cp.id
        ORDER BY cp.created_at DESC
        LIMIT ? OFFSET ?
    """, params + [per_page, offset]).fetchall()

    cconn.close()

    predictions = [{
        "id": r["id"],
        "user_id": r["user_id"],
        "display_name": r["display_name"],
        "username": r["username"],
        "avatar_color": r["avatar_color"],
        "match_description": f"{r['team_a_name']} vs {r['team_b_name']} ({r['competition']})",
        "prediction_text": r["predicted_result"] or r["analysis_summary"] or "",
        "likes": r["likes"] or 0,
        "dislikes": r["dislikes"] or 0,
        "comment_count": r["comment_count"],
        "created_at": r["created_at"],
    } for r in rows]

    return {
        "predictions": predictions,
        "total": total,
        "page": page,
        "total_pages": (total + per_page - 1) // per_page if total > 0 else 1,
    }


# ─── Bot Heartbeat System ───

_bot_heartbeat_active = False


async def start_bot_heartbeats():
    """Background task: heartbeat all active bots every 60 seconds."""
    global _bot_heartbeat_active
    _bot_heartbeat_active = True
    while _bot_heartbeat_active:
        try:
            conn = _get_db()
            bots = conn.execute(
                "SELECT id, display_name, username, avatar_color FROM users WHERE is_bot = 1 AND is_active = 1"
            ).fetchall()
            conn.close()
            for bot in bots:
                community.record_heartbeat(
                    bot["id"], bot["display_name"], bot["username"], bot["avatar_color"]
                )
        except Exception:
            pass
        await asyncio.sleep(60)


def stop_bot_heartbeats():
    """Stop the background heartbeat loop."""
    global _bot_heartbeat_active
    _bot_heartbeat_active = False
