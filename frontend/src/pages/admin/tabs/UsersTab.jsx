import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'
import UserDetailPanel from '../components/UserDetailPanel'

const SUSPENSION_REASONS = [
  { key: 'community_guidelines', label: 'Community Guidelines Violation', desc: 'Harassment, threats, or abusive behavior' },
  { key: 'fraudulent_activity', label: 'Fraudulent Activity', desc: 'Misleading predictions, metric manipulation' },
  { key: 'spam_misleading', label: 'Spam or Misleading Content', desc: 'Posting spam or false information' },
  { key: 'multiple_accounts', label: 'Multiple Accounts', desc: 'Operating more than one account' },
  { key: 'payment_abuse', label: 'Payment/Earnings Abuse', desc: 'Gaming referral or payment system' },
  { key: 'unauthorized_access', label: 'Unauthorized Access', desc: 'Hacking, scraping, or exploiting vulnerabilities' },
  { key: 'prohibited_content', label: 'Prohibited Content', desc: 'Promoting illegal services, sharing premium content' },
  { key: 'other', label: 'Other', desc: 'Custom reason (note required)' },
]

export default function UsersTab() {
  const { getAuthHeaders, staffRole } = useAdmin()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTier, setFilterTier] = useState('all')
  const [filterDevice, setFilterDevice] = useState('all')
  const [filterSource, setFilterSource] = useState('all')
  const [resetModal, setResetModal] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMsg, setResetMsg] = useState('')
  const [detailUser, setDetailUser] = useState(null)

  // Suspension modal state
  const [suspendModal, setSuspendModal] = useState(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [suspendNote, setSuspendNote] = useState('')
  const [suspendLoading, setSuspendLoading] = useState(false)
  const [suspendMsg, setSuspendMsg] = useState('')

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
    if (isActive) {
      // Suspending — open the modal
      const user = users.find(u => u.id === userId) || detailUser
      if (user) setSuspendModal(user)
    } else {
      // Activating — direct call, no modal needed
      try {
        await axios.post(`/api/admin/users/${userId}/toggle-active`, { is_active: true }, { headers: getAuthHeaders() })
        viewUserDetail(userId)
        fetchUsers()
      } catch { /* ignore */ }
    }
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
    if (currentActive) {
      // Suspending — open the modal
      const user = users.find(u => u.id === userId)
      if (user) setSuspendModal(user)
    } else {
      // Activating — direct call
      try {
        await axios.post(`/api/admin/users/${userId}/toggle-active`, { is_active: true }, { headers: getAuthHeaders() })
        fetchUsers()
      } catch { alert('Failed to activate user') }
    }
  }

  const handleConfirmSuspend = async () => {
    if (!suspendReason) {
      setSuspendMsg('Please select a suspension reason')
      return
    }
    if (suspendReason === 'other' && !suspendNote.trim()) {
      setSuspendMsg('Please provide a note explaining the reason')
      return
    }
    setSuspendLoading(true)
    setSuspendMsg('')
    try {
      await axios.post(`/api/admin/users/${suspendModal.id}/toggle-active`, {
        is_active: false,
        reason: suspendReason,
        custom_note: suspendNote.trim() || undefined,
      }, { headers: getAuthHeaders() })
      setSuspendMsg('User suspended successfully. Suspension email sent.')
      fetchUsers()
      if (detailUser && detailUser.id === suspendModal.id) viewUserDetail(suspendModal.id)
      setTimeout(() => {
        setSuspendModal(null)
        setSuspendReason('')
        setSuspendNote('')
        setSuspendMsg('')
      }, 1500)
    } catch (err) {
      setSuspendMsg(err.response?.data?.detail || 'Failed to suspend user')
    }
    setSuspendLoading(false)
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
    const s = search.toLowerCase()
    const matchesSearch = !search ||
      (u.email || '').toLowerCase().includes(s) ||
      (u.username || '').toLowerCase().includes(s) ||
      (u.display_name || '').toLowerCase().includes(s) ||
      (u.full_name || '').toLowerCase().includes(s) ||
      (u.country || '').toLowerCase().includes(s) ||
      (u.country_ip || '').toLowerCase().includes(s)
    const matchesTier = filterTier === 'all' || u.tier === filterTier
    const matchesDevice = filterDevice === 'all' || (u.device_type || '').toLowerCase() === filterDevice
    const matchesSource = filterSource === 'all' ||
      (filterSource === 'other'
        ? !['Direct','Google','YouTube','TikTok','X (Twitter)','Facebook','Instagram'].includes(u.source || 'Direct')
        : (u.source || 'Direct') === filterSource)
    return matchesSearch && matchesTier && matchesDevice && matchesSource
  })

  if (loading) return <div className="admin-loading">Loading users...</div>

  return (
    <div className="admin-tab-content">
      <div className="admin-users-toolbar">
        <input
          type="text"
          placeholder="Search by email, name, or country..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-search-input"
        />
        <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)} className="admin-filter-select">
          <option value="all">All Tiers</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
        <select value={filterDevice} onChange={(e) => setFilterDevice(e.target.value)} className="admin-filter-select">
          <option value="all">All Devices</option>
          <option value="mobile">Mobile</option>
          <option value="tablet">Tablet</option>
          <option value="desktop">Desktop</option>
        </select>
        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="admin-filter-select">
          <option value="all">All Sources</option>
          <option value="Direct">Direct</option>
          <option value="Google">Google</option>
          <option value="YouTube">YouTube</option>
          <option value="TikTok">TikTok</option>
          <option value="X (Twitter)">X (Twitter)</option>
          <option value="Facebook">Facebook</option>
          <option value="Instagram">Instagram</option>
          <option value="other">Other</option>
        </select>
        <span className="admin-user-count">{filtered.length} users</span>
      </div>

      <div className="admin-users-table admin-users-table-wide">
        <div className="admin-table-header">
          <span className="col-avatar"></span>
          <span className="col-name">User</span>
          <span className="col-country">Country</span>
          <span className="col-ip">IP Address</span>
          <span className="col-device">Device</span>
          <span className="col-browser-os">Browser / OS</span>
          <span className="col-source">Source</span>
          <span className="col-tier">Tier</span>
          <span className="col-status">Status</span>
          <span className="col-joined">Joined</span>
          <span className="col-actions">Actions</span>
        </div>
        {filtered.map(u => {
          const countryDisplay = u.country_ip || u.country || '-'
          const deviceLabel = u.device_type === 'mobile' ? 'Phone' : u.device_type === 'tablet' ? 'Tablet' : u.device_type === 'desktop' ? 'Desktop' : '-'
          const deviceClass = u.device_type || 'unknown'
          const browserOs = (u.browser && u.os) ? `${u.browser} / ${u.os}` : u.browser || u.os || '-'
          const source = u.source || 'Direct'
          return (
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
            <span className="col-country">{countryDisplay}</span>
            <span className="col-ip">{u.ip_address || '-'}</span>
            <span className="col-device">
              <span className={`device-badge ${deviceClass}`}>{deviceLabel}</span>
            </span>
            <span className="col-browser-os">{browserOs}</span>
            <span className="col-source">
              <span className={`source-badge source-${source.toLowerCase().replace(/[\s()]/g, '')}`}>{source}</span>
            </span>
            <span className="col-tier">
              <span className={`tier-tag ${u.tier}`}>{u.tier?.toUpperCase()}</span>
            </span>
            <span className="col-status">
              <span className={`status-dot ${u.is_active ? 'active' : 'suspended'}`}></span>
              {u.is_active ? 'Active' : 'Suspended'}
            </span>
            <span className="col-joined">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}</span>
            <span className="col-actions">
              <button className="admin-action-btn view-detail" onClick={() => viewUserDetail(u.id)}>View</button>
              <button className={`admin-action-btn ${u.tier === 'pro' ? 'downgrade' : 'upgrade'}`} onClick={() => handleSetTier(u.id, u.tier === 'pro' ? 'free' : 'pro')}>
                {u.tier === 'pro' ? 'Downgrade' : 'Upgrade'}
              </button>
              <button className={`admin-action-btn ${u.is_active ? 'suspend' : 'activate'}`} onClick={() => handleToggleActive(u.id, u.is_active)}>
                {u.is_active ? 'Suspend' : 'Activate'}
              </button>
              <button className="admin-action-btn reset-pw" onClick={() => { setResetModal(u); setNewPassword(''); setResetMsg('') }}>Reset PW</button>
            </span>
          </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="admin-empty-row">No users found</div>
        )}
      </div>

      {/* Password Reset Modal */}
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

      {/* Suspension Confirmation Modal */}
      {suspendModal && (
        <div className="admin-modal-overlay" onClick={() => { if (!suspendLoading) { setSuspendModal(null); setSuspendReason(''); setSuspendNote(''); setSuspendMsg('') } }}>
          <div className="admin-modal suspend-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Suspend User</h3>
            <p className="admin-modal-user">
              {suspendModal.display_name || suspendModal.username} ({suspendModal.email})
            </p>

            <label className="suspend-label">Reason for Suspension *</label>
            <select
              value={suspendReason}
              onChange={(e) => { setSuspendReason(e.target.value); setSuspendMsg('') }}
              className="admin-modal-input suspend-reason-select"
            >
              <option value="">-- Select a reason --</option>
              {SUSPENSION_REASONS.map(r => (
                <option key={r.key} value={r.key}>{r.label} — {r.desc}</option>
              ))}
            </select>

            <label className="suspend-label">
              Additional Note {suspendReason === 'other' ? '*' : '(optional)'}
            </label>
            <textarea
              value={suspendNote}
              onChange={(e) => { setSuspendNote(e.target.value); setSuspendMsg('') }}
              placeholder={suspendReason === 'other' ? 'Describe the specific reason...' : 'Optional note to include in the suspension email...'}
              className="admin-modal-input suspend-note-textarea"
              rows={3}
            />

            <div className="suspend-warning">
              This will immediately log the user out, hide their predictions, refund all purchases to buyers, and send a suspension notification email.
            </div>

            {suspendMsg && (
              <div className={`admin-modal-msg ${suspendMsg.includes('success') ? 'success' : 'error'}`}>
                {suspendMsg}
              </div>
            )}

            <div className="admin-modal-actions">
              <button className="admin-modal-cancel" onClick={() => { setSuspendModal(null); setSuspendReason(''); setSuspendNote(''); setSuspendMsg('') }} disabled={suspendLoading}>
                Cancel
              </button>
              <button className="admin-modal-confirm suspend-confirm-btn" onClick={handleConfirmSuspend} disabled={suspendLoading}>
                {suspendLoading ? 'Suspending...' : 'Confirm Suspension'}
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
              onRefresh={(id, params) => {
                if (params) {
                  axios.get(`/api/admin/users/${id}${params}`, { headers: getAuthHeaders() })
                    .then(res => setDetailUser(res.data)).catch(() => {})
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
