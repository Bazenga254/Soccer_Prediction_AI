import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'
import StatCard from '../components/StatCard'

export default function SalesTab() {
  const { getAuthHeaders, hasPermission } = useAdmin()
  const [stats, setStats] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterPlan, setFilterPlan] = useState('all')

  const canExport = hasPermission('sales', 'export')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, subsRes] = await Promise.all([
        axios.get('/api/admin/dashboard-stats', { headers: getAuthHeaders() }),
        axios.get('/api/admin/subscriptions', { headers: getAuthHeaders() }),
      ])
      setStats(statsRes.data)
      setSubscriptions(subsRes.data.subscriptions || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchData() }, [fetchData])

  const handleExport = () => {
    if (!canExport) return
    const csv = [
      ['User', 'Email', 'Plan', 'Price', 'Currency', 'Status', 'Expires', 'Days Left'].join(','),
      ...subscriptions.map(s =>
        [
          s.display_name || s.username,
          s.email,
          s.plan,
          s.price_amount,
          s.price_currency,
          s.status,
          s.expires_at || '',
          s.days_remaining || 0
        ].join(',')
      )
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-report-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="admin-loading">Loading sales data...</div>

  const subs = stats?.subscriptions || {}
  const bal = stats?.balance_adjustments || {}

  const filtered = subscriptions.filter(s => {
    if (filterPlan === 'all') return true
    return s.plan === filterPlan
  })

  const planCounts = {}
  subscriptions.forEach(s => {
    const plan = s.plan || 'unknown'
    planCounts[plan] = (planCounts[plan] || 0) + 1
  })

  return (
    <div className="admin-tab-content">
      <div className="admin-section-header">
        <h3>Sales & Revenue Dashboard</h3>
        {canExport && (
          <button className="admin-action-btn upgrade" onClick={handleExport}>
            Export CSV
          </button>
        )}
      </div>

      <div className="admin-stats-grid">
        <StatCard label="Active Subscriptions" value={subs.active || 0} color="#00b894" />
        <StatCard label="Total Subscriptions" value={subs.total_subscriptions || subscriptions.length} color="#6c5ce7" />
        <StatCard label="Revenue (USD)" value={`$${subs.revenue_usd || 0}`} color="#fdcb6e" />
        <StatCard label="Revenue (KES)" value={`KES ${subs.revenue_kes || 0}`} color="#55efc4" />
        <StatCard label="Cancelled" value={subs.cancelled || 0} color="#e17055" />
        <StatCard label="Expired" value={subs.expired || 0} color="#636e72" />
      </div>

      {Object.keys(planCounts).length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>Plan Breakdown</h3>
          <div className="admin-stats-grid">
            {Object.entries(planCounts).map(([plan, count]) => (
              <StatCard key={plan} label={plan.replace(/_/g, ' ').toUpperCase()} value={count} color="#74b9ff" />
            ))}
          </div>
        </>
      )}

      {bal && bal.total_adjustments > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>Balance Adjustments</h3>
          <div className="admin-stats-grid">
            <StatCard label="Total Adjustments" value={bal.total_adjustments} color="#a78bfa" />
            <StatCard label="Credited (USD)" value={`$${bal.total_credited_usd}`} color="#22c55e" />
            <StatCard label="Debited (USD)" value={`$${bal.total_debited_usd}`} color="#ef4444" />
            <StatCard label="Credited (KES)" value={`KES ${bal.total_credited_kes}`} color="#22c55e" />
            <StatCard label="Debited (KES)" value={`KES ${bal.total_debited_kes}`} color="#ef4444" />
          </div>
        </>
      )}

      <h3 style={{ marginTop: 24 }}>Active Subscribers</h3>
      <div className="admin-users-toolbar">
        <select value={filterPlan} onChange={(e) => setFilterPlan(e.target.value)} className="admin-filter-select">
          <option value="all">All Plans</option>
          {Object.keys(planCounts).map(plan => (
            <option key={plan} value={plan}>{plan.replace(/_/g, ' ').toUpperCase()}</option>
          ))}
        </select>
        <span className="admin-user-count">{filtered.length} subscribers</span>
      </div>

      <div className="admin-users-table">
        <div className="admin-table-header">
          <span className="col-avatar"></span>
          <span className="col-name">User</span>
          <span className="col-email">Plan</span>
          <span className="col-tier">Price</span>
          <span className="col-status">Status</span>
          <span className="col-joined">Expires</span>
          <span className="col-logins">Days Left</span>
        </div>
        {filtered.map(s => (
          <div key={s.id || s.user_id} className="admin-table-row">
            <span className="col-avatar">
              <span className="admin-user-avatar" style={{ background: s.avatar_color || '#6c5ce7' }}>
                {(s.display_name || s.username || '?')[0].toUpperCase()}
              </span>
            </span>
            <span className="col-name">
              <strong>{s.display_name || 'No Name'}</strong>
              <small>@{s.username}</small>
            </span>
            <span className="col-email">
              <span className="tier-tag pro">{(s.plan || '').replace(/_/g, ' ').toUpperCase()}</span>
            </span>
            <span className="col-tier">
              {s.price_currency} {s.price_amount}
            </span>
            <span className="col-status">
              <span className={`status-dot ${s.status === 'active' ? 'active' : 'suspended'}`}></span>
              {s.status}
            </span>
            <span className="col-joined">{s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '-'}</span>
            <span className="col-logins">{s.days_remaining || 0}d</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="admin-empty-row">No subscribers found</div>
        )}
      </div>
    </div>
  )
}
