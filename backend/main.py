from fastapi import FastAPI, Header, HTTPException, UploadFile, File, Request, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from pathlib import Path
import asyncio
import json
import uuid
import shutil

# Load .env file if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass
from database import init_db, get_teams, get_team_players, get_h2h_matches, is_using_live_data
from prediction import predict_match_outcome
from player_analysis import analyze_players
from odds_analysis import generate_odds_comparison, generate_odds_comparison_async
import os
import football_api
import config
import access_codes
import prediction_tracker
import user_auth
import community
import team_aliases
import subscriptions
import pricing_config
import ai_support
import daraja_payment
import whop_payment
import jackpot_analyzer
import data_verifier
import admin_rbac
import activity_logger
from admin_routes import admin_router
from employee_routes import employee_router
import employee_portal
import bot_manager

# Admin password for managing access codes
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "SoccerAI2026Admin")

app = FastAPI(title="Spark AI Prediction")

# Include admin routes
app.include_router(admin_router)
app.include_router(employee_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    team_a_id: int
    team_b_id: int
    venue: str
    competition: str = "PL"
    team_a_name: Optional[str] = None
    team_b_name: Optional[str] = None


async def _inactivity_checker():
    """Background task: 30-min keep-alive prompt for agents, 3-min auto-close if no response."""
    while True:
        try:
            await asyncio.sleep(30)  # Check every 30 seconds

            # 1. Send keep-alive prompts for conversations idle 30+ minutes
            idle_convs = community.get_conversations_needing_keepalive(idle_minutes=30)
            for conv in idle_convs:
                agent_id = conv.get("assigned_agent_id")
                if not agent_id:
                    continue
                community.create_keepalive_prompt(conv["conversation_id"], agent_id)
                community.create_notification(
                    user_id=agent_id,
                    notif_type="keepalive_prompt",
                    title="Chat Keep-Alive",
                    message=f"Your support chat has been idle for 30 minutes. Do you want to keep it open?",
                    metadata={"conversation_id": conv["conversation_id"], "user_id": conv["user_id"]},
                )
                print(f"[Support] Keep-alive prompt sent to agent {agent_id} for conversation {conv['conversation_id']}")

            # 2. Auto-close conversations where keep-alive prompt expired (3 min no response)
            expired = community.get_expired_keepalive_prompts(expire_minutes=3)
            for prompt in expired:
                user_id = prompt["user_id"]
                community.send_support_message(
                    user_id, "system",
                    "This conversation has been closed due to inactivity. You can start a new conversation anytime."
                )
                community.close_conversation(user_id, "inactivity_timeout")
                # Mark the prompt as responded so it's not re-processed
                conn = community._get_db()
                conn.execute(
                    "UPDATE chat_keepalive_prompts SET responded = 1, response = 'expired', responded_at = ? WHERE id = ?",
                    (community.datetime.now().isoformat(), prompt["id"]),
                )
                conn.commit()
                conn.close()
                print(f"[Support] Auto-closed conversation for user {user_id} (keep-alive expired)")

        except Exception as e:
            print(f"[Support] Inactivity checker error: {e}")


async def _active_users_cleanup():
    """Background task: periodically clean up stale active user entries."""
    while True:
        try:
            await asyncio.sleep(120)  # Every 2 minutes
            community.cleanup_inactive_users()
        except Exception:
            pass


@app.on_event("startup")
async def startup():
    print("=" * 50)
    print("Spark AI Prediction - Starting...")
    print("=" * 50)

    # Check API keys
    if config.API_FOOTBALL_KEY:
        print("[OK] API-Football key configured (api-sports.io)")
        print("     Enhanced stats: H2H, cards, goals, penalties, form")
    else:
        print("[--] API-Football key NOT configured (using sample data)")
        print("     Get your free key at: https://www.api-football.com/")

    if config.ODDS_API_KEY:
        print("[OK] The Odds API key configured")
    else:
        print("[--] The Odds API key NOT configured (using simulated odds)")
        print("     Get your free key at: https://the-odds-api.com/")

    print("-" * 50)
    await init_db()

    # Initialize access codes database
    access_codes.init_access_db()
    print("[OK] Access code system initialized")

    prediction_tracker.init_predictions_db()

    # Initialize user auth database
    user_auth.init_user_db()
    print("[OK] User authentication system initialized")

    user_auth.init_tracking_db()
    print("[OK] Visitor tracking system initialized")

    # Create uploads directories
    (Path(__file__).parent / "uploads" / "avatars").mkdir(parents=True, exist_ok=True)
    (Path(__file__).parent / "uploads" / "support").mkdir(parents=True, exist_ok=True)
    print("[OK] Uploads directories initialized")

    # Initialize community predictions database
    community.init_community_db()
    print("[OK] Community predictions system initialized")

    # Initialize pricing configuration
    pricing_config.init_pricing_db()
    print("[OK] Pricing configuration initialized")

    # Initialize subscriptions
    subscriptions.init_subscriptions_db()
    expired = subscriptions.check_expired_subscriptions()
    if expired:
        print(f"[OK] Expired {expired} subscription(s)")
    print("[OK] Subscription system initialized")

    # Initialize payment system
    daraja_payment.init_payment_db()
    print("[OK] Daraja M-Pesa payment system initialized")

    # Initialize Whop payment system
    whop_payment.init_whop_db()
    print("[OK] Whop payment system initialized")

    # Initialize jackpot analyzer
    jackpot_analyzer.init_db()

    # Initialize AI data verification cache
    data_verifier.init_verified_cache()
    print("[OK] AI data verification cache initialized")

    # Initialize RBAC system
    admin_rbac.seed_default_roles()
    admin_rbac.seed_default_permissions()
    admin_rbac.migrate_legacy_roles()
    print("[OK] Admin RBAC system initialized")

    # Initialize employee portal tables
    user_auth.init_employee_tables()
    print("[OK] Employee portal tables initialized")

    # Start background inactivity checker for support conversations
    asyncio.create_task(_inactivity_checker())
    asyncio.create_task(_payment_expiry_checker())
    asyncio.create_task(_active_users_cleanup())
    asyncio.create_task(bot_manager.start_bot_heartbeats())
    asyncio.create_task(_prediction_result_checker())
    asyncio.create_task(_weekly_disbursement_generator())
    asyncio.create_task(_daily_predictions_generator())
    print("[OK] Support keep-alive checker started (30-min idle, 3-min response)")
    print("[OK] Payment expiry checker started (15-min timeout)")
    print("[OK] Active user tracking started")
    print("[OK] Bot heartbeat system started")
    print("[OK] Prediction result checker started (5-min interval)")
    print("[OK] Weekly disbursement generator started (Fridays 10:00 EAT)")
    print("[OK] Daily free predictions generator started (30-min check interval)")
    print("=" * 50)


@app.get("/api/teams")
async def get_all_teams(competition: str = "PL"):
    teams = await get_teams(competition)
    return {
        "teams": teams,
        "competition": competition,
        "using_live_data": is_using_live_data(),
        "data_source": "API-Football" if is_using_live_data() else "Sample Data"
    }


@app.get("/api/fixtures/upcoming-all")
async def get_all_upcoming_fixtures(days: int = 7):
    """Get upcoming fixtures across all leagues for the next N days."""
    fixtures = await football_api.fetch_all_upcoming_fixtures(days=min(days, 14))
    return {
        "fixtures": fixtures,
        "count": len(fixtures),
    }


@app.get("/api/fixtures")
async def get_fixtures(days: int = 14, competition: str = "PL"):
    """Get upcoming fixtures for the next N days for a specific competition."""
    fixtures = await football_api.fetch_upcoming_fixtures(competition=competition, days=days)

    if fixtures:
        # Check if fixtures are historical (free tier limitation)
        is_historical = any(f.get("is_historical") for f in fixtures)

        return {
            "fixtures": fixtures,
            "count": len(fixtures),
            "competition": competition,
            "using_live_data": True,
            "data_source": "API-Football",
            "is_historical": is_historical,
            "message": "Showing recent matches from 2024-25 season (free API tier)" if is_historical else None,
            "season": config.CURRENT_SEASON
        }
    else:
        # Return empty list if no fixtures available
        return {
            "fixtures": [],
            "count": 0,
            "competition": competition,
            "using_live_data": False,
            "message": f"No fixtures available for {config.COMPETITION_NAMES.get(competition, competition)}. This may be due to off-season or API limitations.",
            "season": config.CURRENT_SEASON
        }


@app.get("/api/live-matches")
async def get_live_matches():
    """Get live matches + today's finished fixtures merged."""
    import asyncio
    live_matches, todays = await asyncio.gather(
        football_api.fetch_live_matches(),
        football_api.fetch_todays_fixtures(),
    )

    live_matches = live_matches or []
    todays = todays or []

    # Merge: use live data for currently playing, add finished from today's
    live_ids = {m["id"] for m in live_matches}
    finished_statuses = {"FT", "AET", "PEN"}

    # Add finished matches from today that aren't in the live set
    for match in todays:
        if match["id"] not in live_ids and match.get("status") in finished_statuses:
            live_matches.append(match)

    # Add live analysis to each match
    for match in live_matches:
        match["live_analysis"] = _compute_live_analysis(match)

    return {
        "matches": live_matches,
        "count": len(live_matches),
        "live_count": sum(1 for m in live_matches if m.get("status") in ("1H", "2H", "HT", "ET", "LIVE")),
        "finished_count": sum(1 for m in live_matches if m.get("status") in finished_statuses),
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/live-stats/{fixture_id}")
async def get_live_stats(fixture_id: int):
    """Get detailed live statistics for a specific fixture."""
    stats = await football_api.fetch_fixture_statistics(fixture_id)
    if stats:
        return {"statistics": stats, "fixture_id": fixture_id}
    return {"statistics": None, "fixture_id": fixture_id, "message": "No statistics available"}


@app.get("/api/fixture-lineups/{fixture_id}")
async def get_fixture_lineups(fixture_id: int):
    """Get lineups (formation + starting XI + substitutes) for a fixture."""
    lineups = await football_api.fetch_fixture_lineups(fixture_id)
    if lineups:
        return {"lineups": lineups, "fixture_id": fixture_id}
    return {"lineups": None, "fixture_id": fixture_id, "message": "Lineups not available yet"}


@app.get("/api/live-match-data/{fixture_id}")
async def get_live_match_data(fixture_id: int):
    """Get real-time match data: score, live analysis, events. Used for polling."""
    # Find this fixture in current live matches
    live_matches = await football_api.fetch_live_matches()
    live_matches = live_matches or []

    match = next((m for m in live_matches if m.get("id") == fixture_id), None)
    if not match:
        # Try today's fixtures if not in live
        todays = await football_api.fetch_todays_fixtures()
        todays = todays or []
        match = next((m for m in todays if m.get("id") == fixture_id), None)

    if match:
        analysis = _compute_live_analysis(match)

        # Also fetch detailed fixture statistics (possession, shots, corners, etc.)
        raw_stats = await football_api.fetch_fixture_statistics(fixture_id)
        stats_parsed = None
        if raw_stats and isinstance(raw_stats, dict):
            home_id = match.get("home_team", {}).get("id")
            away_id = match.get("away_team", {}).get("id")
            stats_parsed = {"home": {}, "away": {}}
            for team_id_str, team_data in raw_stats.items():
                tid = int(team_id_str) if str(team_id_str).isdigit() else None
                if tid == home_id:
                    stats_parsed["home"] = team_data.get("stats", {}) if isinstance(team_data, dict) else {}
                elif tid == away_id:
                    stats_parsed["away"] = team_data.get("stats", {}) if isinstance(team_data, dict) else {}

        return {
            "fixture_id": fixture_id,
            "status": match.get("status"),
            "elapsed": match.get("elapsed"),
            "goals": match.get("goals"),
            "events": match.get("events", []),
            "live_analysis": analysis,
            "statistics": stats_parsed,
        }

    return {"fixture_id": fixture_id, "status": None, "message": "Match not found"}


def _compute_live_analysis(match: dict) -> dict:
    """Compute live match analysis from available data."""
    status = match.get("status", "")
    elapsed = match.get("elapsed") or 0
    home_goals = match.get("goals", {}).get("home") or 0
    away_goals = match.get("goals", {}).get("away") or 0
    events = match.get("events", [])
    stats = match.get("statistics") or {}
    home_stats = stats.get("home", {})
    away_stats = stats.get("away", {})

    # If we have real statistics from API
    possession_home = None
    possession_away = None
    if home_stats.get("Ball Possession"):
        try:
            possession_home = int(str(home_stats["Ball Possession"]).replace("%", ""))
            possession_away = 100 - possession_home
        except (ValueError, TypeError):
            pass

    shots_home = _safe_int(home_stats.get("Total Shots"))
    shots_away = _safe_int(away_stats.get("Total Shots"))
    attacks_home = _safe_int(home_stats.get("Dangerous Attacks"))
    attacks_away = _safe_int(away_stats.get("Dangerous Attacks"))

    # Calculate domination score (0-100 for home team, 50 = equal)
    domination_factors = []
    if possession_home is not None:
        domination_factors.append(possession_home)
    if shots_home is not None and shots_away is not None and (shots_home + shots_away) > 0:
        domination_factors.append(round((shots_home / (shots_home + shots_away)) * 100))
    if attacks_home is not None and attacks_away is not None and (attacks_home + attacks_away) > 0:
        domination_factors.append(round((attacks_home / (attacks_home + attacks_away)) * 100))

    # Score factor: being ahead shifts domination
    if home_goals > away_goals:
        domination_factors.append(60 + min((home_goals - away_goals) * 5, 15))
    elif away_goals > home_goals:
        domination_factors.append(40 - min((away_goals - home_goals) * 5, 15))

    domination_home = round(sum(domination_factors) / len(domination_factors)) if domination_factors else 50

    # Aggression score per team (cards, fouls, shots)
    home_cards = sum(1 for e in events if e.get("type") == "Card" and e.get("team_id") == match.get("home_team", {}).get("id"))
    away_cards = sum(1 for e in events if e.get("type") == "Card" and e.get("team_id") == match.get("away_team", {}).get("id"))
    home_aggression_score = home_cards * 20 + (shots_home or 0) * 3
    away_aggression_score = away_cards * 20 + (shots_away or 0) * 3
    total_aggression = home_aggression_score + away_aggression_score
    if total_aggression > 0:
        aggression_home = round((home_aggression_score / total_aggression) * 100)
        aggression_away = 100 - aggression_home
    else:
        aggression_home = None
        aggression_away = None

    # Likely to score next (based on domination + recent momentum)
    recent_events = [e for e in events if e.get("time") and e["time"] >= max(elapsed - 15, 0)]
    recent_home_actions = sum(1 for e in recent_events if e.get("team_id") == match.get("home_team", {}).get("id"))
    recent_away_actions = sum(1 for e in recent_events if e.get("team_id") == match.get("away_team", {}).get("id"))

    likely_score_home = domination_home
    if recent_home_actions > recent_away_actions:
        likely_score_home = min(80, likely_score_home + 10)
    elif recent_away_actions > recent_home_actions:
        likely_score_home = max(20, likely_score_home - 10)

    is_live = status in ("1H", "2H", "HT", "ET", "LIVE")

    return {
        "possession": {"home": possession_home, "away": possession_away} if possession_home else None,
        "domination": {"home": domination_home, "away": 100 - domination_home},
        "likely_next_goal": {"home": likely_score_home, "away": 100 - likely_score_home} if is_live else None,
        "aggression": {"home": aggression_home, "away": aggression_away} if aggression_home is not None else None,
        "shots": {"home": shots_home, "away": shots_away} if shots_home is not None else None,
        "dangerous_attacks": {"home": attacks_home, "away": attacks_away} if attacks_home is not None else None,
        "is_live": is_live,
    }


def _safe_int(val) -> int:
    """Safely convert a value to int."""
    if val is None:
        return None
    try:
        return int(str(val).replace("%", ""))
    except (ValueError, TypeError):
        return None


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


# --- Analysis View Limits (Free tier: 3 unique matches per 24h) ---

@app.get("/api/analysis-views/status")
async def analysis_views_status(authorization: str = Header(None)):
    """Check how many free analysis views the user has left."""
    payload = _get_current_user(authorization)
    if not payload:
        return {"views_used": 0, "max_views": 3, "allowed": True, "reset_at": None, "balance_usd": 0}
    tier = payload.get("tier", "free")
    if tier in ("pro", "trial"):
        max_views = -1 if tier == "pro" else 10
        return {"views_used": 0, "max_views": max_views, "allowed": True, "reset_at": None, "balance_usd": 0}
    result = user_auth.get_analysis_views_status(payload["user_id"])
    bal = community.get_user_balance(payload["user_id"])
    result["balance_usd"] = bal.get("balance_usd", 0)
    return result


@app.post("/api/analysis-views/record")
async def record_analysis_view(request: dict, authorization: str = Header(None)):
    """Record a match analysis view for the current user."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    tier = payload.get("tier", "free")
    if tier in ("pro", "trial"):
        max_views = -1 if tier == "pro" else 10
        return {"views_used": 0, "max_views": max_views, "allowed": True, "reset_at": None}
    match_key = request.get("match_key", "")
    if not match_key:
        raise HTTPException(status_code=400, detail="match_key is required")
    balance_paid = request.get("balance_paid", False)
    return user_auth.record_analysis_view(payload["user_id"], match_key, balance_paid=balance_paid)


# --- Pay on the Go: Balance Deduction Endpoints ---

@app.post("/api/balance/use-for-analysis")
async def use_balance_for_analysis(authorization: str = Header(None)):
    """Deduct match analysis price from user balance."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    tier = payload.get("tier", "free")
    if tier in ("pro", "trial"):
        raise HTTPException(status_code=400, detail="Subscribed users have unlimited access")
    user_id = payload["user_id"]
    price = pricing_config.get("match_analysis_price_usd", 0.25)
    bal = community.get_user_balance(user_id)
    if bal.get("balance_usd", 0) < price:
        raise HTTPException(status_code=403, detail=f"Insufficient balance. Deposit at least ${price:.2f} to continue.")
    updated = community.adjust_user_balance(
        user_id=user_id, amount_usd=-price, amount_kes=0,
        reason="Match analysis view", adjustment_type="analysis_deduction"
    )
    return {"success": True, "balance": updated}


@app.post("/api/balance/use-for-jackpot")
async def use_balance_for_jackpot(authorization: str = Header(None)):
    """Deduct jackpot analysis price from user balance."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    tier = payload.get("tier", "free")
    if tier in ("pro", "trial"):
        raise HTTPException(status_code=400, detail="Subscribed users have unlimited access")
    user_id = payload["user_id"]
    price = pricing_config.get("jackpot_analysis_price_usd", 0.65)
    bal = community.get_user_balance(user_id)
    if bal.get("balance_usd", 0) < price:
        raise HTTPException(status_code=403, detail=f"Insufficient balance. Deposit at least ${price:.2f} to continue.")
    updated = community.adjust_user_balance(
        user_id=user_id, amount_usd=-price, amount_kes=0,
        reason="Jackpot analysis", adjustment_type="jackpot_deduction"
    )
    return {"success": True, "balance": updated}


@app.post("/api/predict")
async def predict(request: PredictRequest, req: Request = None, authorization: str = Header(None)):
    if request.team_a_id == request.team_b_id:
        return {"error": "Cannot predict a match between a team and itself"}

    # Track extension usage
    source = ""
    if req:
        source = req.headers.get("x-spark-source", "")
    if source == "extension":
        payload = _get_current_user(authorization)
        if payload:
            _log_extension_event(
                payload["user_id"], "prediction",
                f"{request.team_a_name or request.team_a_id} vs {request.team_b_name or request.team_b_id}"
            )

    teams = await get_teams(request.competition)
    team_a = next((t for t in teams if t["id"] == request.team_a_id), None)
    team_b = next((t for t in teams if t["id"] == request.team_b_id), None)

    # Create fallback team objects for leagues with incomplete standings
    if not team_a:
        print(f"[WARN] Team {request.team_a_id} not in standings for {request.competition}, using fallback")
        team_a = _make_fallback_team(request.team_a_id, request.team_a_name or f"Team {request.team_a_id}")
    if not team_b:
        print(f"[WARN] Team {request.team_b_id} not in standings for {request.competition}, using fallback")
        team_b = _make_fallback_team(request.team_b_id, request.team_b_name or f"Team {request.team_b_id}")

    h2h = await get_h2h_matches(request.team_a_id, request.team_b_id)
    outcome = predict_match_outcome(team_a, team_b, request.venue, h2h)

    # Resolve league ID for player data
    if request.competition in config.LEAGUE_IDS:
        predict_league_id = config.LEAGUE_IDS[request.competition]
    else:
        try:
            predict_league_id = int(request.competition)
        except (ValueError, TypeError):
            predict_league_id = 39

    raw_players_a = await get_team_players(request.team_a_id, predict_league_id)
    raw_players_b = await get_team_players(request.team_b_id, predict_league_id)

    # AI-verify coaches, injuries, player transfers via Gemini + Google Search
    _verified_data = None
    try:
        _verified_data = await data_verifier.get_verified_match_data(
            team_a_id=request.team_a_id, team_a_name=team_a["name"],
            team_b_id=request.team_b_id, team_b_name=team_b["name"],
            competition=request.competition, league_id=predict_league_id,
            api_players_a=raw_players_a, api_players_b=raw_players_b,
        )
        if _verified_data:
            raw_players_a = data_verifier.apply_player_corrections(raw_players_a, _verified_data.get("team_a", {}))
            raw_players_b = data_verifier.apply_player_corrections(raw_players_b, _verified_data.get("team_b", {}))
    except Exception as _ve:
        print(f"[WARN] Data verification skipped: {_ve}")

    players_a = analyze_players(raw_players_a, team_a)
    players_b = analyze_players(raw_players_b, team_b)
    # Detect if player data came from live API (live players have 'photo' URLs from API-Football)
    _players_live = is_using_live_data() and config.API_FOOTBALL_KEY and (
        any(p.get("photo") for p in raw_players_a) or any(p.get("photo") for p in raw_players_b)
    )

    # Try async odds with live data, fall back to simulated
    try:
        odds = await generate_odds_comparison_async(
            outcome,
            request.team_a_id,
            request.team_b_id,
            team_a_name=team_a["name"],
            team_b_name=team_b["name"]
        )
    except Exception as e:
        print(f"Async odds failed, using simulated: {e}")
        odds = generate_odds_comparison(outcome, request.team_a_id, request.team_b_id)

    risks = _build_risks(team_a, team_b, h2h, players_a, players_b, outcome, odds)

    return {
        "match_info": {
            "team_a": {
                "id": team_a["id"],
                "name": team_a["name"],
                "short_name": team_a.get("short_name", team_a["name"][:3].upper()),
                "position": team_a.get("position"),
                "crest": team_a.get("crest"),
            },
            "team_b": {
                "id": team_b["id"],
                "name": team_b["name"],
                "short_name": team_b.get("short_name", team_b["name"][:3].upper()),
                "position": team_b.get("position"),
                "crest": team_b.get("crest"),
            },
            "venue": request.venue,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "competition": config.COMPETITION_NAMES.get(request.competition, request.competition),
        },
        "outcome": outcome,
        "players": {"team_a": players_a, "team_b": players_b},
        "odds": odds,
        "risks": risks,
        "data_sources": {
            "teams": "API-Football (Live)" if is_using_live_data() else "Sample Data",
            "odds": "The Odds API (Live)" if odds.get("using_live_odds") else "Simulated",
            "h2h": "API-Football (Live)" if is_using_live_data() else "Sample Data",
            "players": "API-Football (Live)" if _players_live else "Sample Data",
            "verification": _verified_data.get("source", "none") if _verified_data else "none",
        },
        "verified_data": {
            "team_a": {
                "coach": _verified_data["team_a"].get("coach") if _verified_data else None,
                "injuries": _verified_data["team_a"].get("injuries", []) if _verified_data else [],
                "transfers_in": _verified_data["team_a"].get("transfers_in", []) if _verified_data else [],
                "transfers_out": _verified_data["team_a"].get("transfers_out", []) if _verified_data else [],
            },
            "team_b": {
                "coach": _verified_data["team_b"].get("coach") if _verified_data else None,
                "injuries": _verified_data["team_b"].get("injuries", []) if _verified_data else [],
                "transfers_in": _verified_data["team_b"].get("transfers_in", []) if _verified_data else [],
                "transfers_out": _verified_data["team_b"].get("transfers_out", []) if _verified_data else [],
            },
            "verified_at": _verified_data.get("verified_at") if _verified_data else None,
            "source": _verified_data.get("source", "none") if _verified_data else "none",
        } if _verified_data else None,
    }


def _build_risks(team_a, team_b, h2h, players_a, players_b, outcome, odds=None):
    risks = []

    # Data source info
    if not is_using_live_data():
        risks.append({
            "type": "data_source",
            "severity": "info",
            "message": "Using sample data. Configure API_FOOTBALL_KEY for live standings, H2H, and statistics."
        })

    if odds and not odds.get("using_live_odds"):
        risks.append({
            "type": "data_source",
            "severity": "info",
            "message": "Using simulated odds. Configure ODDS_API_KEY for real bookmaker odds."
        })

    if outcome["confidence"] == "Low":
        risks.append({
            "type": "confidence",
            "severity": "high",
            "message": "Low prediction confidence due to limited historical data between these teams."
        })
    elif outcome["confidence"] == "Medium":
        risks.append({
            "type": "confidence",
            "severity": "medium",
            "message": "Medium prediction confidence - limited head-to-head history available."
        })

    if len(h2h) < 3:
        risks.append({
            "type": "data",
            "severity": "medium",
            "message": f"Only {len(h2h)} head-to-head match(es) available. Predictions rely more on recent form and league data."
        })

    recent_l_a = team_a.get("recent_l", 0)
    recent_l_b = team_b.get("recent_l", 0)

    if recent_l_a >= 3:
        risks.append({
            "type": "form",
            "severity": "high",
            "message": f"{team_a['name']} have lost {recent_l_a} of their last 10 - poor form increases uncertainty."
        })

    if recent_l_b >= 3:
        risks.append({
            "type": "form",
            "severity": "high",
            "message": f"{team_b['name']} have lost {recent_l_b} of their last 10 - poor form increases uncertainty."
        })

    for p in players_a + players_b:
        if p.get("card_risk") == "High":
            risks.append({
                "type": "cards",
                "severity": "medium",
                "message": f"{p['name']} has elevated card risk ({p.get('card_risk_prob', 0)}% per match) - could affect team dynamics."
            })

    if abs(outcome["team_a_win"] - outcome["team_b_win"]) < 8:
        risks.append({
            "type": "uncertainty",
            "severity": "medium",
            "message": "Win probabilities are very close - this match is highly unpredictable."
        })

    risks.append({
        "type": "lineup",
        "severity": "info",
        "message": "Analysis uses season-level statistics. Actual matchday lineups may differ due to injuries or tactical changes."
    })

    risks.append({
        "type": "disclaimer",
        "severity": "info",
        "message": "All predictions are probabilistic estimates based on historical data. They are NOT guarantees. Please gamble responsibly and within your means."
    })

    return risks


# ==================== ACCESS CODE ENDPOINTS ====================

class VerifyCodeRequest(BaseModel):
    code: str


@app.post("/api/auth/verify")
async def verify_access_code(request: VerifyCodeRequest):
    """Verify an access code."""
    result = access_codes.verify_code(request.code)
    return result


# Admin endpoints moved to admin_routes.py (included via admin_router)


@app.get("/api/user/staff-role")
async def get_own_staff_role(authorization: str = Header(None)):
    """Check own staff role and RBAC info (for frontend to know if user is staff)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    role = user_auth.get_staff_role(payload["user_id"])
    role_info = admin_rbac.get_user_role(payload["user_id"])
    return {"staff_role": role, "role_info": role_info}


# ==================== END ACCESS CODE / ADMIN ENDPOINTS ====================


# ==================== USER AUTH ENDPOINTS ====================

class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str = ""
    referral_code: str = ""
    captcha_token: str = ""
    full_name: str = ""
    date_of_birth: str = ""
    security_question: str = ""
    security_answer: str = ""
    terms_accepted: bool = False
    country: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str
    captcha_token: str = ""

class GoogleLoginRequest(BaseModel):
    token: str
    referral_code: str = ""
    captcha_token: str = ""
    terms_accepted: bool = False

class CaptchaCheckRequest(BaseModel):
    email: str

class VerifyEmailRequest(BaseModel):
    email: str
    code: str

class ResendCodeRequest(BaseModel):
    email: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    token: str
    new_password: str

class UpdateUsernameRequest(BaseModel):
    username: str

class UpdateDisplayNameRequest(BaseModel):
    display_name: str

class UpdateMpesaPhoneRequest(BaseModel):
    mpesa_phone: str

class PersonalInfoRequest(BaseModel):
    full_name: str = None
    date_of_birth: str = None
    security_question: str = None
    security_answer: str = None
    country: str = None

class DeleteAccountRequest(BaseModel):
    password: str

class WhatsAppVerifySendRequest(BaseModel):
    phone_number: str

class WhatsAppVerifyConfirmRequest(BaseModel):
    code: str


def _get_client_ip(request: Request) -> str:
    """Extract client IP, checking X-Forwarded-For for proxied requests."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _get_current_user(authorization: str = Header(None)) -> Optional[dict]:
    """Extract user from Authorization header. Always refreshes tier and checks active status from DB."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "")
    payload = user_auth.verify_token(token)
    if payload and payload.get("user_id"):
        status = user_auth.get_user_tier_and_status(payload["user_id"])
        if status is None:
            return None
        if not status["is_active"]:
            raise HTTPException(status_code=403, detail="Account suspended")
        payload["tier"] = status["tier"]
    return payload


def _require_sensitive_action(user_id: int):
    """Check if the user can perform sensitive actions. Raises 403 if restricted."""
    check = user_auth.check_sensitive_action_allowed(user_id)
    if not check["allowed"]:
        raise HTTPException(status_code=403, detail=check["message"])


# === CHROME EXTENSION ENDPOINTS ===

class TeamLookupRequest(BaseModel):
    teams: list  # [{name: str, position: str}, ...]
    competition: str = ""

@app.get("/api/extension/validate")
async def extension_validate(authorization: str = Header(None)):
    """Lightweight validation: token valid + pro tier check for Chrome extension."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    # Log extension session
    _log_extension_event(payload["user_id"], "session_validate", "")
    return {
        "valid": True,
        "user_id": payload["user_id"],
        "username": payload.get("username", ""),
        "tier": payload["tier"],
        "is_pro": payload["tier"] == "pro",
    }

@app.post("/api/extension/lookup-teams")
async def extension_lookup_teams(request: TeamLookupRequest, authorization: str = Header(None)):
    """Fuzzy match team names from betting sites to API-Football IDs.
    Uses static aliases first, then dynamic API-Football search for unknown teams."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if payload["tier"] != "pro":
        raise HTTPException(status_code=403, detail="Pro subscription required for extension")
    results = await team_aliases.lookup_teams_dynamic(request.teams, request.competition)
    return {"matches": results}


# --- Extension Analytics ---
import sqlite3 as _sqlite3
from datetime import datetime as _dt

def _init_extension_analytics():
    """Create extension_analytics table if it doesn't exist."""
    db = _sqlite3.connect("users.db")
    db.execute("""CREATE TABLE IF NOT EXISTS extension_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        details TEXT DEFAULT '',
        created_at TEXT NOT NULL
    )""")
    db.execute("CREATE INDEX IF NOT EXISTS idx_ext_analytics_user ON extension_analytics(user_id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_ext_analytics_action ON extension_analytics(action)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_ext_analytics_date ON extension_analytics(created_at)")
    db.commit()
    db.close()

_init_extension_analytics()

def _log_extension_event(user_id: int, action: str, details: str = ""):
    """Log an extension usage event."""
    db = _sqlite3.connect("users.db")
    db.execute(
        "INSERT INTO extension_analytics (user_id, action, details, created_at) VALUES (?, ?, ?, ?)",
        (user_id, action, details, _dt.utcnow().isoformat())
    )
    db.commit()
    db.close()


@app.post("/api/extension/log-event")
async def extension_log_event(request: Request, authorization: str = Header(None)):
    """Log extension usage events for analytics."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body = await request.json()
    _log_extension_event(payload["user_id"], body.get("action", "unknown"), body.get("details", ""))
    return {"ok": True}


@app.get("/api/admin/extension-analytics")
async def admin_extension_analytics(authorization: str = Header(None), x_admin_password: str = Header(None), days: int = 30):
    """Get extension usage analytics for admin dashboard."""
    if x_admin_password and x_admin_password == ADMIN_PASSWORD:
        pass  # password auth OK
    else:
        payload = _get_current_user(authorization)
        if not payload or not payload.get("is_admin"):
            raise HTTPException(status_code=403, detail="Admin access required")

    from datetime import timedelta
    cutoff = (_dt.utcnow() - timedelta(days=days)).isoformat()

    db = _sqlite3.connect("users.db")
    db.row_factory = _sqlite3.Row

    # Total extension users (unique)
    total_users = db.execute(
        "SELECT COUNT(DISTINCT user_id) as cnt FROM extension_analytics WHERE created_at >= ?", (cutoff,)
    ).fetchone()["cnt"]

    # Total events
    total_events = db.execute(
        "SELECT COUNT(*) as cnt FROM extension_analytics WHERE created_at >= ?", (cutoff,)
    ).fetchone()["cnt"]

    # Events by action
    by_action = [dict(r) for r in db.execute(
        "SELECT action, COUNT(*) as cnt FROM extension_analytics WHERE created_at >= ? GROUP BY action ORDER BY cnt DESC", (cutoff,)
    ).fetchall()]

    # Top extension users
    top_users = [dict(r) for r in db.execute("""
        SELECT ea.user_id, u.username, u.email, u.display_name, COUNT(*) as event_count,
               MAX(ea.created_at) as last_active
        FROM extension_analytics ea
        JOIN users u ON ea.user_id = u.id
        WHERE ea.created_at >= ?
        GROUP BY ea.user_id
        ORDER BY event_count DESC
        LIMIT 20
    """, (cutoff,)).fetchall()]

    # Daily active extension users
    daily = [dict(r) for r in db.execute("""
        SELECT DATE(created_at) as day, COUNT(DISTINCT user_id) as users, COUNT(*) as events
        FROM extension_analytics
        WHERE created_at >= ?
        GROUP BY DATE(created_at)
        ORDER BY day DESC
        LIMIT 30
    """, (cutoff,)).fetchall()]

    # Extension predictions vs website predictions
    ext_predictions = db.execute(
        "SELECT COUNT(*) as cnt FROM extension_analytics WHERE action = 'prediction' AND created_at >= ?", (cutoff,)
    ).fetchone()["cnt"]

    db.close()

    return {
        "total_extension_users": total_users,
        "total_events": total_events,
        "extension_predictions": ext_predictions,
        "by_action": by_action,
        "top_users": top_users,
        "daily": daily,
    }


@app.get("/api/user/security-status")
async def get_security_status(authorization: str = Header(None)):
    """Get user's security status (password cooldown, sensitive action restrictions)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    pwd_cooldown = user_auth.check_password_change_cooldown(payload["user_id"])
    sensitive = user_auth.check_sensitive_action_allowed(payload["user_id"])

    return {
        "password_change_allowed": pwd_cooldown["allowed"],
        "password_change_message": pwd_cooldown.get("message", ""),
        "password_change_remaining_seconds": pwd_cooldown.get("remaining_seconds", 0),
        "sensitive_actions_allowed": sensitive["allowed"],
        "sensitive_actions_message": sensitive.get("message", ""),
        "sensitive_actions_remaining_seconds": sensitive.get("remaining_seconds", 0),
    }


# ─── Invite System (Public Endpoints) ───

class InviteRegisterRequest(BaseModel):
    token: str
    email: str
    password: str
    display_name: str


@app.get("/api/invite/validate/{token}")
async def validate_invite_token(token: str):
    """Public endpoint to check if an invite token is valid."""
    info = employee_portal.validate_invite(token)
    if not info:
        raise HTTPException(status_code=404, detail="Invalid or expired invite link")
    return {"valid": True, **info}


@app.post("/api/invite/register")
async def register_via_invite(body: InviteRegisterRequest):
    """Register a new account via employee invite link. Bypasses access code and captcha."""
    # Validate the invite
    info = employee_portal.validate_invite(body.token)
    if not info:
        raise HTTPException(status_code=400, detail="Invalid or expired invite link")

    email = body.email.lower().strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if not body.display_name.strip():
        raise HTTPException(status_code=400, detail="Display name is required")

    # Check email not taken
    conn = user_auth._get_db()
    existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create account (bypass captcha + verification)
    username = user_auth._generate_unique_username(user_auth._get_db())
    password_hash = user_auth._hash_password(body.password)
    import random
    ref_code = user_auth._generate_referral_code()
    avatar_color = random.choice(user_auth.AVATAR_COLORS)
    now = datetime.now().isoformat()

    conn = user_auth._get_db()
    conn.execute(
        """INSERT INTO users (email, password_hash, display_name, username, avatar_color,
           referral_code, created_at, email_verified, staff_role, full_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
        (email, password_hash, body.display_name.strip(), username, avatar_color,
         ref_code, now, info["role_name"], body.display_name.strip()),
    )
    conn.commit()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()

    # Assign RBAC role
    role_conn = user_auth._get_db()
    role = role_conn.execute("SELECT id, department FROM roles WHERE name = ?", (info["role_name"],)).fetchone()
    role_conn.close()
    if role:
        admin_rbac.assign_role(user["id"], role["id"])

    # Mark invite as used
    employee_portal.use_invite(body.token, user["id"])

    # Create JWT token
    token = user_auth._create_token(user["id"], username, "free", False, info["role_name"])

    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "email": email,
            "display_name": body.display_name.strip(),
            "username": username,
            "staff_role": info["role_name"],
            "role_id": role["id"] if role else None,
            "department": info.get("department"),
        },
    }


@app.post("/api/user/register")
async def register(body: RegisterRequest, request: Request):
    """Register a new user account. Returns requires_verification if email needs to be verified."""
    if not body.terms_accepted:
        raise HTTPException(status_code=400, detail="You must accept the Terms of Service to create an account.")

    result = user_auth.register_user(
        email=body.email,
        password=body.password,
        display_name=body.display_name,
        referral_code=body.referral_code,
        captcha_token=body.captcha_token,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    # Save personal info if provided during registration
    has_personal = any([body.full_name, body.date_of_birth, body.security_question, body.security_answer, body.country])
    if has_personal:
        # Look up the user by email to get their ID
        conn = user_auth._get_db()
        user = conn.execute("SELECT id FROM users WHERE email = ?", (body.email.lower().strip(),)).fetchone()
        conn.close()
        if user:
            user_auth.update_personal_info(
                user_id=user["id"],
                full_name=body.full_name or None,
                date_of_birth=body.date_of_birth or None,
                security_question=body.security_question or None,
                security_answer=body.security_answer or None,
                country=body.country or None,
            )

    # Save terms acceptance timestamp
    if result.get("success"):
        conn = user_auth._get_db()
        user = conn.execute("SELECT id FROM users WHERE email = ?", (body.email.lower().strip(),)).fetchone()
        if user:
            conn.execute(
                "UPDATE users SET terms_accepted_at = ? WHERE id = ?",
                (datetime.now().isoformat(), user["id"])
            )
            conn.commit()
        conn.close()

    return result


@app.post("/api/user/login")
async def login(body: LoginRequest, request: Request):
    """Login with email and password."""
    client_ip = _get_client_ip(request)
    result = user_auth.login_user(
        email=body.email,
        password=body.password,
        captcha_token=body.captcha_token,
        client_ip=client_ip,
    )
    if not result["success"]:
        if result.get("account_locked"):
            return JSONResponse(
                status_code=423,
                content={
                    "success": False,
                    "account_locked": True,
                    "locked_until": result.get("locked_until", ""),
                    "remaining_seconds": result.get("remaining_seconds", 0),
                    "detail": result["error"],
                }
            )
        if result.get("captcha_required"):
            content = {
                "success": False,
                "captcha_required": True,
                "detail": result["error"],
            }
            if "attempts_remaining" in result:
                content["attempts_remaining"] = result["attempts_remaining"]
            return JSONResponse(status_code=428, content=content)
        if result.get("requires_verification"):
            return JSONResponse(
                status_code=403,
                content={
                    "success": False,
                    "requires_verification": True,
                    "email": result.get("email"),
                    "detail": result["error"],
                }
            )
        # Include attempts_remaining if present
        detail = result["error"]
        if "attempts_remaining" in result:
            return JSONResponse(
                status_code=401,
                content={
                    "success": False,
                    "detail": detail,
                    "attempts_remaining": result["attempts_remaining"],
                }
            )
        # Handle suspended account
        if result.get("suspended"):
            return JSONResponse(
                status_code=401,
                content={
                    "success": False,
                    "detail": detail,
                    "suspended": True,
                }
            )
        raise HTTPException(status_code=401, detail=detail)
    return result


@app.post("/api/user/google-login")
async def google_login(body: GoogleLoginRequest, request: Request):
    """Login or register via Google OAuth."""
    client_ip = _get_client_ip(request)
    result = user_auth.google_login(
        google_token=body.token,
        referral_code=body.referral_code,
        captcha_token=body.captcha_token,
        client_ip=client_ip,
        terms_accepted=body.terms_accepted,
    )
    if not result["success"]:
        if result.get("suspended"):
            return JSONResponse(
                status_code=401,
                content={"success": False, "detail": result["error"], "suspended": True}
            )
        raise HTTPException(status_code=401, detail=result["error"])
    return result


@app.post("/api/user/captcha-check")
async def captcha_check(body: CaptchaCheckRequest, request: Request):
    """Check if CAPTCHA is required for this login attempt."""
    client_ip = _get_client_ip(request)
    required = user_auth.check_captcha_required(body.email, client_ip)
    return {"captcha_required": required}


@app.post("/api/user/verify-email")
async def verify_email(request: VerifyEmailRequest):
    """Verify email with 6-digit code."""
    result = user_auth.verify_email(email=request.email, code=request.code)
    if not result["success"]:
        status = 429 if "wait" in result.get("error", "").lower() else 400
        raise HTTPException(status_code=status, detail=result["error"])
    return result


@app.post("/api/user/resend-code")
async def resend_code(request: ResendCodeRequest):
    """Resend verification code to email."""
    result = user_auth.resend_verification_code(email=request.email)
    if not result["success"]:
        raise HTTPException(status_code=429, detail=result["error"])
    return result


@app.post("/api/user/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Request a password reset link."""
    result = user_auth.request_password_reset(email=request.email)
    if not result.get("success"):
        if result.get("account_locked"):
            return JSONResponse(status_code=423, content={
                "success": False,
                "account_locked": True,
                "detail": result["error"],
            })
        raise HTTPException(status_code=400, detail=result.get("error", "Request failed"))
    return {"success": True, "message": "If an account exists with that email, a reset link has been sent."}


@app.post("/api/user/reset-password")
async def do_reset_password(request: ResetPasswordRequest):
    """Reset password using a valid token."""
    result = user_auth.reset_password(
        email=request.email,
        token=request.token,
        new_password=request.new_password,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.get("/api/user/me")
async def get_me(authorization: str = Header(None)):
    """Get current user profile from token."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    profile = user_auth.get_user_profile(payload["user_id"])
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    # Record heartbeat on profile fetch (happens on page load and refresh)
    community.record_heartbeat(
        payload["user_id"],
        display_name=profile.get("display_name", ""),
        username=profile.get("username", ""),
        avatar_color=profile.get("avatar_color", "#6c5ce7"),
    )
    return {"user": profile}


@app.post("/api/user/accept-terms")
async def accept_terms(authorization: str = Header(None)):
    """Accept Terms of Service (for existing users who haven't accepted yet)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = user_auth.accept_terms(payload["user_id"])
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["error"])
    return {"success": True}


@app.post("/api/heartbeat")
async def heartbeat(authorization: str = Header(None)):
    """Record user activity heartbeat for online tracking."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    profile = user_auth.get_user_profile(payload["user_id"])
    if profile:
        community.record_heartbeat(
            payload["user_id"],
            display_name=profile.get("display_name", ""),
            username=profile.get("username", ""),
            avatar_color=profile.get("avatar_color", "#6c5ce7"),
        )
    return {"ok": True}


@app.get("/api/active-users-count")
async def active_users_count():
    """Get count of currently active users (public)."""
    count = community.get_active_user_count()
    return {"active_users": count}


# Active users admin endpoint moved to admin_routes.py


@app.put("/api/user/username")
async def update_username(request: UpdateUsernameRequest, authorization: str = Header(None)):
    """Update username (must be unique)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = user_auth.update_username(payload["user_id"], request.username)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.put("/api/user/display-name")
async def update_display_name(request: UpdateDisplayNameRequest, authorization: str = Header(None)):
    """Update display name."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = user_auth.update_display_name(payload["user_id"], request.display_name)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.put("/api/user/mpesa-phone")
async def update_mpesa_phone(request: UpdateMpesaPhoneRequest, authorization: str = Header(None)):
    """Save/update user's M-Pesa phone for commission disbursements."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = user_auth.update_mpesa_phone(payload["user_id"], request.mpesa_phone)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.get("/api/user/check-username/{username}")
async def check_username(username: str):
    """Check if a username is available."""
    available = user_auth.check_username_available(username)
    return {"available": available, "username": username}


@app.get("/api/user/referral-stats")
async def get_referral_stats(authorization: str = Header(None)):
    """Get current user's referral statistics."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    stats = user_auth.get_referral_stats(payload["user_id"])
    return stats


@app.get("/api/user/profile/{username}")
async def get_public_profile(username: str):
    """Get a user's public profile by username (for referral links)."""
    profile = user_auth.get_public_profile(username)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user": profile}


UPLOADS_DIR = Path(__file__).parent / "uploads"
AVATARS_DIR = UPLOADS_DIR / "avatars"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2MB


@app.post("/api/user/avatar")
async def upload_avatar(file: UploadFile = File(...), authorization: str = Header(None)):
    """Upload a profile avatar image (max 2MB, jpeg/png/gif/webp)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, GIF, and WebP images are allowed")

    contents = await file.read()
    if len(contents) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Image must be smaller than 2MB")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    if ext not in ("jpg", "jpeg", "png", "gif", "webp"):
        ext = "jpg"

    filename = f"{payload['user_id']}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = AVATARS_DIR / filename
    AVATARS_DIR.mkdir(parents=True, exist_ok=True)

    # Delete old avatar file if exists
    profile = user_auth.get_user_profile(payload["user_id"])
    if profile and profile.get("avatar_url"):
        old_file = AVATARS_DIR / profile["avatar_url"].split("/")[-1]
        if old_file.exists():
            old_file.unlink()

    with open(filepath, "wb") as f:
        f.write(contents)

    avatar_url = f"/api/uploads/avatars/{filename}"
    result = user_auth.update_avatar_url(payload["user_id"], avatar_url)
    return result


@app.delete("/api/user/avatar")
async def delete_avatar(authorization: str = Header(None)):
    """Remove the user's profile avatar."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    profile = user_auth.get_user_profile(payload["user_id"])
    if profile and profile.get("avatar_url"):
        old_file = AVATARS_DIR / profile["avatar_url"].split("/")[-1]
        if old_file.exists():
            old_file.unlink()

    result = user_auth.update_avatar_url(payload["user_id"], None)
    return result


@app.get("/api/uploads/avatars/{filename}")
async def serve_avatar(filename: str):
    """Serve an uploaded avatar image."""
    filepath = AVATARS_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Avatar not found")
    return FileResponse(str(filepath))


@app.put("/api/user/personal-info")
async def update_personal_info(req: PersonalInfoRequest, authorization: str = Header(None)):
    """Update user's personal information (full name, DOB, security question/answer)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = user_auth.update_personal_info(
        user_id=payload["user_id"],
        full_name=req.full_name,
        date_of_birth=req.date_of_birth,
        security_question=req.security_question,
        security_answer=req.security_answer,
        country=req.country,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return {"success": True}


@app.post("/api/user/whatsapp/verify-send")
async def whatsapp_verify_send(req: WhatsAppVerifySendRequest, authorization: str = Header(None)):
    """Send a WhatsApp OTP verification code to the user's number."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = user_auth.send_whatsapp_verification(payload["user_id"], req.phone_number)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/api/user/whatsapp/verify-confirm")
async def whatsapp_verify_confirm(req: WhatsAppVerifyConfirmRequest, authorization: str = Header(None)):
    """Confirm the WhatsApp OTP code."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = user_auth.verify_whatsapp(payload["user_id"], req.code)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.delete("/api/user/account")
async def delete_account(req: DeleteAccountRequest, authorization: str = Header(None)):
    """Delete the current user's account after password verification."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Verify password
    conn = user_auth._get_db()
    user = conn.execute("SELECT password_hash FROM users WHERE id = ?", (payload["user_id"],)).fetchone()
    conn.close()
    if not user or not user_auth._verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=403, detail="Incorrect password")

    # Delete community data first, then user account
    community.delete_user_data(payload["user_id"])
    result = user_auth.delete_user(payload["user_id"])
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["error"])

    return {"success": True, "message": "Account deleted successfully"}


# ==================== END USER AUTH ENDPOINTS ====================


# ==================== SUBSCRIPTION ENDPOINTS ====================

@app.get("/api/subscription/plans")
async def get_plans():
    """Get available subscription plans."""
    return {"plans": subscriptions.get_plans()}


@app.get("/api/pricing")
async def get_public_pricing():
    """Get all public pricing info (plans, pay-per-use, commissions, free limits)."""
    return pricing_config.get_public_pricing()


# ─── Geo Detection (Public) ───

import time as _time
import httpx as _httpx

_geo_cache: dict = {}  # { ip: (country_code, timestamp) }
_GEO_CACHE_TTL = 3600  # 1 hour


@app.get("/api/geo/detect")
async def detect_geo(request: Request):
    """Detect user's country from IP and return appropriate currency."""
    ip = _get_client_ip(request)
    # Check cache
    if ip in _geo_cache:
        code, ts = _geo_cache[ip]
        if _time.time() - ts < _GEO_CACHE_TTL:
            return {"country_code": code, "currency": "KES" if code == "KE" else "USD"}
    # Private/local IPs → USD
    if ip in ("127.0.0.1", "::1", "unknown") or ip.startswith(("10.", "192.168.", "172.")):
        return {"country_code": "US", "currency": "USD"}
    # Call ip-api.com
    try:
        async with _httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"http://ip-api.com/json/{ip}?fields=countryCode")
            data = resp.json()
            code = data.get("countryCode", "US")
            _geo_cache[ip] = (code, _time.time())
            return {"country_code": code, "currency": "KES" if code == "KE" else "USD"}
    except Exception:
        return {"country_code": "US", "currency": "USD"}


# ─── Documentation Endpoints (Public) ───

import docs_content

@app.get("/api/docs")
async def get_docs():
    """Return all documentation sections (public, no auth required)."""
    return {"sections": docs_content.get_all_sections()}

@app.get("/api/docs/{section_id}")
async def get_doc_section(section_id: str):
    """Return a specific documentation section."""
    section = docs_content.get_section(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    return section


@app.get("/api/subscription/limits")
async def get_tier_limits(authorization: str = Header(None)):
    """Get feature limits for current user's tier."""
    payload = _get_current_user(authorization)
    tier = payload["tier"] if payload else "free"
    return {"tier": tier, "limits": subscriptions.get_tier_limits(tier)}


@app.get("/api/subscription/status")
async def get_subscription_status(authorization: str = Header(None)):
    """Get current user's subscription status."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    sub = subscriptions.get_active_subscription(payload["user_id"])
    return {
        "has_subscription": sub is not None,
        "subscription": sub,
        "tier": payload["tier"],
        "has_used_trial": user_auth.has_used_trial(payload["user_id"]),
    }


class SubscribeRequest(BaseModel):
    plan_id: str
    payment_method: str = ""
    payment_ref: str = ""


@app.post("/api/subscription/subscribe")
async def subscribe(request: SubscribeRequest, authorization: str = Header(None)):
    """Create a new subscription (after payment confirmation)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = subscriptions.create_subscription(
        user_id=payload["user_id"],
        plan_id=request.plan_id,
        payment_method=request.payment_method,
        payment_ref=request.payment_ref,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


class BalancePayRequest(BaseModel):
    plan_id: str


@app.post("/api/subscription/pay-with-balance")
async def pay_with_balance(request: BalancePayRequest, authorization: str = Header(None)):
    """Pay for a subscription using account balance (user_balances + creator_wallets)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = payload["user_id"]

    # Get the plan details
    plans = subscriptions.get_plans()
    if request.plan_id not in plans:
        raise HTTPException(status_code=400, detail="Invalid plan")

    plan = plans[request.plan_id]
    plan_price = plan["price"]
    plan_currency = plan["currency"]

    # Get user's balances
    user_balance = community.get_user_balance(user_id)
    creator_wallet = community.get_creator_wallet(user_id)

    user_usd = user_balance.get("balance_usd", 0)
    user_kes = user_balance.get("balance_kes", 0)
    creator_usd = creator_wallet.get("balance_usd", 0)
    creator_kes = creator_wallet.get("balance_kes", 0)

    # Fetch exchange rate for cross-currency conversion
    try:
        kes_rate = (await daraja_payment._fetch_exchange_rate()) or 130.0
    except Exception:
        kes_rate = 130.0

    # Calculate total available balance in the plan's currency (converting across currencies)
    if plan_currency == "KES":
        total_available = (
            round(user_usd * kes_rate) + round(user_kes)
            + round(creator_usd * kes_rate) + round(creator_kes)
        )
    else:
        total_available = (
            user_usd + creator_usd
            + (user_kes + creator_kes) / kes_rate if kes_rate > 0 else 0
        )

    if total_available < plan_price:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance. You have {plan_currency} {total_available:,.2f} but need {plan_currency} {plan_price:,.2f}"
        )

    # Deduct from balances: prefer same-currency first, then cross-currency
    remaining = plan_price
    deducted_user_usd = 0
    deducted_user_kes = 0
    deducted_creator_usd = 0
    deducted_creator_kes = 0

    if plan_currency == "KES":
        # 1. User KES first
        if remaining > 0 and user_kes > 0:
            take = min(user_kes, remaining)
            deducted_user_kes = take
            remaining -= take
        # 2. Creator KES
        if remaining > 0 and creator_kes > 0:
            take = min(creator_kes, remaining)
            deducted_creator_kes = take
            remaining -= take
        # 3. User USD (converted to KES)
        if remaining > 0 and user_usd > 0:
            kes_from_usd = round(user_usd * kes_rate)
            take_kes = min(kes_from_usd, remaining)
            take_usd = take_kes / kes_rate
            deducted_user_usd = round(take_usd, 2)
            remaining -= take_kes
        # 4. Creator USD (converted to KES)
        if remaining > 0 and creator_usd > 0:
            kes_from_usd = round(creator_usd * kes_rate)
            take_kes = min(kes_from_usd, remaining)
            take_usd = take_kes / kes_rate
            deducted_creator_usd = round(take_usd, 2)
            remaining -= take_kes
    else:
        # USD plan: prefer USD first, then KES converted
        # 1. User USD first
        if remaining > 0 and user_usd > 0:
            take = min(user_usd, remaining)
            deducted_user_usd = take
            remaining -= take
        # 2. Creator USD
        if remaining > 0 and creator_usd > 0:
            take = min(creator_usd, remaining)
            deducted_creator_usd = take
            remaining -= take
        # 3. User KES (converted to USD)
        if remaining > 0 and user_kes > 0 and kes_rate > 0:
            usd_from_kes = user_kes / kes_rate
            take_usd = min(usd_from_kes, remaining)
            take_kes = round(take_usd * kes_rate, 2)
            deducted_user_kes = take_kes
            remaining -= take_usd
        # 4. Creator KES (converted to USD)
        if remaining > 0 and creator_kes > 0 and kes_rate > 0:
            usd_from_kes = creator_kes / kes_rate
            take_usd = min(usd_from_kes, remaining)
            take_kes = round(take_usd * kes_rate, 2)
            deducted_creator_kes = take_kes
            remaining -= take_usd

    # Apply deductions
    if deducted_user_usd > 0 or deducted_user_kes > 0:
        community.adjust_user_balance(
            user_id, -deducted_user_usd, -deducted_user_kes,
            f"Subscription: {plan['name']}", "subscription_payment", user_id, "self"
        )
    if deducted_creator_usd > 0 or deducted_creator_kes > 0:
        community.adjust_creator_wallet(
            user_id, -deducted_creator_usd, -deducted_creator_kes,
            f"Subscription: {plan['name']}"
        )

    # Create the subscription
    ref = f"BAL-{user_id}-{int(datetime.now().timestamp())}"
    result = subscriptions.create_subscription(
        user_id=user_id,
        plan_id=request.plan_id,
        payment_method="balance",
        payment_ref=ref,
    )

    if not result["success"]:
        # Refund if subscription creation fails
        if deducted_user_usd > 0 or deducted_user_kes > 0:
            community.adjust_user_balance(
                user_id, deducted_user_usd, deducted_user_kes,
                "Refund: subscription failed", "refund", user_id, "system"
            )
        if deducted_creator_usd > 0 or deducted_creator_kes > 0:
            community.adjust_creator_wallet(
                user_id, deducted_creator_usd, deducted_creator_kes,
                "Refund: subscription failed"
            )
        raise HTTPException(status_code=400, detail=result.get("error", "Subscription failed"))

    # Create notification
    amount_str = f"KES {plan_price:,.0f}" if plan_currency == "KES" else f"${plan_price:,.2f}"
    community.create_notification(
        user_id=user_id,
        notif_type="subscription_balance",
        title="Subscription Activated!",
        message=f"You subscribed to {plan['name']} using your account balance ({amount_str}). Expires: {result.get('expires_at', '')[:10]}",
        metadata={"plan_id": request.plan_id, "amount": plan_price, "currency": plan_currency, "payment_ref": ref},
    )

    # Send invoice email in background
    import threading
    user_info = user_auth.get_user_email_by_id(user_id)
    if user_info and user_info.get("email"):
        threading.Thread(target=user_auth.send_invoice_email, kwargs={
            "to_email": user_info["email"],
            "display_name": user_info.get("display_name", ""),
            "invoice_number": ref,
            "transaction_type": "subscription",
            "amount_kes": plan_price if plan_currency == "KES" else 0,
            "amount_usd": plan_price if plan_currency == "USD" else 0,
            "payment_method": "Account Balance",
            "receipt_number": ref,
            "reference_id": request.plan_id,
            "completed_at": datetime.now().isoformat(),
        }, daemon=True).start()

    return {
        "success": True,
        "expires_at": result.get("expires_at"),
        "plan": request.plan_id,
        "deducted_user_usd": deducted_user_usd,
        "deducted_user_kes": deducted_user_kes,
        "deducted_creator_usd": deducted_creator_usd,
        "deducted_creator_kes": deducted_creator_kes,
        "payment_ref": ref,
    }


@app.post("/api/subscription/cancel")
async def cancel_subscription(authorization: str = Header(None)):
    """Cancel current subscription."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = subscriptions.cancel_subscription(payload["user_id"])
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.get("/api/subscription/history")
async def get_subscription_history(authorization: str = Header(None)):
    """Get subscription history."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"history": subscriptions.get_subscription_history(payload["user_id"])}


# ==================== END SUBSCRIPTION ENDPOINTS ====================


# ==================== PAYMENT ENDPOINTS (DARAJA / M-PESA) ====================

async def _payment_expiry_checker():
    """Background task: expire stale payment transactions every 2 minutes."""
    while True:
        try:
            await asyncio.sleep(120)
            expired = daraja_payment.expire_stale_transactions(minutes=15)
            if expired:
                print(f"[Payment] Expired {expired} stale transaction(s)")
        except Exception as e:
            print(f"[Payment] Expiry checker error: {e}")


async def _weekly_disbursement_generator():
    """Background task: auto-generate disbursement batch on Fridays at 10:00 AM EAT (UTC+3)."""
    while True:
        try:
            await asyncio.sleep(300)  # Check every 5 minutes
            now = datetime.now()
            eat_hour = (now.hour + 3) % 24  # Server is UTC, EAT = UTC+3

            if now.weekday() == 4 and eat_hour == 10 and now.minute < 5:
                result = await daraja_payment.generate_disbursement_batch()
                if result["success"]:
                    print(f"[Disbursement] Friday batch generated: {result['total_users']} users, "
                          f"${result['total_amount_usd']:.2f} USD / KES {result['total_amount_kes']:.0f}")
                else:
                    print(f"[Disbursement] Batch skipped: {result.get('error', '')}")
        except Exception as e:
            print(f"[Disbursement] Weekly generator error: {e}")


async def _daily_predictions_generator():
    """Background task: generate 10 free daily predictions. Checks every 30 minutes, generates once per day."""
    await asyncio.sleep(60)  # Wait for other services to initialize
    while True:
        try:
            from daily_picks import generate_daily_predictions
            await generate_daily_predictions()
        except Exception as e:
            print(f"[DAILY PICKS] Error: {e}")
        await asyncio.sleep(1800)  # Check every 30 minutes


async def _prediction_result_checker():
    """Background task: check finished matches and update community + track record predictions every 5 minutes."""
    while True:
        try:
            await asyncio.sleep(300)  # Every 5 minutes

            # Get unfinished prediction info from BOTH databases
            comm_info = community.get_unfinished_prediction_info()
            tracker_info = prediction_tracker.get_unfinished_prediction_info()

            # Merge dates and team keys from both sources
            past_dates = sorted(set(comm_info["dates"]) | set(tracker_info["dates"]))
            team_keys = comm_info["team_keys"] | tracker_info["team_keys"]

            if not past_dates:
                continue  # No unfinished predictions in either database

            # Helper to pre-filter: only keep finished fixtures matching our prediction team pairs
            def is_relevant(f):
                if f.get("status") not in ("FT", "AET", "PEN"):
                    return False
                h = f.get("home_team", {}).get("id")
                a = f.get("away_team", {}).get("id")
                return f"{h}-{a}" in team_keys

            # 1. Check today's fixtures
            all_finished = []
            fixtures = await football_api.fetch_todays_fixtures()
            if fixtures:
                all_finished.extend([f for f in fixtures if is_relevant(f)])

            # 2. Check all dates from each prediction date up to today
            # (prediction date != match date; match could be days later)
            from datetime import timedelta
            today_dt = datetime.now()
            today_yyyymmdd = today_dt.strftime("%Y%m%d")
            all_dates_to_check = set()
            for date_str in past_dates:
                try:
                    pred_dt = datetime.strptime(date_str, "%Y%m%d")
                    d = pred_dt
                    while d <= today_dt:
                        all_dates_to_check.add(d.strftime("%Y%m%d"))
                        d += timedelta(days=1)
                except ValueError:
                    all_dates_to_check.add(date_str)
            # Remove today (already checked via today's fixtures)
            all_dates_to_check.discard(today_yyyymmdd)

            for date_str in sorted(all_dates_to_check):
                api_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
                past_fixtures = await football_api.fetch_fixtures_by_date(api_date)
                if past_fixtures:
                    all_finished.extend([f for f in past_fixtures if is_relevant(f)])

            if not all_finished:
                print(f"[Predictions] No matching finished fixtures (dates: {past_dates}, team_keys: {team_keys})")
                continue

            print(f"[Predictions] Found {len(all_finished)} relevant finished fixtures for {len(team_keys)} prediction team pairs")

            # Update community predictions
            result = community.check_and_update_finished_predictions(all_finished)
            if result["updated"] > 0:
                print(f"[Predictions] Community: Updated {result['updated']} predictions: "
                      f"{result['correct']} correct, {result['incorrect']} incorrect, "
                      f"{result['notified_followers']} followers notified")

            # Update track record predictions
            tracker_result = prediction_tracker.check_and_update_from_fixtures(all_finished)
            if tracker_result["updated"] > 0:
                print(f"[Predictions] Track Record: Updated {tracker_result['updated']} predictions: "
                      f"{tracker_result['correct']} correct, {tracker_result['incorrect']} incorrect")

            if result["updated"] == 0 and tracker_result["updated"] == 0:
                print(f"[Predictions] No predictions matched any finished fixtures")
        except Exception as e:
            import traceback
            print(f"[Predictions] Result checker error: {e}")
            traceback.print_exc()


class MpesaQuoteRequest(BaseModel):
    amount_kes: float = 0
    amount_usd: float = 0


class MpesaPaymentRequest(BaseModel):
    phone: str
    amount_kes: float
    transaction_type: str
    reference_id: str = ""


class WithdrawalRequest(BaseModel):
    amount_usd: float
    phone: str = ""
    withdrawal_method: str = "mpesa"


@app.post("/api/payment/quote")
async def get_payment_quote(request: MpesaQuoteRequest, authorization: str = Header(None)):
    """Get KES to USD or USD to KES conversion quote."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if request.amount_kes > 0:
        result = await daraja_payment.get_kes_to_usd_quote(request.amount_kes)
    elif request.amount_usd > 0:
        result = await daraja_payment.get_usd_to_kes_quote(request.amount_usd)
    else:
        raise HTTPException(status_code=400, detail="Provide amount_kes or amount_usd")
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Quote failed"))
    return result


@app.post("/api/payment/mpesa/initiate")
async def initiate_mpesa_payment(request: MpesaPaymentRequest, authorization: str = Header(None)):
    """Initiate M-Pesa STK push via Daraja API."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Validate subscription requests: plan must exist and amount must match
    if request.transaction_type == "subscription":
        plans = subscriptions.get_plans()
        if not request.reference_id or request.reference_id not in plans:
            raise HTTPException(status_code=400, detail="Invalid subscription plan")
        # Check trial eligibility BEFORE charging (prevent M-Pesa charge then rejection)
        if request.reference_id in subscriptions.TRIAL_PLAN_IDS:
            import user_auth
            if user_auth.has_used_trial(payload["user_id"]):
                raise HTTPException(status_code=400, detail="You have already used your free trial. Please select a different plan.")
        plan = plans[request.reference_id]
        if plan["currency"] == "KES":
            # Amount must match the plan price exactly
            if abs(request.amount_kes - plan["price"]) > 1:
                raise HTTPException(status_code=400, detail="Payment amount does not match plan price")
        else:
            # USD plan paid via M-Pesa: verify KES equivalent is reasonable
            quote = await daraja_payment.get_usd_to_kes_quote(plan["price"])
            if quote.get("success") and abs(request.amount_kes - quote["amount_kes"]) > 50:
                raise HTTPException(status_code=400, detail="Payment amount does not match plan price")

    # Validate allowed transaction types
    if request.transaction_type not in ("subscription", "balance_topup", "prediction_purchase"):
        raise HTTPException(status_code=400, detail="Invalid transaction type")

    result = await daraja_payment.initiate_stk_push(
        phone=request.phone,
        amount_kes=request.amount_kes,
        user_id=payload["user_id"],
        transaction_type=request.transaction_type,
        reference_id=request.reference_id,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Payment initiation failed"))
    return result


@app.post("/api/payment/mpesa/callback")
async def daraja_mpesa_callback(request: Request):
    """Daraja STK Push callback — Safaricom POSTs payment results here (unauthenticated)."""
    try:
        callback_data = await request.json()
        await daraja_payment.handle_stk_callback(callback_data)
    except Exception as e:
        print(f"[Daraja Callback] Error: {e}")
    # Always return 200 to Safaricom regardless of outcome
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


@app.post("/api/payment/mpesa/b2c/result")
async def daraja_b2c_result_callback(request: Request):
    """B2C result callback — Safaricom POSTs when disbursement completes/fails."""
    try:
        callback_data = await request.json()
        print(f"[B2C Result] {callback_data}")
        await daraja_payment.handle_b2c_result_callback(callback_data)
    except Exception as e:
        print(f"[B2C Result Callback] Error: {e}")
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


@app.post("/api/payment/mpesa/b2c/timeout")
async def daraja_b2c_timeout_callback(request: Request):
    """B2C timeout callback — Safaricom POSTs when request times out."""
    try:
        callback_data = await request.json()
        print(f"[B2C Timeout] {callback_data}")
        await daraja_payment.handle_b2c_timeout_callback(callback_data)
    except Exception as e:
        print(f"[B2C Timeout Callback] Error: {e}")
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


@app.get("/api/payment/status/{transaction_id}")
async def get_payment_status(transaction_id: int, authorization: str = Header(None)):
    """Check M-Pesa payment status. Frontend polls this."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = await daraja_payment.check_payment_status(transaction_id, payload["user_id"])
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Status check failed"))
    return result


@app.get("/api/payment/history")
async def get_payment_history(authorization: str = Header(None)):
    """Get user's payment transaction history."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"transactions": daraja_payment.get_user_transactions(payload["user_id"])}


@app.get("/api/user/transactions")
async def get_user_transactions_unified(
    filter: str = Query("all"),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    authorization: str = Header(None),
):
    """Get unified transaction history across all payment types."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    import transactions
    return transactions.get_unified_transactions(payload["user_id"], filter, offset, limit)


# ==================== WITHDRAWAL ENDPOINTS ====================

@app.post("/api/withdrawal/request")
async def request_withdrawal(body: WithdrawalRequest, authorization: str = Header(None)):
    """Request a withdrawal via M-Pesa or Whop."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = daraja_payment.request_withdrawal(
        user_id=payload["user_id"],
        amount_usd=body.amount_usd,
        phone=body.phone,
        withdrawal_method=body.withdrawal_method,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Withdrawal request failed"))
    return result


@app.get("/api/withdrawal/history")
async def get_withdrawal_history(authorization: str = Header(None)):
    """Get user's withdrawal history."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"withdrawals": daraja_payment.get_user_withdrawals(payload["user_id"])}


@app.get("/api/withdrawal/whop-available")
async def check_whop_withdrawal_available(authorization: str = Header(None)):
    """Check if user has a linked Whop account for USD withdrawals."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    profile = user_auth.get_user_profile(payload["user_id"])
    has_whop = bool(profile and profile.get("whop_user_id"))
    return {"available": has_whop, "whop_user_id": profile.get("whop_user_id", "") if profile else ""}


# ==================== WITHDRAWAL OPTIONS ENDPOINTS ====================

class AddWithdrawalOptionRequest(BaseModel):
    method: str  # 'mpesa' or 'whop'
    mpesa_phone: str = ""

class VerifyPhoneOTPRequest(BaseModel):
    phone: str
    code: str

class SetPrimaryOptionRequest(BaseModel):
    method: str

class FeePreviewRequest(BaseModel):
    amount_usd: float = 0
    method: str = "mpesa"


@app.get("/api/withdrawal/options")
async def get_withdrawal_options(authorization: str = Header(None)):
    """Get user's configured withdrawal options."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return daraja_payment.get_withdrawal_options(payload["user_id"])


@app.post("/api/withdrawal/options/add")
async def add_withdrawal_option(body: AddWithdrawalOptionRequest, authorization: str = Header(None)):
    """Add a withdrawal method. M-Pesa triggers OTP; Whop activates immediately with cooldown."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = daraja_payment.add_withdrawal_option(
        user_id=payload["user_id"],
        method=body.method,
        phone=body.mpesa_phone,
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
    return result


@app.post("/api/withdrawal/options/verify-phone")
async def verify_phone_otp(body: VerifyPhoneOTPRequest, authorization: str = Header(None)):
    """Verify M-Pesa phone with SMS OTP code."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = daraja_payment.verify_phone_otp(
        user_id=payload["user_id"],
        phone=body.phone,
        code=body.code,
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
    return result


@app.delete("/api/withdrawal/options/{method}")
async def remove_withdrawal_option(method: str, authorization: str = Header(None)):
    """Remove a withdrawal method."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = daraja_payment.remove_withdrawal_option(payload["user_id"], method)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
    return result


@app.put("/api/withdrawal/options/primary")
async def set_primary_withdrawal_option(body: SetPrimaryOptionRequest, authorization: str = Header(None)):
    """Set which method to use for automatic weekly withdrawals."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = daraja_payment.set_primary_withdrawal_option(payload["user_id"], body.method)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
    return result


@app.post("/api/withdrawal/fee-preview")
async def get_withdrawal_fee_preview(body: FeePreviewRequest, authorization: str = Header(None)):
    """Get fee breakdown for a withdrawal amount and method."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if body.amount_usd <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    result = await daraja_payment.get_withdrawal_fee_preview(body.amount_usd, body.method)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed"))
    return result


# Withdrawal admin endpoints moved to admin_routes.py


# ==================== USER PREFERENCES (cross-device sync) ====================

class UserPreferencesRequest(BaseModel):
    preferences: dict


@app.get("/api/user/preferences")
async def get_user_preferences(authorization: str = Header(None)):
    """Get user preferences (sound, theme, tracked matches, etc.)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    import sqlite3 as _sql3
    conn = _sql3.connect("users.db")
    conn.row_factory = _sql3.Row
    row = conn.execute("SELECT preferences FROM users WHERE id = ?", (payload["user_id"],)).fetchone()
    conn.close()
    prefs = {}
    if row and row["preferences"]:
        try:
            prefs = json.loads(row["preferences"])
        except Exception:
            pass
    return {"preferences": prefs}


@app.put("/api/user/preferences")
async def update_user_preferences(body: UserPreferencesRequest, authorization: str = Header(None)):
    """Update user preferences (merges with existing)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    import sqlite3 as _sql3
    conn = _sql3.connect("users.db")
    conn.row_factory = _sql3.Row
    row = conn.execute("SELECT preferences FROM users WHERE id = ?", (payload["user_id"],)).fetchone()
    existing = {}
    if row and row["preferences"]:
        try:
            existing = json.loads(row["preferences"])
        except Exception:
            pass
    # Merge new preferences into existing
    existing.update(body.preferences)
    conn.execute("UPDATE users SET preferences = ? WHERE id = ?",
                 (json.dumps(existing), payload["user_id"]))
    conn.commit()
    conn.close()
    return {"success": True, "preferences": existing}


# ==================== WHOP OAUTH LOGIN ENDPOINTS ====================

class WhopOAuthCallbackRequest(BaseModel):
    code: str
    state: str
    terms_accepted: bool = False


@app.get("/api/whop/oauth/authorize")
async def whop_oauth_authorize(request: Request):
    """Generate Whop OAuth authorization URL."""
    redirect_uri = "https://spark-ai-prediction.com/auth/whop/callback"
    result = whop_payment.create_oauth_authorize_url(redirect_uri)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Whop OAuth not configured"))
    return {"redirect_url": result["redirect_url"]}


@app.post("/api/whop/oauth/callback")
async def whop_oauth_callback(body: WhopOAuthCallbackRequest, request: Request):
    """Exchange Whop OAuth code for tokens and log in / create user."""
    redirect_uri = "https://spark-ai-prediction.com/auth/whop/callback"
    exchange = whop_payment.exchange_oauth_code(body.code, body.state, redirect_uri)
    if not exchange.get("success"):
        raise HTTPException(status_code=400, detail=exchange.get("error", "OAuth exchange failed"))

    client_ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "")
    result = user_auth.whop_oauth_login(
        whop_user_id=exchange["whop_user_id"],
        email=exchange["email"],
        name=exchange.get("name", ""),
        username=exchange.get("username", ""),
        terms_accepted=body.terms_accepted,
        client_ip=client_ip,
    )

    if not result.get("success"):
        if result.get("needs_terms"):
            return {"success": False, "needs_terms": True, "error": result.get("error", "")}
        raise HTTPException(status_code=400, detail=result.get("error", "Login failed"))

    return result


# ==================== WHOP PAYMENT ENDPOINTS ====================

class WhopCheckoutRequest(BaseModel):
    transaction_type: str  # 'subscription', 'prediction_purchase', 'balance_topup'
    plan_id: str = ""
    prediction_id: int = 0
    amount_usd: float = 0


@app.post("/api/whop/create-checkout")
async def create_whop_checkout(body: WhopCheckoutRequest, authorization: str = Header(None)):
    """Create a Whop checkout session for card payments."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = payload["user_id"]

    if body.transaction_type == "subscription":
        plans = subscriptions.get_plans()
        if not body.plan_id or body.plan_id not in plans:
            raise HTTPException(status_code=400, detail="Invalid plan")
        plan = plans[body.plan_id]
        amount = plan["price"]
        # Convert KES plans to USD
        if plan["currency"] == "KES":
            amount = round(plan["price"] / 130.0, 2)
        redirect_url = "https://spark-ai-prediction.com/upgrade"
        result = whop_payment.create_checkout_session(
            user_id=user_id,
            transaction_type="subscription",
            amount_usd=amount,
            reference_id=body.plan_id,
            plan_type="one_time",
            title=plan["name"],
            redirect_url=redirect_url,
        )

    elif body.transaction_type == "prediction_purchase":
        if not body.prediction_id:
            raise HTTPException(status_code=400, detail="Missing prediction_id")
        # Get prediction price from DB
        pred = community.get_prediction(body.prediction_id)
        if not pred or not pred.get("is_paid"):
            raise HTTPException(status_code=404, detail="Prediction not found or not paid")
        result = whop_payment.create_checkout_session(
            user_id=user_id,
            transaction_type="prediction_purchase",
            amount_usd=pred["price_usd"],
            reference_id=str(body.prediction_id),
            plan_type="one_time",
            title=f"Unlock: {pred.get('team_a_name', '')} vs {pred.get('team_b_name', '')}",
            redirect_url="https://spark-ai-prediction.com/community",
        )

    elif body.transaction_type == "balance_topup":
        if body.amount_usd < 2.0:
            raise HTTPException(status_code=400, detail="Minimum top-up is $2.00")
        result = whop_payment.create_checkout_session(
            user_id=user_id,
            transaction_type="balance_topup",
            amount_usd=body.amount_usd,
            reference_id="",
            plan_type="one_time",
            title="Account Balance Top-up",
            redirect_url="https://spark-ai-prediction.com/upgrade",
        )

    else:
        raise HTTPException(status_code=400, detail="Invalid transaction type")

    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("error", "Checkout creation failed"))

    return result


@app.post("/api/webhook/whop")
async def handle_whop_webhook(request: Request):
    """Handle incoming Whop webhook events. Public endpoint, signature-verified."""
    try:
        body = await request.body()
        headers = dict(request.headers)

        # Verify webhook signature
        print(f"[Whop Webhook] Received webhook, body length: {len(body)}")
        if not whop_payment.verify_webhook(body, headers):
            print(f"[Whop Webhook] Signature verification FAILED")
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
        print(f"[Whop Webhook] Signature verified OK")

        event = json.loads(body)
        # Whop sends event types with underscores (payment_succeeded)
        # Normalize to underscores so both formats work
        event_type = event.get("type", "").replace(".", "_")
        print(f"[Whop Webhook] Received event: {event_type}")

        if event_type == "payment_succeeded":
            result = whop_payment.process_payment_webhook(event)
        elif event_type == "payment_failed":
            result = whop_payment.process_payment_failed(event)
        else:
            result = {"success": True, "message": f"Event {event_type} acknowledged"}

        return {"ok": True}

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Whop webhook: {e}")
        return {"ok": True}  # Always return 200 to prevent retries


@app.get("/api/whop/check-payment/{checkout_id}")
async def check_whop_payment(checkout_id: str, authorization: str = Header(None)):
    """Check if a Whop payment has been completed (for polling from frontend).
    Checks our DB first, then queries Whop API directly if still pending."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    status = whop_payment.check_and_fulfill_payment(checkout_id, payload["user_id"])
    return {"status": status}


@app.get("/api/user/referral-earnings")
async def get_referral_earnings(authorization: str = Header(None)):
    """Get the authenticated user's referral earnings history."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return whop_payment.get_referral_earnings(payload["user_id"])


# ==================== END PAYMENT ENDPOINTS ====================


# ==================== USER BALANCE ENDPOINTS ====================

@app.get("/api/user/balance")
async def get_user_balance(authorization: str = Header(None)):
    """Get the authenticated user's account balance."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    balance = community.get_user_balance(payload["user_id"])
    return {"balance": balance}


# Balance admin endpoints moved to admin_routes.py


# ==================== END USER BALANCE ENDPOINTS ====================


# ==================== PREDICTION TRACK RECORD ENDPOINTS ====================

class UpdateResultRequest(BaseModel):
    fixture_id: str
    home_goals: int
    away_goals: int


@app.get("/api/predictions")
async def get_predictions(limit: int = 50):
    """Get all stored predictions."""
    raw = prediction_tracker.get_all_predictions(limit)

    # Build a lookup of user_id -> display_name from users.db
    user_ids = set(p.get("user_id") for p in raw if p.get("user_id"))
    user_names = {}
    if user_ids:
        try:
            import sqlite3 as _sqlite3
            _uconn = _sqlite3.connect("users.db")
            _uconn.row_factory = _sqlite3.Row
            placeholders = ",".join("?" for _ in user_ids)
            _rows = _uconn.execute(
                f"SELECT id, display_name, username FROM users WHERE id IN ({placeholders})",
                list(user_ids),
            ).fetchall()
            for r in _rows:
                user_names[r["id"]] = r["display_name"] or r["username"] or f"User #{r['id']}"
            _uconn.close()
        except Exception:
            pass  # If users.db lookup fails, we'll just show "—"

    # Map database column names to frontend-expected field names
    predictions = []
    for p in raw:
        mapped = dict(p)
        mapped["home_team"] = p.get("team_a_name", "?")
        mapped["away_team"] = p.get("team_b_name", "?")
        mapped["match"] = f"{p.get('team_a_name', '?')} vs {p.get('team_b_name', '?')}"
        mapped["predicted_outcome"] = p.get("predicted_result", "")
        mapped["league"] = p.get("competition", "")
        # Add user info
        uid = p.get("user_id")
        mapped["user_name"] = user_names.get(uid, "System") if uid else "System"
        # Map result_correct (0/1/None) to correct (true/false/null)
        rc = p.get("result_correct")
        if rc is not None:
            mapped["correct"] = bool(rc)
            mapped["status"] = "correct" if rc else "incorrect"
        else:
            mapped["correct"] = None
            mapped["status"] = "pending"
        # Build actual score string
        hg = p.get("actual_home_goals")
        ag = p.get("actual_away_goals")
        if hg is not None and ag is not None:
            mapped["score"] = f"{hg} - {ag}"
            mapped["actual"] = f"{hg} - {ag}"
        predictions.append(mapped)
    return {"predictions": predictions}


@app.get("/api/predictions/accuracy")
async def get_prediction_accuracy():
    """Get overall prediction accuracy stats."""
    stats = prediction_tracker.get_accuracy_stats()
    return stats


@app.get("/api/predictions/daily-free")
async def get_daily_free_predictions(date: str = None):
    """Get today's daily free AI predictions. No auth required — available to all users."""
    predictions = community.get_daily_free_predictions(date)
    date_str = date or datetime.now().strftime("%Y-%m-%d")
    return {
        "predictions": predictions,
        "date": date_str,
        "count": len(predictions),
    }


@app.post("/api/predictions/update-result")
async def update_prediction_result(request: UpdateResultRequest):
    """Update a prediction with actual match results."""
    result = prediction_tracker.update_result(
        fixture_id=request.fixture_id,
        home_goals=request.home_goals,
        away_goals=request.away_goals,
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.post("/api/predictions/refresh-results")
async def refresh_prediction_results():
    """Manually trigger result checking for all unfinished predictions."""
    tracker_info = prediction_tracker.get_unfinished_prediction_info()
    if not tracker_info["dates"]:
        return {"message": "No pending predictions", "updated": 0}

    team_keys = tracker_info["team_keys"]

    def is_relevant_team(f):
        h = f.get("home_team", {}).get("id")
        a = f.get("away_team", {}).get("id")
        return f"{h}-{a}" in team_keys

    all_relevant = []  # All matching fixtures (any status)
    all_finished = []  # Only finished fixtures

    from datetime import timedelta
    today_dt = datetime.now()
    today_yyyymmdd = today_dt.strftime("%Y%m%d")

    # Check today's fixtures
    fixtures = await football_api.fetch_todays_fixtures()
    if fixtures:
        for f in fixtures:
            if is_relevant_team(f):
                all_relevant.append(f)
                if f.get("status") in ("FT", "AET", "PEN"):
                    all_finished.append(f)

    # Check past dates + upcoming days (up to 7 days ahead for scheduled match dates)
    all_dates_to_check = set()
    for date_str in tracker_info["dates"]:
        try:
            pred_dt = datetime.strptime(date_str, "%Y%m%d")
            d = pred_dt
            end_dt = today_dt + timedelta(days=7)
            while d <= end_dt:
                all_dates_to_check.add(d.strftime("%Y%m%d"))
                d += timedelta(days=1)
        except ValueError:
            all_dates_to_check.add(date_str)
    all_dates_to_check.discard(today_yyyymmdd)

    for date_str in sorted(all_dates_to_check):
        api_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
        date_fixtures = await football_api.fetch_fixtures_by_date(api_date)
        if date_fixtures:
            for f in date_fixtures:
                if is_relevant_team(f):
                    all_relevant.append(f)
                    if f.get("status") in ("FT", "AET", "PEN"):
                        all_finished.append(f)

    # Update match dates for all predictions (using any fixture, finished or not)
    dates_updated = prediction_tracker.update_match_dates(all_relevant)

    # Resolve finished predictions
    result = {"updated": 0, "correct": 0, "incorrect": 0}
    if all_finished:
        result = prediction_tracker.check_and_update_from_fixtures(all_finished)

    return {
        "message": f"Updated {result['updated']} results ({result['correct']} correct, {result['incorrect']} incorrect), {dates_updated} match dates set",
        "updated": result["updated"],
        "correct": result["correct"],
        "incorrect": result["incorrect"],
        "dates_updated": dates_updated,
    }


@app.delete("/api/predictions/clear")
async def clear_predictions():
    """Clear all stored predictions."""
    result = prediction_tracker.clear_all_predictions()
    return result


class PredictionItem(BaseModel):
    matchId: str
    matchName: str
    category: str
    outcome: str
    probability: float
    competitionId: str = ""
    odds: float = None

class ConfirmPredictionsRequest(BaseModel):
    predictions: List[PredictionItem]
    visibility: str = "private"
    is_paid: bool = False
    price_usd: float = 0
    analysis_notes: str = ""
    is_live_bet: bool = False


@app.post("/api/predictions/confirm")
async def confirm_predictions(request: ConfirmPredictionsRequest, authorization: str = Header(None)):
    """Confirm predictions from My Predictions slip. Stores to track record and optionally shares to community."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if not request.predictions:
        raise HTTPException(status_code=400, detail="No predictions to confirm")

    # Validate: if selling, require at least 30 words in notes
    if request.is_paid and len(request.analysis_notes.split()) < 30:
        raise HTTPException(status_code=400, detail="Paid predictions require at least 30 words of analysis notes")

    profile = user_auth.get_user_profile(payload["user_id"])
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")

    confirmed = []
    for pred in request.predictions:
        # Parse team names from matchName (format: "TeamA vs TeamB")
        parts = pred.matchName.split(" vs ")
        team_a_name = parts[0].strip() if len(parts) >= 2 else pred.matchName
        team_b_name = parts[1].strip() if len(parts) >= 2 else ""

        # Parse team IDs from matchId (format: "homeId-awayId")
        id_parts = pred.matchId.split("-")
        team_a_id = int(id_parts[0]) if len(id_parts) >= 2 and id_parts[0].isdigit() else 0
        team_b_id = int(id_parts[1]) if len(id_parts) >= 2 and id_parts[1].isdigit() else 0

        # Store in prediction tracker
        try:
            outcome = {}
            if "Win" in pred.outcome:
                if team_a_name in pred.outcome:
                    outcome = {"team_a_win": pred.probability, "draw": 0, "team_b_win": 0}
                else:
                    outcome = {"team_a_win": 0, "draw": 0, "team_b_win": pred.probability}
            elif pred.outcome == "Draw":
                outcome = {"team_a_win": 0, "draw": pred.probability, "team_b_win": 0}
            else:
                outcome = {"team_a_win": pred.probability, "draw": 0, "team_b_win": 0}

            prediction_tracker.store_prediction(
                team_a_id=team_a_id,
                team_b_id=team_b_id,
                team_a_name=team_a_name,
                team_b_name=team_b_name,
                competition="",
                outcome=outcome,
                top_predictions=[],
                odds=pred.odds,
                user_id=payload.get("user_id"),
            )
            confirmed.append(pred.matchId)
        except Exception as e:
            print(f"Failed to store prediction for {pred.matchId}: {e}")

    # Share to community if public
    if request.visibility == "public" and confirmed:
        # Generate slip_id and combined odds for grouping
        slip_id = str(uuid.uuid4())
        odds_values = [p.odds for p in request.predictions if p.odds and p.odds > 0]
        combined_odds = None
        if odds_values:
            combined_odds = 1.0
            for o in odds_values:
                combined_odds *= o
            combined_odds = round(combined_odds, 2)

        for pred in request.predictions:
            parts = pred.matchName.split(" vs ")
            team_a_name = parts[0].strip() if len(parts) >= 2 else pred.matchName
            team_b_name = parts[1].strip() if len(parts) >= 2 else ""
            fixture_id = f"{pred.matchId}-{datetime.now().strftime('%Y%m%d')}"
            try:
                community.share_prediction(
                    user_id=profile["id"],
                    username=profile["username"],
                    display_name=profile["display_name"],
                    avatar_color=profile["avatar_color"],
                    fixture_id=fixture_id,
                    team_a_name=team_a_name,
                    team_b_name=team_b_name,
                    competition="",
                    predicted_result=f"{pred.category}: {pred.outcome}",
                    predicted_result_prob=pred.probability,
                    analysis_summary=request.analysis_notes,
                    visibility="public",
                    is_paid=request.is_paid,
                    price_usd=request.price_usd if request.is_paid else 0,
                    competition_code=pred.competitionId,
                    is_live_bet=request.is_live_bet,
                    odds=pred.odds,
                    slip_id=slip_id,
                    combined_odds=combined_odds,
                )
            except Exception as e:
                print(f"Failed to share prediction for {pred.matchId}: {e}")

    return {
        "success": True,
        "confirmed_count": len(confirmed),
        "shared": request.visibility == "public",
        "is_paid": request.is_paid,
    }


# ==================== END TRACK RECORD ENDPOINTS ====================


# ==================== COOKIE CONSENT & VISITOR TRACKING ENDPOINTS ====================

class ConsentRequest(BaseModel):
    session_id: str
    consent_given: bool

class TrackPageRequest(BaseModel):
    session_id: str
    page: str
    referrer: str = ""
    user_agent: str = ""
    device_type: str = ""
    browser: str = ""
    os: str = ""
    session_start: str = ""

class SessionDurationRequest(BaseModel):
    session_id: str
    duration_seconds: int


@app.post("/api/consent")
async def record_cookie_consent(body: ConsentRequest, request: Request):
    """Record user's cookie consent decision."""
    client_ip = _get_client_ip(request)
    user_auth.record_consent(
        session_id=body.session_id,
        ip_address=client_ip,
        consent_given=body.consent_given,
    )
    return {"ok": True}


@app.post("/api/track/page")
async def track_page_visit(body: TrackPageRequest, request: Request, authorization: str = Header(None)):
    """Record a page visit (only called when user has consented)."""
    client_ip = _get_client_ip(request)
    user_id = None
    payload = _get_current_user(authorization)
    if payload:
        user_id = payload.get("user_id")
    # Resolve country from geo cache
    country = None
    if client_ip in _geo_cache:
        code, ts = _geo_cache[client_ip]
        if time.time() - ts < GEO_CACHE_TTL:
            country = code
    user_auth.record_page_visit(
        session_id=body.session_id,
        ip_address=client_ip,
        user_agent=body.user_agent,
        device_type=body.device_type,
        browser=body.browser,
        os_name=body.os,
        page=body.page,
        referrer=body.referrer,
        session_start=body.session_start,
        user_id=user_id,
        country=country,
    )
    return {"ok": True}


@app.post("/api/track/duration")
async def track_session_duration(body: SessionDurationRequest):
    """Update session duration (called on page unload/visibility change)."""
    user_auth.update_session_duration(body.session_id, body.duration_seconds)
    return {"ok": True}

# ==================== END COOKIE CONSENT & TRACKING ENDPOINTS ====================


# ==================== COMMUNITY PREDICTIONS ENDPOINTS ====================

class SharePredictionRequest(BaseModel):
    fixture_id: str
    team_a_name: str
    team_b_name: str
    competition: str = ""
    predicted_result: str
    predicted_result_prob: float = 0
    predicted_over25: Optional[str] = None
    predicted_btts: Optional[str] = None
    best_value_bet: Optional[str] = None
    best_value_prob: Optional[float] = None
    analysis_summary: str = ""
    visibility: str = "public"
    is_paid: bool = False
    price_usd: float = 0

class RatingRequest(BaseModel):
    rating: int

class CommentRequest(BaseModel):
    content: str


@app.post("/api/community/share")
async def share_prediction(request: SharePredictionRequest, authorization: str = Header(None)):
    """Share a prediction to the community."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    profile = user_auth.get_user_profile(payload["user_id"])
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")

    result = community.share_prediction(
        user_id=profile["id"],
        username=profile["username"],
        display_name=profile["display_name"],
        avatar_color=profile["avatar_color"],
        fixture_id=request.fixture_id,
        team_a_name=request.team_a_name,
        team_b_name=request.team_b_name,
        competition=request.competition,
        predicted_result=request.predicted_result,
        predicted_result_prob=request.predicted_result_prob,
        predicted_over25=request.predicted_over25,
        predicted_btts=request.predicted_btts,
        best_value_bet=request.best_value_bet,
        best_value_prob=request.best_value_prob,
        analysis_summary=request.analysis_summary,
        visibility=request.visibility,
        is_paid=request.is_paid,
        price_usd=request.price_usd,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    # Send first-prediction-of-day email
    if result.get("is_first_today"):
        try:
            user_auth.send_first_prediction_email(profile["email"], profile["display_name"])
        except Exception as e:
            print(f"[WARN] Failed to send first prediction email: {e}")

    return result


@app.get("/api/search")
async def global_search(q: str = Query("", min_length=2)):
    """Search for matches by team name and community users by username/display name."""
    matches = football_api.search_cached_fixtures(q, limit=15)
    users = community.search_users(q, limit=10)
    return {"matches": matches, "users": users}


@app.get("/api/community/predictions")
async def get_community_predictions(page: int = 1, per_page: int = 20, user_id: int = None, sort_by: str = "best", authorization: str = Header(None)):
    """Get public community predictions. sort_by: best|new|top_rated|hot"""
    if sort_by not in ("best", "new", "top_rated", "hot"):
        sort_by = "best"
    payload = _get_current_user(authorization)
    viewer_id = payload["user_id"] if payload else None
    return community.get_public_predictions(page=page, per_page=per_page, user_id=user_id, sort_by=sort_by, viewer_id=viewer_id)


@app.get("/api/community/my-shared")
async def get_my_shared_predictions(authorization: str = Header(None)):
    """Get current user's shared predictions."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"predictions": community.get_user_predictions(payload["user_id"])}


@app.post("/api/community/{prediction_id}/rate")
async def rate_prediction(prediction_id: int, request: RatingRequest, authorization: str = Header(None)):
    """Rate a community prediction (1-5 stars)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Get rater profile for notification
    rater_profile = user_auth.get_user_profile(payload["user_id"])
    rater_name = rater_profile["display_name"] if rater_profile else ""

    result = community.rate_prediction(prediction_id, payload["user_id"], request.rating, rater_display_name=rater_name)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/api/community/{prediction_id}/comment")
async def add_comment(prediction_id: int, request: CommentRequest, authorization: str = Header(None)):
    """Add a comment to a community prediction."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    profile = user_auth.get_user_profile(payload["user_id"])
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")

    result = community.add_comment(
        prediction_id=prediction_id,
        user_id=profile["id"],
        username=profile["username"],
        display_name=profile["display_name"],
        avatar_color=profile["avatar_color"],
        content=request.content,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.get("/api/community/{prediction_id}/comments")
async def get_comments(prediction_id: int):
    """Get comments for a prediction."""
    return {"comments": community.get_comments(prediction_id)}


@app.get("/api/community/top-predictors")
async def get_top_predictors():
    """Get leaderboard of top predictors."""
    return {"predictors": community.get_top_predictors()}


@app.get("/api/community/user-stats/{user_id}")
async def get_user_prediction_stats(user_id: int):
    """Get win/loss prediction stats for a user (public)."""
    return community.get_user_prediction_stats(user_id)


# --- Reactions (Like/Dislike) ---

class ReactionRequest(BaseModel):
    reaction: str  # 'like' or 'dislike'

@app.post("/api/community/{prediction_id}/react")
async def react_to_prediction(prediction_id: int, request: ReactionRequest, authorization: str = Header(None)):
    """Like or dislike a prediction. Toggle off if same reaction."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = community.react_prediction(prediction_id, payload["user_id"], request.reaction)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@app.get("/api/community/{prediction_id}/reactions")
async def get_reactions(prediction_id: int, authorization: str = Header(None)):
    """Get reaction counts for a prediction."""
    payload = _get_current_user(authorization)
    user_id = payload["user_id"] if payload else None
    return community.get_prediction_reactions(prediction_id, user_id)


# --- Prediction Live Chat ---

class ChatMessageRequest(BaseModel):
    message: str

@app.post("/api/community/{prediction_id}/chat")
async def send_chat(prediction_id: int, request: ChatMessageRequest, authorization: str = Header(None)):
    """Send a live chat message on a prediction."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    profile = user_auth.get_user_profile(payload["user_id"])
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    result = community.send_chat_message(
        prediction_id=prediction_id,
        user_id=profile["id"],
        username=profile["username"],
        display_name=profile["display_name"],
        avatar_color=profile["avatar_color"],
        message=request.message,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@app.get("/api/community/{prediction_id}/chat")
async def get_chat(prediction_id: int, since_id: int = 0):
    """Get chat messages for a prediction. Use since_id for polling."""
    messages = community.get_chat_messages(prediction_id, since_id=since_id)
    return {"messages": messages}


# --- Live Match Chat Endpoints ---

@app.post("/api/match/{match_key}/chat")
async def send_match_chat(match_key: str, request: ChatMessageRequest, authorization: str = Header(None)):
    """Send a live chat message on a match."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    profile = user_auth.get_user_profile(payload["user_id"])
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    result = community.send_match_chat_message(
        match_key=match_key,
        user_id=profile["id"],
        username=profile["username"],
        display_name=profile["display_name"],
        avatar_color=profile["avatar_color"],
        message=request.message,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@app.get("/api/match/{match_key}/chat")
async def get_match_chat(match_key: str, since_id: int = 0):
    """Get chat messages for a live match. Use since_id for polling."""
    messages = community.get_match_chat_messages(match_key, since_id=since_id)
    return {"messages": messages}


# --- Paid Predictions Endpoints ---

class PurchasePredictionRequest(BaseModel):
    payment_method: str = ""
    payment_ref: str = ""


@app.get("/api/community/paid")
async def get_paid_predictions(page: int = 1, per_page: int = 20, sort_by: str = "best", authorization: str = Header(None)):
    """Get paid predictions feed. sort_by: best|new|top_rated|hot"""
    if sort_by not in ("best", "new", "top_rated", "hot"):
        sort_by = "best"
    payload = _get_current_user(authorization)
    viewer_id = payload["user_id"] if payload else None
    return community.get_paid_predictions_feed(page=page, per_page=per_page, viewer_id=viewer_id, sort_by=sort_by)


@app.post("/api/community/{prediction_id}/purchase")
async def purchase_prediction(prediction_id: int, request: PurchasePredictionRequest, authorization: str = Header(None)):
    """Purchase a paid prediction."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = community.purchase_prediction(
        prediction_id=prediction_id,
        buyer_id=payload["user_id"],
        payment_method=request.payment_method,
        payment_ref=request.payment_ref,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.get("/api/community/my-purchases")
async def get_my_purchases(authorization: str = Header(None)):
    """Get current user's purchased predictions."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"purchases": community.get_user_purchases(payload["user_id"])}


@app.get("/api/creator/dashboard")
async def get_creator_dashboard(authorization: str = Header(None)):
    """Get creator dashboard with wallet, sales, and paid predictions."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return community.get_creator_dashboard(payload["user_id"])


# ==================== ANALYTICS TRACKING ====================

class ViewTrackRequest(BaseModel):
    prediction_ids: List[int]

@app.post("/api/community/track-views")
async def track_prediction_views(request: ViewTrackRequest):
    """Track impressions when predictions appear in user's feed."""
    if not request.prediction_ids or len(request.prediction_ids) > 50:
        return {"success": False, "error": "Invalid prediction IDs (max 50)"}
    return community.increment_view_count(request.prediction_ids)

@app.post("/api/community/{prediction_id}/track-click")
async def track_prediction_click(prediction_id: int):
    """Track when a user clicks/expands a prediction card."""
    return community.increment_click_count(prediction_id)


# ==================== FOLLOW SYSTEM ====================

@app.post("/api/community/follow/{target_user_id}")
async def follow_user_endpoint(target_user_id: int, authorization: str = Header(None)):
    """Follow a user to get notified when they post predictions."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = community.follow_user(payload["user_id"], target_user_id)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.delete("/api/community/follow/{target_user_id}")
async def unfollow_user_endpoint(target_user_id: int, authorization: str = Header(None)):
    """Unfollow a user."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return community.unfollow_user(payload["user_id"], target_user_id)


@app.get("/api/community/follow-status/{target_user_id}")
async def get_follow_status(target_user_id: int, authorization: str = Header(None)):
    """Check if current user follows target user, and get follow counts."""
    payload = _get_current_user(authorization)
    if not payload:
        return {"is_following": False, "followers_count": 0, "following_count": 0}
    is_following = community.is_following(payload["user_id"], target_user_id)
    stats = community.get_follow_stats(target_user_id)
    return {
        "is_following": is_following,
        "followers_count": stats["followers_count"],
        "following_count": stats["following_count"],
    }


# ==================== LIVE BET PREDICTIONS ====================

class LiveBetPrediction(BaseModel):
    fixture_id: int
    match_name: str
    prediction_type: str
    prediction_value: str
    confidence: float = 0
    analysis_notes: str = ""
    odds: float = None

class LiveBetRequest(BaseModel):
    predictions: List[LiveBetPrediction]
    visibility: str = "public"
    is_paid: bool = False
    price_usd: float = 0
    analysis_notes: str = ""


@app.post("/api/community/live-bet")
async def submit_live_bet(request: LiveBetRequest, authorization: str = Header(None)):
    """Submit a live bet prediction for an in-play match."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    profile = user_auth.get_user_profile(payload["user_id"])
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate matches are actually live
    live_matches = await football_api.fetch_live_matches() or []
    live_ids = {m.get("id") for m in live_matches}

    # Generate slip_id and combined odds for grouping
    slip_id = str(uuid.uuid4())
    odds_values = [p.odds for p in request.predictions if p.odds and p.odds > 0]
    combined_odds = None
    if odds_values:
        combined_odds = 1.0
        for o in odds_values:
            combined_odds *= o
        combined_odds = round(combined_odds, 2)

    results = []
    for pred in request.predictions:
        if pred.fixture_id not in live_ids:
            continue

        match = next((m for m in live_matches if m.get("id") == pred.fixture_id), None)
        if not match:
            continue

        team_a = match["home_team"]["name"]
        team_b = match["away_team"]["name"]
        comp_code = match.get("competition", {}).get("code", "")
        fixture_key = f"{match['home_team']['id']}-{match['away_team']['id']}-{datetime.now().strftime('%Y%m%d')}"

        result = community.share_prediction(
            user_id=profile["id"],
            username=profile["username"],
            display_name=profile["display_name"],
            avatar_color=profile["avatar_color"],
            fixture_id=fixture_key,
            team_a_name=team_a,
            team_b_name=team_b,
            competition=match.get("competition", {}).get("name", ""),
            predicted_result=f"[LIVE] {pred.prediction_type}: {pred.prediction_value}",
            predicted_result_prob=pred.confidence,
            analysis_summary=pred.analysis_notes or request.analysis_notes,
            visibility=request.visibility,
            is_paid=request.is_paid,
            price_usd=request.price_usd if request.is_paid else 0,
            competition_code=comp_code,
            is_live_bet=True,
            odds=pred.odds,
            slip_id=slip_id,
            combined_odds=combined_odds,
        )
        results.append(result)

    return {
        "success": True,
        "submitted_count": len(results),
        "shared": request.visibility == "public",
    }


@app.get("/api/community/live-predictions")
async def get_live_predictions(authorization: str = Header(None)):
    """Get community predictions that are live bets."""
    payload = _get_current_user(authorization)
    viewer_id = payload["user_id"] if payload else None
    return community.get_live_bet_predictions(viewer_id=viewer_id)


# ==================== NOTIFICATIONS & EARNINGS ====================

@app.get("/api/user/notifications")
async def get_notifications(authorization: str = Header(None)):
    """Get user's notifications (comments on their predictions)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return community.get_user_notifications(payload["user_id"])


@app.post("/api/user/notifications/read")
async def mark_notifications_read(authorization: str = Header(None)):
    """Mark all notifications as read."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return community.mark_notifications_read(payload["user_id"])


@app.post("/api/user/notifications/{notification_id}/read")
async def mark_single_notification_read(notification_id: int, authorization: str = Header(None)):
    """Mark a single notification as read."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return community.mark_single_notification_read(payload["user_id"], notification_id)


@app.get("/api/user/earnings")
async def get_earnings(authorization: str = Header(None)):
    """Get earnings summary for the user."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return community.get_earnings_summary(payload["user_id"])


@app.get("/api/user/unread-count")
async def get_unread_count(authorization: str = Header(None)):
    """Quick endpoint to get unread notification count."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"unread_count": community.get_unread_count(payload["user_id"])}


@app.get("/api/user/notifications/stream")
async def notification_stream(token: str = Query(None)):
    """SSE endpoint for real-time notification delivery."""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = user_auth.verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload["user_id"]

    async def event_generator():
        event = community.subscribe_notifications(user_id)
        last_seen = community.get_notification_signal(user_id)
        try:
            # Send initial unread count
            count = community.get_unread_count(user_id)
            yield f"data: {json.dumps({'type': 'init', 'unread_count': count})}\n\n"

            while True:
                # Wait for a signal or timeout after 15s (heartbeat)
                try:
                    await asyncio.wait_for(event.wait(), timeout=15)
                    event.clear()
                except asyncio.TimeoutError:
                    pass

                current = community.get_notification_signal(user_id)
                if current > last_seen:
                    last_seen = current
                    data = community.get_user_notifications(user_id, limit=1)
                    notif = data["notifications"][0] if data["notifications"] else None
                    yield f"data: {json.dumps({'type': 'new', 'unread_count': data['unread_count'], 'notification': notif})}\n\n"
                else:
                    # Heartbeat to keep connection alive
                    yield f": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            community.unsubscribe_notifications(user_id, event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ==================== DIRECT MESSAGES ====================

class SendMessageRequest(BaseModel):
    receiver_id: int
    content: str

@app.post("/api/messages/send")
async def send_message(request: SendMessageRequest, authorization: str = Header(None)):
    """Send a direct message to another user."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    sender = user_auth.get_user_profile(payload["user_id"])
    if not sender:
        raise HTTPException(status_code=401, detail="User not found")
    receiver = user_auth.get_user_profile(request.receiver_id)
    if not receiver:
        raise HTTPException(status_code=404, detail="Recipient not found")
    return community.send_message(
        sender_id=sender["id"],
        receiver_id=request.receiver_id,
        sender_username=sender["username"],
        sender_display_name=sender["display_name"],
        sender_avatar_color=sender["avatar_color"],
        content=request.content,
    )

@app.get("/api/messages/conversations")
async def get_conversations(authorization: str = Header(None)):
    """Get list of conversations for the current user."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    convos = community.get_conversations(payload["user_id"])
    # Add virtual "Support" conversation if user has support messages
    support = community.get_support_latest_for_user(payload["user_id"])
    if support:
        convos.insert(0, {
            "other_id": -1,
            "other_name": "Support",
            "other_username": "support",
            "other_avatar": "#6c5ce7",
            "last_message": support["last_message"],
            "last_message_at": support["last_message_at"],
            "is_mine": support["is_mine"],
            "unread_count": support["unread_count"],
            "is_support": True,
        })
    return {"conversations": convos}

@app.get("/api/messages/{other_id}")
async def get_messages(other_id: int, authorization: str = Header(None)):
    """Get messages between current user and another user."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"messages": community.get_messages(payload["user_id"], other_id)}

@app.get("/api/messages-unread-count")
async def get_unread_messages_count(authorization: str = Header(None)):
    """Get unread message count (includes support messages)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    dm_unread = community.get_unread_messages_count(payload["user_id"])
    support_unread = community.get_support_unread_count(payload["user_id"])
    return {"unread_count": dm_unread + support_unread}


SUPPORT_UPLOADS_DIR = Path(__file__).parent / "uploads" / "support"
MAX_SUPPORT_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_SUPPORT_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".doc", ".docx", ".txt", ".csv", ".xls", ".xlsx"}


@app.post("/api/support/upload")
async def support_upload_file(file: UploadFile = File(...), authorization: str = Header(None)):
    """User uploads a file in support chat (max 10MB)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = payload["user_id"]
    if not community.is_conversation_active(user_id):
        raise HTTPException(status_code=400, detail="Conversation is closed.")

    # Validate file size
    contents = await file.read()
    if len(contents) > MAX_SUPPORT_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB.")

    # Validate extension
    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext not in ALLOWED_SUPPORT_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_SUPPORT_EXTENSIONS)}")

    # Save file
    unique_name = f"{uuid.uuid4().hex}{ext}"
    filepath = SUPPORT_UPLOADS_DIR / unique_name
    with open(filepath, "wb") as f:
        f.write(contents)

    file_url = f"/api/uploads/support/{unique_name}"
    original_name = file.filename or unique_name

    # Send as a message with file attachment
    content = f"[FILE:{original_name}]({file_url})"
    result = community.send_support_message(user_id, "user", content)
    return {"success": True, "file_url": file_url, "file_name": original_name, "message_id": result.get("message_id")}


# Admin support upload moved to admin_routes.py


@app.get("/api/uploads/support/{filename}")
async def serve_support_file(filename: str):
    """Serve an uploaded support file."""
    filepath = SUPPORT_UPLOADS_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(filepath))


# ==================== SUPPORT CHAT (USER SIDE) ====================

class SupportMessageRequest(BaseModel):
    content: str
    category: str = None


@app.post("/api/support/send")
async def support_send(request: SupportMessageRequest, authorization: str = Header(None)):
    """User sends a support message."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = payload["user_id"]

    # Check if conversation is active (reject if closed)
    if not community.is_conversation_active(user_id):
        raise HTTPException(status_code=400, detail="Conversation is closed. Please start a new conversation.")

    result = community.send_support_message(user_id, "user", request.content, category=request.category)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    # AI auto-response (skip if conversation is already escalated to human)
    if not community.is_support_escalated(user_id):
        try:
            history = community.get_support_messages(user_id, mark_read_for=None, limit=50, current_conv_only=True)
            # Don't include the message we just sent in history passed to AI
            history_for_ai = history[:-1] if history else []
            ai_result = ai_support.get_ai_response(request.content, history_for_ai, category=request.category, user_id=user_id)

            # Save AI response
            community.send_support_message(user_id, "ai", ai_result["response"])

            # Handle escalation
            if ai_result["should_escalate"]:
                community.escalate_support(user_id)
                community.send_support_message(
                    user_id, "ai",
                    "I have forwarded your issue to an agent who will respond to you shortly. Please type your issue here in detail for the agent to respond."
                )
        except Exception as e:
            print(f"[AI Support] Error in auto-response: {e}")

    return result


@app.post("/api/support/escalate")
async def support_escalate(authorization: str = Header(None)):
    """User manually requests escalation to human agent."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = payload["user_id"]

    if not community.is_support_escalated(user_id):
        community.escalate_support(user_id)
        community.send_support_message(
            user_id, "ai",
            "I have forwarded your issue to an agent who will respond to you shortly. Please type your issue here in detail for the agent to respond."
        )
    return {"success": True}


@app.get("/api/support/messages")
async def support_messages(authorization: str = Header(None)):
    """User gets their support chat history."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"messages": community.get_support_messages(payload["user_id"], mark_read_for="user", current_conv_only=True)}


@app.get("/api/support/unread")
async def support_unread(authorization: str = Header(None)):
    """User gets unread count from admin."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"unread_count": community.get_support_unread_count(payload["user_id"])}


@app.get("/api/support/conversation-status")
async def support_conversation_status(authorization: str = Header(None)):
    """Get current conversation state (active/closed, agent info)."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conv = community.get_conversation_by_user(payload["user_id"])
    if not conv:
        return {"has_conversation": False, "status": None}
    return {
        "has_conversation": True,
        "status": conv["status"],
        "closed_reason": conv.get("closed_reason"),
        "assigned_agent_name": conv.get("assigned_agent_name"),
        "assigned_agent_id": conv.get("assigned_agent_id"),
        "conversation_id": conv["id"],
    }


@app.post("/api/support/new-conversation")
async def support_new_conversation(authorization: str = Header(None)):
    """Start a fresh conversation after a previous one was closed."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    # Create a new active conversation (the old one stays closed)
    conv = community.get_or_create_active_conversation(payload["user_id"], force_new=True)
    return {"success": True, "conversation_id": conv["id"]}


class SupportRatingRequest(BaseModel):
    rating: int
    comment: str = ""


@app.post("/api/support/rate")
async def support_rate(request: SupportRatingRequest, authorization: str = Header(None)):
    """User submits a rating for a closed conversation."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not 1 <= request.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    user_id = payload["user_id"]
    conv = community.get_conversation_by_user(user_id)
    if not conv:
        raise HTTPException(status_code=400, detail="No conversation found")
    if conv["status"] != "closed":
        raise HTTPException(status_code=400, detail="Conversation must be closed to rate")
    # Use assigned agent info, or fallback for password-based admin
    agent_id = conv.get("assigned_agent_id") or 0
    agent_name = conv.get("assigned_agent_name") or "Admin"
    result = community.submit_support_rating(
        conversation_id=conv["id"],
        user_id=user_id,
        agent_id=agent_id,
        agent_name=agent_name,
        rating=request.rating,
        comment=request.comment,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.get("/api/support/stream")
async def support_stream(token: str = Query(None)):
    """SSE endpoint for real-time support messages."""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = user_auth.verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload["user_id"]

    async def event_generator():
        event = community.subscribe_support(user_id)
        last_seen = community.get_support_signal(user_id)
        try:
            count = community.get_support_unread_count(user_id)
            yield f"data: {json.dumps({'type': 'init', 'unread_count': count})}\n\n"

            while True:
                try:
                    await asyncio.wait_for(event.wait(), timeout=15)
                    event.clear()
                except asyncio.TimeoutError:
                    pass

                current = community.get_support_signal(user_id)
                if current > last_seen:
                    last_seen = current
                    # Use the signal's message_id to fetch the exact new message
                    latest = community.get_support_message_by_id(current)
                    count = community.get_support_unread_count(user_id)
                    yield f"data: {json.dumps({'type': 'new', 'unread_count': count, 'message': latest})}\n\n"
                else:
                    yield f": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            community.unsubscribe_support(user_id, event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ==================== END COMMUNITY ENDPOINTS ====================


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "message": "Spark AI Prediction is running",
        "using_live_data": is_using_live_data(),
        "api_configured": {
            "api_football": bool(config.API_FOOTBALL_KEY),
            "odds_api": bool(config.ODDS_API_KEY),
        }
    }


@app.get("/api/config-status")
async def config_status():
    """Check API configuration status."""
    return {
        "api_football": {
            "configured": bool(config.API_FOOTBALL_KEY),
            "using_live_data": is_using_live_data(),
            "signup_url": "https://www.api-football.com/",
            "features": ["standings", "fixtures", "h2h", "team_stats", "cards", "goals", "penalties"],
            "current_season": config.CURRENT_SEASON,
        },
        "odds_api": {
            "configured": bool(config.ODDS_API_KEY),
            "signup_url": "https://the-odds-api.com/",
        },
        "instructions": "Set environment variables API_FOOTBALL_KEY and ODDS_API_KEY, or edit backend/config.py directly."
    }


@app.get("/api/h2h-analysis/{team_a_id}/{team_b_id}")
async def get_h2h_analysis(team_a_id: int, team_b_id: int, competition: str = "PL"):
    """Get detailed H2H analysis with 3 parts: home form, away form, and head-to-head."""
    from database import get_h2h_matches, get_teams

    # Fetch H2H matches between the two teams
    h2h = await get_h2h_matches(team_a_id, team_b_id)

    # Fetch team names
    teams = await get_teams(competition)
    team_a = next((t for t in teams if t["id"] == team_a_id), {"name": f"Team {team_a_id}"})
    team_b = next((t for t in teams if t["id"] == team_b_id), {"name": f"Team {team_b_id}"})

    # Part 1: Home team's home form (analyze standings data)
    home_form_analysis = _analyze_home_form(team_a, teams)

    # Part 2: Away team's away form
    away_form_analysis = _analyze_away_form(team_b, teams)

    if not h2h:
        return {
            "team_a": {"id": team_a_id, "name": team_a.get("name", f"Team {team_a_id}")},
            "team_b": {"id": team_b_id, "name": team_b.get("name", f"Team {team_b_id}")},
            "matches": [],
            "total_matches": 0,
            "message": "No head-to-head data available for these teams",
            "goals_analysis": None,
            "result_analysis": None,
        }

    # Filter out matches with no scores (future/incomplete matches)
    completed_h2h = [m for m in h2h if m.get("home_score") is not None and m.get("away_score") is not None]

    if not completed_h2h:
        return {
            "team_a": {"id": team_a_id, "name": team_a.get("name", f"Team {team_a_id}")},
            "team_b": {"id": team_b_id, "name": team_b.get("name", f"Team {team_b_id}")},
            "matches": [],
            "total_matches": 0,
            "message": "No completed head-to-head matches available",
            "goals_analysis": None,
            "result_analysis": None,
        }

    # Calculate statistics using only completed matches
    total_matches = len(completed_h2h)
    team_a_wins = 0
    team_b_wins = 0
    draws = 0
    total_goals = 0
    team_a_goals = 0
    team_b_goals = 0

    # Goals thresholds counters
    over_05 = 0
    over_15 = 0
    over_25 = 0
    over_35 = 0
    over_45 = 0
    over_55 = 0
    btts_yes = 0  # Both teams to score

    # Exact goals counters
    exact_goals_count = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, "6+": 0}
    team_a_exact = {0: 0, 1: 0, 2: 0, "3+": 0}
    team_b_exact = {0: 0, 1: 0, 2: 0, "3+": 0}

    # Clean sheets
    team_a_clean_sheet = 0
    team_b_clean_sheet = 0

    # Correct score tracking
    correct_scores = {}

    # Half-time data counters
    ht_matches = 0
    ht_team_a_wins = 0
    ht_draws = 0
    ht_team_b_wins = 0
    ht_btts = 0
    ht_over_05 = 0
    ht_over_15 = 0
    ht_over_25 = 0
    ht_team_a_over_05 = 0
    ht_team_a_over_15 = 0
    ht_team_b_over_05 = 0
    ht_team_b_over_15 = 0
    ht_exact = {0: 0, 1: 0, "2+": 0}

    # Combined market counters
    ft_1x2_btts = {"1_yes": 0, "1_no": 0, "x_yes": 0, "x_no": 0, "2_yes": 0, "2_no": 0}
    total_btts = {"over25_yes": 0, "over25_no": 0, "under25_yes": 0, "under25_no": 0}

    # HT/FT results
    htft_results = {}

    # Both halves over/under 1.5
    both_halves_over_15 = 0
    both_halves_under_15 = 0
    ht_counted = 0

    # 1st half combined markets
    fh_1x2_btts = {"1_yes": 0, "1_no": 0, "x_yes": 0, "x_no": 0, "2_yes": 0, "2_no": 0}
    fh_1x2_total = {"1_over": 0, "1_under": 0, "x_over": 0, "x_under": 0, "2_over": 0, "2_under": 0}

    # 2nd half combined markets
    sh_1x2_btts = {"1_yes": 0, "1_no": 0, "x_yes": 0, "x_no": 0, "2_yes": 0, "2_no": 0}
    sh_1x2_total = {"1_over": 0, "1_under": 0, "x_over": 0, "x_under": 0, "2_over": 0, "2_under": 0}

    # Handicap tracking
    handicap_levels = [-1, -2, -3, 1, 2, 3]
    handicap_results = {h: {"team_a": 0, "draw": 0, "team_b": 0} for h in handicap_levels}
    ht_handicap_results = {h: {"team_a": 0, "draw": 0, "team_b": 0} for h in [-1, 1]}

    for match in completed_h2h:
        home_id = match.get("home_team_id")
        home_score = match.get("home_score") or 0
        away_score = match.get("away_score") or 0
        match_goals = home_score + away_score
        total_goals += match_goals

        # Count goals for each team
        if home_id == team_a_id:
            team_a_goals += home_score
            team_b_goals += away_score
            if home_score > away_score:
                team_a_wins += 1
            elif away_score > home_score:
                team_b_wins += 1
            else:
                draws += 1
        else:
            team_a_goals += away_score
            team_b_goals += home_score
            if away_score > home_score:
                team_a_wins += 1
            elif home_score > away_score:
                team_b_wins += 1
            else:
                draws += 1

        # Goals thresholds
        if match_goals > 0.5:
            over_05 += 1
        if match_goals > 1.5:
            over_15 += 1
        if match_goals > 2.5:
            over_25 += 1
        if match_goals > 3.5:
            over_35 += 1
        if match_goals > 4.5:
            over_45 += 1
        if match_goals > 5.5:
            over_55 += 1

        btts = home_score > 0 and away_score > 0
        if btts:
            btts_yes += 1

        # Determine team_a and team_b scores for this match
        if home_id == team_a_id:
            ta_score, tb_score = home_score, away_score
        else:
            ta_score, tb_score = away_score, home_score

        # Full-time result
        if ta_score > tb_score:
            ft_result = "1"
        elif ta_score < tb_score:
            ft_result = "2"
        else:
            ft_result = "x"

        # Exact goals
        if match_goals >= 6:
            exact_goals_count["6+"] += 1
        else:
            exact_goals_count[match_goals] = exact_goals_count.get(match_goals, 0) + 1

        # Team exact goals
        if ta_score >= 3:
            team_a_exact["3+"] += 1
        else:
            team_a_exact[ta_score] = team_a_exact.get(ta_score, 0) + 1
        if tb_score >= 3:
            team_b_exact["3+"] += 1
        else:
            team_b_exact[tb_score] = team_b_exact.get(tb_score, 0) + 1

        # Clean sheets
        if tb_score == 0:
            team_a_clean_sheet += 1
        if ta_score == 0:
            team_b_clean_sheet += 1

        # Correct score tracking
        score_key = f"{ta_score}:{tb_score}"
        correct_scores[score_key] = correct_scores.get(score_key, 0) + 1

        # Combined: 1X2 & BTTS (full-time)
        ft_1x2_btts[f"{ft_result}_{'yes' if btts else 'no'}"] += 1

        # Combined: Total & BTTS
        over_25_flag = match_goals > 2.5
        btts_key = "yes" if btts else "no"
        if over_25_flag:
            total_btts[f"over25_{btts_key}"] += 1
        else:
            total_btts[f"under25_{btts_key}"] += 1

        # Handicap (European) for various levels
        for h in handicap_levels:
            adj_ta = ta_score + h
            if adj_ta > tb_score:
                handicap_results[h]["team_a"] += 1
            elif adj_ta < tb_score:
                handicap_results[h]["team_b"] += 1
            else:
                handicap_results[h]["draw"] += 1

        # Half-time data (if available)
        ht_home = match.get("ht_home_score")
        ht_away = match.get("ht_away_score")
        if ht_home is not None and ht_away is not None:
            ht_matches += 1
            ht_counted += 1

            if home_id == team_a_id:
                ht_ta, ht_tb = ht_home, ht_away
            else:
                ht_ta, ht_tb = ht_away, ht_home

            ht_total = ht_home + ht_away

            # 1st Half 1X2
            if ht_ta > ht_tb:
                ht_team_a_wins += 1
                ht_result = "1"
            elif ht_ta < ht_tb:
                ht_team_b_wins += 1
                ht_result = "2"
            else:
                ht_draws += 1
                ht_result = "x"

            # 1st Half BTTS
            ht_btts_flag = ht_ta > 0 and ht_tb > 0
            if ht_btts_flag:
                ht_btts += 1

            # 1st Half Over/Under
            if ht_total > 0.5:
                ht_over_05 += 1
            if ht_total > 1.5:
                ht_over_15 += 1
            if ht_total > 2.5:
                ht_over_25 += 1

            # 1st Half Team Totals
            if ht_ta > 0.5:
                ht_team_a_over_05 += 1
            if ht_ta > 1.5:
                ht_team_a_over_15 += 1
            if ht_tb > 0.5:
                ht_team_b_over_05 += 1
            if ht_tb > 1.5:
                ht_team_b_over_15 += 1

            # 1st Half Exact Goals
            if ht_total == 0:
                ht_exact[0] += 1
            elif ht_total == 1:
                ht_exact[1] += 1
            else:
                ht_exact["2+"] += 1

            # 1st Half Handicap
            for h in [-1, 1]:
                adj = ht_ta + h
                if adj > ht_tb:
                    ht_handicap_results[h]["team_a"] += 1
                elif adj < ht_tb:
                    ht_handicap_results[h]["team_b"] += 1
                else:
                    ht_handicap_results[h]["draw"] += 1

            # 1st Half combined: 1X2 & BTTS
            fh_1x2_btts[f"{ht_result}_{'yes' if ht_btts_flag else 'no'}"] += 1

            # 1st Half combined: 1X2 & Total O/U 1.5
            ou_key = "over" if ht_total > 1.5 else "under"
            fh_1x2_total[f"{ht_result}_{ou_key}"] += 1

            # 2nd Half data
            sh_ta = ta_score - ht_ta
            sh_tb = tb_score - ht_tb
            sh_total = sh_ta + sh_tb

            # 2nd Half 1X2
            if sh_ta > sh_tb:
                sh_result = "1"
            elif sh_ta < sh_tb:
                sh_result = "2"
            else:
                sh_result = "x"

            # 2nd Half BTTS
            sh_btts_flag = sh_ta > 0 and sh_tb > 0

            # 2nd Half combined: 1X2 & BTTS
            sh_1x2_btts[f"{sh_result}_{'yes' if sh_btts_flag else 'no'}"] += 1

            # 2nd Half combined: 1X2 & Total O/U 1.5
            sh_ou = "over" if sh_total > 1.5 else "under"
            sh_1x2_total[f"{sh_result}_{sh_ou}"] += 1

            # HT/FT result
            htft_key = f"{ht_result}/{ft_result}"
            htft_results[htft_key] = htft_results.get(htft_key, 0) + 1

            # Both halves Over/Under 1.5
            if ht_total >= 2 and sh_total >= 2:
                both_halves_over_15 += 1
            if ht_total <= 1 and sh_total <= 1:
                both_halves_under_15 += 1

    avg_goals = total_goals / total_matches if total_matches > 0 else 0
    avg_team_a_goals = team_a_goals / total_matches if total_matches > 0 else 0
    avg_team_b_goals = team_b_goals / total_matches if total_matches > 0 else 0

    # Calculate percentages
    def pct(count):
        return round((count / total_matches) * 100, 1) if total_matches > 0 else 0

    # Goals analysis
    goals_analysis = {
        "avg_total_goals": round(avg_goals, 2),
        "avg_team_a_goals": round(avg_team_a_goals, 2),
        "avg_team_b_goals": round(avg_team_b_goals, 2),
        "total_goals_scored": total_goals,
        "over_under": {
            "over_05": {"count": over_05, "percentage": pct(over_05), "prediction": "Yes" if pct(over_05) >= 50 else "No"},
            "over_15": {"count": over_15, "percentage": pct(over_15), "prediction": "Yes" if pct(over_15) >= 50 else "No"},
            "over_25": {"count": over_25, "percentage": pct(over_25), "prediction": "Yes" if pct(over_25) >= 50 else "No"},
            "over_35": {"count": over_35, "percentage": pct(over_35), "prediction": "Yes" if pct(over_35) >= 50 else "No"},
            "over_45": {"count": over_45, "percentage": pct(over_45), "prediction": "Yes" if pct(over_45) >= 50 else "No"},
            "over_55": {"count": over_55, "percentage": pct(over_55), "prediction": "Yes" if pct(over_55) >= 50 else "No"},
        },
        "btts": {
            "yes": {"count": btts_yes, "percentage": pct(btts_yes)},
            "no": {"count": total_matches - btts_yes, "percentage": pct(total_matches - btts_yes)},
            "prediction": "Yes" if pct(btts_yes) >= 50 else "No"
        }
    }

    # Result analysis (1X2 and double chance)
    team_a_win_pct = pct(team_a_wins)
    team_b_win_pct = pct(team_b_wins)
    draw_pct = pct(draws)

    # Draw No Bet (only team_a or team_b can win)
    total_decisive = team_a_wins + team_b_wins
    dnb_team_a = round((team_a_wins / total_decisive) * 100, 1) if total_decisive > 0 else 50
    dnb_team_b = round(100 - dnb_team_a, 1)

    # First Goal prediction (based on scoring patterns)
    first_goal_team_a = round(50 + (avg_team_a_goals - avg_team_b_goals) * 10, 1)
    first_goal_team_a = min(75, max(25, first_goal_team_a))
    no_goal_pct = round(pct(over_05) * 0.05, 1)  # ~5% of matches with 0 goals

    # Multigoals (goal ranges)
    multigoals = {
        "1-2": round(max(5, 30 - abs(avg_goals - 1.5) * 15), 1),
        "1-3": round(max(10, 45 - abs(avg_goals - 2) * 10), 1),
        "1-4": round(max(15, 55 - abs(avg_goals - 2.5) * 8), 1),
        "1-5": round(max(20, 65 - abs(avg_goals - 3) * 6), 1),
        "2-3": round(max(10, 40 - abs(avg_goals - 2.5) * 12), 1),
        "2-4": round(max(15, 50 - abs(avg_goals - 3) * 10), 1),
        "2-5": round(max(20, 55 - abs(avg_goals - 3.5) * 8), 1),
        "3-4": round(max(10, 35 - abs(avg_goals - 3.5) * 12), 1),
        "3-5": round(max(15, 45 - abs(avg_goals - 4) * 10), 1),
        "4-6": round(max(10, 30 - abs(avg_goals - 5) * 10), 1),
        "0": round(100 - pct(over_05), 1),  # No goal
        "7+": round(max(2, (avg_goals - 4) * 5), 1),
    }

    # Team Totals (individual team goals)
    team_totals = {
        "team_a": {
            "over_05": round(min(95, 50 + avg_team_a_goals * 25), 1),
            "over_15": round(min(85, 30 + avg_team_a_goals * 20), 1),
            "over_25": round(min(70, 15 + avg_team_a_goals * 15), 1),
        },
        "team_b": {
            "over_05": round(min(95, 50 + avg_team_b_goals * 25), 1),
            "over_15": round(min(85, 30 + avg_team_b_goals * 20), 1),
            "over_25": round(min(70, 15 + avg_team_b_goals * 15), 1),
        }
    }

    # Helper for HT percentage calculations
    def ht_pct(count):
        return round((count / ht_matches) * 100, 1) if ht_matches > 0 else 0

    # First Half analysis - use actual HT data if available, else estimate
    if ht_matches > 0:
        first_half_analysis = {
            "over_05": ht_pct(ht_over_05),
            "over_15": ht_pct(ht_over_15),
            "over_25": ht_pct(ht_over_25),
            "1x2": {
                "team_a": ht_pct(ht_team_a_wins),
                "draw": ht_pct(ht_draws),
                "team_b": ht_pct(ht_team_b_wins),
            },
            "double_chance": {
                "1X": ht_pct(ht_team_a_wins + ht_draws),
                "X2": ht_pct(ht_team_b_wins + ht_draws),
                "12": ht_pct(ht_team_a_wins + ht_team_b_wins),
            },
            "btts": {
                "yes": ht_pct(ht_btts),
                "no": ht_pct(ht_matches - ht_btts),
                "prediction": "Yes" if ht_btts > ht_matches / 2 else "No"
            },
            "team_total": {
                "team_a": {
                    "over_05": ht_pct(ht_team_a_over_05),
                    "over_15": ht_pct(ht_team_a_over_15),
                },
                "team_b": {
                    "over_05": ht_pct(ht_team_b_over_05),
                    "over_15": ht_pct(ht_team_b_over_15),
                },
            },
            "exact_goals": {str(k): ht_pct(v) for k, v in ht_exact.items()},
            "handicap": {
                str(h): {
                    "team_a": ht_pct(ht_handicap_results[h]["team_a"]),
                    "draw": ht_pct(ht_handicap_results[h]["draw"]),
                    "team_b": ht_pct(ht_handicap_results[h]["team_b"]),
                } for h in [-1, 1]
            },
            "1x2_btts": {k: ht_pct(v) for k, v in fh_1x2_btts.items()},
            "1x2_total": {k: ht_pct(v) for k, v in fh_1x2_total.items()},
            "bookings_ou": {
                "over_05": round(min(85, 30 + avg_goals * 8), 1),
                "over_15": round(min(70, 15 + avg_goals * 6), 1),
                "over_25": round(min(50, 5 + avg_goals * 4), 1),
                "is_estimate": True,
            },
            "corners_ou": {
                "over_35": round(min(80, 35 + avg_goals * 6), 1),
                "over_45": round(min(70, 25 + avg_goals * 5), 1),
                "over_55": round(min(55, 15 + avg_goals * 4), 1),
                "is_estimate": True,
            },
        }
    else:
        first_half_avg_goals = avg_goals * 0.42
        first_half_analysis = {
            "over_05": round(min(90, 40 + first_half_avg_goals * 30), 1),
            "over_15": round(min(70, 20 + first_half_avg_goals * 25), 1),
            "over_25": round(min(50, 10 + first_half_avg_goals * 20), 1),
            "1x2": {
                "team_a": round(team_a_win_pct * 0.75, 1),
                "draw": round(40 + draw_pct * 0.5, 1),
                "team_b": round(team_b_win_pct * 0.75, 1),
            },
            "double_chance": {
                "1X": round(min(85, team_a_win_pct * 0.75 + 40), 1),
                "X2": round(min(85, team_b_win_pct * 0.75 + 40), 1),
                "12": round(max(30, (team_a_win_pct + team_b_win_pct) * 0.6), 1),
            },
            "btts": {
                "yes": round(pct(btts_yes) * 0.35, 1),
                "no": round(100 - pct(btts_yes) * 0.35, 1),
                "prediction": "No"
            },
            "team_total": {
                "team_a": {"over_05": round(team_totals["team_a"]["over_05"] * 0.6, 1), "over_15": round(team_totals["team_a"]["over_15"] * 0.4, 1)},
                "team_b": {"over_05": round(team_totals["team_b"]["over_05"] * 0.6, 1), "over_15": round(team_totals["team_b"]["over_15"] * 0.4, 1)},
            },
            "exact_goals": {"0": round(100 - min(90, 40 + avg_goals * 0.42 * 30), 1), "1": round(35, 1), "2+": round(min(50, 10 + avg_goals * 0.42 * 20), 1)},
            "handicap": {
                "-1": {"team_a": round(team_a_win_pct * 0.4, 1), "draw": round(30, 1), "team_b": round(70 - team_a_win_pct * 0.4, 1)},
                "1": {"team_a": round(min(80, team_a_win_pct * 0.75 + 25), 1), "draw": round(20, 1), "team_b": round(max(5, team_b_win_pct * 0.4), 1)},
            },
            "1x2_btts": {k: round(100 / 6, 1) for k in fh_1x2_btts.keys()},
            "1x2_total": {k: round(100 / 6, 1) for k in fh_1x2_total.keys()},
            "bookings_ou": {
                "over_05": round(min(85, 30 + avg_goals * 8), 1),
                "over_15": round(min(70, 15 + avg_goals * 6), 1),
                "over_25": round(min(50, 5 + avg_goals * 4), 1),
                "is_estimate": True,
            },
            "corners_ou": {
                "over_35": round(min(80, 35 + avg_goals * 6), 1),
                "over_45": round(min(70, 25 + avg_goals * 5), 1),
                "over_55": round(min(55, 15 + avg_goals * 4), 1),
                "is_estimate": True,
            },
        }

    # 2nd Half combined markets
    second_half_analysis = {
        "1x2_btts": {k: ht_pct(v) for k, v in sh_1x2_btts.items()} if ht_matches > 0 else {},
        "1x2_total": {k: ht_pct(v) for k, v in sh_1x2_total.items()} if ht_matches > 0 else {},
    }

    # Exact Goals (full-time)
    exact_goals_data = {str(k): pct(v) for k, v in exact_goals_count.items()}

    # Team Exact Goals
    team_a_exact_data = {str(k): pct(v) for k, v in team_a_exact.items()}
    team_b_exact_data = {str(k): pct(v) for k, v in team_b_exact.items()}

    # Team Clean Sheet
    clean_sheet_data = {
        "team_a": {"yes": pct(team_a_clean_sheet), "no": pct(total_matches - team_a_clean_sheet)},
        "team_b": {"yes": pct(team_b_clean_sheet), "no": pct(total_matches - team_b_clean_sheet)},
    }

    # Full-time 1X2 & BTTS combined
    ft_1x2_btts_data = {k: pct(v) for k, v in ft_1x2_btts.items()}

    # Total & BTTS combined
    total_btts_data = {k: pct(v) for k, v in total_btts.items()}

    # Full-time Handicap (European)
    handicap_data = {}
    for h in handicap_levels:
        handicap_data[str(h)] = {
            "team_a": pct(handicap_results[h]["team_a"]),
            "draw": pct(handicap_results[h]["draw"]),
            "team_b": pct(handicap_results[h]["team_b"]),
        }

    # Team Multigoals
    team_a_multigoals = {
        "0": pct(team_a_exact.get(0, 0)),
        "1-2": pct(team_a_exact.get(1, 0) + team_a_exact.get(2, 0)),
        "1-3": pct(team_a_exact.get(1, 0) + team_a_exact.get(2, 0) + team_a_exact.get("3+", 0)),
        "2-3": pct(team_a_exact.get(2, 0) + team_a_exact.get("3+", 0)),
        "4+": round(max(2, pct(team_a_exact.get("3+", 0)) * 0.4), 1),
    }
    team_b_multigoals = {
        "0": pct(team_b_exact.get(0, 0)),
        "1-2": pct(team_b_exact.get(1, 0) + team_b_exact.get(2, 0)),
        "1-3": pct(team_b_exact.get(1, 0) + team_b_exact.get(2, 0) + team_b_exact.get("3+", 0)),
        "2-3": pct(team_b_exact.get(2, 0) + team_b_exact.get("3+", 0)),
        "4+": round(max(2, pct(team_b_exact.get("3+", 0)) * 0.4), 1),
    }

    # Correct Score (Poisson model)
    import math
    def poisson_prob(lam, k):
        return (lam ** k) * math.exp(-lam) / math.factorial(k)

    correct_score_data = {}
    for i in range(5):
        for j in range(5):
            prob = poisson_prob(avg_team_a_goals, i) * poisson_prob(avg_team_b_goals, j) * 100
            correct_score_data[f"{i}:{j}"] = round(prob, 1)
    # "Other" = 100 - sum of all computed
    listed_sum = sum(correct_score_data.values())
    correct_score_data["Other"] = round(max(0, 100 - listed_sum), 1)

    # HT/FT & Total combined
    htft_total_data = {}
    if ht_matches > 0:
        for key in ["1/1", "1/x", "1/2", "x/1", "x/x", "x/2", "2/1", "2/x", "2/2"]:
            htft_total_data[key] = ht_pct(htft_results.get(key, 0))

    # Both Halves Over/Under 1.5
    both_halves_data = {
        "over_15": ht_pct(both_halves_over_15) if ht_counted > 0 else round(max(5, (pct(over_35)) * 0.5), 1),
        "under_15": ht_pct(both_halves_under_15) if ht_counted > 0 else round(max(10, (100 - pct(over_15)) * 0.8), 1),
    }

    # 1st Goal & 1X2 combined (estimated from First Goal probs * 1X2 probs)
    fg_ta = first_goal_team_a / 100
    fg_tb = (100 - first_goal_team_a - no_goal_pct) / 100
    fg_no = no_goal_pct / 100
    ta_wp = team_a_win_pct / 100
    tb_wp = team_b_win_pct / 100
    dr_p = draw_pct / 100
    first_goal_1x2_data = {
        "1_goal_1": round(fg_ta * ta_wp * 1.3 * 100, 1),  # slight correlation boost
        "1_goal_x": round(fg_ta * dr_p * 0.8 * 100, 1),
        "1_goal_2": round(fg_ta * tb_wp * 0.5 * 100, 1),
        "2_goal_1": round(fg_tb * ta_wp * 0.5 * 100, 1),
        "2_goal_x": round(fg_tb * dr_p * 0.8 * 100, 1),
        "2_goal_2": round(fg_tb * tb_wp * 1.3 * 100, 1),
        "no_goal": round(fg_no * 100, 1),
    }
    # Normalize to 100%
    fg_total = sum(first_goal_1x2_data.values())
    if fg_total > 0:
        first_goal_1x2_data = {k: round(v / fg_total * 100, 1) for k, v in first_goal_1x2_data.items()}

    result_analysis = {
        "1x2": {
            "team_a_wins": {"count": team_a_wins, "percentage": team_a_win_pct},
            "draws": {"count": draws, "percentage": draw_pct},
            "team_b_wins": {"count": team_b_wins, "percentage": team_b_win_pct},
            "prediction": "1" if team_a_win_pct > team_b_win_pct and team_a_win_pct > draw_pct else
                         ("2" if team_b_win_pct > team_a_win_pct and team_b_win_pct > draw_pct else "X")
        },
        "double_chance": {
            "1X": {"percentage": round(team_a_win_pct + draw_pct, 1), "matches": team_a_wins + draws},
            "X2": {"percentage": round(draw_pct + team_b_win_pct, 1), "matches": draws + team_b_wins},
            "12": {"percentage": round(team_a_win_pct + team_b_win_pct, 1), "matches": team_a_wins + team_b_wins},
        },
        "draw_no_bet": {
            "team_a": {"percentage": dnb_team_a, "name": team_a.get("name")},
            "team_b": {"percentage": dnb_team_b, "name": team_b.get("name")},
            "prediction": "1" if dnb_team_a > dnb_team_b else "2"
        },
        "first_goal": {
            "team_a": {"percentage": first_goal_team_a, "name": team_a.get("name")},
            "team_b": {"percentage": round(100 - first_goal_team_a - no_goal_pct, 1), "name": team_b.get("name")},
            "no_goal": {"percentage": no_goal_pct},
        },
        "multigoals": multigoals,
        "team_multigoals": {
            "team_a": team_a_multigoals,
            "team_b": team_b_multigoals,
        },
        "team_totals": team_totals,
        "first_half": first_half_analysis,
        "second_half": second_half_analysis,
        "handicap": handicap_data,
        "exact_goals": exact_goals_data,
        "team_exact_goals": {
            "team_a": team_a_exact_data,
            "team_b": team_b_exact_data,
        },
        "clean_sheet": clean_sheet_data,
        "1x2_btts": ft_1x2_btts_data,
        "total_btts": total_btts_data,
        "correct_score": correct_score_data,
        "htft": htft_total_data,
        "both_halves": both_halves_data,
        "first_goal_1x2": first_goal_1x2_data,
        "recommended_bet": _get_recommended_bet(team_a_win_pct, draw_pct, team_b_win_pct, team_a.get("name"), team_b.get("name"))
    }

    # Format matches for display (only completed matches)
    formatted_matches = []
    for match in completed_h2h[:10]:  # Last 10 completed matches
        home_id = match.get("home_team_id")
        home_score = match.get("home_score", 0) or 0
        away_score = match.get("away_score", 0) or 0

        # Determine result for team_a
        if home_id == team_a_id:
            result = "W" if home_score > away_score else ("L" if away_score > home_score else "D")
        else:
            result = "W" if away_score > home_score else ("L" if home_score > away_score else "D")

        formatted_matches.append({
            "date": match.get("date"),
            "home_team": match.get("home_team"),
            "away_team": match.get("away_team"),
            "home_score": home_score,
            "away_score": away_score,
            "team_a_result": result,
            "venue": match.get("venue"),
        })

    # Get total teams for motivation context
    total_teams = len(teams) if teams else 20

    return {
        "team_a": {"id": team_a_id, "name": team_a.get("name"), "crest": team_a.get("crest")},
        "team_b": {"id": team_b_id, "name": team_b.get("name"), "crest": team_b.get("crest")},
        "matches": formatted_matches,
        "total_matches": total_matches,
        "goals_analysis": goals_analysis,
        "result_analysis": result_analysis,
        "home_form": home_form_analysis,
        "away_form": away_form_analysis,
        "form_strings": {
            "team_a": team_a.get("form", ""),
            "team_b": team_b.get("form", ""),
        },
        "motivation": {
            "team_a": _get_motivation(team_a, total_teams),
            "team_b": _get_motivation(team_b, total_teams),
        },
        "positions": {
            "team_a": team_a.get("position"),
            "team_b": team_b.get("position"),
        },
        "data_source": "API-Football" if config.API_FOOTBALL_KEY else "Sample Data"
    }


def _get_motivation(team, total_teams=20):
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
    elif position >= total_teams - 2:
        return {"level": "Desperate", "note": "Relegation battle - survival mode"}
    elif position >= total_teams - 5:
        return {"level": "High", "note": "Hovering near relegation zone"}
    else:
        return {"level": "Moderate", "note": "Mid-table with little at stake"}


def _analyze_home_form(team, all_teams):
    """Analyze home team's performance at home."""
    home_wins = team.get("home_wins", 0)
    home_draws = team.get("home_draws", 0)
    home_losses = team.get("home_losses", 0)
    home_played = team.get("home_played", 0) or (home_wins + home_draws + home_losses)
    home_goals_for = team.get("home_goals_for", 0)
    home_goals_against = team.get("home_goals_against", 0)

    if home_played == 0:
        home_played = 10  # Default for sample data
        home_wins = 5
        home_draws = 3
        home_losses = 2
        home_goals_for = 15
        home_goals_against = 8

    win_pct = round((home_wins / home_played) * 100, 1) if home_played > 0 else 0
    draw_pct = round((home_draws / home_played) * 100, 1) if home_played > 0 else 0
    loss_pct = round((home_losses / home_played) * 100, 1) if home_played > 0 else 0
    avg_goals_scored = round(home_goals_for / home_played, 2) if home_played > 0 else 0
    avg_goals_conceded = round(home_goals_against / home_played, 2) if home_played > 0 else 0

    # Generate analysis notes
    notes = []
    if win_pct >= 60:
        notes.append(f"Strong home record - wins {win_pct}% of home matches")
    elif win_pct >= 40:
        notes.append(f"Moderate home record - wins {win_pct}% at home")
    else:
        notes.append(f"Struggles at home - only wins {win_pct}% of home games")

    if avg_goals_scored >= 2:
        notes.append(f"Scores frequently at home ({avg_goals_scored} goals per game)")
    if avg_goals_conceded <= 1:
        notes.append(f"Solid home defense ({avg_goals_conceded} goals conceded per game)")
    elif avg_goals_conceded >= 1.5:
        notes.append(f"Vulnerable at home ({avg_goals_conceded} goals conceded per game)")

    # Determine strength
    if win_pct >= 60 and avg_goals_conceded < 1.2:
        strength = "fortress"
        strength_note = "This is a fortress - very difficult for away teams"
    elif win_pct >= 50:
        strength = "strong"
        strength_note = "Strong home advantage - expect them to perform well"
    elif win_pct >= 35:
        strength = "average"
        strength_note = "Average home form - no significant advantage"
    else:
        strength = "weak"
        strength_note = "Weak home form - away team has a good chance here"

    return {
        "played": home_played,
        "wins": home_wins,
        "draws": home_draws,
        "losses": home_losses,
        "win_percentage": win_pct,
        "draw_percentage": draw_pct,
        "loss_percentage": loss_pct,
        "goals_scored": home_goals_for,
        "goals_conceded": home_goals_against,
        "avg_goals_scored": avg_goals_scored,
        "avg_goals_conceded": avg_goals_conceded,
        "strength": strength,
        "strength_note": strength_note,
        "notes": notes,
    }


def _analyze_away_form(team, all_teams):
    """Analyze away team's performance away from home."""
    away_wins = team.get("away_wins", 0)
    away_draws = team.get("away_draws", 0)
    away_losses = team.get("away_losses", 0)
    away_played = team.get("away_played", 0) or (away_wins + away_draws + away_losses)
    away_goals_for = team.get("away_goals_for", 0)
    away_goals_against = team.get("away_goals_against", 0)

    if away_played == 0:
        away_played = 10  # Default for sample data
        away_wins = 3
        away_draws = 3
        away_losses = 4
        away_goals_for = 10
        away_goals_against = 12

    win_pct = round((away_wins / away_played) * 100, 1) if away_played > 0 else 0
    draw_pct = round((away_draws / away_played) * 100, 1) if away_played > 0 else 0
    loss_pct = round((away_losses / away_played) * 100, 1) if away_played > 0 else 0
    avg_goals_scored = round(away_goals_for / away_played, 2) if away_played > 0 else 0
    avg_goals_conceded = round(away_goals_against / away_played, 2) if away_played > 0 else 0

    # Generate analysis notes
    notes = []
    if win_pct >= 50:
        notes.append(f"Excellent away record - wins {win_pct}% of away matches")
    elif win_pct >= 30:
        notes.append(f"Moderate away record - wins {win_pct}% away from home")
    else:
        notes.append(f"Poor away form - only wins {win_pct}% on the road")

    if avg_goals_scored >= 1.5:
        notes.append(f"Scores well on the road ({avg_goals_scored} goals per game)")
    if avg_goals_conceded >= 1.5:
        notes.append(f"Concedes often away ({avg_goals_conceded} goals per game)")
    elif avg_goals_conceded <= 1:
        notes.append(f"Defensively solid away ({avg_goals_conceded} goals conceded)")

    # Determine strength
    if win_pct >= 50 and avg_goals_scored >= 1.5:
        strength = "excellent"
        strength_note = "Dangerous away side - travels well and scores freely"
    elif win_pct >= 35:
        strength = "good"
        strength_note = "Capable away team - can get results on the road"
    elif win_pct >= 20:
        strength = "average"
        strength_note = "Typical away form - struggles like most teams on the road"
    else:
        strength = "poor"
        strength_note = "Very poor travellers - home team should dominate"

    return {
        "played": away_played,
        "wins": away_wins,
        "draws": away_draws,
        "losses": away_losses,
        "win_percentage": win_pct,
        "draw_percentage": draw_pct,
        "loss_percentage": loss_pct,
        "goals_scored": away_goals_for,
        "goals_conceded": away_goals_against,
        "avg_goals_scored": avg_goals_scored,
        "avg_goals_conceded": avg_goals_conceded,
        "strength": strength,
        "strength_note": strength_note,
        "notes": notes,
    }


def _get_recommended_bet(team_a_pct, draw_pct, team_b_pct, team_a_name, team_b_name):
    """Generate betting recommendation based on H2H statistics."""
    recommendations = []

    # Strong favorite (>50% wins)
    if team_a_pct >= 50:
        recommendations.append({
            "bet": "1",
            "confidence": "High" if team_a_pct >= 60 else "Medium",
            "reason": f"{team_a_name} won {team_a_pct}% of H2H matches"
        })
    elif team_b_pct >= 50:
        recommendations.append({
            "bet": "2",
            "confidence": "High" if team_b_pct >= 60 else "Medium",
            "reason": f"{team_b_name} won {team_b_pct}% of H2H matches"
        })

    # Double chance recommendations
    if team_a_pct + draw_pct >= 70:
        recommendations.append({
            "bet": "1X",
            "confidence": "High" if team_a_pct + draw_pct >= 80 else "Medium",
            "reason": f"{team_a_name} win or draw in {round(team_a_pct + draw_pct)}% of matches"
        })
    if team_b_pct + draw_pct >= 70:
        recommendations.append({
            "bet": "X2",
            "confidence": "High" if team_b_pct + draw_pct >= 80 else "Medium",
            "reason": f"{team_b_name} win or draw in {round(team_b_pct + draw_pct)}% of matches"
        })

    # High scoring matches
    if team_a_pct + team_b_pct >= 75:
        recommendations.append({
            "bet": "12",
            "confidence": "Medium",
            "reason": f"Decisive results (no draw) in {round(team_a_pct + team_b_pct)}% of matches"
        })

    # If no strong recommendation
    if not recommendations:
        recommendations.append({
            "bet": "Avoid",
            "confidence": "Low",
            "reason": "No clear pattern in H2H - unpredictable fixture"
        })

    return recommendations


@app.get("/api/match-stats/{team_a_id}/{team_b_id}")
async def get_match_stats(team_a_id: int, team_b_id: int, competition: str = "PL"):
    """Get comprehensive match statistics including corners, cards, and goals."""
    # Resolve league ID: check config first, then try numeric string
    if competition in config.LEAGUE_IDS:
        league_id = config.LEAGUE_IDS[competition]
    else:
        try:
            league_id = int(competition)
        except (ValueError, TypeError):
            league_id = 39

    # Fetch team statistics for both teams
    stats_a = await football_api.fetch_team_statistics(team_a_id, league_id)
    stats_b = await football_api.fetch_team_statistics(team_b_id, league_id)

    # Fetch teams info
    teams = await get_teams(competition)
    team_a = next((t for t in teams if t["id"] == team_a_id), {"name": f"Team {team_a_id}"})
    team_b = next((t for t in teams if t["id"] == team_b_id), {"name": f"Team {team_b_id}"})

    def parse_team_stats(stats, team_info):
        if not stats:
            return _generate_sample_stats(team_info)

        # Parse cards
        cards = stats.get("cards", {})
        yellow_cards = cards.get("yellow", {})
        red_cards = cards.get("red", {})

        total_yellow = sum(int(v.get("total") or 0) for v in yellow_cards.values() if v)
        total_red = sum(int(v.get("total") or 0) for v in red_cards.values() if v)

        # Parse goals by minute
        goals = stats.get("goals", {})
        goals_for = goals.get("for", {})
        goals_against = goals.get("against", {})

        # Get fixtures played
        fixtures = stats.get("fixtures", {})
        played = fixtures.get("played", {})
        total_played = (played.get("home") or 0) + (played.get("away") or 0)

        # Calculate averages
        avg_yellow = round(total_yellow / total_played, 2) if total_played > 0 else 0
        avg_red = round(total_red / total_played, 2) if total_played > 0 else 0

        # Parse penalty data
        penalty = stats.get("penalty", {})
        penalty_scored = penalty.get("scored", {})
        penalty_missed = penalty.get("missed", {})

        # Parse goals by minute distribution
        goals_for_minute = goals_for.get("minute", {}) if isinstance(goals_for, dict) else {}
        goals_against_minute = goals_against.get("minute", {}) if isinstance(goals_against, dict) else {}

        def parse_minute_goals(minute_data):
            """Convert API minute data to simplified dict."""
            result = {}
            for period, vals in minute_data.items():
                if vals and isinstance(vals, dict):
                    result[period] = vals.get("total") or 0
            return result

        # Parse formations
        formations_data = stats.get("lineups", [])
        formations = []
        for lineup in (formations_data or []):
            formation = lineup.get("formation")
            played = lineup.get("played") or 0
            if formation and played > 0:
                formations.append({"formation": formation, "played": played})

        # Calculate squad stability (primary formation usage %)
        total_formation_games = sum(f["played"] for f in formations) if formations else 0
        primary_formation = formations[0] if formations else None
        stability_pct = round((primary_formation["played"] / total_formation_games) * 100) if primary_formation and total_formation_games > 0 else 0

        return {
            "team": {
                "id": team_info.get("id"),
                "name": team_info.get("name"),
                "crest": team_info.get("crest"),
            },
            "fixtures_played": total_played,
            "cards": {
                "yellow_total": total_yellow,
                "red_total": total_red,
                "yellow_per_match": avg_yellow,
                "red_per_match": avg_red,
            },
            "penalties": {
                "scored": penalty_scored.get("total") or 0,
                "missed": penalty_missed.get("total") or 0,
                "percentage": penalty_scored.get("percentage", "0%"),
            },
            "clean_sheets": {
                "home": stats.get("clean_sheet", {}).get("home") or 0,
                "away": stats.get("clean_sheet", {}).get("away") or 0,
                "total": (stats.get("clean_sheet", {}).get("home") or 0) + (stats.get("clean_sheet", {}).get("away") or 0),
            },
            "failed_to_score": {
                "home": stats.get("failed_to_score", {}).get("home") or 0,
                "away": stats.get("failed_to_score", {}).get("away") or 0,
                "total": (stats.get("failed_to_score", {}).get("home") or 0) + (stats.get("failed_to_score", {}).get("away") or 0),
            },
            "goals_by_minute": {
                "scored": parse_minute_goals(goals_for_minute),
                "conceded": parse_minute_goals(goals_against_minute),
            },
            "formations": formations,
            "squad_stability": {
                "primary_formation": primary_formation["formation"] if primary_formation else None,
                "usage_percentage": stability_pct,
                "formations_used": len(formations),
                "rating": "High" if stability_pct >= 70 else "Medium" if stability_pct >= 45 else "Low",
            },
        }

    team_a_stats = parse_team_stats(stats_a, team_a)
    team_b_stats = parse_team_stats(stats_b, team_b)

    # Calculate corner predictions based on team stats
    corner_analysis = _calculate_corner_predictions(team_a_stats, team_b_stats, team_a, team_b)

    # Calculate card predictions
    card_analysis = _calculate_card_predictions(team_a_stats, team_b_stats, team_a, team_b)

    # Fetch injuries, coaches, and formations via AI-verified data (with Gemini/API-Football fallback)
    _ms_verified = None
    try:
        _ms_verified = await data_verifier.get_verified_match_data(
            team_a_id=team_a_id, team_a_name=team_a["name"],
            team_b_id=team_b_id, team_b_name=team_b["name"],
            competition=competition, league_id=league_id,
        )
        if _ms_verified:
            injuries_a, injuries_b, coach_a, coach_b, gemini_formation_a, gemini_formation_b = \
                data_verifier.extract_for_match_stats(_ms_verified)
        else:
            raise ValueError("Verification returned None")
    except Exception as _ms_ve:
        print(f"[match-stats] Verification fallback: {_ms_ve}")
        import gemini_football_data
        injuries_a, injuries_b, coach_a, coach_b, gemini_formation_a, gemini_formation_b = \
            await gemini_football_data.get_enhanced_team_data(
                team_a["name"], team_b["name"], competition, team_a_id, team_b_id, league_id
            )

    # If API-Football returned no formation data, use Gemini's formation as fallback
    if not team_a_stats.get("formations") and gemini_formation_a:
        team_a_stats["formations"] = [{"formation": gemini_formation_a, "played": 0}]
        team_a_stats["squad_stability"] = {
            "primary_formation": gemini_formation_a,
            "usage_percentage": 0,
            "formations_used": 1,
            "rating": "Unknown",
        }
    if not team_b_stats.get("formations") and gemini_formation_b:
        team_b_stats["formations"] = [{"formation": gemini_formation_b, "played": 0}]
        team_b_stats["squad_stability"] = {
            "primary_formation": gemini_formation_b,
            "usage_percentage": 0,
            "formations_used": 1,
            "rating": "Unknown",
        }

    return {
        "team_a": team_a_stats,
        "team_b": team_b_stats,
        "corner_analysis": corner_analysis,
        "card_analysis": card_analysis,
        "injuries": {
            "team_a": injuries_a or [],
            "team_b": injuries_b or [],
        },
        "coaches": {
            "team_a": coach_a,
            "team_b": coach_b,
        },
        "transfers": {
            "team_a": {
                "in": _ms_verified["team_a"].get("transfers_in", []) if _ms_verified else [],
                "out": _ms_verified["team_a"].get("transfers_out", []) if _ms_verified else [],
            },
            "team_b": {
                "in": _ms_verified["team_b"].get("transfers_in", []) if _ms_verified else [],
                "out": _ms_verified["team_b"].get("transfers_out", []) if _ms_verified else [],
            },
        } if _ms_verified else None,
        "data_source": "AI-Verified" if _ms_verified and _ms_verified.get("source") == "gemini_verified" else ("API-Football" if stats_a or stats_b else "Sample Data"),
    }


def _generate_sample_stats(team_info):
    """Generate sample statistics when API data is unavailable."""
    import random
    played = random.randint(28, 38)
    return {
        "team": {
            "id": team_info.get("id"),
            "name": team_info.get("name"),
            "crest": team_info.get("crest"),
        },
        "fixtures_played": played,
        "cards": {
            "yellow_total": random.randint(40, 70),
            "red_total": random.randint(1, 5),
            "yellow_per_match": round(random.uniform(1.2, 2.2), 2),
            "red_per_match": round(random.uniform(0.05, 0.15), 2),
        },
        "penalties": {
            "scored": random.randint(3, 10),
            "missed": random.randint(0, 3),
            "percentage": f"{random.randint(70, 90)}%",
        },
        "clean_sheets": {
            "home": random.randint(5, 12),
            "away": random.randint(2, 8),
            "total": random.randint(8, 18),
        },
        "failed_to_score": {
            "home": random.randint(2, 6),
            "away": random.randint(3, 8),
            "total": random.randint(5, 12),
        },
        "corners_per_match": round(random.uniform(4.5, 6.5), 2),
    }


def _calculate_corner_predictions(stats_a, stats_b, team_a, team_b):
    """Calculate corner over/under predictions based on team statistics."""
    # Estimate corners per match (based on typical averages if not available)
    corners_a = stats_a.get("corners_per_match", 5.2)
    corners_b = stats_b.get("corners_per_match", 4.8)
    expected_total = corners_a + corners_b

    # Corner thresholds and probabilities
    thresholds = {
        "over_85": {"line": 8.5, "expected": expected_total},
        "over_95": {"line": 9.5, "expected": expected_total},
        "over_105": {"line": 10.5, "expected": expected_total},
        "over_115": {"line": 11.5, "expected": expected_total},
        "over_125": {"line": 12.5, "expected": expected_total},
    }

    predictions = {}
    for key, data in thresholds.items():
        diff = expected_total - data["line"]
        prob = min(95, max(5, 50 + (diff * 15)))
        predictions[key] = {
            "percentage": round(prob, 1),
            "prediction": "Yes" if prob >= 50 else "No",
            "confidence": "High" if abs(prob - 50) > 25 else ("Medium" if abs(prob - 50) > 10 else "Low"),
        }

    # Corner 1x2 (which team wins corner count)
    corner_diff = corners_a - corners_b
    team_a_corner_prob = min(85, max(15, 50 + (corner_diff * 10)))
    team_b_corner_prob = 100 - team_a_corner_prob - 10  # 10% for draw
    draw_corner_prob = 10

    # Corner ranges
    corner_ranges = {
        "0-8": round(max(5, 35 - (expected_total - 8) * 10), 1),
        "9-11": round(min(60, max(20, 50 - abs(expected_total - 10) * 8)), 1),
        "12+": round(max(5, 15 + (expected_total - 10) * 10), 1),
    }

    # First corner prediction
    first_corner_team_a = round(50 + (corner_diff * 5), 1)
    first_corner_team_a = min(75, max(25, first_corner_team_a))

    return {
        "expected_total": round(expected_total, 1),
        "team_a_expected": round(corners_a, 1),
        "team_b_expected": round(corners_b, 1),
        "over_under": predictions,
        "corner_1x2": {
            "team_a": {"percentage": round(team_a_corner_prob, 1), "name": team_a.get("name")},
            "draw": {"percentage": round(draw_corner_prob, 1)},
            "team_b": {"percentage": round(team_b_corner_prob, 1), "name": team_b.get("name")},
            "prediction": "1" if team_a_corner_prob > team_b_corner_prob else "2"
        },
        "corner_ranges": corner_ranges,
        "first_corner": {
            "team_a": {"percentage": first_corner_team_a, "name": team_a.get("name")},
            "team_b": {"percentage": round(100 - first_corner_team_a, 1), "name": team_b.get("name")},
        },
        "most_corners": {
            "team": team_a.get("name") if corners_a > corners_b else team_b.get("name"),
            "probability": round(max(corners_a, corners_b) / expected_total * 100, 1),
        }
    }


def _calculate_card_predictions(stats_a, stats_b, team_a, team_b):
    """Calculate card predictions based on team statistics."""
    cards_a = stats_a.get("cards", {})
    cards_b = stats_b.get("cards", {})

    yellow_a = cards_a.get("yellow_per_match", 1.5)
    yellow_b = cards_b.get("yellow_per_match", 1.5)
    red_a = cards_a.get("red_per_match", 0.1)
    red_b = cards_b.get("red_per_match", 0.1)

    expected_yellows = yellow_a + yellow_b
    expected_reds = red_a + red_b

    # Card over/under predictions
    card_thresholds = {
        "over_25_cards": {"line": 2.5, "expected": expected_yellows},
        "over_35_cards": {"line": 3.5, "expected": expected_yellows},
        "over_45_cards": {"line": 4.5, "expected": expected_yellows},
        "over_55_cards": {"line": 5.5, "expected": expected_yellows},
    }

    card_predictions = {}
    for key, data in card_thresholds.items():
        diff = expected_yellows - data["line"]
        prob = min(95, max(5, 50 + (diff * 20)))
        card_predictions[key] = {
            "percentage": round(prob, 1),
            "prediction": "Yes" if prob >= 50 else "No",
        }

    # Red card Yes/No
    red_card_prob = min(40, max(5, expected_reds * 100))

    # Booking 1x2 (which team gets more cards)
    card_diff = yellow_a - yellow_b
    team_a_card_prob = min(70, max(30, 50 + (card_diff * 8)))

    return {
        "expected_yellow_cards": round(expected_yellows, 1),
        "expected_red_cards": round(expected_reds, 2),
        "team_a": {
            "name": team_a.get("name"),
            "yellow_per_match": yellow_a,
            "red_per_match": red_a,
            "total_yellow": cards_a.get("yellow_total", 0),
            "total_red": cards_a.get("red_total", 0),
        },
        "team_b": {
            "name": team_b.get("name"),
            "yellow_per_match": yellow_b,
            "red_per_match": red_b,
            "total_yellow": cards_b.get("yellow_total", 0),
            "total_red": cards_b.get("red_total", 0),
        },
        "over_under": card_predictions,
        "red_card": {
            "yes": round(red_card_prob, 1),
            "no": round(100 - red_card_prob, 1),
            "prediction": "No"  # Red cards are rare
        },
        "booking_1x2": {
            "team_a": {"percentage": round(team_a_card_prob, 1), "name": team_a.get("name")},
            "draw": {"percentage": 15},
            "team_b": {"percentage": round(85 - team_a_card_prob, 1), "name": team_b.get("name")},
        },
        "red_card_probability": round(red_card_prob, 1),
    }


@app.get("/api/test-api")
async def test_api():
    """Test API-Football connection and return raw response."""
    import aiohttp

    if not config.API_FOOTBALL_KEY:
        return {"error": "API key not configured"}

    try:
        async with aiohttp.ClientSession() as session:
            # Use the correct API URL format
            url = "https://v3.football.api-sports.io/fixtures"
            headers = {
                "x-apisports-key": config.API_FOOTBALL_KEY
            }
            params = {
                "league": 39,  # Premier League
                "season": config.CURRENT_SEASON,
                "next": 10,  # Get next 10 fixtures
            }

            print(f"Testing API: URL={url}, Season={config.CURRENT_SEASON}")

            async with session.get(url, headers=headers, params=params) as response:
                data = await response.json()

                # Extract fixture info for display
                sample = None
                if data.get("response") and len(data.get("response")) > 0:
                    first = data["response"][0]
                    sample = {
                        "date": first.get("fixture", {}).get("date"),
                        "home": first.get("teams", {}).get("home", {}).get("name"),
                        "away": first.get("teams", {}).get("away", {}).get("name"),
                        "status": first.get("fixture", {}).get("status", {}).get("short"),
                    }

                return {
                    "status": response.status,
                    "api_url": url,
                    "season_used": config.CURRENT_SEASON,
                    "errors": data.get("errors"),
                    "results": data.get("results"),
                    "fixtures_count": len(data.get("response", [])),
                    "sample_fixture": sample,
                    "paging": data.get("paging"),
                }
    except Exception as e:
        return {"error": str(e), "type": type(e).__name__}


# ==================== JACKPOT ANALYZER ====================

class JackpotAnalyzeRequest(BaseModel):
    matches: List[dict]
    balance_paid: bool = False


@app.post("/api/jackpot/analyze")
async def analyze_jackpot(request: JackpotAnalyzeRequest, authorization: str = Header(None)):
    """Analyze multiple matches for jackpot prediction."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if len(request.matches) < 2:
        raise HTTPException(status_code=400, detail="Select at least 2 matches")

    # All tiers: 5 matches per session
    tier = payload.get("tier", "free")
    max_matches = 5
    if len(request.matches) > max_matches:
        raise HTTPException(
            status_code=403,
            detail=f"You can analyze up to {max_matches} matches per session."
        )

    user_id = payload["user_id"]

    # Check lock-based session limit for all tiers
    lock_info = jackpot_analyzer.get_jackpot_lock_status(user_id, tier)
    if lock_info["locked"] and not (tier == "free" and getattr(request, "balance_paid", False)):
        raise HTTPException(
            status_code=403,
            detail="You've used all your sessions. " + (
                "Wait for the timer to reset or deposit $2 to unlock."
                if tier == "free" else
                "Your sessions reset 24 hours after your last analysis."
            )
        )
    session_id = jackpot_analyzer.create_session(user_id, request.matches)

    try:
        results = []
        league_cache = {}

        for match in request.matches:
            try:
                result = await jackpot_analyzer.analyze_match_for_jackpot(match, league_cache)
                results.append(result)
            except Exception as e:
                print(f"[Jackpot] Analysis failed for match: {e}")
                results.append({
                    "fixture_id": match.get("fixture_id"),
                    "home_team": {"id": match.get("home_team_id"), "name": match.get("home_team_name", "?")},
                    "away_team": {"id": match.get("away_team_id"), "name": match.get("away_team_name", "?")},
                    "competition": match.get("competition"),
                    "status": "failed",
                    "error": str(e)
                })

        combinations = jackpot_analyzer.generate_winning_combinations(results)
        jackpot_analyzer.complete_session(session_id, results, combinations)

        # Record session lock for all tiers
        jackpot_analyzer.record_jackpot_session_lock(user_id, tier)

        return {
            "session_id": session_id,
            "total_analyzed": len(results),
            "results": results,
            "combinations": combinations,
        }
    except Exception as e:
        jackpot_analyzer.fail_session(session_id)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/api/jackpot/session/{session_id}")
async def get_jackpot_session(session_id: str, authorization: str = Header(None)):
    """Get a completed jackpot session."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = jackpot_analyzer.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session["id"],
        "status": session["status"],
        "total_matches": session["total_matches"],
        "results": json.loads(session["results"]) if session.get("results") else [],
        "best_combination": json.loads(session["best_combination"]) if session.get("best_combination") else None,
        "created_at": session["created_at"],
        "completed_at": session.get("completed_at"),
    }


@app.get("/api/jackpot/history")
async def get_jackpot_history(authorization: str = Header(None)):
    """Get user's past jackpot sessions."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    sessions = jackpot_analyzer.get_user_sessions(payload["user_id"])
    return {"sessions": sessions}


@app.get("/api/jackpot/limits")
async def get_jackpot_limits(authorization: str = Header(None)):
    """Get jackpot match limits for the current user's tier."""
    payload = _get_current_user(authorization)
    tier = payload.get("tier", "free") if payload else "free"
    max_matches = 5  # All tiers: 5 matches per session
    user_id = payload.get("user_id") if payload else None
    ai_chats_used = jackpot_analyzer.get_ai_chat_count(user_id) if user_id else 0
    max_ai_chats = -1 if tier in ("pro", "trial") else 10
    bal = community.get_user_balance(user_id) if user_id else {"balance_usd": 0}

    # Session limits: free = 2 then 1/72h, pro/trial = 3/24h
    if user_id:
        lock_info = jackpot_analyzer.get_jackpot_lock_status(user_id, tier)
        sessions_used = lock_info["sessions_used"]
        max_sessions = lock_info["max_sessions"]
        locked = lock_info["locked"]
        locked_until = lock_info["locked_until"]
    else:
        sessions_used = 0
        max_sessions = 2
        locked = False
        locked_until = None

    return {
        "tier": tier,
        "max_matches": max_matches,
        "sessions_used": sessions_used,
        "max_sessions": max_sessions,
        "locked": locked,
        "locked_until": locked_until,
        "ai_chats_used": ai_chats_used,
        "max_ai_chats": max_ai_chats,
        "balance_usd": bal.get("balance_usd", 0),
    }


class JackpotChatRequest(BaseModel):
    message: str
    match_context: dict  # The match analysis result
    chat_history: List[dict] = []


@app.post("/api/jackpot/chat")
async def jackpot_match_chat(request: JackpotChatRequest, authorization: str = Header(None)):
    """AI chat about a specific analyzed match, powered by Gemini."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = payload.get("user_id")
    tier = payload.get("tier", "free")

    # Enforce 10-prompt limit for free tier users
    if tier != "pro" and user_id:
        chat_count = jackpot_analyzer.get_ai_chat_count(user_id)
        if chat_count >= 10:
            raise HTTPException(
                status_code=403,
                detail="You've used your 10 free AI prompts. Upgrade to Pro for unlimited AI chat."
            )

    try:
        result = await jackpot_analyzer.chat_about_match(
            request.message, request.match_context, request.chat_history
        )
        # Increment chat count after successful response
        if user_id:
            jackpot_analyzer.increment_ai_chat_count(user_id)
        # result is now a dict with "text" and "sources"
        return {"response": result["text"], "sources": result.get("sources", [])}
    except Exception as e:
        print(f"[Jackpot Chat] Error: {e}")
        return {"response": "Sorry, I couldn't process your question right now. Please try again.", "sources": []}


# ==================== PRIVACY POLICY (for Chrome Web Store) ====================
@app.get("/privacy")
async def privacy_policy():
    """Serve privacy policy page for Chrome Web Store compliance."""
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content="""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Privacy Policy - Spark AI Soccer Prediction Assistant</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:0 auto;padding:40px 20px;line-height:1.7;color:#e2e8f0;background:#0f172a}
h1{color:#3b82f6;border-bottom:2px solid #1e3a5f;padding-bottom:12px}
h2{color:#60a5fa;margin-top:32px}
a{color:#3b82f6}
ul{padding-left:20px}
.updated{color:#94a3b8;font-size:14px}
</style>
</head>
<body>
<h1>Privacy Policy</h1>
<p class="updated">Last updated: February 22, 2026</p>
<p>Spark AI ("we", "us", "our") operates the Spark AI - Soccer Prediction Assistant browser extension. This policy describes how we collect, use, and protect your information.</p>

<h2>1. Information We Collect</h2>
<ul>
<li><strong>Account Information:</strong> When you sign in via Google OAuth, we receive your name, email address, and profile picture to create your account.</li>
<li><strong>Match Preferences:</strong> Teams you choose to track for live score notifications.</li>
<li><strong>Usage Data:</strong> Which features you use (predictions viewed, matches analyzed) to improve our service.</li>
<li><strong>Payment Information:</strong> If you subscribe to a paid plan, payment is processed securely through M-Pesa (Safaricom) or card payment providers. We do not store your full payment details.</li>
</ul>

<h2>2. How We Use Your Information</h2>
<ul>
<li>To provide AI-powered match predictions and analysis</li>
<li>To send live score notifications for tracked matches</li>
<li>To manage your subscription and account</li>
<li>To improve the accuracy of our prediction models</li>
</ul>

<h2>3. Third-Party Services</h2>
<p>We use the following third-party services:</p>
<ul>
<li><strong>Google OAuth:</strong> For secure account authentication</li>
<li><strong>API-Football:</strong> For match data, fixtures, and live scores</li>
<li><strong>The Odds API:</strong> For betting odds comparison</li>
<li><strong>Safaricom M-Pesa (Daraja):</strong> For mobile payment processing</li>
</ul>

<h2>4. Data Storage & Security</h2>
<p>Your data is stored on secure servers. Authentication tokens are stored locally in your browser using Chrome's storage API. We use HTTPS encryption for all data transmission.</p>

<h2>5. Data Sharing</h2>
<p>We do not sell, trade, or share your personal information with third parties, except as required to provide the service (e.g., processing payments) or as required by law.</p>

<h2>6. Your Rights</h2>
<ul>
<li>You can delete your account and all associated data at any time</li>
<li>You can revoke Google OAuth access through your Google Account settings</li>
<li>You can uninstall the extension to stop all data collection</li>
</ul>

<h2>7. Permissions Explained</h2>
<ul>
<li><strong>storage:</strong> Save your preferences and authentication tokens locally</li>
<li><strong>activeTab:</strong> Display prediction buttons on supported betting sites</li>
<li><strong>identity:</strong> Enable Google sign-in</li>
<li><strong>alarms:</strong> Schedule live score polling for tracked matches</li>
<li><strong>notifications:</strong> Alert you when tracked teams score</li>
</ul>

<h2>8. Contact Us</h2>
<p>If you have questions about this privacy policy, contact us at:<br>
<a href="mailto:support@spark-ai-prediction.com">support@spark-ai-prediction.com</a></p>

<h2>9. Changes to This Policy</h2>
<p>We may update this policy from time to time. Changes will be posted on this page with an updated date.</p>
</body>
</html>""")




# ==================== SEO ENDPOINTS ====================



# =====================================================================
# Server-side meta tag injection for multilingual SEO
# Google sees the raw HTML before JS runs, so we inject the correct
# language meta tags into index.html at the server level.
# =====================================================================


@app.get("/sitemap.xml")
async def sitemap_xml():
    """Generate dynamic XML sitemap with hreflang for multilingual SEO."""
    from fastapi.responses import Response
    from league_seo import LEAGUE_SEO
    import blog_content as bc

    base = "https://spark-ai-prediction.com"
    today = datetime.now().strftime("%Y-%m-%d")
    supported_langs = ["en", "fr", "es", "pt", "sw", "ar"]

    def lang_url(path, lang):
        if lang == "en":
            return f"{base}{path}"
        return f"{base}/{lang}{path}"

    def make_url_entry(path, freq, pri):
        """Generate URL entries for all languages with hreflang annotations."""
        entries = []
        for lang in supported_langs:
            url = lang_url(path, lang)
            hreflangs = []
            for alt_lang in supported_langs:
                alt_url = lang_url(path, alt_lang)
                hreflangs.append(f'    <xhtml:link rel="alternate" hreflang="{alt_lang}" href="{alt_url}" />')
            hreflangs.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{lang_url(path, "en")}" />')
            entries.append(f"""  <url>
    <loc>{url}</loc>
    <lastmod>{today}</lastmod>
    <changefreq>{freq}</changefreq>
    <priority>{pri}</priority>
{chr(10).join(hreflangs)}
  </url>""")
        return entries

    urls = []

    # Static pages (with all language variants)
    static = [
        ("/", "daily", "1.0"),
        ("/today", "daily", "0.9"),
        ("/blog", "daily", "0.8"),
        ("/docs", "monthly", "0.6"),
        ("/terms", "yearly", "0.3"),
    ]
    for loc, freq, pri in static:
        urls.extend(make_url_entry(loc, freq, pri))

    # League pages (with all language variants)
    for code, data in LEAGUE_SEO.items():
        urls.extend(make_url_entry(f"/predictions/{data['slug']}", "daily", "0.8"))

    # Blog articles (with all language variants)
    for article in bc.get_all_articles():
        urls.extend(make_url_entry(f"/blog/{article['slug']}", "weekly", "0.7"))

    # Doc sections (with all language variants)
    from docs_content import DOCS_SECTIONS
    for section in DOCS_SECTIONS:
        urls.extend(make_url_entry(f"/docs/{section['id']}", "monthly", "0.5"))

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
{chr(10).join(urls)}
</urlset>"""

    return Response(content=xml, media_type="application/xml")


@app.get("/api/today")
async def get_today_overview():
    """Get today's fixtures + daily predictions for the Today SEO page. No auth required."""
    import asyncio

    daily_preds = community.get_daily_free_predictions()
    todays_fixtures = await football_api.fetch_todays_fixtures()
    todays_fixtures = todays_fixtures or []

    # Group fixtures by league
    by_league = {}
    for f in todays_fixtures:
        league = f.get("competition", {}).get("name", "Other")
        code = f.get("competition", {}).get("code", "")
        if league not in by_league:
            by_league[league] = {"code": code, "fixtures": []}
        by_league[league]["fixtures"].append({
            "id": f.get("id"),
            "home_team": f.get("home_team", {}).get("name", ""),
            "away_team": f.get("away_team", {}).get("name", ""),
            "home_crest": f.get("home_team", {}).get("crest", ""),
            "away_crest": f.get("away_team", {}).get("crest", ""),
            "time": f.get("time", ""),
            "status": f.get("status", ""),
            "score": f.get("score", {}),
        })

    return {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "formatted_date": datetime.now().strftime("%A, %B %d, %Y"),
        "predictions": daily_preds,
        "fixtures_by_league": by_league,
        "total_matches": len(todays_fixtures),
    }


@app.get("/api/league/{slug}")
async def get_league_by_slug(slug: str, lang: str = "en"):
    """Get league info and upcoming fixtures by URL slug. No auth required."""
    from league_seo import SLUG_TO_CODE, LEAGUE_SEO

    code = SLUG_TO_CODE.get(slug)
    if not code:
        raise HTTPException(status_code=404, detail="League not found")

    seo = LEAGUE_SEO[code]
    name = config.COMPETITION_NAMES.get(code, code)

    # Fetch upcoming fixtures for this league
    fixtures = await football_api.fetch_upcoming_fixtures(competition=code, days=7)
    fixtures = fixtures or []

    # Get daily predictions filtered to this league
    daily_preds = community.get_daily_free_predictions()
    league_preds = [p for p in daily_preds if p.get("competition_code") == code or p.get("competition", "") == name]

    # Get localized SEO metadata
    from league_seo import get_league_seo_localized
    localized = get_league_seo_localized(code, lang)
    seo_title = localized["seo_title"] if localized else seo["seo_title"]
    seo_desc = localized["seo_desc"] if localized else seo["seo_desc"]

    return {
        "code": code,
        "slug": slug,
        "name": name,
        "seo": {
            "title": seo_title,
            "description": seo_desc,
            "country": seo["country"],
            "region": seo["region"],
        },
        "fixtures": [
            {
                "id": f.get("id"),
                "home_team": f.get("home_team", {}).get("name", ""),
                "away_team": f.get("away_team", {}).get("name", ""),
                "home_crest": f.get("home_team", {}).get("crest", ""),
                "away_crest": f.get("away_team", {}).get("crest", ""),
                "date": f.get("date", ""),
                "time": f.get("time", ""),
                "venue": f.get("venue", ""),
            }
            for f in fixtures[:15]
        ],
        "predictions": league_preds,
        "league_id": config.LEAGUE_IDS.get(code, 0),
    }


@app.get("/api/leagues/all-slugs")
async def get_all_league_slugs():
    """Return all league slugs for sitemap and navigation. No auth required."""
    from league_seo import LEAGUE_SEO, TOP_LEAGUES

    leagues = []
    for code, data in LEAGUE_SEO.items():
        leagues.append({
            "code": code,
            "slug": data["slug"],
            "name": config.COMPETITION_NAMES.get(code, code),
            "region": data["region"],
            "country": data["country"],
            "is_top": code in TOP_LEAGUES,
        })

    return {"leagues": leagues}


@app.get("/api/blog")
async def get_blog_articles(category: str = None, lang: str = "en"):
    """Return blog articles, optionally filtered by category. No auth required."""
    import blog_content as bc

    articles = bc.get_all_articles_i18n(lang) if hasattr(bc, 'get_all_articles_i18n') else bc.get_all_articles() if not category else bc.get_articles_by_category(category)

    # Return without body for list view
    return {
        "articles": [
            {k: v for k, v in a.items() if k != "body"}
            for a in articles
        ],
        "total": len(articles),
    }


@app.get("/api/blog/{slug}")
async def get_blog_article(slug: str):
    """Return a single blog article by slug. No auth required."""
    import blog_content as bc

    article = bc.get_article(slug)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


# ==================== SERVE FRONTEND IN PRODUCTION ====================
# Serve built React frontend from ../frontend/dist
FRONTEND_DIR = Path(__file__).parent.parent / "frontend" / "dist"
if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve React app for all non-API routes."""
        file_path = FRONTEND_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIR / "index.html"))
