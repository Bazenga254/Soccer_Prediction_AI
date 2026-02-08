"""
Enhanced Match Prediction Engine

Uses comprehensive statistics from API-Football:
- Head-to-Head (H2H) history
- Recent form (WWDLW string)
- Home/Away performance
- Goals scored/conceded
- Goal difference and ratios
- League position

Weighted Algorithm:
- H2H History: 20%
- Recent Form: 25%
- Home/Away Performance: 20%
- Goals Analysis: 20%
- League Position: 15%
"""


def get_winner_id(match):
    """Determine winner of a match."""
    home_score = match.get("team_a_score") or match.get("home_score", 0)
    away_score = match.get("team_b_score") or match.get("away_score", 0)

    if home_score is None or away_score is None:
        return None

    if home_score > away_score:
        return match.get("team_a_id") or match.get("home_team_id")
    elif away_score > home_score:
        return match.get("team_b_id") or match.get("away_team_id")
    return None


def calculate_form_score(team):
    """
    Calculate form score from form string (e.g., 'WWDLW') or recent stats.
    Recent results weighted more heavily.
    """
    form_str = team.get("form", "")

    if form_str:
        # Weight recent results more (most recent = highest weight)
        weights = [1.5, 1.3, 1.1, 0.9, 0.7]  # Last 5 games
        score = 0
        total_weight = 0

        for i, result in enumerate(form_str[:5]):
            weight = weights[i] if i < len(weights) else 0.5
            if result == 'W':
                score += 3 * weight
            elif result == 'D':
                score += 1 * weight
            total_weight += weight

        return score / (total_weight * 3) if total_weight > 0 else 0.5

    # Fallback to recent_w/d/l stats
    recent_games = team.get("recent_w", 0) + team.get("recent_d", 0) + team.get("recent_l", 0)
    if recent_games > 0:
        points = (team.get("recent_w", 0) * 3) + team.get("recent_d", 0)
        return points / (recent_games * 3)

    return 0.5


