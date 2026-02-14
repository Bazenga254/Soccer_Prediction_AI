import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

const AdminContext = createContext(null)

const API = '/api'
const INACTIVITY_TIMEOUT = 30 * 60 * 1000 // 30 minutes
const HEARTBEAT_INTERVAL = 60 * 1000 // 60 seconds

export function AdminProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState(null) // 'password' | 'jwt'
  const [adminPassword, setAdminPassword] = useState(null)
  const [staffRole, setStaffRole] = useState(null)
  const [roleInfo, setRoleInfo] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const inactivityTimer = useRef(null)
  const heartbeatTimer = useRef(null)

  const getAuthHeaders = useCallback(() => {
    if (authMode === 'password' && adminPassword) {
      return { 'x-admin-password': adminPassword }
    }
    const token = localStorage.getItem('spark_token')
    if (token) {
      return { Authorization: `Bearer ${token}` }
    }
    return {}
  }, [authMode, adminPassword])

  const fetchPermissions = useCallback(async (headers) => {
    try {
      const res = await fetch(`${API}/admin/my-permissions`, { headers })
      if (res.ok) {
        const data = await res.json()
        setRoleInfo(data.role)
        setPermissions(data.modules || [])
        return data
      }
    } catch (e) {
      console.error('Failed to fetch permissions:', e)
    }
    return null
  }, [])

  const hasPermission = useCallback((module, action = 'read') => {
    if (authMode === 'password') return true // password = owner = all access
    const perm = permissions.find(p => p.module === module)
    if (!perm) return false
    return !!perm[`can_${action}`]
  }, [authMode, permissions])

  const getDataScope = useCallback((module) => {
    if (authMode === 'password') return 'company'
    const perm = permissions.find(p => p.module === module)
    return perm?.data_scope || 'own'
  }, [authMode, permissions])

  // Login with admin password
  const loginWithPassword = useCallback(async (password) => {
    try {
      const res = await fetch(`${API}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setAdminPassword(password)
        setAuthMode('password')
        setStaffRole('super_admin')
        setRoleInfo({ name: 'owner', display_name: 'Owner', level: 0, department: null })
        sessionStorage.setItem('admin_pw', password)
        setIsLoggedIn(true)
        await fetchPermissions({ 'x-admin-password': password })
        return { success: true }
      }
      return { success: false, error: data.detail || 'Invalid password' }
    } catch (e) {
      return { success: false, error: 'Connection error' }
    }
  }, [fetchPermissions])

  // Login with JWT (staff)
  const loginWithJWT = useCallback(async () => {
    const token = localStorage.getItem('spark_token')
    if (!token) return false

    try {
      const res = await fetch(`${API}/user/staff-role`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.staff_role) {
          setAuthMode('jwt')
          setStaffRole(data.staff_role)
          setRoleInfo(data.role_info)
          setIsLoggedIn(true)

          // Fetch full permissions
          await fetchPermissions({ Authorization: `Bearer ${token}` })

          // Get user profile
          try {
            const meRes = await fetch(`${API}/user/me`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (meRes.ok) {
              const meData = await meRes.json()
              setCurrentUser(meData.user || meData)
            }
          } catch {}

          // Notify backend of login
          fetch(`${API}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ password: '' }),
          }).catch(() => {})

          return true
        }
      }
    } catch {}
    return false
  }, [fetchPermissions])

  const logout = useCallback(async () => {
    try {
      await fetch(`${API}/admin/logout`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })
    } catch {}

    setIsLoggedIn(false)
    setAuthMode(null)
    setAdminPassword(null)
    setStaffRole(null)
    setRoleInfo(null)
    setPermissions([])
    setCurrentUser(null)
    sessionStorage.removeItem('admin_pw')
    clearTimeout(inactivityTimer.current)
    clearInterval(heartbeatTimer.current)
  }, [getAuthHeaders])

  // Auto-login on mount
  useEffect(() => {
    const init = async () => {
      // Try JWT first
      const jwtSuccess = await loginWithJWT()
      if (!jwtSuccess) {
        // Try saved password
        const savedPw = sessionStorage.getItem('admin_pw')
        if (savedPw) {
          await loginWithPassword(savedPw)
        }
      }
      setLoading(false)
    }
    init()
  }, [loginWithJWT, loginWithPassword])

  // Inactivity auto-logout
  useEffect(() => {
    if (!isLoggedIn) return

    const resetTimer = () => {
      clearTimeout(inactivityTimer.current)
      inactivityTimer.current = setTimeout(() => {
        logout()
      }, INACTIVITY_TIMEOUT)
    }

    const events = ['mousemove', 'keypress', 'click', 'scroll']
    events.forEach(e => window.addEventListener(e, resetTimer))
    resetTimer()

    return () => {
      clearTimeout(inactivityTimer.current)
      events.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [isLoggedIn, logout])

  // Staff session heartbeat
  useEffect(() => {
    if (!isLoggedIn || authMode !== 'jwt') return

    heartbeatTimer.current = setInterval(() => {
      fetch(`${API}/admin/staff/heartbeat`, {
        method: 'POST',
        headers: getAuthHeaders(),
      }).catch(() => {})
    }, HEARTBEAT_INTERVAL)

    return () => clearInterval(heartbeatTimer.current)
  }, [isLoggedIn, authMode, getAuthHeaders])

  const value = {
    isLoggedIn,
    loading,
    authMode,
    staffRole,
    roleInfo,
    permissions,
    currentUser,
    getAuthHeaders,
    hasPermission,
    getDataScope,
    loginWithPassword,
    loginWithJWT,
    logout,
  }

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider')
  return ctx
}

export default AdminContext
