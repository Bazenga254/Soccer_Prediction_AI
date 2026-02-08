import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

export default function Admin() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [codes, setCodes] = useState([])
  const [newCodeDays, setNewCodeDays] = useState(30)
  const [newCodeLabel, setNewCodeLabel] = useState('')
  const [createdCode, setCreatedCode] = useState(null)
  const [loading, setLoading] = useState(false)

  const storedPassword = () => sessionStorage.getItem('admin_pw') || adminPassword

  const fetchCodes = useCallback(async () => {
    try {
      const response = await axios.get('/api/admin/codes', {
        headers: { 'x-admin-password': storedPassword() }
      })
      setCodes(response.data.codes || [])
    } catch {
      // ignore
    }
  }, [adminPassword])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    try {
      await axios.post('/api/admin/login', { password: adminPassword })
      setIsLoggedIn(true)
      sessionStorage.setItem('admin_pw', adminPassword)
      fetchCodes()
    } catch {
      setLoginError('Invalid admin password')
    }
  }

  useEffect(() => {
    const pw = sessionStorage.getItem('admin_pw')
    if (pw) {
      setAdminPassword(pw)
      setIsLoggedIn(true)
    }
  }, [])

  useEffect(() => {
    if (isLoggedIn) fetchCodes()
  }, [isLoggedIn, fetchCodes])

  const handleCreateCode = async () => {
    setLoading(true)
    setCreatedCode(null)
    try {
      const response = await axios.post('/api/admin/codes/create', {
        days_valid: newCodeDays,
        label: newCodeLabel,
      }, {
        headers: { 'x-admin-password': storedPassword() }
      })
      setCreatedCode(response.data)
      setNewCodeLabel('')
      fetchCodes()
    } catch (err) {
      alert('Failed to create code')
    }
    setLoading(false)
  }

  const handleRevoke = async (code) => {
    if (!confirm(`Revoke code ${code}?`)) return
    try {
      await axios.delete(`/api/admin/codes/${code}`, {
        headers: { 'x-admin-password': storedPassword() }
      })
      fetchCodes()
    } catch {
      alert('Failed to revoke code')
    }
  }

  const copyCode = (code) => {
    navigator.clipboard.writeText(code)
  }

  if (!isLoggedIn) {
    return (
      <div className="admin-page">
        <div className="admin-login-container">
          <h1>Admin Panel</h1>
          <p>Enter admin password to manage access codes</p>
          <form onSubmit={handleLogin} className="admin-login-form">
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Admin password"
              autoFocus
            />
            {loginError && <div className="gate-error">{loginError}</div>}
            <button type="submit" className="gate-submit-btn">Login</button>
          </form>
        </div>
      </div>
    )
  }

  const activeCodes = codes.filter(c => c.status === 'active')
  const inactiveCodes = codes.filter(c => c.status !== 'active')

  return (
    <div className="admin-page">
      <div className="admin-container">
        <div className="admin-header">
          <h1>Access Code Management</h1>
          <div className="admin-stats">
            <span className="stat-badge active">{activeCodes.length} Active</span>
            <span className="stat-badge expired">{inactiveCodes.length} Expired/Revoked</span>
          </div>
        </div>

        {/* Create New Code */}
        <div className="admin-section">
          <h2>Generate New Code</h2>
          <div className="create-code-form">
            <div className="form-row">
              <div className="form-group">
                <label>User/Label</label>
                <input
                  type="text"
                  value={newCodeLabel}
                  onChange={(e) => setNewCodeLabel(e.target.value)}
                  placeholder="e.g. John Discord"
                />
              </div>
              <div className="form-group">
                <label>Days Valid</label>
                <select value={newCodeDays} onChange={(e) => setNewCodeDays(parseInt(e.target.value))}>
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days (1 month)</option>
                  <option value={90}>90 days (3 months)</option>
                  <option value={365}>365 days (1 year)</option>
                </select>
              </div>
              <button
                className="create-code-btn"
                onClick={handleCreateCode}
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Generate Code'}
              </button>
            </div>
          </div>

          {createdCode && (
            <div className="created-code-display">
              <div className="created-code-value">{createdCode.code}</div>
              <button className="copy-btn" onClick={() => copyCode(createdCode.code)}>Copy Code</button>
              <p className="created-code-info">
                Valid for {createdCode.days_valid} days (expires {new Date(createdCode.expires_at).toLocaleDateString()})
              </p>
            </div>
          )}
        </div>

        {/* Active Codes */}
        <div className="admin-section">
          <h2>Active Codes ({activeCodes.length})</h2>
          <div className="codes-table">
            <div className="codes-header">
              <span>Code</span>
              <span>Label</span>
              <span>Expires</span>
              <span>Days Left</span>
              <span>Uses</span>
              <span>Actions</span>
            </div>
            {activeCodes.map(c => (
              <div key={c.code} className="code-row active">
                <span className="code-value">{c.code}</span>
                <span>{c.label || '-'}</span>
                <span>{new Date(c.expires_at).toLocaleDateString()}</span>
                <span className="days-remaining">{c.days_remaining}d</span>
                <span>{c.use_count}</span>
                <span className="code-actions">
                  <button className="copy-small-btn" onClick={() => copyCode(c.code)}>Copy</button>
                  <button className="revoke-btn" onClick={() => handleRevoke(c.code)}>Revoke</button>
                </span>
              </div>
            ))}
            {activeCodes.length === 0 && (
              <div className="no-codes">No active codes. Generate one above.</div>
            )}
          </div>
        </div>

        {/* Inactive Codes */}
        {inactiveCodes.length > 0 && (
          <div className="admin-section">
            <h2>Expired / Revoked ({inactiveCodes.length})</h2>
            <div className="codes-table">
              <div className="codes-header">
                <span>Code</span>
                <span>Label</span>
                <span>Status</span>
                <span>Expired</span>
                <span>Uses</span>
                <span></span>
              </div>
              {inactiveCodes.map(c => (
                <div key={c.code} className="code-row inactive">
                  <span className="code-value">{c.code}</span>
                  <span>{c.label || '-'}</span>
                  <span className={`status-badge ${c.status}`}>{c.status}</span>
                  <span>{new Date(c.expires_at).toLocaleDateString()}</span>
                  <span>{c.use_count}</span>
                  <span></span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="admin-logout-btn" onClick={() => {
          sessionStorage.removeItem('admin_pw')
          setIsLoggedIn(false)
        }}>
          Logout
        </button>
      </div>
    </div>
  )
}
