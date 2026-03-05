import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '../context/CurrencyContext'
import axios from 'axios'

export default function MobileProfilePanel({ user, isOpen, onClose, logout }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isKenyan } = useCurrency()
  const [earnings, setEarnings] = useState(null)
  const [kesRate, setKesRate] = useState(130)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      axios.get('/api/user/earnings').then(res => setEarnings(res.data)).catch(() => {})
      if (isKenyan) {
        axios.post('/api/payment/quote', { amount_usd: 1 })
          .then(res => { if (res.data.amount_kes) setKesRate(res.data.amount_kes) })
          .catch(() => {})
      }
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen, isKenyan])

  const handleNav = (path) => {
    onClose()
    navigate(path)
  }

  const getBalance = () => {
    if (!earnings) return isKenyan ? 'KES 0' : '$0.00'
    const usd = (earnings.balance_usd || 0) + (earnings.account_balance_usd || 0)
    if (isKenyan) {
      const kes = (earnings.account_balance_kes || 0) + (usd * kesRate)
      return `KES ${Math.round(kes).toLocaleString()}`
    }
    return `$${usd.toFixed(2)}`
  }

  const tierLabel = user.tier === 'pro' ? 'PRO' : user.tier === 'trial' ? 'TRIAL' : 'FREE'
  const initial = (user.display_name || user.username || '?')[0].toUpperCase()

  if (!isOpen) return null

  return createPortal(
    <div className="mpp-overlay" onClick={onClose}>
      <div className="mpp-panel" onClick={e => e.stopPropagation()}>

        <div className="mpp-header">
          <span className="mpp-header-label">Account</span>
          <button className="mpp-close" onClick={onClose}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="mpp-user">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="mpp-avatar mpp-avatar-img" />
          ) : (
            <span className="mpp-avatar" style={{ background: user.avatar_color || 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
              {initial}
            </span>
          )}
          <div className="mpp-name">{user.display_name || user.username}</div>
          <div className="mpp-handle">@{user.username}</div>
          <div className={`mpp-badge mpp-badge-${user.tier}`}>
            {user.tier === 'pro' && (
              <svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            )}
            {tierLabel}
          </div>
        </div>

        <div className="mpp-wallet">
          <div className="mpp-wallet-info">
            <div className="mpp-wallet-label">Wallet Balance</div>
            <div className="mpp-wallet-amount">{getBalance()}</div>
          </div>
          <button className="mpp-topup" onClick={() => handleNav('/upgrade')}>Top Up</button>
        </div>

        <div className="mpp-menu">
          <button className="mpp-menu-item" onClick={() => handleNav('/profile')}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Profile
          </button>
          <button className="mpp-menu-item" onClick={() => handleNav('/my-predictions')}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>
            My Predictions
          </button>
          <button className="mpp-menu-item" onClick={() => handleNav('/creator')}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Creator Dashboard
          </button>
          <button className="mpp-menu-item" onClick={() => handleNav('/transactions')}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            Transactions
          </button>

          <div className="mpp-divider" />

          <button className="mpp-menu-item" onClick={() => handleNav('/settings')}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            Settings
          </button>
          <button className="mpp-menu-item" onClick={() => { onClose(); window.dispatchEvent(new Event('open-support-chat')) }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Support
          </button>

          <div className="mpp-divider" />

          {user.tier !== 'pro' && (
            <button className="mpp-menu-item mpp-upgrade" onClick={() => handleNav('/upgrade')}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Upgrade to PRO
            </button>
          )}

          <button className="mpp-menu-item mpp-signout" onClick={() => { onClose(); logout() }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>

      </div>
    </div>,
    document.body
  )
}
