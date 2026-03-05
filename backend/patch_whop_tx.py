"""Patch whop_payment.py to add transaction recording in process_membership_activated."""
import re

with open("/root/Soccer_Prediction_AI/backend/whop_payment.py", "r") as f:
    content = f.read()

# Find the target: the if-block that checks for magic_token
target = '        if result["success"] and result.get("magic_token"):'

if target not in content:
    print("ERROR: Could not find target line")
    exit(1)

# Insert the transaction recording block BEFORE the magic_token check
insertion = '''        if result.get("success") and result.get("user_id"):
            # Record marketplace transaction for revenue tracking
            plan_obj = data.get("plan", {})
            amount = None
            if isinstance(plan_obj, dict):
                for price_field in ("renewal_price", "initial_price", "base_price"):
                    val = plan_obj.get(price_field)
                    if val is not None:
                        try:
                            amount = float(val)
                            break
                        except (ValueError, TypeError):
                            pass
            if not amount:
                amount = WHOP_MARKETPLACE_PRICE
            _record_marketplace_transaction(
                user_id=result["user_id"],
                membership_id=membership_id,
                amount_usd=amount,
                metadata={"email": email, "whop_user_id": whop_user_id, "source": "marketplace_webhook"},
            )

'''

content = content.replace(target, insertion + target)

with open("/root/Soccer_Prediction_AI/backend/whop_payment.py", "w") as f:
    f.write(content)

print("OK: Added transaction recording call")
