"""
Whop Payment Integration for Spark AI Prediction
Handles card payments via Whop checkout, webhook processing, and transfers for payouts.
Works alongside M-Pesa/Swypt as an alternative payment method.
"""

import os
import json
import hmac
import hashlib
import base64
import sqlite3
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict
from whop_sdk import Whop

import community
import subscriptions
import pricing_config

logger = logging.getLogger(__name__)

DB_PATH = "community.db"

WHOP_API_KEY = os.environ.get("WHOP_API_KEY", "")
WHOP_COMPANY_ID = os.environ.get("WHOP_COMPANY_ID", "")
WHOP_WEBHOOK_SECRET = os.environ.get("WHOP_WEBHOOK_SECRET", "")
WHOP_APP_WEBHOOK_SECRET = os.environ.get("WHOP_APP_WEBHOOK_SECRET", "")
WHOP_OAUTH_CLIENT_ID = os.environ.get("WHOP_OAUTH_CLIENT_ID", "")
WHOP_OAUTH_CLIENT_SECRET = os.environ.get("WHOP_OAUTH_CLIENT_SECRET", "")


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


def get_whop_client() -> Whop:
    """Initialize and return a Whop SDK client."""
    return Whop(api_key=WHOP_API_KEY)


def init_whop_db():
    """Create Whop-related tables (referral_earnings)."""
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS referral_earnings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id INTEGER NOT NULL,
            referred_id INTEGER NOT NULL,
            subscription_plan TEXT NOT NULL,
            subscription_amount REAL NOT NULL,
            commission_rate REAL DEFAULT 0.30,
            commission_amount REAL NOT NULL,
            payment_method TEXT DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS whop_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            transaction_type TEXT NOT NULL,
            reference_id TEXT DEFAULT '',
            amount_usd REAL NOT NULL,
            whop_checkout_id TEXT DEFAULT '',
            whop_payment_id TEXT DEFAULT '',
            payment_status TEXT DEFAULT 'pending',
            metadata TEXT DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT,
            completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_re_referrer ON referral_earnings(referrer_id);
        CREATE INDEX IF NOT EXISTS idx_re_referred ON referral_earnings(referred_id);
        CREATE INDEX IF NOT EXISTS idx_wt_user ON whop_transactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_wt_status ON whop_transactions(payment_status);
        CREATE INDEX IF NOT EXISTS idx_wt_checkout ON whop_transactions(whop_checkout_id);
    """)
    conn.commit()
    conn.close()


# ==================== CHECKOUT ====================

# Whop fee structure: 3% platform + 2.7% processing + $0.30 fixed
WHOP_PERCENTAGE_FEE = 0.057   # 5.7% total
WHOP_FIXED_FEE = 0.30         # $0.30 per transaction


def _calculate_gross_amount(net_amount: float) -> float:
    """Calculate the amount to charge so seller receives net_amount after Whop fees.
    Formula: gross = (net + fixed_fee) / (1 - percentage_fee)
    """
    import math
    gross = (net_amount + WHOP_FIXED_FEE) / (1 - WHOP_PERCENTAGE_FEE)
    return math.ceil(gross * 100) / 100  # Round up to nearest cent


# Map our internal plan IDs to Whop plan IDs (from Whop dashboard)
WHOP_PLAN_MAP = {
    "weekly_usd": "plan_UTFawLBWBaT8e",   # Pro Weekly $15/week
    "monthly_usd": "plan_An2RLnw6zHx3Q",  # Pro Monthly $48/month
}

# Whop marketplace subscription price (what users pay on whop.com)
WHOP_MARKETPLACE_PRICE = 2.50


def create_checkout_session(
    user_id: int,
    transaction_type: str,
    amount_usd: float,
    reference_id: str = "",
    plan_type: str = "one_time",
    title: str = "",
    redirect_url: str = "",
) -> Dict:
    """Create a Whop checkout configuration for a payment.

    Args:
        user_id: The ID of the user making the payment
        transaction_type: 'subscription', 'prediction_purchase', or 'balance_topup'
        amount_usd: Amount to charge in USD
        reference_id: Plan ID or prediction ID
        plan_type: 'one_time' or 'renewal'
        title: Display title for the checkout
        redirect_url: Where to redirect after payment
    """
    if not WHOP_API_KEY or not WHOP_COMPANY_ID:
        return {"success": False, "error": "Whop payment system not configured"}

    client = get_whop_client()
    now = datetime.now().isoformat()

    # Store metadata for webhook processing
    metadata = {
        "spark_user_id": str(user_id),
        "transaction_type": transaction_type,
        "reference_id": reference_id,
    }

    try:
        # Use existing Whop plan IDs for subscriptions, inline plans for custom amounts
        whop_plan_id = WHOP_PLAN_MAP.get(reference_id) if transaction_type == "subscription" else None

        create_params = {
            "mode": "payment",
            "metadata": metadata,
        }

        if redirect_url:
            create_params["redirect_url"] = redirect_url

        if whop_plan_id:
            # Use existing Whop plan (do NOT pass company_id with plan_id)
            create_params["plan_id"] = whop_plan_id
            logger.info(f"Using existing Whop plan: {whop_plan_id} for {reference_id}")
        else:
            # Create inline plan with fee pass-through so seller receives full amount
            charge_amount = _calculate_gross_amount(amount_usd)
            create_params["plan"] = {
                "initial_price": charge_amount,
                "plan_type": "one_time",
                "currency": "usd",
                "company_id": WHOP_COMPANY_ID,
            }
            logger.info(f"Creating inline plan: ${amount_usd} + fees = ${charge_amount} for {transaction_type}")

        checkout = client.checkout_configurations.create(**create_params)

        checkout_id = checkout.id
        purchase_url = getattr(checkout, 'purchase_url', None)
        logger.info(f"Checkout created: id={checkout_id}, url={purchase_url}")

        # Record pending transaction
        conn = _get_db()
        conn.execute("""
            INSERT INTO whop_transactions
                (user_id, transaction_type, reference_id, amount_usd,
                 whop_checkout_id, payment_status, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        """, (
            user_id, transaction_type, reference_id, amount_usd,
            checkout_id, json.dumps(metadata), now, now,
        ))
        conn.commit()
        conn.close()

        return {
            "success": True,
            "checkout_id": checkout_id,
            "purchase_url": purchase_url,
        }

    except Exception as e:
        logger.error(f"Whop checkout creation failed: {e}")
        return {"success": False, "error": f"Failed to create checkout: {str(e)}"}


def lookup_and_link_whop_account(user_id: int) -> Dict:
    """Look up a user's Whop account by matching their Spark AI email to Whop members.

    Searches the Whop members list for a member whose email matches
    the user's Spark AI email. If found, saves their whop_user_id.
    """
    if not WHOP_API_KEY or not WHOP_COMPANY_ID:
        return {"success": False, "error": "Whop payment system not configured"}

    # Get user email from users.db
    import user_auth
    user_info = user_auth.get_user_email_by_id(user_id)
    if not user_info or not user_info.get("email"):
        return {"success": False, "error": "User email not found"}

    user_email = user_info["email"].lower().strip()

    try:
        client = get_whop_client()
        members = client.members.list(company_id=WHOP_COMPANY_ID)
        for member in members:
            user_obj = getattr(member, "user", None)
            if user_obj:
                whop_email = getattr(user_obj, "email", "") or ""
                whop_uid = getattr(user_obj, "id", "") or ""
                if whop_email.lower().strip() == user_email and whop_uid:
                    _save_whop_user_id(user_id, whop_uid)
                    logger.info(f"Whop account linked by email: user={user_id}, whop_uid={whop_uid}, email={user_email}")
                    return {"success": True, "whop_user_id": whop_uid}

        logger.info(f"No Whop member found for email {user_email}")
        return {"success": False, "error": "no_match"}

    except Exception as e:
        logger.error(f"Whop member lookup failed: {e}")
        return {"success": False, "error": f"Could not look up Whop account: {str(e)}"}


def check_and_fulfill_payment(checkout_id: str, user_id: int) -> str:
    """Check Whop API for payment status and fulfill if paid.

    Called from the polling endpoint. If our DB says pending but Whop says paid,
    we process the fulfillment directly (same as webhook would do).
    Returns: 'pending', 'completed', or 'failed'.
    """
    # First check our DB
    conn = _get_db()
    row = conn.execute(
        "SELECT payment_status, transaction_type, reference_id, amount_usd FROM whop_transactions WHERE whop_checkout_id = ? AND user_id = ?",
        (checkout_id, user_id)
    ).fetchone()
    conn.close()

    if not row:
        return "pending"

    if row["payment_status"] != "pending":
        return row["payment_status"]

    # Still pending in our DB — check Whop API directly
    if not WHOP_API_KEY or not WHOP_COMPANY_ID:
        return "pending"

    try:
        client = get_whop_client()
        # List recent payments and find one matching our metadata
        payments = client.payments.list(company_id=WHOP_COMPANY_ID)
        for payment in payments:
            meta = getattr(payment, 'metadata', {}) or {}
            if (meta.get('spark_user_id') == str(user_id) and
                meta.get('transaction_type') == row['transaction_type'] and
                meta.get('reference_id', '') == (row['reference_id'] or '')):
                status = getattr(payment, 'status', '')
                if status == 'paid':
                    payment_id = getattr(payment, 'id', '')
                    logger.info(f"Found paid payment via API polling: {payment_id} for user {user_id}")
                    # Capture Whop user ID for future payouts
                    whop_uid = getattr(payment, 'user_id', '') or ''
                    if whop_uid:
                        _save_whop_user_id(user_id, whop_uid)
                    # Process fulfillment (same as webhook)
                    _fulfill_payment(
                        user_id=user_id,
                        transaction_type=row['transaction_type'],
                        reference_id=row['reference_id'] or '',
                        payment_id=payment_id,
                        amount_usd=row['amount_usd'],
                        checkout_id=checkout_id,
                    )
                    return "completed"
                elif status in ('failed', 'refunded', 'voided'):
                    return "failed"
    except Exception as e:
        logger.error(f"Error checking Whop payment status: {e}")

    return "pending"


def _fulfill_payment(user_id: int, transaction_type: str, reference_id: str,
                     payment_id: str, amount_usd: float, checkout_id: str):
    """Fulfill a payment: activate subscription, credit balance, or unlock prediction."""
    now = datetime.now().isoformat()

    # Update our transaction record
    conn = _get_db()
    conn.execute("""
        UPDATE whop_transactions
        SET whop_payment_id = ?, payment_status = 'completed',
            updated_at = ?, completed_at = ?
        WHERE whop_checkout_id = ? AND user_id = ? AND payment_status = 'pending'
    """, (payment_id, now, now, checkout_id, user_id))
    conn.commit()
    conn.close()

    if transaction_type == "account_link":
        # Account linked — auto-add Whop withdrawal method
        try:
            import daraja_payment
            daraja_payment.add_withdrawal_option(user_id, "whop")
            logger.info(f"Account linked via Whop + withdrawal method added: user={user_id}")
        except Exception as e:
            logger.error(f"Account linked but failed to add withdrawal method: {e}")
            logger.info(f"Account linked via Whop: user={user_id}")

    elif transaction_type == "subscription":
        subscriptions.create_subscription(
            user_id=user_id,
            plan_id=reference_id,
            payment_method="whop",
            payment_ref=payment_id,
        )
        _process_referral_commission(user_id, reference_id, "whop",
                                     amount_usd=amount_usd, transaction_type="subscription")
        logger.info(f"Subscription activated via polling: user={user_id}, plan={reference_id}")

    elif transaction_type == "prediction_purchase":
        community.purchase_prediction(
            prediction_id=int(reference_id),
            buyer_id=user_id,
            payment_method="whop",
            payment_ref=payment_id,
        )
        _process_referral_commission(user_id, reference_id, "whop",
                                     amount_usd=amount_usd, transaction_type="prediction_purchase")
        logger.info(f"Prediction purchased via polling: user={user_id}, prediction={reference_id}")

    elif transaction_type == "balance_topup":
        community.adjust_user_balance(
            user_id=user_id,
            amount_usd=amount_usd,
            amount_kes=0,
            reason="Pay on the Go deposit via Whop",
            adjustment_type="topup",
        )
        _process_referral_commission(user_id, "balance_topup", "whop",
                                     amount_usd=amount_usd, transaction_type="balance_topup")
        logger.info(f"Balance topped up via polling: user={user_id}, amount=${amount_usd}")

    # Send invoice email
    try:
        import user_auth
        user_info = user_auth.get_user_email_by_id(user_id)
        if user_info and user_info.get("email"):
            # Get the transaction ID from DB for invoice number
            conn = _get_db()
            tx_row = conn.execute(
                "SELECT id FROM whop_transactions WHERE whop_checkout_id = ? AND user_id = ?",
                (checkout_id, user_id)
            ).fetchone()
            conn.close()
            tx_id = tx_row["id"] if tx_row else 0
            invoice_num = f"SPARK-{datetime.now().strftime('%Y%m%d')}-W{tx_id}"
            user_auth.send_invoice_email(
                to_email=user_info["email"],
                display_name=user_info.get("display_name", ""),
                invoice_number=invoice_num,
                transaction_type=transaction_type,
                amount_usd=amount_usd,
                payment_method="Card (Whop)",
                receipt_number=payment_id,
                reference_id=reference_id,
                completed_at=now,
            )
    except Exception as e:
        logger.error(f"Failed to send invoice email for Whop payment {payment_id}: {e}")


def _save_whop_user_id(spark_user_id: int, whop_user_id: str):
    """Save Whop user ID to users table for future payouts (only if not already set)."""
    if not whop_user_id:
        return
    try:
        users_conn = _get_users_db()
        users_conn.execute(
            "UPDATE users SET whop_user_id = ? WHERE id = ? AND (whop_user_id IS NULL OR whop_user_id = '')",
            (whop_user_id, spark_user_id)
        )
        users_conn.commit()
        users_conn.close()
        logger.info(f"Saved Whop user ID {whop_user_id} for user {spark_user_id}")
    except Exception as e:
        logger.error(f"Failed to save Whop user ID: {e}")


# ==================== WEBHOOKS ====================

def verify_webhook(body: bytes, headers: dict) -> bool:
    """Verify Whop webhook signature using Standard Webhooks spec."""
    secrets_to_try = [s for s in [WHOP_WEBHOOK_SECRET, WHOP_APP_WEBHOOK_SECRET] if s]
    if not secrets_to_try:
        logger.error("No webhook secrets configured — REJECTING webhook for security")
        return False

    try:
        # Method 1: Use the official standardwebhooks library
        # Convert ws_ hex secret to whsec_ base64 format that the library expects
        try:
            from standardwebhooks.webhooks import Webhook
            for secret_raw in secrets_to_try:
                try:
                    if secret_raw.startswith("ws_"):
                        hex_part = secret_raw[3:]
                        raw_bytes = bytes.fromhex(hex_part)
                        b64_secret = base64.b64encode(raw_bytes).decode()
                        std_secret = f"whsec_{b64_secret}"
                    elif secret_raw.startswith("whsec_"):
                        std_secret = secret_raw
                    else:
                        std_secret = f"whsec_{secret_raw}"
                    wh = Webhook(std_secret)
                    wh.verify(body, headers)
                    logger.info(f"Webhook signature VERIFIED (standardwebhooks, secret={secret_raw[:8]}...)")
                    return True
                except Exception:
                    continue
        except ImportError:
            pass

        # Method 2: Manual verification with multiple secret decodings
        webhook_id = headers.get("webhook-id", "")
        webhook_timestamp = headers.get("webhook-timestamp", "")
        webhook_signature = headers.get("webhook-signature", "")

        if not all([webhook_id, webhook_timestamp, webhook_signature]):
            logger.error(f"Missing webhook headers. id={bool(webhook_id)} ts={bool(webhook_timestamp)} sig={bool(webhook_signature)}")
            logger.error(f"  All headers: {list(headers.keys())}")
            return False

        # Standard Webhooks: sign "{msg_id}.{timestamp}.{body}"
        to_sign = f"{webhook_id}.{webhook_timestamp}.".encode() + body

        # Extract actual signature values from header
        actual_sigs = []
        for sig in webhook_signature.split(" "):
            if "," in sig:
                actual_sigs.append(sig.split(",", 1)[1])
            else:
                actual_sigs.append(sig)

        # Try multiple secret decodings with BOTH secrets
        for secret_raw in secrets_to_try:
            secret_after_prefix = secret_raw[3:] if secret_raw.startswith("ws_") else secret_raw

            decodings = {
                "hex": bytes.fromhex(secret_after_prefix),
                "utf8_full": secret_raw.encode("utf-8"),
                "utf8_after_prefix": secret_after_prefix.encode("utf-8"),
            }
            try:
                decodings["b64_after_prefix"] = base64.b64decode(secret_after_prefix + "==")
            except Exception:
                pass

            for method, secret_bytes in decodings.items():
                expected = hmac.new(secret_bytes, to_sign, hashlib.sha256).digest()
                expected_b64 = base64.b64encode(expected).decode()
                for actual_sig in actual_sigs:
                    if hmac.compare_digest(actual_sig, expected_b64):
                        logger.info(f"Webhook signature VERIFIED using {method} (secret={secret_raw[:8]}...)")
                        return True

        # None matched
        logger.error(f"Webhook signature mismatch after trying all secrets and methods")
        logger.error(f"  Actual sigs: {[s[:30] for s in actual_sigs]}")
        logger.error(f"  webhook-id: {webhook_id}, timestamp: {webhook_timestamp}")
        return False

    except Exception as e:
        logger.error(f"Webhook verification error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False


def process_payment_webhook(event_data: dict) -> Dict:
    """Process a payment.succeeded webhook event.

    Extracts metadata from the payment, identifies the transaction type,
    and fulfills the order (subscription activation, prediction unlock, or balance topup).
    """
    try:
        payment = event_data.get("data", event_data)
        payment_id = payment.get("id", "")
        metadata = payment.get("metadata", {})

        user_id_str = metadata.get("spark_user_id", "")
        transaction_type = metadata.get("transaction_type", "")
        reference_id = metadata.get("reference_id", "")

        if not user_id_str or not transaction_type:
            logger.error(f"Webhook missing metadata: {metadata}")
            return {"success": False, "error": "Missing metadata in webhook"}

        user_id = int(user_id_str)
        now = datetime.now().isoformat()

        # Capture Whop user ID for future payouts
        whop_uid = payment.get("user_id", "")
        if whop_uid:
            _save_whop_user_id(user_id, whop_uid)

        # Update our transaction record
        conn = _get_db()
        conn.execute("""
            UPDATE whop_transactions
            SET whop_payment_id = ?, payment_status = 'completed',
                updated_at = ?, completed_at = ?
            WHERE user_id = ? AND transaction_type = ? AND reference_id = ?
                AND payment_status = 'pending'
            ORDER BY created_at DESC LIMIT 1
        """, (payment_id, now, now, user_id, transaction_type, reference_id))
        conn.commit()
        conn.close()

        # Fulfill the order
        if transaction_type == "subscription":
            result = subscriptions.create_subscription(
                user_id=user_id,
                plan_id=reference_id,
                payment_method="whop",
                payment_ref=payment_id,
            )
            _process_referral_commission(user_id, reference_id, "whop",
                                         amount_usd=float(payment.get("total", 0)),
                                         transaction_type="subscription")

        elif transaction_type == "prediction_purchase":
            result = community.purchase_prediction(
                prediction_id=int(reference_id),
                buyer_id=user_id,
                payment_method="whop",
                payment_ref=payment_id,
            )
            pred_amount = float(payment.get("total", 0)) or float(metadata.get("amount_usd", 0))
            _process_referral_commission(user_id, reference_id, "whop",
                                         amount_usd=pred_amount,
                                         transaction_type="prediction_purchase")

        elif transaction_type == "balance_topup":
            total = payment.get("total")
            if total is None:
                total = float(metadata.get("amount_usd", 0))
            community.adjust_user_balance(
                user_id=user_id,
                amount_usd=float(total),
                amount_kes=0,
                reason="Pay on the Go deposit via Whop",
                adjustment_type="topup",
            )
            _process_referral_commission(user_id, "balance_topup", "whop",
                                         amount_usd=float(total),
                                         transaction_type="balance_topup")
            result = {"success": True}

        else:
            result = {"success": True}

        logger.info(f"Whop payment processed: type={transaction_type}, user={user_id}, payment={payment_id}")
        return result

    except Exception as e:
        logger.error(f"Whop webhook processing error: {e}")
        return {"success": False, "error": str(e)}


def process_payment_failed(event_data: dict) -> Dict:
    """Process a payment.failed webhook event."""
    try:
        payment = event_data.get("data", event_data)
        payment_id = payment.get("id", "")
        metadata = payment.get("metadata", {})
        user_id_str = metadata.get("spark_user_id", "")
        failure_msg = payment.get("failure_message", "Payment failed")

        if user_id_str:
            now = datetime.now().isoformat()
            conn = _get_db()
            conn.execute("""
                UPDATE whop_transactions
                SET whop_payment_id = ?, payment_status = 'failed', updated_at = ?
                WHERE user_id = ? AND payment_status = 'pending'
                ORDER BY created_at DESC LIMIT 1
            """, (payment_id, now, int(user_id_str)))
            conn.commit()
            conn.close()

        logger.info(f"Whop payment failed: {payment_id} - {failure_msg}")
        return {"success": True}

    except Exception as e:
        logger.error(f"Whop failed webhook error: {e}")
        return {"success": False, "error": str(e)}


def _record_marketplace_transaction(user_id: int, membership_id: str,
                                     amount_usd: float, metadata: dict = None):
    """Record a marketplace subscription purchase in whop_transactions for revenue tracking."""
    now = datetime.now().isoformat()
    conn = _get_db()
    try:
        existing = conn.execute(
            "SELECT id FROM whop_transactions WHERE reference_id = ? AND transaction_type = 'marketplace_subscription'",
            (membership_id,)
        ).fetchone()
        if existing:
            logger.info(f"Marketplace transaction already recorded for membership {membership_id}")
            return
        conn.execute("""
            INSERT INTO whop_transactions
            (user_id, transaction_type, reference_id, amount_usd,
             whop_payment_id, payment_status, metadata, created_at, updated_at, completed_at)
            VALUES (?, 'marketplace_subscription', ?, ?, ?, 'completed', ?, ?, ?, ?)
        """, (user_id, membership_id, amount_usd, membership_id,
              json.dumps(metadata or {}), now, now, now))
        conn.commit()
        logger.info(f"Recorded marketplace transaction: user={user_id}, membership={membership_id}, amount=${amount_usd}")
    except Exception as e:
        logger.error(f"Failed to record marketplace transaction: {e}")
    finally:
        conn.close()


# ==================== WHOP MARKETPLACE MEMBERSHIP WEBHOOKS ====================

def process_membership_activated(event_data: dict) -> Dict:
    """Process a membership.activated webhook from Whop marketplace.

    When a user purchases a Spark AI product on Whop.com, this creates
    or upgrades their Spark AI account and sends a welcome email with a magic login link.
    """
    try:
        data = event_data.get("data", event_data)
        membership_id = data.get("id", "")
        user_obj = data.get("user", {})
        email = (user_obj.get("email", "") or "").lower().strip()
        name = user_obj.get("name", "") or ""
        username = user_obj.get("username", "") or ""
        whop_user_id = user_obj.get("id", "") or ""

        if not email:
            logger.error(f"Membership activated webhook missing email: {data}")
            return {"success": False, "error": "No email in webhook data"}

        if not membership_id:
            logger.error(f"Membership activated webhook missing membership ID")
            return {"success": False, "error": "No membership ID in webhook data"}

        # Check for duplicate processing (idempotency)
        users_conn = _get_users_db()
        existing = users_conn.execute(
            "SELECT id FROM users WHERE whop_membership_id = ?", (membership_id,)
        ).fetchone()
        users_conn.close()

        if existing:
            logger.info(f"Membership {membership_id} already processed for user {existing['id']}, skipping")
            return {"success": True, "message": "Already processed"}

        import user_auth
        result = user_auth.create_account_from_whop(
            email=email,
            whop_user_id=whop_user_id,
            whop_membership_id=membership_id,
            whop_name=name,
            whop_username=username,
        )

        if result.get("success") and result.get("user_id"):
            # Record marketplace transaction for revenue tracking
            plan_obj = data.get("plan", {})
            amount = None
            if isinstance(plan_obj, dict):
                for price_field in ("renewal_price", "initial_price", "base_price"):
                    val = plan_obj.get(price_field)
                    if val is not None:
                        try:
                            amount = float(val)
                            break
                        except (ValueError, TypeError):
                            pass
            if not amount:
                amount = WHOP_MARKETPLACE_PRICE
            _record_marketplace_transaction(
                user_id=result["user_id"],
                membership_id=membership_id,
                amount_usd=amount,
                metadata={"email": email, "whop_user_id": whop_user_id, "source": "marketplace_webhook"},
            )

        if result["success"] and result.get("magic_token"):
            import urllib.parse
            magic_link = f"https://spark-ai-prediction.com/magic-login?token={result['magic_token']}&email={urllib.parse.quote(email)}"
            user_auth.send_whop_welcome_email(
                to_email=email,
                display_name=result.get("display_name", ""),
                magic_link=magic_link,
                is_new=result.get("is_new", True),
            )

        logger.info(f"Membership activated: {membership_id}, user={result.get('user_id')}, is_new={result.get('is_new')}")
        return result

    except Exception as e:
        logger.error(f"Membership activated webhook error: {e}")
        return {"success": False, "error": str(e)}


def process_membership_deactivated(event_data: dict) -> Dict:
    """Process a membership.deactivated webhook from Whop marketplace.

    Revokes Pro access when a user's Whop marketplace subscription is cancelled or expired.
    """
    try:
        data = event_data.get("data", event_data)
        membership_id = data.get("id", "")

        if not membership_id:
            logger.error(f"Membership deactivated webhook missing membership ID")
            return {"success": False, "error": "No membership ID"}

        import user_auth
        result = user_auth.revoke_whop_marketplace_access(membership_id)
        logger.info(f"Membership deactivated: {membership_id}, result={result}")
        return result

    except Exception as e:
        logger.error(f"Membership deactivated webhook error: {e}")
        return {"success": False, "error": str(e)}


# ==================== REFERRAL COMMISSIONS ====================

def _process_referral_commission(user_id: int, plan_id: str, payment_method: str = "",
                                  amount_usd: float = 0.0, transaction_type: str = "subscription"):
    """Credit referrer's wallet when a referred user makes any payment.

    Called after a payment is fulfilled.
    Checks if the user was referred and credits 30% commission to the referrer.
    """
    # No commission for trial subscriptions
    if transaction_type == "subscription" and plan_id in ("trial_usd", "trial_kes"):
        return

    try:
        users_conn = _get_users_db()
        user = users_conn.execute(
            "SELECT id, referred_by, display_name FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()
        users_conn.close()

        if not user or not user["referred_by"]:
            return  # Not a referred user

        referrer_id = user["referred_by"]

        # Calculate commission (dynamic rate from pricing config)
        commission_rate = pricing_config.get("referral_commission_rate", 0.30)

        if transaction_type == "subscription":
            # Get subscription plan details
            plan = subscriptions.get_plans().get(plan_id)
            if not plan:
                return
            subscription_amount = plan["price"]
            # Convert KES plans to USD for commission
            if plan["currency"] == "KES":
                subscription_amount = subscription_amount / 130.0
        else:
            # For balance topups and prediction purchases, use actual payment amount
            if amount_usd <= 0:
                return
            subscription_amount = amount_usd

        commission_amount = round(subscription_amount * commission_rate, 2)

        now = datetime.now().isoformat()

        # Record the referral earning
        conn = _get_db()
        conn.execute("""
            INSERT INTO referral_earnings
                (referrer_id, referred_id, subscription_plan, subscription_amount,
                 commission_rate, commission_amount, payment_method, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            referrer_id, user_id, plan_id, subscription_amount,
            commission_rate, commission_amount, payment_method, now,
        ))
        conn.commit()
        conn.close()

        # Credit the referrer's creator wallet
        if transaction_type == "subscription":
            reason_text = f"Referral commission: {user['display_name']} subscribed to {plan_id}"
            notif_msg = f"You earned ${commission_amount:.2f} commission when {user['display_name']} subscribed!"
        elif transaction_type == "balance_topup":
            reason_text = f"Referral commission: {user['display_name']} deposited ${subscription_amount:.2f}"
            notif_msg = f"You earned ${commission_amount:.2f} commission from {user['display_name']}'s ${subscription_amount:.2f} deposit!"
        else:
            reason_text = f"Referral commission: {user['display_name']} paid ${subscription_amount:.2f}"
            notif_msg = f"You earned ${commission_amount:.2f} commission from {user['display_name']}'s payment!"

        # Credit only balance (not total_earned_usd which tracks prediction sales)
        comm_conn = _get_db()
        comm_conn.execute("""
            INSERT INTO creator_wallets (user_id, balance_usd, balance_kes, total_earned_usd, total_earned_kes, total_sales, updated_at)
            VALUES (?, 0, 0, 0, 0, 0, ?)
            ON CONFLICT(user_id) DO NOTHING
        """, (referrer_id, now))
        comm_conn.execute(
            "UPDATE creator_wallets SET balance_usd = balance_usd + ?, updated_at = ? WHERE user_id = ?",
            (commission_amount, now, referrer_id)
        )
        comm_conn.commit()
        comm_conn.close()

        # Check if this is their first referral commission
        first_count_conn = _get_db()
        first_count = first_count_conn.execute(
            "SELECT COUNT(*) as cnt FROM referral_earnings WHERE referrer_id = ?",
            (referrer_id,)
        ).fetchone()["cnt"]
        first_count_conn.close()

        is_first_referral = (first_count == 1)
        payment_email = os.environ.get("ZOHO_PAYMENT_EMAIL", "")

        if is_first_referral:
            notif_title = "Congratulations on Your First Referral Earning! \U0001f389\U0001f680\U0001f4b0"
            email_msg = (
                f"\U0001f389\U0001f680\U0001f4b0 <strong>Congratulations on your very first referral earning!</strong><br><br>"
                f"Your referral <strong>{user['display_name']}</strong> just made a payment "
                f"and you earned <strong>${commission_amount:.2f}</strong> in commission!<br><br>"
                f"This is a huge milestone — keep referring friends and watch your earnings grow! \U0001f525"
            )
        else:
            notif_title = "Referral Commission Earned! \U0001f4b0"
            email_msg = (
                f"\U0001f4b0 <strong>Congratulations!</strong><br><br>"
                f"Your referral <strong>{user['display_name']}</strong> just made a payment "
                f"and you earned <strong>${commission_amount:.2f}</strong> in commission.<br><br>"
                f"Total referral earnings: <strong>{first_count}</strong> commissions so far. Keep it up! \U0001f525"
            )

        # Send in-app notification to referrer
        try:
            community.create_notification(
                user_id=referrer_id,
                notif_type="referral_commission",
                title=notif_title,
                message=notif_msg,
                metadata={
                    "referred_name": user["display_name"],
                    "plan": plan_id,
                    "commission": commission_amount,
                    "first_referral": is_first_referral,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to create referral commission notification: {e}")

        # Send email notification to referrer
        try:
            community._send_notif_email(
                user_id=referrer_id,
                notif_type="referral_commission",
                title=notif_title,
                message=email_msg,
                from_email=payment_email,
            )
        except Exception as e:
            logger.warning(f"Failed to send referral commission email: {e}")

    except Exception as e:
        logger.error(f"Referral commission error: {e}")


def get_referral_earnings(user_id: int) -> Dict:
    """Get referral earnings history for a user."""
    conn = _get_db()

    # Total earned
    total_row = conn.execute(
        "SELECT COALESCE(SUM(commission_amount), 0) as total FROM referral_earnings WHERE referrer_id = ?",
        (user_id,)
    ).fetchone()

    # Join with users.db manually since they're separate DBs
    users_conn = _get_users_db()
    earnings = []
    for row in conn.execute(
        "SELECT * FROM referral_earnings WHERE referrer_id = ? ORDER BY created_at DESC LIMIT 20",
        (user_id,)
    ).fetchall():
        referred_user = users_conn.execute(
            "SELECT display_name, username FROM users WHERE id = ?",
            (row["referred_id"],)
        ).fetchone()
        earnings.append({
            "id": row["id"],
            "referred_name": referred_user["display_name"] if referred_user else "Unknown",
            "referred_username": referred_user["username"] if referred_user else "",
            "subscription_plan": row["subscription_plan"],
            "subscription_amount": row["subscription_amount"],
            "commission_rate": row["commission_rate"],
            "commission_amount": row["commission_amount"],
            "payment_method": row["payment_method"],
            "created_at": row["created_at"],
        })

    users_conn.close()
    conn.close()

    return {
        "total_earned": total_row["total"] if total_row else 0,
        "earnings": earnings,
    }


# ==================== TRANSFERS (PAYOUTS) ====================

def create_transfer(
    destination_id: str,
    amount_usd: float,
    notes: str = "",
    idempotence_key: str = "",
) -> Dict:
    """Transfer funds from company to a user/connected account.

    Used for paying out referral commissions and creator earnings via Whop.
    Requires the destination to have a Whop user ID.
    """
    if not WHOP_API_KEY or not WHOP_COMPANY_ID:
        return {"success": False, "error": "Whop not configured"}

    client = get_whop_client()

    try:
        params = {
            "amount": amount_usd,
            "currency": "usd",
            "origin_id": WHOP_COMPANY_ID,
            "destination_id": destination_id,
        }
        if notes:
            params["notes"] = notes[:50]  # Max 50 chars
        if idempotence_key:
            params["idempotence_key"] = idempotence_key

        transfer = client.transfers.create(**params)

        return {
            "success": True,
            "transfer_id": transfer.id,
            "amount": transfer.amount,
        }

    except Exception as e:
        logger.error(f"Whop transfer failed: {e}")
        return {"success": False, "error": str(e)}


# ==================== WEBHOOK REGISTRATION ====================

def register_webhook(url: str, events: list = None) -> Dict:
    """Register or update a webhook endpoint with Whop."""
    if not WHOP_API_KEY or not WHOP_COMPANY_ID:
        return {"success": False, "error": "Whop not configured"}

    client = get_whop_client()

    if events is None:
        events = [
            "payment.succeeded",
            "payment.failed",
            "payment.created",
            "membership.activated",
            "membership.deactivated",
        ]

    try:
        webhook = client.webhooks.create(
            url=url,
            events=events,
            enabled=True,
            api_version="v1",
            resource_id=WHOP_COMPANY_ID,
        )

        return {
            "success": True,
            "webhook_id": webhook.id,
            "webhook_secret": webhook.webhook_secret,
        }

    except Exception as e:
        logger.error(f"Whop webhook registration failed: {e}")
        return {"success": False, "error": str(e)}


# ==================== WHOP OAUTH ====================

import urllib.request
import urllib.parse

# In-memory store for PKCE state (short-lived, cleaned up on use)
_oauth_state_store: Dict[str, dict] = {}


def create_oauth_authorize_url(redirect_uri: str) -> Dict:
    """Generate Whop OAuth authorization URL with PKCE.
    Embeds code_verifier in HMAC-signed state so any worker can recover it.
    """
    if not WHOP_OAUTH_CLIENT_ID:
        return {"success": False, "error": "Whop OAuth not configured"}

    import secrets as _secrets
    import time as _time

    # Generate PKCE code_verifier and challenge
    code_verifier = _secrets.token_urlsafe(43)
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).rstrip(b"=").decode()

    # Embed code_verifier in state with HMAC signature (works across workers)
    timestamp = str(int(_time.time()))
    # State format: {timestamp}:{code_verifier}:{hmac_sig}
    state_payload = f"{timestamp}:{code_verifier}"
    state_sig = hmac.new(
        WHOP_OAUTH_CLIENT_SECRET.encode(), state_payload.encode(), hashlib.sha256
    ).hexdigest()[:24]
    state = f"{state_payload}:{state_sig}"

    # Generate nonce (required for openid scope)
    nonce = _secrets.token_urlsafe(16)

    params = urllib.parse.urlencode({
        "client_id": WHOP_OAUTH_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid profile email",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "nonce": nonce,
    })

    print(f"[Whop OAuth] Authorize: redirect to api.whop.com/oauth/authorize")
    print(f"[Whop OAuth] Authorize: code_verifier (len={len(code_verifier)}): {code_verifier[:10]}...")

    return {
        "success": True,
        "redirect_url": f"https://api.whop.com/oauth/authorize?{params}",
        "state": state,
    }


def exchange_oauth_code(code: str, state: str, redirect_uri: str) -> Dict:
    """Exchange OAuth authorization code for tokens and get user info."""
    if not WHOP_OAUTH_CLIENT_ID:
        return {"success": False, "error": "Whop OAuth not configured"}

    import time as _time

    # Extract code_verifier from HMAC-signed state
    try:
        parts = state.split(":")
        if len(parts) != 3:
            return {"success": False, "error": "Invalid OAuth state format"}
        timestamp, code_verifier, sig = parts[0], parts[1], parts[2]
        state_payload = f"{timestamp}:{code_verifier}"
        expected_sig = hmac.new(
            WHOP_OAUTH_CLIENT_SECRET.encode(), state_payload.encode(), hashlib.sha256
        ).hexdigest()[:24]
        if not hmac.compare_digest(sig, expected_sig):
            return {"success": False, "error": "Invalid OAuth state signature"}
        if abs(int(_time.time()) - int(timestamp)) > 600:
            return {"success": False, "error": "OAuth state expired"}
    except Exception:
        return {"success": False, "error": "Invalid OAuth state"}

    # Debug logging
    print(f"[Whop OAuth] State received (len={len(state)}): {state[:20]}...{state[-20:]}")
    print(f"[Whop OAuth] code_verifier extracted (len={len(code_verifier)}): {code_verifier[:10]}...")
    print(f"[Whop OAuth] Authorization code (len={len(code)}): {code[:10]}...")
    print(f"[Whop OAuth] redirect_uri: {redirect_uri}")

    # Exchange code for tokens — JSON with client_secret + code_verifier
    token_body = json.dumps({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": WHOP_OAUTH_CLIENT_ID,
        "client_secret": WHOP_OAUTH_CLIENT_SECRET,
        "code_verifier": code_verifier,
    }).encode()

    print(f"[Whop OAuth] Sending token exchange (JSON + client_secret + code_verifier)")

    try:
        req = urllib.request.Request(
            "https://api.whop.com/oauth/token",
            data=token_body,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            token_data = json.loads(resp.read().decode())
        print(f"[Whop OAuth] Token exchange SUCCESS")
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else "no body"
        logger.error(f"Whop OAuth token exchange failed: {e.code} {error_body}")
        print(f"[Whop OAuth] Token exchange FAILED: {e.code} {error_body}")
        return {"success": False, "error": f"Token exchange failed: {error_body}"}
    except Exception as e:
        logger.error(f"Whop OAuth token exchange failed: {e}")
        print(f"[Whop OAuth] Token exchange FAILED: {e}")
        return {"success": False, "error": "Failed to exchange authorization code"}

    access_token = token_data.get("access_token", "")
    if not access_token:
        return {"success": False, "error": "No access token received from Whop"}

    # Get user info
    try:
        req = urllib.request.Request(
            "https://api.whop.com/oauth/userinfo",
            method="GET",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            user_info = json.loads(resp.read().decode())
    except Exception as e:
        logger.error(f"Whop OAuth userinfo failed: {e}")
        return {"success": False, "error": "Failed to get user info from Whop"}

    whop_user_id = user_info.get("sub", "")
    email = (user_info.get("email", "") or "").lower().strip()
    name = user_info.get("name", "") or ""
    username = user_info.get("preferred_username", "") or user_info.get("username", "") or ""

    if not email:
        return {"success": False, "error": "No email returned from Whop"}

    return {
        "success": True,
        "whop_user_id": whop_user_id,
        "email": email,
        "name": name,
        "username": username,
        "access_token": access_token,
    }


# ==================== MARKETPLACE MEMBERSHIP VALIDATOR ====================

def validate_marketplace_memberships() -> Dict:
    """Background task: validate all marketplace Pro memberships are still active on Whop.

    Queries all users with whop_access_source='marketplace' and tier='pro',
    then checks each membership via the Whop API.
    """
    if not WHOP_API_KEY:
        return {"success": False, "error": "Whop API not configured"}

    users_conn = _get_users_db()
    marketplace_users = users_conn.execute("""
        SELECT id, whop_user_id, whop_membership_id
        FROM users
        WHERE whop_access_source = 'marketplace' AND tier = 'pro'
          AND whop_membership_id IS NOT NULL
    """).fetchall()
    users_conn.close()

    if not marketplace_users:
        return {"success": True, "checked": 0, "revoked": 0}

    client = get_whop_client()
    checked = 0
    revoked = 0

    for user_row in marketplace_users:
        try:
            membership = client.memberships.retrieve(user_row["whop_membership_id"])
            status = getattr(membership, "status", "")

            if status not in ("active", "trialing"):
                import user_auth
                user_auth.revoke_whop_marketplace_access(user_row["whop_membership_id"])
                revoked += 1
                logger.info(f"Validator revoked: user={user_row['id']}, membership={user_row['whop_membership_id']}, status={status}")

            checked += 1
        except Exception as e:
            logger.error(f"Validator check failed for user {user_row['id']}: {e}")
            checked += 1

    logger.info(f"Marketplace membership validation: checked={checked}, revoked={revoked}")
    return {"success": True, "checked": checked, "revoked": revoked}
