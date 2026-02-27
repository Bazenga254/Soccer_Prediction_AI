import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

const SUGGESTIONS = [
  "What are the best matches to bet on today?",
  "Give me a 3-match accumulator with high confidence",
  "Which teams have injury concerns today?",
  "What are today's safest picks for over 2.5 goals?",
  "Recommend matches with both teams likely to score",
  "Which match has the strongest home advantage today?",
]

function AIAssistant() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [creditsRemaining, setCreditsRemaining] = useState(null)

  const token = localStorage.getItem('spark_token')

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  }

  // Load conversations on mount
  useEffect(() => {
    if (token) {
      loadConversations()
    }
  }, [token])

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadConversations() {
    try {
      setLoadingConversations(true)
      const res = await fetch('/api/ai-assistant/conversations', { headers: authHeaders })
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch (e) {
      console.error('Failed to load conversations:', e)
    } finally {
      setLoadingConversations(false)
    }
  }

  async function loadMessages(conversationId) {
    try {
      const res = await fetch(`/api/ai-assistant/conversations/${conversationId}/messages`, { headers: authHeaders })
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch (e) {
      console.error('Failed to load messages:', e)
    }
  }

  async function handleNewChat() {
    try {
      const res = await fetch('/api/ai-assistant/conversations/new', {
        method: 'POST',
        headers: authHeaders,
      })
      if (res.ok) {
        const data = await res.json()
        setActiveConversation(data.conversation_id)
        setMessages([])
        setSidebarOpen(false)
        loadConversations()
        inputRef.current?.focus()
      }
    } catch (e) {
      console.error('Failed to create conversation:', e)
    }
  }

  async function handleSelectConversation(conv) {
    setActiveConversation(conv.id)
    setSidebarOpen(false)
    await loadMessages(conv.id)
  }

  async function handleDeleteConversation(e, convId) {
    e.stopPropagation()
    if (!confirm('Delete this conversation?')) return
    try {
      await fetch(`/api/ai-assistant/conversations/${convId}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      if (activeConversation === convId) {
        setActiveConversation(null)
        setMessages([])
      }
      loadConversations()
    } catch (e) {
      console.error('Failed to delete conversation:', e)
    }
  }

  async function handleSend(messageText) {
    const msg = messageText || input.trim()
    if (!msg || loading) return

    // Create conversation first if none active
    let convId = activeConversation
    if (!convId) {
      try {
        const res = await fetch('/api/ai-assistant/conversations/new', {
          method: 'POST',
          headers: authHeaders,
        })
        if (res.ok) {
          const data = await res.json()
          convId = data.conversation_id
          setActiveConversation(convId)
        } else {
          return
        }
      } catch (e) {
        console.error('Failed to create conversation:', e)
        return
      }
    }

    // Add user message to UI immediately
    const userMsg = { role: 'user', content: msg, match_links: [], created_at: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai-assistant/chat', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ conversation_id: convId, message: msg }),
      })

      if (res.ok) {
        const data = await res.json()
        const assistantMsg = {
          role: 'assistant',
          content: data.response,
          match_links: data.match_links || [],
          sources: data.sources || [],
          created_at: new Date().toISOString(),
        }
        setMessages(prev => [...prev, assistantMsg])
        if (data.credits_remaining !== undefined) {
          setCreditsRemaining(data.credits_remaining)
        }
        // Update title in sidebar
        if (data.title) {
          setConversations(prev => prev.map(c =>
            c.id === convId ? { ...c, title: data.title, updated_at: new Date().toISOString() } : c
          ))
        }
        loadConversations()
      } else {
        const err = await res.json().catch(() => ({}))
        const errMsg = err.detail || 'Failed to send message. Please try again.'
        setMessages(prev => [...prev, { role: 'assistant', content: errMsg, match_links: [], created_at: new Date().toISOString(), isError: true }])
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Please check your connection.', match_links: [], created_at: new Date().toISOString(), isError: true }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleMatchClick(matchCard) {
    // Navigate to match analysis page
    // The match_key format is typically: {team_a_id}-{team_b_id}-{date}
    // We need to check if already viewed to avoid double-charging
    const matchKey = matchCard.match_key
    if (!matchKey) return

    try {
      // Record view (this endpoint handles dedup + credit deduction)
      const res = await fetch('/api/analysis-views/record', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ match_key: matchKey }),
      })
      if (res.ok) {
        const data = await res.json()
        if (!data.allowed) {
          alert(`Not enough credits. You need ${data.credits_needed} credits.`)
          return
        }
        if (data.credits_remaining !== undefined) {
          setCreditsRemaining(data.credits_remaining)
        }
      }
    } catch (e) {
      console.error('Failed to record view:', e)
    }

    // Parse match_key to get competition and team IDs for navigation
    // fixture_id format: {team_a_id}-{team_b_id}-{YYYYMMDD}
    const parts = matchKey.split('-')
    if (parts.length >= 2) {
      // Navigate to match page - the MatchAnalysis page accepts various URL formats
      navigate(`/match/all/${parts[0]}/${parts[1]}`)
    }
  }

  function renderMessageContent(content, matchLinks) {
    if (!content) return null

    // Remove [MATCH_CARD]...[/MATCH_CARD] blocks from displayed text
    const cleanContent = content.replace(/\[MATCH_CARD\].*?\[\/MATCH_CARD\]/gs, '').trim()

    // Simple markdown-like rendering
    const lines = cleanContent.split('\n')
    const elements = []
    let currentList = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line.startsWith('- ') || line.startsWith('* ')) {
        currentList.push(line.slice(2))
      } else {
        if (currentList.length > 0) {
          elements.push(
            <ul key={`list-${i}`} className="ai-msg-list">
              {currentList.map((item, j) => <li key={j}>{renderBoldText(item)}</li>)}
            </ul>
          )
          currentList = []
        }
        if (line.startsWith('### ')) {
          elements.push(<h4 key={i} className="ai-msg-h4">{line.slice(4)}</h4>)
        } else if (line.startsWith('## ')) {
          elements.push(<h3 key={i} className="ai-msg-h3">{line.slice(3)}</h3>)
        } else if (line.trim() === '') {
          elements.push(<br key={i} />)
        } else {
          elements.push(<p key={i} className="ai-msg-p">{renderBoldText(line)}</p>)
        }
      }
    }

    if (currentList.length > 0) {
      elements.push(
        <ul key="list-end" className="ai-msg-list">
          {currentList.map((item, j) => <li key={j}>{renderBoldText(item)}</li>)}
        </ul>
      )
    }

    return elements
  }

  function renderBoldText(text) {
    // Handle **bold** text
    const parts = text.split(/(\*\*.*?\*\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      return part
    })
  }

  function renderMatchCards(matchLinks) {
    if (!matchLinks || matchLinks.length === 0) return null
    return (
      <div className="ai-match-cards">
        {matchLinks.map((card, i) => (
          <div key={i} className="ai-match-card" onClick={() => handleMatchClick(card)}>
            <div className="ai-match-card-teams">
              <span className="ai-match-card-home">{card.home}</span>
              <span className="ai-match-card-vs">vs</span>
              <span className="ai-match-card-away">{card.away}</span>
            </div>
            <div className="ai-match-card-league">{card.league}</div>
            <div className="ai-match-card-action">
              View Full Analysis <span className="ai-match-card-cost">250 cr</span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!user) {
    return (
      <div className="ai-assistant-page">
        <div className="ai-login-prompt">
          <div className="ai-login-icon">{'\u{1F916}'}</div>
          <h2>AI Assistant</h2>
          <p>Please log in to use the AI Assistant.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="ai-assistant-page">
      {/* Mobile sidebar toggle */}
      <button className="ai-sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? '\u2715' : '\u2630'} History
      </button>

      {/* Sidebar */}
      <div className={`ai-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="ai-sidebar-header">
          <h3>Conversations</h3>
          <button className="ai-new-chat-btn" onClick={handleNewChat}>+ New</button>
        </div>
        <div className="ai-sidebar-list">
          {loadingConversations ? (
            <div className="ai-sidebar-loading">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="ai-sidebar-empty">No conversations yet</div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`ai-sidebar-item ${activeConversation === conv.id ? 'active' : ''}`}
                onClick={() => handleSelectConversation(conv)}
              >
                <div className="ai-sidebar-item-title">{conv.title}</div>
                <div className="ai-sidebar-item-date">
                  {new Date(conv.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </div>
                <button
                  className="ai-sidebar-item-delete"
                  onClick={(e) => handleDeleteConversation(e, conv.id)}
                  title="Delete"
                >
                  {'\u2715'}
                </button>
              </div>
            ))
          )}
        </div>
        <div className="ai-sidebar-info">
          <small>Max 10 conversations stored</small>
        </div>
      </div>

      {/* Chat Area */}
      <div className="ai-chat-area">
        {/* Header */}
        <div className="ai-chat-header">
          <div className="ai-chat-header-left">
            <span className="ai-chat-header-icon">{'\u{1F916}'}</span>
            <h2>AI Assistant</h2>
          </div>
          <div className="ai-chat-header-right">
            {creditsRemaining !== null && (
              <span className="ai-credits-badge">{'\u26A1'} {creditsRemaining.toLocaleString()} cr</span>
            )}
            <span className="ai-cost-badge">50 cr/msg</span>
          </div>
        </div>

        {/* Messages */}
        <div className="ai-messages-container">
          {messages.length === 0 && !loading ? (
            <div className="ai-welcome">
              <div className="ai-welcome-icon">{'\u{1F916}'}</div>
              <h3>Welcome to Spark AI Assistant</h3>
              <p>I analyze matches using real platform data — predictions, injuries, form, and H2H records. Ask me anything about today's matches!</p>
              <div className="ai-cost-info">
                <span>{'\u26A1'} 50 credits per message</span>
                <span>{'\u{1F4CA}'} 250 credits per match analysis view</span>
              </div>
              <div className="ai-suggestions">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} className="ai-suggestion-chip" onClick={() => handleSend(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div key={i} className={`ai-message ${msg.role} ${msg.isError ? 'error' : ''}`}>
                  <div className="ai-message-avatar">
                    {msg.role === 'user' ? (user?.display_name?.[0] || 'U') : '\u{1F916}'}
                  </div>
                  <div className="ai-message-content">
                    <div className="ai-message-body">
                      {renderMessageContent(msg.content, msg.match_links)}
                    </div>
                    {renderMatchCards(msg.match_links)}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="ai-message-sources">
                        <small>Sources:</small>
                        {msg.sources.map((s, j) => (
                          <a key={j} href={s.url} target="_blank" rel="noopener noreferrer" className="ai-source-link">
                            {s.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="ai-message assistant">
                  <div className="ai-message-avatar">{'\u{1F916}'}</div>
                  <div className="ai-message-content">
                    <div className="ai-typing">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="ai-input-area">
          <div className="ai-input-wrapper">
            <textarea
              ref={inputRef}
              className="ai-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about today's matches..."
              rows={1}
              disabled={loading}
            />
            <button
              className="ai-send-btn"
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
            >
              {loading ? '...' : 'Send'} <span className="ai-send-cost">{'\u26A1'}50</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AIAssistant
