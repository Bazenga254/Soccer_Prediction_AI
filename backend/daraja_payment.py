"""
Daraja M-Pesa Integration for Spark AI Prediction
Direct Safaricom Daraja API for STK Push (Lipa Na M-Pesa Online) deposits.
Replaces Swypt crypto on/off-ramp with direct M-Pesa via Paybill.
KES amounts are converted to USD using live exchange rates + 6% markup.
"""

import os
import uuid
import random
import base64
import sqlite3
import aiohttp
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List

import community
import subscriptions
import ipaddress

logger = logging.getLogger(__name__)

# System event logger for admin visibility
def _log_system_event(action, module, details=None, user_id=0, target_type=None, target_id=None, severity="error"):
    """Log payment system events to activity_logs for admin/HOD visibility."""
    try:
        import activity_logger
        activity_logger.log_system_event(
            action=action, module=module, details=details,
            user_id=user_id, target_type=target_type, target_id=target_id,
            severity=severity,
        )
    except Exception as e:
        print(f"[WARN] Could not log system event: {e}")

# Safaricom IP ranges (official Daraja callback source IPs)
# See: https://developer.safaricom.co.ke/Documentation
SAFARICOM_IP_RANGES = [
    ipaddress.ip_network("196.201.214.0/24"),
    ipaddress.ip_network("196.201.212.0/24"),
    ipaddress.ip_network("196.201.213.0/24"),
    ipaddress.ip_network("41.215.136.0/24"),
    ipaddress.ip_network("41.215.137.0/24"),
    # Sandbox IPs
    ipaddress.ip_network("104.154.0.0/16"),
    ipaddress.ip_network("35.190.0.0/16"),
    ipaddress.ip_network("35.240.0.0/16"),
]


def is_safaricom_ip(ip_str: str) -> bool:
    """Check if an IP address belongs to Safaricom's known ranges."""
    try:
        ip = ipaddress.ip_address(ip_str.strip())
        return any(ip in network for network in SAFARICOM_IP_RANGES)
    except (ValueError, AttributeError):
        return False

DB_PATH = "community.db"

# Daraja API configuration
DARAJA_ENV = os.environ.get("DARAJA_ENV", "sandbox")
DARAJA_BASE_URL = (
    "https://sandbox.safaricom.co.ke"
    if DARAJA_ENV == "sandbox"
    else "https://api.safaricom.co.ke"
)
DARAJA_CONSUMER_KEY = os.environ.get("DARAJA_CONSUMER_KEY", "")
DARAJA_CONSUMER_SECRET = os.environ.get("DARAJA_CONSUMER_SECRET", "")
DARAJA_SHORTCODE = os.environ.get("DARAJA_SHORTCODE", "")
DARAJA_PASSKEY = os.environ.get("DARAJA_PASSKEY", "")
DARAJA_CALLBACK_URL = os.environ.get("DARAJA_CALLBACK_URL", "")

# B2C (Business to Customer) configuration for disbursements
# B2C can use a separate Daraja app with its own consumer key/secret
DARAJA_B2C_CONSUMER_KEY = os.environ.get("DARAJA_B2C_CONSUMER_KEY", "")
DARAJA_B2C_CONSUMER_SECRET = os.environ.get("DARAJA_B2C_CONSUMER_SECRET", "")
DARAJA_B2C_SHORTCODE = os.environ.get("DARAJA_B2C_SHORTCODE", "600000")
DARAJA_B2C_INITIATOR_NAME = os.environ.get("DARAJA_B2C_INITIATOR_NAME", "testapi")
DARAJA_B2C_INITIATOR_PASSWORD = os.environ.get("DARAJA_B2C_INITIATOR_PASSWORD", "")
DARAJA_B2C_RESULT_URL = os.environ.get("DARAJA_B2C_RESULT_URL", "")
DARAJA_B2C_TIMEOUT_URL = os.environ.get("DARAJA_B2C_TIMEOUT_URL", "")
DARAJA_B2C_SECURITY_CREDENTIAL = os.environ.get("DARAJA_B2C_SECURITY_CREDENTIAL", "")

MINIMUM_WITHDRAWAL_USD = 10.0
DISBURSEMENT_THRESHOLD_KES = 1000

# Twilio SMS OTP for phone verification
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "")

# Withdrawal option security
WITHDRAWAL_COOLDOWN_HOURS = 48
PHONE_OTP_EXPIRY_MINUTES = 10
PHONE_OTP_MAX_ATTEMPTS = 5

# Exchange rate cache
_exchange_rate_cache = {"rate": None, "fetched_at": None}
EXCHANGE_RATE_CACHE_TTL = 3600  # 1 hour
EXCHANGE_RATE_MARKUP = 0.06     # 6% markup — covers Daraja fees + processing

# Daraja access token cache
_daraja_token_cache = {"token": None, "expires_at": None}
_daraja_b2c_token_cache = {"token": None, "expires_at": None}


def _get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_payment_db():
    """Create payment-related tables with Daraja fields."""
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS payment_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            transaction_type TEXT NOT NULL,
            reference_id TEXT DEFAULT '',
            amount_kes REAL NOT NULL,
            amount_usd REAL NOT NULL,
            exchange_rate REAL NOT NULL,
            phone_number TEXT NOT NULL,
            swypt_order_id TEXT DEFAULT '',
            daraja_checkout_id TEXT DEFAULT '',
            daraja_merchant_id TEXT DEFAULT '',
            mpesa_receipt TEXT DEFAULT '',
            payment_status TEXT DEFAULT 'pending',
            failure_reason TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS withdrawal_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount_usd REAL NOT NULL,
            amount_kes REAL NOT NULL,
            exchange_rate REAL NOT NULL,
            phone_number TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            admin_notes TEXT DEFAULT '',
            swypt_order_id TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT,
            completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_pt_user ON payment_transactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_pt_status ON payment_transactions(payment_status);
        CREATE INDEX IF NOT EXISTS idx_pt_order ON payment_transactions(swypt_order_id);
        CREATE INDEX IF NOT EXISTS idx_wr_user ON withdrawal_requests(user_id);
        CREATE INDEX IF NOT EXISTS idx_wr_status ON withdrawal_requests(status);
    """)
    conn.commit()

    # Migration for existing installs — add new columns before creating indexes on them
    migration_cols = [
        "ALTER TABLE withdrawal_requests ADD COLUMN withdrawal_method TEXT DEFAULT 'mpesa'",
        "ALTER TABLE withdrawal_requests ADD COLUMN whop_transfer_id TEXT DEFAULT ''",
        "ALTER TABLE withdrawal_requests ADD COLUMN whop_user_id TEXT DEFAULT ''",
        "ALTER TABLE payment_transactions ADD COLUMN daraja_checkout_id TEXT DEFAULT ''",
        "ALTER TABLE payment_transactions ADD COLUMN daraja_merchant_id TEXT DEFAULT ''",
        "ALTER TABLE payment_transactions ADD COLUMN mpesa_receipt TEXT DEFAULT ''",
        "ALTER TABLE payment_transactions ADD COLUMN failure_reason TEXT DEFAULT ''",
        # Columns added when switching from Swypt to Daraja — may be absent on
        # production databases that were initialised with the old schema.
        "ALTER TABLE payment_transactions ADD COLUMN amount_usd REAL DEFAULT 0",
        "ALTER TABLE payment_transactions ADD COLUMN exchange_rate REAL DEFAULT 0",
        "ALTER TABLE payment_transactions ADD COLUMN reference_id TEXT DEFAULT ''",
        "ALTER TABLE payment_transactions ADD COLUMN completed_at TEXT",
    ]
    for col_sql in migration_cols:
        try:
            conn.execute(col_sql)
        except Exception:
            pass  # Column already exists
    conn.commit()

    # Create daraja index after migration ensures the column exists
    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pt_daraja ON payment_transactions(daraja_checkout_id)")
        conn.commit()
    except Exception:
        pass

    # B2C Disbursement tables
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS disbursement_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_date TEXT NOT NULL,
            total_users INTEGER DEFAULT 0,
            total_amount_usd REAL DEFAULT 0,
            total_amount_kes REAL DEFAULT 0,
            exchange_rate REAL DEFAULT 0,
            status TEXT DEFAULT 'pending',
            admin_approved_by INTEGER,
            admin_notes TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            approved_at TEXT,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS disbursement_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id INTEGER NOT NULL REFERENCES disbursement_batches(id),
            user_id INTEGER NOT NULL,
            phone TEXT NOT NULL,
            amount_usd REAL NOT NULL,
            amount_kes REAL NOT NULL,
            exchange_rate REAL NOT NULL,
            b2c_conversation_id TEXT DEFAULT '',
            b2c_originator_conversation_id TEXT DEFAULT '',
            b2c_transaction_id TEXT DEFAULT '',
            mpesa_receipt TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            failure_reason TEXT DEFAULT '',
            retry_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            sent_at TEXT,
            completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_db_status ON disbursement_batches(status);
        CREATE INDEX IF NOT EXISTS idx_db_date ON disbursement_batches(batch_date);
        CREATE INDEX IF NOT EXISTS idx_di_batch ON disbursement_items(batch_id);
        CREATE INDEX IF NOT EXISTS idx_di_user ON disbursement_items(user_id);
        CREATE INDEX IF NOT EXISTS idx_di_status ON disbursement_items(status);
        CREATE INDEX IF NOT EXISTS idx_di_conv ON disbursement_items(b2c_conversation_id);

        CREATE TABLE IF NOT EXISTS withdrawal_options (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            method TEXT NOT NULL,
            mpesa_phone TEXT DEFAULT '',
            mpesa_phone_verified INTEGER DEFAULT 0,
            whop_user_id TEXT DEFAULT '',
            is_active INTEGER DEFAULT 1,
            is_primary INTEGER DEFAULT 0,
            cooldown_until TEXT,
            phone_otp_code TEXT DEFAULT '',
            phone_otp_expires TEXT,
            phone_otp_attempts INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            UNIQUE(user_id, method)
        );

        CREATE INDEX IF NOT EXISTS idx_wo_user ON withdrawal_options(user_id);
        CREATE INDEX IF NOT EXISTS idx_wo_method ON withdrawal_options(method);
    """)
    conn.commit()

    # Migration for disbursement tables — add method-aware columns
    disb_migrations = [
        "ALTER TABLE disbursement_items ADD COLUMN withdrawal_method TEXT DEFAULT 'mpesa'",
        "ALTER TABLE disbursement_items ADD COLUMN whop_user_id TEXT DEFAULT ''",
        "ALTER TABLE disbursement_items ADD COLUMN whop_transfer_id TEXT DEFAULT ''",
        "ALTER TABLE disbursement_batches ADD COLUMN total_mpesa_users INTEGER DEFAULT 0",
        "ALTER TABLE disbursement_batches ADD COLUMN total_whop_users INTEGER DEFAULT 0",
    ]
    for sql in disb_migrations:
        try:
            conn.execute(sql)
        except Exception:
            pass
    conn.commit()
    conn.close()


# ==================== DARAJA AUTH ====================

