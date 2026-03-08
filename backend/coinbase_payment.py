"""
NOWPayments Crypto Payment Integration for Spark AI Prediction
Handles cryptocurrency payments via NOWPayments API (invoice-based hosted checkout).
Works alongside M-Pesa and Whop (card) as an alternative payment method.

Migrated from Coinbase Commerce to NOWPayments for simpler merchant onboarding.
"""

import os
import json
import hmac
import hashlib
import sqlite3
import logging
import requests
from datetime import datetime
from typing import Dict, Optional

import community
import subscriptions
import pricing_config as _pc

logger = logging.getLogger(__name__)

DB_PATH = "community.db"

NOWPAYMENTS_API_KEY = os.environ.get("NOWPAYMENTS_API_KEY", "")
NOWPAYMENTS_IPN_SECRET = os.environ.get("NOWPAYMENTS_IPN_SECRET", "")
NOWPAYMENTS_API_URL = "https://api.nowpayments.io/v1"


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _get_users_db():
    conn = sqlite3.connect("users.db")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_coinbase_db():
    """Create crypto transaction table (kept name for backward compat)."""
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS coinbase_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            transaction_type TEXT NOT NULL,
            reference_id TEXT DEFAULT '',
            amount_usd REAL NOT NULL,
            coinbase_charge_id TEXT DEFAULT '',
            coinbase_charge_code TEXT DEFAULT '',
            hosted_url TEXT DEFAULT '',
            payment_status TEXT DEFAULT 'pending',
            crypto_currency TEXT DEFAULT '',
            crypto_amount TEXT DEFAULT '',
            metadata TEXT DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT,
            completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_cb_user ON coinbase_transactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_cb_status ON coinbase_transactions(payment_status);
        CREATE INDEX IF NOT EXISTS idx_cb_charge ON coinbase_transactions(coinbase_charge_id);
        CREATE INDEX IF NOT EXISTS idx_cb_code ON coinbase_transactions(coinbase_charge_code);
    """)
    conn.commit()
    conn.close()
    logger.info("[NOWPayments] Database tables initialized")


# ==================== INVOICE CREATION ====================

def create_charge(
    user_id: int,
    transaction_type: str,
    amount_usd: float,
    reference_id: str = "",
    title: str = "Spark AI Payment",
    description: str = "",
) -> Dict:
    """Create a NOWPayments invoice for crypto payment.

    Uses the invoice-based hosted checkout flow. User picks their coin
    on the NOWPayments page, and we poll / get IPN callbacks for status.
    """
    if not NOWPAYMENTS_API_KEY:
        return {"success": False, "error": "Crypto payments not configured. Admin needs to add NOWPayments API key."}

    now = datetime.now().isoformat()

    # Build unique order_id that encodes our metadata
    order_id = f"spark_{user_id}_{transaction_type}_{reference_id}_{int(datetime.now().timestamp())}"

    try:
        headers = {
            "x-api-key": NOWPAYMENTS_API_KEY,
            "Content-Type": "application/json",
        }

        invoice_data = {
            "price_amount": round(amount_usd, 2),
            "price_currency": "usd",
            "order_id": order_id,
            "order_description": description or f"Spark AI - {transaction_type.replace('_', ' ').title()}",
            "ipn_callback_url": "https://spark-ai-prediction.com/api/webhook/coinbase",
            "success_url": "https://spark-ai-prediction.com/upgrade?crypto=success",
            "cancel_url": "https://spark-ai-prediction.com/upgrade?crypto=cancelled",
        }

        resp = requests.post(
            f"{NOWPAYMENTS_API_URL}/invoice",
            headers=headers,
            json=invoice_data,
            timeout=15,
        )

        if resp.status_code not in (200, 201):
            error_msg = resp.text[:300]
            logger.error(f"[NOWPayments] Invoice creation failed: {resp.status_code} {error_msg}")
            return {"success": False, "error": f"Failed to create invoice: {error_msg}"}

        data = resp.json()
        invoice_id = str(data.get("id", ""))
        invoice_url = data.get("invoice_url", "")

        logger.info(f"[NOWPayments] Invoice created: id={invoice_id}, order={order_id}, url={invoice_url}")

        # Store metadata for webhook/polling lookup
        metadata = {
            "spark_user_id": str(user_id),
            "transaction_type": transaction_type,
            "reference_id": reference_id,
        }

        # Store in DB — reuse coinbase_transactions table columns:
        #   coinbase_charge_id  -> nowpayments invoice id
        #   coinbase_charge_code -> order_id (our lookup key)
        #   hosted_url -> invoice_url
        conn = _get_db()
        conn.execute("""
            INSERT INTO coinbase_transactions
                (user_id, transaction_type, reference_id, amount_usd,
                 coinbase_charge_id, coinbase_charge_code, hosted_url,
                 payment_status, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        """, (
            user_id, transaction_type, reference_id, amount_usd,
            invoice_id, order_id, invoice_url,
            json.dumps(metadata), now, now,
        ))
        conn.commit()
        conn.close()

        return {
            "success": True,
            "charge_id": invoice_id,
            "charge_code": order_id,
            "hosted_url": invoice_url,
        }

    except requests.RequestException as e:
        logger.error(f"[NOWPayments] Network error creating invoice: {e}")
        return {"success": False, "error": f"Network error: {str(e)}"}
    except Exception as e:
        logger.error(f"[NOWPayments] Error creating invoice: {e}")
        return {"success": False, "error": f"Failed to create invoice: {str(e)}"}


# ==================== PAYMENT STATUS ====================

def check_charge_status(charge_code: str, user_id: int) -> str:
    """Check NOWPayments payment status via our DB + IPN updates.

    The IPN webhook updates the DB, so polling just reads our local state.
    We also do a direct API check as fallback.
    """
    conn = _get_db()
    row = conn.execute(
        "SELECT payment_status, transaction_type, reference_id, amount_usd, coinbase_charge_id "
        "FROM coinbase_transactions WHERE coinbase_charge_code = ? AND user_id = ?",
        (charge_code, user_id)
    ).fetchone()
    conn.close()

    if not row:
        return "pending"

    if row["payment_status"] in ("completed", "failed", "expired"):
        return row["payment_status"]

    # Still pending — try checking NOWPayments API directly
    if not NOWPAYMENTS_API_KEY:
        return "pending"

    try:
        # List payments for this invoice
        headers = {"x-api-key": NOWPAYMENTS_API_KEY}
        resp = requests.get(
            f"{NOWPAYMENTS_API_URL}/payment/?invoiceId={row['coinbase_charge_id']}&limit=1&sortBy=created_at&orderBy=desc",
            headers=headers,
            timeout=10,
        )

        if resp.status_code != 200:
            return "pending"

        data = resp.json()
        payments = data.get("data", [])

        if not payments:
            return "pending"

        payment = payments[0]
        np_status = payment.get("payment_status", "").lower()
        pay_currency = payment.get("pay_currency", "").upper()
        actually_paid = str(payment.get("actually_paid", ""))

        # Map NOWPayments statuses to our statuses
        if np_status in ("finished", "confirmed", "sending"):
            _fulfill_payment(
                user_id=user_id,
                transaction_type=row["transaction_type"],
                reference_id=row["reference_id"] or "",
                charge_code=charge_code,
                amount_usd=row["amount_usd"],
                crypto_currency=pay_currency,
                crypto_amount=actually_paid,
            )
            return "completed"
        elif np_status == "expired":
            _update_status(charge_code, user_id, "expired")
            return "expired"
        elif np_status in ("failed", "refunded"):
            _update_status(charge_code, user_id, "failed")
            return "failed"
        # waiting, confirming, partially_paid -> still pending
    except Exception as e:
        logger.error(f"[NOWPayments] Error checking payment status: {e}")

    return "pending"


def _update_status(charge_code: str, user_id: int, status: str):
    """Update transaction status in DB."""
    now = datetime.now().isoformat()
    conn = _get_db()
    conn.execute(
        "UPDATE coinbase_transactions SET payment_status = ?, updated_at = ? "
        "WHERE coinbase_charge_code = ? AND user_id = ?",
        (status, now, charge_code, user_id)
    )
    conn.commit()
    conn.close()


# ==================== FULFILLMENT ====================

def _fulfill_payment(user_id: int, transaction_type: str, reference_id: str,
                     charge_code: str, amount_usd: float,
                     crypto_currency: str = "", crypto_amount: str = ""):
    """Fulfill a confirmed crypto payment: activate subscription, credit balance, or unlock prediction."""
    now = datetime.now().isoformat()

    # Check if already fulfilled (prevent double-fulfillment)
    conn = _get_db()
    existing = conn.execute(
        "SELECT payment_status FROM coinbase_transactions WHERE coinbase_charge_code = ? AND user_id = ?",
        (charge_code, user_id)
    ).fetchone()
    if existing and existing["payment_status"] == "completed":
        conn.close()
        logger.info(f"[NOWPayments] Payment {charge_code} already fulfilled, skipping")
        return

    conn.execute("""
        UPDATE coinbase_transactions
        SET payment_status = 'completed', crypto_currency = ?, crypto_amount = ?,
            updated_at = ?, completed_at = ?
        WHERE coinbase_charge_code = ? AND user_id = ? AND payment_status != 'completed'
    """, (crypto_currency, crypto_amount, now, now, charge_code, user_id))
    conn.commit()
    conn.close()

    if transaction_type == "subscription":
        subscriptions.create_subscription(
            user_id=user_id,
            plan_id=reference_id,
            payment_method="crypto",
            payment_ref=f"nowpay:{charge_code}",
        )
        _process_referral_commission(user_id, reference_id, "crypto",
                                     amount_usd=amount_usd, transaction_type="subscription")
        logger.info(f"[NOWPayments] Subscription activated: user={user_id}, plan={reference_id}")

    elif transaction_type == "prediction_purchase":
        community.purchase_prediction(
            prediction_id=int(reference_id),
            buyer_id=user_id,
            payment_method="crypto",
            payment_ref=f"nowpay:{charge_code}",
        )
        _process_referral_commission(user_id, reference_id, "crypto",
                                     amount_usd=amount_usd, transaction_type="prediction_purchase")
        logger.info(f"[NOWPayments] Prediction purchased: user={user_id}, prediction={reference_id}")

    elif transaction_type == "balance_topup":
        community.adjust_user_balance(
            user_id=user_id,
            amount_usd=amount_usd,
            amount_kes=0,
            reason="Pay on the Go deposit via Crypto",
            adjustment_type="topup",
        )
        try:
            usd_rate = int(_pc.get("credit_rate_usd", 1300))
            credit_amount = int(amount_usd * usd_rate) if amount_usd > 0 else 0
            if credit_amount > 0:
                community.add_credits(user_id, credit_amount, f"Crypto deposit ${amount_usd:.2f}")
                print(f"[Credits] User {user_id} credited {credit_amount} credits from crypto deposit")
        except Exception as e:
            print(f"[Credits] Error adding credits for crypto deposit: {e}")
        _process_referral_commission(user_id, "balance_topup", "crypto",
                                     amount_usd=amount_usd, transaction_type="balance_topup")
        logger.info(f"[NOWPayments] Balance topped up: user={user_id}, amount=${amount_usd}")

    # Send invoice email
    try:
        import user_auth
        user_info = user_auth.get_user_email_by_id(user_id)
        if user_info and user_info.get("email"):
            conn = _get_db()
            tx_row = conn.execute(
                "SELECT id FROM coinbase_transactions WHERE coinbase_charge_code = ? AND user_id = ?",
                (charge_code, user_id)
            ).fetchone()
            conn.close()
            tx_id = tx_row["id"] if tx_row else 0
            invoice_num = f"SPARK-{datetime.now().strftime('%Y%m%d')}-C{tx_id}"
            crypto_label = f" ({crypto_currency})" if crypto_currency else ""
            user_auth.send_invoice_email(
                to_email=user_info["email"],
                display_name=user_info.get("display_name", ""),
                invoice_number=invoice_num,
                transaction_type=transaction_type,
                amount_usd=amount_usd,
                payment_method=f"Crypto{crypto_label}",
                reference=charge_code,
            )
    except Exception as e:
        logger.error(f"[NOWPayments] Failed to send invoice email: {e}")

    # Send push notification
    try:
        import push_notifications
        type_labels = {
            "subscription": "Subscription activated",
            "balance_topup": "Credits purchased",
            "prediction_purchase": "Prediction unlocked",
        }
        push_notifications.send_push_notification(
            user_id=user_id,
            notif_type="withdrawal",
            title="Crypto Payment Confirmed",
            message=f"{type_labels.get(transaction_type, 'Payment')} - ${amount_usd:.2f} via {crypto_currency or 'crypto'}",
            metadata={"charge_code": charge_code},
        )
    except Exception as e:
        logger.error(f"[NOWPayments] Failed to send notification: {e}")


# ==================== WEBHOOK (IPN) ====================

def verify_webhook(payload: bytes, signature: str) -> bool:
    """Verify NOWPayments IPN webhook signature (HMAC-SHA512, sorted keys)."""
    if not NOWPAYMENTS_IPN_SECRET:
        logger.warning("[NOWPayments] No IPN secret configured — accepting webhook without verification")
        return True  # Allow processing if no secret set (dev mode)

    try:
        body = json.loads(payload)
        sorted_body = json.dumps(body, separators=(',', ':'), sort_keys=True)
        expected = hmac.new(
            NOWPAYMENTS_IPN_SECRET.encode("utf-8"),
            sorted_body.encode("utf-8"),
            hashlib.sha512,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)
    except Exception as e:
        logger.error(f"[NOWPayments] Webhook signature verification error: {e}")
        return False


def process_webhook_event(event: dict) -> dict:
    """Process a NOWPayments IPN callback.

    NOWPayments sends the payment object directly (not wrapped in event.data).
    Fields: payment_id, payment_status, order_id, pay_currency, actually_paid, etc.
    """
    order_id = event.get("order_id", "")
    payment_status = event.get("payment_status", "").lower()
    payment_id = str(event.get("payment_id", ""))
    pay_currency = event.get("pay_currency", "").upper()
    actually_paid = str(event.get("actually_paid", ""))

    logger.info(f"[NOWPayments] IPN: order={order_id}, status={payment_status}, payment_id={payment_id}")

    if not order_id:
        return {"success": False, "error": "Missing order_id"}

    # Look up by order_id (stored as coinbase_charge_code)
    conn = _get_db()
    row = conn.execute(
        "SELECT user_id, payment_status as db_status, amount_usd, transaction_type, reference_id "
        "FROM coinbase_transactions WHERE coinbase_charge_code = ?",
        (order_id,)
    ).fetchone()
    conn.close()

    if not row:
        logger.warning(f"[NOWPayments] IPN for unknown order: {order_id}")
        return {"success": False, "error": "Transaction not found"}

    user_id = row["user_id"]

    if row["db_status"] == "completed":
        logger.info(f"[NOWPayments] Order {order_id} already fulfilled, skipping")
        return {"success": True, "message": "Already processed"}

    if payment_status in ("finished", "confirmed"):
        _fulfill_payment(
            user_id=user_id,
            transaction_type=row["transaction_type"],
            reference_id=row["reference_id"] or "",
            charge_code=order_id,
            amount_usd=row["amount_usd"],
            crypto_currency=pay_currency,
            crypto_amount=actually_paid,
        )
        return {"success": True, "message": "Payment fulfilled"}

    elif payment_status == "expired":
        _update_status(order_id, user_id, "expired")
        return {"success": True, "message": "Marked as expired"}

    elif payment_status in ("failed", "refunded"):
        _update_status(order_id, user_id, "failed")
        return {"success": True, "message": "Marked as failed"}

    elif payment_status in ("waiting", "confirming", "sending", "partially_paid"):
        logger.info(f"[NOWPayments] Order {order_id} status: {payment_status}")
        return {"success": True, "message": f"Status: {payment_status}"}

    return {"success": True, "message": f"Status {payment_status} acknowledged"}


# ==================== REFERRAL COMMISSION ====================

def _process_referral_commission(user_id: int, reference_id: str, payment_method: str,
                                  amount_usd: float = 0, transaction_type: str = ""):
    """Award referral commission if user was referred by someone."""
    try:
        conn_users = _get_users_db()
        user = conn_users.execute(
            "SELECT referred_by FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        conn_users.close()

        if not user or not user["referred_by"]:
            return

        referrer_id = user["referred_by"]
        commission_rate = float(_pc.get("referral_commission_rate", 0.30))
        commission = round(amount_usd * commission_rate, 2)

        if commission <= 0:
            return

        conn = _get_db()
        conn.execute("""
            INSERT INTO referral_earnings
                (referrer_id, referred_id, subscription_plan, subscription_amount,
                 commission_rate, commission_amount, payment_method, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            referrer_id, user_id, reference_id, amount_usd,
            commission_rate, commission, payment_method, datetime.now().isoformat(),
        ))
        conn.commit()
        conn.close()

        community.adjust_user_balance(
            user_id=referrer_id,
            amount_usd=commission,
            amount_kes=0,
            reason=f"Referral commission (crypto payment by user {user_id})",
            adjustment_type="referral",
        )
        logger.info(f"[NOWPayments] Referral commission: ${commission} to user {referrer_id}")

    except Exception as e:
        logger.error(f"[NOWPayments] Referral commission error: {e}")


