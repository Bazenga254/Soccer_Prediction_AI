import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'
import StatCard from '../components/StatCard'

const SECTIONS = [
  { key: 'payg', label: 'Pay on the Go', icon: '💰' },
  { key: 'weekly', label: 'Weekly', icon: '📅' },
  { key: 'monthly', label: 'Monthly', icon: '📆' },
]

export default function SubscriptionsTab() {
  const { getAuthHeaders } = useAdmin()
  const [data, setData] = useState({ pay_on_the_go: [], weekly: [], monthly: [], stats: {} })
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('payg')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/subscriptions', { headers: getAuthHeaders() })
      setData(res.data || { pay_on_the_go: [], weekly: [], monthly: [], stats: {} })
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDowngrade = async (userId) => {
    if (!confirm('Downgrade this user to free tier?')) return
    try {
      await axios.post(`/api/admin/users/${userId}/set-tier`, {
        tier: 'free'
      }, { headers: getAuthHeaders() })
      fetchData()
    } catch { alert('Failed to downgrade user') }
  }

  const stats = data.stats || {}

  const formatPhone = (phone) => {
    if (!phone) return '-'
    if (phone.startsWith('254') && phone.length >= 12) {
      return `+${phone.slice(0,3)} ${phone.slice(3,6)} ${phone.slice(6)}`
    }
    return phone
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleDateString()
  }

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) return <div className="admin-loading">Loading subscriptions...</div>

  return (
    <div className="admin-tab-content">
      <h3 style={{ marginBottom: 4 }}>Subscriptions & Payments</h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        All client payments grouped by type
      </p>

      {/* Summary Stats */}
      <div className="admin-stats-grid">
        <StatCard label="Pay on the Go" value={stats.total_topups || 0} color="#00b894" />
        <StatCard label="Weekly Subs" value={stats.weekly_count || 0} color="#6c5ce7" />
        <StatCard label="Monthly Subs" value={stats.monthly_count || 0} color="#3498db" />
        <StatCard label="Active Subs" value={stats.active_subscriptions || 0} color="#2ecc71" />
      </div>

      {/* Section Tabs */}
      <div className="tx-subtab-bar">
        {SECTIONS.map(s => (
          <button
            key={s.key}
            className={`tx-subtab-btn ${activeSection === s.key ? 'active' : ''}`}
            onClick={() => setActiveSection(s.key)}
          >
            <span>{s.icon}</span>
            {s.label} ({s.key === 'payg' ? (data.pay_on_the_go || []).length
              : s.key === 'weekly' ? (data.weekly || []).length
              : (data.monthly || []).length})
          </button>
        ))}
      </div>

      {/* ========== PAY ON THE GO ========== */}
      {activeSection === 'payg' && (
        <>
          {(data.pay_on_the_go || []).length === 0 ? (
            <p className="admin-empty-row">No pay-on-the-go transactions yet.</p>
          ) : (
            <div className="admin-users-table" style={{ overflowX: 'auto' }}>
              <div className="admin-table-header tx-payg-header">
                <span className="col-avatar"></span>
                <span className="col-name">User</span>
                <span>Amount</span>
                <span>Method</span>
                <span>Phone</span>
                <span>Reference</span>
                <span>Credits</span>
                <span>Date</span>
              </div>
              {(data.pay_on_the_go || []).map((t, i) => (
                <div key={`payg-${t.id}-${t.source}-${i}`} className="admin-table-row tx-payg-row">
                  <span className="col-avatar">
                    <span className="admin-user-avatar" style={{ background: t.avatar_color || '#6c5ce7' }}>
                      {(t.display_name || '?')[0].toUpperCase()}
                    </span>
                  </span>
                  <span className="col-name">
                    <strong>{t.display_name || 'Unknown'}</strong>
                    <small>@{t.username}</small>
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {t.amount_kes > 0 ? `KES ${t.amount_kes}` : `$${(t.amount_usd || 0).toFixed(2)}`}
                  </span>
                  <span>
                    <span className="tx-status-badge" style={{
                      background: t.source === 'mpesa' ? '#2ecc7120' : '#3498db20',
                      color: t.source === 'mpesa' ? '#2ecc71' : '#3498db'
                    }}>
                      {t.payment_method}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatPhone(t.phone_number)}</span>
                  <span className="tx-reference">{t.mpesa_receipt || t.whop_payment_id || '-'}</span>
                  <span style={{ fontSize: 12 }}>${(t.balance_usd || 0).toFixed(2)} / KES {Math.round(t.balance_kes || 0)}</span>
                  <span style={{ fontSize: 12 }}>{formatDateTime(t.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ========== WEEKLY ========== */}
      {activeSection === 'weekly' && (
        <>
          {(data.weekly || []).length === 0 ? (
            <p className="admin-empty-row">No weekly subscriptions yet.</p>
          ) : (
            <div className="admin-users-table" style={{ overflowX: 'auto' }}>
              <div className="admin-table-header tx-sub-v3-header">
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
              {(data.weekly || []).map(s => (
                <div key={`w-${s.id}`} className="admin-table-row tx-sub-v3-row">
                  <span className="col-avatar">
                    <span className="admin-user-avatar" style={{ background: s.avatar_color || '#6c5ce7' }}>
                      {(s.display_name || '?')[0].toUpperCase()}
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
                  <span style={{ fontSize: 12 }}>${(s.balance_usd || 0).toFixed(2)} / KES {Math.round(s.balance_kes || 0)}</span>
                  <span>
                    <span className="tx-status-badge" style={{
                      background: s.status === 'active' ? '#2ecc7120' : s.status === 'cancelled' ? '#e74c3c20' : '#f39c1220',
                      color: s.status === 'active' ? '#2ecc71' : s.status === 'cancelled' ? '#e74c3c' : '#f39c12'
                    }}>
                      {s.status}
                    </span>
                  </span>
                  <span style={{ fontSize: 11 }}>{formatDate(s.started_at)}</span>
                  <span style={{ fontSize: 11 }}>
                    {formatDate(s.expires_at)}
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
        </>
      )}

      {/* ========== MONTHLY ========== */}
      {activeSection === 'monthly' && (
        <>
          {(data.monthly || []).length === 0 ? (
            <p className="admin-empty-row">No monthly subscriptions yet.</p>
          ) : (
            <div className="admin-users-table" style={{ overflowX: 'auto' }}>
              <div className="admin-table-header tx-sub-v3-header">
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
              {(data.monthly || []).map(s => (
                <div key={`m-${s.id}`} className="admin-table-row tx-sub-v3-row">
                  <span className="col-avatar">
                    <span className="admin-user-avatar" style={{ background: s.avatar_color || '#6c5ce7' }}>
                      {(s.display_name || '?')[0].toUpperCase()}
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
                  <span style={{ fontSize: 12 }}>${(s.balance_usd || 0).toFixed(2)} / KES {Math.round(s.balance_kes || 0)}</span>
                  <span>
                    <span className="tx-status-badge" style={{
                      background: s.status === 'active' ? '#2ecc7120' : s.status === 'cancelled' ? '#e74c3c20' : '#f39c1220',
                      color: s.status === 'active' ? '#2ecc71' : s.status === 'cancelled' ? '#e74c3c' : '#f39c12'
                    }}>
                      {s.status}
                    </span>
                  </span>
                  <span style={{ fontSize: 11 }}>{formatDate(s.started_at)}</span>
                  <span style={{ fontSize: 11 }}>
                    {formatDate(s.expires_at)}
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
        </>
      )}
    </div>
  )
}
