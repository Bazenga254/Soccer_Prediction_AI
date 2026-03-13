import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'

const TURNSTILE_SITE_KEY = '0x4AAAAAAACgKXRXQe99WPETM'

const Turnstile = forwardRef(({ onVerify, onExpire, onError, theme = 'dark', size = 'normal' }, ref) => {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)

  useImperativeHandle(ref, () => ({
    resetCaptcha: () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current)
      }
    }
  }))

  useEffect(() => {
    const renderWidget = () => {
      if (!containerRef.current || !window.turnstile) return
      // Clear any existing widget
      if (widgetIdRef.current !== null) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme,
        size,
        callback: (token) => onVerify && onVerify(token),
        'expired-callback': () => onExpire && onExpire(),
        'error-callback': () => onError && onError(),
      })
    }

    // If turnstile script already loaded
    if (window.turnstile) {
      renderWidget()
      return
    }

    // Load the script
    const existing = document.querySelector('script[src*="turnstile"]')
    if (!existing) {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.onload = renderWidget
      document.head.appendChild(script)
    } else {
      existing.addEventListener('load', renderWidget)
      // If already loaded but turnstile not yet available, poll briefly
      const check = setInterval(() => {
        if (window.turnstile) {
          clearInterval(check)
          renderWidget()
        }
      }, 100)
      setTimeout(() => clearInterval(check), 5000)
    }

    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [theme, size]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} />
})

Turnstile.displayName = 'Turnstile'
export default Turnstile
