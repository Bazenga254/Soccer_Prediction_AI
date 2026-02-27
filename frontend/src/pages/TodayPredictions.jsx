import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import SEOHead from '../components/SEOHead'
import { buildLangPath } from '../utils/seoConstants'
import LandingNav from '../components/LandingNav'
import AuthModal from '../components/AuthModal'
import './TodayPredictions.css'

const TOP_LEAGUES = [
  { slug: 'premier-league', name: 'Premier League' },
  { slug: 'la-liga', name: 'La Liga' },
  { slug: 'bundesliga', name: 'Bundesliga' },
  { slug: 'serie-a', name: 'Serie A' },
  { slug: 'ligue-1', name: 'Ligue 1' },
  { slug: 'champions-league', name: 'Champions League' },
  { slug: 'europa-league', name: 'Europa League' },
  { slug: 'mls', name: 'MLS' },
]

export default function TodayPredictions() {
  const { t } = useTranslation()
  const { lang } = useParams()
  const currentLang = lang || 'en'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authModal, setAuthModal] = useState({ open: false, mode: 'signup' })

  useEffect(() => {
    axios.get('/api/today')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const today = data?.formatted_date || new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": `Soccer Predictions Today - ${today}`,
      "description": `Free AI soccer predictions for ${today}. Daily picks across 50+ leagues.`,
      "url": "https://spark-ai-prediction.com/today",
      "dateModified": data?.date || new Date().toISOString().split('T')[0],
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://spark-ai-prediction.com" },
        { "@type": "ListItem", "position": 2, "name": "Today's Predictions", "item": "https://spark-ai-prediction.com/today" },
      ]
    }
  ]

  return (
    <>
      <SEOHead
        title={t('seo.today.title', 'Soccer Predictions Today - Free AI Picks & Tips')}
        description={t('seo.today.description', `Free AI soccer predictions for ${today}. Today's top picks across 50+ leagues.`)}
        path="/today"
        lang={currentLang}
        jsonLd={jsonLd}
      />

      <div className="seo-page">
        <LandingNav
          onSignIn={() => setAuthModal({ open: true, mode: 'login' })}
          onGetStarted={() => setAuthModal({ open: true, mode: 'signup' })}
        />

        <main className="seo-page-content">
          <div className="seo-container">
            <h1 className="seo-page-title">Soccer Predictions Today</h1>
            <p className="seo-page-date">{today}</p>

            {loading ? (
              <div className="seo-loading">
                <div className="seo-spinner" />
                <p>Loading today's predictions...</p>
              </div>
            ) : (
              <>
                {/* AI Top Picks */}
                {data?.predictions?.length > 0 && (
                  <section className="seo-section">
                    <h2 className="seo-section-title">AI Top Picks</h2>
                    <p className="seo-section-desc">Today's highest-confidence predictions selected by our AI</p>
                    <div className="seo-predictions-grid">
                      {data.predictions.map((pred, i) => (
                        <div key={i} className="seo-prediction-card">
                          <div className="seo-pred-league">{pred.competition || pred.league || 'Match'}</div>
                          <div className="seo-pred-teams">
                            <span className="seo-pred-team">{pred.home_team || pred.team_a}</span>
                            <span className="seo-pred-vs">vs</span>
                            <span className="seo-pred-team">{pred.away_team || pred.team_b}</span>
                          </div>
                          {pred.prediction && (
                            <div className="seo-pred-tip">
                              <span className="seo-pred-label">Prediction:</span>
                              <span className="seo-pred-value">{pred.prediction}</span>
                            </div>
                          )}
                          {pred.confidence && (
                            <div className={`seo-pred-confidence seo-conf-${(pred.confidence || '').toLowerCase()}`}>
                              {pred.confidence} Confidence
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Today's Matches by League */}
                {data?.fixtures_by_league && Object.keys(data.fixtures_by_league).length > 0 && (
                  <section className="seo-section">
                    <h2 className="seo-section-title">Today's Matches</h2>
                    <p className="seo-section-desc">{data.total_matches} matches scheduled across all leagues</p>
                    {Object.entries(data.fixtures_by_league).map(([league, info]) => (
                      <div key={league} className="seo-league-group">
                        <h3 className="seo-league-name">{league}</h3>
                        <div className="seo-fixtures-list">
                          {info.fixtures.map((fix, i) => (
                            <div key={i} className="seo-fixture-row">
                              <span className="seo-fix-time">{fix.time || '--:--'}</span>
                              <span className="seo-fix-home">{fix.home_team}</span>
                              <span className="seo-fix-score">
                                {fix.status === 'FT' || fix.status === 'HT' || fix.status === 'LIVE'
                                  ? `${fix.score?.home ?? '-'} - ${fix.score?.away ?? '-'}`
                                  : 'vs'}
                              </span>
                              <span className="seo-fix-away">{fix.away_team}</span>
                              {fix.status && fix.status !== 'NS' && (
                                <span className={`seo-fix-status seo-status-${fix.status.toLowerCase()}`}>{fix.status}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                {/* CTA */}
                <section className="seo-cta-section">
                  <h2>Get Full Match Analysis</h2>
                  <p>Sign up for free to access detailed AI predictions with win probabilities, key factors, head-to-head stats, and more.</p>
                  <button className="seo-cta-btn" onClick={() => setAuthModal({ open: true, mode: 'signup' })}>
                    Get Started Free
                  </button>
                </section>

                {/* League Links */}
                <section className="seo-section">
                  <h2 className="seo-section-title">Browse by League</h2>
                  <div className="seo-league-links">
                    {TOP_LEAGUES.map(l => (
                      <Link key={l.slug} to={`/predictions/${l.slug}`} className="seo-league-link">
                        {l.name}
                      </Link>
                    ))}
                  </div>
                </section>
              </>
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
