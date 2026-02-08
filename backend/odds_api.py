"""
The Odds API Integration

Free tier provides:
- 500 requests/month
- Live odds from multiple bookmakers
- Soccer/football markets

API Documentation: https://the-odds-api.com/liveapi/guides/v4/
"""

import aiohttp
from datetime import datetime
from typing import Optional, Dict, List, Any
import config

BASE_URL = "https://api.the-odds-api.com/v4"

# In-memory cache
_cache: Dict[str, Any] = {}
_cache_timestamps: Dict[str, datetime] = {}


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


# Team name mappings (API names to Football-Data.org names)
TEAM_NAME_MAPPINGS = {
    "Arsenal": ["Arsenal FC", "Arsenal"],
    "Liverpool": ["Liverpool FC", "Liverpool"],
    "Manchester City": ["Manchester City FC", "Man City", "Manchester City"],
    "Aston Villa": ["Aston Villa FC", "Aston Villa"],
    "Chelsea": ["Chelsea FC", "Chelsea"],
    "Newcastle": ["Newcastle United FC", "Newcastle United", "Newcastle"],
    "Manchester United": ["Manchester United FC", "Man United", "Man Utd", "Manchester United"],
    "Tottenham": ["Tottenham Hotspur FC", "Tottenham Hotspur", "Spurs", "Tottenham"],
    "Brighton": ["Brighton & Hove Albion FC", "Brighton and Hove Albion", "Brighton"],
    "West Ham": ["West Ham United FC", "West Ham United", "West Ham"],
    "Bournemouth": ["AFC Bournemouth", "Bournemouth"],
    "Crystal Palace": ["Crystal Palace FC", "Crystal Palace"],
    "Wolves": ["Wolverhampton Wanderers FC", "Wolverhampton", "Wolves"],
    "Fulham": ["Fulham FC", "Fulham"],
    "Everton": ["Everton FC", "Everton"],
    "Brentford": ["Brentford FC", "Brentford"],
    "Nottingham Forest": ["Nottingham Forest FC", "Nott'm Forest", "Nottingham Forest"],
    "Luton": ["Luton Town FC", "Luton Town", "Luton"],
    "Burnley": ["Burnley FC", "Burnley"],
    "Sheffield United": ["Sheffield United FC", "Sheffield Utd", "Sheffield United"],
    "Ipswich": ["Ipswich Town FC", "Ipswich Town", "Ipswich"],
    "Leicester": ["Leicester City FC", "Leicester City", "Leicester"],
    "Southampton": ["Southampton FC", "Southampton"],
}


def normalize_team_name(name: str) -> str:
    """Normalize team name for matching."""
    name_lower = name.lower().strip()
    for canonical, variants in TEAM_NAME_MAPPINGS.items():
        for variant in variants:
            if variant.lower() == name_lower:
                return canonical
    return name


