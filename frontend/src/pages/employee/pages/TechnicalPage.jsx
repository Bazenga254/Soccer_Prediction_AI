import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useEmployee } from '../context/EmployeeContext'

function formatBytes(mb) {
  if (mb == null) return '-'
  return `${Number(mb).toFixed(2)} MB`
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('en-KE', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/* ─── System Health Tab ────────────────────────────────────────── */
function SystemHealthTab({ getAuthHeaders }) {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)
  const intervalRef = useRef(null)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await axios.get('/api/employee/technical/health', {
        headers: getAuthHeaders(),
      })
      setHealth(res.data)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load health data')
    }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => {
    fetchHealth()
    intervalRef.current = setInterval(fetchHealth, 30000)
    return () => clearInterval(intervalRef.current)
  }, [fetchHealth])

  return (
    <div className="emp-tab-content">
      {error && <div className="emp-alert emp-alert-error">{error}</div>}

      <div className="emp-toolbar">
        <div className="emp-refresh-info">
          {lastRefresh && (
            <span className="emp-text-muted">
              Last refreshed: {lastRefresh.toLocaleTimeString()} (auto-refresh: 30s)
            </span>
          )}
        </div>
        <button className="emp-btn emp-btn-secondary" onClick={fetchHealth} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Now'}
        </button>
      </div>

      {loading && !health ? (
        <div className="emp-loading">Loading system health...</div>
      ) : health ? (
        <>
          <h4 className="emp-section-title">Database File Sizes</h4>
          <div className="emp-stats-grid">
            {health.db_sizes && Object.entries(health.db_sizes).map(([name, sizeMb]) => (
              <div key={name} className="emp-stat-card">
                <div className="emp-stat-label">{name}</div>
                <div className="emp-stat-value emp-text-blue">{formatBytes(sizeMb)}</div>
              </div>
            ))}
          </div>

          <h4 className="emp-section-title">User Counts</h4>
          <div className="emp-stats-grid">
            <div className="emp-stat-card">
              <div className="emp-stat-label">Total Users</div>
              <div className="emp-stat-value emp-text-purple">{health.total_users ?? '-'}</div>
            </div>
            <div className="emp-stat-card">
              <div className="emp-stat-label">Active Users</div>
              <div className="emp-stat-value emp-text-green">{health.active_users ?? '-'}</div>
            </div>
            <div className="emp-stat-card">
              <div className="emp-stat-label">Staff Count</div>
              <div className="emp-stat-value emp-text-orange">{health.staff_count ?? '-'}</div>
            </div>
            <div className="emp-stat-card">
              <div className="emp-stat-label">Pro Users</div>
              <div className="emp-stat-value emp-text-yellow">{health.pro_users ?? '-'}</div>
            </div>
          </div>

          <h4 className="emp-section-title">Community Stats</h4>
          <div className="emp-stats-grid">
            <div className="emp-stat-card">
              <div className="emp-stat-label">Total Predictions</div>
              <div className="emp-stat-value emp-text-blue">{health.total_predictions ?? '-'}</div>
            </div>
            <div className="emp-stat-card">
              <div className="emp-stat-label">Notifications</div>
              <div className="emp-stat-value emp-text-cyan">{health.notifications ?? '-'}</div>
            </div>
            <div className="emp-stat-card">
              <div className="emp-stat-label">Active Conversations</div>
              <div className="emp-stat-value emp-text-green">{health.active_conversations ?? '-'}</div>
            </div>
          </div>
        </>
      ) : (
        <div className="emp-empty">No health data available</div>
      )}
    </div>
  )
}

