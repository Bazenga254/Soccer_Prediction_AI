import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import axios from 'axios'

function getBrowserInfo() {
  const ua = navigator.userAgent
  let browser = 'Unknown'
  if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Edg')) browser = 'Edge'
  else if (ua.includes('Chrome')) browser = 'Chrome'
  else if (ua.includes('Safari')) browser = 'Safari'

  let os = 'Unknown'
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac')) os = 'MacOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'

  const isMobile = /Mobi|Android/i.test(ua)
  const device = isMobile ? 'mobile' : (ua.includes('Tablet') || ua.includes('iPad') ? 'tablet' : 'desktop')

  return { browser, os, device, userAgent: ua }
}

export function useTracking() {
  const location = useLocation()
  const sessionStartRef = useRef(new Date().toISOString())
  const lastPageRef = useRef(null)

  // Track page visits on route change
  useEffect(() => {
    const consent = localStorage.getItem('spark_cookie_consent')
    if (consent !== 'accepted') return

    const sessionId = sessionStorage.getItem('spark_session_id')
    if (!sessionId) return

    // Skip duplicate tracking for the same page
    if (lastPageRef.current === location.pathname) return
    lastPageRef.current = location.pathname

    const { browser, os, device, userAgent } = getBrowserInfo()

    axios.post('/api/track/page', {
      session_id: sessionId,
      page: location.pathname,
      referrer: document.referrer,
      user_agent: userAgent,
      device_type: device,
      browser,
      os,
      session_start: sessionStartRef.current,
    }).catch(() => {})
  }, [location.pathname])

  // Track session duration on page unload
  useEffect(() => {
    const consent = localStorage.getItem('spark_cookie_consent')
    if (consent !== 'accepted') return

    const start = Date.now()

    const handleUnload = () => {
      const sessionId = sessionStorage.getItem('spark_session_id')
      if (!sessionId) return
      const duration = Math.round((Date.now() - start) / 1000)
      const blob = new Blob(
        [JSON.stringify({ session_id: sessionId, duration_seconds: duration })],
        { type: 'application/json' }
      )
      navigator.sendBeacon('/api/track/duration', blob)
    }

    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])
}
