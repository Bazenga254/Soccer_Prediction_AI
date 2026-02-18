import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import CountryPicker from './CountryPicker'
import axios from 'axios'

export default function AccountSetup() {
  const { t } = useTranslation()
  const { user, refreshProfile } = useAuth()
  const [securityQuestion, setSecurityQuestion] = useState('')
  const [securityAnswer, setSecurityAnswer] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth || '')
  const [country, setCountry] = useState(user?.country || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = securityQuestion && securityAnswer.trim().length >= 2 && dateOfBirth

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return

    setError('')
    setSaving(true)
    try {
      const payload = {
        security_question: securityQuestion,
        security_answer: securityAnswer.trim(),
        date_of_birth: dateOfBirth,
        country: country || undefined,
      }
      // Also save full_name if empty
      if (!user?.full_name) {
        payload.full_name = user?.display_name || ''
      }

      await axios.put('/api/user/personal-info', payload)
      await refreshProfile()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Calculate max date (must be at least 13 years old)
  const today = new Date()
  const maxDate = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate())
    .toISOString().split('T')[0]

  return (
    <div className="account-setup-overlay">
      <div className="account-setup-card">
        <div className="account-setup-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
          </svg>
        </div>

        <h2 className="account-setup-title">{t('accountSetup.title')}</h2>
        <p className="account-setup-subtitle">
          {t('accountSetup.subtitle')}
        </p>

        <form onSubmit={handleSubmit} className="account-setup-form">
          {/* Date of Birth */}
          <div className="account-setup-field">
            <label>{t('accountSetup.dateOfBirth')}</label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={e => setDateOfBirth(e.target.value)}
              max={maxDate}
              required
            />
          </div>

          {/* Country */}
          <div className="account-setup-field">
            <label>Country</label>
            <CountryPicker
              value={country}
              onChange={setCountry}
              disabled={saving}
              placeholder="Search for your country"
            />
          </div>

          {/* Security Question */}
          <div className="account-setup-field">
            <label>{t('accountSetup.securityQuestion')}</label>
            <select
              value={securityQuestion}
              onChange={e => setSecurityQuestion(e.target.value)}
              required
            >
              <option value="">{t('accountSetup.selectQuestion')}</option>
              <option value={t('auth.secQ1')}>{t('auth.secQ1')}</option>
              <option value={t('auth.secQ2')}>{t('auth.secQ2')}</option>
              <option value={t('auth.secQ3')}>{t('auth.secQ3')}</option>
              <option value={t('auth.secQ4')}>{t('auth.secQ4')}</option>
              <option value={t('auth.secQ5')}>{t('auth.secQ5')}</option>
              <option value={t('auth.secQ6')}>{t('auth.secQ6')}</option>
            </select>
          </div>

          {/* Security Answer */}
          <div className="account-setup-field">
            <label>{t('accountSetup.securityAnswer')}</label>
            <input
              type="text"
              value={securityAnswer}
              onChange={e => setSecurityAnswer(e.target.value)}
              placeholder={t('accountSetup.answerPlaceholder')}
              required
              minLength={2}
            />
            <span className="account-setup-hint">
              {t('accountSetup.answerHint')}
            </span>
          </div>

          {error && <div className="account-setup-error">{error}</div>}

          <button
            type="submit"
            className="account-setup-btn"
            disabled={!canSubmit || saving}
          >
            {saving ? t('common.saving') : t('accountSetup.saveContinue')}
          </button>
        </form>
      </div>
    </div>
  )
}