async def _get_daraja_token() -> str:
    """Get OAuth 2.0 access token from Daraja API. Cached until near expiry."""
    if (_daraja_token_cache["token"] and _daraja_token_cache["expires_at"]
            and datetime.now() < _daraja_token_cache["expires_at"]):
        return _daraja_token_cache["token"]

    credentials = base64.b64encode(
        f"{DARAJA_CONSUMER_KEY}:{DARAJA_CONSUMER_SECRET}".encode()
    ).decode()

    _timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=_timeout) as session:
        async with session.get(
            f"{DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials",
            headers={"Authorization": f"Basic {credentials}"},
        ) as resp:
            data = await resp.json(content_type=None)
            if "access_token" not in data:
                err = data.get("errorMessage") or data.get("error_description") or f"HTTP {resp.status}"
                raise Exception(f"Daraja auth failed: {err}")
            token = data["access_token"]
            _daraja_token_cache["token"] = token
            _daraja_token_cache["expires_at"] = datetime.now() + timedelta(seconds=3500)
            return token


async def _get_b2c_token() -> str:
    """Get OAuth token for B2C app. Falls back to main token if no separate B2C credentials."""
    if not DARAJA_B2C_CONSUMER_KEY or not DARAJA_B2C_CONSUMER_SECRET:
        return await _get_daraja_token()

    if (_daraja_b2c_token_cache["token"] and _daraja_b2c_token_cache["expires_at"]
            and datetime.now() < _daraja_b2c_token_cache["expires_at"]):
        return _daraja_b2c_token_cache["token"]

    credentials = base64.b64encode(
        f"{DARAJA_B2C_CONSUMER_KEY}:{DARAJA_B2C_CONSUMER_SECRET}".encode()
    ).decode()

    _timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=_timeout) as session:
        async with session.get(
            f"{DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials",
            headers={"Authorization": f"Basic {credentials}"},
        ) as resp:
            data = await resp.json(content_type=None)
            if "access_token" not in data:
                err = data.get("errorMessage") or data.get("error_description") or f"HTTP {resp.status}"
                raise Exception(f"Daraja B2C auth failed: {err}")
            token = data["access_token"]
            _daraja_b2c_token_cache["token"] = token
            _daraja_b2c_token_cache["expires_at"] = datetime.now() + timedelta(seconds=3500)
            return token


# ==================== EXCHANGE RATES ====================

async def _fetch_exchange_rate() -> float:
    """Fetch live KES/USD exchange rate. Cached for 1 hour."""
    now = datetime.now()
    if (_exchange_rate_cache["rate"] and _exchange_rate_cache["fetched_at"]
            and (now - _exchange_rate_cache["fetched_at"]).total_seconds() < EXCHANGE_RATE_CACHE_TTL):
        return _exchange_rate_cache["rate"]

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://open.er-api.com/v6/latest/USD",
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                data = await resp.json(content_type=None)
                if data.get("result") == "success":
                    rate = data["rates"]["KES"]
                    _exchange_rate_cache["rate"] = rate
                    _exchange_rate_cache["fetched_at"] = now
                    logger.info(f"Exchange rate updated: 1 USD = {rate} KES")
                    return rate
    except Exception as e:
        logger.warning(f"Exchange rate fetch failed: {e}")

    return _exchange_rate_cache.get("rate") or 130.0


def _apply_markup(rate: float) -> float:
    """Apply 6% markup. Higher rate = user pays more KES per USD."""
    return round(rate * (1 + EXCHANGE_RATE_MARKUP), 2)


async def get_kes_to_usd_quote(amount_kes: float) -> Dict:
    """Convert KES to USD with 6% markup (for deposits)."""
    try:
        base_rate = await _fetch_exchange_rate()
        marked_up_rate = _apply_markup(base_rate)
        amount_usd = round(amount_kes / marked_up_rate, 2)
        return {
            "success": True,
            "amount_kes": amount_kes,
            "amount_usd": amount_usd,
            "exchange_rate": marked_up_rate,
            "base_rate": base_rate,
            "fee": {"markup_percent": EXCHANGE_RATE_MARKUP * 100},
        }
    except Exception as e:
        return {"success": False, "error": f"Exchange rate unavailable: {str(e)}"}


async def get_usd_to_kes_quote(amount_usd: float) -> Dict:
    """Convert USD to KES with 6% markup (for withdrawal display)."""
    try:
        base_rate = await _fetch_exchange_rate()
        withdrawal_rate = round(base_rate * (1 - EXCHANGE_RATE_MARKUP), 2)
        amount_kes = round(amount_usd * withdrawal_rate, 2)
        return {
            "success": True,
            "amount_usd": amount_usd,
            "amount_kes": amount_kes,
            "exchange_rate": withdrawal_rate,
            "base_rate": base_rate,
            "fee": {"markup_percent": EXCHANGE_RATE_MARKUP * 100},
        }
    except Exception as e:
        return {"success": False, "error": f"Exchange rate unavailable: {str(e)}"}


# ==================== STK PUSH (DEPOSITS) ====================

async def initiate_stk_push(
    phone: str,
    amount_kes: float,
    user_id: int,
    transaction_type: str,
    reference_id: str = "",
) -> Dict:
    """Initiate M-Pesa STK push via Daraja Lipa Na M-Pesa Online."""
    if not DARAJA_CONSUMER_KEY or not DARAJA_SHORTCODE:
        return {"success": False, "error": "Payment system not configured"}

    quote = await get_kes_to_usd_quote(amount_kes)
    if not quote["success"]:
        return quote

    now = datetime.now()
    timestamp = now.strftime("%Y%m%d%H%M%S")

    # Daraja password: base64(shortcode + passkey + timestamp)
    password = base64.b64encode(
        f"{DARAJA_SHORTCODE}{DARAJA_PASSKEY}{timestamp}".encode()
    ).decode()

    try:
        # Create transaction record first — inside try so a schema error returns
        # a clean 400 rather than crashing the route handler with a 500.
        conn = _get_db()
        cursor = conn.execute("""
            INSERT INTO payment_transactions
                (user_id, transaction_type, reference_id, amount_kes, amount_usd,
                 exchange_rate, phone_number, payment_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        """, (
            user_id, transaction_type, reference_id,
            amount_kes, quote["amount_usd"], quote["exchange_rate"],
            phone, now.isoformat(), now.isoformat(),
        ))
        transaction_id = cursor.lastrowid
        conn.commit()
        conn.close()

        token = await _get_daraja_token()
        _timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=_timeout) as session:
            async with session.post(
                f"{DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest",
                json={
                    "BusinessShortCode": DARAJA_SHORTCODE,
                    "Password": password,
                    "Timestamp": timestamp,
                    "TransactionType": "CustomerPayBillOnline",
                    "Amount": int(amount_kes),
                    "PartyA": phone,
                    "PartyB": DARAJA_SHORTCODE,
                    "PhoneNumber": phone,
                    "CallBackURL": DARAJA_CALLBACK_URL,
                    "AccountReference": f"SparkAI-{transaction_id}",
                    "TransactionDesc": f"Spark AI {transaction_type}",
                },
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            ) as resp:
                data = await resp.json(content_type=None)

                if resp.status == 200 and data.get("ResponseCode") == "0":
                    checkout_request_id = data.get("CheckoutRequestID", "")
                    merchant_request_id = data.get("MerchantRequestID", "")

                    conn = _get_db()
                    conn.execute("""
                        UPDATE payment_transactions
                        SET daraja_checkout_id = ?, daraja_merchant_id = ?,
                            payment_status = 'stk_sent', updated_at = ?
                        WHERE id = ?
                    """, (checkout_request_id, merchant_request_id,
                          datetime.now().isoformat(), transaction_id))
                    conn.commit()
                    conn.close()

                    return {
                        "success": True,
                        "transaction_id": transaction_id,
                        "checkout_request_id": checkout_request_id,
                        "amount_kes": amount_kes,
                        "amount_usd": quote["amount_usd"],
                        "message": "Check your phone for the M-Pesa prompt",
                    }
                else:
                    error_msg = data.get("errorMessage") or data.get("ResponseDescription") or "STK push failed"
                    conn = _get_db()
                    conn.execute("""
                        UPDATE payment_transactions
                        SET payment_status = 'failed', failure_reason = ?, updated_at = ?
                        WHERE id = ?
                    """, (error_msg, datetime.now().isoformat(), transaction_id))
                    conn.commit()
                    conn.close()
                    _log_system_event(
                        action="stk_push_failed",
                        module="payments",
                        details={"transaction_id": transaction_id, "phone": phone, "amount_kes": amount_kes, "error": error_msg},
                        user_id=user_id,
                        severity="error",
                    )
                    return {"success": False, "error": error_msg}

    except Exception as e:
        tx_id = locals().get("transaction_id")
        logger.error(f"STK push failed for tx={tx_id}: {e}", exc_info=True)
        if tx_id:
            try:
                conn = _get_db()
                conn.execute("""
                    UPDATE payment_transactions
                    SET payment_status = 'failed', failure_reason = ?, updated_at = ?
                    WHERE id = ?
                """, (str(e), datetime.now().isoformat(), tx_id))
                conn.commit()
                conn.close()
            except Exception:
                pass
        _log_system_event(
            action="stk_push_exception",
            module="payments",
            details={"transaction_id": tx_id, "phone": phone, "amount_kes": amount_kes, "error": str(e)},
            user_id=user_id,
            severity="error",
        )
        return {"success": False, "error": f"Payment service unavailable: {str(e)}"}


# ==================== CALLBACK HANDLER ====================

async def _verify_payment_with_safaricom(checkout_id: str) -> dict:
    """Cross-verify a payment callback by querying Safaricom STK status API.
    Returns {'verified': True/False, 'result_code': int|None}."""
    try:
        result = await _query_stk_status(checkout_id)
        if result.get("completed"):
            return {"verified": True, "result_code": 0}
        elif result.get("failed"):
            return {"verified": True, "result_code": 1}
        return {"verified": False, "result_code": None}
    except Exception as e:
        logger.warning(f"Safaricom verification failed for {checkout_id}: {e}")
        return {"verified": False, "result_code": None}


