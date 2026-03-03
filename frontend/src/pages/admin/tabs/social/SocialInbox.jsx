import { useState, useEffect, useCallback, useRef } from 'react'
import { useAdmin } from '../../context/AdminContext'

const PLATFORM_ICONS = {
  telegram: '\u{1F4AC}',
  whatsapp: '\u{1F4F1}',
  facebook: '\u{1F30D}',
  instagram: '\u{1F4F7}',
  x: '\u{1D54F}',
}

const PLATFORM_COLORS = {
  telegram: '#0088cc',
  whatsapp: '#25d366',
  facebook: '#1877f2',
  instagram: '#e1306c',
  x: '#fff',
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function SocialInbox({ accounts }) {
  const { getAuthHeaders } = useAdmin()
  const [conversations, setConversations] = useState([])
  const [activeConvId, setActiveConvId] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [platformFilter, setPlatformFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [templates, setTemplates] = useState([])
  const [showTemplates, setShowTemplates] = useState(false)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const sseRef = useRef(null)

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (platformFilter !== 'all') params.set('platform', platformFilter)
      if (searchQuery) params.set('search', searchQuery)
      const res = await fetch(`/api/admin/social/conversations?${params}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch {}
    setLoadingConvs(false)
  }, [getAuthHeaders, platformFilter, searchQuery])

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async (convId) => {
    if (!convId) return
    setLoadingMsgs(true)
    try {
      const res = await fetch(`/api/admin/social/conversations/${convId}/messages`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch {}
    setLoadingMsgs(false)
  }, [getAuthHeaders])

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/social/templates', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
      }
    } catch {}
  }, [getAuthHeaders])

  useEffect(() => {
    fetchConversations()
    fetchTemplates()
  }, [fetchConversations, fetchTemplates])

  useEffect(() => {
    if (activeConvId) {
      fetchMessages(activeConvId)
      // Mark as read
      fetch(`/api/admin/social/conversations/${activeConvId}/read`, {
        method: 'POST', headers: getAuthHeaders()
      }).catch(() => {})
    }
  }, [activeConvId, fetchMessages, getAuthHeaders])

  // SSE for real-time messages
  useEffect(() => {
    const headers = getAuthHeaders()
    const authParam = headers['Authorization'] || headers['x-admin-password'] || ''
    const url = `/api/admin/social/stream?authorization=${encodeURIComponent(authParam)}`

    let es
    try {
      es = new EventSource(url)
      sseRef.current = es

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'new_message' && data.data) {
            const msgData = data.data
            // Refresh conversation list
            fetchConversations()
            // If this message is for the active conversation, refresh messages
            if (msgData.conversation_id === activeConvId) {
              fetchMessages(activeConvId)
            }
          }
        } catch {}
      }

      es.onerror = () => {
        es.close()
        // Reconnect after 5 seconds
        setTimeout(() => {
          if (sseRef.current === es) {
            sseRef.current = null
          }
        }, 5000)
      }
    } catch {}

    return () => {
      if (es) es.close()
    }
  }, [getAuthHeaders, activeConvId, fetchConversations, fetchMessages])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send message
  const handleSend = async () => {
    if (!messageText.trim() || !activeConvId || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/admin/social/conversations/${activeConvId}/send`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_text: messageText.trim(), content_type: 'text' })
      })
      if (res.ok) {
        setMessageText('')
        fetchMessages(activeConvId)
        fetchConversations()
        textareaRef.current?.focus()
      }
    } catch {}
    setSending(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const selectTemplate = (template) => {
    setMessageText(template.content)
    setShowTemplates(false)
    textareaRef.current?.focus()
  }

  const activeConv = conversations.find(c => c.id === activeConvId)

  // Get unique platforms from accounts
  const availablePlatforms = [...new Set(accounts.filter(a => a.status === 'connected').map(a => a.platform))]

  return (
    <div className="social-inbox">
      {/* Conversation List */}
      <div className="social-conv-list">
        <div className="social-conv-list-header">
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="social-conv-search"
          />
        </div>

        <div className="social-conv-filters">
          <button
            className={`social-filter-btn ${platformFilter === 'all' ? 'active' : ''}`}
            onClick={() => setPlatformFilter('all')}
          >
            All
          </button>
          {availablePlatforms.map(p => (
            <button
              key={p}
              className={`social-filter-btn ${platformFilter === p ? 'active' : ''}`}
              onClick={() => setPlatformFilter(p)}
            >
              {PLATFORM_ICONS[p] || p} {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        <div className="social-conv-items">
          {loadingConvs ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--admin-text-muted)' }}>
              Loading...
            </div>
          ) : conversations.length === 0 ? (
            <div className="social-empty-state" style={{ padding: 40 }}>
              <div className="social-empty-icon">{'\u{1F4ED}'}</div>
              <p style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>
                {accounts.length === 0
                  ? 'Connect a platform to start receiving messages'
                  : 'No conversations yet'}
              </p>
            </div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`social-conv-item ${activeConvId === conv.id ? 'active' : ''}`}
                onClick={() => setActiveConvId(conv.id)}
              >
                <div className={`social-conv-avatar ${conv.platform}`}>
                  {PLATFORM_ICONS[conv.platform] || '\u{1F464}'}
                </div>
                <div className="social-conv-info">
                  <div className="social-conv-name">{conv.contact_name || conv.contact_identifier}</div>
                  <div className="social-conv-preview">{conv.last_message_text || 'No messages'}</div>
                </div>
                <div className="social-conv-meta">
                  <span className="social-conv-time">{formatTime(conv.last_message_at)}</span>
                  {conv.unread_count > 0 && (
                    <span className="social-unread-badge">{conv.unread_count}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Panel */}
      <div className="social-chat-panel">
        {activeConv ? (
          <>
            <div className="social-chat-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={`social-conv-avatar ${activeConv.platform}`} style={{ width: 36, height: 36, fontSize: 16 }}>
                  {PLATFORM_ICONS[activeConv.platform]}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {activeConv.contact_name || activeConv.contact_identifier}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
                    {activeConv.platform.charAt(0).toUpperCase() + activeConv.platform.slice(1)}
                    {activeConv.assigned_employee_name && ` \u2022 Assigned to ${activeConv.assigned_employee_name}`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="social-action-btn"
                  onClick={async () => {
                    await fetch(`/api/admin/social/conversations/${activeConvId}/archive`, {
                      method: 'POST', headers: getAuthHeaders()
                    })
                    setActiveConvId(null)
                    fetchConversations()
                  }}
                  title="Archive"
                >
                  {'\u{1F4E6}'}
                </button>
              </div>
            </div>

            <div className="social-chat-messages">
              {loadingMsgs ? (
                <div style={{ textAlign: 'center', color: 'var(--admin-text-muted)', padding: 40 }}>
                  Loading messages...
                </div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--admin-text-muted)', padding: 40 }}>
                  No messages yet. Send a message to start the conversation.
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`social-msg ${msg.direction}`}>
                    {msg.media_url && (
                      <div className="social-msg-media">
                        {msg.content_type === 'image' ? (
                          <img src={msg.media_url} alt="" onClick={() => window.open(msg.media_url, '_blank')} />
                        ) : msg.content_type === 'video' ? (
                          <video src={msg.media_url} controls style={{ maxWidth: 300, borderRadius: 8 }} />
                        ) : (
                          <a href={msg.media_url} target="_blank" rel="noreferrer"
                             style={{ color: '#60a5fa', fontSize: 12 }}>
                            {'\u{1F4CE}'} {msg.media_filename || 'Download file'}
                          </a>
                        )}
                      </div>
                    )}
                    {msg.content_text && <div>{msg.content_text}</div>}
                    <div className="social-msg-meta">
                      <span>{formatTime(msg.created_at)}</span>
                      {msg.direction === 'outbound' && (
                        <span className="social-msg-status">
                          {msg.delivery_status === 'sent' ? '\u2713' :
                           msg.delivery_status === 'delivered' ? '\u2713\u2713' :
                           msg.delivery_status === 'failed' ? '\u2717' : '\u23F3'}
                        </span>
                      )}
                      {msg.sent_by_name && (
                        <span style={{ marginLeft: 4 }}>{msg.sent_by_name}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="social-chat-input">
              <div style={{ position: 'relative', flex: 1 }}>
                <textarea
                  ref={textareaRef}
                  className="social-chat-textarea"
                  placeholder="Type a message..."
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                {showTemplates && templates.length > 0 && (
                  <div className="social-templates-dropdown">
                    {templates.map(t => (
                      <button key={t.id} className="social-template-item" onClick={() => selectTemplate(t)}>
                        <span className="social-template-title">{t.title}</span>
                        <span className="social-template-preview">{t.content.substring(0, 60)}...</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="social-action-btn"
                onClick={() => setShowTemplates(!showTemplates)}
                title="Quick replies"
              >
                {'\u{1F4DD}'}
              </button>
              <button
                className="social-send-btn"
                onClick={handleSend}
                disabled={!messageText.trim() || sending}
              >
                {sending ? '\u23F3' : 'Send'}
              </button>
            </div>
          </>
        ) : (
          <div className="social-empty-state">
            <div className="social-empty-icon">{'\u{1F4AC}'}</div>
            <h4 style={{ color: 'var(--admin-text)', marginBottom: 8 }}>Select a conversation</h4>
            <p style={{ color: 'var(--admin-text-muted)', fontSize: 13, maxWidth: 300 }}>
              Choose a conversation from the list to view messages and reply.
              Messages from connected platforms will appear here in real-time.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
