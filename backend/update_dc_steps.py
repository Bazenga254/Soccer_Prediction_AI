"""Update double chance blog: Fix Step 2 and Step 3 to reflect actual app flow"""
import sqlite3

conn = sqlite3.connect('community.db')
cur = conn.cursor()

slug = 'how-to-make-100-a-day-betting-double-chance-a-step-by-step-strategy-using-spark-ai'
cur.execute('SELECT body FROM blog_posts WHERE slug=?', (slug,))
body = cur.fetchone()[0]

# Replace Step 2
old_step2 = (
    "#### Step 2: Open Spark AI and Find Today\u2019s Matches \u26bd\n"
    "\n"
    "1. Go to [Spark AI](https://spark-ai-prediction.com) and log in\n"
    "2. Navigate to **Live Scores** or **Predictions** to see today\u2019s matches\n"
    "3. Look for matches where [Spark AI](https://spark-ai-prediction.com) shows a **high "
    "confidence double chance prediction**\n"
    "\n"
    "The AI analyzes every match across 50+ leagues and gives you probability percentages "
    "for each double chance option. \U0001f916"
)

new_step2 = (
    "#### Step 2: Open Spark AI and Find Today\u2019s Matches \u26bd\n"
    "\n"
    "There are two ways to find the best double chance picks on "
    "[Spark AI](https://spark-ai-prediction.com):\n"
    "\n"
    "**Method 1 \u2014 Browse Upcoming Matches (Recommended) \U0001f50d**\n"
    "\n"
    "1. Go to [Spark AI](https://spark-ai-prediction.com) and log in\n"
    "2. Click on **Upcoming Matches** to see all of today\u2019s fixtures\n"
    "3. Select a match that interests you\n"
    "4. Run the **Full Match Analysis** \u2014 this gives you detailed AI predictions for "
    "every market including double chance, with confidence ratings and head-to-head stats\n"
    "\n"
    "This is the most accurate way to get predictions because the AI runs a deep analysis "
    "on the specific match you choose \u2014 factoring in recent form, injuries, head-to-head "
    "records, and more. \U0001f3af\n"
    "\n"
    "**Method 2 \u2014 Use the AI Assistant \U0001f916**\n"
    "\n"
    "1. Open the **AI Chat Assistant** on [Spark AI](https://spark-ai-prediction.com)\n"
    "2. Ask it something like: *\u201cWhich matches today have high confidence for double "
    "chance 1X?\u201d*\n"
    "3. The AI will analyze today\u2019s fixtures and recommend the best double chance picks "
    "with probability ratings\n"
    "\n"
    "The AI Assistant is perfect when you do not have time to analyze each match individually "
    "\u2014 it does the heavy lifting for you. \u26a1\n"
    "\n"
    "**Note:** The free **Predictions** tab shows daily AI picks, but for the most accurate "
    "and detailed analysis, always use the match analysis or AI assistant features. \U0001f4aa"
)

# Replace Step 3
old_step3 = (
    "#### Step 3: Select High-Confidence Double Chance Bets \U0001f4ca\n"
    "\n"
    "This is where [Spark AI](https://spark-ai-prediction.com) gives you the edge. "
    "Filter for bets that meet these criteria:\n"
    "\n"
    "- \u2705 **AI confidence above 75%** for the double chance market\n"
    "- \u2705 **Odds between 1.20 and 1.50** (sweet spot for value + safety)\n"
    "- \u2705 **Top league matches** (Premier League, La Liga, Serie A, Bundesliga, Ligue 1)\n"
    "- \u2705 **No major injury doubts** for key players\n"
    "- \u2705 **Strong home or away form** backing the prediction\n"
    "\n"
    "**Pro tip:** On a typical matchday, [Spark AI](https://spark-ai-prediction.com) "
    "identifies **5-10 high-confidence double chance bets** across all leagues. You only "
    "need 3-5 winners to hit your $100 target. \U0001f4a1"
)

new_step3 = (
    "#### Step 3: Select High-Confidence Double Chance Bets \U0001f4ca\n"
    "\n"
    "After running match analysis or asking the AI assistant, look for picks that meet "
    "these criteria:\n"
    "\n"
    "- \u2705 **AI confidence above 75%** for the double chance market\n"
    "- \u2705 **Strong head-to-head record** \u2014 Check if the team has historically dominated this opponent\n"
    "- \u2705 **Odds between 1.12 and 1.20** per match (these combine to ~1.67+ in a 4-fold accumulator)\n"
    "- \u2705 **Top league matches** (Premier League, La Liga, Serie A, Bundesliga, Ligue 1)\n"
    "- \u2705 **No major injury doubts** for key players\n"
    "- \u2705 **Strong home or away form** backing the prediction\n"
    "\n"
    "**Pro tip:** Use the match analysis to check head-to-head records. A team that has "
    "won 7+ of the last 10 meetings is an excellent double chance pick. You only need "
    "**4 strong picks** to build a profitable accumulator. \U0001f4a1"
)

changes = 0
if old_step2 in body:
    body = body.replace(old_step2, new_step2)
    changes += 1
    print("Step 2 updated")
else:
    print("ERROR: Step 2 text not found!")

if old_step3 in body:
    body = body.replace(old_step3, new_step3)
    changes += 1
    print("Step 3 updated")
else:
    print("ERROR: Step 3 text not found!")

if changes > 0:
    cur.execute('UPDATE blog_posts SET body=? WHERE slug=?', (body, slug))
    conn.commit()
    print(f"\nDone! {changes} sections updated.")
    print(f"New word count: {len(body.split())}")
else:
    print("\nNo changes made.")

conn.close()
