import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'

const TIME_RANGES = [
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 360, label: '6 hours' },
  { value: 1440, label: '24 hours' },
]

export default function BotReplyMonitor({ getAuthHeaders }) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [sinceMinutes, setSinceMinutes] = useState(60)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Reply state
  const [replyTarget, setReplyTarget] = useState(null) // { messageId, matchKey }
  const [replyBotId, setReplyBotId] = useState('')
  const [replyMsg, setReplyMsg] = useState('')
  const [sending, setSending] = useState(false)

  // Active bots for reply dropdown
  const [activeBots, setActiveBots] = useState([])
  const [botsLoaded, setBotsLoaded] = useState(false)

  const intervalRef = useRef(null)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/bots/chat-activity', {
        headers: getAuthHeaders(),
        params: { since_minutes: sinceMinutes, limit: 200 },
      })
      setConversations(res.data.conversations || [])
    } catch (err) {
      console.error('Failed to fetch bot chat activity:', err)
    }
    setLoading(false)
  }, [getAuthHeaders, sinceMinutes])

  const fetchActiveBots = useCallback(async () => {
    if (botsLoaded) return
    try {
      const res = await axios.get('/api/admin/bots', {
        headers: getAuthHeaders(),
        params: { is_active: 1, per_page: 100 },
      })
      setActiveBots(res.data.bots || [])
      setBotsLoaded(true)
    } catch (err) {
      console.error('Failed to fetch active bots:', err)
    }
  }, [getAuthHeaders, botsLoaded])

  // Initial fetch
  useEffect(() => {
    setLoading(true)
    fetchConversations()
  }, [fetchConversations])

  // Auto-refresh interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchConversations()
      }, 5000)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [autoRefresh, fetchConversations])

  // Load active bots when reply form is opened
  useEffect(() => {
    if (replyTarget) {
      fetchActiveBots()
    }
  }, [replyTarget, fetchActiveBots])

  const handleManualRefresh = () => {
    setLoading(true)
    fetchConversations()
  }

  const openReplyForm = (messageId, matchKey) => {
    setReplyTarget({ messageId, matchKey })
    setReplyBotId('')
    setReplyMsg('')
  }

  const closeReplyForm = () => {
    setReplyTarget(null)
    setReplyBotId('')
    setReplyMsg('')
  }

  const handleSendReply = async () => {
    if (!replyBotId || !replyMsg.trim() || !replyTarget) return
    setSending(true)
    try {
      await axios.post('/api/admin/bots/action', {
        bot_id: parseInt(replyBotId, 10),
        action: 'match_chat',
        target_id: replyTarget.matchKey,
        message: replyMsg.trim(),
      }, { headers: getAuthHeaders() })
      closeReplyForm()
      fetchConversations()
    } catch (err) {
      console.error('Failed to send bot reply:', err)
      alert(err.response?.data?.detail || 'Failed to send reply')
    }
    setSending(false)
  }

  const formatTimestamp = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now - d
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getInitial = (name) => {
    if (!name) return '?'
    return name.charAt(0).toUpperCase()
  }

  return (
    <div className="bot-reply-container">
      {/* Filters bar */}
      <div className="bot-reply-filters">
        <div className="bot-reply-filters-left">
          <label className="bot-reply-filter-label">Time range:</label>
          <select
            className="bot-reply-select"
            value={sinceMinutes}
            onChange={(e) => setSinceMinutes(parseInt(e.target.value, 10))}
          >
            {TIME_RANGES.map((tr) => (
              <option key={tr.value} value={tr.value}>{tr.label}</option>
            ))}
          </select>

          <label className="bot-reply-auto-refresh-label">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="bot-reply-checkbox"
            />
            Auto-refresh
          </label>
        </div>

        <button
          className="bot-reply-refresh-btn"
          onClick={handleManualRefresh}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Conversations */}
      {loading && conversations.length === 0 ? (
        <div className="bot-reply-loading">Loading conversations...</div>
      ) : conversations.length === 0 ? (
        <div className="bot-reply-empty">
          No bot conversations found in the selected time range
        </div>
      ) : (
        <div className="bot-reply-conversations">
          {conversations.map((convo) => {
            const matchKey = convo.match_key || convo.matchKey || 'unknown'
            const messages = convo.messages || []
            return (
              <div key={matchKey} className="bot-reply-conversation-block">
                <div className="bot-reply-conversation-header">
                  Match: {matchKey}
                </div>
                <div className="bot-reply-messages">
                  {messages.map((msg) => {
                    const isBot = !!msg.is_bot
                    const isReplyToBot = !!msg.is_reply_to_bot
                    const msgId = msg.id || msg.message_id || `${matchKey}-${msg.timestamp}-${msg.user_id}`

                    return (
                      <div key={msgId}>
                        <div
                          className={
                            'bot-reply-message' +
                            (isBot ? ' bot-reply-message-bot' : ' bot-reply-message-human') +
                            (isReplyToBot ? ' bot-reply-message-highlighted' : '')
                          }
                        >
                          <div className="bot-reply-message-row">
                            <span
                              className="bot-reply-avatar"
                              style={{ backgroundColor: msg.avatar_color || (isBot ? '#6c5ce7' : '#e67e22') }}
                            >
                              {getInitial(msg.display_name)}
                            </span>
                            <div className="bot-reply-message-content">
                              <div className="bot-reply-message-header">
                                {isBot && (
                                  <span className="bot-reply-bot-badge">BOT</span>
                                )}
                                <span className="bot-reply-display-name">{msg.display_name || 'Unknown'}</span>
                                <span className="bot-reply-timestamp">{formatTimestamp(msg.timestamp || msg.created_at)}</span>
                              </div>
                              <div className="bot-reply-message-text">{msg.message || msg.content || ''}</div>
                            </div>
                            {!isBot && (
                              <button
                                className="bot-reply-reply-btn"
                                onClick={() => openReplyForm(msgId, matchKey)}
                              >
                                Reply
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Inline reply form */}
                        {replyTarget && replyTarget.messageId === msgId && replyTarget.matchKey === matchKey && (
                          <div className="bot-reply-form">
                            <div className="bot-reply-form-row">
                              <select
                                className="bot-reply-bot-select"
                                value={replyBotId}
                                onChange={(e) => setReplyBotId(e.target.value)}
                              >
                                <option value="">-- Select Bot --</option>
                                {activeBots.map((bot) => (
                                  <option key={bot.id} value={bot.id}>
                                    {bot.display_name || bot.username} (@{bot.username})
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                className="bot-reply-form-input"
                                value={replyMsg}
                                onChange={(e) => setReplyMsg(e.target.value)}
                                placeholder="Type a reply message..."
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSendReply()
                                  }
                                }}
                              />
                              <button
                                className="bot-reply-send-btn"
                                onClick={handleSendReply}
                                disabled={!replyBotId || !replyMsg.trim() || sending}
                              >
                                {sending ? 'Sending...' : 'Send'}
                              </button>
                              <button
                                className="bot-reply-cancel-btn"
                                onClick={closeReplyForm}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        .bot-reply-container {
          width: 100%;
        }

        .bot-reply-filters {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          background: #1e2130;
          border: 1px solid #2d313a;
          border-radius: 10px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .bot-reply-filters-left {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .bot-reply-filter-label {
          font-size: 13px;
          color: #8b8fa3;
          font-weight: 500;
        }

        .bot-reply-select {
          background: #161822;
          border: 1px solid #2d313a;
          color: #e4e4e7;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          outline: none;
        }

        .bot-reply-select:focus {
          border-color: #6c5ce7;
        }

        .bot-reply-auto-refresh-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #b0b3c6;
          cursor: pointer;
          user-select: none;
        }

        .bot-reply-checkbox {
          accent-color: #6c5ce7;
          cursor: pointer;
        }

        .bot-reply-refresh-btn {
          background: #6c5ce7;
          border: none;
          color: #fff;
          padding: 6px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .bot-reply-refresh-btn:hover {
          background: #5b4cdb;
        }

        .bot-reply-refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .bot-reply-loading {
          text-align: center;
          padding: 40px 20px;
          color: #8b8fa3;
          font-size: 14px;
        }

        .bot-reply-empty {
          text-align: center;
          padding: 60px 20px;
          color: #666;
          font-size: 14px;
          background: #1e2130;
          border: 1px solid #2d313a;
          border-radius: 10px;
        }

        .bot-reply-conversations {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .bot-reply-conversation-block {
          background: #1e2130;
          border: 1px solid #2d313a;
          border-radius: 10px;
          overflow: hidden;
        }

        .bot-reply-conversation-header {
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 700;
          color: #e4e4e7;
          background: #161822;
          border-bottom: 1px solid #2d313a;
          letter-spacing: 0.3px;
        }

        .bot-reply-messages {
          display: flex;
          flex-direction: column;
        }

        .bot-reply-message {
          padding: 10px 16px;
          border-bottom: 1px solid rgba(45, 49, 58, 0.5);
        }

        .bot-reply-message:last-child {
          border-bottom: none;
        }

        .bot-reply-message-bot {
          border-left: 3px solid #6c5ce7;
        }

        .bot-reply-message-human {
          border-left: 3px solid #e67e22;
        }

        .bot-reply-message-highlighted {
          background: rgba(230, 126, 34, 0.08);
        }

        .bot-reply-message-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }

        .bot-reply-avatar {
          width: 32px;
          height: 32px;
          min-width: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
        }

        .bot-reply-message-content {
          flex: 1;
          min-width: 0;
        }

        .bot-reply-message-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 3px;
          flex-wrap: wrap;
        }

        .bot-reply-bot-badge {
          display: inline-block;
          background: #6c5ce7;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 4px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          line-height: 1.4;
        }

        .bot-reply-display-name {
          font-size: 13px;
          font-weight: 600;
          color: #e4e4e7;
        }

        .bot-reply-timestamp {
          font-size: 11px;
          color: #666;
          margin-left: auto;
        }

        .bot-reply-message-text {
          font-size: 13px;
          color: #b0b3c6;
          line-height: 1.5;
          word-break: break-word;
        }

        .bot-reply-reply-btn {
          background: rgba(108, 92, 231, 0.12);
          border: 1px solid rgba(108, 92, 231, 0.25);
          color: #a29bfe;
          padding: 4px 12px;
          border-radius: 5px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
          transition: background 0.2s;
        }

        .bot-reply-reply-btn:hover {
          background: rgba(108, 92, 231, 0.22);
        }

        .bot-reply-form {
          padding: 10px 16px 10px 58px;
          background: rgba(108, 92, 231, 0.05);
          border-bottom: 1px solid rgba(45, 49, 58, 0.5);
        }

        .bot-reply-form-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .bot-reply-bot-select {
          background: #161822;
          border: 1px solid #2d313a;
          color: #e4e4e7;
          padding: 7px 10px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          outline: none;
          min-width: 180px;
        }

        .bot-reply-bot-select:focus {
          border-color: #6c5ce7;
        }

        .bot-reply-form-input {
          flex: 1;
          min-width: 200px;
          background: #161822;
          border: 1px solid #2d313a;
          color: #e4e4e7;
          padding: 7px 12px;
          border-radius: 6px;
          font-size: 13px;
          outline: none;
        }

        .bot-reply-form-input:focus {
          border-color: #6c5ce7;
        }

        .bot-reply-form-input::placeholder {
          color: #555;
        }

        .bot-reply-send-btn {
          background: #6c5ce7;
          border: none;
          color: #fff;
          padding: 7px 16px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.2s;
        }

        .bot-reply-send-btn:hover {
          background: #5b4cdb;
        }

        .bot-reply-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .bot-reply-cancel-btn {
          background: transparent;
          border: 1px solid #2d313a;
          color: #8b8fa3;
          padding: 7px 14px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: border-color 0.2s, color 0.2s;
        }

        .bot-reply-cancel-btn:hover {
          border-color: #e74c3c;
          color: #e74c3c;
        }
      `}</style>
    </div>
  )
}
