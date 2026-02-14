import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'
import StatCard from '../components/StatCard'

export default function OverviewTab() {
  const { getAuthHeaders } = useAdmin()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/dashboard-stats', { headers: getAuthHeaders() })
      setStats(res.data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  const [onlineCount, setOnlineCount] = useState(0)

  useEffect(() => {
    const fetchOnline = () => {
      axios.get('/api/active-users-count').then(res => {
        setOnlineCount(res.data.active_users || 0)
      }).catch(() => {})
    }
    fetchOnline()
    const interval = setInterval(fetchOnline, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  if (loading) return <div className="admin-loading">Loading stats...</div>
  if (!stats) return null

  const { users, community, predictions, subscriptions: subs, balance_adjustments: bal } = stats

  return (
    <div className="admin-tab-content">
      <div className="admin-overview-online">
        <span className="online-dot-pulse"></span>
        <span className="admin-overview-online-count">{onlineCount.toLocaleString()}</span>
        <span className="admin-overview-online-label">users online now</span>
      </div>

      <h3>Platform Overview</h3>
      <div className="admin-stats-grid">
        <StatCard label="Total Users" value={users?.total_users || 0} color="#6c5ce7" />
        <StatCard label="Active Users" value={users?.active_users || 0} color="#00b894" />
        <StatCard label="Pro Users" value={users?.pro_users || 0} color="#fdcb6e" />
        <StatCard label="Free Users" value={users?.free_users || 0} color="#74b9ff" />
        <StatCard label="New Today" value={users?.new_today || 0} color="#55efc4" />
      </div>

      <h3>Subscriptions & Revenue</h3>
      <div className="admin-stats-grid">
        <StatCard label="Active Subs" value={subs?.active || 0} color="#00b894" />
        <StatCard label="Total Subs" value={subs?.total_subscriptions || 0} color="#6c5ce7" />
        <StatCard label="Cancelled" value={subs?.cancelled || 0} color="#e17055" />
        <StatCard label="Expired" value={subs?.expired || 0} color="#636e72" />
        <StatCard label="Revenue (USD)" value={`$${subs?.revenue_usd || 0}`} color="#fdcb6e" />
        <StatCard label="Revenue (KES)" value={`KES ${subs?.revenue_kes || 0}`} color="#55efc4" />
      </div>

      {bal && bal.total_adjustments > 0 && (
        <>
          <h3>Balance Adjustments (by Super Admin)</h3>
          <div className="admin-stats-grid">
            <StatCard label="Total Adjustments" value={bal.total_adjustments} color="#a78bfa" />
            <StatCard label="Credited (USD)" value={`$${bal.total_credited_usd}`} color="#22c55e" />
            <StatCard label="Debited (USD)" value={`$${bal.total_debited_usd}`} color="#ef4444" />
            <StatCard label="Credited (KES)" value={`KES ${bal.total_credited_kes}`} color="#22c55e" />
            <StatCard label="Debited (KES)" value={`KES ${bal.total_debited_kes}`} color="#ef4444" />
          </div>
        </>
      )}

      <h3>Community Activity</h3>
      <div className="admin-stats-grid">
        <StatCard label="Predictions Shared" value={community?.total_predictions || 0} color="#e17055" />
        <StatCard label="Public" value={community?.public_predictions || 0} color="#00b894" />
        <StatCard label="Private" value={community?.private_predictions || 0} color="#636e72" />
        <StatCard label="Total Ratings" value={community?.total_ratings || 0} color="#fdcb6e" />
        <StatCard label="Total Comments" value={community?.total_comments || 0} color="#74b9ff" />
        <StatCard label="Unique Sharers" value={community?.unique_sharers || 0} color="#a29bfe" />
        <StatCard label="Today's Predictions" value={community?.predictions_today || 0} color="#55efc4" />
      </div>

      <h3>Prediction Accuracy</h3>
      <div className="admin-stats-grid">
        <StatCard
          label="Total Predictions"
          value={predictions?.total_predictions || 0}
          color="#6c5ce7"
        />
        <StatCard
          label="Completed"
          value={predictions?.matches_finished || 0}
          color="#00b894"
        />
        <StatCard
          label="Result Accuracy"
          value={predictions?.result_accuracy?.percentage ? `${predictions.result_accuracy.percentage}%` : 'N/A'}
          color={predictions?.result_accuracy?.percentage >= 60 ? '#00b894' : predictions?.result_accuracy?.percentage >= 40 ? '#fdcb6e' : '#e17055'}
        />
        <StatCard
          label="O/U 2.5 Accuracy"
          value={predictions?.over25_accuracy?.percentage ? `${predictions.over25_accuracy.percentage}%` : 'N/A'}
          color={predictions?.over25_accuracy?.percentage >= 60 ? '#00b894' : '#fdcb6e'}
        />
        <StatCard
          label="BTTS Accuracy"
          value={predictions?.btts_accuracy?.percentage ? `${predictions.btts_accuracy.percentage}%` : 'N/A'}
          color={predictions?.btts_accuracy?.percentage >= 60 ? '#00b894' : '#fdcb6e'}
        />
      </div>
    </div>
  )
}
