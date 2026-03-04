"""
Re-engagement email system for inactive users.
Generates daily emails featuring real upcoming matches from big leagues.
Creates pending broadcasts for admin to review/edit/approve.
"""

import random
from datetime import datetime, timedelta

# Big leagues to feature in re-engagement emails
BIG_LEAGUE_IDS = {39, 140, 78, 135, 61, 2, 3}  # PL, La Liga, BL, Serie A, Ligue 1, UCL, UEL

LEAGUE_NAMES = {
    39: "Premier League", 140: "La Liga", 78: "Bundesliga",
    135: "Serie A", 61: "Ligue 1", 2: "Champions League", 3: "Europa League",
}


def _format_kickoff(date_str):
    """Format ISO date to readable kickoff time (EAT = UTC+3)."""
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00")) if "Z" in date_str else datetime.fromisoformat(date_str)
        dt = dt + timedelta(hours=3)  # Convert to EAT
        return dt.strftime("%I:%M %p EAT")
    except Exception:
        return "TBD"


def _format_date_short(date_str):
    """Format ISO date to short date like 'Wed, Mar 5'."""
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00")) if "Z" in date_str else datetime.fromisoformat(date_str)
        return dt.strftime("%a, %b %-d")
    except Exception:
        return ""


def _build_match_cards_html(matches):
    """Build HTML match cards for email."""
    if not matches:
        return ""
    cards = ""
    for m in matches[:3]:
        league = m.get("competition", {}).get("name", "League")
        home = m.get("home_team", {}).get("name", "Home")
        away = m.get("away_team", {}).get("name", "Away")
        kickoff = _format_kickoff(m.get("date", ""))
        date_short = _format_date_short(m.get("date", ""))

        cards += f"""
        <div style="background: #1e293b; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px;">
            <div style="font-size: 11px; color: #64748b; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">{league}</div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #f1f5f9; font-size: 15px; font-weight: 600;">{home}</span>
                <span style="color: #64748b; font-size: 12px; padding: 0 8px;">vs</span>
                <span style="color: #f1f5f9; font-size: 15px; font-weight: 600;">{away}</span>
            </div>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 6px;">{date_short} &bull; {kickoff}</div>
        </div>"""
    return cards


