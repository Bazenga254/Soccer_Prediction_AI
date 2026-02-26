import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import SEOHead from '../components/SEOHead'
import LandingNav from '../components/LandingNav'
import AuthModal from '../components/AuthModal'
import './LeaguePredictions.css'

const RELATED_LEAGUES = [
  { slug: 'premier-league', name: 'Premier League' },
  { slug: 'la-liga', name: 'La Liga' },
  { slug: 'bundesliga', name: 'Bundesliga' },
  { slug: 'serie-a', name: 'Serie A' },
  { slug: 'ligue-1', name: 'Ligue 1' },
  { slug: 'champions-league', name: 'Champions League' },
  { slug: 'eredivisie', name: 'Eredivisie' },
  { slug: 'mls', name: 'MLS' },
  { slug: 'saudi-pro-league', name: 'Saudi Pro League' },
  { slug: 'brazilian-serie-a', name: 'Brazilian Serie A' },
]

export default function LeaguePredictions() {
  const { leagueSlug } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [authModal, setAuthModal] = useState({ open: false, mode: 'signup' })

  useEffect(() => {
    setLoading(true)
    setError(null)
    axios.get(`/api/league/${leagueSlug}`)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.status === 404 ? 'League not found' : 'Failed to load league data'))
      .finally(() => setLoading(false))
  }, [leagueSlug])

  const leagueName = data?.name || leagueSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const seoTitle = data?.seo?.title || `${leagueName} Predictions Today`
  const seoDesc = data?.seo?.description || `AI predictions for today's ${leagueName} matches. Get accurate tips, odds analysis, and match previews.`

  const fixtureJsonLd = (data?.fixtures || []).map(fix => ({
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "name": `${fix.home_team} vs ${fix.away_team}`,
    "startDate": fix.date,
    "location": fix.venue ? { "@type": "Place", "name": fix.venue } : undefined,
    "homeTeam": { "@type": "SportsTeam", "name": fix.home_team },
    "awayTeam": { "@type": "SportsTeam", "name": fix.away_team },
    "sport": "Soccer",
  }))

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://spark-ai-prediction.com" },
        { "@type": "ListItem", "position": 2, "name": "Predictions", "item": "https://spark-ai-prediction.com/today" },
        { "@type": "ListItem", "position": 3, "name": leagueName, "item": `https://spark-ai-prediction.com/predictions/${leagueSlug}` },
      ]
    },
    ...fixtureJsonLd,
  ]

  return (
    <>
      <SEOHead
        title={seoTitle}
        description={seoDesc}
        path={`/predictions/${leagueSlug}`}
        jsonLd={jsonLd}
      />

      <div className="seo-page">
        <LandingNav
          onSignIn={() => setAuthModal({ open: true, mode: 'login' })}
          onGetStarted={() => setAuthModal({ open: true, mode: 'signup' })}
        />

        <main className="seo-page-content">
          <div className="seo-container">
            {loading ? (
              <div className="seo-loading">
                <div className="seo-spinner" />
                <p>Loading {leagueName} predictions...</p>
              </div>
            ) : error ? (
              <div className="seo-error">
                <h1>League Not Found</h1>
                <p>{error}</p>
                <Link to="/today" className="seo-back-link">View Today's Predictions</Link>
              </div>
            ) : (
              <>
                <div className="league-header">
                  <h1 className="seo-page-title">{seoTitle}</h1>
                  <p className="seo-page-subtitle">{data?.seo?.country} &middot; AI-powered match analysis and predictions</p>
                </div>

                {/* AI Predictions for this league */}
                {data?.predictions?.length > 0 && (
                  <section className="seo-section">
                    <h2 className="seo-section-title">AI Predictions</h2>
                    <div className="seo-predictions-grid">
                      {data.predictions.map((pred, i) => (
                        <div key={i} className="seo-prediction-card">
                          <div className="seo-pred-teams">
                            <span className="seo-pred-team">{pred.home_team || pred.team_a}</span>
                            <span className="seo-pred-vs">vs</span>
                            <span className="seo-pred-team">{pred.away_team || pred.team_b}</span>
                          </div>
                          {pred.prediction && (
                            <div className="seo-pred-tip">
                              <span className="seo-pred-label">Tip:</span>
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

                {/* Upcoming Fixtures */}
                {data?.fixtures?.length > 0 ? (
                  <section className="seo-section">
                    <h2 className="seo-section-title">Upcoming {leagueName} Matches</h2>
                    <div className="seo-fixtures-table">
                      {data.fixtures.map((fix, i) => (
                        <div key={i} className="seo-fixture-row league-fixture">
                          <span className="seo-fix-date">{fix.date}</span>
                          <span className="seo-fix-time">{fix.time || '--:--'}</span>
                          <span className="seo-fix-home">{fix.home_team}</span>
                          <span className="seo-fix-score">vs</span>
                          <span className="seo-fix-away">{fix.away_team}</span>
                          {fix.venue && <span className="seo-fix-venue">{fix.venue}</span>}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="seo-section">
                    <h2 className="seo-section-title">No Upcoming Matches</h2>
                    <p className="seo-section-desc">
                      There are no {leagueName} matches scheduled in the next 7 days. Check back later or browse other leagues below.
                    </p>
                  </section>
                )}

                {/* CTA */}
                <section className="seo-cta-section">
                  <h2>Get Detailed {leagueName} Analysis</h2>
                  <p>Sign up for free to access AI-powered predictions with win probabilities, key factors, head-to-head stats, and odds comparison for every {leagueName} match.</p>
                  <button className="seo-cta-btn" onClick={() => setAuthModal({ open: true, mode: 'signup' })}>
                    Get Started Free
                  </button>
                </section>

                {/* Related Leagues */}
                <section className="seo-section">
                  <h2 className="seo-section-title">More Leagues</h2>
                  <div className="seo-league-links">
                    {RELATED_LEAGUES.filter(l => l.slug !== leagueSlug).map(l => (
                      <Link key={l.slug} to={`/predictions/${l.slug}`} className="seo-league-link">
                        {l.name}
                      </Link>
                    ))}
                    <Link to="/today" className="seo-league-link seo-league-link-all">
                      All Predictions Today
                    </Link>
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
