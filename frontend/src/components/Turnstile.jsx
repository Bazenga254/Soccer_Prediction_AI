import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'

// TODO: Switch to real key once propagated: 0x4AAAAAAACgKXRXQe99WPETM
const TURNSTILE_SITE_KEY = '1x00000000000000000000AA'

const Turnstile = forwardRef(({ onVerify, onExpire, theme = 'dark', size = 'normal' }, ref) => {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)

  useImperativeHandle(ref, () => ({
    resetCaptcha: () => {
      if (widgetIdRef.current != null && window.turnstile) {
        try { window.turnstile.reset(widgetIdRef.current) } catch (e) { /* */ }
      }
    }
  }))

  useEffect(() => {
    let cancelled = false

    const tryRender = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return false
      // Clean up old widget
      if (widgetIdRef.current != null) {
        try { window.turnstile.remove(widgetIdRef.current) } catch (e) { /* */ }
        widgetIdRef.current = null
      }
      containerRef.current.innerHTML = ''
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: theme || 'dark',
        size: size === 'compact' ? 'compact' : 'normal',
        callback: (token) => { if (onVerify) onVerify(token) },
        'expired-callback': () => { if (onExpire) onExpire() },
        'error-callback': () => true,
      })
      return true
    }

    // Script from index.html may still be loading
    if (!tryRender()) {
      const poll = setInterval(() => {
        if (window.turnstile && tryRender()) clearInterval(poll)
      }, 300)
      const timeout = setTimeout(() => clearInterval(poll), 10000)
      return () => { cancelled = true; clearInterval(poll); clearTimeout(timeout) }
    }

    return () => {
      cancelled = true
      if (widgetIdRef.current != null && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch (e) { /* */ }
        widgetIdRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={{ minHeight: 65, display: 'flex', justifyContent: 'center' }} />
})

Turnstile.displayName = 'Turnstile'
export default Turnstile
