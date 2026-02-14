import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'
import UserDetailPanel from '../components/UserDetailPanel'

const CATEGORY_LABELS = {
  payment: { label: 'Payment', color: '#e74c3c' },
  subscription: { label: 'Subscription', color: '#3498db' },
  predictions: { label: 'Ads / Predictions', color: '#2ecc71' },
  general: { label: 'General', color: '#95a5a6' },
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

function parseFileMessage(content) {
  const match = content.match(/^\[FILE:(.+?)\]\((.+?)\)$/)
  if (!match) return null
  const name = match[1]
  const url = match[2]
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase()
  const isImage = IMAGE_EXTENSIONS.includes(ext)
  return { name, url, isImage }
}

function KeepaliveTimer({ promptedAt }) {
  const [remaining, setRemaining] = useState(180)
  useEffect(() => {
    const utcStr = promptedAt && !promptedAt.endsWith('Z') && !promptedAt.includes('+') ? promptedAt + 'Z' : promptedAt
    const start = new Date(utcStr).getTime()
    const update = () => {
      const elapsed = Math.floor((Date.now() - start) / 1000)
      setRemaining(Math.max(0, 180 - elapsed))
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [promptedAt])
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  return (
    <span className={`keepalive-timer ${remaining <= 30 ? 'urgent' : ''}`}>
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  )
}

export default function SupportTab() {
  const { getAuthHeaders, staffRole } = useAdmin()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [userProfile, setUserProfile] = useState(null)
  const [showProfile, setShowProfile] = useState(false)
  const [showRatings, setShowRatings] = useState(false)
  const [agentRatings, setAgentRatings] = useState([])
  const [recentRatings, setRecentRatings] = useState([])
  const [uploading, setUploading] = useState(false)
  const [keepalivePrompts, setKeepalivePrompts] = useState([])
  const fileInputRef = useRef(null)
  const activeChatRef = useRef(null)
  const messagesEndRef = useCallback(node => {
    if (node) node.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchConversations = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/support/conversations', { headers: getAuthHeaders() })
      const convs = res.data.conversations || []
      setConversations(convs)
      // Update activeChat if it exists (so status/metadata stays fresh)
      setActiveChat(prev => {
        if (!prev) return prev
        const updated = convs.find(c => c.user_id === prev.user_id)
        return updated || prev
      })
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  const fetchKeepalivePrompts = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/support/keepalive-prompts', { headers: getAuthHeaders() })
      setKeepalivePrompts(res.data.prompts || [])
    } catch { /* ignore */ }
  }, [getAuthHeaders])

  const handleKeepalive = async (conversationId, keepOpen) => {
    try {
      await axios.post(`/api/admin/support/keepalive/${conversationId}?keep_open=${keepOpen}`, {}, { headers: getAuthHeaders() })
      fetchKeepalivePrompts()
      fetchConversations()
    } catch { /* ignore */ }
  }

  useEffect(() => { fetchConversations(); fetchKeepalivePrompts() }, [fetchConversations, fetchKeepalivePrompts])

  useEffect(() => {
    const interval = setInterval(() => { fetchConversations(); fetchKeepalivePrompts() }, 3000)
    return () => clearInterval(interval)
  }, [fetchConversations, fetchKeepalivePrompts])

  const openChat = async (conv) => {
    setActiveChat(conv)
    activeChatRef.current = conv
    setShowProfile(false)
    setShowRatings(false)
    try {
      const res = await axios.get(`/api/admin/support/messages/${conv.user_id}`, { headers: getAuthHeaders() })
      setMessages(res.data.messages || [])
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!activeChat) return
    // Fetch messages immediately when chat opens, then poll every 2 seconds
    const fetchChatMessages = async () => {
      const chat = activeChatRef.current
      if (!chat) return
      try {
        const res = await axios.get(`/api/admin/support/messages/${chat.user_id}`, { headers: getAuthHeaders() })
        setMessages(res.data.messages || [])
      } catch { /* ignore */ }
    }
    const interval = setInterval(fetchChatMessages, 2000)
    return () => clearInterval(interval)
  }, [activeChat, getAuthHeaders])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !activeChat || sending) return
    setSending(true)
    try {
      await axios.post(`/api/admin/support/send/${activeChat.user_id}`, {
        content: newMessage.trim()
      }, { headers: getAuthHeaders() })
      setNewMessage('')
      const res = await axios.get(`/api/admin/support/messages/${activeChat.user_id}`, { headers: getAuthHeaders() })
      setMessages(res.data.messages || [])
      fetchConversations()
    } catch { /* ignore */ }
    setSending(false)
  }

  const handleEndChat = async () => {
    if (!activeChat) return
    if (!confirm('End this chat? The user will be prompted to rate the conversation.')) return
    try {
      await axios.post(`/api/admin/support/close/${activeChat.user_id}`, {}, { headers: getAuthHeaders() })
      const res = await axios.get(`/api/admin/support/messages/${activeChat.user_id}`, { headers: getAuthHeaders() })
      setMessages(res.data.messages || [])
      fetchConversations()
    } catch { alert('Failed to end chat') }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !activeChat) return
    e.target.value = ''
    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10MB.')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await axios.post(`/api/admin/support/upload/${activeChat.user_id}`, formData, {
        headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' },
      })
      const res = await axios.get(`/api/admin/support/messages/${activeChat.user_id}`, { headers: getAuthHeaders() })
      setMessages(res.data.messages || [])
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to upload file')
    }
    setUploading(false)
  }

  const viewProfile = async (userId) => {
    try {
      const res = await axios.get(`/api/admin/users/${userId}`, { headers: getAuthHeaders() })
      setUserProfile(res.data)
      setShowProfile(true)
    } catch { /* ignore */ }
  }

  const handleTierChange = async (userId, currentTier) => {
    const newTier = currentTier === 'pro' ? 'free' : 'pro'
    try {
      await axios.post(`/api/admin/users/${userId}/set-tier`, { tier: newTier }, { headers: getAuthHeaders() })
      viewProfile(userId)
    } catch { /* ignore */ }
  }

  const handleToggleActive = async (userId, isActive) => {
    try {
      await axios.post(`/api/admin/users/${userId}/toggle-active`, { is_active: isActive ? 0 : 1 }, { headers: getAuthHeaders() })
      viewProfile(userId)
    } catch { /* ignore */ }
  }

  const fetchRatings = async () => {
    try {
      const res = await axios.get('/api/admin/support/ratings', { headers: getAuthHeaders() })
      setAgentRatings(res.data.ratings || [])
      setRecentRatings(res.data.recent || [])
      setShowRatings(true)
      setActiveChat(null)
    } catch { alert('Unable to load ratings') }
  }

  const timeAgo = (dateStr) => {
    // Server stores UTC times without 'Z' suffix — append it so browser parses as UTC
    const utcStr = dateStr && !dateStr.endsWith('Z') && !dateStr.includes('+') ? dateStr + 'Z' : dateStr
    const diff = Date.now() - new Date(utcStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Now'
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
  }

  // Check if conversation is active (not closed)
  const isChatActive = activeChat && (activeChat.conv_status === 'active' || !activeChat.conv_status)

  if (loading) return <div className="admin-loading">Loading support conversations...</div>

  return (
    <div className="admin-tab-content">
      <div className="admin-support-layout">
        <div className="admin-support-sidebar">
          <div className="admin-support-sidebar-header">
            <h3>Conversations ({conversations.length})</h3>
            <button className="admin-support-ratings-btn" onClick={fetchRatings} title="View agent ratings">Ratings</button>
          </div>
          {conversations.length === 0 ? (
            <p className="admin-empty-row">No support messages yet.</p>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.user_id}
                className={`admin-support-conv-item ${activeChat?.user_id === conv.user_id ? 'active' : ''} ${conv.unread_count > 0 ? 'unread' : ''}`}
                onClick={() => openChat(conv)}
              >
                <span className="admin-user-avatar-sm" style={{ background: conv.avatar_color }}>
                  {(conv.display_name || '?')[0].toUpperCase()}
                </span>
                <div className="admin-support-conv-info">
                  <div className="admin-support-conv-top">
                    <strong>{conv.display_name}</strong>
                    <span className="admin-support-conv-time">{timeAgo(conv.last_message_at)}</span>
                  </div>
                  <div className="admin-support-conv-meta">
                    {conv.category && CATEGORY_LABELS[conv.category] && (
                      <span className="admin-support-cat-tag" style={{ background: CATEGORY_LABELS[conv.category].color }}>
                        {CATEGORY_LABELS[conv.category].label}
                      </span>
                    )}
                    {conv.conv_status === 'closed' && (
                      <span className="admin-support-status-tag closed">Closed</span>
                    )}
                    {conv.assigned_agent_name && (
                      <span className="admin-support-agent-tag">{conv.assigned_agent_name}</span>
                    )}
                    {conv.rating && (
                      <span className="admin-support-rating-tag">{'★'.repeat(conv.rating)}{'☆'.repeat(5 - conv.rating)}</span>
                    )}
                  </div>
                  <p className="admin-support-conv-preview">
                    {conv.last_sender === 'admin' && <span className="admin-support-you">You: </span>}
                    {conv.last_message.length > 40 ? conv.last_message.slice(0, 40) + '...' : conv.last_message}
                  </p>
                </div>
                {conv.unread_count > 0 && (
                  <span className="admin-support-badge">{conv.unread_count}</span>
                )}
              </div>
            ))
          )}
        </div>

        <div className="admin-support-chat">
          {showRatings ? (
            <div className="admin-support-ratings">
              <div className="admin-support-ratings-header">
                <button className="admin-support-profile-back" onClick={() => setShowRatings(false)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                  Back
                </button>
                <h3>Agent Ratings</h3>
              </div>
              {agentRatings.length === 0 ? (
                <p className="admin-empty-row">No ratings yet.</p>
              ) : (
                <>
                  <div className="admin-ratings-list">
                    <h4 className="admin-ratings-section-title">Agent Summary</h4>
                    {agentRatings.map(r => (
                      <div key={r.agent_id} className="admin-rating-item">
                        <div className="admin-rating-item-top">
                          <strong>{r.agent_name}</strong>
                          <span className="admin-rating-stars">
                            {'★'.repeat(Math.round(r.avg_rating))}{'☆'.repeat(5 - Math.round(r.avg_rating))}
                            {' '}{Number(r.avg_rating).toFixed(1)}/5
                          </span>
                        </div>
                        <small>{r.total_ratings} rating{r.total_ratings !== 1 ? 's' : ''}</small>
                      </div>
                    ))}
                  </div>
                  {recentRatings.length > 0 && (
                    <div className="admin-ratings-list" style={{ marginTop: 16 }}>
                      <h4 className="admin-ratings-section-title">Recent Ratings</h4>
                      {recentRatings.map((r, idx) => (
                        <div key={idx} className="admin-rating-item admin-rating-recent">
                          <div className="admin-rating-item-top">
                            <span>
                              <strong>{r.display_name}</strong>
                              <span className="admin-rating-username"> @{r.username}</span>
                            </span>
                            <span className="admin-rating-stars">
                              {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                            </span>
                          </div>
                          <div className="admin-rating-item-meta">
                            <span>Agent: {r.agent_name}</span>
                            <span>{timeAgo(r.created_at)}</span>
                          </div>
                          {r.comment && <p className="admin-rating-comment">{r.comment}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : !activeChat ? (
            <div className="admin-support-chat-empty">
              <p>Select a conversation to start replying</p>
            </div>
          ) : showProfile && userProfile ? (
            <UserDetailPanel
              userProfile={userProfile}
              onBack={() => setShowProfile(false)}
              onTierChange={handleTierChange}
              onToggleActive={handleToggleActive}
              staffRole={staffRole}
              getAuthHeaders={getAuthHeaders}
              onRefresh={viewProfile}
            />
          ) : (
            <>
              <div className="admin-support-chat-header">
                <span className="admin-user-avatar-sm" style={{ background: activeChat.avatar_color }}>
                  {(activeChat.display_name || '?')[0].toUpperCase()}
                </span>
                <div>
                  <strong>{activeChat.display_name}</strong>
                  <small>@{activeChat.username}</small>
                </div>
                {activeChat.category && CATEGORY_LABELS[activeChat.category] && (
                  <span className="admin-support-cat-tag" style={{ background: CATEGORY_LABELS[activeChat.category].color, marginLeft: 8 }}>
                    {CATEGORY_LABELS[activeChat.category].label}
                  </span>
                )}
                {activeChat.conv_status === 'closed' && (
                  <span className="admin-support-status-tag closed" style={{ marginLeft: 8 }}>Closed</span>
                )}
                <div className="admin-support-header-actions">
                  <button className="admin-support-view-profile" onClick={() => viewProfile(activeChat.user_id)}>
                    View Profile
                  </button>
                  {isChatActive && (
                    <button className="admin-support-end-chat" onClick={handleEndChat}>
                      End Chat
                    </button>
                  )}
                </div>
              </div>
              {keepalivePrompts.length > 0 && (
                <div className="keepalive-banner-container">
                  {keepalivePrompts.map(p => (
                    <div key={p.id} className="keepalive-banner">
                      <div className="keepalive-banner-icon">&#9200;</div>
                      <div className="keepalive-banner-text">
                        <strong>Chat idle for 30 minutes</strong>
                        <span>Chat with {p.display_name} (@{p.username}) — Keep open?</span>
                      </div>
                      <div className="keepalive-banner-actions">
                        <button className="keepalive-keep-btn" onClick={() => handleKeepalive(p.conversation_id, true)}>Keep Open</button>
                        <button className="keepalive-close-btn" onClick={() => handleKeepalive(p.conversation_id, false)}>End Chat</button>
                      </div>
                      <KeepaliveTimer promptedAt={p.prompted_at} />
                    </div>
                  ))}
                </div>
              )}
              <div className="admin-support-chat-messages">
                {messages.map((msg, idx) => (
                  <div key={msg.id} className={`admin-support-bubble ${msg.sender}`}>
                    {msg.sender === 'admin' && msg.agent_name && (idx === 0 || messages[idx - 1]?.sender !== 'admin' || messages[idx - 1]?.agent_name !== msg.agent_name) && (
                      <span className="admin-support-agent-label">Agent: {msg.agent_name}</span>
                    )}
                    {idx === 0 && msg.category && CATEGORY_LABELS[msg.category] && (
                      <span className="admin-support-cat-tag" style={{ background: CATEGORY_LABELS[msg.category].color }}>
                        {CATEGORY_LABELS[msg.category].label}
                      </span>
                    )}
                    {(() => {
                      const file = parseFileMessage(msg.content)
                      if (file) {
                        return file.isImage ? (
                          <a href={file.url} target="_blank" rel="noopener noreferrer" className="support-file-link">
                            <img src={file.url} alt={file.name} className="support-file-image" />
                            <span className="support-file-name">{file.name}</span>
                          </a>
                        ) : (
                          <a href={file.url} target="_blank" rel="noopener noreferrer" className="support-file-link">
                            <span className="support-file-icon">📎</span>
                            <span className="support-file-name">{file.name}</span>
                          </a>
                        )
                      }
                      return <p>{msg.content}</p>
                    })()}
                    <span className="admin-support-bubble-time">{timeAgo(msg.created_at)}</span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              {isChatActive ? (
                <form className="admin-support-chat-input" onSubmit={handleSend}>
                  <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx" />
                  <button type="button" className="support-attach-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach file">
                    {uploading ? '...' : '📎'}
                  </button>
                  <textarea
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        if (newMessage.trim() && !sending) handleSend(e)
                      }
                    }}
                    placeholder="Type a reply..."
                    maxLength={2000}
                    rows={1}
                  />
                  <button type="submit" disabled={!newMessage.trim() || sending}>Send</button>
                </form>
              ) : (
                <div className="admin-support-chat-closed-bar">
                  This conversation has been closed.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

