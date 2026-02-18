"""
Pricing Configuration Module for Spark AI.
Manages all dynamic pricing, commissions, and plan configs from the database.
Replaces hardcoded values across the codebase with a centralized key-value store.
"""

import sqlite3
import json
from datetime import datetime
from typing import Optional, Dict, Any, List

DB_PATH = "users.db"

# In-memory cache for fast reads (refreshed on every update)
_cache: Dict[str, Any] = {}
_cache_loaded = False


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_pricing_db():
    """Create pricing_config table and seed defaults."""
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS pricing_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            config_key TEXT NOT NULL UNIQUE,
            config_value TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'general',
            label TEXT DEFAULT '',
            description TEXT DEFAULT '',
            value_type TEXT NOT NULL DEFAULT 'number',
            updated_at TEXT NOT NULL,
            updated_by TEXT DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_pricing_category ON pricing_config(category);
    """)
    conn.commit()
    _seed_defaults(conn)
    # Migration: ensure trial plans are in plans_list
    try:
        row = conn.execute("SELECT config_value FROM pricing_config WHERE config_key = 'plans_list'").fetchone()
        if row:
            existing_list = json.loads(row["config_value"])
            if "trial_usd" not in existing_list:
                new_list = ["trial_usd", "trial_kes"] + existing_list
                conn.execute(
                    "UPDATE pricing_config SET config_value = ?, updated_at = ? WHERE config_key = 'plans_list'",
                    (json.dumps(new_list), datetime.now().isoformat()),
                )
                conn.commit()
    except Exception:
        pass
    conn.close()
    _reload_cache()


def _seed_defaults(conn):
    """Insert default pricing values if they don't already exist."""
    now = datetime.now().isoformat()
    pro_weekly_features = json.dumps([
        "Unlimited match analyses",
        "Unlimited jackpot analyses",
        "Unlimited AI chat prompts",
        "Advanced analytics & value betting",
        "Ad-free experience",
        "Priority support",
    ])
    pro_monthly_features = json.dumps([
        "Everything in Weekly",
        "Save 20% vs weekly",
        "Monthly insights report",
    ])

    defaults = [
        # Subscription plans - Weekly USD
        ("plan_weekly_usd_price", "15.0", "subscription_plans", "Weekly USD Price", "Price for Pro Weekly plan in USD", "number"),
        ("plan_weekly_usd_duration", "7", "subscription_plans", "Weekly USD Duration (days)", "", "number"),
        ("plan_weekly_usd_name", "Pro Weekly (USD)", "subscription_plans", "Weekly USD Plan Name", "", "string"),
        ("plan_weekly_usd_features", pro_weekly_features, "subscription_plans", "Weekly USD Features", "", "json"),
        # Subscription plans - Weekly KES
        ("plan_weekly_kes_price", "1950.0", "subscription_plans", "Weekly KES Price", "Price for Pro Weekly plan in KES", "number"),
        ("plan_weekly_kes_duration", "7", "subscription_plans", "Weekly KES Duration (days)", "", "number"),
        ("plan_weekly_kes_name", "Pro Weekly (KES)", "subscription_plans", "Weekly KES Plan Name", "", "string"),
        ("plan_weekly_kes_features", pro_weekly_features, "subscription_plans", "Weekly KES Features", "", "json"),
        # Subscription plans - Monthly USD
        ("plan_monthly_usd_price", "48.0", "subscription_plans", "Monthly USD Price", "Price for Pro Monthly plan in USD", "number"),
        ("plan_monthly_usd_duration", "30", "subscription_plans", "Monthly USD Duration (days)", "", "number"),
        ("plan_monthly_usd_name", "Pro Monthly (USD)", "subscription_plans", "Monthly USD Plan Name", "", "string"),
        ("plan_monthly_usd_features", pro_monthly_features, "subscription_plans", "Monthly USD Features", "", "json"),
        # Subscription plans - Monthly KES
        ("plan_monthly_kes_price", "6200.0", "subscription_plans", "Monthly KES Price", "Price for Pro Monthly plan in KES", "number"),
        ("plan_monthly_kes_duration", "30", "subscription_plans", "Monthly KES Duration (days)", "", "number"),
        ("plan_monthly_kes_name", "Pro Monthly (KES)", "subscription_plans", "Monthly KES Plan Name", "", "string"),
        ("plan_monthly_kes_features", pro_monthly_features, "subscription_plans", "Monthly KES Features", "", "json"),
        # Subscription plans - Trial USD
        ("plan_trial_usd_price", "1.0", "subscription_plans", "Trial USD Price", "Price for 3-day trial in USD", "number"),
        ("plan_trial_usd_duration", "3", "subscription_plans", "Trial USD Duration (days)", "", "number"),
        ("plan_trial_usd_name", "3-Day Trial", "subscription_plans", "Trial USD Plan Name", "", "string"),
        ("plan_trial_usd_currency", "USD", "subscription_plans", "Trial USD Currency", "", "string"),
        ("plan_trial_usd_features", json.dumps(["10 AI analyses per day", "3 jackpot analyses per day", "Unlimited AI chat usage", "Unlimited game analysis", "3 days access"]), "subscription_plans", "Trial USD Features", "", "json"),
        # Subscription plans - Trial KES
        ("plan_trial_kes_price", "100.0", "subscription_plans", "Trial KES Price", "Price for 3-day trial in KES", "number"),
        ("plan_trial_kes_duration", "3", "subscription_plans", "Trial KES Duration (days)", "", "number"),
        ("plan_trial_kes_name", "3-Day Trial", "subscription_plans", "Trial KES Plan Name", "", "string"),
        ("plan_trial_kes_currency", "KES", "subscription_plans", "Trial KES Currency", "", "string"),
        ("plan_trial_kes_features", json.dumps(["10 AI analyses per day", "3 jackpot analyses per day", "Unlimited AI chat usage", "Unlimited game analysis", "3 days access"]), "subscription_plans", "Trial KES Features", "", "json"),
        # Active plan list
        ("plans_list", json.dumps(["weekly_usd", "weekly_kes", "monthly_usd", "monthly_kes"]),
         "subscription_plans", "Active Plan IDs", "List of active plan identifiers", "json"),
        # Commissions
        ("referral_commission_rate", "0.30", "commissions", "Referral Commission Rate", "Percentage of payment credited to referrer (0.30 = 30%)", "percent"),
        ("creator_sale_share", "0.70", "commissions", "Creator Sale Share", "Percentage of prediction sale price paid to creator (0.70 = 70%)", "percent"),
        # Pay per use
        ("match_analysis_price_usd", "0.50", "pay_per_use", "Match Analysis Price (USD)", "Per-analysis deduction for match analysis", "number"),
        ("jackpot_analysis_price_usd", "1.00", "pay_per_use", "Jackpot Analysis Price (USD)", "Per-analysis deduction for jackpot analysis", "number"),
        ("match_analysis_price_kes", "65.0", "pay_per_use", "Match Analysis Price (KES)", "Per-analysis price shown to KES users", "number"),
        ("jackpot_analysis_price_kes", "130.0", "pay_per_use", "Jackpot Analysis Price (KES)", "Per-analysis price shown to KES users", "number"),
        # Free tier
        ("free_predictions_per_day", "3", "free_tier", "Free Predictions Per Day", "Number of free predictions allowed per day", "number"),
        ("free_shares_per_day", "1", "free_tier", "Free Community Shares Per Day", "Number of free community shares allowed per day", "number"),
    ]

    for key, value, category, label, desc, vtype in defaults:
        existing = conn.execute("SELECT id FROM pricing_config WHERE config_key = ?", (key,)).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO pricing_config (config_key, config_value, category, label, description, value_type, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (key, value, category, label, desc, vtype, now),
            )
    conn.commit()


