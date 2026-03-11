"""Add Spark AI hyperlinks to blog post"""
import sqlite3
import re

conn = sqlite3.connect('community.db')
cur = conn.cursor()
cur.execute('SELECT body FROM blog_posts WHERE slug=?',
            ('best-soccer-prediction-site-in-2026-why-spark-ai-is-the-1-choice',))
body = cur.fetchone()[0]

# Protect existing markdown links containing Spark AI
protected = []
def protect(m):
    protected.append(m.group(0))
    return f'__PROTECTED_{len(protected)}__'

body2 = re.sub(r'\[.*?Spark AI.*?\]\(.*?\)', protect, body)

# Replace bold Spark AI Prediction
body2 = body2.replace('**Spark AI Prediction**', '**[Spark AI Prediction](https://spark-ai-prediction.com)**')

# Replace plain Spark AI Prediction (not already in a link)
body2 = re.sub(r'(?<!\[)Spark AI Prediction(?!\])', '[Spark AI Prediction](https://spark-ai-prediction.com)', body2)

# Replace plain Spark AI (not followed by Prediction, not already in link)
body2 = re.sub(r'(?<!\[)Spark AI(?! Prediction)(?!\]|\))', '[Spark AI](https://spark-ai-prediction.com)', body2)

# Restore protected links
for i, p in enumerate(protected):
    body2 = body2.replace(f'__PROTECTED_{i+1}__', p)

cur.execute('UPDATE blog_posts SET body=? WHERE slug=?',
            (body2, 'best-soccer-prediction-site-in-2026-why-spark-ai-is-the-1-choice'))
conn.commit()

old_count = body.count('spark-ai-prediction.com')
new_count = body2.count('spark-ai-prediction.com')
print(f'Links before: {old_count}, after: {new_count}, added: {new_count - old_count}')
