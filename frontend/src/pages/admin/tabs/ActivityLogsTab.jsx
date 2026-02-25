import { useState, useEffect, useCallback, useRef } from 'react'
import { useAdmin } from '../context/AdminContext'
import StatCard from '../components/StatCard'

const API = '/api'
const AUTO_REFRESH_INTERVAL = 10000 // 10 seconds

const ACTION_COLORS = {
  read: '#2ecc71',
  create: '#3498db',
  edit: '#f1c40f',
  update: '#f1c40f',
  delete: '#e74c3c',
  login: '#9b59b6',
  logout: '#95a5a6',
  export: '#1abc9c',
  // System events
  otp_delivery_failed: '#e74c3c',
  email_send_failed: '#e74c3c',
  verification_code_expired: '#f39c12',
  verification_code_wrong: '#f39c12',
  verification_max_attempts: '#e74c3c',
  stk_push_failed: '#e74c3c',
  stk_push_exception: '#e74c3c',
  payment_failed: '#f39c12',
  payment_forged_callback: '#e74c3c',
  payment_callback_error: '#e74c3c',
  payment_completion_failed: '#e74c3c',
}

const ACTION_TYPES = [
  { value: '', label: 'All Actions' },
  { value: 'read', label: 'Read' },
  { value: 'create', label: 'Create' },
  { value: 'edit', label: 'Edit' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'export', label: 'Export' },
  { value: 'otp_delivery_failed', label: 'OTP Failed' },
  { value: 'email_send_failed', label: 'Email Failed' },
  { value: 'verification_code_expired', label: 'Code Expired' },
  { value: 'verification_code_wrong', label: 'Wrong Code' },
  { value: 'verification_max_attempts', label: 'Max Attempts' },
  { value: 'stk_push_failed', label: 'STK Failed' },
  { value: 'payment_failed', label: 'Payment Failed' },
  { value: 'payment_forged_callback', label: 'Forged Payment' },
  { value: 'payment_completion_failed', label: 'Completion Failed' },
]

const MODULE_OPTIONS = [
  { value: '', label: 'All Modules' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'users', label: 'Users' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'withdrawals', label: 'Withdrawals' },
  { value: 'community', label: 'Community' },
  { value: 'referrals', label: 'Referrals' },
  { value: 'access_codes', label: 'Access Codes' },
  { value: 'support', label: 'Support' },
  { value: 'employees', label: 'Employees' },
  { value: 'security', label: 'Security' },
  { value: 'predictions', label: 'Predictions' },
  { value: 'sales', label: 'Sales' },
  { value: 'settings', label: 'Settings' },
  { value: 'email', label: 'Email' },
  { value: 'registration', label: 'Registration' },
  { value: 'authentication', label: 'Authentication' },
  { value: 'verification', label: 'Verification' },
  { value: 'payments', label: 'Payments' },
]

function formatTimestamp(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString()
}

function getActionColor(action) {
  if (!action) return '#95a5a6'
  const lower = action.toLowerCase()
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (lower.includes(key)) return color
  }
  return '#95a5a6'
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

