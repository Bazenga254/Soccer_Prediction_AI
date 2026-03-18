import { useAuth } from '../context/AuthContext'

const AD_LINKS = [
  'https://omg10.com/4/10735990',
  'https://www.effectivegatecpm.com/px35t7j6x1?key=3126c4ab3a7178585b0fc92972a24690'
]

const AD_CREATIVES = [
  { text: 'Unlock Pro Tips', sub: 'Get expert predictions daily', icon: '\u{1F3AF}', color: '#f59e0b' },
  { text: 'Boost Your Wins', sub: 'Smart betting starts here', icon: '\u{1F680}', color: '#22c55e' },
  { text: 'Daily Free Picks', sub: 'Claim your rewards now', icon: '\u{1F381}', color: '#8b5cf6' },
  { text: 'Special Offer', sub: 'Limited time — check it out', icon: '\u{1F525}', color: '#ef4444' },
  { text: 'Win More Today', sub: 'AI-powered insights inside', icon: '\u26BD', color: '#3b82f6' },
]

/**
 * InlineAdBanner — native-looking ad card placed between content sections.
 * Only shown to free-tier, non-admin users.
 */
export default function InlineAdBanner({ slot = 0 }) {
  const { user } = useAuth()

  if (user?.is_admin || user?.tier === 'pro' || user?.is_staff) return null

  const creative = AD_CREATIVES[slot % AD_CREATIVES.length]
  const link = AD_LINKS[Math.floor(Math.random() * AD_LINKS.length)]

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-ad-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        margin: '8px 0',
        borderRadius: '10px',
        background: `linear-gradient(135deg, ${creative.color}15, ${creative.color}08)`,
        border: `1px solid ${creative.color}30`,
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      <span style={{ fontSize: '28px' }}>{creative.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ color: creative.color, fontWeight: 700, fontSize: '0.9rem' }}>
          {creative.text}
        </div>
        <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '2px' }}>
          {creative.sub}
        </div>
      </div>
      <div style={{
        background: creative.color,
        color: '#fff',
        padding: '6px 14px',
        borderRadius: '6px',
        fontSize: '0.75rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}>
        Check it out
      </div>
      <div style={{ color: '#475569', fontSize: '0.6rem', position: 'absolute', right: '8px', top: '4px' }}>
        Ad
      </div>
    </a>
  )
}
