"""
Team name alias matching for the Chrome Extension.
Maps common betting site team name variations to API-Football team IDs.
Uses fuzzy matching as fallback, then dynamic API search for unknown teams.
Discovered teams are cached to disk so they persist across restarts.
"""

import re
import os
import json
from difflib import SequenceMatcher

# Path for persistent cache of dynamically discovered teams
_CACHE_FILE = os.path.join(os.path.dirname(__file__), "team_cache.json")

# API-Football team ID -> canonical name + aliases
# Covers: Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Kenyan PL, + top continental teams
TEAM_ALIASES = {
    # === PREMIER LEAGUE ===
    33: {"name": "Manchester United", "aliases": ["Man Utd", "Man United", "Manchester Utd", "MUFC", "Man. United", "Man. Utd"]},
    40: {"name": "Liverpool", "aliases": ["Liverpool FC", "LFC", "The Reds"]},
    50: {"name": "Manchester City", "aliases": ["Man City", "MCFC", "Man. City", "Manchester C"]},
    42: {"name": "Arsenal", "aliases": ["Arsenal FC", "AFC", "The Gunners"]},
    49: {"name": "Chelsea", "aliases": ["Chelsea FC", "CFC", "The Blues"]},
    47: {"name": "Tottenham", "aliases": ["Tottenham Hotspur", "Spurs", "Tottenham H", "THFC"]},
    66: {"name": "Aston Villa", "aliases": ["Villa", "Aston V", "AVFC"]},
    34: {"name": "Newcastle", "aliases": ["Newcastle United", "Newcastle Utd", "NUFC", "The Magpies"]},
    51: {"name": "Brighton", "aliases": ["Brighton & Hove Albion", "Brighton Hove", "BHAFC", "Brighton & Hove"]},
    48: {"name": "West Ham", "aliases": ["West Ham United", "West Ham Utd", "WHUFC", "The Hammers"]},
    52: {"name": "Crystal Palace", "aliases": ["C. Palace", "CPFC", "Palace"]},
    35: {"name": "Bournemouth", "aliases": ["AFC Bournemouth", "Bmouth", "AFCB"]},
    36: {"name": "Fulham", "aliases": ["Fulham FC", "FFC", "The Cottagers"]},
    39: {"name": "Wolves", "aliases": ["Wolverhampton", "Wolverhampton Wanderers", "Wolverhampton W", "WWFC"]},
    45: {"name": "Everton", "aliases": ["Everton FC", "EFC", "The Toffees"]},
    55: {"name": "Brentford", "aliases": ["Brentford FC", "BFC", "The Bees"]},
    65: {"name": "Nottingham Forest", "aliases": ["Nott'm Forest", "Nottingham F", "NFFC", "Forest", "Notts Forest"]},
    46: {"name": "Leicester", "aliases": ["Leicester City", "Leicester C", "LCFC", "The Foxes"]},
    57: {"name": "Ipswich", "aliases": ["Ipswich Town", "Ipswich T", "ITFC"]},
    41: {"name": "Southampton", "aliases": ["Southampton FC", "SFC", "The Saints", "Soton"]},

    # === LA LIGA ===
    529: {"name": "Barcelona", "aliases": ["FC Barcelona", "Barca", "FCB", "Barça"]},
    541: {"name": "Real Madrid", "aliases": ["R. Madrid", "RMA", "Los Blancos", "Real Madrid CF"]},
    530: {"name": "Atletico Madrid", "aliases": ["Atl. Madrid", "Atletico", "ATM", "Atlético Madrid", "Atlético de Madrid"]},
    548: {"name": "Real Sociedad", "aliases": ["R. Sociedad", "La Real", "Real Sociedad B"]},
    543: {"name": "Real Betis", "aliases": ["Betis", "R. Betis", "Real Betis Balompié"]},
    533: {"name": "Villarreal", "aliases": ["Villarreal CF", "The Yellow Submarine", "VCF"]},
    531: {"name": "Athletic Bilbao", "aliases": ["Athletic Club", "Ath Bilbao", "Athletic", "Ath. Bilbao"]},
    727: {"name": "Osasuna", "aliases": ["CA Osasuna", "Club Atletico Osasuna"]},
    536: {"name": "Sevilla", "aliases": ["Sevilla FC", "SFC"]},
    532: {"name": "Valencia", "aliases": ["Valencia CF", "VCF"]},
    546: {"name": "Getafe", "aliases": ["Getafe CF"]},
    547: {"name": "Girona", "aliases": ["Girona FC"]},
    537: {"name": "Celta Vigo", "aliases": ["RC Celta", "Celta", "RC Celta de Vigo"]},
    534: {"name": "Las Palmas", "aliases": ["UD Las Palmas"]},
    539: {"name": "Espanyol", "aliases": ["RCD Espanyol"]},
    540: {"name": "Real Valladolid", "aliases": ["Valladolid", "R. Valladolid"]},
    728: {"name": "Rayo Vallecano", "aliases": ["Rayo", "Rayo Vallecano de Madrid"]},
    798: {"name": "Mallorca", "aliases": ["RCD Mallorca", "Real Mallorca"]},
    538: {"name": "Deportivo Alaves", "aliases": ["Alaves", "Alavés", "Deportivo Alavés"]},
    544: {"name": "Leganes", "aliases": ["CD Leganes", "CD Leganés"]},

    # === BUNDESLIGA ===
    157: {"name": "Bayern Munich", "aliases": ["Bayern", "FC Bayern", "FC Bayern Munich", "Bayern München", "FCB", "FC Bayern München"]},
    165: {"name": "Borussia Dortmund", "aliases": ["Dortmund", "BVB", "B. Dortmund"]},
    173: {"name": "RB Leipzig", "aliases": ["Leipzig", "RBL", "Red Bull Leipzig"]},
    168: {"name": "Bayer Leverkusen", "aliases": ["Leverkusen", "B. Leverkusen", "Bayer 04"]},
    169: {"name": "Eintracht Frankfurt", "aliases": ["Frankfurt", "E. Frankfurt", "SGE"]},
    172: {"name": "VfB Stuttgart", "aliases": ["Stuttgart", "VfB"]},
    160: {"name": "SC Freiburg", "aliases": ["Freiburg", "SCF"]},
    161: {"name": "VfL Wolfsburg", "aliases": ["Wolfsburg", "VfL"]},
    170: {"name": "FC Augsburg", "aliases": ["Augsburg", "FCA"]},
    163: {"name": "Borussia Monchengladbach", "aliases": ["Gladbach", "B. Monchengladbach", "BMG", "Mönchengladbach", "Borussia M'gladbach"]},
    164: {"name": "Werder Bremen", "aliases": ["Bremen", "SV Werder Bremen"]},
    162: {"name": "1. FC Union Berlin", "aliases": ["Union Berlin", "FC Union Berlin"]},
    167: {"name": "1899 Hoffenheim", "aliases": ["Hoffenheim", "TSG Hoffenheim", "TSG 1899"]},
    176: {"name": "VfL Bochum", "aliases": ["Bochum"]},
    159: {"name": "Hertha Berlin", "aliases": ["Hertha BSC", "Hertha"]},
    171: {"name": "1. FC Heidenheim", "aliases": ["Heidenheim", "FC Heidenheim"]},
    174: {"name": "FC St. Pauli", "aliases": ["St. Pauli", "FC Sankt Pauli"]},
    166: {"name": "Holstein Kiel", "aliases": ["Kiel", "KSV Holstein"]},

    # === SERIE A ===
    489: {"name": "AC Milan", "aliases": ["Milan", "ACM", "Rossoneri"]},
    505: {"name": "Inter Milan", "aliases": ["Inter", "FC Internazionale", "Inter FC", "Internazionale"]},
    496: {"name": "Juventus", "aliases": ["Juve", "Juventus FC", "JFC"]},
    492: {"name": "Napoli", "aliases": ["SSC Napoli", "Napoli FC"]},
    499: {"name": "Atalanta", "aliases": ["Atalanta BC", "Atalanta Bergamo"]},
    497: {"name": "AS Roma", "aliases": ["Roma", "AS Roma FC"]},
    487: {"name": "Lazio", "aliases": ["SS Lazio", "Lazio Roma"]},
    502: {"name": "Fiorentina", "aliases": ["ACF Fiorentina", "Viola"]},
    500: {"name": "Bologna", "aliases": ["Bologna FC", "BFC"]},
    503: {"name": "Torino", "aliases": ["Torino FC", "Toro"]},
    504: {"name": "Udinese", "aliases": ["Udinese Calcio"]},
    488: {"name": "Sassuolo", "aliases": ["US Sassuolo"]},
    495: {"name": "Genoa", "aliases": ["Genoa CFC"]},
    490: {"name": "Cagliari", "aliases": ["Cagliari Calcio"]},
    494: {"name": "Empoli", "aliases": ["Empoli FC"]},
    498: {"name": "Sampdoria", "aliases": ["UC Sampdoria"]},
    501: {"name": "Hellas Verona", "aliases": ["Verona", "H. Verona"]},
    867: {"name": "Lecce", "aliases": ["US Lecce"]},
    514: {"name": "Monza", "aliases": ["AC Monza"]},
    515: {"name": "Salernitana", "aliases": ["US Salernitana"]},

    # === LIGUE 1 ===
    85: {"name": "Paris Saint-Germain", "aliases": ["PSG", "Paris SG", "Paris Saint Germain", "Paris"]},
    81: {"name": "Marseille", "aliases": ["Olympique Marseille", "OM", "Olympique de Marseille"]},
    80: {"name": "Lyon", "aliases": ["Olympique Lyon", "Olympique Lyonnais", "OL"]},
    79: {"name": "Lille", "aliases": ["LOSC Lille", "LOSC", "Lille OSC"]},
    91: {"name": "Monaco", "aliases": ["AS Monaco", "ASM", "Monaco FC"]},
    94: {"name": "Rennes", "aliases": ["Stade Rennais", "Stade Rennais FC"]},
    82: {"name": "Strasbourg", "aliases": ["RC Strasbourg", "Racing Strasbourg"]},
    93: {"name": "Reims", "aliases": ["Stade de Reims"]},
    83: {"name": "Nantes", "aliases": ["FC Nantes"]},
    84: {"name": "Nice", "aliases": ["OGC Nice", "OG Nice"]},
    78: {"name": "Bordeaux", "aliases": ["Girondins de Bordeaux", "Girondins"]},
    95: {"name": "Montpellier", "aliases": ["Montpellier HSC", "MHSC"]},
    96: {"name": "Lens", "aliases": ["RC Lens", "Racing Lens"]},
    97: {"name": "Lorient", "aliases": ["FC Lorient"]},
    98: {"name": "Toulouse", "aliases": ["Toulouse FC", "TFC"]},
    99: {"name": "Brest", "aliases": ["Stade Brestois", "Stade Brestois 29"]},
    100: {"name": "Angers", "aliases": ["Angers SCO", "SCO Angers"]},
    101: {"name": "Le Havre", "aliases": ["Le Havre AC", "HAC"]},
    102: {"name": "Auxerre", "aliases": ["AJ Auxerre"]},
    103: {"name": "Saint-Etienne", "aliases": ["St Etienne", "AS Saint-Étienne", "ASSE", "St-Etienne"]},

    # === KENYAN PREMIER LEAGUE ===
    2370: {"name": "Gor Mahia", "aliases": ["Gor Mahia FC", "K'Ogalo"]},
    2371: {"name": "AFC Leopards", "aliases": ["Leopards", "AFC Leopards FC", "Ingwe"]},
    2372: {"name": "Tusker", "aliases": ["Tusker FC"]},
    2373: {"name": "KCB", "aliases": ["KCB FC", "Kenya Commercial Bank"]},
    2374: {"name": "Bandari", "aliases": ["Bandari FC"]},
    2375: {"name": "Kariobangi Sharks", "aliases": ["K. Sharks", "Sharks"]},
    2376: {"name": "Ulinzi Stars", "aliases": ["Ulinzi Stars FC", "Ulinzi"]},
    2377: {"name": "Kakamega Homeboyz", "aliases": ["Homeboyz", "K. Homeboyz"]},
    2378: {"name": "Sofapaka", "aliases": ["Sofapaka FC"]},
    2379: {"name": "Posta Rangers", "aliases": ["Posta Rangers FC"]},
    2380: {"name": "Mathare United", "aliases": ["Mathare Utd", "Mathare"]},
    2381: {"name": "Wazito", "aliases": ["Wazito FC"]},
    2382: {"name": "Nzoia Sugar", "aliases": ["Nzoia Sugar FC", "Nzoia"]},
    2383: {"name": "Bidco United", "aliases": ["Bidco Utd", "Bidco"]},
    2384: {"name": "Nairobi City Stars", "aliases": ["City Stars", "N. City Stars"]},
    2385: {"name": "Police FC", "aliases": ["Kenya Police", "Police"]},
    2386: {"name": "Talanta", "aliases": ["Talanta FC"]},
    2387: {"name": "Murang'a Seal", "aliases": ["Murang'a Seal FC", "Muranga Seal"]},

    # === UEFA CHAMPIONS LEAGUE EXTRAS ===
    211: {"name": "Benfica", "aliases": ["SL Benfica", "Sport Lisboa e Benfica"]},
    212: {"name": "FC Porto", "aliases": ["Porto", "FCP"]},
    194: {"name": "Ajax", "aliases": ["AFC Ajax", "Ajax Amsterdam"]},
    197: {"name": "PSV", "aliases": ["PSV Eindhoven"]},
    209: {"name": "Sporting CP", "aliases": ["Sporting Lisbon", "Sporting", "SCP"]},
    192: {"name": "Feyenoord", "aliases": ["Feyenoord Rotterdam"]},
    228: {"name": "Celtic", "aliases": ["Celtic FC", "Celtic Glasgow"]},
    229: {"name": "Rangers", "aliases": ["Rangers FC", "Glasgow Rangers"]},

    # === MLS (USA) ===
    1596: {"name": "Inter Miami", "aliases": ["Inter Miami CF", "Miami"]},
    1600: {"name": "LAFC", "aliases": ["Los Angeles FC"]},
    1599: {"name": "LA Galaxy", "aliases": ["Los Angeles Galaxy", "Galaxy"]},
    1602: {"name": "New York Red Bulls", "aliases": ["NY Red Bulls", "NYRB"]},
    1604: {"name": "New York City FC", "aliases": ["NYCFC", "NY City"]},
    1601: {"name": "Atlanta United", "aliases": ["Atlanta Utd", "Atlanta United FC"]},
    1605: {"name": "Seattle Sounders", "aliases": ["Seattle Sounders FC", "Sounders"]},
    1609: {"name": "Portland Timbers", "aliases": ["Portland"]},
    1608: {"name": "Philadelphia Union", "aliases": ["Philly Union", "Philadelphia"]},
    1607: {"name": "Columbus Crew", "aliases": ["Columbus", "Crew"]},
}

