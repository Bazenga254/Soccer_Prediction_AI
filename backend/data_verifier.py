"""
AI-powered data verification layer.
Uses ChatGPT (OpenAI GPT-4o-mini) with web search to cross-check API-Football
data against real-time web information. Caches verified results in SQLite so
all users benefit from a single verification per match.
"""

import asyncio
import json
import logging
import os
import random
import sqlite3
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import config
import football_api

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "verified_cache.db")

# Cache TTLs (seconds)
TTL_MATCH = 3 * 3600       # 3 hours – comprehensive match-level data
TTL_FALLBACK = 3600         # 1 hour – fallback data gets re-verified sooner

MAX_RETRIES = 2
RETRY_DELAYS = [3, 8]

# ── Verification prompt ─────────────────────────────────────────────────
VERIFY_SYSTEM = """You are a football/soccer data verification assistant. You have web search access.
Your job is to verify and correct football team data by searching for the latest information online.
Always return ONLY valid JSON with no markdown fences or extra text."""

VERIFY_MATCH_PROMPT = """Verify the following football data for an upcoming match. Search the web for the LATEST information.

=== MATCH ===
{team_a_name} vs {team_b_name}
Competition: {competition}
Date: {today}

=== TEAM A: {team_a_name} ===
Coach from our database: {coach_a_name}
Top players from our database:
{players_a_list}
Injuries from our database:
{injuries_a_list}

=== TEAM B: {team_b_name} ===
Coach from our database: {coach_b_name}
Top players from our database:
{players_b_list}
Injuries from our database:
{injuries_b_list}

=== TASK ===
Search the web and verify for EACH team:
1. Is the coach still the current head coach? If fired/replaced, who is the new coach?
2. Are these players still at this club? Flag any who transferred out this season.
3. What are the CURRENT injuries and suspensions? Only include players actually injured/suspended NOW.
4. Any important new signings this season?
5. What formation has the team been using recently?

Return this EXACT JSON structure:
{{"team_a": {{"coach": {{"name": "Current coach full name", "nationality": "Nationality", "verified": true}}, "formation": "4-3-3", "injuries": [{{"player": "Name", "reason": "Injury type or Suspended", "status": "out"}}], "transfers_out": [{{"player": "Name", "to": "New Club", "date": "Mon YYYY"}}], "transfers_in": [{{"player": "Name", "from": "Previous Club", "position": "FWD/MID/DEF/GK", "date": "Mon YYYY"}}], "player_corrections": [{{"name": "Name", "action": "remove", "reason": "Transferred to Club in Mon YYYY"}}]}}, "team_b": {{"coach": {{"name": "Current coach full name", "nationality": "Nationality", "verified": true}}, "formation": "4-2-3-1", "injuries": [{{"player": "Name", "reason": "Injury type or Suspended", "status": "out"}}], "transfers_out": [{{"player": "Name", "to": "New Club", "date": "Mon YYYY"}}], "transfers_in": [{{"player": "Name", "from": "Previous Club", "position": "FWD/MID/DEF/GK", "date": "Mon YYYY"}}], "player_corrections": [{{"name": "Name", "action": "remove", "reason": "Transferred to Club in Mon YYYY"}}]}}}}

RULES:
- Only include CURRENT injuries/suspensions (players who will miss upcoming matches).
- Only include transfers_out/player_corrections for players from OUR lists above.
- transfers_in = significant first-team signings this season only.
- Max 10 injuries per team.
- Return ONLY valid JSON, nothing else."""


# ── SQLite cache ─────────────────────────────────────────────────────────

def init_verified_cache():
    """Create the verified_data table. Called once at startup."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS verified_data (
            cache_key   TEXT PRIMARY KEY,
            data_json   TEXT NOT NULL,
            verified_at REAL NOT NULL,
            expires_at  REAL NOT NULL
        )
    """)
    conn.execute("DELETE FROM verified_data WHERE expires_at < ?", (time.time(),))
    conn.commit()
    conn.close()
    logger.info("[DataVerifier] Cache initialized (verified_cache.db)")


