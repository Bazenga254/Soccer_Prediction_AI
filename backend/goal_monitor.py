"""
Goal Monitor - Server-side score change detection for tracked matches.
Sends push notifications when goals are scored in matches users are tracking.
"""

import json
import sqlite3
import asyncio
from typing import Dict, Set, Tuple

import football_api
import push_notifications

# In-memory score snapshot: { fixture_id: {"home": int, "away": int, "status": str} }
_last_scores: Dict[int, Dict] = {}

# Deduplication: set of (fixture_id, home_goals, away_goals) already notified
_notified_scores: Set[Tuple[int, int, int]] = set()

# Track which matches we already sent "match ended" notifications for
_notified_ended: Set[int] = set()

FINISHED_STATUSES = {"FT", "AET", "PEN"}
LIVE_STATUSES = {"1H", "2H", "HT", "ET", "LIVE", "BT", "P", "INT"}


BASE_URL = "https://spark-ai-prediction.com"

# Pre-made notification images for each event type
GOAL_IMAGES = {
    "celebration": f"{BASE_URL}/notif-images/goal_celebration.png",
    "big_lead": f"{BASE_URL}/notif-images/goal_big_lead.png",
    "worried": f"{BASE_URL}/notif-images/goal_conceded_level.png",
    "sad": f"{BASE_URL}/notif-images/goal_conceded.png",
}

END_IMAGES = {
    "match_won": f"{BASE_URL}/notif-images/match_won.png",
    "match_lost": f"{BASE_URL}/notif-images/match_lost.png",
    "match_draw": f"{BASE_URL}/notif-images/match_draw.png",
}


def _get_all_tracked_matches() -> Dict[int, Dict]:
    """Query all users who have tracked_matches in their preferences.
    Returns: { user_id: { match_id_str: {teamId, teamName, isHome, ...}, ... } }
    """
    conn = sqlite3.connect("users.db", timeout=10)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, preferences FROM users WHERE preferences IS NOT NULL AND preferences != ''"
    ).fetchall()
    conn.close()

    result = {}
    for row in rows:
        try:
            prefs = json.loads(row["preferences"])
            tracked = prefs.get("tracked_matches")
            if tracked and isinstance(tracked, dict) and len(tracked) > 0:
                result[row["id"]] = tracked
        except (json.JSONDecodeError, TypeError):
            continue
    return result


def _build_match_user_index(all_tracked: Dict[int, Dict]) -> Dict[int, list]:
    """Invert user->matches map to match->users for efficient lookup.
    Returns: { fixture_id_int: [ (user_id, tracked_info), ... ] }
    """
    index = {}
    for user_id, matches in all_tracked.items():
        for match_id_str, tracked_info in matches.items():
            try:
                match_id = int(match_id_str)
            except (ValueError, TypeError):
                continue
            if match_id not in index:
                index[match_id] = []
            index[match_id].append((user_id, tracked_info))
    return index


def _determine_goal_type(tracked_info: dict, new_home: int, new_away: int,
                         old_home: int, old_away: int) -> str:
    """Determine notification type based on who scored and context."""
    is_home = tracked_info.get("isHome", True)

    home_scored = new_home > old_home
    away_scored = new_away > old_away
    user_team_scored = (is_home and home_scored) or (not is_home and away_scored)

    user_goals = new_home if is_home else new_away
    opp_goals = new_away if is_home else new_home
    big_lead = user_goals - opp_goals >= 2

    if user_team_scored and big_lead:
        return "big_lead"
    elif user_team_scored:
        return "celebration"
    elif new_home == new_away:
        return "worried"
    else:
        return "sad"


def _determine_end_type(tracked_info: dict, home_goals: int, away_goals: int) -> str:
    """Determine match-end notification type."""
    is_home = tracked_info.get("isHome", True)
    user_goals = home_goals if is_home else away_goals
    opp_goals = away_goals if is_home else home_goals

    if user_goals > opp_goals:
        return "match_won"
    elif user_goals < opp_goals:
        return "match_lost"
    return "match_draw"


def _format_goal_notification(match: dict, tracked_info: dict, goal_type: str,
                              new_home: int, new_away: int) -> Tuple[str, str]:
    """Return (title, message) for a goal notification."""
    home_name = match["home_team"]["name"]
    away_name = match["away_team"]["name"]
    team_name = tracked_info.get("teamName", "Your team")
    elapsed = match.get("elapsed")
    elapsed_str = f" ({elapsed}')" if elapsed else ""

    score_line = f"{home_name} {new_home} - {new_away} {away_name}"

    if goal_type == "celebration":
        title = f"⚽ GOAL! {team_name} scores!{elapsed_str}"
    elif goal_type == "big_lead":
        title = f"🔥 GOAL! {team_name} extends the lead!{elapsed_str}"
    elif goal_type == "worried":
        title = f"😰 Goal conceded - It's level now{elapsed_str}"
    elif goal_type == "sad":
        title = f"😞 Goal conceded{elapsed_str}"
    else:
        title = f"⚽ Goal scored{elapsed_str}"

    last_goal = match.get("last_goal")
    if last_goal and last_goal.get("player"):
        message = f"{score_line}\n⚡ Scorer: {last_goal['player']}"
    else:
        message = score_line

    return title, message


