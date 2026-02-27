import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const CreditContext = createContext()

export function CreditProvider({ children }) {
  const [credits, setCredits] = useState(null)
  const [costs, setCosts] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchCredits = useCallback(async () => {
    try {
      const res = await axios.get('/api/credits/balance')
      setCredits(res.data)
    } catch {
      // Not authenticated or error
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCosts = useCallback(async () => {
    try {
      const res = await axios.get('/api/credits/costs')
      setCosts(res.data)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchCredits()
    fetchCosts()
  }, [fetchCredits, fetchCosts])

  const deductCredits = useCallback(async (action, matchKey = '') => {
    try {
      const res = await axios.post('/api/credits/deduct', { action, match_key: matchKey })
      if (res.data.success) {
        setCredits(prev => ({
          ...prev,
          total_credits: res.data.total_credits,
          purchased_credits: res.data.purchased_credits,
          daily_credits: res.data.daily_credits,
        }))
        return { success: true, ...res.data }
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Insufficient credits'
      return { success: false, error: msg }
    }
    return { success: false, error: 'Unknown error' }
  }, [])

  const refreshCredits = useCallback(() => {
    return fetchCredits()
  }, [fetchCredits])

  const totalCredits = credits?.total_credits || 0

  return (
    <CreditContext.Provider value={{
      credits, costs, loading, totalCredits,
      deductCredits, refreshCredits, fetchCredits,
    }}>
      {children}
    </CreditContext.Provider>
  )
}

export function useCredits() {
  const ctx = useContext(CreditContext)
  if (!ctx) throw new Error('useCredits must be used within CreditProvider')
  return ctx
}

export default CreditContext
