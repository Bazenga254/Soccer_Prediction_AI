import { useState } from 'react'
import axios from 'axios'

export default function UserDetailPanel({ userProfile, onBack, onTierChange, onToggleActive, staffRole, getAuthHeaders, onRefresh }) {
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustCurrency, setAdjustCurrency] = useState('USD')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustType, setAdjustType] = useState('credit')
  const [adjusting, setAdjusting] = useState(false)
  const [adjustMsg, setAdjustMsg] = useState('')
  const [showAdjust, setShowAdjust] = useState(false)

  if (!userProfile) return null

  const sub = userProfile.subscription
  const wallet = userProfile.wallet
  const userBalance = userProfile.user_balance
  const tracking = userProfile.tracking
  const balanceAdjustments = userProfile.balance_adjustments || []
  const transactions = userProfile.transactions || []
  const withdrawals = userProfile.withdrawals || []
  const hasFinancialActivity = transactions.length > 0 || withdrawals.length > 0
  const isSuperAdmin = staffRole === 'super_admin'

  const handleAdjustBalance = async () => {
    const amt = parseFloat(adjustAmount)
    if (!amt || amt <= 0) { setAdjustMsg('Enter a valid amount'); return }
    setAdjusting(true)
    setAdjustMsg('')
    const finalAmt = adjustType === 'debit' ? -amt : amt
    try {
      await axios.post(`/api/admin/users/${userProfile.id}/adjust-balance`, {
        amount_usd: adjustCurrency === 'USD' ? finalAmt : 0,
        amount_kes: adjustCurrency === 'KES' ? finalAmt : 0,
        reason: adjustReason || (adjustType === 'credit' ? 'Admin credit' : 'Admin debit'),
        adjustment_type: adjustType === 'credit' ? 'admin_credit' : 'admin_debit',
      }, { headers: getAuthHeaders() })
      setAdjustMsg('Balance updated successfully')
      setAdjustAmount('')
      setAdjustReason('')
      if (onRefresh) onRefresh(userProfile.id)
      setTimeout(() => { setAdjustMsg(''); setShowAdjust(false) }, 1500)
    } catch (err) {
      setAdjustMsg(err.response?.data?.detail || 'Failed to adjust balance')
    }
    setAdjusting(false)
  }

  return (
    <div className="user-detail-panel">
      <div className="user-detail-header">
        <button className="user-detail-back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
      </div>

      <div className="user-detail-body">
        {/* Top: Avatar + Name */}
        <div className="user-detail-top">
          {userProfile.avatar_url ? (
            <img src={userProfile.avatar_url} alt="" className="user-detail-avatar-img" />
          ) : (
            <span className="user-detail-avatar" style={{ background: userProfile.avatar_color }}>
              {(userProfile.display_name || '?')[0].toUpperCase()}
            </span>
          )}
          <h3>{userProfile.display_name}</h3>
          {userProfile.full_name && <p className="user-detail-realname">{userProfile.full_name}</p>}
          <p className="user-detail-username">@{userProfile.username}</p>
          <div className="user-detail-badges">
            <span className={`admin-support-tier-badge ${userProfile.tier}`}>{userProfile.tier?.toUpperCase()}</span>
            <span className={`admin-support-status-badge ${userProfile.is_active ? 'active' : 'suspended'}`}>
              {userProfile.is_active ? 'Active' : 'Suspended'}
            </span>
          </div>
        </div>

        {/* Personal Info */}
        <div className="user-detail-section">
          <h4>Personal Info</h4>
          <div className="user-detail-grid">
            <div className="user-detail-row"><span>Full Name</span><strong>{userProfile.full_name || 'Not set'}</strong></div>
            <div className="user-detail-row"><span>Email</span><strong>{userProfile.email}</strong></div>
            <div className="user-detail-row"><span>Date of Birth</span><strong>{userProfile.date_of_birth || 'Not set'}</strong></div>
            <div className="user-detail-row"><span>Joined</span><strong>{userProfile.created_at ? new Date(userProfile.created_at).toLocaleDateString() : 'N/A'}</strong></div>
            <div className="user-detail-row"><span>Logins</span><strong>{userProfile.login_count || 0}</strong></div>
            <div className="user-detail-row"><span>Last Login</span><strong>{userProfile.last_login ? new Date(userProfile.last_login).toLocaleDateString() : 'Never'}</strong></div>
            <div className="user-detail-row"><span>Referral Code</span><strong>{userProfile.referral_code || 'None'}</strong></div>
            <div className="user-detail-row"><span>Security Question</span><strong>{userProfile.security_question ? 'Set' : 'Not set'}</strong></div>
          </div>
        </div>

        {/* Device & Analytics */}
        {tracking && tracking.has_tracking && (
          <div className="user-detail-section">
            <h4>Device & Analytics</h4>
            <div className="user-detail-grid">
              <div className="user-detail-row"><span>Country (IP)</span><strong>{tracking.latest?.country_ip || 'Unknown'}</strong></div>
              <div className="user-detail-row"><span>Country (Profile)</span><strong>{userProfile.country || 'Not set'}</strong></div>
              <div className="user-detail-row">
                <span>Cookie Consent</span>
                <strong className={tracking.cookie_consent ? 'text-green' : 'text-red'}>
                  {tracking.cookie_consent === true ? 'Accepted' : tracking.cookie_consent === false ? 'Declined' : 'Unknown'}
                </strong>
              </div>
              <div className="user-detail-row">
                <span>Device Type</span>
                <strong>{tracking.latest?.device_type === 'mobile' ? 'Phone' : tracking.latest?.device_type === 'tablet' ? 'Tablet' : tracking.latest?.device_type === 'desktop' ? 'Desktop' : '-'}</strong>
              </div>
              <div className="user-detail-row"><span>Browser</span><strong>{tracking.latest?.browser || '-'}</strong></div>
              <div className="user-detail-row"><span>Operating System</span><strong>{tracking.latest?.os || '-'}</strong></div>
              <div className="user-detail-row"><span>Traffic Source</span><strong>{tracking.first_visit?.source || 'Direct'}</strong></div>
              {tracking.first_visit?.referrer && (
                <div className="user-detail-row"><span>Original Referrer</span><strong className="tracking-referrer">{tracking.first_visit.referrer}</strong></div>
              )}
              <div className="user-detail-row"><span>IP Address</span><strong>{tracking.latest?.ip_address || '-'}</strong></div>
              <div className="user-detail-row"><span>Total Sessions</span><strong>{tracking.total_sessions}</strong></div>
              <div className="user-detail-row"><span>Total Page Views</span><strong>{tracking.total_pageviews}</strong></div>
              {tracking.first_visit?.timestamp && (
                <div className="user-detail-row"><span>First Visit</span><strong>{new Date(tracking.first_visit.timestamp).toLocaleDateString()}</strong></div>
              )}
              {tracking.latest?.last_seen && (
                <div className="user-detail-row"><span>Last Seen</span><strong>{new Date(tracking.latest.last_seen).toLocaleString()}</strong></div>
              )}
            </div>
          </div>
        )}

        {/* Account Balance */}
        <div className="user-detail-section">
          <h4>Account Balance</h4>
          <div className="user-detail-wallet-grid">
            <div className="user-detail-wallet-card balance-card">
              <span>Balance</span>
              <strong className="balance-amount">${(userBalance?.balance_usd || 0).toFixed(2)} / KES {(userBalance?.balance_kes || 0).toFixed(0)}</strong>
            </div>
            <div className="user-detail-wallet-card">
              <span>Total Deposited</span>
              <strong>${(userBalance?.total_deposited_usd || 0).toFixed(2)} / KES {(userBalance?.total_deposited_kes || 0).toFixed(0)}</strong>
            </div>
            <div className="user-detail-wallet-card">
              <span>Total Spent</span>
              <strong>${(userBalance?.total_spent_usd || 0).toFixed(2)} / KES {(userBalance?.total_spent_kes || 0).toFixed(0)}</strong>
            </div>
          </div>

          {/* Super admin: adjust balance controls */}
          {isSuperAdmin && (
            <div className="balance-adjust-section">
              {!showAdjust ? (
                <button className="balance-adjust-toggle" onClick={() => setShowAdjust(true)}>Adjust Balance</button>
              ) : (
                <div className="balance-adjust-form">
                  <div className="balance-adjust-row">
                    <select value={adjustType} onChange={e => setAdjustType(e.target.value)} className="balance-adjust-select">
                      <option value="credit">Add (+)</option>
                      <option value="debit">Subtract (-)</option>
                    </select>
                    <input
                      type="number"
                      value={adjustAmount}
                      onChange={e => setAdjustAmount(e.target.value)}
                      placeholder="Amount"
                      min="0"
                      step="0.01"
                      className="balance-adjust-input"
                    />
                    <select value={adjustCurrency} onChange={e => setAdjustCurrency(e.target.value)} className="balance-adjust-select">
                      <option value="USD">USD</option>
                      <option value="KES">KES</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={adjustReason}
                    onChange={e => setAdjustReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="balance-adjust-reason"
                  />
                  <div className="balance-adjust-actions">
                    <button className="balance-adjust-btn confirm" onClick={handleAdjustBalance} disabled={adjusting}>
                      {adjusting ? 'Updating...' : 'Confirm'}
                    </button>
                    <button className="balance-adjust-btn cancel" onClick={() => { setShowAdjust(false); setAdjustMsg('') }}>Cancel</button>
                  </div>
                  {adjustMsg && <div className={`balance-adjust-msg ${adjustMsg.includes('success') ? 'success' : 'error'}`}>{adjustMsg}</div>}
                </div>
              )}
            </div>
          )}

          {/* Balance adjustment history */}
          {balanceAdjustments.length > 0 && (
            <div className="balance-history">
              <h5>Recent Adjustments</h5>
              {balanceAdjustments.map(adj => (
                <div key={adj.id} className="balance-history-item">
                  <div className="balance-history-top">
                    <span className={`balance-history-type ${adj.adjustment_type}`}>
                      {adj.adjustment_type === 'admin_credit'
                        ? `Credited by ${adj.adjusted_by_name || 'Super Admin'}`
                        : adj.adjustment_type === 'admin_debit'
                        ? `Debited by ${adj.adjusted_by_name || 'Super Admin'}`
                        : adj.adjustment_type}
                    </span>
                    <span className="balance-history-amount">
                      {adj.amount_usd !== 0 ? `${adj.amount_usd > 0 ? '+' : ''}$${adj.amount_usd.toFixed(2)}` : ''}
                      {adj.amount_kes !== 0 ? `${adj.amount_usd !== 0 ? ' / ' : ''}${adj.amount_kes > 0 ? '+' : ''}KES ${adj.amount_kes.toFixed(0)}` : ''}
                    </span>
                  </div>
                  {adj.reason && <div className="balance-history-reason">{adj.reason}</div>}
                  <div className="balance-history-meta">
                    <span>{adj.created_at ? new Date(adj.created_at).toLocaleString() : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Subscription */}
        <div className="user-detail-section">
          <h4>Subscription</h4>
          {sub ? (
            <div className="user-detail-sub-card">
              <div className="user-detail-sub-plan">{sub.plan?.replace('_', ' ').toUpperCase()}</div>
              <div className="user-detail-grid">
                <div className="user-detail-row"><span>Price</span><strong>{sub.price_currency} {sub.price_amount}</strong></div>
                <div className="user-detail-row"><span>Status</span><strong className="text-green">{sub.status}</strong></div>
                <div className="user-detail-row"><span>Expires</span><strong>{sub.expires_at ? new Date(sub.expires_at).toLocaleDateString() : 'N/A'}</strong></div>
                <div className="user-detail-row"><span>Days Left</span><strong>{sub.days_remaining}</strong></div>
              </div>
            </div>
          ) : (
            <p className="user-detail-empty">No active subscription (Free tier)</p>
          )}
        </div>

        {/* Creator Wallet */}
        <div className="user-detail-section">
          <h4>Creator Wallet</h4>
          {wallet ? (
            <div className="user-detail-wallet-grid">
              <div className="user-detail-wallet-card">
                <span>Balance</span>
                <strong>${wallet.balance_usd?.toFixed(2)} / KES {wallet.balance_kes?.toFixed(0)}</strong>
              </div>
              <div className="user-detail-wallet-card">
                <span>Total Earned</span>
                <strong>${wallet.total_earned_usd?.toFixed(2)} / KES {wallet.total_earned_kes?.toFixed(0)}</strong>
              </div>
              <div className="user-detail-wallet-card">
                <span>Total Sales</span>
                <strong>{wallet.total_sales}</strong>
              </div>
            </div>
          ) : (
            <p className="user-detail-empty">No creator wallet</p>
          )}
        </div>

        {/* Transactions */}
        <div className="user-detail-section">
          <h4>Transaction History</h4>
          {hasFinancialActivity ? (
            <div className="user-detail-tx-list">
              {transactions.map(tx => (
                <div key={`tx-${tx.id}`} className="user-detail-tx-item">
                  <div className="user-detail-tx-top">
                    <span className={`user-detail-tx-type ${tx.transaction_type}`}>
                      {tx.transaction_type === 'subscription' ? 'Subscription' : tx.transaction_type === 'prediction_purchase' ? 'Prediction' : tx.transaction_type}
                    </span>
                    <span className={`user-detail-tx-status ${tx.payment_status}`}>{tx.payment_status}</span>
                  </div>
                  <div className="user-detail-tx-amounts">
                    KES {tx.amount_kes?.toFixed(0)} (${tx.amount_usd?.toFixed(2)})
                  </div>
                  <div className="user-detail-tx-date">{tx.created_at ? new Date(tx.created_at).toLocaleString() : ''}</div>
                </div>
              ))}
              {withdrawals.length > 0 && (
                <>
                  <h5 style={{ color: '#94a3b8', margin: '12px 0 6px', fontSize: '12px' }}>Withdrawals</h5>
                  {withdrawals.map(w => (
                    <div key={`wd-${w.id}`} className="user-detail-tx-item">
                      <div className="user-detail-tx-top">
                        <span className="user-detail-tx-type withdrawal">Withdrawal</span>
                        <span className={`user-detail-tx-status ${w.status}`}>{w.status}</span>
                      </div>
                      <div className="user-detail-tx-amounts">
                        ${w.amount_usd?.toFixed(2)} → KES {w.amount_kes?.toFixed(0)}
                      </div>
                      <div className="user-detail-tx-date">{w.created_at ? new Date(w.created_at).toLocaleString() : ''}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            <p className="user-detail-empty">No transactions yet</p>
          )}
        </div>

        {/* Actions */}
        <div className="user-detail-actions">
          <button className="admin-action-btn tier" onClick={() => onTierChange(userProfile.id, userProfile.tier)}>
            {userProfile.tier === 'pro' ? 'Downgrade to Free' : 'Upgrade to Pro'}
          </button>
          <button className={`admin-action-btn ${userProfile.is_active ? 'suspend' : 'activate'}`} onClick={() => onToggleActive(userProfile.id, userProfile.is_active)}>
            {userProfile.is_active ? 'Suspend User' : 'Activate User'}
          </button>
        </div>
      </div>
    </div>
  )
}
