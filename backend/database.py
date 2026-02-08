import aiosqlite
import os
import config

# Try to import the API modules
try:
    import football_api
    API_AVAILABLE = True
except ImportError:
    API_AVAILABLE = False
    print("Warning: football_api module not available, using sample data only")

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "soccer_data.db")

# Flag to track if we're using live data
_using_live_data = False
_live_teams_cache = {}  # Dict to store teams per competition: {"PL": [...], "PD": [...], etc.}

TEAMS_DATA = [
    {"id": 1, "name": "Arsenal", "short_name": "ARS", "position": 1, "points": 62, "played": 30,
     "goals_scored": 58, "goals_conceded": 24, "wins": 19, "draws": 5, "losses": 6,
     "home_wins": 12, "home_draws": 2, "home_losses": 1,
     "away_wins": 7, "away_draws": 3, "away_losses": 5,
     "recent_w": 7, "recent_d": 2, "recent_l": 1, "recent_gf": 18, "recent_ga": 8},
    {"id": 2, "name": "Liverpool", "short_name": "LIV", "position": 2, "points": 60, "played": 30,
     "goals_scored": 55, "goals_conceded": 28, "wins": 18, "draws": 6, "losses": 6,
     "home_wins": 11, "home_draws": 3, "home_losses": 1,
     "away_wins": 7, "away_draws": 3, "away_losses": 5,
     "recent_w": 7, "recent_d": 1, "recent_l": 2, "recent_gf": 16, "recent_ga": 9},
    {"id": 3, "name": "Manchester City", "short_name": "MCI", "position": 3, "points": 58, "played": 30,
     "goals_scored": 60, "goals_conceded": 30, "wins": 17, "draws": 7, "losses": 6,
     "home_wins": 13, "home_draws": 1, "home_losses": 1,
     "away_wins": 4, "away_draws": 6, "away_losses": 5,
     "recent_w": 5, "recent_d": 3, "recent_l": 2, "recent_gf": 15, "recent_ga": 11},
    {"id": 4, "name": "Aston Villa", "short_name": "AVL", "position": 4, "points": 55, "played": 30,
     "goals_scored": 52, "goals_conceded": 38, "wins": 16, "draws": 7, "losses": 7,
     "home_wins": 10, "home_draws": 4, "home_losses": 1,
     "away_wins": 6, "away_draws": 3, "away_losses": 6,
     "recent_w": 6, "recent_d": 2, "recent_l": 2, "recent_gf": 14, "recent_ga": 12},
    {"id": 5, "name": "Chelsea", "short_name": "CHE", "position": 5, "points": 53, "played": 30,
     "goals_scored": 48, "goals_conceded": 35, "wins": 15, "draws": 8, "losses": 7,
     "home_wins": 10, "home_draws": 3, "home_losses": 2,
     "away_wins": 5, "away_draws": 5, "away_losses": 5,
     "recent_w": 5, "recent_d": 3, "recent_l": 2, "recent_gf": 12, "recent_ga": 10},
    {"id": 6, "name": "Newcastle", "short_name": "NEW", "position": 6, "points": 51, "played": 30,
     "goals_scored": 45, "goals_conceded": 38, "wins": 15, "draws": 6, "losses": 9,
     "home_wins": 12, "home_draws": 2, "home_losses": 1,
     "away_wins": 3, "away_draws": 4, "away_losses": 8,
     "recent_w": 5, "recent_d": 1, "recent_l": 4, "recent_gf": 11, "recent_ga": 14},
    {"id": 7, "name": "Manchester United", "short_name": "MNU", "position": 7, "points": 48, "played": 30,
     "goals_scored": 42, "goals_conceded": 40, "wins": 13, "draws": 9, "losses": 8,
     "home_wins": 9, "home_draws": 4, "home_losses": 2,
     "away_wins": 4, "away_draws": 5, "away_losses": 6,
     "recent_w": 4, "recent_d": 3, "recent_l": 3, "recent_gf": 10, "recent_ga": 12},
    {"id": 8, "name": "Tottenham", "short_name": "TOT", "position": 8, "points": 46, "played": 30,
     "goals_scored": 47, "goals_conceded": 44, "wins": 12, "draws": 10, "losses": 8,
     "home_wins": 7, "home_draws": 6, "home_losses": 2,
     "away_wins": 5, "away_draws": 4, "away_losses": 6,
     "recent_w": 4, "recent_d": 2, "recent_l": 4, "recent_gf": 13, "recent_ga": 15},
]

