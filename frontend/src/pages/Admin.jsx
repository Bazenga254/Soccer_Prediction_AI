// v2-credits-update
import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'

function StatCard({ label, value, sub, color = '#6c5ce7' }) {
  return (
    <div className="admin-stat-card">
      <div className="stat-card-value" style={{ color }}>{value}</div>
      <div className="stat-card-label">{label}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  )
}

function formatDuration(seconds) {
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function OnlineUsersTab({ getAuthHeaders, staffRole }) {
  const [onlineUsers, setOnlineUsers] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)

  const fetchOnline = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/active-users?detailed=true', { headers: getAuthHeaders() })
      setOnlineUsers(res.data.active_users || [])
      setCount(res.data.count || 0)
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => {
    fetchOnline()
    const interval = setInterval(fetchOnline, 3000)
    return () => clearInterval(interval)
  }, [fetchOnline])

  const viewUserDetail = async (userId) => {
    try {
      const res = await axios.get(`/api/admin/users/${userId}`, { headers: getAuthHeaders() })
      setSelectedUser(res.data)
    } catch { /* ignore */ }
  }

  const handleTierChange = async (userId, currentTier) => {
    try {
      await axios.post(`/api/admin/users/${userId}/set-tier`, { tier: currentTier === 'pro' ? 'free' : 'pro' }, { headers: getAuthHeaders() })
      viewUserDetail(userId)
    } catch { /* ignore */ }
  }

  const handleToggleActive = async (userId, isActive) => {
    try {
      await axios.post(`/api/admin/users/${userId}/toggle-active`, { is_active: isActive ? 0 : 1 }, { headers: getAuthHeaders() })
      viewUserDetail(userId)
    } catch { /* ignore */ }
  }

  if (loading) return <div className="admin-loading">Loading online users...</div>

  return (
    <div className="admin-tab-content">
      <div className="admin-online-header-bar">
        <h3>
          <span className="online-dot-pulse"></span>
          {count} User{count !== 1 ? 's' : ''} Currently Online
        </h3>
        <span className="admin-online-refresh-note">Auto-refreshes every 3s</span>
      </div>

      {onlineUsers.length === 0 ? (
        <div className="admin-empty-row" style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ fontSize: '16px', color: '#94a3b8' }}>No users currently online.</p>
        </div>
      ) : (
        <div className="admin-online-detailed-list">
          <div className="admin-online-table-header">
            <span className="col-avatar"></span>
            <span className="col-name">User</span>
            <span className="col-email">Email</span>
            <span className="col-tier">Plan</span>
            <span className="col-status">Session</span>
            <span className="col-joined">Activity</span>
            <span className="col-actions">Actions</span>
          </div>
          {onlineUsers.map(u => (
            <div key={u.user_id} className="admin-online-table-row">
              <span className="col-avatar">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="admin-user-avatar" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                ) : (
                  <span className="admin-user-avatar" style={{ background: u.avatar_color || '#6c5ce7' }}>
                    {(u.display_name || '?')[0].toUpperCase()}
                  </span>
                )}
              </span>
              <span className="col-name">
                <strong>{u.display_name}</strong>
                {u.full_name && <small className="admin-real-name">{u.full_name}</small>}
                <small>@{u.username}</small>
              </span>
              <span className="col-email">{u.email || '-'}</span>
              <span className="col-tier">
                {u.subscription ? (
                  <div className="online-plan-info">
                    <span className={`tier-tag pro`}>{u.subscription.plan?.replace('_', ' ').toUpperCase()}</span>
                    <small>{u.subscription.days_remaining}d left</small>
                  </div>
                ) : (
                  <span className={`tier-tag ${u.tier || 'free'}`}>{(u.tier || 'free').toUpperCase()}</span>
                )}
              </span>
              <span className="col-status">
                <div className="online-session-info">
                  <span className="online-duration">{formatDuration(u.online_duration)}</span>
                  <small className="online-label">online</small>
                </div>
              </span>
              <span className="col-joined">
                <span className="online-last-active">
                  {u.last_seen < 10 ? 'Active now' : `${u.last_seen}s ago`}
                </span>
                {u.login_count > 0 && <small>{u.login_count} logins</small>}
              </span>
              <span className="col-actions">
                <button className="admin-action-btn view-detail" onClick={() => viewUserDetail(u.user_id)}>
                  View Profile
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Balance overview for online users */}
      {onlineUsers.length > 0 && (
        <div className="admin-online-summary">
          <h4>Online Users Summary</h4>
          <div className="admin-stats-grid">
            <StatCard label="Online Now" value={count} color="#22c55e" />
            <StatCard label="Pro Users" value={onlineUsers.filter(u => u.tier === 'pro' || u.subscription).length} color="#fdcb6e" />
            <StatCard label="Free Users" value={onlineUsers.filter(u => u.tier !== 'pro' && !u.subscription).length} color="#74b9ff" />
          </div>
        </div>
      )}

      {selectedUser && (
        <div className="admin-modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="user-detail-modal" onClick={(e) => e.stopPropagation()}>
            <UserDetailPanel
              userProfile={selectedUser}
              onBack={() => setSelectedUser(null)}
              onTierChange={handleTierChange}
              onToggleActive={handleToggleActive}
              staffRole={staffRole}
              getAuthHeaders={getAuthHeaders}
              onRefresh={(id, params) => {
                if (params) {
                  axios.get("/api/admin/users/" + id + params, { headers: getAuthHeaders() }).then(res => setDetailUser(res.data)).catch(() => {})
                } else {
                  viewUserDetail(id)
                }
              }}
              onViewUser={(id) => viewUserDetail(id)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function OverviewTab({ getAuthHeaders }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/dashboard-stats', { headers: getAuthHeaders() })
      setStats(res.data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  const [onlineCount, setOnlineCount] = useState(0)

  useEffect(() => {
    const fetchOnline = () => {
      axios.get('/api/active-users-count').then(res => {
        setOnlineCount(res.data.active_users || 0)
      }).catch(() => {})
    }
    fetchOnline()
    const interval = setInterval(fetchOnline, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  if (loading) return <div className="admin-loading">Loading stats...</div>
  if (!stats) return null

  const { users, community, predictions, subscriptions: subs, balance_adjustments: bal } = stats

  return (
    <div className="admin-tab-content">
      <div className="admin-overview-online">
        <span className="online-dot-pulse"></span>
        <span className="admin-overview-online-count">{onlineCount.toLocaleString()}</span>
        <span className="admin-overview-online-label">users online now</span>
      </div>

      <h3>Platform Overview</h3>
      <div className="admin-stats-grid">
        <StatCard label="Total Users" value={users?.total_users || 0} color="#6c5ce7" />
        <StatCard label="Active Users" value={users?.active_users || 0} color="#00b894" />
        <StatCard label="Pro Users" value={users?.pro_users || 0} color="#fdcb6e" />
        <StatCard label="Free Users" value={users?.free_users || 0} color="#74b9ff" />
        <StatCard label="New Today" value={users?.new_today || 0} color="#55efc4" />
      </div>

      <h3>Subscriptions & Revenue</h3>
      <div className="admin-stats-grid">
        <StatCard label="Active Subs" value={subs?.active || 0} color="#00b894" />
        <StatCard label="Total Subs" value={subs?.total_subscriptions || 0} color="#6c5ce7" />
        <StatCard label="Cancelled" value={subs?.cancelled || 0} color="#e17055" />
        <StatCard label="Expired" value={subs?.expired || 0} color="#636e72" />
        <StatCard label="Revenue (USD)" value={`$${subs?.revenue_usd || 0}`} color="#fdcb6e" />
        <StatCard label="Revenue (KES)" value={`KES ${subs?.revenue_kes || 0}`} color="#55efc4" />
      </div>

      {bal && bal.total_adjustments > 0 && (
        <>
          <h3>Balance Adjustments (by Super Admin)</h3>
          <div className="admin-stats-grid">
            <StatCard label="Total Adjustments" value={bal.total_adjustments} color="#a78bfa" />
            <StatCard label="Credited (USD)" value={`$${bal.total_credited_usd}`} color="#22c55e" />
            <StatCard label="Debited (USD)" value={`$${bal.total_debited_usd}`} color="#ef4444" />
            <StatCard label="Credited (KES)" value={`KES ${bal.total_credited_kes}`} color="#22c55e" />
            <StatCard label="Debited (KES)" value={`KES ${bal.total_debited_kes}`} color="#ef4444" />
          </div>
        </>
      )}

      <h3>Community Activity</h3>
      <div className="admin-stats-grid">
        <StatCard label="Predictions Shared" value={community?.total_predictions || 0} color="#e17055" />
        <StatCard label="Public" value={community?.public_predictions || 0} color="#00b894" />
        <StatCard label="Private" value={community?.private_predictions || 0} color="#636e72" />
        <StatCard label="Total Ratings" value={community?.total_ratings || 0} color="#fdcb6e" />
        <StatCard label="Total Comments" value={community?.total_comments || 0} color="#74b9ff" />
        <StatCard label="Unique Sharers" value={community?.unique_sharers || 0} color="#a29bfe" />
        <StatCard label="Today's Predictions" value={community?.predictions_today || 0} color="#55efc4" />
      </div>

      <h3>Prediction Accuracy</h3>
      <div className="admin-stats-grid">
        <StatCard
          label="Total Predictions"
          value={predictions?.total_predictions || 0}
          color="#6c5ce7"
        />
        <StatCard
          label="Completed"
          value={predictions?.matches_finished || 0}
          color="#00b894"
        />
        <StatCard
          label="Result Accuracy"
          value={predictions?.result_accuracy?.percentage ? `${predictions.result_accuracy.percentage}%` : 'N/A'}
          color={predictions?.result_accuracy?.percentage >= 60 ? '#00b894' : predictions?.result_accuracy?.percentage >= 40 ? '#fdcb6e' : '#e17055'}
        />
        <StatCard
          label="O/U 2.5 Accuracy"
          value={predictions?.over25_accuracy?.percentage ? `${predictions.over25_accuracy.percentage}%` : 'N/A'}
          color={predictions?.over25_accuracy?.percentage >= 60 ? '#00b894' : '#fdcb6e'}
        />
        <StatCard
          label="BTTS Accuracy"
          value={predictions?.btts_accuracy?.percentage ? `${predictions.btts_accuracy.percentage}%` : 'N/A'}
          color={predictions?.btts_accuracy?.percentage >= 60 ? '#00b894' : '#fdcb6e'}
        />
      </div>
    </div>
  )
}

function UserDetailPanel({ userProfile, onBack, onTierChange, onToggleActive, staffRole, getAuthHeaders, onRefresh, onViewUser }) {
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustCurrency, setAdjustCurrency] = useState('USD')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustType, setAdjustType] = useState('credit')
  const [adjusting, setAdjusting] = useState(false)
  const [adjustMsg, setAdjustMsg] = useState('')
  const [showAdjust, setShowAdjust] = useState(false)
  const [txPage, setTxPage] = useState(1)
  const [adjPage, setAdjPage] = useState(1)

  if (!userProfile) return null

  const sub = userProfile.subscription
  const wallet = userProfile.wallet
  const userBalance = userProfile.user_balance
  const balanceAdjustments = userProfile.balance_adjustments || []
  const transactions = userProfile.transactions || []
  const withdrawals = userProfile.withdrawals || []
  const hasFinancialActivity = transactions.length > 0 || withdrawals.length > 0
  const isSuperAdmin = staffRole === 'super_admin'
  const credits = userProfile.credits || {}
  const creditUsage = userProfile.credit_usage || {}
  const referrer = userProfile.referrer || null
  const txTotal = userProfile.transactions_total || 0
  const adjTotal = userProfile.balance_adjustments_total || 0
  const txTotalPages = Math.ceil(txTotal / 10) || 1
  const adjTotalPages = Math.ceil(adjTotal / 10) || 1

  const fetchPage = async (type, page) => {
    try {
      const params = type === 'tx'
        ? `?tx_page=${page}&adj_page=${adjPage}`
        : `?tx_page=${txPage}&adj_page=${page}`
      const res = await axios.get(`/api/admin/users/${userProfile.id}${params}`, { headers: getAuthHeaders() })
      if (onRefresh) onRefresh(userProfile.id, params)
    } catch { /* ignore */ }
  }

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
            <div className="user-detail-row"><span>Referred By</span><strong>{referrer ? (
              <span className="referrer-link" onClick={() => onViewUser && onViewUser(referrer.id)} style={{ cursor: 'pointer', color: '#60a5fa' }}>
                @{referrer.username} ({referrer.display_name})
              </span>
            ) : 'Direct signup'}</strong></div>
            <div className="user-detail-row"><span>Security Question</span><strong>{userProfile.security_question ? 'Set' : 'Not set'}</strong></div>
          </div>
        </div>

        {/* Credits */}
        <div className="user-detail-section">
          <h4>Credits</h4>
          <div className="user-detail-wallet-grid">
            <div className="user-detail-wallet-card credit-card-total">
              <span>Total Credits</span>
              <strong className="credit-amount">{(credits.total_credits || 0).toLocaleString()}</strong>
            </div>
            <div className="user-detail-wallet-card credit-card-purchased">
              <span>Purchased</span>
              <strong>{(credits.purchased_credits || 0).toLocaleString()}</strong>
            </div>
            <div className="user-detail-wallet-card credit-card-daily">
              <span>Daily</span>
              <strong>{(credits.daily_credits || 0).toLocaleString()}</strong>
            </div>
          </div>
          {credits.daily_expires_at && (
            <p className="credit-expiry-note">Daily credits expire: {new Date(credits.daily_expires_at).toLocaleString()}</p>
          )}
          {creditUsage && (creditUsage.predictions?.count > 0 || creditUsage.jackpot?.count > 0 || creditUsage.other?.count > 0) && (
            <div className="credit-usage-breakdown">
              <h5>Usage Breakdown</h5>
              <div className="credit-usage-list">
                {creditUsage.predictions?.count > 0 && (
                  <div className="credit-usage-item">
                    <span className="credit-usage-label">Predictions</span>
                    <span className="credit-usage-count">{creditUsage.predictions.count} views</span>
                    <span className="credit-usage-total">{creditUsage.predictions.total_credits.toLocaleString()} credits</span>
                  </div>
                )}
                {creditUsage.jackpot?.count > 0 && (
                  <div className="credit-usage-item">
                    <span className="credit-usage-label">Jackpot Analysis</span>
                    <span className="credit-usage-count">{creditUsage.jackpot.count} runs</span>
                    <span className="credit-usage-total">{creditUsage.jackpot.total_credits.toLocaleString()} credits</span>
                  </div>
                )}
                {creditUsage.other?.count > 0 && (
                  <div className="credit-usage-item">
                    <span className="credit-usage-label">Other</span>
                    <span className="credit-usage-count">{creditUsage.other.count}</span>
                    <span className="credit-usage-total">{creditUsage.other.total_credits.toLocaleString()} credits</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

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
              <div className="section-header-row">
                <h5>Recent Adjustments</h5>
                {adjTotal > 10 && <span className="pagination-info">Page {adjPage} of {adjTotalPages}</span>}
              </div>
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
              {adjTotal > 10 && (
                <div className="pagination-controls">
                  <button className="pagination-btn" disabled={adjPage <= 1} onClick={() => { setAdjPage(adjPage - 1); fetchPage('adj', adjPage - 1) }}>Prev</button>
                  <button className="pagination-btn" disabled={adjPage >= adjTotalPages} onClick={() => { setAdjPage(adjPage + 1); fetchPage('adj', adjPage + 1) }}>Next</button>
                </div>
              )}
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
          <div className="section-header-row">
            <h4>Transaction History</h4>
            {txTotal > 10 && <span className="pagination-info">Page {txPage} of {txTotalPages}</span>}
          </div>
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
              {txTotal > 10 && (
                <div className="pagination-controls">
                  <button className="pagination-btn" disabled={txPage <= 1} onClick={() => { setTxPage(txPage - 1); fetchPage('tx', txPage - 1) }}>Prev</button>
                  <button className="pagination-btn" disabled={txPage >= txTotalPages} onClick={() => { setTxPage(txPage + 1); fetchPage('tx', txPage + 1) }}>Next</button>
                </div>
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

function UsersTab({ getAuthHeaders, staffRole }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTier, setFilterTier] = useState('all')
  const [resetModal, setResetModal] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMsg, setResetMsg] = useState('')
  const [detailUser, setDetailUser] = useState(null)

  const viewUserDetail = async (userId) => {
    try {
      const res = await axios.get(`/api/admin/users/${userId}`, { headers: getAuthHeaders() })
      setDetailUser(res.data)
    } catch { /* ignore */ }
  }

  const handleDetailTierChange = async (userId, currentTier) => {
    try {
      await axios.post(`/api/admin/users/${userId}/set-tier`, { tier: currentTier === 'pro' ? 'free' : 'pro' }, { headers: getAuthHeaders() })
      viewUserDetail(userId)
      fetchUsers()
    } catch { /* ignore */ }
  }

  const handleDetailToggleActive = async (userId, isActive) => {
    try {
      await axios.post(`/api/admin/users/${userId}/toggle-active`, { is_active: isActive ? 0 : 1 }, { headers: getAuthHeaders() })
      viewUserDetail(userId)
      fetchUsers()
    } catch { /* ignore */ }
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/users', { headers: getAuthHeaders() })
      setUsers(res.data.users || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleToggleActive = async (userId, currentActive) => {
    try {
      await axios.post(`/api/admin/users/${userId}/toggle-active`, {
        is_active: !currentActive
      }, { headers: getAuthHeaders() })
      fetchUsers()
    } catch { alert('Failed to update user') }
  }

  const handleSetTier = async (userId, newTier) => {
    try {
      await axios.post(`/api/admin/users/${userId}/set-tier`, {
        tier: newTier
      }, { headers: getAuthHeaders() })
      fetchUsers()
    } catch { alert('Failed to update tier') }
  }

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      setResetMsg('Password must be at least 8 characters')
      return
    }
    setResetLoading(true)
    setResetMsg('')
    try {
      const res = await axios.post(`/api/admin/users/${resetModal.id}/reset-password`, {
        new_password: newPassword
      }, { headers: getAuthHeaders() })
      setResetMsg(res.data.message || 'Password reset successfully')
      setNewPassword('')
      setTimeout(() => { setResetModal(null); setResetMsg('') }, 1500)
    } catch (err) {
      setResetMsg(err.response?.data?.detail || 'Failed to reset password')
    }
    setResetLoading(false)
  }

  const filtered = users.filter(u => {
    const matchesSearch = !search ||
      (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name || '').toLowerCase().includes(search.toLowerCase())
    const matchesTier = filterTier === 'all' || u.tier === filterTier
    return matchesSearch && matchesTier
  })

  if (loading) return <div className="admin-loading">Loading users...</div>

  return (
    <div className="admin-tab-content">
      <div className="admin-users-toolbar">
        <input
          type="text"
          placeholder="Search by email, username, or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-search-input"
        />
        <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)} className="admin-filter-select">
          <option value="all">All Tiers</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
        <span className="admin-user-count">{filtered.length} users</span>
      </div>

      <div className="admin-users-table">
        <div className="admin-table-header">
          <span className="col-avatar"></span>
          <span className="col-name">User</span>
          <span className="col-email">Email</span>
          <span className="col-tier">Tier</span>
          <span className="col-status">Status</span>
          <span className="col-joined">Joined</span>
          <span className="col-logins">Logins</span>
          <span className="col-actions">Actions</span>
        </div>
        {filtered.map(u => (
          <div key={u.id} className={`admin-table-row ${!u.is_active ? 'suspended' : ''}`}>
            <span className="col-avatar">
              <span className="admin-user-avatar" style={{ background: u.avatar_color || '#6c5ce7' }}>
                {(u.display_name || u.username || '?')[0].toUpperCase()}
              </span>
            </span>
            <span className="col-name">
              <strong>{u.display_name || 'No Name'}</strong>
              {u.full_name && <small className="admin-real-name">{u.full_name}</small>}
              <small>@{u.username}</small>
            </span>
            <span className="col-email">
              {u.email}
              {u.date_of_birth && <small className="admin-dob">DOB: {u.date_of_birth}</small>}
            </span>
            <span className="col-tier">
              <span className={`tier-tag ${u.tier}`}>{u.tier?.toUpperCase()}</span>
            </span>
            <span className="col-status">
              <span className={`status-dot ${u.is_active ? 'active' : 'suspended'}`}></span>
              {u.is_active ? 'Active' : 'Suspended'}
            </span>
            <span className="col-joined">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}</span>
            <span className="col-logins">{u.login_count || 0}</span>
            <span className="col-actions">
              <button
                className="admin-action-btn view-detail"
                onClick={() => viewUserDetail(u.id)}
              >
                View
              </button>
              <button
                className={`admin-action-btn ${u.tier === 'pro' ? 'downgrade' : 'upgrade'}`}
                onClick={() => handleSetTier(u.id, u.tier === 'pro' ? 'free' : 'pro')}
              >
                {u.tier === 'pro' ? 'Downgrade' : 'Upgrade'}
              </button>
              <button
                className={`admin-action-btn ${u.is_active ? 'suspend' : 'activate'}`}
                onClick={() => handleToggleActive(u.id, u.is_active)}
              >
                {u.is_active ? 'Suspend' : 'Activate'}
              </button>
              <button
                className="admin-action-btn reset-pw"
                onClick={() => { setResetModal(u); setNewPassword(''); setResetMsg('') }}
              >
                Reset PW
              </button>
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="admin-empty-row">No users found</div>
        )}
      </div>

      {resetModal && (
        <div className="admin-modal-overlay" onClick={() => setResetModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Reset Password</h3>
            <p className="admin-modal-user">
              {resetModal.display_name || resetModal.username} ({resetModal.email})
            </p>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
              className="admin-modal-input"
              autoFocus
            />
            {resetMsg && (
              <div className={`admin-modal-msg ${resetMsg.includes('success') ? 'success' : 'error'}`}>
                {resetMsg}
              </div>
            )}
            <div className="admin-modal-actions">
              <button className="admin-modal-cancel" onClick={() => setResetModal(null)}>Cancel</button>
              <button className="admin-modal-confirm" onClick={handleResetPassword} disabled={resetLoading}>
                {resetLoading ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailUser && (
        <div className="admin-modal-overlay" onClick={() => setDetailUser(null)}>
          <div className="user-detail-modal" onClick={(e) => e.stopPropagation()}>
            <UserDetailPanel
              userProfile={detailUser}
              onBack={() => setDetailUser(null)}
              onTierChange={handleDetailTierChange}
              onToggleActive={handleDetailToggleActive}
              staffRole={staffRole}
              getAuthHeaders={getAuthHeaders}
              onRefresh={viewUserDetail}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function CommunityTab({ getAuthHeaders }) {
  const [predictions, setPredictions] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchPredictions = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/community/predictions?page=${p}&per_page=20`)
      setPredictions(res.data.predictions || [])
      setTotalPages(res.data.total_pages || 1)
      setPage(p)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchPredictions() }, [fetchPredictions])

  const handleDelete = async (predId) => {
    if (!confirm('Delete this prediction? This cannot be undone.')) return
    try {
      await axios.delete(`/api/admin/community/${predId}`, { headers: getAuthHeaders() })
      fetchPredictions(page)
    } catch { alert('Failed to delete prediction') }
  }

  if (loading) return <div className="admin-loading">Loading predictions...</div>

  return (
    <div className="admin-tab-content">
      <h3>Community Predictions ({predictions.length})</h3>

      <div className="admin-community-list">
        {predictions.map(p => (
          <div key={p.id} className="admin-community-item">
            <div className="admin-community-item-header">
              <span className="admin-pred-user">
                <span className="admin-user-avatar-sm" style={{ background: p.avatar_color }}>
                  {(p.display_name || '?')[0].toUpperCase()}
                </span>
                <strong>{p.display_name}</strong>
                <small>@{p.username}</small>
              </span>
              <span className="admin-pred-date">{new Date(p.created_at).toLocaleString()}</span>
            </div>
            <div className="admin-community-item-body">
              <span className="admin-pred-match">{p.team_a_name} vs {p.team_b_name}</span>
              <span className="admin-pred-pick">Pick: {p.predicted_result} ({Math.round(p.predicted_result_prob || 0)}%)</span>
              {p.analysis_summary && <p className="admin-pred-summary">{p.analysis_summary}</p>}
            </div>
            <div className="admin-community-item-footer">
              <span>Ratings: {p.rating_count} | Comments: {p.comment_count} | Avg: {p.avg_rating || '-'}</span>
              <button className="admin-delete-btn" onClick={() => handleDelete(p.id)}>Delete</button>
            </div>
          </div>
        ))}
        {predictions.length === 0 && <p className="admin-empty-row">No community predictions yet.</p>}
      </div>

      {totalPages > 1 && (
        <div className="admin-pagination">
          <button disabled={page <= 1} onClick={() => fetchPredictions(page - 1)}>Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => fetchPredictions(page + 1)}>Next</button>
        </div>
      )}
    </div>
  )
}

function AccessCodesTab({ getAuthHeaders }) {
  const [codes, setCodes] = useState([])
  const [newCodeDays, setNewCodeDays] = useState(30)
  const [newCodeLabel, setNewCodeLabel] = useState('')
  const [createdCode, setCreatedCode] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchCodes = useCallback(async () => {
    try {
      const response = await axios.get('/api/admin/codes', { headers: getAuthHeaders() })
      setCodes(response.data.codes || [])
    } catch { /* ignore */ }
  }, [getAuthHeaders])

  useEffect(() => { fetchCodes() }, [fetchCodes])

  const handleCreateCode = async () => {
    setLoading(true)
    setCreatedCode(null)
    try {
      const response = await axios.post('/api/admin/codes/create', {
        days_valid: newCodeDays,
        label: newCodeLabel,
      }, { headers: getAuthHeaders() })
      setCreatedCode(response.data)
      setNewCodeLabel('')
      fetchCodes()
    } catch { alert('Failed to create code') }
    setLoading(false)
  }

  const handleRevoke = async (code) => {
    if (!confirm(`Revoke code ${code}?`)) return
    try {
      await axios.delete(`/api/admin/codes/${code}`, { headers: getAuthHeaders() })
      fetchCodes()
    } catch { alert('Failed to revoke code') }
  }

  const copyCode = (code) => navigator.clipboard.writeText(code)

  const activeCodes = codes.filter(c => c.status === 'active')
  const inactiveCodes = codes.filter(c => c.status !== 'active')

  return (
    <div className="admin-tab-content">
      <h3>Generate New Code</h3>
      <div className="create-code-form">
        <div className="form-row">
          <div className="form-group">
            <label>User/Label</label>
            <input
              type="text"
              value={newCodeLabel}
              onChange={(e) => setNewCodeLabel(e.target.value)}
              placeholder="e.g. John Discord"
            />
          </div>
          <div className="form-group">
            <label>Days Valid</label>
            <select value={newCodeDays} onChange={(e) => setNewCodeDays(parseInt(e.target.value))}>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>365 days</option>
            </select>
          </div>
          <button className="create-code-btn" onClick={handleCreateCode} disabled={loading}>
            {loading ? 'Creating...' : 'Generate Code'}
          </button>
        </div>
      </div>

      {createdCode && (
        <div className="created-code-display">
          <div className="created-code-value">{createdCode.code}</div>
          <button className="copy-btn" onClick={() => copyCode(createdCode.code)}>Copy Code</button>
          <p className="created-code-info">
            Valid for {createdCode.days_valid} days (expires {new Date(createdCode.expires_at).toLocaleDateString()})
          </p>
        </div>
      )}

      <h3>Active Codes ({activeCodes.length})</h3>
      <div className="codes-table">
        <div className="codes-header">
          <span>Code</span>
          <span>Label</span>
          <span>Expires</span>
          <span>Days Left</span>
          <span>Uses</span>
          <span>Actions</span>
        </div>
        {activeCodes.map(c => (
          <div key={c.code} className="code-row active">
            <span className="code-value">{c.code}</span>
            <span>{c.label || '-'}</span>
            <span>{new Date(c.expires_at).toLocaleDateString()}</span>
            <span className="days-remaining">{c.days_remaining}d</span>
            <span>{c.use_count}</span>
            <span className="code-actions">
              <button className="copy-small-btn" onClick={() => copyCode(c.code)}>Copy</button>
              <button className="revoke-btn" onClick={() => handleRevoke(c.code)}>Revoke</button>
            </span>
          </div>
        ))}
        {activeCodes.length === 0 && <div className="no-codes">No active codes.</div>}
      </div>

      {inactiveCodes.length > 0 && (
        <>
          <h3>Expired / Revoked ({inactiveCodes.length})</h3>
          <div className="codes-table">
            <div className="codes-header">
              <span>Code</span>
              <span>Label</span>
              <span>Status</span>
              <span>Expired</span>
              <span>Uses</span>
              <span></span>
            </div>
            {inactiveCodes.map(c => (
              <div key={c.code} className="code-row inactive">
                <span className="code-value">{c.code}</span>
                <span>{c.label || '-'}</span>
                <span className={`status-badge ${c.status}`}>{c.status}</span>
                <span>{new Date(c.expires_at).toLocaleDateString()}</span>
                <span>{c.use_count}</span>
                <span></span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SubscriptionsTab({ getAuthHeaders }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchProUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/users', { headers: getAuthHeaders() })
      const proUsers = (res.data.users || []).filter(u => u.tier === 'pro')
      setUsers(proUsers)
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchProUsers() }, [fetchProUsers])

  const handleDowngrade = async (userId) => {
    if (!confirm('Downgrade this user to free tier?')) return
    try {
      await axios.post(`/api/admin/users/${userId}/set-tier`, {
        tier: 'free'
      }, { headers: getAuthHeaders() })
      fetchProUsers()
    } catch { alert('Failed to downgrade user') }
  }

  if (loading) return <div className="admin-loading">Loading subscriptions...</div>

  return (
    <div className="admin-tab-content">
      <h3>Pro Users ({users.length})</h3>
      {users.length === 0 ? (
        <p className="admin-empty-row">No pro users yet.</p>
      ) : (
        <div className="admin-users-table">
          <div className="admin-table-header">
            <span className="col-avatar"></span>
            <span className="col-name">User</span>
            <span className="col-email">Email</span>
            <span className="col-joined">Joined</span>
            <span className="col-actions">Actions</span>
          </div>
          {users.map(u => (
            <div key={u.id} className="admin-table-row">
              <span className="col-avatar">
                <span className="admin-user-avatar" style={{ background: u.avatar_color || '#6c5ce7' }}>
                  {(u.display_name || u.username || '?')[0].toUpperCase()}
                </span>
              </span>
              <span className="col-name">
                <strong>{u.display_name || 'No Name'}</strong>
                <small>@{u.username}</small>
              </span>
              <span className="col-email">{u.email}</span>
              <span className="col-joined">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}</span>
              <span className="col-actions">
                <button className="admin-action-btn downgrade" onClick={() => handleDowngrade(u.id)}>
                  Downgrade
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReferralsTab({ getAuthHeaders }) {
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchReferrals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/referral-stats', { headers: getAuthHeaders() })
      setReferrals(res.data.referrals || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchReferrals() }, [fetchReferrals])

  if (loading) return <div className="admin-loading">Loading referral data...</div>

  return (
    <div className="admin-tab-content">
      <h3>Referral Leaderboard</h3>
      {referrals.length === 0 ? (
        <p className="admin-empty-row">No referrals yet.</p>
      ) : (
        <div className="admin-users-table">
          <div className="admin-referral-header">
            <span className="col-avatar"></span>
            <span>User</span>
            <span>Code</span>
            <span>Referrals</span>
            <span>Pro Converts</span>
          </div>
          {referrals.map(r => (
            <div key={r.user_id} className="admin-referral-row">
              <span className="col-avatar">
                <span className="admin-user-avatar" style={{ background: r.avatar_color || '#6c5ce7' }}>
                  {(r.display_name || '?')[0].toUpperCase()}
                </span>
              </span>
              <span className="col-name">
                <strong>{r.display_name}</strong>
                <small>@{r.username}</small>
              </span>
              <span className="referral-code-cell">{r.referral_code}</span>
              <span className="referral-count-cell">{r.referral_count}</span>
              <span className="referral-pro-cell">{r.pro_referrals}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const ROLE_LABELS = {
  super_admin: { label: 'Super Admin', color: '#e74c3c' },
  customer_care: { label: 'Customer Care', color: '#3498db' },
  accounting: { label: 'Accounting', color: '#2ecc71' },
  technical_support: { label: 'Technical Support', color: '#f39c12' },
}

function StaffTab({ getAuthHeaders }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [assignModal, setAssignModal] = useState(null)
  const [selectedRole, setSelectedRole] = useState('')

  // Create staff account state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createName, setCreateName] = useState('')
  const [createRole, setCreateRole] = useState('customer_care')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')

  const fetchStaff = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/staff', { headers: getAuthHeaders() })
      setStaff(res.data.staff || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchStaff() }, [fetchStaff])

  const searchUsers = async () => {
    if (!searchTerm.trim()) return
    setSearching(true)
    try {
      const res = await axios.get('/api/admin/users', { headers: getAuthHeaders() })
      const all = res.data.users || []
      const term = searchTerm.toLowerCase()
      setSearchResults(all.filter(u =>
        (u.email || '').toLowerCase().includes(term) ||
        (u.username || '').toLowerCase().includes(term) ||
        (u.display_name || '').toLowerCase().includes(term)
      ).slice(0, 10))
    } catch { /* ignore */ }
    setSearching(false)
  }

  const handleAssignRole = async () => {
    if (!assignModal) return
    try {
      await axios.post(`/api/admin/staff/${assignModal.id}/set-role`, {
        role: selectedRole || null
      }, { headers: getAuthHeaders() })
      setAssignModal(null)
      setSelectedRole('')
      setSearchResults([])
      setSearchTerm('')
      fetchStaff()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update role')
    }
  }

  const handleRemoveRole = async (userId) => {
    if (!confirm('Remove this staff member\'s role?')) return
    try {
      await axios.post(`/api/admin/staff/${userId}/set-role`, {
        role: null
      }, { headers: getAuthHeaders() })
      fetchStaff()
    } catch { alert('Failed to remove role') }
  }

  const handleCreateStaff = async (e) => {
    e.preventDefault()
    setCreateError('')
    setCreateSuccess('')
    if (!createEmail.trim() || !createPassword || !createName.trim()) {
      setCreateError('All fields are required')
      return
    }
    setCreating(true)
    try {
      const res = await axios.post('/api/admin/staff/create', {
        email: createEmail.trim(),
        password: createPassword,
        display_name: createName.trim(),
        role: createRole,
      }, { headers: getAuthHeaders() })
      if (res.data.success) {
        setCreateSuccess(`Staff account created for ${res.data.user.display_name} (@${res.data.user.username})`)
        setCreateEmail('')
        setCreatePassword('')
        setCreateName('')
        setCreateRole('customer_care')
        fetchStaff()
        setTimeout(() => setCreateSuccess(''), 5000)
      }
    } catch (err) {
      setCreateError(err.response?.data?.detail || 'Failed to create staff account')
    }
    setCreating(false)
  }

  if (loading) return <div className="admin-loading">Loading staff...</div>

  return (
    <div className="admin-tab-content">
      {/* Create New Staff Account */}
      <div className="admin-staff-section-header">
        <h3>Create Staff Account</h3>
        <button
          className={`admin-action-btn ${showCreateForm ? 'suspend' : 'upgrade'}`}
          onClick={() => { setShowCreateForm(!showCreateForm); setCreateError(''); setCreateSuccess('') }}
        >
          {showCreateForm ? 'Cancel' : '+ New Account'}
        </button>
      </div>

      {showCreateForm && (
        <div className="admin-create-staff-form">
          {createError && <div className="admin-create-staff-error">{createError}</div>}
          {createSuccess && <div className="admin-create-staff-success">{createSuccess}</div>}
          <form onSubmit={handleCreateStaff}>
            <div className="admin-create-staff-grid">
              <div className="admin-create-staff-field">
                <label>Full Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. John Smith"
                  maxLength={100}
                  required
                />
              </div>
              <div className="admin-create-staff-field">
                <label>Email</label>
                <input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="staff@example.com"
                  required
                />
              </div>
              <div className="admin-create-staff-field">
                <label>Password</label>
                <input
                  type="text"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="Min 6 characters"
                  minLength={6}
                  required
                />
              </div>
              <div className="admin-create-staff-field">
                <label>Role</label>
                <select value={createRole} onChange={(e) => setCreateRole(e.target.value)}>
                  <option value="customer_care">Customer Care</option>
                  <option value="accounting">Accounting</option>
                  <option value="technical_support">Technical Support</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
            </div>
            <p className="admin-create-staff-note">
              Staff accounts bypass email verification and access codes. The staff member can log in immediately using their email and password, and will see the admin panel based on their assigned role.
            </p>
            <button type="submit" className="admin-create-staff-submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create Staff Account'}
            </button>
          </form>
        </div>
      )}

      {/* Assign Role to Existing User */}
      <h3 style={{ marginTop: 24 }}>Assign Role to Existing User</h3>
      <div className="admin-staff-search">
        <div className="admin-staff-search-row">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
            placeholder="Search by email, username, or name..."
            className="admin-search-input"
          />
          <button className="admin-action-btn upgrade" onClick={searchUsers} disabled={searching}>
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="admin-staff-search-results">
            {searchResults.map(u => (
              <div key={u.id} className="admin-staff-search-item">
                <span className="admin-user-avatar-sm" style={{ background: u.avatar_color || '#6c5ce7' }}>
                  {(u.display_name || '?')[0].toUpperCase()}
                </span>
                <div className="admin-staff-search-info">
                  <strong>{u.display_name || 'No Name'}</strong>
                  <small>{u.email}</small>
                </div>
                {u.staff_role ? (
                  <span className="admin-staff-role-tag" style={{ background: ROLE_LABELS[u.staff_role]?.color || '#636e72' }}>
                    {ROLE_LABELS[u.staff_role]?.label || u.staff_role}
                  </span>
                ) : (
                  <button className="admin-action-btn upgrade" onClick={() => { setAssignModal(u); setSelectedRole('customer_care') }}>
                    Assign Role
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 style={{ marginTop: 24 }}>Current Staff ({staff.length})</h3>
      {staff.length === 0 ? (
        <p className="admin-empty-row">No staff members assigned yet.</p>
      ) : (
        <div className="admin-staff-list">
          {staff.map(s => (
            <div key={s.id} className="admin-staff-item">
              <span className="admin-user-avatar-sm" style={{ background: s.avatar_color || '#6c5ce7' }}>
                {(s.display_name || '?')[0].toUpperCase()}
              </span>
              <div className="admin-staff-item-info">
                <strong>{s.display_name || 'No Name'}</strong>
                <small>@{s.username} &middot; {s.email}</small>
              </div>
              <span className="admin-staff-role-tag" style={{ background: ROLE_LABELS[s.staff_role]?.color || '#636e72' }}>
                {ROLE_LABELS[s.staff_role]?.label || s.staff_role}
              </span>
              <button className="admin-action-btn suspend" onClick={() => handleRemoveRole(s.id)}>Remove</button>
              <button className="admin-action-btn reset-pw" onClick={() => { setAssignModal(s); setSelectedRole(s.staff_role || 'customer_care') }}>
                Change Role
              </button>
            </div>
          ))}
        </div>
      )}

      {assignModal && (
        <div className="admin-modal-overlay" onClick={() => setAssignModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Assign Role</h3>
            <p className="admin-modal-user">
              {assignModal.display_name || assignModal.username} ({assignModal.email})
            </p>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="admin-modal-input"
            >
              <option value="customer_care">Customer Care</option>
              <option value="accounting">Accounting</option>
              <option value="technical_support">Technical Support</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <div className="admin-modal-actions">
              <button className="admin-modal-cancel" onClick={() => setAssignModal(null)}>Cancel</button>
              <button className="admin-modal-confirm" onClick={handleAssignRole}>Assign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const CATEGORY_LABELS = {
  payment: { label: 'Payment', color: '#e74c3c' },
  subscription: { label: 'Subscription', color: '#3498db' },
  predictions: { label: 'Ads / Predictions', color: '#2ecc71' },
  general: { label: 'General', color: '#95a5a6' },
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

function parseFileMessage(content) {
  const match = content.match(/^\[FILE:(.+?)\]\((.+?)\)$/)
  if (!match) return null
  const name = match[1]
  const url = match[2]
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase()
  const isImage = IMAGE_EXTENSIONS.includes(ext)
  return { name, url, isImage }
}

function SupportTab({ getAuthHeaders, staffRole }) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [userProfile, setUserProfile] = useState(null)
  const [showProfile, setShowProfile] = useState(false)
  const [showRatings, setShowRatings] = useState(false)
  const [agentRatings, setAgentRatings] = useState([])
  const [recentRatings, setRecentRatings] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const activeChatRef = useRef(null)
  const messagesEndRef = useCallback(node => {
    if (node) node.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchConversations = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/support/conversations', { headers: getAuthHeaders() })
      const convs = res.data.conversations || []
      setConversations(convs)
      // Update activeChat if it exists (so status/metadata stays fresh)
      setActiveChat(prev => {
        if (!prev) return prev
        const updated = convs.find(c => c.user_id === prev.user_id)
        return updated || prev
      })
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  useEffect(() => {
    const interval = setInterval(fetchConversations, 3000)
    return () => clearInterval(interval)
  }, [fetchConversations])

  const openChat = async (conv) => {
    setActiveChat(conv)
    activeChatRef.current = conv
    setShowProfile(false)
    setShowRatings(false)
    try {
      const res = await axios.get(`/api/admin/support/messages/${conv.user_id}`, { headers: getAuthHeaders() })
      setMessages(res.data.messages || [])
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!activeChat) return
    // Fetch messages immediately when chat opens, then poll every 2 seconds
    const fetchChatMessages = async () => {
      const chat = activeChatRef.current
      if (!chat) return
      try {
        const res = await axios.get(`/api/admin/support/messages/${chat.user_id}`, { headers: getAuthHeaders() })
        setMessages(res.data.messages || [])
      } catch { /* ignore */ }
    }
    const interval = setInterval(fetchChatMessages, 2000)
    return () => clearInterval(interval)
  }, [activeChat, getAuthHeaders])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !activeChat || sending) return
    setSending(true)
    try {
      await axios.post(`/api/admin/support/send/${activeChat.user_id}`, {
        content: newMessage.trim()
      }, { headers: getAuthHeaders() })
      setNewMessage('')
      const res = await axios.get(`/api/admin/support/messages/${activeChat.user_id}`, { headers: getAuthHeaders() })
      setMessages(res.data.messages || [])
      fetchConversations()
    } catch { /* ignore */ }
    setSending(false)
  }

  const handleEndChat = async () => {
    if (!activeChat) return
    if (!confirm('End this chat? The user will be prompted to rate the conversation.')) return
    try {
      await axios.post(`/api/admin/support/close/${activeChat.user_id}`, {}, { headers: getAuthHeaders() })
      const res = await axios.get(`/api/admin/support/messages/${activeChat.user_id}`, { headers: getAuthHeaders() })
      setMessages(res.data.messages || [])
      fetchConversations()
    } catch { alert('Failed to end chat') }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !activeChat) return
    e.target.value = ''
    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10MB.')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await axios.post(`/api/admin/support/upload/${activeChat.user_id}`, formData, {
        headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' },
      })
      const res = await axios.get(`/api/admin/support/messages/${activeChat.user_id}`, { headers: getAuthHeaders() })
      setMessages(res.data.messages || [])
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to upload file')
    }
    setUploading(false)
  }

  const viewProfile = async (userId) => {
    try {
      const res = await axios.get(`/api/admin/users/${userId}`, { headers: getAuthHeaders() })
      setUserProfile(res.data)
      setShowProfile(true)
    } catch { /* ignore */ }
  }

  const handleTierChange = async (userId, currentTier) => {
    const newTier = currentTier === 'pro' ? 'free' : 'pro'
    try {
      await axios.post(`/api/admin/users/${userId}/set-tier`, { tier: newTier }, { headers: getAuthHeaders() })
      viewProfile(userId)
    } catch { /* ignore */ }
  }

  const handleToggleActive = async (userId, isActive) => {
    try {
      await axios.post(`/api/admin/users/${userId}/toggle-active`, { is_active: isActive ? 0 : 1 }, { headers: getAuthHeaders() })
      viewProfile(userId)
    } catch { /* ignore */ }
  }

  const fetchRatings = async () => {
    try {
      const res = await axios.get('/api/admin/support/ratings', { headers: getAuthHeaders() })
      setAgentRatings(res.data.ratings || [])
      setRecentRatings(res.data.recent || [])
      setShowRatings(true)
      setActiveChat(null)
    } catch { alert('Unable to load ratings') }
  }

  const timeAgo = (dateStr) => {
    // Server stores UTC times without 'Z' suffix — append it so browser parses as UTC
    const utcStr = dateStr && !dateStr.endsWith('Z') && !dateStr.includes('+') ? dateStr + 'Z' : dateStr
    const diff = Date.now() - new Date(utcStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Now'
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
  }

  // Check if conversation is active (not closed)
  const isChatActive = activeChat && (activeChat.conv_status === 'active' || !activeChat.conv_status)

  if (loading) return <div className="admin-loading">Loading support conversations...</div>

  return (
    <div className="admin-tab-content">
      <div className="admin-support-layout">
        <div className="admin-support-sidebar">
          <div className="admin-support-sidebar-header">
            <h3>Conversations ({conversations.length})</h3>
            <button className="admin-support-ratings-btn" onClick={fetchRatings} title="View agent ratings">Ratings</button>
          </div>
          {conversations.length === 0 ? (
            <p className="admin-empty-row">No support messages yet.</p>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.user_id}
                className={`admin-support-conv-item ${activeChat?.user_id === conv.user_id ? 'active' : ''} ${conv.unread_count > 0 ? 'unread' : ''}`}
                onClick={() => openChat(conv)}
              >
                <span className="admin-user-avatar-sm" style={{ background: conv.avatar_color }}>
                  {(conv.display_name || '?')[0].toUpperCase()}
                </span>
                <div className="admin-support-conv-info">
                  <div className="admin-support-conv-top">
                    <strong>{conv.display_name}</strong>
                    <span className="admin-support-conv-time">{timeAgo(conv.last_message_at)}</span>
                  </div>
                  <div className="admin-support-conv-meta">
                    {conv.category && CATEGORY_LABELS[conv.category] && (
                      <span className="admin-support-cat-tag" style={{ background: CATEGORY_LABELS[conv.category].color }}>
                        {CATEGORY_LABELS[conv.category].label}
                      </span>
                    )}
                    {conv.conv_status === 'closed' && (
                      <span className="admin-support-status-tag closed">Closed</span>
                    )}
                    {conv.assigned_agent_name && (
                      <span className="admin-support-agent-tag">{conv.assigned_agent_name}</span>
                    )}
                    {conv.rating && (
                      <span className="admin-support-rating-tag">{'★'.repeat(conv.rating)}{'☆'.repeat(5 - conv.rating)}</span>
                    )}
                  </div>
                  <p className="admin-support-conv-preview">
                    {conv.last_sender === 'admin' && <span className="admin-support-you">You: </span>}
                    {conv.last_message.length > 40 ? conv.last_message.slice(0, 40) + '...' : conv.last_message}
                  </p>
                </div>
                {conv.unread_count > 0 && (
                  <span className="admin-support-badge">{conv.unread_count}</span>
                )}
              </div>
            ))
          )}
        </div>

        <div className="admin-support-chat">
          {showRatings ? (
            <div className="admin-support-ratings">
              <div className="admin-support-ratings-header">
                <button className="admin-support-profile-back" onClick={() => setShowRatings(false)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                  Back
                </button>
                <h3>Agent Ratings</h3>
              </div>
              {agentRatings.length === 0 ? (
                <p className="admin-empty-row">No ratings yet.</p>
              ) : (
                <>
                  <div className="admin-ratings-list">
                    <h4 className="admin-ratings-section-title">Agent Summary</h4>
                    {agentRatings.map(r => (
                      <div key={r.agent_id} className="admin-rating-item">
                        <div className="admin-rating-item-top">
                          <strong>{r.agent_name}</strong>
                          <span className="admin-rating-stars">
                            {'★'.repeat(Math.round(r.avg_rating))}{'☆'.repeat(5 - Math.round(r.avg_rating))}
                            {' '}{Number(r.avg_rating).toFixed(1)}/5
                          </span>
                        </div>
                        <small>{r.total_ratings} rating{r.total_ratings !== 1 ? 's' : ''}</small>
                      </div>
                    ))}
                  </div>
                  {recentRatings.length > 0 && (
                    <div className="admin-ratings-list" style={{ marginTop: 16 }}>
                      <h4 className="admin-ratings-section-title">Recent Ratings</h4>
                      {recentRatings.map((r, idx) => (
                        <div key={idx} className="admin-rating-item admin-rating-recent">
                          <div className="admin-rating-item-top">
                            <span>
                              <strong>{r.display_name}</strong>
                              <span className="admin-rating-username"> @{r.username}</span>
                            </span>
                            <span className="admin-rating-stars">
                              {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                            </span>
                          </div>
                          <div className="admin-rating-item-meta">
                            <span>Agent: {r.agent_name}</span>
                            <span>{timeAgo(r.created_at)}</span>
                          </div>
                          {r.comment && <p className="admin-rating-comment">{r.comment}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : !activeChat ? (
            <div className="admin-support-chat-empty">
              <p>Select a conversation to start replying</p>
            </div>
          ) : showProfile && userProfile ? (
            <UserDetailPanel
              userProfile={userProfile}
              onBack={() => setShowProfile(false)}
              onTierChange={handleTierChange}
              onToggleActive={handleToggleActive}
              staffRole={staffRole}
              getAuthHeaders={getAuthHeaders}
              onRefresh={viewProfile}
            />
          ) : (
            <>
              <div className="admin-support-chat-header">
                <span className="admin-user-avatar-sm" style={{ background: activeChat.avatar_color }}>
                  {(activeChat.display_name || '?')[0].toUpperCase()}
                </span>
                <div>
                  <strong>{activeChat.display_name}</strong>
                  <small>@{activeChat.username}</small>
                </div>
                {activeChat.category && CATEGORY_LABELS[activeChat.category] && (
                  <span className="admin-support-cat-tag" style={{ background: CATEGORY_LABELS[activeChat.category].color, marginLeft: 8 }}>
                    {CATEGORY_LABELS[activeChat.category].label}
                  </span>
                )}
                {activeChat.conv_status === 'closed' && (
                  <span className="admin-support-status-tag closed" style={{ marginLeft: 8 }}>Closed</span>
                )}
                <div className="admin-support-header-actions">
                  <button className="admin-support-view-profile" onClick={() => viewProfile(activeChat.user_id)}>
                    View Profile
                  </button>
                  {isChatActive && (
                    <button className="admin-support-end-chat" onClick={handleEndChat}>
                      End Chat
                    </button>
                  )}
                </div>
              </div>
              <div className="admin-support-chat-messages">
                {messages.map((msg, idx) => (
                  <div key={msg.id} className={`admin-support-bubble ${msg.sender}`}>
                    {msg.sender === 'admin' && msg.agent_name && (idx === 0 || messages[idx - 1]?.sender !== 'admin' || messages[idx - 1]?.agent_name !== msg.agent_name) && (
                      <span className="admin-support-agent-label">Agent: {msg.agent_name}</span>
                    )}
                    {idx === 0 && msg.category && CATEGORY_LABELS[msg.category] && (
                      <span className="admin-support-cat-tag" style={{ background: CATEGORY_LABELS[msg.category].color }}>
                        {CATEGORY_LABELS[msg.category].label}
                      </span>
                    )}
                    {(() => {
                      const file = parseFileMessage(msg.content)
                      if (file) {
                        return file.isImage ? (
                          <a href={file.url} target="_blank" rel="noopener noreferrer" className="support-file-link">
                            <img src={file.url} alt={file.name} className="support-file-image" />
                            <span className="support-file-name">{file.name}</span>
                          </a>
                        ) : (
                          <a href={file.url} target="_blank" rel="noopener noreferrer" className="support-file-link">
                            <span className="support-file-icon">📎</span>
                            <span className="support-file-name">{file.name}</span>
                          </a>
                        )
                      }
                      return <p>{msg.content}</p>
                    })()}
                    <span className="admin-support-bubble-time">{timeAgo(msg.created_at)}</span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              {isChatActive ? (
                <form className="admin-support-chat-input" onSubmit={handleSend}>
                  <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx" />
                  <button type="button" className="support-attach-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach file">
                    {uploading ? '...' : '📎'}
                  </button>
                  <textarea
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        if (newMessage.trim() && !sending) handleSend(e)
                      }
                    }}
                    placeholder="Type a reply..."
                    maxLength={2000}
                    rows={1}
                  />
                  <button type="submit" disabled={!newMessage.trim() || sending}>Send</button>
                </form>
              ) : (
                <div className="admin-support-chat-closed-bar">
                  This conversation has been closed.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function WithdrawalsTab({ getAuthHeaders }) {
  const [withdrawals, setWithdrawals] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchWithdrawals = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/withdrawals/pending', { headers: getAuthHeaders() })
      setWithdrawals(res.data.withdrawals || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchWithdrawals() }, [fetchWithdrawals])

  const handleAction = async (id, action) => {
    try {
      await axios.post(`/api/admin/withdrawals/${id}/${action}`, {}, { headers: getAuthHeaders() })
      fetchWithdrawals()
    } catch (err) {
      alert(err.response?.data?.detail || `Failed to ${action}`)
    }
  }

  if (loading) return <div className="admin-loading">Loading withdrawals...</div>

  return (
    <div className="admin-tab-content">
      <h3>Pending Withdrawals ({withdrawals.length})</h3>
      {withdrawals.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>No pending withdrawal requests.</p>
      ) : (
        <div className="admin-withdrawal-list">
          {withdrawals.map(wd => (
            <div key={wd.id} className="admin-withdrawal-card">
              <div className="admin-withdrawal-header">
                <span className="admin-withdrawal-user">
                  {wd.display_name || wd.username || `User #${wd.user_id}`}
                </span>
                <span className="admin-withdrawal-amount">${wd.amount_usd.toFixed(2)}</span>
              </div>
              <div className="admin-withdrawal-details">
                <span>~KES {wd.amount_kes.toFixed(0)}</span>
                <span>M-Pesa: {wd.phone_number}</span>
                <span>{new Date(wd.created_at).toLocaleString()}</span>
                <span className={`withdrawal-status-badge ${wd.status}`}>{wd.status}</span>
              </div>
              <div className="admin-withdrawal-actions">
                {wd.status === 'pending' && (
                  <>
                    <button className="admin-approve-btn" onClick={() => handleAction(wd.id, 'approve')}>Approve</button>
                    <button className="admin-reject-btn" onClick={() => handleAction(wd.id, 'reject')}>Reject</button>
                  </>
                )}
                {wd.status === 'approved' && (
                  <button className="admin-complete-btn" onClick={() => handleAction(wd.id, 'complete')}>
                    Mark Completed
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Role -> allowed tabs mapping
const TAB_ROLES = {
  overview: ['super_admin', 'accounting'],
  users: ['super_admin', 'technical_support'],
  subscriptions: ['super_admin', 'accounting'],
  community: ['super_admin'],
  referrals: ['super_admin'],
  codes: ['super_admin'],
  withdrawals: ['super_admin', 'accounting'],
  online: ['super_admin', 'customer_care', 'technical_support'],
  support: ['super_admin', 'customer_care', 'technical_support'],
  staff: ['super_admin'],
}

const ALL_TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'online', label: 'Online Users', icon: '🟢' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'subscriptions', label: 'Subscriptions', icon: '💎' },
  { id: 'withdrawals', label: 'Withdrawals', icon: '💸' },
  { id: 'community', label: 'Community', icon: '💬' },
  { id: 'referrals', label: 'Referrals', icon: '🔗' },
  { id: 'codes', label: 'Access Codes', icon: '🔑' },
  { id: 'support', label: 'Support', icon: '🎧' },
  { id: 'staff', label: 'Staff', icon: '🏢' },
]

export default function Admin() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [authMode, setAuthMode] = useState('password') // 'password' or 'jwt'
  const [staffRole, setStaffRole] = useState(null)

  // Check if user has a staff role via JWT on mount
  useEffect(() => {
    const token = localStorage.getItem('spark_token')
    if (token && !isLoggedIn) {
      axios.get('/api/user/staff-role', {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => {
        if (res.data.staff_role) {
          setAuthMode('jwt')
          setStaffRole(res.data.staff_role)
          setIsLoggedIn(true)
          // Set default tab to the first allowed tab
          const role = res.data.staff_role
          const firstTab = ALL_TABS.find(t => TAB_ROLES[t.id]?.includes(role))
          if (firstTab) setActiveTab(firstTab.id)
        }
      }).catch(() => { /* not staff */ })
    }
  }, [])

  // Also check for stored password auth
  useEffect(() => {
    const pw = sessionStorage.getItem('admin_pw')
    if (pw && !isLoggedIn) {
      setAdminPassword(pw)
      setAuthMode('password')
      setStaffRole('super_admin')
      setIsLoggedIn(true)
    }
  }, [])

  const getAuthHeaders = useCallback(() => {
    if (authMode === 'jwt') {
      const token = localStorage.getItem('spark_token')
      return { Authorization: `Bearer ${token}` }
    }
    const pw = sessionStorage.getItem('admin_pw') || adminPassword
    return { 'x-admin-password': pw }
  }, [authMode, adminPassword])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    try {
      await axios.post('/api/admin/login', { password: adminPassword })
      setIsLoggedIn(true)
      setAuthMode('password')
      setStaffRole('super_admin')
      sessionStorage.setItem('admin_pw', adminPassword)
    } catch {
      setLoginError('Invalid admin password')
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('admin_pw')
    setIsLoggedIn(false)
    setAdminPassword('')
    setAuthMode('password')
    setStaffRole(null)
  }

  if (!isLoggedIn) {
    return (
      <div className="admin-page">
        <div className="admin-login-container">
          <h1>Admin Dashboard</h1>
          <p>Spark AI Prediction Management</p>
          <form onSubmit={handleLogin} className="admin-login-form">
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Admin password"
              autoFocus
            />
            {loginError && <div className="gate-error">{loginError}</div>}
            <button type="submit" className="gate-submit-btn">Login</button>
          </form>
          <p className="admin-login-hint">Staff members are automatically logged in when signed into their account.</p>
        </div>
      </div>
    )
  }

  // Filter tabs by role
  const currentRole = staffRole || 'super_admin'
  const visibleTabs = ALL_TABS.filter(t => TAB_ROLES[t.id]?.includes(currentRole))

  return (
    <div className="admin-page">
      <div className="admin-dashboard">
        <div className="admin-sidebar">
          <div className="admin-sidebar-header">
            <h2>Spark AI</h2>
            <span className="admin-badge">
              {ROLE_LABELS[currentRole]?.label || 'ADMIN'}
            </span>
          </div>
          <nav className="admin-nav">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                className={`admin-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="admin-nav-icon">{tab.icon}</span>
                <span className="admin-nav-label">{tab.label}</span>
              </button>
            ))}
          </nav>
          <button className="admin-logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>

        <div className="admin-main">
          <div className="admin-main-header">
            <h2>{ALL_TABS.find(t => t.id === activeTab)?.label}</h2>
          </div>

          {activeTab === 'overview' && <OverviewTab getAuthHeaders={getAuthHeaders} />}
          {activeTab === 'online' && <OnlineUsersTab getAuthHeaders={getAuthHeaders} staffRole={currentRole} />}
          {activeTab === 'users' && <UsersTab getAuthHeaders={getAuthHeaders} staffRole={currentRole} />}
          {activeTab === 'subscriptions' && <SubscriptionsTab getAuthHeaders={getAuthHeaders} />}
          {activeTab === 'withdrawals' && <WithdrawalsTab getAuthHeaders={getAuthHeaders} />}
          {activeTab === 'community' && <CommunityTab getAuthHeaders={getAuthHeaders} />}
          {activeTab === 'referrals' && <ReferralsTab getAuthHeaders={getAuthHeaders} />}
          {activeTab === 'codes' && <AccessCodesTab getAuthHeaders={getAuthHeaders} />}
          {activeTab === 'support' && <SupportTab getAuthHeaders={getAuthHeaders} staffRole={currentRole} />}
          {activeTab === 'staff' && <StaffTab getAuthHeaders={getAuthHeaders} />}
        </div>
      </div>
    </div>
  )
}