async def handle_stk_callback(callback_data: dict, client_ip: str = "") -> Dict:
    """Process Daraja STK Push callback when payment completes or fails.
    Validates source IP and cross-verifies successful payments with Safaricom."""
    try:
        # Security: validate callback source IP
        if client_ip and not is_safaricom_ip(client_ip):
            logger.warning(f"M-Pesa callback from UNTRUSTED IP: {client_ip}")
            # Don't reject outright (IP ranges may change), but flag and verify
            # For successful payments, we MUST cross-verify with Safaricom

        stk_callback = callback_data.get("Body", {}).get("stkCallback", {})
        checkout_id = stk_callback.get("CheckoutRequestID", "")
        result_code = stk_callback.get("ResultCode")
        result_desc = stk_callback.get("ResultDesc", "")

        if not checkout_id:
            logger.warning("Daraja callback missing CheckoutRequestID")
            return {"success": False, "error": "Missing checkout ID"}

        conn = _get_db()
        tx = conn.execute(
            "SELECT * FROM payment_transactions WHERE daraja_checkout_id = ?",
            (checkout_id,)
        ).fetchone()

        if not tx:
            conn.close()
            logger.warning(f"Daraja callback: no transaction for checkout {checkout_id}")
            return {"success": False, "error": "Transaction not found"}

        # Already processed — idempotent
        if tx["payment_status"] in ("completed", "failed"):
            conn.close()
            return {"success": True, "status": tx["payment_status"]}

        # Timing check: reject callbacks for transactions older than 10 minutes
        # (STK push expires in ~60 seconds, 10 min is very generous)
        try:
            created = datetime.fromisoformat(tx["created_at"])
            if (datetime.now() - created).total_seconds() > 600:
                conn.close()
                logger.warning(f"Daraja callback rejected: tx={tx['id']} is too old")
                return {"success": False, "error": "Transaction expired"}
        except Exception:
            pass

        now = datetime.now().isoformat()

        if result_code == 0 or result_code == "0":
            # SECURITY: Cross-verify successful payments with Safaricom STK query
            # This prevents forged callbacks from crediting accounts
            is_trusted_ip = client_ip and is_safaricom_ip(client_ip)
            if not is_trusted_ip:
                verification = await _verify_payment_with_safaricom(checkout_id)
                if not verification.get("verified") or verification.get("result_code") != 0:
                    conn.close()
                    logger.error(
                        f"BLOCKED forged M-Pesa callback: tx={tx['id']}, "
                        f"checkout={checkout_id}, ip={client_ip}, "
                        f"verification={verification}"
                    )
                    _log_system_event(
                        action="payment_forged_callback",
                        module="payments",
                        details={"transaction_id": tx["id"], "checkout_id": checkout_id, "ip": client_ip, "verification": str(verification)},
                        user_id=tx["user_id"],
                        severity="error",
                    )
                    return {"success": False, "error": "Payment verification failed"}
                logger.info(f"M-Pesa callback from non-Safaricom IP {client_ip} verified via STK query")

            # Payment successful — extract metadata
            metadata = {}
            items = stk_callback.get("CallbackMetadata", {}).get("Item", [])
            for item in items:
                metadata[item["Name"]] = item.get("Value", "")

            mpesa_receipt = str(metadata.get("MpesaReceiptNumber", ""))

            conn.execute("""
                UPDATE payment_transactions
                SET payment_status = 'confirmed', mpesa_receipt = ?, updated_at = ?
                WHERE id = ?
            """, (mpesa_receipt, now, tx["id"]))
            conn.commit()
            conn.close()

            # Complete the transaction (activate subscription / credit balance / unlock prediction)
            complete_result = _complete_transaction(tx["id"])
            logger.info(f"Daraja payment completed: tx={tx['id']}, receipt={mpesa_receipt}")
            return {"success": True, "status": "completed"}
        else:
            # Payment failed or cancelled by user — no verification needed (no money credited)
            conn.execute("""
                UPDATE payment_transactions
                SET payment_status = 'failed', failure_reason = ?, updated_at = ?
                WHERE id = ?
            """, (result_desc, now, tx["id"]))
            conn.commit()
            conn.close()
            logger.info(f"Daraja payment failed: tx={tx['id']}, reason={result_desc}")
            _log_system_event(
                action="payment_failed",
                module="payments",
                details={"transaction_id": tx["id"], "reason": result_desc, "checkout_id": checkout_id},
                user_id=tx["user_id"],
                severity="warning",
            )
            return {"success": True, "status": "failed"}

    except Exception as e:
        logger.error(f"Daraja callback error: {e}")
        _log_system_event(
            action="payment_callback_error",
            module="payments",
            details={"error": str(e), "callback_data_keys": list(callback_data.keys()) if callback_data else []},
            severity="error",
        )
        return {"success": False, "error": str(e)}


# ==================== STATUS CHECK ====================

async def check_payment_status(transaction_id: int, user_id: int) -> Dict:
    """Check payment status. Reads DB (callback updates it). Falls back to Daraja query."""
    conn = _get_db()
    tx = conn.execute(
        "SELECT * FROM payment_transactions WHERE id = ? AND user_id = ?",
        (transaction_id, user_id),
    ).fetchone()
    conn.close()

    if not tx:
        return {"success": False, "error": "Transaction not found"}

    # Already resolved
    if tx["payment_status"] in ("completed", "failed", "expired"):
        return {
            "success": True,
            "status": tx["payment_status"],
            "transaction": _tx_to_dict(tx),
        }

    # Callback was received and receipt recorded, but fulfillment may not have completed.
    # Re-attempt _complete_transaction to avoid the user being stuck on "processing" forever.
    if tx["payment_status"] == "confirmed":
        complete_result = _complete_transaction(transaction_id)
        if complete_result.get("success"):
            return {
                "success": True,
                "status": "completed",
                "transaction": complete_result.get("transaction", _tx_to_dict(tx)),
            }
        return {
            "success": True,
            "status": "processing",
            "message": "Payment confirmed, processing your order...",
            "transaction": _tx_to_dict(tx),
        }

    # If stk_sent for more than 30 seconds, try Daraja query as fallback
    checkout_id = ""
    try:
        checkout_id = tx["daraja_checkout_id"]
    except (IndexError, KeyError):
        pass

    if tx["payment_status"] == "stk_sent" and checkout_id:
        updated_at = tx["updated_at"] or tx["created_at"]
        try:
            elapsed = (datetime.now() - datetime.fromisoformat(updated_at)).total_seconds()
        except Exception:
            elapsed = 0

        if elapsed > 30:
            daraja_status = await _query_stk_status(checkout_id)
            if daraja_status.get("completed"):
                complete_result = _complete_transaction(transaction_id)
                return {
                    "success": True,
                    "status": "completed",
                    "transaction": complete_result.get("transaction", _tx_to_dict(tx)),
                }
            elif daraja_status.get("failed"):
                conn = _get_db()
                conn.execute("""
                    UPDATE payment_transactions
                    SET payment_status = 'failed', failure_reason = ?, updated_at = ?
                    WHERE id = ?
                """, (daraja_status.get("description", "Payment failed"),
                      datetime.now().isoformat(), transaction_id))
                conn.commit()
                conn.close()
                return {"success": True, "status": "failed", "transaction": _tx_to_dict(tx)}

    # Still processing
    return {
        "success": True,
        "status": "processing",
        "message": "Waiting for M-Pesa confirmation...",
        "transaction": _tx_to_dict(tx),
    }


async def _query_stk_status(checkout_request_id: str) -> Dict:
    """Query Daraja STK Push status as fallback when callback hasn't arrived."""
    try:
        token = await _get_daraja_token()
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        password = base64.b64encode(
            f"{DARAJA_SHORTCODE}{DARAJA_PASSKEY}{timestamp}".encode()
        ).decode()

        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{DARAJA_BASE_URL}/mpesa/stkpushquery/v1/query",
                json={
                    "BusinessShortCode": DARAJA_SHORTCODE,
                    "Password": password,
                    "Timestamp": timestamp,
                    "CheckoutRequestID": checkout_request_id,
                },
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            ) as resp:
                data = await resp.json(content_type=None)
                result_code = data.get("ResultCode")
                if result_code == "0" or result_code == 0:
                    return {"completed": True}
                elif result_code is not None:
                    return {"failed": True, "description": data.get("ResultDesc", "")}
                return {}
    except Exception as e:
        logger.warning(f"Daraja STK query failed: {e}")
        return {}


# ==================== TRANSACTION COMPLETION ====================

def _complete_transaction(transaction_id: int) -> Dict:
    """After payment confirmed, fulfill the purchase (subscription/prediction/topup)."""
    conn = _get_db()
    tx = conn.execute(
        "SELECT * FROM payment_transactions WHERE id = ?", (transaction_id,)
    ).fetchone()

    if not tx:
        conn.close()
        return {"success": False, "error": "Transaction not found"}

    # Already completed — idempotent
    if tx["payment_status"] == "completed":
        conn.close()
        return {"success": True, "transaction": _tx_to_dict(tx)}

    now = datetime.now().isoformat()
    payment_ref = ""
    try:
        payment_ref = tx["daraja_checkout_id"] or tx["mpesa_receipt"] or str(tx["id"])
    except (IndexError, KeyError):
        payment_ref = str(tx["id"])

    if tx["transaction_type"] == "subscription":
        # Validate plan exists before creating subscription
        plans = subscriptions.get_plans()
        plan_id = tx["reference_id"]
        if plan_id not in plans:
            logger.error(f"[Callback] Invalid plan_id '{plan_id}' for transaction {transaction_id}. Marking failed.")
            _log_system_event(
                action="payment_completion_failed",
                module="payments",
                details={"transaction_id": transaction_id, "plan_id": plan_id, "error": "Invalid plan"},
                user_id=tx["user_id"],
                severity="error",
            )
            conn.execute("""
                UPDATE payment_transactions
                SET payment_status = 'failed', failure_reason = 'Invalid plan', updated_at = ?
                WHERE id = ?
            """, (now, transaction_id))
            conn.commit()
            conn.close()
            return {"success": False, "error": f"Invalid plan: {plan_id}"}

        # Verify payment amount matches plan price (within tolerance)
        plan = plans[plan_id]
        if plan["currency"] == "KES" and tx["amount_kes"]:
            if abs(tx["amount_kes"] - plan["price"]) > 1:
                logger.error(f"[Callback] Amount mismatch: paid KES {tx['amount_kes']} but plan '{plan_id}' costs KES {plan['price']}")
                conn.execute("""
                    UPDATE payment_transactions
                    SET payment_status = 'failed', failure_reason = 'Amount mismatch', updated_at = ?
                    WHERE id = ?
                """, (now, transaction_id))
                conn.commit()
                conn.close()
                return {"success": False, "error": "Payment amount does not match plan price"}

        result = subscriptions.create_subscription(
            user_id=tx["user_id"],
            plan_id=plan_id,
            payment_method="mpesa",
            payment_ref=payment_ref,
        )
        if not result.get("success"):
            logger.error(f"[Callback] Subscription creation failed for tx {transaction_id}: {result}")
            conn.execute("""
                UPDATE payment_transactions
                SET payment_status = 'failed', failure_reason = ?, updated_at = ?
                WHERE id = ?
            """, (result.get("error", "Subscription creation failed"), now, transaction_id))
            conn.commit()
            conn.close()
            return {"success": False, "error": result.get("error", "Subscription creation failed")}

        try:
            import whop_payment
            whop_payment._process_referral_commission(
                tx["user_id"], plan_id, "mpesa",
                amount_usd=tx["amount_usd"] or 0, transaction_type="subscription")
        except Exception as e:
            logger.error(f"Referral commission error (mpesa sub): {e}")

    elif tx["transaction_type"] == "prediction_purchase":
        result = community.purchase_prediction(
            prediction_id=int(tx["reference_id"]),
            buyer_id=tx["user_id"],
            payment_method="mpesa",
            payment_ref=payment_ref,
        )
        try:
            import whop_payment
            whop_payment._process_referral_commission(
                tx["user_id"], tx["reference_id"], "mpesa",
                amount_usd=tx["amount_usd"] or 0, transaction_type="prediction_purchase")
        except Exception as e:
            logger.error(f"Referral commission error (mpesa pred): {e}")

    elif tx["transaction_type"] == "balance_topup":
        amount_usd = tx["amount_usd"] or 0
        community.adjust_user_balance(
            user_id=tx["user_id"],
            amount_usd=amount_usd,
            amount_kes=0,
            reason="Pay on the Go deposit via M-Pesa",
            adjustment_type="topup",
        )
        try:
            import whop_payment
            whop_payment._process_referral_commission(
                tx["user_id"], "balance_topup", "mpesa",
                amount_usd=amount_usd, transaction_type="balance_topup")
        except Exception as e:
            logger.error(f"Referral commission error (mpesa topup): {e}")

    # Mark transaction as completed
    conn.execute("""
        UPDATE payment_transactions
        SET payment_status = 'completed', updated_at = ?, completed_at = ?
        WHERE id = ?
    """, (now, now, transaction_id))
    conn.commit()

    updated_tx = conn.execute(
        "SELECT * FROM payment_transactions WHERE id = ?", (transaction_id,)
    ).fetchone()
    conn.close()

    # Send invoice email
    try:
        import user_auth
        user_info = user_auth.get_user_email_by_id(tx["user_id"])
        if user_info and user_info.get("email"):
            invoice_num = f"SPARK-{datetime.now().strftime('%Y%m%d')}-{transaction_id}"
            user_auth.send_invoice_email(
                to_email=user_info["email"],
                display_name=user_info.get("display_name", ""),
                invoice_number=invoice_num,
                transaction_type=tx["transaction_type"],
                amount_kes=tx["amount_kes"] or 0,
                amount_usd=tx["amount_usd"] or 0,
                exchange_rate=tx["exchange_rate"] or 0,
                payment_method="M-Pesa",
                receipt_number=tx["mpesa_receipt"] if "mpesa_receipt" in tx.keys() else "",
                reference_id=tx["reference_id"] or "",
                completed_at=now,
            )
    except Exception as e:
        logger.error(f"Failed to send invoice email for tx {transaction_id}: {e}")

    return {"success": True, "transaction": _tx_to_dict(updated_tx)}


