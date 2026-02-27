import { useEffect } from 'react'
import { useParams, Outlet, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isValidLang } from '../utils/seoConstants'

export default function LangLayout() {
  const { lang } = useParams()
  const { i18n } = useTranslation()

  // If lang param exists but is invalid, redirect to home
  if (lang && !isValidLang(lang)) {
    return <Navigate to="/" replace />
  }

  const effectiveLang = lang || 'en'

  useEffect(() => {
    if (i18n.language !== effectiveLang) {
      i18n.changeLanguage(effectiveLang)
    }
    document.documentElement.lang = effectiveLang
    document.documentElement.dir = effectiveLang === 'ar' ? 'rtl' : 'ltr'
  }, [effectiveLang, i18n])

  return <Outlet />
}
