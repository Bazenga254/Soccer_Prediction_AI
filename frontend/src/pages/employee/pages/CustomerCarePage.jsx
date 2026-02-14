import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useEmployee } from '../context/EmployeeContext'

const CATEGORY_LABELS = {
  payment: { label: 'Payment', color: '#3498db' },
  subscription: { label: 'Subscription', color: '#9b59b6' },
  predictions: { label: 'Predictions', color: '#2ecc71' },
  general: { label: 'General', color: '#95a5a6' },
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

function parseFileMessage(content) {
  const match = content.match(/\[file:(.+?):(.+?)\]/)
  if (!match) return null
  const name = match[1]
  const url = match[2]
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase()
  const isImage = IMAGE_EXTENSIONS.includes(ext)
  return { name, url, isImage }
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
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

function KeepaliveTimer({ promptedAt }) {
  const [remaining, setRemaining] = useState(180)

  useEffect(() => {
    const utcStr = promptedAt && !promptedAt.endsWith('Z') && !promptedAt.includes('+')
      ? promptedAt + 'Z'
      : promptedAt
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
    <span className={`emp-keepalive-timer ${remaining <= 30 ? 'urgent' : ''}`}>
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  )
}

export default function CustomerCarePage() {
  const { getAuthHeaders } = useEmployee()

  const [conversations, setConversations] = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  const [keepalivePrompts, setKeepalivePrompts] = useState([])
  const [showRatings, setShowRatings] = useState(false)
  const [agentRatings, setAgentRatings] = useState([])
  const [recentRatings, setRecentRatings] = useState([])

  const activeChatRef = useRef(null)
  const searchTimeoutRef = useRef(null)

  const messagesEndRef = useCallback(node => {
    if (node) node.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Fetch conversations ──
  const fetchConversations = useCallback(async () => {
    try {
      const res = await axios.get('/api/employee/support/conversations', {
        headers: getAuthHeaders(),
      })
      const convs = res.data.conversations || []
      setConversations(convs)
      setActiveChat(prev => {
        if (!prev) return prev
        const updated = convs.find(c => c.user_id === prev.user_id)
        return updated || prev
      })
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  // ── Fetch keepalive prompts ──
  const fetchKeepalivePrompts = useCallback(async () => {
    try {
      const res = await axios.get('/api/employee/support/keepalive-prompts', {
        headers: getAuthHeaders(),
      })
      setKeepalivePrompts(res.data.prompts || [])
    } catch { /* ignore */ }
  }, [getAuthHeaders])

  // ── Initial load + polling ──
  useEffect(() => {
    fetchConversations()
    fetchKeepalivePrompts()
  }, [fetchConversations, fetchKeepalivePrompts])

  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations()
      fetchKeepalivePrompts()
    }, 3000)
    return () => clearInterval(interval)
  }, [fetchConversations, fetchKeepalivePrompts])

  // ── Open a chat ──
  const openChat = async (conv) => {
    setActiveChat(conv)
    activeChatRef.current = conv
    setShowRatings(false)
    setUserProfile(null)
    try {
      const res = await axios.get(`/api/employee/support/messages/${conv.user_id}`, {
        headers: getAuthHeaders(),
      })
      setMessages(res.data.messages || [])
    } catch { /* ignore */ }
  }

  // ── Poll messages for active chat ──
  useEffect(() => {
    if (!activeChat) return
    const fetchChatMessages = async () => {
      const chat = activeChatRef.current
      if (!chat) return
      try {
        const res = await axios.get(`/api/employee/support/messages/${chat.user_id}`, {
          headers: getAuthHeaders(),
        })
        setMessages(res.data.messages || [])
      } catch { /* ignore */ }
    }
    const interval = setInterval(fetchChatMessages, 2000)
    return () => clearInterval(interval)
  }, [activeChat, getAuthHeaders])

  // ── Send message ──
  const handleSend = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !activeChat || sending) return
    setSending(true)
    try {
      await axios.post(
        `/api/employee/support/send/${activeChat.user_id}`,
        { content: newMessage.trim() },
        { headers: getAuthHeaders() }
      )
      setNewMessage('')
      const res = await axios.get(`/api/employee/support/messages/${activeChat.user_id}`, {
        headers: getAuthHeaders(),
      })
      setMessages(res.data.messages || [])
      fetchConversations()
    } catch { /* ignore */ }
    setSending(false)
  }

  // ── End chat ──
  const handleEndChat = async () => {
    if (!activeChat) return
    if (!confirm('End this chat? The user will be prompted to rate the conversation.')) return
    try {
      await axios.post(
        `/api/employee/support/close/${activeChat.user_id}`,
        {},
        { headers: getAuthHeaders() }
      )
      const res = await axios.get(`/api/employee/support/messages/${activeChat.user_id}`, {
        headers: getAuthHeaders(),
      })
      setMessages(res.data.messages || [])
      fetchConversations()
    } catch {
      alert('Failed to end chat')
    }
  }

  // ── Keepalive respond ──
  const handleKeepalive = async (conversationId, keepOpen) => {
    try {
      await axios.post(
        `/api/employee/support/keepalive/${conversationId}?keep_open=${keepOpen}`,
        {},
        { headers: getAuthHeaders() }
      )
      fetchKeepalivePrompts()
      fetchConversations()
    } catch { /* ignore */ }
  }

  // ── User lookup ──
  const handleSearch = (value) => {
    setSearchQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!value.trim()) {
      setSearchResults([])
      setShowSearch(false)
      return
    }
    setShowSearch(true)
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await axios.get(`/api/employee/support/user-lookup?q=${encodeURIComponent(value.trim())}`, {
          headers: getAuthHeaders(),
        })
        setSearchResults(res.data.users || res.data.results || [])
      } catch {
        setSearchResults([])
      }
      setSearching(false)
    }, 400)
  }

  // ── Fetch ratings ──
  const fetchRatings = async () => {
    try {
      const res = await axios.get('/api/employee/support/ratings', {
        headers: getAuthHeaders(),
      })
      setAgentRatings(res.data.ratings || [])
      setRecentRatings(res.data.recent || [])
      setShowRatings(true)
      setActiveChat(null)
      activeChatRef.current = null
    } catch {
      alert('Unable to load ratings')
    }
  }

  const isChatActive = activeChat && (activeChat.conv_status === 'active' || !activeChat.conv_status)

  if (loading) {
    return (
      <div className="emp-loading">
        <div className="emp-loading-spinner"></div>
        Loading support conversations...
      </div>
    )
  }

  return (
    <div className="emp-customer-care">
      <div className="emp-support-layout">
        {/* ═══ Left Sidebar ═══ */}
        <div className="emp-support-sidebar">
          <div className="emp-support-sidebar-header">
            <h3>Conversations ({conversations.length})</h3>
            <button className="emp-ratings-btn" onClick={fetchRatings} title="View ratings">
              Ratings
            </button>
          </div>

          {/* User Lookup Search */}
          <div className="emp-search-container">
            <div className="emp-search-input-wrap">
              <svg className="emp-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b8d97" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                className="emp-search-input"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => { if (searchQuery.trim()) setShowSearch(true) }}
                onBlur={() => setTimeout(() => setShowSearch(false), 200)}
              />
              {searchQuery && (
                <button className="emp-search-clear" onClick={() => { setSearchQuery(''); setSearchResults([]); setShowSearch(false) }}>
                  &times;
                </button>
              )}
            </div>
            {showSearch && (
              <div className="emp-search-dropdown">
                {searching ? (
                  <div className="emp-search-loading">Searching...</div>
                ) : searchResults.length === 0 ? (
                  <div className="emp-search-empty">No users found</div>
                ) : (
                  searchResults.map(user => (
                    <div
                      key={user.id || user.user_id}
                      className="emp-search-result"
                      onMouseDown={() => {
                        openChat({
                          user_id: user.id || user.user_id,
                          display_name: user.display_name || user.username,
                          username: user.username,
                          avatar_color: user.avatar_color || '#6c5ce7',
                        })
                        setSearchQuery('')
                        setSearchResults([])
                        setShowSearch(false)
                      }}
                    >
                      <span className="emp-avatar-sm" style={{ background: user.avatar_color || '#6c5ce7' }}>
                        {(user.display_name || user.username || '?')[0].toUpperCase()}
                      </span>
                      <div>
                        <strong>{user.display_name || user.username}</strong>
                        <small>@{user.username}</small>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Conversation List */}
          <div className="emp-conv-list">
            {conversations.length === 0 ? (
              <p className="emp-empty-row">No support conversations yet.</p>
            ) : (
              conversations.map(conv => (
                <div
                  key={conv.user_id}
                  className={`emp-conv-item ${activeChat?.user_id === conv.user_id ? 'active' : ''} ${conv.unread_count > 0 ? 'unread' : ''}`}
                  onClick={() => openChat(conv)}
                >
                  <span className="emp-avatar-sm" style={{ background: conv.avatar_color || '#6c5ce7' }}>
                    {(conv.display_name || '?')[0].toUpperCase()}
                  </span>
                  <div className="emp-conv-info">
                    <div className="emp-conv-top">
                      <strong>{conv.display_name}</strong>
                      <span className="emp-conv-time">{timeAgo(conv.last_message_at)}</span>
                    </div>
                    <div className="emp-conv-meta">
                      {conv.category && CATEGORY_LABELS[conv.category] && (
                        <span className="emp-cat-tag" style={{ background: CATEGORY_LABELS[conv.category].color }}>
                          {CATEGORY_LABELS[conv.category].label}
                        </span>
                      )}
                      {conv.conv_status === 'closed' && (
                        <span className="emp-status-tag closed">Closed</span>
                      )}
                      {conv.assigned_agent_name && (
                        <span className="emp-agent-tag">{conv.assigned_agent_name}</span>
                      )}
                      {conv.rating && (
                        <span className="emp-rating-tag">
                          {'★'.repeat(conv.rating)}{'☆'.repeat(5 - conv.rating)}
                        </span>
                      )}
                    </div>
                    <p className="emp-conv-preview">
                      {conv.last_sender === 'admin' && <span className="emp-you-label">You: </span>}
                      {(conv.last_message || '').length > 40
                        ? conv.last_message.slice(0, 40) + '...'
                        : conv.last_message}
                    </p>
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="emp-unread-badge">{conv.unread_count}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ═══ Right Panel ═══ */}
        <div className="emp-support-chat">
          {showRatings ? (
            /* ── Ratings View ── */
            <div className="emp-ratings-panel">
              <div className="emp-ratings-header">
                <button className="emp-back-btn" onClick={() => setShowRatings(false)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                  Back
                </button>
                <h3>Support Ratings</h3>
              </div>
              {agentRatings.length === 0 ? (
                <div className="emp-empty-state">
                  <p>No ratings yet.</p>
                </div>
              ) : (
                <>
                  <div className="emp-ratings-section">
                    <h4 className="emp-ratings-subtitle">Agent Summary</h4>
                    {agentRatings.map(r => (
                      <div key={r.agent_id} className="emp-rating-card">
                        <div className="emp-rating-card-top">
                          <strong>{r.agent_name}</strong>
                          <span className="emp-stars">
                            {'★'.repeat(Math.round(r.avg_rating))}{'☆'.repeat(5 - Math.round(r.avg_rating))}
                            {' '}{Number(r.avg_rating).toFixed(1)}/5
                          </span>
                        </div>
                        <small className="emp-rating-count">
                          {r.total_ratings} rating{r.total_ratings !== 1 ? 's' : ''}
                        </small>
                      </div>
                    ))}
                  </div>
                  {recentRatings.length > 0 && (
                    <div className="emp-ratings-section" style={{ marginTop: 16 }}>
                      <h4 className="emp-ratings-subtitle">Recent Ratings</h4>
                      {recentRatings.map((r, idx) => (
                        <div key={idx} className="emp-rating-card emp-rating-recent">
                          <div className="emp-rating-card-top">
                            <span>
                              <strong>{r.display_name}</strong>
                              <span className="emp-rating-username"> @{r.username}</span>
                            </span>
                            <span className="emp-stars">
                              {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                            </span>
                          </div>
                          <div className="emp-rating-meta">
                            <span>Agent: {r.agent_name}</span>
                            <span>{timeAgo(r.created_at)}</span>
                          </div>
                          {r.comment && <p className="emp-rating-comment">{r.comment}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : !activeChat ? (
            /* ── Empty State ── */
            <div className="emp-chat-empty">
              <div className="emp-chat-empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#8b8d97" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <p>Select a conversation to start replying</p>
            </div>
          ) : (
            /* ── Active Chat View ── */
            <>
              {/* Chat Header */}
              <div className="emp-chat-header">
                <span className="emp-avatar-sm" style={{ background: activeChat.avatar_color || '#6c5ce7' }}>
                  {(activeChat.display_name || '?')[0].toUpperCase()}
                </span>
                <div className="emp-chat-header-info">
                  <strong>{activeChat.display_name}</strong>
                  <small>@{activeChat.username}</small>
                </div>
                {activeChat.category && CATEGORY_LABELS[activeChat.category] && (
                  <span className="emp-cat-tag" style={{ background: CATEGORY_LABELS[activeChat.category].color, marginLeft: 8 }}>
                    {CATEGORY_LABELS[activeChat.category].label}
                  </span>
                )}
                {activeChat.conv_status === 'closed' && (
                  <span className="emp-status-tag closed" style={{ marginLeft: 8 }}>Closed</span>
                )}
                <div className="emp-chat-header-actions">
                  {isChatActive && (
                    <button className="emp-end-chat-btn" onClick={handleEndChat}>
                      End Chat
                    </button>
                  )}
                </div>
              </div>

              {/* Keepalive Banners */}
              {keepalivePrompts.length > 0 && (
                <div className="emp-keepalive-container">
                  {keepalivePrompts.map(p => (
                    <div key={p.id} className="emp-keepalive-banner">
                      <div className="emp-keepalive-icon">&#9200;</div>
                      <div className="emp-keepalive-text">
                        <strong>Chat idle for 30 minutes</strong>
                        <span>Chat with {p.display_name} (@{p.username}) -- Keep open?</span>
                      </div>
                      <div className="emp-keepalive-actions">
                        <button className="emp-keepalive-keep" onClick={() => handleKeepalive(p.conversation_id, true)}>
                          Keep Open
                        </button>
                        <button className="emp-keepalive-close" onClick={() => handleKeepalive(p.conversation_id, false)}>
                          End Chat
                        </button>
                      </div>
                      <KeepaliveTimer promptedAt={p.prompted_at} />
                    </div>
                  ))}
                </div>
              )}

              {/* Messages Area */}
              <div className="emp-chat-messages">
                {messages.map((msg, idx) => {
                  const file = parseFileMessage(msg.content)
                  const showAgentLabel = msg.sender === 'admin' && msg.agent_name && (
                    idx === 0 ||
                    messages[idx - 1]?.sender !== 'admin' ||
                    messages[idx - 1]?.agent_name !== msg.agent_name
                  )

                  return (
                    <div key={msg.id || idx} className={`emp-bubble ${msg.sender}`}>
                      {showAgentLabel && (
                        <span className="emp-agent-label">Agent: {msg.agent_name}</span>
                      )}
                      {idx === 0 && msg.category && CATEGORY_LABELS[msg.category] && (
                        <span className="emp-cat-tag" style={{ background: CATEGORY_LABELS[msg.category].color }}>
                          {CATEGORY_LABELS[msg.category].label}
                        </span>
                      )}
                      {file ? (
                        file.isImage ? (
                          <a href={file.url} target="_blank" rel="noopener noreferrer" className="emp-file-link">
                            <img src={file.url} alt={file.name} className="emp-file-image" />
                            <span className="emp-file-name">{file.name}</span>
                          </a>
                        ) : (
                          <a href={file.url} target="_blank" rel="noopener noreferrer" className="emp-file-link">
                            <span className="emp-file-icon">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                              </svg>
                            </span>
                            <span className="emp-file-name">{file.name}</span>
                          </a>
                        )
                      ) : (
                        <p>{msg.content}</p>
                      )}
                      <span className="emp-bubble-time">{timeAgo(msg.created_at)}</span>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input or Closed Bar */}
              {isChatActive ? (
                <form className="emp-chat-input" onSubmit={handleSend}>
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
                  <button type="submit" className="emp-send-btn" disabled={!newMessage.trim() || sending}>
                    {sending ? (
                      <span className="emp-send-spinner"></span>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>
                    )}
                  </button>
                </form>
              ) : (
                <div className="emp-chat-closed-bar">
                  This conversation has been closed.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        .emp-customer-care {
          height: calc(100vh - 40px);
          display: flex;
          flex-direction: column;
        }

        .emp-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          color: #8b8d97;
          font-size: 14px;
          gap: 12px;
        }

        .emp-loading-spinner {
          width: 36px;
          height: 36px;
          border: 3px solid #2a2d38;
          border-top-color: #6c5ce7;
          border-radius: 50%;
          animation: emp-spin 0.8s linear infinite;
        }

        @keyframes emp-spin {
          to { transform: rotate(360deg); }
        }

        /* ═══ Layout ═══ */
        .emp-support-layout {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 16px;
          height: 100%;
          min-height: 0;
        }

        /* ═══ Sidebar ═══ */
        .emp-support-sidebar {
          background: #1a1d26;
          border: 1px solid #2a2d38;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .emp-support-sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid #2a2d38;
          flex-shrink: 0;
        }

        .emp-support-sidebar-header h3 {
          font-size: 14px;
          font-weight: 600;
          color: #e4e4e7;
          margin: 0;
        }

        .emp-ratings-btn {
          padding: 4px 10px;
          background: rgba(243, 156, 18, 0.12);
          border: 1px solid rgba(243, 156, 18, 0.25);
          border-radius: 6px;
          color: #f39c12;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }

        .emp-ratings-btn:hover {
          background: rgba(243, 156, 18, 0.2);
        }

        /* Search */
        .emp-search-container {
          position: relative;
          padding: 8px 12px;
          border-bottom: 1px solid #2a2d38;
          flex-shrink: 0;
        }

        .emp-search-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .emp-search-icon {
          position: absolute;
          left: 10px;
          pointer-events: none;
        }

        .emp-search-input {
          width: 100%;
          padding: 8px 28px 8px 32px;
          background: #0f1117;
          border: 1px solid #2a2d38;
          border-radius: 8px;
          color: #e4e4e7;
          font-size: 13px;
          outline: none;
          transition: border-color 0.15s;
        }

        .emp-search-input:focus {
          border-color: #6c5ce7;
        }

        .emp-search-input::placeholder {
          color: #8b8d97;
        }

        .emp-search-clear {
          position: absolute;
          right: 6px;
          background: none;
          border: none;
          color: #8b8d97;
          font-size: 16px;
          cursor: pointer;
          padding: 2px 6px;
          line-height: 1;
        }

        .emp-search-clear:hover {
          color: #e4e4e7;
        }

        .emp-search-dropdown {
          position: absolute;
          top: 100%;
          left: 12px;
          right: 12px;
          background: #1a1d26;
          border: 1px solid #2a2d38;
          border-radius: 8px;
          max-height: 240px;
          overflow-y: auto;
          z-index: 50;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }

        .emp-search-loading,
        .emp-search-empty {
          padding: 14px 16px;
          font-size: 12px;
          color: #8b8d97;
          text-align: center;
        }

        .emp-search-result {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          cursor: pointer;
          transition: background 0.15s;
          border-bottom: 1px solid #2a2d38;
        }

        .emp-search-result:last-child {
          border-bottom: none;
        }

        .emp-search-result:hover {
          background: #22252f;
        }

        .emp-search-result strong {
          font-size: 13px;
          color: #e4e4e7;
        }

        .emp-search-result small {
          font-size: 11px;
          color: #8b8d97;
          display: block;
        }

        /* Avatar */
        .emp-avatar-sm {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
        }

        /* Conversation list */
        .emp-conv-list {
          flex: 1;
          overflow-y: auto;
        }

        .emp-conv-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid #2a2d38;
          cursor: pointer;
          transition: background 0.15s;
        }

        .emp-conv-item:hover,
        .emp-conv-item.active {
          background: #22252f;
        }

        .emp-conv-item.active {
          border-left: 3px solid #6c5ce7;
          padding-left: 11px;
        }

        .emp-conv-item.unread {
          background: rgba(108, 92, 231, 0.05);
        }

        .emp-conv-info {
          flex: 1;
          min-width: 0;
        }

        .emp-conv-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 2px;
        }

        .emp-conv-top strong {
          font-size: 13px;
          color: #e4e4e7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .emp-conv-time {
          font-size: 11px;
          color: #8b8d97;
          flex-shrink: 0;
          margin-left: 8px;
        }

        .emp-conv-meta {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
          margin-bottom: 3px;
        }

        .emp-cat-tag {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 600;
          color: #fff;
          line-height: 1.5;
        }

        .emp-status-tag {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 600;
          line-height: 1.5;
        }

        .emp-status-tag.closed {
          background: rgba(139, 141, 151, 0.2);
          color: #8b8d97;
        }

        .emp-agent-tag {
          font-size: 10px;
          color: #8b8d97;
          background: rgba(139, 141, 151, 0.1);
          padding: 1px 6px;
          border-radius: 3px;
        }

        .emp-rating-tag {
          font-size: 10px;
          color: #f39c12;
        }

        .emp-conv-preview {
          font-size: 12px;
          color: #8b8d97;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .emp-you-label {
          color: #6c5ce7;
          font-weight: 600;
        }

        .emp-unread-badge {
          background: #6c5ce7;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          min-width: 20px;
          height: 20px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          padding: 0 6px;
        }

        .emp-empty-row {
          padding: 32px 16px;
          text-align: center;
          color: #8b8d97;
          font-size: 13px;
        }

        /* ═══ Chat Panel ═══ */
        .emp-support-chat {
          background: #1a1d26;
          border: 1px solid #2a2d38;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-height: 0;
        }

        /* Chat Empty */
        .emp-chat-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: #8b8d97;
          font-size: 14px;
        }

        .emp-chat-empty-icon {
          opacity: 0.4;
        }

        .emp-chat-empty p {
          margin: 0;
        }

        /* Chat Header */
        .emp-chat-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-bottom: 1px solid #2a2d38;
          flex-shrink: 0;
        }

        .emp-chat-header-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .emp-chat-header-info strong {
          font-size: 14px;
          color: #e4e4e7;
        }

        .emp-chat-header-info small {
          font-size: 11px;
          color: #8b8d97;
        }

        .emp-chat-header-actions {
          margin-left: auto;
          display: flex;
          gap: 8px;
        }

        .emp-end-chat-btn {
          padding: 6px 14px;
          background: rgba(231, 76, 60, 0.12);
          border: 1px solid rgba(231, 76, 60, 0.25);
          border-radius: 6px;
          color: #e74c3c;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }

        .emp-end-chat-btn:hover {
          background: rgba(231, 76, 60, 0.2);
        }

        /* Keepalive Banners */
        .emp-keepalive-container {
          border-bottom: 1px solid #2a2d38;
          flex-shrink: 0;
        }

        .emp-keepalive-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          background: rgba(243, 156, 18, 0.06);
          border-bottom: 1px solid rgba(243, 156, 18, 0.12);
        }

        .emp-keepalive-banner:last-child {
          border-bottom: none;
        }

        .emp-keepalive-icon {
          font-size: 20px;
          flex-shrink: 0;
        }

        .emp-keepalive-text {
          flex: 1;
          min-width: 0;
        }

        .emp-keepalive-text strong {
          display: block;
          font-size: 12px;
          color: #f39c12;
          margin-bottom: 2px;
        }

        .emp-keepalive-text span {
          font-size: 11px;
          color: #8b8d97;
        }

        .emp-keepalive-actions {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }

        .emp-keepalive-keep {
          padding: 4px 10px;
          background: rgba(46, 204, 113, 0.15);
          border: 1px solid rgba(46, 204, 113, 0.3);
          border-radius: 5px;
          color: #2ecc71;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }

        .emp-keepalive-keep:hover {
          background: rgba(46, 204, 113, 0.25);
        }

        .emp-keepalive-close {
          padding: 4px 10px;
          background: rgba(231, 76, 60, 0.12);
          border: 1px solid rgba(231, 76, 60, 0.25);
          border-radius: 5px;
          color: #e74c3c;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }

        .emp-keepalive-close:hover {
          background: rgba(231, 76, 60, 0.2);
        }

        .emp-keepalive-timer {
          font-size: 13px;
          font-weight: 700;
          color: #f39c12;
          font-variant-numeric: tabular-nums;
          min-width: 40px;
          text-align: center;
          flex-shrink: 0;
        }

        .emp-keepalive-timer.urgent {
          color: #e74c3c;
          animation: emp-pulse 1s ease-in-out infinite;
        }

        @keyframes emp-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* Messages */
        .emp-chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: 0;
        }

        .emp-bubble {
          max-width: 75%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.5;
          position: relative;
          word-break: break-word;
        }

        .emp-bubble p {
          margin: 0;
        }

        .emp-bubble.user {
          background: #0f1117;
          color: #e4e4e7;
          margin-right: auto;
          border-bottom-left-radius: 4px;
        }

        .emp-bubble.admin {
          background: #6c5ce7;
          color: #fff;
          margin-left: auto;
          border-bottom-right-radius: 4px;
        }

        .emp-bubble.system {
          background: rgba(243, 156, 18, 0.1);
          color: #f39c12;
          margin: 4px auto;
          text-align: center;
          font-size: 12px;
          max-width: 90%;
          border-radius: 8px;
        }

        .emp-agent-label {
          display: block;
          font-size: 10px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 4px;
          letter-spacing: 0.2px;
        }

        .emp-bubble.user .emp-agent-label {
          color: #8b8d97;
        }

        .emp-bubble-time {
          display: block;
          font-size: 10px;
          margin-top: 4px;
          opacity: 0.6;
          text-align: right;
        }

        /* File attachments */
        .emp-file-link {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          color: inherit;
        }

        .emp-file-image {
          max-width: 200px;
          max-height: 150px;
          border-radius: 8px;
          object-fit: cover;
        }

        .emp-file-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          flex-shrink: 0;
        }

        .emp-file-name {
          font-size: 12px;
          text-decoration: underline;
          word-break: break-all;
        }

        /* Message Input */
        .emp-chat-input {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          padding: 12px 16px;
          border-top: 1px solid #2a2d38;
          flex-shrink: 0;
        }

        .emp-chat-input textarea {
          flex: 1;
          padding: 10px 14px;
          background: #0f1117;
          border: 1px solid #2a2d38;
          border-radius: 8px;
          color: #e4e4e7;
          font-size: 13px;
          font-family: inherit;
          resize: none;
          outline: none;
          line-height: 1.4;
          max-height: 120px;
          transition: border-color 0.15s;
        }

        .emp-chat-input textarea:focus {
          border-color: #6c5ce7;
        }

        .emp-chat-input textarea::placeholder {
          color: #8b8d97;
        }

        .emp-send-btn {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #6c5ce7;
          border: none;
          border-radius: 8px;
          color: #fff;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.15s, opacity 0.15s;
        }

        .emp-send-btn:hover:not(:disabled) {
          background: #7c6ff0;
        }

        .emp-send-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .emp-send-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: emp-spin 0.8s linear infinite;
        }

        /* Closed bar */
        .emp-chat-closed-bar {
          padding: 14px 16px;
          text-align: center;
          border-top: 1px solid #2a2d38;
          color: #8b8d97;
          font-size: 13px;
          background: rgba(139, 141, 151, 0.05);
          flex-shrink: 0;
        }

        /* ═══ Ratings Panel ═══ */
        .emp-ratings-panel {
          flex: 1;
          overflow-y: auto;
          padding: 0;
        }

        .emp-ratings-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid #2a2d38;
          position: sticky;
          top: 0;
          background: #1a1d26;
          z-index: 5;
        }

        .emp-ratings-header h3 {
          font-size: 15px;
          font-weight: 600;
          color: #e4e4e7;
          margin: 0;
        }

        .emp-back-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          background: rgba(139, 141, 151, 0.1);
          border: 1px solid #2a2d38;
          border-radius: 6px;
          color: #e4e4e7;
          font-size: 12px;
          cursor: pointer;
          transition: background 0.15s;
        }

        .emp-back-btn:hover {
          background: rgba(139, 141, 151, 0.2);
        }

        .emp-ratings-section {
          padding: 16px;
        }

        .emp-ratings-subtitle {
          font-size: 13px;
          font-weight: 600;
          color: #8b8d97;
          margin: 0 0 12px 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .emp-rating-card {
          background: #0f1117;
          border: 1px solid #2a2d38;
          border-radius: 8px;
          padding: 12px 14px;
          margin-bottom: 8px;
        }

        .emp-rating-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
        }

        .emp-rating-card-top strong {
          font-size: 13px;
          color: #e4e4e7;
        }

        .emp-stars {
          color: #f39c12;
          font-size: 13px;
        }

        .emp-rating-count {
          font-size: 11px;
          color: #8b8d97;
        }

        .emp-rating-username {
          font-size: 11px;
          color: #8b8d97;
          font-weight: 400;
        }

        .emp-rating-meta {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #8b8d97;
          margin-top: 4px;
        }

        .emp-rating-comment {
          font-size: 12px;
          color: #e4e4e7;
          margin: 6px 0 0 0;
          font-style: italic;
          opacity: 0.8;
          line-height: 1.4;
        }

        .emp-empty-state {
          padding: 40px 16px;
          text-align: center;
          color: #8b8d97;
          font-size: 13px;
        }

        .emp-empty-state p {
          margin: 0;
        }

        /* ═══ Responsive ═══ */
        @media (max-width: 768px) {
          .emp-support-layout {
            grid-template-columns: 1fr;
            grid-template-rows: 240px 1fr;
          }

          .emp-bubble {
            max-width: 88%;
          }

          .emp-conv-item {
            padding: 10px 12px;
          }
        }
      `}</style>
    </div>
  )
}
