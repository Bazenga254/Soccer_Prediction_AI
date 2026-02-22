"""
API-Football Integration (api-sports.io)

API Documentation: https://www.api-football.com/documentation-v3
Base URL: https://v3.football.api-sports.io/
Only header allowed: x-apisports-key
Only GET requests allowed
"""

import aiohttp
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
import config

# API URL from documentation
BASE_URL = "https://v3.football.api-sports.io"

# In-memory cache
_cache: Dict[str, Any] = {}
_cache_timestamps: Dict[str, datetime] = {}


def _get_headers() -> Dict[str, str]:
    """Get API request headers - ONLY x-apisports-key is allowed."""
    return {
        "x-apisports-key": config.API_FOOTBALL_KEY
    }


# Reverse lookup: numeric league ID -> letter code (e.g., 39 -> "PL")
_LEAGUE_ID_TO_CODE = {v: k for k, v in config.LEAGUE_IDS.items()}


def _get_competition_code(league_id: int) -> str:
    """Convert numeric league ID to letter code. Falls back to numeric string."""
    return _LEAGUE_ID_TO_CODE.get(league_id, str(league_id))


def _is_cache_valid(key: str, ttl: int) -> bool:
    """Check if cached data is still valid."""
    if key not in _cache_timestamps:
        return False
    return (datetime.now() - _cache_timestamps[key]).total_seconds() < ttl


def _set_cache(key: str, data: Any):
    """Store data in cache."""
    _cache[key] = data
    _cache_timestamps[key] = datetime.now()


def _get_cache(key: str) -> Optional[Any]:
    """Get data from cache."""
    return _cache.get(key)


def _get_league_id(competition: str) -> int:
    """Convert competition code to API-Football league ID."""
    if competition in config.LEAGUE_IDS:
        return config.LEAGUE_IDS[competition]
    # If it's a numeric string (e.g. "475" from live scores), use directly as league ID
    try:
        return int(competition)
    except (ValueError, TypeError):
        return 39  # Default to Premier League


def _parse_fixtures(fixtures_data: List[Dict]) -> List[Dict]:
    """Parse fixture data from API response."""
    fixtures = []
    for fixture in fixtures_data:
        fixture_info = fixture.get("fixture", {})
        teams = fixture.get("teams", {})
        league = fixture.get("league", {})
        goals = fixture.get("goals", {})

        league_id = league.get("id")
        fixtures.append({
            "id": fixture_info.get("id"),
            "date": fixture_info.get("date"),
            "timestamp": fixture_info.get("timestamp"),
            "status": fixture_info.get("status", {}).get("short"),
            "venue": fixture_info.get("venue", {}).get("name"),
            "home_team": {
                "id": teams.get("home", {}).get("id"),
                "name": teams.get("home", {}).get("name", "").replace(" FC", ""),
                "crest": teams.get("home", {}).get("logo"),
            },
            "away_team": {
                "id": teams.get("away", {}).get("id"),
                "name": teams.get("away", {}).get("name", "").replace(" FC", ""),
                "crest": teams.get("away", {}).get("logo"),
            },
            "competition": {
                "name": league.get("name"),
                "emblem": league.get("logo"),
                "round": league.get("round"),
                "id": league_id,
                "code": _LEAGUE_ID_TO_CODE.get(league_id, ""),
                "country": league.get("country", ""),
            },
            "goals": {
                "home": goals.get("home"),
                "away": goals.get("away"),
            }
        })

    # Sort by date
    fixtures.sort(key=lambda x: x.get("date", ""))
    return fixtures


def _generate_sample_fixtures(competition: str, league_id: int) -> List[Dict]:
    """Generate sample fixtures when API is unavailable."""
    from datetime import datetime, timedelta

    # Sample Premier League teams
    SAMPLE_TEAMS = {
        39: [  # Premier League
            {"id": 33, "name": "Manchester United", "crest": "https://media.api-sports.io/football/teams/33.png"},
            {"id": 34, "name": "Newcastle", "crest": "https://media.api-sports.io/football/teams/34.png"},
            {"id": 40, "name": "Liverpool", "crest": "https://media.api-sports.io/football/teams/40.png"},
            {"id": 42, "name": "Arsenal", "crest": "https://media.api-sports.io/football/teams/42.png"},
            {"id": 49, "name": "Chelsea", "crest": "https://media.api-sports.io/football/teams/49.png"},
            {"id": 50, "name": "Manchester City", "crest": "https://media.api-sports.io/football/teams/50.png"},
            {"id": 47, "name": "Tottenham", "crest": "https://media.api-sports.io/football/teams/47.png"},
            {"id": 66, "name": "Aston Villa", "crest": "https://media.api-sports.io/football/teams/66.png"},
            {"id": 51, "name": "Brighton", "crest": "https://media.api-sports.io/football/teams/51.png"},
            {"id": 39, "name": "Wolves", "crest": "https://media.api-sports.io/football/teams/39.png"},
        ],
        140: [  # La Liga
            {"id": 529, "name": "Barcelona", "crest": "https://media.api-sports.io/football/teams/529.png"},
            {"id": 541, "name": "Real Madrid", "crest": "https://media.api-sports.io/football/teams/541.png"},
            {"id": 530, "name": "Atletico Madrid", "crest": "https://media.api-sports.io/football/teams/530.png"},
            {"id": 536, "name": "Sevilla", "crest": "https://media.api-sports.io/football/teams/536.png"},
        ],
    }

    teams = SAMPLE_TEAMS.get(league_id, SAMPLE_TEAMS[39])
    fixtures = []

    # Generate 10 sample fixtures over the next 7 days
    base_date = datetime.now()
    for i in range(10):
        match_date = base_date + timedelta(days=i % 7, hours=15 + (i % 3) * 2)
        home_idx = i % len(teams)
        away_idx = (i + 1) % len(teams)

        fixtures.append({
            "id": 1000000 + i,
            "date": match_date.isoformat(),
            "timestamp": int(match_date.timestamp()),
            "status": "NS",
            "venue": f"{teams[home_idx]['name']} Stadium",
            "home_team": teams[home_idx],
            "away_team": teams[away_idx],
            "competition": {
                "name": config.COMPETITION_NAMES.get(competition, "Premier League"),
                "emblem": None,
                "round": f"Regular Season - {30 + i}",
            },
            "goals": {"home": None, "away": None},
            "is_sample": True,
        })

    print(f"Generated {len(fixtures)} sample fixtures for league {league_id}")
    return fixtures