def _format_end_notification(match: dict, tracked_info: dict,
                             end_type: str) -> Tuple[str, str]:
    """Return (title, message) for a match-end notification."""
    home_name = match["home_team"]["name"]
    away_name = match["away_team"]["name"]
    home_goals = match.get("goals", {}).get("home") or 0
    away_goals = match.get("goals", {}).get("away") or 0
    team_name = tracked_info.get("teamName", "Your team")
    score_line = f"{home_name} {home_goals} - {away_goals} {away_name}"

    if end_type == "match_won":
        title = f"🏆 Full Time - {team_name} wins!"
    elif end_type == "match_lost":
        title = f"😔 Full Time - {team_name} loses"
    else:
        title = f"🤝 Full Time - It's a draw"

    return title, score_line


async def goal_score_monitor():
    """Background task: poll live matches every 45 seconds, detect score changes,
    and send push notifications to users tracking those matches."""
    global _last_scores, _notified_scores, _notified_ended

    await asyncio.sleep(30)
    print("[GoalMonitor] Started - checking tracked matches every 45 seconds")

    while True:
        try:
            # 1. Get live matches (reuses 30-sec cache, no extra API calls)
            live_matches = await football_api.fetch_live_matches()
            if not live_matches:
                await asyncio.sleep(45)
                continue

            # 2. Get all users' tracked matches
            all_tracked = _get_all_tracked_matches()
            if not all_tracked:
                await asyncio.sleep(45)
                continue

            # 3. Build reverse index: match_id -> [(user_id, tracked_info)]
            match_users = _build_match_user_index(all_tracked)

            # 4. Check each live match for score changes
            for match in live_matches:
                fixture_id = match["id"]

                if fixture_id not in match_users:
                    continue

                current_home = match.get("goals", {}).get("home") or 0
                current_away = match.get("goals", {}).get("away") or 0
                current_status = match.get("status", "")

                prev = _last_scores.get(fixture_id)

                if prev is None:
                    # First time seeing this match - store baseline, don't notify
                    _last_scores[fixture_id] = {
                        "home": current_home,
                        "away": current_away,
                        "status": current_status,
                    }
                    continue

                prev_home = prev["home"]
                prev_away = prev["away"]
                prev_status = prev["status"]

                # --- GOAL DETECTION ---
                score_key = (fixture_id, current_home, current_away)
                if (current_home != prev_home or current_away != prev_away) \
                        and score_key not in _notified_scores:

                    _notified_scores.add(score_key)

                    for user_id, tracked_info in match_users[fixture_id]:
                        goal_type = _determine_goal_type(
                            tracked_info, current_home, current_away,
                            prev_home, prev_away,
                        )
                        title, message = _format_goal_notification(
                            match, tracked_info, goal_type,
                            current_home, current_away,
                        )
                        notif_image = GOAL_IMAGES.get(goal_type, GOAL_IMAGES["celebration"])
                        push_notifications.send_push_notification(
                            user_id=user_id,
                            notif_type="goal_scored",
                            title=title,
                            message=message,
                            metadata={
                                "fixture_id": fixture_id,
                                "home_goals": current_home,
                                "away_goals": current_away,
                                "goal_type": goal_type,
                            },
                            image=notif_image,
                            actions=[
                                {"action": "view", "title": "View Match"},
                                {"action": "dismiss", "title": "Dismiss"},
                            ],
                        )

                    print(f"[GoalMonitor] Goal in fixture {fixture_id}: "
                          f"{match['home_team']['name']} {current_home}-{current_away} "
                          f"{match['away_team']['name']} -> notified {len(match_users[fixture_id])} user(s)")

                # --- MATCH END DETECTION ---
                if current_status in FINISHED_STATUSES \
                        and prev_status not in FINISHED_STATUSES \
                        and fixture_id not in _notified_ended:

                    _notified_ended.add(fixture_id)

                    for user_id, tracked_info in match_users[fixture_id]:
                        end_type = _determine_end_type(
                            tracked_info, current_home, current_away,
                        )
                        title, message = _format_end_notification(
                            match, tracked_info, end_type,
                        )
                        notif_image = END_IMAGES.get(end_type, END_IMAGES["match_draw"])
                        push_notifications.send_push_notification(
                            user_id=user_id,
                            notif_type="match_ended",
                            title=title,
                            message=message,
                            metadata={
                                "fixture_id": fixture_id,
                                "home_goals": current_home,
                                "away_goals": current_away,
                                "end_type": end_type,
                            },
                            image=notif_image,
                            actions=[
                                {"action": "view", "title": "View Results"},
                                {"action": "dismiss", "title": "Dismiss"},
                            ],
                        )

                    print(f"[GoalMonitor] Match ended {fixture_id}: "
                          f"{match['home_team']['name']} {current_home}-{current_away} "
                          f"{match['away_team']['name']} ({current_status})")

                # Update stored scores
                _last_scores[fixture_id] = {
                    "home": current_home,
                    "away": current_away,
                    "status": current_status,
                }

            # 5. Cleanup: remove entries for matches no longer live
            live_ids = {m["id"] for m in live_matches}
            stale_ids = [fid for fid in _last_scores if fid not in live_ids]
            for fid in stale_ids:
                del _last_scores[fid]
                _notified_scores = {s for s in _notified_scores if s[0] != fid}
                _notified_ended.discard(fid)

        except Exception as e:
            import traceback
            print(f"[GoalMonitor] Error: {e}")
            traceback.print_exc()

        await asyncio.sleep(45)
