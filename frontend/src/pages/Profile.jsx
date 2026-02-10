import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

export default function Profile() {
  const { user, updateUser, refreshProfile } = useAuth()
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState(user?.username || '')
  const [usernameAvailable, setUsernameAvailable] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [referralStats, setReferralStats] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

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
        updateUser({ username: res.data.username, display_name: res.data.display_name })
        setEditingUsername(false)
        setSuccess('Username updated!')
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update username')
    }
  }

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be smaller than 2MB')
      setTimeout(() => setError(''), 3000)
      return
    }

    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      setError('Only JPEG, PNG, GIF, and WebP images are allowed')
      setTimeout(() => setError(''), 3000)
      return
    }

    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await axios.post('/api/user/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      if (res.data.success) {
        updateUser({ avatar_url: res.data.avatar_url })
        setSuccess('Avatar updated!')
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to upload avatar')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveAvatar = async () => {
    setError('')
    try {
      const res = await axios.delete('/api/user/avatar')
      if (res.data.success) {
        updateUser({ avatar_url: null })
        setSuccess('Avatar removed!')
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove avatar')
    }
  }

  const referralLink = `${window.location.origin}/ref/${user.username}`

  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralLink)
    setSuccess('Referral link copied!')
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
          <div className="profile-avatar-wrapper">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="Avatar" className="profile-avatar-large profile-avatar-img" />
            ) : (
              <div className="profile-avatar-large" style={{ background: user.avatar_color }}>
                {(user.display_name || user.username || '?')[0].toUpperCase()}
              </div>
            )}
            <button
              className="avatar-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Change photo"
            >
              {uploading ? (
                <span className="avatar-upload-spinner" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              )}
            </button>
            {user.avatar_url && (
              <button
                className="avatar-remove-btn"
                onClick={handleRemoveAvatar}
                title="Remove photo"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleAvatarUpload}
              style={{ display: 'none' }}
            />
          </div>
          <div className="profile-header-info">
            <div className="profile-display-name">{user.display_name}</div>
            <div className="profile-username">@{user.username}</div>
            <span className={`tier-badge ${user.tier}`}>{user.tier === 'pro' ? 'PRO' : 'FREE'}</span>
          </div>
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
              <span className="referral-label">Your Referral Link</span>
              <div className="referral-code-row">
                <span className="referral-link-display">{referralLink}</span>
                <button className="copy-referral-btn" onClick={copyReferralLink}>Copy</button>
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
              Share your unique link with friends. Earn 30% lifetime commission on every Pro subscription from your referrals. Commission paid weekly on Fridays.
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
