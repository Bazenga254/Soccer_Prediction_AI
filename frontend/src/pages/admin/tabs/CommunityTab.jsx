import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'

export default function CommunityTab() {
  const { getAuthHeaders } = useAdmin()
  const [predictions, setPredictions] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchPredictions = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/community/predictions?page=${p}&per_page=20`)
      setPredictions(res.data.predictions || [])
      setTotalPages(res.data.total_pages || 1)
      setPage(p)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchPredictions() }, [fetchPredictions])

  const handleDelete = async (predId) => {
    if (!confirm('Delete this prediction? This cannot be undone.')) return
    try {
      await axios.delete(`/api/admin/community/${predId}`, { headers: getAuthHeaders() })
      fetchPredictions(page)
    } catch { alert('Failed to delete prediction') }
  }

  if (loading) return <div className="admin-loading">Loading predictions...</div>

  return (
    <div className="admin-tab-content">
      <h3>Community Predictions ({predictions.length})</h3>

      <div className="admin-community-list">
        {predictions.map(p => (
          <div key={p.id} className="admin-community-item">
            <div className="admin-community-item-header">
              <span className="admin-pred-user">
                <span className="admin-user-avatar-sm" style={{ background: p.avatar_color }}>
                  {(p.display_name || '?')[0].toUpperCase()}
                </span>
                <strong>{p.display_name}</strong>
                <small>@{p.username}</small>
              </span>
              <span className="admin-pred-date">{new Date(p.created_at).toLocaleString()}</span>
            </div>
            <div className="admin-community-item-body">
              <span className="admin-pred-match">{p.team_a_name} vs {p.team_b_name}</span>
              <span className="admin-pred-pick">Pick: {p.predicted_result} ({Math.round(p.predicted_result_prob || 0)}%)</span>
              {p.analysis_summary && <p className="admin-pred-summary">{p.analysis_summary}</p>}
            </div>
            <div className="admin-community-item-footer">
              <span>Ratings: {p.rating_count} | Comments: {p.comment_count} | Avg: {p.avg_rating || '-'}</span>
              <button className="admin-delete-btn" onClick={() => handleDelete(p.id)}>Delete</button>
            </div>
          </div>
        ))}
        {predictions.length === 0 && <p className="admin-empty-row">No community predictions yet.</p>}
      </div>

      {totalPages > 1 && (
        <div className="admin-pagination">
          <button disabled={page <= 1} onClick={() => fetchPredictions(page - 1)}>Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => fetchPredictions(page + 1)}>Next</button>
        </div>
      )}
    </div>
  )
}
