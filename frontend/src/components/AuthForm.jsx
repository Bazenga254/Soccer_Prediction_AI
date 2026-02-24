import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import HCaptcha from '@hcaptcha/react-hcaptcha'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import CountryPicker from './CountryPicker'

const GOOGLE_CLIENT_ID = '905871526482-4i8pfv8435p4eq10226j0agks7j007ag.apps.googleusercontent.com'
const HCAPTCHA_SITE_KEY = '93726ad0-1700-48aa-8aa6-77825d4cfbee'

export default function AuthForm({ initialMode = 'login', onClose = null, compact = false }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [fullName, setFullName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [securityQuestion, setSecurityQuestion] = useState('')
  const [securityAnswer, setSecurityAnswer] = useState('')
  const [country, setCountry] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [referralCode] = useState(() => {
    const match = document.cookie.match(/spark_ref=([^;]+)/)
    return match ? match[1] : ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register, googleLogin, checkCaptchaRequired, pendingVerification, verifyEmail, resendCode, cancelVerification } = useAuth()
  const googleBtnRef = useRef(null)
  const referralRef = useRef('')

  // CAPTCHA state
  const [captchaToken, setCaptchaToken] = useState('')
  const [showCaptcha, setShowCaptcha] = useState(false)
  const captchaRef = useRef(null)
  const [googlePendingToken, setGooglePendingToken] = useState(null)

  // Lockout state
  const [lockoutSeconds, setLockoutSeconds] = useState(0)
  const [attemptsRemaining, setAttemptsRemaining] = useState(null)

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMessage, setForgotMessage] = useState('')
  const [forgotError, setForgotError] = useState('')

  // Verification state
  const [verificationCode, setVerificationCode] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [verifyError, setVerifyError] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  const { t } = useTranslation()

  useEffect(() => { referralRef.current = referralCode }, [referralCode])

  // Reset CAPTCHA and forgot password when mode changes
  useEffect(() => {
    setShowCaptcha(mode === 'signup')
    setCaptchaToken('')
    setShowForgotPassword(false)
    setForgotMessage('')
    setForgotError('')
    if (captchaRef.current) captchaRef.current.resetCaptcha()
  }, [mode])

  const handleCaptchaVerify = (token) => setCaptchaToken(token)
  const handleCaptchaExpire = () => setCaptchaToken('')
  const handleCaptchaError = () => { setCaptchaToken(''); setError(t('auth.captchaFailed')) }

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds > 0) {
      const timer = setTimeout(() => setLockoutSeconds(lockoutSeconds - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [lockoutSeconds])

  const formatLockoutTime = (seconds) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}h ${m}m ${s}s`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  const handleGoogleResponse = useCallback(async (response) => {
    if (!response.credential) return
    // For signup mode, require terms acceptance before Google auth
    if (mode === 'signup' && !termsAccepted) {
      setError(t('auth.termsRequired'))
      return
    }
    setLoading(true)
    setError('')
    // Try Google login directly - backend only requires CAPTCHA for new users
    const result = await googleLogin(response.credential, referralRef.current, captchaToken, termsAccepted)
    if (result.success) {
      setLoading(false)
      setCaptchaToken('')
      if (captchaRef.current) captchaRef.current.resetCaptcha()
      return
    }
    // If terms required (new user via Google without accepting terms)
    if (result.error && result.error.toLowerCase().includes('terms')) {
      setError(t('auth.termsRequired'))
      setLoading(false)
      return
    }
    // If CAPTCHA needed (new user) - show CAPTCHA and store token for retry
    if (result.error && result.error.toLowerCase().includes('captcha')) {
      setGooglePendingToken(response.credential)
      setShowCaptcha(true)
      setError(t('auth.newAccountCaptcha'))
      setLoading(false)
      return
    }
    setError(result.error || t('auth.googleLoginFailed'))
    setLoading(false)
    setCaptchaToken('')
    if (captchaRef.current) captchaRef.current.resetCaptcha()
  }, [googleLogin, captchaToken, t, mode, termsAccepted])

  // Proceed with Google login once CAPTCHA is completed
  useEffect(() => {
    if (googlePendingToken && captchaToken) {
      (async () => {
        setLoading(true)
        setError('')
        const result = await googleLogin(googlePendingToken, referralRef.current, captchaToken, termsAccepted)
        if (!result.success) {
          setError(result.error || t('auth.googleLoginFailed'))
        }
        setLoading(false)
        setGooglePendingToken(null)
        setCaptchaToken('')
        if (captchaRef.current) captchaRef.current.resetCaptcha()
      })()
    }
  }, [googlePendingToken, captchaToken, googleLogin, t])

  const handleWhopLogin = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await axios.get('/api/whop/oauth/authorize')
      if (response.data.redirect_url) {
        window.location.href = response.data.redirect_url
      } else {
        setError('Failed to connect to Whop. Please try again.')
        setLoading(false)
      }
    } catch {
      setError('Failed to connect to Whop. Please try again.')
      setLoading(false)
    }
  }

  useEffect(() => {
    const initGoogle = () => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
        })
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'filled_black',
          size: 'large',
          width: 320,
          text: 'continue_with',
          shape: 'rectangular',
        })
      }
    }

    if (window.google?.accounts?.id) {
      initGoogle()
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval)
          initGoogle()
        }
      }, 200)
      return () => clearInterval(interval)
    }
  }, [handleGoogleResponse])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password.trim()) {
      setError(t('auth.emailRequired'))
      return
    }

    if (mode === 'signup' && !captchaToken) {
      setError(t('auth.captchaRequired'))
      return
    }
    if (mode === 'login' && showCaptcha && !captchaToken) {
      setError(t('auth.captchaRequired'))
      return
    }

    if (mode === 'signup') {
      if (!termsAccepted) {
        setError(t('auth.termsRequired'))
        return
      }
      if (password !== confirmPassword) {
        setError(t('auth.passwordsNoMatch'))
        return
      }
      const reqs = getPasswordRequirements(password)
      if (!reqs.every(r => r.met)) {
        setError(t('auth.meetRequirements'))
        return
      }
    }

    setLoading(true)

    try {
      let result
      if (mode === 'login') {
        result = await login(email, password, captchaToken)

        if (result.account_locked) {
          setLockoutSeconds(result.remaining_seconds || 86400)
          setAttemptsRemaining(0)
          setError('')
          setLoading(false)
          return
        }

        if (result.captcha_required) {
          setShowCaptcha(true)
          setError(t('auth.proveHuman'))
          if (result.attempts_remaining !== undefined) {
            setAttemptsRemaining(result.attempts_remaining)
          }
          setLoading(false)
          return
        }

        if (result.requires_verification) {
          setResendCooldown(60)
          setLoading(false)
          return
        }

        if (!result.success && result.attempts_remaining !== undefined) {
          setAttemptsRemaining(result.attempts_remaining)
        }
      } else {
        result = await register(email, password, '', referralCode, captchaToken, {
          full_name: fullName.trim() || undefined,
          date_of_birth: dateOfBirth || undefined,
          security_question: securityQuestion || undefined,
          security_answer: securityAnswer.trim() || undefined,
          country: country || undefined,
          terms_accepted: true,
        })
        if (result.requires_verification) {
          setResendCooldown(60)
          setLoading(false)
          return
        }
      }

      if (!result.success) {
        setError(result.error || t('auth.somethingWrong'))
        setCaptchaToken('')
        if (captchaRef.current) captchaRef.current.resetCaptcha()
      } else {
        setAttemptsRemaining(null)
        setLockoutSeconds(0)
      }
    } catch (err) {
      setError(err.message || t('auth.connectionError'))
    }

    setLoading(false)
  }

  const handleEmailBlur = async () => {
    if (mode === 'login' && email.trim() && email.includes('@')) {
      const needed = await checkCaptchaRequired(email)
      if (needed) {
        setShowCaptcha(true)
      }
    }
  }

  const handleForgotPassword = () => {
    setShowForgotPassword(true)
    setForgotEmail(email || '')
    setForgotMessage('')
    setForgotError('')
  }

  const sendResetLink = async (targetEmail) => {
    setForgotLoading(true)
    setForgotError('')
    setForgotMessage('')
    try {
      const response = await axios.post('/api/user/forgot-password', { email: targetEmail })
      if (response.data.success) {
        setForgotMessage(t('auth.resetLinkSent', { email: targetEmail }))
      }
    } catch (err) {
      if (err.response?.status === 423) {
        setForgotError(t('auth.accountLocked423'))
      } else {
        setForgotError(err.response?.data?.detail || t('auth.failedSendReset'))
      }
    }
    setForgotLoading(false)
  }

  const handleSendResetLink = async () => {
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) {
      setForgotError(t('auth.enterValidEmail'))
      return
    }
    await sendResetLink(forgotEmail)
  }

  const handleVerifyCode = async (e) => {
    e.preventDefault()
    if (!verificationCode.trim() || verificationCode.length !== 6) {
      setVerifyError(t('auth.enterDigitCode'))
      return
    }
    setVerifyLoading(true)
    setVerifyError('')
    setResendMessage('')
    const result = await verifyEmail(pendingVerification.email, verificationCode)
    if (!result.success) {
      setVerifyError(result.error)
    }
    setVerifyLoading(false)
  }

  const handleResendCode = async () => {
    if (resendCooldown > 0) return
    setResendMessage('')
    setVerifyError('')
    const result = await resendCode(pendingVerification.email)
    if (result.success) {
      setResendMessage(result.message || 'New code sent!')
      setResendCooldown(60)
    } else {
      setVerifyError(result.error)
    }
  }

  const handleBackToLogin = () => {
    cancelVerification()
    setVerificationCode('')
    setVerifyError('')
    setResendMessage('')
    setMode('login')
  }

  const getPasswordRequirements = (pwd) => [
    { label: t('auth.pwdReq1'), met: pwd.length >= 8 },
    { label: t('auth.pwdReq2'), met: (pwd.match(/[A-Z]/g) || []).length >= 2 },
    { label: t('auth.pwdReq3'), met: (pwd.match(/[a-z]/g) || []).length >= 2 },
    { label: t('auth.pwdReq4'), met: (pwd.match(/[0-9]/g) || []).length >= 2 },
    { label: t('auth.pwdReq5'), met: (pwd.match(/[^A-Za-z0-9]/g) || []).length >= 2 },
  ]

  const passwordReqs = getPasswordRequirements(password)
  const passwordStrength = passwordReqs.filter(r => r.met).length
  const strengthPercent = (passwordStrength / passwordReqs.length) * 100
  const strengthColor = strengthPercent <= 20 ? '#ef4444' : strengthPercent <= 40 ? '#f97316' : strengthPercent <= 60 ? '#eab308' : strengthPercent <= 80 ? '#22c55e' : '#10b981'

  // Verification screen
  if (pendingVerification) {
    return (
      <div className="auth-form-wrapper">
        {!compact && (
          <div className="access-gate-header">
            <div className="gate-logo">
              <span className="gate-icon">&#9993;</span>
            </div>
            <h1>{t('auth.verifyEmail')}</h1>
            <p className="gate-subtitle">
              {t('auth.codeSentTo')} <strong style={{color: '#3b82f6'}}>{pendingVerification.email}</strong>
            </p>
          </div>
        )}
        {compact && (
          <div className="auth-form-compact-header">
            <h2>{t('auth.verifyEmail')}</h2>
            <p className="gate-subtitle">
              {t('auth.codeSentToCompact')} <strong style={{color: '#3b82f6'}}>{pendingVerification.email}</strong>
            </p>
          </div>
        )}

        <form className="access-form" onSubmit={handleVerifyCode}>
          <div className="form-group">
            <label htmlFor="verify-code">{t('auth.verificationCode')}</label>
            <input
              id="verify-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={verificationCode}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '')
                setVerificationCode(val)
              }}
              placeholder="000000"
              autoFocus
              disabled={verifyLoading}
              className="verification-code-input"
            />
          </div>

          {verifyError && <div className="gate-error">{verifyError}</div>}
          {resendMessage && <div className="gate-success">{resendMessage}</div>}

          <button type="submit" className="gate-submit-btn" disabled={verifyLoading || verificationCode.length !== 6}>
            {verifyLoading ? t('auth.verifying') : t('auth.verifyEmailBtn')}
          </button>
        </form>

        <div className="verify-actions">
          <button
            className="resend-btn"
            onClick={handleResendCode}
            disabled={resendCooldown > 0}
          >
            {resendCooldown > 0 ? t('auth.resendCodeIn', { seconds: resendCooldown }) : t('auth.resendCode')}
          </button>
          <button className="link-btn" onClick={handleBackToLogin}>
            {t('auth.backToLogin')}
          </button>
        </div>

        <div className="verify-help">
          <p>{t('auth.checkSpam')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-form-wrapper">
      {!compact && (
        <div className="access-gate-header">
          <div className="gate-logo">
            <span className="gate-icon">&#9917;</span>
          </div>
          <h1>{t('auth.sparkAIPrediction')}</h1>
          <p className="gate-subtitle">{t('auth.smartAnalysis')}</p>
        </div>
      )}
      {compact && onClose && (
        <div className="auth-form-compact-header">
          <h2>{mode === 'login' ? t('auth.welcomeBack') : t('auth.createAccountTitle')}</h2>
          <button className="auth-modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
      )}

      {/* Forgot Password Screen */}
      {showForgotPassword ? (
        <>
          <div className="forgot-password-screen">
            <div className="forgot-password-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h2 className="forgot-password-title">{t('auth.resetPassword')}</h2>
            <p className="forgot-password-label">{t('auth.resetPasswordLabel')}</p>
            <div className="forgot-password-input-row">
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                disabled={forgotLoading}
                autoFocus
              />
              <button
                type="button"
                className="forgot-send-btn"
                onClick={handleSendResetLink}
                disabled={forgotLoading || !forgotEmail.trim()}
              >
                {forgotLoading ? t('auth.sending') : t('auth.send')}
              </button>
            </div>
            {forgotMessage && <div className="forgot-success">{forgotMessage}</div>}
            {forgotError && <div className="gate-error" style={{ marginTop: '10px' }}>{forgotError}</div>}
          </div>
          <div className="gate-footer">
            <p>
              <button className="link-btn" onClick={() => setShowForgotPassword(false)}>
                {t('auth.rememberPassword')}
              </button>
            </p>
          </div>
        </>
      ) : (
      <>
        {/* Mode Toggle */}
        <div className="auth-mode-toggle">
          <button
            className={`mode-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError('') }}
          >
            {t('auth.login')}
          </button>
          <button
            className={`mode-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => { setMode('signup'); setError('') }}
          >
            {t('auth.signup')}
          </button>
        </div>

        {/* Google Sign-In */}
        <div className="google-signin-section">
          <div ref={googleBtnRef} className="google-btn-wrapper"></div>
        </div>

        {/* Whop Sign-In */}
        <button
          type="button"
          className="whop-login-btn"
          onClick={handleWhopLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.15)',
            background: '#7c3aed',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginTop: '8px',
            transition: 'background 0.2s',
          }}
          onMouseOver={e => e.currentTarget.style.background = '#6d28d9'}
          onMouseOut={e => e.currentTarget.style.background = '#7c3aed'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.22.21-1.79L9 13v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/>
          </svg>
          Continue with Whop
        </button>

        <div className="auth-divider">
          <span>{t('common.or')}</span>
        </div>

        <form className="access-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">{t('auth.email')}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder')}
              autoFocus
              disabled={loading || lockoutSeconds > 0}
              onBlur={handleEmailBlur}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t('auth.password')}</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? t('auth.createStrongPassword') : t('auth.enterPassword')}
                disabled={loading || lockoutSeconds > 0}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Forgot password link - login mode */}
          {mode === 'login' && lockoutSeconds === 0 && (
            <div className="forgot-password-link">
              <button type="button" className="link-btn" onClick={handleForgotPassword}>
                {t('auth.forgotPassword')}
              </button>
            </div>
          )}

          {mode === 'signup' && password.length > 0 && (
            <div className="password-requirements">
              <div className="password-strength-bar">
                <div
                  className="password-strength-fill"
                  style={{ width: `${strengthPercent}%`, background: strengthColor }}
                />
              </div>
              <ul className="password-req-list">
                {passwordReqs.map((req, i) => (
                  <li key={i} className={req.met ? 'req-met' : 'req-unmet'}>
                    <span className="req-icon">{req.met ? '\u2713' : '\u2717'}</span>
                    {req.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mode === 'signup' && (
            <>
              <div className="form-group">
                <label htmlFor="confirm-password">{t('auth.confirmPassword')}</label>
                <div className="password-input-wrapper">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('auth.repeatPassword')}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="signup-personal-section">
                <p className="signup-personal-label">{t('auth.personalInfo')}</p>

                <div className="form-group">
                  <label htmlFor="full-name">{t('auth.fullName')}</label>
                  <input
                    id="full-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t('auth.enterFullName')}
                    maxLength={100}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label>Country</label>
                  <CountryPicker
                    value={country}
                    onChange={setCountry}
                    disabled={loading}
                    placeholder="Search for your country"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="date-of-birth">{t('auth.dateOfBirth')}</label>
                  <input
                    id="date-of-birth"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="security-question">{t('auth.securityQuestion')}</label>
                  <select
                    id="security-question"
                    value={securityQuestion}
                    onChange={(e) => setSecurityQuestion(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">{t('auth.selectSecurityQuestion')}</option>
                    <option value="What is your mother's maiden name?">{t('auth.secQ1')}</option>
                    <option value="What was your first pet's name?">{t('auth.secQ2')}</option>
                    <option value="What city were you born in?">{t('auth.secQ3')}</option>
                    <option value="What is your favorite movie?">{t('auth.secQ4')}</option>
                    <option value="What was the name of your first school?">{t('auth.secQ5')}</option>
                    <option value="What is your childhood nickname?">{t('auth.secQ6')}</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="security-answer">{t('auth.securityAnswer')}</label>
                  <input
                    id="security-answer"
                    type="text"
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    placeholder={t('auth.enterYourAnswer')}
                    maxLength={200}
                    disabled={loading}
                  />
                </div>
              </div>
            </>
          )}

          {/* Terms of Service checkbox */}
          {mode === 'signup' && (
            <div className="terms-checkbox-section">
              <label className="terms-checkbox-label">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  disabled={loading}
                />
                <span>
                  {t('auth.agreeToTerms')}{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="terms-link">
                    {t('auth.termsOfService')}
                  </a>
                </span>
              </label>
            </div>
          )}

          {/* CAPTCHA Widget */}
          {(showCaptcha || mode === 'signup') && (
            <div className="captcha-container">
              <HCaptcha
                ref={captchaRef}
                sitekey={HCAPTCHA_SITE_KEY}
                onVerify={handleCaptchaVerify}
                onExpire={handleCaptchaExpire}
                onError={handleCaptchaError}
                theme="dark"
                size="normal"
              />
            </div>
          )}

          {error && <div className="gate-error">{error}</div>}

          {/* Remaining attempts warning */}
          {mode === 'login' && attemptsRemaining !== null && attemptsRemaining > 0 && lockoutSeconds === 0 && (
            <div className="gate-warning">
              {attemptsRemaining === 1
                ? t('auth.warningLastAttempt')
                : t('auth.attemptsRemaining', { count: attemptsRemaining })}
            </div>
          )}

          {/* Prominent forgot password prompt after 3 failed attempts */}
          {mode === 'login' && attemptsRemaining !== null && attemptsRemaining <= 2 && attemptsRemaining > 0 && lockoutSeconds === 0 && (
            <div className="forgot-password-prompt">
              <span>{t('auth.forgottenPassword')} </span>
              <button type="button" className="link-btn forgot-prompt-link" onClick={handleForgotPassword}>
                {t('auth.clickToReset')}
              </button>
            </div>
          )}

          {/* Account lockout countdown */}
          {lockoutSeconds > 0 && (
            <div className="gate-lockout">
              <div className="lockout-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <p className="lockout-title">{t('auth.accountTempLocked')}</p>
              <p className="lockout-message">{t('auth.tooManyAttempts')}</p>
              <div className="lockout-timer">{formatLockoutTime(lockoutSeconds)}</div>
              <p className="lockout-reset-hint">{t('auth.lockoutResetHint')}</p>
            </div>
          )}

          <button type="submit" className="gate-submit-btn" disabled={loading || lockoutSeconds > 0 || ((showCaptcha || mode === 'signup') && !captchaToken) || (mode === 'signup' && !termsAccepted)}>
            {loading ? (mode === 'login' ? t('auth.loggingIn') : t('auth.creatingAccount')) :
              lockoutSeconds > 0 ? t('auth.accountLocked') :
              (mode === 'login' ? t('auth.login') : t('auth.createAccount'))}
          </button>
        </form>

        <div className="gate-footer">
          {mode === 'login' ? (
            <p>{t('auth.noAccount')} <button className="link-btn" onClick={() => setMode('signup')}>{t('auth.signUpFree')}</button></p>
          ) : (
            <p>{t('auth.haveAccount')} <button className="link-btn" onClick={() => setMode('login')}>{t('auth.logIn')}</button></p>
          )}
        </div>
      </>)}
    </div>
  )
}
