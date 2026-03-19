"""One-time script: Grant 200 starter credits + 100 daily credits to all free users, and send notification."""
import sqlite3
from datetime import datetime, timedelta

now = datetime.now()
expires_at = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
now_str = now.isoformat()
expires_str = expires_at.isoformat()

uconn = sqlite3.connect("users.db")
uconn.row_factory = sqlite3.Row
free_users = uconn.execute("SELECT id FROM users WHERE tier = 'free' AND email_verified = 1").fetchall()
uconn.close()

print(f"Found {len(free_users)} free tier users")

conn = sqlite3.connect("community.db")
conn.row_factory = sqlite3.Row

for u in free_users:
    uid = u["id"]

    # Ensure balance row exists
    conn.execute(
        """INSERT OR IGNORE INTO user_balances (user_id, balance_usd, balance_kes,
            total_deposited_usd, total_deposited_kes, total_spent_usd, total_spent_kes,
            credits, daily_credits, updated_at)
        VALUES (?, 0, 0, 0, 0, 0, 0, 0, 0, ?)""",
        (uid, now_str),
    )

    bal = conn.execute("SELECT credits, daily_credits FROM user_balances WHERE user_id = ?", (uid,)).fetchone()
    purchased = bal["credits"] or 0
    daily = bal["daily_credits"] or 0

    # Grant 200 starter credits if they have 0
    if purchased == 0:
        conn.execute("UPDATE user_balances SET credits = 200, updated_at = ? WHERE user_id = ?", (now_str, uid))

    # Set 100 daily credits
    if daily == 0:
        conn.execute(
            "UPDATE user_balances SET daily_credits = 100, credits_daily_expires_at = ?, updated_at = ? WHERE user_id = ?",
            (expires_str, now_str, uid),
        )

    # Send notification
    conn.execute(
        """INSERT INTO notifications (user_id, type, title, message, metadata, is_read, created_at)
        VALUES (?, 'system', '200 Free Credits!',
                'Welcome! You have been given 200 free credits to get started. Plus, you now earn 100 free credits every day! Watch ads to earn even more.',
                '{}', 0, ?)""",
        (uid, now_str),
    )

conn.commit()
conn.close()

print(f"Done! Granted credits and notifications to {len(free_users)} users")
