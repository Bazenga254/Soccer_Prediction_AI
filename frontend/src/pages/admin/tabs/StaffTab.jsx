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
  technical_hod: '#e84393',
  technical_support_agent: '#d63031',
  super_admin: '#e74c3c',
  customer_care: '#3498db',
  technical_support: '#9b59b6',
  accounting: '#e67e22',
}

const MODULE_LABELS = {
  dashboard: 'Dashboard', users: 'Users', employees: 'Employees',
  sales: 'Sales', predictions: 'Predictions', support: 'Support',
  activity_logs: 'Activity Logs', security: 'Security', settings: 'Settings',
  community: 'Community', referrals: 'Referrals', access_codes: 'Access Codes',
  withdrawals: 'Withdrawals', subscriptions: 'Subscriptions',
  online_users: 'Online Users', finance: 'Finance', technical: 'Technical', bots: 'Bots',
}

const ACTIONS = ['read', 'write', 'edit', 'delete', 'export', 'approve']

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
  const [createRole, setCreateRole] = useState('customer_support_agent')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')

  // Role permissions data (for preview in assign modal)
  const [allRolesPerms, setAllRolesPerms] = useState(null)

  // Custom permissions editor
  const [permEditor, setPermEditor] = useState(null) // {user, role, rolePerms, customOverrides, effective}
  const [permEditorDraft, setPermEditorDraft] = useState({}) // working copy of overrides
  const [permSaving, setPermSaving] = useState(false)
  const [permMsg, setPermMsg] = useState('')

  const fetchStaff = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/staff', { headers: getAuthHeaders() })
      setStaff(res.data.staff || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchStaff() }, [fetchStaff])

  // Fetch all roles permissions for preview
  useEffect(() => {
    const fetchRolesPerms = async () => {
      try {
        const res = await axios.get('/api/admin/roles/permissions', { headers: getAuthHeaders() })
        setAllRolesPerms(res.data)
      } catch { /* ignore */ }
    }
    fetchRolesPerms()
  }, [getAuthHeaders])

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
        setCreateRole('customer_support_agent')
        fetchStaff()
        setTimeout(() => setCreateSuccess(''), 5000)
      }
    } catch (err) {
      setCreateError(err.response?.data?.detail || 'Failed to create staff account')
    }
    setCreating(false)
  }

  // Open permissions editor for a staff member
  const openPermEditor = async (staffMember) => {
    try {
      const res = await axios.get(`/api/admin/staff/${staffMember.id}/permissions`, { headers: getAuthHeaders() })
      const { role, role_permissions, custom_overrides, effective } = res.data
      setPermEditor({
        user: staffMember,
        role,
        rolePerms: role_permissions,
        customOverrides: custom_overrides,
        effective,
      })
      // Initialize draft from custom_overrides
      setPermEditorDraft(JSON.parse(JSON.stringify(custom_overrides || {})))
      setPermMsg('')
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to load permissions')
    }
  }

  // Toggle a permission override: cycles inherit(-1) -> grant(1) -> deny(0) -> inherit(-1)
  const togglePermOverride = (module, actionCol) => {
    setPermEditorDraft(prev => {
      const next = { ...prev }
      if (!next[module]) {
        next[module] = { can_read: -1, can_write: -1, can_edit: -1, can_delete: -1, can_export: -1, can_approve: -1 }
      } else {
        next[module] = { ...next[module] }
      }
      const current = next[module][actionCol] ?? -1
      // Cycle: -1 (inherit) -> 1 (grant) -> 0 (deny) -> -1 (inherit)
      if (current === -1) next[module][actionCol] = 1
      else if (current === 1) next[module][actionCol] = 0
      else next[module][actionCol] = -1
      return next
    })
  }

  // Save custom permissions
  const savePermissions = async () => {
    if (!permEditor) return
    setPermSaving(true)
    setPermMsg('')
    try {
      await axios.post(`/api/admin/staff/${permEditor.user.id}/permissions`, {
        permissions: permEditorDraft,
      }, { headers: getAuthHeaders() })
      setPermMsg('Permissions saved successfully!')
      // Refresh the editor data
      const res = await axios.get(`/api/admin/staff/${permEditor.user.id}/permissions`, { headers: getAuthHeaders() })
      const { role, role_permissions, custom_overrides, effective } = res.data
      setPermEditor(prev => ({ ...prev, role, rolePerms: role_permissions, customOverrides: custom_overrides, effective }))
      setPermEditorDraft(JSON.parse(JSON.stringify(custom_overrides || {})))
      setTimeout(() => setPermMsg(''), 3000)
    } catch (err) {
      setPermMsg(err.response?.data?.detail || 'Failed to save permissions')
    }
    setPermSaving(false)
  }

  // Reset to role defaults
  const resetPermissions = async () => {
    if (!permEditor) return
    if (!confirm('Reset all custom permissions to role defaults?')) return
    setPermSaving(true)
    setPermMsg('')
    try {
      await axios.post(`/api/admin/staff/${permEditor.user.id}/reset-permissions`, {}, { headers: getAuthHeaders() })
      setPermMsg('Permissions reset to role defaults!')
      setPermEditorDraft({})
      const res = await axios.get(`/api/admin/staff/${permEditor.user.id}/permissions`, { headers: getAuthHeaders() })
      const { role, role_permissions, custom_overrides, effective } = res.data
      setPermEditor(prev => ({ ...prev, role, rolePerms: role_permissions, customOverrides: custom_overrides, effective }))
      setTimeout(() => setPermMsg(''), 3000)
    } catch (err) {
      setPermMsg(err.response?.data?.detail || 'Failed to reset permissions')
    }
    setPermSaving(false)
  }

  // Helper: get the role default for a module/action
  const getRoleDefault = (module, action) => {
    if (!permEditor?.rolePerms) return 0
    const modPerms = permEditor.rolePerms[module]
    if (!modPerms) return 0
    return modPerms[action] || 0
  }

  // Helper: get override state for a module/action (-1, 0, or 1)
  const getOverrideState = (module, actionCol) => {
    return permEditorDraft[module]?.[actionCol] ?? -1
  }

  const getRoleDisplay = (s) => {
    if (s.role_display_name) return s.role_display_name
    const legacyMap = { super_admin: 'Super Admin', customer_care: 'Customer Care', technical_support: 'Technical Support', accounting: 'Accounting' }
    return legacyMap[s.staff_role] || s.staff_role || 'Unknown'
  }

  const getRoleColor = (s) => {
    return ROLE_COLORS[s.role_name || s.staff_role] || '#636e72'
  }

  // Render permission grid preview for role assignment modal
  const renderRolePreview = (roleName) => {
    if (!allRolesPerms || !allRolesPerms[roleName]) return null
    const roleData = allRolesPerms[roleName]
    const perms = roleData.permissions || {}
    const modules = Object.keys(perms)
    if (modules.length === 0) return <p className="perm-preview-empty">No permissions defined for this role.</p>

    return (
      <div className="perm-preview">
        <p className="perm-preview-desc">{roleData.description}</p>
        <div className="perm-preview-grid">
          <div className="perm-preview-header">
            <span className="perm-preview-module-label">Module</span>
            {ACTIONS.map(a => <span key={a} className="perm-preview-action-label">{a.charAt(0).toUpperCase()}</span>)}
          </div>
          {modules.map(mod => (
            <div key={mod} className="perm-preview-row">
              <span className="perm-preview-module-label">{MODULE_LABELS[mod] || mod}</span>
              {ACTIONS.map(a => {
                const val = perms[mod]?.[a] || 0
                return (
                  <span key={a} className={`perm-preview-cell ${val ? 'granted' : 'denied'}`}>
                    {val ? '\u2713' : '\u2715'}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Count custom overrides
  const countOverrides = () => {
    let count = 0
    for (const mod of Object.keys(permEditorDraft)) {
      for (const col of Object.values(permEditorDraft[mod] || {})) {
        if (col !== -1) count++
      }
    }
    return count
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
                  <optgroup label="Management">
                    <option value="owner">Owner</option>
                    <option value="general_manager">General Manager</option>
                  </optgroup>
                  <optgroup label="Heads of Department">
                    <option value="sales_hod">Sales HOD</option>
                    <option value="customer_care_hod">Customer Care HOD</option>
                    <option value="marketing_hod">Marketing HOD</option>
                    <option value="predictions_hod">Predictions HOD</option>
                    <option value="technical_hod">Technical HOD</option>
                  </optgroup>
                  <optgroup label="Agents">
                    <option value="customer_support_agent">Customer Support Agent</option>
                    <option value="sales_agent">Sales Agent</option>
                    <option value="prediction_analyst">Prediction Analyst</option>
                    <option value="technical_support_agent">Technical Support Agent</option>
                  </optgroup>
                </select>
              </div>
            </div>
            <p className="admin-create-staff-note">
              Staff accounts bypass email verification and access codes. The staff member can log in immediately and will be redirected to the Employee Portal based on their assigned role.
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
                  <button className="admin-action-btn upgrade" onClick={() => { setAssignModal(u); setSelectedRole('customer_support_agent') }}>
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
              <button className="admin-action-btn reset-pw" onClick={() => { setAssignModal(s); setSelectedRole(s.role_name || s.staff_role || 'customer_support_agent') }}>
                Change Role
              </button>
              {canEdit && (
                <button className="admin-action-btn upgrade" onClick={() => openPermEditor(s)}>
                  Permissions
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Assign Role Modal with Permission Preview */}
      {assignModal && (
        <div className="admin-modal-overlay" onClick={() => setAssignModal(null)}>
          <div className="admin-modal perm-assign-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Assign Role</h3>
            <p className="admin-modal-user">
              {assignModal.display_name || assignModal.username} ({assignModal.email})
            </p>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="admin-modal-input"
            >
              <optgroup label="Management">
                <option value="owner">Owner</option>
                <option value="general_manager">General Manager</option>
              </optgroup>
              <optgroup label="Heads of Department">
                <option value="sales_hod">Sales HOD</option>
                <option value="customer_care_hod">Customer Care HOD</option>
                <option value="marketing_hod">Marketing HOD</option>
                <option value="predictions_hod">Predictions HOD</option>
                <option value="technical_hod">Technical HOD</option>
              </optgroup>
              <optgroup label="Agents">
                <option value="customer_support_agent">Customer Support Agent</option>
                <option value="sales_agent">Sales Agent</option>
                <option value="prediction_analyst">Prediction Analyst</option>
                <option value="technical_support_agent">Technical Support Agent</option>
              </optgroup>
            </select>

            {/* Permission preview for selected role */}
            {selectedRole && renderRolePreview(selectedRole)}

            <div className="admin-modal-actions">
              <button className="admin-modal-cancel" onClick={() => setAssignModal(null)}>Cancel</button>
              <button className="admin-modal-confirm" onClick={handleAssignRole}>Assign</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Permissions Editor Modal */}
      {permEditor && (
        <div className="admin-modal-overlay" onClick={() => setPermEditor(null)}>
          <div className="admin-modal perm-editor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="perm-editor-header">
              <div>
                <h3>Custom Permissions</h3>
                <p className="perm-editor-user">
                  {permEditor.user.display_name || permEditor.user.username}
                  {permEditor.role && (
                    <span className="admin-staff-role-tag" style={{ background: ROLE_COLORS[permEditor.role.name] || '#636e72', marginLeft: 8 }}>
                      {permEditor.role.display_name}
                    </span>
                  )}
                </p>
              </div>
              <button className="perm-editor-close" onClick={() => setPermEditor(null)}>&times;</button>
            </div>

            <div className="perm-editor-legend">
              <span className="perm-legend-item"><span className="perm-cell-demo inherited">-</span> Inherited</span>
              <span className="perm-legend-item"><span className="perm-cell-demo granted">{'\u2713'}</span> Granted</span>
              <span className="perm-legend-item"><span className="perm-cell-demo denied">{'\u2715'}</span> Denied</span>
              <span className="perm-editor-overrides-count">
                {countOverrides()} custom override{countOverrides() !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="perm-editor-grid-wrap">
              <div className="perm-editor-grid">
                <div className="perm-editor-grid-header">
                  <span className="perm-editor-module-col">Module</span>
                  {ACTIONS.map(a => (
                    <span key={a} className="perm-editor-action-col">{a.charAt(0).toUpperCase() + a.slice(1)}</span>
                  ))}
                </div>
                {Object.keys(MODULE_LABELS).map(mod => (
                  <div key={mod} className="perm-editor-grid-row">
                    <span className="perm-editor-module-col">{MODULE_LABELS[mod]}</span>
                    {ACTIONS.map(action => {
                      const actionCol = `can_${action}`
                      const overrideState = getOverrideState(mod, actionCol)
                      const roleDefault = getRoleDefault(mod, action)

                      let cellClass = 'perm-editor-cell'
                      let label = ''
                      if (overrideState === 1) {
                        cellClass += ' granted'
                        label = '\u2713'
                      } else if (overrideState === 0) {
                        cellClass += ' denied'
                        label = '\u2715'
                      } else {
                        // Inherited - show role default as muted
                        cellClass += ' inherited'
                        label = roleDefault ? '\u2713' : '\u2715'
                      }

                      return (
                        <button
                          key={action}
                          className={cellClass}
                          onClick={() => togglePermOverride(mod, actionCol)}
                          title={`${MODULE_LABELS[mod]} - ${action}: ${overrideState === -1 ? 'Inherited (' + (roleDefault ? 'allowed' : 'denied') + ')' : overrideState === 1 ? 'Granted (override)' : 'Denied (override)'}\nClick to cycle`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {permMsg && (
              <div className={`perm-editor-msg ${permMsg.includes('success') || permMsg.includes('reset') ? 'success' : 'error'}`}>
                {permMsg}
              </div>
            )}

            <div className="perm-editor-actions">
              <button className="admin-action-btn suspend" onClick={resetPermissions} disabled={permSaving}>
                Reset to Defaults
              </button>
              <div style={{ flex: 1 }} />
              <button className="admin-modal-cancel" onClick={() => setPermEditor(null)}>Cancel</button>
              <button className="admin-modal-confirm" onClick={savePermissions} disabled={permSaving}>
                {permSaving ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
