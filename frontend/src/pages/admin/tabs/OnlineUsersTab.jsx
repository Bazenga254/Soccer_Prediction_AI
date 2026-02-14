import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'
import StatCard from '../components/StatCard'
import UserDetailPanel from '../components/UserDetailPanel'

function formatDuration(seconds) {
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function OnlineUsersTab() {
  const { getAuthHeaders, staffRole } = useAdmin()
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
              onRefresh={viewUserDetail}
            />
          </div>
        </div>
      )}
    </div>
  )
}
