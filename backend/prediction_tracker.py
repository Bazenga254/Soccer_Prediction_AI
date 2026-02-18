"""
Prediction Track Record System
Stores predictions in SQLite and checks results against actual outcomes.
"""

import sqlite3
import json
from datetime import datetime
from typing import Optional, Dict, List


DB_PATH = "predictions.db"


def init_predictions_db():
    """Initialize the predictions database."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fixture_id TEXT NOT NULL,
            team_a_name TEXT NOT NULL,
            team_b_name TEXT NOT NULL,
            team_a_id INTEGER NOT NULL,
            team_b_id INTEGER NOT NULL,
            competition TEXT DEFAULT 'PL',
            predicted_result TEXT,
            predicted_result_prob REAL,
            predicted_over25 TEXT,
            predicted_over25_prob REAL,
            predicted_btts TEXT,
            predicted_btts_prob REAL,
            best_value_bet TEXT,
            best_value_prob REAL,
            best_value_score REAL,
            all_predictions TEXT,
            actual_home_goals INTEGER,
            actual_away_goals INTEGER,
            actual_result TEXT,
            match_finished INTEGER DEFAULT 0,
            result_correct INTEGER,
            over25_correct INTEGER,
            btts_correct INTEGER,
            created_at TEXT NOT NULL,
            checked_at TEXT
        )
    """)
    # Add match_date column if missing (migration)
    try:
        c.execute("ALTER TABLE predictions ADD COLUMN match_date TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    # Add odds column if missing (migration)
    try:
        c.execute("ALTER TABLE predictions ADD COLUMN odds REAL")
    except sqlite3.OperationalError:
        pass  # Column already exists
    conn.commit()
    conn.close()
    print("[OK] Prediction tracker initialized")


def store_prediction(
    team_a_id: int,
    team_b_id: int,
    team_a_name: str,
    team_b_name: str,
    competition: str,
    outcome: Dict,
    top_predictions: List[Dict],
    odds: float = None,
) -> Dict:
    """Store a prediction when /api/predict is called."""
    fixture_id = f"{team_a_id}-{team_b_id}-{datetime.now().strftime('%Y%m%d')}"

    # Determine predicted result (highest probability)
    team_a_win = outcome.get("team_a_win", 0)
    draw = outcome.get("draw", 0)
    team_b_win = outcome.get("team_b_win", 0)

    if team_a_win >= draw and team_a_win >= team_b_win:
        predicted_result = "Home Win"
        result_prob = team_a_win
    elif team_b_win >= draw:
        predicted_result = "Away Win"
        result_prob = team_b_win
    else:
        predicted_result = "Draw"
        result_prob = draw

    # Extract best value bet from top_predictions
    best_value = top_predictions[0] if top_predictions else {}

    # Find over 2.5 and BTTS predictions
    over25 = None
    over25_prob = None
    btts = None
    btts_prob = None
    for pred in top_predictions:
        if 'Over 2.5' in pred.get('bet', '') and not over25:
            over25 = 'Over'
            over25_prob = pred.get('probability', 0)
        elif 'Under' in pred.get('bet', '') and '2.5' in pred.get('bet', '') and not over25:
            over25 = 'Under'
            over25_prob = pred.get('probability', 0)
        elif 'Both Teams to Score - Yes' in pred.get('bet', '') and not btts:
            btts = 'Yes'
            btts_prob = pred.get('probability', 0)
        elif 'Both Teams to Score - No' in pred.get('bet', '') and not btts:
            btts = 'No'
            btts_prob = pred.get('probability', 0)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Check if prediction already exists for this fixture today
    c.execute("SELECT id FROM predictions WHERE fixture_id = ?", (fixture_id,))
    existing = c.fetchone()

    if existing:
        # Update existing prediction
        c.execute("""
            UPDATE predictions SET
                predicted_result = ?, predicted_result_prob = ?,
                predicted_over25 = ?, predicted_over25_prob = ?,
                predicted_btts = ?, predicted_btts_prob = ?,
                best_value_bet = ?, best_value_prob = ?, best_value_score = ?,
                all_predictions = ?, odds = ?
            WHERE fixture_id = ?
        """, (
            predicted_result, result_prob,
            over25, over25_prob,
            btts, btts_prob,
            best_value.get('bet'), best_value.get('probability'), best_value.get('valueScore'),
            json.dumps(top_predictions[:10]),
            odds,
            fixture_id,
        ))
    else:
        c.execute("""
            INSERT INTO predictions (
                fixture_id, team_a_name, team_b_name, team_a_id, team_b_id,
                competition, predicted_result, predicted_result_prob,
                predicted_over25, predicted_over25_prob,
                predicted_btts, predicted_btts_prob,
                best_value_bet, best_value_prob, best_value_score,
                all_predictions, odds, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            fixture_id, team_a_name, team_b_name, team_a_id, team_b_id,
            competition, predicted_result, result_prob,
            over25, over25_prob,
            btts, btts_prob,
            best_value.get('bet'), best_value.get('probability'), best_value.get('valueScore'),
            json.dumps(top_predictions[:10]),
            odds,
            datetime.now().isoformat(),
        ))

    conn.commit()
    conn.close()

    return {
        "fixture_id": fixture_id,
        "predicted_result": predicted_result,
        "stored": True,
    }


def update_result(fixture_id: str, home_goals: int, away_goals: int) -> Dict:
    """Update a prediction with actual match results."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute("SELECT * FROM predictions WHERE fixture_id = ?", (fixture_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return {"error": "Prediction not found"}

    # Determine actual result
    if home_goals > away_goals:
        actual_result = "Home Win"
    elif away_goals > home_goals:
        actual_result = "Away Win"
    else:
        actual_result = "Draw"

    total_goals = home_goals + away_goals
    btts_actual = home_goals > 0 and away_goals > 0

    # Get column indices
    cols = [d[0] for d in c.description]
    pred = dict(zip(cols, row))

    # Check correctness
    result_correct = 1 if pred["predicted_result"] == actual_result else 0
    over25_correct = None
    if pred["predicted_over25"]:
        if pred["predicted_over25"] == "Over":
            over25_correct = 1 if total_goals > 2.5 else 0
        else:
            over25_correct = 1 if total_goals < 2.5 else 0
    btts_correct = None
    if pred["predicted_btts"]:
        if pred["predicted_btts"] == "Yes":
            btts_correct = 1 if btts_actual else 0
        else:
            btts_correct = 1 if not btts_actual else 0

    c.execute("""
        UPDATE predictions SET
            actual_home_goals = ?, actual_away_goals = ?,
            actual_result = ?, match_finished = 1,
            result_correct = ?, over25_correct = ?, btts_correct = ?,
            checked_at = ?
        WHERE fixture_id = ?
    """, (
        home_goals, away_goals, actual_result,
        result_correct, over25_correct, btts_correct,
        datetime.now().isoformat(),
        fixture_id,
    ))

    conn.commit()
    conn.close()

    return {
        "fixture_id": fixture_id,
        "actual_result": actual_result,
        "result_correct": bool(result_correct),
        "over25_correct": bool(over25_correct) if over25_correct is not None else None,
        "btts_correct": bool(btts_correct) if btts_correct is not None else None,
    }


def clear_all_predictions() -> Dict:
    """Delete all stored predictions."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM predictions")
    count = c.fetchone()[0]
    c.execute("DELETE FROM predictions")
    conn.commit()
    conn.close()
    return {"deleted": count}


def get_all_predictions(limit: int = 50) -> List[Dict]:
    """Get all stored predictions."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM predictions ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = c.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_unfinished_prediction_info() -> Dict:
    """Get info about unfinished predictions for the background checker."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT fixture_id, team_a_id, team_b_id, created_at
        FROM predictions WHERE match_finished = 0
    """)
    rows = c.fetchall()
    conn.close()

    dates = set()
    team_keys = set()
    for r in rows:
        # fixture_id format: {team_a_id}-{team_b_id}-{YYYYMMDD}
        parts = r["fixture_id"].rsplit("-", 1)
        if len(parts) == 2:
            dates.add(parts[1])
        team_keys.add(f"{r['team_a_id']}-{r['team_b_id']}")

    return {"dates": sorted(dates), "team_keys": team_keys}


def check_and_update_from_fixtures(finished_fixtures: list) -> Dict:
    """Auto-resolve predictions from finished fixture data (from API-Football)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT * FROM predictions WHERE match_finished = 0")
    unfinished = c.fetchall()
    if not unfinished:
        conn.close()
        return {"updated": 0, "correct": 0, "incorrect": 0}

    # Build lookup: "home_id-away_id" -> fixture data
    fixture_map = {}
    for f in finished_fixtures:
        home_id = f.get("home_team", {}).get("id")
        away_id = f.get("away_team", {}).get("id")
        if home_id and away_id:
            key = f"{home_id}-{away_id}"
            fixture_map[key] = f

    updated = 0
    correct = 0
    incorrect = 0

    for pred in unfinished:
        team_key = f"{pred['team_a_id']}-{pred['team_b_id']}"
        fixture = fixture_map.get(team_key)
        if not fixture:
            continue

        goals = fixture.get("goals", {})
        home_goals = goals.get("home")
        away_goals = goals.get("away")
        if home_goals is None or away_goals is None:
            continue

        # Extract match date from fixture
        match_date = fixture.get("date")

        # Determine actual result
        if home_goals > away_goals:
            actual_result = "Home Win"
        elif away_goals > home_goals:
            actual_result = "Away Win"
        else:
            actual_result = "Draw"

        total_goals = home_goals + away_goals
        btts_actual = home_goals > 0 and away_goals > 0

        # Check correctness
        result_correct = 1 if pred["predicted_result"] == actual_result else 0
        over25_correct = None
        if pred["predicted_over25"]:
            if pred["predicted_over25"] == "Over":
                over25_correct = 1 if total_goals > 2.5 else 0
            else:
                over25_correct = 1 if total_goals < 2.5 else 0
        btts_correct = None
        if pred["predicted_btts"]:
            if pred["predicted_btts"] == "Yes":
                btts_correct = 1 if btts_actual else 0
            else:
                btts_correct = 1 if not btts_actual else 0

        c.execute("""
            UPDATE predictions SET
                actual_home_goals = ?, actual_away_goals = ?,
                actual_result = ?, match_finished = 1,
                result_correct = ?, over25_correct = ?, btts_correct = ?,
                checked_at = ?, match_date = ?
            WHERE id = ?
        """, (
            home_goals, away_goals, actual_result,
            result_correct, over25_correct, btts_correct,
            datetime.now().isoformat(), match_date,
            pred["id"],
        ))

        updated += 1
        if result_correct:
            correct += 1
        else:
            incorrect += 1

    conn.commit()
    conn.close()
    return {"updated": updated, "correct": correct, "incorrect": incorrect}


def update_match_dates(all_fixtures: list) -> int:
    """Update match_date for predictions that don't have one yet, using any fixture (finished or not)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT id, team_a_id, team_b_id FROM predictions WHERE match_date IS NULL")
    missing = c.fetchall()
    if not missing:
        conn.close()
        return 0

    fixture_map = {}
    for f in all_fixtures:
        home_id = f.get("home_team", {}).get("id")
        away_id = f.get("away_team", {}).get("id")
        if home_id and away_id:
            fixture_map[f"{home_id}-{away_id}"] = f.get("date")

    count = 0
    for pred in missing:
        team_key = f"{pred['team_a_id']}-{pred['team_b_id']}"
        match_date = fixture_map.get(team_key)
        if match_date:
            c.execute("UPDATE predictions SET match_date = ? WHERE id = ?", (match_date, pred["id"]))
            count += 1

    conn.commit()
    conn.close()
    return count


def get_accuracy_stats() -> Dict:
    """Calculate overall prediction accuracy."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Total predictions
    c.execute("SELECT COUNT(*) FROM predictions")
    total = c.fetchone()[0]

    # Finished matches
    c.execute("SELECT COUNT(*) FROM predictions WHERE match_finished = 1")
    finished = c.fetchone()[0]

    # Result accuracy
    c.execute("SELECT COUNT(*) FROM predictions WHERE match_finished = 1 AND result_correct = 1")
    result_correct = c.fetchone()[0]

    # Over 2.5 accuracy
    c.execute("SELECT COUNT(*) FROM predictions WHERE match_finished = 1 AND over25_correct IS NOT NULL")
    over25_total = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM predictions WHERE match_finished = 1 AND over25_correct = 1")
    over25_correct = c.fetchone()[0]

    # BTTS accuracy
    c.execute("SELECT COUNT(*) FROM predictions WHERE match_finished = 1 AND btts_correct IS NOT NULL")
    btts_total = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM predictions WHERE match_finished = 1 AND btts_correct = 1")
    btts_correct = c.fetchone()[0]

    conn.close()

    return {
        "total_predictions": total,
        "matches_finished": finished,
        "pending": total - finished,
        "result_accuracy": {
            "correct": result_correct,
            "total": finished,
            "percentage": round((result_correct / finished) * 100, 1) if finished > 0 else 0,
        },
        "over25_accuracy": {
            "correct": over25_correct,
            "total": over25_total,
            "percentage": round((over25_correct / over25_total) * 100, 1) if over25_total > 0 else 0,
        },
        "btts_accuracy": {
            "correct": btts_correct,
            "total": btts_total,
            "percentage": round((btts_correct / btts_total) * 100, 1) if btts_total > 0 else 0,
        },
    }
