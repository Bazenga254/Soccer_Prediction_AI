import { useState, useEffect, useCallback } from 'react'
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

function OverviewTab({ stats, loading }) {
  if (loading) return <div className="admin-loading">Loading stats...</div>
  if (!stats) return null

  const { users, community, predictions, subscriptions: subs } = stats

  return (
    <div className="admin-tab-content">
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

function UsersTab({ adminPw }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTier, setFilterTier] = useState('all')

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/users', {
        headers: { 'x-admin-password': adminPw }
      })
      setUsers(res.data.users || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [adminPw])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleToggleActive = async (userId, currentActive) => {
    try {
      await axios.post(`/api/admin/users/${userId}/toggle-active`, {
        is_active: !currentActive
      }, { headers: { 'x-admin-password': adminPw } })
      fetchUsers()
    } catch { alert('Failed to update user') }
  }

  const handleSetTier = async (userId, newTier) => {
    try {
      await axios.post(`/api/admin/users/${userId}/set-tier`, {
        tier: newTier
      }, { headers: { 'x-admin-password': adminPw } })
      fetchUsers()
    } catch { alert('Failed to update tier') }
  }

  const filtered = users.filter(u => {
    const matchesSearch = !search ||
      (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.display_name || '').toLowerCase().includes(search.toLowerCase())
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
              <small>@{u.username}</small>
            </span>
            <span className="col-email">{u.email}</span>
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
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="admin-empty-row">No users found</div>
        )}
      </div>
    </div>
  )
}

function CommunityTab({ adminPw }) {
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
      await axios.delete(`/api/admin/community/${predId}`, {
        headers: { 'x-admin-password': adminPw }
      })
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

function AccessCodesTab({ adminPw }) {
  const [codes, setCodes] = useState([])
  const [newCodeDays, setNewCodeDays] = useState(30)
  const [newCodeLabel, setNewCodeLabel] = useState('')
  const [createdCode, setCreatedCode] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchCodes = useCallback(async () => {
    try {
      const response = await axios.get('/api/admin/codes', {
        headers: { 'x-admin-password': adminPw }
      })
      setCodes(response.data.codes || [])
    } catch { /* ignore */ }
  }, [adminPw])

  useEffect(() => { fetchCodes() }, [fetchCodes])

  const handleCreateCode = async () => {
    setLoading(true)
    setCreatedCode(null)
    try {
      const response = await axios.post('/api/admin/codes/create', {
        days_valid: newCodeDays,
        label: newCodeLabel,
      }, { headers: { 'x-admin-password': adminPw } })
      setCreatedCode(response.data)
      setNewCodeLabel('')
      fetchCodes()
    } catch { alert('Failed to create code') }
    setLoading(false)
  }

  const handleRevoke = async (code) => {
    if (!confirm(`Revoke code ${code}?`)) return
    try {
      await axios.delete(`/api/admin/codes/${code}`, {
        headers: { 'x-admin-password': adminPw }
      })
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

function SubscriptionsTab({ adminPw }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchProUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/users', {
        headers: { 'x-admin-password': adminPw }
      })
      const proUsers = (res.data.users || []).filter(u => u.tier === 'pro')
      setUsers(proUsers)
    } catch { /* ignore */ }
    setLoading(false)
  }, [adminPw])

  useEffect(() => { fetchProUsers() }, [fetchProUsers])

  const handleDowngrade = async (userId) => {
    if (!confirm('Downgrade this user to free tier?')) return
    try {
      await axios.post(`/api/admin/users/${userId}/set-tier`, {
        tier: 'free'
      }, { headers: { 'x-admin-password': adminPw } })
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

function ReferralsTab({ adminPw }) {
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchReferrals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/referral-stats', {
        headers: { 'x-admin-password': adminPw }
      })
      setReferrals(res.data.referrals || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [adminPw])

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

export default function Admin() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [dashboardStats, setDashboardStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

  const storedPassword = () => sessionStorage.getItem('admin_pw') || adminPassword

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    try {
      await axios.post('/api/admin/login', { password: adminPassword })
      setIsLoggedIn(true)
      sessionStorage.setItem('admin_pw', adminPassword)
    } catch {
      setLoginError('Invalid admin password')
    }
  }

  const fetchDashboardStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await axios.get('/api/admin/dashboard-stats', {
        headers: { 'x-admin-password': storedPassword() }
      })
      setDashboardStats(res.data)
    } catch { /* ignore */ }
    setStatsLoading(false)
  }, [adminPassword])

  useEffect(() => {
    const pw = sessionStorage.getItem('admin_pw')
    if (pw) {
      setAdminPassword(pw)
      setIsLoggedIn(true)
    }
  }, [])

  useEffect(() => {
    if (isLoggedIn) fetchDashboardStats()
  }, [isLoggedIn, fetchDashboardStats])

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
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'subscriptions', label: 'Subscriptions', icon: '💎' },
    { id: 'community', label: 'Community', icon: '💬' },
    { id: 'referrals', label: 'Referrals', icon: '🔗' },
    { id: 'codes', label: 'Access Codes', icon: '🔑' },
  ]

  return (
    <div className="admin-page">
      <div className="admin-dashboard">
        <div className="admin-sidebar">
          <div className="admin-sidebar-header">
            <h2>Spark AI</h2>
            <span className="admin-badge">ADMIN</span>
          </div>
          <nav className="admin-nav">
            {tabs.map(tab => (
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
          <button className="admin-logout-btn" onClick={() => {
            sessionStorage.removeItem('admin_pw')
            setIsLoggedIn(false)
          }}>
            Logout
          </button>
        </div>

        <div className="admin-main">
          <div className="admin-main-header">
            <h2>{tabs.find(t => t.id === activeTab)?.label}</h2>
            {activeTab === 'overview' && (
              <button className="admin-refresh-btn" onClick={fetchDashboardStats}>Refresh</button>
            )}
          </div>

          {activeTab === 'overview' && <OverviewTab stats={dashboardStats} loading={statsLoading} />}
          {activeTab === 'users' && <UsersTab adminPw={storedPassword()} />}
          {activeTab === 'subscriptions' && <SubscriptionsTab adminPw={storedPassword()} />}
          {activeTab === 'community' && <CommunityTab adminPw={storedPassword()} />}
          {activeTab === 'referrals' && <ReferralsTab adminPw={storedPassword()} />}
          {activeTab === 'codes' && <AccessCodesTab adminPw={storedPassword()} />}
        </div>
      </div>
    </div>
  )
}
