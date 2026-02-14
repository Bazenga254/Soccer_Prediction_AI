import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'
import UserDetailPanel from '../components/UserDetailPanel'

export default function UsersTab() {
  const { getAuthHeaders, staffRole } = useAdmin()
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