def _wrap_email(greeting, hook, match_cards, cta_text="See AI Predictions"):
    """Wrap content in the standard dark theme email template."""
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;
                background: #0f172a; color: #f1f5f9; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 48px;">&#9917;</span>
        </div>
        <p style="color: #f1f5f9; font-size: 16px;">Hey {greeting},</p>
        {hook}
        <div style="margin: 20px 0;">
            {match_cards}
        </div>
        <div style="text-align: center; margin: 28px 0;">
            <a href="https://www.spark-ai-prediction.com"
               style="display: inline-block; background: #3b82f6; color: #ffffff;
                      text-decoration: none; padding: 14px 36px; border-radius: 8px;
                      font-weight: bold; font-size: 16px;">
                {cta_text}
            </a>
        </div>
        <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;" />
        <p style="color: #475569; font-size: 11px; text-align: center;">
            You're receiving this because you haven't visited Spark AI recently.
            We thought you'd want to know about these upcoming matches.
        </p>
    </div>"""


# ═══════════════════════════════════════════════════════
# 10 EMAIL TEMPLATES — each returns {subject, html_body}
# ═══════════════════════════════════════════════════════

def template_big_match_alert(greeting, matches):
    top = matches[0] if matches else {}
    home = top.get("home_team", {}).get("name", "a top team")
    away = top.get("away_team", {}).get("name", "their rivals")
    hook = f"""
        <p style="color: #94a3b8;">There's a massive match coming up and we didn't want you to miss it!</p>
        <p style="color: #f59e0b; font-weight: 700; font-size: 18px; text-align: center; margin: 16px 0;">
            {home} vs {away}
        </p>
        <p style="color: #94a3b8;">Our AI has already analyzed this fixture. Come see what we predict!</p>
    """
    return {
        "subject": f"Big Match Alert: {home} vs {away} - Spark AI",
        "html_body": _wrap_email(greeting, hook, _build_match_cards_html(matches)),
    }


def template_rivalry_showdown(greeting, matches):
    hook = """
        <p style="color: #94a3b8;">The football world is heating up with some incredible rivalries this week. These are the matches you <strong style="color: #f1f5f9;">don't want to miss</strong>.</p>
        <p style="color: #94a3b8;">Our AI prediction engine has crunched the numbers on every fixture. Who comes out on top?</p>
    """
    return {
        "subject": "Rivalry Showdown: Top Matches This Week - Spark AI",
        "html_body": _wrap_email(greeting, hook, _build_match_cards_html(matches)),
    }


def template_weekend_preview(greeting, matches):
    hook = """
        <p style="color: #94a3b8;">The weekend is packed with football action across Europe's top leagues! Here's a taste of what's coming up.</p>
        <p style="color: #94a3b8;">Our AI has predictions ready for <strong style="color: #22c55e;">every single match</strong>. Don't go in blind.</p>
    """
    return {
        "subject": "Weekend Football Preview - Spark AI",
        "html_body": _wrap_email(greeting, hook, _build_match_cards_html(matches)),
    }


def template_midweek_action(greeting, matches):
    hook = """
        <p style="color: #94a3b8;">Midweek football is here! While others are sleeping on these fixtures, our AI has found some great opportunities.</p>
        <p style="color: #94a3b8;">Check out the matches and see what our prediction engine says.</p>
    """
    return {
        "subject": "Midweek Football Action - Don't Miss These Matches",
        "html_body": _wrap_email(greeting, hook, _build_match_cards_html(matches)),
    }


def template_dont_miss_out(greeting, matches):
    hook = """
        <p style="color: #94a3b8;">While you've been away, our community has been making accurate predictions and winning big.</p>
        <p style="color: #94a3b8;">There are some <strong style="color: #f59e0b;">fantastic matches</strong> coming up — and our AI analysis is ready for you. Don't get left behind!</p>
    """
    return {
        "subject": "You're Missing Out on These Matches - Spark AI",
        "html_body": _wrap_email(greeting, hook, _build_match_cards_html(matches), "Catch Up Now"),
    }


def template_predictions_await(greeting, matches):
    hook = f"""
        <p style="color: #94a3b8;">It's been a while since your last visit, {greeting}. Your prediction dashboard is waiting for you!</p>
        <p style="color: #94a3b8;">With these exciting fixtures lined up, now is the perfect time to jump back in and test your football knowledge against our AI.</p>
    """
    return {
        "subject": f"{greeting}, Your Predictions Are Waiting - Spark AI",
        "html_body": _wrap_email(greeting, hook, _build_match_cards_html(matches), "Make Your Predictions"),
    }


def template_league_spotlight(greeting, matches):
    # Find the most represented league in matches
    league_counts = {}
    for m in matches:
        league = m.get("competition", {}).get("name", "")
        if league:
            league_counts[league] = league_counts.get(league, 0) + 1
    top_league = max(league_counts, key=league_counts.get) if league_counts else "Europe's Top Leagues"

    hook = f"""
        <p style="color: #94a3b8;">The <strong style="color: #f1f5f9;">{top_league}</strong> has some unmissable fixtures coming up. Our AI has been analyzing form, stats, and trends to give you the edge.</p>
        <p style="color: #94a3b8;">Here are the top matches to watch:</p>
    """
    return {
        "subject": f"{top_league} Spotlight: Matches You Can't Miss",
        "html_body": _wrap_email(greeting, hook, _build_match_cards_html(matches)),
    }


def template_upset_alert(greeting, matches):
    hook = """
        <p style="color: #94a3b8;">Our AI is detecting some <strong style="color: #ef4444;">potential upsets</strong> in this week's fixtures. The underdogs might just surprise everyone.</p>
        <p style="color: #94a3b8;">Come see which matches have the highest upset potential according to our analysis.</p>
    """
    return {
        "subject": "Upset Alert: Surprise Results Predicted - Spark AI",
        "html_body": _wrap_email(greeting, hook, _build_match_cards_html(matches), "See Upset Predictions"),
    }


def template_goal_fest(greeting, matches):
    hook = """
        <p style="color: #94a3b8;">Looking for high-scoring action? Our AI analysis shows these upcoming matches have all the ingredients for a <strong style="color: #22c55e;">goal fest</strong>!</p>
        <p style="color: #94a3b8;">Check out the full breakdown and predictions:</p>
    """
    return {
        "subject": "Goal Fest Expected: High-Scoring Matches Ahead",
        "html_body": _wrap_email(greeting, hook, _build_match_cards_html(matches)),
    }


def template_champions_clash(greeting, matches):
    hook = """
        <p style="color: #94a3b8;">It's a clash of the titans! The top teams in Europe are going head-to-head and our AI prediction engine has the verdict.</p>
        <p style="color: #94a3b8;">Don't miss your chance to see the analysis before kickoff:</p>
    """
    return {
        "subject": "Champions Clash: Top Teams Battle It Out - Spark AI",
        "html_body": _wrap_email(greeting, hook, _build_match_cards_html(matches)),
    }


ALL_TEMPLATES = [
    template_big_match_alert,
    template_rivalry_showdown,
    template_weekend_preview,
    template_midweek_action,
    template_dont_miss_out,
    template_predictions_await,
    template_league_spotlight,
    template_upset_alert,
    template_goal_fest,
    template_champions_clash,
]

TEMPLATE_META = [
    {"name": "Big Match Alert", "description": "Highlights a single marquee fixture to draw users back with a specific match they won't want to miss.", "sample_subject": "Big Match Alert: [Home] vs [Away] - Spark AI", "cta_text": "See AI Predictions"},
    {"name": "Rivalry Showdown", "description": "Emphasizes heated rivalries and big derby matches happening this week.", "sample_subject": "Rivalry Showdown: Top Matches This Week - Spark AI", "cta_text": "See AI Predictions"},
    {"name": "Weekend Preview", "description": "Previews the weekend's football action across all top European leagues.", "sample_subject": "Weekend Football Preview - Spark AI", "cta_text": "See AI Predictions"},
    {"name": "Midweek Action", "description": "Targets midweek fixtures with a sense of hidden-gem opportunities others are sleeping on.", "sample_subject": "Midweek Football Action - Don't Miss These Matches", "cta_text": "See AI Predictions"},
    {"name": "Don't Miss Out", "description": "Uses FOMO — the community is making accurate predictions while you've been away.", "sample_subject": "You're Missing Out on These Matches - Spark AI", "cta_text": "Catch Up Now"},
    {"name": "Predictions Await", "description": "Personal tone with the user's name, reminding them their dashboard is waiting.", "sample_subject": "[Name], Your Predictions Are Waiting - Spark AI", "cta_text": "Make Your Predictions"},
    {"name": "League Spotlight", "description": "Spotlights the most-represented league in upcoming fixtures for focused appeal.", "sample_subject": "[League] Spotlight: Matches You Can't Miss", "cta_text": "See AI Predictions"},
    {"name": "Upset Alert", "description": "Teases potential upsets detected by the AI, creating curiosity and urgency.", "sample_subject": "Upset Alert: Surprise Results Predicted - Spark AI", "cta_text": "See Upset Predictions"},
    {"name": "Goal Fest", "description": "Promises high-scoring matches for users who love goals and action.", "sample_subject": "Goal Fest Expected: High-Scoring Matches Ahead", "cta_text": "See AI Predictions"},
    {"name": "Champions Clash", "description": "Positions matches as titan-vs-titan clashes for maximum prestige appeal.", "sample_subject": "Champions Clash: Top Teams Battle It Out - Spark AI", "cta_text": "See AI Predictions"},
]


# ═══════════════════════════════════════════════════════
# MAIN GENERATOR
# ═══════════════════════════════════════════════════════

async def get_big_league_fixtures(days=3):
    """Fetch upcoming fixtures from big leagues only."""
    import football_api
    all_fixtures = await football_api.fetch_all_upcoming_fixtures(days=days)
    # Filter to big leagues and not-started matches only
    big_matches = [
        f for f in all_fixtures
        if f.get("competition", {}).get("id") in BIG_LEAGUE_IDS
        or f.get("status") in ("NS", "TBD")
    ]
    # Sort by league priority: PL first, then La Liga, etc.
    priority = {39: 1, 140: 2, 78: 3, 135: 4, 61: 5, 2: 0, 3: 6}
    big_matches.sort(key=lambda m: priority.get(m.get("competition", {}).get("id", 999), 99))
    return big_matches


async def generate_reengagement_broadcast():
    """Generate a re-engagement broadcast with real match data for admin approval."""
    import user_auth
    import community

    # Check if there's already a pending reengagement broadcast
    existing = community.get_broadcasts(status_filter="pending_approval", limit=50)
    for b in existing:
        if b.get("target_type") == "inactive":
            print("[INFO] Reengagement: pending broadcast already exists, skipping generation")
            return None

    # Get inactive users
    inactive_users = user_auth.get_inactive_users(days=2)
    if not inactive_users:
        print("[INFO] Reengagement: no inactive users found")
        return None

    # Get upcoming big-league matches
    matches = await get_big_league_fixtures(days=3)
    if not matches:
        print("[INFO] Reengagement: no big-league fixtures found")
        return None

    # Pick a random template
    template_fn = random.choice(ALL_TEMPLATES)
    result = template_fn("there", matches)  # "there" as placeholder — real names used at send time

    # Build a text summary of featured matches for admin preview
    match_summary_lines = []
    for m in matches[:3]:
        league = m.get("competition", {}).get("name", "")
        home = m.get("home_team", {}).get("name", "")
        away = m.get("away_team", {}).get("name", "")
        kickoff = _format_kickoff(m.get("date", ""))
        match_summary_lines.append(f"{league}: {home} vs {away} ({kickoff})")
    match_summary = "\n".join(match_summary_lines)

    # Store template index so we can regenerate with real names at send time
    template_idx = ALL_TEMPLATES.index(template_fn)

    # Create pending broadcast
    broadcast_result = community.create_broadcast(
        sender_id=0,
        sender_name="System (Auto)",
        title=result["subject"],
        message=f"[TEMPLATE:{template_idx}]\n---\nFeatured Matches:\n{match_summary}\n---\nInactive users: {len(inactive_users)}",
        auto_approve=False,
        channel="email",
        target_type="inactive",
    )

    print(f"[INFO] Reengagement broadcast created: {broadcast_result}")
    return broadcast_result
