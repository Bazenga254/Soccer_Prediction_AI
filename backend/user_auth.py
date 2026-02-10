"""
User Authentication System for Spark AI Prediction
Handles user registration, login, JWT tokens, and profiles using SQLite.
"""

import sqlite3
import hashlib
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

    if row and row["cnt"] >= 3:
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
    ]:
        try:
            conn.execute(col_sql)
        except sqlite3.OperationalError:
            pass  # Column already exists

    # Auto-verify all existing users (created before verification was required)
    conn.execute("""
        UPDATE users SET email_verified = 1
        WHERE email_verified = 0 AND verification_code IS NULL
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


def _generate_verification_code() -> str:
    """Generate a 6-digit numeric verification code."""
    return str(random.randint(100000, 999999))


def _get_zoho_access_token() -> str:
    """Get a fresh Zoho access token using the refresh token."""
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
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = _json.loads(resp.read().decode())
            return result.get("access_token", "")
    except Exception as e:
        print(f"[ERROR] Failed to get Zoho access token: {e}")
        return ""


def _send_zoho_email(to_email: str, subject: str, html_content: str, from_email: str = "") -> bool:
    """Send an email via Zoho Mail API (HTTPS). Bypasses SMTP port blocking."""
    account_id = os.environ.get("ZOHO_ACCOUNT_ID", "")
    if not from_email:
        from_email = os.environ.get("ZOHO_FROM_EMAIL", "")

    if not account_id or not from_email:
        print("[WARN] Zoho Mail API not configured - skipping email send")
        return False

    access_token = _get_zoho_access_token()
    if not access_token:
        return False

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
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = _json.loads(resp.read().decode())
            if result.get("status", {}).get("code") == 200:
                print(f"[OK] Email sent to {to_email}: {subject}")
                return True
            print(f"[ERROR] Zoho API error: {result}")
            return False
    except Exception as e:
        print(f"[ERROR] Failed to send email to {to_email}: {e}")
        return False


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


def google_login(google_token: str, referral_code: str = "", captcha_token: str = "", client_ip: str = "") -> Dict:
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
            return {"success": False, "error": "Account has been suspended"}

        now = datetime.now().isoformat()
        # Auto-verify if logging in with Google, update IP
        conn.execute(
            "UPDATE users SET last_login = ?, login_count = login_count + 1, email_verified = 1, last_known_ip = ? WHERE id = ?",
            (now, client_ip or None, existing["id"]),
        )
        conn.commit()
        conn.close()

        token = _create_token(existing["id"], existing["username"], existing["tier"], bool(existing["is_admin"]))
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
            },
        }
    else:
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

        conn.execute(
            """INSERT INTO users (email, password_hash, display_name, username, avatar_color,
               referral_code, referred_by, created_at, email_verified)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)""",
            (email, password_hash, display_name, username, avatar_color, ref_code, referred_by, now),
        )
        conn.commit()

        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        conn.close()

        # Send welcome email to new Google user
        _send_welcome_email(email, display_name)

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
                "avatar_url": user["avatar_url"],
                "tier": user["tier"],
                "referral_code": user["referral_code"],
                "is_admin": bool(user["is_admin"]),
                "created_at": user["created_at"],
            },
        }


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
            _send_verification_email(email, code, display_name or email.split("@")[0])
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

    # Send verification email
    _send_verification_email(email, code, display_name)

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
        return {"success": False, "error": "Account has been suspended"}

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
        _send_verification_email(email, code, user["display_name"])
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
            "avatar_url": user["avatar_url"],
            "tier": user["tier"],
            "referral_code": user["referral_code"],
            "is_admin": bool(user["is_admin"]),
            "created_at": user["created_at"],
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
        return {"success": False, "error": "Too many failed attempts. Request a new code."}

    # Check expiry
    expires = user["verification_code_expires"]
    if not expires or datetime.fromisoformat(expires) < datetime.now():
        conn.close()
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
            "avatar_url": user["avatar_url"],
            "tier": user["tier"],
            "referral_code": user["referral_code"],
            "is_admin": bool(user["is_admin"]),
            "created_at": user["created_at"],
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

    _send_verification_email(email, code, user["display_name"])

    return {"success": True, "message": "A new verification code has been sent to your email."}


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
        "avatar_url": user["avatar_url"],
        "tier": user["tier"],
        "referral_code": user["referral_code"],
        "is_admin": bool(user["is_admin"]),
        "created_at": user["created_at"],
    }


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
