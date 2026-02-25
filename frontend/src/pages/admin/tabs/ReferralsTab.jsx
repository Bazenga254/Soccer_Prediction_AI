import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'

function formatDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(ts) {
  if (!ts) return 'Never'
  const d = new Date(ts)
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function TierBadge({ tier }) {
  const colors = {
    pro: { bg: '#22c55e22', color: '#22c55e', border: '#22c55e44', label: 'PRO' },
    free: { bg: '#64748b22', color: '#94a3b8', border: '#64748b44', label: 'FREE' },
  }
  const s = colors[tier] || colors.free
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      {s.label}
    </span>
  )
}

function StatusDot({ active, verified }) {
  if (!verified) return <span style={{ color: '#f59e0b', fontSize: 11 }}>Unverified</span>
  if (!active) return <span style={{ color: '#ef4444', fontSize: 11 }}>Suspended</span>
  return <span style={{ color: '#22c55e', fontSize: 11 }}>Active</span>
}

function ReferredUserRow({ user }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px 1.5fr 1fr 0.7fr 0.7fr 0.7fr 0.8fr 0.7fr',
      alignItems: 'center',
      gap: 8,
      padding: '10px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      fontSize: 13,
    }}>
      <span
        className="admin-user-avatar"
        style={{
          background: user.avatar_color || '#6c5ce7',
          width: 28, height: 28, fontSize: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '50%', color: '#fff', fontWeight: 700,
        }}
      >
        {(user.display_name || '?')[0].toUpperCase()}
      </span>
      <div>
        <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{user.display_name}</div>
        <div style={{ fontSize: 11, color: '#64748b' }}>@{user.username}</div>
      </div>
      <div style={{ color: '#94a3b8', fontSize: 12 }}>{user.email}</div>
      <div><TierBadge tier={user.tier} /></div>
      <div><StatusDot active={user.is_active} verified={user.email_verified} /></div>
      <div style={{ color: '#94a3b8', fontSize: 12 }}>
        ${(user.balance_usd || 0).toFixed(2)}
        {user.balance_kes > 0 && <span style={{ color: '#64748b' }}> / KES {(user.balance_kes || 0).toFixed(0)}</span>}
      </div>
      <div style={{ color: '#94a3b8', fontSize: 12 }}>
        {user.subscription ? (
          <span style={{ color: user.subscription.status === 'active' ? '#22c55e' : '#f59e0b' }}>
            {user.subscription.plan}
          </span>
        ) : '—'}
      </div>
      <div style={{ color: '#64748b', fontSize: 11 }}>{formatDate(user.created_at)}</div>
    </div>
  )
}

export default function ReferralsTab() {
  const { getAuthHeaders } = useAdmin()
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedUser, setExpandedUser] = useState(null)
  const [referredUsers, setReferredUsers] = useState({})
  const [loadingReferred, setLoadingReferred] = useState(null)

  const fetchReferrals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/referral-stats', { headers: getAuthHeaders() })
      setReferrals(res.data.referrals || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchReferrals() }, [fetchReferrals])

  const toggleExpand = async (userId) => {
    if (expandedUser === userId) {
      setExpandedUser(null)
      return
    }
    setExpandedUser(userId)
    if (!referredUsers[userId]) {
      setLoadingReferred(userId)
      try {
        const res = await axios.get(`/api/admin/referral-stats/${userId}/referred-users`, {
          headers: getAuthHeaders(),
        })
        setReferredUsers(prev => ({ ...prev, [userId]: res.data.referred_users || [] }))
      } catch {
        setReferredUsers(prev => ({ ...prev, [userId]: [] }))
      }
      setLoadingReferred(null)
    }
  }

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
            <span></span>
          </div>
          {referrals.map(r => {
            const isExpanded = expandedUser === r.user_id
            const users = referredUsers[r.user_id] || []
            const isLoading = loadingReferred === r.user_id
            return (
              <div key={r.user_id}>
                <div
                  className="admin-referral-row"
                  style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                  onClick={() => toggleExpand(r.user_id)}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
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
                  <span style={{ color: '#64748b', fontSize: 16, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    &#9660;
                  </span>
                </div>
                {isExpanded && (
                  <div style={{
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 8,
                    margin: '0 8px 8px 8px',
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {/* Header for referred users */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '32px 1.5fr 1fr 0.7fr 0.7fr 0.7fr 0.8fr 0.7fr',
                      gap: 8,
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.03)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      <span></span>
                      <span>Referred User</span>
                      <span>Email</span>
                      <span>Tier</span>
                      <span>Status</span>
                      <span>Balance</span>
                      <span>Subscription</span>
                      <span>Joined</span>
                    </div>
                    {isLoading ? (
                      <div style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>
                        Loading referred users...
                      </div>
                    ) : users.length === 0 ? (
                      <div style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>
                        No referred users found.
                      </div>
                    ) : (
                      users.map(u => <ReferredUserRow key={u.id} user={u} />)
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
