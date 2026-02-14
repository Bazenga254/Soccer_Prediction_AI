import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'

export default function AccessCodesTab() {
  const { getAuthHeaders } = useAdmin()
  const [codes, setCodes] = useState([])
  const [newCodeDays, setNewCodeDays] = useState(30)
  const [newCodeLabel, setNewCodeLabel] = useState('')
  const [createdCode, setCreatedCode] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchCodes = useCallback(async () => {
    try {
      const response = await axios.get('/api/admin/codes', { headers: getAuthHeaders() })
      setCodes(response.data.codes || [])
    } catch { /* ignore */ }
  }, [getAuthHeaders])

  useEffect(() => { fetchCodes() }, [fetchCodes])

  const handleCreateCode = async () => {
    setLoading(true)
    setCreatedCode(null)
    try {
      const response = await axios.post('/api/admin/codes/create', {
        days_valid: newCodeDays,
        label: newCodeLabel,
      }, { headers: getAuthHeaders() })
      setCreatedCode(response.data)
      setNewCodeLabel('')
      fetchCodes()
    } catch { alert('Failed to create code') }
    setLoading(false)
  }

  const handleRevoke = async (code) => {
    if (!confirm(`Revoke code ${code}?`)) return
    try {
      await axios.delete(`/api/admin/codes/${code}`, { headers: getAuthHeaders() })
      fetchCodes()
    } catch { alert('Failed to revoke code') }
  }

  const copyCode = (code) => navigator.clipboard.writeText(code)

  const activeCodes = codes.filter(c => c.status === 'active')
  const inactiveCodes = codes.filter(c => c.status !== 'active')

  return (
    <div className="admin-tab-content">
      <h3>Generate New Code</h3>
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
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>365 days</option>
            </select>
          </div>
          <button className="create-code-btn" onClick={handleCreateCode} disabled={loading}>
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

      <h3>Active Codes ({activeCodes.length})</h3>
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
        {activeCodes.length === 0 && <div className="no-codes">No active codes.</div>}
      </div>

      {inactiveCodes.length > 0 && (
        <>
          <h3>Expired / Revoked ({inactiveCodes.length})</h3>
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
        </>
      )}
    </div>
  )
}