# ============================================================
# Persistent cache for dynamically discovered teams
# ============================================================
_DYNAMIC_CACHE = {}  # lowercased search term -> {"id": int, "name": str}


def _load_dynamic_cache():
    """Load previously discovered teams from disk."""
    global _DYNAMIC_CACHE
    try:
        if os.path.exists(_CACHE_FILE):
            with open(_CACHE_FILE, "r", encoding="utf-8") as f:
                _DYNAMIC_CACHE = json.load(f)
            print(f"[TeamAliases] Loaded {len(_DYNAMIC_CACHE)} cached team lookups from {_CACHE_FILE}")
    except Exception as e:
        print(f"[TeamAliases] Failed to load team cache: {e}")
        _DYNAMIC_CACHE = {}


def _save_dynamic_cache():
    """Save discovered teams to disk."""
    try:
        with open(_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(_DYNAMIC_CACHE, f, indent=2, ensure_ascii=False)
        print(f"[TeamAliases] Saved {len(_DYNAMIC_CACHE)} cached team lookups to {_CACHE_FILE}")
    except Exception as e:
        print(f"[TeamAliases] Failed to save team cache: {e}")


def _add_to_dynamic_cache(search_term: str, team_id: int, team_name: str):
    """Add a discovered team to the persistent cache and in-memory lookup."""
    lower = search_term.lower().strip()
    _DYNAMIC_CACHE[lower] = {"id": team_id, "name": team_name}

    # Also add to in-memory reverse lookup for instant future matches
    _REVERSE_LOOKUP[lower] = team_id

    # Add the canonical name too if not already present
    if team_name.lower() not in _REVERSE_LOOKUP:
        _REVERSE_LOOKUP[team_name.lower()] = team_id

    # Add to TEAM_ALIASES if this is a brand new team
    if team_id not in TEAM_ALIASES:
        TEAM_ALIASES[team_id] = {"name": team_name, "aliases": [search_term]}
        print(f"[TeamAliases] Added new team to aliases: {team_id} = {team_name}")
    elif lower not in [a.lower() for a in TEAM_ALIASES[team_id].get("aliases", [])]:
        # Add the search term as a new alias for existing team
        TEAM_ALIASES[team_id]["aliases"].append(search_term)

    _save_dynamic_cache()


# ============================================================
# Build reverse lookup: lowercased name/alias -> team_id
# ============================================================
_REVERSE_LOOKUP = {}


def _build_reverse_lookup():
    for team_id, info in TEAM_ALIASES.items():
        _REVERSE_LOOKUP[info["name"].lower()] = team_id
        for alias in info.get("aliases", []):
            _REVERSE_LOOKUP[alias.lower()] = team_id


_build_reverse_lookup()
_load_dynamic_cache()

# Also register all dynamic cache entries into reverse lookup
for _term, _info in _DYNAMIC_CACHE.items():
    _REVERSE_LOOKUP[_term] = _info["id"]
    if _info["id"] not in TEAM_ALIASES:
        TEAM_ALIASES[_info["id"]] = {"name": _info["name"], "aliases": [_term]}


def _normalize_name(name: str) -> str:
    """Normalize team name for matching: lowercase, strip FC/CF/SC, remove punctuation."""
    name = name.lower().strip()
    # Remove common suffixes/prefixes
    for suffix in [" fc", " cf", " sc", " ac", " bc", " afc", " ssc"]:
        if name.endswith(suffix):
            name = name[:-len(suffix)].strip()
    for prefix in ["fc ", "cf ", "sc ", "ac "]:
        if name.startswith(prefix):
            name = name[len(prefix):].strip()
    # Remove punctuation
    name = re.sub(r'[.\-\'`]', '', name)
    # Collapse whitespace
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def lookup_team(name: str, competition_hint: str = "") -> dict | None:
    """
    Look up a team by name (static only). Returns dict with id, name, confidence or None.
    1. Exact alias match
    2. Normalized match
    3. Fuzzy match (SequenceMatcher)
    """
    if not name or not name.strip():
        return None

    clean = name.strip()

    # 1. Exact match in reverse lookup (includes dynamic cache entries)
    lower = clean.lower()
    if lower in _REVERSE_LOOKUP:
        tid = _REVERSE_LOOKUP[lower]
        tname = TEAM_ALIASES.get(tid, {}).get("name", clean)
        return {"id": tid, "name": tname, "confidence": 1.0}

    # 2. Normalized match
    normalized = _normalize_name(clean)
    for team_id, info in TEAM_ALIASES.items():
        if _normalize_name(info["name"]) == normalized:
            return {"id": team_id, "name": info["name"], "confidence": 0.95}
        for alias in info.get("aliases", []):
            if _normalize_name(alias) == normalized:
                return {"id": team_id, "name": info["name"], "confidence": 0.95}

    # 3. Fuzzy match
    best_match = None
    best_score = 0.0
    for team_id, info in TEAM_ALIASES.items():
        candidates = [info["name"]] + info.get("aliases", [])
        for candidate in candidates:
            score = SequenceMatcher(None, normalized, _normalize_name(candidate)).ratio()
            if score > best_score:
                best_score = score
                best_match = {"id": team_id, "name": info["name"], "confidence": round(score, 3)}

    if best_match and best_score >= 0.82:
        return best_match

    return None


def lookup_teams(teams: list, competition_hint: str = "") -> list:
    """Look up multiple teams (static only). Returns list of results (dict or None per team)."""
    return [lookup_team(t.get("name", ""), competition_hint) for t in teams]


# ============================================================
# Async dynamic lookup - searches API-Football when static fails
# ============================================================

def _is_womens_team(name: str) -> bool:
    """Check if a team name suggests it's a women's/youth team."""
    lower = name.lower()
    markers = [" w", " women", " femm", " fem", " ladies", " u19", " u21", " u23", " ii", " b ", " youth"]
    for marker in markers:
        if lower.endswith(marker) or f"{marker} " in lower or f"{marker})" in lower:
            return True
    return False


async def _search_api_teams(search_term: str):
    """Search API-Football for teams, filtering women's/youth teams."""
    from football_api import search_team_by_name

    api_results = await search_team_by_name(search_term)
    if not api_results:
        return []

    # Filter out national teams
    club_results = [t for t in api_results if not t.get("national", False)]
    if not club_results:
        club_results = api_results

    # Filter out women's/youth teams
    mens_teams = [t for t in club_results if not _is_womens_team(t.get("name", ""))]
    return mens_teams


def _pick_best_match(teams: list, search_name: str, min_score: float = 0.5):
    """Find the best matching team from API results."""
    normalized_input = _normalize_name(search_name)
    best = None
    best_score = 0.0

    for team in teams:
        api_name = team.get("name", "")
        norm_api = _normalize_name(api_name)
        score = SequenceMatcher(None, normalized_input, norm_api).ratio()

        # Boost for exact match after normalization
        if normalized_input == norm_api:
            score = 1.0
        # Boost score for substring matches, weighted by name length coverage
        elif normalized_input in norm_api or norm_api in normalized_input:
            shorter = min(len(normalized_input), len(norm_api))
            longer = max(len(normalized_input), len(norm_api))
            coverage = shorter / longer if longer > 0 else 0
            # Higher coverage = higher boost (range 0.85-0.95)
            score = max(score, 0.85 + (coverage * 0.10))

        if score > best_score:
            best_score = score
            best = team

    if best and best_score >= min_score:
        return best, best_score
    return None, best_score


async def lookup_team_dynamic(name: str, competition_hint: str = "") -> dict | None:
    """
    Look up a team by name. First tries static aliases, then searches
    API-Football /teams?search={name} for unknown teams.
    If the full name returns 0 results, retries with partial name
    (e.g. "Red Star Belgrade" -> "Red Star", "Slavia Prague" -> "Slavia").
    Discovered teams are cached permanently to disk.
    """
    # 1. Try static/cached lookup first (instant, no API call)
    result = lookup_team(name, competition_hint)
    if result:
        return result

    # 2. Dynamic search via API-Football
    if not name or len(name.strip()) < 3:
        return None

    clean = name.strip()
    print(f"[TeamAliases] Static lookup failed for '{clean}', trying API search...")

    try:
        # Try full name first
        teams = await _search_api_teams(clean)
        best, score = _pick_best_match(teams, clean) if teams else (None, 0)

        # If no results or poor match, try partial name (first word if multi-word)
        if not best or score < 0.5:
            parts = clean.split()
            if len(parts) >= 2:
                # Try first word (e.g., "Red" from "Red Star Belgrade" - too short)
                # Try first two words for 3+ word names
                partial = parts[0] if len(parts[0]) >= 5 else " ".join(parts[:2])
                if len(partial) >= 3 and partial.lower() != clean.lower():
                    print(f"[TeamAliases] Full name got no/poor results, trying partial: '{partial}'")
                    partial_teams = await _search_api_teams(partial)
                    if partial_teams:
                        p_best, p_score = _pick_best_match(partial_teams, clean, min_score=0.4)
                        if p_best and (not best or p_score > score):
                            best, score = p_best, p_score

                # Also try last word if it's a city name (e.g., "Belgrade", "Prague")
                last_part = parts[-1]
                if len(last_part) >= 4 and last_part.lower() != clean.lower():
                    print(f"[TeamAliases] Also trying city name: '{last_part}'")
                    city_teams = await _search_api_teams(last_part)
                    if city_teams:
                        c_best, c_score = _pick_best_match(city_teams, clean, min_score=0.4)
                        if c_best and (not best or c_score > score):
                            best, score = c_best, c_score

        # If still no match, try truncated name for spelling variations
        # e.g., "Olympiacos" -> "Olympia" finds "Olympiakos"
        if (not best or score < 0.4) and len(clean) >= 6:
            # Try progressively shorter truncations
            for trim_len in range(2, min(5, len(clean) - 4)):
                truncated = clean[:len(clean) - trim_len]
                if len(truncated) < 4:
                    break
                print(f"[TeamAliases] Trying truncated search: '{truncated}'")
                trunc_teams = await _search_api_teams(truncated)
                if trunc_teams:
                    t_best, t_score = _pick_best_match(trunc_teams, clean, min_score=0.4)
                    if t_best and (not best or t_score > score):
                        best, score = t_best, t_score
                        break  # Found a match, stop truncating

        if best and score >= 0.4:
            team_id = best["id"]
            team_name = best["name"]

            print(f"[TeamAliases] API search found: '{clean}' -> {team_id} ({team_name}) [score={score:.2f}]")

            # Cache this discovery permanently
            _add_to_dynamic_cache(clean, team_id, team_name)

            return {"id": team_id, "name": team_name, "confidence": round(min(score, 0.95), 3)}

        print(f"[TeamAliases] API search: no good match for '{clean}' (best score={score:.2f})")

    except Exception as e:
        print(f"[TeamAliases] Dynamic lookup error: {type(e).__name__}: {e}")

    return None


async def lookup_teams_dynamic(teams: list, competition_hint: str = "") -> list:
    """
    Look up multiple teams with dynamic API fallback.
    First tries all teams with static lookup. For any that fail,
    falls back to dynamic API search.
    """
    results = []
    for t in teams:
        name = t.get("name", "")
        result = await lookup_team_dynamic(name, competition_hint)
        results.append(result)
    return results
