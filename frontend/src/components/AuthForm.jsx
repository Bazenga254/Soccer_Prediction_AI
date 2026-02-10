import { useState, useEffect, useRef, useCallback } from 'react'
import HCaptcha from '@hcaptcha/react-hcaptcha'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const GOOGLE_CLIENT_ID = '905871526482-4i8pfv8435p4eq10226j0agks7j007ag.apps.googleusercontent.com'
const HCAPTCHA_SITE_KEY = '93726ad0-1700-48aa-8aa6-77825d4cfbee'

export default function AuthForm({ initialMode = 'login', onClose = null, compact = false }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
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
  const handleCaptchaError = () => { setCaptchaToken(''); setError('CAPTCHA failed to load. Please try again.') }

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
    if (captchaToken) {
      setLoading(true)
      setError('')
      const result = await googleLogin(response.credential, referralRef.current, captchaToken)
      if (!result.success) {
        setError(result.error || 'Google login failed')
      }
      setLoading(false)
      setCaptchaToken('')
      if (captchaRef.current) captchaRef.current.resetCaptcha()
      return
    }
    setGooglePendingToken(response.credential)
    setShowCaptcha(true)
    setError('Please complete the CAPTCHA to continue with Google sign-in.')
  }, [googleLogin, captchaToken])

  // Proceed with Google login once CAPTCHA is completed
  useEffect(() => {
    if (googlePendingToken && captchaToken) {
      (async () => {
        setLoading(true)
        setError('')
        const result = await googleLogin(googlePendingToken, referralRef.current, captchaToken)
        if (!result.success) {
          setError(result.error || 'Google login failed')
        }
        setLoading(false)
        setGooglePendingToken(null)
        setCaptchaToken('')
        if (captchaRef.current) captchaRef.current.resetCaptcha()
      })()
    }
  }, [googlePendingToken, captchaToken, googleLogin])

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
      setError('Email and password are required')
      return
    }

    if (mode === 'signup' && !captchaToken) {
      setError('Please complete the CAPTCHA verification')
      return
    }
    if (mode === 'login' && showCaptcha && !captchaToken) {
      setError('Please complete the CAPTCHA verification')
      return
    }

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
      const reqs = getPasswordRequirements(password)
      if (!reqs.every(r => r.met)) {
        setError('Please meet all password requirements')
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
          setError('Please prove that you are a human')
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
        result = await register(email, password, '', referralCode, captchaToken)
        if (result.requires_verification) {
          setResendCooldown(60)
          setLoading(false)
          return
        }
      }

      if (!result.success) {
        setError(result.error || 'Something went wrong')
        setCaptchaToken('')
        if (captchaRef.current) captchaRef.current.resetCaptcha()
      } else {
        setAttemptsRemaining(null)
        setLockoutSeconds(0)
      }
    } catch (err) {
      setError(err.message || 'Connection error. Please try again.')
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
        setForgotMessage(`If an account exists with ${targetEmail}, a reset link has been sent. Check your inbox.`)
      }
    } catch (err) {
      if (err.response?.status === 423) {
        setForgotError('Account is temporarily locked. Please try again after the lockout period.')
      } else {
        setForgotError(err.response?.data?.detail || 'Failed to send reset link. Please try again.')
      }
    }
    setForgotLoading(false)
  }

  const handleSendResetLink = async () => {
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) {
      setForgotError('Please enter a valid email address')
      return
    }
    await sendResetLink(forgotEmail)
  }

  const handleVerifyCode = async (e) => {
    e.preventDefault()
    if (!verificationCode.trim() || verificationCode.length !== 6) {
      setVerifyError('Please enter the 6-digit code')
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
    { label: 'At least 8 characters', met: pwd.length >= 8 },
    { label: 'At least 2 uppercase letters', met: (pwd.match(/[A-Z]/g) || []).length >= 2 },
    { label: 'At least 2 lowercase letters', met: (pwd.match(/[a-z]/g) || []).length >= 2 },
    { label: 'At least 2 numbers', met: (pwd.match(/[0-9]/g) || []).length >= 2 },
    { label: 'At least 2 special characters', met: (pwd.match(/[^A-Za-z0-9]/g) || []).length >= 2 },
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
            <h1>Verify Your Email</h1>
            <p className="gate-subtitle">
              We sent a 6-digit code to <strong style={{color: '#3b82f6'}}>{pendingVerification.email}</strong>
            </p>
          </div>
        )}
        {compact && (
          <div className="auth-form-compact-header">
            <h2>Verify Your Email</h2>
            <p className="gate-subtitle">
              Code sent to <strong style={{color: '#3b82f6'}}>{pendingVerification.email}</strong>
            </p>
          </div>
        )}

        <form className="access-form" onSubmit={handleVerifyCode}>
          <div className="form-group">
            <label htmlFor="verify-code">Verification Code</label>
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
            {verifyLoading ? 'Verifying...' : 'Verify Email'}
          </button>
        </form>

        <div className="verify-actions">
          <button
            className="resend-btn"
            onClick={handleResendCode}
            disabled={resendCooldown > 0}
          >
            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
          </button>
          <button className="link-btn" onClick={handleBackToLogin}>
            Back to login
          </button>
        </div>

        <div className="verify-help">
          <p>Check your spam/junk folder if you don't see the email.</p>
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
          <h1>Spark AI Prediction</h1>
          <p className="gate-subtitle">Smart Match Analysis & Predictions</p>
        </div>
      )}
      {compact && onClose && (
        <div className="auth-form-compact-header">
          <h2>{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
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
            <h2 className="forgot-password-title">Reset Your Password</h2>
            <p className="forgot-password-label">Enter the email address associated with your account:</p>
            <div className="forgot-password-input-row">
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={forgotLoading}
                autoFocus
              />
              <button
                type="button"
                className="forgot-send-btn"
                onClick={handleSendResetLink}
                disabled={forgotLoading || !forgotEmail.trim()}
              >
                {forgotLoading ? 'Sending...' : 'Send'}
              </button>
            </div>
            {forgotMessage && <div className="forgot-success">{forgotMessage}</div>}
            {forgotError && <div className="gate-error" style={{ marginTop: '10px' }}>{forgotError}</div>}
          </div>
          <div className="gate-footer">
            <p>
              <button className="link-btn" onClick={() => setShowForgotPassword(false)}>
                I remember my password, log in
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
            Log In
          </button>
          <button
            className={`mode-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => { setMode('signup'); setError('') }}
          >
            Sign Up
          </button>
        </div>

        {/* Google Sign-In */}
        <div className="google-signin-section">
          <div ref={googleBtnRef} className="google-btn-wrapper"></div>
        </div>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <form className="access-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              disabled={loading || lockoutSeconds > 0}
              onBlur={handleEmailBlur}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Create a strong password' : 'Enter your password'}
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
                Forgot your password?
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
                <label htmlFor="confirm-password">Confirm Password</label>
                <div className="password-input-wrapper">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
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
            </>
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
                ? 'Warning: 1 attempt remaining before your account is locked for 24 hours.'
                : `You have ${attemptsRemaining} attempts remaining.`}
            </div>
          )}

          {/* Prominent forgot password prompt after 3 failed attempts */}
          {mode === 'login' && attemptsRemaining !== null && attemptsRemaining <= 2 && attemptsRemaining > 0 && lockoutSeconds === 0 && (
            <div className="forgot-password-prompt">
              <span>Forgotten your password? </span>
              <button type="button" className="link-btn forgot-prompt-link" onClick={handleForgotPassword}>
                Click here to reset it
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
              <p className="lockout-title">Account Temporarily Locked</p>
              <p className="lockout-message">Too many failed login attempts. You can try again in:</p>
              <div className="lockout-timer">{formatLockoutTime(lockoutSeconds)}</div>
              <p className="lockout-reset-hint">You can reset your password after the lockout period expires.</p>
            </div>
          )}

          <button type="submit" className="gate-submit-btn" disabled={loading || lockoutSeconds > 0 || ((showCaptcha || mode === 'signup') && !captchaToken)}>
            {loading ? (mode === 'login' ? 'Logging in...' : 'Creating account...') :
              lockoutSeconds > 0 ? 'Account Locked' :
              (mode === 'login' ? 'Log In' : 'Create Account')}
          </button>
        </form>

        {/* CAPTCHA for Google login pending */}
        {googlePendingToken && !captchaToken && (
          <div className="captcha-container" style={{ marginTop: '16px' }}>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '12px', textAlign: 'center' }}>
              Complete CAPTCHA to continue with Google
            </p>
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

        <div className="gate-footer">
          {mode === 'login' ? (
            <p>Don't have an account? <button className="link-btn" onClick={() => setMode('signup')}>Sign up for free</button></p>
          ) : (
            <p>Already have an account? <button className="link-btn" onClick={() => setMode('login')}>Log in</button></p>
          )}
        </div>
      </>)}
    </div>
  )
}
