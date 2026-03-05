"""
Promotional Packages module.
Manages promo codes that allow users to register without activation fee
and receive time-limited Pro tier access.
"""

import sqlite3
import secrets
import string
from datetime import datetime, timedelta
from typing import Optional, Dict, List

DB_PATH = "users.db"


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_promo_db():
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS promotional_packages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            pro_days INTEGER NOT NULL,
            max_slots INTEGER NOT NULL,
            used_slots INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            expires_at TEXT DEFAULT NULL,
            created_by TEXT DEFAULT 'admin',
            description TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS promo_registrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            promo_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            registered_at TEXT NOT NULL,
            UNIQUE(promo_id, user_id)
        );
    """)
    conn.commit()
    conn.close()
    print("[OK] Promotional packages DB initialized")


def generate_promo_code(length=6) -> str:
    """Generate a unique promo code like PRM-X4K9N2."""
    chars = string.ascii_uppercase + string.digits
    # Remove ambiguous characters
    chars = chars.replace("0", "").replace("O", "").replace("I", "").replace("1", "").replace("L", "")
    while True:
        code = "PRM-" + "".join(secrets.choice(chars) for _ in range(length))
        conn = _get_db()
        exists = conn.execute("SELECT 1 FROM promotional_packages WHERE code = ?", (code,)).fetchone()
        conn.close()
        if not exists:
            return code


def create_promo(name: str, pro_days: int, max_slots: int,
                 code: str = None, expires_at: str = None,
                 description: str = "", created_by: str = "admin") -> Dict:
    """Create a new promotional package."""
    if not code:
        code = generate_promo_code()
    else:
        code = code.strip().upper()

    conn = _get_db()
    try:
        conn.execute(
            """INSERT INTO promotional_packages
               (code, name, pro_days, max_slots, is_active, created_at, expires_at, created_by, description)
               VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)""",
            (code, name.strip(), pro_days, max_slots,
             datetime.now().isoformat(), expires_at or None,
             created_by, description.strip())
        )
        conn.commit()
        promo_id = conn.execute("SELECT id FROM promotional_packages WHERE code = ?", (code,)).fetchone()["id"]
    except sqlite3.IntegrityError:
        conn.close()
        return {"success": False, "error": "A promo with this code already exists"}
    conn.close()

    return {
        "success": True,
        "id": promo_id,
        "code": code,
        "name": name.strip(),
        "pro_days": pro_days,
        "max_slots": max_slots,
        "link": f"https://spark-ai-prediction.com/register?promo={code}",
    }


def validate_promo(code: str) -> Dict:
    """Validate a promo code for use during registration."""
    conn = _get_db()
    promo = conn.execute(
        "SELECT * FROM promotional_packages WHERE UPPER(code) = UPPER(?)", (code.strip(),)
    ).fetchone()
    conn.close()

    if not promo:
        return {"valid": False, "error": "Invalid promo code"}

    if not promo["is_active"]:
        return {"valid": False, "error": "This promotion is no longer active"}

    if promo["used_slots"] >= promo["max_slots"]:
        return {"valid": False, "error": "This promotion has reached its maximum capacity"}

    if promo["expires_at"]:
        try:
            exp = datetime.fromisoformat(promo["expires_at"])
            if datetime.now() > exp:
                return {"valid": False, "error": "This promotion has expired"}
        except ValueError:
            pass

    return {
        "valid": True,
        "promo": {
            "id": promo["id"],
            "code": promo["code"],
            "name": promo["name"],
            "pro_days": promo["pro_days"],
            "max_slots": promo["max_slots"],
            "used_slots": promo["used_slots"],
            "remaining_slots": promo["max_slots"] - promo["used_slots"],
        }
    }


def redeem_promo(code: str, user_id: int) -> Dict:
    """Redeem a promo code for a user. Atomic slot increment."""
    import user_auth

    conn = _get_db()
    try:
        # Atomic increment — only succeeds if slots remain
        cursor = conn.execute(
            """UPDATE promotional_packages
               SET used_slots = used_slots + 1
               WHERE UPPER(code) = UPPER(?) AND is_active = 1 AND used_slots < max_slots""",
            (code.strip(),)
        )
        if cursor.rowcount == 0:
            conn.close()
            return {"success": False, "error": "Promo code is no longer available"}

        promo = conn.execute(
            "SELECT * FROM promotional_packages WHERE UPPER(code) = UPPER(?)", (code.strip(),)
        ).fetchone()

        # Record the registration
        conn.execute(
            "INSERT OR IGNORE INTO promo_registrations (promo_id, user_id, registered_at) VALUES (?, ?, ?)",
            (promo["id"], user_id, datetime.now().isoformat())
        )

        # Mark user with promo code
        conn.execute(
            "UPDATE users SET promo_code_used = ? WHERE id = ?",
            (promo["code"], user_id)
        )

        # Auto-disable if full
        if promo["used_slots"] >= promo["max_slots"]:
            conn.execute(
                "UPDATE promotional_packages SET is_active = 0 WHERE id = ?",
                (promo["id"],)
            )

        conn.commit()
        conn.close()

        # Set pro tier with duration
        user_auth.set_user_tier(user_id, "pro", days=promo["pro_days"])

        # Grant daily credits (same as subscribers)
        try:
            import community
            import pricing_config
            daily_amount = int(pricing_config.get("daily_credits_subscriber", 2000))
            community.refresh_daily_credits(user_id, daily_amount)
            print(f"[Promo] Granted {daily_amount} daily credits to user {user_id}")
        except Exception as e:
            print(f"[Promo] Warning: could not grant credits to user {user_id}: {e}")

        return {
            "success": True,
            "pro_days": promo["pro_days"],
            "remaining_slots": promo["max_slots"] - promo["used_slots"],
        }

    except Exception as e:
        conn.close()
        return {"success": False, "error": str(e)}


def toggle_promo(promo_id: int, is_active: bool) -> Dict:
    """Activate or deactivate a promo."""
    conn = _get_db()
    conn.execute(
        "UPDATE promotional_packages SET is_active = ? WHERE id = ?",
        (1 if is_active else 0, promo_id)
    )
    conn.commit()
    conn.close()
    return {"success": True}


def list_all_promos() -> List[Dict]:
    """Return all promos with stats."""
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM promotional_packages ORDER BY created_at DESC"
    ).fetchall()
    conn.close()

    promos = []
    for r in rows:
        remaining = r["max_slots"] - r["used_slots"]
        status = "active"
        if not r["is_active"]:
            status = "disabled"
        elif r["used_slots"] >= r["max_slots"]:
            status = "full"
        elif r["expires_at"]:
            try:
                if datetime.now() > datetime.fromisoformat(r["expires_at"]):
                    status = "expired"
            except ValueError:
                pass

        promos.append({
            "id": r["id"],
            "code": r["code"],
            "name": r["name"],
            "pro_days": r["pro_days"],
            "max_slots": r["max_slots"],
            "used_slots": r["used_slots"],
            "remaining_slots": remaining,
            "is_active": bool(r["is_active"]),
            "status": status,
            "created_at": r["created_at"],
            "expires_at": r["expires_at"],
            "created_by": r["created_by"],
            "description": r["description"],
            "link": f"https://spark-ai-prediction.com/register?promo={r['code']}",
        })

    return promos


def delete_promo(promo_id: int) -> Dict:
    """Delete a promotional package."""
    conn = _get_db()
    conn.execute("DELETE FROM promo_registrations WHERE promo_id = ?", (promo_id,))
    conn.execute("DELETE FROM promotional_packages WHERE id = ?", (promo_id,))
    conn.commit()
    conn.close()
    return {"success": True}


def get_promo_public_info(code: str) -> Optional[Dict]:
    """Return safe public info for a promo code."""
    conn = _get_db()
    promo = conn.execute(
        "SELECT * FROM promotional_packages WHERE UPPER(code) = UPPER(?)", (code.strip(),)
    ).fetchone()
    conn.close()

    if not promo:
        return None

    remaining = promo["max_slots"] - promo["used_slots"]
    is_available = bool(promo["is_active"]) and remaining > 0

    if promo["expires_at"]:
        try:
            if datetime.now() > datetime.fromisoformat(promo["expires_at"]):
                is_available = False
        except ValueError:
            pass

    return {
        "name": promo["name"],
        "pro_days": promo["pro_days"],
        "max_slots": promo["max_slots"],
        "remaining_slots": remaining,
        "is_available": is_available,
    }
