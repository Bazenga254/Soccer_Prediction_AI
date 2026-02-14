import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'
import StatCard from '../components/StatCard'

export default function SettingsTab() {
  const { getAuthHeaders } = useAdmin()
  const [apiStatus, setApiStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/dashboard-stats', { headers: getAuthHeaders() })
      setApiStatus(res.data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const handleCleanupLogs = async () => {
    try {
      const res = await axios.post('/api/admin/activity-logs/cleanup', {
        retention_days: 90
      }, { headers: getAuthHeaders() })
      setActionMsg(`Cleaned up ${res.data.deleted || 0} old log entries`)
      setTimeout(() => setActionMsg(''), 3000)
    } catch {
      setActionMsg('Failed to clean up logs')
      setTimeout(() => setActionMsg(''), 3000)
    }
  }

  if (loading) return <div className="admin-loading">Loading settings...</div>

  return (
    <div className="admin-tab-content">
      <h3>System Settings</h3>

      {actionMsg && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16,
          background: actionMsg.includes('Failed') ? 'rgba(231,76,60,0.15)' : 'rgba(46,204,113,0.15)',
          color: actionMsg.includes('Failed') ? '#e74c3c' : '#2ecc71',
          border: `1px solid ${actionMsg.includes('Failed') ? 'rgba(231,76,60,0.3)' : 'rgba(46,204,113,0.3)'}`,
        }}>
          {actionMsg}
        </div>
      )}

      <div className="admin-settings-section">
        <h4>Platform Overview</h4>
        <div className="admin-stats-grid">
          <StatCard label="Total Users" value={apiStatus?.users?.total_users || 0} color="#6c5ce7" />
          <StatCard label="Pro Users" value={apiStatus?.users?.pro_users || 0} color="#fdcb6e" />
          <StatCard label="Active Subs" value={apiStatus?.subscriptions?.active || 0} color="#00b894" />
          <StatCard label="New Today" value={apiStatus?.users?.new_today || 0} color="#55efc4" />
        </div>
      </div>

      <div className="admin-settings-section">
        <h4>API Configuration</h4>
        <div className="admin-settings-card">
          <div className="admin-settings-row">
            <span>API-Football (api-sports.io)</span>
            <span className="admin-settings-value">
              <span className="status-dot active"></span>
              Free Tier - 100 requests/day
            </span>
          </div>
          <div className="admin-settings-row">
            <span>The Odds API</span>
            <span className="admin-settings-value">
              <span className="status-dot active"></span>
              Connected
            </span>
          </div>
          <div className="admin-settings-row">
            <span>Database</span>
            <span className="admin-settings-value">
              <span className="status-dot active"></span>
              SQLite (Local)
            </span>
          </div>
        </div>
      </div>

      <div className="admin-settings-section">
        <h4>Cache Configuration</h4>
        <div className="admin-settings-card">
          <div className="admin-settings-row">
            <span>Today Fixtures</span>
            <span className="admin-settings-value">2 minutes</span>
          </div>
          <div className="admin-settings-row">
            <span>Live Matches</span>
            <span className="admin-settings-value">30 seconds</span>
          </div>
          <div className="admin-settings-row">
            <span>Injuries Data</span>
            <span className="admin-settings-value">12 hours</span>
          </div>
          <div className="admin-settings-row">
            <span>Coach Data</span>
            <span className="admin-settings-value">24 hours</span>
          </div>
          <div className="admin-settings-row">
            <span>Standings</span>
            <span className="admin-settings-value">6 hours</span>
          </div>
        </div>
      </div>

      <div className="admin-settings-section">
        <h4>Maintenance</h4>
        <div className="admin-settings-card">
          <div className="admin-settings-row">
            <div>
              <span>Clean Up Activity Logs</span>
              <small style={{ display: 'block', color: '#94a3b8', fontSize: 12 }}>
                Remove activity logs older than 90 days
              </small>
            </div>
            <button className="admin-action-btn suspend" onClick={handleCleanupLogs}>
              Run Cleanup
            </button>
          </div>
        </div>
      </div>

      <div className="admin-settings-section">
        <h4>Subscription Plans</h4>
        <div className="admin-settings-card">
          <div className="admin-settings-row">
            <span>Free Tier</span>
            <span className="admin-settings-value">3 analyses/day, basic predictions</span>
          </div>
          <div className="admin-settings-row">
            <span>Pro Weekly</span>
            <span className="admin-settings-value">$2.99 / KES 450</span>
          </div>
          <div className="admin-settings-row">
            <span>Pro Monthly</span>
            <span className="admin-settings-value">$7.99 / KES 1,200</span>
          </div>
          <div className="admin-settings-row">
            <span>Pro 3-Month</span>
            <span className="admin-settings-value">$19.99 / KES 3,000</span>
          </div>
        </div>
      </div>
    </div>
  )
}
