"""
Daily Free Predictions Generator
Automatically selects top 10 upcoming matches and generates free AI predictions.
Runs as a background task, generating once per day.
"""

import sqlite3
import asyncio
from datetime import datetime
from typing import List, Dict, Optional

import config
import community
from database import get_teams, get_h2h_matches
from prediction import predict_match_outcome
from football_api import fetch_all_upcoming_fixtures
import prediction_tracker


# Reverse lookup: league_id → competition code
_LEAGUE_ID_TO_CODE = {v: k for k, v in config.LEAGUE_IDS.items()}

# Bot user details
SYSTEM_BOT_USERNAME = "spark-ai-picks"
SYSTEM_BOT_DISPLAY = "Spark AI Daily Picks"
SYSTEM_BOT_AVATAR = "#3b82f6"

DAILY_PICK_COUNT = 10


def _get_or_create_bot_user() -> Dict:
    """Get or create the system bot user for daily picks."""
    conn = sqlite3.connect("users.db")
    conn.row_factory = sqlite3.Row

    row = conn.execute(
        "SELECT id, username, display_name, avatar_color FROM users WHERE username = ? AND is_bot = 1",
        (SYSTEM_BOT_USERNAME,),
    ).fetchone()

    if row:
        result = dict(row)
        conn.close()
        return result

    # Create the bot user
    now = datetime.now().isoformat()
    conn.execute("""
        INSERT INTO users (username, display_name, email, password_hash, avatar_color, is_bot, tier, created_at)
        VALUES (?, ?, ?, ?, ?, 1, 'pro', ?)
    """, (SYSTEM_BOT_USERNAME, SYSTEM_BOT_DISPLAY, f"{SYSTEM_BOT_USERNAME}@system.local", "BOT_NO_LOGIN", SYSTEM_BOT_AVATAR, now))
    conn.commit()
    bot_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()

    print(f"[DAILY PICKS] Created system bot user: id={bot_id}")
    return {
        "id": bot_id,
        "username": SYSTEM_BOT_USERNAME,
        "display_name": SYSTEM_BOT_DISPLAY,
        "avatar_color": SYSTEM_BOT_AVATAR,
    }


def select_top_matches(fixtures: List[Dict], count: int = DAILY_PICK_COUNT) -> List[Dict]:
    """
    Select the best matches for daily free picks.
    Prioritizes top leagues, filters to supported competitions, deduplicates.
    """
    # Only keep fixtures from leagues we support (have standings for)
    supported_league_ids = set(config.LEAGUE_IDS.values())

    eligible = []
    for f in fixtures:
        league_id = f.get("competition", {}).get("id")
        status = f.get("status")
        if not league_id or league_id not in supported_league_ids:
            continue
        if status not in ("NS", "TBD", None):
            continue
        # Need valid team IDs
        home_id = f.get("home_team", {}).get("id")
        away_id = f.get("away_team", {}).get("id")
        if not home_id or not away_id:
            continue
        eligible.append(f)

    # Sort by league priority (lower = more important), then by match time
    def sort_key(f):
        league_id = f.get("competition", {}).get("id", 9999)
        priority = config.LEAGUE_PRIORITY.get(league_id, 50)
        return (priority, f.get("date", ""))

    eligible.sort(key=sort_key)

    # Deduplicate by team pair (same matchup shouldn't appear twice)
    seen = set()
    selected = []
    for f in eligible:
        home_id = f["home_team"]["id"]
        away_id = f["away_team"]["id"]
        pair = (min(home_id, away_id), max(home_id, away_id))
        if pair in seen:
            continue
        seen.add(pair)
        selected.append(f)
        if len(selected) >= count:
            break

    return selected


def _make_fallback_team(team_id: int, name: str) -> dict:
    """Create a basic team object with neutral stats for teams not in standings."""
    return {
        "id": team_id,
        "name": name,
        "short_name": name[:3].upper(),
        "crest": None,
        "position": 10,
        "points": 0,
        "played": 10,
        "wins": 3,
        "draws": 4,
        "losses": 3,
        "goals_scored": 12,
        "goals_conceded": 12,
        "goal_difference": 0,
        "form": "WDLWD",
        "recent_w": 2,
        "recent_d": 2,
        "recent_l": 1,
        "recent_gf": 6,
        "recent_ga": 5,
        "home_wins": 2,
        "home_draws": 2,
        "home_losses": 1,
        "home_goals_for": 7,
        "home_goals_against": 5,
        "away_wins": 1,
        "away_draws": 2,
        "away_losses": 2,
        "away_goals_for": 5,
        "away_goals_against": 7,
    }