def _reload_cache():
    """Reload all config values into the in-memory cache."""
    global _cache, _cache_loaded
    conn = _get_db()
    rows = conn.execute("SELECT config_key, config_value, value_type FROM pricing_config").fetchall()
    conn.close()
    _cache = {}
    for row in rows:
        _cache[row["config_key"]] = _parse_value(row["config_value"], row["value_type"])
    _cache_loaded = True


def _parse_value(raw: str, value_type: str) -> Any:
    """Parse a stored string value into its proper Python type."""
    if value_type in ("number", "percent"):
        try:
            return float(raw)
        except (ValueError, TypeError):
            return 0.0
    elif value_type == "json":
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return []
    elif value_type == "boolean":
        return raw.lower() in ("true", "1", "yes")
    return raw  # string


def get(key: str, default=None) -> Any:
    """Get a pricing config value by key. Uses in-memory cache."""
    if not _cache_loaded:
        _reload_cache()
    return _cache.get(key, default)


def get_all_raw() -> List[Dict]:
    """Get all config entries with metadata (for admin panel)."""
    conn = _get_db()
    rows = conn.execute("SELECT * FROM pricing_config ORDER BY category, id").fetchall()
    conn.close()
    result = []
    for r in rows:
        item = dict(r)
        # Also include the parsed value for convenience
        item["parsed_value"] = _parse_value(item["config_value"], item["value_type"])
        result.append(item)
    return result


