"""
AI Support Chat Module for Spark AI
Uses Google Gemini API to auto-respond to support messages.
"""

import os
import re
import time
from typing import Dict, List, Optional

SYSTEM_PROMPT = """You are the Spark AI support assistant for a soccer/football prediction and analytics platform called "Spark AI".

## About Spark AI
- Soccer/football match prediction platform powered by AI
- Features: AI match predictions with confidence scores, live scores tracking, community predictions marketplace, odds comparison from multiple bookmakers, head-to-head statistics, team & player analysis
- Users can browse today's matches, view detailed predictions, and track live scores
- Community section allows users to share and sell predictions

## Account & Access
- Users need an access code to register (given by admin or through referral program)
- Referral program: each user gets a unique referral code to share — when someone registers with it, both users benefit
- Google Sign-In is available as an alternative login method
- Users can update their profile: display name, avatar color, full name, date of birth
- Security questions are set up for identity verification in support cases
- Password can be changed from the Profile page

## Common User Questions
- "How do I change my password?" → Go to Profile page, scroll to the password section
- "How do I change my display name?" → Go to Profile page, click the edit icon next to your name
- "How do predictions work?" → Our AI analyzes team form, head-to-head records, player stats, and odds to generate match predictions with confidence scores
- "How do I see live scores?" → Click "Live Scores" in the navigation menu
- "What is the community section?" → Users can share their own match predictions, rate others' predictions, and interact with the community
- "How do I get an access code?" → Access codes are provided by the admin or through referral links from existing users
- "How do I refer a friend?" → Go to your Profile page and find your unique referral link to share

## Response Guidelines
- Be friendly, concise, and helpful
- Always refer to the app as "Spark AI"
- Keep responses under 3-4 sentences when possible
- If you can answer the question, answer it directly
- If you're unsure or the question is outside your scope, include [ESCALATE] at the END of your response

## When to Escalate (include [ESCALATE] in your response)
- Billing or payment disputes
- Account recovery (locked out, can't access email)
- Technical bugs or errors the user is experiencing
- Requests to delete data or account modifications requiring admin action
- Any question you genuinely cannot answer about the platform
- The user explicitly asks to speak to a human/agent/real person
- Complaints or negative feedback that need human attention

IMPORTANT: When you escalate, still provide a brief helpful response before the [ESCALATE] tag. For example: "I understand you're having a billing issue. Let me connect you with our support team who can help resolve this. [ESCALATE]"
"""

# Keywords that trigger immediate escalation regardless of AI response
ESCALATION_KEYWORDS = [
    "talk to a human", "talk to human", "real person", "real agent",
    "speak to someone", "speak to a human", "talk to someone",
    "human agent", "live agent", "actual person", "talk to agent",
    "connect me to", "transfer me", "escalate",
]

MAX_RETRIES = 3
RETRY_DELAYS = [2, 5, 10]  # seconds


def _check_user_wants_human(message: str) -> bool:
    """Check if the user's message explicitly requests a human agent."""
    msg_lower = message.lower().strip()
    return any(kw in msg_lower for kw in ESCALATION_KEYWORDS)


def _call_gemini_with_retry(prompt: str) -> str:
    """Call Gemini API with retry logic for rate limit errors."""
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_key:
        return None

    from google import genai
    client = genai.Client(api_key=gemini_key)

    for attempt in range(MAX_RETRIES):
        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
            )
            return response.text.strip() if response.text else None
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                if attempt < MAX_RETRIES - 1:
                    delay = RETRY_DELAYS[attempt]
                    print(f"[AI Support] Rate limited, retrying in {delay}s (attempt {attempt + 1}/{MAX_RETRIES})")
                    time.sleep(delay)
                    continue
            print(f"[AI Support] Gemini API error: {e}")
            return None

    return None


def get_ai_response(user_message: str, conversation_history: List[Dict], category: Optional[str] = None) -> Dict:
    """
    Get an AI response for a support message.

    Returns:
        {"response": str, "should_escalate": bool}
    """
    # Check if user explicitly wants a human
    if _check_user_wants_human(user_message):
        return {
            "response": "Of course! Let me connect you with a support agent right away. Someone will be with you shortly.",
            "should_escalate": True
        }

    # Build conversation context from history (last 10 messages)
    recent = conversation_history[-10:] if len(conversation_history) > 10 else conversation_history

    chat_context = ""
    if category:
        chat_context += f"The user selected the support category: {category}\n\n"

    for msg in recent:
        role = "User" if msg.get("sender") == "user" else "Support AI"
        chat_context += f"{role}: {msg.get('content', '')}\n"

    # Add current message
    chat_context += f"User: {user_message}\n"

    full_prompt = f"{SYSTEM_PROMPT}\n\n## Conversation History:\n{chat_context}\n\nRespond to the user's latest message. Remember: include [ESCALATE] at the end ONLY if you cannot help or the situation requires a human agent."

    ai_text = _call_gemini_with_retry(full_prompt)

    if not ai_text:
        return {
            "response": "I'm having a bit of trouble right now. Let me connect you with a support agent instead.",
            "should_escalate": True
        }

    # Check for escalation tag
    should_escalate = "[ESCALATE]" in ai_text

    # Clean the escalation tag from the response
    clean_response = re.sub(r'\s*\[ESCALATE\]\s*', '', ai_text).strip()

    if not clean_response:
        clean_response = "Let me connect you with a support agent who can help you better."
        should_escalate = True

    return {
        "response": clean_response,
        "should_escalate": should_escalate
    }
