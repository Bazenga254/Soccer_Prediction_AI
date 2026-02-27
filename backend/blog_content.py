"""
Blog article content for Spark AI platform.
Stores articles as seed content (same pattern as docs_content.py).
"""

BLOG_ARTICLES = [
    {
        "slug": "how-ai-predicts-soccer-matches",
        "title": "How AI Predicts Soccer Matches: The Science Behind Spark AI",
        "excerpt": "Discover how machine learning models analyze team form, head-to-head records, and player data to predict soccer match outcomes with high accuracy.",
        "category": "guides",
        "tags": ["ai", "machine-learning", "predictions", "technology"],
        "published_at": "2026-01-15",
        "updated_at": "2026-02-27",
        "body": """## How AI Predicts Soccer Matches

Soccer prediction has evolved far beyond gut feeling and simple statistics. At Spark AI, we use advanced algorithms that analyze multiple data points to generate accurate match predictions across 50+ leagues worldwide.

### The Data We Analyze

Our AI prediction model processes several key data sources for every match:

**Team Form Analysis**
We track each team's recent results across their last 5-10 matches, converting win/draw/loss sequences into numerical form ratings. A team on a 5-game winning streak will have a significantly different form score than one that has lost 3 of their last 5.

**Head-to-Head Records**
Historical matchups between two teams reveal important patterns. Some teams consistently perform well against specific opponents regardless of current form. Our model analyzes goals scored, wins, draws, and losses in previous meetings.

**Home and Away Performance**
Home advantage is real in football. Some teams are nearly unbeatable at home but struggle away. Our model weighs home/away performance separately to account for this significant factor.

**Goal Scoring and Conceding Patterns**
We analyze each team's attacking strength and defensive record. A team that scores 2+ goals per game but concedes frequently will produce different predictions than a defensively solid team that wins 1-0 regularly.

**League Position and Context**
Where teams sit in the table matters. A relegation battle produces different dynamics than a mid-table match with nothing at stake. Our model factors in league position and what's at stake for each team.

### Our Prediction Algorithm

Spark AI uses a weighted multi-factor algorithm:

- **25% Team Form** - Recent results and momentum
- **20% Head-to-Head** - Historical matchup data
- **20% Home/Away Factor** - Venue-specific performance
- **20% Goals Analysis** - Scoring and conceding patterns
- **15% League Position** - Table standing and context

These weights have been calibrated through analysis of thousands of historical matches to find the optimal balance.

### Confidence Scores Explained

Every prediction comes with a confidence level:

- **High Confidence**: Strong data alignment across all factors. The model sees clear patterns pointing to one outcome.
- **Medium Confidence**: Most factors agree but some uncertainty exists. Common for evenly-matched teams.
- **Low Confidence**: Limited data or conflicting signals. Proceed with caution on these predictions.

### Real-Time Data Verification

Beyond our core algorithm, Spark AI uses Google's Gemini AI to verify real-time factors like injuries, transfers, and managerial changes. A key player injury announced hours before kickoff can shift probabilities significantly.

### Getting Started

Ready to see AI predictions in action? [Sign up for free](https://spark-ai-prediction.com) and get 3 match analyses per day. Upgrade to Pro for unlimited access and advanced analytics.
""",
    },
    {
        "slug": "premier-league-betting-tips-guide",
        "title": "Premier League Betting Tips: A Complete Guide for 2025-26",
        "excerpt": "Expert betting tips for the Premier League season. Learn strategies for match result, over/under, and BTTS markets using AI-powered analysis.",
        "category": "tips",
        "tags": ["premier-league", "betting-tips", "strategy", "epl"],
        "published_at": "2026-01-20",
        "updated_at": "2026-02-27",
        "body": """## Premier League Betting Tips: Complete Guide

The Premier League is the most-watched football league in the world, and it offers excellent opportunities for informed betting. Here's how to use AI analysis to make smarter predictions.

### Understanding the EPL Landscape

The Premier League is uniquely competitive. Unlike leagues dominated by 1-2 teams, the EPL regularly produces upsets. This means:

- **Favorites don't always win** - Even the top 4 teams lose regularly
- **Home advantage matters** - Teams like Newcastle and Aston Villa are significantly stronger at home
- **Form cycles are real** - Teams go through patches of brilliant and poor form

### Key Betting Markets

**Match Result (1X2)**
The bread and butter of football betting. AI analysis excels here because it weighs multiple factors simultaneously. Look for matches where our model shows 60%+ probability for one outcome.

**Over/Under 2.5 Goals**
This market depends heavily on the playing styles of both teams. Teams like Manchester City and Liverpool tend to produce high-scoring games, while defensive teams like Everton often feature in low-scoring matches.

**Both Teams to Score (BTTS)**
BTTS is about defensive vulnerability. When two teams with leaky defences meet, BTTS Yes is often a strong pick. Our AI model analyzes goals conceded patterns to identify these opportunities.

### Strategies That Work

1. **Follow the form, not the name** - A struggling big team is still struggling. Don't bet on reputation alone.
2. **Check our confidence scores** - High-confidence predictions have a better track record.
3. **Consider the fixture context** - Teams in cup competitions mid-week may rotate squads.
4. **Use odds comparison** - Spark AI Pro shows odds from multiple bookmakers to find the best value.

### Common Mistakes to Avoid

- Betting on every match instead of being selective
- Ignoring team news and injuries
- Chasing losses with bigger stakes
- Not considering the draw as a valid outcome

### Using Spark AI for EPL Predictions

Spark AI covers every Premier League match with detailed analysis including:
- Win/draw/loss probabilities
- Key factors affecting the match
- Head-to-head statistics
- Player impact ratings (Pro feature)
- Risk assessment

[Get started with free daily Premier League predictions](https://spark-ai-prediction.com/predictions/premier-league)
""",
    },
    {
        "slug": "understanding-over-under-betting",
        "title": "Understanding Over/Under 2.5 Goals Betting: Complete Guide",
        "excerpt": "A comprehensive guide to over/under 2.5 goals betting. Learn when to bet over or under based on team statistics and AI-driven analysis.",
        "category": "guides",
        "tags": ["over-under", "betting-guide", "goals", "strategy"],
        "published_at": "2026-01-25",
        "updated_at": "2026-02-27",
        "body": """## Understanding Over/Under 2.5 Goals

Over/Under 2.5 goals is one of the most popular football betting markets. It's simple: will there be 3 or more goals (Over) or 2 or fewer goals (Under) in the match?

### Why 2.5 Goals?

The 2.5 line is the most common because it sits close to the average goals per game across major leagues. In the Premier League, the average is around 2.7 goals per match, making this a balanced market.

### When to Bet Over 2.5

Look for these signals:
- **Both teams have high scoring averages** (1.5+ goals per game each)
- **Both teams concede frequently** (1+ goals conceded per game)
- **Historical H2H shows high-scoring matches**
- **Teams are chasing results** (relegation battles, title races)
- **Derby matches** (often emotional and open)

### When to Bet Under 2.5

These factors point to low-scoring games:
- **At least one team is defensively strong** (under 1 goal conceded per game)
- **Teams have nothing to play for** (mid-table with no pressure)
- **Poor weather conditions**
- **Teams with cautious managers** who prioritize not losing

### League-by-League Trends

Not all leagues are equal for goals:

- **Bundesliga**: Historically the highest-scoring top league (~3.1 goals per game)
- **Eredivisie**: Another high-scoring league (~3.0 goals per game)
- **Serie A**: Traditionally more defensive (~2.5 goals per game)
- **Ligue 1**: Can vary widely, PSG matches inflate the average

### How Spark AI Helps

Our AI model analyzes goal-scoring and conceding patterns for both teams. When you view a match prediction, look at:

- **Goals Strength scores** for each team
- **H2H goal averages** in previous meetings
- **Key factors** that mention attacking or defensive tendencies

This data helps you make informed Over/Under decisions rather than guessing.

### Pro Tip

Combine Over/Under with BTTS for stronger predictions. If our model shows both teams scoring frequently, Over 2.5 + BTTS Yes can be a powerful combination.
""",
    },
    {
        "slug": "btts-both-teams-to-score-strategy",
        "title": "BTTS (Both Teams to Score) Strategy Guide",
        "excerpt": "Master the BTTS market with data-driven strategies. Learn which leagues, teams, and conditions offer the best BTTS value using AI analysis.",
        "category": "tips",
        "tags": ["btts", "strategy", "betting", "both-teams-to-score"],
        "published_at": "2026-02-01",
        "updated_at": "2026-02-27",
        "body": """## BTTS Strategy Guide: Both Teams to Score

The BTTS market asks a simple question: will both teams score at least one goal? It's independent of who wins, making it a popular choice for bettors.

### What Makes BTTS Attractive

- **Doesn't depend on the winner** - You just need both teams to find the net
- **Often available at good odds** - Bookmakers sometimes undervalue BTTS Yes
- **Clear data analysis** - Teams' scoring and conceding records directly inform this market

### Key Statistics to Analyze

**For BTTS Yes:**
- Team A's scoring rate (% of games they score in)
- Team B's scoring rate
- Team A's conceding rate (% of games they concede in)
- Team B's conceding rate

If both teams score in 70%+ of their games AND concede in 70%+ of their games, BTTS Yes has strong support.

**For BTTS No:**
- One team has an excellent defensive record (clean sheets in 40%+ games)
- One team struggles to score (failing to score in 30%+ games)

### Best Leagues for BTTS

Based on our analysis across 50+ leagues:

1. **Bundesliga** - Highest BTTS Yes rate among top leagues
2. **Eredivisie** - Dutch football is open and attacking
3. **Premier League** - Competitive matches often see both teams score
4. **Belgian Pro League** - Another league with attacking tendencies

### Worst Leagues for BTTS

- **Serie A** - Italian football can be tactically defensive
- **Ligue 1** - Many one-sided matches when PSG play smaller teams

### Using AI to Find BTTS Value

On Spark AI, check these indicators for each match:
- **Goals Strength** ratings for both teams
- **H2H summary** - Did both teams score in previous meetings?
- **Risk factors** - Injuries to key attackers reduce scoring likelihood
- **Form analysis** - A team that hasn't scored in 3 games is risky for BTTS Yes

### Accumulator Strategy

BTTS is excellent for accumulators because:
- Individual selections have high hit rates (55-65% for well-chosen matches)
- Odds combine nicely across 3-5 matches
- You can mix leagues and kickoff times

Our [Jackpot Analyzer](https://spark-ai-prediction.com) tool is perfect for building BTTS accumulators with AI-backed selections.
""",
    },
    {
        "slug": "best-leagues-for-value-betting",
        "title": "Best Leagues for Value Betting in 2026",
        "excerpt": "Which soccer leagues offer the best value betting opportunities? We analyze 50+ leagues to find where AI predictions outperform bookmaker odds.",
        "category": "analysis",
        "tags": ["value-betting", "leagues", "strategy", "odds"],
        "published_at": "2026-02-05",
        "updated_at": "2026-02-27",
        "body": """## Best Leagues for Value Betting

Value betting is about finding matches where bookmaker odds underestimate the true probability of an outcome. Not all leagues are equal - some offer significantly more value than others.

### What is Value Betting?

A value bet exists when the implied probability from the odds is lower than the actual probability. For example:
- Bookmaker odds of 2.50 imply a 40% probability
- Our AI model calculates a 55% probability
- This is a value bet with a positive expected value

### Most Value-Rich Leagues

Based on our analysis of thousands of predictions across 50+ leagues:

**1. Championship (England)**
The second tier of English football is incredibly unpredictable. Bookmakers often struggle with the high variance, creating value opportunities.

**2. Eredivisie (Netherlands)**
Fewer casual bettors follow the Dutch league, meaning odds are sometimes less sharp than for the Premier League.

**3. Brazilian Serie A**
South American leagues have more variance and less bookmaker attention, creating regular value opportunities.

**4. Turkish Super Lig**
Volatile results and passionate fans create unique dynamics that algorithms can exploit.

**5. Belgian Pro League**
A smaller league where data-driven approaches have an edge over bookmaker models.

### Leagues with Less Value

**Premier League** and **La Liga** are the most efficiently priced markets. Bookmakers invest heavily in these leagues, making it harder (but not impossible) to find value.

### How to Spot Value with Spark AI

1. **Compare our probabilities with bookmaker odds** - Use the Odds Comparison feature (Pro)
2. **Look for confidence/odds mismatches** - When our model is "High Confidence" but odds suggest uncertainty
3. **Focus on specific markets** - Value often exists in BTTS and Over/Under rather than 1X2
4. **Track your results** - Use the Track Record feature to monitor your success rate

### Long-Term Approach

Value betting is a marathon, not a sprint. Key principles:
- Never risk more than 2-5% of your bankroll on a single bet
- Keep detailed records of all bets
- Focus on positive expected value, not short-term results
- Trust the data over emotions

[Start finding value bets with Spark AI's Odds Comparison tool](https://spark-ai-prediction.com)
""",
    },
    {
        "slug": "soccer-predictions-today-how-to-use",
        "title": "Soccer Predictions Today: How to Use AI Daily Picks",
        "excerpt": "Learn how to use Spark AI's daily soccer predictions effectively. Understand confidence scores, key factors, and how to combine picks for maximum value.",
        "category": "guides",
        "tags": ["predictions", "daily-picks", "how-to", "soccer-tips"],
        "published_at": "2026-02-10",
        "updated_at": "2026-02-27",
        "body": """## How to Use AI Soccer Predictions Today

Spark AI generates fresh predictions every day across 50+ leagues. Here's how to make the most of them.

### Daily Free Predictions

Every day, Spark AI selects 10 high-confidence predictions from matches across all supported leagues. These free picks are available to all users and include:

- Match information (teams, league, kickoff time)
- Win/Draw/Loss probabilities
- Confidence level
- Key factors influencing the prediction

### Understanding Confidence Levels

Not all predictions are created equal:

**High Confidence** (recommended for singles)
- Strong data alignment across all factors
- Clear statistical advantage for one outcome
- Historical patterns strongly support the prediction

**Medium Confidence** (good for accumulators)
- Most factors point to one outcome
- Some uncertainty exists
- Best used as part of a multi-bet strategy

**Low Confidence** (proceed with caution)
- Conflicting signals or limited data
- Evenly matched teams
- Consider avoiding or using as a speculative pick

### Building Your Strategy

**Step 1: Check Today's Picks**
Visit the [Today's Predictions](https://spark-ai-prediction.com/today) page each morning to see the day's selections.

**Step 2: Review Key Factors**
Don't just look at the final probabilities. Read the key factors for context:
- Is a key player injured?
- Is one team on an impressive winning streak?
- Are there head-to-head patterns?

**Step 3: Cross-Reference with Odds**
Compare our predictions with bookmaker odds to find value. If our model says 65% chance of a home win but the bookmaker offers odds that imply only 45%, that's strong value.

**Step 4: Manage Your Selections**
- Use 1-2 high-confidence picks as singles
- Combine 3-5 medium-confidence picks in accumulators
- Set a daily budget and stick to it

### Pro Features for Advanced Users

Upgrade to Spark AI Pro for:
- **Unlimited match analyses** instead of 3 per day
- **Odds comparison** across multiple bookmakers
- **Player impact ratings** showing key performers
- **Advanced risk assessment** with severity levels
- **Jackpot Analyzer** for multi-match accumulators

### Track Your Performance

Use the My Predictions feature to track your results over time. This helps you:
- Identify which leagues you predict best
- See your overall success rate
- Adjust your strategy based on data

[Start with today's free predictions](https://spark-ai-prediction.com/today)
""",
    },
    {
        "slug": "jackpot-accumulator-betting-tips",
        "title": "Jackpot & Accumulator Betting Tips: How to Build Winning Multibets",
        "excerpt": "Expert tips for building winning accumulators and jackpot bets. Learn selection strategies, bankroll management, and how AI analysis improves your odds.",
        "category": "tips",
        "tags": ["jackpot", "accumulator", "multibet", "strategy"],
        "published_at": "2026-02-15",
        "updated_at": "2026-02-27",
        "body": """## Jackpot & Accumulator Betting Tips

Accumulators (or multibets) combine multiple selections into one bet. The odds multiply together, offering potentially huge returns from small stakes. But they're also harder to win.

### The Mathematics of Accumulators

Each additional selection reduces your overall probability of winning:
- 2-fold: If each pick has 60% chance, combined = 36%
- 3-fold: 60% x 60% x 60% = 21.6%
- 5-fold: 60% each = 7.8%
- 10-fold: 60% each = 0.6%

This is why most accumulators lose. But with the right strategy, you can improve your odds significantly.

### Smart Accumulator Strategy

**1. Keep It Small (2-4 Selections)**
The sweet spot for accumulators is 2-4 selections. You get enhanced odds without the probability dropping too low.

**2. Mix Markets, Not Just Match Results**
Instead of picking 5 match winners, consider mixing:
- 1-2 match results (1X2)
- 1-2 BTTS selections
- 1-2 Over/Under picks

Different markets reduce correlation and can improve your overall chances.

**3. Use High-Confidence Picks Only**
For accumulators, only include matches where Spark AI shows high confidence. A single weak link breaks the entire accumulator.

**4. Avoid Correlated Selections**
Don't pick both "Over 2.5 Goals" and "BTTS Yes" in the same match within your accumulator - if one fails, the other likely does too.

### Using Spark AI's Jackpot Analyzer

Our Jackpot Analyzer tool is specifically designed for accumulator betting:

1. **Select your matches** from upcoming fixtures
2. **Get AI analysis** of each selection's strength
3. **See combined probability** for the full accumulator
4. **Identify weak links** that might break your bet
5. **Get alternative suggestions** for risky selections

### Bankroll Management for Accumulators

- Allocate no more than 5-10% of your bankroll to accumulators
- Use a flat-stake approach (same amount on each accumulator)
- Track all bets and review weekly
- Don't chase losses with bigger accumulators

### When to Avoid Accumulators

- International breaks (unpredictable squad selections)
- End-of-season dead rubber matches
- Matches with key players suspended/injured
- Derbies and cup finals (too unpredictable)

[Try the Jackpot Analyzer for your next accumulator](https://spark-ai-prediction.com)
""",
    },
    {
        "slug": "live-scores-in-play-betting-guide",
        "title": "Live Scores and In-Play Betting: A Complete Guide",
        "excerpt": "Learn how to use live scores for in-play betting decisions. Track real-time match data, understand momentum shifts, and time your bets perfectly.",
        "category": "guides",
        "tags": ["live-scores", "in-play", "betting", "real-time"],
        "published_at": "2026-02-20",
        "updated_at": "2026-02-27",
        "body": """## Live Scores and In-Play Betting Guide

In-play betting has exploded in popularity. Having access to real-time match data gives you a significant edge when placing live bets.

### Why Live Data Matters

Pre-match predictions are based on historical data and expectations. But once a match kicks off, new information emerges:

- **Early goals** change the dynamic completely
- **Red cards** shift the balance of power
- **Injuries during the match** affect team capabilities
- **Tactical changes** (substitutions, formation shifts) alter the flow

### Using Spark AI Live Scores

Our live scores feature covers 50+ leagues worldwide and provides:

- **Real-time scores** updated every minute
- **Match statistics** (possession, shots, corners)
- **Match timeline** (goals, cards, substitutions)
- **Team lineups** and formation information

### In-Play Betting Strategies

**The Equalizer Strategy**
When the underdog scores first, bookmakers often overreact. If the favorite is still dominating possession and creating chances, the odds for a favorite win may offer excellent value.

**The Momentum Shift**
Watch for matches where one team dominates but can't score. When they finally break through, the Over goals line often offers value as the dam has broken.

**Late Goals Pattern**
Some leagues and teams consistently produce late goals. If the score is level at 70 minutes in a match between two attacking teams, Over 2.5 goals can still offer value.

### Leagues to Watch Live

The best leagues for in-play betting are those with:
- High average goals per game (Bundesliga, Eredivisie)
- Dramatic finish tendencies (Premier League)
- Late-game tactical aggression (Serie A teams chasing results)

### Tips for Live Betting

1. **Watch the match if possible** - Statistics don't tell the whole story
2. **Be patient** - Don't rush into bets in the first 15 minutes
3. **Set limits** - In-play betting can be addictive. Set clear loss limits
4. **Use cash-out wisely** - Sometimes securing a profit is the smart move
5. **Track live stats on Spark AI** - Our real-time data helps inform decisions

### Getting Started

Visit the [Live Scores](https://spark-ai-prediction.com) section to track matches in real-time. Combine live data with our AI predictions for a powerful in-play betting approach.
""",
    },
]