async def fetch_soccer_odds(region: str = "uk") -> Optional[List[Dict]]:
    """
    Fetch live odds for soccer matches.

    Args:
        region: Bookmaker region (uk, us, eu, au)

    Returns:
        List of matches with odds from multiple bookmakers
    """
    if not config.ODDS_API_KEY:
        return None

    cache_key = f"odds_{region}"

    if _is_cache_valid(cache_key, config.CACHE_TTL_ODDS):
        return _get_cache(cache_key)

    try:
        async with aiohttp.ClientSession() as session:
            # English Premier League sport key
            sport_key = "soccer_epl"

            url = f"{BASE_URL}/sports/{sport_key}/odds"
            params = {
                "apiKey": config.ODDS_API_KEY,
                "regions": region,
                "markets": "h2h",  # Head-to-head (1X2) market
                "oddsFormat": "decimal",
            }

            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()

                    # Check remaining requests
                    remaining = response.headers.get("x-requests-remaining", "unknown")
                    print(f"Odds API: {remaining} requests remaining this month")

                    matches = []
                    for event in data:
                        match_odds = {
                            "id": event.get("id"),
                            "commence_time": event.get("commence_time"),
                            "home_team": normalize_team_name(event.get("home_team", "")),
                            "away_team": normalize_team_name(event.get("away_team", "")),
                            "bookmakers": [],
                        }

                        for bookmaker in event.get("bookmakers", []):
                            bookie_data = {
                                "name": bookmaker.get("title"),
                                "last_update": bookmaker.get("last_update"),
                                "markets": {},
                            }

                            for market in bookmaker.get("markets", []):
                                if market.get("key") == "h2h":
                                    outcomes = {}
                                    for outcome in market.get("outcomes", []):
                                        name = outcome.get("name")
                                        if name == event.get("home_team"):
                                            outcomes["home"] = outcome.get("price")
                                        elif name == event.get("away_team"):
                                            outcomes["away"] = outcome.get("price")
                                        elif name == "Draw":
                                            outcomes["draw"] = outcome.get("price")
                                    bookie_data["markets"]["h2h"] = outcomes

                            match_odds["bookmakers"].append(bookie_data)

                        matches.append(match_odds)

                    _set_cache(cache_key, matches)
                    return matches

                elif response.status == 401:
                    print("Odds API: Invalid API key")
                elif response.status == 429:
                    print("Odds API: Rate limit or quota exceeded")
                else:
                    print(f"Odds API error: {response.status}")

    except Exception as e:
        print(f"Odds API request failed: {e}")

    return _get_cache(cache_key)


def find_match_odds(all_odds: List[Dict], team_a_name: str, team_b_name: str) -> Optional[Dict]:
    """
    Find odds for a specific match from the odds list.

    Args:
        all_odds: List of all matches with odds
        team_a_name: Name of team A
        team_b_name: Name of team B

    Returns:
        Match odds data if found, None otherwise
    """
    if not all_odds:
        return None

    team_a_normalized = normalize_team_name(team_a_name)
    team_b_normalized = normalize_team_name(team_b_name)

    for match in all_odds:
        home = match.get("home_team", "")
        away = match.get("away_team", "")

        # Check if teams match (in either order)
        if ((home == team_a_normalized and away == team_b_normalized) or
            (home == team_b_normalized and away == team_a_normalized)):
            return match

    return None


def format_odds_for_display(match_odds: Dict, team_a_name: str, team_b_name: str) -> Dict:
    """
    Format odds data for the frontend display.

    Returns odds in the format expected by odds_analysis.py
    """
    if not match_odds:
        return None

    team_a_normalized = normalize_team_name(team_a_name)
    home_team = match_odds.get("home_team", "")

    # Determine if team_a is home or away
    team_a_is_home = (home_team == team_a_normalized)

    formatted = {
        "team_a_win": [],
        "draw": [],
        "team_b_win": [],
    }

    for bookmaker in match_odds.get("bookmakers", []):
        bookie_name = bookmaker.get("name", "Unknown")
        h2h = bookmaker.get("markets", {}).get("h2h", {})

        if h2h:
            home_odds = h2h.get("home")
            away_odds = h2h.get("away")
            draw_odds = h2h.get("draw")

            if team_a_is_home:
                if home_odds:
                    formatted["team_a_win"].append({"bookmaker": bookie_name, "odds": home_odds})
                if away_odds:
                    formatted["team_b_win"].append({"bookmaker": bookie_name, "odds": away_odds})
            else:
                if away_odds:
                    formatted["team_a_win"].append({"bookmaker": bookie_name, "odds": away_odds})
                if home_odds:
                    formatted["team_b_win"].append({"bookmaker": bookie_name, "odds": home_odds})

            if draw_odds:
                formatted["draw"].append({"bookmaker": bookie_name, "odds": draw_odds})

    return formatted


async def get_live_odds_for_match(team_a_name: str, team_b_name: str) -> Optional[Dict]:
    """
    Get live betting odds for a specific match.

    This is the main function to call from other modules.
    Returns formatted odds ready for display.
    """
    all_odds = await fetch_soccer_odds()

    if not all_odds:
        return None

    match_odds = find_match_odds(all_odds, team_a_name, team_b_name)

    if not match_odds:
        return None

    return format_odds_for_display(match_odds, team_a_name, team_b_name)
