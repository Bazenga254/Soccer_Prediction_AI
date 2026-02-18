import { useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import axios from 'axios'

export default function ResetPassword() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''
  const email = searchParams.get('email') || ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const getPasswordRequirements = (pwd) => [
    { label: t('auth.pwdReq1'), met: pwd.length >= 8 },
    { label: t('auth.pwdReq2'), met: (pwd.match(/[A-Z]/g) || []).length >= 2 },
    { label: t('auth.pwdReq3'), met: (pwd.match(/[a-z]/g) || []).length >= 2 },
    { label: t('auth.pwdReq4'), met: (pwd.match(/[0-9]/g) || []).length >= 2 },
    { label: t('auth.pwdReq5'), met: (pwd.match(/[^A-Za-z0-9]/g) || []).length >= 2 },
  ]

  const passwordReqs = useMemo(() => getPasswordRequirements(password), [password, t])
  const metCount = passwordReqs.filter(r => r.met).length
  const strengthPercent = (metCount / passwordReqs.length) * 100
  const strengthColor = strengthPercent <= 40 ? '#ef4444' : strengthPercent <= 80 ? '#f59e0b' : '#22c55e'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!token || !email) {
      setError(t('resetPassword.invalidResetRequest'))
      return
    }

    if (!password.trim()) {
      setError(t('resetPassword.enterNewPassword'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('resetPassword.passwordsNoMatch'))
      return
    }

    if (!passwordReqs.every(r => r.met)) {
      setError(t('resetPassword.meetRequirements'))
      return
    }

    setLoading(true)
    try {
      const response = await axios.post('/api/user/reset-password', {
        email,
        token,
        new_password: password,
      })
      if (response.data.success) {
        setSuccess(true)
      } else {
        setError(response.data.error || t('auth.somethingWrong'))
      }
    } catch (err) {
      setError(err.response?.data?.detail || t('resetPassword.failedReset'))
    }
    setLoading(false)
  }

  if (!token || !email) {
    return (
      <div className="reset-password-page">
        <div className="reset-password-card">
          <div className="gate-brand">
            <span className="gate-logo">&#9917;</span>
            <h1 className="gate-title">{t('auth.sparkAIPrediction')}</h1>
          </div>
          <div className="gate-error">{t('resetPassword.invalidResetLinkFull')}</div>
          <button className="gate-submit-btn" onClick={() => navigate('/')}>{t('resetPassword.goToLogin')}</button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="reset-password-page">
        <div className="reset-password-card">
          <div className="gate-brand">
            <span className="gate-logo">&#9917;</span>
            <h1 className="gate-title">{t('auth.sparkAIPrediction')}</h1>
          </div>
          <div className="reset-success">
            <div className="reset-success-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2 className="reset-success-title">{t('resetPassword.passwordResetSuccessTitle')}</h2>
            <p className="reset-success-message">
              {t('resetPassword.passwordResetSuccessMessage')}
            </p>
            <button className="gate-submit-btn" onClick={() => navigate('/')}>{t('resetPassword.goToLogin')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="reset-password-page">
      <div className="reset-password-card">
        <div className="gate-brand">
          <span className="gate-logo">&#9917;</span>
          <h1 className="gate-title">{t('auth.sparkAIPrediction')}</h1>
        </div>

        <h2 className="reset-heading">{t('resetPassword.createNewPassword')}</h2>
        <p className="reset-subtitle" dangerouslySetInnerHTML={{ __html: t('resetPassword.newPasswordFor', { email }) }} />

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="new-password">{t('resetPassword.newPassword')}</label>
            <div className="password-input-wrapper">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('resetPassword.createStrongPassword')}
                disabled={loading}
                autoFocus
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          {password.length > 0 && (
            <div className="password-requirements">
              <div className="password-strength-bar">
                <div className="password-strength-fill" style={{ width: `${strengthPercent}%`, background: strengthColor }} />
              </div>
              <ul className="password-req-list">
                {passwordReqs.map((req, i) => (
                  <li key={i} className={req.met ? 'req-met' : 'req-unmet'}>
                    <span className="req-icon">{req.met ? '\u2713' : '\u2717'}</span>
                    {req.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="confirm-password">{t('resetPassword.confirmNewPassword')}</label>
            <div className="password-input-wrapper">
              <input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('resetPassword.confirmYourPassword')}
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          {error && <div className="gate-error">{error}</div>}

          <button type="submit" className="gate-submit-btn" disabled={loading || !passwordReqs.every(r => r.met)}>
            {loading ? t('resetPassword.resettingPassword') : t('resetPassword.resetBtn')}
          </button>
        </form>

        <div className="gate-footer">
          <p>{t('resetPassword.rememberPassword')} <button className="link-btn" onClick={() => navigate('/')}>{t('resetPassword.backToLoginLink')}</button></p>
        </div>
      </div>
    </div>
  )
}
