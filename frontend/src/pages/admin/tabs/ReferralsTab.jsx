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
  const [referredPage, setReferredPage] = useState({})
  const [subTab, setSubTab] = useState('leaderboard') // 'leaderboard' | 'sr_applications' | 'sr_active'
  const [srApplications, setSrApplications] = useState([])
  const [srActive, setSrActive] = useState([])
  const [srLoading, setSrLoading] = useState(false)
  const [srActionLoading, setSrActionLoading] = useState(null)

  const fetchReferrals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/referral-stats', { headers: getAuthHeaders() })
      setReferrals(res.data.referrals || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  const fetchSrApplications = async () => {
    setSrLoading(true)
    try {
      const res = await axios.get('/api/admin/super-referee/applications', { headers: getAuthHeaders() })
      setSrApplications(res.data.applications || [])
    } catch {}
    setSrLoading(false)
  }

  const fetchSrActive = async () => {
    setSrLoading(true)
    try {
      const res = await axios.get('/api/admin/super-referee/list', { headers: getAuthHeaders() })
      setSrActive(res.data.super_referees || [])
    } catch {}
    setSrLoading(false)
  }

  const handleSrAction = async (userId, action, reason = '') => {
    setSrActionLoading(userId)
    try {
      if (action === 'approve') {
        await axios.post(`/api/admin/super-referee/approve/${userId}`, {}, { headers: getAuthHeaders() })
      } else if (action === 'reject') {
        await axios.post(`/api/admin/super-referee/reject/${userId}?reason=${encodeURIComponent(reason)}`, {}, { headers: getAuthHeaders() })
      } else if (action === 'revoke') {
        await axios.post(`/api/admin/super-referee/revoke/${userId}`, {}, { headers: getAuthHeaders() })
      }
      fetchSrApplications()
      fetchSrActive()
    } catch {}
    setSrActionLoading(null)
  }

  useEffect(() => { fetchReferrals() }, [fetchReferrals])

  const toggleExpand = async (userId) => {
    if (expandedUser === userId) {
      setExpandedUser(null)
      return
    }
    setExpandedUser(userId)
    if (!referredPage[userId]) setReferredPage(prev => ({ ...prev, [userId]: 1 }))
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
      {/* Sub-tab navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={`admin-action-btn ${subTab === 'leaderboard' ? 'view-detail' : ''}`}
          style={subTab === 'leaderboard' ? { background: '#3b82f6', color: '#fff' } : { background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}
          onClick={() => setSubTab('leaderboard')}
        >Referral Leaderboard</button>
        <button
          className={`admin-action-btn ${subTab === 'sr_applications' ? 'view-detail' : ''}`}
          style={subTab === 'sr_applications' ? { background: '#f59e0b', color: '#000' } : { background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}
          onClick={() => { setSubTab('sr_applications'); fetchSrApplications() }}
        >Super Referee Applications</button>
        <button
          className={`admin-action-btn ${subTab === 'sr_active' ? 'view-detail' : ''}`}
          style={subTab === 'sr_active' ? { background: '#22c55e', color: '#000' } : { background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}
          onClick={() => { setSubTab('sr_active'); fetchSrActive() }}
        >Active Super Referees</button>
      </div>

      {/* Super Referee Applications */}
      {subTab === 'sr_applications' && (
        <>
          <h3 style={{ color: '#f59e0b' }}>Super Referee Applications</h3>
          {srLoading ? (
            <div className="admin-loading">Loading applications...</div>
          ) : srApplications.length === 0 ? (
            <p className="admin-empty-row">No applications.</p>
          ) : (
            <div className="admin-users-table">
              {srApplications.map(app => (
                <div key={app.user_id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <span className="admin-user-avatar" style={{ background: app.avatar_color || '#6c5ce7', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    {(app.display_name || '?')[0].toUpperCase()}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{app.display_name} <span style={{ color: '#64748b', fontWeight: 400, fontSize: 12 }}>@{app.username}</span></div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{app.email} — {app.referral_count} referrals</div>
                    {app.reason && <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4, fontStyle: 'italic' }}>"{app.reason}"</div>}
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 120 }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: app.status === 'pending' ? '#f59e0b22' : app.status === 'approved' ? '#22c55e22' : '#ef444422',
                      color: app.status === 'pending' ? '#f59e0b' : app.status === 'approved' ? '#22c55e' : '#ef4444',
                      border: `1px solid ${app.status === 'pending' ? '#f59e0b44' : app.status === 'approved' ? '#22c55e44' : '#ef444444'}`,
                    }}>
                      {app.status.toUpperCase()}
                    </span>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{formatDate(app.applied_at)}</div>
                  </div>
                  {app.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                      <button
                        className="admin-action-btn upgrade"
                        onClick={() => handleSrAction(app.user_id, 'approve')}
                        disabled={srActionLoading === app.user_id}
                        style={{ padding: '6px 14px', fontSize: 12 }}
                      >{srActionLoading === app.user_id ? '...' : 'Approve'}</button>
                      <button
                        className="admin-action-btn suspend"
                        onClick={() => {
                          const reason = prompt('Rejection reason (optional):')
                          if (reason !== null) handleSrAction(app.user_id, 'reject', reason)
                        }}
                        disabled={srActionLoading === app.user_id}
                        style={{ padding: '6px 14px', fontSize: 12 }}
                      >Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Active Super Referees */}
      {subTab === 'sr_active' && (
        <>
          <h3 style={{ color: '#22c55e' }}>Active Super Referees</h3>
          {srLoading ? (
            <div className="admin-loading">Loading...</div>
          ) : srActive.length === 0 ? (
            <p className="admin-empty-row">No active super referees.</p>
          ) : (
            <div className="admin-users-table">
              <div style={{
                display: 'grid', gridTemplateColumns: '36px 2fr 1fr 1fr 1fr 100px',
                gap: 8, padding: '8px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px',
                background: 'rgba(255,255,255,0.03)',
              }}>
                <span></span>
                <span>User</span>
                <span>Direct Referrals</span>
                <span>Sub-Referrals</span>
                <span>Super Earnings</span>
                <span>Actions</span>
              </div>
              {srActive.map(sr => (
                <div key={sr.id} style={{
                  display: 'grid', gridTemplateColumns: '36px 2fr 1fr 1fr 1fr 100px',
                  gap: 8, padding: '12px 16px', alignItems: 'center',
                  borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13,
                }}>
                  <span className="admin-user-avatar" style={{ background: sr.avatar_color || '#6c5ce7', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>
                    {(sr.display_name || '?')[0].toUpperCase()}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{sr.display_name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>@{sr.username}</div>
                  </div>
                  <span style={{ color: '#3b82f6', fontWeight: 600 }}>{sr.direct_referrals}</span>
                  <span style={{ color: '#8b5cf6', fontWeight: 600 }}>{sr.sub_referrals}</span>
                  <span style={{ color: '#22c55e', fontWeight: 600 }}>${(sr.total_super_earnings || 0).toFixed(2)}</span>
                  <button
                    className="admin-action-btn suspend"
                    onClick={() => { if (confirm(`Revoke Super Referee status for ${sr.display_name}?`)) handleSrAction(sr.id, 'revoke') }}
                    disabled={srActionLoading === sr.id}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >Revoke</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Referral Leaderboard */}
      {subTab === 'leaderboard' && <>
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
                    ) : (() => {
                      const perPage = 10
                      const currentPage = referredPage[r.user_id] || 1
                      const totalPages = Math.ceil(users.length / perPage)
                      const pageUsers = users.slice((currentPage - 1) * perPage, currentPage * perPage)
                      return (
                        <>
                          {pageUsers.map(u => <ReferredUserRow key={u.id} user={u} />)}
                          {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); setReferredPage(prev => ({ ...prev, [r.user_id]: Math.max(1, currentPage - 1) })) }}
                                disabled={currentPage <= 1}
                                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: currentPage <= 1 ? 'default' : 'pointer', opacity: currentPage <= 1 ? 0.4 : 1, fontSize: 12 }}
                              >Prev</button>
                              <span style={{ color: '#64748b', fontSize: 12 }}>
                                Page {currentPage} of {totalPages} ({users.length} users)
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setReferredPage(prev => ({ ...prev, [r.user_id]: Math.min(totalPages, currentPage + 1) })) }}
                                disabled={currentPage >= totalPages}
                                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: currentPage >= totalPages ? 'default' : 'pointer', opacity: currentPage >= totalPages ? 0.4 : 1, fontSize: 12 }}
                              >Next</button>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      </>}
    </div>
  )
}
