"""
Odds Analysis Module

Compares betting odds across bookmakers and identifies value bets.
Uses live odds from The Odds API when available, otherwise generates simulated odds.
"""

import random
import hashlib
import config

# Try to import the odds API module
try:
    import odds_api
    ODDS_API_AVAILABLE = True
except ImportError:
    ODDS_API_AVAILABLE = False
    print("Warning: odds_api module not available, using simulated odds")

BOOKMAKERS = ["Bet365", "William Hill", "Betway", "Paddy Power", "Sky Bet", "Betfair", "PokerStars", "888 Sports"]

# Track if using live odds
_using_live_odds = False


def is_using_live_odds():
    """Check if we're using live odds data."""
    return _using_live_odds


async def generate_odds_comparison_async(outcome, team_a_id, team_b_id, team_a_name=None, team_b_name=None):
    """
    Generate odds comparison with live data if available.

    Args:
        outcome: Prediction outcome with win probabilities
        team_a_id: Team A ID
        team_b_id: Team B ID
        team_a_name: Team A name (for API lookup)
        team_b_name: Team B name (for API lookup)
    """
    global _using_live_odds

    live_odds = None

    # Try to get live odds if API is available
    if ODDS_API_AVAILABLE and config.ODDS_API_KEY and team_a_name and team_b_name:
        try:
            live_odds = await odds_api.get_live_odds_for_match(team_a_name, team_b_name)
            if live_odds:
                _using_live_odds = True
                print(f"[OK] Using live odds for {team_a_name} vs {team_b_name}")
        except Exception as e:
            print(f"Failed to fetch live odds: {e}")

    if live_odds:
        return _process_live_odds(outcome, live_odds)
    else:
        _using_live_odds = False
        return generate_odds_comparison(outcome, team_a_id, team_b_id)


