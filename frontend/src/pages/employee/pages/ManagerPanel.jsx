import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useEmployee } from '../context/EmployeeContext'

const ROLE_COLORS = {
  owner: '#e74c3c',
  general_manager: '#3498db',
  sales_hod: '#2ecc71',
  customer_care_hod: '#e67e22',
  marketing_hod: '#9b59b6',
  predictions_hod: '#1abc9c',
  sales_agent: '#27ae60',
  customer_support_agent: '#f39c12',
  prediction_analyst: '#16a085',
}

const INVITE_ROLES = [
  { value: 'customer_support_agent', label: 'Customer Support Agent' },
  { value: 'prediction_analyst', label: 'Prediction Analyst' },
  { value: 'sales_agent', label: 'Sales Agent' },
  { value: 'customer_care_hod', label: 'Customer Care HOD' },
  { value: 'sales_hod', label: 'Sales HOD' },
  { value: 'marketing_hod', label: 'Marketing HOD' },
  { value: 'predictions_hod', label: 'Predictions HOD' },
]

const EXPIRY_OPTIONS = [
  { value: 24, label: '24 hours' },
  { value: 48, label: '48 hours' },
  { value: 72, label: '72 hours' },
  { value: 168, label: '7 days' },
]

const MODULE_OPTIONS = [
  { value: '', label: 'All Modules' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'users', label: 'Users' },
  { value: 'support', label: 'Support' },
  { value: 'finance', label: 'Finance' },
  { value: 'technical', label: 'Technical' },
  { value: 'predictions', label: 'Predictions' },
  { value: 'sales', label: 'Sales' },
  { value: 'settings', label: 'Settings' },
  { value: 'auth', label: 'Auth' },
]

const LIMIT_OPTIONS = [25, 50, 100]

const SUB_TABS = [
  { id: 'employees', label: 'Employees' },
  { id: 'online', label: 'Online Users' },
  { id: 'logs', label: 'Activity Logs' },
  { id: 'invites', label: 'Invites' },
]

function formatTimestamp(ts) {
  if (!ts) return '\u2014'
  const d = new Date(ts)
  return d.toLocaleString()
}

