import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import { isSoundEnabled, setSoundEnabled } from '../sounds'
import { useTheme } from '../context/ThemeContext'

const THEMES = [
  {
    id: 'dark',
    colors: ['#0f172a', '#1e293b', '#6c5ce7'],
  },
  {
    id: 'midnight',
    colors: ['#0a1628', '#0f1f3a', '#3b82f6'],
  },
  {
    id: 'light',
    colors: ['#f8fafc', '#ffffff', '#6c5ce7'],
  },
]

export default function Settings() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()

  // Sound
  const [soundOn, setSoundOn] = useState(isSoundEnabled())

  // Password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  const handleSoundToggle = () => {
    const next = !soundOn
    setSoundOn(next)
    setSoundEnabled(next)
  }

  const passwordReqs = useMemo(() => [
    { label: t('auth.pwdReq1', 'At least 8 characters'), met: newPassword.length >= 8 },
    { label: t('auth.pwdReq2', 'At least 2 uppercase letters'), met: (newPassword.match(/[A-Z]/g) || []).length >= 2 },
    { label: t('auth.pwdReq3', 'At least 2 lowercase letters'), met: (newPassword.match(/[a-z]/g) || []).length >= 2 },
    { label: t('auth.pwdReq4', 'At least 2 numbers'), met: (newPassword.match(/[0-9]/g) || []).length >= 2 },
    { label: t('auth.pwdReq5', 'At least 2 special characters'), met: (newPassword.match(/[^A-Za-z0-9]/g) || []).length >= 2 },
  ], [newPassword, t])

  const metCount = passwordReqs.filter(r => r.met).length
  const strengthPercent = (metCount / passwordReqs.length) * 100
  const strengthColor = strengthPercent <= 40 ? '#ef4444' : strengthPercent <= 80 ? '#f59e0b' : '#22c55e'

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwError('')
    setPwSuccess('')

    if (!currentPassword.trim()) {
      setPwError(t('settings.enterCurrentPassword', 'Please enter your current password'))
      return
    }
    if (!passwordReqs.every(r => r.met)) {
      setPwError(t('resetPassword.meetRequirements', 'Please meet all password requirements'))
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError(t('resetPassword.passwordsNoMatch', 'Passwords do not match'))
      return
    }

    setPwLoading(true)
    try {
      const res = await axios.post('/api/user/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      if (res.data.success) {
        setPwSuccess(t('settings.passwordChanged', 'Password changed successfully!'))
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      setPwError(err.response?.data?.detail || t('auth.somethingWrong', 'Something went wrong'))
    }
    setPwLoading(false)
  }

  return (
    <div className="settings-page">
      <button className="back-btn" onClick={() => navigate(-1)}>
        ← {t('settings.back', 'Back')}
      </button>

      <h1 className="settings-title">{t('settings.title', 'Settings')}</h1>

      {/* Sound Section */}
      <div className="settings-section">
        <div className="settings-section-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          <h2>{t('settings.sound', 'Sound')}</h2>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">{t('settings.notificationSounds', 'Notification Sounds')}</span>
            <span className="settings-row-desc">{t('settings.soundDescription', 'Goal whistles, message alerts, and notification sounds')}</span>
          </div>
          <button className={`settings-toggle ${soundOn ? 'on' : ''}`} onClick={handleSoundToggle}>
            <span className="settings-toggle-knob" />
          </button>
        </div>
      </div>

      {/* Theme Section */}
      <div className="settings-section">
        <div className="settings-section-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          <h2>{t('settings.theme', 'Theme')}</h2>
        </div>
        <p className="settings-section-desc">{t('settings.themeDescription', 'Choose your preferred appearance')}</p>
        <div className="settings-theme-grid">
          {THEMES.map((th) => (
            <button
              key={th.id}
              className={`settings-theme-card ${theme === th.id ? 'active' : ''}`}
              onClick={() => setTheme(th.id)}
            >
              <div className="theme-preview">
                {th.colors.map((c, i) => (
                  <span key={i} className="theme-dot" style={{ background: c }} />
                ))}
              </div>
              <span className="theme-label">{t(`settings.${th.id}`, th.id)}</span>
              {theme === th.id && (
                <svg className="theme-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Change Password Section */}
      <div className="settings-section">
        <div className="settings-section-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <h2>{t('settings.changePassword', 'Change Password')}</h2>
        </div>

        <form className="settings-password-form" onSubmit={handleChangePassword}>
          {pwError && <div className="settings-error">{pwError}</div>}
          {pwSuccess && <div className="settings-success">{pwSuccess}</div>}

          <div className="settings-field">
            <label>{t('settings.currentPassword', 'Current Password')}</label>
            <div className="settings-input-wrap">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button type="button" className="settings-eye" onClick={() => setShowCurrent(!showCurrent)}>
                {showCurrent ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          <div className="settings-field">
            <label>{t('settings.newPassword', 'New Password')}</label>
            <div className="settings-input-wrap">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button type="button" className="settings-eye" onClick={() => setShowNew(!showNew)}>
                {showNew ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>

            {newPassword && (
              <>
                <div className="settings-strength-bar">
                  <div className="settings-strength-fill" style={{ width: `${strengthPercent}%`, background: strengthColor }} />
                </div>
                <ul className="settings-reqs">
                  {passwordReqs.map((req, i) => (
                    <li key={i} className={req.met ? 'met' : ''}>
                      {req.met ? '\u2713' : '\u2717'} {req.label}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="settings-field">
            <label>{t('settings.confirmPassword', 'Confirm Password')}</label>
            <div className="settings-input-wrap">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button type="button" className="settings-eye" onClick={() => setShowConfirm(!showConfirm)}>
                {showConfirm ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" className="settings-submit" disabled={pwLoading}>
            {pwLoading ? t('settings.updating', 'Updating...') : t('settings.updatePassword', 'Update Password')}
          </button>
        </form>
      </div>
    </div>
  )
}
