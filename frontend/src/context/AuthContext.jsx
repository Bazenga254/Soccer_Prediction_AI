import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext()

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [accessInfo, setAccessInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  // Check stored access code on mount
  useEffect(() => {
    const storedCode = localStorage.getItem('soccer_ai_access_code')
    if (storedCode) {
      verifyCode(storedCode, true)
    } else {
      setLoading(false)
    }
  }, [])

  const verifyCode = useCallback(async (code, silent = false) => {
    try {
      const response = await axios.post('/api/auth/verify', { code: code.toUpperCase().trim() })
      if (response.data.valid) {
        setIsAuthenticated(true)
        setAccessInfo(response.data)
        localStorage.setItem('soccer_ai_access_code', code.toUpperCase().trim())
        setLoading(false)
        return { success: true, data: response.data }
      } else {
        if (!silent) {
          localStorage.removeItem('soccer_ai_access_code')
        }
        setIsAuthenticated(false)
        setAccessInfo(null)
        setLoading(false)
        return { success: false, message: response.data.reason }
      }
    } catch (err) {
      setIsAuthenticated(false)
      setLoading(false)
      return { success: false, message: 'Could not verify code. Please try again.' }
    }
  }, [])

  const logout = useCallback(() => {
    setIsAuthenticated(false)
    setAccessInfo(null)
    localStorage.removeItem('soccer_ai_access_code')
  }, [])

  const value = {
    isAuthenticated,
    accessInfo,
    loading,
    verifyCode,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
