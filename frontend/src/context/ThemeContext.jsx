import { createContext, useContext, useState, useEffect } from 'react'

const STORAGE_KEY = 'spark_theme'
const THEMES = ['dark', 'midnight', 'light']

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return THEMES.includes(saved) ? saved : 'dark'
  })

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = (t) => {
    if (THEMES.includes(t)) {
      setThemeState(t)
      // Sync to server for cross-device consistency
      try {
        const token = localStorage.getItem('spark_token')
        if (token) {
          fetch('/api/user/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ preferences: { theme: t } }),
          }).catch(() => {})
        }
      } catch { /* ignore */ }
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
