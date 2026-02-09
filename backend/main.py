from fastapi import FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from pathlib import Path

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
import subscriptions

# Admin password for managing access codes
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "SoccerAI2026Admin")

app = FastAPI(title="Spark AI Prediction")

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

    # Initialize community predictions database
    community.init_community_db()
    print("[OK] Community predictions system initialized")

    # Initialize subscriptions
    subscriptions.init_subscriptions_db()
    expired = subscriptions.check_expired_subscriptions()
    if expired:
        print(f"[OK] Expired {expired} subscription(s)")
    print("[OK] Subscription system initialized")
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
        return {
            "fixture_id": fixture_id,
            "status": match.get("status"),
            "elapsed": match.get("elapsed"),
            "goals": match.get("goals"),
            "events": match.get("events", []),
            "live_analysis": analysis,
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


@app.post("/api/predict")
async def predict(request: PredictRequest):
    if request.team_a_id == request.team_b_id:
        return {"error": "Cannot predict a match between a team and itself"}

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

    players_a = analyze_players(await get_team_players(request.team_a_id, predict_league_id), team_a)
    players_b = analyze_players(await get_team_players(request.team_b_id, predict_league_id), team_b)

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
            "players": "Sample Data",
        }
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

class CreateCodeRequest(BaseModel):
    days_valid: int = 30
    label: str = ""

class AdminLoginRequest(BaseModel):
    password: str


@app.post("/api/auth/verify")
async def verify_access_code(request: VerifyCodeRequest):
    """Verify an access code."""
    result = access_codes.verify_code(request.code)
    return result


@app.post("/api/admin/login")
async def admin_login(request: AdminLoginRequest):
    """Admin login to manage access codes."""
    if request.password == ADMIN_PASSWORD:
        return {"success": True, "message": "Admin authenticated"}
    raise HTTPException(status_code=401, detail="Invalid admin password")


@app.post("/api/admin/codes/create")
async def create_code(request: CreateCodeRequest, x_admin_password: str = Header(None)):
    """Create a new access code (admin only)."""
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = access_codes.create_access_code(
        days_valid=request.days_valid,
        label=request.label,
    )
    return result


@app.get("/api/admin/codes")
async def list_codes(x_admin_password: str = Header(None)):
    """List all access codes (admin only)."""
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"codes": access_codes.list_all_codes()}


@app.delete("/api/admin/codes/{code}")
async def revoke_code(code: str, x_admin_password: str = Header(None)):
    """Revoke an access code (admin only)."""
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    success = access_codes.revoke_code(code)
    if success:
        return {"message": f"Code {code} revoked"}
    raise HTTPException(status_code=404, detail="Code not found")


# ==================== ADMIN DASHBOARD ENDPOINTS ====================

@app.get("/api/admin/dashboard-stats")
async def admin_dashboard_stats(x_admin_password: str = Header(None)):
    """Get full dashboard statistics for admin panel."""
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_stats = user_auth.get_user_stats()
    community_stats = community.get_community_stats()
    prediction_stats = prediction_tracker.get_accuracy_stats()
    sub_stats = subscriptions.get_subscription_stats()

    return {
        "users": user_stats,
        "community": community_stats,
        "predictions": prediction_stats,
        "subscriptions": sub_stats,
    }


@app.get("/api/admin/users")
async def admin_list_users(x_admin_password: str = Header(None)):
    """List all users for admin management."""
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    users = user_auth.list_all_users()
    return {"users": users}


class SetTierRequest(BaseModel):
    tier: str

class SetActiveRequest(BaseModel):
    is_active: bool


@app.post("/api/admin/users/{user_id}/set-tier")
async def admin_set_tier(user_id: int, request: SetTierRequest, x_admin_password: str = Header(None)):
    """Change a user's tier (free/pro)."""
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if request.tier not in ("free", "pro"):
        raise HTTPException(status_code=400, detail="Tier must be 'free' or 'pro'")
    result = user_auth.set_user_tier(user_id, request.tier)
    return result


@app.post("/api/admin/users/{user_id}/toggle-active")
async def admin_toggle_active(user_id: int, request: SetActiveRequest, x_admin_password: str = Header(None)):
    """Suspend or unsuspend a user."""
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = user_auth.toggle_user_active(user_id, 1 if request.is_active else 0)
    return result


@app.delete("/api/admin/community/{prediction_id}")
async def admin_delete_prediction(prediction_id: int, x_admin_password: str = Header(None)):
    """Admin: delete a community prediction."""
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = community.delete_prediction(prediction_id)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.delete("/api/admin/comment/{comment_id}")
async def admin_delete_comment(comment_id: int, x_admin_password: str = Header(None)):
    """Admin: delete a specific comment."""
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    result = community.delete_comment(comment_id)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.get("/api/admin/referral-stats")
async def admin_referral_stats(x_admin_password: str = Header(None)):
    """Get referral leaderboard for admin."""
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"referrals": user_auth.get_all_referral_stats()}


# ==================== END ACCESS CODE / ADMIN ENDPOINTS ====================


# ==================== USER AUTH ENDPOINTS ====================

class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str = ""
    referral_code: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str

class GoogleLoginRequest(BaseModel):
    token: str
    referral_code: str = ""

