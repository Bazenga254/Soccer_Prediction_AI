import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

const GOOGLE_CLIENT_ID = '905871526482-4i8pfv8435p4eq10226j0agks7j007ag.apps.googleusercontent.com'

export default function AccessGate() {
  const [mode, setMode] = useState('login') // 'login' or 'signup'
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
  const { login, register, googleLogin, pendingVerification, verifyEmail, resendCode, cancelVerification } = useAuth()
  const googleBtnRef = useRef(null)
  const referralRef = useRef('')

  // Verification state
  const [verificationCode, setVerificationCode] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [verifyError, setVerifyError] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  useEffect(() => { referralRef.current = referralCode }, [referralCode])

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  const handleGoogleResponse = useCallback(async (response) => {
    if (!response.credential) return
    setLoading(true)
    setError('')
    const result = await googleLogin(response.credential, referralRef.current)
    if (!result.success) {
      setError(result.error || 'Google login failed')
    }
    setLoading(false)
  }, [googleLogin])

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
        result = await login(email, password)
        if (result.requires_verification) {
          setResendCooldown(60)
          setLoading(false)
          return
        }
      } else {
        result = await register(email, password, '', referralCode)
        if (result.requires_verification) {
          setResendCooldown(60)
          setLoading(false)
          return
        }
      }

      if (!result.success) {
        setError(result.error || 'Something went wrong')
      }
    } catch (err) {
      setError(err.message || 'Connection error. Please try again.')
    }

    setLoading(false)
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
      <div className="access-gate-page">
        <div className="access-gate-container">
          <div className="access-gate-header">
            <div className="gate-logo">
              <span className="gate-icon">&#9993;</span>
            </div>
            <h1>Verify Your Email</h1>
            <p className="gate-subtitle">
              We sent a 6-digit code to <strong style={{color: '#3b82f6'}}>{pendingVerification.email}</strong>
            </p>
          </div>

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
      </div>
    )
  }

  return (
    <div className="access-gate-page">
      <div className="access-gate-container">
        <div className="access-gate-header">
          <div className="gate-logo">
            <span className="gate-icon">&#9917;</span>
          </div>
          <h1>Spark AI Prediction</h1>
          <p className="gate-subtitle">Smart Match Analysis & Predictions</p>
        </div>

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
              disabled={loading}
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
                disabled={loading}
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
                    <span className="req-icon">{req.met ? '✓' : '✗'}</span>
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

          {error && <div className="gate-error">{error}</div>}

          <button type="submit" className="gate-submit-btn" disabled={loading}>
            {loading ? (mode === 'login' ? 'Logging in...' : 'Creating account...') :
              (mode === 'login' ? 'Log In' : 'Create Account')}
          </button>
        </form>

        <div className="gate-footer">
          {mode === 'login' ? (
            <p>Don't have an account? <button className="link-btn" onClick={() => setMode('signup')}>Sign up for free</button></p>
          ) : (
            <p>Already have an account? <button className="link-btn" onClick={() => setMode('login')}>Log in</button></p>
          )}
        </div>
      </div>
    </div>
  )
}
