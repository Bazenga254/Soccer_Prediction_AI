import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import axios from 'axios'

function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

export default function CookieConsent() {
  const { t } = useTranslation()
  const [show, setShow] = useState(false)
  const sessionIdRef = useRef(null)

  useEffect(() => {
    const consent = localStorage.getItem('spark_cookie_consent')
    if (consent) {
      // Already have consent in localStorage — init session tracking
      let sid = sessionStorage.getItem('spark_session_id')
      if (!sid) {
        sid = generateSessionId()
        sessionStorage.setItem('spark_session_id', sid)
      }
      sessionIdRef.current = sid
      return
    }
    // No localStorage consent — check backend in case user cleared cache
    let cancelled = false
    axios.get('/api/consent/status').then(res => {
      if (cancelled) return
      if (res.data.has_consent) {
        // Restore consent from backend
        const val = res.data.consent_given ? 'accepted' : 'declined'
        localStorage.setItem('spark_cookie_consent', val)
        localStorage.setItem('spark_consent_date', new Date().toISOString())
        let sid = sessionStorage.getItem('spark_session_id')
        if (!sid) {
          sid = generateSessionId()
          sessionStorage.setItem('spark_session_id', sid)
        }
        sessionIdRef.current = sid
        // Don't show banner
      } else {
        // No backend consent either — show banner after delay
        setTimeout(() => { if (!cancelled) setShow(true) }, 1000)
      }
    }).catch(() => {
      // Not logged in or network error — show banner after delay
      if (!cancelled) setTimeout(() => setShow(true), 1000)
    })
    return () => { cancelled = true }
  }, [])

  const getOrCreateSessionId = () => {
    let sid = sessionStorage.getItem('spark_session_id')
    if (!sid) {
      sid = generateSessionId()
      sessionStorage.setItem('spark_session_id', sid)
    }
    sessionIdRef.current = sid
    return sid
  }

  const handleAccept = () => {
    localStorage.setItem('spark_cookie_consent', 'accepted')
    localStorage.setItem('spark_consent_date', new Date().toISOString())
    setShow(false)
    const sid = getOrCreateSessionId()
    axios.post('/api/consent', {
      session_id: sid,
      consent_given: true,
    }).catch(() => {})
  }

  const handleDecline = () => {
    localStorage.setItem('spark_cookie_consent', 'declined')
    localStorage.setItem('spark_consent_date', new Date().toISOString())
    setShow(false)
    const sid = getOrCreateSessionId()
    axios.post('/api/consent', {
      session_id: sid,
      consent_given: false,
    }).catch(() => {})
  }

  if (!show) return null

  return (
    <div style={styles.banner}>
      <div style={styles.content}>
        <div style={styles.textBlock}>
          <div style={styles.titleRow}>
            <span style={styles.icon}>🍪</span>
            <span style={styles.title}>{t('cookies.title')}</span>
          </div>
          <p style={styles.message}>
            {t('cookies.message')}{' '}
            <Link to="/terms" style={styles.link}>{t('cookies.learnMore')}</Link>
          </p>
        </div>
        <div style={styles.actions}>
          <button style={styles.acceptBtn} onClick={handleAccept}>
            {t('cookies.accept')}
          </button>
          <button style={styles.declineBtn} onClick={handleDecline}>
            {t('cookies.decline')}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  banner: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10001,
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    borderTop: '1px solid #334155',
    padding: '16px 20px',
    boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
    animation: 'slideUp 0.3s ease-out',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    maxWidth: '1100px',
    margin: '0 auto',
    flexWrap: 'wrap',
  },
  textBlock: {
    flex: '1 1 400px',
    minWidth: '280px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  icon: {
    fontSize: '20px',
  },
  title: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#f1f5f9',
  },
  message: {
    fontSize: '13px',
    color: '#94a3b8',
    lineHeight: '1.5',
    margin: 0,
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'underline',
  },
  actions: {
    display: 'flex',
    gap: '10px',
    flexShrink: 0,
  },
  acceptBtn: {
    padding: '8px 20px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    whiteSpace: 'nowrap',
  },
  declineBtn: {
    padding: '8px 20px',
    background: 'transparent',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
}
