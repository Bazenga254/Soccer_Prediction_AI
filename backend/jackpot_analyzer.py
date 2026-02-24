"""
Jackpot Analyzer Module for Spark AI

Allows users to select multiple matches (up to 30) from different leagues
and get AI-powered analysis focused on 1X2 and Double Chance outcomes.
Uses API-Football data with Gemini AI fallback for supplementary insights.
"""

import sqlite3
import json
import uuid
import os
from datetime import datetime
from typing import List, Dict, Optional

from datetime import timedelta
import config
from prediction import predict_match_outcome, calculate_h2h_advantage
from database import get_teams, get_h2h_matches
import football_api

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "jackpot.db")


def init_db():
    """Initialize the jackpot sessions database."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS jackpot_sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER,
            matches TEXT NOT NULL,
            results TEXT,
            status TEXT DEFAULT 'pending',
            total_matches INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            best_combination TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS ai_chat_usage (
            user_id INTEGER PRIMARY KEY,
            chat_count INTEGER DEFAULT 0
        )
    """)
    # Migration: add daily tracking and bonus prompt columns
    for col, typedef in [
        ("daily_count", "INTEGER DEFAULT 0"),
        ("last_reset_date", "TEXT DEFAULT ''"),
        ("bonus_prompts", "INTEGER DEFAULT 0"),
    ]:
        try:
            c.execute(f"ALTER TABLE ai_chat_usage ADD COLUMN {col} {typedef}")
        except sqlite3.OperationalError:
            pass  # Column already exists
    c.execute("""
        CREATE TABLE IF NOT EXISTS jackpot_session_locks (
            user_id INTEGER PRIMARY KEY,
            locked_until TEXT NOT NULL,
            sessions_in_window INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    conn.close()
    print("[OK] Jackpot analyzer initialized")


def create_session(user_id: int, matches: List[dict]) -> str:
    """Create a new jackpot session and return session ID."""
    session_id = str(uuid.uuid4())[:12]
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO jackpot_sessions (id, user_id, matches, status, total_matches, created_at)
        VALUES (?, ?, ?, 'analyzing', ?, ?)
    """, (session_id, user_id, json.dumps(matches), len(matches), datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()
    return session_id


def complete_session(session_id: str, results: List[dict], combinations: dict):
    """Mark a session as completed with results."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        UPDATE jackpot_sessions
        SET status = 'completed', results = ?, completed_at = ?, best_combination = ?
        WHERE id = ?
    """, (json.dumps(results), datetime.utcnow().isoformat(), json.dumps(combinations), session_id))
    conn.commit()
    conn.close()


def fail_session(session_id: str):
    """Mark a session as failed."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE jackpot_sessions SET status = 'failed' WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()


def get_session(session_id: str) -> Optional[dict]:
    """Get a jackpot session by ID."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM jackpot_sessions WHERE id = ?", (session_id,))
    row = c.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def count_user_sessions(user_id: int) -> int:
    """Count completed jackpot sessions for a user (total, all time)."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM jackpot_sessions WHERE user_id = ? AND status = 'completed'", (user_id,))
    count = c.fetchone()[0]
    conn.close()
    return count


def get_jackpot_lock_status(user_id: int, tier: str = "free") -> dict:
    """Check if user is locked out of jackpot analysis. Returns lock info.

    Limits:
      - Free: 2 initial sessions, then 1 per 72h
      - Pro/Trial: 3 sessions per 24h (resets 24h after last session)
    """
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    now = datetime.utcnow()

    if tier in ("pro", "trial"):
        # Pro/Trial: 3 sessions per rolling 24h window
        cutoff = (now - timedelta(hours=24)).isoformat()
        c.execute(
            "SELECT COUNT(*) FROM jackpot_sessions WHERE user_id = ? AND status = 'completed' AND completed_at > ?",
            (user_id, cutoff)
        )
        recent = c.fetchone()[0]

        if recent >= 3:
            # Find the oldest session in the window to calculate when it expires
            c.execute(
                "SELECT completed_at FROM jackpot_sessions WHERE user_id = ? AND status = 'completed' AND completed_at > ? ORDER BY completed_at ASC LIMIT 1",
                (user_id, cutoff)
            )
            oldest = c.fetchone()
            locked_until_dt = datetime.fromisoformat(oldest[0]) + timedelta(hours=24) if oldest else None
            conn.close()
            return {
                "locked": True,
                "locked_until": locked_until_dt.isoformat() if locked_until_dt else None,
                "sessions_used": recent,
                "max_sessions": 3,
            }
        conn.close()
        return {
            "locked": False,
            "locked_until": None,
            "sessions_used": recent,
            "max_sessions": 3,
        }

    # Free tier logic (unchanged)
    # Check if there's an active lock
    c.execute("SELECT locked_until, sessions_in_window FROM jackpot_session_locks WHERE user_id = ?", (user_id,))
    lock_row = c.fetchone()

    if lock_row:
        locked_until = datetime.fromisoformat(lock_row[0])
        if now < locked_until:
            conn.close()
            return {
                "locked": True,
                "locked_until": lock_row[0],
                "sessions_used": lock_row[1],
                "max_sessions": 2 if lock_row[1] >= 2 else 1,
            }
        else:
            c.execute("DELETE FROM jackpot_session_locks WHERE user_id = ?", (user_id,))
            conn.commit()

    total_sessions = count_user_sessions(user_id)
    if total_sessions < 2:
        conn.close()
        return {
            "locked": False,
            "locked_until": None,
            "sessions_used": total_sessions,
            "max_sessions": 2,
        }
    else:
        cutoff = (now - timedelta(hours=72)).isoformat()
        c.execute(
            "SELECT COUNT(*) FROM jackpot_sessions WHERE user_id = ? AND status = 'completed' AND completed_at > ?",
            (user_id, cutoff)
        )
        recent = c.fetchone()[0]
        conn.close()
        return {
            "locked": recent >= 1,
            "locked_until": None,
            "sessions_used": recent,
            "max_sessions": 1,
        }


def record_jackpot_session_lock(user_id: int, tier: str = "free"):
    """Called after a user completes a jackpot session.

    Pro/Trial: No lock row needed - uses rolling 24h window from jackpot_sessions table.
    Free: Sets 72h lock after reaching session limit.
    """
    if tier in ("pro", "trial"):
        # Pro users use rolling window from jackpot_sessions - no lock row needed
        return

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    now = datetime.utcnow()
    total_sessions = count_user_sessions(user_id)
    locked_until = (now + timedelta(hours=72)).isoformat()

    if total_sessions <= 2:
        if total_sessions == 2:
            c.execute("""
                INSERT INTO jackpot_session_locks (user_id, locked_until, sessions_in_window)
                VALUES (?, ?, 2)
                ON CONFLICT(user_id) DO UPDATE SET locked_until = ?, sessions_in_window = 2
            """, (user_id, locked_until, locked_until))
    else:
        c.execute("""
            INSERT INTO jackpot_session_locks (user_id, locked_until, sessions_in_window)
            VALUES (?, ?, 1)
            ON CONFLICT(user_id) DO UPDATE SET locked_until = ?, sessions_in_window = 1
        """, (user_id, locked_until, locked_until))

    conn.commit()
    conn.close()


def get_ai_chat_count(user_id: int) -> int:
    """Get the total AI chat prompts used by a user."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT chat_count FROM ai_chat_usage WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    return row[0] if row else 0


