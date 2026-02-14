"""
Swypt Payment Integration for Spark AI Prediction
Handles M-Pesa on-ramp (deposits) and off-ramp (withdrawals) via Swypt API.
Uses Celo network with USDT. Users never interact with crypto directly.
"""

import os
import sqlite3
import aiohttp
from datetime import datetime, timedelta
from typing import Optional, Dict, List

import community
import subscriptions

DB_PATH = "community.db"

SWYPT_BASE_URL = "https://pool.swypt.io/api"
USDT_CELO_TOKEN = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e"
CELO_OFFRAMP_CONTRACT = "0x2816a02000B9845C464796b8c36B2D5D199525d5"

MINIMUM_WITHDRAWAL_USD = 5.0


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _get_swypt_headers() -> dict:
    return {
        "x-api-key": os.environ.get("SWYPT_API_KEY", ""),
        "x-api-secret": os.environ.get("SWYPT_API_SECRET", ""),
        "Content-Type": "application/json",
    }


def _get_platform_wallet() -> str:
    return os.environ.get("SWYPT_PLATFORM_WALLET", "")


def init_payment_db():
    """Create payment-related tables."""
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
    conn.close()


# ==================== QUOTES ====================

async def get_kes_to_usd_quote(amount_kes: float) -> Dict:
    """Get a conversion quote from KES to USDT via Swypt."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{SWYPT_BASE_URL}/swypt-quotes",
                json={
                    "type": "onramp",
                    "amount": str(amount_kes),
                    "fiatCurrency": "KES",
                    "cryptoCurrency": "USDT",
                    "network": "celo",
                },
                headers=_get_swypt_headers(),
            ) as resp:
                data = await resp.json()
                if resp.status == 200 and data.get("data"):
                    quote = data["data"]
                    return {
                        "success": True,
                        "amount_kes": float(quote["inputAmount"]),
                        "amount_usd": float(quote["outputAmount"]),
                        "exchange_rate": float(quote["exchangeRate"]),
                        "fee": quote.get("fee", {}),
                    }
                return {
                    "success": False,
                    "error": data.get("message", "Failed to get quote"),
                }
    except Exception as e:
        return {"success": False, "error": f"Payment service unavailable: {str(e)}"}


async def get_usd_to_kes_quote(amount_usd: float) -> Dict:
    """Get a conversion quote from USDT to KES (for withdrawal display)."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{SWYPT_BASE_URL}/swypt-quotes",
                json={
                    "type": "offramp",
                    "amount": str(amount_usd),
                    "fiatCurrency": "KES",
                    "cryptoCurrency": "USDT",
                    "network": "celo",
                    "category": "B2C",
                },
                headers=_get_swypt_headers(),
            ) as resp:
                data = await resp.json()
                if resp.status == 200 and data.get("data"):
                    quote = data["data"]
                    return {
                        "success": True,
                        "amount_usd": float(quote["inputAmount"]),
                        "amount_kes": float(quote["outputAmount"]),
                        "exchange_rate": float(quote["exchangeRate"]),
                        "fee": quote.get("fee", {}),
                    }
                return {
                    "success": False,
                    "error": data.get("message", "Failed to get quote"),
                }
    except Exception as e:
        return {"success": False, "error": f"Payment service unavailable: {str(e)}"}


# ==================== ON-RAMP (DEPOSITS) ====================

