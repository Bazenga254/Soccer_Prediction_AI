import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'
import StatCard from '../components/StatCard'

const PAYMENT_TABS = [
  { key: 'all', label: 'All', icon: '📋' },
  { key: 'mpesa', label: 'M-Pesa', icon: '📱' },
  { key: 'whop', label: 'Whop / Card', icon: '💳' },
  { key: 'other', label: 'Other', icon: '🏦' },
]

export default function SubscriptionsTab() {
  const { getAuthHeaders } = useAdmin()
  const [subscriptions, setSubscriptions] = useState([])
  const [grouped, setGrouped] = useState({ mpesa: [], whop: [], other: [] })
  const [loading, setLoading] = useState(true)
  const [activeMethod, setActiveMethod] = useState('all')

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/subscriptions', { headers: getAuthHeaders() })
      setSubscriptions(res.data.subscriptions || [])
      setGrouped(res.data.grouped || { mpesa: [], whop: [], other: [] })
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchSubscriptions() }, [fetchSubscriptions])

  const handleDowngrade = async (userId) => {
    if (!confirm('Downgrade this user to free tier?')) return
    try {
      await axios.post(`/api/admin/users/${userId}/set-tier`, {
        tier: 'free'
      }, { headers: getAuthHeaders() })
      fetchSubscriptions()
    } catch { alert('Failed to downgrade user') }
  }

  const displayed = activeMethod === 'all'
    ? subscriptions
    : (grouped[activeMethod] || [])

  const activeSubs = subscriptions.filter(s => s.status === 'active')

  if (loading) return <div className="admin-loading">Loading subscriptions...</div>

  return (
    <div className="admin-tab-content">
      <h3 style={{ marginBottom: 4 }}>Subscriptions ({subscriptions.length})</h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        All subscribers grouped by payment method
      </p>

      {/* Summary Stats */}
      <div className="admin-stats-grid">
        <StatCard label="Total" value={subscriptions.length} color="#6c5ce7" />
        <StatCard label="Active" value={activeSubs.length} color="#00b894" />
        <StatCard label="M-Pesa" value={(grouped.mpesa || []).length} color="#2ecc71" />
        <StatCard label="Whop / Card" value={(grouped.whop || []).length} color="#3498db" />
      </div>

      {/* Payment Method Sub-tabs */}
      <div className="tx-subtab-bar">
        {PAYMENT_TABS.map(tab => (
          <button
            key={tab.key}
            className={`tx-subtab-btn ${activeMethod === tab.key ? 'active' : ''}`}
            onClick={() => setActiveMethod(tab.key)}
          >
            <span>{tab.icon}</span>
            {tab.label} ({tab.key === 'all' ? subscriptions.length : (grouped[tab.key] || []).length})
          </button>
        ))}
      </div>

      {/* Subscribers Table */}
      {displayed.length === 0 ? (
        <p className="admin-empty-row">No subscribers found.</p>
      ) : (
        <div className="admin-users-table" style={{ overflowX: 'auto' }}>
          <div className="admin-table-header tx-sub-header">
            <span className="col-avatar"></span>
            <span className="col-name">User</span>
            <span>Plan</span>
            <span>Price</span>
            <span>Method</span>
            <span>Credits</span>
            <span>Status</span>
            <span>Started</span>
            <span>Expires</span>
            <span>Actions</span>
          </div>
          {displayed.map(s => (
            <div key={s.id} className="admin-table-row tx-sub-row">
              <span className="col-avatar">
                <span className="admin-user-avatar" style={{ background: s.avatar_color || '#6c5ce7' }}>
                  {(s.display_name || s.username || '?')[0].toUpperCase()}
                </span>
              </span>
              <span className="col-name">
                <strong>{s.display_name || 'No Name'}</strong>
                <small>@{s.username}</small>
              </span>
              <span>
                <span className="tx-plan-badge">{(s.plan || '').replace(/_/g, ' ')}</span>
              </span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                {s.price_currency === 'KES' ? `KES ${s.price_amount}` : `$${s.price_amount}`}
              </span>
              <span style={{ textTransform: 'capitalize', fontSize: 12 }}>{s.payment_method || '-'}</span>
              <span style={{ fontSize: 12 }}>
                ${(s.balance_usd || 0).toFixed(2)} / KES {Math.round(s.balance_kes || 0)}
              </span>
              <span>
                <span className="tx-status-badge" style={{
                  background: s.status === 'active' ? '#2ecc7120' : '#e74c3c20',
                  color: s.status === 'active' ? '#2ecc71' : '#e74c3c'
                }}>
                  {s.status}
                </span>
              </span>
              <span style={{ fontSize: 11 }}>
                {s.started_at ? new Date(s.started_at).toLocaleDateString() : '-'}
              </span>
              <span style={{ fontSize: 11 }}>
                {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '-'}
                {s.days_remaining > 0 && <small style={{ color: '#00b894' }}> ({s.days_remaining}d)</small>}
              </span>
              <span>
                {s.status === 'active' && (
                  <button className="admin-action-btn downgrade" onClick={() => handleDowngrade(s.user_id)}>
                    Downgrade
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