# ==================== WITHDRAWALS ====================

def request_withdrawal(user_id: int, amount_usd: float, phone: str = "", withdrawal_method: str = "mpesa") -> Dict:
    """Create a withdrawal request. Deducts balance immediately."""
    if amount_usd < MINIMUM_WITHDRAWAL_USD:
        return {"success": False, "error": f"Minimum withdrawal is ${MINIMUM_WITHDRAWAL_USD:.2f}"}

    whop_user_id = ""

    if withdrawal_method == "whop":
        import sqlite3 as _sq
        users_conn = _sq.connect("users.db")
        users_conn.row_factory = _sq.Row
        user_row = users_conn.execute(
            "SELECT whop_user_id FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        users_conn.close()
        if not user_row or not user_row["whop_user_id"]:
            return {"success": False, "error": "No Whop account linked. Make a card payment first to enable USD withdrawals."}
        whop_user_id = user_row["whop_user_id"]
        phone = ""
    elif withdrawal_method == "mpesa":
        if not phone:
            return {"success": False, "error": "Phone number required for M-Pesa withdrawal"}
    else:
        return {"success": False, "error": "Invalid withdrawal method"}

    conn = _get_db()

    wallet = conn.execute(
        "SELECT balance_usd FROM creator_wallets WHERE user_id = ?", (user_id,)
    ).fetchone()

    if not wallet or wallet["balance_usd"] < amount_usd:
        conn.close()
        return {"success": False, "error": "Insufficient balance"}

    pending = conn.execute(
        "SELECT id FROM withdrawal_requests WHERE user_id = ? AND status IN ('pending', 'approved', 'processing')",
        (user_id,),
    ).fetchone()
    if pending:
        conn.close()
        return {"success": False, "error": "You already have a pending withdrawal request"}

    now = datetime.now().isoformat()

    # Use cached live rate for KES estimate (with inverse markup)
    cached_rate = _exchange_rate_cache.get("rate") or 130.0
    withdrawal_rate = round(cached_rate * (1 - EXCHANGE_RATE_MARKUP), 2)
    estimated_kes = round(amount_usd * withdrawal_rate, 2) if withdrawal_method == "mpesa" else 0.0

    # Deduct balance
    conn.execute("""
        UPDATE creator_wallets
        SET balance_usd = balance_usd - ?, updated_at = ?
        WHERE user_id = ?
    """, (amount_usd, now, user_id))

    cursor = conn.execute("""
        INSERT INTO withdrawal_requests
            (user_id, amount_usd, amount_kes, exchange_rate, phone_number,
             withdrawal_method, whop_user_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    """, (user_id, amount_usd, estimated_kes, withdrawal_rate, phone,
          withdrawal_method, whop_user_id, now, now))
    request_id = cursor.lastrowid

    conn.commit()
    conn.close()

    return {
        "success": True,
        "request_id": request_id,
        "amount_usd": amount_usd,
        "estimated_kes": estimated_kes,
        "message": "Withdrawal request submitted. Funds will be sent within 24 hours.",
    }


def approve_withdrawal(request_id: int, admin_notes: str = "") -> Dict:
    """Admin approves a withdrawal request. For Whop, auto-triggers transfer."""
    conn = _get_db()
    req = conn.execute(
        "SELECT * FROM withdrawal_requests WHERE id = ?", (request_id,)
    ).fetchone()

    if not req:
        conn.close()
        return {"success": False, "error": "Withdrawal request not found"}
    if req["status"] != "pending":
        conn.close()
        return {"success": False, "error": f"Request is already {req['status']}"}

    now = datetime.now().isoformat()
    method = req["withdrawal_method"] if "withdrawal_method" in req.keys() else "mpesa"

    if method == "whop":
        conn.close()
        import whop_payment
        transfer_result = whop_payment.create_transfer(
            destination_id=req["whop_user_id"],
            amount_usd=req["amount_usd"],
            notes=f"Earnings withdrawal #{request_id}",
            idempotence_key=f"wd_{request_id}_{req['user_id']}",
        )
        conn = _get_db()
        if transfer_result["success"]:
            transfer_id = transfer_result.get("transfer_id", "")
            conn.execute("""
                UPDATE withdrawal_requests
                SET status = 'completed', admin_notes = ?, whop_transfer_id = ?,
                    updated_at = ?, completed_at = ?
                WHERE id = ?
            """, (f"Auto-transferred via Whop. {admin_notes}".strip(),
                  transfer_id, now, now, request_id))
            conn.commit()
            conn.close()
            return {"success": True, "message": "Whop transfer completed automatically", "auto_completed": True}
        else:
            error_msg = transfer_result.get("error", "Unknown error")
            conn.execute("""
                UPDATE withdrawal_requests
                SET status = 'approved', admin_notes = ?, updated_at = ?
                WHERE id = ?
            """, (f"Whop transfer failed: {error_msg}. {admin_notes}".strip(), now, request_id))
            conn.commit()
            conn.close()
            return {"success": True, "message": f"Approved but transfer failed: {error_msg}. You can retry.", "transfer_failed": True}
    else:
        conn.execute("""
            UPDATE withdrawal_requests
            SET status = 'approved', admin_notes = ?, updated_at = ?
            WHERE id = ?
        """, (admin_notes, now, request_id))
        conn.commit()
        conn.close()
        return {"success": True, "message": "Withdrawal approved"}


def complete_withdrawal(request_id: int) -> Dict:
    """Mark withdrawal as completed after M-Pesa sent."""
    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute("""
        UPDATE withdrawal_requests
        SET status = 'completed', updated_at = ?, completed_at = ?
        WHERE id = ?
    """, (now, now, request_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Withdrawal completed"}


def retry_whop_transfer(request_id: int) -> Dict:
    """Retry a failed Whop transfer for an approved withdrawal."""
    conn = _get_db()
    req = conn.execute(
        "SELECT * FROM withdrawal_requests WHERE id = ?", (request_id,)
    ).fetchone()
    conn.close()

    if not req:
        return {"success": False, "error": "Withdrawal request not found"}

    method = req["withdrawal_method"] if "withdrawal_method" in req.keys() else "mpesa"
    if method != "whop":
        return {"success": False, "error": "Not a Whop withdrawal"}
    if req["status"] == "completed":
        return {"success": False, "error": "Already completed"}

    import whop_payment
    now = datetime.now().isoformat()
    transfer_result = whop_payment.create_transfer(
        destination_id=req["whop_user_id"],
        amount_usd=req["amount_usd"],
        notes=f"Earnings withdrawal #{request_id} (retry)",
        idempotence_key=f"wd_{request_id}_{req['user_id']}_r{now[:10]}",
    )

    conn = _get_db()
    if transfer_result["success"]:
        transfer_id = transfer_result.get("transfer_id", "")
        conn.execute("""
            UPDATE withdrawal_requests
            SET status = 'completed', whop_transfer_id = ?, updated_at = ?, completed_at = ?
            WHERE id = ?
        """, (transfer_id, now, now, request_id))
        conn.commit()
        conn.close()
        return {"success": True, "message": "Whop transfer completed", "transfer_id": transfer_id}
    else:
        conn.close()
        return {"success": False, "error": transfer_result.get("error", "Transfer failed")}


def reject_withdrawal(request_id: int, admin_notes: str = "") -> Dict:
    """Admin rejects a withdrawal request. Refunds the balance."""
    conn = _get_db()
    req = conn.execute(
        "SELECT * FROM withdrawal_requests WHERE id = ?", (request_id,)
    ).fetchone()

    if not req:
        conn.close()
        return {"success": False, "error": "Withdrawal request not found"}
    if req["status"] not in ("pending", "approved"):
        conn.close()
        return {"success": False, "error": f"Cannot reject — request is {req['status']}"}

    now = datetime.now().isoformat()

    conn.execute("""
        UPDATE creator_wallets
        SET balance_usd = balance_usd + ?, updated_at = ?
        WHERE user_id = ?
    """, (req["amount_usd"], now, req["user_id"]))

    conn.execute("""
        UPDATE withdrawal_requests
        SET status = 'rejected', admin_notes = ?, updated_at = ?
        WHERE id = ?
    """, (admin_notes, now, request_id))

    conn.commit()
    conn.close()

    return {"success": True, "message": "Withdrawal rejected, balance refunded"}


# ==================== WITHDRAWAL OPTIONS & OTP ====================

def _normalize_phone(phone: str) -> str:
    """Normalize phone to 254XXXXXXXXX format."""
    phone = phone.strip().replace(" ", "").replace("-", "")
    if phone.startswith("+"):
        phone = phone[1:]
    if phone.startswith("0") and len(phone) == 10:
        phone = "254" + phone[1:]
    if phone.startswith("01") and len(phone) == 10:
        phone = "254" + phone[1:]
    return phone


def _validate_phone(phone: str) -> bool:
    """Check phone is valid 254XXXXXXXXX format."""
    return phone.startswith("254") and len(phone) == 12 and phone.isdigit()


def send_phone_otp(user_id: int, phone: str) -> Dict:
    """Send OTP via email to verify M-Pesa phone ownership."""
    phone = _normalize_phone(phone)
    if not _validate_phone(phone):
        return {"success": False, "error": "Invalid phone. Use format: 254XXXXXXXXX or 07XXXXXXXX"}

    code = str(random.randint(100000, 999999))
    expires = (datetime.now() + timedelta(minutes=PHONE_OTP_EXPIRY_MINUTES)).isoformat()
    now = datetime.now().isoformat()

    conn = _get_db()
    # Upsert withdrawal_options row for mpesa
    existing = conn.execute(
        "SELECT id FROM withdrawal_options WHERE user_id = ? AND method = 'mpesa'",
        (user_id,)
    ).fetchone()

    if existing:
        conn.execute("""
            UPDATE withdrawal_options
            SET mpesa_phone = ?, phone_otp_code = ?, phone_otp_expires = ?,
                phone_otp_attempts = 0, mpesa_phone_verified = 0, updated_at = ?
            WHERE id = ?
        """, (phone, code, expires, now, existing["id"]))
    else:
        conn.execute("""
            INSERT INTO withdrawal_options
            (user_id, method, mpesa_phone, phone_otp_code, phone_otp_expires,
             phone_otp_attempts, is_active, created_at, updated_at)
            VALUES (?, 'mpesa', ?, ?, ?, 0, 0, ?, ?)
        """, (user_id, phone, code, expires, now, now))
    conn.commit()
    conn.close()

    # Send OTP via email
    try:
        import user_auth
        user_info = user_auth.get_user_email_by_id(user_id)
        if not user_info or not user_info.get("email"):
            return {"success": False, "error": "No email found for your account."}

        masked_phone = f"{phone[:3]}***{phone[-3:]}"
        greeting = user_info.get("display_name", "there")
        payment_email = os.environ.get("ZOHO_PAYMENT_EMAIL", "")

        html_body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;
                    background: #0f172a; color: #f1f5f9; padding: 40px; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
                <span style="font-size: 48px;">&#128274;</span>
                <h1 style="color: #f1f5f9; margin: 8px 0; font-size: 22px;">M-Pesa Verification</h1>
            </div>
            <p style="color: #94a3b8;">Hey {greeting},</p>
            <p style="color: #94a3b8;">
                Use the code below to verify your M-Pesa phone number ({masked_phone}) for withdrawals.
            </p>
            <div style="text-align: center; margin: 24px 0;">
                <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px;
                             color: #22c55e; background: rgba(34,197,94,0.1);
                             padding: 16px 32px; border-radius: 12px;
                             border: 1px solid rgba(34,197,94,0.3);">
                    {code}
                </span>
            </div>
            <p style="color: #64748b; font-size: 13px;">
                This code expires in {PHONE_OTP_EXPIRY_MINUTES} minutes. If you didn't request this, ignore this email.
            </p>
            <p style="color: #475569; font-size: 12px; text-align: center; margin-top: 24px;">
                Spark AI Prediction
            </p>
        </div>
        """

        success = user_auth._send_zoho_email(
            user_info["email"],
            f"Your M-Pesa verification code: {code}",
            html_body,
            from_email=payment_email,
        )

        if success:
            masked_email = user_info["email"][:3] + "***" + user_info["email"][user_info["email"].index("@"):]
            logger.info(f"[OTP] Sent to {masked_email} for user {user_id}, phone {masked_phone}")
            return {"success": True, "otp_sent": True, "message": f"Verification code sent to {masked_email}"}
        else:
            return {"success": False, "error": "Failed to send verification email. Please try again."}
    except Exception as e:
        logger.error(f"[OTP] Email error for user {user_id}: {e}")
        return {"success": False, "error": f"Failed to send verification code: {e}"}


def verify_phone_otp(user_id: int, phone: str, code: str) -> Dict:
    """Verify M-Pesa phone OTP and activate withdrawal option."""
    phone = _normalize_phone(phone)

    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM withdrawal_options WHERE user_id = ? AND method = 'mpesa'",
        (user_id,)
    ).fetchone()

    if not row:
        conn.close()
        return {"success": False, "error": "No pending phone verification found"}

    if row["mpesa_phone"] != phone:
        conn.close()
        return {"success": False, "error": "Phone number does not match"}

    if row["phone_otp_attempts"] >= PHONE_OTP_MAX_ATTEMPTS:
        conn.close()
        return {"success": False, "error": "Too many attempts. Request a new code."}

    if row["phone_otp_expires"] and datetime.fromisoformat(row["phone_otp_expires"]) < datetime.now():
        conn.close()
        return {"success": False, "error": "Code expired. Request a new one."}

    if row["phone_otp_code"] != code:
        conn.execute(
            "UPDATE withdrawal_options SET phone_otp_attempts = phone_otp_attempts + 1 WHERE id = ?",
            (row["id"],)
        )
        conn.commit()
        conn.close()
        remaining = PHONE_OTP_MAX_ATTEMPTS - row["phone_otp_attempts"] - 1
        return {"success": False, "error": f"Invalid code. {remaining} attempts remaining."}

    # Success — activate option with 48h cooldown
    now = datetime.now()
    cooldown = (now + timedelta(hours=WITHDRAWAL_COOLDOWN_HOURS)).isoformat()
    conn.execute("""
        UPDATE withdrawal_options
        SET mpesa_phone_verified = 1, is_active = 1, cooldown_until = ?,
            phone_otp_code = '', phone_otp_attempts = 0, updated_at = ?
        WHERE id = ?
    """, (cooldown, now.isoformat(), row["id"]))

    # Set as primary if no other primary exists
    other_primary = conn.execute(
        "SELECT id FROM withdrawal_options WHERE user_id = ? AND is_primary = 1 AND method != 'mpesa'",
        (user_id,)
    ).fetchone()
    if not other_primary:
        conn.execute("UPDATE withdrawal_options SET is_primary = 1 WHERE id = ?", (row["id"],))

    conn.commit()
    conn.close()

    # Send email notification
    _send_withdrawal_method_email(user_id, "added", "M-Pesa")

    return {
        "success": True,
        "message": f"Phone {phone[:3]}***{phone[-3:]} verified. 48-hour cooldown active.",
        "cooldown_until": cooldown,
    }


def add_withdrawal_option(user_id: int, method: str, phone: str = "") -> Dict:
    """Add or update a withdrawal option. M-Pesa requires OTP verification."""
    if method not in ("mpesa", "whop"):
        return {"success": False, "error": "Method must be 'mpesa' or 'whop'"}

    # Check 48h cooldown on any existing option
    conn = _get_db()
    any_cooldown = conn.execute("""
        SELECT cooldown_until FROM withdrawal_options
        WHERE user_id = ? AND cooldown_until IS NOT NULL AND cooldown_until > ?
    """, (user_id, datetime.now().isoformat())).fetchone()
    if any_cooldown:
        conn.close()
        return {
            "success": False,
            "error": f"Withdrawal options locked until {any_cooldown['cooldown_until'][:16]}. Please wait."
        }

    # Only one withdrawal method allowed at a time
    existing_active = conn.execute(
        "SELECT method FROM withdrawal_options WHERE user_id = ? AND is_active = 1",
        (user_id,)
    ).fetchone()
    if existing_active and existing_active["method"] != method:
        conn.close()
        other = "M-Pesa" if existing_active["method"] == "mpesa" else "Whop"
        return {
            "success": False,
            "error": f"You already have {other} as your withdrawal method. Remove it first to switch."
        }
    conn.close()

    if method == "mpesa":
        if not phone:
            return {"success": False, "error": "Phone number required for M-Pesa"}
        return send_phone_otp(user_id, phone)

    elif method == "whop":
        # Check user has whop_user_id
        import user_auth
        profile = user_auth.get_user_profile(user_id)
        whop_id = profile.get("whop_user_id", "")
        if not whop_id:
            # Try to find their Whop account by email
            import whop_payment
            link_result = whop_payment.lookup_and_link_whop_account(user_id)
            if link_result.get("success"):
                whop_id = link_result["whop_user_id"]
            else:
                return {
                    "success": False,
                    "error": "No Whop account found for your email. Please create a Whop account with the same email you use on Spark AI, then try again.",
                }

        now = datetime.now()
        cooldown = (now + timedelta(hours=WITHDRAWAL_COOLDOWN_HOURS)).isoformat()
        conn = _get_db()

        existing = conn.execute(
            "SELECT id FROM withdrawal_options WHERE user_id = ? AND method = 'whop'",
            (user_id,)
        ).fetchone()

        if existing:
            conn.execute("""
                UPDATE withdrawal_options
                SET whop_user_id = ?, is_active = 1, cooldown_until = ?, updated_at = ?
                WHERE id = ?
            """, (whop_id, cooldown, now.isoformat(), existing["id"]))
        else:
            conn.execute("""
                INSERT INTO withdrawal_options
                (user_id, method, whop_user_id, is_active, cooldown_until, created_at, updated_at)
                VALUES (?, 'whop', ?, 1, ?, ?, ?)
            """, (user_id, whop_id, cooldown, now.isoformat(), now.isoformat()))

        # Set as primary if no other primary
        other_primary = conn.execute(
            "SELECT id FROM withdrawal_options WHERE user_id = ? AND is_primary = 1 AND method != 'whop'",
            (user_id,)
        ).fetchone()
        if not other_primary:
            conn.execute(
                "UPDATE withdrawal_options SET is_primary = 1 WHERE user_id = ? AND method = 'whop'",
                (user_id,)
            )

        conn.commit()
        conn.close()

        _send_withdrawal_method_email(user_id, "added", "Whop (USD)")
        return {
            "success": True,
            "message": f"Whop withdrawal method added. 48-hour cooldown active.",
            "cooldown_until": cooldown,
        }


def remove_withdrawal_option(user_id: int, method: str) -> Dict:
    """Remove/deactivate a withdrawal option. Sets 48h cooldown."""
    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM withdrawal_options WHERE user_id = ? AND method = ? AND is_active = 1",
        (user_id, method)
    ).fetchone()
    if not row:
        conn.close()
        return {"success": False, "error": f"No active {method} withdrawal option found"}

    # Check cooldown
    if row["cooldown_until"] and datetime.fromisoformat(row["cooldown_until"]) > datetime.now():
        conn.close()
        return {"success": False, "error": f"Options locked until {row['cooldown_until'][:16]}"}

    now = datetime.now()
    cooldown = (now + timedelta(hours=WITHDRAWAL_COOLDOWN_HOURS)).isoformat()
    conn.execute("""
        UPDATE withdrawal_options
        SET is_active = 0, is_primary = 0, cooldown_until = ?, updated_at = ?
        WHERE id = ?
    """, (cooldown, now.isoformat(), row["id"]))
    conn.commit()
    conn.close()

    method_label = "M-Pesa" if method == "mpesa" else "Whop (USD)"
    _send_withdrawal_method_email(user_id, "removed", method_label)
    return {"success": True, "message": f"{method_label} withdrawal method removed. 48-hour cooldown active."}


def set_primary_withdrawal_option(user_id: int, method: str) -> Dict:
    """Set which withdrawal method to use for auto-withdrawals."""
    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM withdrawal_options WHERE user_id = ? AND method = ? AND is_active = 1",
        (user_id, method)
    ).fetchone()
    if not row:
        conn.close()
        return {"success": False, "error": f"No active {method} option found"}

    if method == "mpesa" and not row["mpesa_phone_verified"]:
        conn.close()
        return {"success": False, "error": "M-Pesa phone not verified yet"}

    # Clear other primaries, set this one
    conn.execute("UPDATE withdrawal_options SET is_primary = 0 WHERE user_id = ?", (user_id,))
    conn.execute("UPDATE withdrawal_options SET is_primary = 1 WHERE id = ?", (row["id"],))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"{method} set as primary withdrawal method"}


def get_withdrawal_options(user_id: int) -> Dict:
    """Get all withdrawal options for a user with cooldown/verification status."""
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM withdrawal_options WHERE user_id = ?", (user_id,)
    ).fetchall()
    conn.close()

    now = datetime.now()
    options = []
    for r in rows:
        cooldown_active = False
        cooldown_remaining_hours = 0
        if r["cooldown_until"]:
            cooldown_end = datetime.fromisoformat(r["cooldown_until"])
            if cooldown_end > now:
                cooldown_active = True
                cooldown_remaining_hours = round((cooldown_end - now).total_seconds() / 3600, 1)

        opt = {
            "method": r["method"],
            "is_active": bool(r["is_active"]),
            "is_primary": bool(r["is_primary"]),
            "cooldown_active": cooldown_active,
            "cooldown_remaining_hours": cooldown_remaining_hours,
            "cooldown_until": r["cooldown_until"],
            "created_at": r["created_at"],
        }
        if r["method"] == "mpesa":
            phone = r["mpesa_phone"] or ""
            opt["mpesa_phone_masked"] = f"{phone[:3]}***{phone[-3:]}" if len(phone) >= 6 else ""
            opt["mpesa_phone_verified"] = bool(r["mpesa_phone_verified"])
        elif r["method"] == "whop":
            opt["whop_linked"] = bool(r["whop_user_id"])
        options.append(opt)

    return {"success": True, "options": options}


def get_all_withdrawal_options() -> List[Dict]:
    """Admin: get all users' withdrawal options with user info."""
    import sqlite3 as _sq

    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM withdrawal_options WHERE is_active = 1 ORDER BY created_at DESC"
    ).fetchall()
    conn.close()

    if not rows:
        return []

    users_conn = _sq.connect(os.path.join(os.path.dirname(__file__), "users.db"), timeout=10)
    users_conn.row_factory = _sq.Row

    now = datetime.now()
    results = []
    for r in rows:
        user = users_conn.execute(
            "SELECT display_name, username FROM users WHERE id = ?",
            (r["user_id"],)
        ).fetchone()

        cooldown_active = False
        cooldown_remaining_hours = 0
        if r["cooldown_until"]:
            cooldown_end = datetime.fromisoformat(r["cooldown_until"])
            if cooldown_end > now:
                cooldown_active = True
                cooldown_remaining_hours = round((cooldown_end - now).total_seconds() / 3600, 1)

        opt = {
            "id": r["id"],
            "user_id": r["user_id"],
            "display_name": user["display_name"] if user else "",
            "username": user["username"] if user else "",
            "method": r["method"],
            "is_active": bool(r["is_active"]),
            "is_primary": bool(r["is_primary"]),
            "cooldown_active": cooldown_active,
            "cooldown_remaining_hours": cooldown_remaining_hours,
            "cooldown_until": r["cooldown_until"],
            "created_at": r["created_at"],
        }
        if r["method"] == "mpesa":
            phone = r["mpesa_phone"] or ""
            opt["mpesa_phone_masked"] = f"{phone[:3]}***{phone[-3:]}" if len(phone) >= 6 else ""
            opt["mpesa_phone_verified"] = bool(r["mpesa_phone_verified"])
        elif r["method"] == "whop":
            opt["whop_linked"] = bool(r["whop_user_id"])
        results.append(opt)

    users_conn.close()
    return results


def _send_withdrawal_method_email(user_id: int, action: str, method_label: str):
    """Send email notification about withdrawal method change."""
    try:
        import user_auth
        profile = user_auth.get_user_profile(user_id)
        if not profile or not profile.get("email"):
            return
        payment_email = os.environ.get("ZOHO_PAYMENT_EMAIL", "")
        user_auth.send_notification_email(
            to_email=profile["email"],
            display_name=profile.get("display_name", "User"),
            notif_type="withdrawal_method_added" if action == "added" else "withdrawal_method_removed",
            title=f"Withdrawal Method {action.title()}",
            message=f"Your {method_label} withdrawal method has been {action}. "
                    f"A 48-hour security cooldown is now active before this method can be used.",
            from_email=payment_email,
        )
    except Exception as e:
        logger.error(f"[Email] Withdrawal method email failed: {e}")


# ==================== WITHDRAWAL FEES ====================

def calculate_mpesa_b2c_fee(amount_kes: float) -> Dict:
    """Calculate Safaricom B2C transaction fee based on amount tiers."""
    if amount_kes <= 100:
        fee = 0
    elif amount_kes <= 500:
        fee = 15
    elif amount_kes <= 1000:
        fee = 23
    elif amount_kes <= 1500:
        fee = 23
    elif amount_kes <= 2500:
        fee = 33
    elif amount_kes <= 3500:
        fee = 53
    elif amount_kes <= 5000:
        fee = 57
    elif amount_kes <= 7500:
        fee = 77
    elif amount_kes <= 10000:
        fee = 87
    elif amount_kes <= 15000:
        fee = 97
    elif amount_kes <= 20000:
        fee = 102
    else:
        fee = 108

    return {
        "gross_amount_kes": amount_kes,
        "fee_kes": fee,
        "net_amount_kes": max(amount_kes - fee, 0),
        "fee_description": "Safaricom B2C transaction fee"
    }


def calculate_whop_fee(amount_usd: float) -> Dict:
    """Calculate Whop transfer fees (3% platform + 2.7% processing + $0.30)."""
    platform_fee = round(amount_usd * 0.03, 2)
    processing_fee = round(amount_usd * 0.027 + 0.30, 2)
    total_fee = round(platform_fee + processing_fee, 2)
    return {
        "gross_amount_usd": amount_usd,
        "platform_fee_usd": platform_fee,
        "processing_fee_usd": processing_fee,
        "total_fee_usd": total_fee,
        "net_amount_usd": round(max(amount_usd - total_fee, 0), 2),
        "fee_description": "Whop 3% platform + 2.7% + $0.30 processing"
    }


async def get_withdrawal_fee_preview(amount_usd: float, method: str) -> Dict:
    """Get withdrawal fee breakdown for dashboard display."""
    if method == "mpesa":
        rate_info = await get_usd_to_kes_quote(amount_usd)
        if not rate_info.get("success"):
            return {"success": False, "error": "Failed to get exchange rate"}
        amount_kes = rate_info["amount_kes"]
        fee_info = calculate_mpesa_b2c_fee(amount_kes)
        return {
            "success": True,
            "method": "mpesa",
            "amount_usd": amount_usd,
            "exchange_rate": rate_info["exchange_rate"],
            "amount_kes": amount_kes,
            "fee_kes": fee_info["fee_kes"],
            "net_amount_kes": fee_info["net_amount_kes"],
            "fee_description": fee_info["fee_description"],
        }
    elif method == "whop":
        fee_info = calculate_whop_fee(amount_usd)
        return {
            "success": True,
            "method": "whop",
            **fee_info,
        }
    return {"success": False, "error": "Invalid method"}


# ==================== QUERIES ====================

def get_user_transactions(user_id: int, limit: int = 20) -> List[Dict]:
    """Get recent payment transactions for a user."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT * FROM payment_transactions
        WHERE user_id = ?
        ORDER BY created_at DESC LIMIT ?
    """, (user_id, limit)).fetchall()
    conn.close()
    return [_tx_to_dict(r) for r in rows]


def get_user_withdrawals(user_id: int) -> List[Dict]:
    """Get withdrawal history for a user."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT * FROM withdrawal_requests
        WHERE user_id = ?
        ORDER BY created_at DESC
    """, (user_id,)).fetchall()
    conn.close()
    return [_wd_to_dict(r) for r in rows]


