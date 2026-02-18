import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function UserMenuDropdown({ user, logout }) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [imgError, setImgError] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="user-menu-wrapper" ref={dropdownRef}>
      <button className="user-avatar-btn" onClick={() => setIsOpen(!isOpen)}>
        {user.avatar_url && !imgError ? (
          <img src={user.avatar_url} alt="" className="user-avatar-circle user-avatar-img" onError={() => setImgError(true)} />
        ) : (
          <span className="user-avatar-circle" style={{ background: user.avatar_color }}>
            {(user.display_name || user.username || '?')[0].toUpperCase()}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="user-menu-header">
            {user.avatar_url && !imgError ? (
              <img src={user.avatar_url} alt="" className="user-menu-avatar user-avatar-img" onError={() => setImgError(true)} />
            ) : (
              <span className="user-menu-avatar" style={{ background: user.avatar_color }}>
                {(user.display_name || user.username || '?')[0].toUpperCase()}
              </span>
            )}
            <div className="user-menu-info">
              <span className="user-menu-name">{user.display_name || user.username}</span>
              <span className="user-menu-username">@{user.username}</span>
              <span className={`user-menu-tier ${user.tier}`}>{user.tier === 'pro' ? 'PRO' : user.tier === 'trial' ? 'TRIAL' : 'FREE'}</span>
            </div>
          </div>

          <div className="user-menu-divider" />

          <Link to="/profile" className="user-menu-item" onClick={() => setIsOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>{t('userMenu.profile')}</span>
          </Link>

          <Link to="/my-predictions" className="user-menu-item" onClick={() => setIsOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span>{t('userMenu.myPredictions')}</span>
          </Link>

          <Link to="/creator" className="user-menu-item" onClick={() => setIsOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            <span>{t('userMenu.creatorDashboard')}</span>
          </Link>

          <Link to="/transactions" className="user-menu-item" onClick={() => setIsOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <span>{t('userMenu.transactions')}</span>
          </Link>

          <button className="user-menu-item" onClick={() => { setIsOpen(false); window.dispatchEvent(new Event('open-support-chat')) }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
            <span>{t('userMenu.support')}</span>
          </button>

          {user.tier !== 'pro' && (
            <Link to="/upgrade" className="user-menu-item upgrade-item" onClick={() => setIsOpen(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <span>{t('userMenu.upgradeToPro')}</span>
            </Link>
          )}

          <div className="user-menu-divider" />

          <button className="user-menu-item logout-item" onClick={() => { setIsOpen(false); logout() }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>{t('userMenu.signOut')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