function formatRoleName(role) {
  if (!role) return '\u2014'
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function truncateText(text, maxLen = 100) {
  if (!text) return '\u2014'
  const str = typeof text === 'string' ? text : JSON.stringify(text)
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str
}

// ─── Employees Tab ───────────────────────────────────────────────────────────

function EmployeesSubTab() {
  const { getAuthHeaders } = useEmployee()
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [suspendingId, setSuspendingId] = useState(null)

  const fetchEmployees = useCallback(async () => {
    try {
      setError(null)
      const res = await axios.get('/api/employee/manager/employees', {
        headers: getAuthHeaders(),
      })
      setEmployees(res.data.employees || res.data || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load employees')
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  const handleToggleSuspend = async (userId, currentActive) => {
    try {
      setSuspendingId(userId)
      await axios.post(
        `/api/employee/manager/suspend/${userId}`,
        { is_active: !currentActive },
        { headers: getAuthHeaders() }
      )
      setEmployees(prev =>
        prev.map(emp =>
          emp.id === userId || emp.user_id === userId
            ? { ...emp, is_active: !currentActive }
            : emp
        )
      )
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update employee status')
    } finally {
      setSuspendingId(null)
    }
  }

  if (loading) {
    return (
      <div className="emp-loading-section">
        <div className="emp-loading-spinner" />
        <p>Loading employees...</p>
      </div>
    )
  }

  return (
    <div className="emp-subtab-content">
      {error && (
        <div className="emp-error-banner">
          <span>{error}</span>
          <button className="emp-btn emp-btn-sm" onClick={fetchEmployees}>Retry</button>
        </div>
      )}

      <div className="emp-table-wrapper">
        <table className="emp-table">
          <thead>
            <tr>
              <th>Display Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Department</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={7} className="emp-table-empty">No employees found.</td>
              </tr>
            ) : (
              employees.map(emp => {
                const empId = emp.id || emp.user_id
                const isActive = emp.is_active !== false && emp.is_active !== 0
                const roleName = emp.role_name || emp.staff_role || ''
                const roleColor = ROLE_COLORS[roleName] || '#6c5ce7'

                return (
                  <tr key={empId}>
                    <td>
                      <div className="emp-user-cell">
                        <span className="emp-avatar-sm" style={{ background: roleColor }}>
                          {(emp.display_name || '?')[0].toUpperCase()}
                        </span>
                        <span>{emp.display_name || '\u2014'}</span>
                      </div>
                    </td>
                    <td className="emp-td-muted">@{emp.username || '\u2014'}</td>
                    <td className="emp-td-muted">{emp.email || '\u2014'}</td>
                    <td>
                      <span
                        className="emp-role-tag"
                        style={{
                          background: roleColor + '22',
                          color: roleColor,
                          border: `1px solid ${roleColor}44`,
                        }}
                      >
                        {formatRoleName(roleName)}
                      </span>
                    </td>
                    <td>{emp.department || '\u2014'}</td>
                    <td>
                      <span className={`emp-status-badge ${isActive ? 'active' : 'inactive'}`}>
                        {isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td>
                      <button
                        className={`emp-btn emp-btn-sm ${isActive ? 'emp-btn-danger' : 'emp-btn-success'}`}
                        onClick={() => handleToggleSuspend(empId, isActive)}
                        disabled={suspendingId === empId}
                      >
                        {suspendingId === empId
                          ? 'Updating...'
                          : isActive
                            ? 'Suspend'
                            : 'Activate'}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Online Users Tab ────────────────────────────────────────────────────────

function OnlineUsersSubTab() {
  const { getAuthHeaders } = useEmployee()
  const [onlineUsers, setOnlineUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  const fetchOnlineUsers = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true)
      setError(null)
      const res = await axios.get('/api/employee/manager/online-users', {
        headers: getAuthHeaders(),
      })
      setOnlineUsers(res.data.online_users || res.data.users || res.data || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load online users')
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  useEffect(() => {
    fetchOnlineUsers(true)
    intervalRef.current = setInterval(() => fetchOnlineUsers(false), 10000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchOnlineUsers])

  if (loading) {
    return (
      <div className="emp-loading-section">
        <div className="emp-loading-spinner" />
        <p>Loading online users...</p>
      </div>
    )
  }

  return (
    <div className="emp-subtab-content">
      <div className="emp-online-header">
        <h3>
          <span className="emp-online-dot" />
          {onlineUsers.length} User{onlineUsers.length !== 1 ? 's' : ''} Online
        </h3>
        <span className="emp-refresh-note">Auto-refreshes every 10s</span>
      </div>

      {error && (
        <div className="emp-error-banner">
          <span>{error}</span>
          <button className="emp-btn emp-btn-sm" onClick={() => fetchOnlineUsers(true)}>Retry</button>
        </div>
      )}

      {onlineUsers.length === 0 ? (
        <div className="emp-empty-state">
          <p>No users currently online.</p>
        </div>
      ) : (
        <div className="emp-table-wrapper">
          <table className="emp-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Username</th>
                <th>Tier</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {onlineUsers.map(user => {
                const userId = user.user_id || user.id
                const tier = user.tier || 'free'
                const tierColor = tier === 'pro' ? '#f1c40f' : '#74b9ff'

                return (
                  <tr key={userId}>
                    <td>
                      <div className="emp-user-cell">
                        <span
                          className="emp-avatar-sm"
                          style={{ background: user.avatar_color || '#6c5ce7' }}
                        >
                          {(user.display_name || '?')[0].toUpperCase()}
                        </span>
                        <span>{user.display_name || '\u2014'}</span>
                      </div>
                    </td>
                    <td className="emp-td-muted">@{user.username || '\u2014'}</td>
                    <td>
                      <span
                        className="emp-tier-badge"
                        style={{
                          background: tierColor + '22',
                          color: tierColor,
                          border: `1px solid ${tierColor}44`,
                        }}
                      >
                        {tier.toUpperCase()}
                      </span>
                    </td>
                    <td className="emp-td-muted">
                      {user.last_active
                        ? formatTimestamp(user.last_active)
                        : user.last_seen !== undefined
                          ? user.last_seen < 10
                            ? 'Active now'
                            : `${user.last_seen}s ago`
                          : '\u2014'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Activity Logs Tab ───────────────────────────────────────────────────────

function ActivityLogsSubTab() {
  const { getAuthHeaders } = useEmployee()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [moduleFilter, setModuleFilter] = useState('')
  const [limit, setLimit] = useState(25)

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      params.append('limit', limit.toString())
      if (moduleFilter) params.append('module', moduleFilter)

      const res = await axios.get(`/api/employee/manager/activity-logs?${params}`, {
        headers: getAuthHeaders(),
      })
      setLogs(res.data.logs || res.data.items || res.data || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load activity logs')
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders, moduleFilter, limit])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  return (
    <div className="emp-subtab-content">
      <div className="emp-filter-bar">
        <div className="emp-filter-group">
          <label>Module</label>
          <select
            className="emp-select"
            value={moduleFilter}
            onChange={e => setModuleFilter(e.target.value)}
          >
            {MODULE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="emp-filter-group">
          <label>Limit</label>
          <select
            className="emp-select"
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
          >
            {LIMIT_OPTIONS.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="emp-filter-group emp-filter-actions">
          <button className="emp-btn emp-btn-ghost" onClick={() => { setModuleFilter(''); setLimit(25) }}>
            Clear Filters
          </button>
        </div>
      </div>

      {error && (
        <div className="emp-error-banner">
          <span>{error}</span>
          <button className="emp-btn emp-btn-sm" onClick={fetchLogs}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="emp-loading-section">
          <div className="emp-loading-spinner" />
          <p>Loading activity logs...</p>
        </div>
      ) : (
        <div className="emp-table-wrapper">
          <table className="emp-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Action</th>
                <th>Module</th>
                <th>Details</th>
                <th>IP Address</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="emp-table-empty">No activity logs found.</td>
                </tr>
              ) : (
                logs.map((log, idx) => (
                  <tr key={log.id || idx}>
                    <td className="emp-td-muted">{log.user_id || '\u2014'}</td>
                    <td>
                      <span className="emp-action-badge">
                        {log.action || '\u2014'}
                      </span>
                    </td>
                    <td>{log.module || '\u2014'}</td>
                    <td className="emp-td-details" title={typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}>
                      {truncateText(log.details)}
                    </td>
                    <td className="emp-td-muted">{log.ip_address || log.ip || '\u2014'}</td>
                    <td className="emp-td-muted">{formatTimestamp(log.created_at || log.timestamp)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Invites Tab ─────────────────────────────────────────────────────────────

function InvitesSubTab() {
  const { getAuthHeaders } = useEmployee()
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [createError, setCreateError] = useState(null)
  const [createSuccess, setCreateSuccess] = useState(null)
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  // Form state
  const [formRole, setFormRole] = useState('customer_support_agent')
  const [formDepartment, setFormDepartment] = useState('')
  const [formExpiry, setFormExpiry] = useState(24)
  const [formNote, setFormNote] = useState('')

  const fetchInvites = useCallback(async () => {
    try {
      setError(null)
      const res = await axios.get('/api/employee/invites', {
        headers: getAuthHeaders(),
      })
      setInvites(res.data.invites || res.data || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load invites')
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  useEffect(() => {
    fetchInvites()
  }, [fetchInvites])

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      setCreating(true)
      setCreateError(null)
      setCreateSuccess(null)

      await axios.post(
        '/api/employee/invites/create',
        {
          role_name: formRole,
          department: formDepartment,
          expires_hours: formExpiry,
          note: formNote,
        },
        { headers: getAuthHeaders() }
      )

      setCreateSuccess('Invite created successfully!')
      setFormDepartment('')
      setFormNote('')
      fetchInvites()

      setTimeout(() => setCreateSuccess(null), 4000)
    } catch (err) {
      setCreateError(err.response?.data?.detail || 'Failed to create invite')
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (inviteId) => {
    try {
      setRevokingId(inviteId)
      await axios.post(
        `/api/employee/invites/${inviteId}/revoke`,
        {},
        { headers: getAuthHeaders() }
      )
      fetchInvites()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to revoke invite')
    } finally {
      setRevokingId(null)
    }
  }

  const handleCopyLink = async (invite) => {
    const token = invite.token || invite.invite_token
    const link = `${window.location.origin}/invite/${token}`
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(invite.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Fallback for insecure contexts
      const textarea = document.createElement('textarea')
      textarea.value = link
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopiedId(invite.id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return '#2ecc71'
      case 'used': return '#3498db'
      case 'revoked': return '#e74c3c'
      case 'expired': return '#95a5a6'
      default: return '#6c5ce7'
    }
  }

  const activeInvites = invites.filter(inv => inv.status === 'active')
  const usedInvites = invites.filter(inv => inv.status === 'used')

  if (loading) {
    return (
      <div className="emp-loading-section">
        <div className="emp-loading-spinner" />
        <p>Loading invites...</p>
      </div>
    )
  }

  return (
    <div className="emp-subtab-content">
      {error && (
        <div className="emp-error-banner">
          <span>{error}</span>
          <button className="emp-btn emp-btn-sm" onClick={fetchInvites}>Retry</button>
        </div>
      )}

      {/* Create Invite Form */}
      <div className="emp-card">
        <h3 className="emp-card-title">Create New Invite</h3>
        <form className="emp-invite-form" onSubmit={handleCreate}>
          <div className="emp-form-row">
            <div className="emp-form-group">
              <label className="emp-label">Role</label>
              <select
                className="emp-select"
                value={formRole}
                onChange={e => setFormRole(e.target.value)}
                required
              >
                {INVITE_ROLES.map(role => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
            <div className="emp-form-group">
              <label className="emp-label">Department</label>
              <input
                type="text"
                className="emp-input"
                placeholder="e.g. Customer Support"
                value={formDepartment}
                onChange={e => setFormDepartment(e.target.value)}
              />
            </div>
            <div className="emp-form-group">
              <label className="emp-label">Expires In</label>
              <select
                className="emp-select"
                value={formExpiry}
                onChange={e => setFormExpiry(Number(e.target.value))}
              >
                {EXPIRY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="emp-form-group">
            <label className="emp-label">Note (optional)</label>
            <textarea
              className="emp-textarea"
              placeholder="Add a note for this invite..."
              value={formNote}
              onChange={e => setFormNote(e.target.value)}
              rows={3}
            />
          </div>

          {createError && (
            <div className="emp-form-error">{createError}</div>
          )}
          {createSuccess && (
            <div className="emp-form-success">{createSuccess}</div>
          )}

          <button
            type="submit"
            className="emp-btn emp-btn-primary"
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create Invite'}
          </button>
        </form>
      </div>

      {/* Active Invites */}
      <div className="emp-card">
        <h3 className="emp-card-title">
          Active Invites
          <span className="emp-card-count">{activeInvites.length}</span>
        </h3>

        {activeInvites.length === 0 ? (
          <div className="emp-empty-state">
            <p>No active invites.</p>
          </div>
        ) : (
          <div className="emp-table-wrapper">
            <table className="emp-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created By</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeInvites.map(invite => {
                  const statusColor = getStatusColor(invite.status)
                  const roleColor = ROLE_COLORS[invite.role_name] || '#6c5ce7'

                  return (
                    <tr key={invite.id}>
                      <td>
                        <span
                          className="emp-role-tag"
                          style={{
                            background: roleColor + '22',
                            color: roleColor,
                            border: `1px solid ${roleColor}44`,
                          }}
                        >
                          {formatRoleName(invite.role_name)}
                        </span>
                      </td>
                      <td>
                        <span
                          className="emp-status-dot"
                          style={{
                            background: statusColor + '22',
                            color: statusColor,
                            border: `1px solid ${statusColor}44`,
                          }}
                        >
                          {invite.status}
                        </span>
                      </td>
                      <td>{invite.created_by_name || '\u2014'}</td>
                      <td className="emp-td-muted">{formatTimestamp(invite.expires_at)}</td>
                      <td>
                        <div className="emp-action-group">
                          <button
                            className="emp-btn emp-btn-sm emp-btn-secondary"
                            onClick={() => handleCopyLink(invite)}
                          >
                            {copiedId === invite.id ? 'Copied!' : 'Copy Link'}
                          </button>
                          <button
                            className="emp-btn emp-btn-sm emp-btn-danger"
                            onClick={() => handleRevoke(invite.id)}
                            disabled={revokingId === invite.id}
                          >
                            {revokingId === invite.id ? 'Revoking...' : 'Revoke'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Used Invites History */}
      <div className="emp-card">
        <h3 className="emp-card-title">
          Used Invites History
          <span className="emp-card-count">{usedInvites.length}</span>
        </h3>

        {usedInvites.length === 0 ? (
          <div className="emp-empty-state">
            <p>No used invites yet.</p>
          </div>
        ) : (
          <div className="emp-table-wrapper">
            <table className="emp-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created By</th>
                  <th>Used At</th>
                </tr>
              </thead>
              <tbody>
                {usedInvites.map(invite => {
                  const roleColor = ROLE_COLORS[invite.role_name] || '#6c5ce7'

                  return (
                    <tr key={invite.id}>
                      <td>
                        <span
                          className="emp-role-tag"
                          style={{
                            background: roleColor + '22',
                            color: roleColor,
                            border: `1px solid ${roleColor}44`,
                          }}
                        >
                          {formatRoleName(invite.role_name)}
                        </span>
                      </td>
                      <td>
                        <span
                          className="emp-status-dot"
                          style={{
                            background: '#3498db22',
                            color: '#3498db',
                            border: '1px solid #3498db44',
                          }}
                        >
                          {invite.status}
                        </span>
                      </td>
                      <td>{invite.created_by_name || '\u2014'}</td>
                      <td className="emp-td-muted">
                        {formatTimestamp(invite.used_at || invite.updated_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main ManagerPanel Component ─────────────────────────────────────────────

const SUB_TAB_COMPONENTS = {
  employees: EmployeesSubTab,
  online: OnlineUsersSubTab,
  logs: ActivityLogsSubTab,
  invites: InvitesSubTab,
}

export default function ManagerPanel() {
  const [activeSubTab, setActiveSubTab] = useState('employees')

  const ActiveComponent = SUB_TAB_COMPONENTS[activeSubTab]

  return (
    <div className="emp-manager-panel">
      <div className="emp-panel-header">
        <h2 className="emp-panel-title">Management Panel</h2>
      </div>

      <div className="emp-subtab-nav">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            className={`emp-subtab-btn ${activeSubTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="emp-subtab-body">
        {ActiveComponent ? <ActiveComponent /> : <div>Tab not found</div>}
      </div>
    </div>
  )
}
