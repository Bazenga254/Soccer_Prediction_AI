"""
User Authentication System for Spark AI Prediction
Handles user registration, login, JWT tokens, and profiles using SQLite.
"""

import sqlite3
import hashlib
import secrets
import random
import string
import jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, List

DB_PATH = "users.db"
JWT_SECRET = None  # Set on startup from env


def _get_jwt_secret():
    global JWT_SECRET
    if JWT_SECRET is None:
        import os
        JWT_SECRET = os.environ.get("JWT_SECRET", "spark-ai-default-secret-change-me")
    return JWT_SECRET


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


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
    """)
    conn.commit()
    conn.close()


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


def _create_token(user_id: int, username: str, tier: str, is_admin: bool) -> str:
    """Create a JWT token."""
    payload = {
        "user_id": user_id,
        "username": username,
        "tier": tier,
        "is_admin": is_admin,
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


# --- API Functions ---

AVATAR_COLORS = [
    "#6c5ce7", "#00b894", "#e17055", "#0984e3", "#fdcb6e",
    "#e84393", "#00cec9", "#d63031", "#a29bfe", "#55efc4",
    "#fab1a0", "#74b9ff", "#ffeaa7", "#fd79a8", "#81ecec",
]


def register_user(email: str, password: str, display_name: str = "", referral_code: str = "") -> Dict:
    """Register a new user."""
    email = email.lower().strip()

    if len(password) < 6:
        return {"success": False, "error": "Password must be at least 6 characters"}

    if not email or "@" not in email:
        return {"success": False, "error": "Valid email is required"}

    conn = _get_db()

    # Check if email exists
    existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        conn.close()
        return {"success": False, "error": "Email already registered"}

    username = _generate_unique_username(conn)
    password_hash = _hash_password(password)
    ref_code = _generate_referral_code()
    avatar_color = random.choice(AVATAR_COLORS)
    now = datetime.now().isoformat()

    if not display_name:
        display_name = username

    # Check referral
    referred_by = None
    if referral_code:
        referrer = conn.execute(
            "SELECT id FROM users WHERE referral_code = ?", (referral_code.upper().strip(),)
        ).fetchone()
        if referrer:
            referred_by = referrer["id"]

    conn.execute(
        """INSERT INTO users (email, password_hash, display_name, username, avatar_color,
           referral_code, referred_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (email, password_hash, display_name, username, avatar_color, ref_code, referred_by, now),
    )
    conn.commit()

    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()

    token = _create_token(user["id"], user["username"], user["tier"], bool(user["is_admin"]))

    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "display_name": user["display_name"],
            "username": user["username"],
            "avatar_color": user["avatar_color"],
            "tier": user["tier"],
            "referral_code": user["referral_code"],
            "is_admin": bool(user["is_admin"]),
            "created_at": user["created_at"],
        },
    }


def login_user(email: str, password: str) -> Dict:
    """Login an existing user."""
    email = email.lower().strip()
    conn = _get_db()

    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user:
        conn.close()
        return {"success": False, "error": "Invalid email or password"}

    if not user["is_active"]:
        conn.close()
        return {"success": False, "error": "Account has been suspended"}

    if not _verify_password(password, user["password_hash"]):
        conn.close()
        return {"success": False, "error": "Invalid email or password"}

    # Update login stats
    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE users SET last_login = ?, login_count = login_count + 1 WHERE id = ?",
        (now, user["id"]),
    )
    conn.commit()
    conn.close()

    token = _create_token(user["id"], user["username"], user["tier"], bool(user["is_admin"]))

    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "display_name": user["display_name"],
            "username": user["username"],
            "avatar_color": user["avatar_color"],
            "tier": user["tier"],
            "referral_code": user["referral_code"],
            "is_admin": bool(user["is_admin"]),
            "created_at": user["created_at"],
        },
    }


def get_user_profile(user_id: int) -> Optional[Dict]:
    """Get user profile by ID."""
    conn = _get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if not user:
        return None
    return {
        "id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"],
        "username": user["username"],
        "avatar_color": user["avatar_color"],
        "tier": user["tier"],
        "referral_code": user["referral_code"],
        "is_admin": bool(user["is_admin"]),
        "created_at": user["created_at"],
    }


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

    conn.execute("UPDATE users SET username = ? WHERE id = ?", (new_username, user_id))
    conn.commit()
    conn.close()
    return {"success": True, "username": new_username}


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
        "referral_code": r["referral_code"],
        "referred_by": r["referred_by"],
        "created_at": r["created_at"],
        "last_login": r["last_login"],
        "login_count": r["login_count"],
    } for r in rows]


def toggle_user_active(user_id: int, is_active: bool) -> bool:
    """Activate or deactivate a user (admin only)."""
    conn = _get_db()
    conn.execute("UPDATE users SET is_active = ? WHERE id = ?", (1 if is_active else 0, user_id))
    conn.commit()
    conn.close()
    return True


def set_user_tier(user_id: int, tier: str) -> bool:
    """Set user tier: 'free' or 'pro' (admin only)."""
    if tier not in ("free", "pro"):
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