async def _fetch_last_season_fixtures(league_id: int) -> Optional[List[Dict]]:
    """
    Fetch the last matches from the season when no upcoming fixtures available.
    This happens when using free tier and the season has ended.
    """
    cache_key = f"last_fixtures_{league_id}"

    if _is_cache_valid(cache_key, config.CACHE_TTL_MATCHES):
        return _get_cache(cache_key)

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/fixtures"

            season = config.get_season_for_league(league_id)
            params = {
                "league": league_id,
                "season": season,
                "last": 20,  # Get last 20 completed fixtures
            }

            print(f"Fetching last fixtures: league={league_id}, season={season}")

            async with session.get(url, headers=_get_headers(), params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    errors = data.get("errors", {})

                    # If 'last' param not supported, try date range from season end
                    if errors or not data.get("response"):
                        return await _fetch_season_end_fixtures(league_id)

                    fixtures = _parse_fixtures(data.get("response", []))
                    # Mark as historical
                    for f in fixtures:
                        f["is_historical"] = True
                    _set_cache(cache_key, fixtures)
                    return fixtures

    except Exception as e:
        print(f"Last fixtures request failed: {e}")

    return None


async def _fetch_season_end_fixtures(league_id: int) -> Optional[List[Dict]]:
    """Fetch fixtures from the end of the season using date range."""
    cache_key = f"season_end_fixtures_{league_id}"

    if _is_cache_valid(cache_key, config.CACHE_TTL_MATCHES):
        return _get_cache(cache_key)

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/fixtures"

            season = config.get_season_for_league(league_id)
            # For European leagues: season 2025 ends May 2026
            # For calendar-year leagues: season 2026 ends Dec 2026
            if league_id in config.CALENDAR_YEAR_LEAGUE_IDS:
                season_end_year = season
                from_date = f"{season_end_year}-09-01"
                to_date = f"{season_end_year}-12-31"
            else:
                season_end_year = season + 1
                from_date = f"{season_end_year}-03-01"
                to_date = f"{season_end_year}-05-31"
            params = {
                "league": league_id,
                "season": season,
                "from": from_date,
                "to": to_date,
            }

            print(f"Fetching season end fixtures: {params}")

            async with session.get(url, headers=_get_headers(), params=params) as response:
                print(f"Season end fixtures response status: {response.status}")

                if response.status == 200:
                    data = await response.json()
                    print(f"Season end fixtures results: {data.get('results', 0)}")

                    errors = data.get("errors")
                    if errors:
                        print(f"Season end fixtures errors: {errors}")

                    fixtures_data = data.get("response", [])
                    if fixtures_data:
                        fixtures = _parse_fixtures(fixtures_data)
                        # Mark as historical and reverse to show most recent first
                        for f in fixtures:
                            f["is_historical"] = True
                        fixtures.reverse()
                        result = fixtures[:20]  # Return last 20
                        _set_cache(cache_key, result)
                        return result
                    else:
                        print("No fixtures in season end date range")
                else:
                    text = await response.text()
                    print(f"Season end fixtures error: {text[:300]}")

    except Exception as e:
        print(f"Season end fixtures request failed: {type(e).__name__}: {e}")

    return None


async def fetch_standings(competition: str = "PL") -> Optional[List[Dict]]:
    """
    Fetch current league standings.
    API Endpoint: GET /standings?league={id}&season={year}
    """
    if not config.API_FOOTBALL_KEY:
        print("No API key configured")
        return None

    league_id = _get_league_id(competition)
    season = config.get_season_for_league(league_id)
    cache_key = f"standings_{league_id}_{season}"

    if _is_cache_valid(cache_key, config.CACHE_TTL_STANDINGS):
        print(f"Using cached standings for league {league_id}")
        return _get_cache(cache_key)

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/standings"
            params = {
                "league": league_id,
                "season": season
            }

            print(f"API Request: GET {url}")
            print(f"Params: league={league_id}, season={season}")

            async with session.get(url, headers=_get_headers(), params=params) as response:
                print(f"API Response Status: {response.status}")

                if response.status == 200:
                    data = await response.json()

                    # Log API response info
                    print(f"API Results: {data.get('results', 0)}")
                    print(f"API Errors: {data.get('errors', {})}")

                    # Check for API errors
                    errors = data.get("errors")
                    if errors and len(errors) > 0:
                        print(f"API Error: {errors}")
                        return None

                    standings_data = data.get("response", [])
                    if not standings_data:
                        print("No standings data in response")
                        return None

                    # Get the league standings
                    league_standings = standings_data[0].get("league", {}).get("standings", [[]])
                    if not league_standings or not league_standings[0]:
                        print("No standings found in league data")
                        return None

                    teams = []
                    for entry in league_standings[0]:
                        team = entry.get("team", {})
                        all_stats = entry.get("all", {})
                        home_stats = entry.get("home", {})
                        away_stats = entry.get("away", {})

                        teams.append({
                            "id": team.get("id"),
                            "name": team.get("name", "").replace(" FC", "").replace(" CF", ""),
                            "short_name": team.get("name", "")[:3].upper(),
                            "crest": team.get("logo"),
                            "position": entry.get("rank"),
                            "points": entry.get("points"),
                            "played": all_stats.get("played", 0),
                            "wins": all_stats.get("win", 0),
                            "draws": all_stats.get("draw", 0),
                            "losses": all_stats.get("lose", 0),
                            "goals_scored": all_stats.get("goals", {}).get("for", 0),
                            "goals_conceded": all_stats.get("goals", {}).get("against", 0),
                            "goal_difference": entry.get("goalsDiff", 0),
                            "form": entry.get("form", ""),
                            # Home stats
                            "home_played": home_stats.get("played", 0),
                            "home_wins": home_stats.get("win", 0),
                            "home_draws": home_stats.get("draw", 0),
                            "home_losses": home_stats.get("lose", 0),
                            "home_goals_for": home_stats.get("goals", {}).get("for", 0),
                            "home_goals_against": home_stats.get("goals", {}).get("against", 0),
                            # Away stats
                            "away_played": away_stats.get("played", 0),
                            "away_wins": away_stats.get("win", 0),
                            "away_draws": away_stats.get("draw", 0),
                            "away_losses": away_stats.get("lose", 0),
                            "away_goals_for": away_stats.get("goals", {}).get("for", 0),
                            "away_goals_against": away_stats.get("goals", {}).get("against", 0),
                        })

                    print(f"Processed {len(teams)} teams from standings")
                    _set_cache(cache_key, teams)
                    return teams

                else:
                    text = await response.text()
                    print(f"API Error Response: {text[:500]}")

    except Exception as e:
        print(f"API Request failed: {type(e).__name__}: {e}")

    return _get_cache(cache_key)


async def _fetch_fixtures_for_season(league_id: int, season: int, days: int = 14) -> Optional[List[Dict]]:
    """Try fetching upcoming fixtures for a specific league+season combo."""
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/fixtures"
            from_date = datetime.now().strftime("%Y-%m-%d")
            to_date = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")

            params = {
                "league": league_id,
                "season": season,
                "from": from_date,
                "to": to_date,
            }

            print(f"API Request: GET {url}")
            print(f"Params: league={league_id}, season={season}, from={from_date}, to={to_date}")

            async with session.get(url, headers=_get_headers(), params=params) as response:
                print(f"API Response Status: {response.status}")

                if response.status == 200:
                    data = await response.json()
                    print(f"API Results: {data.get('results', 0)}")
                    print(f"API Errors: {data.get('errors', {})}")

                    errors = data.get("errors")
                    if errors and len(errors) > 0:
                        print(f"API Error: {errors}")
                        return None

                    fixtures_data = data.get("response", [])
                    print(f"Raw fixtures count: {len(fixtures_data)}")

                    if fixtures_data:
                        return _parse_fixtures(fixtures_data)
                else:
                    text = await response.text()
                    print(f"API Error Response: {text[:500]}")
    except Exception as e:
        print(f"Fixtures request failed: {type(e).__name__}: {e}")
    return None


async def fetch_upcoming_fixtures(competition: str = "PL", days: int = 14) -> Optional[List[Dict]]:
    """
    Fetch upcoming fixtures for a competition.
    API Endpoint: GET /fixtures?league={id}&season={year}&from={date}&to={date}

    Note: Free tier doesn't support 'next' parameter, so we use date range.
    Uses auto-fallback: if the calculated season returns 0 fixtures,
    tries the alternate season (prev or next year) before giving up.
    """
    league_id = _get_league_id(competition)
    season = config.get_season_for_league(league_id)
    cache_key = f"fixtures_{league_id}_{days}_{season}"

    if not config.API_FOOTBALL_KEY:
        print("No API key configured, returning sample fixtures")
        return _generate_sample_fixtures(competition, league_id)

    if _is_cache_valid(cache_key, config.CACHE_TTL_MATCHES):
        print(f"Using cached fixtures for league {league_id}")
        return _get_cache(cache_key)

    # Check if current date is beyond the season end
    if league_id in config.CALENDAR_YEAR_LEAGUE_IDS:
        season_end_date = datetime(season, 12, 31)
    else:
        season_end_date = datetime(season + 1, 5, 31)
    current_date = datetime.now()

    # If we're beyond the season end, go directly to historical fixtures
    if current_date > season_end_date:
        print(f"Current date {current_date.date()} is beyond season {season} end date. Fetching historical fixtures.")
        historical = await _fetch_season_end_fixtures(league_id)
        if historical:
            _set_cache(cache_key, historical)
            return historical
        historical = await _fetch_last_season_fixtures(league_id)
        if historical:
            _set_cache(cache_key, historical)
            return historical
        print("API failed, returning sample fixtures")
        sample = _generate_sample_fixtures(competition, league_id)
        _set_cache(cache_key, sample)
        return sample

    # Try primary season
    fixtures = await _fetch_fixtures_for_season(league_id, season, days)
    if fixtures:
        print(f"Processed {len(fixtures)} fixtures for season {season}")
        _set_cache(cache_key, fixtures)
        return fixtures

    # Auto-fallback: try alternate season (prev year or next year)
    # This self-heals if a league is miscategorized as calendar-year vs European
    alt_season = season - 1 if league_id in config.CALENDAR_YEAR_LEAGUE_IDS else season + 1
    print(f"No fixtures for season {season}, trying alternate season {alt_season}")
    fixtures = await _fetch_fixtures_for_season(league_id, alt_season, days)
    if fixtures:
        print(f"Found {len(fixtures)} fixtures in alternate season {alt_season}")
        _set_cache(cache_key, fixtures)
        return fixtures

    # Still nothing — fetch historical as last resort
    print("No upcoming fixtures in either season, fetching historical matches")
    historical = await _fetch_last_season_fixtures(league_id)
    if historical:
        _set_cache(cache_key, historical)
        return historical

    # Try cache, then sample data
    cached = _get_cache(cache_key)
    if cached:
        return cached

    print("All API methods failed, returning sample fixtures")
    sample = _generate_sample_fixtures(competition, league_id)
    _set_cache(cache_key, sample)
    return sample


def _parse_fixture(fixture: Dict) -> Dict:
    """Parse a fixture from API-Football into our standard format."""
    fixture_info = fixture.get("fixture", {})
    teams = fixture.get("teams", {})
    league = fixture.get("league", {})
    goals = fixture.get("goals", {})
    events = fixture.get("events", [])
    statistics = fixture.get("statistics", [])
    status = fixture_info.get("status", {})

    # Parse statistics if available
    stats_dict = {}
    if statistics:
        for team_stats in statistics:
            team_id = team_stats.get("team", {}).get("id")
            team_statistics = {}
            for stat in team_stats.get("statistics", []):
                team_statistics[stat.get("type", "")] = stat.get("value")
            if team_id:
                stats_dict[team_id] = team_statistics

    home_id = teams.get("home", {}).get("id")
    away_id = teams.get("away", {}).get("id")
    home_stats = stats_dict.get(home_id, {})
    away_stats = stats_dict.get(away_id, {})

    # Count goal events per team for recent goal detection
    home_goals_list = [e for e in events if e.get("type") == "Goal" and e.get("team", {}).get("id") == home_id]
    away_goals_list = [e for e in events if e.get("type") == "Goal" and e.get("team", {}).get("id") == away_id]

    # Last goal info
    goal_events = [e for e in events if e.get("type") == "Goal"]
    last_goal = None
    if goal_events:
        lg = goal_events[-1]
        last_goal = {
            "time": lg.get("time", {}).get("elapsed"),
            "player": lg.get("player", {}).get("name"),
            "team_id": lg.get("team", {}).get("id"),
            "team": lg.get("team", {}).get("name"),
        }

    return {
        "id": fixture_info.get("id"),
        "date": fixture_info.get("date"),
        "timestamp": fixture_info.get("timestamp"),
        "status": status.get("short", "NS"),
        "elapsed": status.get("elapsed", 0),
        "venue": fixture_info.get("venue", {}).get("name"),
        "home_team": {
            "id": home_id,
            "name": teams.get("home", {}).get("name", "").replace(" FC", ""),
            "crest": teams.get("home", {}).get("logo"),
            "winner": teams.get("home", {}).get("winner"),
        },
        "away_team": {
            "id": away_id,
            "name": teams.get("away", {}).get("name", "").replace(" FC", ""),
            "crest": teams.get("away", {}).get("logo"),
            "winner": teams.get("away", {}).get("winner"),
        },
        "competition": {
            "id": league.get("id"),
            "name": league.get("name"),
            "country": league.get("country"),
            "code": _get_competition_code(league.get("id")),
            "emblem": league.get("logo"),
            "flag": league.get("flag"),
        },
        "goals": goals,
        "last_goal": last_goal,
        "statistics": {
            "home": home_stats,
            "away": away_stats,
        } if stats_dict else None,
        "events": [
            {
                "time": e.get("time", {}).get("elapsed"),
                "type": e.get("type"),
                "detail": e.get("detail"),
                "player": e.get("player", {}).get("name"),
                "team_id": e.get("team", {}).get("id"),
                "team": e.get("team", {}).get("name"),
            }
            for e in events
        ] if events else [],
    }


async def fetch_live_matches() -> Optional[List[Dict]]:
    """
    Fetch currently live matches.
    API Endpoint: GET /fixtures?live=all
    """
    cache_key = "live_matches"
    if _is_cache_valid(cache_key, 30):
        return _get_cache(cache_key)

    if not config.API_FOOTBALL_KEY:
        return []

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/fixtures"
            params = {"live": "all"}
            print(f"API Request: GET {url} (live matches)")

            async with session.get(url, headers=_get_headers(), params=params) as response:
                print(f"Live Matches API Response Status: {response.status}")
                if response.status == 200:
                    data = await response.json()
                    errors = data.get("errors")
                    if errors and len(errors) > 0:
                        print(f"Live Matches API Error: {errors}")
                        return []

                    fixtures_data = data.get("response", [])
                    print(f"Live matches found: {len(fixtures_data)}")

                    matches = [_parse_fixture(f) for f in fixtures_data]
                    _set_cache(cache_key, matches)
                    return matches
                else:
                    text = await response.text()
                    print(f"Live Matches API Error Response: {text[:300]}")

    except Exception as e:
        print(f"Live matches request failed: {type(e).__name__}: {e}")

    return _get_cache(cache_key) or []


async def fetch_todays_fixtures() -> Optional[List[Dict]]:
    """
    Fetch all of today's fixtures (finished, live, and upcoming).
    API Endpoint: GET /fixtures?date={today}
    """
    today = datetime.now().strftime("%Y-%m-%d")
    cache_key = f"todays_fixtures_{today}"

    if _is_cache_valid(cache_key, 120):  # 2-min cache
        return _get_cache(cache_key)

    if not config.API_FOOTBALL_KEY:
        return []

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/fixtures"
            params = {"date": today}
            print(f"API Request: GET {url} (today's fixtures)")

            async with session.get(url, headers=_get_headers(), params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    errors = data.get("errors")
                    if errors and len(errors) > 0:
                        return []

                    fixtures_data = data.get("response", [])
                    print(f"Today's fixtures found: {len(fixtures_data)}")

                    matches = [_parse_fixture(f) for f in fixtures_data]
                    _set_cache(cache_key, matches)
                    return matches

    except Exception as e:
        print(f"Today's fixtures request failed: {type(e).__name__}: {e}")

    return _get_cache(cache_key) or []


async def fetch_all_upcoming_fixtures(days: int = 3) -> List[Dict]:
    """
    Fetch upcoming fixtures across ALL leagues for the next N days.
    Uses per-day date queries (1 API call per day, cached 2 min each).
    Filters to only not-started matches (NS, TBD).
    """
    today = datetime.now()
    cache_key = f"all_upcoming_{today.strftime('%Y-%m-%d')}_{days}"

    if _is_cache_valid(cache_key, 120):  # 2-min cache
        return _get_cache(cache_key)

    if not config.API_FOOTBALL_KEY:
        return []

    all_fixtures = []
    try:
        async with aiohttp.ClientSession() as session:
            for d in range(days):
                date_str = (today + timedelta(days=d)).strftime("%Y-%m-%d")
                day_cache_key = f"all_fixtures_day_{date_str}"

                # Use day-level cache (2 min for today, 10 min for future days)
                ttl = 120 if d == 0 else 600
                if _is_cache_valid(day_cache_key, ttl):
                    day_fixtures = _get_cache(day_cache_key)
                    if day_fixtures:
                        all_fixtures.extend(day_fixtures)
                        continue

                url = f"{BASE_URL}/fixtures"
                params = {"date": date_str}
                print(f"API Request: GET {url} (all fixtures for {date_str})")

                async with session.get(url, headers=_get_headers(), params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        errors = data.get("errors")
                        if errors and len(errors) > 0:
                            print(f"All fixtures API Error for {date_str}: {errors}")
                            continue

                        fixtures_data = data.get("response", [])
                        print(f"Fixtures for {date_str}: {len(fixtures_data)}")
                        day_fixtures = _parse_fixtures(fixtures_data)
                        _set_cache(day_cache_key, day_fixtures)
                        all_fixtures.extend(day_fixtures)

    except Exception as e:
        print(f"All upcoming fixtures request failed: {type(e).__name__}: {e}")

    # Filter to only not-started matches and sort chronologically
    upcoming = [f for f in all_fixtures if f.get("status") in ("NS", "TBD", None)]
    upcoming.sort(key=lambda x: x.get("date", ""))

    _set_cache(cache_key, upcoming)
    return upcoming


async def fetch_fixtures_by_date(date_str: str) -> Optional[List[Dict]]:
    """
    Fetch all fixtures for a specific date (YYYY-MM-DD).
    Used to check results for past predictions.
    API Endpoint: GET /fixtures?date={date}
    """
    cache_key = f"fixtures_{date_str}"
    if _is_cache_valid(cache_key, 43200):  # 12-hour cache for past dates
        return _get_cache(cache_key)

    if not config.API_FOOTBALL_KEY:
        return []

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/fixtures"
            params = {"date": date_str}
            print(f"API Request: GET {url} (fixtures for {date_str})")

            async with session.get(url, headers=_get_headers(), params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    errors = data.get("errors")
                    if errors and len(errors) > 0:
                        return []

                    fixtures_data = data.get("response", [])
                    print(f"Fixtures for {date_str}: {len(fixtures_data)}")

                    matches = [_parse_fixture(f) for f in fixtures_data]
                    _set_cache(cache_key, matches)
                    return matches

    except Exception as e:
        print(f"Fixtures by date request failed: {type(e).__name__}: {e}")

    return _get_cache(cache_key) or []


async def fetch_fixture_statistics(fixture_id: int) -> Optional[Dict]:
    """
    Fetch live statistics for a specific fixture.
    API Endpoint: GET /fixtures/statistics?fixture={id}
    """
    cache_key = f"fixture_stats_{fixture_id}"
    if _is_cache_valid(cache_key, 60):  # 1-min cache
        return _get_cache(cache_key)

    if not config.API_FOOTBALL_KEY:
        return None

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/fixtures/statistics"
            params = {"fixture": fixture_id}

            async with session.get(url, headers=_get_headers(), params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    stats_raw = data.get("response", [])

                    result = {}
                    for team_data in stats_raw:
                        team_id = team_data.get("team", {}).get("id")
                        team_name = team_data.get("team", {}).get("name")
                        stats = {}
                        for s in team_data.get("statistics", []):
                            stats[s.get("type", "")] = s.get("value")
                        result[str(team_id)] = {"name": team_name, "stats": stats}

                    _set_cache(cache_key, result)
                    return result

    except Exception as e:
        print(f"Fixture statistics request failed: {e}")

    return _get_cache(cache_key)


async def fetch_fixture_lineups(fixture_id: int) -> Optional[List[Dict]]:
    """
    Fetch lineups (formation + starting XI + subs) for a fixture.
    API Endpoint: GET /fixtures/lineups?fixture={id}
    """
    cache_key = f"lineups_{fixture_id}"
    if _is_cache_valid(cache_key, 300):  # 5-min cache
        return _get_cache(cache_key)

    if not config.API_FOOTBALL_KEY:
        return None

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/fixtures/lineups"
            params = {"fixture": fixture_id}

            async with session.get(url, headers=_get_headers(), params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    lineups_raw = data.get("response", [])

                    result = []
                    for lineup in lineups_raw:
                        team = lineup.get("team", {})
                        coach = lineup.get("coach", {})
                        formation = lineup.get("formation")
                        start_xi = lineup.get("startXI", [])
                        subs = lineup.get("substitutes", [])

                        players_start = []
                        for p in start_xi:
                            player = p.get("player", {})
                            players_start.append({
                                "id": player.get("id"),
                                "name": player.get("name"),
                                "number": player.get("number"),
                                "pos": player.get("pos"),
                                "grid": player.get("grid"),
                            })

                        players_subs = []
                        for p in subs:
                            player = p.get("player", {})
                            players_subs.append({
                                "id": player.get("id"),
                                "name": player.get("name"),
                                "number": player.get("number"),
                                "pos": player.get("pos"),
                            })

                        result.append({
                            "team": {
                                "id": team.get("id"),
                                "name": team.get("name"),
                                "logo": team.get("logo"),
                                "colors": team.get("colors"),
                            },
                            "coach": {
                                "id": coach.get("id"),
                                "name": coach.get("name"),
                                "photo": coach.get("photo"),
                            },
                            "formation": formation,
                            "startXI": players_start,
                            "substitutes": players_subs,
                        })

                    _set_cache(cache_key, result)
                    return result

    except Exception as e:
        print(f"Fixture lineups request failed: {e}")

    return _get_cache(cache_key)


async def fetch_head_to_head(team1_id: int, team2_id: int, limit: int = 10) -> Optional[List[Dict]]:
    """
    Fetch head-to-head match history between two teams.
    API Endpoint: GET /fixtures/headtohead?h2h={team1}-{team2}

    Note: Free tier doesn't support 'last' parameter, so we fetch all and limit in code.
    """
    if not config.API_FOOTBALL_KEY:
        return None

    cache_key = f"h2h_{min(team1_id, team2_id)}_{max(team1_id, team2_id)}"

    if _is_cache_valid(cache_key, config.CACHE_TTL_H2H):
        return _get_cache(cache_key)

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/fixtures/headtohead"
            # Free tier: don't use 'last' param, fetch all and limit in code
            params = {
                "h2h": f"{team1_id}-{team2_id}",
            }

            print(f"API Request: GET {url}")
            print(f"Params: h2h={team1_id}-{team2_id}")

            async with session.get(url, headers=_get_headers(), params=params) as response:
                print(f"H2H API Response Status: {response.status}")

                if response.status == 200:
                    data = await response.json()

                    errors = data.get("errors")
                    if errors and len(errors) > 0:
                        print(f"H2H API Error: {errors}")
                        return []  # Return empty list instead of None

                    h2h_data = data.get("response", [])
                    print(f"H2H matches found: {len(h2h_data)}")

                    matches = []
                    for match in h2h_data:
                        fixture = match.get("fixture", {})
                        teams = match.get("teams", {})
                        goals = match.get("goals", {})
                        score_data = match.get("score", {})

                        home_team = teams.get("home", {})
                        away_team = teams.get("away", {})

                        matches.append({
                            "id": fixture.get("id"),
                            "date": fixture.get("date", "")[:10],
                            "venue": fixture.get("venue", {}).get("name"),
                            "home_team_id": home_team.get("id"),
                            "away_team_id": away_team.get("id"),
                            "home_team": home_team.get("name"),
                            "away_team": away_team.get("name"),
                            "home_score": goals.get("home"),
                            "away_score": goals.get("away"),
                            "ht_home_score": score_data.get("halftime", {}).get("home"),
                            "ht_away_score": score_data.get("halftime", {}).get("away"),
                            # For prediction compatibility
                            "team_a_id": team1_id,
                            "team_b_id": team2_id,
                            "team_a_score": goals.get("home") if home_team.get("id") == team1_id else goals.get("away"),
                            "team_b_score": goals.get("away") if home_team.get("id") == team1_id else goals.get("home"),
                        })

                    # Sort by date descending and limit
                    matches.sort(key=lambda x: x.get("date", ""), reverse=True)
                    matches = matches[:limit]

                    _set_cache(cache_key, matches)
                    return matches

    except Exception as e:
        print(f"H2H request failed: {type(e).__name__}: {e}")

    return _get_cache(cache_key) or []


async def fetch_team_statistics(team_id: int, league_id: int = 39) -> Optional[Dict]:
    """
    Fetch detailed team statistics for the current season.
    API Endpoint: GET /teams/statistics?league={id}&season={year}&team={id}
    Uses per-league season calculation for correct data across all leagues.
    """
    if not config.API_FOOTBALL_KEY:
        return None

    season = config.get_season_for_league(league_id)
    cache_key = f"team_stats_{team_id}_{league_id}_{season}"

    if _is_cache_valid(cache_key, config.CACHE_TTL_TEAM_STATS):
        return _get_cache(cache_key)

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/teams/statistics"
            params = {
                "team": team_id,
                "league": league_id,
                "season": season
            }

            async with session.get(url, headers=_get_headers(), params=params) as response:
                if response.status == 200:
                    data = await response.json()

                    errors = data.get("errors")
                    if errors and len(errors) > 0:
                        print(f"Team stats API Error: {errors}")
                        return None

                    stats = data.get("response", {})
                    if stats:
                        _set_cache(cache_key, stats)
                        return stats

    except Exception as e:
        print(f"Team statistics request failed: {e}")

    return _get_cache(cache_key)


async def fetch_players(team_id: int, league_id: int) -> Optional[List[Dict]]:
    """
    Fetch player statistics for a team from API-Football.
    API Endpoint: GET /players?team={id}&league={id}&season={year}
    Returns top players with goals, assists, cards, shots, key passes, etc.
    Uses per-league season calculation for correct data across all leagues.
    """
    season = config.get_season_for_league(league_id)
    cache_key = f"players_{team_id}_{league_id}_{season}"
    if _is_cache_valid(cache_key, 43200):  # 12-hour cache
        return _get_cache(cache_key)

    if not config.API_FOOTBALL_KEY:
        return None

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/players"
            params = {
                "team": team_id,
                "league": league_id,
                "season": season,
                "page": 1,
            }
            print(f"API Request: GET {url} (players for team {team_id})")

            async with session.get(url, headers=_get_headers(), params=params, timeout=aiohttp.ClientTimeout(total=15)) as response:
                if response.status == 200:
                    data = await response.json()

                    errors = data.get("errors")
                    if errors and len(errors) > 0:
                        print(f"Players API Error: {errors}")
                        return None

                    raw_players = data.get("response", [])
                    print(f"Players found: {len(raw_players)} for team {team_id}")

                    players = []
                    for entry in raw_players:
                        player = entry.get("player", {})
                        stats_list = entry.get("statistics", [])
                        if not stats_list:
                            continue

                        # Use the first relevant statistics block
                        stats = stats_list[0]
                        games = stats.get("games", {})
                        goals_data = stats.get("goals", {})
                        shots_data = stats.get("shots", {})
                        passes_data = stats.get("passes", {})
                        cards_data = stats.get("cards", {})

                        appearances = games.get("appearences") or 0
                        if appearances == 0:
                            continue

                        # Map position names
                        pos_map = {"Attacker": "FWD", "Midfielder": "MID", "Defender": "DEF", "Goalkeeper": "GK"}
                        position = pos_map.get(games.get("position", ""), games.get("position", "MID"))

                        total_goals = goals_data.get("total") or 0
                        total_assists = goals_data.get("assists") or 0
                        minutes = games.get("minutes") or 0
                        total_shots = shots_data.get("total") or 0
                        shots_on = shots_data.get("on") or 0
                        key_passes = passes_data.get("key") or 0
                        yellow = cards_data.get("yellow") or 0
                        red = cards_data.get("red") or 0

                        players.append({
                            "id": player.get("id"),
                            "name": player.get("name"),
                            "photo": player.get("photo"),
                            "position": position,
                            "shirt_number": games.get("number") or 0,
                            "goals": total_goals,
                            "assists": total_assists,
                            "games_played": appearances,
                            "minutes_played": minutes,
                            "shots": total_shots,
                            "shots_on_target": shots_on,
                            "key_passes": key_passes,
                            "clean_sheets": 0,
                            "yellow_cards": yellow,
                            "red_cards": red,
                            "rating": float(games.get("rating") or 0),
                            # Estimate team win impact from rating
                            "team_wins_with": round(appearances * 0.5) if float(games.get("rating") or 0) >= 7.0 else round(appearances * 0.4),
                            "team_games_with": appearances,
                            "team_wins_without": 0,
                            "team_games_without": max(1, 5),
                        })

                    # Sort by impact: goals + assists + key_passes weight
                    players.sort(key=lambda p: (p["goals"] * 3 + p["assists"] * 2 + p["key_passes"] + p["rating"] * 2), reverse=True)

                    _set_cache(cache_key, players)
                    return players

    except Exception as e:
        print(f"Players request failed: {e}")

    return _get_cache(cache_key)


async def fetch_injuries(team_id: int, league_id: int) -> Optional[List[Dict]]:
    """Fetch current injuries/suspensions for a team.
    Uses per-league season calculation for correct data across all leagues."""
    season = config.get_season_for_league(league_id)
    cache_key = f"injuries_{team_id}_{league_id}_{season}"
    if _is_cache_valid(cache_key, 43200):  # 12-hour cache
        return _cache[cache_key]

    if not config.API_FOOTBALL_KEY:
        return None

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/injuries"
            params = {
                "team": team_id,
                "league": league_id,
                "season": season,
            }
            print(f"API Request: GET {url}")
            print(f"Params: team={team_id}, league={league_id}, season={season}")
            async with session.get(url, headers=_get_headers(), params=params, timeout=aiohttp.ClientTimeout(total=15)) as response:
                if response.status == 200:
                    data = await response.json()
                    injuries_raw = data.get("response", [])

                    injuries = []
                    for inj in injuries_raw:
                        player = inj.get("player", {})
                        injury_info = player.get("reason") or "Unknown"
                        injuries.append({
                            "player": player.get("name", "Unknown"),
                            "photo": player.get("photo"),
                            "type": player.get("type", "Unknown"),
                            "reason": injury_info,
                        })

                    _set_cache(cache_key, injuries)
                    return injuries

    except Exception as e:
        print(f"Injuries request failed: {e}")

    cached = _get_cache(cache_key)
    return cached if cached else []


def search_cached_fixtures(query: str, limit: int = 15) -> List[Dict]:
    """Search cached fixtures by team name. No extra API calls - only searches in-memory cache."""
    query_lower = query.lower().strip()
    if not query_lower:
        return []

    results = []
    seen_ids = set()

    for key, data in _cache.items():
        # Only search fixture-type cache entries
        if not (key.startswith("fixtures_") or key.startswith("todays_fixtures_")
                or key.startswith("live_matches") or key.startswith("last_fixtures_")
                or key.startswith("season_end_fixtures_")):
            continue
        if not isinstance(data, list):
            continue

        # Try to extract league_id from cache key for competition code
        comp_code = None
        if key.startswith("fixtures_"):
            parts = key.split("_")
            if len(parts) >= 2:
                try:
                    comp_code = _get_competition_code(int(parts[1]))
                except (ValueError, IndexError):
                    pass

        for fixture in data:
            fid = fixture.get("id")
            if fid in seen_ids:
                continue
            home_name = (fixture.get("home_team", {}).get("name") or "").lower()
            away_name = (fixture.get("away_team", {}).get("name") or "").lower()
            if query_lower in home_name or query_lower in away_name:
                seen_ids.add(fid)
                # Enrich with competition code if not already present
                enriched = dict(fixture)
                comp = enriched.get("competition", {})
                if not comp.get("code") and comp_code:
                    enriched["competition"] = {**comp, "code": comp_code}
                results.append(enriched)
                if len(results) >= limit:
                    return results

    # Sort by date
    results.sort(key=lambda x: x.get("date") or x.get("timestamp") or "", reverse=True)
    return results[:limit]


async def search_team_by_name(name: str) -> Optional[List[Dict]]:
    """
    Search for teams by name using API-Football /teams endpoint.
    API Endpoint: GET /teams?search={name}
    Returns list of matching teams with id, name, country, logo.
    Minimum 3 characters required by API.
    """
    if not config.API_FOOTBALL_KEY or not name or len(name.strip()) < 3:
        return None

    clean_name = name.strip()
    cache_key = f"team_search_{clean_name.lower()}"

    if _is_cache_valid(cache_key, 86400):  # 24-hour cache
        return _get_cache(cache_key)

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/teams"
            params = {"search": clean_name}

            print(f"[TeamSearch] API Request: GET {url}?search={clean_name}")

            async with session.get(url, headers=_get_headers(), params=params,
                                   timeout=aiohttp.ClientTimeout(total=15)) as response:
                print(f"[TeamSearch] Response Status: {response.status}")

                if response.status == 200:
                    data = await response.json()

                    errors = data.get("errors")
                    if errors and len(errors) > 0:
                        print(f"[TeamSearch] API Error: {errors}")
                        return None

                    results = data.get("response", [])
                    print(f"[TeamSearch] Found {len(results)} teams for '{clean_name}'")

                    teams = []
                    for item in results:
                        team = item.get("team", {})
                        teams.append({
                            "id": team.get("id"),
                            "name": team.get("name"),
                            "code": team.get("code"),
                            "country": team.get("country"),
                            "logo": team.get("logo"),
                            "national": team.get("national", False),
                        })

                    _set_cache(cache_key, teams)
                    return teams

    except Exception as e:
        print(f"[TeamSearch] Request failed: {type(e).__name__}: {e}")

    return _get_cache(cache_key)


async def fetch_coach(team_id: int) -> Optional[Dict]:
    """Fetch the CURRENT coach for a team by checking career end dates."""
    cache_key = f"coach_{team_id}"
    if _is_cache_valid(cache_key, 86400):  # 24-hour cache
        return _cache[cache_key]

    if not config.API_FOOTBALL_KEY:
        return None

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{BASE_URL}/coachs"
            params = {"team": team_id}
            print(f"API Request: GET {url}")
            async with session.get(url, headers=_get_headers(), params=params, timeout=aiohttp.ClientTimeout(total=15)) as response:
                if response.status == 200:
                    data = await response.json()
                    coaches = data.get("response", [])

                    if coaches:
                        # Find the current coach: the one whose career entry
                        # for this team has end=null (still active)
                        current_coach = None
                        for coach in coaches:
                            career = coach.get("career", [])
                            for stint in career:
                                stint_team = stint.get("team", {})
                                if stint_team.get("id") == team_id and stint.get("end") is None:
                                    current_coach = coach
                                    break
                            if current_coach:
                                break

                        # Fallback: if no active stint found, use the coach
                        # whose most recent career entry is for this team
                        if not current_coach:
                            for coach in coaches:
                                career = coach.get("career", [])
                                if career and career[-1].get("team", {}).get("id") == team_id:
                                    current_coach = coach
                                    break

                        # Final fallback: first coach in the list
                        if not current_coach:
                            current_coach = coaches[0]

                        coach_info = {
                            "name": current_coach.get("name", "Unknown"),
                            "photo": current_coach.get("photo"),
                            "nationality": current_coach.get("nationality"),
                            "age": current_coach.get("age"),
                        }
                        print(f"[Coach] Found current coach for team {team_id}: {coach_info['name']}")
                        _set_cache(cache_key, coach_info)
                        return coach_info

    except Exception as e:
        print(f"Coach request failed: {e}")

    return _get_cache(cache_key)
