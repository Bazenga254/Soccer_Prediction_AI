import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import CountryPicker from './CountryPicker'
import axios from 'axios'

export default function AccountSetup() {
  const { t } = useTranslation()
  const { user, refreshProfile, logout } = useAuth()

  // Form fields
  const [securityQuestion, setSecurityQuestion] = useState('')
  const [securityAnswer, setSecurityAnswer] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth || '')
  const [country, setCountry] = useState(user?.country || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Track if security Q is already set (from user profile OR detected at submit time)
  const [securityAlreadySet, setSecurityAlreadySet] = useState(false)

  // Detect if security Q is already set from user profile
  const hasSecurityFromProfile = !!(user?.security_question && user?.has_security_answer)
  const hasSecuritySetup = hasSecurityFromProfile || securityAlreadySet

  // Initialize from user profile
  useEffect(() => {
    if (!user) return

    // Detect security already set
    if (user.security_question && user.has_security_answer) {
      setSecurityAlreadySet(true)
    }

    // Pre-fill other fields
    if (user.date_of_birth) setDateOfBirth(user.date_of_birth)
    if (user.country) setCountry(user.country)
  }, [user])

  // Validation
  const isSecurityValid = hasSecuritySetup || (securityQuestion && securityAnswer.trim().length >= 2)
  const isDobValid = !!dateOfBirth
  const canSubmitStep1 = isSecurityValid && isDobValid

  // Submit personal info
  const handleStep1Submit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      // Save personal info (only fields that need setting)
      if (!hasSecuritySetup) {
        const payload = {
          security_question: securityQuestion,
          security_answer: securityAnswer.trim(),
          date_of_birth: dateOfBirth,
          country: country || undefined,
        }
        if (!user?.full_name) {
          payload.full_name = user?.display_name || ''
        }
        const infoRes = await axios.put('/api/user/personal-info', payload)
        const data = infoRes.data
        // If backend says security already set, mark it and continue
        if (data && data.success === false && data.error && data.error.toLowerCase().includes('security')) {
          setSecurityAlreadySet(true)
          // Don't stop — continue
        }
      } else {
        // Still update DOB and country if needed
        if (dateOfBirth || country) {
          try {
            await axios.put('/api/user/personal-info', {
              date_of_birth: dateOfBirth || undefined,
              country: country || undefined,
            })
          } catch (e) {
            // Non-critical, continue
          }
        }
      }

      // Profile complete — refresh to exit setup screen
      await refreshProfile()
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || 'Something went wrong.'

      // If security question already set, mark it and just refresh
      if (msg.toLowerCase().includes('security') && msg.toLowerCase().includes('cannot')) {
        setSecurityAlreadySet(true)
        setError('')
        await refreshProfile()
        setSaving(false)
        return
      }

      if (err.response?.status === 429) {
        setError('Too many attempts. Please wait a minute and try again.')
      } else {
        setError(msg)
      }
    } finally {
      setSaving(false)
    }
  }

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

        <h2 className="account-setup-title">
          {t('accountSetup.title')}
        </h2>
        <p className="account-setup-subtitle">
          {t('accountSetup.subtitle')}
        </p>

            <form onSubmit={handleStep1Submit} className="account-setup-form">
              {/* Security Q already set — show confirmation */}
              {hasSecuritySetup && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '10px', padding: '12px 14px', marginBottom: '4px'
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <span style={{ color: '#86efac', fontSize: '13px', lineHeight: '1.4' }}>
                    Security question is already set up.{user?.security_question ? ` (${user.security_question})` : ''}
                  </span>
                </div>
              )}

              {/* Only show DOB/Security fields if not already set */}
              {!hasSecuritySetup && (
                <>
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
                </>
              )}

              {error && <div className="account-setup-error">{error}</div>}

              <button
                type="submit"
                className="account-setup-btn"
                disabled={!canSubmitStep1 || saving}
              >
                {saving ? t('common.saving') : 'Complete Setup'}
              </button>

              <div className="account-setup-alt-actions">
                <button type="button" onClick={logout} className="account-setup-alt-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Sign Out
                </button>
                <span className="account-setup-alt-divider">|</span>
                <button type="button" onClick={logout} className="account-setup-alt-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="8.5" cy="7" r="4"/>
                    <line x1="20" y1="8" x2="20" y2="14"/>
                    <line x1="23" y1="11" x2="17" y2="11"/>
                  </svg>
                  Use a Different Account
                </button>
              </div>
            </form>
      </div>
    </div>
  )
}
