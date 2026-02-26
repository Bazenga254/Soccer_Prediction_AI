import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import SEOHead from '../components/SEOHead'
import LandingNav from '../components/LandingNav'
import AuthModal from '../components/AuthModal'
import './Blog.css'

const CATEGORIES = [
  { key: null, label: 'All' },
  { key: 'guides', label: 'Guides' },
  { key: 'tips', label: 'Tips' },
  { key: 'analysis', label: 'Analysis' },
]

export default function BlogIndex() {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState(null)
  const [authModal, setAuthModal] = useState({ open: false, mode: 'signup' })

  useEffect(() => {
    setLoading(true)
    const url = category ? `/api/blog?category=${category}` : '/api/blog'
    axios.get(url)
      .then(res => setArticles(res.data.articles || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [category])

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

  return (
    <>
      <SEOHead
        title="Soccer Betting Tips & Match Previews"
        description="Expert soccer betting tips, match previews, and analysis articles powered by AI. Updated daily with insights across 50+ leagues."
        path="/blog"
        jsonLd={jsonLd}
      />

      <div className="seo-page">
        <LandingNav
          onSignIn={() => setAuthModal({ open: true, mode: 'login' })}
          onGetStarted={() => setAuthModal({ open: true, mode: 'signup' })}
        />

        <main className="seo-page-content">
          <div className="seo-container">
            <h1 className="seo-page-title">Soccer Betting Tips & Match Previews</h1>
            <p className="seo-page-subtitle">Expert analysis and guides powered by AI</p>

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
              <div className="blog-grid">
                {articles.map(article => (
                  <Link key={article.slug} to={`/blog/${article.slug}`} className="blog-card">
                    <div className="blog-card-content">
                      <span className="blog-card-category">{article.category}</span>
                      <h2 className="blog-card-title">{article.title}</h2>
                      <p className="blog-card-excerpt">{article.excerpt}</p>
                      <div className="blog-card-meta">
                        <span className="blog-card-date">{new Date(article.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        {article.tags && (
                          <div className="blog-card-tags">
                            {article.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="blog-tag">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="blog-card-arrow">Read more &rarr;</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </main>

        <footer className="seo-footer">
          <div className="seo-container">
            <div className="seo-footer-links">
              <Link to="/">Home</Link>
              <Link to="/today">Today's Predictions</Link>
              <Link to="/blog">Blog</Link>
              <Link to="/docs">Documentation</Link>
              <Link to="/terms">Terms</Link>
            </div>
            <p className="seo-footer-copy">&copy; {new Date().getFullYear()} Spark AI Prediction. All rights reserved.</p>
          </div>
        </footer>
      </div>

      {authModal.open && (
        <AuthModal initialMode={authModal.mode} onClose={() => setAuthModal({ open: false, mode: 'login' })} />
      )}
    </>
  )
}
