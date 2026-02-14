import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { playSwoosh } from '../sounds'

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

const CATEGORIES = [
  { id: 'payment', label: 'Payment Related', icon: '💳' },
  { id: 'subscription', label: 'Subscription', icon: '💎' },
  { id: 'predictions', label: 'Ads / Predictions', icon: '⚽' },
  { id: 'general', label: 'General Issue', icon: '💬' },
]

export default function SupportChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [aiTyping, setAiTyping] = useState(false)
  const [isEscalated, setIsEscalated] = useState(false)
  // Conversation state
  const [conversationClosed, setConversationClosed] = useState(false)
  const [closedReason, setClosedReason] = useState(null)
  const [agentName, setAgentName] = useState(null)
  // Rating state
  const [showRating, setShowRating] = useState(false)
  const [ratingValue, setRatingValue] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const [ratingSubmitting, setRatingSubmitting] = useState(false)

  const [uploading, setUploading] = useState(false)

  const messagesEndRef = useRef(null)
  const eventSourceRef = useRef(null)
  const reconnectRef = useRef(null)
  const aiTypingTimeoutRef = useRef(null)
  const fileInputRef = useRef(null)

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }

  useEffect(() => { scrollToBottom() }, [messages, aiTyping, showRating])

  // Detect escalation and agent name from messages
  useEffect(() => {
    const hasEscalation = messages.some(
      m => m.sender === 'ai' && (
        m.content.includes('forwarded this conversation to a support agent') ||
        m.content.includes('connected you with a support agent') ||
        m.content.includes('forwarded your issue to an agent')
      )
    )
    setIsEscalated(hasEscalation)

    // Find the agent name from admin messages
    const adminMsg = messages.find(m => m.sender === 'admin' && m.agent_name)
    if (adminMsg) setAgentName(adminMsg.agent_name)

    // Check for system close message
    const closeMsg = messages.find(m => m.sender === 'system')
    if (closeMsg) {
      setConversationClosed(true)
      if (closeMsg.content.includes('inactivity')) {
        setClosedReason('inactivity')
      } else {
        setClosedReason('agent_closed')
        // Show rating prompt if agent closed and not yet rated
        if (!ratingSubmitted) {
          setShowRating(true)
        }
      }
    }
  }, [messages, ratingSubmitted])

  // Listen for external open-support-chat events (from profile menu, messages dropdown)
  useEffect(() => {
    const handleOpenEvent = () => {
      if (!isOpen) {
        fetchMessages()
      }
      setIsOpen(true)
    }
    window.addEventListener('open-support-chat', handleOpenEvent)
    return () => window.removeEventListener('open-support-chat', handleOpenEvent)
  }, [isOpen])

  // SSE for real-time messages
  const connectSSE = useCallback(() => {
    const token = localStorage.getItem('spark_token')
    if (!token) return

    if (eventSourceRef.current) eventSourceRef.current.close()

    const es = new EventSource(`/api/support/stream?token=${token}`)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'init') {
          setUnreadCount(data.unread_count || 0)
        } else if (data.type === 'new') {
          setUnreadCount(data.unread_count || 0)
          if (data.message) {
            // Play notification sound for incoming messages (not from user)
            if (data.message.sender !== 'user') {
              playSwoosh()
            }
            // AI or admin message arrived — stop typing indicator
            if (data.message.sender === 'ai' || data.message.sender === 'admin') {
              setAiTyping(false)
              if (aiTypingTimeoutRef.current) clearTimeout(aiTypingTimeoutRef.current)
            }
            // System message = conversation closed
            if (data.message.sender === 'system') {
              setAiTyping(false)
              if (aiTypingTimeoutRef.current) clearTimeout(aiTypingTimeoutRef.current)
              setConversationClosed(true)
              if (data.message.content.includes('inactivity')) {
                setClosedReason('inactivity')
              } else {
                setClosedReason('agent_closed')
                setRatingSubmitted(prev => {
                  if (!prev) setShowRating(true)
                  return prev
                })
              }
            }
            setMessages(prev => {
              if (prev.some(m => m.id === data.message.id)) return prev
              return [...prev, data.message]
            })
          }
        }
      } catch { /* ignore */ }
    }

    es.onerror = () => {
      es.close()
      eventSourceRef.current = null
      reconnectRef.current = setTimeout(connectSSE, 5000)
    }
  }, [])

  useEffect(() => {
    connectSSE()
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close()
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (aiTypingTimeoutRef.current) clearTimeout(aiTypingTimeoutRef.current)
    }
  }, [connectSSE])

  // Fetch conversation status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await axios.get('/api/support/conversation-status')
        if (res.data.has_conversation && res.data.status === 'closed') {
          setConversationClosed(true)
          setClosedReason(res.data.closed_reason)
          if (res.data.assigned_agent_name) setAgentName(res.data.assigned_agent_name)
        }
      } catch { /* ignore */ }
    }
    fetchStatus()
  }, [])

  const fetchMessages = async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/support/messages')
      setMessages(res.data.messages || [])
      setUnreadCount(0)
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleOpen = () => {
    if (!isOpen) {
      fetchMessages()
    }
    setIsOpen(!isOpen)
  }

  const handleCategorySelect = (cat) => {
    setSelectedCategory(cat)
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || sending || conversationClosed) return
    setSending(true)

    // Show typing indicator if not escalated
    if (!isEscalated) {
      setAiTyping(true)
      // Safety timeout: clear typing indicator after 15 seconds no matter what
      if (aiTypingTimeoutRef.current) clearTimeout(aiTypingTimeoutRef.current)
      aiTypingTimeoutRef.current = setTimeout(() => setAiTyping(false), 15000)
    }

    try {
      const payload = { content: newMessage.trim() }
      // Include category only on first message
      if (messages.length === 0 && selectedCategory) {
        payload.category = selectedCategory
      }
      await axios.post('/api/support/send', payload)
      setNewMessage('')
      await fetchMessages()
      // AI response is included in the fetched messages — clear typing
      setAiTyping(false)
      if (aiTypingTimeoutRef.current) clearTimeout(aiTypingTimeoutRef.current)
    } catch (err) {
      setAiTyping(false)
      if (aiTypingTimeoutRef.current) clearTimeout(aiTypingTimeoutRef.current)
      // If conversation is closed, show notification
      if (err.response?.status === 400 && err.response?.data?.detail?.includes('closed')) {
        setConversationClosed(true)
      }
    }
    setSending(false)
  }

  const handleEscalate = async () => {
    try {
      await axios.post('/api/support/escalate')
      fetchMessages()
    } catch { /* ignore */ }
  }

  const handleNewConversation = async () => {
    try {
      await axios.post('/api/support/new-conversation')
      // Reset all state
      setMessages([])
      setConversationClosed(false)
      setClosedReason(null)
      setShowRating(false)
      setRatingValue(0)
      setRatingComment('')
      setRatingSubmitted(false)
      setSelectedCategory(null)
      setIsEscalated(false)
      setAgentName(null)
      setAiTyping(false)
    } catch { /* ignore */ }
  }

  const handleSubmitRating = async () => {
    if (ratingValue < 1) return
    setRatingSubmitting(true)
    try {
      await axios.post('/api/support/rate', {
        rating: ratingValue,
        comment: ratingComment.trim(),
      })
      setRatingSubmitted(true)
      setShowRating(false)
    } catch (err) {
      console.error('[Support] Rating submission error:', err.response?.data || err)
      // Still close the rating prompt so user isn't stuck
      setRatingSubmitted(true)
      setShowRating(false)
    }
    setRatingSubmitting(false)
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so same file can be re-selected
    e.target.value = ''

    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10MB.')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await axios.post('/api/support/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await fetchMessages()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to upload file')
    }
    setUploading(false)
  }

  const timeAgo = (dateStr) => {
    // Server stores UTC times without 'Z' suffix — append it so browser parses as UTC
    const utcStr = dateStr && !dateStr.endsWith('Z') && !dateStr.includes('+') ? dateStr + 'Z' : dateStr
    const diff = Date.now() - new Date(utcStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  // Check if we need to show category selection (no messages yet and no category selected)
  const showCategoryPicker = messages.length === 0 && !selectedCategory && !loading && !conversationClosed

  return (
    <>
      {/* Floating Action Button */}
      <button className={`support-chat-fab ${unreadCount > 0 ? 'has-unread' : ''}`} onClick={handleOpen} title="Support Chat">
        {isOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <line x1="9" y1="10" x2="15" y2="10" />
            <line x1="12" y1="7" x2="12" y2="13" />
          </svg>
        )}
        {unreadCount > 0 && !isOpen && (
          <span className="support-chat-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="support-chat-window">
          <div className="support-chat-header">
            <div className="support-chat-header-info">
              <span className="support-chat-header-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <div>
                <strong>Support Chat</strong>
                <span className="support-chat-status">
                  {conversationClosed ? 'Conversation ended' : isEscalated ? (agentName ? `Agent: ${agentName}` : 'Connected to agent') : 'Powered by Spark AI'}
                </span>
              </div>
            </div>
            <button className="support-chat-close" onClick={() => setIsOpen(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="support-chat-messages">
            {loading ? (
              <div className="support-chat-loading">Loading...</div>
            ) : showCategoryPicker ? (
              <div className="support-chat-categories">
                <p className="support-chat-categories-title">Hi there! How can we help you?</p>
                <p className="support-chat-categories-sub">Select a topic to get started:</p>
                <div className="support-chat-category-grid">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      className="support-chat-category-btn"
                      onClick={() => handleCategorySelect(cat.id)}
                    >
                      <span className="support-cat-icon">{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.length === 0 && selectedCategory && !conversationClosed && (
                  <div className="support-chat-empty">
                    <span className="support-category-tag">{CATEGORIES.find(c => c.id === selectedCategory)?.label}</span>
                    <p>Describe your issue and we'll get back to you shortly.</p>
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <div key={msg.id} className={`support-bubble ${msg.sender}`}>
                    {msg.sender === 'ai' && (idx === 0 || messages[idx - 1]?.sender !== 'ai') && (
                      <span className="support-ai-label">
                        <span className="support-ai-icon">✦</span> Spark AI
                      </span>
                    )}
                    {msg.sender === 'admin' && (idx === 0 || messages[idx - 1]?.sender !== 'admin' || messages[idx - 1]?.agent_name !== msg.agent_name) && (
                      <span className="support-agent-label">
                        {msg.agent_name ? `Agent: ${msg.agent_name}` : 'Support Agent'}
                      </span>
                    )}
                    {msg.sender === 'system' && (
                      <span className="support-system-label">System</span>
                    )}
                    {idx === 0 && msg.category && (
                      <span className="support-category-tag">{CATEGORIES.find(c => c.id === msg.category)?.label || msg.category}</span>
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
                    <span className="support-bubble-time">{timeAgo(msg.created_at)}</span>
                  </div>
                ))}

                {/* AI Typing Indicator */}
                {aiTyping && (
                  <div className="support-bubble ai support-typing-bubble">
                    <span className="support-ai-label">
                      <span className="support-ai-icon">✦</span> Spark AI
                    </span>
                    <div className="support-typing-indicator">
                      <span className="support-typing-dot"></span>
                      <span className="support-typing-dot"></span>
                      <span className="support-typing-dot"></span>
                    </div>
                  </div>
                )}

                {/* Conversation Closed Banner */}
                {conversationClosed && !showRating && (
                  <div className="support-chat-closed">
                    <p>
                      {closedReason === 'inactivity'
                        ? 'This conversation was closed due to inactivity.'
                        : ratingSubmitted
                          ? 'Thank you for your feedback!'
                          : 'This conversation has ended.'}
                    </p>
                    <button className="support-new-chat-btn" onClick={handleNewConversation}>
                      Start New Conversation
                    </button>
                  </div>
                )}

                {/* Rating Prompt */}
                {showRating && !ratingSubmitted && (
                  <div className="support-rating-prompt">
                    <p className="support-rating-title">How was your experience?</p>
                    <div className="support-rating-stars">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          className={`support-star ${ratingValue >= star ? 'active' : ''}`}
                          onClick={() => setRatingValue(star)}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="support-rating-comment"
                      placeholder="Optional: Tell us more about your experience..."
                      value={ratingComment}
                      onChange={(e) => setRatingComment(e.target.value)}
                      rows={2}
                      maxLength={500}
                    />
                    <div className="support-rating-actions">
                      <button
                        className="support-rating-skip"
                        onClick={() => { setShowRating(false); setRatingSubmitted(true) }}
                      >
                        Skip
                      </button>
                      <button
                        className="support-rating-submit"
                        onClick={handleSubmitRating}
                        disabled={ratingValue < 1 || ratingSubmitting}
                      >
                        {ratingSubmitting ? 'Submitting...' : 'Submit Rating'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {!showCategoryPicker && !conversationClosed && (
            <div className="support-chat-bottom">
              <form className="support-chat-input" onSubmit={handleSend}>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx" />
                <button type="button" className="support-attach-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach file (max 10MB)">
                  {uploading ? (
                    <span className="support-attach-spinner" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  )}
                </button>
                <textarea
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value)
                    // Auto-grow: reset height then set to scrollHeight
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (newMessage.trim() && !sending) handleSend(e)
                    }
                  }}
                  placeholder="Type your message..."
                  maxLength={2000}
                  autoFocus
                  rows={1}
                />
                <button type="submit" disabled={!newMessage.trim() || sending}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>
              {!isEscalated && messages.length > 0 && (
                <button className="support-escalate-btn" onClick={handleEscalate}>
                  Talk to a person
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
