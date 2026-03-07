"""
Coinbase Commerce Payment Integration for Spark AI Prediction
Handles cryptocurrency payments via Coinbase Commerce API.
Works alongside M-Pesa and Whop (card) as an alternative payment method.
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

COINBASE_COMMERCE_API_KEY = os.environ.get("COINBASE_COMMERCE_API_KEY", "")
COINBASE_WEBHOOK_SECRET = os.environ.get("COINBASE_WEBHOOK_SECRET", "")
COINBASE_API_URL = "https://api.commerce.coinbase.com"


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
    """Create Coinbase Commerce transaction table."""
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
    logger.info("[Coinbase] Database tables initialized")


# ==================== CHARGE CREATION ====================

def create_charge(
    user_id: int,
    transaction_type: str,
    amount_usd: float,
    reference_id: str = "",
    title: str = "Spark AI Payment",
    description: str = "",
) -> Dict:
    """Create a Coinbase Commerce charge for crypto payment.

    Args:
        user_id: The ID of the user making the payment
        transaction_type: 'subscription', 'prediction_purchase', or 'balance_topup'
        amount_usd: Amount to charge in USD
        reference_id: Plan ID or prediction ID
        title: Display title for the charge
        description: Description shown on payment page
    """
    if not COINBASE_COMMERCE_API_KEY:
        return {"success": False, "error": "Coinbase Commerce not configured. Admin needs to add API key."}

    now = datetime.now().isoformat()

    metadata = {
        "spark_user_id": str(user_id),
        "transaction_type": transaction_type,
        "reference_id": reference_id,
    }

    try:
        # Create charge via Coinbase Commerce API
        headers = {
            "Content-Type": "application/json",
            "X-CC-Api-Key": COINBASE_COMMERCE_API_KEY,
            "X-CC-Version": "2018-03-22",
        }

        charge_data = {
            "name": title,
            "description": description or f"Spark AI - {transaction_type.replace('_', ' ').title()}",
            "pricing_type": "fixed_price",
            "local_price": {
                "amount": str(round(amount_usd, 2)),
                "currency": "USD",
            },
            "metadata": metadata,
            "redirect_url": "https://spark-ai-prediction.com/upgrade?crypto=success",
            "cancel_url": "https://spark-ai-prediction.com/upgrade?crypto=cancelled",
        }

        resp = requests.post(
            f"{COINBASE_API_URL}/charges",
            headers=headers,
            json=charge_data,
            timeout=15,
        )

        if resp.status_code not in (200, 201):
            error_msg = resp.text[:300]
            logger.error(f"[Coinbase] Charge creation failed: {resp.status_code} {error_msg}")
            return {"success": False, "error": f"Failed to create charge: {error_msg}"}

        charge = resp.json().get("data", {})
        charge_id = charge.get("id", "")
        charge_code = charge.get("code", "")
        hosted_url = charge.get("hosted_url", "")

        logger.info(f"[Coinbase] Charge created: id={charge_id}, code={charge_code}, url={hosted_url}")

        # Store in DB
        conn = _get_db()
        conn.execute("""
            INSERT INTO coinbase_transactions
                (user_id, transaction_type, reference_id, amount_usd,
                 coinbase_charge_id, coinbase_charge_code, hosted_url,
                 payment_status, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        """, (
            user_id, transaction_type, reference_id, amount_usd,
            charge_id, charge_code, hosted_url,
            json.dumps(metadata), now, now,
        ))
        conn.commit()
        conn.close()

        return {
            "success": True,
            "charge_id": charge_id,
            "charge_code": charge_code,
            "hosted_url": hosted_url,
        }

    except requests.RequestException as e:
        logger.error(f"[Coinbase] Network error creating charge: {e}")
        return {"success": False, "error": f"Network error: {str(e)}"}
    except Exception as e:
        logger.error(f"[Coinbase] Error creating charge: {e}")
        return {"success": False, "error": f"Failed to create charge: {str(e)}"}


# ==================== PAYMENT STATUS ====================

def check_charge_status(charge_code: str, user_id: int) -> str:
    """Check Coinbase Commerce charge status and fulfill if confirmed.

    Called from the polling endpoint. Returns: 'pending', 'completed', 'expired', or 'failed'.
    """
    # Check our DB first
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

    # Still pending — check Coinbase API
    if not COINBASE_COMMERCE_API_KEY:
        return "pending"

    try:
        headers = {
            "X-CC-Api-Key": COINBASE_COMMERCE_API_KEY,
            "X-CC-Version": "2018-03-22",
        }
        resp = requests.get(
            f"{COINBASE_API_URL}/charges/{row['coinbase_charge_id']}",
            headers=headers,
            timeout=10,
        )

        if resp.status_code != 200:
            return "pending"

        charge = resp.json().get("data", {})
        timeline = charge.get("timeline", [])

        # Check latest status from timeline
        if timeline:
            latest_status = timeline[-1].get("status", "").upper()

            if latest_status == "COMPLETED":
                # Payment confirmed on blockchain
                payments = charge.get("payments", [])
                crypto_currency = ""
                crypto_amount = ""
                if payments:
                    network = payments[0].get("network", "")
                    value = payments[0].get("value", {})
                    crypto_currency = value.get("crypto", {}).get("currency", network)
                    crypto_amount = value.get("crypto", {}).get("amount", "")

                _fulfill_payment(
                    user_id=user_id,
                    transaction_type=row["transaction_type"],
                    reference_id=row["reference_id"] or "",
                    charge_code=charge_code,
                    amount_usd=row["amount_usd"],
                    crypto_currency=crypto_currency,
                    crypto_amount=crypto_amount,
                )
                return "completed"

            elif latest_status == "EXPIRED":
                _update_status(charge_code, user_id, "expired")
                return "expired"

            elif latest_status in ("CANCELED", "UNRESOLVED"):
                _update_status(charge_code, user_id, "failed")
                return "failed"

    except Exception as e:
        logger.error(f"[Coinbase] Error checking charge status: {e}")

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

    # Update transaction record
    conn = _get_db()
    conn.execute("""
        UPDATE coinbase_transactions
        SET payment_status = 'completed', crypto_currency = ?, crypto_amount = ?,
            updated_at = ?, completed_at = ?
        WHERE coinbase_charge_code = ? AND user_id = ? AND payment_status = 'pending'
    """, (crypto_currency, crypto_amount, now, now, charge_code, user_id))
    conn.commit()
    conn.close()

    if transaction_type == "subscription":
        subscriptions.create_subscription(
            user_id=user_id,
            plan_id=reference_id,
            payment_method="crypto",
            payment_ref=f"coinbase:{charge_code}",
        )
        _process_referral_commission(user_id, reference_id, "crypto",
                                     amount_usd=amount_usd, transaction_type="subscription")
        logger.info(f"[Coinbase] Subscription activated: user={user_id}, plan={reference_id}")

    elif transaction_type == "prediction_purchase":
        community.purchase_prediction(
            prediction_id=int(reference_id),
            buyer_id=user_id,
            payment_method="crypto",
            payment_ref=f"coinbase:{charge_code}",
        )
        _process_referral_commission(user_id, reference_id, "crypto",
                                     amount_usd=amount_usd, transaction_type="prediction_purchase")
        logger.info(f"[Coinbase] Prediction purchased: user={user_id}, prediction={reference_id}")

    elif transaction_type == "balance_topup":
        community.adjust_user_balance(
            user_id=user_id,
            amount_usd=amount_usd,
            amount_kes=0,
            reason="Pay on the Go deposit via Crypto",
            adjustment_type="topup",
        )
        # Convert to credits
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
        logger.info(f"[Coinbase] Balance topped up: user={user_id}, amount=${amount_usd}")

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
        logger.error(f"[Coinbase] Failed to send invoice email: {e}")

    # Send notification
    try:
        import push_notifications
        type_labels = {
            "subscription": "Subscription activated",
            "balance_topup": "Credits purchased",
            "prediction_purchase": "Prediction unlocked",
        }
        push_notifications.send_push_notification(
            user_id=user_id,
            notif_type="withdrawal",  # Uses money icon
            title="Crypto Payment Confirmed",
            message=f"{type_labels.get(transaction_type, 'Payment')} - ${amount_usd:.2f} via {crypto_currency or 'crypto'}",
            metadata={"charge_code": charge_code},
        )
    except Exception as e:
        logger.error(f"[Coinbase] Failed to send notification: {e}")


# ==================== WEBHOOK ====================

def verify_webhook(payload: bytes, signature: str) -> bool:
    """Verify Coinbase Commerce webhook signature."""
    if not COINBASE_WEBHOOK_SECRET:
        logger.warning("[Coinbase] No webhook secret configured")
        return False

    expected = hmac.new(
        COINBASE_WEBHOOK_SECRET.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


def process_webhook_event(event: dict) -> dict:
    """Process a verified Coinbase Commerce webhook event."""
    event_type = event.get("type", "")
    event_data = event.get("event", {}).get("data", {}) if "event" in event else event.get("data", {})

    charge_code = event_data.get("code", "")
    charge_id = event_data.get("id", "")
    metadata = event_data.get("metadata", {})

    user_id_str = metadata.get("spark_user_id", "")
    transaction_type = metadata.get("transaction_type", "")
    reference_id = metadata.get("reference_id", "")

    logger.info(f"[Coinbase] Webhook: type={event_type}, code={charge_code}, user={user_id_str}")

    if not user_id_str or not charge_code:
        return {"success": False, "error": "Missing metadata"}

    user_id = int(user_id_str)

    # Check if already fulfilled
    conn = _get_db()
    row = conn.execute(
        "SELECT payment_status, amount_usd FROM coinbase_transactions "
        "WHERE coinbase_charge_code = ? AND user_id = ?",
        (charge_code, user_id)
    ).fetchone()
    conn.close()

    if not row:
        logger.warning(f"[Coinbase] Webhook for unknown charge: {charge_code}")
        return {"success": False, "error": "Transaction not found"}

    if row["payment_status"] == "completed":
        logger.info(f"[Coinbase] Charge {charge_code} already fulfilled, skipping")
        return {"success": True, "message": "Already processed"}

    if event_type in ("charge:confirmed", "charge:completed"):
        # Extract crypto details from payments array
        payments = event_data.get("payments", [])
        crypto_currency = ""
        crypto_amount = ""
        if payments:
            value = payments[0].get("value", {})
            crypto_currency = value.get("crypto", {}).get("currency", "")
            crypto_amount = value.get("crypto", {}).get("amount", "")

        _fulfill_payment(
            user_id=user_id,
            transaction_type=transaction_type,
            reference_id=reference_id,
            charge_code=charge_code,
            amount_usd=row["amount_usd"],
            crypto_currency=crypto_currency,
            crypto_amount=crypto_amount,
        )
        return {"success": True, "message": "Payment fulfilled"}

    elif event_type == "charge:failed":
        _update_status(charge_code, user_id, "failed")
        return {"success": True, "message": "Marked as failed"}

    elif event_type == "charge:expired":
        _update_status(charge_code, user_id, "expired")
        return {"success": True, "message": "Marked as expired"}

    elif event_type == "charge:pending":
        logger.info(f"[Coinbase] Charge {charge_code} pending (awaiting confirmations)")
        return {"success": True, "message": "Pending confirmation"}

    return {"success": True, "message": f"Event {event_type} acknowledged"}


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

        # Credit referrer's balance
        community.adjust_user_balance(
            user_id=referrer_id,
            amount_usd=commission,
            amount_kes=0,
            reason=f"Referral commission (crypto payment by user {user_id})",
            adjustment_type="referral",
        )
        logger.info(f"[Coinbase] Referral commission: ${commission} to user {referrer_id}")

    except Exception as e:
        logger.error(f"[Coinbase] Referral commission error: {e}")


# ==================== ADMIN QUERIES ====================

def get_transactions(offset: int = 0, limit: int = 50, status: str = None) -> list:
    """Get coinbase transactions for admin view."""
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