class VerifyEmailRequest(BaseModel):
    email: str
    code: str

class ResendCodeRequest(BaseModel):
    email: str

class UpdateUsernameRequest(BaseModel):
    username: str

class UpdateDisplayNameRequest(BaseModel):
    display_name: str


def _get_current_user(authorization: str = Header(None)) -> Optional[dict]:
    """Extract user from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "")
    return user_auth.verify_token(token)


@app.post("/api/user/register")
async def register(request: RegisterRequest):
    """Register a new user account. Returns requires_verification if email needs to be verified."""
    result = user_auth.register_user(
        email=request.email,
        password=request.password,
        display_name=request.display_name,
        referral_code=request.referral_code,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/api/user/login")
async def login(request: LoginRequest):
    """Login with email and password."""
    result = user_auth.login_user(email=request.email, password=request.password)
    if not result["success"]:
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
        raise HTTPException(status_code=401, detail=result["error"])
    return result


@app.post("/api/user/google-login")
async def google_login(request: GoogleLoginRequest):
    """Login or register via Google OAuth."""
    result = user_auth.google_login(
        google_token=request.token,
        referral_code=request.referral_code,
    )
    if not result["success"]:
        raise HTTPException(status_code=401, detail=result["error"])
    return result


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


@app.get("/api/user/me")
async def get_me(authorization: str = Header(None)):
    """Get current user profile from token."""
    payload = _get_current_user(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    profile = user_auth.get_user_profile(payload["user_id"])
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user": profile}


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


# ==================== END USER AUTH ENDPOINTS ====================


# ==================== SUBSCRIPTION ENDPOINTS ====================

@app.get("/api/subscription/plans")
async def get_plans():
    """Get available subscription plans."""
    return {"plans": subscriptions.get_plans()}


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


# ==================== PREDICTION TRACK RECORD ENDPOINTS ====================

class UpdateResultRequest(BaseModel):
    fixture_id: str
    home_goals: int
    away_goals: int


@app.get("/api/predictions")
async def get_predictions(limit: int = 50):
    """Get all stored predictions."""
    predictions = prediction_tracker.get_all_predictions(limit)
    return {"predictions": predictions}


@app.get("/api/predictions/accuracy")
async def get_prediction_accuracy():
    """Get overall prediction accuracy stats."""
    stats = prediction_tracker.get_accuracy_stats()
    return stats


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

class ConfirmPredictionsRequest(BaseModel):
    predictions: List[PredictionItem]
    visibility: str = "private"
    is_paid: bool = False
    price_usd: float = 0
    analysis_notes: str = ""


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
            )
            confirmed.append(pred.matchId)
        except Exception as e:
            print(f"Failed to store prediction for {pred.matchId}: {e}")

    # Share to community if public
    if request.visibility == "public" and confirmed:
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
    return result


@app.get("/api/community/predictions")
async def get_community_predictions(page: int = 1, per_page: int = 20):
    """Get public community predictions."""
    return community.get_public_predictions(page=page, per_page=per_page)


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

    result = community.rate_prediction(prediction_id, payload["user_id"], request.rating)
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


# --- Paid Predictions Endpoints ---

class PurchasePredictionRequest(BaseModel):
    payment_method: str = ""
    payment_ref: str = ""


@app.get("/api/community/paid")
async def get_paid_predictions(page: int = 1, per_page: int = 20, authorization: str = Header(None)):
    """Get paid predictions feed with purchase status."""
    payload = _get_current_user(authorization)
    viewer_id = payload["user_id"] if payload else None
    return community.get_paid_predictions_feed(page=page, per_page=per_page, viewer_id=viewer_id)


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
    btts_yes = 0  # Both teams to score

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
        if home_score > 0 and away_score > 0:
            btts_yes += 1

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

    # First Half estimates (roughly 40-45% of goals in first half)
    first_half_avg_goals = avg_goals * 0.42
    first_half_analysis = {
        "over_05": round(min(90, 40 + first_half_avg_goals * 30), 1),
        "over_15": round(min(70, 20 + first_half_avg_goals * 25), 1),
        "over_25": round(min(50, 10 + first_half_avg_goals * 20), 1),
        "1x2": {
            "team_a": round(team_a_win_pct * 0.75, 1),  # Teams that win often lead at HT
            "draw": round(40 + draw_pct * 0.5, 1),  # More draws at HT than FT
            "team_b": round(team_b_win_pct * 0.75, 1),
        },
        "double_chance": {
            "1X": round(min(85, team_a_win_pct * 0.75 + 40), 1),
            "X2": round(min(85, team_b_win_pct * 0.75 + 40), 1),
            "12": round(max(30, (team_a_win_pct + team_b_win_pct) * 0.6), 1),
        }
    }

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
        "team_totals": team_totals,
        "first_half": first_half_analysis,
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

    # Fetch injuries and coaches (parallel)
    import asyncio
    injuries_a, injuries_b, coach_a, coach_b = await asyncio.gather(
        football_api.fetch_injuries(team_a_id, league_id),
        football_api.fetch_injuries(team_b_id, league_id),
        football_api.fetch_coach(team_a_id),
        football_api.fetch_coach(team_b_id),
    )

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
        "data_source": "API-Football" if stats_a or stats_b else "Sample Data"
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
