import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const EmployeeContext = createContext(null)

export function EmployeeProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState(null)
  const [roleInfo, setRoleInfo] = useState(null)
  const [roleLevel, setRoleLevel] = useState(99)
  const [permissions, setPermissions] = useState([])

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('spark_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const hasPermission = useCallback((module, action = 'read') => {
    const perm = permissions.find(p => p.module === module)
    if (!perm) return false
    return Boolean(perm[`can_${action}`])
  }, [permissions])

  const logout = useCallback(() => {
    localStorage.removeItem('spark_token')
    setIsLoggedIn(false)
    setCurrentUser(null)
    setRoleInfo(null)
    setPermissions([])
    window.location.href = '/login'
  }, [])

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem('spark_token')
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const [profileRes, permsRes] = await Promise.all([
          axios.get('/api/user/me', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('/api/admin/my-permissions', { headers: { Authorization: `Bearer ${token}` } }),
        ])

        const profile = profileRes.data.user || profileRes.data
        if (!profile.staff_role && !profile.role_id) {
          setLoading(false)
          return
        }

        setCurrentUser(profile)
        setIsLoggedIn(true)

        if (permsRes.data.modules) {
          setPermissions(permsRes.data.modules)
        }
        if (permsRes.data.role) {
          setRoleInfo(permsRes.data.role)
          setRoleLevel(permsRes.data.role.level ?? 99)
        }
      } catch {
        // Not authenticated or not staff
      }
      setLoading(false)
    }
    init()
  }, [])

  // Heartbeat
  useEffect(() => {
    if (!isLoggedIn) return
    const interval = setInterval(() => {
      axios.post('/api/heartbeat', {}, { headers: getAuthHeaders() }).catch(() => {})
    }, 60000)
    return () => clearInterval(interval)
  }, [isLoggedIn, getAuthHeaders])

  return (
    <EmployeeContext.Provider value={{
      isLoggedIn, loading, currentUser, roleInfo, roleLevel,
      permissions, hasPermission, getAuthHeaders, logout,
    }}>
      {children}
    </EmployeeContext.Provider>
  )
}

export function useEmployee() {
  const ctx = useContext(EmployeeContext)
  if (!ctx) throw new Error('useEmployee must be used within EmployeeProvider')
  return ctx
}
