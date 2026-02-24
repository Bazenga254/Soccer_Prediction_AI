"""
AI-powered football data module.
Uses OpenAI GPT-4o-mini to fetch manager and injury data.
Falls back to API-Football if OpenAI is unavailable.
"""

import asyncio
import json
import os
import time
from typing import Dict, List, Optional, Tuple

import config
import football_api

# In-memory cache: key -> (data, timestamp)
_cache: Dict[str, Tuple[dict, float]] = {}
CACHE_TTL = 10800  # 3 hours

MAX_RETRIES = 3
RETRY_DELAYS = [2, 5, 10]

TEAM_INFO_PROMPT = """You are a football/soccer data assistant. Search the web for current, accurate information about {team_name} ({competition}).

Return a JSON object with EXACTLY these fields:
{{
    "manager_name": "Full name of the current head coach/manager",
    "manager_nationality": "Nationality of the manager",
    "formation": "The team's most commonly used formation this season (e.g. 4-3-3, 4-2-3-1, 3-5-2)",
    "injuries": [
        {{"player": "Player full name", "reason": "Injury type or Suspended"}},
    ]
}}

IMPORTANT RULES:
- "manager_name" must be the CURRENT head coach as of today. Search for the latest news.
- "formation" must be the primary/preferred formation the manager has been using this current season. Search for their recent matches to determine this.
- "injuries" should only include players who are CURRENTLY injured or suspended and will miss upcoming matches. Do NOT include players who have already recovered.
- If you cannot find current injury info, return an empty injuries list.
- Keep injuries list to a maximum of 10 players.
- Return ONLY valid JSON, no markdown fences or extra text."""


def _is_cache_valid(key: str) -> bool:
    if key not in _cache:
        return False
    _, ts = _cache[key]
    return (time.time() - ts) < CACHE_TTL


def _get_cached(key: str) -> Optional[dict]:
    if _is_cache_valid(key):
        return _cache[key][0]
    return None


def _set_cached(key: str, data: dict):
    _cache[key] = (data, time.time())


async def fetch_team_info(team_name: str, competition_name: str) -> Optional[dict]:
    """
    Fetch current manager and injury data for a team using OpenAI GPT-4o-mini.
    Returns dict with 'coach' and 'injuries' keys, or None on failure.
    """
    cache_key = f"ai_team_{team_name.lower().replace(' ', '_')}"
    cached = _get_cached(cache_key)
    if cached:
        print(f"[AIData] Cache hit for {team_name}")
        return cached

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        print("[AIData] No OPENAI_API_KEY set, skipping")
        return None

    from openai import OpenAI
    client = OpenAI(api_key=api_key)

    prompt = TEAM_INFO_PROMPT.format(
        team_name=team_name,
        competition=competition_name,
    )

    for attempt in range(MAX_RETRIES):
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=1024,
            )

            text = response.choices[0].message.content.strip() if response.choices[0].message.content else ""

            # Strip markdown fences if present
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

            data = json.loads(text)

            # Build coach dict in the shape the frontend expects
            coach = {
                "name": data.get("manager_name", "Unknown"),
                "photo": None,
                "nationality": data.get("manager_nationality"),
                "age": None,
            }

            # Build injuries list in the shape the frontend expects
            injuries = []
            for inj in data.get("injuries", []):
                injuries.append({
                    "player": inj.get("player", "Unknown"),
                    "reason": inj.get("reason", "Unknown"),
                    "photo": None,
                    "type": "Missing",
                })

            result = {
                "coach": coach,
                "injuries": injuries,
                "formation": data.get("formation"),
            }
            _set_cached(cache_key, result)
            print(f"[AIData] Fetched data for {team_name}: manager={coach['name']}, injuries={len(injuries)}")
            return result

        except Exception as e:
            error_str = str(e)
            if ("429" in error_str or "rate" in error_str.lower()) and attempt < MAX_RETRIES - 1:
                delay = RETRY_DELAYS[attempt]
                print(f"[AIData] Rate limited for {team_name}, retrying in {delay}s (attempt {attempt + 1}/{MAX_RETRIES})")
                await asyncio.sleep(delay)
                continue
            print(f"[AIData] Failed for {team_name}: {e}")
            return None

    return None


async def get_enhanced_team_data(
    team_a_name: str,
    team_b_name: str,
    competition: str,
    team_a_id: int,
    team_b_id: int,
    league_id: int,
) -> Tuple[List[Dict], List[Dict], Optional[Dict], Optional[Dict], Optional[str], Optional[str]]:
    """
    Fetch coach, injury, and formation data for both teams using OpenAI.
    Falls back to API-Football if OpenAI fails for a team.

    Returns: (injuries_a, injuries_b, coach_a, coach_b, formation_a, formation_b)
    """
    comp_name = config.COMPETITION_NAMES.get(competition, competition)

    # Fetch teams sequentially to avoid rate limits
    result_a = await fetch_team_info(team_a_name, comp_name)
    result_b = await fetch_team_info(team_b_name, comp_name)

    # Extract or fallback for team A
    formation_a = None
    if result_a:
        injuries_a = result_a["injuries"]
        coach_a = result_a["coach"]
        formation_a = result_a.get("formation")
    else:
        print(f"[AIData] Falling back to API-Football for {team_a_name}")
        injuries_a, coach_a = await asyncio.gather(
            football_api.fetch_injuries(team_a_id, league_id),
            football_api.fetch_coach(team_a_id),
        )
        injuries_a = injuries_a or []

    # Extract or fallback for team B
    formation_b = None
    if result_b:
        injuries_b = result_b["injuries"]
        coach_b = result_b["coach"]
        formation_b = result_b.get("formation")
    else:
        print(f"[AIData] Falling back to API-Football for {team_b_name}")
        injuries_b, coach_b = await asyncio.gather(
            football_api.fetch_injuries(team_b_id, league_id),
            football_api.fetch_coach(team_b_id),
        )
        injuries_b = injuries_b or []

    return injuries_a, injuries_b, coach_a, coach_b, formation_a, formation_b
