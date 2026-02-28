import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'
import StatCard from '../components/StatCard'

const PAYMENT_METHODS = [
  { key: 'mpesa', label: 'M-Pesa', icon: '📱' },
  { key: 'whop', label: 'Whop', icon: '💳' },
  { key: 'card', label: 'USD Card', icon: '🏦' },
]

const TIME_PERIODS = [
  { key: 'daily', label: 'Today' },
  { key: 'weekly', label: 'This Week' },
  { key: 'monthly', label: 'This Month' },
  { key: 'all', label: 'All Time' },
]

const STATUS_COLORS = {
  completed: '#2ecc71',
  confirmed: '#27ae60',
  pending: '#f39c12',
  stk_sent: '#e67e22',
  failed: '#e74c3c',
  expired: '#636e72',
}

export default function TransactionsTab() {
  const { getAuthHeaders } = useAdmin()
  const [method, setMethod] = useState('mpesa')
  const [period, setPeriod] = useState('all')
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [selectedUser, setSelectedUser] = useState(null)
  const [userDetail, setUserDetail] = useState(null)
  const [loadingUser, setLoadingUser] = useState(false)
  const LIMIT = 10

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/transactions', {
        headers: getAuthHeaders(),
        params: { method, period, offset, limit: LIMIT },
      })
      setTransactions(res.data.transactions || [])
      setSummary(res.data.summary || {})
      setTotal(res.data.total || 0)
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders, method, period, offset])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])
  useEffect(() => { setOffset(0) }, [method, period])

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatAmount = (t) => {
    if (method === 'mpesa') {
      return `KES ${(t.amount_kes || 0).toLocaleString()}`
    }
    return `$${(t.amount_usd || 0).toFixed(2)}`
  }

  const formatPhone = (phone) => {
    if (!phone) return '-'
    // Format 254XXXXXXXXX to +254 XXX XXXXXX
    if (phone.startsWith('254') && phone.length >= 12) {
      return `+${phone.slice(0,3)} ${phone.slice(3,6)} ${phone.slice(6)}`
    }
    return phone
  }

  const getReference = (t) => {
    if (method === 'mpesa') return t.mpesa_receipt || t.reference_id || '-'
    return t.whop_payment_id || t.whop_checkout_id || '-'
  }

  const handleUserClick = async (userId) => {
    if (selectedUser === userId) {
      setSelectedUser(null)
      setUserDetail(null)
      return
    }
    setSelectedUser(userId)
    setLoadingUser(true)
    try {
      const res = await axios.get(`/api/admin/users/${userId}`, { headers: getAuthHeaders() })
      setUserDetail(res.data.user || res.data)
    } catch {
      setUserDetail(null)
    }
    setLoadingUser(false)
  }

  const currentPage = Math.floor(offset / LIMIT) + 1
  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="admin-tab-content">
      <h3 style={{ marginBottom: 4 }}>Transactions</h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        View all payment transactions across payment methods
      </p>

      {/* Payment Method Sub-tabs */}
      <div className="tx-subtab-bar">
        {PAYMENT_METHODS.map(m => (
          <button
            key={m.key}
            className={`tx-subtab-btn ${method === m.key ? 'active' : ''}`}
            onClick={() => { setMethod(m.key); setSelectedUser(null); setUserDetail(null) }}
          >
            <span>{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      {/* Time Period Filter */}
      <div className="tx-period-bar">
        {TIME_PERIODS.map(p => (
          <button
            key={p.key}
            className={`tx-period-btn ${period === p.key ? 'active' : ''}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 13 }}>{total} transactions</span>
      </div>

      {/* Summary StatCards */}
      <div className="admin-stats-grid">
        {method === 'mpesa' && (
          <StatCard label="Total (KES)" value={`KES ${(summary.total_kes || 0).toLocaleString()}`} color="#00b894" />
        )}
        <StatCard label="Total (USD)" value={`$${(summary.total_usd || 0).toFixed(2)}`} color="#fdcb6e" />
        <StatCard label="Completed" value={summary.count || 0} color="#6c5ce7" />
      </div>

      {/* User Detail Panel (when username clicked) */}
      {selectedUser && userDetail && (
        <div className="tx-user-detail-card">
          <div className="tx-user-detail-header">
            <span className="admin-user-avatar" style={{ background: userDetail.avatar_color || '#6c5ce7', width: 40, height: 40, fontSize: 16 }}>
              {(userDetail.display_name || '?')[0].toUpperCase()}
            </span>
            <div>
              <strong style={{ fontSize: 15 }}>{userDetail.display_name}</strong>
              <div style={{ color: '#64748b', fontSize: 12 }}>@{userDetail.username} &middot; {userDetail.email}</div>
            </div>
            <button onClick={() => { setSelectedUser(null); setUserDetail(null) }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
          <div className="tx-user-detail-stats">
            <div><span>Tier</span><strong style={{ color: userDetail.tier === 'pro' ? '#a78bfa' : '#94a3b8', textTransform: 'capitalize' }}>{userDetail.tier}</strong></div>
            <div><span>Credits</span><strong>{typeof userDetail.credits === "object" ? (userDetail.credits?.total_credits ?? 0) : (userDetail.credits ?? 0)}</strong></div>
            <div><span>Joined</span><strong>{userDetail.created_at ? new Date(userDetail.created_at).toLocaleDateString() : '-'}</strong></div>
            <div><span>Phone</span><strong>{formatPhone(userDetail.whatsapp_number || userDetail.mpesa_phone || '')}</strong></div>
          </div>
        </div>
      )}
      {loadingUser && <div style={{ padding: 12, color: '#94a3b8', fontSize: 13 }}>Loading user details...</div>}

      {/* Transactions Table */}
      {loading ? (
        <div className="admin-loading">Loading transactions...</div>
      ) : transactions.length === 0 ? (
        <p className="admin-empty-row">No transactions found for this period.</p>
      ) : (
        <>
          <div className="admin-users-table" style={{ overflowX: 'auto' }}>
            <div className={`admin-table-header ${method === 'mpesa' ? 'tx-mpesa-header' : 'tx-card-header'}`}>
              <span className="col-name">User</span>
              {method === 'mpesa' && <span>Phone</span>}
              <span>Amount</span>
              <span>Type</span>
              <span>Status</span>
              <span>Reference</span>
              <span>Date</span>
            </div>
            {transactions.map(t => (
              <div key={`${method}-${t.id}`} className={`admin-table-row ${method === 'mpesa' ? 'tx-mpesa-row' : 'tx-card-row'}`}>
                <span className="col-name">
                  <button className="tx-user-link" onClick={() => handleUserClick(t.user_id)}>
                    <strong>{t.display_name || 'Unknown'}</strong>
                  </button>
                  <small>@{t.username}</small>
                </span>
                {method === 'mpesa' && (
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatPhone(t.phone_number)}</span>
                )}
                <span style={{ fontWeight: 600 }}>{formatAmount(t)}</span>
                <span style={{ textTransform: 'capitalize', fontSize: 12 }}>{(t.transaction_type || '').replace(/_/g, ' ')}</span>
                <span>
                  <span className="tx-status-badge" style={{
                    background: `${STATUS_COLORS[t.payment_status] || '#636e72'}20`,
                    color: STATUS_COLORS[t.payment_status] || '#636e72'
                  }}>
                    {t.payment_status}
                  </span>
                </span>
                <span className="tx-reference">{getReference(t)}</span>
                <span style={{ fontSize: 12 }}>{formatDate(t.created_at)}</span>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="tx-pagination">
            <button
              className="tx-page-btn"
              disabled={offset === 0}
              onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
            >
              Previous
            </button>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="tx-page-btn"
              disabled={offset + LIMIT >= total}
              onClick={() => setOffset(o => o + LIMIT)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}
