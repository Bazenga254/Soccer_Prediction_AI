"""Patch admin.css to add .tx-tab.active.whop style."""

filepath = "/root/Soccer_Prediction_AI/frontend/src/pages/admin/styles/admin.css"

with open(filepath, "r") as f:
    content = f.read()

old_css = """.tx-tab.active.usd {
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.4);
  color: #60a5fa;
}

.tx-tab-icon {"""

new_css = """.tx-tab.active.usd {
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.4);
  color: #60a5fa;
}

.tx-tab.active.whop {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.4);
  color: #fbbf24;
}

.tx-tab-icon {"""

if old_css not in content:
    print("ERROR: Could not find target CSS")
    exit(1)
content = content.replace(old_css, new_css)

with open(filepath, "w") as f:
    f.write(content)

print("OK: Added .tx-tab.active.whop CSS")
