import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const SUPPORTED_LANGS = ['fr', 'es', 'pt', 'sw', 'ar']

const BANNER_MESSAGES = {
  fr: { message: 'Ce site est disponible en Français.', switchBtn: 'Passer au Français', stayBtn: 'Rester en Anglais' },
  es: { message: 'Este sitio está disponible en Español.', switchBtn: 'Cambiar a Español', stayBtn: 'Quedarse en Inglés' },
  pt: { message: 'Este site está disponível em Português.', switchBtn: 'Mudar para Português', stayBtn: 'Ficar em Inglês' },
  sw: { message: 'Tovuti hii inapatikana kwa Kiswahili.', switchBtn: 'Badilisha kwa Kiswahili', stayBtn: 'Baki kwa Kiingereza' },
  ar: { message: 'هذا الموقع متوفر باللغة العربية.', switchBtn: 'التبديل إلى العربية', stayBtn: 'البقاء بالإنجليزية' },
}

export default function LanguageBanner() {
  const { i18n } = useTranslation()
  const [show, setShow] = useState(false)
  const [detectedLang, setDetectedLang] = useState(null)

  useEffect(() => {
    // Don't show if already dismissed or already using a non-English language
    if (localStorage.getItem('i18n_banner_dismissed')) return
    if (i18n.language && !i18n.language.startsWith('en')) return

    const browserLang = navigator.language?.split('-')[0]
    if (browserLang && browserLang !== 'en' && SUPPORTED_LANGS.includes(browserLang)) {
      setDetectedLang(browserLang)
      setShow(true)
    }
  }, [i18n.language])

  if (!show || !detectedLang) return null

  const msg = BANNER_MESSAGES[detectedLang]
  if (!msg) return null

  const handleSwitch = () => {
    i18n.changeLanguage(detectedLang)
    document.documentElement.lang = detectedLang
    document.documentElement.dir = detectedLang === 'ar' ? 'rtl' : 'ltr'
    setShow(false)
  }

  const handleDismiss = () => {
    localStorage.setItem('i18n_banner_dismissed', 'true')
    setShow(false)
  }

  return (
    <div style={styles.banner} dir={detectedLang === 'ar' ? 'rtl' : 'ltr'}>
      <div style={styles.content}>
        <span style={styles.icon}>🌐</span>
        <span style={styles.message}>{msg.message}</span>
        <div style={styles.actions}>
          <button style={styles.switchBtn} onClick={handleSwitch}>
            {msg.switchBtn}
          </button>
          <button style={styles.stayBtn} onClick={handleDismiss}>
            {msg.stayBtn}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  banner: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10000,
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    borderBottom: '1px solid #334155',
    padding: '10px 16px',
    animation: 'slideDown 0.3s ease-out',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    maxWidth: 900,
    margin: '0 auto',
    flexWrap: 'wrap',
  },
  icon: {
    fontSize: 20,
  },
  message: {
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: 'inherit',
  },
  actions: {
    display: 'flex',
    gap: 8,
  },
  switchBtn: {
    padding: '6px 16px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  stayBtn: {
    padding: '6px 16px',
    background: 'transparent',
    color: '#94a3b8',
    border: '1px solid #475569',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
