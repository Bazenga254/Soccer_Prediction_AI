"""
AI Support Chat Module for Spark AI
Uses OpenAI GPT-4o-mini to auto-respond to support messages.
Supports account actions via two-pass tag parsing.
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
- Referral program: each user gets a unique referral code to share - when someone registers with it, both users benefit
- Google Sign-In is available as an alternative login method
- Users can update their profile: display name, avatar color, full name, date of birth
- Security questions are set up for identity verification in support cases
- Password can be changed from the Profile page

## YOUR CAPABILITIES - Account Actions
You can perform actions on the user's account by including special action tags in your response.
The system will execute these actions and provide you with the results.

### Available Actions:
- [ACTION:check_account] - Look up the user's account details (tier, email, display name, etc.)
- [ACTION:check_subscription] - Check the user's active subscription (plan, expiry, days remaining)
- [ACTION:check_tier_limits] - See what features are available/limited for the user's current tier
- [ACTION:set_tier:pro] - Upgrade the user to Pro tier
- [ACTION:set_tier:free] - Downgrade the user to Free tier
- [ACTION:cancel_subscription] - Cancel the user's active subscription
- [ACTION:get_subscription_history] - Get the user's subscription history
- [ACTION:get_referral_stats] - Get the user's referral code and stats
- [ACTION:send_doc:SECTION_ID] - Send a documentation link. Available sections:
  getting-started, predictions, live-scores, community, subscriptions,
  referrals, profile, support, odds-comparison, jackpot, analytics, security

### Action Rules:
1. ALWAYS use [ACTION:check_account] or [ACTION:check_subscription] FIRST before making any account changes
2. For upgrade/downgrade requests, check the current tier first, then apply the change
3. For "cancel subscription" requests, check if they have an active subscription first
4. You can include MULTIPLE action tags in a single response
5. Place action tags at the START of your response, before your message text
6. If an action fails, explain the error to the user helpfully
7. NEVER fabricate account information - always use actions to look it up
8. When a user asks about a feature, send them the relevant documentation link

### When to Use Actions vs Escalate:
- Use actions for: account lookups, tier changes, subscription queries, referral stats, sending docs
- Still escalate [ESCALATE] for: billing/payment disputes, refund requests, technical bugs, account recovery (locked out), data deletion requests

## Subscription Plans
- Weekly USD: $15/week (7 days)
- Weekly KES: KES 1,950/week (7 days)
- Monthly USD: $48/month (30 days) - save ~20%
- Monthly KES: KES 6,200/month (30 days) - save ~20%

## Free vs Pro Tier
Free: 3 match analyses per 24h, 1 community share/day, basic analytics, ads shown
Pro: Unlimited analyses, unlimited shares, advanced analytics, value betting, no ads, priority support

## Common User Questions
- "How do I change my password?" -> Go to Profile page, scroll to the password section
- "How do I change my display name?" -> Go to Profile page, click the edit icon next to your name
- "How do predictions work?" -> Send docs link: [ACTION:send_doc:predictions]
- "How do I see live scores?" -> Click "Live Scores" in the navigation menu
- "What is the community section?" -> Send docs link: [ACTION:send_doc:community]
- "How do I get an access code?" -> Access codes are provided by the admin or through referral links
- "How do I refer a friend?" -> Check their referral stats: [ACTION:get_referral_stats]
- "What's my subscription status?" -> Check it: [ACTION:check_subscription]
- "Upgrade me to pro" -> First check account [ACTION:check_account], then upgrade [ACTION:set_tier:pro]

## Documentation
When users ask how to use a feature, send them a docs link using [ACTION:send_doc:section_id].
The documentation URL format is: https://www.spark-ai-prediction.com/docs#section-id

## Response Guidelines
- Be friendly, concise, and helpful
- Always refer to the app as "Spark AI"
- Keep responses under 3-4 sentences when possible
- If you can answer the question, answer it directly
- When you perform an account action, confirm what you did clearly
- Be proactive: if a user asks about a Pro feature and they're on Free, offer to upgrade them
- If you're unsure or the question is outside your scope, include [ESCALATE] at the END of your response

## When to Escalate (include [ESCALATE] in your response)
- Billing or payment disputes
- Refund requests
- Account recovery (locked out, can't access email)
- Technical bugs or errors the user is experiencing
- Requests to delete data or account modifications requiring admin action
- Any question you genuinely cannot answer about the platform
- The user explicitly asks to speak to a human/agent/real person
- Complaints or negative feedback that need human attention

IMPORTANT: When you escalate, still provide a brief helpful response before the [ESCALATE] tag.
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

# Action tag pattern: [ACTION:name] or [ACTION:name:param1] or [ACTION:name:param1:param2]
ACTION_TAG_PATTERN = re.compile(r'\[ACTION:([a-z_]+(?::[a-z0-9_-]+)*)\]')


def _check_user_wants_human(message: str) -> bool:
    """Check if the user's message explicitly requests a human agent."""
    msg_lower = message.lower().strip()
    return any(kw in msg_lower for kw in ESCALATION_KEYWORDS)


