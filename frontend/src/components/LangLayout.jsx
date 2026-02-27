import { useEffect } from 'react'
import { useLocation, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGS } from '../utils/seoConstants'

export default function LangLayout() {
  const { pathname } = useLocation()
  const { i18n } = useTranslation()

  // Extract language from URL path (e.g., /fr/today -> 'fr')
  const pathLang = pathname.split('/')[1]
  const lang = SUPPORTED_LANGS.includes(pathLang) && pathLang !== 'en' ? pathLang : 'en'

  useEffect(() => {
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang)
    }
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang, i18n])

  return <Outlet />
}