def update(key: str, value: Any, updated_by: str = "admin") -> Dict:
    """Update a single pricing config value."""
    conn = _get_db()
    existing = conn.execute("SELECT id, value_type FROM pricing_config WHERE config_key = ?", (key,)).fetchone()
    if not existing:
        conn.close()
        return {"success": False, "error": f"Config key '{key}' not found"}

    if existing["value_type"] == "json":
        store_value = json.dumps(value) if not isinstance(value, str) else value
    else:
        store_value = str(value)

    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE pricing_config SET config_value = ?, updated_at = ?, updated_by = ? WHERE config_key = ?",
        (store_value, now, updated_by, key),
    )
    conn.commit()
    conn.close()
    _reload_cache()
    return {"success": True}


def bulk_update(updates: Dict[str, Any], updated_by: str = "admin") -> Dict:
    """Update multiple config values at once."""
    conn = _get_db()
    now = datetime.now().isoformat()
    updated = 0
    errors = []
    for key, value in updates.items():
        existing = conn.execute("SELECT id, value_type FROM pricing_config WHERE config_key = ?", (key,)).fetchone()
        if not existing:
            errors.append(f"Key '{key}' not found")
            continue
        if existing["value_type"] == "json":
            store_value = json.dumps(value) if not isinstance(value, str) else value
        else:
            store_value = str(value)
        conn.execute(
            "UPDATE pricing_config SET config_value = ?, updated_at = ?, updated_by = ? WHERE config_key = ?",
            (store_value, now, updated_by, key),
        )
        updated += 1
    conn.commit()
    conn.close()
    _reload_cache()
    return {"success": True, "updated": updated, "errors": errors}


def create_config(key: str, value: Any, category: str, label: str = "", description: str = "",
                  value_type: str = "number", updated_by: str = "admin") -> Dict:
    """Create a new config entry."""
    conn = _get_db()
    existing = conn.execute("SELECT id FROM pricing_config WHERE config_key = ?", (key,)).fetchone()
    if existing:
        conn.close()
        return {"success": False, "error": f"Config key '{key}' already exists"}
    if value_type == "json":
        store_value = json.dumps(value) if not isinstance(value, str) else value
    else:
        store_value = str(value)
    now = datetime.now().isoformat()
    conn.execute(
        "INSERT INTO pricing_config (config_key, config_value, category, label, description, value_type, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (key, store_value, category, label, description, value_type, now, updated_by),
    )
    conn.commit()
    conn.close()
    _reload_cache()
    return {"success": True}


def delete_config(key: str) -> Dict:
    """Delete a config entry."""
    conn = _get_db()
    conn.execute("DELETE FROM pricing_config WHERE config_key = ?", (key,))
    conn.commit()
    conn.close()
    _reload_cache()
    return {"success": True}


# ─── Helpers: Build structured dicts from config ───

def get_plans_dict() -> Dict:
    """Build the PLANS dict dynamically from pricing_config."""
    if not _cache_loaded:
        _reload_cache()

    plans_list = get("plans_list", ["weekly_usd", "weekly_kes", "monthly_usd", "monthly_kes"])
    plans = {}
    for plan_id in plans_list:
        # Read stored currency, fall back to suffix-based detection for default plans
        currency = get(f"plan_{plan_id}_currency", "KES" if plan_id.endswith("_kes") else "USD")
        name = get(f"plan_{plan_id}_name")
        price = get(f"plan_{plan_id}_price")
        if name is None or price is None:
            continue  # skip incomplete plans
        plans[plan_id] = {
            "name": name,
            "price": price,
            "currency": currency,
            "duration_days": int(get(f"plan_{plan_id}_duration", 7)),
            "features": get(f"plan_{plan_id}_features", []),
        }
    return plans


def get_free_limits() -> Dict:
    """Build FREE_LIMITS dict from pricing config."""
    return {
        "predictions_per_day": int(get("free_predictions_per_day", 3)),
        "community_shares_per_day": int(get("free_shares_per_day", 1)),
        "show_ads": True,
        "advanced_analytics": False,
        "value_betting": False,
    }


def get_public_pricing() -> Dict:
    """Return all pricing info needed by the frontend (public endpoint)."""
    return {
        "plans": get_plans_dict(),
        "pay_per_use": {
            "match_analysis_price_usd": get("match_analysis_price_usd", 0.50),
            "jackpot_analysis_price_usd": get("jackpot_analysis_price_usd", 1.00),
            "match_analysis_price_kes": get("match_analysis_price_kes", 65.0),
            "jackpot_analysis_price_kes": get("jackpot_analysis_price_kes", 130.0),
        },
        "commissions": {
            "referral_rate": get("referral_commission_rate", 0.30),
            "creator_share": get("creator_sale_share", 0.70),
        },
        "free_limits": get_free_limits(),
    }
