import { useState, useEffect, useCallback, useRef } from 'react'
import { useAdmin } from '../../context/AdminContext'

const PLATFORM_ICONS = {
  telegram: '\u{1F4AC}',
  whatsapp: '\u{1F4F1}',
  whatsapp_qr: '\u{1F4F1}',
  facebook: '\u{1F30D}',
  instagram: '\u{1F4F7}',
  x: '\u{1D54F}',
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

function getMediaType(file) {
  if (!file) return 'document'
  const mime = file.type || ''
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

// ─── Emoji Data ───
const EMOJI_CATEGORIES = [
  { id: 'smileys', icon: '\u{1F600}', label: 'Smileys', emojis: [
    '\u{1F600}','\u{1F603}','\u{1F604}','\u{1F601}','\u{1F606}','\u{1F605}','\u{1F602}','\u{1F923}','\u{1F60A}','\u{1F607}',
    '\u{1F609}','\u{1F60D}','\u{1F929}','\u{1F618}','\u{1F617}','\u{1F61A}','\u{1F619}','\u{1F60B}','\u{1F61C}','\u{1F61D}',
    '\u{1F61B}','\u{1F911}','\u{1F917}','\u{1F914}','\u{1F910}','\u{1F928}','\u{1F610}','\u{1F611}','\u{1F636}','\u{1F60F}',
    '\u{1F612}','\u{1F644}','\u{1F62C}','\u{1F925}','\u{1F60C}','\u{1F614}','\u{1F62A}','\u{1F924}','\u{1F634}','\u{1F637}',
    '\u{1F912}','\u{1F915}','\u{1F922}','\u{1F92E}','\u{1F927}','\u{1F975}','\u{1F976}','\u{1F974}','\u{1F635}','\u{1F92F}',
    '\u{1F920}','\u{1F973}','\u{1F978}','\u{1F60E}','\u{1F913}','\u{1F9D0}','\u{1F615}','\u{1F61F}','\u{1F641}','\u{2639}',
    '\u{1F62E}','\u{1F62F}','\u{1F632}','\u{1F633}','\u{1F97A}','\u{1F626}','\u{1F627}','\u{1F628}','\u{1F630}','\u{1F625}',
    '\u{1F622}','\u{1F62D}','\u{1F631}','\u{1F616}','\u{1F623}','\u{1F61E}','\u{1F613}','\u{1F629}','\u{1F62B}','\u{1F971}',
  ]},
  { id: 'gestures', icon: '\u{1F44D}', label: 'Gestures', emojis: [
    '\u{1F44D}','\u{1F44E}','\u{1F44A}','\u270A','\u{1F91B}','\u{1F91C}','\u{1F44F}','\u{1F64C}','\u{1F450}','\u{1F932}',
    '\u{1F91D}','\u{1F64F}','\u270D','\u{1F485}','\u{1F933}','\u{1F4AA}','\u{1F9BE}','\u{1F9BF}','\u{1F448}','\u{1F449}',
    '\u{1F446}','\u{1F447}','\u261D','\u270B','\u{1F91A}','\u{1F590}','\u{1F596}','\u{1F44B}','\u{1F919}','\u{1F918}',
    '\u{1F91F}','\u270C','\u{1F91E}','\u{1F91C}','\u{1F44C}','\u{1F90F}','\u{1F90C}','\u{1F448}','\u{1F449}','\u{1F446}',
  ]},
  { id: 'hearts', icon: '\u2764', label: 'Hearts', emojis: [
    '\u2764','\u{1F9E1}','\u{1F49B}','\u{1F49A}','\u{1F499}','\u{1F49C}','\u{1F5A4}','\u{1FA76}','\u{1F90D}','\u{1F90E}',
    '\u{1F495}','\u{1F49E}','\u{1F493}','\u{1F497}','\u{1F496}','\u{1F498}','\u{1F49D}','\u{1F49F}','\u{1F48C}','\u{1F48B}',
  ]},
  { id: 'animals', icon: '\u{1F436}', label: 'Animals', emojis: [
    '\u{1F436}','\u{1F431}','\u{1F42D}','\u{1F439}','\u{1F430}','\u{1F98A}','\u{1F43B}','\u{1F43C}','\u{1F428}','\u{1F42F}',
    '\u{1F981}','\u{1F42E}','\u{1F437}','\u{1F438}','\u{1F435}','\u{1F648}','\u{1F649}','\u{1F64A}','\u{1F412}','\u{1F414}',
    '\u{1F427}','\u{1F426}','\u{1F985}','\u{1F989}','\u{1F987}','\u{1F43A}','\u{1F417}','\u{1F434}','\u{1F984}','\u{1F41D}',
  ]},
  { id: 'food', icon: '\u{1F354}', label: 'Food', emojis: [
    '\u{1F34E}','\u{1F34F}','\u{1F34A}','\u{1F34B}','\u{1F34C}','\u{1F349}','\u{1F347}','\u{1F353}','\u{1F348}','\u{1F352}',
    '\u{1F351}','\u{1F34D}','\u{1F965}','\u{1F951}','\u{1F346}','\u{1F954}','\u{1F955}','\u{1F33D}','\u{1F336}','\u{1F952}',
    '\u{1F354}','\u{1F355}','\u{1F32D}','\u{1F32E}','\u{1F32F}','\u{1F37F}','\u{1F9C1}','\u{1F370}','\u{1F382}','\u{1F36B}',
  ]},
  { id: 'activities', icon: '\u26BD', label: 'Sports', emojis: [
    '\u26BD','\u{1F3C0}','\u{1F3C8}','\u26BE','\u{1F94E}','\u{1F3BE}','\u{1F3D0}','\u{1F3C9}','\u{1F3B1}','\u{1F3D3}',
    '\u{1F3F8}','\u{1F3D2}','\u{1F3D1}','\u{1F94D}','\u{1F3CF}','\u26F3','\u{1F94F}','\u{1F3AF}','\u{1F3C6}','\u{1F3C5}',
    '\u{1F947}','\u{1F948}','\u{1F949}','\u{1F396}','\u{1F3F5}','\u{1F3AB}','\u{1F39F}','\u{1F3AA}','\u{1F938}','\u{1F93C}',
  ]},
  { id: 'travel', icon: '\u{1F30E}', label: 'Travel', emojis: [
    '\u{1F697}','\u{1F695}','\u{1F699}','\u{1F68C}','\u{1F3CE}','\u{1F693}','\u{1F691}','\u{1F692}','\u{1F6F5}','\u{1F3CD}',
    '\u2708','\u{1F680}','\u{1F6F8}','\u{1F6A2}','\u26F5','\u{1F3D6}','\u{1F3DD}','\u{1F3DE}','\u{1F3D4}','\u{1F30B}',
  ]},
  { id: 'objects', icon: '\u{1F4A1}', label: 'Objects', emojis: [
    '\u{1F4A1}','\u{1F526}','\u{1F4B0}','\u{1F4B5}','\u{1F4B3}','\u{1F48E}','\u{1F4E7}','\u{1F4F1}','\u{1F4BB}','\u{1F5A5}',
    '\u{1F3B5}','\u{1F3B6}','\u{1F399}','\u{1F3A4}','\u{1F3A7}','\u{1F4F7}','\u{1F3AC}','\u{1F4FA}','\u{1F4F0}','\u{1F4DA}',
  ]},
  { id: 'symbols', icon: '\u2705', label: 'Symbols', emojis: [
    '\u2705','\u274C','\u2757','\u2753','\u{1F4AF}','\u{1F525}','\u2B50','\u{1F31F}','\u{1F4A5}','\u{1F4AB}',
    '\u{1F389}','\u{1F38A}','\u{1F388}','\u{1F381}','\u{1F3C6}','\u{1F4CC}','\u{1F4A4}','\u{1F4AC}','\u{1F4AD}','\u{1F440}',
  ]},
]

// ─── Emoji Picker Component ───
function EmojiPicker({ onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState('smileys')
  const [search, setSearch] = useState('')
  const pickerRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const category = EMOJI_CATEGORIES.find(c => c.id === activeCategory)
  const filteredEmojis = search
    ? EMOJI_CATEGORIES.flatMap(c => c.emojis)
    : (category?.emojis || [])

  return (
    <div className="social-emoji-picker" ref={pickerRef}>
      <div className="social-emoji-search">
        <input
          type="text"
          placeholder="Search emoji..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      {!search && (
        <div className="social-emoji-categories">
          {EMOJI_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`social-emoji-cat-btn ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
              title={cat.label}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}
      <div className="social-emoji-grid">
        {filteredEmojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            className="social-emoji-btn"
            onClick={() => onSelect(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── GIF Picker Component (Tenor) ───
const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ' // Free Tenor/Google API key

function GifPicker({ onSelect, onClose }) {
  const [search, setSearch] = useState('')
  const [gifs, setGifs] = useState([])
  const [trending, setTrending] = useState([])
  const [loading, setLoading] = useState(false)
  const pickerRef = useRef(null)
  const searchTimer = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Fetch trending on mount
  useEffect(() => {
    const fetchTrending = async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=20&media_filter=tinygif,gif`
        )
        if (res.ok) {
          const data = await res.json()
          setTrending(data.results || [])
        }
      } catch {}
      setLoading(false)
    }
    fetchTrending()
  }, [])

  // Search GIFs with debounce
  useEffect(() => {
    if (!search.trim()) {
      setGifs([])
      return
    }
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(search)}&key=${TENOR_API_KEY}&limit=20&media_filter=tinygif,gif`
        )
        if (res.ok) {
          const data = await res.json()
          setGifs(data.results || [])
        }
      } catch {}
      setLoading(false)
    }, 400)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  const displayGifs = search.trim() ? gifs : trending

  const getGifUrl = (result, size) => {
    const formats = result.media_formats || {}
    if (size === 'preview') return formats.tinygif?.url || formats.gif?.url || ''
    return formats.gif?.url || formats.tinygif?.url || ''
  }

  return (
    <div className="social-gif-picker" ref={pickerRef}>
      <div className="social-emoji-search">
        <input
          type="text"
          placeholder="Search GIFs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      <div className="social-gif-grid">
        {loading ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--admin-text-muted)', padding: 20 }}>
            Loading...
          </div>
        ) : displayGifs.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--admin-text-muted)', padding: 20 }}>
            {search ? 'No GIFs found' : 'Loading trending GIFs...'}
          </div>
        ) : (
          displayGifs.map(gif => (
            <button
              key={gif.id}
              className="social-gif-btn"
              onClick={() => onSelect(getGifUrl(gif, 'full'))}
            >
              <img src={getGifUrl(gif, 'preview')} alt={gif.title || 'GIF'} loading="lazy" />
            </button>
          ))
        )}
      </div>
      <div className="social-gif-powered">
        Powered by Tenor
      </div>
    </div>
  )
}

// ─── Main Inbox Component ───
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
  const [attachment, setAttachment] = useState(null)
  // Emoji & GIF pickers
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const sseRef = useRef(null)

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

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/social/templates', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
      }
    } catch {}
  }, [getAuthHeaders])

  useEffect(() => { fetchConversations(); fetchTemplates() }, [fetchConversations, fetchTemplates])

  useEffect(() => {
    if (activeConvId) {
      fetchMessages(activeConvId)
      fetch(`/api/admin/social/conversations/${activeConvId}/read`, {
        method: 'POST', headers: getAuthHeaders()
      }).catch(() => {})
    }
  }, [activeConvId, fetchMessages, getAuthHeaders])

  // SSE
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
            fetchConversations()
            if (data.data.conversation_id === activeConvId) fetchMessages(activeConvId)
          }
        } catch {}
      }
      es.onerror = () => {
        es.close()
        setTimeout(() => { if (sseRef.current === es) sseRef.current = null }, 5000)
      }
    } catch {}
    return () => { if (es) es.close() }
  }, [getAuthHeaders, activeConvId, fetchConversations, fetchMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ─── Attachment ───
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const mediaType = getMediaType(file)
    let preview = null
    if (mediaType === 'image' || mediaType === 'video') preview = URL.createObjectURL(file)
    setAttachment({ file, preview, mediaType, uploading: true, uploadedUrl: null, error: null })
    try {
      const formData = new FormData()
      formData.append('file', file)
      const hdrs = { ...getAuthHeaders() }
      delete hdrs['Content-Type']
      const res = await fetch('/api/admin/social/media/upload', { method: 'POST', headers: hdrs, body: formData })
      if (res.ok) {
        const data = await res.json()
        setAttachment(prev => prev ? { ...prev, uploading: false, uploadedUrl: data.media.file_url } : null)
      } else {
        const err = await res.json().catch(() => ({}))
        setAttachment(prev => prev ? { ...prev, uploading: false, error: err.detail || 'Upload failed' } : null)
      }
    } catch (err) {
      setAttachment(prev => prev ? { ...prev, uploading: false, error: err.message } : null)
    }
  }

  const removeAttachment = () => {
    if (attachment?.preview) URL.revokeObjectURL(attachment.preview)
    setAttachment(null)
  }

  // ─── Emoji insert ───
  const insertEmoji = (emoji) => {
    const ta = textareaRef.current
    if (ta) {
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newText = messageText.substring(0, start) + emoji + messageText.substring(end)
      setMessageText(newText)
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + emoji.length; ta.focus() }, 0)
    } else {
      setMessageText(prev => prev + emoji)
    }
  }

  // ─── GIF send ───
  const sendGif = async (gifUrl) => {
    if (!activeConvId || sending) return
    setShowGifPicker(false)
    setSending(true)
    try {
      const res = await fetch(`/api/admin/social/conversations/${activeConvId}/send`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_text: '', content_type: 'gif', media_url: gifUrl })
      })
      if (res.ok) {
        fetchMessages(activeConvId)
        fetchConversations()
      }
    } catch {}
    setSending(false)
  }

  // ─── Send message ───
  const handleSend = async () => {
    const hasText = messageText.trim().length > 0
    const hasAttachment = attachment?.uploadedUrl
    if ((!hasText && !hasAttachment) || !activeConvId || sending) return
    setSending(true)
    try {
      const body = { content_text: messageText.trim(), content_type: hasAttachment ? attachment.mediaType : 'text' }
      if (hasAttachment) body.media_url = attachment.uploadedUrl
      const res = await fetch(`/api/admin/social/conversations/${activeConvId}/send`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (res.ok) {
        setMessageText('')
        removeAttachment()
        fetchMessages(activeConvId)
        fetchConversations()
        textareaRef.current?.focus()
      }
    } catch {}
    setSending(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const selectTemplate = (template) => {
    setMessageText(template.content)
    setShowTemplates(false)
    textareaRef.current?.focus()
  }

  const activeConv = conversations.find(c => c.id === activeConvId)
  const availablePlatforms = [...new Set(accounts.filter(a => a.status === 'connected').map(a => a.platform))]

  // Close pickers when switching conversations
  useEffect(() => { setShowEmojiPicker(false); setShowGifPicker(false) }, [activeConvId])

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
          <button className={`social-filter-btn ${platformFilter === 'all' ? 'active' : ''}`}
            onClick={() => setPlatformFilter('all')}>All</button>
          {availablePlatforms.map(p => (
            <button key={p} className={`social-filter-btn ${platformFilter === p ? 'active' : ''}`}
              onClick={() => setPlatformFilter(p)}>
              {PLATFORM_ICONS[p] || p} {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <div className="social-conv-items">
          {loadingConvs ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--admin-text-muted)' }}>Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="social-empty-state" style={{ padding: 40 }}>
              <div className="social-empty-icon">{'\u{1F4ED}'}</div>
              <p style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>
                {accounts.length === 0 ? 'Connect a platform to start receiving messages' : 'No conversations yet'}
              </p>
            </div>
          ) : (
            conversations.map(conv => (
              <div key={conv.id} className={`social-conv-item ${activeConvId === conv.id ? 'active' : ''}`}
                onClick={() => setActiveConvId(conv.id)}>
                <div className={`social-conv-avatar ${conv.platform}`}>
                  {PLATFORM_ICONS[conv.platform] || '\u{1F464}'}
                </div>
                <div className="social-conv-info">
                  <div className="social-conv-name">{conv.contact_name || conv.contact_identifier}</div>
                  <div className="social-conv-preview">{conv.last_message_text || 'No messages'}</div>
                </div>
                <div className="social-conv-meta">
                  <span className="social-conv-time">{formatTime(conv.last_message_at)}</span>
                  {conv.unread_count > 0 && <span className="social-unread-badge">{conv.unread_count}</span>}
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
                <button className="social-action-btn" onClick={async () => {
                  await fetch(`/api/admin/social/conversations/${activeConvId}/archive`, { method: 'POST', headers: getAuthHeaders() })
                  setActiveConvId(null); fetchConversations()
                }} title="Archive">{'\u{1F4E6}'}</button>
              </div>
            </div>

            <div className="social-chat-messages">
              {loadingMsgs ? (
                <div style={{ textAlign: 'center', color: 'var(--admin-text-muted)', padding: 40 }}>Loading messages...</div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--admin-text-muted)', padding: 40 }}>
                  No messages yet. Send a message to start the conversation.
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`social-msg ${msg.direction}`}>
                    {msg.direction === 'inbound' && msg.sender_name && (
                      <div className="social-msg-sender">{msg.sender_name}</div>
                    )}
                    {msg.media_url && (
                      <div className="social-msg-media">
                        {(msg.content_type === 'image' || msg.content_type === 'gif') ? (
                          <img src={msg.media_url} alt="" onClick={() => window.open(msg.media_url, '_blank')} />
                        ) : msg.content_type === 'video' ? (
                          <video src={msg.media_url} controls style={{ maxWidth: 300, borderRadius: 8 }} />
                        ) : msg.content_type === 'audio' ? (
                          <audio src={msg.media_url} controls style={{ maxWidth: 280 }} />
                        ) : (
                          <a href={msg.media_url} target="_blank" rel="noreferrer" className="social-msg-file-link">
                            <span>{'\u{1F4CE}'}</span>
                            <span>{msg.media_filename || 'Download file'}</span>
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
                      {msg.sent_by_name && <span style={{ marginLeft: 4 }}>{msg.sent_by_name}</span>}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Attachment Preview */}
            {attachment && (
              <div className="social-attachment-preview">
                <div className="social-attachment-content">
                  {attachment.mediaType === 'image' && attachment.preview ? (
                    <img src={attachment.preview} alt="" className="social-attachment-thumb" />
                  ) : attachment.mediaType === 'video' && attachment.preview ? (
                    <video src={attachment.preview} className="social-attachment-thumb" />
                  ) : (
                    <div className="social-attachment-file-icon">
                      {attachment.mediaType === 'audio' ? '\u{1F3B5}' : '\u{1F4C4}'}
                    </div>
                  )}
                  <div className="social-attachment-info">
                    <span className="social-attachment-name">{attachment.file.name}</span>
                    <span className="social-attachment-size">
                      {(attachment.file.size / 1024).toFixed(0)} KB
                      {attachment.uploading && ' \u2022 Uploading...'}
                      {attachment.error && ` \u2022 ${attachment.error}`}
                      {attachment.uploadedUrl && !attachment.uploading && ' \u2022 Ready'}
                    </span>
                  </div>
                </div>
                <button className="social-attachment-remove" onClick={removeAttachment}>{'\u00D7'}</button>
              </div>
            )}

            {/* Input Area */}
            <div className="social-chat-input">
              <input ref={fileInputRef} type="file" hidden
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
                onChange={handleFileSelect} />

              {/* Attach */}
              <button className="social-action-btn" onClick={() => fileInputRef.current?.click()}
                title="Attach file" disabled={!!attachment?.uploading}>{'\u{1F4CE}'}</button>

              {/* Emoji */}
              <div style={{ position: 'relative' }}>
                <button className={`social-action-btn ${showEmojiPicker ? 'active-picker' : ''}`}
                  onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false) }}
                  title="Emoji">{'\u{1F600}'}</button>
                {showEmojiPicker && (
                  <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmojiPicker(false)} />
                )}
              </div>

              {/* GIF */}
              <div style={{ position: 'relative' }}>
                <button className={`social-action-btn ${showGifPicker ? 'active-picker' : ''}`}
                  onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false) }}
                  title="GIF">GIF</button>
                {showGifPicker && (
                  <GifPicker onSelect={sendGif} onClose={() => setShowGifPicker(false)} />
                )}
              </div>

              <div style={{ position: 'relative', flex: 1 }}>
                <textarea
                  ref={textareaRef}
                  className="social-chat-textarea"
                  placeholder="Type a message..."
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={3}
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

              {/* Templates */}
              <button className="social-action-btn" onClick={() => setShowTemplates(!showTemplates)}
                title="Quick replies">{'\u{1F4DD}'}</button>

              {/* Send */}
              <button className="social-send-btn" onClick={handleSend}
                disabled={(!messageText.trim() && !attachment?.uploadedUrl) || sending || attachment?.uploading}>
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
