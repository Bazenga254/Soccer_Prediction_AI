"""
API Configuration for Soccer Prediction AI

API-Football (api-sports.io) - Primary football data source
- Rich statistics: H2H, cards, goals, injuries, lineups
- 100 requests/day on free tier
- Documentation: https://www.api-football.com/documentation-v3
"""

import os

# API-Football Configuration (api-sports.io)
# Sign up at: https://www.api-football.com/
API_FOOTBALL_KEY = os.environ.get("API_FOOTBALL_KEY", "")
API_FOOTBALL_HOST = "v3.football.api-sports.io"

# The Odds API Key (for betting odds)
# Sign up at: https://the-odds-api.com/
ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "")

# Legacy Football-Data.org key (kept for backup)
FOOTBALL_DATA_API_KEY = os.environ.get("FOOTBALL_DATA_API_KEY", "")

# API-Football League IDs
LEAGUE_IDS = {
    # Top 5 European Leagues
    "PL": 39,       # Premier League (England)
    "PD": 140,      # La Liga (Spain)
    "BL1": 78,      # Bundesliga (Germany)
    "SA": 135,      # Serie A (Italy)
    "FL1": 61,      # Ligue 1 (France)
    # Other Major Leagues
    "ELC": 40,      # Championship (England)
    "DED": 88,      # Eredivisie (Netherlands)
    "PPL": 94,      # Primeira Liga (Portugal)
    # Continental Competitions
    "CL": 2,        # UEFA Champions League
    "EL": 3,        # UEFA Europa League
    "CLI": 13,      # Copa Libertadores
    # International
    "EC": 4,        # UEFA Euro Championship
    "WC": 1,        # FIFA World Cup
}

# Competition display names
COMPETITION_NAMES = {
    "PL": "Premier League",
    "ELC": "Championship",
    "PD": "La Liga",
    "BL1": "Bundesliga",
    "SA": "Serie A",
    "FL1": "Ligue 1",
    "DED": "Eredivisie",
    "PPL": "Primeira Liga",
    "CL": "Champions League",
    "EL": "Europa League",
    "CLI": "Copa Libertadores",
    "EC": "Euro Championship",
    "WC": "World Cup",
}

# Default competition to use
DEFAULT_COMPETITION = "PL"  # Premier League

# Current season (API-Football uses the start year of the season)
# For 2024-2025 season, use 2024. For 2025-2026 season, use 2025.
from datetime import datetime
_current_month = datetime.now().month
_current_year = datetime.now().year
# Calculate the current season (Aug-Dec = this year, Jan-Jul = last year)
_calculated_season = _current_year if _current_month >= 8 else _current_year - 1
# Paid API: no season restriction
CURRENT_SEASON = _calculated_season

# Cache settings (in seconds)
CACHE_TTL_STANDINGS = 3600      # 1 hour for standings
CACHE_TTL_MATCHES = 1800        # 30 minutes for matches/fixtures
CACHE_TTL_H2H = 86400           # 24 hours for H2H (doesn't change often)
CACHE_TTL_TEAM_STATS = 3600     # 1 hour for team statistics
CACHE_TTL_ODDS = 300            # 5 minutes for odds

# League priority for live scores sorting (lower = higher priority)
LEAGUE_PRIORITY = {
    39: 1,    # Premier League
    140: 2,   # La Liga
    78: 3,    # Bundesliga
    135: 4,   # Serie A
    61: 5,    # Ligue 1
    2: 6,     # Champions League
    3: 7,     # Europa League
    40: 8,    # Championship
    88: 9,    # Eredivisie
    94: 10,   # Primeira Liga
    1: 11,    # World Cup
    4: 12,    # Euro Championship
    13: 13,   # Copa Libertadores
}

# Fallback to sample data if API fails or no key provided
USE_SAMPLE_DATA_FALLBACK = True
