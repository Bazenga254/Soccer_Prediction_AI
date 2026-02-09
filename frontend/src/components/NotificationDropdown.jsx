import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)

  // Poll for unread count every 30 seconds
  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [])

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

  const fetchUnreadCount = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) return
      const res = await axios.get('/api/user/unread-count', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setUnreadCount(res.data.unread_count || 0)
    } catch (err) {
      // Silently fail
    }
  }

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await axios.get('/api/user/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      })
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
      const token = localStorage.getItem('auth_token')
      await axios.post('/api/user/notifications/read', {}, {
        headers: { Authorization: `Bearer ${token}` }
      })
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

  return (
    <div className="notification-dropdown-wrapper" ref={dropdownRef}>
      <button className="notification-bell-btn" onClick={handleOpen} title="Notifications">
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
                <p className="notification-empty-sub">Comments on your predictions will appear here</p>
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id} className={`notification-item ${n.is_read ? '' : 'unread'}`}>
                  <div className="notification-avatar" style={{ background: n.commenter_avatar || '#6c5ce7' }}>
                    {(n.commenter_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="notification-content">
                    <p className="notification-text">
                      <strong>{n.commenter_name}</strong> commented on your prediction
                    </p>
                    <p className="notification-match">{n.match}</p>
                    <p className="notification-comment">"{n.content.length > 80 ? n.content.slice(0, 80) + '...' : n.content}"</p>
                    <span className="notification-time">{timeAgo(n.created_at)}</span>
                  </div>
                  {!n.is_read && <span className="unread-dot" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