async def initiate_stk_push(
    phone: str,
    amount_kes: float,
    user_id: int,
    transaction_type: str,
    reference_id: str = "",
) -> Dict:
    """Initiate M-Pesa STK push via Swypt on-ramp."""
    platform_wallet = _get_platform_wallet()
    if not platform_wallet:
        return {"success": False, "error": "Payment system not configured"}

    # Get quote first to know the USD equivalent
    quote = await get_kes_to_usd_quote(amount_kes)
    if not quote["success"]:
        return quote

    now = datetime.now().isoformat()

    # Create transaction record
    conn = _get_db()
    cursor = conn.execute("""
        INSERT INTO payment_transactions
            (user_id, transaction_type, reference_id, amount_kes, amount_usd,
             exchange_rate, phone_number, payment_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    """, (
        user_id, transaction_type, reference_id,
        amount_kes, quote["amount_usd"], quote["exchange_rate"],
        phone, now, now,
    ))
    transaction_id = cursor.lastrowid
    conn.commit()
    conn.close()

    # Call Swypt to initiate STK push
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{SWYPT_BASE_URL}/swypt-onramp",
                json={
                    "partyA": phone,
                    "amount": str(int(amount_kes)),
                    "side": "onramp",
                    "userAddress": platform_wallet,
                    "tokenAddress": USDT_CELO_TOKEN,
                },
                headers=_get_swypt_headers(),
            ) as resp:
                data = await resp.json()

                if resp.status == 200:
                    # Extract order ID from response
                    order_id = ""
                    if isinstance(data, dict):
                        order_id = (
                            data.get("orderID", "")
                            or data.get("data", {}).get("orderID", "")
                            or data.get("data", {}).get("orderId", "")
                        )

                    conn = _get_db()
                    conn.execute("""
                        UPDATE payment_transactions
                        SET swypt_order_id = ?, payment_status = 'stk_sent', updated_at = ?
                        WHERE id = ?
                    """, (order_id, datetime.now().isoformat(), transaction_id))
                    conn.commit()
                    conn.close()

                    return {
                        "success": True,
                        "transaction_id": transaction_id,
                        "swypt_order_id": order_id,
                        "amount_kes": amount_kes,
                        "amount_usd": quote["amount_usd"],
                        "message": "Check your phone for the M-Pesa prompt",
                    }
                else:
                    error_msg = data.get("message", "STK push failed")
                    conn = _get_db()
                    conn.execute("""
                        UPDATE payment_transactions
                        SET payment_status = 'failed', failure_reason = ?, updated_at = ?
                        WHERE id = ?
                    """, (error_msg, datetime.now().isoformat(), transaction_id))
                    conn.commit()
                    conn.close()
                    return {"success": False, "error": error_msg}

    except Exception as e:
        conn = _get_db()
        conn.execute("""
            UPDATE payment_transactions
            SET payment_status = 'failed', failure_reason = ?, updated_at = ?
            WHERE id = ?
        """, (str(e), datetime.now().isoformat(), transaction_id))
        conn.commit()
        conn.close()
        return {"success": False, "error": f"Payment service unavailable: {str(e)}"}


async def check_payment_status(transaction_id: int, user_id: int) -> Dict:
    """Check M-Pesa payment status by polling Swypt."""
    conn = _get_db()
    tx = conn.execute(
        "SELECT * FROM payment_transactions WHERE id = ? AND user_id = ?",
        (transaction_id, user_id),
    ).fetchone()
    conn.close()

    if not tx:
        return {"success": False, "error": "Transaction not found"}

    # Already completed or failed
    if tx["payment_status"] in ("completed", "failed", "expired"):
        return {
            "success": True,
            "status": tx["payment_status"],
            "transaction": _tx_to_dict(tx),
        }

    # No Swypt order ID yet — still pending
    if not tx["swypt_order_id"]:
        return {
            "success": True,
            "status": "pending",
            "transaction": _tx_to_dict(tx),
        }

    # Poll Swypt for status
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{SWYPT_BASE_URL}/order-onramp-status/{tx['swypt_order_id']}",
                headers=_get_swypt_headers(),
            ) as resp:
                data = await resp.json()

                swypt_status = ""
                if isinstance(data, dict):
                    swypt_status = (
                        data.get("data", {}).get("status", "")
                        or data.get("status", "")
                    )

                if swypt_status == "SUCCESS":
                    # M-Pesa payment confirmed — process the deposit
                    deposit_result = await _process_deposit(tx)
                    if deposit_result["success"]:
                        # Complete the transaction (activate subscription / unlock prediction)
                        complete_result = _complete_transaction(transaction_id)
                        return {
                            "success": True,
                            "status": "completed",
                            "transaction": complete_result.get("transaction", _tx_to_dict(tx)),
                        }
                    else:
                        return {
                            "success": True,
                            "status": "processing",
                            "message": "Payment confirmed, processing...",
                            "transaction": _tx_to_dict(tx),
                        }

                elif swypt_status == "FAILED":
                    conn = _get_db()
                    conn.execute("""
                        UPDATE payment_transactions
                        SET payment_status = 'failed', failure_reason = 'M-Pesa payment failed', updated_at = ?
                        WHERE id = ?
                    """, (datetime.now().isoformat(), transaction_id))
                    conn.commit()
                    conn.close()
                    return {
                        "success": True,
                        "status": "failed",
                        "message": "M-Pesa payment failed",
                        "transaction": _tx_to_dict(tx),
                    }
                else:
                    # Still pending
                    return {
                        "success": True,
                        "status": "processing",
                        "message": "Waiting for M-Pesa confirmation...",
                        "transaction": _tx_to_dict(tx),
                    }

    except Exception as e:
        return {
            "success": True,
            "status": tx["payment_status"],
            "message": "Checking payment status...",
            "transaction": _tx_to_dict(tx),
        }


