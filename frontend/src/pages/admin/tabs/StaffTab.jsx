import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'

const ROLE_COLORS = {
  owner: '#e74c3c',
  general_manager: '#e67e22',
  sales_hod: '#2ecc71',
  customer_care_hod: '#3498db',
  marketing_hod: '#9b59b6',
  predictions_hod: '#1abc9c',
  sales_agent: '#27ae60',
  customer_support_agent: '#2980b9',
  prediction_analyst: '#16a085',
  super_admin: '#e74c3c',
  customer_care: '#3498db',
  technical_support: '#9b59b6',
  accounting: '#e67e22',
}

export default function StaffTab() {
  const { getAuthHeaders, hasPermission } = useAdmin()
  const canWrite = hasPermission("employees", "write")
  const canEdit = hasPermission("employees", "edit")
  const canDelete = hasPermission("employees", "delete")
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


  const getRoleDisplay = (s) => {
    if (s.role_display_name) return s.role_display_name
    const legacyMap = { super_admin: 'Super Admin', customer_care: 'Customer Care', technical_support: 'Technical Support', accounting: 'Accounting' }
    return legacyMap[s.staff_role] || s.staff_role || 'Unknown'
  }

  const getRoleColor = (s) => {
    return ROLE_COLORS[s.role_name || s.staff_role] || '#636e72'
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
                  <span className="admin-staff-role-tag" style={{ background: getRoleColor(u) }}>
                    {getRoleDisplay(u)}
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
              <span className="admin-staff-role-tag" style={{ background: getRoleColor(s) }}>
                {getRoleDisplay(s)}
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

