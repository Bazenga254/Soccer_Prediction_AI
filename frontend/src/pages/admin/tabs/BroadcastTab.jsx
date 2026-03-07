import { useState, useEffect, useCallback, useRef } from 'react'
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
  const [channel, setChannel] = useState('email')
  const [editingBroadcast, setEditingBroadcast] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editMessage, setEditMessage] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Re-engagement templates state
  const [reTemplates, setReTemplates] = useState([])
  const [reInactiveCount, setReInactiveCount] = useState(0)
  const [reLoading, setReLoading] = useState(false)
  const [reSectionOpen, setReSectionOpen] = useState(false)
  const [rePreviewData, setRePreviewData] = useState(null)
  const [rePreviewLoading, setRePreviewLoading] = useState(false)
  const [reGenerating, setReGenerating] = useState(false)
  const [reStatusMsg, setReStatusMsg] = useState('')

  // Target user state
  const [targetType, setTargetType] = useState('all')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef(null)
  const searchTimeout = useRef(null)

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

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced user search
  const handleUserSearch = (query) => {
    setUserSearch(query)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await axios.get('/api/admin/bots/users-search', {
          headers: getAuthHeaders(),
          params: { search: query.trim() },
        })
        const results = (res.data.users || []).filter(
          u => !selectedUsers.some(s => s.id === u.id)
        )
        setSearchResults(results)
        setShowDropdown(true)
      } catch {
        setSearchResults([])
      }
      setSearchLoading(false)
    }, 300)
  }

  const addUser = (user) => {
    setSelectedUsers(prev => [...prev, user])
    setUserSearch('')
    setSearchResults([])
    setShowDropdown(false)
  }

  const removeUser = (userId) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== userId))
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (targetType === 'unverified') {
      // No title/message needed for template
    } else if (!title.trim() || !message.trim() || sending) {
      return
    }
    if (targetType === 'specific' && selectedUsers.length === 0) {
      setStatusMsg('Please select at least one user.')
      return
    }
    setSending(true)
    setStatusMsg('')
    try {
      const payload = {
        title: targetType === 'unverified' ? 'Registration Reminder' : title.trim(),
        message: targetType === 'unverified' ? 'Complete your registration reminder email' : message.trim(),
        channel: targetType === 'unverified' ? 'email' : channel,
        target_type: targetType,
      }
      if (targetType === 'specific') {
        payload.target_user_ids = selectedUsers.map(u => u.id)
        payload.target_user_names = selectedUsers.map(u => u.display_name || u.username)
      }
      const res = await axios.post('/api/admin/broadcast', payload, { headers: getAuthHeaders() })
      if (res.data.success) {
        if (res.data.status === 'pending_approval') {
          setStatusMsg('Broadcast submitted for super admin approval.')
        } else {
          setStatusMsg(`Broadcast sent to ${res.data.recipient_count} user${res.data.recipient_count !== 1 ? 's' : ''}!`)
        }
        setTitle('')
        setMessage('')
        setSelectedUsers([])
        setTargetType('all')
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

  const handleEditOpen = (b) => {
    setEditingBroadcast(b)
    setEditTitle(b.title || '')
    setEditMessage(b.message || '')
  }

  const handleEditSave = async () => {
    if (!editingBroadcast) return
    setEditSaving(true)
    try {
      const res = await axios.put(`/api/admin/broadcast/${editingBroadcast.id}`, {
        title: editTitle.trim(),
        message: editMessage.trim(),
      }, { headers: getAuthHeaders() })
      if (res.data.success) {
        setStatusMsg('Broadcast updated successfully.')
        setEditingBroadcast(null)
        fetchBroadcasts()
      }
    } catch (err) {
      setStatusMsg(err.response?.data?.detail || 'Failed to update broadcast')
    }
    setEditSaving(false)
  }

  // Re-engagement template functions
  const fetchReTemplates = useCallback(async () => {
    if (reTemplates.length > 0) return
    setReLoading(true)
    try {
      const res = await axios.get('/api/admin/reengagement/templates', { headers: getAuthHeaders() })
      setReTemplates(res.data.templates || [])
      setReInactiveCount(res.data.inactive_user_count || 0)
    } catch { /* ignore */ }
    setReLoading(false)
  }, [getAuthHeaders, reTemplates.length])

  const fetchRePreview = async (index) => {
    setRePreviewData(null)
    setRePreviewLoading(true)
    try {
      const res = await axios.get(`/api/admin/reengagement/preview/${index}`, { headers: getAuthHeaders() })
      setRePreviewData(res.data)
    } catch {
      setRePreviewData({ error: 'Failed to load preview. Make sure there are upcoming matches.' })
    }
    setRePreviewLoading(false)
  }

  const toggleReSection = () => {
    const next = !reSectionOpen
    setReSectionOpen(next)
    if (next) fetchReTemplates()
  }

  const handleReGenerate = async (templateIndex = null) => {
    setReGenerating(true)
    setReStatusMsg('')
    try {
      const payload = templateIndex !== null ? { template_index: templateIndex } : {}
      const res = await axios.post('/api/admin/reengagement/generate', payload, { headers: getAuthHeaders() })
      if (res.data.success) {
        setReStatusMsg(`Broadcast created using "${res.data.template_name}" for ${res.data.inactive_user_count} inactive users. Check Broadcast History to approve.`)
        fetchBroadcasts()
      } else {
        setReStatusMsg(res.data.error || 'Failed to generate')
      }
    } catch (err) {
      setReStatusMsg(err.response?.data?.detail || 'Failed to generate re-engagement broadcast')
    }
    setReGenerating(false)
  }

  const handleUseTemplate = (template) => {
    // Populate the compose form with template data and scroll to top
    setTitle(template.sample_subject || template.name)
    setMessage(template.description || '')
    setTargetType('all')
    setSelectedUsers([])
    setReStatusMsg(`Template "${template.name}" loaded into compose form. Choose your audience and channel, then send.`)
    // Scroll to compose form
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

  const getSendButtonText = () => {
    if (sending) return 'Sending...'
    if (targetType === 'unverified') {
      return isSuperAdmin ? 'Send to Unverified Users' : 'Submit for Approval'
    }
    if (targetType === 'inactive') {
      return isSuperAdmin ? 'Send to Inactive Users' : 'Submit for Approval'
    }
    if (targetType === 'specific' && selectedUsers.length > 0) {
      return isSuperAdmin
        ? `Send to ${selectedUsers.length} User${selectedUsers.length !== 1 ? 's' : ''}`
        : 'Submit for Approval'
    }
    if (!isSuperAdmin) return 'Submit for Approval'
    if (targetType === 'inactive') return 'Send to Inactive Users'
    if (targetType === 'unverified') return 'Send to Unverified Users'
    return 'Send to All Users'
  }

  if (loading) return <div className="admin-loading">Loading broadcasts...</div>

  return (
    <div className="admin-tab-content">
      <h2 className="admin-tab-title">Broadcast Messages</h2>
      <p className="admin-tab-subtitle">Send announcements to all users or specific individuals</p>

      <div className="broadcast-compose">
        <h3 className="broadcast-section-title">Compose Broadcast</h3>
        {!isSuperAdmin && (
          <p className="broadcast-approval-note">
            Your broadcast will be submitted for super admin approval before being sent.
          </p>
        )}
        <form onSubmit={handleSend} className="broadcast-form">
          {/* Target Type Toggle */}
          <div className="bc-target-toggle">
            <button
              type="button"
              className={`bc-target-btn ${targetType === 'all' ? 'active' : ''}`}
              onClick={() => { setTargetType('all'); setSelectedUsers([]) }}
            >
              All Users
            </button>
            <button
              type="button"
              className={`bc-target-btn ${targetType === 'inactive' ? 'active' : ''}`}
              onClick={() => { setTargetType('inactive'); setSelectedUsers([]) }}
              title="Users who haven't logged in for 7+ days"
            >
              Inactive Users
            </button>
            <button
              type="button"
              className={`bc-target-btn ${targetType === 'unverified' ? 'active' : ''}`}
              onClick={() => { setTargetType('unverified'); setSelectedUsers([]) }}
              title="Users who haven't verified their email"
            >
              Unverified
            </button>
            <button
              type="button"
              className={`bc-target-btn ${targetType === 'specific' ? 'active' : ''}`}
              onClick={() => setTargetType('specific')}
            >
              Specific User(s)
            </button>
            <button
              type="button"
              className={`bc-target-btn ${targetType === 'inactive' ? 'active' : ''}`}
              onClick={() => { setTargetType('inactive'); setSelectedUsers([]) }}
            >
              Inactive Users
            </button>
            <button
              type="button"
              className={`bc-target-btn ${targetType === 'unverified' ? 'active' : ''}`}
              onClick={() => { setTargetType('unverified'); setSelectedUsers([]) }}
            >
              Unverified Users
            </button>
          </div>

          {/* User Search (when specific is selected) */}
          {targetType === 'specific' && (
            <div className="bc-user-picker" ref={searchRef}>
              {selectedUsers.length > 0 && (
                <div className="bc-selected-chips">
                  {selectedUsers.map(u => (
                    <span key={u.id} className="bc-user-chip">
                      <span className="bc-chip-avatar" style={{ background: u.avatar_color || '#6c5ce7' }}>
                        {(u.display_name || u.username || '?')[0].toUpperCase()}
                      </span>
                      {u.display_name || u.username}
                      <button type="button" className="bc-chip-remove" onClick={() => removeUser(u.id)}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="bc-search-wrapper">
                <input
                  type="text"
                  placeholder="Search users by name or username..."
                  value={userSearch}
                  onChange={e => handleUserSearch(e.target.value)}
                  className="bc-user-search-input"
                />
                {searchLoading && <span className="bc-search-spinner">...</span>}
              </div>
              {showDropdown && searchResults.length > 0 && (
                <div className="bc-search-dropdown">
                  {searchResults.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      className="bc-search-result"
                      onClick={() => addUser(u)}
                    >
                      <span className="bc-result-avatar" style={{ background: u.avatar_color || '#6c5ce7' }}>
                        {(u.display_name || u.username || '?')[0].toUpperCase()}
                      </span>
                      <div className="bc-result-info">
                        <strong>{u.display_name || u.username}</strong>
                        <small>@{u.username}</small>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {showDropdown && searchResults.length === 0 && userSearch.trim().length >= 2 && !searchLoading && (
                <div className="bc-search-dropdown">
                  <div className="bc-no-results">No users found</div>
                </div>
              )}
            </div>
          )}

          {targetType === 'unverified' ? (
            <div className="bc-template-preview">
              <div className="bc-template-label">Registration Reminder Template</div>
              <div className="bc-template-card">
                <div className="bc-template-subject"><strong>Subject:</strong> Complete Your Registration - Spark AI</div>
                <div className="bc-template-email-preview">
                  <div className="bc-template-icon">&#9917;</div>
                  <div className="bc-template-heading">You're Almost There!</div>
                  <p>Hey <em>[User's First Name]</em>,</p>
                  <p>We noticed you started creating your Spark AI account but haven't completed your email verification yet. You're just one step away from unlocking powerful match prediction tools!</p>
                  <p><strong>Here's what's waiting for you:</strong></p>
                  <ul>
                    <li>AI-powered match predictions with high accuracy</li>
                    <li>Live match tracking &amp; real-time odds comparison</li>
                    <li>Community tips from top prediction analysts</li>
                    <li>Personalized match analysis &amp; insights</li>
                    <li>Free daily predictions to get you started</li>
                  </ul>
                  <div className="bc-template-cta">Complete Registration</div>
                  <p className="bc-template-small">Simply log in and verify your email to activate your account.</p>
                </div>
              </div>
              <p className="bc-template-note">This will send this email to all users who haven't verified their email address. Each user will be greeted by their real first name.</p>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Broadcast title..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="broadcast-title-input"
                maxLength={100}
              />
              <textarea
                placeholder={targetType === 'specific' ? 'Write your message to selected users...' : targetType === 'inactive' ? 'Write your message to inactive users...' : 'Write your message to all users...'}
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="broadcast-message-input"
                maxLength={1000}
                rows={4}
              />
              <div className="broadcast-channel-selector">
                <label>Send via:</label>
                <select value={channel} onChange={e => setChannel(e.target.value)} className="broadcast-channel-select">
                  <option value="email">Email Only</option>
                  <option value="push">App Notification Only</option>
                  <option value="email_push">Email + App Notification</option>
                </select>
              </div>
            </>
          )}
          <div className="broadcast-form-footer">
            {targetType !== 'unverified' && <span className="broadcast-char-count">{message.length}/1000</span>}
            <button
              type="submit"
              className="broadcast-send-btn"
              disabled={targetType === 'unverified' ? sending : (!title.trim() || !message.trim() || sending || (targetType === 'specific' && selectedUsers.length === 0))}

            >
              {getSendButtonText()}
            </button>
          </div>
        </form>
        {statusMsg && <p className="broadcast-status-msg">{statusMsg}</p>}
      </div>

      {/* Re-engagement Templates Section */}
      <div className="bc-re-section">
        <div className="bc-re-header" onClick={toggleReSection}>
          <div className="bc-re-header-left">
            <span className={`bc-re-chevron ${reSectionOpen ? 'open' : ''}`}>&#9656;</span>
            <h3 className="broadcast-section-title" style={{ margin: 0 }}>Re-engagement Templates</h3>
            {reInactiveCount > 0 && (
              <span className="bc-re-inactive-badge">{reInactiveCount} inactive user{reInactiveCount !== 1 ? 's' : ''}</span>
            )}
          </div>
          {isSuperAdmin && reSectionOpen && (
            <button
              className="bc-re-generate-btn"
              onClick={(e) => { e.stopPropagation(); handleReGenerate() }}
              disabled={reGenerating}
            >
              {reGenerating ? 'Generating...' : 'Generate Random'}
            </button>
          )}
        </div>

        {reSectionOpen && (
          <div className="bc-re-body">
            {reLoading ? (
              <div className="admin-loading">Loading templates...</div>
            ) : (
              <>
                <p className="bc-re-description">
                  These templates are used for daily automated re-engagement emails to inactive users.
                  Click &quot;Preview&quot; to see the rendered email with real match data, or generate a broadcast manually.
                </p>
                <div className="bc-re-grid">
                  {reTemplates.map(t => (
                    <div key={t.index} className="bc-re-card">
                      <div className="bc-re-card-index">#{t.index + 1}</div>
                      <div className="bc-re-card-name">{t.name}</div>
                      <div className="bc-re-card-desc">{t.description}</div>
                      <div className="bc-re-card-subject">
                        <strong>Subject:</strong> {t.sample_subject}
                      </div>
                      <div className="bc-re-card-actions">
                        <button
                          className="bc-re-card-preview-btn"
                          onClick={() => fetchRePreview(t.index)}
                          disabled={rePreviewLoading}
                        >
                          Preview
                        </button>
                        {isSuperAdmin && (
                          <button
                            className="bc-re-card-use-btn"
                            onClick={() => handleUseTemplate(t)}
                          >
                            Use This
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {reStatusMsg && <p className="broadcast-status-msg">{reStatusMsg}</p>}
              </>
            )}
          </div>
        )}
      </div>

      {/* Template Preview Modal */}
      {(rePreviewLoading || rePreviewData) && (
        <div className="bc-edit-overlay" onClick={() => { setRePreviewData(null); setRePreviewLoading(false) }}>
          <div className="bc-re-preview-modal" onClick={e => e.stopPropagation()}>
            {rePreviewLoading ? (
              <div className="bc-re-preview-loading">Loading preview with real match data...</div>
            ) : rePreviewData?.error ? (
              <>
                <div className="bc-edit-header">
                  <h3>Preview Error</h3>
                  <button className="bc-edit-close" onClick={() => setRePreviewData(null)}>&times;</button>
                </div>
                <div className="bc-re-preview-loading">{rePreviewData.error}</div>
              </>
            ) : (
              <>
                <div className="bc-edit-header">
                  <h3>{rePreviewData.name}</h3>
                  <button className="bc-edit-close" onClick={() => setRePreviewData(null)}>&times;</button>
                </div>
                <div className="bc-re-preview-meta">
                  <div className="bc-template-subject"><strong>Subject:</strong> {rePreviewData.subject}</div>
                  {rePreviewData.matches?.length > 0 && (
                    <div className="bc-re-match-list">
                      {rePreviewData.matches.map((m, i) => (
                        <span key={i} className="bc-re-match-chip">{m.home} vs {m.away}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bc-re-preview-frame">
                  <iframe
                    srcDoc={rePreviewData.html_body}
                    title="Email Preview"
                    className="bc-re-iframe"
                    sandbox=""
                  />
                </div>
                {isSuperAdmin && (
                  <div className="bc-edit-footer">
                    <button className="bc-edit-cancel" onClick={() => setRePreviewData(null)}>Close</button>
                    <button
                      className="bc-re-card-use-btn"
                      style={{ padding: '8px 16px', fontSize: '13px' }}
                      onClick={() => {
                        const t = reTemplates.find(t => t.index === rePreviewData.index)
                        if (t) handleUseTemplate(t)
                        setRePreviewData(null)
                      }}
                    >
                      Use in Compose
                    </button>
                    <button
                      className="bc-edit-save"
                      onClick={() => { handleReGenerate(rePreviewData.index); setRePreviewData(null) }}
                      disabled={reGenerating}
                    >
                      Send to Inactive Users
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

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
              const targetNames = b.target_user_names || []
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
                    {b.channel && <span className="broadcast-channel-badge">{
                      b.channel === 'email_push' ? 'Email + Push' :
                      b.channel === 'push' ? 'App Notification' :
                      b.channel === 'both' ? 'Email + WhatsApp' :
                      b.channel === 'whatsapp' ? 'WhatsApp' : 'Email'
                    }</span>}
                    {b.target_type === 'unverified' && (
                      <span className="bc-target-badge bc-target-unverified">To: Unverified Users</span>
                    )}
                    {b.target_type === 'inactive' && (
                      <span className="bc-target-badge bc-target-inactive">To: Inactive Users</span>
                    )}
                    {b.target_type === 'specific' && targetNames.length > 0 && (
                      <span className="bc-target-badge">
                        To: {targetNames.length <= 3
                          ? targetNames.join(', ')
                          : `${targetNames.slice(0, 2).join(', ')} +${targetNames.length - 2} more`}
                      </span>
                    )}
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
                          <button className="broadcast-edit-btn" onClick={() => handleEditOpen(b)}>Edit</button>
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

      {/* Edit Broadcast Modal */}
      {editingBroadcast && (
        <div className="bc-edit-overlay" onClick={() => setEditingBroadcast(null)}>
          <div className="bc-edit-modal" onClick={e => e.stopPropagation()}>
            <div className="bc-edit-header">
              <h3>Edit Broadcast</h3>
              <button className="bc-edit-close" onClick={() => setEditingBroadcast(null)}>&times;</button>
            </div>
            <div className="bc-edit-body">
              <label className="bc-edit-label">Subject / Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="bc-edit-input"
                maxLength={100}
              />
              <label className="bc-edit-label">Message</label>
              <textarea
                value={editMessage}
                onChange={e => setEditMessage(e.target.value)}
                className="bc-edit-textarea"
                rows={8}
              />
              {editingBroadcast.target_type === 'inactive' && (
                <p className="bc-edit-note">
                  Note: For re-engagement emails, the message stores template info. The actual email HTML is generated at send time with personalized names and live match data.
                </p>
              )}
            </div>
            <div className="bc-edit-footer">
              <button className="bc-edit-cancel" onClick={() => setEditingBroadcast(null)}>Cancel</button>
              <button className="bc-edit-save" onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