def _build_analysis_summary(outcome: Dict, key_factors: List[str], confidence: str) -> str:
    """Build a human-readable analysis summary from prediction data."""
    parts = []

    # Lead with the predicted result
    probs = {
        "Home Win": outcome.get("team_a_win", 0),
        "Draw": outcome.get("draw", 0),
        "Away Win": outcome.get("team_b_win", 0),
    }
    best = max(probs, key=probs.get)
    parts.append(f"Predicted: {best} ({probs[best]:.0f}%). Confidence: {confidence}.")

    # Add top 2 key factors
    if key_factors:
        factors = key_factors[:2]
        parts.append(" ".join(factors))

    return " ".join(parts)


async def generate_daily_predictions():
    """
    Main entry point: generate today's daily free predictions.
    Idempotent — skips if picks already exist for today.
    """
    # Check if we already have enough picks for today
    existing_count = community.count_daily_free_today()
    if existing_count >= DAILY_PICK_COUNT:
        return

    print(f"[DAILY PICKS] Starting generation ({existing_count} existing, need {DAILY_PICK_COUNT})")

    # Get or create the system bot
    bot = _get_or_create_bot_user()
    bot_id = bot["id"]
    bot_username = bot["username"]
    bot_display = bot["display_name"]
    bot_avatar = bot["avatar_color"]

    # Fetch upcoming fixtures (today + tomorrow)
    fixtures = await fetch_all_upcoming_fixtures(days=2)
    if not fixtures:
        print("[DAILY PICKS] No upcoming fixtures found, will retry later")
        return

    # Select top matches
    needed = DAILY_PICK_COUNT - existing_count
    matches = select_top_matches(fixtures, count=needed)
    if not matches:
        print("[DAILY PICKS] No eligible matches for daily picks")
        return

    print(f"[DAILY PICKS] Selected {len(matches)} matches for prediction")

    generated = 0
    for fixture in matches:
        try:
            home = fixture["home_team"]
            away = fixture["away_team"]
            comp = fixture.get("competition", {})
            comp_code = comp.get("code", "")
            comp_name = comp.get("name", config.COMPETITION_NAMES.get(comp_code, comp_code))
            league_id = comp.get("id")

            # Get team standings data
            teams = await get_teams(comp_code) if comp_code else []
            team_a = next((t for t in teams if t["id"] == home["id"]), None)
            team_b = next((t for t in teams if t["id"] == away["id"]), None)

            if not team_a:
                team_a = _make_fallback_team(home["id"], home["name"])
            if not team_b:
                team_b = _make_fallback_team(away["id"], away["name"])

            # Get H2H data
            h2h = await get_h2h_matches(home["id"], away["id"])

            # Run prediction
            outcome = predict_match_outcome(team_a, team_b, "team_a", h2h)

            # Determine predicted result
            probs = {
                "Home Win": outcome.get("team_a_win", 0),
                "Draw": outcome.get("draw", 0),
                "Away Win": outcome.get("team_b_win", 0),
            }
            predicted_result = max(probs, key=probs.get)
            predicted_prob = probs[predicted_result]

            # Build analysis summary
            key_factors = outcome.get("key_factors", [])
            confidence = outcome.get("confidence", "Medium")
            summary = _build_analysis_summary(outcome, key_factors, confidence)

            # Build fixture_id matching prediction_tracker format
            fixture_id = f"{home['id']}-{away['id']}-{datetime.now().strftime('%Y%m%d')}"

            # Share as community prediction (daily free)
            result = community.share_prediction(
                user_id=bot_id,
                username=bot_username,
                display_name=bot_display,
                avatar_color=bot_avatar,
                fixture_id=fixture_id,
                team_a_name=home["name"],
                team_b_name=away["name"],
                competition=comp_name,
                predicted_result=predicted_result,
                predicted_result_prob=predicted_prob,
                analysis_summary=summary,
                visibility="public",
                is_paid=False,
                competition_code=comp_code,
                is_daily_free=True,
            )

            if result.get("success"):
                generated += 1
                print(f"[DAILY PICKS] #{generated}: {home['name']} vs {away['name']} ({comp_name}) → {predicted_result} ({predicted_prob:.0f}%)")

            # Also store in prediction tracker for accuracy tracking
            try:
                prediction_tracker.store_prediction(
                    team_a_id=home["id"],
                    team_b_id=away["id"],
                    team_a_name=home["name"],
                    team_b_name=away["name"],
                    competition=comp_code,
                    outcome=outcome,
                    top_predictions=[{
                        "bet": predicted_result,
                        "probability": predicted_prob,
                        "valueScore": predicted_prob,
                    }],
                    user_id=bot_id,
                )
            except Exception as e:
                print(f"[DAILY PICKS] Tracker store failed (non-fatal): {e}")

            # Small delay between predictions to avoid overloading API
            await asyncio.sleep(2)

        except Exception as e:
            print(f"[DAILY PICKS] Failed to generate for {fixture.get('home_team', {}).get('name', '?')} vs {fixture.get('away_team', {}).get('name', '?')}: {e}")
            continue

    print(f"[DAILY PICKS] Generation complete: {generated} new predictions (total today: {existing_count + generated})")
