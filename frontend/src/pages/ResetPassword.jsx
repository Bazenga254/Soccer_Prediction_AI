import { useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''
  const email = searchParams.get('email') || ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const getPasswordRequirements = (pwd) => [
    { label: 'At least 8 characters', met: pwd.length >= 8 },
    { label: 'At least 2 uppercase letters', met: (pwd.match(/[A-Z]/g) || []).length >= 2 },
    { label: 'At least 2 lowercase letters', met: (pwd.match(/[a-z]/g) || []).length >= 2 },
    { label: 'At least 2 numbers', met: (pwd.match(/[0-9]/g) || []).length >= 2 },
    { label: 'At least 2 special characters', met: (pwd.match(/[^A-Za-z0-9]/g) || []).length >= 2 },
  ]

  const passwordReqs = useMemo(() => getPasswordRequirements(password), [password])
  const metCount = passwordReqs.filter(r => r.met).length
  const strengthPercent = (metCount / passwordReqs.length) * 100
  const strengthColor = strengthPercent <= 40 ? '#ef4444' : strengthPercent <= 80 ? '#f59e0b' : '#22c55e'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!token || !email) {
      setError('Invalid reset link. Please request a new one.')
      return
    }

    if (!password.trim()) {
      setError('Please enter a new password')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (!passwordReqs.every(r => r.met)) {
      setError('Please meet all password requirements')
      return
    }

    setLoading(true)
    try {
      const response = await axios.post('/api/user/reset-password', {
        email,
        token,
        new_password: password,
      })
      if (response.data.success) {
        setSuccess(true)
      } else {
        setError(response.data.error || 'Something went wrong')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reset password. The link may have expired.')
    }
    setLoading(false)
  }

  if (!token || !email) {
    return (
      <div className="reset-password-page">
        <div className="reset-password-card">
          <div className="gate-brand">
            <span className="gate-logo">&#9917;</span>
            <h1 className="gate-title">Spark AI Prediction</h1>
          </div>
          <div className="gate-error">Invalid reset link. Please request a new password reset from the login page.</div>
          <button className="gate-submit-btn" onClick={() => navigate('/')}>Go to Login</button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="reset-password-page">
        <div className="reset-password-card">
          <div className="gate-brand">
            <span className="gate-logo">&#9917;</span>
            <h1 className="gate-title">Spark AI Prediction</h1>
          </div>
          <div className="reset-success">
            <div className="reset-success-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2 className="reset-success-title">Password Reset Successfully!</h2>
            <p className="reset-success-message">
              Your password has been changed. You can now log in with your new password.
              A confirmation email has been sent to your inbox.
            </p>
            <button className="gate-submit-btn" onClick={() => navigate('/')}>Go to Login</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="reset-password-page">
      <div className="reset-password-card">
        <div className="gate-brand">
          <span className="gate-logo">&#9917;</span>
          <h1 className="gate-title">Spark AI Prediction</h1>
        </div>

        <h2 className="reset-heading">Create New Password</h2>
        <p className="reset-subtitle">Enter a new password for <strong>{email}</strong></p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="new-password">New Password</label>
            <div className="password-input-wrapper">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                disabled={loading}
                autoFocus
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          {password.length > 0 && (
            <div className="password-requirements">
              <div className="password-strength-bar">
                <div className="password-strength-fill" style={{ width: `${strengthPercent}%`, background: strengthColor }} />
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

          <div className="form-group">
            <label htmlFor="confirm-password">Confirm Password</label>
            <div className="password-input-wrapper">
              <input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          {error && <div className="gate-error">{error}</div>}

          <button type="submit" className="gate-submit-btn" disabled={loading || !passwordReqs.every(r => r.met)}>
            {loading ? 'Resetting Password...' : 'Reset Password'}
          </button>
        </form>

        <div className="gate-footer">
          <p>Remember your password? <button className="link-btn" onClick={() => navigate('/')}>Back to login</button></p>
        </div>
      </div>
    </div>
  )
}
