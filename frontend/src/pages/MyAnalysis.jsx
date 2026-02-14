import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function SessionCard({ session, isExpanded, onToggle }) {
  return (
    <div className={`my-analysis-card ${isExpanded ? 'expanded' : ''}`}>
      <div className="my-analysis-card-header" onClick={onToggle}>
        <div className="my-analysis-card-info">
          <div className="my-analysis-card-date">{formatDate(session.created_at)}</div>
          <div className="my-analysis-card-meta">
            <span className={`my-analysis-status ${session.status}`}>{session.status}</span>
            <span className="my-analysis-match-count">{session.total_matches} matches</span>
          </div>
        </div>
        <div className="my-analysis-card-teams">
          {(session.match_summaries || []).map((s, i) => (
            <span key={i} className="my-analysis-team-pill">{s}</span>
          ))}
        </div>
        <span className="my-analysis-card-arrow">{isExpanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {isExpanded && session.results && session.results.length > 0 && (
        <div className="my-analysis-card-body">
          {/* Combinations */}
          {session.best_combination && (
            <div className="my-analysis-combinations">
              <h4>{'\u{1F3AF}'} Winning Combinations</h4>
              <div className="my-analysis-combo-grid">
                {Object.entries(session.best_combination).map(([key, combo]) => (
                  <div key={key} className={`my-analysis-combo-card ${key}`}>
                    <div className="my-analysis-combo-name">{combo.name}</div>
                    <div className="my-analysis-combo-desc">{combo.description}</div>
                    <div className="my-analysis-combo-picks">
                      {(combo.picks || []).map((p, i) => (
                        <div key={i} className="my-analysis-combo-pick">
                          <span className="pick-match">{p.match}</span>
                          <span className="pick-value">{p.pick}</span>
                          <span className="pick-prob">{p.probability?.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                    <div className="my-analysis-combo-total">
                      Combined: {combo.combined_probability?.toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Match Results */}
          <h4>{'\u26BD'} Match Analysis Results</h4>
          {session.results.map((result, idx) => (
            <MatchSummaryCard key={idx} result={result} index={idx} />
          ))}
        </div>
      )}
    </div>
  )
}

function MatchSummaryCard({ result, index }) {
  const [expanded, setExpanded] = useState(false)

  if (result.status === 'failed') {
    return (
      <div className="my-analysis-match failed">
        <span>#{index + 1}</span>
        <span>{result.home_team?.name || '?'} vs {result.away_team?.name || '?'}</span>
        <span className="my-analysis-status failed">Failed</span>
      </div>
    )
  }

  const preds = result.predictions || {}
  const oneXTwo = preds['1x2'] || {}
  const dc = preds.double_chance || {}
  const ga = result.goals_analysis
  const factors = result.factors || {}

  return (
    <div className={`my-analysis-match ${expanded ? 'expanded' : ''}`}>
      <div className="my-analysis-match-header" onClick={() => setExpanded(!expanded)}>
        <span className="my-analysis-match-num">#{index + 1}</span>
        <div className="my-analysis-match-teams">
          {result.home_team?.crest && <img src={result.home_team.crest} alt="" className="my-analysis-crest" />}
          <span>{result.home_team?.name}</span>
          <span className="my-analysis-vs">vs</span>
          {result.away_team?.crest && <img src={result.away_team.crest} alt="" className="my-analysis-crest" />}
          <span>{result.away_team?.name}</span>
        </div>
        <div className="my-analysis-match-pick">
          <span className="pick-badge">{oneXTwo.recommended_label || oneXTwo.recommended}</span>
          <span className="pick-conf">{oneXTwo.confidence}</span>
        </div>
        <span className="my-analysis-match-arrow">{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {expanded && (
        <div className="my-analysis-match-detail">
          {/* 1X2 */}
          <div className="my-analysis-section">
            <h5>1X2 Predictions</h5>
            <div className="my-analysis-probs">
              <div className="prob-item"><span>Home</span><span>{oneXTwo.home_win?.toFixed(1)}%</span></div>
              <div className="prob-item"><span>Draw</span><span>{oneXTwo.draw?.toFixed(1)}%</span></div>
              <div className="prob-item"><span>Away</span><span>{oneXTwo.away_win?.toFixed(1)}%</span></div>
            </div>
          </div>

          {/* Double Chance */}
          {dc && (
            <div className="my-analysis-section">
              <h5>Double Chance</h5>
              <div className="my-analysis-probs">
                <div className="prob-item"><span>1X</span><span>{dc['1X']?.toFixed(1)}%</span></div>
                <div className="prob-item"><span>X2</span><span>{dc['X2']?.toFixed(1)}%</span></div>
                <div className="prob-item"><span>12</span><span>{dc['12']?.toFixed(1)}%</span></div>
              </div>
            </div>
          )}

          {/* Goals */}
          {ga && (
            <div className="my-analysis-section">
              <h5>Goals Analysis</h5>
              <div className="my-analysis-probs">
                <div className="prob-item"><span>Avg Goals</span><span>{ga.avg_total_goals}</span></div>
                <div className="prob-item"><span>Predicted</span><span>{ga.scoring_prediction?.predicted_score}</span></div>
                <div className="prob-item"><span>BTTS</span><span>{ga.btts?.prediction} ({ga.btts?.yes_percentage}%)</span></div>
              </div>
              {ga.over_under && (
                <div className="my-analysis-probs" style={{ marginTop: '6px' }}>
                  {Object.entries(ga.over_under).map(([k, v]) => (
                    <div key={k} className="prob-item">
                      <span>{k.replace('_', ' ').toUpperCase()}</span>
                      <span>{v.prediction} ({v.percentage}%)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Key Factors */}
          {result.key_factors && result.key_factors.length > 0 && (
            <div className="my-analysis-section">
              <h5>Key Factors</h5>
              <ul className="my-analysis-factors">
                {result.key_factors.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}

          {/* Injuries */}
          {factors.injury_impact && (
            <div className="my-analysis-section">
              <h5>Injury Impact</h5>
              <p className="my-analysis-verdict">{factors.injury_impact.verdict}</p>
            </div>
          )}

          <div className="my-analysis-data-source">
            Data: <span className={`source-badge ${result.data_source}`}>{result.data_source?.toUpperCase()}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MyAnalysis() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [loadingSession, setLoadingSession] = useState(null)

  useEffect(() => {
    axios.get('/api/jackpot/history')
      .then(res => {
        setSessions(res.data.sessions || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const toggleSession = async (session) => {
    if (expandedId === session.id) {
      setExpandedId(null)
      return
    }

    // If results already loaded, just expand
    if (session.results && session.results.length > 0) {
      setExpandedId(session.id)
      return
    }

    // Fetch full session data
    setLoadingSession(session.id)
    try {
      const res = await axios.get(`/api/jackpot/session/${session.id}`)
      setSessions(prev => prev.map(s =>
        s.id === session.id
          ? { ...s, results: res.data.results || [], best_combination: res.data.best_combination }
          : s
      ))
      setExpandedId(session.id)
    } catch {
      // Session data not available
    }
    setLoadingSession(null)
  }

  if (loading) {
    return (
      <div className="my-analysis-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading your analyses...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="my-analysis-page">
      <div className="my-analysis-header">
        <h2>{'\u{1F4CA}'} My Analysis</h2>
        <p className="my-analysis-subtitle">Your saved jackpot analysis reports</p>
      </div>

      {sessions.length === 0 ? (
        <div className="my-analysis-empty">
          <div className="my-analysis-empty-icon">{'\u{1F4CB}'}</div>
          <h3>No analyses yet</h3>
          <p>Go to the Jackpot Analyzer to create your first analysis!</p>
          <Link to="/jackpot" className="my-analysis-cta">
            {'\u{1F3AF}'} Start Analyzing
          </Link>
        </div>
      ) : (
        <div className="my-analysis-list">
          {sessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              isExpanded={expandedId === session.id}
              onToggle={() => toggleSession(session)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
