import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function AccessGate() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { verifyCode } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!code.trim()) {
      setError('Please enter your access code')
      return
    }

    setLoading(true)
    setError('')

    const result = await verifyCode(code)
    if (!result.success) {
      setError(result.message)
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
          <h1>Soccer Prediction AI</h1>
          <p className="gate-subtitle">Premium Match Analysis & Predictions</p>
        </div>

        <form className="access-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="access-code">Access Code</label>
            <input
              id="access-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Enter your access code"
              maxLength={12}
              autoFocus
              disabled={loading}
            />
          </div>

          {error && <div className="gate-error">{error}</div>}

          <button type="submit" className="gate-submit-btn" disabled={loading}>
            {loading ? 'Verifying...' : 'Access Platform'}
          </button>
        </form>

        <div className="gate-footer">
          <p>Don't have an access code?</p>
          <p className="gate-contact">Contact the admin on Discord to get your premium access code.</p>
        </div>
      </div>
    </div>
  )
}
