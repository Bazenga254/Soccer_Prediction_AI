import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'

const NOTIF_CONFIG = {
  first_prediction: { icon: '\uD83C\uDFC6', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  referral_subscription: { icon: '\uD83E\uDD1D', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  withdrawal: { icon: '\uD83D\uDCB0', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  comment: { icon: '\uD83D\uDCAC', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  rating: { icon: '\u2B50', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
}

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [bellShake, setBellShake] = useState(false)
  const dropdownRef = useRef(null)
  const eventSourceRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  // Connect to SSE for real-time notifications
  const connectSSE = useCallback(() => {
    const token = localStorage.getItem('spark_token')
    if (!token) return

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource(`/api/user/notifications/stream?token=${token}`)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'init') {
          setUnreadCount(data.unread_count || 0)
        } else if (data.type === 'new') {
          setUnreadCount(data.unread_count || 0)
          // Prepend the new notification if dropdown has been loaded
          if (data.notification) {
            setNotifications(prev => {
              // Avoid duplicates
              if (prev.some(n => n.id === data.notification.id)) return prev
              return [data.notification, ...prev]
            })
          }
          // Shake the bell to draw attention
          setBellShake(true)
          setTimeout(() => setBellShake(false), 1000)
        }
      } catch (err) {
        // Ignore parse errors from heartbeats
      }
    }

    es.onerror = () => {
      es.close()
      eventSourceRef.current = null
      // Reconnect after 5 seconds
      reconnectTimeoutRef.current = setTimeout(connectSSE, 5000)
    }
  }, [])

  useEffect(() => {
    connectSSE()
    // Also do an initial fetch for unread count (immediate)
    fetchUnreadCount()

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close()
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    }
  }, [connectSSE])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Use axios without manual headers - AuthContext sets Authorization globally
  const fetchUnreadCount = async () => {
    try {
      const res = await axios.get('/api/user/unread-count')
      setUnreadCount(res.data.unread_count || 0)
    } catch (err) {
      // Silently fail
    }
  }

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/user/notifications')
      setNotifications(res.data.notifications || [])
      setUnreadCount(res.data.unread_count || 0)
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleOpen = () => {
    if (!isOpen) {
      fetchNotifications()
    }
    setIsOpen(!isOpen)
  }

  const handleMarkRead = async () => {
    try {
      await axios.post('/api/user/notifications/read')
      setUnreadCount(0)
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    } catch (err) {
      console.error('Failed to mark notifications read:', err)
    }
  }

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  }

  const renderNotification = (n) => {
    const config = NOTIF_CONFIG[n.type] || NOTIF_CONFIG.comment
    const meta = n.metadata || {}

    // Comment type shows commenter avatar
    if (n.type === 'comment' && meta.commenter_avatar) {
      return (
        <div key={n.id} className={`notification-item ${n.is_read ? '' : 'unread'}`}>
          <div className="notification-avatar" style={{ background: meta.commenter_avatar }}>
            {(meta.commenter_name || '?')[0].toUpperCase()}
          </div>
          <div className="notification-content">
            <p className="notification-text">{n.title}</p>
            <p className="notification-message">{n.message}</p>
            {meta.match && <p className="notification-match">{meta.match}</p>}
            <span className="notification-time">{timeAgo(n.created_at)}</span>
          </div>
          {!n.is_read && <span className="unread-dot" />}
        </div>
      )
    }

    // All other types use icon
    return (
      <div key={n.id} className={`notification-item ${n.is_read ? '' : 'unread'}`}>
        <div className="notification-type-icon" style={{ background: config.bg, color: config.color }}>
          <span>{config.icon}</span>
        </div>
        <div className="notification-content">
          <p className="notification-text">{n.title}</p>
          <p className="notification-message">{n.message}</p>
          {meta.match && <p className="notification-match">{meta.match}</p>}
          <span className="notification-time">{timeAgo(n.created_at)}</span>
        </div>
        {!n.is_read && <span className="unread-dot" />}
      </div>
    )
  }

  return (
    <div className="notification-dropdown-wrapper" ref={dropdownRef}>
      <button className={`notification-bell-btn ${bellShake ? 'bell-shake' : ''}`} onClick={handleOpen} title="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <span className="notification-dropdown-title">Notifications</span>
            {unreadCount > 0 && (
              <button className="mark-read-btn" onClick={handleMarkRead}>Mark all read</button>
            )}
          </div>

          <div className="notification-dropdown-body">
            {loading ? (
              <div className="notification-loading">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => renderNotification(n))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
