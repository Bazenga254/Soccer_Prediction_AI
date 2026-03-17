"""AI Assistant module - chat-based AI using platform match analysis data."""
import os
import json
import uuid
import re
import sqlite3
from datetime import datetime
from typing import Dict, List, Optional

import community
import prediction_tracker
import pricing_config


# ---------------------------------------------------------------------------
# Database helpers (uses community.db via community._get_db)
# ---------------------------------------------------------------------------

def _get_db():
    return community._get_db()


# ---------------------------------------------------------------------------
# Conversation CRUD
# ---------------------------------------------------------------------------

def create_conversation(user_id: int) -> Dict:
    """Create a new conversation. Enforce 10-conversation limit."""
    conn = _get_db()
    now = datetime.now().isoformat()
    conv_id = str(uuid.uuid4())

    conn.execute(
        "INSERT INTO ai_conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (conv_id, user_id, "New Chat", now, now)
    )
    conn.commit()

    # Enforce 10-conversation limit: delete oldest beyond 10
    _enforce_conversation_limit(conn, user_id)
    conn.close()

    return {"conversation_id": conv_id, "title": "New Chat", "created_at": now}


def _enforce_conversation_limit(conn, user_id: int, limit: int = 10):
    """Keep only the N most recent conversations for a user."""
    rows = conn.execute(
        "SELECT id FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC",
        (user_id,)
    ).fetchall()

    if len(rows) > limit:
        to_delete = [r["id"] for r in rows[limit:]]
        for conv_id in to_delete:
            conn.execute("DELETE FROM ai_messages WHERE conversation_id = ?", (conv_id,))
            conn.execute("DELETE FROM ai_conversations WHERE id = ?", (conv_id,))
        conn.commit()


