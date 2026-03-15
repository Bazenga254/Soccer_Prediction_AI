"""
One-time script to link referred users to EpicFox13 and backfill referral earnings.
Run on VPS: cd /root/Soccer_Prediction_AI/backend && python fix_referrals.py
"""
import sqlite3
from datetime import datetime

USERS_DB = "users.db"
COMMUNITY_DB = "community.db"

REFERRER_USERNAME = "EpicFox13"
REFERRED_USERNAMES = [
    "SilentStorm19",
    "NeonViper94",
    "KeenCobra49",
    "QuickDragon88",
    "HyperRaider90",
    "EpicScout83",
    "BoldMaven40",
]

def get_conn(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def main():
    users_conn = get_conn(USERS_DB)
    comm_conn = get_conn(COMMUNITY_DB)
    now = datetime.now().isoformat()

    # Get referrer (EpicFox13)
    referrer = users_conn.execute(
        "SELECT id, display_name, referral_code FROM users WHERE username = ?",
        (REFERRER_USERNAME,)
    ).fetchone()

    if not referrer:
        print(f"ERROR: User '{REFERRER_USERNAME}' not found!")
        return

    referrer_id = referrer["id"]
    print(f"Referrer: {referrer['display_name']} (ID: {referrer_id}, Code: {referrer['referral_code']})")
    print("=" * 60)

    # Process each referred user
    for username in REFERRED_USERNAMES:
        user = users_conn.execute(
            "SELECT id, display_name, username, referred_by, tier FROM users WHERE username = ?",
            (username,)
        ).fetchone()

        if not user:
            print(f"  SKIP: User '{username}' not found")
            continue

        user_id = user["id"]
        print(f"\n  User: {user['display_name']} (@{user['username']}, ID: {user_id}, Tier: {user['tier']})")

        # Check if already referred by someone
        if user["referred_by"]:
            if user["referred_by"] == referrer_id:
                print(f"    Already linked to {REFERRER_USERNAME}")
            else:
                print(f"    WARNING: Already referred by user ID {user['referred_by']}. Updating to {REFERRER_USERNAME}.")

        # Link referral
        users_conn.execute(
            "UPDATE users SET referred_by = ? WHERE id = ?",
            (referrer_id, user_id)
        )
        print(f"    Linked as referral of {REFERRER_USERNAME}")

        # Check for existing payments (subscriptions) to backfill earnings
        # Check whop_transactions
        existing_payments = comm_conn.execute("""
            SELECT amount_usd, transaction_type, created_at, payment_status
            FROM whop_transactions
            WHERE user_id = ? AND payment_status = 'completed' AND amount_usd > 0
            ORDER BY created_at
        """, (user_id,)).fetchall()

        if existing_payments:
            for payment in existing_payments:
                amount = payment["amount_usd"]
                method = "card"
                txn_type = payment["transaction_type"] or "subscription"
                pay_date = payment["created_at"]

                # Check if earning already recorded
                existing = comm_conn.execute(
                    "SELECT id FROM referral_earnings WHERE referrer_id = ? AND referred_id = ? AND created_at = ?",
                    (referrer_id, user_id, pay_date)
                ).fetchone()

                if existing:
                    print(f"    Earning already recorded for payment on {pay_date}")
                    continue

                commission_rate = 0.30
                commission_amount = round(amount * commission_rate, 2)

                comm_conn.execute("""
                    INSERT INTO referral_earnings
                        (referrer_id, referred_id, subscription_plan, subscription_amount,
                         commission_rate, commission_amount, payment_method, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    referrer_id, user_id, txn_type, amount,
                    commission_rate, commission_amount, method, pay_date
                ))
                print(f"    Added earning: ${commission_amount:.2f} (30% of ${amount:.2f}) from {method} on {pay_date}")
        else:
            print(f"    No completed payments found (free user)")

    # Commit all changes
    users_conn.commit()
    comm_conn.commit()

    # Calculate total earnings
    total = comm_conn.execute(
        "SELECT COALESCE(SUM(commission_amount), 0) as total FROM referral_earnings WHERE referrer_id = ?",
        (referrer_id,)
    ).fetchone()["total"]

    count = comm_conn.execute(
        "SELECT COUNT(*) as cnt FROM referral_earnings WHERE referrer_id = ?",
        (referrer_id,)
    ).fetchone()["cnt"]

    # Ensure creator wallet exists and update balance
    comm_conn.execute("""
        INSERT INTO creator_wallets (user_id, balance_usd, balance_kes, total_earned_usd, total_earned_kes, total_sales, updated_at)
        VALUES (?, ?, 0, 0, 0, 0, ?)
        ON CONFLICT(user_id) DO UPDATE SET balance_usd = ?, updated_at = ?
    """, (referrer_id, total, now, total, now))
    comm_conn.commit()

    print("\n" + "=" * 60)
    print(f"DONE! {REFERRER_USERNAME} now has:")
    print(f"  Referred users: {len(REFERRED_USERNAMES)}")
    print(f"  Total earnings: ${total:.2f} ({count} commissions)")

    users_conn.close()
    comm_conn.close()

if __name__ == "__main__":
    main()