def _call_openai_with_retry(prompt: str) -> str:
    """Call OpenAI API with retry logic for rate limit errors."""
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return None

    from openai import OpenAI
    client = OpenAI(api_key=api_key)

    for attempt in range(MAX_RETRIES):
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=1024,
            )
            text = response.choices[0].message.content
            return text.strip() if text else None
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "rate" in error_str.lower():
                if attempt < MAX_RETRIES - 1:
                    delay = RETRY_DELAYS[attempt]
                    print(f"[AI Support] Rate limited, retrying in {delay}s (attempt {attempt + 1}/{MAX_RETRIES})")
                    time.sleep(delay)
                    continue
            print(f"[AI Support] OpenAI API error: {e}")
            return None

    return None


# ─── Action Tag Parsing ───

def _parse_action_tags(ai_text: str):
    """
    Parse action tags from AI response text.
    Returns: (list_of_action_dicts, cleaned_text_without_tags)
    """
    actions = []
    for match in ACTION_TAG_PATTERN.finditer(ai_text):
        parts = match.group(1).split(":")
        action_name = parts[0]
        action_params = parts[1:] if len(parts) > 1 else []
        actions.append({"name": action_name, "params": action_params})

    cleaned = ACTION_TAG_PATTERN.sub('', ai_text).strip()
    return actions, cleaned


# ─── Action Handlers ───

def _action_check_account(user_id: int, params: List[str]) -> Dict:
    import user_auth
    profile = user_auth.get_user_profile(user_id)
    if not profile:
        return {"success": False, "error": "User not found"}
    return {
        "success": True,
        "data": {
            "display_name": profile.get("display_name"),
            "email": profile.get("email"),
            "username": profile.get("username"),
            "tier": profile.get("tier", "free"),
            "is_active": profile.get("is_active", True),
            "referral_code": profile.get("referral_code"),
            "created_at": profile.get("created_at"),
        }
    }


def _action_check_subscription(user_id: int, params: List[str]) -> Dict:
    import subscriptions
    sub = subscriptions.get_active_subscription(user_id)
    if not sub:
        import user_auth
        tier = user_auth.get_user_tier(user_id) or "free"
        return {"success": True, "data": {"status": "no_active_subscription", "current_tier": tier}}
    return {"success": True, "data": sub}


def _action_check_tier_limits(user_id: int, params: List[str]) -> Dict:
    import subscriptions
    import user_auth
    tier = user_auth.get_user_tier(user_id) or "free"
    limits = subscriptions.get_tier_limits(tier)
    return {"success": True, "data": {"tier": tier, "limits": limits}}


def _action_set_tier(user_id: int, params: List[str]) -> Dict:
    if not params or params[0] not in ("free", "pro"):
        return {"success": False, "error": "Invalid tier. Must be 'free' or 'pro'"}
    import user_auth
    new_tier = params[0]
    current_tier = user_auth.get_user_tier(user_id)
    if current_tier == new_tier:
        return {"success": True, "data": {"message": f"User is already on {new_tier} tier", "tier": new_tier}}
    result = user_auth.set_user_tier(user_id, new_tier)
    if result:
        return {"success": True, "data": {"message": f"Tier changed to {new_tier}", "previous_tier": current_tier, "new_tier": new_tier}}
    return {"success": False, "error": "Failed to change tier"}


def _action_cancel_subscription(user_id: int, params: List[str]) -> Dict:
    import subscriptions
    sub = subscriptions.get_active_subscription(user_id)
    if not sub:
        return {"success": False, "error": "No active subscription to cancel"}
    result = subscriptions.cancel_subscription(user_id)
    return result


def _action_get_subscription_history(user_id: int, params: List[str]) -> Dict:
    import subscriptions
    history = subscriptions.get_subscription_history(user_id)
    return {"success": True, "data": history[:5] if history else []}


def _action_get_referral_stats(user_id: int, params: List[str]) -> Dict:
    import user_auth
    stats = user_auth.get_referral_stats(user_id)
    return {"success": True, "data": stats}


def _action_send_doc(user_id: int, params: List[str]) -> Dict:
    section = params[0] if params else "getting-started"
    valid_sections = [
        "getting-started", "predictions", "live-scores", "community",
        "subscriptions", "referrals", "profile", "support",
        "odds-comparison", "jackpot", "analytics", "security"
    ]
    if section not in valid_sections:
        section = "getting-started"

    import docs_content
    summary = docs_content.get_section_summary(section)
    doc_url = f"https://www.spark-ai-prediction.com/docs#{section}"
    return {"success": True, "data": {"url": doc_url, "section": section, "summary": summary}}


