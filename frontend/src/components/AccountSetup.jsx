import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import CountryPicker from './CountryPicker'
import axios from 'axios'

export default function AccountSetup() {
  const { t } = useTranslation()
  const { user, refreshProfile, logout } = useAuth()

  // Step tracking: 1 = personal info + phone, 2 = WhatsApp OTP verification
  const [step, setStep] = useState(1)

  // Step 1 fields
  const [securityQuestion, setSecurityQuestion] = useState('')
  const [securityAnswer, setSecurityAnswer] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth || '')
  const [country, setCountry] = useState(user?.country || '')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Track if security Q is already set (from user profile OR detected at submit time)
  const [securityAlreadySet, setSecurityAlreadySet] = useState(false)

  // Step 2 fields (WhatsApp OTP)
  const [otpCode, setOtpCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [otpError, setOtpError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

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

    // Pre-fill phone if available
    if (user.whatsapp_number) {
      setWhatsappNumber(user.whatsapp_number)
      // If phone exists but not verified, skip to OTP step
      if (!user.whatsapp_verified) {
        setStep(2)
      }
    }

    // Pre-fill other fields
    if (user.date_of_birth) setDateOfBirth(user.date_of_birth)
    if (user.country) setCountry(user.country)
  }, [user])

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  // Validation for step 1
  const isPhoneValid = whatsappNumber.trim().length >= 10
  const isSecurityValid = hasSecuritySetup || (securityQuestion && securityAnswer.trim().length >= 2)
  const isDobValid = !!dateOfBirth
  const canSubmitStep1 = isSecurityValid && isDobValid && isPhoneValid

  // Step 1: Submit personal info and send WhatsApp OTP
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
          // Don't stop — continue to send OTP
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

      // Send WhatsApp OTP
      await axios.post('/api/user/whatsapp/verify-send', {
        phone_number: whatsappNumber.trim()
      })

      setResendCooldown(60)
      setStep(2)
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || 'Something went wrong.'

      // If security question already set, mark it and retry without security fields
      if (msg.toLowerCase().includes('security') && msg.toLowerCase().includes('cannot')) {
        setSecurityAlreadySet(true)
        setError('')
        // Auto-retry: now just send the phone OTP
        try {
          await axios.post('/api/user/whatsapp/verify-send', {
            phone_number: whatsappNumber.trim()
          })
          setResendCooldown(60)
          setStep(2)
        } catch (retryErr) {
          const retryMsg = retryErr.response?.data?.detail || 'Failed to send verification code.'
          setError(retryMsg)
        }
        setSaving(false)
        return
      }

      if (msg.includes('phone') || msg.includes('Phone') || msg.includes('number') || msg.includes('Number')) {
        if (msg.toLowerCase().includes('already linked') || msg.toLowerCase().includes('already')) {
          setError(msg)
        } else {
          setError('Please enter a valid phone number in international format (e.g., +254712345678).')
        }
      } else if (err.response?.status === 429) {
        setError('Too many attempts. Please wait a minute and try again.')
      } else {
        setError(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  // Step 2: Verify WhatsApp OTP
  const handleVerifyOTP = async (e) => {
    e.preventDefault()
    if (!otpCode.trim() || otpCode.length !== 6) return
    setOtpError('')
    setVerifying(true)
    try {
      await axios.post('/api/user/whatsapp/verify-confirm', { code: otpCode.trim() })
      await refreshProfile()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Invalid code.'
      if (msg.includes('expired') || msg.includes('Expired')) {
        setOtpError('Code has expired. Tap "Resend Code" to get a new one.')
      } else if (msg.includes('attempts') || msg.includes('locked')) {
        setOtpError('Too many failed attempts. Please wait a few minutes and try again.')
      } else {
        setOtpError(msg + ' Check the code and try again, or tap "Resend Code".')
      }
    } finally {
      setVerifying(false)
    }
  }

  // Resend OTP
  const handleResendOTP = async () => {
    if (resendCooldown > 0) return
    setOtpError('')
    try {
      await axios.post('/api/user/whatsapp/verify-send', {
        phone_number: whatsappNumber.trim() || user?.whatsapp_number || ''
      })
      setResendCooldown(60)
    } catch (err) {
      setOtpError(err.response?.data?.detail || 'Failed to resend code.')
    }
  }

  const today = new Date()
  const maxDate = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate())
    .toISOString().split('T')[0]

  return (
    <div className="account-setup-overlay">
      <div className="account-setup-card">
        <div className="account-setup-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={step === 1 ? "#f59e0b" : "#22c55e"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {step === 1 ? (
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
            ) : (
              <>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </>
            )}
          </svg>
        </div>

        {step === 1 ? (
          <>
            <h2 className="account-setup-title">
              {hasSecuritySetup ? 'Verify Your Phone Number' : t('accountSetup.title')}
            </h2>
            <p className="account-setup-subtitle">
              {hasSecuritySetup
                ? 'Please add your phone number to continue. We will send a verification code via SMS.'
                : t('accountSetup.subtitle')}
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

              {/* Phone Number */}
              <div className="account-setup-field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={whatsappNumber}
                  onChange={e => setWhatsappNumber(e.target.value)}
                  placeholder="+254712345678"
                  required
                  style={{ fontSize: 16 }}
                />
                <span className="account-setup-hint">
                  Enter your phone number in international format (e.g., +254712345678). A verification code will be sent via SMS.
                </span>
              </div>

              {error && <div className="account-setup-error">{error}</div>}

              <button
                type="submit"
                className="account-setup-btn"
                disabled={!canSubmitStep1 || saving}
              >
                {saving ? t('common.saving') : 'Continue & Verify Phone'}
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
          </>
        ) : (
          <>
            <h2 className="account-setup-title">Verify Your Phone</h2>
            <p className="account-setup-subtitle">
              We sent a 6-digit code to <strong>{whatsappNumber || user?.whatsapp_number || ''}</strong>. Enter it below.
            </p>

            <form onSubmit={handleVerifyOTP} className="account-setup-form">
              <div className="account-setup-field">
                <label>Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  className="wa-otp-input"
                  pattern="[0-9]*"
                />
              </div>

              {otpError && <div className="account-setup-error">{otpError}</div>}

              <button
                type="submit"
                className="account-setup-btn"
                disabled={otpCode.length !== 6 || verifying}
              >
                {verifying ? 'Verifying...' : 'Verify & Continue'}
              </button>

              <button
                type="button"
                className="account-setup-resend-btn"
                onClick={handleResendOTP}
                disabled={resendCooldown > 0}
              >
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : 'Resend Code'}
              </button>

              <button
                type="button"
                className="account-setup-back-btn"
                onClick={() => { setStep(1); setOtpCode(''); setOtpError('') }}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13, marginTop: 4 }}
              >
                Change phone number
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
          </>
        )}
      </div>
    </div>
  )
}