def get_all_articles():
    """Return all blog articles (without body for list views)."""
    return BLOG_ARTICLES


def get_article(slug):
    """Return a single article by slug, or None."""
    for a in BLOG_ARTICLES:
        if a["slug"] == slug:
            return a
    return None


def get_articles_by_category(category):
    """Return articles filtered by category."""
    return [a for a in BLOG_ARTICLES if a["category"] == category]


# =====================================================================
# Multilingual blog article titles and excerpts
# =====================================================================
BLOG_TITLES_I18N = {
    "how-ai-predicts-soccer-matches": {
        "fr": {"title": "Comment l\'IA Pr\u00e9dit les R\u00e9sultats des Matchs de Football", "excerpt": "D\u00e9couvrez comment les algorithmes d\'apprentissage automatique analysent la forme des \u00e9quipes, les confrontations directes et les donn\u00e9es pour pr\u00e9dire les r\u00e9sultats."},
        "es": {"title": "C\u00f3mo la IA Predice los Resultados del F\u00fatbol", "excerpt": "Descubre c\u00f3mo los algoritmos de aprendizaje autom\u00e1tico analizan la forma del equipo, el historial y los datos para predecir resultados."},
        "pt": {"title": "Como a IA Prev\u00ea os Resultados do Futebol", "excerpt": "Descubra como os algoritmos de aprendizado de m\u00e1quina analisam a forma da equipe, confrontos diretos e dados para prever resultados."},
        "sw": {"title": "Jinsi AI Inavyotabiri Matokeo ya Mechi za Soka", "excerpt": "Gundua jinsi algorithm za kujifunza kwa mashine zinavyochambua hali ya timu, rekodi za uso kwa uso na data kutabiri matokeo."},
        "ar": {"title": "\u0643\u064a\u0641 \u064a\u062a\u0646\u0628\u0623 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a \u0628\u0646\u062a\u0627\u0626\u062c \u0643\u0631\u0629 \u0627\u0644\u0642\u062f\u0645", "excerpt": "\u0627\u0643\u062a\u0634\u0641 \u0643\u064a\u0641 \u062a\u062d\u0644\u0644 \u062e\u0648\u0627\u0631\u0632\u0645\u064a\u0627\u062a \u0627\u0644\u062a\u0639\u0644\u0645 \u0627\u0644\u0622\u0644\u064a \u0623\u062f\u0627\u0621 \u0627\u0644\u0641\u0631\u0642 \u0648\u0627\u0644\u0645\u0648\u0627\u062c\u0647\u0627\u062a \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629 \u0644\u0644\u062a\u0646\u0628\u0624 \u0628\u0627\u0644\u0646\u062a\u0627\u0626\u062c."},
    },
    "premier-league-betting-tips-guide": {
        "fr": {"title": "Guide des Pronostics Premier League", "excerpt": "Conseils experts pour les paris Premier League. Strat\u00e9gies pour les march\u00e9s r\u00e9sultat, plus/moins et les deux \u00e9quipes marquent."},
        "es": {"title": "Gu\u00eda de Predicciones Premier League", "excerpt": "Consejos expertos para apuestas de Premier League. Estrategias para mercados de resultado, m\u00e1s/menos y ambos marcan."},
        "pt": {"title": "Guia de Palpites Premier League", "excerpt": "Dicas de especialistas para apostas na Premier League. Estrat\u00e9gias para mercados de resultado, mais/menos e ambas marcam."},
        "sw": {"title": "Mwongozo wa Ubashiri wa Premier League", "excerpt": "Vidokezo vya wataalamu kwa kamari ya Premier League. Mikakati ya matokeo, zaidi/chini na timu zote kupiga goli."},
        "ar": {"title": "\u062f\u0644\u064a\u0644 \u062a\u0648\u0642\u0639\u0627\u062a \u0627\u0644\u062f\u0648\u0631\u064a \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a", "excerpt": "\u0646\u0635\u0627\u0626\u062d \u062e\u0628\u0631\u0627\u0621 \u0644\u0644\u0631\u0647\u0627\u0646\u0627\u062a \u0639\u0644\u0649 \u0627\u0644\u062f\u0648\u0631\u064a \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a."},
    },
    "understanding-over-under-goals": {
        "fr": {"title": "Comprendre les Paris Plus/Moins de 2.5 Buts", "excerpt": "Guide complet pour comprendre et utiliser les march\u00e9s plus/moins dans vos paris football."},
        "es": {"title": "Entendiendo las Apuestas M\u00e1s/Menos de 2.5 Goles", "excerpt": "Gu\u00eda completa para entender y usar los mercados de m\u00e1s/menos en apuestas de f\u00fatbol."},
        "pt": {"title": "Entendendo Apostas Mais/Menos de 2.5 Gols", "excerpt": "Guia completo para entender e usar os mercados de mais/menos nas apostas de futebol."},
        "sw": {"title": "Kuelewa Kamari ya Zaidi/Chini ya Magoli 2.5", "excerpt": "Mwongozo kamili wa kuelewa na kutumia masoko ya zaidi/chini katika kamari ya soka."},
        "ar": {"title": "\u0641\u0647\u0645 \u0631\u0647\u0627\u0646\u0627\u062a \u0623\u0643\u062b\u0631/\u0623\u0642\u0644 \u0645\u0646 2.5 \u0647\u062f\u0641", "excerpt": "\u062f\u0644\u064a\u0644 \u0634\u0627\u0645\u0644 \u0644\u0641\u0647\u0645 \u0648\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0623\u0633\u0648\u0627\u0642 \u0623\u0643\u062b\u0631/\u0623\u0642\u0644 \u0641\u064a \u0631\u0647\u0627\u0646\u0627\u062a \u0643\u0631\u0629 \u0627\u0644\u0642\u062f\u0645."},
    },
    "btts-strategy-guide": {
        "fr": {"title": "Strat\u00e9gie BTTS : Guide des Paris Les Deux \u00c9quipes Marquent", "excerpt": "Apprenez \u00e0 identifier les matchs \u00e0 forte probabilit\u00e9 BTTS et maximisez vos gains."},
        "es": {"title": "Estrategia BTTS: Gu\u00eda de Ambos Marcan", "excerpt": "Aprende a identificar partidos con alta probabilidad de BTTS y maximiza tus ganancias."},
        "pt": {"title": "Estrat\u00e9gia BTTS: Guia de Ambas Marcam", "excerpt": "Aprenda a identificar jogos com alta probabilidade de BTTS e maximize seus ganhos."},
        "sw": {"title": "Mkakati wa BTTS: Timu Zote Kupiga Goli", "excerpt": "Jifunze kutambua mechi zenye uwezekano mkubwa wa BTTS na kuongeza faida yako."},
        "ar": {"title": "\u0627\u0633\u062a\u0631\u0627\u062a\u064a\u062c\u064a\u0629 \u0643\u0644\u0627 \u0627\u0644\u0641\u0631\u064a\u0642\u064a\u0646 \u064a\u0633\u062c\u0644\u0627\u0646", "excerpt": "\u062a\u0639\u0644\u0645 \u0643\u064a\u0641\u064a\u0629 \u062a\u062d\u062f\u064a\u062f \u0627\u0644\u0645\u0628\u0627\u0631\u064a\u0627\u062a \u0630\u0627\u062a \u0627\u0644\u0627\u062d\u062a\u0645\u0627\u0644\u064a\u0629 \u0627\u0644\u0639\u0627\u0644\u064a\u0629."},
    },
    "best-leagues-value-betting": {
        "fr": {"title": "Meilleures Ligues pour les Paris \u00e0 Valeur", "excerpt": "D\u00e9couvrez quelles ligues offrent les meilleures opportunit\u00e9s de paris \u00e0 valeur."},
        "es": {"title": "Mejores Ligas para Apuestas de Valor", "excerpt": "Descubre qu\u00e9 ligas ofrecen las mejores oportunidades de apuestas de valor."},
        "pt": {"title": "Melhores Ligas para Apostas de Valor", "excerpt": "Descubra quais ligas oferecem as melhores oportunidades de apostas de valor."},
        "sw": {"title": "Ligi Bora kwa Kamari ya Thamani", "excerpt": "Gundua ligi zipi zinazotoa fursa bora za kamari ya thamani."},
        "ar": {"title": "\u0623\u0641\u0636\u0644 \u0627\u0644\u062f\u0648\u0631\u064a\u0627\u062a \u0644\u0644\u0631\u0647\u0627\u0646\u0627\u062a \u0627\u0644\u0642\u064a\u0645\u0629", "excerpt": "\u0627\u0643\u062a\u0634\u0641 \u0623\u064a \u0627\u0644\u062f\u0648\u0631\u064a\u0627\u062a \u062a\u0642\u062f\u0645 \u0623\u0641\u0636\u0644 \u0641\u0631\u0635 \u0627\u0644\u0631\u0647\u0627\u0646\u0627\u062a."},
    },
    "soccer-predictions-today-daily-picks": {
        "fr": {"title": "Pronostics Football du Jour : Comment Utiliser les Picks Quotidiens", "excerpt": "Apprenez \u00e0 tirer le meilleur parti de nos pronostics quotidiens gratuits par IA."},
        "es": {"title": "Predicciones de F\u00fatbol Hoy: C\u00f3mo Usar las Picks Diarias", "excerpt": "Aprende a sacar el m\u00e1ximo provecho de nuestras predicciones diarias gratuitas por IA."},
        "pt": {"title": "Palpites de Futebol Hoje: Como Usar as Picks Di\u00e1rias", "excerpt": "Aprenda a aproveitar ao m\u00e1ximo nossos palpites di\u00e1rios gratuitos por IA."},
        "sw": {"title": "Ubashiri wa Soka Leo: Jinsi ya Kutumia Chaguzi za Kila Siku", "excerpt": "Jifunze jinsi ya kupata faida kubwa kutoka ubashiri wetu wa kila siku wa bure kwa AI."},
        "ar": {"title": "\u062a\u0648\u0642\u0639\u0627\u062a \u0643\u0631\u0629 \u0627\u0644\u0642\u062f\u0645 \u0627\u0644\u064a\u0648\u0645: \u0643\u064a\u0641 \u062a\u0633\u062a\u062e\u062f\u0645 \u0627\u0644\u062a\u0648\u0642\u0639\u0627\u062a \u0627\u0644\u064a\u0648\u0645\u064a\u0629", "excerpt": "\u062a\u0639\u0644\u0645 \u0643\u064a\u0641\u064a\u0629 \u0627\u0644\u0627\u0633\u062a\u0641\u0627\u062f\u0629 \u0627\u0644\u0642\u0635\u0648\u0649 \u0645\u0646 \u062a\u0648\u0642\u0639\u0627\u062a\u0646\u0627 \u0627\u0644\u064a\u0648\u0645\u064a\u0629 \u0627\u0644\u0645\u062c\u0627\u0646\u064a\u0629."},
    },
    "jackpot-accumulator-betting-tips": {
        "fr": {"title": "Conseils pour les Paris Accumul\u00e9s et Jackpot", "excerpt": "Strat\u00e9gies pour am\u00e9liorer vos paris accumul\u00e9s et augmenter vos chances de gagner le jackpot."},
        "es": {"title": "Consejos para Apuestas Acumuladas y Jackpot", "excerpt": "Estrategias para mejorar tus apuestas acumuladas y aumentar tus posibilidades de ganar."},
        "pt": {"title": "Dicas para Apostas M\u00faltiplas e Jackpot", "excerpt": "Estrat\u00e9gias para melhorar suas apostas m\u00faltiplas e aumentar suas chances de ganhar."},
        "sw": {"title": "Vidokezo vya Kamari ya Jackpot na Mkusanyiko", "excerpt": "Mikakati ya kuboresha kamari yako ya mkusanyiko na kuongeza nafasi yako ya kushinda."},
        "ar": {"title": "\u0646\u0635\u0627\u0626\u062d \u0631\u0647\u0627\u0646\u0627\u062a \u0627\u0644\u062c\u0627\u0643\u0628\u0648\u062a \u0648\u0627\u0644\u062a\u0631\u0627\u0643\u0645", "excerpt": "\u0627\u0633\u062a\u0631\u0627\u062a\u064a\u062c\u064a\u0627\u062a \u0644\u062a\u062d\u0633\u064a\u0646 \u0631\u0647\u0627\u0646\u0627\u062a\u0643 \u0627\u0644\u0645\u062a\u0631\u0627\u0643\u0645\u0629."},
    },
    "live-scores-in-play-betting-guide": {
        "fr": {"title": "Scores en Direct et Guide des Paris en Jeu", "excerpt": "Utilisez les scores en direct et les donn\u00e9es en temps r\u00e9el pour prendre des d\u00e9cisions de paris \u00e9clair\u00e9es."},
        "es": {"title": "Resultados en Vivo y Gu\u00eda de Apuestas en Juego", "excerpt": "Usa los resultados en vivo y datos en tiempo real para tomar decisiones de apuestas informadas."},
        "pt": {"title": "Resultados ao Vivo e Guia de Apostas ao Vivo", "excerpt": "Use os resultados ao vivo e dados em tempo real para tomar decis\u00f5es de apostas informadas."},
        "sw": {"title": "Matokeo ya Moja kwa Moja na Mwongozo wa Kamari ya Wakati Halisi", "excerpt": "Tumia matokeo ya moja kwa moja na data ya wakati halisi kufanya maamuzi ya kamari yenye taarifa."},
        "ar": {"title": "\u0627\u0644\u0646\u062a\u0627\u0626\u062c \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629 \u0648\u062f\u0644\u064a\u0644 \u0627\u0644\u0631\u0647\u0627\u0646\u0627\u062a \u0627\u0644\u062d\u064a\u0629", "excerpt": "\u0627\u0633\u062a\u062e\u062f\u0645 \u0627\u0644\u0646\u062a\u0627\u0626\u062c \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629 \u0648\u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0641\u0648\u0631\u064a\u0629 \u0644\u0627\u062a\u062e\u0627\u0630 \u0642\u0631\u0627\u0631\u0627\u062a \u0631\u0647\u0627\u0646 \u0645\u0633\u062a\u0646\u064a\u0631\u0629."},
    },
}


def get_all_articles_i18n(lang="en"):
    """Return all articles with localized titles/excerpts."""
    result = []
    for a in BLOG_ARTICLES:
        slug = a["slug"]
        title = a["title"]
        excerpt = a["excerpt"]
        if lang != "en" and slug in BLOG_TITLES_I18N and lang in BLOG_TITLES_I18N[slug]:
            title = BLOG_TITLES_I18N[slug][lang].get("title", title)
            excerpt = BLOG_TITLES_I18N[slug][lang].get("excerpt", excerpt)
        result.append({
            "slug": slug,
            "title": title,
            "excerpt": excerpt,
            "category": a["category"],
            "tags": a["tags"],
            "published_at": a["published_at"],
            "updated_at": a.get("updated_at", a["published_at"]),
        })
    return result


def get_article_i18n(slug, lang="en"):
    """Return a single article with localized title/excerpt."""
    a = get_article(slug)
    if not a:
        return None
    if lang != "en" and slug in BLOG_TITLES_I18N and lang in BLOG_TITLES_I18N[slug]:
        a["title"] = BLOG_TITLES_I18N[slug][lang].get("title", a["title"])
        a["excerpt"] = BLOG_TITLES_I18N[slug][lang].get("excerpt", a["excerpt"])
    return a
