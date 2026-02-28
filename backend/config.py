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


# Web Push VAPID keys
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_CLAIMS_EMAIL = os.environ.get("VAPID_CLAIMS_EMAIL", "mailto:admin@spark-ai-prediction.com")
# The Odds API Key (for betting odds)
# Sign up at: https://the-odds-api.com/
ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "")

# Legacy Football-Data.org key (kept for backup)
FOOTBALL_DATA_API_KEY = os.environ.get("FOOTBALL_DATA_API_KEY", "")

# GIPHY API Key (free tier - 100 requests/hour)
# Get your free key at: https://developers.giphy.com/dashboard/
GIPHY_API_KEY = os.environ.get("GIPHY_API_KEY", "")

# API-Football League IDs
LEAGUE_IDS = {
    # Top 5 European Leagues
    "PL": 39,       # Premier League (England)
    "PD": 140,      # La Liga (Spain)
    "BL1": 78,      # Bundesliga (Germany)
    "SA": 135,      # Serie A (Italy)
    "FL1": 61,      # Ligue 1 (France)
    # Other European Leagues
    "ELC": 40,      # Championship (England)
    "DED": 88,      # Eredivisie (Netherlands)
    "PPL": 94,      # Primeira Liga (Portugal)
    "SPL": 179,     # Scottish Premiership
    "BPL": 144,     # Belgian Pro League
    "TSL": 203,     # Turkish Super Lig
    "SSL": 207,     # Swiss Super League
    "ABL": 218,     # Austrian Bundesliga
    "GSL": 197,     # Greek Super League
    "DSL": 119,     # Danish Superliga
    "SWA": 113,     # Swedish Allsvenskan
    "NOE": 103,     # Norwegian Eliteserien
    "CFL": 345,     # Czech First League
    "EPL": 106,     # Polish Ekstraklasa
    "HNL": 210,     # Croatian HNL
    "SRS": 286,     # Serbian Super Liga
    "ROL": 283,     # Romanian Liga I
    "UPL": 333,     # Ukrainian Premier League
    "RPL": 235,     # Russian Premier League
    # South America
    "BSA": 71,      # Brazilian Serie A
    "ALP": 128,     # Argentine Liga Profesional
    "COL": 239,     # Colombian Primera A
    "CHL": 265,     # Chilean Primera Division
    "URU": 268,     # Uruguayan Primera Division
    "PAR": 253,     # Paraguayan Division Profesional
    "PER": 281,     # Peruvian Liga 1
    "ECU": 242,     # Ecuadorian Serie A
    # North/Central America
    "MLS": 253,     # MLS (USA)
    "LMX": 262,     # Liga MX (Mexico)
    # Africa
    "EGY": 233,     # Egyptian Premier League
    "ZAF": 288,     # South African Premier League
    "MAR": 200,     # Moroccan Botola Pro
    "ALG": 186,     # Algerian Ligue 1
    "TUN": 202,     # Tunisian Ligue 1
    "NGA": 332,     # Nigerian NPFL
    "KEN": 276,     # Kenyan Premier League
    "GHA": 274,     # Ghanaian Premier League
    # Asia & Oceania
    "JPN": 98,      # Japanese J-League
    "KOR": 292,     # South Korean K-League
    "SAU": 307,     # Saudi Pro League
    "CHN": 169,     # Chinese Super League
    "IND": 323,     # Indian Super League
    "AUS": 188,     # A-League (Australia)
    "THA": 296,     # Thai League 1
    "UAE": 305,     # UAE Pro League
    # Continental Competitions
    "CL": 2,        # UEFA Champions League
    "EL": 3,        # UEFA Europa League
    "ECL": 848,     # UEFA Conference League
    "CLI": 13,      # Copa Libertadores
    "CAF": 12,      # CAF Champions League
    "AFC": 17,      # AFC Champions League
    # International
    "EC": 4,        # UEFA Euro Championship
    "WC": 1,        # FIFA World Cup
    "CA": 9,        # Copa America
    "ACN": 6,       # Africa Cup of Nations
}