export default function ActivityLogsTab() {
  const { getAuthHeaders, hasPermission } = useAdmin()

  // Filter state
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [userSearch, setUserSearch] = useState('')

  // Data state
  const [logs, setLogs] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [perPage] = useState(25)
  const [expandedRow, setExpandedRow] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [exporting, setExporting] = useState(false)

  const refreshTimer = useRef(null)

  const fetchLogs = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (actionFilter) params.append('action', actionFilter)
      if (moduleFilter) params.append('module', moduleFilter)
      if (userSearch) params.append('user_id', userSearch)
      if (fromDate) params.append('from_date', fromDate)
      if (toDate) params.append('to_date', toDate)
      params.append('page', page.toString())
      params.append('per_page', perPage.toString())

      const res = await fetch(`${API}/admin/activity-logs?${params}`, {
        headers: getAuthHeaders(),
      })

      if (!res.ok) throw new Error(`Failed to fetch logs: ${res.status}`)

      const data = await res.json()
      setLogs(data.logs || data.items || data.data || [])
      setTotalPages(data.total_pages || data.pages || Math.ceil((data.total || 0) / perPage) || 1)
      setTotalCount(data.total || data.total_count || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders, actionFilter, moduleFilter, userSearch, fromDate, toDate, page, perPage])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/activity-stats?days=7`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (err) {
      console.error('Failed to fetch activity stats:', err)
    }
  }, [getAuthHeaders])

  // Initial load and filter changes
  useEffect(() => {
    fetchLogs(true)
  }, [fetchLogs])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      refreshTimer.current = setInterval(() => {
        fetchLogs(false)
      }, AUTO_REFRESH_INTERVAL)
    }

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current)
    }
  }, [autoRefresh, fetchLogs])

  const handleExportCSV = async () => {
    if (!hasPermission('activity_logs', 'export')) return
    try {
      setExporting(true)
      const params = new URLSearchParams()
      if (actionFilter) params.append('action', actionFilter)
      if (moduleFilter) params.append('module', moduleFilter)
      if (userSearch) params.append('user_id', userSearch)
      if (fromDate) params.append('from_date', fromDate)
      if (toDate) params.append('to_date', toDate)
      params.append('page', '1')
      params.append('per_page', '10000')

      const res = await fetch(`${API}/admin/activity-logs?${params}`, {
        headers: getAuthHeaders(),
      })

      if (!res.ok) throw new Error('Failed to fetch logs for export')
      const data = await res.json()
      const items = data.logs || data.items || data.data || []

      if (items.length === 0) {
        alert('No logs to export.')
        return
      }

      const headers = ['Timestamp', 'User', 'Action', 'Module', 'Target', 'IP Address', 'Details']
      const rows = items.map(log => [
        log.timestamp || log.created_at || '',
        log.user_name || log.user || '',
        log.action || '',
        log.module || '',
        log.target || log.resource || '',
        log.ip_address || log.ip || '',
        log.details || '',
      ])

      const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n')

      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Export failed: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  const handleResetFilters = () => {
    setFromDate('')
    setToDate('')
    setActionFilter('')
    setModuleFilter('')
    setUserSearch('')
    setPage(1)
  }

  const toggleRow = (id) => {
    setExpandedRow(prev => (prev === id ? null : id))
  }

  return (
    <div className="admin-tab-content">
      <div className="admin-tab-header">
        <h2>Activity Logs</h2>
        <div className="admin-tab-header-actions">
          <label className="admin-toggle-label">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          {hasPermission('activity_logs', 'export') && (
            <button
              className="admin-btn admin-btn-secondary"
              onClick={handleExportCSV}
              disabled={exporting}
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          )}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="admin-stats-grid">
        <StatCard
          label="Total Actions"
          value={stats?.total_actions ?? totalCount}
          icon="📊"
          color="#3498db"
        />
        <StatCard
          label="Actions Today"
          value={stats?.actions_today ?? '—'}
          icon="📅"
          color="#2ecc71"
        />
        <StatCard
          label="Failed Logins (7d)"
          value={stats?.failed_logins_7d ?? stats?.failed_logins ?? '—'}
          icon="🚫"
          color="#e74c3c"
        />
        <StatCard
          label="System Issues (7d)"
          value={stats?.system_errors ?? '—'}
          icon="⚠️"
          color="#f39c12"
        />
      </div>

      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <div className="admin-filter-group">
          <label>From</label>
          <input
            type="date"
            className="admin-input"
            value={fromDate}
            onChange={e => { setFromDate(e.target.value); setPage(1) }}
          />
        </div>
        <div className="admin-filter-group">
          <label>To</label>
          <input
            type="date"
            className="admin-input"
            value={toDate}
            onChange={e => { setToDate(e.target.value); setPage(1) }}
          />
        </div>
        <div className="admin-filter-group">
          <label>Action</label>
          <select
            className="admin-select"
            value={actionFilter}
            onChange={e => { setActionFilter(e.target.value); setPage(1) }}
          >
            {ACTION_TYPES.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="admin-filter-group">
          <label>Module</label>
          <select
            className="admin-select"
            value={moduleFilter}
            onChange={e => { setModuleFilter(e.target.value); setPage(1) }}
          >
            {MODULE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="admin-filter-group">
          <label>User</label>
          <input
            type="text"
            className="admin-input"
            placeholder="Search user..."
            value={userSearch}
            onChange={e => { setUserSearch(e.target.value); setPage(1) }}
          />
        </div>
        <div className="admin-filter-group admin-filter-actions">
          <button className="admin-btn admin-btn-ghost" onClick={handleResetFilters}>
            Clear Filters
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="admin-error-banner">
          <span>{error}</span>
          <button className="admin-btn admin-btn-sm" onClick={() => fetchLogs(true)}>
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="admin-loading-section">
          <div className="admin-loading-spinner" />
          <p>Loading activity logs...</p>
        </div>
      ) : (
        <>
          {/* Logs Table */}
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Module</th>
                  <th>Target</th>
                  <th>IP Address</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="admin-table-empty">
                      No activity logs found.
                    </td>
                  </tr>
                ) : (
                  logs.map((log, idx) => {
                    const logId = log.id || idx
                    const isExpanded = expandedRow === logId
                    return (
                      <>
                        <tr key={logId} className="admin-table-row-clickable" onClick={() => toggleRow(logId)}>
                          <td className="admin-td-timestamp">
                            {formatTimestamp(log.timestamp || log.created_at)}
                          </td>
                          <td>
                            <div className="admin-user-cell">
                              <div
                                className="admin-avatar-sm"
                                style={{ background: log.user_agent === 'system' ? '#f39c12' : getActionColor(log.action) }}
                              >
                                {log.user_agent === 'system' ? '⚙' : getUserInitials(log.display_name || log.user_name || log.user)}
                              </div>
                              <span>{log.user_agent === 'system' ? (log.display_name || log.email || 'System') : (log.display_name || log.user_name || log.user || 'System')}</span>
                            </div>
                          </td>
                          <td>
                            <span
                              className="admin-badge"
                              style={{
                                background: getActionColor(log.action) + '22',
                                color: getActionColor(log.action),
                                border: `1px solid ${getActionColor(log.action)}44`,
                              }}
                            >
                              {log.action || '—'}
                            </span>
                          </td>
                          <td>{log.module || '—'}</td>
                          <td className="admin-td-target">{log.target || log.resource || '—'}</td>
                          <td className="admin-td-ip">{log.ip_address || log.ip || '—'}</td>
                          <td>
                            <span className="admin-expand-icon">{isExpanded ? '▲' : '▼'}</span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${logId}-details`} className="admin-expanded-row">
                            <td colSpan={7}>
                              <div className="admin-expanded-details">
                                <div className="admin-detail-grid">
                                  <div>
                                    <strong>Full Timestamp:</strong>{' '}
                                    {log.timestamp || log.created_at || '—'}
                                  </div>
                                  <div>
                                    <strong>User ID:</strong> {log.user_id || '—'}
                                  </div>
                                  <div>
                                    <strong>Device:</strong> {log.device || log.user_agent || '—'}
                                  </div>
                                  <div>
                                    <strong>Status:</strong> {log.status || 'success'}
                                  </div>
                                  {log.details && (
                                    <div className="admin-detail-full">
                                      <strong>Details:</strong>
                                      <pre className="admin-detail-pre">
                                        {typeof log.details === 'string'
                                          ? log.details
                                          : JSON.stringify(log.details, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                  {log.changes && (
                                    <div className="admin-detail-full">
                                      <strong>Changes:</strong>
                                      <pre className="admin-detail-pre">
                                        {typeof log.changes === 'string'
                                          ? log.changes
                                          : JSON.stringify(log.changes, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="admin-pagination">
            <span className="admin-pagination-info">
              Page {page} of {totalPages} ({totalCount} total entries)
            </span>
            <div className="admin-pagination-controls">
              <button
                className="admin-btn admin-btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(1)}
              >
                First
              </button>
              <button
                className="admin-btn admin-btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <button
                className="admin-btn admin-btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
              <button
                className="admin-btn admin-btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
              >
                Last
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
