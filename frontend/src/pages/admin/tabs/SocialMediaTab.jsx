import { useState, useEffect, useCallback } from 'react'
import { useAdmin } from '../context/AdminContext'
import SocialInbox from './social/SocialInbox'
import SocialCompose from './social/SocialCompose'
import SocialAccounts from './social/SocialAccounts'

const SOCIAL_VIEWS = [
  { key: 'inbox', label: 'Inbox', icon: '\u{1F4E5}' },
  { key: 'compose', label: 'Compose', icon: '\u{270F}\u{FE0F}' },
  { key: 'accounts', label: 'Accounts', icon: '\u{1F517}' },
]

export default function SocialMediaTab() {
  const { getAuthHeaders } = useAdmin()
  const [activeView, setActiveView] = useState('inbox')
  const [accounts, setAccounts] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/social/accounts', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setAccounts(data.accounts || [])
      }
    } catch {}
    setLoading(false)
  }, [getAuthHeaders])

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/social/analytics', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setAnalytics(data)
      }
    } catch {}
  }, [getAuthHeaders])

  useEffect(() => {
    fetchAccounts()
    fetchAnalytics()
  }, [fetchAccounts, fetchAnalytics])

  const connectedCount = accounts.filter(a => a.status === 'connected').length

  const renderView = () => {
    switch (activeView) {
      case 'inbox': return <SocialInbox accounts={accounts} />
      case 'compose': return <SocialCompose accounts={accounts} />
      case 'accounts': return <SocialAccounts accounts={accounts} onRefresh={fetchAccounts} />
      default: return <SocialInbox accounts={accounts} />
    }
  }

  return (
    <div className="admin-tab-content">
      <div className="social-header">
        <div>
          <h3 style={{ marginBottom: 4 }}>Social Media Hub</h3>
          <p style={{ color: 'var(--admin-text-muted)', fontSize: 13, marginTop: 0 }}>
            Manage conversations and content across all platforms
            {connectedCount > 0 && (
              <span className="social-connected-badge">{connectedCount} connected</span>
            )}
          </p>
        </div>
        {analytics && (
          <div className="social-stats-row">
            <div className="social-stat-mini">
              <span className="social-stat-value">{analytics.total_conversations || 0}</span>
              <span className="social-stat-label">Chats</span>
            </div>
            <div className="social-stat-mini">
              <span className="social-stat-value">{analytics.total_unread || 0}</span>
              <span className="social-stat-label">Unread</span>
            </div>
            <div className="social-stat-mini">
              <span className="social-stat-value">{analytics.total_messages || 0}</span>
              <span className="social-stat-label">Messages</span>
            </div>
          </div>
        )}
      </div>

      <div className="social-nav-bar">
        {SOCIAL_VIEWS.map(view => (
          <button
            key={view.key}
            className={`social-nav-btn ${activeView === view.key ? 'active' : ''}`}
            onClick={() => setActiveView(view.key)}
          >
            <span>{view.icon}</span> {view.label}
            {view.key === 'inbox' && analytics?.total_unread > 0 && (
              <span className="social-nav-badge">{analytics.total_unread}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="admin-loading">Loading Social Media Hub...</div>
      ) : (
        renderView()
      )}
    </div>
  )
}
