import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'sw', name: 'Kiswahili', flag: '🇰🇪' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
]

export default function LanguageSelector({ variant = 'default' }) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const currentLang = LANGUAGES.find(l => l.code === (i18n.language?.split('-')[0] || 'en')) || LANGUAGES[0]

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  const handleSelect = (lang) => {
    i18n.changeLanguage(lang.code)
    document.documentElement.lang = lang.code
    document.documentElement.dir = lang.code === 'ar' ? 'rtl' : 'ltr'
    localStorage.removeItem('i18n_banner_dismissed')
    setOpen(false)
  }

  const isLanding = variant === 'landing'

  return (
    <div style={s.wrapper} ref={ref}>
      <button
        style={isLanding ? s.btnLanding : s.btn}
        onClick={() => setOpen(!open)}
        aria-label="Select language"
        title="Select language"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        <span style={s.langCode} className="lang-selector-code">{currentLang.code.toUpperCase()}</span>
      </button>

      {open && (
        <div style={s.dropdown}>
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              style={{
                ...s.item,
                ...(lang.code === currentLang.code ? s.itemActive : {}),
              }}
              onClick={() => handleSelect(lang)}
            >
              <span style={s.flag}>{lang.flag}</span>
              <span style={s.langName}>{lang.name}</span>
              {lang.code === currentLang.code && (
                <span style={s.check}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const s = {
  wrapper: {
    position: 'relative',
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 8px',
    background: 'transparent',
    border: '1px solid rgba(148,163,184,0.2)',
    borderRadius: 6,
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    transition: 'all 0.2s',
  },
  btnLanding: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 10px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#cbd5e1',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    transition: 'all 0.2s',
  },
  langCode: {
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: '0.5px',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    width: 180,
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: 4,
    zIndex: 9999,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 10px',
    background: 'none',
    border: 'none',
    borderRadius: 6,
    color: '#cbd5e1',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
    transition: 'background 0.15s',
  },
  itemActive: {
    background: 'rgba(59,130,246,0.15)',
    color: '#60a5fa',
  },
  flag: {
    fontSize: 16,
    width: 22,
    textAlign: 'center',
  },
  langName: {
    flex: 1,
  },
  check: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: 700,
  },
}
