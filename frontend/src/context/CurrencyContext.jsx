import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const CurrencyContext = createContext()

const GEO_CACHE_KEY = 'spark_geo'
const GEO_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

export function useCurrency() {
  return useContext(CurrencyContext)
}

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(() => {
    try {
      const cached = localStorage.getItem(GEO_CACHE_KEY)
      if (cached) {
        const data = JSON.parse(cached)
        if (Date.now() - data.timestamp < GEO_CACHE_TTL) return data.currency
      }
    } catch { /* ignore */ }
    return 'USD'
  })

  useEffect(() => {
    try {
      const cached = localStorage.getItem(GEO_CACHE_KEY)
      if (cached) {
        const data = JSON.parse(cached)
        if (Date.now() - data.timestamp < GEO_CACHE_TTL) return
      }
    } catch { /* ignore */ }

    axios.get('/api/geo/detect')
      .then(res => {
        const c = res.data.currency || 'USD'
        setCurrency(c)
        localStorage.setItem(GEO_CACHE_KEY, JSON.stringify({
          currency: c,
          countryCode: res.data.country_code,
          timestamp: Date.now(),
        }))
      })
      .catch(() => {})
  }, [])

  const value = {
    currency,
    currencySymbol: currency === 'KES' ? 'KES ' : '$',
    isKenyan: currency === 'KES',
  }

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}
