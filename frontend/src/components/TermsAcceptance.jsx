import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

export default function TermsAcceptance() {
  const { t } = useTranslation()
  const { refreshProfile } = useAuth()
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const contentRef = useRef(null)

  const handleAccept = async () => {
    if (!accepted) return
    setError('')
    setSaving(true)
    try {
      await axios.post('/api/user/accept-terms')
      await refreshProfile()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const sections = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>

        <h2 style={styles.title}>{t('termsGate.title')}</h2>
        <p style={styles.subtitle}>{t('termsGate.subtitle')}</p>

        <div style={styles.termsScroll} ref={contentRef}>
          <h3 style={styles.termsHeading}>{t('terms.title')}</h3>
          <p style={styles.termsDate}>{t('terms.effectiveDate')}</p>
          {sections.map((num) => (
            <div key={num} style={num === 7 || num === 8 ? styles.sectionHighlight : styles.section}>
              <h4 style={num === 7 || num === 8 ? styles.sectionTitleRed : styles.sectionTitle}>
                {t(`terms.s${num}Title`)}
              </h4>
              <p style={styles.sectionContent}>{t(`terms.s${num}Content`)}</p>
            </div>
          ))}
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            style={styles.checkbox}
          />
          <span>{t('termsGate.agree')}</span>
        </label>

        <button
          style={{
            ...styles.acceptBtn,
            opacity: accepted && !saving ? 1 : 0.5,
            cursor: accepted && !saving ? 'pointer' : 'not-allowed',
          }}
          onClick={handleAccept}
          disabled={!accepted || saving}
        >
          {saving ? t('termsGate.saving') : t('termsGate.continue')}
        </button>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 9999,
  },
  card: {
    background: '#1e293b',
    borderRadius: '16px',
    border: '1px solid #334155',
    padding: '32px',
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  iconWrap: {
    textAlign: 'center',
    marginBottom: '12px',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#f1f5f9',
    textAlign: 'center',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: '#94a3b8',
    textAlign: 'center',
    margin: '0 0 20px 0',
    lineHeight: '1.5',
  },
  termsScroll: {
    flex: 1,
    overflowY: 'auto',
    background: '#0f172a',
    borderRadius: '10px',
    border: '1px solid #334155',
    padding: '20px',
    marginBottom: '16px',
    maxHeight: '400px',
  },
  termsHeading: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#f1f5f9',
    margin: '0 0 4px 0',
  },
  termsDate: {
    fontSize: '12px',
    color: '#64748b',
    margin: '0 0 16px 0',
  },
  section: {
    marginBottom: '16px',
  },
  sectionHighlight: {
    marginBottom: '16px',
    background: 'rgba(239, 68, 68, 0.05)',
    border: '1px solid rgba(239, 68, 68, 0.15)',
    borderRadius: '8px',
    padding: '12px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#e2e8f0',
    margin: '0 0 6px 0',
  },
  sectionTitleRed: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#f87171',
    margin: '0 0 6px 0',
  },
  sectionContent: {
    fontSize: '13px',
    color: '#94a3b8',
    lineHeight: '1.7',
    margin: 0,
    whiteSpace: 'pre-line',
  },
  error: {
    color: '#f87171',
    fontSize: '13px',
    textAlign: 'center',
    margin: '0 0 12px 0',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
    color: '#e2e8f0',
    marginBottom: '16px',
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    accentColor: '#3b82f6',
    cursor: 'pointer',
    flexShrink: 0,
  },
  acceptBtn: {
    width: '100%',
    padding: '12px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: '600',
    transition: 'all 0.2s',
  },
}
