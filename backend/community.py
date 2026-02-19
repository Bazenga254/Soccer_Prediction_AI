"""
Community Predictions System for Spark AI Prediction
Handles public/private prediction sharing, ratings, and comments.
"""

import sqlite3
import json
import asyncio
import time
from datetime import datetime
from typing import Optional, Dict, List
import pricing_config

DB_PATH = "community.db"

# Real-time notification signals: {user_id: latest_notification_id}
_notification_signals: Dict[int, int] = {}
# Asyncio events to wake up SSE listeners immediately
_notification_events: Dict[int, list] = {}

# Real-time support chat signals
_support_signals: Dict[int, int] = {}
_support_events: Dict[int, list] = {}

# Active user tracking: {user_id: (last_seen_timestamp, online_since_timestamp, display_name, username, avatar_color)}
_active_users: Dict[int, tuple] = {}
ACTIVE_TIMEOUT = 300  # 5 minutes


def _send_notif_email(user_id: int, notif_type: str, title: str, message: str, metadata: dict = None, from_email: str = ""):
    """Send an email notification for important events. Runs in background thread to avoid blocking."""
    import threading

    def _do_send():
        try:
            import user_auth
            user_info = user_auth.get_user_email_by_id(user_id)
            if user_info and user_info.get("email"):
                user_auth.send_notification_email(
                    to_email=user_info["email"],
                    display_name=user_info.get("display_name", ""),
                    notif_type=notif_type,
                    title=title,
                    message=message,
                    metadata=metadata,
                    from_email=from_email,
                )
        except Exception as e:
            print(f"[WARN] Failed to send notification email to user {user_id}: {e}")

    threading.Thread(target=_do_send, daemon=True).start()


def record_heartbeat(user_id: int, display_name: str = "", username: str = "", avatar_color: str = "#6c5ce7"):
    """Record that a user is currently active."""
    now = time.time()
    existing = _active_users.get(user_id)
    if existing and (now - existing[0]) < ACTIVE_TIMEOUT:
        # Still active - update last_seen but keep online_since
        _active_users[user_id] = (now, existing[1], display_name, username, avatar_color)
    else:
        # New session - set online_since to now
        _active_users[user_id] = (now, now, display_name, username, avatar_color)


def get_active_user_count() -> int:
    """Return count of users active in the last 5 minutes."""
    cutoff = time.time() - ACTIVE_TIMEOUT
    return sum(1 for ts, *_ in _active_users.values() if ts >= cutoff)


def get_active_users_list() -> List[Dict]:
    """Return list of currently active users (for admin)."""
    cutoff = time.time() - ACTIVE_TIMEOUT
    now = time.time()
    users = []
    for uid, (ts, online_since, dname, uname, color) in _active_users.items():
        if ts >= cutoff:
            users.append({
                "user_id": uid,
                "display_name": dname,
                "username": uname,
                "avatar_color": color,
                "last_seen": int(now - ts),  # seconds ago
                "online_duration": int(now - online_since),  # seconds since session started
            })
    users.sort(key=lambda u: u["last_seen"])
    return users


def cleanup_inactive_users():
    """Remove users inactive for over 10 minutes from tracking."""
    cutoff = time.time() - ACTIVE_TIMEOUT * 2
    stale = [uid for uid, (ts, *_) in _active_users.items() if ts < cutoff]
    for uid in stale:
        del _active_users[uid]


def remove_active_users(user_ids: list):
    """Immediately remove specific users from active tracking (for bot deactivation)."""
    for uid in user_ids:
        _active_users.pop(uid, None)


def get_notification_signal(user_id: int) -> int:
    """Get the latest notification id for a user."""
    return _notification_signals.get(user_id, 0)


def subscribe_notifications(user_id: int) -> asyncio.Event:
    """Subscribe to notification events for a user. Returns an asyncio.Event."""
    event = asyncio.Event()
    if user_id not in _notification_events:
        _notification_events[user_id] = []
    _notification_events[user_id].append(event)
    return event


def unsubscribe_notifications(user_id: int, event: asyncio.Event):
    """Unsubscribe from notification events."""
    if user_id in _notification_events:
        try:
            _notification_events[user_id].remove(event)
        except ValueError:
            pass
        if not _notification_events[user_id]:
            del _notification_events[user_id]


def _signal_notification(user_id: int, notif_id: int):
    """Signal that a new notification was created for a user."""
    _notification_signals[user_id] = notif_id
    # Wake up any SSE listeners for this user
    for event in _notification_events.get(user_id, []):
        event.set()


def get_support_signal(user_id: int) -> int:
    return _support_signals.get(user_id, 0)


def subscribe_support(user_id: int) -> asyncio.Event:
    event = asyncio.Event()
    if user_id not in _support_events:
        _support_events[user_id] = []
    _support_events[user_id].append(event)
    return event


def unsubscribe_support(user_id: int, event: asyncio.Event):
    if user_id in _support_events:
        try:
            _support_events[user_id].remove(event)
        except ValueError:
            pass
        if not _support_events[user_id]:
            del _support_events[user_id]


def _signal_support(user_id: int, msg_id: int):
    _support_signals[user_id] = msg_id
    for event in _support_events.get(user_id, []):
        event.set()