# Key players per team (top 3-4 per team for analysis)
PLAYERS_DATA = {
    1: [  # Arsenal
        {"id": 101, "name": "Bukayo Saka", "position": "FWD", "shirt_number": 7, "goals": 14, "assists": 9, "games_played": 28, "minutes_played": 2380, "shots": 72, "shots_on_target": 32, "key_passes": 58, "clean_sheets": 0, "yellow_cards": 3, "red_cards": 0, "team_wins_with": 17, "team_games_with": 26, "team_wins_without": 2, "team_games_without": 4},
        {"id": 102, "name": "Martin Odegaard", "position": "MID", "shirt_number": 8, "goals": 8, "assists": 7, "games_played": 27, "minutes_played": 2250, "shots": 45, "shots_on_target": 18, "key_passes": 72, "clean_sheets": 0, "yellow_cards": 2, "red_cards": 0, "team_wins_with": 16, "team_games_with": 25, "team_wins_without": 3, "team_games_without": 5},
        {"id": 103, "name": "William Saliba", "position": "DEF", "shirt_number": 2, "goals": 2, "assists": 1, "games_played": 29, "minutes_played": 2610, "shots": 8, "shots_on_target": 4, "key_passes": 12, "clean_sheets": 14, "yellow_cards": 4, "red_cards": 0, "team_wins_with": 18, "team_games_with": 28, "team_wins_without": 1, "team_games_without": 2},
    ],
    2: [  # Liverpool
        {"id": 201, "name": "Mohamed Salah", "position": "FWD", "shirt_number": 11, "goals": 17, "assists": 10, "games_played": 29, "minutes_played": 2465, "shots": 85, "shots_on_target": 42, "key_passes": 52, "clean_sheets": 0, "yellow_cards": 1, "red_cards": 0, "team_wins_with": 17, "team_games_with": 28, "team_wins_without": 1, "team_games_without": 2},
        {"id": 202, "name": "Darwin Nunez", "position": "FWD", "shirt_number": 9, "goals": 11, "assists": 5, "games_played": 26, "minutes_played": 1820, "shots": 58, "shots_on_target": 24, "key_passes": 18, "clean_sheets": 0, "yellow_cards": 5, "red_cards": 1, "team_wins_with": 14, "team_games_with": 24, "team_wins_without": 4, "team_games_without": 6},
        {"id": 203, "name": "Virgil van Dijk", "position": "DEF", "shirt_number": 4, "goals": 3, "assists": 1, "games_played": 28, "minutes_played": 2520, "shots": 15, "shots_on_target": 7, "key_passes": 8, "clean_sheets": 12, "yellow_cards": 3, "red_cards": 0, "team_wins_with": 17, "team_games_with": 27, "team_wins_without": 1, "team_games_without": 3},
    ],
    3: [  # Manchester City
        {"id": 301, "name": "Erling Haaland", "position": "FWD", "shirt_number": 9, "goals": 22, "assists": 4, "games_played": 28, "minutes_played": 2380, "shots": 92, "shots_on_target": 52, "key_passes": 14, "clean_sheets": 0, "yellow_cards": 2, "red_cards": 0, "team_wins_with": 16, "team_games_with": 27, "team_wins_without": 1, "team_games_without": 3},
        {"id": 302, "name": "Kevin De Bruyne", "position": "MID", "shirt_number": 17, "goals": 5, "assists": 12, "games_played": 22, "minutes_played": 1760, "shots": 28, "shots_on_target": 11, "key_passes": 68, "clean_sheets": 0, "yellow_cards": 1, "red_cards": 0, "team_wins_with": 14, "team_games_with": 20, "team_wins_without": 3, "team_games_without": 10},
        {"id": 303, "name": "Ruben Dias", "position": "DEF", "shirt_number": 3, "goals": 1, "assists": 0, "games_played": 26, "minutes_played": 2340, "shots": 6, "shots_on_target": 2, "key_passes": 10, "clean_sheets": 11, "yellow_cards": 5, "red_cards": 0, "team_wins_with": 15, "team_games_with": 25, "team_wins_without": 2, "team_games_without": 5},
    ],
    4: [  # Aston Villa
        {"id": 401, "name": "Ollie Watkins", "position": "FWD", "shirt_number": 11, "goals": 15, "assists": 8, "games_played": 29, "minutes_played": 2465, "shots": 68, "shots_on_target": 32, "key_passes": 28, "clean_sheets": 0, "yellow_cards": 2, "red_cards": 0, "team_wins_with": 15, "team_games_with": 28, "team_wins_without": 1, "team_games_without": 2},
        {"id": 402, "name": "John McGinn", "position": "MID", "shirt_number": 7, "goals": 6, "assists": 5, "games_played": 28, "minutes_played": 2380, "shots": 38, "shots_on_target": 14, "key_passes": 42, "clean_sheets": 0, "yellow_cards": 6, "red_cards": 0, "team_wins_with": 14, "team_games_with": 26, "team_wins_without": 2, "team_games_without": 4},
        {"id": 403, "name": "Ezri Konsa", "position": "DEF", "shirt_number": 4, "goals": 2, "assists": 1, "games_played": 27, "minutes_played": 2430, "shots": 10, "shots_on_target": 4, "key_passes": 8, "clean_sheets": 9, "yellow_cards": 4, "red_cards": 0, "team_wins_with": 14, "team_games_with": 26, "team_wins_without": 2, "team_games_without": 4},
    ],
    5: [  # Chelsea
        {"id": 501, "name": "Cole Palmer", "position": "MID", "shirt_number": 20, "goals": 16, "assists": 8, "games_played": 28, "minutes_played": 2380, "shots": 62, "shots_on_target": 28, "key_passes": 58, "clean_sheets": 0, "yellow_cards": 1, "red_cards": 0, "team_wins_with": 14, "team_games_with": 27, "team_wins_without": 1, "team_games_without": 3},
        {"id": 502, "name": "Nicolas Jackson", "position": "FWD", "shirt_number": 15, "goals": 10, "assists": 4, "games_played": 27, "minutes_played": 2025, "shots": 55, "shots_on_target": 22, "key_passes": 18, "clean_sheets": 0, "yellow_cards": 3, "red_cards": 0, "team_wins_with": 12, "team_games_with": 25, "team_wins_without": 3, "team_games_without": 5},
        {"id": 503, "name": "Reece James", "position": "DEF", "shirt_number": 24, "goals": 1, "assists": 3, "games_played": 18, "minutes_played": 1440, "shots": 8, "shots_on_target": 3, "key_passes": 22, "clean_sheets": 8, "yellow_cards": 2, "red_cards": 0, "team_wins_with": 10, "team_games_with": 17, "team_wins_without": 5, "team_games_without": 13},
    ],
    6: [  # Newcastle
        {"id": 601, "name": "Alexander Isak", "position": "FWD", "shirt_number": 14, "goals": 14, "assists": 3, "games_played": 26, "minutes_played": 2210, "shots": 58, "shots_on_target": 28, "key_passes": 16, "clean_sheets": 0, "yellow_cards": 1, "red_cards": 0, "team_wins_with": 13, "team_games_with": 25, "team_wins_without": 2, "team_games_without": 5},
        {"id": 602, "name": "Bruno Guimaraes", "position": "MID", "shirt_number": 39, "goals": 5, "assists": 6, "games_played": 28, "minutes_played": 2520, "shots": 32, "shots_on_target": 12, "key_passes": 48, "clean_sheets": 0, "yellow_cards": 7, "red_cards": 0, "team_wins_with": 14, "team_games_with": 27, "team_wins_without": 1, "team_games_without": 3},
        {"id": 603, "name": "Sven Botman", "position": "DEF", "shirt_number": 4, "goals": 1, "assists": 0, "games_played": 22, "minutes_played": 1980, "shots": 5, "shots_on_target": 2, "key_passes": 6, "clean_sheets": 9, "yellow_cards": 3, "red_cards": 0, "team_wins_with": 12, "team_games_with": 21, "team_wins_without": 3, "team_games_without": 9},
    ],
    7: [  # Manchester United
        {"id": 701, "name": "Marcus Rashford", "position": "FWD", "shirt_number": 10, "goals": 8, "assists": 4, "games_played": 26, "minutes_played": 2080, "shots": 52, "shots_on_target": 18, "key_passes": 22, "clean_sheets": 0, "yellow_cards": 2, "red_cards": 0, "team_wins_with": 10, "team_games_with": 24, "team_wins_without": 3, "team_games_without": 6},
        {"id": 702, "name": "Bruno Fernandes", "position": "MID", "shirt_number": 8, "goals": 7, "assists": 6, "games_played": 29, "minutes_played": 2610, "shots": 48, "shots_on_target": 18, "key_passes": 62, "clean_sheets": 0, "yellow_cards": 8, "red_cards": 1, "team_wins_with": 12, "team_games_with": 28, "team_wins_without": 1, "team_games_without": 2},
        {"id": 703, "name": "Lisandro Martinez", "position": "DEF", "shirt_number": 6, "goals": 1, "assists": 1, "games_played": 24, "minutes_played": 2160, "shots": 6, "shots_on_target": 2, "key_passes": 8, "clean_sheets": 8, "yellow_cards": 6, "red_cards": 0, "team_wins_with": 11, "team_games_with": 23, "team_wins_without": 2, "team_games_without": 7},
    ],
    8: [  # Tottenham
        {"id": 801, "name": "Son Heung-min", "position": "FWD", "shirt_number": 7, "goals": 12, "assists": 7, "games_played": 28, "minutes_played": 2380, "shots": 58, "shots_on_target": 26, "key_passes": 38, "clean_sheets": 0, "yellow_cards": 1, "red_cards": 0, "team_wins_with": 11, "team_games_with": 27, "team_wins_without": 1, "team_games_without": 3},
        {"id": 802, "name": "James Maddison", "position": "MID", "shirt_number": 10, "goals": 6, "assists": 8, "games_played": 25, "minutes_played": 2000, "shots": 35, "shots_on_target": 14, "key_passes": 55, "clean_sheets": 0, "yellow_cards": 4, "red_cards": 0, "team_wins_with": 10, "team_games_with": 24, "team_wins_without": 2, "team_games_without": 6},
        {"id": 803, "name": "Cristian Romero", "position": "DEF", "shirt_number": 17, "goals": 2, "assists": 0, "games_played": 26, "minutes_played": 2340, "shots": 10, "shots_on_target": 4, "key_passes": 6, "clean_sheets": 7, "yellow_cards": 9, "red_cards": 1, "team_wins_with": 11, "team_games_with": 25, "team_wins_without": 1, "team_games_without": 5},
    ],
}

