def analyze_players(players, team):
    analyzed = []
    for p in players:
        games = max(1, p.get("games_played", 0))
        goals = p.get("goals", 0) or 0
        assists = p.get("assists", 0) or 0
        minutes = p.get("minutes_played", 0) or 0
        shots = p.get("shots", 0) or 0
        shots_on = p.get("shots_on_target", 0) or 0
        key_passes = p.get("key_passes", 0) or 0
        clean_sheets = p.get("clean_sheets", 0) or 0
        yellow = p.get("yellow_cards", 0) or 0
        red = p.get("red_cards", 0) or 0
        position = p.get("position", "MID")

        scoring_prob = round(min((goals / games) * 100, 95), 1)
        assist_prob = round(min((assists / games) * 100, 95), 1)

        wins_with = p.get("team_wins_with", 0) or 0
        games_with = max(1, p.get("team_games_with", 1) or 1)
        wins_without = p.get("team_wins_without", 0) or 0
        games_without = max(1, p.get("team_games_without", 1) or 1)
        win_rate_with = wins_with / games_with
        win_rate_without = wins_without / games_without
        team_boost = round((win_rate_with - win_rate_without) * 100, 1)

        total_cards = yellow + red * 3
        card_risk_prob = round(min((total_cards / games) * 100, 90), 1)
        card_risk = "Low" if card_risk_prob < 15 else ("Medium" if card_risk_prob < 35 else "High")

        clean_sheet_rate = 0
        if position in ("DEF", "GK") and clean_sheets > 0:
            clean_sheet_rate = round((clean_sheets / games) * 100, 1)

        shot_accuracy = round((shots_on / shots) * 100, 1) if shots > 0 else 0

        # Impact Score (0-10)
        goals_90 = (goals / max(1, minutes)) * 90
        assists_90 = (assists / max(1, minutes)) * 90
        offense_base = min(goals_90 * 2.5 + assists_90 * 1.5, 6.0)

        # Use rating from API if available for better impact estimation
        rating = p.get("rating", 0) or 0
        if rating >= 7.0:
            impact_raw = min((rating - 6.0) * 1.5, 3.0)
        else:
            impact_raw = max(0, team_boost / 10)
            impact_raw = min(impact_raw, 3.0)

        defense_contrib = min(clean_sheet_rate / 50, 2.0) if position in ("DEF", "GK") else 0
        kp_contrib = min((key_passes / games) / 30, 1.0) if position == "MID" else 0
        raw_score = offense_base + impact_raw + defense_contrib + kp_contrib
        impact_score = round(min(10.0, max(1.0, raw_score)), 1)

        analyzed.append({
            "id": p.get("id"),
            "name": p.get("name"),
            "photo": p.get("photo"),
            "position": position,
            "shirt_number": p.get("shirt_number", 0),
            "team": team.get("name", ""),
            "goals": goals,
            "assists": assists,
            "games_played": games,
            "scoring_prob": scoring_prob,
            "assist_prob": assist_prob,
            "team_boost": team_boost,
            "card_risk": card_risk,
            "card_risk_prob": card_risk_prob,
            "clean_sheet_rate": clean_sheet_rate,
            "shot_accuracy": shot_accuracy,
            "impact_score": impact_score,
            "key_passes_per_game": round(key_passes / games, 1),
            "rating": rating,
        })

    analyzed.sort(key=lambda x: x["impact_score"], reverse=True)
    return analyzed[:5]
