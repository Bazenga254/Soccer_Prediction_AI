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

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY || ''

function GifPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [gifs, setGifs] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const searchTimeout = useRef(null)

  const fetchGifs = useCallback(async (q) => {
    if (!GIPHY_API_KEY) return
    setLoading(true)
    try {
      const endpoint = q
        ? 'https://api.giphy.com/v1/gifs/search'
        : 'https://api.giphy.com/v1/gifs/trending'
      const params = new URLSearchParams({
        api_key: GIPHY_API_KEY,
        limit: '20',
        rating: 'pg-13',
        ...(q ? { q } : {}),
      })
      const res = await fetch(`${endpoint}?${params}`)
      const data = await res.json()
      const results = (data.data || []).map(g => ({
        id: g.id,
        title: g.title || '',
        preview_url: g.images?.fixed_width_small?.url || '',
        url: g.images?.fixed_width?.url || '',
      }))
      setGifs(results)
    } catch {
      setGifs([])
    }
    setLoading(false)
    setSearched(true)
  }, [])

  useEffect(() => {
    fetchGifs('')
  }, [fetchGifs])

  const handleSearch = (val) => {
    setQuery(val)
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      fetchGifs(val)
    }, 400)
  }

  if (!GIPHY_API_KEY) {
    return (
      <div className="gif-picker" onClick={e => e.stopPropagation()}>
        <div className="gif-empty" style={{ padding: '20px' }}>GIF search is not configured</div>
      </div>
    )
  }

  return (
    <div className="gif-picker" onClick={e => e.stopPropagation()}>
      <div className="gif-picker-header">
        <input
          type="text"
          className="gif-search-input"
          placeholder="Search GIFs..."
          value={query}
          onChange={e => handleSearch(e.target.value)}
          autoFocus
        />
        <button className="gif-picker-close" onClick={onClose} type="button">{'\u2715'}</button>
      </div>
      <div className="gif-picker-grid">
        {loading && <div className="gif-loading">Searching...</div>}
        {!loading && searched && gifs.length === 0 && (
          <div className="gif-empty">No GIFs found</div>
        )}
        {gifs.map(gif => (
          <button
            key={gif.id}
            className="gif-picker-item"
            onClick={() => onSelect(gif.url)}
            type="button"
            title={gif.title}
          >
            <img src={gif.preview_url || gif.url} alt={gif.title} loading="lazy" />
          </button>
        ))}
      </div>
      <div className="gif-picker-powered">Powered by GIPHY</div>
    </div>
  )
}

function renderMessage(text) {
  const gifMatch = text.match(/^\[gif\](.*?)\[\/gif\]$/)
  if (gifMatch) {
    return <img src={gifMatch[1]} alt="GIF" className="chat-gif" loading="lazy" />
  }
  return <p className="chat-text">{text}</p>
}

export default function LiveChatPopup({ matchKey, matchName, onClose }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showGif, setShowGif] = useState(false)
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
    document.body.classList.add('live-chat-open')
    return () => document.body.classList.remove('live-chat-open')
  }, [])

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

  const sendMessage = async (msg) => {
    if (!msg.trim()) return
    setSending(true)
    setShowEmoji(false)
    setShowGif(false)
    try {
      const res = await axios.post(`/api/match/${matchKey}/chat`, { message: msg })
      if (res.data.success) {
        setMessages(prev => [...prev, res.data.chat])
        lastIdRef.current = res.data.chat.id
        setNewMsg('')
      }
    } catch { /* ignore */ }
    setSending(false)
  }

  const handleSend = () => sendMessage(newMsg)

  const handleGifSelect = (gifUrl) => {
    sendMessage(`[gif]${gifUrl}[/gif]`)
  }

  const handleEmojiSelect = (emoji) => {
    setNewMsg(prev => prev + emoji)
    setShowEmoji(false)
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
                  {renderMessage(m.message)}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="live-chat-popup-input">
            <button
              className="emoji-toggle-btn"
              onClick={() => { setShowEmoji(!showEmoji); setShowGif(false) }}
              type="button"
              title={t('community.emojis')}
            >
              {'\u{1F600}'}
            </button>
            <button
              className="gif-toggle-btn"
              onClick={() => { setShowGif(!showGif); setShowEmoji(false) }}
              type="button"
              title="GIF"
            >
              GIF
            </button>
            {showEmoji && <EmojiPicker onSelect={handleEmojiSelect} />}
            {showGif && <GifPicker onSelect={handleGifSelect} onClose={() => setShowGif(false)} />}
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
