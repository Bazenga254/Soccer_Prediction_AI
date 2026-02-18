import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext()

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendingVerification, setPendingVerification] = useState(null)

  // Set up axios interceptor for auth token
  useEffect(() => {
    const token = localStorage.getItem('spark_token')
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }
  }, [])

  // Check stored token on mount
  useEffect(() => {
    const token = localStorage.getItem('spark_token')
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      fetchProfile()
    } else {
      setLoading(false)
    }
  }, [])

  const fetchProfile = async () => {
    try {
      const response = await axios.get('/api/user/me')
      if (response.data.user) {
        setUser(response.data.user)
        setIsAuthenticated(true)
      } else {
        clearAuth()
      }
    } catch {
      clearAuth()
    }
    setLoading(false)
  }

  const clearAuth = () => {
    setIsAuthenticated(false)
    setUser(null)
    localStorage.removeItem('spark_token')
    delete axios.defaults.headers.common['Authorization']
  }

  // Intercept 403 "Account suspended" on any API call → force logout
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      res => res,
      err => {
        if (
          err.response?.status === 403 &&
          err.response?.data?.detail === 'Account suspended'
        ) {
          clearAuth()
          window.location.href = '/login?suspended=1'
        }
        return Promise.reject(err)
      },
    )
    return () => axios.interceptors.response.eject(interceptor)
  }, [])

  const login = useCallback(async (email, password, captchaToken = '') => {
    try {
      const response = await axios.post('/api/user/login', { email, password, captcha_token: captchaToken })
      if (response.data.success) {
        const { token, user: userData } = response.data
        localStorage.setItem('spark_token', token)
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
        setUser(userData)
        setIsAuthenticated(true)
        return { success: true }
      }
      return { success: false, error: response.data.error }
    } catch (err) {
      // Handle 423 = account locked
      if (err.response?.status === 423 && err.response?.data?.account_locked) {
        return {
          success: false,
          account_locked: true,
          locked_until: err.response.data.locked_until,
          remaining_seconds: err.response.data.remaining_seconds,
          error: err.response.data.detail,
        }
      }
      // Handle 428 = captcha required
      if (err.response?.status === 428 && err.response?.data?.captcha_required) {
        const res = { success: false, captcha_required: true, error: err.response.data.detail }
        if (err.response.data.attempts_remaining !== undefined) {
          res.attempts_remaining = err.response.data.attempts_remaining
        }
        return res
      }
      // Handle 403 = needs verification
      if (err.response?.status === 403 && err.response?.data?.requires_verification) {
        setPendingVerification({ email: err.response.data.email })
        return { success: false, requires_verification: true, error: err.response.data.detail }
      }
      // Handle 401 with suspended flag
      if (err.response?.status === 401 && err.response?.data?.suspended) {
        return {
          success: false,
          suspended: true,
          error: err.response.data.detail,
        }
      }
      // Handle 401 with attempts_remaining
      if (err.response?.status === 401 && err.response?.data?.attempts_remaining !== undefined) {
        return {
          success: false,
          error: err.response.data.detail,
          attempts_remaining: err.response.data.attempts_remaining,
        }
      }
      const msg = err.response?.data?.detail || 'Login failed. Please try again.'
      return { success: false, error: msg }
    }
  }, [])

  const register = useCallback(async (email, password, displayName = '', referralCode = '', captchaToken = '', personalInfo = {}) => {
    try {
      const response = await axios.post('/api/user/register', {
        email,
        password,
        display_name: displayName,
        referral_code: referralCode,
        captcha_token: captchaToken,
        full_name: personalInfo.full_name || '',
        date_of_birth: personalInfo.date_of_birth || '',
        security_question: personalInfo.security_question || '',
        security_answer: personalInfo.security_answer || '',
        country: personalInfo.country || '',
        terms_accepted: personalInfo.terms_accepted || false,
      })
      if (response.data.success) {
        if (response.data.requires_verification) {
          setPendingVerification({ email: response.data.email })
          return { success: true, requires_verification: true }
        }
        const { token, user: userData } = response.data
        localStorage.setItem('spark_token', token)
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
        setUser(userData)
        setIsAuthenticated(true)
        return { success: true }
      }
      return { success: false, error: response.data.error }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Registration failed. Please try again.'
      return { success: false, error: msg }
    }
  }, [])

  const googleLogin = useCallback(async (googleToken, referralCode = '', captchaToken = '', termsAccepted = false) => {
    try {
      const response = await axios.post('/api/user/google-login', {
        token: googleToken,
        referral_code: referralCode,
        captcha_token: captchaToken,
        terms_accepted: termsAccepted,
      })
      if (response.data.success) {
        const { token, user: userData } = response.data
        localStorage.setItem('spark_token', token)
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
        setUser(userData)
        setIsAuthenticated(true)
        return { success: true }
      }
      return { success: false, error: response.data.error }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Google login failed. Please try again.'
      return { success: false, error: msg }
    }
  }, [])

  const verifyEmail = useCallback(async (email, code) => {
    try {
      const response = await axios.post('/api/user/verify-email', { email, code })
      if (response.data.success) {
        const { token, user: userData } = response.data
        localStorage.setItem('spark_token', token)
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
        setUser(userData)
        setIsAuthenticated(true)
        setPendingVerification(null)
        return { success: true }
      }
      return { success: false, error: response.data.error }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Verification failed.'
      return { success: false, error: msg }
    }
  }, [])

  const resendCode = useCallback(async (email) => {
    try {
      const response = await axios.post('/api/user/resend-code', { email })
      return { success: true, message: response.data.message }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to resend code.'
      return { success: false, error: msg }
    }
  }, [])

  const cancelVerification = useCallback(() => {
    setPendingVerification(null)
  }, [])

  const checkCaptchaRequired = useCallback(async (email) => {
    try {
      const response = await axios.post('/api/user/captcha-check', { email })
      return response.data.captcha_required || false
    } catch {
      return false
    }
  }, [])

  // Heartbeat: ping every 60s while authenticated
  useEffect(() => {
    if (!isAuthenticated) return
    const sendHeartbeat = () => {
      axios.post('/api/heartbeat').catch(() => {})
    }
    sendHeartbeat()
    const interval = setInterval(sendHeartbeat, 60000)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  const logout = useCallback(() => {
    clearAuth()
  }, [])

  const updateUser = useCallback((updates) => {
    setUser(prev => prev ? { ...prev, ...updates } : null)
  }, [])

  const refreshProfile = useCallback(async () => {
    try {
      const response = await axios.get('/api/user/me')
      if (response.data.user) {
        setUser(response.data.user)
      }
    } catch { /* ignore */ }
  }, [])

  const value = {
    isAuthenticated,
    user,
    loading,
    pendingVerification,
    login,
    register,
    googleLogin,
    logout,
    updateUser,
    refreshProfile,
    verifyEmail,
    resendCode,
    cancelVerification,
    checkCaptchaRequired,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
