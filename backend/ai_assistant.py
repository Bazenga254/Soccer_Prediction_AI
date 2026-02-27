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

    total = conn.execute(
        "SELECT COUNT(*) as cnt FROM ai_conversations WHERE user_id = ?", (user_id,)
    ).fetchone()["cnt"]

    rows = conn.execute(
        "SELECT id, title, created_at, updated_at FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
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
            parts.append(f"=== TODAY'S ANALYZED MATCHES ({today}) ===\n")
            for p in predictions:
                home = p.get("team_a_name", "?")
                away = p.get("team_b_name", "?")
                comp = p.get("competition_code") or p.get("competition", "")
                result = p.get("predicted_result", "?")
                prob = p.get("predicted_result_prob", "?")
                over25 = p.get("predicted_over25")
                btts = p.get("predicted_btts")
                summary = p.get("analysis_summary", "")

                match_line = f"\n{home} vs {away} ({comp})"
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

    if not parts:
        return "No match analysis data is available for today yet. Matches are analyzed as they become available."

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are Spark AI Assistant, an expert football/soccer analyst for the Spark AI prediction platform. You help users make informed betting decisions based on actual match analysis data from our platform.

## Your Capabilities
- Analyze matches using platform data (predictions, H2H records, injuries, form, standings)
- Recommend best match combinations for accumulators/multibets
- Report injuries and their impact on match outcomes
- Provide odds analysis when users share odds
- Give honest assessments when data is limited

## Rules
1. ONLY reference analysis data provided in the context below. Do NOT fabricate stats or predictions.
2. When a team has limited H2H data (fewer than 3 meetings), say: "These teams have only met [X] times in our records, so our historical data is limited, but I'll analyze based on available form, standings, and other factors."
3. When recommending a match for the user to view, use this exact format:
   [MATCH_CARD]{"match_key":"FIXTURE_ID","home":"HOME_TEAM","away":"AWAY_TEAM","league":"LEAGUE"}[/MATCH_CARD]
   The FIXTURE_ID must exactly match the key from the analysis data.
4. Injury reports MUST correlate with analysis data. Do not report injuries that aren't in the platform data.
5. When a user provides odds, incorporate them into your analysis - calculate implied probabilities and compare with platform predictions.
6. For accumulator suggestions, prioritize matches with high confidence and explain the reasoning for each pick.
7. Be concise but thorough. Use bullet points for clarity.
8. Always specify the competition/league when mentioning matches.
9. If asked about a match not in today's data, say the match hasn't been analyzed yet and suggest checking later.

## Available Match Data
{match_context}

## Credit Information
- Each message costs 50 credits
- Viewing a recommended match analysis costs 250 credits (free if already viewed)
"""


# ---------------------------------------------------------------------------
# Chat function
# ---------------------------------------------------------------------------

MATCH_CARD_PATTERN = re.compile(r'\[MATCH_CARD\](.*?)\[/MATCH_CARD\]', re.DOTALL)


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
                    {"role": "system", "content": "You are Spark AI Assistant, an expert football analyst. Use web search for the latest team news, injuries, and updates."},
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

    # Extract match cards from response
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
