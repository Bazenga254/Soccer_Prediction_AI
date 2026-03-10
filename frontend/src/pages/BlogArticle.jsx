import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import SEOHead from '../components/SEOHead'
import LandingNav from '../components/LandingNav'
import AuthModal from '../components/AuthModal'
import './Blog.css'

function renderMarkdown(text) {
  if (!text) return ''
  // Simple markdown: headings, bold, italic, links, lists, horizontal rules
  let html = text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #334155;margin:24px 0" />')

  // Wrap remaining text in paragraphs, but preserve raw HTML blocks
  html = html.split('\n\n').map(block => {
    const trimmed = block.trim()
    if (!trimmed) return ''
    // Don't wrap blocks that are already HTML tags
    if (/^<(h[1-6]|ul|ol|li|div|img|iframe|hr|figure|video|table|blockquote|section|br)/i.test(trimmed)) return trimmed
    // Don't wrap blocks that contain block-level HTML (e.g. <img> on its own line)
    if (/<(img|div|iframe|video|figure|hr)\b/i.test(trimmed)) return trimmed
    return `<p>${trimmed}</p>`
  }).join('\n')

  return html
}

export default function BlogArticle() {
  const { t, i18n } = useTranslation()
  const { slug } = useParams()
  const currentLang = i18n.language?.split('-')[0] || 'en'
  const [article, setArticle] = useState(null)
  const [related, setRelated] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [authModal, setAuthModal] = useState({ open: false, mode: 'signup' })

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      axios.get(`/api/blog/${slug}`),
      axios.get('/api/blog'),
    ])
      .then(([artRes, listRes]) => {
        setArticle(artRes.data)
        setRelated((listRes.data.articles || []).filter(a => a.slug !== slug).slice(0, 3))
      })
      .catch(err => setError(err.response?.status === 404 ? 'Article not found' : 'Failed to load article'))
      .finally(() => setLoading(false))
  }, [slug])

  const jsonLd = article ? {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.title,
    "description": article.excerpt,
    "datePublished": article.published_at,
    "dateModified": article.updated_at,
    "author": { "@type": "Organization", "name": "Spark AI Prediction" },
    "publisher": {
      "@type": "Organization",
      "name": "Spark AI Prediction",
      "logo": { "@type": "ImageObject", "url": "https://spark-ai-prediction.com/pwa-512x512.png" }
    },
    "mainEntityOfPage": { "@type": "WebPage", "@id": `https://spark-ai-prediction.com/blog/${slug}` }
  } : null

  return (
    <>
      {article && (
        <SEOHead
          title={article.title}
          description={article.excerpt}
          path={`/blog/${slug}`}
        lang={currentLang}
          jsonLd={jsonLd}
          article={{
            publishedTime: article.published_at,
            modifiedTime: article.updated_at,
            section: article.category,
          }}
        />
      )}

      <div className="seo-page">
        <LandingNav
          onSignIn={() => setAuthModal({ open: true, mode: 'login' })}
          onGetStarted={() => setAuthModal({ open: true, mode: 'signup' })}
        />

        <main className="seo-page-content blog-page-content">
          <div className="seo-container blog-article-container">
            {loading ? (
              <div className="seo-loading">
                <div className="seo-spinner" />
                <p>Loading article...</p>
              </div>
            ) : error ? (
              <div className="seo-error">
                <h1>Article Not Found</h1>
                <p>{error}</p>
                <Link to="/blog" className="seo-back-link">Back to Blog</Link>
              </div>
            ) : article ? (
              <>
                {/* Breadcrumbs */}
                <nav className="blog-breadcrumbs">
                  <Link to="/">Home</Link> &rsaquo;{' '}
                  <Link to="/blog">Blog</Link> &rsaquo;{' '}
                  <span>{article.title}</span>
                </nav>

                <article className="blog-article">
                  <header className="blog-article-header">
                    <span className="blog-card-category">{article.category}</span>
                    <h1 className="blog-article-title">{article.title}</h1>
                    <p className="blog-article-excerpt">{article.excerpt}</p>
                    <div className="blog-article-meta">
                      <span>Published {new Date(article.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                      {article.updated_at !== article.published_at && (
                        <span> &middot; Updated {new Date(article.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                      )}
                    </div>
                    {Array.isArray(article.tags) && article.tags.length > 0 && (
                      <div className="blog-card-tags" style={{ marginTop: 12 }}>
                        {article.tags.map(tag => (
                          <span key={tag} className="blog-tag">{tag}</span>
                        ))}
                      </div>
                    )}
                  </header>

                  <div
                    className="blog-article-body"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }}
                  />
                </article>

                {/* CTA */}
                <section className="seo-cta-section">
                  <h2>Try Spark AI Predictions</h2>
                  <p>Get free daily AI predictions across 50+ leagues. Sign up now for match analysis, odds comparison, and more.</p>
                  <Link to="/login" className="seo-cta-btn" style={{ textDecoration: 'none' }}>
                    Get Started Free
                  </Link>
                </section>

                {/* Related Articles */}
                {related.length > 0 && (
                  <section className="seo-section">
                    <h2 className="seo-section-title">Related Articles</h2>
                    <div className="blog-grid">
                      {related.map(a => (
                        <Link key={a.slug} to={`/blog/${a.slug}`} className="blog-card">
                          <div className="blog-card-content">
                            <span className="blog-card-category">{a.category}</span>
                            <h3 className="blog-card-title">{a.title}</h3>
                            <p className="blog-card-excerpt">{a.excerpt}</p>
                          </div>
                          <span className="blog-card-arrow">Read more &rarr;</span>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
              </>
            ) : null}
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