/* ─── API Stats Tab ────────────────────────────────────────────── */
function ApiStatsTab({ getAuthHeaders }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await axios.get('/api/employee/technical/api-stats', {
        headers: getAuthHeaders(),
      })
      setStats(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load API stats')
    }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchStats() }, [fetchStats])

  const CACHE_TTLS = [
    { endpoint: 'Today\'s Fixtures', ttl: '2 minutes', color: '#3498db' },
    { endpoint: 'Live Matches', ttl: '30 seconds', color: '#2ecc71' },
    { endpoint: 'Injuries', ttl: '12 hours', color: '#e67e22' },
    { endpoint: 'Coach Data', ttl: '24 hours', color: '#9b59b6' },
  ]

  const dailyLimit = stats?.daily_limit ?? 100
  const dailyUsed = stats?.daily_used ?? 0
  const usagePercent = dailyLimit > 0 ? Math.min((dailyUsed / dailyLimit) * 100, 100) : 0
  const usageColor = usagePercent > 80 ? '#e74c3c' : usagePercent > 50 ? '#f39c12' : '#2ecc71'

  return (
    <div className="emp-tab-content">
      {error && <div className="emp-alert emp-alert-error">{error}</div>}

      <div className="emp-toolbar">
        <span className="emp-text-muted">API-Football (v3) usage and cache configuration</span>
        <button className="emp-btn emp-btn-secondary" onClick={fetchStats} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {loading && !stats ? (
        <div className="emp-loading">Loading API stats...</div>
      ) : (
        <>
          <div className="emp-api-usage-card">
            <h4 className="emp-section-title">Daily API Usage</h4>
            <div className="emp-usage-info">
              <span className="emp-usage-count">
                <strong style={{ color: usageColor }}>{dailyUsed}</strong> / {dailyLimit} requests
              </span>
            </div>
            <div className="emp-progress-bar">
              <div
                className="emp-progress-fill"
                style={{ width: `${usagePercent}%`, background: usageColor }}
              />
            </div>
            <div className="emp-usage-meta">
              <span className="emp-text-muted">{usagePercent.toFixed(1)}% consumed</span>
              <span className="emp-text-muted">{dailyLimit - dailyUsed} remaining</span>
            </div>
          </div>

          <h4 className="emp-section-title">Cache TTL Configuration</h4>
          <div className="emp-cache-grid">
            {CACHE_TTLS.map(item => (
              <div key={item.endpoint} className="emp-cache-card">
                <div className="emp-cache-endpoint">{item.endpoint}</div>
                <div className="emp-cache-ttl" style={{ color: item.color }}>
                  {item.ttl}
                </div>
              </div>
            ))}
          </div>

          {stats?.additional_info && (
            <>
              <h4 className="emp-section-title">Additional Information</h4>
              <div className="emp-info-card">
                {Object.entries(stats.additional_info).map(([key, value]) => (
                  <div key={key} className="emp-info-row">
                    <span className="emp-info-key">{key.replace(/_/g, ' ')}</span>
                    <span className="emp-info-value">{String(value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

/* ─── Error Logs Tab ───────────────────────────────────────────── */
function ErrorLogsTab({ getAuthHeaders }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [limit, setLimit] = useState(25)
  const [expandedId, setExpandedId] = useState(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await axios.get('/api/employee/technical/errors', {
        headers: getAuthHeaders(), params: { limit },
      })
      setLogs(res.data.errors || res.data || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load error logs')
    }
    setLoading(false)
  }, [getAuthHeaders, limit])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const truncateDetails = (text, maxLen = 80) => {
    if (!text) return '-'
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text
  }

  return (
    <div className="emp-tab-content">
      {error && <div className="emp-alert emp-alert-error">{error}</div>}

      <div className="emp-toolbar">
        <div className="emp-filter-group">
          <span className="emp-text-muted" style={{ alignSelf: 'center', marginRight: 8 }}>Show:</span>
          {[25, 50, 100].map(l => (
            <button
              key={l}
              className={`emp-filter-btn ${limit === l ? 'active' : ''}`}
              onClick={() => setLimit(l)}
            >
              {l}
            </button>
          ))}
        </div>
        <button className="emp-btn emp-btn-secondary" onClick={fetchLogs} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="emp-table-wrapper">
        {loading ? (
          <div className="emp-loading">Loading error logs...</div>
        ) : logs.length === 0 ? (
          <div className="emp-empty">No error logs found</div>
        ) : (
          <table className="emp-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Module</th>
                <th>Details</th>
                <th>IP Address</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, idx) => {
                const logKey = log.id || idx
                const isExpanded = expandedId === logKey
                return (
                  <tr key={logKey}>
                    <td>
                      <span className="emp-badge emp-badge-error-action">{log.action || '-'}</span>
                    </td>
                    <td className="emp-mono">{log.module || '-'}</td>
                    <td
                      className="emp-log-details"
                      onClick={() => setExpandedId(isExpanded ? null : logKey)}
                      title={log.details || ''}
                      style={{ cursor: log.details?.length > 80 ? 'pointer' : 'default' }}
                    >
                      {isExpanded ? log.details : truncateDetails(log.details)}
                    </td>
                    <td className="emp-mono">{log.ip_address || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(log.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ─── Content Moderation Tab ───────────────────────────────────── */
function ContentModerationTab({ getAuthHeaders }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await axios.get('/api/employee/technical/moderation', {
        headers: getAuthHeaders(),
      })
      setItems(res.data.predictions || res.data || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load moderation items')
    }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchItems() }, [fetchItems])

  const moderate = async (id, action) => {
    setError('')
    setSuccess('')
    try {
      await axios.post(`/api/employee/technical/moderate/${id}`, { action }, {
        headers: getAuthHeaders(),
      })
      setSuccess(`Prediction ${action === 'hide' ? 'hidden' : 'removed'} successfully`)
      fetchItems()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to moderate content')
    }
  }

  return (
    <div className="emp-tab-content">
      {error && <div className="emp-alert emp-alert-error">{error}</div>}
      {success && <div className="emp-alert emp-alert-success">{success}</div>}

      <div className="emp-toolbar">
        <span className="emp-text-muted">Community predictions moderation</span>
        <button className="emp-btn emp-btn-secondary" onClick={fetchItems} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="emp-table-wrapper">
        {loading ? (
          <div className="emp-loading">Loading predictions...</div>
        ) : items.length === 0 ? (
          <div className="emp-empty">No predictions to moderate</div>
        ) : (
          <table className="emp-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Teams</th>
                <th>Predicted Result</th>
                <th>Visibility</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td>
                    <span className="emp-username-cell">{item.username || '-'}</span>
                  </td>
                  <td>{item.teams || `${item.home_team || '?'} vs ${item.away_team || '?'}`}</td>
                  <td>
                    <span className="emp-badge emp-badge-neutral">
                      {item.predicted_result || '-'}
                    </span>
                  </td>
                  <td>
                    <span className={`emp-badge ${
                      item.visibility === 'public' ? 'emp-badge-vis-public' :
                      item.visibility === 'hidden' ? 'emp-badge-vis-hidden' :
                      'emp-badge-neutral'
                    }`}>
                      {item.visibility || 'public'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(item.created_at)}</td>
                  <td className="emp-actions">
                    <button
                      className="emp-btn emp-btn-sm emp-btn-warn"
                      onClick={() => moderate(item.id, 'hide')}
                    >
                      Hide
                    </button>
                    <button
                      className="emp-btn emp-btn-sm emp-btn-danger"
                      onClick={() => moderate(item.id, 'remove')}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ─── Main Technical Page ──────────────────────────────────────── */
const TECHNICAL_TABS = [
  { id: 'health', label: 'System Health' },
  { id: 'api', label: 'API Stats' },
  { id: 'errors', label: 'Error Logs' },
  { id: 'moderation', label: 'Content Moderation' },
]

export default function TechnicalPage() {
  const { getAuthHeaders } = useEmployee()
  const [activeTab, setActiveTab] = useState('health')

  return (
    <div className="emp-page">
      <div className="emp-page-header">
        <h2 className="emp-page-title">Technical Operations</h2>
      </div>

      <div className="emp-sub-tabs">
        {TECHNICAL_TABS.map(tab => (
          <button
            key={tab.id}
            className={`emp-sub-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'health' && <SystemHealthTab getAuthHeaders={getAuthHeaders} />}
      {activeTab === 'api' && <ApiStatsTab getAuthHeaders={getAuthHeaders} />}
      {activeTab === 'errors' && <ErrorLogsTab getAuthHeaders={getAuthHeaders} />}
      {activeTab === 'moderation' && <ContentModerationTab getAuthHeaders={getAuthHeaders} />}

      <style>{`
        /* ─── Technical Page Inline Styles (Dark Theme) ─── */
        .emp-page {
          padding: 24px;
          color: #e0e0e0;
          min-height: 100%;
        }
        .emp-page-header {
          margin-bottom: 20px;
        }
        .emp-page-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }

        /* Sub-tabs */
        .emp-sub-tabs {
          display: flex;
          gap: 4px;
          background: #1a1d23;
          border-radius: 10px;
          padding: 4px;
          margin-bottom: 20px;
          width: fit-content;
        }
        .emp-sub-tab {
          padding: 8px 20px;
          border: none;
          background: transparent;
          color: #8b8fa3;
          cursor: pointer;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.2s;
        }
        .emp-sub-tab:hover {
          color: #c0c4d6;
          background: rgba(255,255,255,0.05);
        }
        .emp-sub-tab.active {
          background: #2d313a;
          color: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }

        /* Section Titles */
        .emp-section-title {
          font-size: 1rem;
          font-weight: 600;
          color: #c0c4d6;
          margin: 20px 0 12px 0;
        }
        .emp-section-title:first-of-type {
          margin-top: 0;
        }

        /* Toolbar */
        .emp-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
        }
        .emp-filter-group {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          align-items: center;
        }
        .emp-filter-btn {
          padding: 6px 14px;
          border: 1px solid #2d313a;
          background: #1a1d23;
          color: #8b8fa3;
          cursor: pointer;
          border-radius: 6px;
          font-size: 0.82rem;
          transition: all 0.2s;
        }
        .emp-filter-btn:hover {
          border-color: #3a3f4b;
          color: #c0c4d6;
        }
        .emp-filter-btn.active {
          background: #6c5ce7;
          border-color: #6c5ce7;
          color: #ffffff;
        }

        /* Buttons */
        .emp-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .emp-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .emp-btn-primary {
          background: #6c5ce7;
          color: #fff;
        }
        .emp-btn-primary:hover:not(:disabled) {
          background: #5b4bd5;
        }
        .emp-btn-secondary {
          background: #2d313a;
          color: #c0c4d6;
        }
        .emp-btn-secondary:hover:not(:disabled) {
          background: #3a3f4b;
        }
        .emp-btn-sm {
          padding: 4px 10px;
          font-size: 0.78rem;
        }
        .emp-btn-danger {
          background: #e74c3c;
          color: #fff;
        }
        .emp-btn-danger:hover {
          background: #c0392b;
        }
        .emp-btn-warn {
          background: #f39c12;
          color: #fff;
        }
        .emp-btn-warn:hover {
          background: #e67e22;
        }

        /* Alerts */
        .emp-alert {
          padding: 10px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 0.88rem;
        }
        .emp-alert-error {
          background: rgba(231, 76, 60, 0.15);
          border: 1px solid rgba(231, 76, 60, 0.3);
          color: #e74c3c;
        }
        .emp-alert-success {
          background: rgba(46, 204, 113, 0.15);
          border: 1px solid rgba(46, 204, 113, 0.3);
          color: #2ecc71;
        }

        /* Table */
        .emp-table-wrapper {
          overflow-x: auto;
          border-radius: 10px;
          border: 1px solid #2d313a;
          background: #1a1d23;
        }
        .emp-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }
        .emp-table th {
          padding: 12px 14px;
          text-align: left;
          background: #12141a;
          color: #8b8fa3;
          font-weight: 600;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #2d313a;
          white-space: nowrap;
        }
        .emp-table td {
          padding: 10px 14px;
          border-bottom: 1px solid rgba(45, 49, 58, 0.5);
          color: #c0c4d6;
        }
        .emp-table tbody tr:hover {
          background: rgba(108, 92, 231, 0.05);
        }
        .emp-table tbody tr:last-child td {
          border-bottom: none;
        }
        .emp-mono {
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 0.82rem;
          color: #8b8fa3;
        }
        .emp-actions {
          display: flex;
          gap: 6px;
          white-space: nowrap;
        }

        /* Badges */
        .emp-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: capitalize;
        }
        .emp-badge-neutral {
          background: #2d313a;
          color: #c0c4d6;
        }
        .emp-badge-error-action {
          background: rgba(231, 76, 60, 0.2);
          color: #e74c3c;
        }
        .emp-badge-vis-public {
          background: rgba(46, 204, 113, 0.2);
          color: #2ecc71;
        }
        .emp-badge-vis-hidden {
          background: rgba(243, 156, 18, 0.2);
          color: #f39c12;
        }

        /* Loading / Empty */
        .emp-loading,
        .emp-empty {
          text-align: center;
          padding: 40px 20px;
          color: #8b8fa3;
          font-size: 0.92rem;
        }

        /* Stats Grid */
        .emp-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 14px;
          margin-bottom: 8px;
        }
        .emp-stat-card {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 18px;
          text-align: center;
        }
        .emp-stat-label {
          font-size: 0.8rem;
          color: #8b8fa3;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
        .emp-stat-value {
          font-size: 1.3rem;
          font-weight: 700;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
        }
        .emp-text-blue { color: #3498db; }
        .emp-text-green { color: #2ecc71; }
        .emp-text-orange { color: #e67e22; }
        .emp-text-yellow { color: #f39c12; }
        .emp-text-purple { color: #9b59b6; }
        .emp-text-cyan { color: #00cec9; }
        .emp-text-muted { color: #8b8fa3; font-size: 0.85rem; }

        /* API Usage Card */
        .emp-api-usage-card {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 24px;
        }
        .emp-usage-info {
          margin-bottom: 12px;
        }
        .emp-usage-count {
          font-size: 1.1rem;
          color: #c0c4d6;
        }
        .emp-usage-count strong {
          font-size: 1.4rem;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
        }
        .emp-progress-bar {
          width: 100%;
          height: 10px;
          background: #12141a;
          border-radius: 5px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        .emp-progress-fill {
          height: 100%;
          border-radius: 5px;
          transition: width 0.5s ease;
        }
        .emp-usage-meta {
          display: flex;
          justify-content: space-between;
        }

        /* Cache Grid */
        .emp-cache-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 14px;
          margin-bottom: 24px;
        }
        .emp-cache-card {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 16px;
          text-align: center;
        }
        .emp-cache-endpoint {
          font-size: 0.85rem;
          color: #8b8fa3;
          margin-bottom: 6px;
        }
        .emp-cache-ttl {
          font-size: 1.1rem;
          font-weight: 700;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
        }

        /* Info Card */
        .emp-info-card {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 16px;
        }
        .emp-info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          border-bottom: 1px solid rgba(45, 49, 58, 0.5);
        }
        .emp-info-row:last-child {
          border-bottom: none;
        }
        .emp-info-key {
          color: #8b8fa3;
          text-transform: capitalize;
          font-size: 0.85rem;
        }
        .emp-info-value {
          color: #e0e0e0;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 0.85rem;
        }

        /* Log details */
        .emp-log-details {
          max-width: 300px;
          word-break: break-word;
          font-size: 0.82rem;
          line-height: 1.4;
        }

        /* Username cell */
        .emp-username-cell {
          font-weight: 600;
          color: #6c5ce7;
        }

        .emp-refresh-info {
          display: flex;
          align-items: center;
        }

        .emp-tab-content {
          animation: empFadeIn 0.2s ease;
        }
        @keyframes empFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
