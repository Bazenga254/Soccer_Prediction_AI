import { useState, useEffect } from 'react'

let deferredPrompt = null

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const dismissed = localStorage.getItem('spark_pwa_dismissed')
    if (dismissed) {
      const sevenDays = 7 * 24 * 60 * 60 * 1000
      if (Date.now() - parseInt(dismissed, 10) < sevenDays) return
    }

    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(isIOSDevice)

    if (isIOSDevice) {
      const timer = setTimeout(() => setShowPrompt(true), 30000)
      return () => clearTimeout(timer)
    }

    const handler = (e) => {
      e.preventDefault()
      deferredPrompt = e
      setTimeout(() => setShowPrompt(true), 30000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowPrompt(false)
    }
    deferredPrompt = null
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('spark_pwa_dismissed', String(Date.now()))
  }

  if (!showPrompt) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: 16,
      right: 16,
      zIndex: 9999,
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      border: '1px solid #334155',
      borderRadius: 12,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      maxWidth: 480,
      margin: '0 auto',
    }}>
      <img
        src="/pwa-192x192.png"
        alt="Spark AI"
        style={{ width: 48, height: 48, borderRadius: 10 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{
          fontWeight: 700,
          fontSize: 15,
          color: '#f8fafc',
          marginBottom: 4,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          Install Spark AI
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.4 }}>
          {isIOS
            ? 'Tap the Share button, then "Add to Home Screen"'
            : 'Get quick access from your home screen'
          }
        </div>
      </div>
      {!isIOS && (
        <button
          onClick={handleInstall}
          style={{
            padding: '8px 20px',
            background: '#22c55e',
            color: '#0f172a',
            fontWeight: 600,
            fontSize: 14,
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Install
        </button>
      )}
      <button
        onClick={handleDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: '#64748b',
          fontSize: 20,
          cursor: 'pointer',
          padding: 4,
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        &#x2715;
      </button>
    </div>
  )
}
