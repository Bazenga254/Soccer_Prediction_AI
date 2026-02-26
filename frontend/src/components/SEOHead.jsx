import { Helmet } from 'react-helmet-async'

const BASE_URL = 'https://spark-ai-prediction.com'
const DEFAULT_TITLE = 'Spark AI — #1 Soccer AI Predictions, Live Scores & Betting Analysis'
const DEFAULT_DESC = 'AI-powered soccer predictions with up to 90% accuracy. Real-time live scores, match analysis & betting tips for Premier League, La Liga, Champions League and 50+ leagues.'
const DEFAULT_IMAGE = `${BASE_URL}/pwa-512x512.png`

export default function SEOHead({
  title,
  description,
  path = '/',
  noIndex = false,
  jsonLd = null,
  article = null,
}) {
  const fullTitle = title ? `${title} | Spark AI Prediction` : DEFAULT_TITLE
  const desc = description || DEFAULT_DESC
  const url = `${BASE_URL}${path}`

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:type" content={article ? 'article' : 'website'} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={DEFAULT_IMAGE} />
      <meta property="og:site_name" content="Spark AI Prediction" />

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
