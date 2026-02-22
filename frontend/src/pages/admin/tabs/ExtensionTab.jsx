import { useState, useEffect } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'

export default function ExtensionTab() {
  const { getAuthHeaders } = useAdmin()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    fetchData()
  }, [days])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await axios.get(`/api/admin/extension-analytics?days=${days}`, {
        headers: getAuthHeaders(),
      })
      setData(res.data)
    } catch (err) {
      console.error('Failed to load extension analytics:', err)
    }
    setLoading(false)
  }

  if (loading) return <div className="admin-tab-loading">Loading extension analytics...</div>
  if (!data) return <div className="admin-tab-empty">Failed to load data</div>

  return (
    <div className="admin-tab-content">
      <div className="admin-tab-header">
        <h2>Chrome Extension Analytics</h2>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="admin-select"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Stats Cards */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-value">{data.total_extension_users}</div>
          <div className="admin-stat-label">Extension Users</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{data.extension_predictions}</div>
          <div className="admin-stat-label">Extension Predictions</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{data.total_events}</div>
          <div className="admin-stat-label">Total Events</div>
        </div>
      </div>

      {/* Events by Action */}
      <div className="admin-section">
        <h3>Events by Type</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {(data.by_action || []).map((a, i) => (
                <tr key={i}>
                  <td>
                    <span className="admin-badge" style={{
                      background: a.action.includes('login') ? 'rgba(59,130,246,0.15)' :
                        a.action === 'prediction' ? 'rgba(34,197,94,0.15)' :
                        'rgba(148,163,184,0.1)',
                      color: a.action.includes('login') ? '#60a5fa' :
                        a.action === 'prediction' ? '#4ade80' : '#94a3b8'
                    }}>
                      {a.action}
                    </span>
                  </td>
                  <td>{a.cnt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Activity */}
      {data.daily && data.daily.length > 0 && (
        <div className="admin-section">
          <h3>Daily Activity</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Users</th>
                  <th>Events</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d, i) => (
                  <tr key={i}>
                    <td>{d.day}</td>
                    <td>{d.users}</td>
                    <td>{d.events}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Users */}
      {data.top_users && data.top_users.length > 0 && (
        <div className="admin-section">
          <h3>Top Extension Users</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Events</th>
                  <th>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {data.top_users.map((u, i) => (
                  <tr key={i}>
                    <td>{u.display_name || u.username}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{u.email}</td>
                    <td>{u.event_count}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>
                      {u.last_active ? new Date(u.last_active).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