def get_conversations(user_id: int, page: int = 1, per_page: int = 10) -> Dict:
    """Get paginated conversation list for a user."""
    conn = _get_db()
    offset = (page - 1) * per_page

    # Only return conversations that have at least one message
    total = conn.execute(
        "SELECT COUNT(*) as cnt FROM ai_conversations c WHERE c.user_id = ? AND EXISTS (SELECT 1 FROM ai_messages m WHERE m.conversation_id = c.id)",
        (user_id,)
    ).fetchone()["cnt"]

    rows = conn.execute(
        "SELECT c.id, c.title, c.created_at, c.updated_at FROM ai_conversations c "
        "WHERE c.user_id = ? AND EXISTS (SELECT 1 FROM ai_messages m WHERE m.conversation_id = c.id) "
        "ORDER BY c.updated_at DESC LIMIT ? OFFSET ?",
        (user_id, per_page, offset)
    ).fetchall()
    conn.close()

    return {
        "conversations": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


def get_conversation_messages(conversation_id: str, user_id: int) -> Dict:
    """Get all messages for a conversation (with ownership check)."""
    conn = _get_db()

    # Verify ownership
    conv = conn.execute(
        "SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user_id)
    ).fetchone()
    if not conv:
        conn.close()
        return {"messages": [], "error": "Conversation not found"}

    rows = conn.execute(
        "SELECT id, role, content, match_links, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC",
        (conversation_id,)
    ).fetchall()
    conn.close()

    messages = []
    for r in rows:
        msg = dict(r)
        if msg.get("match_links"):
            try:
                msg["match_links"] = json.loads(msg["match_links"])
            except (json.JSONDecodeError, TypeError):
                msg["match_links"] = []
        else:
            msg["match_links"] = []
        messages.append(msg)

    return {"messages": messages}


def delete_conversation(conversation_id: str, user_id: int) -> bool:
    """Delete a conversation and its messages."""
    conn = _get_db()
    conv = conn.execute(
        "SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user_id)
    ).fetchone()
    if not conv:
        conn.close()
        return False

    conn.execute("DELETE FROM ai_messages WHERE conversation_id = ?", (conversation_id,))
    conn.execute("DELETE FROM ai_conversations WHERE id = ?", (conversation_id,))
    conn.commit()
    conn.close()
    return True


# ---------------------------------------------------------------------------
# Match context builder
# ---------------------------------------------------------------------------

def build_match_context() -> str:
    """Build context from today's predictions and available match data."""
    parts = []

    # 1. Get today's daily free predictions (community predictions)
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        predictions = community.get_daily_free_predictions(today)
        if predictions:
            parts.append(f"=== TODAY'S ANALYZED MATCHES ({today}) ===")
            parts.append(f"Total matches analyzed today: {len(predictions)}\n")
            for p in predictions:
                home = p.get("team_a_name", "?")
                away = p.get("team_b_name", "?")
                comp = p.get("competition_code") or p.get("competition", "")
                fixture_id = p.get("fixture_id", "")
                result = p.get("predicted_result", "?")
                prob = p.get("predicted_result_prob", "?")
                over25 = p.get("predicted_over25")
                btts = p.get("predicted_btts")
                summary = p.get("analysis_summary", "")

                match_line = f"\nMATCH: {home} vs {away} ({comp})"
                match_line += f"\n  FIXTURE_ID: {fixture_id}"
                match_line += f"\n  Prediction: {result} ({prob}% confidence)"
                if over25 is not None:
                    match_line += f"\n  Over 2.5: {'Yes' if over25 else 'No'}"
                if btts is not None:
                    match_line += f"\n  BTTS: {'Yes' if btts else 'No'}"
                if summary:
                    match_line += f"\n  Summary: {summary[:200]}"
                parts.append(match_line)
    except Exception as e:
        print(f"[AI Assistant] Error loading daily predictions: {e}")

    # 2. Get recent stored predictions from prediction_tracker
    try:
        stored = prediction_tracker.get_all_predictions(limit=30)
        today_stored = [p for p in stored if p.get("created_at", "").startswith(datetime.now().strftime("%Y-%m-%d"))]
        if today_stored:
            parts.append(f"\n\n=== DETAILED MATCH ANALYSES ({len(today_stored)} matches) ===\n")
            for p in today_stored[:20]:
                home = p.get("team_a_name", "?")
                away = p.get("team_b_name", "?")
                fixture_id = p.get("fixture_id", "")
                comp = p.get("competition_code", "")

                detail = f"\n{home} vs {away} ({comp}) [key: {fixture_id}]"

                # Parse stored analysis data
                result_data = None
                if p.get("full_result"):
                    try:
                        result_data = json.loads(p["full_result"]) if isinstance(p["full_result"], str) else p["full_result"]
                    except (json.JSONDecodeError, TypeError):
                        pass

                if result_data:
                    # 1X2
                    preds = result_data.get("predictions", {})
                    oxo = preds.get("1x2", {})
                    if oxo:
                        detail += f"\n  1X2: {home} {oxo.get('home_win', '?')}% | Draw {oxo.get('draw', '?')}% | {away} {oxo.get('away_win', '?')}%"
                        detail += f"\n  Pick: {oxo.get('recommended_label', '?')} ({oxo.get('confidence', '?')})"

                    # Goals
                    ga = result_data.get("goals_analysis", {})
                    if ga:
                        ou = ga.get("over_under", {})
                        detail += f"\n  Over 2.5: {ou.get('over_25', {}).get('percentage', '?')}%, BTTS: {ga.get('btts', {}).get('yes_percentage', '?')}%"
                        sp = ga.get("scoring_prediction", {})
                        if sp:
                            detail += f"\n  Predicted Score: {sp.get('predicted_score', '?')}"

                    # H2H
                    factors = result_data.get("factors", {})
                    h2h = factors.get("h2h", {})
                    if h2h and h2h.get("total_matches", 0) > 0:
                        detail += f"\n  H2H ({h2h['total_matches']} games): {home} {h2h.get('home_wins', 0)}W, {h2h.get('draws', 0)}D, {away} {h2h.get('away_wins', 0)}W"

                    # Injuries
                    injuries = factors.get("injuries", {})
                    home_inj = injuries.get("home", [])
                    away_inj = injuries.get("away", [])
                    if home_inj or away_inj:
                        inj_parts = []
                        if home_inj:
                            names = ", ".join(i.get("player", "?") for i in home_inj[:4])
                            inj_parts.append(f"{home} ({len(home_inj)}): {names}")
                        if away_inj:
                            names = ", ".join(i.get("player", "?") for i in away_inj[:4])
                            inj_parts.append(f"{away} ({len(away_inj)}): {names}")
                        detail += f"\n  Injuries: {'; '.join(inj_parts)}"

                    # Form
                    form = factors.get("form", {})
                    if form:
                        detail += f"\n  Form: {home} {form.get('home_form', '?')}, {away} {form.get('away_form', '?')}"

                    # Standings
                    standings = factors.get("standings", {})
                    if standings:
                        detail += f"\n  Table: {home} #{standings.get('home_position', '?')}, {away} #{standings.get('away_position', '?')}"

                    # Key factors
                    kf = result_data.get("key_factors", [])
                    if kf:
                        detail += f"\n  Key: {'; '.join(kf[:3])}"
                else:
                    # Fallback to basic fields
                    detail += f"\n  Result: {p.get('predicted_result', '?')} ({p.get('home_win_prob', '?')}H / {p.get('draw_prob', '?')}D / {p.get('away_win_prob', '?')}A)"

                parts.append(detail)
    except Exception as e:
        print(f"[AI Assistant] Error loading stored predictions: {e}")

    # 3. Add live league standings from top leagues
    try:
        import asyncio
        from football_api import fetch_standings

        top_leagues = [
            ("PL", "Premier League"),
            ("PD", "La Liga"),
            ("SA", "Serie A"),
            ("BL1", "Bundesliga"),
            ("FL1", "Ligue 1"),
        ]

        standings_parts = []
        loop = asyncio.new_event_loop()
        for code, name in top_leagues:
            try:
                standings = loop.run_until_complete(fetch_standings(code))
                if standings and len(standings) > 0:
                    table_header = '\n**' + name + ' Standings:**\n| Pos | Team | Pts | P | W | D | L | GF | GA | GD |\n|-----|------|-----|---|---|---|---|----|----|-----|'
                    table_lines = [table_header]
                    for team in standings[:20]:
                        pos = team.get("position", "?")
                        team_name = team.get("name", "?")
                        pts = team.get("points", "?")
                        played = team.get("played", "?")
                        won = team.get("wins", "?")
                        drawn = team.get("draws", "?")
                        lost = team.get("losses", "?")
                        gf = team.get("goals_scored", "?")
                        ga = team.get("goals_conceded", "?")
                        gd = team.get("goal_difference", "?")
                        table_lines.append(f"| {pos} | {team_name} | {pts} | {played} | {won} | {drawn} | {lost} | {gf} | {ga} | {gd} |")
                    standings_parts.append("\n".join(table_lines))
            except Exception as e:
                print(f"[AI Assistant] Error loading {name} standings: {e}")
        loop.close()

        if standings_parts:
            parts.append(f"\n\n=== LIVE LEAGUE STANDINGS (Updated) ===")
            parts.extend(standings_parts)
    except Exception as e:
        print(f"[AI Assistant] Error loading standings: {e}")

    if not parts:
        return "No match analysis data is available for today yet. Matches are analyzed as they become available."

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are Spark AI Assistant, an expert football/soccer analyst for the Spark AI prediction platform. You help users make informed betting decisions using a hybrid approach: platform analysis data + live football intelligence.

## HOW YOU WORK (Hybrid System)
You have TWO data sources and must use them together:

### Source 1: Platform Analysis Data (below)
This is our backend's AI match analysis — predictions, confidence scores, H2H stats, form, and FIXTURE_IDs. Use this as your FOUNDATION for all match recommendations.
- Prediction scores and confidence percentages come ONLY from this data
- FIXTURE_IDs for match links come ONLY from this data
- Do NOT invent or guess confidence scores — only quote what's in the data

### Source 2: Web Search (live football news)
Use web search to ENHANCE and CROSS-CHECK the platform data with the latest information:
- Latest injury updates and team news (a key player ruled out can change everything)
- Recent lineup announcements and squad rotations
- Current form and momentum (last 3-5 matches)
- Manager quotes, tactical changes, derby context
- Transfer news that may affect team dynamics
- Weather or pitch conditions if relevant

### How to combine them:
1. Start with the platform prediction and confidence score
2. Use web search to verify if anything has changed (new injuries, suspensions, etc.)
3. If web search reveals something significant (e.g., star striker injured after our analysis), mention it and adjust your recommendation accordingly
4. Always be transparent: "Our platform predicts X at Y% confidence. However, recent news shows Z which could affect this."

## IMPORTANT: Stick to Football Only
- Only use web search for football/soccer related queries
- If a user asks about non-football topics, politely redirect them: "I'm specialized in football analysis. How can I help you with today's matches?"

## General Football Knowledge
You are an EXPERT football analyst with deep knowledge of:
- All major leagues (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, etc.)
- All teams, their squads, managers, playing styles, and histories
- Current standings, title races, relegation battles, and qualification scenarios
- Transfer windows, player stats, injuries, and suspensions
- Historical records, rivalry context, and tactical analysis

When a user asks general football questions (e.g., "Can Arsenal win the league?", "Who is the top scorer?", "How has Barcelona been playing?"), you MUST:
1. Use your football knowledge AND web search to give a comprehensive, informed answer
2. Reference current standings, recent form, remaining fixtures, and key factors
3. Provide your expert analysis and opinion
4. If relevant, link to platform match data for upcoming games involving those teams

NEVER say "I don't know which team that is" or refuse to answer a football question. You know every professional football team in the world.

## Your Capabilities
- Recommend matches from today's analyzed data with confidence scores
- Enhance recommendations with live injury/team news from web search
- Suggest best match combinations for accumulators/multibets
- Provide odds analysis when users share odds
- Help users find high-confidence picks for double chance, over/under, BTTS, etc.

## IMPORTANT: Always Include Match Analysis Links
When you recommend or discuss ANY specific match from the platform data, you MUST include a match card link so the user can view the full analysis. Use this exact format:

[MATCH_CARD]{{"match_key":"FIXTURE_ID","home":"HOME_TEAM","away":"AWAY_TEAM","league":"LEAGUE"}}[/MATCH_CARD]

- The FIXTURE_ID must EXACTLY match the FIXTURE_ID from the data below (e.g., "1338-67-20260311")
- ALWAYS include this for every match you mention — users need these links to view detailed analysis
- Tell the user: "Click to view the full match analysis (250 credits, free if already viewed)"
- If a match is NOT in the platform data, do NOT create a fake MATCH_CARD — instead tell the user to go to Upcoming Matches and run the analysis themselves

## Rules
1. Predictions and confidence scores come ONLY from platform data. Do NOT fabricate these.
2. Use web search to verify and enhance — especially for injuries, lineups, and recent form.
3. When recommending matches, sort by confidence level (highest first).
4. For accumulator suggestions, pick matches with highest confidence and explain why.
5. Be concise but thorough. Use bullet points for clarity.
6. Always specify the competition/league when mentioning matches.
7. When a user asks "which matches today have high confidence", list analyzed matches sorted by confidence with their MATCH_CARD links, then add any relevant news updates.
8. For double chance questions: "Home Win" at 60%+ confidence means 1X (Home or Draw) is very strong. "Away Win" at 60%+ means X2 is strong.
9. If a user asks about a match not in today's data, say: "That match hasn't been analyzed on our platform yet. You can analyze it by going to Upcoming Matches, selecting the match, and running a Full Match Analysis."

## Available Match Data (from our platform backend)
{match_context}

## Credit Information
- Each message costs 50 credits
- Viewing a recommended match's full analysis costs 250 credits (free if already viewed)
- Always mention the 250 credit cost when suggesting a user view full analysis
"""


# ---------------------------------------------------------------------------
# Chat function
# ---------------------------------------------------------------------------

MATCH_CARD_PATTERN = re.compile(r'\[MATCH_CARD\](.*?)\[/MATCH_CARD\]', re.DOTALL)


def _build_match_lookup() -> Dict:
    """Build a lookup of team names to fixture data for auto-injection."""
    lookup = {}
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        predictions = community.get_daily_free_predictions(today)
        if predictions:
            for p in predictions:
                home = p.get("team_a_name", "")
                away = p.get("team_b_name", "")
                fixture_id = p.get("fixture_id", "")
                comp = p.get("competition_code") or p.get("competition", "")
                if home and away and fixture_id:
                    # Store by multiple keys for flexible matching
                    key = f"{home.lower()} vs {away.lower()}"
                    lookup[key] = {"fixture_id": fixture_id, "home": home, "away": away, "league": comp}
                    # Also store by individual team names
                    lookup[home.lower()] = {"fixture_id": fixture_id, "home": home, "away": away, "league": comp}
                    lookup[away.lower()] = {"fixture_id": fixture_id, "home": home, "away": away, "league": comp}
    except Exception as e:
        print(f"[AI Assistant] Error building match lookup: {e}")
    return lookup


def _auto_inject_match_cards(response_text: str, match_context: str) -> tuple:
    """Auto-inject MATCH_CARD tags for matches mentioned in the response that are missing cards.

    Returns (modified_text, injected_links).
    """
    # Get already-present match keys
    existing_keys = set()
    for m in MATCH_CARD_PATTERN.finditer(response_text):
        try:
            data = json.loads(m.group(1))
            if data.get("match_key"):
                existing_keys.add(data["match_key"])
        except (json.JSONDecodeError, TypeError):
            pass

    # Build lookup from today's matches
    lookup = _build_match_lookup()
    if not lookup:
        return response_text, []

    # Find team names mentioned in the response that don't have a card yet
    injected = []
    already_injected_fixtures = set(existing_keys)

    for team_key, match_data in lookup.items():
        if " vs " in team_key:
            continue  # Skip "X vs Y" keys, check individual team names
        fixture_id = match_data["fixture_id"]
        if fixture_id in already_injected_fixtures:
            continue

        # Check if this team name appears in the response text (case-insensitive)
        # Use word boundary-like matching to avoid partial matches
        pattern = re.compile(r'\b' + re.escape(team_key) + r'\b', re.IGNORECASE)
        if pattern.search(response_text):
            # This team is mentioned but has no card — inject one
            card_json = json.dumps({
                "match_key": fixture_id,
                "home": match_data["home"],
                "away": match_data["away"],
                "league": match_data["league"],
            })
            card_tag = f"\n[MATCH_CARD]{card_json}[/MATCH_CARD]"

            # Inject after the line mentioning this team
            lines = response_text.split('\n')
            inserted = False
            for i, line in enumerate(lines):
                if pattern.search(line) and fixture_id not in ''.join(lines[max(0, i-2):i+3]):
                    lines.insert(i + 1, card_tag)
                    inserted = True
                    break
            if inserted:
                response_text = '\n'.join(lines)
            else:
                # Fallback: append at the end
                response_text += card_tag

            already_injected_fixtures.add(fixture_id)
            injected.append(match_data)

    return response_text, injected


def _extract_match_links(text: str) -> List[Dict]:
    """Extract [MATCH_CARD] blocks from AI response."""
    links = []
    for m in MATCH_CARD_PATTERN.finditer(text):
        try:
            data = json.loads(m.group(1))
            if data.get("match_key"):
                links.append({
                    "match_key": data["match_key"],
                    "home": data.get("home", ""),
                    "away": data.get("away", ""),
                    "league": data.get("league", ""),
                })
        except (json.JSONDecodeError, TypeError):
            pass
    return links


def _check_standings_query(message: str):
    """If user asks for league standings, return formatted data directly from API."""
    import re
    msg = message.lower().strip()

    # Map keywords to league codes
    league_map = {
        'epl': ('PL', 'English Premier League'),
        'premier league': ('PL', 'English Premier League'),
        'prem': ('PL', 'English Premier League'),
        'la liga': ('PD', 'La Liga'),
        'serie a': ('SA', 'Serie A'),
        'bundesliga': ('BL1', 'Bundesliga'),
        'ligue 1': ('FL1', 'Ligue 1'),
    }

    # Check if it's a standings question
    standings_keywords = ['standing', 'standings', 'table', 'league table', 'positions', 'who is top', 'who is first', 'who leads']
    is_standings = any(kw in msg for kw in standings_keywords)
    if not is_standings:
        return None

    # Detect which league
    detected_league = None
    for keyword, (code, name) in league_map.items():
        if keyword in msg:
            detected_league = (code, name)
            break

    # Default to Premier League if no league specified
    if not detected_league:
        detected_league = ('PL', 'English Premier League')

    code, league_name = detected_league

    try:
        import asyncio
        from football_api import fetch_standings
        loop = asyncio.new_event_loop()
        standings = loop.run_until_complete(fetch_standings(code))
        loop.close()

        if not standings:
            return None

        today = datetime.now().strftime('%B %d, %Y')
        lines = [f"Here are the current **{league_name}** standings as of {today}:\n"]
        lines.append("| Pos | Team | Pts | P | W | D | L | GF | GA | GD |")
        lines.append("|-----|------|-----|---|---|---|---|----|----|-----|")

        for team in standings:
            pos = team.get("position", "?")
            name = team.get("name", "?")
            pts = team.get("points", "?")
            played = team.get("played", "?")
            w = team.get("wins", "?")
            d = team.get("draws", "?")
            l = team.get("losses", "?")
            gf = team.get("goals_scored", "?")
            ga = team.get("goals_conceded", "?")
            gd = team.get("goal_difference", "?")
            lines.append(f"| {pos} | {name} | {pts} | {played} | {w} | {d} | {l} | {gf} | {ga} | {gd} |")

        return "\n".join(lines)
    except Exception as e:
        print(f"[AI Assistant] Standings direct query error: {e}")
        return None


async def chat(user_id: int, conversation_id: str, message: str) -> Dict:
    """Process a chat message and return AI response."""
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return {"text": "AI Assistant is currently unavailable. Please try again later.", "match_links": [], "conversation_id": conversation_id}

    from openai import OpenAI
    client = OpenAI(api_key=api_key)

    conn = _get_db()
    now = datetime.now().isoformat()

    # Verify conversation exists and belongs to user
    conv = conn.execute(
        "SELECT id, title FROM ai_conversations WHERE id = ? AND user_id = ?",
        (conversation_id, user_id)
    ).fetchone()
    if not conv:
        conn.close()
        return {"text": "Conversation not found.", "match_links": [], "conversation_id": conversation_id}

    # Save user message
    conn.execute(
        "INSERT INTO ai_messages (conversation_id, role, content, created_at) VALUES (?, 'user', ?, ?)",
        (conversation_id, message, now)
    )
    conn.commit()

    # Load last 20 messages for context
    history_rows = conn.execute(
        "SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 20",
        (conversation_id,)
    ).fetchall()
    history_rows = list(reversed(history_rows))

    conn.close()

    # Build context
    match_context = build_match_context()
    system_prompt = SYSTEM_PROMPT.replace("{match_context}", match_context)

    # Direct standings response — bypass GPT for accuracy
    standings_response = _check_standings_query(message)
    if standings_response:
        # Save assistant response
        conn2 = _get_db()
        conn2.execute(
            "INSERT INTO ai_messages (conversation_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)",
            (conversation_id, standings_response, datetime.now().isoformat())
        )
        conn2.commit()
        conn2.close()
        return {"text": standings_response, "match_links": [], "conversation_id": conversation_id}

    # Build message history for OpenAI
    messages = [{"role": "user", "content": system_prompt}]
    for row in history_rows[:-1]:  # Exclude the last user message (we'll add it separately)
        role = "user" if row["role"] == "user" else "assistant"
        messages.append({"role": role, "content": row["content"]})
    messages.append({"role": "user", "content": message})

    # Call OpenAI
    max_retries = 3
    retry_delays = [2, 5, 10]
    response_text = ""
    sources = []

    for attempt in range(max_retries):
        try:
            response = client.responses.create(
                model="gpt-4o-mini",
                tools=[{"type": "web_search_preview"}],
                input=[
                    {"role": "system", "content": "You are Spark AI Assistant, an expert football/soccer analyst. You have deep knowledge of ALL football teams, leagues, players, managers, standings, title races, and history worldwide. You MUST answer ANY football-related question comprehensively — including general questions like 'Can Arsenal win the league?', 'Who is the top scorer?', or 'How has Barcelona been playing?'. CRITICAL: The conversation context contains LIVE LEAGUE STANDINGS data fetched in real-time from official APIs. ALWAYS use these standings as your PRIMARY source for points, positions, wins, draws, losses, goals — they are MORE ACCURATE than web search results. When displaying standings, ALWAYS format them as a markdown table with columns: Pos, Team, Pts, P, W, D, L, GF, GA, GD. Never simplify standings into just W-L format. Only use web search for news, injuries, transfers, and context NOT in the platform data. Only refuse non-football topics (politics, science, coding, etc.) with: 'I specialize in football analysis. How can I help you with football?' For match-specific analysis: use platform match data as your foundation, cross-check with web search, never fabricate predictions, and include [MATCH_CARD] links when discussing analyzed matches."},
                ] + messages,
            )

            for item in response.output:
                if item.type == "message":
                    for content in item.content:
                        if content.type == "output_text":
                            response_text = content.text.strip()
                            if hasattr(content, 'annotations') and content.annotations:
                                for ann in content.annotations:
                                    if hasattr(ann, 'url') and ann.url:
                                        sources.append({
                                            "title": getattr(ann, 'title', ann.url) or ann.url,
                                            "url": ann.url,
                                        })
            break
        except Exception as e:
            error_str = str(e)
            if ("429" in error_str or "rate" in error_str.lower()) and attempt < max_retries - 1:
                import asyncio
                delay = retry_delays[attempt]
                print(f"[AI Assistant] Rate limited, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(delay)
                continue
            print(f"[AI Assistant] OpenAI error: {e}")
            response_text = "Sorry, I couldn't process your question right now. Please try again."
            break

    if not response_text:
        response_text = "I couldn't generate a response. Please try again."

    # Post-process: auto-inject match cards for any mentioned match missing a card
    response_text, auto_links = _auto_inject_match_cards(response_text, match_context)

    # Extract match cards from response (includes both AI-generated and auto-injected)
    match_links = _extract_match_links(response_text)

    # Save assistant response
    conn = _get_db()
    now2 = datetime.now().isoformat()
    conn.execute(
        "INSERT INTO ai_messages (conversation_id, role, content, match_links, created_at) VALUES (?, 'assistant', ?, ?, ?)",
        (conversation_id, response_text, json.dumps(match_links) if match_links else None, now2)
    )

    # Auto-generate title from first message
    title = conv["title"]
    if title == "New Chat":
        title = message[:50] + ("..." if len(message) > 50 else "")
        conn.execute(
            "UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?",
            (title, now2, conversation_id)
        )
    else:
        conn.execute(
            "UPDATE ai_conversations SET updated_at = ? WHERE id = ?",
            (now2, conversation_id)
        )

    conn.commit()
    conn.close()

    # Deduplicate sources
    seen = set()
    unique_sources = []
    for s in sources:
        if s["url"] not in seen:
            seen.add(s["url"])
            unique_sources.append(s)

    return {
        "text": response_text,
        "match_links": match_links,
        "sources": unique_sources[:5],
        "conversation_id": conversation_id,
        "title": title,
    }
