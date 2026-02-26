import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import HCaptcha from '@hcaptcha/react-hcaptcha'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import CountryPicker from './CountryPicker'

const GOOGLE_CLIENT_ID = '905871526482-4i8pfv8435p4eq10226j0agks7j007ag.apps.googleusercontent.com'
const HCAPTCHA_SITE_KEY = '93726ad0-1700-48aa-8aa6-77825d4cfbee'
const TOTAL_SIGNUP_STEPS = 6

export default function AuthForm({ initialMode = 'login', onClose = null, compact = false }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [fullName, setFullName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [securityQuestion, setSecurityQuestion] = useState('')
  const [securityAnswer, setSecurityAnswer] = useState('')
  const [country, setCountry] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [referralCode] = useState(() => {
    const match = document.cookie.match(/spark_ref=([^;]+)/)
    return match ? match[1] : ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register, googleLogin, checkCaptchaRequired, pendingVerification, verifyEmail, resendCode, cancelVerification, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const googleBtnRef = useRef(null)
  const referralRef = useRef('')

  // CAPTCHA state
  const [captchaToken, setCaptchaToken] = useState('')
  const [showCaptcha, setShowCaptcha] = useState(false)
  const captchaRef = useRef(null)
  const [googlePendingToken, setGooglePendingToken] = useState(null)

  // Lockout state
  const [lockoutSeconds, setLockoutSeconds] = useState(0)
  const [attemptsRemaining, setAttemptsRemaining] = useState(null)

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMessage, setForgotMessage] = useState('')
  const [forgotError, setForgotError] = useState('')

  // Verification state
  const [verificationCode, setVerificationCode] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [verifyError, setVerifyError] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  // ====== Signup Wizard State ======
  const [signupStep, setSignupStep] = useState(1)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneCodeSent, setPhoneCodeSent] = useState(false)
  const [phoneCooldown, setPhoneCooldown] = useState(0)
  const [phoneError, setPhoneError] = useState('')
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [savingFinal, setSavingFinal] = useState(false)

  const { t } = useTranslation()

  useEffect(() => { referralRef.current = referralCode }, [referralCode])

  // Reset CAPTCHA and forgot password when mode changes
  useEffect(() => {
    setShowCaptcha(mode === 'signup')
    setCaptchaToken('')
    setShowForgotPassword(false)
    setForgotMessage('')
    setForgotError('')
    setError('')
    if (mode === 'signup') setSignupStep(1)
    if (captchaRef.current) captchaRef.current.resetCaptcha()
  }, [mode])

  const handleCaptchaVerify = (token) => setCaptchaToken(token)
  const handleCaptchaExpire = () => setCaptchaToken('')
  const handleCaptchaError = () => { setCaptchaToken(''); setError(t('auth.captchaFailed')) }

  // Cooldown timers
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  useEffect(() => {
    if (phoneCooldown > 0) {
      const timer = setTimeout(() => setPhoneCooldown(phoneCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [phoneCooldown])

  useEffect(() => {
    if (lockoutSeconds > 0) {
      const timer = setTimeout(() => setLockoutSeconds(lockoutSeconds - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [lockoutSeconds])

  const formatLockoutTime = (seconds) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}h ${m}m ${s}s`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  // Google login handler
  const handleGoogleResponse = useCallback(async (response) => {
    if (!response.credential) return
    if (mode === 'signup' && !termsAccepted) {
      setError(t('auth.termsRequired'))
      return
    }
    setLoading(true)
    setError('')
    const result = await googleLogin(response.credential, referralRef.current, captchaToken, termsAccepted)
    if (result.success) {
      setLoading(false)
      setCaptchaToken('')
      if (captchaRef.current) captchaRef.current.resetCaptcha()
      return
    }
    if (result.error && result.error.toLowerCase().includes('terms')) {
      setError(t('auth.termsRequired'))
      setLoading(false)
      return
    }
    if (result.error && result.error.toLowerCase().includes('captcha')) {
      setGooglePendingToken(response.credential)
      setShowCaptcha(true)
      setError(t('auth.newAccountCaptcha'))
      setLoading(false)
      return
    }
    setError(result.error || t('auth.googleLoginFailed'))
    setLoading(false)
    setCaptchaToken('')
    if (captchaRef.current) captchaRef.current.resetCaptcha()
  }, [googleLogin, captchaToken, t, mode, termsAccepted])

  useEffect(() => {
    if (googlePendingToken && captchaToken) {
      (async () => {
        setLoading(true)
        setError('')
        const result = await googleLogin(googlePendingToken, referralRef.current, captchaToken, termsAccepted)
        if (!result.success) setError(result.error || t('auth.googleLoginFailed'))
        setLoading(false)
        setGooglePendingToken(null)
        setCaptchaToken('')
        if (captchaRef.current) captchaRef.current.resetCaptcha()
      })()
    }
  }, [googlePendingToken, captchaToken, googleLogin, t])

  const handleWhopLogin = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await axios.get('/api/whop/oauth/authorize')
      if (response.data.redirect_url) {
        window.location.href = response.data.redirect_url
      } else {
        setError('Failed to connect to Whop. Please try again.')
        setLoading(false)
      }
    } catch {
      setError('Failed to connect to Whop. Please try again.')
      setLoading(false)
    }
  }

  useEffect(() => {
    const initGoogle = () => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
        })
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'filled_black',
          size: 'large',
          width: 320,
          text: 'continue_with',
          shape: 'rectangular',
        })
      }
    }
    if (window.google?.accounts?.id) {
      initGoogle()
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval)
          initGoogle()
        }
      }, 200)
      return () => clearInterval(interval)
    }
  }, [handleGoogleResponse])

  // ====== LOGIN FORM SUBMIT ======
  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password.trim()) {
      setError(t('auth.emailRequired'))
      return
    }
    if (showCaptcha && !captchaToken) {
      setError(t('auth.captchaRequired'))
      return
    }
    setLoading(true)
    try {
      const result = await login(email, password, captchaToken)
      if (result.account_locked) {
        setLockoutSeconds(result.remaining_seconds || 86400)
        setAttemptsRemaining(0)
        setError('')
        setLoading(false)
        return
      }
      if (result.captcha_required) {
        setShowCaptcha(true)
        setError(t('auth.proveHuman'))
        if (result.attempts_remaining !== undefined) setAttemptsRemaining(result.attempts_remaining)
        setLoading(false)
        return
      }
      if (result.requires_verification) {
        setResendCooldown(60)
        setLoading(false)
        return
      }
      if (!result.success && result.attempts_remaining !== undefined) {
        setAttemptsRemaining(result.attempts_remaining)
      }
      if (!result.success) {
        setError(result.error || t('auth.somethingWrong'))
        setCaptchaToken('')
        if (captchaRef.current) captchaRef.current.resetCaptcha()
      } else {
        setAttemptsRemaining(null)
        setLockoutSeconds(0)
      }
    } catch (err) {
      setError(err.message || t('auth.connectionError'))
    }
    setLoading(false)
  }

  const handleEmailBlur = async () => {
    if (mode === 'login' && email.trim() && email.includes('@')) {
      const needed = await checkCaptchaRequired(email)
      if (needed) setShowCaptcha(true)
    }
  }

  // Forgot password handlers
  const handleForgotPassword = () => {
    setShowForgotPassword(true)
    setForgotEmail(email || '')
    setForgotMessage('')
    setForgotError('')
  }

  const handleSendResetLink = async () => {
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) {
      setForgotError(t('auth.enterValidEmail'))
      return
    }
    setForgotLoading(true)
    setForgotError('')
    setForgotMessage('')
    try {
      const response = await axios.post('/api/user/forgot-password', { email: forgotEmail })
      if (response.data.success) setForgotMessage(t('auth.resetLinkSent', { email: forgotEmail }))
    } catch (err) {
      if (err.response?.status === 423) setForgotError(t('auth.accountLocked423'))
      else setForgotError(err.response?.data?.detail || t('auth.failedSendReset'))
    }
    setForgotLoading(false)
  }

  // Email verification handlers
  const handleVerifyCode = async (e) => {
    e.preventDefault()
    if (!verificationCode.trim() || verificationCode.length !== 6) {
      setVerifyError(t('auth.enterDigitCode'))
      return
    }
    setVerifyLoading(true)
    setVerifyError('')
    setResendMessage('')
    const result = await verifyEmail(pendingVerification.email, verificationCode)
    if (!result.success) setVerifyError(result.error)
    setVerifyLoading(false)
  }

  const handleResendCode = async () => {
    if (resendCooldown > 0) return
    setResendMessage('')
    setVerifyError('')
    const result = await resendCode(pendingVerification.email)
    if (result.success) {
      setResendMessage(result.message || 'New code sent!')
      setResendCooldown(60)
    } else {
      setVerifyError(result.error)
    }
  }

  const handleBackToLogin = () => {
    cancelVerification()
    setVerificationCode('')
    setVerifyError('')
    setResendMessage('')
    setMode('login')
  }

  // Password requirements
  const getPasswordRequirements = (pwd) => [
    { label: t('auth.pwdReq1'), met: pwd.length >= 8 },
    { label: t('auth.pwdReq2'), met: (pwd.match(/[A-Z]/g) || []).length >= 2 },
    { label: t('auth.pwdReq3'), met: (pwd.match(/[a-z]/g) || []).length >= 2 },
    { label: t('auth.pwdReq4'), met: (pwd.match(/[0-9]/g) || []).length >= 2 },
    { label: t('auth.pwdReq5'), met: (pwd.match(/[^A-Za-z0-9]/g) || []).length >= 2 },
  ]

  const passwordReqs = getPasswordRequirements(password)
  const passwordStrength = passwordReqs.filter(r => r.met).length
  const strengthPercent = (passwordStrength / passwordReqs.length) * 100
  const strengthColor = strengthPercent <= 20 ? '#ef4444' : strengthPercent <= 40 ? '#f97316' : strengthPercent <= 60 ? '#eab308' : strengthPercent <= 80 ? '#22c55e' : '#10b981'

  // Max DOB (13 years old minimum)
  const today = new Date()
  const maxDobDate = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate()).toISOString().split('T')[0]

  // ====== SIGNUP WIZARD STEP HANDLERS ======

  // Step 1: Email — validate and go next
  const handleStep1Next = () => {
    setError('')
    if (!email.trim() || !email.includes('@') || !email.includes('.')) {
      setError('Please enter a valid email address.')
      return
    }
    setSignupStep(2)
  }

  // Step 2: Password + CAPTCHA + Terms → Register
  const handleStep2Register = async () => {
    setError('')
    if (password !== confirmPassword) {
      setError(t('auth.passwordsNoMatch'))
      return
    }
    const reqs = getPasswordRequirements(password)
    if (!reqs.every(r => r.met)) {
      setError(t('auth.meetRequirements'))
      return
    }
    if (!captchaToken) {
      setError(t('auth.captchaRequired'))
      return
    }
    if (!termsAccepted) {
      setError('You must accept the Terms of Service to continue.')
      return
    }
    setLoading(true)
    try {
      const result = await register(email, password, '', referralCode, captchaToken, {
        terms_accepted: true,
      })
      if (result.requires_verification) {
        setResendCooldown(60)
        setSignupStep(3)
      } else if (!result.success) {
        setError(result.error || t('auth.somethingWrong'))
        setCaptchaToken('')
        if (captchaRef.current) captchaRef.current.resetCaptcha()
      }
    } catch (err) {
      setError(err.message || t('auth.connectionError'))
    }
    setLoading(false)
  }

  // Step 3: Email OTP — handled by handleVerifyCode + transitions to step 4
  const handleStep3Verify = async (e) => {
    e.preventDefault()
    if (!verificationCode.trim() || verificationCode.length !== 6) {
      setVerifyError(t('auth.enterDigitCode'))
      return
    }
    setVerifyLoading(true)
    setVerifyError('')
    setResendMessage('')
    try {
      // Use direct API call instead of AuthContext's verifyEmail
      // to avoid setting isAuthenticated=true mid-wizard (which would
      // unmount the modal on the landing page)
      const response = await axios.post('/api/user/verify-email', {
        email: pendingVerification?.email || email,
        code: verificationCode,
      })
      if (response.data.success) {
        // Store token for authenticated API calls in steps 4-7
        const { token } = response.data
        localStorage.setItem('spark_token', token)
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
        cancelVerification()
        setSignupStep(4)
      } else {
        setVerifyError(response.data.error || 'Verification failed.')
      }
    } catch (err) {
      setVerifyError(err.response?.data?.detail || 'Verification failed.')
    }
    setVerifyLoading(false)
  }

  // Step 4: Personal info — just advance
  const handleStep4Next = () => {
    setError('')
    if (!fullName.trim()) {
      setError('Please enter your full name.')
      return
    }
    if (!dateOfBirth) {
      setError('Please enter your date of birth.')
      return
    }
    setSignupStep(5)
  }

  // Step 5: Security Q&A — just advance
  const handleStep5Next = () => {
    setError('')
    if (!securityQuestion) {
      setError('Please select a security question.')
      return
    }
    if (!securityAnswer.trim() || securityAnswer.trim().length < 2) {
      setError('Security answer must be at least 2 characters.')
      return
    }
    setSignupStep(6)
  }

  // Step 6: Phone verification
  const handleSendPhoneCode = async () => {
    setPhoneError('')
    const phone = phoneNumber.trim()
    if (!phone || phone.length < 10) {
      setPhoneError('Please enter a valid phone number in international format.')
      return
    }
    setPhoneLoading(true)
    try {
      await axios.post('/api/user/whatsapp/verify-send', { phone_number: phone })
      setPhoneCodeSent(true)
      setPhoneCooldown(60)
    } catch (err) {
      setPhoneError(err.response?.data?.detail || 'Failed to send code. Please try again.')
    }
    setPhoneLoading(false)
  }

  const handleVerifyPhoneCode = async () => {
    setPhoneError('')
    if (phoneCode.length !== 6) {
      setPhoneError('Please enter the 6-digit code.')
      return
    }
    setPhoneLoading(true)
    try {
      await axios.post('/api/user/whatsapp/verify-confirm', { code: phoneCode.trim() })
      // Phone verified — now save personal info and complete setup
      setSavingFinal(true)
      try {
        await axios.put('/api/user/personal-info', {
          full_name: fullName.trim() || undefined,
          date_of_birth: dateOfBirth || undefined,
          security_question: securityQuestion || undefined,
          security_answer: securityAnswer.trim() || undefined,
          country: country || undefined,
        })
        await axios.post('/api/user/accept-terms')
        await refreshProfile()
        navigate('/')
      } catch (saveErr) {
        setPhoneError(saveErr.response?.data?.detail || 'Setup failed. Please try again.')
        setSavingFinal(false)
      }
    } catch (err) {
      setPhoneError(err.response?.data?.detail || 'Invalid code. Please try again.')
    }
    setPhoneLoading(false)
  }

  const handleResendPhoneCode = async () => {
    if (phoneCooldown > 0) return
    setPhoneError('')
    try {
      await axios.post('/api/user/whatsapp/verify-send', { phone_number: phoneNumber.trim() })
      setPhoneCooldown(60)
    } catch (err) {
      setPhoneError(err.response?.data?.detail || 'Failed to resend code.')
    }
  }



  // ====== STEP ICONS ======
  const stepIcons = {
    1: <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
    2: <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
    3: <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    4: <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    5: <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    6: <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  }

  // ====== RENDER: Verification screen for LOGIN mode (existing flow) ======
  if (pendingVerification && mode !== 'signup') {
    return (
      <div className="auth-form-wrapper">
        {!compact && (
          <div className="access-gate-header">
            <div className="gate-logo"><span className="gate-icon">&#9993;</span></div>
            <h1>{t('auth.verifyEmail')}</h1>
            <p className="gate-subtitle">
              {t('auth.codeSentTo')} <strong style={{color: '#3b82f6'}}>{pendingVerification.email}</strong>
            </p>
          </div>
        )}
        {compact && (
          <div className="auth-form-compact-header">
            <h2>{t('auth.verifyEmail')}</h2>
            <p className="gate-subtitle">
              {t('auth.codeSentToCompact')} <strong style={{color: '#3b82f6'}}>{pendingVerification.email}</strong>
            </p>
          </div>
        )}
        <form className="access-form" onSubmit={handleVerifyCode}>
          <div className="form-group">
            <label htmlFor="verify-code">{t('auth.verificationCode')}</label>
            <input id="verify-code" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
              value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000" autoFocus disabled={verifyLoading} className="verification-code-input" />
          </div>
          {verifyError && <div className="gate-error">{verifyError}</div>}
          {resendMessage && <div className="gate-success">{resendMessage}</div>}
          <button type="submit" className="gate-submit-btn" disabled={verifyLoading || verificationCode.length !== 6}>
            {verifyLoading ? t('auth.verifying') : t('auth.verifyEmailBtn')}
          </button>
        </form>
        <div className="verify-actions">
          <button className="resend-btn" onClick={handleResendCode} disabled={resendCooldown > 0}>
            {resendCooldown > 0 ? t('auth.resendCodeIn', { seconds: resendCooldown }) : t('auth.resendCode')}
          </button>
          <button className="link-btn" onClick={handleBackToLogin}>{t('auth.backToLogin')}</button>
        </div>
        <div className="verify-help"><p>{t('auth.checkSpam')}</p></div>
      </div>
    )
  }

  // ====== RENDER: SIGNUP WIZARD ======
  if (mode === 'signup') {
    return (
      <div className="auth-form-wrapper">
        {!compact && (
          <div className="access-gate-header">
            <div className="gate-logo"><span className="gate-icon">&#9917;</span></div>
            <h1>{t('auth.sparkAIPrediction')}</h1>
          </div>
        )}
        {compact && onClose && (
          <div className="auth-form-compact-header">
            <h2>{t('auth.createAccountTitle')}</h2>
            <button className="auth-modal-close" onClick={onClose} aria-label="Close">&times;</button>
          </div>
        )}

        {/* Progress Bar */}
        <div className="wizard-progress">
          <div className="wizard-progress-bar" style={{ width: `${(signupStep / TOTAL_SIGNUP_STEPS) * 100}%` }} />
        </div>
        <p className="wizard-step-label">Step {signupStep} of {TOTAL_SIGNUP_STEPS}</p>

        {/* ===== STEP 1: EMAIL ===== */}
        {signupStep === 1 && (
          <div className="wizard-step" key="step1">
            <div className="wizard-step-icon">{stepIcons[1]}</div>
            <h2 className="wizard-step-title">What's your email?</h2>
            <p className="wizard-step-subtitle">We'll send you a verification code</p>

            <div className="access-form">
              <div className="form-group">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" autoFocus disabled={loading} />
              </div>
              {error && <div className="gate-error">{error}</div>}
              <button type="button" className="gate-submit-btn wizard-next-btn" onClick={handleStep1Next}
                disabled={!email.trim() || !email.includes('@')}>
                Next &rarr;
              </button>
            </div>

            <div className="auth-divider"><span>{t('common.or')}</span></div>
            <div className="google-signin-section">
              <div ref={googleBtnRef} className="google-btn-wrapper"></div>
            </div>
            <button type="button" className="whop-login-btn" onClick={handleWhopLogin} disabled={loading}
              style={{ width:'100%',padding:'10px 16px',borderRadius:'8px',border:'1px solid rgba(255,255,255,0.15)',background:'#7c3aed',color:'#fff',fontSize:'14px',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',marginTop:'8px',transition:'background 0.2s' }}
              onMouseOver={e => e.currentTarget.style.background='#6d28d9'} onMouseOut={e => e.currentTarget.style.background='#7c3aed'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.22.21-1.79L9 13v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/></svg>
              Continue with Whop
            </button>

            <div className="gate-footer">
              <p>{t('auth.haveAccount')} <button className="link-btn" onClick={() => setMode('login')}>{t('auth.logIn')}</button></p>
            </div>
          </div>
        )}

        {/* ===== STEP 2: PASSWORD + CAPTCHA + REGISTER ===== */}
        {signupStep === 2 && (
          <div className="wizard-step" key="step2">
            <div className="wizard-step-icon">{stepIcons[2]}</div>
            <h2 className="wizard-step-title">Create a password</h2>
            <p className="wizard-step-subtitle">Make it strong and memorable</p>

            <div className="access-form">
              <div className="form-group">
                <label>{t('auth.password')}</label>
                <div className="password-input-wrapper">
                  <input type={showPassword ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.createStrongPassword')}
                    disabled={loading} autoFocus />
                  <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
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
                        <span className="req-icon">{req.met ? '\u2713' : '\u2717'}</span>{req.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="form-group">
                <label>{t('auth.confirmPassword')}</label>
                <div className="password-input-wrapper">
                  <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t('auth.repeatPassword')}
                    disabled={loading} />
                  <button type="button" className="password-toggle-btn" onClick={() => setShowConfirmPassword(!showConfirmPassword)} tabIndex={-1}>
                    {showConfirmPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="captcha-container">
                <HCaptcha ref={captchaRef} sitekey={HCAPTCHA_SITE_KEY} onVerify={handleCaptchaVerify}
                  onExpire={handleCaptchaExpire} onError={handleCaptchaError} theme="dark" size="normal" />
              </div>

              <div className="terms-checkbox-section" style={{ marginTop: 12, marginBottom: 8 }}>
                <label className="terms-checkbox-label">
                  <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
                  <span>
                    I agree to the{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="terms-link">
                      Terms of Service
                    </a>
                  </span>
                </label>
              </div>

              {error && <div className="gate-error">{error}</div>}

              <div className="wizard-btn-row">
                <button type="button" className="wizard-back-btn" onClick={() => setSignupStep(1)}>&larr; Back</button>
                <button type="button" className="gate-submit-btn wizard-next-btn" onClick={handleStep2Register}
                  disabled={loading || !captchaToken || !password || !confirmPassword || !termsAccepted}>
                  {loading ? t('auth.creatingAccount') : 'Create Account \u2192'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== STEP 3: EMAIL OTP ===== */}
        {signupStep === 3 && (
          <div className="wizard-step" key="step3">
            <div className="wizard-step-icon">{stepIcons[3]}</div>
            <h2 className="wizard-step-title">Verify your email</h2>
            <p className="wizard-step-subtitle">
              We sent a 6-digit code to <strong style={{color: '#3b82f6'}}>{email}</strong>
            </p>

            <form className="access-form" onSubmit={handleStep3Verify}>
              <div className="form-group">
                <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                  value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000" autoFocus disabled={verifyLoading} className="verification-code-input" />
              </div>
              {verifyError && <div className="gate-error">{verifyError}</div>}
              {resendMessage && <div className="gate-success">{resendMessage}</div>}
              <button type="submit" className="gate-submit-btn wizard-next-btn"
                disabled={verifyLoading || verificationCode.length !== 6}>
                {verifyLoading ? t('auth.verifying') : 'Verify \u2192'}
              </button>
            </form>
            <div className="verify-actions">
              <button className="resend-btn" onClick={handleResendCode} disabled={resendCooldown > 0}>
                {resendCooldown > 0 ? t('auth.resendCodeIn', { seconds: resendCooldown }) : t('auth.resendCode')}
              </button>
            </div>
            <div className="verify-help"><p>{t('auth.checkSpam')}</p></div>
          </div>
        )}

        {/* ===== STEP 4: PERSONAL INFO ===== */}
        {signupStep === 4 && (
          <div className="wizard-step" key="step4">
            <div className="wizard-step-icon">{stepIcons[4]}</div>
            <h2 className="wizard-step-title">Tell us about yourself</h2>
            <p className="wizard-step-subtitle">This helps us personalize your experience</p>

            <div className="access-form">
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name" maxLength={100} autoFocus />
              </div>
              <div className="form-group">
                <label>Date of Birth</label>
                <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} max={maxDobDate} />
              </div>
              <div className="form-group">
                <label>Country</label>
                <CountryPicker value={country} onChange={setCountry} placeholder="Search for your country" />
              </div>

              {error && <div className="gate-error">{error}</div>}

              <button type="button" className="gate-submit-btn wizard-next-btn" onClick={handleStep4Next}
                disabled={!fullName.trim() || !dateOfBirth}>
                Next &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ===== STEP 5: SECURITY Q&A ===== */}
        {signupStep === 5 && (
          <div className="wizard-step" key="step5">
            <div className="wizard-step-icon">{stepIcons[5]}</div>
            <h2 className="wizard-step-title">Set up account security</h2>
            <p className="wizard-step-subtitle">This helps protect your account</p>

            <div className="access-form">
              <div className="form-group">
                <label>Security Question</label>
                <select value={securityQuestion} onChange={(e) => setSecurityQuestion(e.target.value)} autoFocus>
                  <option value="">Select a security question...</option>
                  <option value={t('auth.secQ1')}>{t('auth.secQ1')}</option>
                  <option value={t('auth.secQ2')}>{t('auth.secQ2')}</option>
                  <option value={t('auth.secQ3')}>{t('auth.secQ3')}</option>
                  <option value={t('auth.secQ4')}>{t('auth.secQ4')}</option>
                  <option value={t('auth.secQ5')}>{t('auth.secQ5')}</option>
                  <option value={t('auth.secQ6')}>{t('auth.secQ6')}</option>
                </select>
              </div>
              <div className="form-group">
                <label>Security Answer</label>
                <input type="text" value={securityAnswer} onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder="Your answer (minimum 2 characters)" maxLength={200} />
              </div>

              {error && <div className="gate-error">{error}</div>}

              <div className="wizard-btn-row">
                <button type="button" className="wizard-back-btn" onClick={() => setSignupStep(4)}>&larr; Back</button>
                <button type="button" className="gate-submit-btn wizard-next-btn" onClick={handleStep5Next}
                  disabled={!securityQuestion || securityAnswer.trim().length < 2}>
                  Next &rarr;
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== STEP 6: PHONE VERIFICATION ===== */}
        {signupStep === 6 && (
          <div className="wizard-step" key="step6">
            <div className="wizard-step-icon">{stepIcons[6]}</div>
            <h2 className="wizard-step-title">Verify your phone</h2>
            <p className="wizard-step-subtitle">We'll send a verification code via SMS</p>

            <div className="access-form">
              {!phoneCodeSent ? (
                <>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+254712345678" autoFocus style={{ fontSize: 16 }} />
                    <span className="wizard-field-hint">Enter in international format (e.g., +254712345678)</span>
                  </div>
                  {phoneError && <div className="gate-error">{phoneError}</div>}
                  <div className="wizard-btn-row">
                    <button type="button" className="wizard-back-btn" onClick={() => setSignupStep(5)}>&larr; Back</button>
                    <button type="button" className="gate-submit-btn wizard-next-btn" onClick={handleSendPhoneCode}
                      disabled={phoneLoading || phoneNumber.trim().length < 10}>
                      {phoneLoading ? 'Sending...' : 'Send Code \u2192'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
                    Code sent to <strong style={{ color: '#3b82f6' }}>{phoneNumber}</strong>
                  </p>
                  <div className="form-group">
                    <input type="text" inputMode="numeric" maxLength={6} value={phoneCode}
                      onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000" autoFocus className="verification-code-input" />
                  </div>
                  {phoneError && <div className="gate-error">{phoneError}</div>}
                  <button type="button" className="gate-submit-btn wizard-next-btn" onClick={handleVerifyPhoneCode}
                    disabled={phoneLoading || phoneCode.length !== 6}>
                    {phoneLoading ? 'Verifying...' : 'Verify \u2192'}
                  </button>
                  <div className="verify-actions">
                    <button className="resend-btn" onClick={handleResendPhoneCode} disabled={phoneCooldown > 0}>
                      {phoneCooldown > 0 ? `Resend in ${phoneCooldown}s` : 'Resend Code'}
                    </button>
                    <button className="link-btn" onClick={() => { setPhoneCodeSent(false); setPhoneCode(''); setPhoneError('') }}>
                      Change number
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}


      </div>
    )
  }

  // ====== RENDER: LOGIN MODE (unchanged) ======
  return (
    <div className="auth-form-wrapper">
      {!compact && (
        <div className="access-gate-header">
          <div className="gate-logo"><span className="gate-icon">&#9917;</span></div>
          <h1>{t('auth.sparkAIPrediction')}</h1>
          <p className="gate-subtitle">{t('auth.smartAnalysis')}</p>
        </div>
      )}
      {compact && onClose && (
        <div className="auth-form-compact-header">
          <h2>{t('auth.welcomeBack')}</h2>
          <button className="auth-modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
      )}

      {showForgotPassword ? (
        <>
          <div className="forgot-password-screen">
            <div className="forgot-password-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h2 className="forgot-password-title">{t('auth.resetPassword')}</h2>
            <p className="forgot-password-label">{t('auth.resetPasswordLabel')}</p>
            <div className="forgot-password-input-row">
              <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')} disabled={forgotLoading} autoFocus />
              <button type="button" className="forgot-send-btn" onClick={handleSendResetLink}
                disabled={forgotLoading || !forgotEmail.trim()}>
                {forgotLoading ? t('auth.sending') : t('auth.send')}
              </button>
            </div>
            {forgotMessage && <div className="forgot-success">{forgotMessage}</div>}
            {forgotError && <div className="gate-error" style={{ marginTop: '10px' }}>{forgotError}</div>}
          </div>
          <div className="gate-footer">
            <p><button className="link-btn" onClick={() => setShowForgotPassword(false)}>{t('auth.rememberPassword')}</button></p>
          </div>
        </>
      ) : (
      <>
        <div className="auth-mode-toggle">
          <button className={`mode-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError('') }}>{t('auth.login')}</button>
          <button className={`mode-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => { setMode('signup'); setError('') }}>{t('auth.signup')}</button>
        </div>

        <div className="google-signin-section">
          <div ref={googleBtnRef} className="google-btn-wrapper"></div>
        </div>

        <button type="button" className="whop-login-btn" onClick={handleWhopLogin} disabled={loading}
          style={{ width:'100%',padding:'10px 16px',borderRadius:'8px',border:'1px solid rgba(255,255,255,0.15)',background:'#7c3aed',color:'#fff',fontSize:'14px',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',marginTop:'8px',transition:'background 0.2s' }}
          onMouseOver={e => e.currentTarget.style.background='#6d28d9'} onMouseOut={e => e.currentTarget.style.background='#7c3aed'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.22.21-1.79L9 13v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/></svg>
          Continue with Whop
        </button>

        <div className="auth-divider"><span>{t('common.or')}</span></div>

        <form className="access-form" onSubmit={handleLoginSubmit}>
          <div className="form-group">
            <label htmlFor="email">{t('auth.email')}</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder')} autoFocus disabled={loading || lockoutSeconds > 0} onBlur={handleEmailBlur} />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t('auth.password')}</label>
            <div className="password-input-wrapper">
              <input id="password" type={showPassword ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.enterPassword')}
                disabled={loading || lockoutSeconds > 0} />
              <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          {lockoutSeconds === 0 && (
            <div className="forgot-password-link">
              <button type="button" className="link-btn" onClick={handleForgotPassword}>{t('auth.forgotPassword')}</button>
            </div>
          )}

          {showCaptcha && (
            <div className="captcha-container">
              <HCaptcha ref={captchaRef} sitekey={HCAPTCHA_SITE_KEY} onVerify={handleCaptchaVerify}
                onExpire={handleCaptchaExpire} onError={handleCaptchaError} theme="dark" size="normal" />
            </div>
          )}

          {error && <div className="gate-error">{error}</div>}

          {attemptsRemaining !== null && attemptsRemaining > 0 && lockoutSeconds === 0 && (
            <div className="gate-warning">
              {attemptsRemaining === 1 ? t('auth.warningLastAttempt') : t('auth.attemptsRemaining', { count: attemptsRemaining })}
            </div>
          )}

          {attemptsRemaining !== null && attemptsRemaining <= 2 && attemptsRemaining > 0 && lockoutSeconds === 0 && (
            <div className="forgot-password-prompt">
              <span>{t('auth.forgottenPassword')} </span>
              <button type="button" className="link-btn forgot-prompt-link" onClick={handleForgotPassword}>{t('auth.clickToReset')}</button>
            </div>
          )}

          {lockoutSeconds > 0 && (
            <div className="gate-lockout">
              <div className="lockout-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <p className="lockout-title">{t('auth.accountTempLocked')}</p>
              <p className="lockout-message">{t('auth.tooManyAttempts')}</p>
              <div className="lockout-timer">{formatLockoutTime(lockoutSeconds)}</div>
              <p className="lockout-reset-hint">{t('auth.lockoutResetHint')}</p>
            </div>
          )}

          <button type="submit" className="gate-submit-btn"
            disabled={loading || lockoutSeconds > 0 || (showCaptcha && !captchaToken)}>
            {loading ? t('auth.loggingIn') : lockoutSeconds > 0 ? t('auth.accountLocked') : t('auth.login')}
          </button>
        </form>

        <div className="gate-footer">
          <p>{t('auth.noAccount')} <button className="link-btn" onClick={() => setMode('signup')}>{t('auth.signUpFree')}</button></p>
        </div>
      </>)}
    </div>
  )
}
