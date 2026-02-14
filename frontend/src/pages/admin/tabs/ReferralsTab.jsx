import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'

export default function ReferralsTab() {
  const { getAuthHeaders } = useAdmin()
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchReferrals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/referral-stats', { headers: getAuthHeaders() })
      setReferrals(res.data.referrals || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchReferrals() }, [fetchReferrals])

  if (loading) return <div className="admin-loading">Loading referral data...</div>

  return (
    <div className="admin-tab-content">
      <h3>Referral Leaderboard</h3>
      {referrals.length === 0 ? (
        <p className="admin-empty-row">No referrals yet.</p>
      ) : (
        <div className="admin-users-table">
          <div className="admin-referral-header">
            <span className="col-avatar"></span>
            <span>User</span>
            <span>Code</span>
            <span>Referrals</span>
            <span>Pro Converts</span>
          </div>
          {referrals.map(r => (
            <div key={r.user_id} className="admin-referral-row">
              <span className="col-avatar">
                <span className="admin-user-avatar" style={{ background: r.avatar_color || '#6c5ce7' }}>
                  {(r.display_name || '?')[0].toUpperCase()}
                </span>
              </span>
              <span className="col-name">
                <strong>{r.display_name}</strong>
                <small>@{r.username}</small>
              </span>
              <span className="referral-code-cell">{r.referral_code}</span>
              <span className="referral-count-cell">{r.referral_count}</span>
              <span className="referral-pro-cell">{r.pro_referrals}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
