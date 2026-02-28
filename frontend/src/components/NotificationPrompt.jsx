import { useState, useEffect } from 'react'
import { subscribeToPush } from '../utils/pushSubscription'

export default function NotificationPrompt() {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState('prompt') // 'prompt' | 'denied'

  useEffect(() => {
    // Only prompt if Notification API exists
    if (!('Notification' in window)) return

    // If already granted, just ensure push subscription and don't show
    if (Notification.permission === 'granted') {
      subscribeToPush().catch(() => {})
      return
    }

    // If browser has permanently denied, don't show (can't do anything)
    if (Notification.permission === 'denied') return

    // Skip if user already completed the notification setup
    if (localStorage.getItem('spark_notif_setup_done')) return

    // Show immediately — this is a blocking gate
    setShow(true)
  }, [])

  const handleEnable = async () => {
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        new Notification('Spark AI', {
          body: "You're all set! You'll receive alerts for goals, predictions & more.",
          icon: '/pwa-192x192.png',
        })
        subscribeToPush().catch(() => {})
        localStorage.setItem('spark_notif_setup_done', '1')
        localStorage.setItem('spark_notif_prompted', '1')
        setShow(false)
      } else {
        // User denied in browser popup — show explanation
        setStep('denied')
      }
    } catch {
      // Browser blocked the request entirely
      setStep('denied')
    }
  }

  const handleContinueWithout = () => {
    localStorage.setItem('spark_notif_setup_done', '1')
    localStorage.setItem('spark_notif_prompted', '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10001,
      background: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: 24,
        padding: '36px 28px 28px',
        maxWidth: 380,
        width: '100%',
        textAlign: 'center',
        border: '1px solid #334155',
        boxShadow: '0 32px 64px rgba(0, 0, 0, 0.6)',
        animation: 'notifPromptIn 0.35s ease-out',
      }}>

        {step === 'prompt' && (
          <>
            {/* Animated bell icon */}
            <div style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(34, 197, 94, 0.05))',
              border: '2px solid rgba(34, 197, 94, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              animation: 'notifBellPulse 2s ease-in-out infinite',
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>

            <h2 style={{
              color: '#f8fafc',
              fontSize: 22,
              fontWeight: 800,
              marginBottom: 8,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              letterSpacing: '-0.3px',
            }}>
              Turn On Notifications
            </h2>

            <p style={{
              color: '#94a3b8',
              fontSize: 14,
              lineHeight: 1.7,
              marginBottom: 28,
              maxWidth: 300,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}>
              Get instant alerts so you never miss a winning prediction or important update.
            </p>

            {/* Features list */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginBottom: 32,
              textAlign: 'left',
            }}>
              {[
                { emoji: '\u26BD', text: 'Live goal alerts for tracked matches' },
                { emoji: '\uD83D\uDCB0', text: 'Payment & credit confirmations' },
                { emoji: '\uD83D\uDCC8', text: 'Prediction results & community tips' },
                { emoji: '\uD83D\uDD14', text: 'Messages & referral earnings' },
              ].map((item, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{item.emoji}</span>
                  <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 500 }}>{item.text}</span>
                </div>
              ))}
            </div>

            {/* Enable button */}
            <button onClick={handleEnable} style={{
              width: '100%',
              padding: '16px 24px',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 16,
              border: 'none',
              borderRadius: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'transform 0.15s, box-shadow 0.15s',
              boxShadow: '0 4px 16px rgba(34, 197, 94, 0.3)',
              letterSpacing: '0.3px',
            }}>
              Enable Notifications
            </button>

            <p style={{
              color: '#475569',
              fontSize: 11,
              marginTop: 16,
              lineHeight: 1.5,
            }}>
              You can change this anytime in Settings
            </p>
          </>
        )}

        {step === 'denied' && (
          <>
            {/* Info icon */}
            <div style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'rgba(251, 191, 36, 0.1)',
              border: '2px solid rgba(251, 191, 36, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>

            <h2 style={{
              color: '#f8fafc',
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 10,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Notifications Blocked
            </h2>

            <p style={{
              color: '#94a3b8',
              fontSize: 14,
              lineHeight: 1.7,
              marginBottom: 24,
            }}>
              You won't receive alerts for goals, predictions, or messages. To enable later, go to your browser settings and allow notifications for this site.
            </p>

            <button onClick={handleContinueWithout} style={{
              width: '100%',
              padding: '14px 24px',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#e2e8f0',
              fontWeight: 600,
              fontSize: 15,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
              Continue Without Notifications
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes notifPromptIn {
          from { opacity: 0; transform: scale(0.92) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes notifBellPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
      `}</style>
    </div>
  )
}