# Head-to-head historical matches
H2H_DATA = [
    # Arsenal vs Liverpool
    {"team_a_id": 1, "team_b_id": 2, "team_a_score": 3, "team_b_score": 1, "date": "2025-10-15"},
    {"team_a_id": 2, "team_b_id": 1, "team_a_score": 2, "team_b_score": 2, "date": "2025-04-08"},
    {"team_a_id": 1, "team_b_id": 2, "team_a_score": 1, "team_b_score": 1, "date": "2024-10-22"},
    {"team_a_id": 2, "team_b_id": 1, "team_a_score": 1, "team_b_score": 0, "date": "2024-04-14"},
    # Arsenal vs Man City
    {"team_a_id": 1, "team_b_id": 3, "team_a_score": 2, "team_b_score": 1, "date": "2025-09-22"},
    {"team_a_id": 3, "team_b_id": 1, "team_a_score": 0, "team_b_score": 0, "date": "2025-03-31"},
    {"team_a_id": 1, "team_b_id": 3, "team_a_score": 1, "team_b_score": 0, "date": "2024-10-08"},
    {"team_a_id": 3, "team_b_id": 1, "team_a_score": 4, "team_b_score": 1, "date": "2024-03-03"},
    # Arsenal vs Chelsea
    {"team_a_id": 1, "team_b_id": 5, "team_a_score": 5, "team_b_score": 0, "date": "2025-11-10"},
    {"team_a_id": 5, "team_b_id": 1, "team_a_score": 2, "team_b_score": 2, "date": "2025-04-21"},
    {"team_a_id": 1, "team_b_id": 5, "team_a_score": 3, "team_b_score": 1, "date": "2024-10-29"},
    # Liverpool vs Man City
    {"team_a_id": 2, "team_b_id": 3, "team_a_score": 2, "team_b_score": 2, "date": "2025-11-30"},
    {"team_a_id": 3, "team_b_id": 2, "team_a_score": 1, "team_b_score": 1, "date": "2025-04-01"},
    {"team_a_id": 2, "team_b_id": 3, "team_a_score": 1, "team_b_score": 0, "date": "2024-11-12"},
    {"team_a_id": 3, "team_b_id": 2, "team_a_score": 3, "team_b_score": 2, "date": "2024-02-11"},
    # Liverpool vs Chelsea
    {"team_a_id": 2, "team_b_id": 5, "team_a_score": 4, "team_b_score": 1, "date": "2025-10-05"},
    {"team_a_id": 5, "team_b_id": 2, "team_a_score": 0, "team_b_score": 1, "date": "2025-04-25"},
    # Liverpool vs Man United
    {"team_a_id": 2, "team_b_id": 7, "team_a_score": 3, "team_b_score": 0, "date": "2025-12-15"},
    {"team_a_id": 7, "team_b_id": 2, "team_a_score": 2, "team_b_score": 2, "date": "2025-03-16"},
    {"team_a_id": 2, "team_b_id": 7, "team_a_score": 7, "team_b_score": 0, "date": "2024-09-01"},
    # Man City vs Chelsea
    {"team_a_id": 3, "team_b_id": 5, "team_a_score": 1, "team_b_score": 0, "date": "2025-11-23"},
    {"team_a_id": 5, "team_b_id": 3, "team_a_score": 0, "team_b_score": 4, "date": "2025-02-17"},
    # Man City vs Man United
    {"team_a_id": 3, "team_b_id": 7, "team_a_score": 3, "team_b_score": 1, "date": "2025-10-26"},
    {"team_a_id": 7, "team_b_id": 3, "team_a_score": 0, "team_b_score": 3, "date": "2025-03-02"},
    # Tottenham vs Arsenal
    {"team_a_id": 8, "team_b_id": 1, "team_a_score": 0, "team_b_score": 3, "date": "2025-09-15"},
    {"team_a_id": 1, "team_b_id": 8, "team_a_score": 2, "team_b_score": 2, "date": "2025-04-28"},
    {"team_a_id": 8, "team_b_id": 1, "team_a_score": 2, "team_b_score": 3, "date": "2024-09-29"},
    # Newcastle vs Liverpool
    {"team_a_id": 6, "team_b_id": 2, "team_a_score": 1, "team_b_score": 2, "date": "2025-08-31"},
    {"team_a_id": 2, "team_b_id": 6, "team_a_score": 4, "team_b_score": 2, "date": "2025-01-18"},
    # Aston Villa vs Man City
    {"team_a_id": 4, "team_b_id": 3, "team_a_score": 1, "team_b_score": 0, "date": "2025-12-07"},
    {"team_a_id": 3, "team_b_id": 4, "team_a_score": 4, "team_b_score": 1, "date": "2025-02-12"},
]


