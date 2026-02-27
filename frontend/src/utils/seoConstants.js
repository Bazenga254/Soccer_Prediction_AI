export const SUPPORTED_LANGS = ['en', 'fr', 'es', 'pt', 'sw', 'ar']

export const OG_LOCALE_MAP = {
  en: 'en_US',
  fr: 'fr_FR',
  es: 'es_ES',
  pt: 'pt_BR',
  sw: 'sw_KE',
  ar: 'ar_SA',
}

export const BASE_URL = 'https://spark-ai-prediction.com'

export function isValidLang(lang) {
  return SUPPORTED_LANGS.includes(lang)
}

/**
 * Build a full URL with language prefix.
 * English = no prefix, others = /{lang}{path}
 */
export function buildLangUrl(path, lang) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  if (!lang || lang === 'en') return `${BASE_URL}${cleanPath}`
  return `${BASE_URL}/${lang}${cleanPath}`
}

/**
 * Build a relative path with language prefix (no domain).
 */
export function buildLangPath(path, lang) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  if (!lang || lang === 'en') return cleanPath
  return `/${lang}${cleanPath}`
}

/**
 * Extract language and clean path from a pathname.
 * /fr/today -> { lang: 'fr', path: '/today' }
 * /today -> { lang: 'en', path: '/today' }
 */
export function stripLangPrefix(pathname) {
  const match = pathname.match(/^\/(fr|es|pt|sw|ar)(\/.*)$/)
  if (match) return { lang: match[1], path: match[2] }
  return { lang: 'en', path: pathname }
}

/** Public SEO paths that should use language-prefixed URLs */
export const PUBLIC_SEO_PATHS = ['/today', '/blog', '/predictions/', '/docs', '/terms']

export function isPublicSEOPath(pathname) {
  const { path } = stripLangPrefix(pathname)
  return path === '/' || PUBLIC_SEO_PATHS.some(p => path === p || path.startsWith(p))
}
