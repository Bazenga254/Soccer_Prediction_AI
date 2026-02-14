import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'
import { isSoundEnabled, setSoundEnabled } from '../sounds'

const SECURITY_QUESTIONS = [
  "What is your mother's maiden name?",
  "What was your first pet's name?",
  "What city were you born in?",
  "What is your favorite movie?",
  "What was the name of your first school?",
  "What is your childhood nickname?",
]

export default function Profile() {
  const { user, updateUser, refreshProfile, logout } = useAuth()
  const navigate = useNavigate()
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState(user?.username || '')
  const [usernameAvailable, setUsernameAvailable] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [referralStats, setReferralStats] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef(null)

  // Personal info state
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth || '')
  const [securityQuestion, setSecurityQuestion] = useState(user?.security_question || '')
  const [securityAnswer, setSecurityAnswer] = useState('')
  const [savingPersonal, setSavingPersonal] = useState(false)

  // Sound preference state
  const [soundOn, setSoundOn] = useState(isSoundEnabled)

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

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

  const savePersonalInfo = async () => {
    setError('')
    setSuccess('')
    setSavingPersonal(true)
    try {
      const payload = {}
      if (fullName !== (user.full_name || '')) payload.full_name = fullName
      if (dateOfBirth !== (user.date_of_birth || '')) payload.date_of_birth = dateOfBirth
      if (securityQuestion !== (user.security_question || '')) payload.security_question = securityQuestion
      if (securityAnswer.trim()) payload.security_answer = securityAnswer

      if (Object.keys(payload).length === 0) {
        setError('No changes to save')
        setTimeout(() => setError(''), 3000)
        setSavingPersonal(false)
        return
      }

      await axios.put('/api/user/personal-info', payload)
      await refreshProfile()
      setSecurityAnswer('')
      setSuccess('Personal information updated!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update personal info')
      setTimeout(() => setError(''), 5000)
    } finally {
      setSavingPersonal(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteError('')
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm')
      return
    }
    if (!deletePassword) {
      setDeleteError('Please enter your password')
      return
    }
    setDeleting(true)
    try {
      await axios.delete('/api/user/account', { data: { password: deletePassword } })
      setShowDeleteModal(false)
      logout()
      navigate('/')
    } catch (err) {
      setDeleteError(err.response?.data?.detail || 'Failed to delete account')
    } finally {
      setDeleting(false)
    }
  }

  const referralLink = `${window.location.origin}/ref/${user.username}`

  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

        {/* Personal Information */}
        <div className="profile-personal-info">
          <h3 className="profile-section-title">Personal Information</h3>
          <p className="profile-section-desc">This information helps us verify your identity for support requests.</p>

          <div className="personal-info-form">
            <div className="personal-info-field">
              <label>Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                maxLength={100}
              />
            </div>

            <div className="personal-info-field">
              <label>Date of Birth</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>

            <div className="personal-info-field">
              <label>Security Question {user.security_question && <span className="security-set-badge">Set</span>}</label>
              <select
                value={securityQuestion}
                onChange={(e) => setSecurityQuestion(e.target.value)}
                disabled={!!user.security_question}
              >
                <option value="">Select a security question</option>
                {SECURITY_QUESTIONS.map(q => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
              {user.security_question && (
                <p className="security-question-disclaimer">Your security question cannot be changed once set, not even by an admin. This is for your account protection.</p>
              )}
            </div>

            <div className="personal-info-field">
              <label>Security Answer {user.has_security_answer && <span className="security-set-badge">Set</span>}</label>
              <input
                type="text"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                placeholder={user.has_security_answer ? 'Enter new answer to change' : 'Enter your answer'}
                maxLength={200}
              />
            </div>

            <button
              className="save-personal-btn"
              onClick={savePersonalInfo}
              disabled={savingPersonal}
            >
              {savingPersonal ? 'Saving...' : 'Save Personal Info'}
            </button>
          </div>
        </div>

        {/* Preferences */}
        <div className="profile-preferences">
          <h3 className="profile-section-title">Preferences</h3>
          <div className="preference-row">
            <div className="preference-info">
              <span className="preference-label">Sound Notifications</span>
              <span className="preference-desc">Play a sound when new messages arrive in support chat</span>
            </div>
            <button
              className={`sound-toggle ${soundOn ? 'on' : 'off'}`}
              onClick={() => {
                const next = !soundOn
                setSoundOn(next)
                setSoundEnabled(next)
              }}
              aria-label={soundOn ? 'Disable sounds' : 'Enable sounds'}
            >
              <span className="sound-toggle-knob" />
            </button>
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
                <button className={`copy-referral-btn${copied ? ' copied' : ''}`} onClick={copyReferralLink}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
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

        {/* Danger Zone */}
        <div className="profile-danger-zone">
          <h3 className="danger-zone-title">Danger Zone</h3>
          <p className="danger-zone-desc">
            Once you delete your account, there is no going back. All your data, predictions, and community posts will be permanently removed.
          </p>
          <button className="delete-account-btn" onClick={() => setShowDeleteModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete Account
          </button>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="delete-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="delete-modal-title">Delete Account</h3>
            <div className="delete-modal-warning">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p>This action is <strong>permanent</strong> and cannot be undone. All your data will be deleted.</p>
            </div>

            {deleteError && <div className="delete-modal-error">{deleteError}</div>}

            <div className="delete-modal-field">
              <label>Enter your password to confirm</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your password"
              />
            </div>

            <div className="delete-modal-field">
              <label>Type <strong>DELETE</strong> to confirm</label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
              />
            </div>

            <div className="delete-modal-actions">
              <button className="delete-modal-cancel" onClick={() => { setShowDeleteModal(false); setDeletePassword(''); setDeleteConfirmText(''); setDeleteError('') }}>
                Cancel
              </button>
              <button
                className="delete-modal-confirm"
                onClick={handleDeleteAccount}
                disabled={deleting || deleteConfirmText !== 'DELETE' || !deletePassword}
              >
                {deleting ? 'Deleting...' : 'Permanently Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