# ==================== ADMIN QUERIES ====================

def get_transactions(offset: int = 0, limit: int = 50, status: str = None) -> list:
    """Get crypto transactions for admin view."""
    conn = _get_db()
    query = "SELECT * FROM coinbase_transactions"
    params = []

    if status:
        query += " WHERE payment_status = ?"
        params.append(status)

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_analytics(start_date: str = None, end_date: str = None) -> dict:
    """Get crypto transaction analytics for admin dashboard."""
    from datetime import timedelta, timezone
    EAT = timezone(timedelta(hours=3))
    now_eat = datetime.now(EAT)
    now_str = now_eat.strftime("%Y-%m-%d %H:%M:%S")

    today_start = now_eat.replace(hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")
    days_since_monday = now_eat.weekday()
    week_start = (now_eat - timedelta(days=days_since_monday)).replace(
        hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")
    month_start = now_eat.replace(day=1, hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")

    conn = _get_db()
    status_cond = "payment_status = 'completed'"

    def _q(sql, params=()):
        try:
            return conn.execute(sql, params).fetchone()
        except Exception:
            return None

    daily = _q(f"SELECT COALESCE(SUM(amount_usd), 0) as total, COUNT(*) as count "
               f"FROM coinbase_transactions WHERE {status_cond} "
               f"AND datetime(completed_at) >= datetime(?) AND datetime(completed_at) <= datetime(?)",
               (today_start, now_str))
    weekly = _q(f"SELECT COALESCE(SUM(amount_usd), 0) as total, COUNT(*) as count "
                f"FROM coinbase_transactions WHERE {status_cond} "
                f"AND datetime(completed_at) >= datetime(?) AND datetime(completed_at) <= datetime(?)",
                (week_start, now_str))
    monthly = _q(f"SELECT COALESCE(SUM(amount_usd), 0) as total, COUNT(*) as count "
                 f"FROM coinbase_transactions WHERE {status_cond} "
                 f"AND datetime(completed_at) >= datetime(?) AND datetime(completed_at) <= datetime(?)",
                 (month_start, now_str))

    conn.close()

    return {
        "daily": {"total": daily["total"] if daily else 0, "count": daily["count"] if daily else 0},
        "weekly": {"total": weekly["total"] if weekly else 0, "count": weekly["count"] if weekly else 0},
        "monthly": {"total": monthly["total"] if monthly else 0, "count": monthly["count"] if monthly else 0},
    }
