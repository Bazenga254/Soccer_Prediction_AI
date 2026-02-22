"""Add privacy policy route to main.py on VPS."""
import sys

MAIN_PY = "/root/Soccer_Prediction_AI/backend/main.py"

PRIVACY_ROUTE = '''
# ==================== PRIVACY POLICY (for Chrome Web Store) ====================
@app.get("/privacy")
async def privacy_policy():
    """Serve privacy policy page for Chrome Web Store compliance."""
    from fastapi.responses import HTMLResponse
    html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Privacy Policy - Spark AI Soccer Prediction Assistant</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:0 auto;padding:40px 20px;line-height:1.7;color:#e2e8f0;background:#0f172a}
h1{color:#3b82f6;border-bottom:2px solid #1e3a5f;padding-bottom:12px}
h2{color:#60a5fa;margin-top:32px}
a{color:#3b82f6}
ul{padding-left:20px}
.updated{color:#94a3b8;font-size:14px}
</style>
</head>
<body>
<h1>Privacy Policy</h1>
<p class="updated">Last updated: February 22, 2026</p>
<p>Spark AI operates the Spark AI - Soccer Prediction Assistant browser extension. This policy describes how we collect, use, and protect your information.</p>
<h2>1. Information We Collect</h2>
<ul>
<li><strong>Account Information:</strong> When you sign in via Google OAuth, we receive your name, email address, and profile picture.</li>
<li><strong>Match Preferences:</strong> Teams you choose to track for live score notifications.</li>
<li><strong>Usage Data:</strong> Which features you use to improve our service.</li>
<li><strong>Payment Information:</strong> Processed securely through M-Pesa or card providers. We do not store full payment details.</li>
</ul>
<h2>2. How We Use Your Information</h2>
<ul>
<li>To provide AI-powered match predictions and analysis</li>
<li>To send live score notifications for tracked matches</li>
<li>To manage your subscription and account</li>
</ul>
<h2>3. Third-Party Services</h2>
<ul>
<li><strong>Google OAuth:</strong> For secure authentication</li>
<li><strong>API-Football:</strong> For match data and live scores</li>
<li><strong>The Odds API:</strong> For betting odds comparison</li>
<li><strong>Safaricom M-Pesa:</strong> For mobile payment processing</li>
</ul>
<h2>4. Data Storage and Security</h2>
<p>Your data is stored on secure servers. Authentication tokens are stored locally using Chrome storage API. We use HTTPS encryption for all data transmission.</p>
<h2>5. Data Sharing</h2>
<p>We do not sell, trade, or share your personal information with third parties except as required to provide the service or by law.</p>
<h2>6. Your Rights</h2>
<ul>
<li>Delete your account and data at any time</li>
<li>Revoke Google OAuth access through Google Account settings</li>
<li>Uninstall the extension to stop all data collection</li>
</ul>
<h2>7. Permissions Explained</h2>
<ul>
<li><strong>storage:</strong> Save preferences and auth tokens locally</li>
<li><strong>activeTab:</strong> Display prediction buttons on betting sites</li>
<li><strong>identity:</strong> Enable Google sign-in</li>
<li><strong>alarms:</strong> Schedule live score polling</li>
<li><strong>notifications:</strong> Alert you when tracked teams score</li>
</ul>
<h2>8. Contact</h2>
<p>Email: <a href="mailto:support@spark-ai-prediction.com">support@spark-ai-prediction.com</a></p>
</body></html>"""
    return HTMLResponse(content=html)


'''

with open(MAIN_PY, "r") as f:
    content = f.read()

marker = "# ==================== SERVE FRONTEND IN PRODUCTION ===================="
if "privacy_policy" in content:
    print("Privacy route already exists, skipping")
    sys.exit(0)

if marker in content:
    content = content.replace(marker, PRIVACY_ROUTE + marker)
    with open(MAIN_PY, "w") as f:
        f.write(content)
    print("Privacy route added successfully")
else:
    print("ERROR: Could not find insertion marker")
    sys.exit(1)
