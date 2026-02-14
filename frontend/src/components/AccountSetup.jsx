import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const SECURITY_QUESTIONS = [
  "What is your mother's maiden name?",
  "What was your first pet's name?",
  "What city were you born in?",
  "What is your favorite movie?",
  "What was the name of your first school?",
  "What is your childhood nickname?",
]

export default function AccountSetup() {
  const { user, refreshProfile } = useAuth()
  const [securityQuestion, setSecurityQuestion] = useState('')
  const [securityAnswer, setSecurityAnswer] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth || '')
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

        <h2 className="account-setup-title">Finish Setting Up Your Account</h2>
        <p className="account-setup-subtitle">
          Complete your profile to continue using the service. This helps us keep your account secure.
        </p>

        <form onSubmit={handleSubmit} className="account-setup-form">
          {/* Date of Birth */}
          <div className="account-setup-field">
            <label>Date of Birth</label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={e => setDateOfBirth(e.target.value)}
              max={maxDate}
              required
            />
          </div>

          {/* Security Question */}
          <div className="account-setup-field">
            <label>Security Question</label>
            <select
              value={securityQuestion}
              onChange={e => setSecurityQuestion(e.target.value)}
              required
            >
              <option value="">Select a security question...</option>
              {SECURITY_QUESTIONS.map(q => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>

          {/* Security Answer */}
          <div className="account-setup-field">
            <label>Security Answer</label>
            <input
              type="text"
              value={securityAnswer}
              onChange={e => setSecurityAnswer(e.target.value)}
              placeholder="Your answer (minimum 2 characters)"
              required
              minLength={2}
            />
            <span className="account-setup-hint">
              This answer will be used to verify your identity. Remember it carefully.
            </span>
          </div>

          {error && <div className="account-setup-error">{error}</div>}

          <button
            type="submit"
            className="account-setup-btn"
            disabled={!canSubmit || saving}
          >
            {saving ? 'Saving...' : 'Save & Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
