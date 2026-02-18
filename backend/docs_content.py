"""
Documentation content for Spark AI platform.
Used by the docs API endpoint and the AI support agent.
"""

DOCS_SECTIONS = [
    {
        "id": "getting-started",
        "title": "Getting Started",
        "icon": "rocket",
        "content": [
            {
                "heading": "Creating Your Account",
                "body": "To join Spark AI, you need an access code. You can get one from an existing user's referral link or from the admin. Visit the login page, click 'Get Started', enter your access code, email, and password. Your password must be at least 8 characters with a mix of letters and numbers."
            },
            {
                "heading": "Verifying Your Email",
                "body": "After registration, you'll receive a 6-digit verification code via email. Enter this code on the verification screen to activate your account. The code expires in 10 minutes. If you didn't receive it, click 'Resend Code' to get a new one."
            },
            {
                "heading": "Setting Up Your Profile",
                "body": "Once verified, you'll be prompted to set up a security question for account recovery. You can also customize your display name, username, and avatar from the Profile page. Your unique referral link is available on your profile for inviting friends."
            },
            {
                "heading": "Signing In with Google",
                "body": "You can also sign in using your Google account for faster access. Click 'Sign in with Google' on the login page. If it's your first time, you'll still need an access code or referral link to complete registration."
            },
            {
                "heading": "Navigating the App",
                "body": "The main navigation bar at the top gives you access to all features: Today's Matches (home), Live Scores, Community Predictions, Jackpot Analyzer, My Analysis history, and your Profile. Use the competition tabs to switch between different leagues."
            },
        ]
    },
    {
        "id": "predictions",
        "title": "AI Predictions",
        "icon": "brain",
        "content": [
            {
                "heading": "How AI Predictions Work",
                "body": "Spark AI uses advanced machine learning models to analyze team form, head-to-head records, player statistics, injuries, and odds data to generate match predictions. Each prediction comes with a confidence score showing how sure the AI is about the outcome."
            },
            {
                "heading": "Viewing Match Predictions",
                "body": "From the home page, browse today's fixtures by league. Click on any match to see the full AI analysis including predicted result, probability breakdown, over/under 2.5 goals prediction, both teams to score (BTTS), and the best value bet recommendation."
            },
            {
                "heading": "Understanding Confidence Scores",
                "body": "Each prediction shows a confidence percentage. Higher confidence means the AI has stronger signals supporting that outcome. Scores above 70% indicate high confidence. Remember that even high-confidence predictions can be wrong - always bet responsibly."
            },
            {
                "heading": "Free vs Pro Predictions",
                "body": "Free users can view up to 3 full match analyses per 24 hours. Pro subscribers get unlimited access to all predictions, advanced analytics, and value betting insights with no daily limits."
            },
            {
                "heading": "Analysis Components",
                "body": "Each match analysis includes: outcome probabilities (1X2), head-to-head statistics, player impact ratings, risk factor assessment, odds comparison from multiple bookmakers, and an AI-generated analysis summary explaining the key factors."
            },
        ]
    },
    {
        "id": "live-scores",
        "title": "Live Scores",
        "icon": "activity",
        "content": [
            {
                "heading": "Tracking Live Matches",
                "body": "Click 'Live Scores' in the navigation to see all matches currently in play. Scores update automatically in real-time. You can see the current minute, score, and key match events."
            },
            {
                "heading": "Live Match Chat",
                "body": "Each live match has a chat room where you can discuss the game with other users in real-time. Share your thoughts, celebrate goals, and interact with the community while watching the match."
            },
            {
                "heading": "Match Notifications",
                "body": "Stay updated on matches you're interested in. The platform tracks live matches across 50+ leagues worldwide and provides instant score updates."
            },
        ]
    },
    {
        "id": "community",
        "title": "Community & Marketplace",
        "icon": "users",
        "content": [
            {
                "heading": "Sharing Predictions",
                "body": "After viewing a match analysis, you can share your prediction with the community. Choose to make it free (visible to everyone) or paid (premium content). Add your own analysis summary to explain your reasoning."
            },
            {
                "heading": "Browsing Community Predictions",
                "body": "Visit the Community section to see predictions shared by other users. You can sort by newest, most popular, or best-rated. Like or dislike predictions to help the community identify quality tipsters."
            },
            {
                "heading": "Commenting on Predictions",
                "body": "Engage with the community by commenting on predictions. Share your perspective, ask questions, or discuss the match. Comments are visible to all users."
            },
            {
                "heading": "Following Users",
                "body": "Follow tipsters whose predictions you like. You'll get notifications when they post new predictions. Build your network of trusted prediction makers."
            },
            {
                "heading": "Creator Dashboard",
                "body": "If you share paid predictions, access your Creator Dashboard to track your earnings, view your prediction history, and see your follower count. Withdraw your earnings when your balance reaches the minimum threshold."
            },
            {
                "heading": "Buying Premium Predictions",
                "body": "Some predictions are marked as premium content with a price set by the creator. Use your account balance to purchase these predictions. The full analysis is revealed after purchase."
            },
        ]
    },
    {
        "id": "subscriptions",
        "title": "Subscriptions & Pricing",
        "icon": "diamond",
        "content": [
            {
                "heading": "Free Plan",
                "body": "The free plan includes: 3 match analyses per 24 hours, 1 community share per day, basic head-to-head statistics, live scores, and community access. Ads are displayed to free users."
            },
            {
                "heading": "Pro Plan Benefits",
                "body": "Pro subscribers enjoy: unlimited match analyses, unlimited community shares, advanced analytics and player impact ratings, value betting insights, ad-free experience, and priority support. It's the best way to get the most out of Spark AI."
            },
            {
                "heading": "Pricing",
                "body": "Pro Weekly: $15 USD or KES 1,950 per week. Pro Monthly: $48 USD or KES 6,200 per month (save approximately 20% compared to weekly). Choose the plan that works best for you."
            },
            {
                "heading": "How to Subscribe",
                "body": "Go to the Upgrade page from the navigation menu. Select your preferred plan and currency. For Kenyan users, M-Pesa payment is available for seamless mobile money transactions. Your Pro status activates immediately after payment."
            },
            {
                "heading": "Managing Your Subscription",
                "body": "View your active subscription on the Upgrade page. You can see your plan type, expiration date, and days remaining. To cancel, use the cancel option on the same page or ask our support chat for help."
            },
            {
                "heading": "Subscription Expiry",
                "body": "When your subscription expires, your account automatically reverts to the free plan. You won't lose any data, but you'll be subject to daily limits again. Renew anytime to restore Pro access."
            },
        ]
    },
    {
        "id": "referrals",
        "title": "Referral Program",
        "icon": "link",
        "content": [
            {
                "heading": "Your Referral Code",
                "body": "Every user gets a unique referral code and link. Find yours on your Profile page. Share it with friends to invite them to Spark AI. When someone registers using your referral link, they bypass the access code requirement."
            },
            {
                "heading": "Referral Benefits",
                "body": "When someone you referred subscribes to Pro, you'll get notified. The referral program helps grow the community and rewards active users who bring in new members."
            },
            {
                "heading": "Sharing Your Link",
                "body": "Your referral link looks like: spark-ai-prediction.com/ref/yourusername. Share it on social media, WhatsApp groups, or directly with friends. The more people you refer, the more you contribute to the community."
            },
        ]
    },
    {
        "id": "profile",
        "title": "Your Profile",
        "icon": "user",
        "content": [
            {
                "heading": "Editing Your Display Name",
                "body": "Go to your Profile page and click the edit icon next to your name. Enter your new display name and save. This is the name other users see in the community."
            },
            {
                "heading": "Changing Your Username",
                "body": "Your username is used for your referral link and public profile. Go to Profile and update it. Usernames must be unique and contain only letters and numbers."
            },
            {
                "heading": "Changing Your Password",
                "body": "On the Profile page, scroll to the password section. Enter your current password and your new password. Passwords must be at least 8 characters. Note: there is a 24-hour cooldown between password changes for security."
            },
            {
                "heading": "Avatar & Personal Info",
                "body": "Customize your avatar color on the Profile page. You can also add your full name and date of birth for account verification purposes."
            },
            {
                "heading": "Security Question",
                "body": "Your security question is used to verify your identity if you ever need account recovery through support. Set it up during account setup or update it from your Profile."
            },
        ]
    },
    {
        "id": "support",
        "title": "Getting Help",
        "icon": "headphones",
        "content": [
            {
                "heading": "Support Chat",
                "body": "Click the chat icon in the bottom-right corner to open support. Our AI assistant can answer most questions instantly. Choose a category (Payment, Subscription, Predictions, or General) to get started."
            },
            {
                "heading": "AI Assistant Capabilities",
                "body": "Our AI assistant can: check your account status, view your subscription details, upgrade or downgrade your plan, check your referral stats, and send you relevant documentation links. It handles most issues without needing a human agent."
            },
            {
                "heading": "Talking to a Human Agent",
                "body": "If the AI can't resolve your issue, just say 'talk to a human' or 'speak to an agent'. Your conversation will be transferred to a support team member who will respond shortly."
            },
            {
                "heading": "File Attachments",
                "body": "You can upload screenshots and documents in the support chat to help explain your issue. Supported formats include images (JPG, PNG, GIF), PDFs, and common document types. Maximum file size is 10MB."
            },
            {
                "heading": "Rating Your Experience",
                "body": "After your support conversation is resolved, you'll be asked to rate the experience from 1-5 stars. Your feedback helps us improve our support quality."
            },
        ]
    },
    {
        "id": "odds-comparison",
        "title": "Odds Comparison",
        "icon": "bar-chart",
        "content": [
            {
                "heading": "Comparing Bookmaker Odds",
                "body": "Each match analysis includes odds from multiple bookmakers. Compare 1X2, over/under, and BTTS odds side by side to find the best value for your bets."
            },
            {
                "heading": "Value Betting (Pro)",
                "body": "Pro users get access to value betting insights. The AI identifies bets where the bookmaker odds are higher than the AI's calculated probability, indicating potential value opportunities."
            },
            {
                "heading": "Bet Slip",
                "body": "Use the built-in bet slip to track your selected bets. Add predictions from match analyses and keep track of your potential returns across multiple selections."
            },
        ]
    },
    {
        "id": "jackpot",
        "title": "Jackpot Analyzer",
        "icon": "trophy",
        "content": [
            {
                "heading": "What is the Jackpot Analyzer",
                "body": "The Jackpot Analyzer helps you build multi-bet accumulators by analyzing multiple matches together. It uses AI to evaluate the combined probability of your selections and suggest optimal combinations."
            },
            {
                "heading": "Free vs Pro Jackpot Access",
                "body": "Free users get 2 jackpot analyses initially, then 1 per 72 hours. Pro subscribers enjoy unlimited jackpot analyses with no waiting period."
            },
            {
                "heading": "Using the Analyzer",
                "body": "Select your matches, choose your preferred outcomes, and the AI will calculate the combined probability, expected value, and risk assessment for your accumulator."
            },
        ]
    },
    {
        "id": "analytics",
        "title": "Advanced Analytics",
        "icon": "chart",
        "content": [
            {
                "heading": "Pro Analytics Features",
                "body": "Pro subscribers get access to advanced analytics including: detailed player impact ratings, team form analysis over customizable periods, head-to-head deep dives with historical context, and advanced statistical models."
            },
            {
                "heading": "Player Impact Ratings",
                "body": "See how individual players affect match outcomes. The AI evaluates player form, fitness, historical performance against specific opponents, and impact on team tactics."
            },
            {
                "heading": "Risk Assessment",
                "body": "Every prediction includes a risk factor analysis showing potential upset indicators, weather impact, travel fatigue, derby factors, and other variables that could affect the match outcome."
            },
        ]
    },
    {
        "id": "security",
        "title": "Account Security",
        "icon": "shield",
        "content": [
            {
                "heading": "Password Security",
                "body": "Use a strong password with at least 8 characters including letters and numbers. Your password is encrypted and never stored in plain text. Change it regularly for best security."
            },
            {
                "heading": "Account Lockout",
                "body": "After 5 failed login attempts, your account is temporarily locked for 24 hours to prevent unauthorized access. Contact support if you're locked out of your account."
            },
            {
                "heading": "Security Questions",
                "body": "Your security question and answer are used to verify your identity during account recovery. Choose a question only you can answer and keep the answer consistent."
            },
            {
                "heading": "Email Verification",
                "body": "Your email is verified during registration. This ensures you can receive password reset links and important notifications. Keep your email address up to date."
            },
            {
                "heading": "Forgot Password",
                "body": "If you forget your password, click 'Forgot Password' on the login page. Enter your email to receive a password reset link. The link expires in 1 hour. You can only reset your password once every 24 hours."
            },
        ]
    },
]


def get_all_sections():
    """Return all documentation sections."""
    return DOCS_SECTIONS


def get_section(section_id: str):
    """Return a specific section by ID."""
    for s in DOCS_SECTIONS:
        if s["id"] == section_id:
            return s
    return None


def get_section_summary(section_id: str) -> str:
    """Return a brief summary of a section for AI responses."""
    section = get_section(section_id)
    if not section:
        return ""
    headings = [item["heading"] for item in section["content"]]
    return f"{section['title']}: covers {', '.join(headings)}"