def get_all_pending_withdrawals() -> List[Dict]:
    """Admin: get all pending withdrawal requests with user info."""
    conn = _get_db()
    conn.execute("ATTACH DATABASE 'users.db' AS udb")
    rows = conn.execute("""
        SELECT wr.*, u.username, u.display_name
        FROM withdrawal_requests wr
        LEFT JOIN udb.users u ON wr.user_id = u.id
        WHERE wr.status IN ('pending', 'approved')
        ORDER BY wr.created_at ASC
    """).fetchall()
    conn.execute("DETACH DATABASE udb")
    conn.close()

    results = []
    for r in rows:
        d = _wd_to_dict(r)
        d["username"] = r["username"] if "username" in r.keys() else ""
        d["display_name"] = r["display_name"] if "display_name" in r.keys() else ""
        results.append(d)
    return results


def expire_stale_transactions(minutes: int = 15) -> int:
    """Expire payment transactions stuck in pending/stk_sent for too long."""
    conn = _get_db()
    cutoff = (datetime.now() - timedelta(minutes=minutes)).isoformat()
    cursor = conn.execute("""
        UPDATE payment_transactions
        SET payment_status = 'expired', failure_reason = 'Transaction timed out', updated_at = ?
        WHERE payment_status IN ('pending', 'stk_sent') AND created_at < ?
    """, (datetime.now().isoformat(), cutoff))
    count = cursor.rowcount
    conn.commit()
    conn.close()
    return count


