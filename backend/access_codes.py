"""
Access Code Management for Soccer Prediction AI
Handles code generation, verification, and expiry using SQLite.
"""

import sqlite3
import secrets
import string
from datetime import datetime, timedelta
from typing import Optional, List, Dict


DB_PATH = "access_codes.db"


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_access_db():
    """Create the access codes table if it doesn't exist."""
    conn = _get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS access_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            label TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            last_used TEXT,
            use_count INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    conn.close()


def generate_code(length=8) -> str:
    """Generate a random alphanumeric access code."""
    chars = string.ascii_uppercase + string.digits
    # Remove ambiguous characters (0/O, 1/I/L)
    chars = chars.replace("0", "").replace("O", "").replace("1", "").replace("I", "").replace("L", "")
    return "".join(secrets.choice(chars) for _ in range(length))


def create_access_code(days_valid: int = 30, label: str = "") -> Dict:
    """Create a new access code valid for N days."""
    conn = _get_db()
    code = generate_code()
    now = datetime.now()
    expires = now + timedelta(days=days_valid)

    conn.execute(
        "INSERT INTO access_codes (code, label, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (code, label, now.isoformat(), expires.isoformat()),
    )
    conn.commit()
    conn.close()

    return {
        "code": code,
        "label": label,
        "created_at": now.isoformat(),
        "expires_at": expires.isoformat(),
        "days_valid": days_valid,
    }


def verify_code(code: str) -> Dict:
    """Verify an access code. Returns status and info."""
    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM access_codes WHERE code = ?", (code.upper().strip(),)
    ).fetchone()

    if not row:
        conn.close()
        return {"valid": False, "reason": "Invalid access code"}

    if not row["is_active"]:
        conn.close()
        return {"valid": False, "reason": "This code has been revoked"}

    expires_at = datetime.fromisoformat(row["expires_at"])
    if datetime.now() > expires_at:
        conn.close()
        return {"valid": False, "reason": "This code has expired"}

    # Update last used and use count
    conn.execute(
        "UPDATE access_codes SET last_used = ?, use_count = use_count + 1 WHERE code = ?",
        (datetime.now().isoformat(), code.upper().strip()),
    )
    conn.commit()
    conn.close()

    return {
        "valid": True,
        "label": row["label"],
        "expires_at": row["expires_at"],
        "days_remaining": (expires_at - datetime.now()).days,
    }


def list_all_codes() -> List[Dict]:
    """List all access codes with their status."""
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM access_codes ORDER BY created_at DESC"
    ).fetchall()
    conn.close()

    codes = []
    for row in rows:
        expires_at = datetime.fromisoformat(row["expires_at"])
        is_expired = datetime.now() > expires_at
        codes.append({
            "id": row["id"],
            "code": row["code"],
            "label": row["label"],
            "created_at": row["created_at"],
            "expires_at": row["expires_at"],
            "is_active": bool(row["is_active"]),
            "is_expired": is_expired,
            "status": "expired" if is_expired else ("active" if row["is_active"] else "revoked"),
            "last_used": row["last_used"],
            "use_count": row["use_count"],
            "days_remaining": max(0, (expires_at - datetime.now()).days),
        })

    return codes


def revoke_code(code: str) -> bool:
    """Revoke an access code."""
    conn = _get_db()
    result = conn.execute(
        "UPDATE access_codes SET is_active = 0 WHERE code = ?", (code.upper().strip(),)
    )
    conn.commit()
    affected = result.rowcount
    conn.close()
    return affected > 0


def delete_code(code: str) -> bool:
    """Delete an access code permanently."""
    conn = _get_db()
    result = conn.execute(
        "DELETE FROM access_codes WHERE code = ?", (code.upper().strip(),)
    )
    conn.commit()
    affected = result.rowcount
    conn.close()
    return affected > 0
