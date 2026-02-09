"""
Community Predictions System for Spark AI Prediction
Handles public/private prediction sharing, ratings, and comments.
"""

import sqlite3
import json
from datetime import datetime
from typing import Optional, Dict, List

DB_PATH = "community.db"


def _get_db():
    conn = sqlite3.connect(DB_PATH)
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
    """)
    conn.commit()
    conn.close()


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
) -> Dict:
    """Share a prediction to the community."""
    if visibility not in ("public", "private"):
        return {"success": False, "error": "Visibility must be 'public' or 'private'"}

    conn = _get_db()
    now = datetime.now().isoformat()

    conn.execute("""
        INSERT INTO community_predictions (
            user_id, username, display_name, avatar_color,
            fixture_id, team_a_name, team_b_name, competition,
            predicted_result, predicted_result_prob,
            predicted_over25, predicted_btts,
            best_value_bet, best_value_prob,
            analysis_summary, visibility, is_paid, price_usd, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, username, display_name, avatar_color,
        fixture_id, team_a_name, team_b_name, competition,
        predicted_result, predicted_result_prob,
        predicted_over25, predicted_btts,
        best_value_bet, best_value_prob,
        analysis_summary, visibility, 1 if is_paid else 0, price_usd, now,
    ))
    conn.commit()
    pred_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()

    return {"success": True, "prediction_id": pred_id}


def get_public_predictions(page: int = 1, per_page: int = 20) -> Dict:
    """Get public community predictions (paginated)."""
    conn = _get_db()
    offset = (page - 1) * per_page

    total = conn.execute(
        "SELECT COUNT(*) as c FROM community_predictions WHERE visibility = 'public'"
    ).fetchone()["c"]

    rows = conn.execute("""
        SELECT cp.*,
            COALESCE(AVG(pr.rating), 0) as avg_rating,
            COUNT(DISTINCT pr.id) as rating_count,
            COUNT(DISTINCT pc.id) as comment_count
        FROM community_predictions cp
        LEFT JOIN prediction_ratings pr ON pr.prediction_id = cp.id
        LEFT JOIN prediction_comments pc ON pc.prediction_id = cp.id
        WHERE cp.visibility = 'public'
        GROUP BY cp.id
        ORDER BY cp.created_at DESC
        LIMIT ? OFFSET ?
    """, (per_page, offset)).fetchall()

    conn.close()

    predictions = []
    for r in rows:
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
            "predicted_result": r["predicted_result"],
            "predicted_result_prob": r["predicted_result_prob"],
            "predicted_over25": r["predicted_over25"],
            "predicted_btts": r["predicted_btts"],
            "best_value_bet": r["best_value_bet"],
            "best_value_prob": r["best_value_prob"],
            "analysis_summary": r["analysis_summary"],
            "is_paid": bool(r["is_paid"]),
            "price_usd": r["price_usd"],
            "match_finished": bool(r["match_finished"]),
            "result_correct": r["result_correct"],
            "avg_rating": round(r["avg_rating"], 1),
            "rating_count": r["rating_count"],
            "comment_count": r["comment_count"],
            "created_at": r["created_at"],
        })

    return {
        "predictions": predictions,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


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


def rate_prediction(prediction_id: int, user_id: int, rating: int) -> Dict:
    """Rate a community prediction (1-5 stars)."""
    if rating < 1 or rating > 5:
        return {"success": False, "error": "Rating must be 1-5"}

    conn = _get_db()

    # Check prediction exists and is public
    pred = conn.execute(
        "SELECT user_id, visibility FROM community_predictions WHERE id = ?", (prediction_id,)
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

    # Check prediction exists
    pred = conn.execute(
        "SELECT id FROM community_predictions WHERE id = ?", (prediction_id,)
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

    # Credit seller wallet (70% to creator, 30% platform fee)
    creator_share = round(price * 0.70, 2)
    conn.execute("""
        INSERT INTO creator_wallets (user_id, balance_usd, total_earned_usd, total_sales, updated_at)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            balance_usd = balance_usd + ?,
            total_earned_usd = total_earned_usd + ?,
            total_sales = total_sales + 1,
            updated_at = ?
    """, (seller_id, creator_share, creator_share, now, creator_share, creator_share, now))

    conn.commit()
    conn.close()

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

    # User's paid predictions with purchase counts
    preds = conn.execute("""
        SELECT cp.*,
            (SELECT COUNT(*) FROM prediction_purchases pp WHERE pp.prediction_id = cp.id) as purchase_count,
            (SELECT COALESCE(SUM(pp.price_amount), 0) FROM prediction_purchases pp WHERE pp.prediction_id = cp.id) as total_revenue
        FROM community_predictions cp
        WHERE cp.user_id = ? AND cp.is_paid = 1
        ORDER BY cp.created_at DESC
    """, (user_id,)).fetchall()

    paid_predictions = [{
        "id": r["id"],
        "team_a_name": r["team_a_name"],
        "team_b_name": r["team_b_name"],
        "competition": r["competition"],
        "predicted_result": r["predicted_result"],
        "price_usd": r["price_usd"],
        "purchase_count": r["purchase_count"],
        "total_revenue": round(r["total_revenue"], 2),
        "match_finished": bool(r["match_finished"]),
        "result_correct": r["result_correct"],
        "created_at": r["created_at"],
    } for r in preds]

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

    return {
        "wallet": wallet_data,
        "paid_predictions": paid_predictions,
        "recent_sales": recent_sales,
    }


def get_paid_predictions_feed(page: int = 1, per_page: int = 20, viewer_id: int = None) -> Dict:
    """Get public paid predictions feed with purchase status for viewer."""
    conn = _get_db()
    offset = (page - 1) * per_page

    total = conn.execute(
        "SELECT COUNT(*) as c FROM community_predictions WHERE visibility = 'public' AND is_paid = 1"
    ).fetchone()["c"]

    rows = conn.execute("""
        SELECT cp.*,
            COALESCE(AVG(pr.rating), 0) as avg_rating,
            COUNT(DISTINCT pr.id) as rating_count,
            (SELECT COUNT(*) FROM prediction_purchases pp WHERE pp.prediction_id = cp.id) as purchase_count
        FROM community_predictions cp
        LEFT JOIN prediction_ratings pr ON pr.prediction_id = cp.id
        WHERE cp.visibility = 'public' AND cp.is_paid = 1
        GROUP BY cp.id
        ORDER BY cp.created_at DESC
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

    conn.close()

    predictions = []
    for r in rows:
        is_owner = viewer_id and r["user_id"] == viewer_id
        is_purchased = r["id"] in purchased_ids
        unlocked = is_owner or is_purchased

        pred = {
            "id": r["id"],
            "user_id": r["user_id"],
            "username": r["username"],
            "display_name": r["display_name"],
            "avatar_color": r["avatar_color"],
            "team_a_name": r["team_a_name"],
            "team_b_name": r["team_b_name"],
            "competition": r["competition"],
            "is_paid": True,
            "price_usd": r["price_usd"],
            "purchase_count": r["purchase_count"],
            "unlocked": unlocked,
            "avg_rating": round(r["avg_rating"], 1),
            "rating_count": r["rating_count"],
            "created_at": r["created_at"],
            "match_finished": bool(r["match_finished"]),
            "result_correct": r["result_correct"],
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

    return {
        "predictions": predictions,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }
