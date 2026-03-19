import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import axios from 'axios'
import SEOHead from '../components/SEOHead'
import LandingNav from '../components/LandingNav'
import AuthModal from '../components/AuthModal'
import './Blog.css'

const CATEGORIES = [
  { key: null, label: 'All' },
  { key: 'news', label: 'News', isType: true },
  { key: 'general', label: 'General' },
  { key: 'predictions', label: 'Predictions' },
  { key: 'tips', label: 'Tips' },
  { key: 'tutorials', label: 'Tutorials' },
  { key: 'updates', label: 'Updates' },
  { key: 'documentation', label: 'Documentation' },
]

const CATEGORY_COLORS = {
  general: '#3b82f6',
  predictions: '#ef4444',
  tips: '#22c55e',
  tutorials: '#a855f7',
  updates: '#f59e0b',
  documentation: '#6366f1',
  news: '#ec4899',
  transfers: '#10b981',
  injuries: '#f43f5e',
  results: '#eab308',
  'match-updates': '#0ea5e9',
}

const CATEGORY_ICONS = {
  general: '\u26BD',
  predictions: '\uD83C\uDFAF',
  tips: '\uD83D\uDCA1',
  tutorials: '\uD83D\uDCDA',
  updates: '\uD83D\uDD14',
  documentation: '\uD83D\uDCC4',
  guides: '\uD83D\uDCD6',
  analysis: '\uD83D\uDCCA',
  transfers: '\uD83D\uDD04',
  injuries: '\uD83C\uDFE5',
  results: '\uD83C\uDFC6',
  'match-updates': '\uD83D\uDCE2',
}

const CATEGORY_GRADIENTS = {
  general: 'linear-gradient(135deg, #1e3a5f, #0f172a)',
  predictions: 'linear-gradient(135deg, #7f1d1d, #1a0505)',
  tips: 'linear-gradient(135deg, #14532d, #052e16)',
  tutorials: 'linear-gradient(135deg, #581c87, #1e1b4b)',
  updates: 'linear-gradient(135deg, #78350f, #1c1917)',
  documentation: 'linear-gradient(135deg, #312e81, #0f172a)',
  guides: 'linear-gradient(135deg, #1e3a5f, #0c1524)',
  analysis: 'linear-gradient(135deg, #164e63, #0f172a)',
  transfers: 'linear-gradient(135deg, #065f46, #0f172a)',
  injuries: 'linear-gradient(135deg, #7f1d1d, #0f172a)',
  results: 'linear-gradient(135deg, #854d0e, #0f172a)',
  'match-updates': 'linear-gradient(135deg, #1e40af, #0f172a)',
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function BlogIndex() {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language?.split('-')[0] || 'en'
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [authModal, setAuthModal] = useState({ open: false, mode: 'signup' })

  useEffect(() => {
    setLoading(true)
    const cat = CATEGORIES.find(c => c.key === category)
    const params = [`page=${page}`, 'limit=10']
    if (cat?.isType) {
      params.push(`type=${category}`)
    } else if (category) {
      params.push(`category=${category}`)
    }
    const url = `/api/blog?${params.join('&')}`
    axios.get(url)
      .then(res => {
        setArticles(res.data.articles || [])
        setTotalPages(res.data.pages || 1)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [category, page])

  // Reset to page 1 when category changes
  useEffect(() => { setPage(1) }, [category])

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": "Spark AI Soccer Prediction Blog",
    "description": "Expert soccer betting tips, match previews, and analysis articles powered by AI.",
    "url": "https://spark-ai-prediction.com/blog",
    "publisher": {
      "@type": "Organization",
      "name": "Spark AI Prediction",
    }
  }

  const featured = articles[0]
  const rest = articles.slice(1)

  return (
    <>
      <SEOHead
        title={t('seo.blog.title', 'Soccer Betting Tips & Match Analysis Blog')}
        description={t('seo.blog.description', 'Expert soccer betting tips and analysis articles powered by AI.')}
        path="/blog"
        lang={currentLang}
        jsonLd={jsonLd}
      />

      <div className="seo-page">
        <LandingNav
          onSignIn={() => setAuthModal({ open: true, mode: 'login' })}
          onGetStarted={() => setAuthModal({ open: true, mode: 'signup' })}
        />

        <main className="seo-page-content blog-page-content">
          <div className="blog-container">
            {/* Category Filters */}
            <div className="blog-categories">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key || 'all'}
                  className={`blog-cat-btn ${category === cat.key ? 'active' : ''}`}
                  onClick={() => setCategory(cat.key)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="seo-loading">
                <div className="seo-spinner" />
                <p>Loading articles...</p>
              </div>
            ) : articles.length === 0 ? (
              <p className="blog-empty">No articles found.</p>
            ) : (
              <>
                {/* Featured Hero Article */}
                {featured && (
                  <Link to={`/blog/${featured.slug}`} className={`blog-featured ${!(featured.thumbnail || featured.cover_image) ? 'blog-featured-no-img' : ''}`}>
                    {(featured.thumbnail || featured.cover_image) && (
                      <div className="blog-featured-image">
                        <img src={featured.thumbnail || featured.cover_image} alt={featured.title} />
                      </div>
                    )}
                    <div className="blog-featured-content">
                      <span
                        className="blog-badge"
                        style={{ background: CATEGORY_COLORS[featured.category] || '#3b82f6' }}
                      >
                        {featured.category}
                      </span>
                      <h1 className="blog-featured-title">{featured.title}</h1>
                      <p className="blog-featured-excerpt">{featured.excerpt}</p>
                      <div className="blog-featured-meta">
                        <span className="blog-featured-date">{formatDate(featured.published_at)}</span>
                        {Array.isArray(featured.tags) && featured.tags.length > 0 && (
                          <div className="blog-featured-tags">
                            {featured.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="blog-tag">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="blog-featured-cta">Read full article &rarr;</span>
                    </div>
                  </Link>
                )}

                {/* Grid of remaining articles */}
                {rest.length > 0 && (
                  <div className="blog-grid">
                    {rest.map(article => (
                      <Link key={article.slug} to={`/blog/${article.slug}`} className={`blog-card ${!(article.thumbnail || article.cover_image) ? 'blog-card-no-img' : ''}`}>
                        {(article.thumbnail || article.cover_image) ? (
                          <div className="blog-card-image">
                            <img src={article.thumbnail || article.cover_image} alt={article.title} loading="lazy" />
                            <span
                              className="blog-badge blog-badge-overlay"
                              style={{ background: CATEGORY_COLORS[article.category] || '#3b82f6' }}
                            >
                              {article.category}
                            </span>
                          </div>
                        ) : (
                          <div className="blog-card-no-img-header" style={{ borderLeft: `3px solid ${CATEGORY_COLORS[article.category] || '#3b82f6'}` }}>
                            <span
                              className="blog-badge"
                              style={{ background: CATEGORY_COLORS[article.category] || '#3b82f6' }}
                            >
                              {article.category}
                            </span>
                          </div>
                        )}
                        <div className="blog-card-content">
                          <h2 className="blog-card-title">{article.title}</h2>
                          <p className="blog-card-excerpt">{article.excerpt}</p>
                          <div className="blog-card-meta">
                            <span className="blog-card-date">{formatDate(article.published_at)}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="blog-pagination">
                    <button
                      className="blog-page-btn"
                      disabled={page <= 1}
                      onClick={() => { setPage(p => p - 1); window.scrollTo(0, 0) }}
                    >
                      &larr; Previous
                    </button>
                    <div className="blog-page-numbers">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                        <button
                          key={p}
                          className={`blog-page-num ${p === page ? 'active' : ''}`}
                          onClick={() => { setPage(p); window.scrollTo(0, 0) }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <button
                      className="blog-page-btn"
                      disabled={page >= totalPages}
                      onClick={() => { setPage(p => p + 1); window.scrollTo(0, 0) }}
                    >
                      Next &rarr;
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        <footer className="blog-footer">
          <div className="blog-footer-inner">
            <div className="blog-footer-links">
              <Link to="/">Home</Link>
              <Link to="/today">Today's Predictions</Link>
              <Link to="/blog">Blog</Link>
              <Link to="/docs">Documentation</Link>
              <Link to="/terms">Terms</Link>
            </div>
            <p className="blog-footer-copy">&copy; {new Date().getFullYear()} Spark AI Prediction. All rights reserved.</p>
          </div>
        </footer>
      </div>

      {authModal.open && (
        <AuthModal initialMode={authModal.mode} onClose={() => setAuthModal({ open: false, mode: 'login' })} />
      )}
    </>
  )
}