def _get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_community_db():
    """Create community prediction tables."""
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS community_predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            display_name TEXT NOT NULL,
            avatar_color TEXT DEFAULT '#6c5ce7',
            fixture_id TEXT NOT NULL,
            team_a_name TEXT NOT NULL,
            team_b_name TEXT NOT NULL,
            competition TEXT DEFAULT '',
            predicted_result TEXT,
            predicted_result_prob REAL,
            predicted_over25 TEXT,
            predicted_btts TEXT,
            best_value_bet TEXT,
            best_value_prob REAL,
            analysis_summary TEXT,
            visibility TEXT DEFAULT 'public',
            is_paid INTEGER DEFAULT 0,
            price_usd REAL DEFAULT 0,
            actual_result TEXT,
            match_finished INTEGER DEFAULT 0,
            result_correct INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS prediction_ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_id INTEGER NOT NULL REFERENCES community_predictions(id),
            user_id INTEGER NOT NULL,
            rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
            created_at TEXT NOT NULL,
            UNIQUE(prediction_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS prediction_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_id INTEGER NOT NULL REFERENCES community_predictions(id),
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            display_name TEXT NOT NULL,
            avatar_color TEXT DEFAULT '#6c5ce7',
            content TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS prediction_purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_id INTEGER NOT NULL REFERENCES community_predictions(id),
            buyer_id INTEGER NOT NULL,
            seller_id INTEGER NOT NULL,
            price_amount REAL NOT NULL,
            price_currency TEXT NOT NULL DEFAULT 'USD',
            payment_method TEXT DEFAULT '',
            payment_ref TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            UNIQUE(prediction_id, buyer_id)
        );

        CREATE TABLE IF NOT EXISTS creator_wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            balance_usd REAL DEFAULT 0,
            balance_kes REAL DEFAULT 0,
            total_earned_usd REAL DEFAULT 0,
            total_earned_kes REAL DEFAULT 0,
            total_sales INTEGER DEFAULT 0,
            updated_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_cp_user ON community_predictions(user_id);
        CREATE INDEX IF NOT EXISTS idx_cp_visibility ON community_predictions(visibility);
        CREATE INDEX IF NOT EXISTS idx_cp_created ON community_predictions(created_at);
        CREATE INDEX IF NOT EXISTS idx_ratings_pred ON prediction_ratings(prediction_id);
        CREATE INDEX IF NOT EXISTS idx_comments_pred ON prediction_comments(prediction_id);
        CREATE INDEX IF NOT EXISTS idx_purchases_buyer ON prediction_purchases(buyer_id);
        CREATE INDEX IF NOT EXISTS idx_purchases_pred ON prediction_purchases(prediction_id);
        CREATE INDEX IF NOT EXISTS idx_wallets_user ON creator_wallets(user_id);

        CREATE TABLE IF NOT EXISTS user_balances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            balance_usd REAL DEFAULT 0,
            balance_kes REAL DEFAULT 0,
            total_deposited_usd REAL DEFAULT 0,
            total_deposited_kes REAL DEFAULT 0,
            total_spent_usd REAL DEFAULT 0,
            total_spent_kes REAL DEFAULT 0,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS balance_adjustments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount_usd REAL DEFAULT 0,
            amount_kes REAL DEFAULT 0,
            adjustment_type TEXT NOT NULL,
            reason TEXT DEFAULT '',
            adjusted_by_id INTEGER,
            adjusted_by_name TEXT DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_user_balances_user ON user_balances(user_id);
        CREATE INDEX IF NOT EXISTS idx_balance_adj_user ON balance_adjustments(user_id);

        CREATE TABLE IF NOT EXISTS notification_reads (
            user_id INTEGER PRIMARY KEY,
            last_read_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            is_read INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(user_id, is_read);

        CREATE TABLE IF NOT EXISTS direct_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            sender_username TEXT NOT NULL,
            sender_display_name TEXT NOT NULL,
            sender_avatar_color TEXT DEFAULT '#6c5ce7',
            content TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_dm_sender ON direct_messages(sender_id);
        CREATE INDEX IF NOT EXISTS idx_dm_receiver ON direct_messages(receiver_id);
        CREATE INDEX IF NOT EXISTS idx_dm_created ON direct_messages(created_at);

        CREATE TABLE IF NOT EXISTS support_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            sender TEXT NOT NULL,
            content TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            category TEXT DEFAULT NULL,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_support_user ON support_messages(user_id, created_at);

        CREATE TABLE IF NOT EXISTS support_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            assigned_agent_id INTEGER DEFAULT NULL,
            assigned_agent_name TEXT DEFAULT NULL,
            closed_at TEXT DEFAULT NULL,
            closed_reason TEXT DEFAULT NULL,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sc_user ON support_conversations(user_id);
        CREATE INDEX IF NOT EXISTS idx_sc_status ON support_conversations(status);

        CREATE TABLE IF NOT EXISTS support_ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            agent_id INTEGER NOT NULL,
            agent_name TEXT NOT NULL,
            rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
            comment TEXT DEFAULT NULL,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sr_agent ON support_ratings(agent_id);

        CREATE TABLE IF NOT EXISTS prediction_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            reaction TEXT NOT NULL CHECK(reaction IN ('like', 'dislike')),
            created_at TEXT NOT NULL,
            UNIQUE(prediction_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_preact_pred ON prediction_reactions(prediction_id);

        CREATE TABLE IF NOT EXISTS prediction_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prediction_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            display_name TEXT NOT NULL,
            avatar_color TEXT DEFAULT '#64748b',
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_pchat_pred ON prediction_chats(prediction_id);
        CREATE INDEX IF NOT EXISTS idx_pchat_created ON prediction_chats(prediction_id, created_at);

        CREATE TABLE IF NOT EXISTS match_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_key TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            display_name TEXT NOT NULL,
            avatar_color TEXT DEFAULT '#64748b',
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mchat_match ON match_chats(match_key);
        CREATE INDEX IF NOT EXISTS idx_mchat_created ON match_chats(match_key, created_at);

        CREATE TABLE IF NOT EXISTS user_follows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            follower_id INTEGER NOT NULL,
            following_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(follower_id, following_id)
        );
        CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_id);
        CREATE INDEX IF NOT EXISTS idx_follows_following ON user_follows(following_id);

        CREATE TABLE IF NOT EXISTS broadcast_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            sender_name TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending_approval',
            approved_by_id INTEGER DEFAULT NULL,
            approved_by_name TEXT DEFAULT NULL,
            approved_at TEXT DEFAULT NULL,
            rejected_reason TEXT DEFAULT NULL,
            sent_at TEXT DEFAULT NULL,
            recipient_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_broadcast_status ON broadcast_messages(status);

        CREATE TABLE IF NOT EXISTS chat_keepalive_prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            agent_id INTEGER NOT NULL,
            prompted_at TEXT NOT NULL,
            responded INTEGER DEFAULT 0,
            response TEXT DEFAULT NULL,
            responded_at TEXT DEFAULT NULL,
            UNIQUE(conversation_id, prompted_at)
        );

        CREATE TABLE IF NOT EXISTS bot_message_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            queue_batch_id TEXT NOT NULL,
            bot_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            target_id TEXT NOT NULL,
            message TEXT DEFAULT '',
            reaction TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            scheduled_at TEXT NOT NULL,
            executed_at TEXT,
            error TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_bmq_batch ON bot_message_queue(queue_batch_id);
        CREATE INDEX IF NOT EXISTS idx_bmq_status ON bot_message_queue(status, scheduled_at);
    """)

    # Add columns via migration for existing installs
    for col_sql in [
        "ALTER TABLE support_messages ADD COLUMN category TEXT DEFAULT NULL",
        "ALTER TABLE support_messages ADD COLUMN escalated INTEGER DEFAULT 0",
        "ALTER TABLE support_messages ADD COLUMN agent_id INTEGER DEFAULT NULL",
        "ALTER TABLE support_messages ADD COLUMN agent_name TEXT DEFAULT NULL",
        "ALTER TABLE support_messages ADD COLUMN conversation_id INTEGER DEFAULT NULL",
        "ALTER TABLE community_predictions ADD COLUMN competition_code TEXT DEFAULT ''",
        "ALTER TABLE community_predictions ADD COLUMN is_live_bet INTEGER DEFAULT 0",
        "ALTER TABLE community_predictions ADD COLUMN view_count INTEGER DEFAULT 0",
        "ALTER TABLE community_predictions ADD COLUMN click_count INTEGER DEFAULT 0",
        "ALTER TABLE community_predictions ADD COLUMN odds REAL",
        "ALTER TABLE community_predictions ADD COLUMN slip_id TEXT",
        "ALTER TABLE community_predictions ADD COLUMN combined_odds REAL",
    ]:
        try:
            conn.execute(col_sql)
            conn.commit()
        except Exception:
            pass

    # Backfill: create conversation records for existing messages without a conversation_id
    try:
        orphans = conn.execute(
            "SELECT DISTINCT user_id FROM support_messages WHERE conversation_id IS NULL"
        ).fetchall()
        if orphans:
            now = datetime.now().isoformat()
            for row in orphans:
                uid = row["user_id"]
                conn.execute(
                    "INSERT INTO support_conversations (user_id, status, created_at) VALUES (?, 'active', ?)",
                    (uid, now)
                )
                conv_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                conn.execute(
                    "UPDATE support_messages SET conversation_id = ? WHERE user_id = ? AND conversation_id IS NULL",
                    (conv_id, uid)
                )
            conn.commit()
    except Exception:
        pass

    conn.commit()
    conn.close()


# ==================== NOTIFICATIONS ====================

def create_notification(user_id: int, notif_type: str, title: str, message: str, metadata: Dict = None) -> int:
    """Create a notification for a user. Returns notification id."""
    conn = _get_db()
    now = datetime.now().isoformat()
    meta_json = json.dumps(metadata or {})
    conn.execute("""
        INSERT INTO notifications (user_id, type, title, message, metadata, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?)
    """, (user_id, notif_type, title, message, meta_json, now))
    conn.commit()
    notif_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    _signal_notification(user_id, notif_id)
    return notif_id


def create_referral_notification(referrer_user_id: int, subscriber_name: str, plan: str) -> int:
    """Notify a user when their referral subscribes to a paid plan."""
    return create_notification(
        user_id=referrer_user_id,
        notif_type="referral_subscription",
        title="New Referral Subscriber!",
        message=f"{subscriber_name} just upgraded to {plan.replace('_', ' ').title()} using your referral link. Great work building your network!",
        metadata={"subscriber_name": subscriber_name, "plan": plan},
    )


def create_withdrawal_notification(user_id: int, amount: float, currency: str = "USD") -> int:
    """Notify a user when their withdrawal is processed."""
    _send_notif_email(
        user_id=user_id,
        notif_type="withdrawal",
        title="Withdrawal Processed",
        message=f"Your withdrawal of <strong>${amount:.2f} {currency}</strong> has been processed successfully. The funds should appear in your account shortly.",
    )
    return create_notification(
        user_id=user_id,
        notif_type="withdrawal",
        title="Withdrawal Processed",
        message=f"Your withdrawal of ${amount:.2f} {currency} has been processed successfully.",
        metadata={"amount": amount, "currency": currency},
    )


# ==================== CREATOR WALLET ====================

def get_creator_wallet(user_id: int) -> Dict:
    """Get a creator's wallet balance."""
    conn = _get_db()
    row = conn.execute("SELECT * FROM creator_wallets WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    if row:
        return {
            "balance_usd": row["balance_usd"],
            "balance_kes": row["balance_kes"],
            "total_earned_usd": row["total_earned_usd"],
            "total_earned_kes": row["total_earned_kes"],
            "total_sales": row["total_sales"],
        }
    return {"balance_usd": 0, "balance_kes": 0, "total_earned_usd": 0, "total_earned_kes": 0, "total_sales": 0}


def adjust_creator_wallet(user_id: int, amount_usd: float, amount_kes: float = 0, reason: str = "") -> Dict:
    """Credit or debit a creator's wallet balance.

    Used for referral commissions and any manual adjustments.
    Positive amount = credit, negative = debit.
    """
    conn = _get_db()
    now = datetime.now().isoformat()

    # Ensure wallet row exists
    conn.execute("""
        INSERT INTO creator_wallets (user_id, balance_usd, balance_kes, total_earned_usd, total_earned_kes, total_sales, updated_at)
        VALUES (?, 0, 0, 0, 0, 0, ?)
        ON CONFLICT(user_id) DO NOTHING
    """, (user_id, now))

    # Update balance (USD and KES)
    conn.execute("""
        UPDATE creator_wallets SET
            balance_usd = balance_usd + ?,
            balance_kes = balance_kes + ?,
            total_earned_usd = CASE WHEN ? > 0 THEN total_earned_usd + ? ELSE total_earned_usd END,
            total_earned_kes = CASE WHEN ? > 0 THEN total_earned_kes + ? ELSE total_earned_kes END,
            updated_at = ?
        WHERE user_id = ?
    """, (amount_usd, amount_kes, amount_usd, amount_usd, amount_kes, amount_kes, now, user_id))
    conn.commit()

    row = conn.execute("SELECT * FROM creator_wallets WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()

    return {
        "balance_usd": row["balance_usd"] if row else 0,
        "balance_kes": row["balance_kes"] if row else 0,
        "total_earned_usd": row["total_earned_usd"] if row else 0,
        "total_earned_kes": row["total_earned_kes"] if row else 0,
    }


# ==================== USER SUSPENSION ====================

def handle_user_suspension(user_id: int) -> Dict:
    """Handle all community cleanup when a user is suspended by admin.
    - Hides all their predictions from marketplace
    - Refunds all purchases of their paid predictions to buyers
    - Notifies buyers about the refund
    - Resets creator wallet
    """
    conn = _get_db()

    # 1. Gather all purchases of this seller's predictions
    purchases = conn.execute("""
        SELECT pp.id, pp.prediction_id, pp.buyer_id, pp.price_amount,
               cp.team_a_name, cp.team_b_name
        FROM prediction_purchases pp
        JOIN community_predictions cp ON cp.id = pp.prediction_id
        WHERE pp.seller_id = ?
    """, (user_id,)).fetchall()
    purchases = [dict(p) for p in purchases]

    # 2. Delete purchase records so predictions appear locked again
    conn.execute("DELETE FROM prediction_purchases WHERE seller_id = ?", (user_id,))

    # 3. Reset creator wallet to zero
    now = datetime.now().isoformat()
    conn.execute("""
        UPDATE creator_wallets SET
            balance_usd = 0, balance_kes = 0,
            total_earned_usd = 0, total_earned_kes = 0,
            total_sales = 0, updated_at = ?
        WHERE user_id = ?
    """, (now, user_id))

    # 4. Hide all their predictions from the marketplace
    conn.execute("""
        UPDATE community_predictions SET visibility = 'suspended'
        WHERE user_id = ?
    """, (user_id,))

    conn.commit()
    conn.close()

    # 5. Process refunds for each buyer (uses its own DB connections)
    refund_count = 0
    total_refunded = 0.0

    for purchase in purchases:
        buyer_id = purchase["buyer_id"]
        refund_amount = purchase["price_amount"]
        match_name = f"{purchase['team_a_name']} vs {purchase['team_b_name']}"

        # Refund to buyer's account balance
        adjust_user_balance(
            user_id=buyer_id,
            amount_usd=refund_amount,
            amount_kes=0,
            reason=f"Refund: Seller suspended for community guidelines violation - {match_name}",
            adjustment_type="refund",
            adjusted_by_name="System",
        )

        # Create in-app notification for buyer
        create_notification(
            user_id=buyer_id,
            notif_type="refund",
            title="Purchase Refunded",
            message=f"Your purchase of the {match_name} prediction (${refund_amount:.2f}) has been refunded to your account balance. The seller violated community guidelines.",
            metadata={"prediction_id": purchase["prediction_id"], "amount": refund_amount, "match": match_name},
        )

        # Send email notification to buyer
        _send_notif_email(
            user_id=buyer_id,
            notif_type="refund",
            title="Purchase Refunded",
            message=f"Your purchase of the <strong>{match_name}</strong> prediction (<strong>${refund_amount:.2f}</strong>) has been refunded to your account balance. The seller was suspended for violating community guidelines.",
            metadata={"amount": refund_amount, "match": match_name},
        )

        refund_count += 1
        total_refunded += refund_amount

    return {
        "success": True,
        "predictions_hidden": True,
        "refund_count": refund_count,
        "total_refunded": round(total_refunded, 2),
    }


# ==================== FOLLOW SYSTEM ====================

def follow_user(follower_id: int, following_id: int) -> Dict:
    """Follow a user. Returns success status and follower count."""
    if follower_id == following_id:
        return {"success": False, "error": "Cannot follow yourself"}
    conn = _get_db()
    now = datetime.now().isoformat()
    try:
        conn.execute(
            "INSERT INTO user_follows (follower_id, following_id, created_at) VALUES (?, ?, ?)",
            (follower_id, following_id, now),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return {"success": False, "error": "Already following this user"}
    followers_count = conn.execute(
        "SELECT COUNT(*) as c FROM user_follows WHERE following_id = ?", (following_id,)
    ).fetchone()["c"]

    # Get follower's display name from users table
    uconn = sqlite3.connect("users.db")
    uconn.row_factory = sqlite3.Row
    follower_row = uconn.execute(
        "SELECT display_name, avatar_color FROM users WHERE id = ?",
        (follower_id,),
    ).fetchone()
    uconn.close()
    conn.close()

    follower_name = follower_row["display_name"] if follower_row else "Someone"
    follower_avatar = follower_row["avatar_color"] if follower_row else "#6c5ce7"

    # Notify the followed user
    create_notification(
        user_id=following_id,
        notif_type="new_follower",
        title=f"{follower_name} started following you",
        message=f"{follower_name} is now following you. They'll get notified when you post predictions.",
        metadata={
            "follower_id": follower_id,
            "follower_name": follower_name,
            "follower_avatar": follower_avatar,
            "followers_count": followers_count,
        },
    )

    # Send email notification to followed user
    _send_notif_email(
        user_id=following_id,
        notif_type="new_follower",
        title=f"{follower_name} started following you",
        message=f"<strong>{follower_name}</strong> is now following you! They'll get notified every time you share a prediction. Keep posting great insights to grow your audience.",
    )

    return {"success": True, "followers_count": followers_count}


def unfollow_user(follower_id: int, following_id: int) -> Dict:
    """Unfollow a user."""
    conn = _get_db()
    conn.execute(
        "DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?",
        (follower_id, following_id),
    )
    conn.commit()
    followers_count = conn.execute(
        "SELECT COUNT(*) as c FROM user_follows WHERE following_id = ?", (following_id,)
    ).fetchone()["c"]
    conn.close()
    return {"success": True, "followers_count": followers_count}


def is_following(follower_id: int, following_id: int) -> bool:
    """Check if follower_id follows following_id."""
    conn = _get_db()
    row = conn.execute(
        "SELECT id FROM user_follows WHERE follower_id = ? AND following_id = ?",
        (follower_id, following_id),
    ).fetchone()
    conn.close()
    return row is not None


def get_follow_stats(user_id: int) -> Dict:
    """Get follower and following counts for a user."""
    conn = _get_db()
    followers = conn.execute(
        "SELECT COUNT(*) as c FROM user_follows WHERE following_id = ?", (user_id,)
    ).fetchone()["c"]
    following = conn.execute(
        "SELECT COUNT(*) as c FROM user_follows WHERE follower_id = ?", (user_id,)
    ).fetchone()["c"]
    conn.close()
    return {"followers_count": followers, "following_count": following}


def get_follower_ids(user_id: int) -> List[int]:
    """Get list of user IDs that follow this user."""
    conn = _get_db()
    rows = conn.execute(
        "SELECT follower_id FROM user_follows WHERE following_id = ?", (user_id,)
    ).fetchall()
    conn.close()
    return [r["follower_id"] for r in rows]


def share_prediction(
    user_id: int,
    username: str,
    display_name: str,
    avatar_color: str,
    fixture_id: str,
    team_a_name: str,
    team_b_name: str,
    competition: str,
    predicted_result: str,
    predicted_result_prob: float,
    predicted_over25: str = None,
    predicted_btts: str = None,
    best_value_bet: str = None,
    best_value_prob: float = None,
    analysis_summary: str = "",
    visibility: str = "public",
    is_paid: bool = False,
    price_usd: float = 0,
    competition_code: str = "",
    is_live_bet: bool = False,
    odds: float = None,
    slip_id: str = None,
    combined_odds: float = None,
) -> Dict:
    """Share a prediction to the community."""
    if visibility not in ("public", "private"):
        return {"success": False, "error": "Visibility must be 'public' or 'private'"}

    conn = _get_db()
    now = datetime.now().isoformat()

    conn.execute("""
        INSERT INTO community_predictions (
            user_id, username, display_name, avatar_color,
            fixture_id, team_a_name, team_b_name, competition, competition_code,
            predicted_result, predicted_result_prob,
            predicted_over25, predicted_btts,
            best_value_bet, best_value_prob,
            analysis_summary, visibility, is_paid, price_usd, is_live_bet, odds,
            slip_id, combined_odds, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, username, display_name, avatar_color,
        fixture_id, team_a_name, team_b_name, competition, competition_code,
        predicted_result, predicted_result_prob,
        predicted_over25, predicted_btts,
        best_value_bet, best_value_prob,
        analysis_summary, visibility, 1 if is_paid else 0, price_usd,
        1 if is_live_bet else 0, odds, slip_id, combined_odds, now,
    ))
    conn.commit()
    pred_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    # Check if this is the user's first prediction today
    today = datetime.now().strftime("%Y-%m-%d")
    today_count = conn.execute(
        "SELECT COUNT(*) as c FROM community_predictions WHERE user_id = ? AND created_at LIKE ?",
        (user_id, f"{today}%"),
    ).fetchone()["c"]
    conn.close()

    is_first_today = today_count == 1
    if is_first_today:
        match_name = f"{team_a_name} vs {team_b_name}"
        create_notification(
            user_id=user_id,
            notif_type="first_prediction",
            title="First Prediction of the Day!",
            message="Congratulations on posting your first prediction today! Keep sharing your insights to build trust and grow your following.",
            metadata={"prediction_id": pred_id, "match": match_name},
        )

    # Notify all followers about this new prediction
    if visibility == "public":
        match_name = f"{team_a_name} vs {team_b_name}"
        follower_ids = get_follower_ids(user_id)
        for fid in follower_ids:
            create_notification(
                user_id=fid,
                notif_type="new_prediction",
                title=f"{display_name} posted a prediction",
                message=f"{display_name} shared a new prediction for {match_name}. Check it out!",
                metadata={
                    "prediction_id": pred_id,
                    "match": match_name,
                    "poster_id": user_id,
                    "poster_name": display_name,
                    "poster_avatar": avatar_color,
                },
            )
            # Email each follower
            _send_notif_email(
                user_id=fid,
                notif_type="new_prediction",
                title=f"{display_name} posted a prediction",
                message=f"<strong>{display_name}</strong> shared a new prediction for <strong>{match_name}</strong>. Head over to Spark AI to check it out!",
            )

    return {"success": True, "prediction_id": pred_id, "is_first_today": is_first_today}


def _get_order_clause(sort_by: str) -> str:
    """Return SQL ORDER BY clause for the given sort mode."""
    if sort_by == "top_rated":
        return "ORDER BY avg_rating DESC, rating_count DESC, cp.created_at DESC"
    elif sort_by == "hot":
        # Engagement in last 24 hours (ratings + comments + chats + reactions)
        return """ORDER BY (
            (SELECT COUNT(*) FROM prediction_ratings pr2 WHERE pr2.prediction_id = cp.id
             AND pr2.created_at >= datetime('now', '-1 day'))
            + (SELECT COUNT(*) FROM prediction_comments pc2 WHERE pc2.prediction_id = cp.id
               AND pc2.created_at >= datetime('now', '-1 day'))
            + (SELECT COUNT(*) FROM prediction_chats pch2 WHERE pch2.prediction_id = cp.id
               AND pch2.created_at >= datetime('now', '-1 day'))
            + (SELECT COUNT(*) FROM prediction_reactions prx2 WHERE prx2.prediction_id = cp.id
               AND prx2.created_at >= datetime('now', '-1 day'))
        ) DESC, cp.created_at DESC"""
    elif sort_by == "new":
        return "ORDER BY cp.created_at DESC"
    else:
        # "best" — composite ranking score (accuracy 30%, rating 20%, recency 20%, engagement 30%)
        # engagement now heavily weights chat activity
        return """ORDER BY (
            COALESCE((SELECT
                CASE WHEN SUM(CASE WHEN cp2.match_finished = 1 THEN 1 ELSE 0 END) >= 3
                     THEN CAST(SUM(CASE WHEN cp2.match_finished = 1 AND cp2.result_correct = 1 THEN 1 ELSE 0 END) AS REAL)
                          / SUM(CASE WHEN cp2.match_finished = 1 THEN 1 ELSE 0 END)
                     ELSE 0.5
                END
            FROM community_predictions cp2 WHERE cp2.user_id = cp.user_id AND cp2.visibility = 'public'), 0.5) * 0.30
            + (COALESCE(AVG(pr.rating), 0) / 5.0) * 0.20
            + MAX(0, 1.0 - (CAST((julianday('now') - julianday(cp.created_at)) * 24 AS REAL) / 168.0)) * 0.20
            + MIN(1.0, (COUNT(DISTINCT pr.id) + COUNT(DISTINCT pc.id)
              + COALESCE((SELECT COUNT(*) FROM prediction_chats pch3 WHERE pch3.prediction_id = cp.id), 0)
              + COALESCE((SELECT COUNT(*) FROM prediction_reactions prx3 WHERE prx3.prediction_id = cp.id), 0)
            ) / 15.0) * 0.30
        ) DESC, cp.created_at DESC"""


def get_public_predictions(page: int = 1, per_page: int = 20, user_id: int = None, sort_by: str = "best", viewer_id: int = None) -> Dict:
    """Get public community predictions (paginated). Optionally filter by user_id."""
    conn = _get_db()
    offset = (page - 1) * per_page

    where = "WHERE cp.visibility = 'public'"
    # Only show predictions for matches that haven't been played yet
    where += " AND cp.match_finished = 0"
    params_count = []
    params_query = []
    if user_id is not None:
        where += " AND cp.user_id = ?"
        params_count.append(user_id)
        params_query.append(user_id)

    total = conn.execute(
        f"SELECT COUNT(*) as c FROM community_predictions cp {where}",
        params_count
    ).fetchone()["c"]

    order_clause = _get_order_clause(sort_by)

    params_query.extend([per_page, offset])
    rows = conn.execute(f"""
        SELECT cp.*,
            COALESCE(AVG(pr.rating), 0) as avg_rating,
            COUNT(DISTINCT pr.id) as rating_count,
            COUNT(DISTINCT pc.id) as comment_count
        FROM community_predictions cp
        LEFT JOIN prediction_ratings pr ON pr.prediction_id = cp.id
        LEFT JOIN prediction_comments pc ON pc.prediction_id = cp.id
        {where}
        GROUP BY cp.id
        {order_clause}
        LIMIT ? OFFSET ?
    """, params_query).fetchall()

    # Get predictor accuracy for each unique user in results
    user_ids = list(set(r["user_id"] for r in rows))
    accuracy_map = {}
    if user_ids:
        placeholders = ",".join("?" * len(user_ids))
        acc_rows = conn.execute(f"""
            SELECT user_id,
                SUM(CASE WHEN match_finished = 1 THEN 1 ELSE 0 END) as finished,
                SUM(CASE WHEN match_finished = 1 AND result_correct = 1 THEN 1 ELSE 0 END) as correct
            FROM community_predictions
            WHERE visibility = 'public' AND user_id IN ({placeholders})
            GROUP BY user_id
        """, user_ids).fetchall()
        for ar in acc_rows:
            finished = ar["finished"] or 0
            correct = ar["correct"] or 0
            accuracy_map[ar["user_id"]] = {
                "accuracy": round((correct / finished) * 100, 1) if finished >= 3 else None,
                "wins": correct,
                "losses": finished - correct,
                "total_finished": finished,
            }

    # Get reaction counts for all predictions in results
    pred_ids = [r["id"] for r in rows]
    reactions_map = {}
    if pred_ids:
        ph = ",".join("?" * len(pred_ids))
        react_rows = conn.execute(f"""
            SELECT prediction_id,
                SUM(CASE WHEN reaction = 'like' THEN 1 ELSE 0 END) as likes,
                SUM(CASE WHEN reaction = 'dislike' THEN 1 ELSE 0 END) as dislikes
            FROM prediction_reactions WHERE prediction_id IN ({ph})
            GROUP BY prediction_id
        """, pred_ids).fetchall()
        for rr in react_rows:
            reactions_map[rr["prediction_id"]] = {"likes": rr["likes"] or 0, "dislikes": rr["dislikes"] or 0}

    # Get chat message counts
    chat_counts = {}
    if pred_ids:
        chat_rows = conn.execute(f"""
            SELECT prediction_id, COUNT(*) as cnt
            FROM prediction_chats WHERE prediction_id IN ({ph})
            GROUP BY prediction_id
        """, pred_ids).fetchall()
        for cr in chat_rows:
            chat_counts[cr["prediction_id"]] = cr["cnt"]

    # Get follower counts for each unique predictor
    followers_map = {}
    if user_ids:
        for uid in user_ids:
            cnt = conn.execute(
                "SELECT COUNT(*) as c FROM user_follows WHERE following_id = ?", (uid,)
            ).fetchone()["c"]
            followers_map[uid] = cnt

    # Check which paid predictions the viewer has purchased
    purchased_ids = set()
    if viewer_id:
        paid_pred_ids = [r["id"] for r in rows if r["is_paid"]]
        if paid_pred_ids:
            ph = ",".join("?" * len(paid_pred_ids))
            bought = conn.execute(
                f"SELECT prediction_id FROM prediction_purchases WHERE buyer_id = ? AND prediction_id IN ({ph})",
                [viewer_id] + paid_pred_ids,
            ).fetchall()
            purchased_ids = {b["prediction_id"] for b in bought}

    conn.close()

    predictions = []
    for i, r in enumerate(rows):
        rxn = reactions_map.get(r["id"], {"likes": 0, "dislikes": 0})
        is_paid = bool(r["is_paid"])
        is_owner = viewer_id and r["user_id"] == viewer_id
        unlocked = not is_paid or is_owner or r["id"] in purchased_ids

        pred = {
            "id": r["id"],
            "rank": offset + i + 1,
            "user_id": r["user_id"],
            "username": r["username"],
            "display_name": r["display_name"],
            "avatar_color": r["avatar_color"],
            "predictor_accuracy": (accuracy_map.get(r["user_id"]) or {}).get("accuracy"),
            "predictor_wins": (accuracy_map.get(r["user_id"]) or {}).get("wins", 0),
            "predictor_losses": (accuracy_map.get(r["user_id"]) or {}).get("losses", 0),
            "fixture_id": r["fixture_id"],
            "team_a_name": r["team_a_name"],
            "team_b_name": r["team_b_name"],
            "competition": r["competition"],
            "competition_code": r["competition_code"] if "competition_code" in r.keys() else "",
            "is_paid": is_paid,
            "price_usd": r["price_usd"],
            "unlocked": unlocked,
            "match_finished": bool(r["match_finished"]),
            "result_correct": r["result_correct"],
            "avg_rating": round(r["avg_rating"], 1),
            "rating_count": r["rating_count"],
            "comment_count": r["comment_count"],
            "likes": rxn["likes"],
            "dislikes": rxn["dislikes"],
            "chat_count": chat_counts.get(r["id"], 0),
            "followers_count": followers_map.get(r["user_id"], 0),
            "is_live_bet": bool(r["is_live_bet"]) if "is_live_bet" in r.keys() else False,
            "created_at": r["created_at"],
            "slip_id": r["slip_id"] if "slip_id" in r.keys() else None,
            "odds": r["odds"] if "odds" in r.keys() else None,
            "combined_odds": r["combined_odds"] if "combined_odds" in r.keys() else None,
        }

        # Only include prediction details if free or unlocked
        if unlocked:
            pred.update({
                "predicted_result": r["predicted_result"],
                "predicted_result_prob": r["predicted_result_prob"],
                "predicted_over25": r["predicted_over25"],
                "predicted_btts": r["predicted_btts"],
                "best_value_bet": r["best_value_bet"],
                "best_value_prob": r["best_value_prob"],
                "analysis_summary": r["analysis_summary"],
            })

        predictions.append(pred)

    # Group predictions by slip_id (multiple picks in one betslip)
    grouped = []
    seen_slips = {}
    for pred in predictions:
        sid = pred.get("slip_id")
        if sid and sid in seen_slips:
            # Add as a pick to the existing slip card
            seen_slips[sid]["slip_picks"].append({
                "id": pred["id"],
                "team_a_name": pred.get("team_a_name", ""),
                "team_b_name": pred.get("team_b_name", ""),
                "fixture_id": pred.get("fixture_id", ""),
                "competition": pred.get("competition", ""),
                "competition_code": pred.get("competition_code", ""),
                "predicted_result": pred.get("predicted_result", ""),
                "predicted_result_prob": pred.get("predicted_result_prob", 0),
                "odds": pred.get("odds"),
                "match_finished": pred.get("match_finished", False),
                "result_correct": pred.get("result_correct"),
            })
        else:
            pred["slip_picks"] = [{
                "id": pred["id"],
                "team_a_name": pred.get("team_a_name", ""),
                "team_b_name": pred.get("team_b_name", ""),
                "fixture_id": pred.get("fixture_id", ""),
                "competition": pred.get("competition", ""),
                "competition_code": pred.get("competition_code", ""),
                "predicted_result": pred.get("predicted_result", ""),
                "predicted_result_prob": pred.get("predicted_result_prob", 0),
                "odds": pred.get("odds"),
                "match_finished": pred.get("match_finished", False),
                "result_correct": pred.get("result_correct"),
            }]
            grouped.append(pred)
            if sid:
                seen_slips[sid] = pred

    return {
        "predictions": grouped,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
        "sort_by": sort_by,
    }


def get_live_bet_predictions(viewer_id: int = None, limit: int = 50) -> Dict:
    """Get recent live bet predictions."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT cp.*,
            COALESCE(AVG(pr.rating), 0) as avg_rating,
            COUNT(DISTINCT pr.id) as rating_count
        FROM community_predictions cp
        LEFT JOIN prediction_ratings pr ON pr.prediction_id = cp.id
        WHERE cp.visibility = 'public' AND cp.is_live_bet = 1 AND cp.match_finished = 0
        GROUP BY cp.id
        ORDER BY cp.created_at DESC
        LIMIT ?
    """, (limit,)).fetchall()

    # Get reaction counts
    pred_ids = [r["id"] for r in rows]
    reactions_map = {}
    if pred_ids:
        ph = ",".join("?" * len(pred_ids))
        react_rows = conn.execute(f"""
            SELECT prediction_id,
                SUM(CASE WHEN reaction = 'like' THEN 1 ELSE 0 END) as likes,
                SUM(CASE WHEN reaction = 'dislike' THEN 1 ELSE 0 END) as dislikes
            FROM prediction_reactions WHERE prediction_id IN ({ph})
            GROUP BY prediction_id
        """, pred_ids).fetchall()
        for rr in react_rows:
            reactions_map[rr["prediction_id"]] = {"likes": rr["likes"] or 0, "dislikes": rr["dislikes"] or 0}

    conn.close()

    predictions = []
    for r in rows:
        rxn = reactions_map.get(r["id"], {"likes": 0, "dislikes": 0})
        predictions.append({
            "id": r["id"],
            "user_id": r["user_id"],
            "username": r["username"],
            "display_name": r["display_name"],
            "avatar_color": r["avatar_color"],
            "fixture_id": r["fixture_id"],
            "team_a_name": r["team_a_name"],
            "team_b_name": r["team_b_name"],
            "competition": r["competition"],
            "competition_code": r["competition_code"] if "competition_code" in r.keys() else "",
            "predicted_result": r["predicted_result"],
            "predicted_result_prob": r["predicted_result_prob"],
            "analysis_summary": r["analysis_summary"],
            "is_paid": bool(r["is_paid"]),
            "price_usd": r["price_usd"],
            "match_finished": bool(r["match_finished"]),
            "result_correct": r["result_correct"],
            "avg_rating": round(r["avg_rating"], 1),
            "rating_count": r["rating_count"],
            "likes": rxn["likes"],
            "dislikes": rxn["dislikes"],
            "is_live_bet": True,
            "created_at": r["created_at"],
            "slip_id": r["slip_id"] if "slip_id" in r.keys() else None,
            "odds": r["odds"] if "odds" in r.keys() else None,
            "combined_odds": r["combined_odds"] if "combined_odds" in r.keys() else None,
        })

    # Group predictions by slip_id
    grouped = []
    seen_slips = {}
    for pred in predictions:
        sid = pred.get("slip_id")
        if sid and sid in seen_slips:
            seen_slips[sid]["slip_picks"].append({
                "id": pred["id"],
                "team_a_name": pred.get("team_a_name", ""),
                "team_b_name": pred.get("team_b_name", ""),
                "fixture_id": pred.get("fixture_id", ""),
                "competition": pred.get("competition", ""),
                "competition_code": pred.get("competition_code", ""),
                "predicted_result": pred.get("predicted_result", ""),
                "predicted_result_prob": pred.get("predicted_result_prob", 0),
                "odds": pred.get("odds"),
                "match_finished": pred.get("match_finished", False),
                "result_correct": pred.get("result_correct"),
            })
        else:
            pred["slip_picks"] = [{
                "id": pred["id"],
                "team_a_name": pred.get("team_a_name", ""),
                "team_b_name": pred.get("team_b_name", ""),
                "fixture_id": pred.get("fixture_id", ""),
                "competition": pred.get("competition", ""),
                "competition_code": pred.get("competition_code", ""),
                "predicted_result": pred.get("predicted_result", ""),
                "predicted_result_prob": pred.get("predicted_result_prob", 0),
                "odds": pred.get("odds"),
                "match_finished": pred.get("match_finished", False),
                "result_correct": pred.get("result_correct"),
            }]
            grouped.append(pred)
            if sid:
                seen_slips[sid] = pred

    return {"predictions": grouped, "total": len(grouped)}


def get_user_predictions(user_id: int) -> List[Dict]:
    """Get all predictions by a specific user (including private if own)."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT cp.*,
            COALESCE(AVG(pr.rating), 0) as avg_rating,
            COUNT(DISTINCT pr.id) as rating_count,
            COUNT(DISTINCT pc.id) as comment_count
        FROM community_predictions cp
        LEFT JOIN prediction_ratings pr ON pr.prediction_id = cp.id
        LEFT JOIN prediction_comments pc ON pc.prediction_id = cp.id
        WHERE cp.user_id = ?
        GROUP BY cp.id
        ORDER BY cp.created_at DESC
    """, (user_id,)).fetchall()
    conn.close()

    return [{
        "id": r["id"],
        "username": r["username"],
        "display_name": r["display_name"],
        "fixture_id": r["fixture_id"],
        "team_a_name": r["team_a_name"],
        "team_b_name": r["team_b_name"],
        "competition": r["competition"],
        "predicted_result": r["predicted_result"],
        "predicted_result_prob": r["predicted_result_prob"],
        "predicted_over25": r["predicted_over25"],
        "predicted_btts": r["predicted_btts"],
        "best_value_bet": r["best_value_bet"],
        "analysis_summary": r["analysis_summary"],
        "visibility": r["visibility"],
        "is_paid": bool(r["is_paid"]),
        "match_finished": bool(r["match_finished"]),
        "result_correct": r["result_correct"],
        "avg_rating": round(r["avg_rating"], 1),
        "rating_count": r["rating_count"],
        "comment_count": r["comment_count"],
        "created_at": r["created_at"],
    } for r in rows]


def rate_prediction(prediction_id: int, user_id: int, rating: int, rater_display_name: str = "") -> Dict:
    """Rate a community prediction (1-5 stars)."""
    if rating < 1 or rating > 5:
        return {"success": False, "error": "Rating must be 1-5"}

    conn = _get_db()

    # Check prediction exists and is public
    pred = conn.execute(
        "SELECT user_id, visibility, team_a_name, team_b_name FROM community_predictions WHERE id = ?",
        (prediction_id,)
    ).fetchone()
    if not pred:
        conn.close()
        return {"success": False, "error": "Prediction not found"}
    if pred["user_id"] == user_id:
        conn.close()
        return {"success": False, "error": "Cannot rate your own prediction"}

    now = datetime.now().isoformat()
    conn.execute("""
        INSERT INTO prediction_ratings (prediction_id, user_id, rating, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(prediction_id, user_id)
        DO UPDATE SET rating = ?, created_at = ?
    """, (prediction_id, user_id, rating, now, rating, now))
    conn.commit()

    # Get new average
    avg = conn.execute(
        "SELECT AVG(rating) as avg, COUNT(*) as cnt FROM prediction_ratings WHERE prediction_id = ?",
        (prediction_id,)
    ).fetchone()
    conn.close()

    # Notify prediction owner about the rating
    stars = "\u2605" * rating + "\u2606" * (5 - rating)
    match_name = f"{pred['team_a_name']} vs {pred['team_b_name']}"
    rater = rater_display_name or "Someone"
    create_notification(
        user_id=pred["user_id"],
        notif_type="rating",
        title="New Rating on Your Prediction",
        message=f"{rater} rated your prediction {stars} ({rating}/5)",
        metadata={"prediction_id": prediction_id, "rater_name": rater, "rating": rating, "match": match_name},
    )
    _send_notif_email(
        user_id=pred["user_id"],
        notif_type="rating",
        title="New Rating on Your Prediction",
        message=f"<strong>{rater}</strong> rated your prediction for <strong>{match_name}</strong> with {stars} ({rating}/5).",
    )

    return {
        "success": True,
        "avg_rating": round(avg["avg"], 1),
        "rating_count": avg["cnt"],
    }


def add_comment(
    prediction_id: int,
    user_id: int,
    username: str,
    display_name: str,
    avatar_color: str,
    content: str,
) -> Dict:
    """Add a comment to a community prediction."""
    content = content.strip()
    if not content or len(content) > 500:
        return {"success": False, "error": "Comment must be 1-500 characters"}

    conn = _get_db()

    # Check prediction exists and get owner info
    pred = conn.execute(
        "SELECT id, user_id, team_a_name, team_b_name FROM community_predictions WHERE id = ?",
        (prediction_id,)
    ).fetchone()
    if not pred:
        conn.close()
        return {"success": False, "error": "Prediction not found"}

    now = datetime.now().isoformat()
    conn.execute("""
        INSERT INTO prediction_comments (prediction_id, user_id, username, display_name, avatar_color, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (prediction_id, user_id, username, display_name, avatar_color, content, now))
    conn.commit()
    comment_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()

    # Notify prediction owner (if commenter is not the owner)
    if pred["user_id"] != user_id:
        match_name = f"{pred['team_a_name']} vs {pred['team_b_name']}"
        preview = content[:80] + "..." if len(content) > 80 else content
        create_notification(
            user_id=pred["user_id"],
            notif_type="comment",
            title="New Comment on Your Prediction",
            message=f'{display_name} commented: "{preview}"',
            metadata={
                "prediction_id": prediction_id,
                "commenter_name": display_name,
                "commenter_avatar": avatar_color,
                "match": match_name,
                "content": content,
            },
        )
        _send_notif_email(
            user_id=pred["user_id"],
            notif_type="comment",
            title="New Comment on Your Prediction",
            message=f'<strong>{display_name}</strong> commented on your prediction for <strong>{match_name}</strong>:<br/><em>"{preview}"</em>',
        )

    return {
        "success": True,
        "comment": {
            "id": comment_id,
            "user_id": user_id,
            "username": username,
            "display_name": display_name,
            "avatar_color": avatar_color,
            "content": content,
            "created_at": now,
        },
    }


def get_comments(prediction_id: int) -> List[Dict]:
    """Get all comments for a prediction."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT * FROM prediction_comments
        WHERE prediction_id = ?
        ORDER BY created_at ASC
    """, (prediction_id,)).fetchall()
    conn.close()

    return [{
        "id": r["id"],
        "user_id": r["user_id"],
        "username": r["username"],
        "display_name": r["display_name"],
        "avatar_color": r["avatar_color"],
        "content": r["content"],
        "created_at": r["created_at"],
    } for r in rows]


def get_user_rating(prediction_id: int, user_id: int) -> Optional[int]:
    """Get a user's rating for a specific prediction."""
    conn = _get_db()
    row = conn.execute(
        "SELECT rating FROM prediction_ratings WHERE prediction_id = ? AND user_id = ?",
        (prediction_id, user_id)
    ).fetchone()
    conn.close()
    return row["rating"] if row else None


# ==================== PREDICTION REACTIONS (LIKE/DISLIKE) ====================

def react_prediction(prediction_id: int, user_id: int, reaction: str) -> Dict:
    """Like or dislike a prediction. Toggle off if same reaction exists."""
    if reaction not in ("like", "dislike"):
        return {"success": False, "error": "Invalid reaction"}

    conn = _get_db()
    now = datetime.now().isoformat()

    existing = conn.execute(
        "SELECT reaction FROM prediction_reactions WHERE prediction_id = ? AND user_id = ?",
        (prediction_id, user_id)
    ).fetchone()

    if existing:
        if existing["reaction"] == reaction:
            # Toggle off
            conn.execute(
                "DELETE FROM prediction_reactions WHERE prediction_id = ? AND user_id = ?",
                (prediction_id, user_id)
            )
        else:
            # Switch reaction
            conn.execute(
                "UPDATE prediction_reactions SET reaction = ?, created_at = ? WHERE prediction_id = ? AND user_id = ?",
                (reaction, now, prediction_id, user_id)
            )
    else:
        conn.execute(
            "INSERT INTO prediction_reactions (prediction_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?)",
            (prediction_id, user_id, reaction, now)
        )

    conn.commit()

    # Get updated counts
    counts = conn.execute("""
        SELECT
            SUM(CASE WHEN reaction = 'like' THEN 1 ELSE 0 END) as likes,
            SUM(CASE WHEN reaction = 'dislike' THEN 1 ELSE 0 END) as dislikes
        FROM prediction_reactions WHERE prediction_id = ?
    """, (prediction_id,)).fetchone()

    user_reaction = conn.execute(
        "SELECT reaction FROM prediction_reactions WHERE prediction_id = ? AND user_id = ?",
        (prediction_id, user_id)
    ).fetchone()

    conn.close()

    return {
        "success": True,
        "likes": counts["likes"] or 0,
        "dislikes": counts["dislikes"] or 0,
        "user_reaction": user_reaction["reaction"] if user_reaction else None,
    }


def get_prediction_reactions(prediction_id: int, user_id: int = None) -> Dict:
    """Get like/dislike counts for a prediction and optionally the user's reaction."""
    conn = _get_db()
    counts = conn.execute("""
        SELECT
            SUM(CASE WHEN reaction = 'like' THEN 1 ELSE 0 END) as likes,
            SUM(CASE WHEN reaction = 'dislike' THEN 1 ELSE 0 END) as dislikes
        FROM prediction_reactions WHERE prediction_id = ?
    """, (prediction_id,)).fetchone()

    user_reaction = None
    if user_id:
        row = conn.execute(
            "SELECT reaction FROM prediction_reactions WHERE prediction_id = ? AND user_id = ?",
            (prediction_id, user_id)
        ).fetchone()
        if row:
            user_reaction = row["reaction"]

    conn.close()
    return {
        "likes": counts["likes"] or 0,
        "dislikes": counts["dislikes"] or 0,
        "user_reaction": user_reaction,
    }


# ==================== PREDICTION LIVE CHAT ====================

def send_chat_message(prediction_id: int, user_id: int, username: str,
                      display_name: str, avatar_color: str, message: str) -> Dict:
    """Send a chat message on a prediction."""
    message = message.strip()
    if not message:
        return {"success": False, "error": "Message cannot be empty"}
    if len(message) > 500:
        return {"success": False, "error": "Message too long (max 500 chars)"}

    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute("""
        INSERT INTO prediction_chats (prediction_id, user_id, username, display_name, avatar_color, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (prediction_id, user_id, username, display_name, avatar_color, message, now))
    conn.commit()
    chat_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()

    return {
        "success": True,
        "chat": {
            "id": chat_id,
            "prediction_id": prediction_id,
            "user_id": user_id,
            "username": username,
            "display_name": display_name,
            "avatar_color": avatar_color,
            "message": message,
            "created_at": now,
        }
    }


def get_chat_messages(prediction_id: int, since_id: int = 0, limit: int = 50) -> List[Dict]:
    """Get chat messages for a prediction. Use since_id for polling new messages."""
    conn = _get_db()
    if since_id > 0:
        rows = conn.execute("""
            SELECT * FROM prediction_chats
            WHERE prediction_id = ? AND id > ?
            ORDER BY created_at ASC
            LIMIT ?
        """, (prediction_id, since_id, limit)).fetchall()
    else:
        rows = conn.execute("""
            SELECT * FROM prediction_chats
            WHERE prediction_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (prediction_id, limit)).fetchall()
        rows = list(reversed(rows))

    conn.close()

    return [{
        "id": r["id"],
        "prediction_id": r["prediction_id"],
        "user_id": r["user_id"],
        "username": r["username"],
        "display_name": r["display_name"],
        "avatar_color": r["avatar_color"],
        "message": r["message"],
        "created_at": r["created_at"],
    } for r in rows]


# ==================== LIVE MATCH CHAT ====================

def send_match_chat_message(match_key: str, user_id: int, username: str,
                             display_name: str, avatar_color: str, message: str) -> Dict:
    """Send a chat message on a live match."""
    message = message.strip()
    if not message:
        return {"success": False, "error": "Message cannot be empty"}
    if len(message) > 500:
        return {"success": False, "error": "Message too long (max 500 chars)"}

    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute("""
        INSERT INTO match_chats (match_key, user_id, username, display_name, avatar_color, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (match_key, user_id, username, display_name, avatar_color, message, now))
    conn.commit()
    chat_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()

    return {
        "success": True,
        "chat": {
            "id": chat_id,
            "match_key": match_key,
            "user_id": user_id,
            "username": username,
            "display_name": display_name,
            "avatar_color": avatar_color,
            "message": message,
            "created_at": now,
        }
    }


def get_match_chat_messages(match_key: str, since_id: int = 0, limit: int = 50) -> List[Dict]:
    """Get chat messages for a live match. Use since_id for polling new messages."""
    conn = _get_db()
    if since_id > 0:
        rows = conn.execute("""
            SELECT * FROM match_chats
            WHERE match_key = ? AND id > ?
            ORDER BY created_at ASC
            LIMIT ?
        """, (match_key, since_id, limit)).fetchall()
    else:
        rows = conn.execute("""
            SELECT * FROM match_chats
            WHERE match_key = ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (match_key, limit)).fetchall()
        rows = list(reversed(rows))

    conn.close()

    return [{
        "id": r["id"],
        "match_key": r["match_key"],
        "user_id": r["user_id"],
        "username": r["username"],
        "display_name": r["display_name"],
        "avatar_color": r["avatar_color"],
        "message": r["message"],
        "created_at": r["created_at"],
    } for r in rows]


def get_match_chat_count(match_key: str) -> int:
    """Get the number of chat messages for a match."""
    conn = _get_db()
    count = conn.execute(
        "SELECT COUNT(*) as c FROM match_chats WHERE match_key = ?", (match_key,)
    ).fetchone()["c"]
    conn.close()
    return count


def get_top_predictors(limit: int = 10) -> List[Dict]:
    """Get top users by prediction accuracy."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT user_id, username, display_name, avatar_color,
            COUNT(*) as total_predictions,
            SUM(CASE WHEN result_correct = 1 THEN 1 ELSE 0 END) as correct,
            ROUND(AVG(CASE WHEN match_finished = 1 THEN result_correct ELSE NULL END) * 100, 1) as accuracy,
            ROUND(AVG(
                (SELECT AVG(rating) FROM prediction_ratings pr WHERE pr.prediction_id = cp.id)
            ), 1) as avg_user_rating
        FROM community_predictions cp
        WHERE visibility = 'public' AND match_finished = 1
        GROUP BY user_id
        HAVING total_predictions >= 3
        ORDER BY accuracy DESC, total_predictions DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()

    return [{
        "user_id": r["user_id"],
        "username": r["username"],
        "display_name": r["display_name"],
        "avatar_color": r["avatar_color"],
        "total_predictions": r["total_predictions"],
        "correct": r["correct"],
        "accuracy": r["accuracy"] or 0,
        "avg_rating": r["avg_user_rating"] or 0,
    } for r in rows]


def get_unfinished_prediction_info() -> dict:
    """Get dates and team-pair keys from unfinished community predictions.
    Returns {"dates": ["20260215", ...], "team_keys": {"47-34", "39-42", ...}}"""
    conn = _get_db()
    rows = conn.execute("""
        SELECT DISTINCT fixture_id FROM community_predictions WHERE match_finished = 0
    """).fetchall()
    conn.close()

    dates = set()
    team_keys = set()
    for r in rows:
        fid = r["fixture_id"] or ""
        parts = fid.split("-")
        if len(parts) >= 3:
            date_part = parts[-1]
            team_key = f"{parts[0]}-{parts[1]}"
            if len(date_part) == 8 and date_part.isdigit():
                dates.add(date_part)
            team_keys.add(team_key)
    return {"dates": list(dates), "team_keys": team_keys}


def get_unfinished_prediction_dates() -> List[str]:
    """Get unique dates (YYYYMMDD) from unfinished community predictions."""
    return get_unfinished_prediction_info()["dates"]


def check_and_update_finished_predictions(finished_fixtures: list) -> dict:
    """Check finished fixtures against community predictions and update results.

    For each finished fixture, finds matching predictions (by fixture_id),
    determines if the prediction was correct, updates the DB, and notifies
    followers of successful predictions.
    """
    conn = _get_db()
    now = datetime.now()

    updated = 0
    correct_count = 0
    incorrect_count = 0
    notified_followers = 0
    notifications_to_send = []

    for fixture in finished_fixtures:
        home_team = fixture.get("home_team", {})
        away_team = fixture.get("away_team", {})
        goals = fixture.get("goals", {})

        home_id = home_team.get("id")
        away_id = away_team.get("id")
        home_goals = goals.get("home") or 0
        away_goals = goals.get("away") or 0

        if not home_id or not away_id:
            continue

        # Match on team pair (home_id-away_id) regardless of date suffix
        team_pair = f"{home_id}-{away_id}"

        rows = conn.execute("""
            SELECT id, user_id, display_name, predicted_result, team_a_name, team_b_name, fixture_id
            FROM community_predictions
            WHERE fixture_id LIKE ? AND match_finished = 0
        """, (f"{team_pair}-%",)).fetchall()

        if not rows:
            continue

        # Determine actual result
        if home_goals > away_goals:
            actual_result = "Home Win"
        elif away_goals > home_goals:
            actual_result = "Away Win"
        else:
            actual_result = "Draw"

        home_name = home_team.get("name", "")
        away_name = away_team.get("name", "")
        total_goals = home_goals + away_goals
        both_scored = home_goals > 0 and away_goals > 0
        score_text = f"{home_goals}-{away_goals}"

        for row in rows:
            predicted = row["predicted_result"] or ""

            # Skip live bets — their format doesn't match standard results
            if predicted.startswith("[LIVE]"):
                result_correct = None  # Can't determine
                conn.execute("""
                    UPDATE community_predictions
                    SET match_finished = 1, actual_result = ?, updated_at = ?
                    WHERE id = ?
                """, (actual_result, now.isoformat(), row["id"]))
                updated += 1
                continue

            # Parse predicted_result format: "Category: Outcome"
            result_correct = 0
            if ": " in predicted:
                category, outcome = predicted.split(": ", 1)
                category = category.strip().upper()

                if category == "1X2":
                    if outcome == "Draw":
                        result_correct = 1 if actual_result == "Draw" else 0
                    elif outcome.endswith(" Win"):
                        # e.g. "Newcastle Win" — check if it's home or away team
                        team_name = outcome.replace(" Win", "").strip()
                        team_a = (row["team_a_name"] or "").strip()
                        team_b = (row["team_b_name"] or "").strip()
                        if team_name.lower() == team_a.lower() or team_name.lower() in home_name.lower():
                            result_correct = 1 if actual_result == "Home Win" else 0
                        elif team_name.lower() == team_b.lower() or team_name.lower() in away_name.lower():
                            result_correct = 1 if actual_result == "Away Win" else 0
                    else:
                        result_correct = 1 if predicted == actual_result else 0

                elif category == "BTTS":
                    if outcome.lower() == "yes":
                        result_correct = 1 if both_scored else 0
                    elif outcome.lower() == "no":
                        result_correct = 1 if not both_scored else 0

                elif category in ("OVER/UNDER", "OVER_UNDER"):
                    if "over" in outcome.lower():
                        try:
                            threshold = float(outcome.lower().replace("over", "").strip())
                            result_correct = 1 if total_goals > threshold else 0
                        except ValueError:
                            pass
                    elif "under" in outcome.lower():
                        try:
                            threshold = float(outcome.lower().replace("under", "").strip())
                            result_correct = 1 if total_goals < threshold else 0
                        except ValueError:
                            pass
                else:
                    # Unknown category — fallback
                    result_correct = 1 if predicted == actual_result else 0
            else:
                # No category prefix — direct comparison
                result_correct = 1 if predicted == actual_result else 0

            conn.execute("""
                UPDATE community_predictions
                SET match_finished = 1, result_correct = ?, actual_result = ?, updated_at = ?
                WHERE id = ?
            """, (result_correct, actual_result, now.isoformat(), row["id"]))
            updated += 1

            match_name = f"{row['team_a_name']} vs {row['team_b_name']}"

            if result_correct:
                correct_count += 1
                # Queue notifications to send after DB is closed
                notifications_to_send.append({
                    "user_id": row["user_id"],
                    "display_name": row["display_name"],
                    "prediction_id": row["id"],
                    "match_name": match_name,
                    "actual_result": actual_result,
                    "score_text": score_text,
                })
            else:
                incorrect_count += 1

    conn.commit()
    conn.close()

    # Send notifications after DB connection is closed to avoid lock conflicts
    for notif in notifications_to_send:
        try:
            create_notification(
                user_id=notif["user_id"],
                notif_type="prediction_result",
                title="Your Prediction Was Correct! \u2705",
                message=f"Congratulations for predicting {notif['match_name']} successfully! Result: {notif['actual_result']} ({notif['score_text']}).",
                metadata={
                    "prediction_id": notif["prediction_id"],
                    "match": notif["match_name"],
                    "actual_result": notif["actual_result"],
                    "score": notif["score_text"],
                    "result_correct": True,
                },
            )

            follower_ids = get_follower_ids(notif["user_id"])
            for fid in follower_ids:
                create_notification(
                    user_id=fid,
                    notif_type="prediction_result",
                    title="Prediction Successful! \u2705",
                    message=f"Congratulations! {notif['display_name']} correctly predicted {notif['match_name']}. Result: {notif['actual_result']} ({notif['score_text']}).",
                    metadata={
                        "prediction_id": notif["prediction_id"],
                        "match": notif["match_name"],
                        "poster_id": notif["user_id"],
                        "poster_name": notif["display_name"],
                        "actual_result": notif["actual_result"],
                        "result_correct": True,
                    },
                )
                notified_followers += 1
        except Exception as e:
            print(f"[Predictions] Notification error: {e}")

    return {
        "updated": updated,
        "correct": correct_count,
        "incorrect": incorrect_count,
        "notified_followers": notified_followers,
    }


def get_user_prediction_stats(user_id: int) -> dict:
    """Get win/loss/pending stats and recent history for a user."""
    conn = _get_db()
    row = conn.execute("""
        SELECT
            COUNT(*) as total_predictions,
            SUM(CASE WHEN match_finished = 1 AND result_correct = 1 THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN match_finished = 1 AND result_correct = 0 THEN 1 ELSE 0 END) as losses,
            SUM(CASE WHEN match_finished = 0 THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN match_finished = 1 THEN 1 ELSE 0 END) as finished
        FROM community_predictions
        WHERE user_id = ? AND visibility = 'public'
    """, (user_id,)).fetchone()

    history = conn.execute("""
        SELECT team_a_name, team_b_name, predicted_result, actual_result,
               result_correct, created_at, updated_at
        FROM community_predictions
        WHERE user_id = ? AND visibility = 'public' AND match_finished = 1
        ORDER BY updated_at DESC
        LIMIT 20
    """, (user_id,)).fetchall()
    conn.close()

    total = row["total_predictions"] or 0
    wins = row["wins"] or 0
    losses = row["losses"] or 0
    pending = row["pending"] or 0
    finished = row["finished"] or 0
    win_pct = round((wins / finished) * 100, 1) if finished > 0 else 0

    return {
        "user_id": user_id,
        "total_predictions": total,
        "wins": wins,
        "losses": losses,
        "pending": pending,
        "finished": finished,
        "win_percentage": win_pct,
        "recent_history": [
            {
                "match": f"{h['team_a_name']} vs {h['team_b_name']}",
                "predicted": h["predicted_result"],
                "actual": h["actual_result"],
                "correct": bool(h["result_correct"]),
                "date": h["created_at"],
            }
            for h in history
        ],
    }


def search_users(query: str, limit: int = 10) -> List[Dict]:
    """Search community users by username or display_name."""
    query = query.strip()
    if not query:
        return []

    import user_auth
    conn = sqlite3.connect(user_auth.DB_PATH)
    conn.row_factory = sqlite3.Row

    like_pattern = f"%{query}%"
    rows = conn.execute("""
        SELECT id, username, display_name, avatar_color
        FROM users
        WHERE username LIKE ? OR display_name LIKE ?
        LIMIT ?
    """, (like_pattern, like_pattern, limit * 2)).fetchall()
    conn.close()

    # Get prediction stats from community db
    comm_conn = _get_db()
    results = []
    for r in rows:
        uid = r["id"]
        stats = comm_conn.execute("""
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN match_finished = 1 AND result_correct = 1 THEN 1 ELSE 0 END) as correct,
                   SUM(CASE WHEN match_finished = 1 THEN 1 ELSE 0 END) as finished
            FROM community_predictions
            WHERE user_id = ? AND visibility = 'public'
        """, (uid,)).fetchone()

        total = stats["total"] or 0
        finished = stats["finished"] or 0
        correct = stats["correct"] or 0
        accuracy = round((correct / finished) * 100, 1) if finished > 0 else 0

        results.append({
            "user_id": uid,
            "username": r["username"],
            "display_name": r["display_name"],
            "avatar_color": r["avatar_color"] or "#6c5ce7",
            "total_predictions": total,
            "accuracy": accuracy,
        })
        if len(results) >= limit:
            break

    comm_conn.close()
    return results


def get_community_stats() -> Dict:
    """Get community-wide statistics for admin dashboard."""
    conn = _get_db()

    total_predictions = conn.execute(
        "SELECT COUNT(*) as c FROM community_predictions"
    ).fetchone()["c"]
    public_predictions = conn.execute(
        "SELECT COUNT(*) as c FROM community_predictions WHERE visibility = 'public'"
    ).fetchone()["c"]
    total_ratings = conn.execute(
        "SELECT COUNT(*) as c FROM prediction_ratings"
    ).fetchone()["c"]
    total_comments = conn.execute(
        "SELECT COUNT(*) as c FROM prediction_comments"
    ).fetchone()["c"]
    unique_sharers = conn.execute(
        "SELECT COUNT(DISTINCT user_id) as c FROM community_predictions"
    ).fetchone()["c"]

    # Predictions today
    today = datetime.now().strftime("%Y-%m-%d")
    predictions_today = conn.execute(
        "SELECT COUNT(*) as c FROM community_predictions WHERE created_at LIKE ?",
        (f"{today}%",)
    ).fetchone()["c"]

    conn.close()

    return {
        "total_predictions": total_predictions,
        "public_predictions": public_predictions,
        "private_predictions": total_predictions - public_predictions,
        "total_ratings": total_ratings,
        "total_comments": total_comments,
        "unique_sharers": unique_sharers,
        "predictions_today": predictions_today,
    }


def delete_prediction(prediction_id: int) -> Dict:
    """Admin: delete a community prediction and its ratings/comments."""
    conn = _get_db()
    pred = conn.execute(
        "SELECT id FROM community_predictions WHERE id = ?", (prediction_id,)
    ).fetchone()
    if not pred:
        conn.close()
        return {"success": False, "error": "Prediction not found"}

    conn.execute("DELETE FROM prediction_comments WHERE prediction_id = ?", (prediction_id,))
    conn.execute("DELETE FROM prediction_ratings WHERE prediction_id = ?", (prediction_id,))
    conn.execute("DELETE FROM community_predictions WHERE id = ?", (prediction_id,))
    conn.commit()
    conn.close()
    return {"success": True}


def delete_comment(comment_id: int) -> Dict:
    """Admin: delete a specific comment."""
    conn = _get_db()
    row = conn.execute("SELECT id FROM prediction_comments WHERE id = ?", (comment_id,)).fetchone()
    if not row:
        conn.close()
        return {"success": False, "error": "Comment not found"}
    conn.execute("DELETE FROM prediction_comments WHERE id = ?", (comment_id,))
    conn.commit()
    conn.close()
    return {"success": True}


# ==================== PAID PREDICTIONS ====================

def get_prediction(prediction_id: int) -> Optional[Dict]:
    """Get basic prediction info by ID (for payment flow)."""
    conn = _get_db()
    pred = conn.execute(
        "SELECT id, user_id, is_paid, price_usd, team_a_name, team_b_name FROM community_predictions WHERE id = ?",
        (prediction_id,)
    ).fetchone()
    conn.close()
    if not pred:
        return None
    return dict(pred)


def purchase_prediction(prediction_id: int, buyer_id: int, payment_method: str = "", payment_ref: str = "") -> Dict:
    """Purchase access to a paid prediction."""
    conn = _get_db()

    # Check prediction exists and is paid
    pred = conn.execute(
        "SELECT id, user_id, is_paid, price_usd FROM community_predictions WHERE id = ?",
        (prediction_id,)
    ).fetchone()
    if not pred:
        conn.close()
        return {"success": False, "error": "Prediction not found"}
    if not pred["is_paid"]:
        conn.close()
        return {"success": False, "error": "This prediction is free"}
    if pred["user_id"] == buyer_id:
        conn.close()
        return {"success": False, "error": "Cannot purchase your own prediction"}

    # Check if already purchased
    existing = conn.execute(
        "SELECT id FROM prediction_purchases WHERE prediction_id = ? AND buyer_id = ?",
        (prediction_id, buyer_id)
    ).fetchone()
    if existing:
        conn.close()
        return {"success": False, "error": "Already purchased"}

    now = datetime.now().isoformat()
    price = pred["price_usd"]
    seller_id = pred["user_id"]

    # Record the purchase
    conn.execute("""
        INSERT INTO prediction_purchases (prediction_id, buyer_id, seller_id, price_amount, price_currency, payment_method, payment_ref, created_at)
        VALUES (?, ?, ?, ?, 'USD', ?, ?, ?)
    """, (prediction_id, buyer_id, seller_id, price, payment_method, payment_ref, now))

    # Credit seller wallet (dynamic creator share, rest is platform fee)
    share_rate = pricing_config.get("creator_sale_share", 0.70)
    creator_share = round(price * share_rate, 2)
    conn.execute("""
        INSERT INTO creator_wallets (user_id, balance_usd, total_earned_usd, total_sales, updated_at)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            balance_usd = balance_usd + ?,
            total_earned_usd = total_earned_usd + ?,
            total_sales = total_sales + 1,
            updated_at = ?
    """, (seller_id, creator_share, creator_share, now, creator_share, creator_share, now))

    # Check if this is the seller's first sale
    first_sale_count = conn.execute(
        "SELECT COUNT(*) as cnt FROM prediction_purchases WHERE seller_id = ?",
        (seller_id,)
    ).fetchone()["cnt"]

    # Get prediction details for notification
    pred_info = conn.execute(
        "SELECT team_a_name, team_b_name FROM community_predictions WHERE id = ?",
        (prediction_id,)
    ).fetchone()
    match_name = f"{pred_info['team_a_name']} vs {pred_info['team_b_name']}" if pred_info else "a prediction"

    conn.commit()
    conn.close()

    # Send sale notification + email to seller
    import os
    payment_email = os.environ.get("ZOHO_PAYMENT_EMAIL", "")

    is_first = (first_sale_count == 1)
    if is_first:
        notif_title = "Congratulations on Your First Sale! \U0001f389\U0001f680\U0001f31f"
        notif_msg = (
            f"You just made your very first sale on Spark AI! "
            f"Someone purchased your prediction for {match_name} "
            f"and you earned ${creator_share:.2f}. "
            f"This is just the beginning — keep sharing great predictions!"
        )
        email_msg = (
            f"\U0001f389\U0001f680\U0001f31f <strong>Congratulations on your very first sale!</strong><br><br>"
            f"Someone just purchased your prediction for <strong>{match_name}</strong> "
            f"and you earned <strong>${creator_share:.2f}</strong>!<br><br>"
            f"This is a huge milestone — you're now officially earning on Spark AI. "
            f"Keep sharing amazing predictions and watch your earnings grow! \U0001f4b0"
        )
    else:
        notif_title = "New Sale! \U0001f4b0"
        notif_msg = (
            f"Someone purchased your prediction for {match_name}. "
            f"You earned ${creator_share:.2f}. Total sales: {first_sale_count}."
        )
        email_msg = (
            f"\U0001f4b0 <strong>Congratulations on your sale!</strong><br><br>"
            f"Someone just purchased your prediction for <strong>{match_name}</strong> "
            f"and you earned <strong>${creator_share:.2f}</strong>.<br><br>"
            f"Total sales: <strong>{first_sale_count}</strong>. Keep it up! \U0001f525"
        )

    create_notification(
        user_id=seller_id,
        notif_type="prediction_sale",
        title=notif_title,
        message=notif_msg,
        metadata={"prediction_id": prediction_id, "amount": creator_share, "match": match_name, "first_sale": is_first},
    )
    _send_notif_email(
        user_id=seller_id,
        notif_type="prediction_sale",
        title=notif_title,
        message=email_msg,
        from_email=payment_email,
    )

    return {"success": True, "price_paid": price, "creator_share": creator_share}


def has_purchased(prediction_id: int, user_id: int) -> bool:
    """Check if a user has purchased a specific prediction."""
    conn = _get_db()
    row = conn.execute(
        "SELECT id FROM prediction_purchases WHERE prediction_id = ? AND buyer_id = ?",
        (prediction_id, user_id)
    ).fetchone()
    conn.close()
    return row is not None


def get_user_purchases(user_id: int) -> List[Dict]:
    """Get all predictions purchased by a user."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT pp.*, cp.team_a_name, cp.team_b_name, cp.predicted_result,
               cp.display_name as seller_name, cp.username as seller_username
        FROM prediction_purchases pp
        JOIN community_predictions cp ON cp.id = pp.prediction_id
        WHERE pp.buyer_id = ?
        ORDER BY pp.created_at DESC
    """, (user_id,)).fetchall()
    conn.close()

    return [{
        "id": r["id"],
        "prediction_id": r["prediction_id"],
        "team_a_name": r["team_a_name"],
        "team_b_name": r["team_b_name"],
        "predicted_result": r["predicted_result"],
        "seller_name": r["seller_name"],
        "price_amount": r["price_amount"],
        "created_at": r["created_at"],
    } for r in rows]


def get_creator_dashboard(user_id: int) -> Dict:
    """Get creator dashboard data: wallet, sales, and paid predictions."""
    conn = _get_db()

    # Wallet info
    wallet = conn.execute(
        "SELECT * FROM creator_wallets WHERE user_id = ?", (user_id,)
    ).fetchone()

    wallet_data = {
        "balance_usd": wallet["balance_usd"] if wallet else 0,
        "balance_kes": wallet["balance_kes"] if wallet else 0,
        "total_earned_usd": wallet["total_earned_usd"] if wallet else 0,
        "total_earned_kes": wallet["total_earned_kes"] if wallet else 0,
        "total_sales": wallet["total_sales"] if wallet else 0,
    }

    # All predictions with full analytics
    preds = conn.execute("""
        SELECT cp.*,
            (SELECT COUNT(*) FROM prediction_purchases pp WHERE pp.prediction_id = cp.id) as purchase_count,
            (SELECT COALESCE(SUM(pp.price_amount), 0) FROM prediction_purchases pp WHERE pp.prediction_id = cp.id) as total_revenue,
            (SELECT COUNT(*) FROM prediction_comments pc WHERE pc.prediction_id = cp.id) as comment_count,
            (SELECT COALESCE(AVG(pr.rating), 0) FROM prediction_ratings pr WHERE pr.prediction_id = cp.id) as avg_rating,
            (SELECT COUNT(*) FROM prediction_ratings pr WHERE pr.prediction_id = cp.id) as rating_count,
            (SELECT COALESCE(SUM(CASE WHEN reaction = 'like' THEN 1 ELSE 0 END), 0) FROM prediction_reactions prx WHERE prx.prediction_id = cp.id) as likes,
            (SELECT COALESCE(SUM(CASE WHEN reaction = 'dislike' THEN 1 ELSE 0 END), 0) FROM prediction_reactions prx WHERE prx.prediction_id = cp.id) as dislikes,
            (SELECT COUNT(*) FROM prediction_chats pch WHERE pch.prediction_id = cp.id) as chat_count
        FROM community_predictions cp
        WHERE cp.user_id = ?
        ORDER BY cp.created_at DESC
    """, (user_id,)).fetchall()

    all_predictions = [{
        "id": r["id"],
        "team_a_name": r["team_a_name"],
        "team_b_name": r["team_b_name"],
        "competition": r["competition"],
        "predicted_result": r["predicted_result"],
        "is_paid": bool(r["is_paid"]),
        "price_usd": r["price_usd"] or 0,
        "purchase_count": r["purchase_count"],
        "total_revenue": round(r["total_revenue"], 2),
        "view_count": r["view_count"] or 0,
        "click_count": r["click_count"] or 0,
        "comment_count": r["comment_count"] or 0,
        "avg_rating": round(r["avg_rating"] or 0, 1),
        "rating_count": r["rating_count"] or 0,
        "likes": r["likes"] or 0,
        "dislikes": r["dislikes"] or 0,
        "chat_count": r["chat_count"] or 0,
        "match_finished": bool(r["match_finished"]),
        "result_correct": r["result_correct"],
        "created_at": r["created_at"],
    } for r in preds]

    # Backward compat: paid_predictions subset
    paid_predictions = [p for p in all_predictions if p["is_paid"]]

    # Recent sales
    sales = conn.execute("""
        SELECT pp.*, cp.team_a_name, cp.team_b_name
        FROM prediction_purchases pp
        JOIN community_predictions cp ON cp.id = pp.prediction_id
        WHERE pp.seller_id = ?
        ORDER BY pp.created_at DESC LIMIT 20
    """, (user_id,)).fetchall()

    recent_sales = [{
        "prediction_id": s["prediction_id"],
        "team_a_name": s["team_a_name"],
        "team_b_name": s["team_b_name"],
        "price_amount": s["price_amount"],
        "created_at": s["created_at"],
    } for s in sales]

    conn.close()

    # Get referral stats from user_auth
    try:
        import user_auth
        ref_stats = user_auth.get_referral_stats(user_id)
    except Exception:
        ref_stats = {"total_referred": 0, "pro_referred": 0, "referrals": []}

    total_rating_count = sum(p["rating_count"] for p in all_predictions)
    analytics_summary = {
        "total_predictions": len(all_predictions),
        "total_views": sum(p["view_count"] for p in all_predictions),
        "total_clicks": sum(p["click_count"] for p in all_predictions),
        "total_likes": sum(p["likes"] for p in all_predictions),
        "total_dislikes": sum(p["dislikes"] for p in all_predictions),
        "total_comments": sum(p["comment_count"] for p in all_predictions),
        "total_ratings": total_rating_count,
        "avg_rating_overall": round(
            sum(p["avg_rating"] * p["rating_count"] for p in all_predictions) / max(1, total_rating_count), 1
        ),
    }

    return {
        "wallet": wallet_data,
        "all_predictions": all_predictions,
        "paid_predictions": paid_predictions,
        "recent_sales": recent_sales,
        "analytics_summary": analytics_summary,
        "referral_stats": {
            "total_referred": ref_stats.get("total_referred", 0),
            "pro_referred": ref_stats.get("pro_referred", 0),
            "referral_code": ref_stats.get("referral_code", ""),
        },
    }


def increment_view_count(prediction_ids: list) -> Dict:
    """Batch increment view_count (impressions) for predictions shown in feed."""
    if not prediction_ids:
        return {"success": True, "updated": 0}
    conn = _get_db()
    ph = ",".join("?" * len(prediction_ids))
    conn.execute(
        f"UPDATE community_predictions SET view_count = COALESCE(view_count, 0) + 1 WHERE id IN ({ph})",
        prediction_ids
    )
    conn.commit()
    conn.close()
    return {"success": True}


def increment_click_count(prediction_id: int) -> Dict:
    """Increment click_count when a user clicks/expands a prediction."""
    conn = _get_db()
    conn.execute(
        "UPDATE community_predictions SET click_count = COALESCE(click_count, 0) + 1 WHERE id = ?",
        (prediction_id,)
    )
    conn.commit()
    conn.close()
    return {"success": True}


def get_creator_analytics_admin() -> Dict:
    """Admin: get all creator analytics with abnormal activity detection."""
    conn = _get_db()

    creators = conn.execute("""
        SELECT
            cp.user_id,
            cp.username,
            cp.display_name,
            cp.avatar_color,
            COUNT(*) as prediction_count,
            SUM(COALESCE(cp.view_count, 0)) as total_views,
            SUM(COALESCE(cp.click_count, 0)) as total_clicks,
            (SELECT COUNT(*) FROM prediction_comments pc2
             WHERE pc2.prediction_id IN (SELECT id FROM community_predictions WHERE user_id = cp.user_id)) as total_comments,
            (SELECT COUNT(*) FROM prediction_reactions pr2
             WHERE pr2.prediction_id IN (SELECT id FROM community_predictions WHERE user_id = cp.user_id)
             AND pr2.reaction = 'like') as total_likes,
            (SELECT COUNT(*) FROM prediction_reactions pr3
             WHERE pr3.prediction_id IN (SELECT id FROM community_predictions WHERE user_id = cp.user_id)
             AND pr3.reaction = 'dislike') as total_dislikes,
            (SELECT COALESCE(AVG(prr.rating), 0) FROM prediction_ratings prr
             WHERE prr.prediction_id IN (SELECT id FROM community_predictions WHERE user_id = cp.user_id)) as avg_rating,
            (SELECT COUNT(*) FROM prediction_purchases pp
             WHERE pp.prediction_id IN (SELECT id FROM community_predictions WHERE user_id = cp.user_id)) as total_purchases,
            (SELECT COALESCE(SUM(pp2.price_amount), 0) FROM prediction_purchases pp2
             WHERE pp2.prediction_id IN (SELECT id FROM community_predictions WHERE user_id = cp.user_id)) as total_revenue
        FROM community_predictions cp
        GROUP BY cp.user_id
        ORDER BY total_views DESC
    """).fetchall()

    # Get wallet info
    wallet_map = {}
    wallets = conn.execute("SELECT * FROM creator_wallets").fetchall()
    for w in wallets:
        wallet_map[w["user_id"]] = {
            "balance_usd": w["balance_usd"],
            "total_earned_usd": w["total_earned_usd"],
            "total_sales": w["total_sales"],
        }

    conn.close()

    result = []
    for c in creators:
        views = c["total_views"] or 0
        clicks = c["total_clicks"] or 0
        engagement = (c["total_comments"] or 0) + (c["total_likes"] or 0) + (c["total_dislikes"] or 0)
        purchases = c["total_purchases"] or 0

        # Abnormal activity flags
        flags = []
        if clicks > 50 and engagement == 0:
            flags.append("high_clicks_no_engagement")
        if views > 20 and clicks > 0 and (clicks / views) > 0.8:
            flags.append("suspicious_click_ratio")
        if purchases > 10:
            flags.append("review_purchase_volume")
        if views > 200 and engagement == 0:
            flags.append("possible_bot_views")

        wallet = wallet_map.get(c["user_id"], {"balance_usd": 0, "total_earned_usd": 0, "total_sales": 0})

        result.append({
            "user_id": c["user_id"],
            "username": c["username"],
            "display_name": c["display_name"],
            "avatar_color": c["avatar_color"],
            "prediction_count": c["prediction_count"],
            "total_views": views,
            "total_clicks": clicks,
            "total_comments": c["total_comments"] or 0,
            "total_likes": c["total_likes"] or 0,
            "total_dislikes": c["total_dislikes"] or 0,
            "avg_rating": round(c["avg_rating"] or 0, 1),
            "total_purchases": purchases,
            "total_revenue": round(c["total_revenue"] or 0, 2),
            "wallet": wallet,
            "click_through_rate": round((clicks / max(1, views)) * 100, 1),
            "engagement_rate": round((engagement / max(1, views)) * 100, 1),
            "flags": flags,
            "has_flags": len(flags) > 0,
        })

    # Sort flagged creators first
    result.sort(key=lambda x: (-len(x["flags"]), -x["total_views"]))

    return {
        "creators": result,
        "summary": {
            "total_creators": len(result),
            "flagged_creators": sum(1 for c in result if c["has_flags"]),
            "total_views_all": sum(c["total_views"] for c in result),
            "total_clicks_all": sum(c["total_clicks"] for c in result),
            "total_revenue_all": round(sum(c["total_revenue"] for c in result), 2),
        },
    }


def get_paid_predictions_feed(page: int = 1, per_page: int = 20, viewer_id: int = None, sort_by: str = "best") -> Dict:
    """Get public paid predictions feed with purchase status for viewer."""
    conn = _get_db()
    offset = (page - 1) * per_page

    total = conn.execute(
        "SELECT COUNT(*) as c FROM community_predictions WHERE visibility = 'public' AND is_paid = 1 AND match_finished = 0"
    ).fetchone()["c"]

    # For paid feed, we need to join comments for ranking too
    order_clause = _get_order_clause(sort_by)

    rows = conn.execute(f"""
        SELECT cp.*,
            COALESCE(AVG(pr.rating), 0) as avg_rating,
            COUNT(DISTINCT pr.id) as rating_count,
            COUNT(DISTINCT pc.id) as comment_count,
            (SELECT COUNT(*) FROM prediction_purchases pp WHERE pp.prediction_id = cp.id) as purchase_count
        FROM community_predictions cp
        LEFT JOIN prediction_ratings pr ON pr.prediction_id = cp.id
        LEFT JOIN prediction_comments pc ON pc.prediction_id = cp.id
        WHERE cp.visibility = 'public' AND cp.is_paid = 1 AND cp.match_finished = 0
        GROUP BY cp.id
        {order_clause}
        LIMIT ? OFFSET ?
    """, (per_page, offset)).fetchall()

    # Check which predictions viewer has purchased
    purchased_ids = set()
    if viewer_id:
        buyer_rows = conn.execute(
            "SELECT prediction_id FROM prediction_purchases WHERE buyer_id = ?",
            (viewer_id,)
        ).fetchall()
        purchased_ids = {r["prediction_id"] for r in buyer_rows}

    # Get predictor accuracy
    user_ids = list(set(r["user_id"] for r in rows))
    accuracy_map = {}
    if user_ids:
        placeholders = ",".join("?" * len(user_ids))
        acc_rows = conn.execute(f"""
            SELECT user_id,
                SUM(CASE WHEN match_finished = 1 THEN 1 ELSE 0 END) as finished,
                SUM(CASE WHEN match_finished = 1 AND result_correct = 1 THEN 1 ELSE 0 END) as correct
            FROM community_predictions
            WHERE visibility = 'public' AND user_id IN ({placeholders})
            GROUP BY user_id
        """, user_ids).fetchall()
        for ar in acc_rows:
            finished = ar["finished"] or 0
            correct = ar["correct"] or 0
            accuracy_map[ar["user_id"]] = {
                "accuracy": round((correct / finished) * 100, 1) if finished >= 3 else None,
                "wins": correct,
                "losses": finished - correct,
                "total_finished": finished,
            }

    # Get reaction counts
    pred_ids = [r["id"] for r in rows]
    reactions_map = {}
    chat_counts = {}
    if pred_ids:
        ph = ",".join("?" * len(pred_ids))
        react_rows = conn.execute(f"""
            SELECT prediction_id,
                SUM(CASE WHEN reaction = 'like' THEN 1 ELSE 0 END) as likes,
                SUM(CASE WHEN reaction = 'dislike' THEN 1 ELSE 0 END) as dislikes
            FROM prediction_reactions WHERE prediction_id IN ({ph})
            GROUP BY prediction_id
        """, pred_ids).fetchall()
        for rr in react_rows:
            reactions_map[rr["prediction_id"]] = {"likes": rr["likes"] or 0, "dislikes": rr["dislikes"] or 0}
        chat_rows = conn.execute(f"""
            SELECT prediction_id, COUNT(*) as cnt
            FROM prediction_chats WHERE prediction_id IN ({ph})
            GROUP BY prediction_id
        """, pred_ids).fetchall()
        for cr in chat_rows:
            chat_counts[cr["prediction_id"]] = cr["cnt"]

    # Get follower counts for each unique predictor
    followers_map = {}
    if user_ids:
        for uid in user_ids:
            cnt = conn.execute(
                "SELECT COUNT(*) as c FROM user_follows WHERE following_id = ?", (uid,)
            ).fetchone()["c"]
            followers_map[uid] = cnt

    conn.close()

    predictions = []
    for i, r in enumerate(rows):
        is_owner = viewer_id and r["user_id"] == viewer_id
        is_purchased = r["id"] in purchased_ids
        unlocked = is_owner or is_purchased
        rxn = reactions_map.get(r["id"], {"likes": 0, "dislikes": 0})

        pred = {
            "id": r["id"],
            "rank": offset + i + 1,
            "user_id": r["user_id"],
            "username": r["username"],
            "display_name": r["display_name"],
            "avatar_color": r["avatar_color"],
            "predictor_accuracy": (accuracy_map.get(r["user_id"]) or {}).get("accuracy"),
            "predictor_wins": (accuracy_map.get(r["user_id"]) or {}).get("wins", 0),
            "predictor_losses": (accuracy_map.get(r["user_id"]) or {}).get("losses", 0),
            "fixture_id": r["fixture_id"],
            "team_a_name": r["team_a_name"],
            "team_b_name": r["team_b_name"],
            "competition": r["competition"],
            "competition_code": r["competition_code"] if "competition_code" in r.keys() else "",
            "is_paid": True,
            "price_usd": r["price_usd"],
            "purchase_count": r["purchase_count"],
            "unlocked": unlocked,
            "avg_rating": round(r["avg_rating"], 1),
            "rating_count": r["rating_count"],
            "likes": rxn["likes"],
            "dislikes": rxn["dislikes"],
            "chat_count": chat_counts.get(r["id"], 0),
            "followers_count": followers_map.get(r["user_id"], 0),
            "created_at": r["created_at"],
            "match_finished": bool(r["match_finished"]),
            "result_correct": r["result_correct"],
            "slip_id": r["slip_id"] if "slip_id" in r.keys() else None,
            "odds": r["odds"] if "odds" in r.keys() else None,
            "combined_odds": r["combined_odds"] if "combined_odds" in r.keys() else None,
        }

        # Only show full prediction details if unlocked
        if unlocked:
            pred.update({
                "predicted_result": r["predicted_result"],
                "predicted_result_prob": r["predicted_result_prob"],
                "predicted_over25": r["predicted_over25"],
                "predicted_btts": r["predicted_btts"],
                "best_value_bet": r["best_value_bet"],
                "best_value_prob": r["best_value_prob"],
                "analysis_summary": r["analysis_summary"],
            })

        predictions.append(pred)

    # Group predictions by slip_id
    grouped = []
    seen_slips = {}
    for pred in predictions:
        sid = pred.get("slip_id")
        if sid and sid in seen_slips:
            seen_slips[sid]["slip_picks"].append({
                "id": pred["id"],
                "team_a_name": pred.get("team_a_name", ""),
                "team_b_name": pred.get("team_b_name", ""),
                "fixture_id": pred.get("fixture_id", ""),
                "competition": pred.get("competition", ""),
                "competition_code": pred.get("competition_code", ""),
                "predicted_result": pred.get("predicted_result", ""),
                "predicted_result_prob": pred.get("predicted_result_prob", 0),
                "odds": pred.get("odds"),
                "match_finished": pred.get("match_finished", False),
                "result_correct": pred.get("result_correct"),
            })
        else:
            pred["slip_picks"] = [{
                "id": pred["id"],
                "team_a_name": pred.get("team_a_name", ""),
                "team_b_name": pred.get("team_b_name", ""),
                "fixture_id": pred.get("fixture_id", ""),
                "competition": pred.get("competition", ""),
                "competition_code": pred.get("competition_code", ""),
                "predicted_result": pred.get("predicted_result", ""),
                "predicted_result_prob": pred.get("predicted_result_prob", 0),
                "odds": pred.get("odds"),
                "match_finished": pred.get("match_finished", False),
                "result_correct": pred.get("result_correct"),
            }]
            grouped.append(pred)
            if sid:
                seen_slips[sid] = pred

    return {
        "predictions": grouped,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
        "sort_by": sort_by,
    }


# ==================== NOTIFICATIONS & EARNINGS ====================

def get_user_notifications(user_id: int, limit: int = 30) -> Dict:
    """Get all notifications for a user from the notifications table."""
    conn = _get_db()

    rows = conn.execute("""
        SELECT id, type, title, message, metadata, is_read, created_at
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
    """, (user_id, limit)).fetchall()

    unread_count = conn.execute(
        "SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0",
        (user_id,)
    ).fetchone()["c"]

    conn.close()

    notifications = []
    for r in rows:
        meta = {}
        try:
            meta = json.loads(r["metadata"]) if r["metadata"] else {}
        except (json.JSONDecodeError, TypeError):
            pass
        notifications.append({
            "id": r["id"],
            "type": r["type"],
            "title": r["title"],
            "message": r["message"],
            "metadata": meta,
            "is_read": bool(r["is_read"]),
            "created_at": r["created_at"],
        })

    return {
        "notifications": notifications,
        "unread_count": unread_count,
    }


def mark_single_notification_read(user_id: int, notification_id: int) -> Dict:
    """Mark a single notification as read."""
    conn = _get_db()
    conn.execute(
        "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ? AND is_read = 0",
        (notification_id, user_id)
    )
    conn.commit()
    unread = conn.execute(
        "SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0",
        (user_id,)
    ).fetchone()["c"]
    conn.close()
    return {"success": True, "unread_count": unread}


def mark_notifications_read(user_id: int) -> Dict:
    """Mark all notifications as read for a user."""
    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
        (user_id,)
    )
    # Keep notification_reads updated for backwards compatibility
    conn.execute("""
        INSERT INTO notification_reads (user_id, last_read_at)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET last_read_at = ?
    """, (user_id, now, now))
    conn.commit()
    conn.close()
    return {"success": True}


def get_earnings_summary(user_id: int) -> Dict:
    """Get earnings summary for the access bar dropdown."""
    conn = _get_db()

    # Wallet info (creator earnings)
    wallet = conn.execute(
        "SELECT * FROM creator_wallets WHERE user_id = ?", (user_id,)
    ).fetchone()

    # User account balance (top-up balance)
    acct = conn.execute(
        "SELECT * FROM user_balances WHERE user_id = ?", (user_id,)
    ).fetchone()

    # Count total predictions
    total_preds = conn.execute(
        "SELECT COUNT(*) as c FROM community_predictions WHERE user_id = ?", (user_id,)
    ).fetchone()["c"]

    # Count paid predictions
    paid_preds = conn.execute(
        "SELECT COUNT(*) as c FROM community_predictions WHERE user_id = ? AND is_paid = 1",
        (user_id,)
    ).fetchone()["c"]

    # Recent sales (last 5)
    sales = conn.execute("""
        SELECT pp.price_amount, pp.created_at, cp.team_a_name, cp.team_b_name
        FROM prediction_purchases pp
        JOIN community_predictions cp ON cp.id = pp.prediction_id
        WHERE pp.seller_id = ?
        ORDER BY pp.created_at DESC LIMIT 5
    """, (user_id,)).fetchall()

    conn.close()

    return {
        "balance_usd": wallet["balance_usd"] if wallet else 0,
        "total_earned_usd": wallet["total_earned_usd"] if wallet else 0,
        "total_sales": wallet["total_sales"] if wallet else 0,
        "total_predictions": total_preds,
        "paid_predictions": paid_preds,
        "account_balance_usd": acct["balance_usd"] if acct else 0,
        "account_balance_kes": acct["balance_kes"] if acct else 0,
        "recent_sales": [{
            "amount": s["price_amount"],
            "match": f"{s['team_a_name']} vs {s['team_b_name']}",
            "created_at": s["created_at"],
        } for s in sales],
    }


def get_unread_count(user_id: int) -> int:
    """Quick count of unread notifications."""
    conn = _get_db()
    count = conn.execute(
        "SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0",
        (user_id,)
    ).fetchone()["c"]
    conn.close()
    return count


# ==================== DIRECT MESSAGES ====================

def send_message(
    sender_id: int, receiver_id: int,
    sender_username: str, sender_display_name: str,
    sender_avatar_color: str, content: str
) -> Dict:
    """Send a direct message to another user."""
    content = content.strip()
    if not content or len(content) > 1000:
        return {"success": False, "error": "Message must be 1-1000 characters"}
    if sender_id == receiver_id:
        return {"success": False, "error": "Cannot message yourself"}

    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute("""
        INSERT INTO direct_messages (sender_id, receiver_id, sender_username,
            sender_display_name, sender_avatar_color, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (sender_id, receiver_id, sender_username, sender_display_name,
          sender_avatar_color, content, now))
    conn.commit()
    msg_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()

    return {"success": True, "message_id": msg_id}


def get_conversations(user_id: int) -> List[Dict]:
    """Get list of conversations (grouped by other user) with last message preview."""
    conn = _get_db()

    # Get all unique conversation partners with the latest message
    rows = conn.execute("""
        SELECT
            CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as other_id,
            CASE WHEN sender_id = ? THEN
                (SELECT dm2.sender_display_name FROM direct_messages dm2
                 WHERE (dm2.sender_id = receiver_id OR dm2.receiver_id = sender_id)
                   AND dm2.sender_id = receiver_id LIMIT 1)
            ELSE sender_display_name END as other_name,
            CASE WHEN sender_id = ? THEN
                (SELECT dm2.sender_username FROM direct_messages dm2
                 WHERE dm2.sender_id = receiver_id LIMIT 1)
            ELSE sender_username END as other_username,
            CASE WHEN sender_id = ? THEN
                (SELECT dm2.sender_avatar_color FROM direct_messages dm2
                 WHERE dm2.sender_id = receiver_id LIMIT 1)
            ELSE sender_avatar_color END as other_avatar,
            content as last_message,
            created_at as last_message_at,
            sender_id
        FROM direct_messages
        WHERE sender_id = ? OR receiver_id = ?
        ORDER BY created_at DESC
    """, (user_id, user_id, user_id, user_id, user_id, user_id)).fetchall()

    # Deduplicate by other_id, keep only the latest message per conversation
    seen = {}
    for r in rows:
        other_id = r["other_id"]
        if other_id not in seen:
            # Count unread in this conversation
            unread = conn.execute("""
                SELECT COUNT(*) as c FROM direct_messages
                WHERE sender_id = ? AND receiver_id = ? AND is_read = 0
            """, (other_id, user_id)).fetchone()["c"]

            seen[other_id] = {
                "other_id": other_id,
                "other_name": r["other_name"] or f"User {other_id}",
                "other_username": r["other_username"] or "",
                "other_avatar": r["other_avatar"] or "#6c5ce7",
                "last_message": r["last_message"],
                "last_message_at": r["last_message_at"],
                "is_mine": r["sender_id"] == user_id,
                "unread_count": unread,
            }

    conn.close()
    return list(seen.values())


def get_messages(user_id: int, other_id: int, limit: int = 50) -> List[Dict]:
    """Get messages between two users."""
    conn = _get_db()

    # Mark messages from other user as read
    conn.execute("""
        UPDATE direct_messages SET is_read = 1
        WHERE sender_id = ? AND receiver_id = ? AND is_read = 0
    """, (other_id, user_id))
    conn.commit()

    rows = conn.execute("""
        SELECT id, sender_id, receiver_id, content, is_read, created_at
        FROM direct_messages
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at ASC
        LIMIT ?
    """, (user_id, other_id, other_id, user_id, limit)).fetchall()
    conn.close()

    return [{
        "id": r["id"],
        "sender_id": r["sender_id"],
        "is_mine": r["sender_id"] == user_id,
        "content": r["content"],
        "created_at": r["created_at"],
    } for r in rows]


def get_unread_messages_count(user_id: int) -> int:
    """Get total unread message count for a user."""
    conn = _get_db()
    count = conn.execute(
        "SELECT COUNT(*) as c FROM direct_messages WHERE receiver_id = ? AND is_read = 0",
        (user_id,)
    ).fetchone()["c"]
    conn.close()
    return count


# ==================== SUPPORT CHAT ====================

def send_support_message(user_id: int, sender: str, content: str, category: str = None,
                         agent_id: int = None, agent_name: str = None) -> Dict:
    """Send a support message. sender is 'user', 'admin', 'ai', or 'system'."""
    content = content.strip()
    if not content or len(content) > 2000:
        return {"success": False, "error": "Message must be 1-2000 characters"}

    # Get or create active conversation
    conv = get_or_create_active_conversation(user_id)

    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute("""
        INSERT INTO support_messages (user_id, sender, content, is_read, category, agent_id, agent_name, conversation_id, created_at)
        VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)
    """, (user_id, sender, content, category, agent_id, agent_name, conv["id"], now))
    conn.commit()
    msg_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()

    _signal_support(user_id, msg_id)
    return {"success": True, "message_id": msg_id}


def get_support_messages(user_id: int, mark_read_for: str = None, limit: int = 50, current_conv_only: bool = False) -> List[Dict]:
    """Get support chat messages for a user. mark_read_for marks the other side's messages as read."""
    conn = _get_db()

    # Mark the opposite side's messages as read (only if mark_read_for is specified)
    if mark_read_for:
        other_sender = "admin" if mark_read_for == "user" else "user"
        conn.execute("""
            UPDATE support_messages SET is_read = 1
            WHERE user_id = ? AND sender = ? AND is_read = 0
        """, (user_id, other_sender))
        conn.commit()

    # If current_conv_only, filter by the latest conversation_id
    conv_filter = ""
    params = [user_id]
    if current_conv_only:
        conv_row = conn.execute(
            "SELECT id FROM support_conversations WHERE user_id = ? ORDER BY id DESC LIMIT 1",
            (user_id,)
        ).fetchone()
        if conv_row:
            conv_filter = " AND conversation_id = ?"
            params.append(conv_row["id"])

    params.append(limit)
    rows = conn.execute(f"""
        SELECT id, user_id, sender, content, is_read, category, agent_id, agent_name, created_at
        FROM support_messages
        WHERE user_id = ?{conv_filter}
        ORDER BY created_at ASC
        LIMIT ?
    """, params).fetchall()
    conn.close()

    return [{
        "id": r["id"],
        "sender": r["sender"],
        "content": r["content"],
        "category": r["category"],
        "agent_name": r["agent_name"],
        "created_at": r["created_at"],
    } for r in rows]


def get_support_message_by_id(msg_id: int) -> Optional[Dict]:
    """Get a single support message by its ID."""
    conn = _get_db()
    row = conn.execute(
        "SELECT id, user_id, sender, content, is_read, category, agent_id, agent_name, created_at "
        "FROM support_messages WHERE id = ?", (msg_id,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "sender": row["sender"],
        "content": row["content"],
        "category": row["category"],
        "agent_name": row["agent_name"],
        "created_at": row["created_at"],
    }


def is_support_escalated(user_id: int) -> bool:
    """Check if the current active support conversation has been escalated to a human agent."""
    conn = _get_db()
    # Only check the current active conversation, not all historical ones
    conv = conn.execute(
        "SELECT id FROM support_conversations WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
        (user_id,)
    ).fetchone()
    if not conv:
        conn.close()
        return False
    row = conn.execute(
        "SELECT COUNT(*) as c FROM support_messages WHERE user_id = ? AND escalated = 1 AND conversation_id = ?",
        (user_id, conv["id"])
    ).fetchone()
    conn.close()
    return row["c"] > 0


def escalate_support(user_id: int):
    """Mark the current active conversation as escalated to human agent."""
    conn = _get_db()
    # Only escalate within the current active conversation
    conv = conn.execute(
        "SELECT id FROM support_conversations WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
        (user_id,)
    ).fetchone()
    if conv:
        conn.execute("""
            UPDATE support_messages SET escalated = 1
            WHERE user_id = ? AND conversation_id = ? AND id = (
                SELECT MAX(id) FROM support_messages WHERE user_id = ? AND conversation_id = ?
            )
        """, (user_id, conv["id"], user_id, conv["id"]))
        conn.commit()
    conn.close()


# ==================== CONVERSATION MANAGEMENT ====================

def get_or_create_active_conversation(user_id: int, force_new: bool = False) -> Dict:
    """Get or create the active conversation for a user. If force_new, always create a new one."""
    conn = _get_db()
    if not force_new:
        row = conn.execute(
            "SELECT * FROM support_conversations WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
            (user_id,)
        ).fetchone()
        if row:
            result = dict(row)
            conn.close()
            return result
    now = datetime.now().isoformat()
    conn.execute(
        "INSERT INTO support_conversations (user_id, status, created_at) VALUES (?, 'active', ?)",
        (user_id, now)
    )
    conn.commit()
    conv_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return {"id": conv_id, "user_id": user_id, "status": "active", "created_at": now,
            "assigned_agent_id": None, "assigned_agent_name": None, "closed_at": None, "closed_reason": None}


def get_conversation_by_user(user_id: int):
    """Get the most recent conversation for a user."""
    conn = _get_db()
    row = conn.execute(
        "SELECT * FROM support_conversations WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        (user_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def close_conversation(user_id: int, reason: str) -> bool:
    """Close the active conversation for a user."""
    conn = _get_db()
    now = datetime.now().isoformat()
    result = conn.execute(
        "UPDATE support_conversations SET status = 'closed', closed_at = ?, closed_reason = ? "
        "WHERE user_id = ? AND status = 'active'",
        (now, reason, user_id)
    )
    conn.commit()
    affected = result.rowcount
    conn.close()
    return affected > 0


def assign_agent_to_conversation(user_id: int, agent_id: int, agent_name: str):
    """Assign an agent to the active conversation."""
    conn = _get_db()
    conn.execute(
        "UPDATE support_conversations SET assigned_agent_id = ?, assigned_agent_name = ? "
        "WHERE user_id = ? AND status = 'active'",
        (agent_id, agent_name, user_id)
    )
    conn.commit()
    conn.close()


def is_conversation_active(user_id: int) -> bool:
    """Check if the user can send messages. Returns True if no conversation exists (new) or if active."""
    conn = _get_db()
    # Check if there's any conversation at all
    total = conn.execute(
        "SELECT COUNT(*) as c FROM support_conversations WHERE user_id = ?",
        (user_id,)
    ).fetchone()["c"]
    if total == 0:
        conn.close()
        return True  # No conversation yet = allowed to start one
    # If conversations exist, check if the latest is active
    row = conn.execute(
        "SELECT status FROM support_conversations WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        (user_id,)
    ).fetchone()
    conn.close()
    return row["status"] == "active"


def get_conversations_for_inactivity_check(minutes: int = 5) -> List[Dict]:
    """Get active conversations that have been inactive for the given number of minutes."""
    from datetime import timedelta
    cutoff = (datetime.now() - timedelta(minutes=minutes)).isoformat()
    conn = _get_db()
    rows = conn.execute("""
        SELECT sc.user_id, sc.id as conversation_id,
               (SELECT MAX(sm.created_at) FROM support_messages sm
                WHERE sm.user_id = sc.user_id AND sm.conversation_id = sc.id) as last_activity
        FROM support_conversations sc
        WHERE sc.status = 'active'
    """).fetchall()
    conn.close()
    # Filter: only return conversations where last_activity is before the cutoff
    result = []
    for r in rows:
        d = dict(r)
        if d.get("last_activity") and d["last_activity"] < cutoff:
            result.append(d)
    return result


# ==================== RATINGS ====================

def submit_support_rating(conversation_id: int, user_id: int, agent_id: int,
                          agent_name: str, rating: int, comment: str = None) -> Dict:
    """Submit a rating for a support conversation."""
    if rating < 1 or rating > 5:
        return {"success": False, "error": "Rating must be 1-5"}
    conn = _get_db()
    try:
        now = datetime.now().isoformat()
        conn.execute("""
            INSERT INTO support_ratings (conversation_id, user_id, agent_id, agent_name, rating, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (conversation_id, user_id, agent_id, agent_name, rating, comment, now))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception:
        conn.close()
        return {"success": False, "error": "You have already rated this conversation"}


def get_all_agent_ratings() -> List[Dict]:
    """Get ratings summary for all agents (admin view)."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT agent_id, agent_name,
               COUNT(*) as total_ratings,
               AVG(rating) as avg_rating
        FROM support_ratings
        GROUP BY agent_id
        ORDER BY avg_rating DESC
    """).fetchall()
    conn.close()
    return [{
        "agent_id": r["agent_id"],
        "agent_name": r["agent_name"],
        "total_ratings": r["total_ratings"],
        "avg_rating": round(r["avg_rating"], 1) if r["avg_rating"] else 0,
    } for r in rows]


def get_recent_ratings(limit: int = 10) -> List[Dict]:
    """Get the most recent individual ratings with customer usernames."""
    import user_auth
    conn = _get_db()
    rows = conn.execute("""
        SELECT sr.rating, sr.comment, sr.agent_name, sr.user_id, sr.created_at
        FROM support_ratings sr
        ORDER BY sr.created_at DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()

    result = []
    for r in rows:
        profile = user_auth.get_user_profile(r["user_id"])
        result.append({
            "rating": r["rating"],
            "comment": r["comment"],
            "agent_name": r["agent_name"],
            "user_id": r["user_id"],
            "display_name": profile["display_name"] if profile else f"User {r['user_id']}",
            "username": profile["username"] if profile else "",
            "created_at": r["created_at"],
        })
    return result


def get_support_conversations() -> List[Dict]:
    """Admin: get all support conversations with last message preview."""
    import user_auth
    conn = _get_db()

    rows = conn.execute("""
        SELECT sm.user_id, sm.content as last_message, sm.sender as last_sender,
               sm.created_at as last_message_at
        FROM support_messages sm
        INNER JOIN (
            SELECT user_id, MAX(id) as max_id
            FROM support_messages
            GROUP BY user_id
        ) latest ON sm.id = latest.max_id
        ORDER BY sm.created_at DESC
    """).fetchall()

    conversations = []
    for r in rows:
        unread = conn.execute(
            "SELECT COUNT(*) as c FROM support_messages WHERE user_id = ? AND sender = 'user' AND is_read = 0",
            (r["user_id"],)
        ).fetchone()["c"]

        # Get category from first message in conversation
        cat_row = conn.execute(
            "SELECT category FROM support_messages WHERE user_id = ? AND category IS NOT NULL ORDER BY id ASC LIMIT 1",
            (r["user_id"],)
        ).fetchone()
        category = cat_row["category"] if cat_row else None

        # Look up user info from auth database
        profile = user_auth.get_user_profile(r["user_id"])
        display_name = profile["display_name"] if profile else f"User {r['user_id']}"
        username = profile["username"] if profile else ""
        avatar_color = profile["avatar_color"] if profile else "#6c5ce7"

        # Get conversation status
        conv_row = conn.execute(
            "SELECT id, status, assigned_agent_id, assigned_agent_name, closed_at, closed_reason "
            "FROM support_conversations WHERE user_id = ? ORDER BY id DESC LIMIT 1",
            (r["user_id"],)
        ).fetchone()

        # Get rating for this conversation if it exists
        rating_val = None
        if conv_row:
            rating_row = conn.execute(
                "SELECT rating FROM support_ratings WHERE conversation_id = ?",
                (conv_row["id"],)
            ).fetchone()
            if rating_row:
                rating_val = rating_row["rating"]

        conversations.append({
            "user_id": r["user_id"],
            "display_name": display_name,
            "username": username,
            "avatar_color": avatar_color,
            "last_message": r["last_message"],
            "last_sender": r["last_sender"],
            "last_message_at": r["last_message_at"],
            "unread_count": unread,
            "category": category,
            "conv_status": conv_row["status"] if conv_row else "active",
            "assigned_agent_name": conv_row["assigned_agent_name"] if conv_row else None,
            "closed_reason": conv_row["closed_reason"] if conv_row else None,
            "rating": rating_val,
        })

    conn.close()
    return conversations


def get_support_unread_count(user_id: int) -> int:
    """Get unread support messages from admin for a user."""
    conn = _get_db()
    count = conn.execute(
        "SELECT COUNT(*) as c FROM support_messages WHERE user_id = ? AND sender = 'admin' AND is_read = 0",
        (user_id,)
    ).fetchone()["c"]
    conn.close()
    return count


def delete_user_data(user_id: int):
    """Delete all community data for a user (called on account deletion)."""
    conn = _get_db()
    conn.execute("DELETE FROM community_predictions WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM prediction_ratings WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM prediction_comments WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM prediction_purchases WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM creator_wallets WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM notification_reads WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM notifications WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM direct_messages WHERE sender_id = ? OR receiver_id = ?", (user_id, user_id))
    conn.execute("DELETE FROM support_messages WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM support_conversations WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM support_ratings WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()


def get_support_latest_for_user(user_id: int) -> Optional[Dict]:
    """Get the latest support message and unread count for a user (for MessagesDropdown)."""
    conn = _get_db()
    row = conn.execute("""
        SELECT id, sender, content, created_at
        FROM support_messages WHERE user_id = ?
        ORDER BY id DESC LIMIT 1
    """, (user_id,)).fetchone()
    if not row:
        conn.close()
        return None
    unread = conn.execute(
        "SELECT COUNT(*) as c FROM support_messages WHERE user_id = ? AND sender = 'admin' AND is_read = 0",
        (user_id,)
    ).fetchone()["c"]
    conn.close()
    return {
        "last_message": row["content"],
        "last_message_at": row["created_at"],
        "is_mine": row["sender"] == "user",
        "unread_count": unread,
    }


# ==================== USER ACCOUNT BALANCE ====================

def get_user_balance(user_id: int) -> Dict:
    """Get a user's account balance (top-up balance for purchasing services)."""
    conn = _get_db()
    row = conn.execute("SELECT * FROM user_balances WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    if row:
        return {
            "balance_usd": row["balance_usd"],
            "balance_kes": row["balance_kes"],
            "total_deposited_usd": row["total_deposited_usd"],
            "total_deposited_kes": row["total_deposited_kes"],
            "total_spent_usd": row["total_spent_usd"],
            "total_spent_kes": row["total_spent_kes"],
        }
    return {
        "balance_usd": 0.0,
        "balance_kes": 0.0,
        "total_deposited_usd": 0.0,
        "total_deposited_kes": 0.0,
        "total_spent_usd": 0.0,
        "total_spent_kes": 0.0,
    }


def adjust_user_balance(user_id: int, amount_usd: float, amount_kes: float,
                         reason: str, adjustment_type: str,
                         adjusted_by_id: int = None, adjusted_by_name: str = "") -> Dict:
    """Adjust a user's account balance (admin action). Returns updated balance."""
    conn = _get_db()
    now = datetime.now().isoformat()

    # Ensure user_balances row exists
    conn.execute("""
        INSERT OR IGNORE INTO user_balances (user_id, balance_usd, balance_kes,
            total_deposited_usd, total_deposited_kes, total_spent_usd, total_spent_kes, updated_at)
        VALUES (?, 0, 0, 0, 0, 0, 0, ?)
    """, (user_id, now))

    # Update balance
    conn.execute("""
        UPDATE user_balances SET
            balance_usd = balance_usd + ?,
            balance_kes = balance_kes + ?,
            total_deposited_usd = CASE WHEN ? > 0 THEN total_deposited_usd + ? ELSE total_deposited_usd END,
            total_deposited_kes = CASE WHEN ? > 0 THEN total_deposited_kes + ? ELSE total_deposited_kes END,
            total_spent_usd = CASE WHEN ? < 0 THEN total_spent_usd + ? ELSE total_spent_usd END,
            total_spent_kes = CASE WHEN ? < 0 THEN total_spent_kes + ? ELSE total_spent_kes END,
            updated_at = ?
        WHERE user_id = ?
    """, (amount_usd, amount_kes,
          amount_usd, amount_usd,
          amount_kes, amount_kes,
          amount_usd, abs(amount_usd),
          amount_kes, abs(amount_kes),
          now, user_id))

    # Record the adjustment
    conn.execute("""
        INSERT INTO balance_adjustments (user_id, amount_usd, amount_kes, adjustment_type, reason,
            adjusted_by_id, adjusted_by_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, amount_usd, amount_kes, adjustment_type, reason,
          adjusted_by_id, adjusted_by_name, now))

    conn.commit()

    # Return updated balance
    row = conn.execute("SELECT * FROM user_balances WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    return {
        "balance_usd": row["balance_usd"],
        "balance_kes": row["balance_kes"],
        "total_deposited_usd": row["total_deposited_usd"],
        "total_deposited_kes": row["total_deposited_kes"],
        "total_spent_usd": row["total_spent_usd"],
        "total_spent_kes": row["total_spent_kes"],
    }


def get_balance_adjustments(user_id: int, limit: int = 20) -> List[Dict]:
    """Get balance adjustment history for a user."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT * FROM balance_adjustments WHERE user_id = ?
        ORDER BY created_at DESC LIMIT ?
    """, (user_id, limit)).fetchall()
    conn.close()
    return [{
        "id": r["id"],
        "amount_usd": r["amount_usd"],
        "amount_kes": r["amount_kes"],
        "adjustment_type": r["adjustment_type"],
        "reason": r["reason"],
        "adjusted_by_name": r["adjusted_by_name"],
        "created_at": r["created_at"],
    } for r in rows]


def get_balance_adjustment_stats() -> Dict:
    """Get overall balance adjustment stats for admin dashboard."""
    conn = _get_db()
    stats = conn.execute("""
        SELECT
            COUNT(*) as total_adjustments,
            COALESCE(SUM(CASE WHEN amount_usd > 0 THEN amount_usd ELSE 0 END), 0) as total_credited_usd,
            COALESCE(SUM(CASE WHEN amount_usd < 0 THEN ABS(amount_usd) ELSE 0 END), 0) as total_debited_usd,
            COALESCE(SUM(CASE WHEN amount_kes > 0 THEN amount_kes ELSE 0 END), 0) as total_credited_kes,
            COALESCE(SUM(CASE WHEN amount_kes < 0 THEN ABS(amount_kes) ELSE 0 END), 0) as total_debited_kes
        FROM balance_adjustments
    """).fetchone()
    conn.close()
    return {
        "total_adjustments": stats["total_adjustments"],
        "total_credited_usd": round(stats["total_credited_usd"], 2),
        "total_debited_usd": round(stats["total_debited_usd"], 2),
        "total_credited_kes": round(stats["total_credited_kes"], 0),
        "total_debited_kes": round(stats["total_debited_kes"], 0),
    }


# ==================== BROADCAST MESSAGING ====================

def create_broadcast(sender_id: int, sender_name: str, title: str, message: str,
                     auto_approve: bool = False) -> Dict:
    """Create a broadcast message. If auto_approve=True (super admin), it's sent immediately."""
    conn = _get_db()
    now = datetime.now().isoformat()
    status = "approved" if auto_approve else "pending_approval"
    conn.execute("""
        INSERT INTO broadcast_messages (sender_id, sender_name, title, message, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (sender_id, sender_name, title, message, status, now))
    broadcast_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    result = {"success": True, "broadcast_id": broadcast_id, "status": status}

    # If auto-approved, send immediately
    if auto_approve:
        send_result = _execute_broadcast(broadcast_id)
        result.update(send_result)

    return result


def approve_broadcast(broadcast_id: int, approver_id: int, approver_name: str) -> Dict:
    """Super admin approves a pending broadcast, then sends it."""
    conn = _get_db()
    row = conn.execute("SELECT * FROM broadcast_messages WHERE id = ?", (broadcast_id,)).fetchone()
    if not row:
        conn.close()
        return {"success": False, "error": "Broadcast not found"}
    if row["status"] != "pending_approval":
        conn.close()
        return {"success": False, "error": f"Broadcast is already {row['status']}"}

    now = datetime.now().isoformat()
    conn.execute("""
        UPDATE broadcast_messages SET status = 'approved', approved_by_id = ?, approved_by_name = ?, approved_at = ?
        WHERE id = ?
    """, (approver_id, approver_name, now, broadcast_id))
    conn.commit()
    conn.close()

    send_result = _execute_broadcast(broadcast_id)
    return {"success": True, **send_result}


def reject_broadcast(broadcast_id: int, approver_id: int, approver_name: str, reason: str = "") -> Dict:
    """Super admin rejects a pending broadcast."""
    conn = _get_db()
    row = conn.execute("SELECT * FROM broadcast_messages WHERE id = ?", (broadcast_id,)).fetchone()
    if not row:
        conn.close()
        return {"success": False, "error": "Broadcast not found"}
    if row["status"] != "pending_approval":
        conn.close()
        return {"success": False, "error": f"Broadcast is already {row['status']}"}

    now = datetime.now().isoformat()
    conn.execute("""
        UPDATE broadcast_messages SET status = 'rejected', approved_by_id = ?, approved_by_name = ?,
        approved_at = ?, rejected_reason = ?
        WHERE id = ?
    """, (approver_id, approver_name, now, reason, broadcast_id))
    conn.commit()
    conn.close()

    # Notify the original sender that their broadcast was rejected
    create_notification(
        user_id=row["sender_id"],
        notif_type="broadcast_rejected",
        title="Broadcast Rejected",
        message=f"Your broadcast \"{row['title']}\" was rejected." + (f" Reason: {reason}" if reason else ""),
    )
    return {"success": True}


def _execute_broadcast(broadcast_id: int) -> Dict:
    """Actually send a broadcast to all active users. Updates status to 'sent'."""
    import user_auth
    conn = _get_db()
    broadcast = conn.execute("SELECT * FROM broadcast_messages WHERE id = ?", (broadcast_id,)).fetchone()
    if not broadcast:
        conn.close()
        return {"recipient_count": 0}

    # Get all active users
    auth_conn = user_auth._get_db()
    users = auth_conn.execute("SELECT id FROM users WHERE is_active = 1").fetchall()
    auth_conn.close()

    user_ids = [u["id"] for u in users]
    now = datetime.now().isoformat()

    # Create a notification for each user
    for uid in user_ids:
        create_notification(
            user_id=uid,
            notif_type="broadcast",
            title=broadcast["title"],
            message=broadcast["message"],
            metadata={"broadcast_id": broadcast_id, "sender_name": broadcast["sender_name"]},
        )

    # Send email to all users (in background thread)
    import threading
    def _send_broadcast_emails():
        try:
            for uid in user_ids:
                _send_notif_email(
                    user_id=uid,
                    notif_type="broadcast",
                    title=broadcast["title"],
                    message=broadcast["message"],
                )
        except Exception as e:
            print(f"[WARN] Broadcast email error: {e}")
    threading.Thread(target=_send_broadcast_emails, daemon=True).start()

    # Mark as sent
    conn.execute("""
        UPDATE broadcast_messages SET status = 'sent', sent_at = ?, recipient_count = ?
        WHERE id = ?
    """, (now, len(user_ids), broadcast_id))
    conn.commit()
    conn.close()

    return {"recipient_count": len(user_ids)}


def get_broadcasts(status_filter: str = None, limit: int = 50) -> List[Dict]:
    """Get broadcast messages, optionally filtered by status."""
    conn = _get_db()
    if status_filter:
        rows = conn.execute("""
            SELECT * FROM broadcast_messages WHERE status = ?
            ORDER BY created_at DESC LIMIT ?
        """, (status_filter, limit)).fetchall()
    else:
        rows = conn.execute("""
            SELECT * FROM broadcast_messages ORDER BY created_at DESC LIMIT ?
        """, (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ==================== CHAT KEEP-ALIVE ====================

def get_conversations_needing_keepalive(idle_minutes: int = 30) -> List[Dict]:
    """Get active conversations that have been idle for the given minutes
    AND haven't already been prompted for keep-alive recently."""
    from datetime import timedelta
    cutoff = (datetime.now() - timedelta(minutes=idle_minutes)).isoformat()
    conn = _get_db()
    rows = conn.execute("""
        SELECT sc.id as conversation_id, sc.user_id, sc.assigned_agent_id, sc.assigned_agent_name,
               (SELECT MAX(sm.created_at) FROM support_messages sm
                WHERE sm.user_id = sc.user_id AND sm.conversation_id = sc.id) as last_activity
        FROM support_conversations sc
        WHERE sc.status = 'active' AND sc.assigned_agent_id IS NOT NULL
    """).fetchall()
    conn.close()

    result = []
    for r in rows:
        d = dict(r)
        if not d.get("last_activity") or d["last_activity"] >= cutoff:
            continue
        # Check if already prompted and not responded
        prompt_conn = _get_db()
        pending = prompt_conn.execute("""
            SELECT id FROM chat_keepalive_prompts
            WHERE conversation_id = ? AND responded = 0
        """, (d["conversation_id"],)).fetchone()
        prompt_conn.close()
        if not pending:
            result.append(d)
    return result


def create_keepalive_prompt(conversation_id: int, agent_id: int) -> int:
    """Create a keep-alive prompt for an agent. Returns prompt id."""
    conn = _get_db()
    now = datetime.now().isoformat()
    conn.execute("""
        INSERT INTO chat_keepalive_prompts (conversation_id, agent_id, prompted_at)
        VALUES (?, ?, ?)
    """, (conversation_id, agent_id, now))
    prompt_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()
    return prompt_id


def respond_keepalive(conversation_id: int, agent_id: int, keep_open: bool) -> Dict:
    """Agent responds to a keep-alive prompt."""
    conn = _get_db()
    now = datetime.now().isoformat()
    row = conn.execute("""
        SELECT id FROM chat_keepalive_prompts
        WHERE conversation_id = ? AND agent_id = ? AND responded = 0
        ORDER BY prompted_at DESC LIMIT 1
    """, (conversation_id, agent_id)).fetchone()
    if not row:
        conn.close()
        return {"success": False, "error": "No pending prompt"}
    conn.execute("""
        UPDATE chat_keepalive_prompts SET responded = 1, response = ?, responded_at = ?
        WHERE id = ?
    """, ("keep_open" if keep_open else "close", now, row["id"]))
    conn.commit()
    conn.close()
    return {"success": True, "action": "keep_open" if keep_open else "close"}


def get_expired_keepalive_prompts(expire_minutes: int = 3) -> List[Dict]:
    """Get keep-alive prompts that were sent but not responded to within the time limit."""
    from datetime import timedelta
    cutoff = (datetime.now() - timedelta(minutes=expire_minutes)).isoformat()
    conn = _get_db()
    rows = conn.execute("""
        SELECT ckp.id, ckp.conversation_id, ckp.agent_id, ckp.prompted_at,
               sc.user_id
        FROM chat_keepalive_prompts ckp
        JOIN support_conversations sc ON sc.id = ckp.conversation_id
        WHERE ckp.responded = 0 AND ckp.prompted_at < ? AND sc.status = 'active'
    """, (cutoff,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_pending_keepalive_for_agent(agent_id: int) -> List[Dict]:
    """Get all pending keep-alive prompts for a specific agent."""
    conn = _get_db()
    rows = conn.execute("""
        SELECT ckp.id, ckp.conversation_id, ckp.prompted_at,
               sc.user_id, sc.assigned_agent_name
        FROM chat_keepalive_prompts ckp
        JOIN support_conversations sc ON sc.id = ckp.conversation_id
        WHERE ckp.agent_id = ? AND ckp.responded = 0 AND sc.status = 'active'
        ORDER BY ckp.prompted_at DESC
    """, (agent_id,)).fetchall()
    conn.close()

    import user_auth
    result = []
    for r in rows:
        d = dict(r)
        profile = user_auth.get_user_profile(d["user_id"])
        d["display_name"] = profile["display_name"] if profile else f"User {d['user_id']}"
        d["username"] = profile["username"] if profile else ""
        result.append(d)
    return result
