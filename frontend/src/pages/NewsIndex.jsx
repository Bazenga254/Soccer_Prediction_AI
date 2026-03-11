import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import SEOHead from '../components/SEOHead'
import './Blog.css'

const CATEGORIES = [
  { key: null, label: 'All' },
  { key: 'transfers', label: 'Transfers' },
  { key: 'match-updates', label: 'Match Updates' },
  { key: 'injuries', label: 'Injuries' },
  { key: 'results', label: 'Results' },
  { key: 'rumors', label: 'Rumors' },
  { key: 'general', label: 'General' },
]

export default function NewsIndex() {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState(null)

  useEffect(() => {
    setLoading(true)
    const url = category ? `/api/news?category=${category}` : '/api/news'
    axios.get(url)
      .then(res => setArticles(res.data.articles || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [category])

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Soccer Transfer News, Match Updates & Injury Reports",
    "description": "Latest soccer news - transfers, match results, injuries, and rumors powered by Spark AI.",
    "url": "https://spark-ai-prediction.com/news",
    "publisher": {
      "@type": "Organization",
      "name": "Spark AI Prediction",
    }
  }

  return (
    <>
      <SEOHead
        title="Soccer News - Transfers, Match Updates & Injuries"
        description="Latest soccer news covering transfers, match results, injuries, and rumors. Stay updated with real-time football news powered by Spark AI."
        path="/news"
        jsonLd={jsonLd}
      />
    <div className="news-page">
      <div className="news-container">
        <div className="news-hero">
          <h1>Latest News</h1>
          <p>Transfer updates, match results, injuries & more</p>
        </div>

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
            <p>Loading news...</p>
          </div>
        ) : articles.length === 0 ? (
          <p className="blog-empty">No news articles found.</p>
        ) : (
          <div className="news-feed">
            {articles.map(article => (
              <Link key={article.slug} to={`/blog/${article.slug}`} className="news-card">
                {article.cover_image && (
                  <div className="news-card-image">
                    <img src={article.cover_image} alt={article.title} loading="lazy" />
                  </div>
                )}
                <div className="news-card-content">
                  <div className="news-card-meta">
                    <span className="blog-card-category">{(article.category || 'general').split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}</span>
                    <span className="blog-card-date">{new Date(article.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <h2 className="news-card-title">{article.title}</h2>
                  {Array.isArray(article.teams) && article.teams.length > 0 && (
                    <div className="news-card-teams">
                      {article.teams.map(team => (
                        <span key={team} className="news-team-badge">{team}</span>
                      ))}
                    </div>
                  )}
                  <p className="news-card-excerpt">{article.excerpt}</p>
                  {article.author_name && (
                    <span className="news-card-author">By {article.author_name}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  )
}
