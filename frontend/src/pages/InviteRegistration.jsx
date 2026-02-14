import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

const ROLE_COLORS = {
  owner: '#e74c3c',
  general_manager: '#3498db',
  sales_hod: '#2ecc71',
  customer_care_hod: '#e67e22',
  marketing_hod: '#9b59b6',
  predictions_hod: '#1abc9c',
  sales_agent: '#27ae60',
  customer_support_agent: '#f39c12',
  prediction_analyst: '#16a085',
}

function formatRoleName(role) {
  if (!role) return ''
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function InviteRegistration() {
  const { token } = useParams()
  const navigate = useNavigate()

  // Validation state
  const [validating, setValidating] = useState(true)
  const [inviteData, setInviteData] = useState(null)
  const [validationError, setValidationError] = useState(null)

  // Form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const validateToken = async () => {
      try {
        setValidating(true)
        setValidationError(null)
        const res = await axios.get(`/api/invite/validate/${token}`)
        setInviteData(res.data)
      } catch (err) {
        const detail = err.response?.data?.detail || 'This invite link is invalid or has expired.'
        setValidationError(detail)
      } finally {
        setValidating(false)
      }
    }

    if (token) {
      validateToken()
    } else {
      setValidating(false)
      setValidationError('No invite token provided.')
    }
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError(null)

    if (!email.trim() || !password.trim() || !displayName.trim()) {
      setSubmitError('All fields are required.')
      return
    }

    if (password.length < 6) {
      setSubmitError('Password must be at least 6 characters.')
      return
    }

    try {
      setSubmitting(true)
      const res = await axios.post('/api/invite/register', {
        token,
        email: email.trim(),
        password,
        display_name: displayName.trim(),
      })

      const authToken = res.data.token || res.data.access_token
      if (authToken) {
        localStorage.setItem('spark_token', authToken)
      }

      navigate('/employee', { replace: true })
    } catch (err) {
      const detail = err.response?.data?.detail || 'Registration failed. Please try again.'
      setSubmitError(detail)
    } finally {
      setSubmitting(false)
    }
  }

  // Loading state
  if (validating) {
    return (
      <div className="invite-page">
        <div className="invite-container">
          <div className="invite-loading">
            <div className="invite-spinner" />
            <p>Validating your invite...</p>
          </div>
        </div>
      </div>
    )
  }

  // Invalid/expired token
  if (validationError) {
    return (
      <div className="invite-page">
        <div className="invite-container">
          <div className="invite-error-card">
            <div className="invite-error-icon">!</div>
            <h2 className="invite-error-title">Invalid Invite</h2>
            <p className="invite-error-message">{validationError}</p>
            <p className="invite-error-help">
              Contact your manager for a new invite link.
            </p>
            <a href="/login" className="invite-btn invite-btn-secondary">
              Go to Login
            </a>
          </div>
        </div>
      </div>
    )
  }

  // Valid token - show registration form
  const roleColor = ROLE_COLORS[inviteData?.role_name] || '#6c5ce7'

  return (
    <div className="invite-page">
      <div className="invite-container">
        <div className="invite-form-card">
          {/* Header */}
          <div className="invite-header">
            <div className="invite-logo">Spark AI</div>
            <h1 className="invite-title">You've been invited to join Spark AI</h1>
            <p className="invite-subtitle">Complete your registration to get started.</p>
          </div>

          {/* Role & Department Badge */}
          <div className="invite-meta">
            <div className="invite-badge-row">
              <span
                className="invite-role-badge"
                style={{
                  background: roleColor + '22',
                  color: roleColor,
                  border: `1px solid ${roleColor}44`,
                }}
              >
                {formatRoleName(inviteData?.role_name)}
              </span>
              {inviteData?.department && (
                <span className="invite-dept-badge">
                  {inviteData.department}
                </span>
              )}
            </div>
            {inviteData?.created_by_name && (
              <p className="invite-invited-by">
                Invited by: <strong>{inviteData.created_by_name}</strong>
              </p>
            )}
          </div>

          {/* Registration Form */}
          <form className="invite-form" onSubmit={handleSubmit}>
            <div className="invite-form-group">
              <label className="invite-label" htmlFor="invite-display-name">
                Display Name
              </label>
              <input
                id="invite-display-name"
                type="text"
                className="invite-input"
                placeholder="Your full name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
                autoComplete="name"
                disabled={submitting}
              />
            </div>

            <div className="invite-form-group">
              <label className="invite-label" htmlFor="invite-email">
                Email Address
              </label>
              <input
                id="invite-email"
                type="email"
                className="invite-input"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={submitting}
              />
            </div>

            <div className="invite-form-group">
              <label className="invite-label" htmlFor="invite-password">
                Password
              </label>
              <div className="invite-password-wrapper">
                <input
                  id="invite-password"
                  type={showPassword ? 'text' : 'password'}
                  className="invite-input"
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="invite-password-toggle"
                  onClick={() => setShowPassword(prev => !prev)}
                  tabIndex={-1}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {submitError && (
              <div className="invite-form-error">{submitError}</div>
            )}

            <button
              type="submit"
              className="invite-btn invite-btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div className="invite-footer">
            <p>
              Already have an account?{' '}
              <a href="/login" className="invite-link">Sign in</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