async def _process_deposit(tx) -> Dict:
    """Call Swypt deposit endpoint after successful M-Pesa payment."""
    platform_wallet = _get_platform_wallet()
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{SWYPT_BASE_URL}/swypt-deposit",
                json={
                    "chain": "celo",
                    "address": platform_wallet,
                    "orderID": tx["swypt_order_id"],
                    "project": "onramp",
                },
                headers=_get_swypt_headers(),
            ) as resp:
                data = await resp.json()
                if resp.status == 200:
                    return {"success": True, "data": data}
                return {"success": False, "error": data.get("message", "Deposit failed")}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _complete_transaction(transaction_id: int) -> Dict:
    """After deposit confirmed, fulfill the purchase (subscription/prediction)."""
    conn = _get_db()
    tx = conn.execute(
        "SELECT * FROM payment_transactions WHERE id = ?", (transaction_id,)
    ).fetchone()

    if not tx:
        conn.close()
        return {"success": False, "error": "Transaction not found"}

    now = datetime.now().isoformat()

    if tx["transaction_type"] == "subscription":
        # Activate the subscription
        result = subscriptions.create_subscription(
            user_id=tx["user_id"],
            plan_id=tx["reference_id"],
            payment_method="mpesa",
            payment_ref=tx["swypt_order_id"],
        )
    elif tx["transaction_type"] == "prediction_purchase":
        # Unlock the prediction
        result = community.purchase_prediction(
            prediction_id=int(tx["reference_id"]),
            buyer_id=tx["user_id"],
            payment_method="mpesa",
            payment_ref=tx["swypt_order_id"],
        )
    elif tx["transaction_type"] == "balance_topup":
        # Credit user's account balance
        amount_usd = tx["amount_usd"] or 0
        community.adjust_user_balance(
            user_id=tx["user_id"],
            amount_usd=amount_usd,
            amount_kes=0,
            reason="Pay on the Go deposit via M-Pesa",
            adjustment_type="topup",
        )
        result = {"success": True}
    else:
        result = {"success": True}

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

    return {"success": True, "transaction": _tx_to_dict(updated_tx)}


# ==================== OFF-RAMP (WITHDRAWALS) ====================

def request_withdrawal(user_id: int, amount_usd: float, phone: str) -> Dict:
    """Create a withdrawal request. Deducts balance immediately."""
    if amount_usd < MINIMUM_WITHDRAWAL_USD:
        return {"success": False, "error": f"Minimum withdrawal is ${MINIMUM_WITHDRAWAL_USD:.2f}"}

    conn = _get_db()

    # Check creator wallet balance
    wallet = conn.execute(
        "SELECT balance_usd FROM creator_wallets WHERE user_id = ?", (user_id,)
    ).fetchone()

    if not wallet or wallet["balance_usd"] < amount_usd:
        conn.close()
        return {"success": False, "error": "Insufficient balance"}

    # Check for pending withdrawal
    pending = conn.execute(
        "SELECT id FROM withdrawal_requests WHERE user_id = ? AND status IN ('pending', 'approved', 'processing')",
        (user_id,),
    ).fetchone()
    if pending:
        conn.close()
        return {"success": False, "error": "You already have a pending withdrawal request"}

    now = datetime.now().isoformat()

    # Estimate KES amount (approximate — admin will use current rate)
    # Use a rough estimate of 130 KES per USD
    estimated_kes = round(amount_usd * 130, 2)

    # Deduct balance
    conn.execute("""
        UPDATE creator_wallets
        SET balance_usd = balance_usd - ?, updated_at = ?
        WHERE user_id = ?
    """, (amount_usd, now, user_id))

    # Create withdrawal request
    cursor = conn.execute("""
        INSERT INTO withdrawal_requests
            (user_id, amount_usd, amount_kes, exchange_rate, phone_number, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    """, (user_id, amount_usd, estimated_kes, 130.0, phone, now, now))
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
    """Admin approves a withdrawal request."""
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

    # Refund balance
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
    # Join with users table in users.db using ATTACH
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
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "transaction_type": row["transaction_type"],
        "reference_id": row["reference_id"],
        "amount_kes": row["amount_kes"],
        "amount_usd": row["amount_usd"],
        "exchange_rate": row["exchange_rate"],
        "phone_number": row["phone_number"][-4:] if row["phone_number"] else "",  # Only last 4 digits
        "payment_status": row["payment_status"],
        "created_at": row["created_at"],
        "completed_at": row["completed_at"],
    }


def _wd_to_dict(row) -> Dict:
    """Convert a withdrawal_requests row to dict."""
    if not row:
        return {}
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
    }
