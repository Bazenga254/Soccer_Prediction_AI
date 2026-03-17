import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'

/**
 * AdManager — loads ad scripts only for free-tier, non-admin users.
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
    const monetagScript = document.createElement('script')
    monetagScript.dataset.zone = '10735977'
    monetagScript.src = 'https://gizokraijaw.net/vignette.min.js'
    document.body.appendChild(monetagScript)

    // AdSterra Social Bar
    const adsterraScript = document.createElement('script')
    adsterraScript.src = 'https://pl28924111.effectivegatecpm.com/8b/22/dc/8b22dc04466fc7989c3ddaec6e94e1ae.js'
    document.head.appendChild(adsterraScript)

    // AdSterra Popunder
    const popunderScript = document.createElement('script')
    popunderScript.src = 'https://pl28928358.effectivegatecpm.com/56/ce/60/56ce60644eae3fecf24e692cb319ca92.js'
    document.head.appendChild(popunderScript)
  }, [user, loading])

  return null
}
