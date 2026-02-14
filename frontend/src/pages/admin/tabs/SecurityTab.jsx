import { useState, useEffect, useCallback, useRef } from 'react'
import { useAdmin } from '../context/AdminContext'
import StatCard from '../components/StatCard'

const API = '/api'
const SESSIONS_REFRESH_INTERVAL = 5000 // 5 seconds

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

function formatTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString()
}

function timeAgo(ts) {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function getUserInitials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

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

export default function SecurityTab() {
  const { getAuthHeaders, hasPermission, authMode } = useAdmin()

  const [sessions, setSessions] = useState([])
  const [loginHistory, setLoginHistory] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [userLoginHistory, setUserLoginHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState(null)
  const [terminatingId, setTerminatingId] = useState(null)
  const [activeSection, setActiveSection] = useState('sessions') // sessions | history

  const sessionsTimer = useRef(null)

  const isOwner = authMode === 'password'

  const fetchSessions = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      setError(null)

      const res = await fetch(`${API}/admin/staff/sessions`, {
        headers: getAuthHeaders(),
      })

      if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`)

      const data = await res.json()
      setSessions(data.sessions || data || [])

      // Extract login history from sessions response if available
      if (data.login_history) {
        setLoginHistory(data.login_history)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  const fetchUserLoginHistory = useCallback(async (userId) => {
    try {
      setHistoryLoading(true)
      const res = await fetch(`${API}/admin/staff/${userId}/login-history`, {
        headers: getAuthHeaders(),
      })

      if (!res.ok) throw new Error(`Failed to fetch login history: ${res.status}`)

      const data = await res.json()
      setUserLoginHistory(data.history || data.logins || data || [])
      setSelectedUserId(userId)
    } catch (err) {
      alert('Failed to load login history: ' + err.message)
    } finally {
      setHistoryLoading(false)
    }
  }, [getAuthHeaders])

  const terminateSession = useCallback(async (userId) => {
    if (!confirm('Are you sure you want to force logout this user?')) return

    try {
      setTerminatingId(userId)
      const res = await fetch(`${API}/admin/staff/${userId}/terminate-session`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })

      if (!res.ok) throw new Error(`Failed to terminate session: ${res.status}`)

      // Refresh sessions
      await fetchSessions(false)
    } catch (err) {
      alert('Failed to terminate session: ' + err.message)
    } finally {
      setTerminatingId(null)
    }
  }, [getAuthHeaders, fetchSessions])

  // Initial load
  useEffect(() => {
    fetchSessions(true)
  }, [fetchSessions])

  // Auto-refresh sessions every 5 seconds
  useEffect(() => {
    sessionsTimer.current = setInterval(() => {
      fetchSessions(false)
    }, SESSIONS_REFRESH_INTERVAL)

    return () => {
      if (sessionsTimer.current) clearInterval(sessionsTimer.current)
    }
  }, [fetchSessions])

  // Compute failed login alerts
  const failedLogins = loginHistory.filter(
    entry => entry.success === false || entry.status === 'failed'
  )

  // Compute password expiry data
  const expiredPasswords = sessions.filter(
    s => s.password_expired || s.password_expiry_status === 'expired'
  )

  if (!isOwner && !hasPermission('security', 'read')) {
    return (
      <div className="admin-tab-content">
        <div className="admin-no-permission">
          <h3>Access Denied</h3>
          <p>You do not have permission to view security settings. This section is restricted to the owner.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-tab-content">
      <div className="admin-tab-header">
        <h2>Security Management</h2>
        <span className="admin-badge admin-badge-owner">Owner Only</span>
      </div>

      {/* Stats Summary */}
      <div className="admin-stats-grid">
        <StatCard
          label="Active Sessions"
          value={sessions.length}
          icon="🟢"
          color="#2ecc71"
        />
        <StatCard
          label="Failed Logins (Recent)"
          value={failedLogins.length}
          icon="🚫"
          color="#e74c3c"
        />
        <StatCard
          label="Expired Passwords"
          value={expiredPasswords.length}
          icon="🔑"
          color="#f39c12"
        />
        <StatCard
          label="Auto-Refresh"
          value="5s"
          icon="🔄"
          color="#3498db"
          sub="Sessions refresh every 5 seconds"
        />
      </div>

      {/* Section Tabs */}
      <div className="admin-section-tabs">
        <button
          className={`admin-section-tab ${activeSection === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveSection('sessions')}
        >
          Active Sessions
        </button>
        <button
          className={`admin-section-tab ${activeSection === 'history' ? 'active' : ''}`}
          onClick={() => setActiveSection('history')}
        >
          Login History
        </button>
        <button
          className={`admin-section-tab ${activeSection === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveSection('alerts')}
        >
          Failed Login Alerts
          {failedLogins.length > 0 && (
            <span className="admin-badge-count">{failedLogins.length}</span>
          )}
        </button>
        <button
          className={`admin-section-tab ${activeSection === 'passwords' ? 'active' : ''}`}
          onClick={() => setActiveSection('passwords')}
        >
          Password Status
        </button>
      </div>

      {error && (
        <div className="admin-error-banner">
          <span>{error}</span>
          <button className="admin-btn admin-btn-sm" onClick={() => fetchSessions(true)}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="admin-loading-section">
          <div className="admin-loading-spinner" />
          <p>Loading security data...</p>
        </div>
      ) : (
        <>
          {/* Active Sessions Section */}
          {activeSection === 'sessions' && (
            <div className="admin-section">
              <h3 className="admin-section-title">Active Sessions</h3>
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>IP Address</th>
                      <th>Device</th>
                      <th>Duration</th>
                      <th>Last Activity</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="admin-table-empty">
                          No active sessions found.
                        </td>
                      </tr>
                    ) : (
                      sessions.map((session, idx) => {
                        const userId = session.user_id || session.id || idx
                        return (
                          <tr key={userId}>
                            <td>
                              <div className="admin-user-cell">
                                <div
                                  className="admin-avatar-sm"
                                  style={{
                                    background:
                                      ROLE_COLORS[session.role || session.staff_role] || '#6c5ce7',
                                  }}
                                >
                                  {getUserInitials(session.user_name || session.name)}
                                </div>
                                <div>
                                  <div className="admin-user-name">
                                    {session.user_name || session.name || 'Unknown'}
                                  </div>
                                  <div className="admin-user-email">{session.email || ''}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span
                                className="admin-badge"
                                style={{
                                  background:
                                    (ROLE_COLORS[session.role || session.staff_role] || '#6c5ce7') +
                                    '22',
                                  color:
                                    ROLE_COLORS[session.role || session.staff_role] || '#6c5ce7',
                                }}
                              >
                                {session.role_display || session.role || session.staff_role || '—'}
                              </span>
                            </td>
                            <td className="admin-td-ip">
                              {session.ip_address || session.ip || '—'}
                            </td>
                            <td className="admin-td-device">
                              {session.device || session.user_agent || '—'}
                            </td>
                            <td>{formatDuration(session.session_duration || session.duration)}</td>
                            <td>{timeAgo(session.last_activity || session.last_seen)}</td>
                            <td>
                              <div className="admin-action-buttons">
                                <button
                                  className="admin-btn admin-btn-sm admin-btn-info"
                                  onClick={() => fetchUserLoginHistory(userId)}
                                  disabled={historyLoading}
                                >
                                  History
                                </button>
                                <button
                                  className="admin-btn admin-btn-sm admin-btn-danger"
                                  onClick={() => terminateSession(userId)}
                                  disabled={terminatingId === userId}
                                >
                                  {terminatingId === userId ? 'Logging out...' : 'Force Logout'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Login History Section */}
          {activeSection === 'history' && (
            <div className="admin-section">
              <h3 className="admin-section-title">Login History</h3>

              {/* User-specific history modal */}
              {selectedUserId && userLoginHistory.length > 0 && (
                <div className="admin-card admin-card-highlight" style={{ marginBottom: '1rem' }}>
                  <div className="admin-card-header">
                    <h4>Login History for User #{selectedUserId}</h4>
                    <button
                      className="admin-btn admin-btn-sm admin-btn-ghost"
                      onClick={() => {
                        setSelectedUserId(null)
                        setUserLoginHistory([])
                      }}
                    >
                      Close
                    </button>
                  </div>
                  <div className="admin-table-wrapper">
                    <table className="admin-table admin-table-compact">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>IP Address</th>
                          <th>Device</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userLoginHistory.map((entry, idx) => (
                          <tr key={idx}>
                            <td>{formatTime(entry.timestamp || entry.created_at)}</td>
                            <td className="admin-td-ip">{entry.ip_address || entry.ip || '—'}</td>
                            <td className="admin-td-device">
                              {entry.device || entry.user_agent || '—'}
                            </td>
                            <td>
                              <span
                                className={`admin-badge ${
                                  entry.success === false || entry.status === 'failed'
                                    ? 'admin-badge-danger'
                                    : 'admin-badge-success'
                                }`}
                              >
                                {entry.success === false || entry.status === 'failed'
                                  ? 'Failed'
                                  : 'Success'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>IP Address</th>
                      <th>Device</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loginHistory.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="admin-table-empty">
                          No login history available. Login history will appear when staff log in.
                        </td>
                      </tr>
                    ) : (
                      loginHistory.map((entry, idx) => (
                        <tr
                          key={idx}
                          className={
                            entry.success === false || entry.status === 'failed'
                              ? 'admin-row-danger'
                              : ''
                          }
                        >
                          <td>{formatTime(entry.timestamp || entry.created_at)}</td>
                          <td>
                            <div className="admin-user-cell">
                              <div className="admin-avatar-sm" style={{ background: '#6c5ce7' }}>
                                {getUserInitials(entry.user_name || entry.user)}
                              </div>
                              <span>{entry.user_name || entry.user || 'Unknown'}</span>
                            </div>
                          </td>
                          <td className="admin-td-ip">{entry.ip_address || entry.ip || '—'}</td>
                          <td className="admin-td-device">
                            {entry.device || entry.user_agent || '—'}
                          </td>
                          <td>
                            <span
                              className={`admin-badge ${
                                entry.success === false || entry.status === 'failed'
                                  ? 'admin-badge-danger'
                                  : 'admin-badge-success'
                              }`}
                            >
                              {entry.success === false || entry.status === 'failed'
                                ? 'Failed'
                                : 'Success'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Failed Login Alerts */}
          {activeSection === 'alerts' && (
            <div className="admin-section">
              <h3 className="admin-section-title">Failed Login Alerts</h3>
              {failedLogins.length === 0 ? (
                <div className="admin-empty-state">
                  <div className="admin-empty-icon">&#10003;</div>
                  <h4>No Failed Login Attempts</h4>
                  <p>No recent failed login attempts detected. All clear!</p>
                </div>
              ) : (
                <div className="admin-alert-list">
                  {failedLogins.map((entry, idx) => (
                    <div key={idx} className="admin-alert-card admin-alert-danger">
                      <div className="admin-alert-icon">&#9888;</div>
                      <div className="admin-alert-content">
                        <div className="admin-alert-title">
                          Failed login attempt by{' '}
                          <strong>{entry.user_name || entry.user || 'Unknown'}</strong>
                        </div>
                        <div className="admin-alert-meta">
                          <span>IP: {entry.ip_address || entry.ip || '—'}</span>
                          <span>Device: {entry.device || entry.user_agent || '—'}</span>
                          <span>{formatTime(entry.timestamp || entry.created_at)}</span>
                        </div>
                        {entry.reason && (
                          <div className="admin-alert-reason">Reason: {entry.reason}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Password Expiry Status */}
          {activeSection === 'passwords' && (
            <div className="admin-section">
              <h3 className="admin-section-title">Password Expiry Status</h3>
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Last Password Change</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="admin-table-empty">
                          No staff data available.
                        </td>
                      </tr>
                    ) : (
                      sessions.map((session, idx) => {
                        const isExpired =
                          session.password_expired ||
                          session.password_expiry_status === 'expired'
                        return (
                          <tr key={session.user_id || idx}>
                            <td>
                              <div className="admin-user-cell">
                                <div
                                  className="admin-avatar-sm"
                                  style={{
                                    background:
                                      ROLE_COLORS[session.role || session.staff_role] || '#6c5ce7',
                                  }}
                                >
                                  {getUserInitials(session.user_name || session.name)}
                                </div>
                                <span>{session.user_name || session.name || 'Unknown'}</span>
                              </div>
                            </td>
                            <td>
                              <span
                                className="admin-badge"
                                style={{
                                  background:
                                    (ROLE_COLORS[session.role || session.staff_role] || '#6c5ce7') +
                                    '22',
                                  color:
                                    ROLE_COLORS[session.role || session.staff_role] || '#6c5ce7',
                                }}
                              >
                                {session.role_display || session.role || '—'}
                              </span>
                            </td>
                            <td>
                              {formatTime(
                                session.last_password_change || session.password_changed_at
                              )}
                            </td>
                            <td>
                              {isExpired ? (
                                <span className="admin-badge admin-badge-danger">Expired</span>
                              ) : (
                                <span className="admin-badge admin-badge-success">Active</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
