import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import axios from 'axios'

const CHAT_EMOJIS = [
  '\u26BD', '\u{1F945}', '\u{1F3C6}', '\u{1F525}', '\u{1F4AA}', '\u{1F44F}', '\u{1F3AF}', '\u{1F44D}', '\u{1F44E}',
  '\u{1F602}', '\u{1F62D}', '\u{1F64F}', '\u2764\uFE0F', '\u{1F4AF}', '\u{1F914}', '\u{1F60D}', '\u{1F923}', '\u{1F480}',
  '\u{1F624}', '\u{1FAE1}', '\u{1F389}', '\u{1F60E}', '\u{1F91D}', '\u{1F4B0}', '\u2B50', '\u{1F680}', '\u{1F631}',
]

function EmojiPicker({ onSelect }) {
  return (
    <div className="emoji-picker" onClick={e => e.stopPropagation()}>
      <div className="emoji-picker-grid">
        {CHAT_EMOJIS.map(emoji => (
          <button key={emoji} className="emoji-picker-btn" onClick={() => onSelect(emoji)} type="button">
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function LiveChatPopup({ matchKey, matchName, onClose }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const lastIdRef = useRef(0)
  const chatEndRef = useRef(null)
  const intervalRef = useRef(null)
  const inputRef = useRef(null)

  const fetchMessages = useCallback(async (sinceId = 0) => {
    try {
      const res = await axios.get(`/api/match/${matchKey}/chat?since_id=${sinceId}`)
      const msgs = res.data.messages || []
      if (sinceId === 0) {
        setMessages(msgs)
      } else if (msgs.length > 0) {
        setMessages(prev => [...prev, ...msgs])
      }
      if (msgs.length > 0) {
        lastIdRef.current = msgs[msgs.length - 1].id
      }
    } catch { /* ignore */ }
  }, [matchKey])

  useEffect(() => {
    lastIdRef.current = 0
    setMessages([])
    fetchMessages(0)
  }, [matchKey, fetchMessages])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      fetchMessages(lastIdRef.current)
    }, 3000)
    return () => clearInterval(intervalRef.current)
  }, [fetchMessages])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  const handleSend = async () => {
    if (!newMsg.trim()) return
    setSending(true)
    setShowEmoji(false)
    try {
      const res = await axios.post(`/api/match/${matchKey}/chat`, { message: newMsg })
      if (res.data.success) {
        setMessages(prev => [...prev, res.data.chat])
        lastIdRef.current = res.data.chat.id
        setNewMsg('')
      }
    } catch { /* ignore */ }
    setSending(false)
  }

  const handleEmojiSelect = (emoji) => {
    setNewMsg(prev => prev + emoji)
    inputRef.current?.focus()
  }

  const formatTime = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="live-chat-popup">
      <div className="live-chat-popup-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="live-chat-popup-title">
          <span className="live-chat-popup-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span>{t('community.liveChat')}</span>
          <span className="live-chat-popup-badge">{messages.length}</span>
        </div>
        <div className="live-chat-popup-actions">
          <button className="live-chat-popup-minimize">{isExpanded ? '\u25BC' : '\u25B2'}</button>
          <button className="live-chat-popup-close" onClick={(e) => { e.stopPropagation(); onClose() }}>{'\u2715'}</button>
        </div>
      </div>
      {isExpanded && (
        <div className="live-chat-popup-body">
          <div className="live-chat-popup-match-name">{matchName}</div>
          <div className="live-chat-popup-messages">
            {messages.length === 0 && (
              <p className="chat-empty">{t('community.noChatMessagesAlt')}</p>
            )}
            {messages.map(m => (
              <div key={m.id} className={`chat-bubble ${m.user_id === user?.id ? 'own' : ''}`}>
                <span className="chat-avatar" style={{ background: m.avatar_color }}>
                  {(m.display_name || '?')[0].toUpperCase()}
                </span>
                <div className="chat-bubble-content">
                  <div className="chat-bubble-header">
                    <strong>{m.display_name}</strong>
                    <span className="chat-time">{formatTime(m.created_at)}</span>
                  </div>
                  <p className="chat-text">{m.message}</p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="live-chat-popup-input">
            <button className="emoji-toggle-btn" onClick={() => setShowEmoji(!showEmoji)} type="button" title={t('community.emojis')}>
              {'\u{1F600}'}
            </button>
            {showEmoji && <EmojiPicker onSelect={handleEmojiSelect} />}
            <input
              ref={inputRef}
              type="text"
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              placeholder={t('community.discussMatch')}
              maxLength={500}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              disabled={sending}
            />
            <button className="chat-send-btn" onClick={handleSend} disabled={sending || !newMsg.trim()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
