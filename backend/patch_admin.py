"""Patch admin_routes.py to support currency=whop and exclude marketplace from usd."""

with open("/root/Soccer_Prediction_AI/backend/admin_routes.py", "r") as f:
    content = f.read()

# 1. Extend currency validation
old_validation = '''    cur = currency.lower()
    if cur not in ("kes", "usd"):
        cur = "kes"'''

new_validation = '''    cur = currency.lower()
    if cur not in ("kes", "usd", "whop"):
        cur = "kes"'''

if old_validation not in content:
    print("ERROR: Could not find currency validation")
    exit(1)
content = content.replace(old_validation, new_validation)

# 2. Extend table/column mapping
old_mapping = '''    if cur == "kes":
        tbl, amt_col = "payment_transactions", "amount_kes"
        status_cond = "payment_status IN ('completed', 'confirmed')"
    else:
        tbl, amt_col = "whop_transactions", "amount_usd"
        status_cond = "payment_status = 'completed'"'''

new_mapping = '''    if cur == "kes":
        tbl, amt_col = "payment_transactions", "amount_kes"
        status_cond = "payment_status IN ('completed', 'confirmed')"
    elif cur == "whop":
        tbl, amt_col = "whop_transactions", "amount_usd"
        status_cond = "payment_status = 'completed' AND transaction_type = 'marketplace_subscription'"
    else:  # usd (card)
        tbl, amt_col = "whop_transactions", "amount_usd"
        status_cond = "payment_status = 'completed' AND transaction_type != 'marketplace_subscription'"'''

if old_mapping not in content:
    print("ERROR: Could not find table mapping")
    exit(1)
content = content.replace(old_mapping, new_mapping)

with open("/root/Soccer_Prediction_AI/backend/admin_routes.py", "w") as f:
    f.write(content)

print("OK: Extended admin analytics for whop currency")
