import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

const GOOGLE_CLIENT_ID = '905871526482-4i8pfv8435p4eq10226j0agks7j007ag.apps.googleusercontent.com'

export default function AccessGate() {
  const [mode, setMode] = useState('login') // 'login' or 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [referralCode, setReferralCode] = useState('')
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
      if (password.length < 6) {
        setError('Password must be at least 6 characters')
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
        result = await register(email, password, displayName, referralCode)
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
          {mode === 'signup' && (
            <div className="form-group">
              <label htmlFor="display-name">Display Name (optional)</label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How should we call you?"
                maxLength={30}
                disabled={loading}
              />
            </div>
          )}

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
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'Min 6 characters' : 'Enter your password'}
              disabled={loading}
            />
          </div>

          {mode === 'signup' && (
            <>
              <div className="form-group">
                <label htmlFor="confirm-password">Confirm Password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="referral">Referral Code (optional)</label>
                <input
                  id="referral"
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="e.g. SPARK7X2KP"
                  maxLength={10}
                  disabled={loading}
                />
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
