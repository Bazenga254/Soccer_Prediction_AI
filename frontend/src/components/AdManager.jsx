import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'

/**
 * AdManager — loads Monetag ad scripts only for free-tier, non-admin users.
 * Waits for auth to resolve before loading any ads to prevent
 * ads from briefly appearing for PRO/admin users.
 */
export default function AdManager() {
  const { user, loading } = useAuth()
  const scriptsLoaded = useRef(false)

  useEffect(() => {
    // Wait for auth to finish loading before making any ad decisions
    if (loading) return

    // Skip ads for: admins, pro users, employee/staff, or admin pages
    if (user?.is_admin) return
    if (user?.tier === 'pro') return
    if (user?.is_staff) return
    if (location.pathname.includes('spark-ctrl')) return
    if (location.pathname.includes('/employee')) return

    // Don't load scripts twice
    if (scriptsLoaded.current) return
    scriptsLoaded.current = true

    // Monetag Vignette (zone 10735977)
    const vignetteScript = document.createElement('script')
    vignetteScript.dataset.zone = '10735977'
    vignetteScript.src = 'https://gizokraijaw.net/vignette.min.js'
    document.body.appendChild(vignetteScript)

    // Monetag Multitag (zone 220950) — auto-rotates best ad formats
    const multitagScript = document.createElement('script')
    multitagScript.dataset.zone = '220950'
    multitagScript.src = 'https://quge5.com/88/tag.min.js'
    multitagScript.async = true
    multitagScript.dataset.cfasync = 'false'
    document.body.appendChild(multitagScript)
  }, [user, loading])

  return null
}
