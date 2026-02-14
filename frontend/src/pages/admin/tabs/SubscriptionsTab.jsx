import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'

export default function SubscriptionsTab() {
  const { getAuthHeaders } = useAdmin()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchProUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/users', { headers: getAuthHeaders() })
      const proUsers = (res.data.users || []).filter(u => u.tier === 'pro')
      setUsers(proUsers)
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchProUsers() }, [fetchProUsers])

  const handleDowngrade = async (userId) => {
    if (!confirm('Downgrade this user to free tier?')) return
    try {
      await axios.post(`/api/admin/users/${userId}/set-tier`, {
        tier: 'free'
      }, { headers: getAuthHeaders() })
      fetchProUsers()
    } catch { alert('Failed to downgrade user') }
  }

  if (loading) return <div className="admin-loading">Loading subscriptions...</div>

  return (
    <div className="admin-tab-content">
      <h3>Pro Users ({users.length})</h3>
      {users.length === 0 ? (
        <p className="admin-empty-row">No pro users yet.</p>
      ) : (
        <div className="admin-users-table">
          <div className="admin-table-header">
            <span className="col-avatar"></span>
            <span className="col-name">User</span>
            <span className="col-email">Email</span>
            <span className="col-joined">Joined</span>
            <span className="col-actions">Actions</span>
          </div>
          {users.map(u => (
            <div key={u.id} className="admin-table-row">
              <span className="col-avatar">
                <span className="admin-user-avatar" style={{ background: u.avatar_color || '#6c5ce7' }}>
                  {(u.display_name || u.username || '?')[0].toUpperCase()}
                </span>
              </span>
              <span className="col-name">
                <strong>{u.display_name || 'No Name'}</strong>
                <small>@{u.username}</small>
              </span>
              <span className="col-email">{u.email}</span>
              <span className="col-joined">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}</span>
              <span className="col-actions">
                <button className="admin-action-btn downgrade" onClick={() => handleDowngrade(u.id)}>
                  Downgrade
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
