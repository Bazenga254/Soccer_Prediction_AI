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

  const login = useCallback(async (email, password) => {
    try {
      const response = await axios.post('/api/user/login', { email, password })
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
      const msg = err.response?.data?.detail || 'Login failed. Please try again.'
      return { success: false, error: msg }
    }
  }, [])

  const register = useCallback(async (email, password, displayName = '', referralCode = '') => {
    try {
      const response = await axios.post('/api/user/register', {
        email,
        password,
        display_name: displayName,
        referral_code: referralCode,
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
      const msg = err.response?.data?.detail || 'Registration failed. Please try again.'
      return { success: false, error: msg }
    }
  }, [])

  const logout = useCallback(() => {
    clearAuth()
  }, [])

  const updateUser = useCallback((updates) => {
    setUser(prev => prev ? { ...prev, ...updates } : null)
  }, [])

  const value = {
    isAuthenticated,
    user,
    loading,
    login,
    register,
    logout,
    updateUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