def _cache_get(key: str) -> Optional[dict]:
    """Retrieve cached verified data if not expired."""
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute(
            "SELECT data_json FROM verified_data WHERE cache_key = ? AND expires_at > ?",
            (key, time.time()),
        ).fetchone()
        conn.close()
        if row:
            return json.loads(row[0])
    except Exception as e:
        logger.warning(f"[DataVerifier] Cache read error: {e}")
    return None


def _cache_set(key: str, data: dict, ttl: int):
    """Store verified data with expiration."""
    now = time.time()
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            "INSERT OR REPLACE INTO verified_data (cache_key, data_json, verified_at, expires_at) VALUES (?, ?, ?, ?)",
            (key, json.dumps(data), now, now + ttl),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning(f"[DataVerifier] Cache write error: {e}")


def _cleanup_expired():
    """Remove expired entries."""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM verified_data WHERE expires_at < ?", (time.time(),))
        conn.commit()
        conn.close()
    except Exception:
        pass


# ── ChatGPT verification with web search ─────────────────────────────────

async def _verify_with_chatgpt(
    team_a_name: str,
    team_b_name: str,
    competition: str,
    coach_a_name: str,
    coach_b_name: str,
    players_a: List[dict],
    players_b: List[dict],
    injuries_a: List[dict],
    injuries_b: List[dict],
) -> Optional[dict]:
    """Call ChatGPT (GPT-4o-mini) with web search to verify match data."""
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        logger.warning("[DataVerifier] No OPENAI_API_KEY, skipping verification")
        return None

    from openai import OpenAI

    client = OpenAI(api_key=api_key)

    # Format player lists for the prompt
    def fmt_players(players):
        if not players:
            return "No player data available"
        lines = []
        for p in players[:10]:
            name = p.get("name", "Unknown")
            pos = p.get("position", "")
            goals = p.get("goals", 0)
            assists = p.get("assists", 0)
            lines.append(f"- {name} ({pos}) - {goals}G, {assists}A")
        return "\n".join(lines) or "No player data available"

    def fmt_injuries(injuries):
        if not injuries:
            return "No injuries reported"
        # Deduplicate injuries by player name
        seen = set()
        lines = []
        for inj in injuries:
            player = inj.get("player", "Unknown")
            if player.lower() in seen:
                continue
            seen.add(player.lower())
            reason = inj.get("reason", "Unknown")
            lines.append(f"- {player}: {reason}")
            if len(lines) >= 10:
                break
        return "\n".join(lines) or "No injuries reported"

    comp_name = config.COMPETITION_NAMES.get(competition, competition)
    today = datetime.utcnow().strftime("%Y-%m-%d")

    prompt = VERIFY_MATCH_PROMPT.format(
        team_a_name=team_a_name,
        team_b_name=team_b_name,
        competition=comp_name,
        today=today,
        coach_a_name=coach_a_name or "Unknown",
        coach_b_name=coach_b_name or "Unknown",
        players_a_list=fmt_players(players_a),
        players_b_list=fmt_players(players_b),
        injuries_a_list=fmt_injuries(injuries_a),
        injuries_b_list=fmt_injuries(injuries_b),
    )

    for attempt in range(MAX_RETRIES):
        try:
            # Use OpenAI Responses API with web search tool
            response = client.responses.create(
                model="gpt-4o-mini",
                tools=[{"type": "web_search_preview"}],
                input=[
                    {"role": "system", "content": VERIFY_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
            )

            # Extract text output from the response
            text = ""
            for item in response.output:
                if item.type == "message":
                    for content in item.content:
                        if content.type == "output_text":
                            text = content.text
                            break

            text = text.strip()

            # Strip markdown fences if present
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

            data = json.loads(text)

            # Validate expected structure
            if "team_a" not in data or "team_b" not in data:
                logger.warning("[DataVerifier] Invalid response structure from ChatGPT")
                return None

            logger.info(
                f"[DataVerifier] VERIFIED {team_a_name} vs {team_b_name}: "
                f"coach_a={data['team_a'].get('coach', {}).get('name')}, "
                f"coach_b={data['team_b'].get('coach', {}).get('name')}, "
                f"injuries_a={len(data['team_a'].get('injuries', []))}, "
                f"injuries_b={len(data['team_b'].get('injuries', []))}, "
                f"transfers_out_a={len(data['team_a'].get('transfers_out', []))}, "
                f"transfers_out_b={len(data['team_b'].get('transfers_out', []))}"
            )
            return data

        except Exception as e:
            error_str = str(e)
            if ("429" in error_str or "rate" in error_str.lower()) and attempt < MAX_RETRIES - 1:
                delay = RETRY_DELAYS[attempt]
                logger.warning(f"[DataVerifier] Rate limited, retrying in {delay}s (attempt {attempt + 1})")
                await asyncio.sleep(delay)
                continue
            logger.error(f"[DataVerifier] ChatGPT verification failed: {e}")
            return None

    return None


# ── Public API ───────────────────────────────────────────────────────────

async def get_verified_match_data(
    team_a_id: int,
    team_a_name: str,
    team_b_id: int,
    team_b_name: str,
    competition: str,
    league_id: int,
    api_players_a: Optional[List[dict]] = None,
    api_players_b: Optional[List[dict]] = None,
) -> Optional[dict]:
    """
    One-stop verification for a match. Returns verified coaches, injuries,
    formations, player corrections, and transfer info for both teams.

    Results are cached in SQLite so subsequent users get instant results.
    """
    lo, hi = min(team_a_id, team_b_id), max(team_a_id, team_b_id)
    cache_key = f"match_{lo}_{hi}"

    # 1. Check persistent cache
    cached = _cache_get(cache_key)
    if cached:
        logger.info(f"[DataVerifier] Cache hit for {team_a_name} vs {team_b_name}")
        return cached

    logger.info(f"[DataVerifier] Verifying {team_a_name} vs {team_b_name}...")

    # 2. Fetch current raw data from API-Football (coaches, injuries)
    try:
        raw_coach_a, raw_coach_b, raw_injuries_a, raw_injuries_b = await _fetch_raw_data(
            team_a_id, team_b_id, league_id
        )
    except Exception as e:
        logger.error(f"[DataVerifier] Failed to fetch raw data: {e}")
        raw_coach_a, raw_coach_b = None, None
        raw_injuries_a, raw_injuries_b = [], []

    coach_a_name_str = raw_coach_a.get("name", "Unknown") if raw_coach_a else "Unknown"
    coach_b_name_str = raw_coach_b.get("name", "Unknown") if raw_coach_b else "Unknown"

    # 3. Send to ChatGPT with web search for verification
    verified = await _verify_with_chatgpt(
        team_a_name=team_a_name,
        team_b_name=team_b_name,
        competition=competition,
        coach_a_name=coach_a_name_str,
        coach_b_name=coach_b_name_str,
        players_a=api_players_a or [],
        players_b=api_players_b or [],
        injuries_a=raw_injuries_a,
        injuries_b=raw_injuries_b,
    )

    if not verified:
        # Verification failed – fall back to raw API data
        logger.warning(f"[DataVerifier] Verification failed, using raw API data for {team_a_name} vs {team_b_name}")
        fallback = _build_fallback(raw_coach_a, raw_coach_b, raw_injuries_a, raw_injuries_b)
        _cache_set(cache_key, fallback, TTL_FALLBACK)
        return fallback

    # 4. Build result in canonical format
    result = _build_verified_result(verified, raw_coach_a, raw_coach_b)

    # 5. Cache in SQLite
    _cache_set(cache_key, result, TTL_MATCH)

    # Periodically clean up
    if random.random() < 0.01:
        _cleanup_expired()

    return result


async def _fetch_raw_data(
    team_a_id: int, team_b_id: int, league_id: int
) -> Tuple[Optional[dict], Optional[dict], List[dict], List[dict]]:
    """Fetch raw coach and injury data from API-Football."""
    coach_a, coach_b, injuries_a, injuries_b = await asyncio.gather(
        football_api.fetch_coach(team_a_id),
        football_api.fetch_coach(team_b_id),
        football_api.fetch_injuries(team_a_id, league_id),
        football_api.fetch_injuries(team_b_id, league_id),
    )
    return coach_a, coach_b, injuries_a or [], injuries_b or []


def _deduplicate_injuries(injuries: List[dict]) -> List[dict]:
    """Remove duplicate injury entries (API-Football returns historical records)."""
    seen = set()
    unique = []
    for inj in injuries:
        player = (inj.get("player") or "").lower().strip()
        if player and player not in seen:
            seen.add(player)
            unique.append(inj)
    return unique


def _build_fallback(
    raw_coach_a: Optional[dict],
    raw_coach_b: Optional[dict],
    raw_injuries_a: List[dict],
    raw_injuries_b: List[dict],
) -> dict:
    """Build a result dict from raw API-Football data (unverified)."""
    return {
        "team_a": {
            "coach": raw_coach_a or {"name": "Unknown", "photo": None, "nationality": None, "age": None},
            "injuries": _deduplicate_injuries(raw_injuries_a),
            "formation": None,
            "transfers_out": [],
            "transfers_in": [],
            "player_corrections": [],
        },
        "team_b": {
            "coach": raw_coach_b or {"name": "Unknown", "photo": None, "nationality": None, "age": None},
            "injuries": _deduplicate_injuries(raw_injuries_b),
            "formation": None,
            "transfers_out": [],
            "transfers_in": [],
            "player_corrections": [],
        },
        "verified_at": datetime.utcnow().isoformat(),
        "source": "api_fallback",
    }


def _build_verified_result(
    verified: dict,
    raw_coach_a: Optional[dict],
    raw_coach_b: Optional[dict],
) -> dict:
    """Merge ChatGPT-verified data into the canonical response format."""

    def build_team(v_team: dict, raw_coach: Optional[dict]) -> dict:
        v_coach = v_team.get("coach", {})
        coach = {
            "name": v_coach.get("name", raw_coach.get("name", "Unknown") if raw_coach else "Unknown"),
            "photo": raw_coach.get("photo") if raw_coach else None,
            "nationality": v_coach.get("nationality", raw_coach.get("nationality") if raw_coach else None),
            "age": raw_coach.get("age") if raw_coach else None,
            "verified": v_coach.get("verified", True),
        }

        injuries = []
        for inj in v_team.get("injuries", []):
            injuries.append({
                "player": inj.get("player", "Unknown"),
                "reason": inj.get("reason", "Unknown"),
                "photo": None,
                "type": "Missing",
                "status": inj.get("status", "out"),
            })

        return {
            "coach": coach,
            "injuries": injuries,
            "formation": v_team.get("formation"),
            "transfers_out": v_team.get("transfers_out", []),
            "transfers_in": v_team.get("transfers_in", []),
            "player_corrections": v_team.get("player_corrections", []),
        }

    return {
        "team_a": build_team(verified.get("team_a", {}), raw_coach_a),
        "team_b": build_team(verified.get("team_b", {}), raw_coach_b),
        "verified_at": datetime.utcnow().isoformat(),
        "source": "chatgpt_verified",
    }


def apply_player_corrections(players: List[dict], verified_team: dict) -> List[dict]:
    """
    Remove players who have been flagged as transferred out.
    Returns a new list with corrections applied.
    """
    corrections = verified_team.get("player_corrections", [])
    if not corrections:
        return players

    names_to_remove = set()
    for c in corrections:
        if c.get("action") == "remove":
            names_to_remove.add(c.get("name", "").lower().strip())

    if not names_to_remove:
        return players

    filtered = []
    for p in players:
        p_name = (p.get("name") or "").lower().strip()
        if p_name in names_to_remove:
            logger.info(f"[DataVerifier] Removing transferred player: {p.get('name')}")
            continue
        filtered.append(p)

    return filtered


def extract_for_match_stats(verified: dict) -> Tuple[List, List, Optional[dict], Optional[dict], Optional[str], Optional[str]]:
    """
    Extract verified data in the same tuple format that gemini_football_data returns:
    (injuries_a, injuries_b, coach_a, coach_b, formation_a, formation_b)
    """
    ta = verified.get("team_a", {})
    tb = verified.get("team_b", {})

    return (
        ta.get("injuries", []),
        tb.get("injuries", []),
        ta.get("coach"),
        tb.get("coach"),
        ta.get("formation"),
        tb.get("formation"),
    )