# ==================== HELPERS ====================

def _tx_to_dict(row) -> Dict:
    """Convert a payment_transactions row to dict."""
    if not row:
        return {}
    keys = row.keys()
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "transaction_type": row["transaction_type"],
        "reference_id": row["reference_id"],
        "amount_kes": row["amount_kes"],
        "amount_usd": row["amount_usd"],
        "exchange_rate": row["exchange_rate"],
        "phone_number": row["phone_number"][-4:] if row["phone_number"] else "",
        "payment_status": row["payment_status"],
        "mpesa_receipt": row["mpesa_receipt"] if "mpesa_receipt" in keys else "",
        "created_at": row["created_at"],
        "completed_at": row["completed_at"],
    }


def _wd_to_dict(row) -> Dict:
    """Convert a withdrawal_requests row to dict."""
    if not row:
        return {}
    keys = row.keys()
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "amount_usd": row["amount_usd"],
        "amount_kes": row["amount_kes"],
        "exchange_rate": row["exchange_rate"],
        "phone_number": row["phone_number"],
        "status": row["status"],
        "admin_notes": row["admin_notes"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "completed_at": row["completed_at"],
        "withdrawal_method": row["withdrawal_method"] if "withdrawal_method" in keys else "mpesa",
        "whop_transfer_id": row["whop_transfer_id"] if "whop_transfer_id" in keys else "",
        "whop_user_id": row["whop_user_id"] if "whop_user_id" in keys else "",
    }


# ==================== B2C DISBURSEMENT (BUSINESS TO CUSTOMER) ====================

def _generate_security_credential() -> str:
    """Generate B2C security credential: RSA-encrypt initiator password with Safaricom cert."""
    from cryptography.x509 import load_pem_x509_certificate, load_der_x509_certificate
    from cryptography.hazmat.primitives.asymmetric.padding import PKCS1v15

    cert_path = os.path.join(os.path.dirname(__file__), "certs",
                             "SandboxCertificate.cer" if DARAJA_ENV == "sandbox" else "ProductionCertificate.cer")
    if not os.path.exists(cert_path):
        raise ValueError(f"B2C certificate not found at {cert_path}")

    with open(cert_path, "rb") as f:
        cert_data = f.read()

    try:
        cert = load_pem_x509_certificate(cert_data)
    except Exception:
        cert = load_der_x509_certificate(cert_data)

    public_key = cert.public_key()
    encrypted = public_key.encrypt(
        DARAJA_B2C_INITIATOR_PASSWORD.encode("utf-8"),
        PKCS1v15()
    )
    return base64.b64encode(encrypted).decode("utf-8")


