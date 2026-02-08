import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

// League priority: lower number = shown first
const LEAGUE_PRIORITY = {
  39: 1,    // Premier League
  140: 2,   // La Liga
  78: 3,    // Bundesliga
  135: 4,   // Serie A
  61: 5,    // Ligue 1
  2: 6,     // Champions League
  3: 7,     // Europa League
  40: 8,    // Championship
  88: 9,    // Eredivisie
  94: 10,   // Primeira Liga
  1: 11,    // World Cup
  4: 12,    // Euro
  13: 13,   // Copa Libertadores
}

// Play whistle sound for goals
function playGoalSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    // Whistle: rising pitch
    osc.frequency.setValueAtTime(800, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.15)
    osc.frequency.linearRampToValueAtTime(1400, ctx.currentTime + 0.3)
    osc.frequency.setValueAtTime(1400, ctx.currentTime + 0.3)
    osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.5)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.6)
  } catch (e) {
    // Audio not available
  }
}

export default function LiveScores() {
  const [liveMatches, setLiveMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [expandedMatch, setExpandedMatch] = useState(null)
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('live_favorites') || '[]') } catch { return [] }
  })
  const [recentGoalIds, setRecentGoalIds] = useState(new Set())
  const prevGoalsRef = useRef({})
  const navigate = useNavigate()

  const toggleFavorite = (matchId) => {
    setFavorites(prev => {
      const next = prev.includes(matchId) ? prev.filter(id => id !== matchId) : [...prev, matchId]
      localStorage.setItem('live_favorites', JSON.stringify(next))
      return next
    })
  }

  const fetchLiveMatches = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      const response = await axios.get('/api/live-matches')
      const matches = response.data.matches || []

      // Detect new goals
      const prevGoals = prevGoalsRef.current
      const newGoalMatchIds = new Set()
      matches.forEach(m => {
        const key = m.id
        const totalGoals = (m.goals?.home || 0) + (m.goals?.away || 0)
        if (prevGoals[key] !== undefined && totalGoals > prevGoals[key]) {
          newGoalMatchIds.add(key)
          playGoalSound()
        }
        prevGoals[key] = totalGoals
      })

      if (newGoalMatchIds.size > 0) {
        setRecentGoalIds(newGoalMatchIds)
        setTimeout(() => setRecentGoalIds(new Set()), 8000)
      }

      setLiveMatches(matches)
      setLastUpdate(new Date())
      setError(null)
    } catch (err) {
      console.error('Error fetching live matches:', err)
      if (err.response?.status === 500) {
        setError('Server error. Please try again later.')
      }
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLiveMatches(true)
    const interval = setInterval(() => fetchLiveMatches(false), 45000)
    return () => clearInterval(interval)
  }, [fetchLiveMatches])

  // Status helpers
  const isLive = (status) => ['1H', '2H', 'LIVE', 'ET', 'HT'].includes(status)
  const isFinished = (status) => ['FT', 'AET', 'PEN'].includes(status)

  const getMatchStatus = (status, elapsed) => {
    switch (status) {
      case '1H': case '2H': case 'LIVE': return `${elapsed}'`
      case 'HT': return 'HT'
      case 'FT': return 'FT'
      case 'ET': return `ET ${elapsed}'`
      case 'AET': return 'AET'
      case 'P': case 'PEN': return 'PEN'
      case 'SUSP': return 'SUSP'
      case 'INT': return 'INT'
      default: return status || '-'
    }
  }

  // Group and sort matches
  const groupedMatches = useMemo(() => {
    const groups = {}
    liveMatches.forEach(match => {
      const leagueKey = `${match.competition?.id || 'unknown'}`
      if (!groups[leagueKey]) {
        groups[leagueKey] = {
          id: match.competition?.id,
          country: match.competition?.country || 'Unknown',
          league: match.competition?.name || 'Unknown',
          emblem: match.competition?.emblem,
          flag: match.competition?.flag,
          code: match.competition?.code,
          priority: LEAGUE_PRIORITY[match.competition?.id] || 99,
          matches: []
        }
      }
      groups[leagueKey].matches.push(match)
    })

    // Sort matches within each league
    Object.values(groups).forEach(group => {
      group.matches.sort((a, b) => {
        // Favorited matches first
        const aFav = favorites.includes(a.id) ? 0 : 1
        const bFav = favorites.includes(b.id) ? 0 : 1
        if (aFav !== bFav) return aFav - bFav
        // Recent goals to top
        const aGoal = recentGoalIds.has(a.id) ? 0 : 1
        const bGoal = recentGoalIds.has(b.id) ? 0 : 1
        if (aGoal !== bGoal) return aGoal - bGoal
        // Live > HT > FT
        const statusOrder = (s) => isLive(s) ? 0 : s === 'HT' ? 1 : isFinished(s) ? 3 : 2
        return statusOrder(a.status) - statusOrder(b.status)
      })
    })

    // Sort leagues: priority first, then alphabetical
    return Object.values(groups).sort((a, b) => {
      // Leagues with live matches first
      const aHasLive = a.matches.some(m => isLive(m.status))
      const bHasLive = b.matches.some(m => isLive(m.status))
      if (aHasLive && !bHasLive) return -1
      if (!aHasLive && bHasLive) return 1
      // Then by priority
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.country.localeCompare(b.country)
    })
  }, [liveMatches, favorites, recentGoalIds])

  const handleMatchClick = (match) => {
    const code = match.competition?.code || 'PL'
    navigate(`/match/${code}/${match.home_team.id}/${match.away_team.id}`, {
      state: { fixture: match }
    })
  }

  if (loading) {
    return (
      <div className="live-scores-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading live matches...</p>
        </div>
      </div>
    )
  }

  const liveCount = liveMatches.filter(m => isLive(m.status)).length
  const finishedCount = liveMatches.filter(m => isFinished(m.status)).length

  return (
    <div className="live-scores-page">
      <div className="live-scores-header">
        <h1>
          <span className="live-dot"></span>
          Live Scores
        </h1>
        <div className="header-actions">
          <div className="live-stats-bar">
            {liveCount > 0 && <span className="live-stat live">{liveCount} Live</span>}
            {finishedCount > 0 && <span className="live-stat finished">{finishedCount} FT</span>}
          </div>
          {lastUpdate && (
            <span className="last-update-time">
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button className="refresh-btn" onClick={() => fetchLiveMatches(false)}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button className="retry-btn" onClick={() => fetchLiveMatches(true)}>Try Again</button>
        </div>
      )}

      {!error && liveMatches.length === 0 ? (
        <div className="no-live-matches">
          <div className="no-matches-icon">⚽</div>
          <h2>No Matches Today</h2>
          <p>There are no live or finished matches to display right now.</p>
          <p className="hint-text">
            Live matches from ALL leagues worldwide are shown when games are being played.
          </p>
        </div>
      ) : (
        <div className="live-leagues-container">
          {groupedMatches.map((group, gIdx) => (
            <div key={gIdx} className="live-league-group">
              <div className="league-group-header">
                {group.flag ? (
                  <img src={group.flag} alt="" className="league-group-flag" />
                ) : group.emblem ? (
                  <img src={group.emblem} alt="" className="league-group-emblem" />
                ) : null}
                <div className="league-group-info">
                  <span className="league-group-country">{group.country}</span>
                  <span className="league-group-name">{group.league}</span>
                </div>
                <span className="league-match-count">{group.matches.length}</span>
              </div>

              <div className="league-matches-list">
                {group.matches.map((match) => {
                  const hasGoal = recentGoalIds.has(match.id)
                  const isFav = favorites.includes(match.id)
                  const analysis = match.live_analysis

                  return (
                    <div key={match.id}>
                      <div
                        className={`live-match-row ${isLive(match.status) ? 'is-live' : ''} ${isFinished(match.status) ? 'is-ft' : ''} ${hasGoal ? 'goal-flash' : ''}`}
                        onClick={() => setExpandedMatch(expandedMatch === match.id ? null : match.id)}
                      >
                        <button
                          className={`fav-star ${isFav ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(match.id) }}
                        >
                          {isFav ? '\u2605' : '\u2606'}
                        </button>

                        <div className={`match-row-status ${isLive(match.status) ? 'live' : isFinished(match.status) ? 'ft' : ''}`}>
                          {isLive(match.status) && <span className="status-live-dot"></span>}
                          {getMatchStatus(match.status, match.elapsed)}
                        </div>

                        <div className="match-row-teams">
                          <div className="match-row-team home">
                            {match.home_team.crest && (
                              <img src={match.home_team.crest} alt="" className="match-row-crest" />
                            )}
                            <span className="match-row-name">{match.home_team.name}</span>
                          </div>
                          <div className="match-row-team away">
                            {match.away_team.crest && (
                              <img src={match.away_team.crest} alt="" className="match-row-crest" />
                            )}
                            <span className="match-row-name">{match.away_team.name}</span>
                          </div>
                        </div>

                        <div className={`match-row-score ${hasGoal ? 'score-flash' : ''}`}>
                          <span className={isLive(match.status) ? 'score-live' : ''}>
                            {match.goals?.home ?? 0}
                          </span>
                          <span className="score-separator">-</span>
                          <span className={isLive(match.status) ? 'score-live' : ''}>
                            {match.goals?.away ?? 0}
                          </span>
                        </div>

                        <div className="match-row-arrow">›</div>
                      </div>

                      {/* Expanded analysis panel */}
                      {expandedMatch === match.id && (
                        <div className="match-expanded-panel">
                          {analysis && isLive(match.status) ? (
                            <div className="lma-container lma-compact">
                              {/* Dynamic bars: Domination, Likely to Score, Aggression */}
                              {[
                                { key: 'dom', label: 'DOMINATION', data: analysis.domination },
                                { key: 'lts', label: 'LIKELY TO SCORE', data: analysis.likely_next_goal },
                                { key: 'agg', label: 'AGGRESSION', data: analysis.aggression },
                              ].filter(m => m.data).map(m => {
                                const h = m.data.home || 50
                                const a = m.data.away || 50
                                const hDom = h >= a
                                const hCol = hDom ? '#22c55e' : '#ef4444'
                                const aCol = hDom ? '#ef4444' : '#22c55e'
                                return (
                                  <div key={m.key} className="lma-metric">
                                    <div className="lma-label">{m.label}</div>
                                    <div className="lma-bar-row">
                                      <span className="lma-pct" style={{ color: hCol }}>{h}%</span>
                                      <div className="lma-track">
                                        <div className="lma-fill-home" style={{ width: `${h}%`, background: hCol, boxShadow: `0 0 12px ${hCol}88` }} />
                                        <div className="lma-fill-away" style={{ width: `${a}%`, background: aCol, boxShadow: `0 0 12px ${aCol}88` }} />
                                      </div>
                                      <span className="lma-pct" style={{ color: aCol }}>{a}%</span>
                                    </div>
                                    <div className="lma-teams">
                                      <span style={{ color: hCol }}>{match.home_team.name}</span>
                                      <span style={{ color: aCol }}>{match.away_team.name}</span>
                                    </div>
                                  </div>
                                )
                              })}

                              {/* Neutral bars: Possession, Shots, Attacks */}
                              {analysis.possession && (() => {
                                const h = analysis.possession.home || 50
                                const a = analysis.possession.away || 50
                                return (
                                  <div className="lma-metric">
                                    <div className="lma-label">POSSESSION</div>
                                    <div className="lma-bar-row">
                                      <span className="lma-pct lma-pct-neutral">{h}%</span>
                                      <div className="lma-track">
                                        <div className="lma-fill-home lma-neutral-possession" style={{ width: `${h}%` }} />
                                        <div className="lma-fill-away lma-neutral-possession-dim" style={{ width: `${a}%` }} />
                                      </div>
                                      <span className="lma-pct lma-pct-neutral">{a}%</span>
                                    </div>
                                  </div>
                                )
                              })()}

                              {analysis.shots && (() => {
                                const h = analysis.shots.home || 0
                                const a = analysis.shots.away || 0
                                const total = h + a || 1
                                const hp = Math.round((h / total) * 100)
                                return (
                                  <div className="lma-metric">
                                    <div className="lma-label">SHOTS</div>
                                    <div className="lma-bar-row">
                                      <span className="lma-pct lma-pct-neutral">{h}</span>
                                      <div className="lma-track">
                                        <div className="lma-fill-home lma-neutral-shots" style={{ width: `${hp}%` }} />
                                        <div className="lma-fill-away lma-neutral-shots-dim" style={{ width: `${100 - hp}%` }} />
                                      </div>
                                      <span className="lma-pct lma-pct-neutral">{a}</span>
                                    </div>
                                  </div>
                                )
                              })()}

                              <button className="full-analysis-btn" onClick={(e) => { e.stopPropagation(); handleMatchClick(match) }}>
                                Full Match Analysis
                              </button>
                            </div>
                          ) : (
                            <div className="lma-container lma-compact">
                              <div className="ft-summary">
                                {isFinished(match.status) ? (
                                  <span>Final Score: {match.goals?.home ?? 0} - {match.goals?.away ?? 0}</span>
                                ) : (
                                  <span>Match in progress</span>
                                )}
                              </div>
                              <button className="full-analysis-btn" onClick={(e) => { e.stopPropagation(); handleMatchClick(match) }}>
                                Full Match Analysis
                              </button>
                            </div>
                          )}

                          {/* Recent Events */}
                          {match.events && match.events.length > 0 && (
                            <div className="match-events-list">
                              {match.events.slice(-5).reverse().map((event, idx) => (
                                <div key={idx} className="event-row">
                                  <span className="event-time-badge">{event.time}'</span>
                                  <span className="event-type-icon">
                                    {event.type === 'Goal' ? '⚽' : event.type === 'Card' ? (event.detail === 'Red Card' ? '🟥' : '🟨') : event.type === 'subst' ? '🔄' : '📋'}
                                  </span>
                                  <span className="event-text">{event.player}</span>
                                  <span className="event-team-name">{event.team}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