def increment_ai_chat_count(user_id: int) -> int:
    """Increment AI chat count for a user. Returns new count."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO ai_chat_usage (user_id, chat_count) VALUES (?, 1)
        ON CONFLICT(user_id) DO UPDATE SET chat_count = chat_count + 1
    """, (user_id,))
    conn.commit()
    c.execute("SELECT chat_count FROM ai_chat_usage WHERE user_id = ?", (user_id,))
    count = c.fetchone()[0]
    conn.close()
    return count


def get_daily_chat_count(user_id: int) -> dict:
    """Get daily AI chat count for pro/trial users. Resets if new day."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")

    c.execute("SELECT daily_count, last_reset_date, bonus_prompts FROM ai_chat_usage WHERE user_id = ?", (user_id,))
    row = c.fetchone()

    if not row:
        c.execute("""
            INSERT INTO ai_chat_usage (user_id, chat_count, daily_count, last_reset_date, bonus_prompts)
            VALUES (?, 0, 0, ?, 0)
        """, (user_id, today))
        conn.commit()
        conn.close()
        return {"daily_count": 0, "bonus_prompts": 0}

    daily_count, last_reset_date, bonus_prompts = row
    bonus_prompts = bonus_prompts or 0

    if last_reset_date != today:
        c.execute("UPDATE ai_chat_usage SET daily_count = 0, last_reset_date = ? WHERE user_id = ?", (today, user_id))
        conn.commit()
        conn.close()
        return {"daily_count": 0, "bonus_prompts": bonus_prompts}

    conn.close()
    return {"daily_count": daily_count or 0, "bonus_prompts": bonus_prompts}


def increment_daily_chat_count(user_id: int) -> int:
    """Increment daily chat count for pro/trial users. Returns new daily count."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")
    c.execute("""
        INSERT INTO ai_chat_usage (user_id, chat_count, daily_count, last_reset_date, bonus_prompts)
        VALUES (?, 1, 1, ?, 0)
        ON CONFLICT(user_id) DO UPDATE SET
            daily_count = CASE WHEN last_reset_date != ? THEN 1 ELSE daily_count + 1 END,
            last_reset_date = ?
    """, (user_id, today, today, today))
    conn.commit()
    c.execute("SELECT daily_count FROM ai_chat_usage WHERE user_id = ?", (user_id,))
    count = c.fetchone()[0]
    conn.close()
    return count


