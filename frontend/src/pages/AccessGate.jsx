import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function AccessGate() {
  const [mode, setMode] = useState('login') // 'login' or 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()

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
      } else {
        result = await register(email, password, displayName, referralCode)
      }

      if (!result.success) {
        setError(result.error || 'Something went wrong')
      }
    } catch (err) {
      setError(err.message || 'Connection error. Please try again.')
    }

    setLoading(false)
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
