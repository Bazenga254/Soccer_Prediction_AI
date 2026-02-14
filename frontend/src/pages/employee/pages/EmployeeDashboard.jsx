import { useState, useEffect, useCallback } from 'react'
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

const ACTION_STYLES = {
  login: { bg: 'rgba(46, 204, 113, 0.15)', color: '#2ecc71' },
  logout: { bg: 'rgba(139, 141, 151, 0.15)', color: '#8b8d97' },
  message_sent: { bg: 'rgba(52, 152, 219, 0.15)', color: '#3498db' },
  chat_closed: { bg: 'rgba(231, 76, 60, 0.15)', color: '#e74c3c' },
  chat_opened: { bg: 'rgba(46, 204, 113, 0.15)', color: '#2ecc71' },
  rating_received: { bg: 'rgba(243, 156, 18, 0.15)', color: '#f39c12' },
  keepalive: { bg: 'rgba(155, 89, 182, 0.15)', color: '#9b59b6' },
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const utcStr = dateStr && !dateStr.endsWith('Z') && !dateStr.includes('+') ? dateStr + 'Z' : dateStr
  const diff = Date.now() - new Date(utcStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function EmployeeDashboard() {
  const { getAuthHeaders, currentUser, roleInfo } = useEmployee()
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await axios.get('/api/employee/dashboard', {
        headers: getAuthHeaders(),
      })
      const data = res.data
      setStats(data.stats || data)
      setActivity(data.recent_activity || [])
      setError(null)
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Session expired. Please log in again.')
      } else {
        setError('Failed to load dashboard data.')
      }
    }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const roleName = roleInfo?.display_name || 'Employee'
  const roleColor = ROLE_COLORS[roleInfo?.name] || '#6c5ce7'
  const department = roleInfo?.department || roleInfo?.name?.replace(/_/g, ' ') || 'General'
  const displayName = currentUser?.display_name || currentUser?.username || 'Employee'

  if (loading) {
    return (
      <div className="emp-loading">
        <div className="emp-loading-spinner"></div>
        Loading dashboard...
      </div>
    )
  }

  return (
    <div className="emp-dashboard">
      {/* Welcome Header */}
      <div className="emp-dashboard-header">
        <div className="emp-welcome-section">
          <h1 className="emp-welcome-title">Welcome back, {displayName}</h1>
          <div className="emp-welcome-meta">
            <span className="emp-role-badge-lg" style={{ background: roleColor }}>
              {roleName}
            </span>
            <span className="emp-department-label">
              {department.charAt(0).toUpperCase() + department.slice(1)}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="emp-error-banner">
          <span>{error}</span>
          <button className="emp-error-retry" onClick={fetchDashboard}>Retry</button>
        </div>
      )}

      {/* Quick Stats Grid */}
      <div className="emp-section">
        <h3 className="emp-section-title">Quick Stats</h3>
        <div className="emp-stats-grid">
          <div className="emp-stat-card" style={{ borderLeftColor: '#3498db' }}>
            <div className="emp-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3498db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div className="emp-stat-content">
              <div className="emp-stat-value">{stats?.messages_sent ?? 0}</div>
              <div className="emp-stat-label">Messages Sent</div>
            </div>
          </div>

          <div className="emp-stat-card" style={{ borderLeftColor: '#2ecc71' }}>
            <div className="emp-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div className="emp-stat-content">
              <div className="emp-stat-value">{stats?.conversations_handled ?? 0}</div>
              <div className="emp-stat-label">Conversations Handled</div>
            </div>
          </div>

          <div className="emp-stat-card" style={{ borderLeftColor: '#f39c12' }}>
            <div className="emp-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f39c12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            <div className="emp-stat-content">
              <div className="emp-stat-value">
                {stats?.avg_rating != null ? Number(stats.avg_rating).toFixed(1) : '--'}
                {stats?.avg_rating != null && <span className="emp-stat-unit">/5</span>}
              </div>
              <div className="emp-stat-label">Avg Rating</div>
            </div>
          </div>

          <div className="emp-stat-card" style={{ borderLeftColor: '#9b59b6' }}>
            <div className="emp-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9b59b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div className="emp-stat-content">
              <div className="emp-stat-value">{stats?.recent_logins ?? 0}</div>
              <div className="emp-stat-label">Recent Logins</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="emp-section">
        <h3 className="emp-section-title">Recent Activity</h3>
        <div className="emp-activity-feed">
          {activity.length === 0 ? (
            <div className="emp-empty-state">
              <p>No recent activity to display.</p>
            </div>
          ) : (
            activity.slice(0, 10).map((item, idx) => {
              const actionStyle = ACTION_STYLES[item.action] || ACTION_STYLES.login
              return (
                <div key={item.id || idx} className="emp-activity-item">
                  <div className="emp-activity-dot" style={{ background: actionStyle.color }}></div>
                  <div className="emp-activity-content">
                    <div className="emp-activity-top">
                      <span
                        className="emp-activity-action"
                        style={{ background: actionStyle.bg, color: actionStyle.color }}
                      >
                        {(item.action || 'action').replace(/_/g, ' ')}
                      </span>
                      <span className="emp-activity-time">{timeAgo(item.created_at || item.timestamp)}</span>
                    </div>
                    <p className="emp-activity-description">
                      {item.description || item.details || item.action}
                    </p>
                    {item.target_user && (
                      <span className="emp-activity-target">User: {item.target_user}</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <style>{`
        .emp-dashboard {
          padding: 0;
        }

        .emp-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          color: #8b8d97;
          font-size: 14px;
          gap: 12px;
        }

        .emp-loading-spinner {
          width: 36px;
          height: 36px;
          border: 3px solid #2a2d38;
          border-top-color: #6c5ce7;
          border-radius: 50%;
          animation: emp-spin 0.8s linear infinite;
        }

        @keyframes emp-spin {
          to { transform: rotate(360deg); }
        }

        /* Header */
        .emp-dashboard-header {
          margin-bottom: 28px;
        }

        .emp-welcome-title {
          font-size: 24px;
          font-weight: 700;
          color: #e4e4e7;
          margin: 0 0 10px 0;
        }

        .emp-welcome-meta {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .emp-role-badge-lg {
          display: inline-block;
          padding: 4px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          color: #fff;
          letter-spacing: 0.3px;
        }

        .emp-department-label {
          font-size: 13px;
          color: #8b8d97;
          padding: 4px 12px;
          background: rgba(139, 141, 151, 0.1);
          border-radius: 20px;
        }

        /* Error */
        .emp-error-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: rgba(231, 76, 60, 0.1);
          border: 1px solid rgba(231, 76, 60, 0.3);
          border-radius: 8px;
          color: #e74c3c;
          font-size: 13px;
          margin-bottom: 20px;
        }

        .emp-error-retry {
          padding: 4px 12px;
          background: rgba(231, 76, 60, 0.2);
          border: 1px solid rgba(231, 76, 60, 0.3);
          border-radius: 6px;
          color: #e74c3c;
          font-size: 12px;
          cursor: pointer;
          transition: background 0.15s;
        }

        .emp-error-retry:hover {
          background: rgba(231, 76, 60, 0.3);
        }

        /* Section */
        .emp-section {
          margin-bottom: 28px;
        }

        .emp-section-title {
          font-size: 15px;
          font-weight: 600;
          color: #e4e4e7;
          margin: 0 0 14px 0;
          letter-spacing: 0.2px;
        }

        /* Stats Grid */
        .emp-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 14px;
        }

        .emp-stat-card {
          background: #1a1d26;
          border: 1px solid #2a2d38;
          border-left: 3px solid #6c5ce7;
          border-radius: 10px;
          padding: 18px 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          transition: background 0.15s, transform 0.15s;
        }

        .emp-stat-card:hover {
          background: #22252f;
          transform: translateY(-1px);
        }

        .emp-stat-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(108, 92, 231, 0.08);
          border-radius: 10px;
          flex-shrink: 0;
        }

        .emp-stat-content {
          flex: 1;
          min-width: 0;
        }

        .emp-stat-value {
          font-size: 22px;
          font-weight: 700;
          color: #e4e4e7;
          line-height: 1.2;
        }

        .emp-stat-unit {
          font-size: 13px;
          font-weight: 400;
          color: #8b8d97;
          margin-left: 2px;
        }

        .emp-stat-label {
          font-size: 12px;
          color: #8b8d97;
          margin-top: 2px;
        }

        /* Activity Feed */
        .emp-activity-feed {
          background: #1a1d26;
          border: 1px solid #2a2d38;
          border-radius: 10px;
          overflow: hidden;
        }

        .emp-activity-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid #2a2d38;
          transition: background 0.15s;
        }

        .emp-activity-item:last-child {
          border-bottom: none;
        }

        .emp-activity-item:hover {
          background: #22252f;
        }

        .emp-activity-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-top: 6px;
          flex-shrink: 0;
        }

        .emp-activity-content {
          flex: 1;
          min-width: 0;
        }

        .emp-activity-top {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 4px;
        }

        .emp-activity-action {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: capitalize;
          white-space: nowrap;
        }

        .emp-activity-time {
          font-size: 11px;
          color: #8b8d97;
          margin-left: auto;
          white-space: nowrap;
        }

        .emp-activity-description {
          font-size: 13px;
          color: #e4e4e7;
          margin: 0;
          line-height: 1.4;
          word-break: break-word;
        }

        .emp-activity-target {
          display: inline-block;
          font-size: 11px;
          color: #8b8d97;
          margin-top: 4px;
        }

        .emp-empty-state {
          padding: 32px 16px;
          text-align: center;
          color: #8b8d97;
          font-size: 13px;
        }

        .emp-empty-state p {
          margin: 0;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .emp-stats-grid {
            grid-template-columns: 1fr 1fr;
          }

          .emp-welcome-title {
            font-size: 20px;
          }

          .emp-stat-card {
            padding: 14px 12px;
          }

          .emp-stat-value {
            font-size: 18px;
          }
        }

        @media (max-width: 480px) {
          .emp-stats-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