def _process_live_odds(outcome, live_odds):
    """Process live odds data into our standard format."""
    win_a_pct = outcome["team_a_win"]
    draw_pct = outcome["draw"]
    win_b_pct = outcome["team_b_win"]

    raw_outcomes = {
        "team_a_win": {"ai_prob": win_a_pct, "odds": [], "label": "Team A Win"},
        "draw":       {"ai_prob": draw_pct,  "odds": [], "label": "Draw"},
        "team_b_win": {"ai_prob": win_b_pct, "odds": [], "label": "Team B Win"},
    }

    # Process live odds for each outcome
    for key in ["team_a_win", "draw", "team_b_win"]:
        for bookie_odds in live_odds.get(key, []):
            odds_val = bookie_odds.get("odds", 0)
            if odds_val > 0:
                raw_outcomes[key]["odds"].append({
                    "bookmaker": bookie_odds.get("bookmaker", "Unknown"),
                    "odds": odds_val,
                    "implied_prob": round(100 / odds_val, 1),
                    "is_best": False,
                    "live": True,  # Mark as live odds
                })

    # If no live odds for an outcome, generate simulated ones
    seed = int(hashlib.md5(f"{win_a_pct}-{draw_pct}".encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    for key, data in raw_outcomes.items():
        if not data["odds"]:
            # Generate simulated odds as fallback
            ai_prob = data["ai_prob"]
            for bm in BOOKMAKERS[:4]:  # Use fewer bookmakers for simulated fallback
                margin = rng.uniform(1.04, 1.10)
                adj = rng.gauss(0, 0.02)
                impl = max(0.08, (ai_prob / 100) + adj)
                odds_val = round(margin / impl, 2)
                data["odds"].append({
                    "bookmaker": bm,
                    "odds": odds_val,
                    "implied_prob": round(100 / odds_val, 1),
                    "is_best": False,
                    "live": False,
                })

    return _finalize_odds_result(raw_outcomes, rng)


def generate_odds_comparison(outcome, team_a_id, team_b_id):
    """Generate simulated odds comparison (fallback when no live data)."""
    seed = int(hashlib.md5(f"{team_a_id}-{team_b_id}".encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    win_a_pct = outcome["team_a_win"]
    draw_pct = outcome["draw"]
    win_b_pct = outcome["team_b_win"]

    raw_outcomes = {
        "team_a_win": {"ai_prob": win_a_pct, "odds": [], "label": "Team A Win"},
        "draw":       {"ai_prob": draw_pct,  "odds": [], "label": "Draw"},
        "team_b_win": {"ai_prob": win_b_pct, "odds": [], "label": "Team B Win"},
    }

    for bm in BOOKMAKERS:
        margin = rng.uniform(1.04, 1.12)
        adj_a = rng.gauss(0, 0.025)
        adj_d = rng.gauss(0, 0.018)
        adj_b = rng.gauss(0, 0.025)

        impl_a = max(0.06, (win_a_pct / 100) + adj_a)
        impl_d = max(0.10, (draw_pct / 100) + adj_d)
        impl_b = max(0.06, (win_b_pct / 100) + adj_b)

        total = impl_a + impl_d + impl_b
        impl_a /= total
        impl_d /= total
        impl_b /= total

        odds_a = round(margin / impl_a, 2)
        odds_d = round(margin / impl_d, 2)
        odds_b = round(margin / impl_b, 2)

        raw_outcomes["team_a_win"]["odds"].append({
            "bookmaker": bm, "odds": odds_a,
            "implied_prob": round(100 / odds_a, 1), "is_best": False, "live": False
        })
        raw_outcomes["draw"]["odds"].append({
            "bookmaker": bm, "odds": odds_d,
            "implied_prob": round(100 / odds_d, 1), "is_best": False, "live": False
        })
        raw_outcomes["team_b_win"]["odds"].append({
            "bookmaker": bm, "odds": odds_b,
            "implied_prob": round(100 / odds_b, 1), "is_best": False, "live": False
        })

    return _finalize_odds_result(raw_outcomes, rng)


def _finalize_odds_result(raw_outcomes, rng):
    """Finalize the odds result with best odds identification and recommendations."""
    # Over/Under and BTTS (always simulated for now)
    over_under = []
    btts_odds = []
    for bm in BOOKMAKERS:
        over_under.append({
            "bookmaker": bm,
            "over_25": round(rng.uniform(1.55, 2.40), 2),
            "under_25": round(rng.uniform(1.70, 2.50), 2)
        })
        btts_odds.append({
            "bookmaker": bm,
            "yes": round(rng.uniform(1.80, 2.70), 2),
            "no": round(rng.uniform(1.60, 2.30), 2)
        })

    result = {
        "outcomes": {},
        "over_under": over_under,
        "btts": btts_odds,
        "recommendation": None,
        "using_live_odds": _using_live_odds,
    }

    best_edge = -999
    best_key = None

    for key, data in raw_outcomes.items():
        odds_list = data["odds"]

        if not odds_list:
            continue

        # Find best odds
        best_idx = max(range(len(odds_list)), key=lambda i: odds_list[i]["odds"])
        odds_list[best_idx]["is_best"] = True

        best_odds_val = odds_list[best_idx]["odds"]
        avg_odds = round(sum(o["odds"] for o in odds_list) / len(odds_list), 2)

        best_impl = 100 / best_odds_val
        edge = round(data["ai_prob"] - best_impl, 1)
        has_value = edge > 0

        # Value rating (1-5 stars)
        if edge >= 8:
            vr = 5
        elif edge >= 5:
            vr = 4
        elif edge >= 3:
            vr = 3
        elif edge >= 1:
            vr = 2
        else:
            vr = 1

        result["outcomes"][key] = {
            "label": data["label"],
            "ai_prob": data["ai_prob"],
            "odds": odds_list,
            "best_odds": best_odds_val,
            "best_bookmaker": odds_list[best_idx]["bookmaker"],
            "avg_odds": avg_odds,
            "value_edge": edge,
            "has_value": has_value,
            "value_rating": vr,
        }

        if edge > best_edge:
            best_edge = edge
            best_key = key

    if best_key:
        rec = result["outcomes"][best_key]
        result["recommendation"] = {
            "outcome": best_key,
            "label": rec["label"],
            "bookmaker": rec["best_bookmaker"],
            "odds": rec["best_odds"],
            "edge": rec["value_edge"],
            "has_value": rec["has_value"],
        }

    return result
