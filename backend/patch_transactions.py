"""Patch transactions.py to handle marketplace_subscription type."""

with open("/root/Soccer_Prediction_AI/backend/transactions.py", "r") as f:
    content = f.read()

old = '''        elif tx_type == "subscription":
            ref_id = r["reference_id"] or ""
            unified_type, icon = "subscription", "subscription"
            desc = f"Pro subscription ({ref_id})" if ref_id else "Pro subscription"
        else:
            unified_type, desc, icon = "purchase", "Prediction purchase (Card)", "purchase"

        # Fee: Whop 5.7% + $0.30
        fee = round(amount_usd * WHOP_PERCENTAGE_FEE + WHOP_FIXED_FEE, 2) if amount_usd else 0.0
        fee_desc = "Whop 5.7% + $0.30 processing" if fee > 0 else ""'''

new = '''        elif tx_type == "subscription":
            ref_id = r["reference_id"] or ""
            unified_type, icon = "subscription", "subscription"
            desc = f"Pro subscription ({ref_id})" if ref_id else "Pro subscription"
        elif tx_type == "marketplace_subscription":
            unified_type, icon = "subscription", "subscription"
            desc = "Whop Marketplace — Pro subscription"
        else:
            unified_type, desc, icon = "purchase", "Prediction purchase (Card)", "purchase"

        # Fee calculation
        if tx_type == "marketplace_subscription":
            fee = 0.0  # Whop takes fees on their side
            fee_desc = ""
        else:
            fee = round(amount_usd * WHOP_PERCENTAGE_FEE + WHOP_FIXED_FEE, 2) if amount_usd else 0.0
            fee_desc = "Whop 5.7% + $0.30 processing" if fee > 0 else ""'''

if old in content:
    content = content.replace(old, new)
    with open("/root/Soccer_Prediction_AI/backend/transactions.py", "w") as f:
        f.write(content)
    print("OK: Added marketplace_subscription handling")
else:
    print("ERROR: Target string not found")
