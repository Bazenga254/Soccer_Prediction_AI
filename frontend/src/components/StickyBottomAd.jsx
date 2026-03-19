import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const AD_LINKS = [
  'https://omg10.com/4/10735990',
  'https://www.effectivegatecpm.com/px35t7j6x1?key=3126c4ab3a7178585b0fc92972a24690'
]

const MESSAGES = [
  { text: 'Earn free credits now!', cta: 'Watch Ad', icon: '\u{1F381}' },
  { text: 'Unlock premium predictions', cta: 'Learn More', icon: '\u{1F525}' },
  { text: 'Get AI-powered picks today', cta: 'Try Free', icon: '\u{1F3AF}' },
]

/**
 * StickyBottomAd — fixed bottom banner for free users.
 * Dismissible, reappears on page navigation.
 */
export default function StickyBottomAd() {
  const { user, loading } = useAuth()
  const [dismissed, setDismissed] = useState(false)

  if (loading) return null
  if (user?.is_admin || user?.tier === 'pro' || user?.is_staff) return null
  if (dismissed) return null
  // No sticky ad on landing/marketing pages
  if (location.pathname === '/' || location.pathname === '/pricing' || location.pathname === '/blog') return null

  const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)]
  const link = AD_LINKS[Math.floor(Math.random() * AD_LINKS.length)]

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 999,
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      borderTop: '1px solid rgba(245, 158, 11, 0.3)',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
    }}>
      <span style={{ fontSize: '22px' }}>{msg.icon}</span>
      <span style={{ flex: 1, color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 500 }}>
        {msg.text}
      </span>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: '#000',
          padding: '7px 18px',
          borderRadius: '6px',
          fontSize: '0.8rem',
          fontWeight: 700,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {msg.cta}
      </a>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'none',
          border: 'none',
          color: '#64748b',
          fontSize: '18px',
          cursor: 'pointer',
          padding: '0 4px',
          lineHeight: 1,
        }}
        aria-label="Close ad"
      >
        \u00D7
      </button>
      <span style={{ color: '#475569', fontSize: '0.55rem', position: 'absolute', right: '8px', top: '2px' }}>
        Ad
      </span>
    </div>
  )
}
