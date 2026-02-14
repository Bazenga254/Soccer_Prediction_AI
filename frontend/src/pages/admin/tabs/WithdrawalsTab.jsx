import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'

export default function WithdrawalsTab() {
  const { getAuthHeaders } = useAdmin()
  const [withdrawals, setWithdrawals] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchWithdrawals = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/withdrawals/pending', { headers: getAuthHeaders() })
      setWithdrawals(res.data.withdrawals || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchWithdrawals() }, [fetchWithdrawals])

  const handleAction = async (id, action) => {
    try {
      await axios.post(`/api/admin/withdrawals/${id}/${action}`, {}, { headers: getAuthHeaders() })
      fetchWithdrawals()
    } catch (err) {
      alert(err.response?.data?.detail || `Failed to ${action}`)
    }
  }

  if (loading) return <div className="admin-loading">Loading withdrawals...</div>

  return (
    <div className="admin-tab-content">
      <h3>Pending Withdrawals ({withdrawals.length})</h3>
      {withdrawals.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>No pending withdrawal requests.</p>
      ) : (
        <div className="admin-withdrawal-list">
          {withdrawals.map(wd => (
            <div key={wd.id} className="admin-withdrawal-card">
              <div className="admin-withdrawal-header">
                <span className="admin-withdrawal-user">
                  {wd.display_name || wd.username || `User #${wd.user_id}`}
                </span>
                <span className="admin-withdrawal-amount">${wd.amount_usd.toFixed(2)}</span>
              </div>
              <div className="admin-withdrawal-details">
                <span>~KES {wd.amount_kes.toFixed(0)}</span>
                <span>M-Pesa: {wd.phone_number}</span>
                <span>{new Date(wd.created_at).toLocaleString()}</span>
                <span className={`withdrawal-status-badge ${wd.status}`}>{wd.status}</span>
              </div>
              <div className="admin-withdrawal-actions">
                {wd.status === 'pending' && (
                  <>
                    <button className="admin-approve-btn" onClick={() => handleAction(wd.id, 'approve')}>Approve</button>
                    <button className="admin-reject-btn" onClick={() => handleAction(wd.id, 'reject')}>Reject</button>
                  </>
                )}
                {wd.status === 'approved' && (
                  <button className="admin-complete-btn" onClick={() => handleAction(wd.id, 'complete')}>
                    Mark Completed
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