async def init_db():
    """Initialize the database and fetch live data if API key is configured."""
    global _using_live_data, _live_teams_cache

    if API_AVAILABLE and config.API_FOOTBALL_KEY:
        print("Fetching live data from API-Football...")
        try:
            # Load Premier League teams at startup
            standings = await football_api.fetch_standings("PL")
            if standings:
                _live_teams_cache["PL"] = _process_standings(standings)
                _using_live_data = True
                print(f"[OK] Loaded {len(_live_teams_cache['PL'])} Premier League teams")
                return
        except Exception as e:
            print(f"Failed to fetch live data: {e}")

    print("Using sample data (no API key or API unavailable)")
    _using_live_data = False


async def get_teams_for_competition(competition: str = "PL"):
    """Fetch and cache teams for a specific competition."""
    global _live_teams_cache

    if not _using_live_data or not API_AVAILABLE:
        return TEAMS_DATA

    # Return cached data if available
    if competition in _live_teams_cache:
        return _live_teams_cache[competition]

    # Fetch teams for this competition
    try:
        print(f"Fetching teams for competition: {competition}")
        standings = await football_api.fetch_standings(competition)
        if standings:
            _live_teams_cache[competition] = _process_standings(standings)
            print(f"[OK] Loaded {len(_live_teams_cache[competition])} teams for {competition}")
            return _live_teams_cache[competition]
    except Exception as e:
        print(f"Failed to fetch teams for {competition}: {e}")

    # Fallback to sample data
    return TEAMS_DATA