ACTION_HANDLERS = {
    "check_account": _action_check_account,
    "check_subscription": _action_check_subscription,
    "check_tier_limits": _action_check_tier_limits,
    "set_tier": _action_set_tier,
    "cancel_subscription": _action_cancel_subscription,
    "get_subscription_history": _action_get_subscription_history,
    "get_referral_stats": _action_get_referral_stats,
    "send_doc": _action_send_doc,
}


def execute_actions(action_tags: List[Dict], user_id: int) -> List[Dict]:
    """Execute parsed action tags and return results."""
    results = []
    for tag in action_tags:
        handler = ACTION_HANDLERS.get(tag["name"])
        if handler:
            try:
                result = handler(user_id, tag["params"])
                results.append({
                    "action": tag["name"],
                    "params": tag["params"],
                    **result
                })
            except Exception as e:
                results.append({
                    "action": tag["name"],
                    "params": tag["params"],
                    "success": False,
                    "error": str(e)
                })
        else:
            results.append({
                "action": tag["name"],
                "params": tag["params"],
                "success": False,
                "error": f"Unknown action: {tag['name']}"
            })
    return results


# ─── Main AI Response Function ───

def get_ai_response(
    user_message: str,
    conversation_history: List[Dict],
    category: Optional[str] = None,
    user_id: Optional[int] = None,
) -> Dict:
    """
    Get an AI response for a support message.
    Supports two-pass action execution when user_id is provided.

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

    # Pass 1: Get initial AI response
    pass1_prompt = f"{SYSTEM_PROMPT}\n\n## Conversation History:\n{chat_context}\n\nRespond to the user's latest message. Use [ACTION:...] tags if you need to look up or modify account data. Include [ESCALATE] at the end ONLY if you cannot help or the situation requires a human agent."

    ai_text = _call_openai_with_retry(pass1_prompt)

    if not ai_text:
        return {
            "response": "I'm having a bit of trouble right now. Let me connect you with a support agent instead.",
            "should_escalate": True
        }

    # Parse for action tags
    actions, cleaned_text = _parse_action_tags(ai_text)

    # If no actions or no user_id, return as-is
    if not actions or not user_id:
        should_escalate = "[ESCALATE]" in ai_text
        clean_response = re.sub(r'\s*\[ESCALATE\]\s*', '', cleaned_text).strip()
        if not clean_response:
            clean_response = "Let me connect you with a support agent who can help you better."
            should_escalate = True
        return {"response": clean_response, "should_escalate": should_escalate}

    # Execute actions
    action_results = execute_actions(actions, user_id)

    # Build results summary for Pass 2
    results_text = ""
    for r in action_results:
        params_str = f" (params: {', '.join(r['params'])})" if r.get("params") else ""
        if r.get("success"):
            results_text += f"Action: {r['action']}{params_str}\nResult: SUCCESS - {r.get('data', 'Done')}\n\n"
        else:
            results_text += f"Action: {r['action']}{params_str}\nResult: FAILED - {r.get('error', 'Unknown error')}\n\n"

    # Pass 2: Get final response incorporating action results
    pass2_prompt = f"""{SYSTEM_PROMPT}

## Conversation History:
{chat_context}

## Action Results:
The following actions were executed on the user's behalf:

{results_text}

## Instructions:
Based on the action results above, compose a natural, helpful response to the user.
- Confirm what actions were taken and their results
- If a documentation link was generated, include the full URL in your response
- Do NOT include any [ACTION:...] tags in this response
- Include [ESCALATE] only if something went wrong that requires human help
- Be concise and friendly"""

    final_text = _call_openai_with_retry(pass2_prompt)

    if not final_text:
        # Fallback: construct a basic response from action results
        fallback_parts = []
        for r in action_results:
            if r.get("success"):
                data = r.get("data", {})
                if r["action"] == "send_doc" and isinstance(data, dict):
                    fallback_parts.append(f"Here's the documentation link: {data.get('url', '')}")
                elif r["action"] == "set_tier" and isinstance(data, dict):
                    fallback_parts.append(f"Your tier has been changed to {data.get('new_tier', 'updated')}.")
                elif r["action"] == "check_account" and isinstance(data, dict):
                    fallback_parts.append(f"Your account: {data.get('display_name', 'User')}, tier: {data.get('tier', 'free')}")
                else:
                    fallback_parts.append(f"Action '{r['action']}' completed successfully.")
            else:
                fallback_parts.append(f"Sorry, {r['action']} failed: {r.get('error', 'unknown error')}")
        return {"response": " ".join(fallback_parts) if fallback_parts else "I've processed your request.", "should_escalate": False}

    # Check for escalation in final response
    should_escalate = "[ESCALATE]" in final_text
    clean_response = re.sub(r'\s*\[ESCALATE\]\s*', '', final_text).strip()

    if not clean_response:
        clean_response = "I've processed your request. Let me know if you need anything else!"

    return {"response": clean_response, "should_escalate": should_escalate}