def calculate_goals_strength(team, is_home):
    """
    Calculate offensive and defensive strength based on goals.
    """
    if is_home:
        goals_for = team.get("home_goals_for", team.get("goals_scored", 0) * 0.6)
        goals_against = team.get("home_goals_against", team.get("goals_conceded", 0) * 0.4)
        games = team.get("home_played", team.get("played", 1) // 2)
    else:
        goals_for = team.get("away_goals_for", team.get("goals_scored", 0) * 0.4)
        goals_against = team.get("away_goals_against", team.get("goals_conceded", 0) * 0.6)
        games = team.get("away_played", team.get("played", 1) // 2)

    games = max(1, games)

    # Goals per game
    gpg_for = goals_for / games
    gpg_against = goals_against / games

    # Offensive strength (higher is better)
    offensive = min(1.0, gpg_for / 2.5)  # Normalize to 0-1 (2.5 gpg = excellent)

    # Defensive strength (lower conceded is better)
    defensive = max(0, 1 - (gpg_against / 2.5))

    return {
        "offensive": offensive,
        "defensive": defensive,
        "combined": (offensive * 0.6 + defensive * 0.4)  # Offense weighted slightly more
    }


def calculate_h2h_advantage(h2h_matches, team_a_id, team_b_id):
    """
    Calculate head-to-head advantage with goal analysis.
    """
    if not h2h_matches:
        return {"a_rate": 0.33, "b_rate": 0.33, "draw_rate": 0.34, "total": 0,
                "a_wins": 0, "b_wins": 0, "draws": 0, "a_goals": 0, "b_goals": 0}

    a_wins = 0
    b_wins = 0
    draws = 0
    a_goals = 0
    b_goals = 0

    for match in h2h_matches:
        home_id = match.get("home_team_id")
        home_score = match.get("home_score", 0) or 0
        away_score = match.get("away_score", 0) or 0

        # Determine which team scored what
        if home_id == team_a_id:
            a_goals += home_score
            b_goals += away_score
            if home_score > away_score:
                a_wins += 1
            elif away_score > home_score:
                b_wins += 1
            else:
                draws += 1
        else:
            a_goals += away_score
            b_goals += home_score
            if away_score > home_score:
                a_wins += 1
            elif home_score > away_score:
                b_wins += 1
            else:
                draws += 1

    total = len(h2h_matches)

    return {
        "a_rate": a_wins / total if total > 0 else 0.33,
        "b_rate": b_wins / total if total > 0 else 0.33,
        "draw_rate": draws / total if total > 0 else 0.34,
        "total": total,
        "a_wins": a_wins,
        "b_wins": b_wins,
        "draws": draws,
        "a_goals": a_goals,
        "b_goals": b_goals,
        "a_avg_goals": a_goals / total if total > 0 else 0,
        "b_avg_goals": b_goals / total if total > 0 else 0,
    }


def predict_match_outcome(team_a, team_b, venue, h2h_matches):
    """
    Predict match outcome using weighted algorithm.

    Weights:
    - H2H History: 20%
    - Recent Form: 25%
    - Home/Away Performance: 20%
    - Goals Analysis: 20%
    - League Position: 15%
    """
    a_id = team_a["id"]
    b_id = team_b["id"]

    # Determine home/away
    a_is_home = venue == "team_a"
    b_is_home = venue == "team_b"

    # 1. Head-to-Head Analysis (20%)
    h2h = calculate_h2h_advantage(h2h_matches, a_id, b_id)

    # 2. Recent Form Analysis (25%)
    form_a = calculate_form_score(team_a)
    form_b = calculate_form_score(team_b)
    form_total = form_a + form_b
    form_rate_a = form_a / form_total if form_total > 0 else 0.5
    form_rate_b = form_b / form_total if form_total > 0 else 0.5

    # 3. Home/Away Performance (20%)
    if a_is_home:
        a_venue_total = team_a.get("home_wins", 0) + team_a.get("home_draws", 0) + team_a.get("home_losses", 0)
        venue_rate_a = team_a.get("home_wins", 0) / max(1, a_venue_total)
        b_venue_total = team_b.get("away_wins", 0) + team_b.get("away_draws", 0) + team_b.get("away_losses", 0)
        venue_rate_b = team_b.get("away_wins", 0) / max(1, b_venue_total)
    else:
        a_venue_total = team_a.get("away_wins", 0) + team_a.get("away_draws", 0) + team_a.get("away_losses", 0)
        venue_rate_a = team_a.get("away_wins", 0) / max(1, a_venue_total)
        b_venue_total = team_b.get("home_wins", 0) + team_b.get("home_draws", 0) + team_b.get("home_losses", 0)
        venue_rate_b = team_b.get("home_wins", 0) / max(1, b_venue_total)

    # 4. Goals Analysis (20%)
    goals_a = calculate_goals_strength(team_a, a_is_home)
    goals_b = calculate_goals_strength(team_b, b_is_home)
    goals_total = goals_a["combined"] + goals_b["combined"]
    goals_rate_a = goals_a["combined"] / goals_total if goals_total > 0 else 0.5
    goals_rate_b = goals_b["combined"] / goals_total if goals_total > 0 else 0.5

    # 5. League Position (15%)
    pos_a_raw = team_a.get("position") or 10
    pos_b_raw = team_b.get("position") or 10
    max_pos = max(20, pos_a_raw, pos_b_raw)
    pos_a = (max_pos - pos_a_raw + 1) / max_pos
    pos_b = (max_pos - pos_b_raw + 1) / max_pos
    pos_total = pos_a + pos_b
    pos_rate_a = pos_a / pos_total if pos_total > 0 else 0.5
    pos_rate_b = pos_b / pos_total if pos_total > 0 else 0.5

    # Calculate weighted win probabilities
    # H2H: 20%, Form: 25%, Venue: 20%, Goals: 20%, Position: 15%
    win_a_raw = (
        0.20 * h2h["a_rate"] +
        0.25 * form_rate_a +
        0.20 * venue_rate_a +
        0.20 * goals_rate_a +
        0.15 * pos_rate_a
    )

    win_b_raw = (
        0.20 * h2h["b_rate"] +
        0.25 * form_rate_b +
        0.20 * venue_rate_b +
        0.20 * goals_rate_b +
        0.15 * pos_rate_b
    )

    # Draw probability - influenced by H2H draws and close form
    form_diff = abs(form_a - form_b)
    draw_base = h2h["draw_rate"] if h2h["total"] > 0 else 0.28
    draw_form_bonus = 0.1 if form_diff < 0.15 else 0  # Close form = more draws
    draw_raw = draw_base + draw_form_bonus

    # Normalize probabilities
    total = win_a_raw + win_b_raw + draw_raw
    if total == 0:
        total = 1

    win_a_pct = (win_a_raw / total) * 100
    draw_pct = (draw_raw / total) * 100
    win_b_pct = (win_b_raw / total) * 100

    # Clamp draw to realistic range (15-35%)
    draw_pct = max(15, min(35, draw_pct))

    # Re-normalize wins around clamped draw
    remaining = 100 - draw_pct
    win_ratio = win_a_pct / max(0.001, (win_a_pct + win_b_pct))
    win_a_pct = round(remaining * win_ratio, 1)
    win_b_pct = round(remaining * (1 - win_ratio), 1)
    draw_pct = round(100 - win_a_pct - win_b_pct, 1)

    # Confidence level based on data quality
    if h2h["total"] >= 5:
        confidence = "High"
    elif h2h["total"] >= 3:
        confidence = "Medium"
    else:
        confidence = "Low"

    # Generate key factors
    factors = generate_key_factors(team_a, team_b, h2h, venue, form_a, form_b, goals_a, goals_b)

    return {
        "team_a_win": win_a_pct,
        "draw": draw_pct,
        "team_b_win": win_b_pct,
        "confidence": confidence,
        "key_factors": factors[:4],  # Top 4 factors
        "h2h_summary": {
            "a_wins": h2h["a_wins"],
            "b_wins": h2h["b_wins"],
            "draws": h2h["draws"],
            "total": h2h["total"],
            "a_goals": h2h["a_goals"],
            "b_goals": h2h["b_goals"],
        },
        "analysis": {
            "form_a": round(form_a * 100, 1),
            "form_b": round(form_b * 100, 1),
            "goals_strength_a": round(goals_a["combined"] * 100, 1),
            "goals_strength_b": round(goals_b["combined"] * 100, 1),
        }
    }


def generate_key_factors(team_a, team_b, h2h, venue, form_a, form_b, goals_a, goals_b):
    """Generate human-readable key factors for the prediction."""
    factors = []

    # H2H Factor
    if h2h["total"] >= 3:
        if h2h["a_wins"] > h2h["b_wins"] + 1:
            factors.append(f"{team_a['name']} dominant in H2H: {h2h['a_wins']} wins, {h2h['b_wins']} losses in last {h2h['total']} meetings")
        elif h2h["b_wins"] > h2h["a_wins"] + 1:
            factors.append(f"{team_b['name']} dominant in H2H: {h2h['b_wins']} wins, {h2h['a_wins']} losses in last {h2h['total']} meetings")
        elif h2h["draws"] >= h2h["total"] * 0.4:
            factors.append(f"High draw rate in H2H: {h2h['draws']} draws in last {h2h['total']} meetings")

        # Goals in H2H
        avg_goals = (h2h["a_goals"] + h2h["b_goals"]) / max(1, h2h["total"])
        if avg_goals >= 3.0:
            factors.append(f"High-scoring H2H history: {avg_goals:.1f} goals per game average")

    # Form Factor
    form_str_a = team_a.get("form", "")
    form_str_b = team_b.get("form", "")

    if form_a >= 0.7:
        recent_wins = form_str_a.count('W') if form_str_a else team_a.get("recent_w", 0)
        factors.append(f"{team_a['name']} in excellent form: {recent_wins} wins in recent matches")
    elif form_a <= 0.3:
        recent_losses = form_str_a.count('L') if form_str_a else team_a.get("recent_l", 0)
        factors.append(f"{team_a['name']} struggling: {recent_losses} losses in recent matches")

    if form_b >= 0.7:
        recent_wins = form_str_b.count('W') if form_str_b else team_b.get("recent_w", 0)
        factors.append(f"{team_b['name']} in excellent form: {recent_wins} wins in recent matches")
    elif form_b <= 0.3:
        recent_losses = form_str_b.count('L') if form_str_b else team_b.get("recent_l", 0)
        factors.append(f"{team_b['name']} struggling: {recent_losses} losses in recent matches")

    # Home/Away Factor
    if venue == "team_a":
        home_wins = team_a.get("home_wins", 0)
        home_games = team_a.get("home_played", home_wins + team_a.get("home_draws", 0) + team_a.get("home_losses", 0))
        if home_games > 0 and home_wins / home_games >= 0.65:
            factors.append(f"{team_a['name']} strong at home: {home_wins} wins in {home_games} home matches")
    else:
        away_wins = team_b.get("away_wins", 0)
        away_games = team_b.get("away_played", away_wins + team_b.get("away_draws", 0) + team_b.get("away_losses", 0))
        if away_games > 0 and away_wins / away_games >= 0.5:
            factors.append(f"{team_b['name']} good away form: {away_wins} wins in {away_games} away matches")

    # Goals Factor
    if goals_a["offensive"] >= 0.7 and goals_b["defensive"] <= 0.4:
        factors.append(f"{team_a['name']}'s attack vs {team_b['name']}'s vulnerable defense is a key matchup")
    elif goals_b["offensive"] >= 0.7 and goals_a["defensive"] <= 0.4:
        factors.append(f"{team_b['name']}'s attack vs {team_a['name']}'s vulnerable defense is a key matchup")

    # Position Factor
    pa_pos = team_a.get("position") or 10
    pb_pos = team_b.get("position") or 10
    pos_diff = abs(pa_pos - pb_pos)
    if pos_diff >= 5:
        better = team_a if pa_pos < pb_pos else team_b
        worse = team_b if better == team_a else team_a
        bp = better.get("position") or 10
        wp = worse.get("position") or 10
        factors.append(f"League position gap: {better['name']} ({bp}th) vs {worse['name']} ({wp}th)")

    # Default factor if none generated
    if not factors:
        factors.append(f"Analysis based on current season statistics and {h2h['total']} head-to-head records")

    return factors