def _process_standings(standings):
    """Process standings data from API-Football into team format."""
    teams = []

    for team in standings:
        # API-Football already provides detailed home/away stats
        played = team.get("played", 0) or 1
        wins = team.get("wins", 0)
        draws = team.get("draws", 0)
        losses = team.get("losses", 0)

        # Calculate form from form string (e.g., "WWDLW")
        form_str = team.get("form", "")
        recent_w = form_str.count('W') if form_str else round(wins / played * 5)
        recent_d = form_str.count('D') if form_str else round(draws / played * 5)
        recent_l = form_str.count('L') if form_str else 5 - recent_w - recent_d

        teams.append({
            "id": team.get("id"),
            "name": team.get("name", "").replace(" FC", "").replace(" CF", ""),
            "short_name": team.get("short_name", ""),
            "crest": team.get("crest"),
            "position": team.get("position"),
            "points": team.get("points"),
            "played": played,
            "wins": wins,
            "draws": draws,
            "losses": losses,
            "goals_scored": team.get("goals_scored", 0),
            "goals_conceded": team.get("goals_conceded", 0),
            "goal_difference": team.get("goal_difference", 0),
            "form": form_str,
            # Recent form from form string
            "recent_w": recent_w,
            "recent_d": recent_d,
            "recent_l": recent_l,
            "recent_gf": round(team.get("goals_scored", 0) / played * 5) if played > 0 else 0,
            "recent_ga": round(team.get("goals_conceded", 0) / played * 5) if played > 0 else 0,
            # Actual home/away stats from API
            "home_wins": team.get("home_wins", round(wins * 0.6)),
            "home_draws": team.get("home_draws", round(draws * 0.5)),
            "home_losses": team.get("home_losses", round(losses * 0.4)),
            "home_goals_for": team.get("home_goals_for", 0),
            "home_goals_against": team.get("home_goals_against", 0),
            "away_wins": team.get("away_wins", round(wins * 0.4)),
            "away_draws": team.get("away_draws", round(draws * 0.5)),
            "away_losses": team.get("away_losses", round(losses * 0.6)),
            "away_goals_for": team.get("away_goals_for", 0),
            "away_goals_against": team.get("away_goals_against", 0),
        })

    return teams