def add_bonus_prompts(user_id: int, count: int) -> int:
    """Add bonus chat prompts from top-up purchase. Returns new bonus total."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")
    c.execute("""
        INSERT INTO ai_chat_usage (user_id, chat_count, daily_count, last_reset_date, bonus_prompts)
        VALUES (?, 0, 0, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET bonus_prompts = bonus_prompts + ?
    """, (user_id, today, count, count))
    conn.commit()
    c.execute("SELECT bonus_prompts FROM ai_chat_usage WHERE user_id = ?", (user_id,))
    result = c.fetchone()[0]
    conn.close()
    return result


def consume_bonus_prompt(user_id: int) -> bool:
    """Consume one bonus prompt. Returns True if consumed, False if none available."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT bonus_prompts FROM ai_chat_usage WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    if not row or (row[0] or 0) <= 0:
        conn.close()
        return False
    c.execute("UPDATE ai_chat_usage SET bonus_prompts = bonus_prompts - 1 WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return True


def get_user_sessions(user_id: int, limit: int = 20) -> List[dict]:
    """Get recent jackpot sessions for a user with match summaries."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("""
        SELECT id, status, total_matches, created_at, completed_at, matches, results, best_combination
        FROM jackpot_sessions
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
    """, (user_id, limit))
    rows = c.fetchall()
    conn.close()

    sessions = []
    for r in rows:
        session = dict(r)
        # Build match summaries from stored matches
        match_summaries = []
        try:
            matches = json.loads(session.get("matches") or "[]")
            for m in matches:
                home = m.get("home_team_name", "?")
                away = m.get("away_team_name", "?")
                match_summaries.append(f"{home} vs {away}")
        except Exception:
            pass
        session["match_summaries"] = match_summaries
        # Parse JSON fields
        session["results"] = json.loads(session["results"]) if session.get("results") else []
        session["best_combination"] = json.loads(session["best_combination"]) if session.get("best_combination") else None
        del session["matches"]  # Don't send raw matches JSON
        sessions.append(session)
    return sessions


def _make_fallback_team(team_id: int, name: str) -> dict:
    """Create a basic team object with neutral stats."""
    return {
        "id": team_id,
        "name": name,
        "short_name": name[:3].upper(),
        "crest": None,
        "position": 10,
        "points": 0,
        "played": 10,
        "wins": 3, "draws": 4, "losses": 3,
        "goals_scored": 12, "goals_conceded": 12,
        "goal_difference": 0,
        "form": "WDLWD",
        "recent_w": 2, "recent_d": 2, "recent_l": 1,
        "recent_gf": 6, "recent_ga": 5,
        "home_wins": 2, "home_draws": 2, "home_losses": 1,
        "home_goals_for": 7, "home_goals_against": 5,
        "away_wins": 1, "away_draws": 2, "away_losses": 2,
        "away_goals_for": 5, "away_goals_against": 7,
    }


def _compute_goals_analysis(h2h_matches: list, home_id: int, away_id: int) -> dict:
    """Compute detailed goals analysis from H2H matches."""
    completed = [m for m in h2h_matches if m.get("home_score") is not None and m.get("away_score") is not None]
    if not completed:
        return None

    total = len(completed)
    total_goals = 0
    team_a_goals = 0
    team_b_goals = 0
    over_05 = over_15 = over_25 = over_35 = 0
    btts_yes = 0

    for m in completed:
        h_id = m.get("home_team_id")
        hs = m.get("home_score", 0) or 0
        aws = m.get("away_score", 0) or 0
        mg = hs + aws
        total_goals += mg

        if h_id == home_id:
            team_a_goals += hs
            team_b_goals += aws
        else:
            team_a_goals += aws
            team_b_goals += hs

        if mg > 0.5: over_05 += 1
        if mg > 1.5: over_15 += 1
        if mg > 2.5: over_25 += 1
        if mg > 3.5: over_35 += 1
        if hs > 0 and aws > 0: btts_yes += 1

    avg = total_goals / total
    avg_a = team_a_goals / total
    avg_b = team_b_goals / total

    def pct(c):
        return round((c / total) * 100, 1)

    return {
        "avg_total_goals": round(avg, 2),
        "avg_home_goals": round(avg_a, 2),
        "avg_away_goals": round(avg_b, 2),
        "total_goals_scored": total_goals,
        "over_under": {
            "over_05": {"percentage": pct(over_05), "prediction": "Yes" if pct(over_05) >= 50 else "No"},
            "over_15": {"percentage": pct(over_15), "prediction": "Yes" if pct(over_15) >= 50 else "No"},
            "over_25": {"percentage": pct(over_25), "prediction": "Yes" if pct(over_25) >= 50 else "No"},
            "over_35": {"percentage": pct(over_35), "prediction": "Yes" if pct(over_35) >= 50 else "No"},
        },
        "btts": {
            "yes_percentage": pct(btts_yes),
            "no_percentage": pct(total - btts_yes),
            "prediction": "Yes" if pct(btts_yes) >= 50 else "No",
        },
        "scoring_prediction": {
            "likely_home_goals": round(avg_a),
            "likely_away_goals": round(avg_b),
            "predicted_score": f"{round(avg_a)}-{round(avg_b)}",
            "home_likely_to_score": avg_a >= 0.8,
            "away_likely_to_score": avg_b >= 0.8,
        },
    }


def _get_motivation_level(team: dict, total_teams: int = 20) -> dict:
    """Determine team motivation based on league position."""
    position = team.get("position", 10)
    if not position:
        return {"level": "Unknown", "note": "Position data unavailable"}

    if position == 1:
        return {"level": "Maximum", "note": "Title race - maximum motivation"}
    elif position <= 4:
        return {"level": "Very High", "note": "Champions League qualification fight"}
    elif position <= 6:
        return {"level": "High", "note": "Europa League spot in sight"}
    elif position <= int(total_teams * 0.6):
        return {"level": "Moderate", "note": "Mid-table, playing for position"}
    elif position <= int(total_teams * 0.85):
        return {"level": "High", "note": "Trying to pull away from relegation zone"}
    else:
        return {"level": "Desperate", "note": "Relegation battle - fighting for survival"}


def _analyze_injury_impact(injuries_home: list, injuries_away: list) -> dict:
    """Analyze which team is more affected by injuries."""
    home_count = len(injuries_home) if injuries_home else 0
    away_count = len(injuries_away) if injuries_away else 0

    if home_count == 0 and away_count == 0:
        return {"verdict": "Neither team has significant injury concerns", "advantage": "neutral"}
    elif home_count > away_count + 2:
        return {"verdict": f"Home team significantly affected ({home_count} vs {away_count} injuries)", "advantage": "away"}
    elif away_count > home_count + 2:
        return {"verdict": f"Away team significantly affected ({away_count} vs {home_count} injuries)", "advantage": "home"}
    elif home_count > away_count:
        return {"verdict": f"Home team slightly more affected ({home_count} vs {away_count} injuries)", "advantage": "slight_away"}
    elif away_count > home_count:
        return {"verdict": f"Away team slightly more affected ({away_count} vs {home_count} injuries)", "advantage": "slight_home"}
    else:
        return {"verdict": f"Both teams equally affected ({home_count} injuries each)", "advantage": "neutral"}


def _compute_scoring_by_half(avg_goals: float, avg_a: float, avg_b: float) -> dict:
    """Estimate first half / second half scoring patterns."""
    # Roughly 42% of goals in first half, 58% in second half
    fh_ratio = 0.42
    sh_ratio = 0.58
    return {
        "first_half": {
            "avg_goals": round(avg_goals * fh_ratio, 2),
            "home_likely_goals": round(avg_a * fh_ratio, 2),
            "away_likely_goals": round(avg_b * fh_ratio, 2),
            "over_05": round(min(90, 40 + avg_goals * fh_ratio * 30), 1),
            "over_15": round(min(70, 20 + avg_goals * fh_ratio * 25), 1),
        },
        "second_half": {
            "avg_goals": round(avg_goals * sh_ratio, 2),
            "home_likely_goals": round(avg_a * sh_ratio, 2),
            "away_likely_goals": round(avg_b * sh_ratio, 2),
            "over_05": round(min(92, 45 + avg_goals * sh_ratio * 28), 1),
            "over_15": round(min(75, 25 + avg_goals * sh_ratio * 22), 1),
        },
    }


async def analyze_match_for_jackpot(match: dict, league_cache: dict) -> dict:
    """
    Analyze a single match for jackpot prediction.
    Includes comprehensive data: 1X2, Double Chance, goals analysis,
    over/under, BTTS, scoring predictions, injuries impact, motivation, and more.
    """
    home_id = match["home_team_id"]
    away_id = match["away_team_id"]
    competition = match["competition"]
    league_id = config.LEAGUE_IDS.get(competition, 39)

    data_source = "api"

    # Step 1: Get team data from standings (usually cached)
    if competition not in league_cache:
        league_cache[competition] = await get_teams(competition)
    teams = league_cache[competition]

    team_a = next((t for t in teams if t["id"] == home_id), None)
    team_b = next((t for t in teams if t["id"] == away_id), None)

    if not team_a:
        team_a = _make_fallback_team(home_id, match["home_team_name"])
    if not team_b:
        team_b = _make_fallback_team(away_id, match["away_team_name"])

    # Step 2: Get H2H data
    h2h_matches = await get_h2h_matches(home_id, away_id)

    # Step 3: Run prediction algorithm
    prediction = predict_match_outcome(team_a, team_b, "team_a", h2h_matches)

    # Step 4: Get injuries and coach data
    injuries_home, injuries_away = [], []
    coach_home, coach_away = None, None
    formation_home, formation_away = None, None

    try:
        injuries_home, injuries_away, coach_home, coach_away, formation_home, formation_away = await _fetch_supplementary(
            home_id, away_id, league_id,
            home_name=match["home_team_name"],
            away_name=match["away_team_name"],
            competition=competition,
        )
    except Exception as e:
        print(f"[Jackpot] Supplementary data fetch failed: {e}")

    # Step 5: Calculate H2H analysis
    h2h_analysis = calculate_h2h_advantage(h2h_matches, home_id, away_id)

    # Step 6: Build 1X2 and Double Chance
    home_win = prediction["team_a_win"]
    draw = prediction["draw"]
    away_win = prediction["team_b_win"]

    dc_1x = round(min(99, home_win + draw), 1)
    dc_x2 = round(min(99, draw + away_win), 1)
    dc_12 = round(min(99, home_win + away_win), 1)

    # Determine recommended picks
    if home_win >= draw and home_win >= away_win:
        rec_1x2 = "1"
    elif away_win >= draw:
        rec_1x2 = "2"
    else:
        rec_1x2 = "X"

    dc_options = {"1X": dc_1x, "X2": dc_x2, "12": dc_12}
    rec_dc = max(dc_options, key=dc_options.get)

    # Step 7: Compute goals analysis from H2H data
    goals_analysis = _compute_goals_analysis(h2h_matches, home_id, away_id)

    # Step 8: Compute scoring by half
    scoring_by_half = None
    if goals_analysis:
        scoring_by_half = _compute_scoring_by_half(
            goals_analysis["avg_total_goals"],
            goals_analysis["avg_home_goals"],
            goals_analysis["avg_away_goals"],
        )

    # Step 9: Motivation from standings
    total_teams = len(teams) if teams else 20
    motivation_home = _get_motivation_level(team_a, total_teams)
    motivation_away = _get_motivation_level(team_b, total_teams)

    # Step 10: Injury impact analysis
    injury_impact = _analyze_injury_impact(injuries_home, injuries_away)

    # Step 11: Team standings context
    standings_context = {
        "home_position": team_a.get("position"),
        "away_position": team_b.get("position"),
        "home_points": team_a.get("points", 0),
        "away_points": team_b.get("points", 0),
        "home_played": team_a.get("played", 0),
        "away_played": team_b.get("played", 0),
        "home_gd": team_a.get("goal_difference", 0),
        "away_gd": team_b.get("goal_difference", 0),
        "home_record": f"{team_a.get('wins', 0)}W-{team_a.get('draws', 0)}D-{team_a.get('losses', 0)}L",
        "away_record": f"{team_b.get('wins', 0)}W-{team_b.get('draws', 0)}D-{team_b.get('losses', 0)}L",
    }

    # Step 12: Use Gemini for supplementary info if data is thin
    gemini_data = None
    if len(h2h_matches) < 3 or (not injuries_home and not injuries_away):
        gemini_data = await get_gemini_match_analysis(
            match["home_team_name"], match["away_team_name"], competition
        )
        if gemini_data:
            data_source = "mixed" if h2h_matches else "gemini"

    # Build result
    label_map = {"1": match["home_team_name"], "X": "Draw", "2": match["away_team_name"]}

    return {
        "fixture_id": match.get("fixture_id"),
        "home_team": {
            "id": home_id,
            "name": match["home_team_name"],
            "crest": match.get("home_team_crest")
        },
        "away_team": {
            "id": away_id,
            "name": match["away_team_name"],
            "crest": match.get("away_team_crest")
        },
        "competition": competition,
        "match_date": match.get("match_date"),
        "status": "completed",
        "predictions": {
            "1x2": {
                "home_win": home_win,
                "draw": draw,
                "away_win": away_win,
                "recommended": rec_1x2,
                "recommended_label": label_map[rec_1x2],
                "confidence": prediction["confidence"]
            },
            "double_chance": {
                "1X": dc_1x,
                "X2": dc_x2,
                "12": dc_12,
                "recommended": rec_dc
            }
        },
        "goals_analysis": goals_analysis,
        "scoring_by_half": scoring_by_half,
        "factors": {
            "h2h": {
                "total_matches": h2h_analysis["total"],
                "home_wins": h2h_analysis["a_wins"],
                "draws": h2h_analysis["draws"],
                "away_wins": h2h_analysis["b_wins"],
                "home_goals": h2h_analysis["a_goals"],
                "away_goals": h2h_analysis["b_goals"],
            },
            "form": {
                "home_form": team_a.get("form", ""),
                "away_form": team_b.get("form", ""),
                "home_form_score": prediction["analysis"]["form_a"],
                "away_form_score": prediction["analysis"]["form_b"],
            },
            "injuries": {
                "home": injuries_home[:5] if injuries_home else [],
                "away": injuries_away[:5] if injuries_away else [],
            },
            "injury_impact": injury_impact,
            "coaches": {
                "home": coach_home,
                "away": coach_away,
            },
            "motivation": {
                "home": motivation_home,
                "away": motivation_away,
            },
            "standings": standings_context,
            "ai_insights": {
                "motivation": gemini_data.get("motivation") if gemini_data else None,
                "player_strength": gemini_data.get("player_strength") if gemini_data else None,
                "new_signings": gemini_data.get("new_signings") if gemini_data else None,
                "coaching_impact": gemini_data.get("coaching_impact") if gemini_data else None,
            } if gemini_data else None,
        },
        "key_factors": prediction["key_factors"],
        "data_source": data_source,
    }


async def _fetch_supplementary(home_id: int, away_id: int, league_id: int,
                               home_name: str = "", away_name: str = "",
                               competition: str = ""):
    """Fetch injuries and coach data for both teams via OpenAI (with API-Football fallback)."""
    import gemini_football_data

    return await gemini_football_data.get_enhanced_team_data(
        home_name, away_name, competition, home_id, away_id, league_id
    )


# --- OpenAI GPT Integration ---

JACKPOT_GEMINI_PROMPT = """You are a football/soccer analyst. Analyze this upcoming match concisely.

Match: {home_team} vs {away_team}
Competition: {competition}

Provide a JSON response with EXACTLY these fields:
{{
    "motivation": "Brief analysis of each team's motivation (title race, relegation, nothing to play for, etc.)",
    "player_strength": "Key players to watch and their current form/availability",
    "new_signings": "Any significant recent transfers or loan players affecting the squad",
    "injury_notes": "Known injuries or suspensions",
    "coaching_impact": "How the manager's tactics affect this match",
    "predicted_outcome": "Your brief 1X2 prediction and reasoning"
}}

Each field should be 1-3 sentences maximum. Focus on current season facts.
Return ONLY valid JSON, no markdown."""


async def get_gemini_match_analysis(
    home_team: str, away_team: str, competition: str
) -> Optional[Dict]:
    """Get supplementary match analysis from OpenAI GPT-4o-mini."""
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return None

    from openai import OpenAI
    client = OpenAI(api_key=api_key)

    comp_name = config.COMPETITION_NAMES.get(competition, competition)
    prompt = JACKPOT_GEMINI_PROMPT.format(
        home_team=home_team,
        away_team=away_team,
        competition=comp_name
    )

    max_retries = 3
    retry_delays = [2, 5, 10]
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=1024,
            )
            text = response.choices[0].message.content.strip() if response.choices[0].message.content else ""

            # Strip markdown fences if present
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

            return json.loads(text)
        except Exception as e:
            error_str = str(e)
            if ("429" in error_str or "rate" in error_str.lower()) and attempt < max_retries - 1:
                import asyncio
                delay = retry_delays[attempt]
                print(f"[Jackpot] OpenAI rate limited, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(delay)
                continue
            print(f"[Jackpot] OpenAI analysis failed for {home_team} vs {away_team}: {e}")
            return None

    return None


# --- Winning Combinations ---

def generate_winning_combinations(results: List[Dict]) -> Dict:
    """Generate recommended jackpot combinations from analysis results."""
    completed = [r for r in results if r.get("status") == "completed"]
    if not completed:
        return {"safest": None, "balanced": None, "high_value": None}

    safest_picks = []
    balanced_picks = []
    value_picks = []

    for match in completed:
        preds = match.get("predictions", {})
        one_x_two = preds.get("1x2", {})
        dc = preds.get("double_chance", {})
        home_name = match["home_team"]["name"]
        away_name = match["away_team"]["name"]
        match_label = f"{home_name} vs {away_name}"

        home_win = one_x_two.get("home_win", 33)
        draw = one_x_two.get("draw", 33)
        away_win = one_x_two.get("away_win", 33)

        # Safest: highest double chance probability
        dc_sorted = sorted(
            [("1X", dc.get("1X", 0)), ("X2", dc.get("X2", 0)), ("12", dc.get("12", 0))],
            key=lambda x: x[1], reverse=True
        )
        safest_picks.append({
            "match": match_label,
            "pick": dc_sorted[0][0],
            "market": "Double Chance",
            "probability": dc_sorted[0][1],
        })

        # Balanced: AI-recommended 1X2
        recommended = one_x_two.get("recommended", "1")
        prob_map = {"1": home_win, "X": draw, "2": away_win}
        label_map = {"1": home_name, "X": "Draw", "2": away_name}
        balanced_picks.append({
            "match": match_label,
            "pick": label_map.get(recommended, recommended),
            "market": "1X2",
            "probability": prob_map.get(recommended, 33),
        })

        # High value: most decisive prediction (biggest gap from 33.3%)
        deviations = [
            ("1", home_win, abs(home_win - 33.3)),
            ("X", draw, abs(draw - 33.3)),
            ("2", away_win, abs(away_win - 33.3))
        ]
        best_value = max(deviations, key=lambda x: x[2])
        value_picks.append({
            "match": match_label,
            "pick": label_map.get(best_value[0], best_value[0]),
            "market": "1X2",
            "probability": best_value[1],
        })

    def calc_combined(picks):
        prob = 1.0
        for p in picks:
            prob *= p["probability"] / 100
        return round(prob * 100, 4)

    return {
        "safest": {
            "name": "Safest Combination",
            "description": "Double Chance picks for maximum safety",
            "picks": safest_picks,
            "combined_probability": calc_combined(safest_picks),
        },
        "balanced": {
            "name": "Balanced Combination",
            "description": "AI-recommended 1X2 picks for each match",
            "picks": balanced_picks,
            "combined_probability": calc_combined(balanced_picks),
        },
        "high_value": {
            "name": "High Value Combination",
            "description": "Most decisive predictions with highest confidence gaps",
            "picks": value_picks,
            "combined_probability": calc_combined(value_picks),
        },
    }


# --- AI Match Chat ---

MATCH_CHAT_PROMPT = """You are an expert football/soccer analyst for Spark AI. The user is asking about a specific match that has been analyzed.

## Match Context
{home_team} vs {away_team} ({competition})

## Analysis Data Available
{analysis_summary}

## Your Role
- Answer the user's question using BOTH the analysis data above AND real-time web search results
- Always search the web for the latest information (injuries, team news, transfers, tactics, lineups)
- Provide specific, detailed, data-backed insights - NOT generic responses
- Include specific player names, dates, stats, and facts from web sources
- You can discuss: team form, H2H history, injuries, motivation, tactical analysis, player strengths, goal-scoring patterns, league context, and anything football-related
- Keep responses focused and insightful (4-10 sentences)
- Always be confident and analytical in your tone

## Conversation History
{chat_history}

User: {user_message}

Search the web for the latest information and respond as a football analyst:"""


def _build_analysis_summary(match_context: dict) -> str:
    """Build a text summary of match analysis for the AI chat prompt."""
    parts = []

    home = match_context.get("home_team", {}).get("name", "Home")
    away = match_context.get("away_team", {}).get("name", "Away")

    # 1X2 predictions
    preds = match_context.get("predictions", {})
    one_x_two = preds.get("1x2", {})
    if one_x_two:
        parts.append(f"1X2 Prediction: {home} win {one_x_two.get('home_win', '?')}%, Draw {one_x_two.get('draw', '?')}%, {away} win {one_x_two.get('away_win', '?')}%")
        parts.append(f"Recommended: {one_x_two.get('recommended_label', '?')} (Confidence: {one_x_two.get('confidence', '?')})")

    # Goals analysis
    ga = match_context.get("goals_analysis")
    if ga:
        parts.append(f"Goals: Avg {ga['avg_total_goals']} per game, {home} avg {ga['avg_home_goals']}, {away} avg {ga['avg_away_goals']}")
        ou = ga.get("over_under", {})
        parts.append(f"Over 2.5: {ou.get('over_25', {}).get('percentage', '?')}%, BTTS: {ga.get('btts', {}).get('yes_percentage', '?')}%")
        sp = ga.get("scoring_prediction", {})
        if sp:
            parts.append(f"Predicted score: {sp.get('predicted_score', '?')}")

    # H2H
    factors = match_context.get("factors", {})
    h2h = factors.get("h2h", {})
    if h2h and h2h.get("total_matches", 0) > 0:
        parts.append(f"H2H ({h2h['total_matches']} matches): {home} wins {h2h['home_wins']}, Draws {h2h['draws']}, {away} wins {h2h['away_wins']}")

    # Form
    form = factors.get("form", {})
    if form:
        parts.append(f"Form: {home} {form.get('home_form', '?')} ({form.get('home_form_score', 0):.0f}%), {away} {form.get('away_form', '?')} ({form.get('away_form_score', 0):.0f}%)")

    # Injuries
    injuries = factors.get("injuries", {})
    inj_impact = factors.get("injury_impact", {})
    home_inj = injuries.get("home", [])
    away_inj = injuries.get("away", [])
    if home_inj or away_inj:
        home_names = ", ".join(i.get("player", "?") for i in home_inj[:3])
        away_names = ", ".join(i.get("player", "?") for i in away_inj[:3])
        parts.append(f"Injuries: {home} ({len(home_inj)}): {home_names}; {away} ({len(away_inj)}): {away_names}")
        if inj_impact:
            parts.append(f"Injury Impact: {inj_impact.get('verdict', '')}")

    # Motivation
    motivation = factors.get("motivation", {})
    if isinstance(motivation, dict) and "home" in motivation:
        parts.append(f"Motivation: {home} - {motivation['home'].get('level', '?')} ({motivation['home'].get('note', '')}), {away} - {motivation['away'].get('level', '?')} ({motivation['away'].get('note', '')})")

    # Standings
    standings = factors.get("standings", {})
    if standings:
        parts.append(f"Standings: {home} #{standings.get('home_position', '?')} ({standings.get('home_record', '?')}, GD {standings.get('home_gd', 0)}), {away} #{standings.get('away_position', '?')} ({standings.get('away_record', '?')}, GD {standings.get('away_gd', 0)})")

    # AI insights
    ai = factors.get("ai_insights", {})
    if ai:
        for key in ["motivation", "player_strength", "new_signings", "coaching_impact"]:
            val = ai.get(key)
            if val:
                parts.append(f"{key.replace('_', ' ').title()}: {val}")

    # Key factors
    kf = match_context.get("key_factors", [])
    if kf:
        parts.append(f"Key Factors: {'; '.join(kf[:5])}")

    return "\n".join(parts)


async def chat_about_match(user_message: str, match_context: dict, chat_history: list) -> dict:
    """Chat with AI about a specific analyzed match. Returns dict with response and sources."""
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return {"text": "AI chat is currently unavailable. Please try again later.", "sources": []}

    from openai import OpenAI
    client = OpenAI(api_key=api_key)

    home = match_context.get("home_team", {}).get("name", "Home")
    away = match_context.get("away_team", {}).get("name", "Away")
    competition = match_context.get("competition", "")
    comp_name = config.COMPETITION_NAMES.get(competition, competition)

    analysis_summary = _build_analysis_summary(match_context)

    # Build chat history string
    history_str = ""
    for msg in (chat_history or [])[-6:]:
        role = "User" if msg.get("role") == "user" else "AI Analyst"
        history_str += f"{role}: {msg.get('content', '')}\n"

    prompt = MATCH_CHAT_PROMPT.format(
        home_team=home,
        away_team=away,
        competition=comp_name,
        analysis_summary=analysis_summary,
        chat_history=history_str,
        user_message=user_message,
    )

    max_retries = 3
    retry_delays = [2, 5, 10]
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=1024,
            )

            text = response.choices[0].message.content.strip() if response.choices[0].message.content else ""

            return {"text": text, "sources": []}
        except Exception as e:
            error_str = str(e)
            if ("429" in error_str or "rate" in error_str.lower()) and attempt < max_retries - 1:
                import asyncio
                delay = retry_delays[attempt]
                print(f"[Jackpot Chat] Rate limited, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(delay)
                continue
            print(f"[Jackpot Chat] OpenAI error: {e}")
            return {"text": "Sorry, I couldn't process your question right now. Please try again.", "sources": []}

    return {"text": "AI is temporarily busy. Please try again in a moment.", "sources": []}