# Competition display names
COMPETITION_NAMES = {
    "PL": "Premier League",
    "PD": "La Liga",
    "BL1": "Bundesliga",
    "SA": "Serie A",
    "FL1": "Ligue 1",
    "ELC": "Championship",
    "DED": "Eredivisie",
    "PPL": "Primeira Liga",
    "SPL": "Scottish Premiership",
    "BPL": "Belgian Pro League",
    "TSL": "Turkish Super Lig",
    "SSL": "Swiss Super League",
    "ABL": "Austrian Bundesliga",
    "GSL": "Greek Super League",
    "DSL": "Danish Superliga",
    "SWA": "Swedish Allsvenskan",
    "NOE": "Norwegian Eliteserien",
    "CFL": "Czech First League",
    "EPL": "Polish Ekstraklasa",
    "HNL": "Croatian HNL",
    "SRS": "Serbian Super Liga",
    "ROL": "Romanian Liga I",
    "UPL": "Ukrainian Premier League",
    "RPL": "Russian Premier League",
    "BSA": "Brazilian Serie A",
    "ALP": "Argentine Liga Profesional",
    "COL": "Colombian Primera A",
    "CHL": "Chilean Primera Division",
    "URU": "Uruguayan Primera Division",
    "PAR": "Paraguayan Division",
    "PER": "Peruvian Liga 1",
    "ECU": "Ecuadorian Serie A",
    "MLS": "MLS",
    "LMX": "Liga MX",
    "EGY": "Egyptian Premier League",
    "ZAF": "South African Premier League",
    "MAR": "Moroccan Botola Pro",
    "ALG": "Algerian Ligue 1",
    "TUN": "Tunisian Ligue 1",
    "NGA": "Nigerian NPFL",
    "KEN": "Kenyan Premier League",
    "GHA": "Ghanaian Premier League",
    "JPN": "J-League",
    "KOR": "K-League",
    "SAU": "Saudi Pro League",
    "CHN": "Chinese Super League",
    "IND": "Indian Super League",
    "AUS": "A-League",
    "THA": "Thai League 1",
    "UAE": "UAE Pro League",
    "CL": "Champions League",
    "EL": "Europa League",
    "ECL": "Conference League",
    "CLI": "Copa Libertadores",
    "CAF": "CAF Champions League",
    "AFC": "AFC Champions League",
    "EC": "Euro Championship",
    "WC": "World Cup",
    "CA": "Copa America",
    "ACN": "Africa Cup of Nations",
}

# Default competition to use
DEFAULT_COMPETITION = "PL"  # Premier League

# Current season (API-Football uses the start year of the season)
# European leagues: Aug-May straddling years (2025-2026 → season=2025)
# Calendar-year leagues: Jan-Dec (2026 → season=2026)
from datetime import datetime
_current_month = datetime.now().month
_current_year = datetime.now().year
# Default: European-style (Aug-Dec = this year, Jan-Jul = last year)
_calculated_season = _current_year if _current_month >= 8 else _current_year - 1
CURRENT_SEASON = _calculated_season

# Leagues that use calendar-year seasons (Jan-Dec)
# These need season = current year (or current year - 1 if queried before season starts)
CALENDAR_YEAR_LEAGUE_IDS = {
    # South America
    71,    # Brazilian Serie A (Apr-Dec)
    128,   # Argentine Liga Profesional (Feb-Dec)
    239,   # Colombian Primera A (Feb-Dec)
    265,   # Chilean Primera Division (Feb-Dec)
    268,   # Uruguayan Primera Division (Feb-Nov)
    253,   # Paraguayan Division / MLS
    281,   # Peruvian Liga 1 (Feb-Nov)
    242,   # Ecuadorian Serie A (Feb-Dec)
    # North America
    262,   # Liga MX (Jan-Dec, split Apertura/Clausura)
    # Asia
    98,    # Japanese J-League (Feb-Dec)
    292,   # South Korean K-League (Feb-Dec)
    169,   # Chinese Super League (Mar-Nov)
    323,   # Indian Super League (Oct-May, but API uses calendar year)
    296,   # Thai League 1 (Feb-Oct)
    # Oceania
    188,   # A-League (Oct-May, but API uses start year)
    # Scandinavia (calendar year)
    113,   # Swedish Allsvenskan (Apr-Nov)
    103,   # Norwegian Eliteserien (Apr-Nov)
    119,   # Danish Superliga (Jul-May, but API often uses start year)
    # NOTE: African leagues are European-style (Aug/Sep-May), NOT calendar year
}


def get_season_for_league(league_id: int) -> int:
    """Return the correct season year for a given league.

    Calendar-year leagues (South America, MLS, Asia, Scandinavia):
      - Jan-Dec: season = current year (if month >= 2, else previous year)
    European-style leagues (Aug-May):
      - Aug-Dec: season = current year
      - Jan-Jul: season = previous year
    """
    if league_id in CALENDAR_YEAR_LEAGUE_IDS:
        # Most calendar-year leagues start in Feb/Mar
        # In Jan, the previous season may still be wrapping up
        if _current_month >= 2:
            return _current_year
        else:
            return _current_year - 1
    # European-style default
    return CURRENT_SEASON

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
    179: 11,  # Scottish Premiership
    144: 12,  # Belgian Pro League
    203: 13,  # Turkish Super Lig
    71: 14,   # Brazilian Serie A
    128: 15,  # Argentine Liga Profesional
    307: 16,  # Saudi Pro League
    262: 17,  # Liga MX
    253: 18,  # MLS / Paraguayan
    98: 19,   # J-League
    292: 20,  # K-League
    207: 21,  # Swiss Super League
    218: 22,  # Austrian Bundesliga
    848: 23,  # Conference League
    13: 24,   # Copa Libertadores
    12: 25,   # CAF Champions League
    17: 26,   # AFC Champions League
    1: 27,    # World Cup
    4: 28,    # Euro Championship
    9: 29,    # Copa America
    6: 30,    # Africa Cup of Nations
}

# Fallback to sample data if API fails or no key provided
USE_SAMPLE_DATA_FALLBACK = True
