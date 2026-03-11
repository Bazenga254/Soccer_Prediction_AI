import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import SEOHead from '../components/SEOHead'
import './Blog.css'

function renderMarkdown(text) {
  if (!text) return ''
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

  // Tables
  html = html.replace(/(\|.+\|[\r\n]+\|[-| :]+\|[\r\n]+((\|.+\|[\r\n]*)+))/g, (match) => {
    const rows = match.trim().split('\n').filter(r => r.trim())
    if (rows.length < 2) return match
    const headers = rows[0].split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('')
    const bodyRows = rows.slice(2).map(row => {
      const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('')
      return `<tr>${cells}</tr>`
    }).join('')
    return `<table class="blog-table"><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table>`
  })

  html = html.split('\n\n').map(block => {
    const trimmed = block.trim()
    if (!trimmed) return ''
    if (/^<(h[1-6]|ul|ol|li|div|img|iframe|hr|figure|video|table|blockquote|section|br)/i.test(trimmed)) return trimmed
    if (/<(img|div|iframe|video|figure|hr|table)\b/i.test(trimmed)) return trimmed
    return `<p>${trimmed}</p>`
  }).join('\n')

  return html
}

export default function NewsArticle() {
  const { slug } = useParams()
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    axios.get(`/api/blog/${slug}`)
      .then(res => setArticle(res.data))
      .catch(err => setError(err.response?.status === 404 ? 'Article not found' : 'Failed to load article'))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <div className="news-page">
        <div className="news-container">
          <div className="seo-loading"><div className="seo-spinner" /><p>Loading article...</p></div>
        </div>
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="news-page">
        <div className="news-container">
          <div className="seo-error">
            <h1>Article Not Found</h1>
            <p>{error || 'This article does not exist.'}</p>
            <Link to="/news" className="seo-back-link">Back to News</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <SEOHead
        title={article.title}
        description={article.excerpt}
        path={`/news/${slug}`}
      />
      <div className="news-page">
        <div className="news-container" style={{ maxWidth: 800 }}>
          {/* Breadcrumbs */}
          <nav className="blog-breadcrumbs" style={{ marginBottom: 16 }}>
            <Link to="/news">News</Link> &rsaquo;{' '}
            <span>{article.title}</span>
          </nav>

          <article className="blog-article">
            <header className="blog-article-header">
              <span className="blog-card-category">
                {(article.category || 'general').split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}
              </span>
              <h1 className="blog-article-title">{article.title}</h1>
              {article.excerpt && <p className="blog-article-excerpt">{article.excerpt}</p>}
              <div className="blog-article-meta">
                <span>
                  {new Date(article.published_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric'
                  })}
                </span>
              </div>
            </header>

            {article.cover_image && (
              <div style={{ margin: '20px 0', borderRadius: 12, overflow: 'hidden' }}>
                <img
                  src={article.cover_image}
                  alt={article.title}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
            )}

            <div
              className="blog-article-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }}
            />

            {Array.isArray(article.tags) && article.tags.length > 0 && (
              <div className="blog-card-tags" style={{ marginTop: 20 }}>
                {article.tags.map(tag => (
                  <span key={tag} className="blog-tag">{tag}</span>
                ))}
              </div>
            )}
          </article>
        </div>
      </div>
    </>
  )
}
