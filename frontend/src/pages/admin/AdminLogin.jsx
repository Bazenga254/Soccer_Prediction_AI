import { useState } from 'react'
import { useAdmin } from './context/AdminContext'

export default function AdminLogin() {
  const { loginWithPassword } = useAdmin()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await loginWithPassword(password)
    if (!result.success) {
      setError(result.error)
    }
    setLoading(false)
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-logo">
          <span className="admin-login-icon">🛡️</span>
          <h1>Spark AI Admin</h1>
          <p>Enter your credentials to access the admin portal</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="admin-login-field">
            <label>Admin Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter admin password"
              autoFocus
            />
          </div>
          {error && <div className="admin-login-error">{error}</div>}
          <button type="submit" className="admin-login-btn" disabled={loading || !password}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
        <div className="admin-login-footer">
          <p>Staff members are automatically authenticated via their account.</p>
        </div>
      </div>
    </div>
  )
}