async def get_teams(competition: str = "PL"):
    """Return list of all teams for a competition (live data if available, otherwise sample)."""
    global _live_teams_cache

    if _using_live_data:
        return await get_teams_for_competition(competition)

    return TEAMS_DATA


def is_using_live_data():
    """Check if we're using live data or sample data."""
    return _using_live_data


async def get_team_players(team_id: int, league_id: int = None):
    """Return players for a specific team. Fetches from API if available."""
    # Try to get real player data from API-Football
    if API_AVAILABLE and config.API_FOOTBALL_KEY and _using_live_data and league_id:
        try:
            players = await football_api.fetch_players(team_id, league_id)
            if players and len(players) > 0:
                return players
        except Exception as e:
            print(f"Failed to fetch live player data: {e}")

    # Fallback: only use sample data if we have it for this exact team
    # Never return another team's data as a substitute
    return PLAYERS_DATA.get(team_id, [])


async def get_h2h_matches(team_a_id: int, team_b_id: int):
    """Return head-to-head matches between two teams."""
    # Try to get live H2H data if API is available
    if API_AVAILABLE and config.API_FOOTBALL_KEY and _using_live_data:
        try:
            h2h = await football_api.fetch_head_to_head(team_a_id, team_b_id)
            if h2h:
                return h2h
        except Exception as e:
            print(f"Failed to fetch H2H data: {e}")

    # Fallback to sample data
    matches = []
    for m in H2H_DATA:
        if (m["team_a_id"] == team_a_id and m["team_b_id"] == team_b_id) or \
           (m["team_a_id"] == team_b_id and m["team_b_id"] == team_a_id):
            matches.append(m)
    return matches
