import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'

export default function BroadcastTab() {
  const { getAuthHeaders, roleInfo } = useAdmin()
  const [broadcasts, setBroadcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [filter, setFilter] = useState('all')
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const isSuperAdmin = roleInfo?.level <= 1 || roleInfo?.name === 'owner'

  const fetchBroadcasts = useCallback(async () => {
    try {
      const params = filter !== 'all' ? `?status=${filter}` : ''
      const res = await axios.get(`/api/admin/broadcasts${params}`, { headers: getAuthHeaders() })
      setBroadcasts(res.data.broadcasts || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders, filter])

  useEffect(() => { fetchBroadcasts() }, [fetchBroadcasts])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!title.trim() || !message.trim() || sending) return
    setSending(true)
    setStatusMsg('')
    try {
      const res = await axios.post('/api/admin/broadcast', {
        title: title.trim(),
        message: message.trim(),
      }, { headers: getAuthHeaders() })
      if (res.data.success) {
        if (res.data.status === 'pending_approval') {
          setStatusMsg('Broadcast submitted for super admin approval.')
        } else {
          setStatusMsg(`Broadcast sent to ${res.data.recipient_count} users!`)
        }
        setTitle('')
        setMessage('')
        fetchBroadcasts()
      }
    } catch (err) {
      setStatusMsg(err.response?.data?.detail || 'Failed to create broadcast')
    }
    setSending(false)
  }

  const handleApprove = async (id) => {
    try {
      const res = await axios.post(`/api/admin/broadcast/${id}/approve`, {}, { headers: getAuthHeaders() })
      if (res.data.success) {
        setStatusMsg(`Broadcast approved and sent to ${res.data.recipient_count} users!`)
        fetchBroadcasts()
      }
    } catch (err) {
      setStatusMsg(err.response?.data?.detail || 'Failed to approve')
    }
  }

  const handleReject = async (id) => {
    try {
      await axios.post(`/api/admin/broadcast/${id}/reject`, { reason: rejectReason }, { headers: getAuthHeaders() })
      setStatusMsg('Broadcast rejected.')
      setRejectingId(null)
      setRejectReason('')
      fetchBroadcasts()
    } catch (err) {
      setStatusMsg(err.response?.data?.detail || 'Failed to reject')
    }
  }

  const timeAgo = (dateStr) => {
    if (!dateStr) return ''
    const utcStr = dateStr && !dateStr.endsWith('Z') && !dateStr.includes('+') ? dateStr + 'Z' : dateStr
    const diff = Date.now() - new Date(utcStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const STATUS_STYLES = {
    pending_approval: { label: 'Pending Approval', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    approved: { label: 'Approved', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
    sent: { label: 'Sent', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
    rejected: { label: 'Rejected', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  }

  if (loading) return <div className="admin-loading">Loading broadcasts...</div>

  return (
    <div className="admin-tab-content">
      <h2 className="admin-tab-title">Broadcast Messages</h2>
      <p className="admin-tab-subtitle">Send announcements to all users at once</p>

      <div className="broadcast-compose">
        <h3 className="broadcast-section-title">Compose Broadcast</h3>
        {!isSuperAdmin && (
          <p className="broadcast-approval-note">
            Your broadcast will be submitted for super admin approval before being sent.
          </p>
        )}
        <form onSubmit={handleSend} className="broadcast-form">
          <input
            type="text"
            placeholder="Broadcast title..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="broadcast-title-input"
            maxLength={100}
          />
          <textarea
            placeholder="Write your message to all users..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            className="broadcast-message-input"
            maxLength={1000}
            rows={4}
          />
          <div className="broadcast-form-footer">
            <span className="broadcast-char-count">{message.length}/1000</span>
            <button type="submit" className="broadcast-send-btn" disabled={!title.trim() || !message.trim() || sending}>
              {sending ? 'Sending...' : isSuperAdmin ? 'Send to All Users' : 'Submit for Approval'}
            </button>
          </div>
        </form>
        {statusMsg && <p className="broadcast-status-msg">{statusMsg}</p>}
      </div>

      <div className="broadcast-history">
        <div className="broadcast-history-header">
          <h3 className="broadcast-section-title">Broadcast History</h3>
          <div className="broadcast-filter-tabs">
            {['all', 'pending_approval', 'sent', 'rejected'].map(f => (
              <button
                key={f}
                className={`broadcast-filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'pending_approval' ? 'Pending' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {broadcasts.length === 0 ? (
          <p className="admin-empty-row">No broadcasts found.</p>
        ) : (
          <div className="broadcast-list">
            {broadcasts.map(b => {
              const style = STATUS_STYLES[b.status] || STATUS_STYLES.sent
              return (
                <div key={b.id} className="broadcast-item">
                  <div className="broadcast-item-header">
                    <strong className="broadcast-item-title">{b.title}</strong>
                    <span className="broadcast-status-badge" style={{ color: style.color, background: style.bg }}>
                      {style.label}
                    </span>
                  </div>
                  <p className="broadcast-item-message">{b.message}</p>
                  <div className="broadcast-item-meta">
                    <span>By: {b.sender_name}</span>
                    <span>{timeAgo(b.created_at)}</span>
                    {b.status === 'sent' && <span>{b.recipient_count} recipients</span>}
                    {b.approved_by_name && <span>Approved by: {b.approved_by_name}</span>}
                    {b.rejected_reason && <span>Reason: {b.rejected_reason}</span>}
                  </div>

                  {b.status === 'pending_approval' && isSuperAdmin && (
                    <div className="broadcast-approval-actions">
                      {rejectingId === b.id ? (
                        <div className="broadcast-reject-form">
                          <input
                            type="text"
                            placeholder="Rejection reason (optional)..."
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            className="broadcast-reject-input"
                          />
                          <button className="broadcast-reject-confirm-btn" onClick={() => handleReject(b.id)}>Confirm Reject</button>
                          <button className="broadcast-reject-cancel-btn" onClick={() => { setRejectingId(null); setRejectReason('') }}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <button className="broadcast-approve-btn" onClick={() => handleApprove(b.id)}>Approve & Send</button>
                          <button className="broadcast-reject-btn" onClick={() => setRejectingId(b.id)}>Reject</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