async def initiate_b2c_payment(phone: str, amount_kes: int, disbursement_item_id: int,
                                remarks: str = "SparkAI commission payout",
                                occasion: str = "Commission") -> Dict:
    """Send B2C payment via Daraja API."""
    if not DARAJA_B2C_SHORTCODE or not DARAJA_B2C_INITIATOR_NAME:
        return {"success": False, "error": "B2C not configured"}

    # Use pre-generated credential if available, otherwise generate from cert
    if DARAJA_B2C_SECURITY_CREDENTIAL:
        security_credential = DARAJA_B2C_SECURITY_CREDENTIAL
    else:
        try:
            security_credential = _generate_security_credential()
        except Exception as e:
            return {"success": False, "error": f"Security credential error: {e}"}

    token = await _get_b2c_token()

    originator_conversation_id = f"SparkAI-B2C-{uuid.uuid4().hex[:16]}"

    payload = {
        "OriginatorConversationID": originator_conversation_id,
        "InitiatorName": DARAJA_B2C_INITIATOR_NAME,
        "SecurityCredential": security_credential,
        "CommandID": "BusinessPayment",
        "Amount": amount_kes,
        "PartyA": DARAJA_B2C_SHORTCODE,
        "PartyB": phone,
        "Remarks": remarks,
        "QueueTimeOutURL": DARAJA_B2C_TIMEOUT_URL,
        "ResultURL": DARAJA_B2C_RESULT_URL,
        "Occasion": occasion,
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{DARAJA_BASE_URL}/mpesa/b2c/v1/paymentrequest",
                json=payload,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            ) as resp:
                data = await resp.json(content_type=None)

                if resp.status == 200 and data.get("ResponseCode") == "0":
                    conversation_id = data.get("ConversationID", "")
                    originator_id = data.get("OriginatorConversationID", "")

                    conn = _get_db()
                    conn.execute("""
                        UPDATE disbursement_items
                        SET b2c_conversation_id = ?, b2c_originator_conversation_id = ?,
                            status = 'sending', sent_at = ?
                        WHERE id = ?
                    """, (conversation_id, originator_id,
                          datetime.now().isoformat(), disbursement_item_id))
                    conn.commit()
                    conn.close()

                    logger.info(f"[B2C] Sent item={disbursement_item_id}, conv={conversation_id}")
                    return {"success": True, "conversation_id": conversation_id}
                else:
                    error_msg = data.get("errorMessage") or data.get("ResultDesc") or str(data)
                    logger.warning(f"[B2C] Failed item={disbursement_item_id}: {error_msg}")
                    return {"success": False, "error": error_msg}
    except Exception as e:
        logger.error(f"[B2C] Request error: {e}")
        return {"success": False, "error": str(e)}


async def handle_b2c_result_callback(callback_data: dict) -> Dict:
    """Process B2C result callback from Safaricom."""
    try:
        result = callback_data.get("Result", {})
        result_code = result.get("ResultCode")
        result_desc = result.get("ResultDesc", "")
        conversation_id = result.get("ConversationID", "")
        originator_id = result.get("OriginatorConversationID", "")
        transaction_id = result.get("TransactionID", "")

        conn = _get_db()
        item = conn.execute("""
            SELECT * FROM disbursement_items
            WHERE b2c_conversation_id = ? OR b2c_originator_conversation_id = ?
        """, (conversation_id, originator_id)).fetchone()

        if not item:
            conn.close()
            logger.warning(f"[B2C Callback] No item for conversation {conversation_id}")
            return {"success": False, "error": "Item not found"}

        if item["status"] in ("completed", "failed"):
            conn.close()
            return {"success": True, "status": item["status"]}

        now = datetime.now().isoformat()

        if result_code == 0:
            receipt = ""
            params = result.get("ResultParameters", {}).get("ResultParameter", [])
            for p in params:
                if p.get("Key") == "TransactionReceipt":
                    receipt = str(p.get("Value", ""))

            conn.execute("""
                UPDATE disbursement_items
                SET status = 'completed', b2c_transaction_id = ?, mpesa_receipt = ?, completed_at = ?
                WHERE id = ?
            """, (transaction_id, receipt, now, item["id"]))
            conn.commit()
            conn.close()

            _check_batch_completion(item["batch_id"])
            logger.info(f"[B2C] Completed: item={item['id']}, receipt={receipt}")
            return {"success": True, "status": "completed"}
        else:
            conn.execute("""
                UPDATE disbursement_items
                SET status = 'failed', failure_reason = ?, completed_at = ?
                WHERE id = ?
            """, (result_desc, now, item["id"]))
            conn.commit()
            conn.close()

            _refund_disbursement_item(item)
            _check_batch_completion(item["batch_id"])
            logger.warning(f"[B2C] Failed: item={item['id']}, reason={result_desc}")
            return {"success": True, "status": "failed"}
    except Exception as e:
        logger.error(f"[B2C Result Callback] Error: {e}")
        return {"success": False, "error": str(e)}


async def handle_b2c_timeout_callback(callback_data: dict) -> Dict:
    """Handle B2C timeout — mark item for retry."""
    try:
        result = callback_data.get("Result", {})
        conversation_id = result.get("ConversationID", "")
        originator_id = result.get("OriginatorConversationID", "")

        conn = _get_db()
        item = conn.execute("""
            SELECT * FROM disbursement_items
            WHERE b2c_conversation_id = ? OR b2c_originator_conversation_id = ?
        """, (conversation_id, originator_id)).fetchone()

        if item and item["status"] not in ("completed", "failed"):
            conn.execute("""
                UPDATE disbursement_items
                SET status = 'timeout', failure_reason = 'B2C request timed out'
                WHERE id = ?
            """, (item["id"],))
            conn.commit()
            _refund_disbursement_item(item)
            _check_batch_completion(item["batch_id"])

        conn.close()
        return {"success": True}
    except Exception as e:
        logger.error(f"[B2C Timeout] Error: {e}")
        return {"success": False, "error": str(e)}


def _refund_disbursement_item(item):
    """Refund balance_usd for a failed/timed-out disbursement item."""
    try:
        conn = _get_db()
        conn.execute("""
            UPDATE creator_wallets
            SET balance_usd = balance_usd + ?, updated_at = ?
            WHERE user_id = ?
        """, (item["amount_usd"], datetime.now().isoformat(), item["user_id"]))
        conn.commit()
        conn.close()
        logger.info(f"[B2C] Refunded ${item['amount_usd']:.2f} to user {item['user_id']}")
    except Exception as e:
        logger.error(f"[B2C] Refund error for user {item['user_id']}: {e}")


def _check_batch_completion(batch_id: int):
    """Check if all items in a batch are resolved and update batch status."""
    conn = _get_db()
    counts = conn.execute("""
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status IN ('failed', 'timeout') THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status IN ('pending', 'sending') THEN 1 ELSE 0 END) as pending
        FROM disbursement_items WHERE batch_id = ?
    """, (batch_id,)).fetchone()

    if counts["pending"] == 0:
        if counts["failed"] == 0:
            new_status = "completed"
        elif counts["completed"] == 0:
            new_status = "failed"
        else:
            new_status = "partially_completed"

        conn.execute("""
            UPDATE disbursement_batches SET status = ?, completed_at = ? WHERE id = ?
        """, (new_status, datetime.now().isoformat(), batch_id))
        conn.commit()

    conn.close()


# ==================== DISBURSEMENT BATCH SYSTEM ====================

async def generate_disbursement_batch() -> Dict:
    """Generate a weekly withdrawal batch for eligible users.
    Queries withdrawal_options for active, verified, non-cooldown options.
    M-Pesa: balance_usd * rate >= KES 1000
    Whop: balance_usd >= $10
    Does NOT deduct balances — that happens on approval.
    """
    import sqlite3 as _sq

    rate_result = await get_usd_to_kes_quote(1.0)
    if not rate_result["success"]:
        return {"success": False, "error": "Cannot fetch exchange rate"}

    rate = rate_result["exchange_rate"]
    min_usd_mpesa = DISBURSEMENT_THRESHOLD_KES / rate
    now_str = datetime.now().isoformat()
    today = datetime.now().strftime("%Y-%m-%d")

    conn = _get_db()

    existing = conn.execute("""
        SELECT id FROM disbursement_batches
        WHERE status IN ('pending', 'approved', 'processing')
    """).fetchone()
    if existing:
        conn.close()
        return {"success": False, "error": f"Active batch #{existing['id']} already exists"}

    # Get eligible withdrawal options (active, primary, verified, past cooldown)
    options = conn.execute("""
        SELECT * FROM withdrawal_options
        WHERE is_active = 1 AND is_primary = 1
          AND (cooldown_until IS NULL OR cooldown_until <= ?)
    """, (now_str,)).fetchall()

    # Filter mpesa to only verified phones
    mpesa_opts = [o for o in options if o["method"] == "mpesa" and o["mpesa_phone_verified"]]
    whop_opts = [o for o in options if o["method"] == "whop" and o["whop_user_id"]]

    # Get user info
    users_conn = _sq.connect(os.path.join(os.path.dirname(__file__), "users.db"), timeout=10)
    users_conn.row_factory = _sq.Row
    all_user_ids = [o["user_id"] for o in mpesa_opts + whop_opts]
    user_map = {}
    for uid in all_user_ids:
        u = users_conn.execute("SELECT id, display_name, username FROM users WHERE id = ?", (uid,)).fetchone()
        if u:
            user_map[uid] = dict(u)
    users_conn.close()

    batch_items = []

    # M-Pesa eligible users
    for opt in mpesa_opts:
        wallet = conn.execute(
            "SELECT balance_usd FROM creator_wallets WHERE user_id = ?", (opt["user_id"],)
        ).fetchone()
        if not wallet or wallet["balance_usd"] < min_usd_mpesa:
            continue
        balance_usd = wallet["balance_usd"]
        amount_kes = round(balance_usd * rate, 0)
        if amount_kes < DISBURSEMENT_THRESHOLD_KES:
            continue
        user_info = user_map.get(opt["user_id"], {})
        fee_info = calculate_mpesa_b2c_fee(amount_kes)
        batch_items.append({
            "user_id": opt["user_id"],
            "phone": opt["mpesa_phone"],
            "whop_user_id": "",
            "withdrawal_method": "mpesa",
            "display_name": user_info.get("display_name", ""),
            "username": user_info.get("username", ""),
            "amount_usd": balance_usd,
            "amount_kes": amount_kes,
            "fee_kes": fee_info["fee_kes"],
            "net_kes": fee_info["net_amount_kes"],
        })

    # Whop eligible users
    for opt in whop_opts:
        wallet = conn.execute(
            "SELECT balance_usd FROM creator_wallets WHERE user_id = ?", (opt["user_id"],)
        ).fetchone()
        if not wallet or wallet["balance_usd"] < MINIMUM_WITHDRAWAL_USD:
            continue
        balance_usd = wallet["balance_usd"]
        fee_info = calculate_whop_fee(balance_usd)
        user_info = user_map.get(opt["user_id"], {})
        batch_items.append({
            "user_id": opt["user_id"],
            "phone": "",
            "whop_user_id": opt["whop_user_id"],
            "withdrawal_method": "whop",
            "display_name": user_info.get("display_name", ""),
            "username": user_info.get("username", ""),
            "amount_usd": balance_usd,
            "amount_kes": 0,
            "fee_usd": fee_info["total_fee_usd"],
            "net_usd": fee_info["net_amount_usd"],
        })

    if not batch_items:
        conn.close()
        return {"success": False, "error": "No eligible users for disbursement"}

    total_usd = sum(i["amount_usd"] for i in batch_items)
    total_kes = sum(i["amount_kes"] for i in batch_items)
    mpesa_count = sum(1 for i in batch_items if i["withdrawal_method"] == "mpesa")
    whop_count = sum(1 for i in batch_items if i["withdrawal_method"] == "whop")

    cursor = conn.execute("""
        INSERT INTO disbursement_batches
            (batch_date, total_users, total_amount_usd, total_amount_kes,
             exchange_rate, total_mpesa_users, total_whop_users, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    """, (today, len(batch_items), total_usd, total_kes, rate,
          mpesa_count, whop_count, now_str))
    batch_id = cursor.lastrowid

    for item in batch_items:
        conn.execute("""
            INSERT INTO disbursement_items
                (batch_id, user_id, phone, amount_usd, amount_kes, exchange_rate,
                 withdrawal_method, whop_user_id, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        """, (batch_id, item["user_id"], item.get("phone", ""),
              item["amount_usd"], item["amount_kes"], rate,
              item["withdrawal_method"], item.get("whop_user_id", ""), now_str))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "batch_id": batch_id,
        "total_users": len(batch_items),
        "mpesa_users": mpesa_count,
        "whop_users": whop_count,
        "total_amount_usd": round(total_usd, 2),
        "total_amount_kes": round(total_kes, 0),
        "exchange_rate": rate,
        "items": batch_items,
    }


