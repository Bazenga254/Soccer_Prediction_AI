import { Helmet } from 'react-helmet-async'
import { SUPPORTED_LANGS, OG_LOCALE_MAP, buildLangUrl } from '../utils/seoConstants'

const BASE_URL = 'https://spark-ai-prediction.com'
const DEFAULT_TITLE = 'Spark AI \u2014 #1 Soccer AI Predictions, Live Scores & Betting Analysis'
const DEFAULT_DESC = 'AI-powered soccer predictions with up to 90% accuracy. Real-time live scores, match analysis & betting tips for Premier League, La Liga, Champions League and 50+ leagues.'
const DEFAULT_IMAGE = `${BASE_URL}/pwa-512x512.png`

export default function SEOHead({
  title,
  description,
  path = '/',
  lang = 'en',
  noIndex = false,
  jsonLd = null,
  article = null,
}) {
  const fullTitle = title ? `${title} | Spark AI Prediction` : DEFAULT_TITLE
  const desc = description || DEFAULT_DESC
  const canonical = buildLangUrl(path, lang)
  const ogLocale = OG_LOCALE_MAP[lang] || 'en_US'

  return (
    <Helmet>
      <html lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} />
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={canonical} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Hreflang alternate links for all supported languages */}
      {SUPPORTED_LANGS.map(l => (
        <link
          key={l}
          rel="alternate"
          hrefLang={l}
          href={buildLangUrl(path, l)}
        />
      ))}
      <link rel="alternate" hrefLang="x-default" href={buildLangUrl(path, 'en')} />

      {/* Open Graph */}
      <meta property="og:type" content={article ? 'article' : 'website'} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={DEFAULT_IMAGE} />
      <meta property="og:site_name" content="Spark AI Prediction" />
      <meta property="og:locale" content={ogLocale} />
      {SUPPORTED_LANGS.filter(l => l !== lang).map(l => (
        <meta key={l} property="og:locale:alternate" content={OG_LOCALE_MAP[l]} />
      ))}

      {article?.publishedTime && <meta property="article:published_time" content={article.publishedTime} />}
      {article?.modifiedTime && <meta property="article:modified_time" content={article.modifiedTime} />}
      {article?.section && <meta property="article:section" content={article.section} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={DEFAULT_IMAGE} />

      {/* JSON-LD Structured Data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(Array.isArray(jsonLd) ? jsonLd : [jsonLd])}
        </script>
      )}
    </Helmet>
  )
}
