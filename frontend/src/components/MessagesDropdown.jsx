import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

export default function MessagesDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const [conversations, setConversations] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const dropdownRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
        setActiveChat(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Use axios without manual headers - AuthContext sets Authorization globally
  const fetchUnreadCount = async () => {
    try {
      const res = await axios.get('/api/messages-unread-count')
      setUnreadCount(res.data.unread_count || 0)
    } catch (err) { /* silent */ }
  }

  const fetchConversations = async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/messages/conversations')
      setConversations(res.data.conversations || [])
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchMessages = async (otherId) => {
    try {
      const res = await axios.get(`/api/messages/${otherId}`)
      setMessages(res.data.messages || [])
      fetchUnreadCount()
    } catch (err) {
      console.error('Failed to fetch messages:', err)
    }
  }

  const handleOpen = () => {
    if (!isOpen) {
      fetchConversations()
    }
    setIsOpen(!isOpen)
    setActiveChat(null)
  }

  const openChat = (conv) => {
    // Guard: support conversations should open the support widget, not DMs
    if (conv.is_support || conv.other_id === -1) {
      window.dispatchEvent(new Event('open-support-chat'))
      setIsOpen(false)
      return
    }
    setActiveChat(conv)
    fetchMessages(conv.other_id)
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !activeChat || sending) return
    setSending(true)
    try {
      await axios.post('/api/messages/send', {
        receiver_id: activeChat.other_id,
        content: newMessage.trim()
      })
      setNewMessage('')
      fetchMessages(activeChat.other_id)
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Now'
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
  }

  return (
    <div className="messages-dropdown-wrapper" ref={dropdownRef}>
      <button className="messages-bell-btn" onClick={handleOpen} title="Messages">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {unreadCount > 0 && (
          <span className="messages-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="messages-dropdown">
          {!activeChat ? (
            <>
              <div className="messages-dropdown-header">
                <span className="messages-dropdown-title">Messages</span>
              </div>
              <div className="messages-dropdown-body">
                {loading ? (
                  <div className="messages-loading">Loading...</div>
                ) : conversations.length === 0 ? (
                  <div className="messages-empty">
                    <p>No messages yet</p>
                    <p className="messages-empty-sub">Messages from other users will appear here</p>
                  </div>
                ) : (
                  conversations.map(conv => (
                    <div
                      key={conv.is_support ? 'support' : conv.other_id}
                      className={`messages-conv-item ${conv.unread_count > 0 ? 'unread' : ''} ${conv.is_support ? 'support-conv' : ''}`}
                      onClick={() => {
                        if (conv.is_support) {
                          window.dispatchEvent(new Event('open-support-chat'))
                          setIsOpen(false)
                        } else {
                          openChat(conv)
                        }
                      }}
                    >
                      {conv.is_support ? (
                        <div className="messages-conv-avatar messages-support-avatar" style={{ background: '#6c5ce7' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                          </svg>
                        </div>
                      ) : (
                      <div className="messages-conv-avatar" style={{ background: conv.other_avatar || '#6c5ce7' }}>
                        {(conv.other_name || '?')[0].toUpperCase()}
                      </div>
                      )}
                      <div className="messages-conv-info">
                        <div className="messages-conv-top">
                          <span className="messages-conv-name">{conv.other_name}</span>
                          <span className="messages-conv-time">{timeAgo(conv.last_message_at)}</span>
                        </div>
                        <p className="messages-conv-preview">
                          {conv.is_mine && <span className="messages-you">You: </span>}
                          {conv.last_message.length > 50
                            ? conv.last_message.slice(0, 50) + '...'
                            : conv.last_message}
                        </p>
                      </div>
                      {conv.unread_count > 0 && (
                        <span className="messages-conv-badge">{conv.unread_count}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="messages-chat-header">
                <button className="messages-back-btn" onClick={() => { setActiveChat(null); fetchConversations() }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <div className="messages-chat-avatar" style={{ background: activeChat.other_avatar || '#6c5ce7' }}>
                  {(activeChat.other_name || '?')[0].toUpperCase()}
                </div>
                <span className="messages-chat-name">{activeChat.other_name}</span>
              </div>
              <div className="messages-chat-body">
                {messages.length === 0 ? (
                  <div className="messages-chat-empty">No messages yet. Say hello!</div>
                ) : (
                  messages.map(msg => (
                    <div key={msg.id} className={`messages-bubble ${msg.is_mine ? 'mine' : 'theirs'}`}>
                      <p>{msg.content}</p>
                      <span className="messages-bubble-time">{timeAgo(msg.created_at)}</span>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <form className="messages-chat-input" onSubmit={handleSend}>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  maxLength={1000}
                />
                <button type="submit" disabled={!newMessage.trim() || sending}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  )
}
