import { useState, useEffect } from 'react'
import { subscribeToPush } from '../utils/pushSubscription'

export default function NotificationPrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Only prompt if Notification API exists
    if (!('Notification' in window)) return

    // Skip if already granted or denied
    if (Notification.permission !== 'default') return

    // Skip if user already dismissed this prompt
    if (localStorage.getItem('spark_notif_prompted')) return

    // Show after a short delay so the app loads first
    const timer = setTimeout(() => setShow(true), 1500)
    return () => clearTimeout(timer)
  }, [])

  // If permission was already granted, ensure push subscription exists
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      subscribeToPush().catch(() => {})
    }
  }, [])

  const handleEnable = async () => {
    localStorage.setItem('spark_notif_prompted', '1')
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        new Notification('Spark AI', {
          body: 'Notifications enabled! You\'ll get live goal alerts and updates.',
          icon: '/pwa-192x192.png',
        })
        // Subscribe to Web Push (sends subscription to server)
        subscribeToPush().catch(() => {})
      }
    } catch { /* browser blocked it */ }
    setShow(false)
  }

  const handleSkip = () => {
    localStorage.setItem('spark_notif_prompted', '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10001,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: 20,
        padding: '32px 28px',
        maxWidth: 360,
        width: '100%',
        textAlign: 'center',
        border: '1px solid #334155',
        boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
      }}>
        {/* Bell icon */}
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(34, 197, 94, 0.1)',
          border: '2px solid rgba(34, 197, 94, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </div>

        <h2 style={{
          color: '#f8fafc',
          fontSize: 20,
          fontWeight: 700,
          marginBottom: 8,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          Enable Notifications
        </h2>

        <p style={{
          color: '#94a3b8',
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 24,
        }}>
          Stay updated with live goal alerts, match results, and prediction updates. Never miss an important moment.
        </p>

        {/* Features list */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginBottom: 28,
          textAlign: 'left',
        }}>
          {[
            { icon: '&#x26BD;', text: 'Live goal alerts for tracked matches' },
            { icon: '&#x1F4CA;', text: 'New prediction results & updates' },
            { icon: '&#x1F525;', text: 'Hot tips from the community' },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 8,
            }}>
              <span style={{ fontSize: 18 }} dangerouslySetInnerHTML={{ __html: item.icon }} />
              <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 500 }}>{item.text}</span>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <button onClick={handleEnable} style={{
          width: '100%',
          padding: '14px 24px',
          background: 'linear-gradient(135deg, #22c55e, #16a34a)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 15,
          border: 'none',
          borderRadius: 12,
          cursor: 'pointer',
          marginBottom: 10,
          fontFamily: 'inherit',
          transition: 'transform 0.1s',
        }}>
          Enable Notifications
        </button>

        <button onClick={handleSkip} style={{
          width: '100%',
          padding: '12px 24px',
          background: 'none',
          color: '#64748b',
          fontWeight: 500,
          fontSize: 14,
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          Maybe Later
        </button>
      </div>
    </div>
  )
}