async def approve_and_execute_batch(batch_id: int, admin_user_id: int,
                                     admin_notes: str = "") -> Dict:
    """Admin approves batch → deduct balances → fire B2C/Whop for each item."""
    import asyncio as _aio
    import whop_payment

    conn = _get_db()
    batch = conn.execute(
        "SELECT * FROM disbursement_batches WHERE id = ?", (batch_id,)
    ).fetchone()

    if not batch:
        conn.close()
        return {"success": False, "error": "Batch not found"}
    if batch["status"] != "pending":
        conn.close()
        return {"success": False, "error": f"Batch is already {batch['status']}"}

    now = datetime.now().isoformat()

    conn.execute("""
        UPDATE disbursement_batches
        SET status = 'approved', admin_approved_by = ?, admin_notes = ?, approved_at = ?
        WHERE id = ?
    """, (admin_user_id, admin_notes, now, batch_id))
    conn.commit()

    items = conn.execute(
        "SELECT * FROM disbursement_items WHERE batch_id = ? AND status = 'pending'",
        (batch_id,)
    ).fetchall()

    # Deduct balances upfront for all items
    for item in items:
        conn.execute("""
            UPDATE creator_wallets
            SET balance_usd = balance_usd - ?, updated_at = ?
            WHERE user_id = ? AND balance_usd >= ?
        """, (item["amount_usd"], now, item["user_id"], item["amount_usd"]))
    conn.commit()

    conn.execute(
        "UPDATE disbursement_batches SET status = 'processing' WHERE id = ?",
        (batch_id,)
    )
    conn.commit()
    conn.close()

    # Split items by method
    mpesa_items = [i for i in items if i.get("withdrawal_method", "mpesa") == "mpesa"]
    whop_items = [i for i in items if i.get("withdrawal_method") == "whop"]

    results = {"sent": 0, "failed": 0, "errors": []}

    # Process M-Pesa items via B2C
    for item in mpesa_items:
        b2c_result = await initiate_b2c_payment(
            phone=item["phone"],
            amount_kes=int(item["amount_kes"]),
            disbursement_item_id=item["id"],
            remarks="SparkAI commission payout",
            occasion=f"Batch-{batch_id}",
        )

        if b2c_result["success"]:
            results["sent"] += 1
        else:
            results["failed"] += 1
            results["errors"].append({"user_id": item["user_id"], "method": "mpesa",
                                      "error": b2c_result.get("error", "Unknown")})
            fail_conn = _get_db()
            fail_conn.execute("""
                UPDATE disbursement_items SET status = 'failed', failure_reason = ? WHERE id = ?
            """, (b2c_result.get("error", "B2C initiation failed"), item["id"]))
            fail_conn.commit()
            fail_conn.close()
            _refund_disbursement_item(dict(item))

        await _aio.sleep(1)

    # Process Whop items via transfer
    for item in whop_items:
        whop_uid = item.get("whop_user_id", "")
        if not whop_uid:
            results["failed"] += 1
            results["errors"].append({"user_id": item["user_id"], "method": "whop",
                                      "error": "No Whop user ID"})
            _refund_disbursement_item(dict(item))
            continue

        transfer_result = whop_payment.create_transfer(
            destination_id=whop_uid,
            amount_usd=item["amount_usd"],
            notes=f"Earnings payout #{item['id']}",
            idempotence_key=f"batch_{batch_id}_item_{item['id']}",
        )

        item_conn = _get_db()
        if transfer_result.get("success"):
            results["sent"] += 1
            item_conn.execute("""
                UPDATE disbursement_items
                SET status = 'completed', whop_transfer_id = ?, completed_at = ?
                WHERE id = ?
            """, (transfer_result.get("transfer_id", ""), now, item["id"]))
            item_conn.commit()
            logger.info(f"[Whop] Payout item={item['id']} user={item['user_id']} "
                        f"amount=${item['amount_usd']} transfer={transfer_result.get('transfer_id')}")
        else:
            results["failed"] += 1
            error_msg = transfer_result.get("error", "Whop transfer failed")
            results["errors"].append({"user_id": item["user_id"], "method": "whop", "error": error_msg})
            item_conn.execute("""
                UPDATE disbursement_items SET status = 'failed', failure_reason = ? WHERE id = ?
            """, (error_msg, item["id"]))
            item_conn.commit()
            _refund_disbursement_item(dict(item))
            logger.warning(f"[Whop] Failed item={item['id']}: {error_msg}")

        item_conn.close()
        await _aio.sleep(1)

    # Check batch completion
    _check_batch_completion(batch_id)

    return {"success": True, "batch_id": batch_id, "sent": results["sent"],
            "failed": results["failed"], "errors": results["errors"]}


def get_pending_disbursement_batch() -> Dict:
    """Get current pending/processing batch with items and user info."""
    import sqlite3 as _sq

    conn = _get_db()
    batch = conn.execute("""
        SELECT * FROM disbursement_batches
        WHERE status IN ('pending', 'approved', 'processing', 'partially_completed')
        ORDER BY created_at DESC LIMIT 1
    """).fetchone()

    if not batch:
        conn.close()
        return {"batch": None, "items": []}

    items = conn.execute("""
        SELECT * FROM disbursement_items WHERE batch_id = ?
        ORDER BY status ASC, amount_kes DESC
    """, (batch["id"],)).fetchall()
    conn.close()

    users_conn = _sq.connect(os.path.join(os.path.dirname(__file__), "users.db"), timeout=10)
    users_conn.row_factory = _sq.Row

    enriched_items = []
    for item in items:
        user = users_conn.execute(
            "SELECT display_name, username FROM users WHERE id = ?",
            (item["user_id"],)
        ).fetchone()
        d = dict(item)
        d["display_name"] = user["display_name"] if user else ""
        d["username"] = user["username"] if user else ""
        d["phone_masked"] = item["phone"][:6] + "***" + item["phone"][-2:] if item["phone"] else ""
        enriched_items.append(d)

    users_conn.close()
    return {"batch": dict(batch), "items": enriched_items}


def get_disbursement_history(limit: int = 20) -> Dict:
    """Get past disbursement batches."""
    conn = _get_db()
    batches = conn.execute("""
        SELECT * FROM disbursement_batches ORDER BY created_at DESC LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return {"batches": [dict(b) for b in batches]}


def cancel_disbursement_batch(batch_id: int) -> Dict:
    """Cancel a pending batch. Only works before approval (no balances deducted yet)."""
    conn = _get_db()
    batch = conn.execute(
        "SELECT * FROM disbursement_batches WHERE id = ?", (batch_id,)
    ).fetchone()

    if not batch:
        conn.close()
        return {"success": False, "error": "Batch not found"}
    if batch["status"] != "pending":
        conn.close()
        return {"success": False, "error": f"Cannot cancel — batch is {batch['status']}"}

    now = datetime.now().isoformat()
    conn.execute("UPDATE disbursement_batches SET status = 'cancelled', completed_at = ? WHERE id = ?",
                 (now, batch_id))
    conn.execute("UPDATE disbursement_items SET status = 'cancelled' WHERE batch_id = ?", (batch_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Batch cancelled"}


async def retry_disbursement_item(item_id: int) -> Dict:
    """Retry a failed/timed-out B2C disbursement item (max 3 retries)."""
    conn = _get_db()
    item = conn.execute("SELECT * FROM disbursement_items WHERE id = ?", (item_id,)).fetchone()

    if not item:
        conn.close()
        return {"success": False, "error": "Item not found"}
    if item["status"] not in ("failed", "timeout"):
        conn.close()
        return {"success": False, "error": f"Item is {item['status']}, cannot retry"}
    if item["retry_count"] >= 3:
        conn.close()
        return {"success": False, "error": "Max retries (3) reached"}

    wallet = conn.execute(
        "SELECT balance_usd FROM creator_wallets WHERE user_id = ?", (item["user_id"],)
    ).fetchone()
    if not wallet or wallet["balance_usd"] < item["amount_usd"]:
        conn.close()
        return {"success": False, "error": "Insufficient balance for retry"}

    now = datetime.now().isoformat()
    conn.execute("""
        UPDATE creator_wallets SET balance_usd = balance_usd - ?, updated_at = ?
        WHERE user_id = ?
    """, (item["amount_usd"], now, item["user_id"]))
    conn.execute("""
        UPDATE disbursement_items
        SET status = 'pending', failure_reason = '', retry_count = retry_count + 1
        WHERE id = ?
    """, (item_id,))
    conn.commit()
    conn.close()

    result = await initiate_b2c_payment(
        phone=item["phone"],
        amount_kes=int(item["amount_kes"]),
        disbursement_item_id=item_id,
        remarks="SparkAI commission payout (retry)",
    )

    if not result["success"]:
        fail_conn = _get_db()
        fail_conn.execute("""
            UPDATE disbursement_items SET status = 'failed', failure_reason = ? WHERE id = ?
        """, (result.get("error", "Retry failed"), item_id))
        fail_conn.commit()
        fail_conn.close()
        _refund_disbursement_item(dict(item))

    return result
