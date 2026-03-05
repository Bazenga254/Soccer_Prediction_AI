import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'
import StatCard from '../components/StatCard'

export default function SalesTab() {
  const { getAuthHeaders, hasPermission } = useAdmin()
  const [stats, setStats] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [creditPurchases, setCreditPurchases] = useState([])
  const [creditStats, setCreditStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [filterPlan, setFilterPlan] = useState('all')
  const [activeSection, setActiveSection] = useState('subscriptions') // 'subscriptions' | 'credits'

  const canExport = hasPermission('sales', 'export')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, subsRes] = await Promise.all([
        axios.get('/api/admin/dashboard-stats', { headers: getAuthHeaders() }),
        axios.get('/api/admin/subscriptions', { headers: getAuthHeaders() }),
      ])
      setStats(statsRes.data)

      // Filter out trial plans from subscriptions
      const allSubs = subsRes.data.subscriptions || []
      const nonTrialSubs = allSubs.filter(s => !(s.plan || '').toLowerCase().includes('trial'))
      setSubscriptions(nonTrialSubs)

      // Credit purchases (pay-on-the-go topups)
      const payg = subsRes.data.pay_on_the_go || []
      setCreditPurchases(payg)

      // Calculate credit purchase stats
      let totalCreditsUsd = 0
      let totalCreditsKes = 0
      let completedCount = 0
      for (const p of payg) {
        totalCreditsUsd += p.amount_usd || 0
        totalCreditsKes += p.amount_kes || 0
        completedCount++
      }
      setCreditStats({
        total_purchases: completedCount,
        total_usd: Math.round(totalCreditsUsd * 100) / 100,
        total_kes: Math.round(totalCreditsKes),
        mpesa_count: payg.filter(p => p.source === 'mpesa').length,
        card_count: payg.filter(p => p.source === 'whop').length,
      })
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchData() }, [fetchData])

  const handleExport = () => {
    if (!canExport) return
    let csv
    if (activeSection === 'subscriptions') {
      csv = [
        ['User', 'Email', 'Plan', 'Price', 'Currency', 'Status', 'Expires', 'Days Left'].join(','),
        ...subscriptions.map(s =>
          [s.display_name || s.username, s.email, s.plan, s.price_amount, s.price_currency, s.status, s.expires_at || '', s.days_remaining || 0].join(',')
        )
      ].join('\n')
    } else {
      csv = [
        ['User', 'Method', 'Amount USD', 'Amount KES', 'Status', 'Date'].join(','),
        ...creditPurchases.map(p =>
          [p.display_name || p.username, p.payment_method, p.amount_usd || 0, p.amount_kes || 0, p.payment_status, p.created_at || ''].join(',')
        )
      ].join('\n')
    }
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeSection}-report-${new Date().toISOString().split('T')[0]}.csv`
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
    // Skip trial plans in the breakdown too
    if (plan.toLowerCase().includes('trial')) return
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

      {/* Section Toggle */}
      <div className="sales-section-toggle">
        <button
          className={`sales-toggle-btn ${activeSection === 'subscriptions' ? 'active' : ''}`}
          onClick={() => setActiveSection('subscriptions')}
        >
          Subscriptions
        </button>
        <button
          className={`sales-toggle-btn ${activeSection === 'credits' ? 'active' : ''}`}
          onClick={() => setActiveSection('credits')}
        >
          Credit Purchases
          {creditStats.total_purchases > 0 && (
            <span className="sales-toggle-badge">{creditStats.total_purchases}</span>
          )}
        </button>
      </div>

      {activeSection === 'subscriptions' ? (
        <>
          {/* Subscription Stats */}
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

          <h3 style={{ marginTop: 24 }}>Subscribers</h3>
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
        </>
      ) : (
        <>
          {/* Credit Purchases Stats */}
          <div className="admin-stats-grid">
            <StatCard label="Total Purchases" value={creditStats.total_purchases} color="#6c5ce7" />
            <StatCard label="Revenue (USD)" value={`$${creditStats.total_usd}`} color="#fdcb6e" />
            <StatCard label="Revenue (KES)" value={`KES ${creditStats.total_kes}`} color="#55efc4" />
            <StatCard label="M-Pesa" value={creditStats.mpesa_count} color="#00b894" />
            <StatCard label="Card" value={creditStats.card_count} color="#74b9ff" />
          </div>

          <h3 style={{ marginTop: 24 }}>Credit Purchase History</h3>
          <span className="admin-user-count" style={{ marginBottom: 12, display: 'block' }}>
            {creditPurchases.length} transactions
          </span>

          <div className="admin-users-table">
            <div className="admin-table-header">
              <span className="col-avatar"></span>
              <span className="col-name">User</span>
              <span className="col-email">Method</span>
              <span className="col-tier">Amount</span>
              <span className="col-status">Status</span>
              <span className="col-joined">Date</span>
            </div>
            {creditPurchases.map((p, i) => (
              <div key={`${p.source}-${p.id}-${i}`} className="admin-table-row">
                <span className="col-avatar">
                  <span className="admin-user-avatar" style={{ background: p.avatar_color || '#6c5ce7' }}>
                    {(p.display_name || p.username || '?')[0].toUpperCase()}
                  </span>
                </span>
                <span className="col-name">
                  <strong>{p.display_name || 'Unknown'}</strong>
                  <small>@{p.username}</small>
                </span>
                <span className="col-email">
                  <span className={`tier-tag ${p.source === 'mpesa' ? 'free' : 'pro'}`}>
                    {p.payment_method}
                  </span>
                </span>
                <span className="col-tier">
                  {p.amount_kes > 0 ? `KES ${p.amount_kes}` : ''}{p.amount_kes > 0 && p.amount_usd > 0 ? ' / ' : ''}{p.amount_usd > 0 ? `$${p.amount_usd}` : ''}
                </span>
                <span className="col-status">
                  <span className={`status-dot ${p.payment_status === 'completed' || p.payment_status === 'confirmed' ? 'active' : 'suspended'}`}></span>
                  {p.payment_status}
                </span>
                <span className="col-joined">
                  {p.created_at ? new Date(p.created_at).toLocaleDateString() : '-'}
                </span>
              </div>
            ))}
            {creditPurchases.length === 0 && (
              <div className="admin-empty-row">No credit purchases yet</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
