import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

export default function Profile() {
  const { user, updateUser } = useAuth()
  const [editingUsername, setEditingUsername] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [newUsername, setNewUsername] = useState(user?.username || '')
  const [newDisplayName, setNewDisplayName] = useState(user?.display_name || '')
  const [usernameAvailable, setUsernameAvailable] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [referralStats, setReferralStats] = useState(null)

  useEffect(() => {
    const fetchReferralStats = async () => {
      try {
        const res = await axios.get('/api/user/referral-stats')
        setReferralStats(res.data)
      } catch { /* ignore */ }
    }
    fetchReferralStats()
  }, [])

  if (!user) return null

  const checkUsername = async (username) => {
    if (username.length < 3) {
      setUsernameAvailable(null)
      return
    }
    try {
      const res = await axios.get(`/api/user/check-username/${username}`)
      setUsernameAvailable(res.data.available || username === user.username)
    } catch {
      setUsernameAvailable(null)
    }
  }

  const saveUsername = async () => {
    setError('')
    setSuccess('')
    try {
      const res = await axios.put('/api/user/username', { username: newUsername })
      if (res.data.success) {
        updateUser({ username: res.data.username })
        setEditingUsername(false)
        setSuccess('Username updated!')
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update username')
    }
  }

  const saveDisplayName = async () => {
    setError('')
    setSuccess('')
    try {
      const res = await axios.put('/api/user/display-name', { display_name: newDisplayName })
      if (res.data.success) {
        updateUser({ display_name: res.data.display_name })
        setEditingName(false)
        setSuccess('Display name updated!')
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update display name')
    }
  }

  const copyReferral = () => {
    navigator.clipboard.writeText(user.referral_code)
    setSuccess('Referral code copied!')
    setTimeout(() => setSuccess(''), 2000)
  }

  return (
    <div className="profile-page">
      <div className="profile-container">
        <h2 className="profile-title">My Profile</h2>

        {error && <div className="profile-error">{error}</div>}
        {success && <div className="profile-success">{success}</div>}

        {/* Avatar & Name */}
        <div className="profile-header-section">
          <div className="profile-avatar-large" style={{ background: user.avatar_color }}>
            {(user.display_name || user.username || '?')[0].toUpperCase()}
          </div>
          <div className="profile-header-info">
            <div className="profile-display-name">{user.display_name}</div>
            <div className="profile-username">@{user.username}</div>
            <span className={`tier-badge ${user.tier}`}>{user.tier === 'pro' ? 'PRO' : 'FREE'}</span>
          </div>
        </div>

        {/* Edit Display Name */}
        <div className="profile-field">
          <label>Display Name</label>
          {editingName ? (
            <div className="profile-edit-row">
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                maxLength={30}
                autoFocus
              />
              <button className="save-btn" onClick={saveDisplayName}>Save</button>
              <button className="cancel-btn" onClick={() => setEditingName(false)}>Cancel</button>
            </div>
          ) : (
            <div className="profile-value-row">
              <span>{user.display_name}</span>
              <button className="edit-btn" onClick={() => { setEditingName(true); setNewDisplayName(user.display_name) }}>Edit</button>
            </div>
          )}
        </div>

        {/* Edit Username */}
        <div className="profile-field">
          <label>Username</label>
          {editingUsername ? (
            <div className="profile-edit-row">
              <div className="username-input-wrap">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '')
                    setNewUsername(val)
                    checkUsername(val)
                  }}
                  maxLength={24}
                  autoFocus
                />
                {usernameAvailable !== null && (
                  <span className={`username-status ${usernameAvailable ? 'available' : 'taken'}`}>
                    {usernameAvailable ? 'Available' : 'Taken'}
                  </span>
                )}
              </div>
              <button className="save-btn" onClick={saveUsername} disabled={usernameAvailable === false}>Save</button>
              <button className="cancel-btn" onClick={() => setEditingUsername(false)}>Cancel</button>
            </div>
          ) : (
            <div className="profile-value-row">
              <span>@{user.username}</span>
              <button className="edit-btn" onClick={() => { setEditingUsername(true); setNewUsername(user.username) }}>Edit</button>
            </div>
          )}
        </div>

        {/* Email (read-only) */}
        <div className="profile-field">
          <label>Email</label>
          <div className="profile-value-row">
            <span>{user.email}</span>
          </div>
        </div>

        {/* Referral System */}
        <div className="profile-field">
          <label>Referral Program</label>
          <div className="referral-card">
            <div className="referral-code-section">
              <span className="referral-label">Your Code</span>
              <div className="referral-code-row">
                <span className="referral-code-display">{user.referral_code}</span>
                <button className="copy-referral-btn" onClick={copyReferral}>Copy</button>
              </div>
            </div>

            <div className="referral-stats-row">
              <div className="referral-stat">
                <span className="referral-stat-value">{referralStats?.total_referred || 0}</span>
                <span className="referral-stat-label">Referrals</span>
              </div>
              <div className="referral-stat">
                <span className="referral-stat-value">{referralStats?.pro_referred || 0}</span>
                <span className="referral-stat-label">Pro Signups</span>
              </div>
              <div className="referral-stat">
                <span className="referral-stat-value">30%</span>
                <span className="referral-stat-label">Commission</span>
              </div>
            </div>

            {referralStats?.referrals?.length > 0 && (
              <div className="referral-list">
                <span className="referral-list-title">Your Referrals</span>
                {referralStats.referrals.map(r => (
                  <div key={r.id} className="referral-list-item">
                    <span className="referral-list-name">{r.display_name}</span>
                    <span className={`tier-tag ${r.tier}`}>{r.tier.toUpperCase()}</span>
                    <span className="referral-list-date">{new Date(r.joined).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="referral-hint">
              Share your code with friends. Earn 30% lifetime commission on every Pro subscription from your referrals. Commission paid weekly on Fridays.
            </p>
          </div>
        </div>

        {/* Account Info */}
        <div className="profile-field">
          <label>Member Since</label>
          <div className="profile-value-row">
            <span>{new Date(user.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
