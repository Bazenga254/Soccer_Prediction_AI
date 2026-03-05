"""Patch OverviewTab.jsx to add Whop Marketplace tab."""

filepath = "/root/Soccer_Prediction_AI/frontend/src/pages/admin/tabs/OverviewTab.jsx"

with open(filepath, "r") as f:
    content = f.read()

# 1. Add Whop tab button after USD button
old_tabs = """          <button className={`tx-tab ${txTab === 'usd' ? 'active usd' : ''}`} onClick={() => switchTab('usd')}>
            <span className="tx-tab-icon">💳</span> USD (Card)
          </button>
        </div>"""

new_tabs = """          <button className={`tx-tab ${txTab === 'usd' ? 'active usd' : ''}`} onClick={() => switchTab('usd')}>
            <span className="tx-tab-icon">💳</span> USD (Card)
          </button>
          <button className={`tx-tab ${txTab === 'whop' ? 'active whop' : ''}`} onClick={() => switchTab('whop')}>
            <span className="tx-tab-icon">🏪</span> Whop Marketplace
          </button>
        </div>"""

if old_tabs not in content:
    print("ERROR: Could not find tab buttons")
    exit(1)
content = content.replace(old_tabs, new_tabs)

# 2. Update chart title
old_title = "{txTab === 'kes' ? 'M-Pesa Income' : 'Card Income'}"
new_title = "{txTab === 'kes' ? 'M-Pesa Income' : txTab === 'whop' ? 'Whop Marketplace Income' : 'Card Income'}"
if old_title not in content:
    print("ERROR: Could not find chart title")
    exit(1)
content = content.replace(old_title, new_title)

# 3. Update chart color
old_color = "color={txTab === 'kes' ? '#22c55e' : '#3b82f6'}"
new_color = "color={txTab === 'kes' ? '#22c55e' : txTab === 'whop' ? '#f59e0b' : '#3b82f6'}"
if old_color not in content:
    print("ERROR: Could not find chart color")
    exit(1)
content = content.replace(old_color, new_color)

with open(filepath, "w") as f:
    f.write(content)

print("OK: Added Whop tab to OverviewTab.jsx")
