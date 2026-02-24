"""
Unified transaction aggregator.
Queries all payment/transaction tables across community.db and users.db,
normalizes each row into a common shape, and returns a sorted, paginated list.
"""

import sqlite3
from typing import Dict, List

COMMUNITY_DB = "community.db"
USERS_DB = "users.db"

WHOP_PERCENTAGE_FEE = 0.057
WHOP_FIXED_FEE = 0.30
EXCHANGE_RATE_MARKUP = 0.05


def _get_db(path=COMMUNITY_DB):
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _normalize_status(raw: str) -> str:
    return {
        "completed": "completed",
        "confirmed": "completed",
        "stk_sent": "pending",
        "pending": "pending",
        "processing": "pending",
        "approved": "pending",
        "failed": "failed",
        "expired": "expired",
        "rejected": "rejected",
        "cancelled": "failed",
    }.get(raw or "", raw or "unknown")


def _safe_float(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default


# ==================== FETCH HELPERS ====================

def _fetch_mpesa_transactions(user_id: int) -> List[Dict]:
    """Fetch M-Pesa payment transactions."""
    try:
        conn = _get_db()
        rows = conn.execute(
            "SELECT * FROM payment_transactions WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,)
        ).fetchall()
        conn.close()
    except Exception:
        return []

    results = []
    for r in rows:
        tx_type = r["transaction_type"] or ""
        amount_usd = _safe_float(r["amount_usd"])
        amount_kes = _safe_float(r["amount_kes"])
        exchange_rate = _safe_float(r["exchange_rate"])

        if tx_type == "balance_topup":
            unified_type, desc, icon = "deposit", "M-Pesa deposit", "deposit"
        elif tx_type == "subscription":
            ref_id = r["reference_id"] or ""
            unified_type, icon = "subscription", "subscription"
            desc = f"Pro subscription ({ref_id})" if ref_id else "Pro subscription"
        else:
            unified_type, desc, icon = "purchase", "Prediction purchase (M-Pesa)", "purchase"

        # Fee: exchange rate markup
        fee, fee_desc = 0.0, ""
        if exchange_rate and amount_kes and amount_usd:
            base_rate = exchange_rate / (1 + EXCHANGE_RATE_MARKUP)
            fair_usd = round(amount_kes / base_rate, 2)
            fee = round(fair_usd - amount_usd, 2)
            if fee > 0.01:
                fee_desc = f"{int(EXCHANGE_RATE_MARKUP * 100)}% exchange rate markup"
            else:
                fee = 0.0

        keys = r.keys()
        receipt = r["mpesa_receipt"] if "mpesa_receipt" in keys else ""

        results.append({
            "id": f"mpesa_{r['id']}",
            "date": r["completed_at"] or r["created_at"],
            "type": unified_type,
            "category": "payments",
            "description": desc,
            "amount": amount_usd,
            "currency": "USD",
            "amount_secondary": amount_kes if amount_kes else None,
            "currency_secondary": "KES" if amount_kes else None,
            "fee": fee,
            "fee_currency": "USD",
            "fee_description": fee_desc,
            "status": _normalize_status(r["payment_status"]),
            "payment_method": "mpesa",
            "reference": receipt or "",
        })
    return results


def _fetch_whop_transactions(user_id: int) -> List[Dict]:
    """Fetch Whop (card) payment transactions."""
    try:
        conn = _get_db()
        rows = conn.execute(
            "SELECT * FROM whop_transactions WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,)
        ).fetchall()
        conn.close()
    except Exception:
        return []

    results = []
    for r in rows:
        tx_type = r["transaction_type"] or ""
        amount_usd = _safe_float(r["amount_usd"])

        if tx_type == "balance_topup":
            unified_type, desc, icon = "deposit", "Card deposit", "deposit"
        elif tx_type == "subscription":
            ref_id = r["reference_id"] or ""
            unified_type, icon = "subscription", "subscription"
            desc = f"Pro subscription ({ref_id})" if ref_id else "Pro subscription"
        elif tx_type == "marketplace_subscription":
            unified_type, icon = "subscription", "subscription"
            desc = "Whop Marketplace — Pro subscription"
        else:
            unified_type, desc, icon = "purchase", "Prediction purchase (Card)", "purchase"

        # Fee calculation
        if tx_type == "marketplace_subscription":
            fee = 0.0  # Whop takes fees on their side
            fee_desc = ""
        else:
            fee = round(amount_usd * WHOP_PERCENTAGE_FEE + WHOP_FIXED_FEE, 2) if amount_usd else 0.0
            fee_desc = "Whop 5.7% + $0.30 processing" if fee > 0 else ""

        results.append({
            "id": f"whop_{r['id']}",
            "date": r["completed_at"] or r["created_at"],
            "type": unified_type,
            "category": "payments",
            "description": desc,
            "amount": amount_usd,
            "currency": "USD",
            "amount_secondary": None,
            "currency_secondary": None,
            "fee": fee,
            "fee_currency": "USD",
            "fee_description": fee_desc,
            "status": _normalize_status(r["payment_status"]),
            "payment_method": "card",
            "reference": r["whop_payment_id"] or "",
        })
    return results


def _fetch_withdrawals(user_id: int) -> List[Dict]:
    """Fetch withdrawal requests."""
    try:
        conn = _get_db()
        rows = conn.execute(
            "SELECT * FROM withdrawal_requests WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,)
        ).fetchall()
        conn.close()
    except Exception:
        return []

    results = []
    for r in rows:
        amount_usd = _safe_float(r["amount_usd"])
        amount_kes = _safe_float(r["amount_kes"])
        method = r["withdrawal_method"] or "mpesa"

        # Fee calculation
        fee, fee_currency, fee_desc = 0.0, "USD", ""
        if method == "mpesa" and amount_kes:
            # B2C fee tiers
            kes = amount_kes
            if kes <= 100:
                fee = 0
            elif kes <= 500:
                fee = 15
            elif kes <= 1000:
                fee = 23
            elif kes <= 2500:
                fee = 33
            elif kes <= 3500:
                fee = 53
            elif kes <= 5000:
                fee = 57
            elif kes <= 7500:
                fee = 77
            elif kes <= 10000:
                fee = 87
            elif kes <= 15000:
                fee = 97
            elif kes <= 20000:
                fee = 102
            else:
                fee = 108
            fee_currency = "KES"
            fee_desc = "Safaricom B2C fee" if fee > 0 else ""
        elif method == "whop" and amount_usd:
            fee = round(amount_usd * 0.03 + amount_usd * 0.027 + 0.30, 2)
            fee_currency = "USD"
            fee_desc = "Whop transfer fee" if fee > 0 else ""

        results.append({
            "id": f"withdraw_{r['id']}",
            "date": r["completed_at"] or r["created_at"],
            "type": "withdrawal",
            "category": "withdrawals",
            "description": f"Withdrawal ({method.upper()})",
            "amount": -amount_usd if amount_usd else 0,
            "currency": "USD",
            "amount_secondary": amount_kes if amount_kes else None,
            "currency_secondary": "KES" if amount_kes else None,
            "fee": fee,
            "fee_currency": fee_currency,
            "fee_description": fee_desc,
            "status": _normalize_status(r["status"]),
            "payment_method": method,
            "reference": "",
        })
    return results


def _fetch_balance_adjustments(user_id: int) -> List[Dict]:
    """Fetch balance adjustments (deductions, admin corrections, etc.)."""
    try:
        conn = _get_db()
        rows = conn.execute(
            "SELECT * FROM balance_adjustments WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,)
        ).fetchall()
        conn.close()
    except Exception:
        return []

    results = []
    for r in rows:
        amount_usd = _safe_float(r["amount_usd"])
        amount_kes = _safe_float(r["amount_kes"])
        adj_type = r["adjustment_type"] or ""
        reason = r["reason"] or ""

        # Determine type and category
        if adj_type in ("analysis_deduction", "jackpot_deduction"):
            unified_type = "deduction"
            category = "deductions"
            desc = "Match analysis" if "analysis" in adj_type else "Jackpot analysis"
            icon = "deduction"
        elif amount_usd < 0 or amount_kes < 0:
            unified_type = "deduction"
            category = "deductions"
            desc = reason or "Balance deduction"
            icon = "deduction"
        else:
            unified_type = "adjustment"
            category = "earnings"
            desc = reason or "Balance adjustment"
            icon = "earning"

        results.append({
            "id": f"adj_{r['id']}",
            "date": r["created_at"],
            "type": unified_type,
            "category": category,
            "description": desc,
            "amount": amount_usd,
            "currency": "USD",
            "amount_secondary": amount_kes if amount_kes else None,
            "currency_secondary": "KES" if amount_kes else None,
            "fee": 0.0,
            "fee_currency": "USD",
            "fee_description": "",
            "status": "completed",
            "payment_method": "",
            "reference": "",
        })
    return results


def _fetch_prediction_purchases(user_id: int) -> List[Dict]:
    """Fetch prediction purchases (as buyer with balance, and as seller)."""
    results = []
    try:
        import pricing_config
        creator_share = float(pricing_config.get("creator_sale_share", 0.70))
    except Exception:
        creator_share = 0.70

    try:
        conn = _get_db()
        # As buyer (only balance-paid to avoid duplicating mpesa/whop tx)
        buyer_rows = conn.execute(
            "SELECT * FROM prediction_purchases WHERE buyer_id = ? AND payment_method = 'balance' ORDER BY created_at DESC",
            (user_id,)
        ).fetchall()
        # As seller (all)
        seller_rows = conn.execute(
            "SELECT * FROM prediction_purchases WHERE seller_id = ? ORDER BY created_at DESC",
            (user_id,)
        ).fetchall()
        conn.close()
    except Exception:
        return []

    platform_pct = int((1 - creator_share) * 100)

    for r in buyer_rows:
        price = _safe_float(r["price_amount"])
        currency = r["price_currency"] or "USD"
        platform_fee = round(price * (1 - creator_share), 2)
        results.append({
            "id": f"pred_buy_{r['id']}",
            "date": r["created_at"],
            "type": "purchase",
            "category": "payments",
            "description": "Prediction purchase",
            "amount": -price,
            "currency": currency,
            "amount_secondary": None,
            "currency_secondary": None,
            "fee": platform_fee,
            "fee_currency": currency,
            "fee_description": f"Platform fee ({platform_pct}%)",
            "status": "completed",
            "payment_method": "balance",
            "reference": "",
        })

    for r in seller_rows:
        price = _safe_float(r["price_amount"])
        currency = r["price_currency"] or "USD"
        earnings = round(price * creator_share, 2)
        platform_fee = round(price - earnings, 2)
        results.append({
            "id": f"pred_sale_{r['id']}",
            "date": r["created_at"],
            "type": "sale",
            "category": "earnings",
            "description": "Prediction sold",
            "amount": earnings,
            "currency": currency,
            "amount_secondary": None,
            "currency_secondary": None,
            "fee": platform_fee,
            "fee_currency": currency,
            "fee_description": f"Platform commission ({platform_pct}%)",
            "status": "completed",
            "payment_method": "",
            "reference": "",
        })

    return results


def _fetch_referral_earnings(user_id: int) -> List[Dict]:
    """Fetch referral commission earnings."""
    try:
        conn = _get_db()
        rows = conn.execute(
            "SELECT * FROM referral_earnings WHERE referrer_id = ? ORDER BY created_at DESC",
            (user_id,)
        ).fetchall()
        conn.close()
    except Exception:
        return []

    results = []
    for r in rows:
        commission = _safe_float(r["commission_amount"])
        rate = _safe_float(r["commission_rate"])
        plan = r["subscription_plan"] or ""
        method = r["payment_method"] or ""

        results.append({
            "id": f"ref_{r['id']}",
            "date": r["created_at"],
            "type": "earning",
            "category": "earnings",
            "description": f"Referral commission ({plan})" if plan else "Referral commission",
            "amount": commission,
            "currency": "USD",
            "amount_secondary": None,
            "currency_secondary": None,
            "fee": 0.0,
            "fee_currency": "USD",
            "fee_description": "",
            "status": "completed",
            "payment_method": method,
            "reference": "",
        })
    return results


# ==================== PUBLIC API ====================

def get_unified_transactions(
    user_id: int,
    filter_type: str = "all",
    offset: int = 0,
    limit: int = 20,
) -> Dict:
    """Aggregate all transaction types for a user into a unified, sorted list."""

    all_transactions = []
    all_transactions.extend(_fetch_mpesa_transactions(user_id))
    all_transactions.extend(_fetch_whop_transactions(user_id))
    all_transactions.extend(_fetch_withdrawals(user_id))
    all_transactions.extend(_fetch_balance_adjustments(user_id))
    all_transactions.extend(_fetch_prediction_purchases(user_id))
    all_transactions.extend(_fetch_referral_earnings(user_id))

    # Filter by category
    if filter_type != "all":
        all_transactions = [t for t in all_transactions if t["category"] == filter_type]

    # Sort by date descending
    all_transactions.sort(key=lambda t: t["date"] or "", reverse=True)

    total = len(all_transactions)
    paginated = all_transactions[offset:offset + limit]

    return {
        "transactions": paginated,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": (offset + limit) < total,
    }
