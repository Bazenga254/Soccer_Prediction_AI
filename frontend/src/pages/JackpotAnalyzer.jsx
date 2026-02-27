import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import { COMPETITIONS } from '../components/Header'
import { useCurrency } from '../context/CurrencyContext'
import { useCredits } from '../context/CreditContext'
import SEOHead from '../components/SEOHead'

function formatDate(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function groupByDate(fixtures) {
  const groups = {}
  fixtures.forEach(f => {
    const date = f.date.split('T')[0]
    if (!groups[date]) groups[date] = []
    groups[date].push(f)
  })
  return groups
}

// --- Countdown Timer for Jackpot Lock ---

function JackpotCountdownTimer({ resetAt, onExpire }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const target = new Date(resetAt + (resetAt.endsWith('Z') ? '' : 'Z'))
      const diff = target - now
      if (diff <= 0) {
        setTimeLeft('0h 0m 0s')
        onExpire?.()
        return
      }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${h}h ${m}m ${s}s`)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [resetAt, onExpire])

  return <strong className="analysis-countdown">{timeLeft}</strong>
}

// --- AI Chat Component ---

function MatchChatBox({ matchResult, isKenyan }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [chatLocked, setChatLocked] = useState(false)
  const [chatLimitInfo, setChatLimitInfo] = useState(null)
  const [topupLoading, setTopupLoading] = useState(false)
  const chatEndRef = useRef(null)

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      const res = await axios.post('/api/jackpot/chat', {
        message: userMsg,
        match_context: matchResult,
        chat_history: messages,
      })
      setMessages(prev => [...prev, { role: 'ai', content: res.data.response, sources: res.data.sources || [] }])
    } catch (err) {
      if (err.response?.status === 403) {
        setChatLocked(true)
        let detail = err.response.data.detail
        let parsed = null
        try { parsed = JSON.parse(detail) } catch {}
        if (parsed?.type === 'daily_limit') {
          setChatLimitInfo(parsed)
          setMessages(prev => [...prev, { role: 'ai', content: parsed.message, sources: [] }])
        } else {
          setMessages(prev => [...prev, { role: 'ai', content: detail || "You've reached your free AI chat limit. Upgrade to Pro for more access.", sources: [] }])
        }
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: 'Sorry, something went wrong. Please try again.', sources: [] }])
      }
    }
    setLoading(false)
  }

  const handleChatTopUp = async () => {
    setTopupLoading(true)
    try {
      const res = await axios.post('/api/balance/use-for-chat-topup', { currency: isKenyan ? 'KES' : 'USD' })
      if (res.data.success) {
        setChatLocked(false)
        setChatLimitInfo(null)
        setMessages(prev => [...prev, { role: 'ai', content: `+${res.data.prompts_added} chat prompts added! You can continue chatting.`, sources: [] }])
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Top-up failed. Please deposit funds first.'
      setMessages(prev => [...prev, { role: 'ai', content: msg, sources: [] }])
    }
    setTopupLoading(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const homeName = matchResult.home_team?.name || 'Home'
  const awayName = matchResult.away_team?.name || 'Away'

  return (
    <div className="jackpot-chat-section">
      <button
        className={`jackpot-chat-toggle ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{'\u{1F916}'} Ask AI about {homeName} vs {awayName}</span>
        <span className="jackpot-chat-toggle-arrow">{isOpen ? '\u25B2' : '\u25BC'}</span>
      </button>

      {isOpen && (
        <div className="jackpot-chat-box">
          <div className="jackpot-chat-messages">
            {messages.length === 0 && (
              <div className="jackpot-chat-welcome">
                <p>{'\u{1F916}'} Ask me anything about this match!</p>
                <div className="jackpot-chat-suggestions">
                  {[
                    `Who are the key players for ${homeName}?`,
                    `What's the tactical matchup?`,
                    `How will injuries affect this match?`,
                    `What's the most likely scoreline?`,
                  ].map((q, i) => (
                    <button key={i} className="jackpot-chat-suggestion" onClick={() => { setInput(q); }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`jackpot-chat-msg ${msg.role}`}>
                <span className="jackpot-chat-role">{msg.role === 'user' ? 'You' : 'AI Analyst'}</span>
                <p>{msg.content}</p>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="jackpot-chat-sources">
                    <span className="jackpot-chat-sources-label">{'\u{1F517}'} Sources:</span>
                    {msg.sources.map((src, j) => (
                      <a key={j} href={src.url} target="_blank" rel="noopener noreferrer" className="jackpot-chat-source-link">
                        {src.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="jackpot-chat-msg ai">
                <span className="jackpot-chat-role">AI Analyst</span>
                <p className="jackpot-chat-typing">Thinking...</p>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          {chatLocked ? (
            <div className="jackpot-chat-locked-bar">
              {chatLimitInfo ? (
                <>
                  <span>{'\u{1F512}'} Daily limit reached ({chatLimitInfo.daily_limit} prompts/day).</span>
                  <div className="chat-topup-actions">
                    <button className="chat-topup-btn" onClick={handleChatTopUp} disabled={topupLoading}>
                      {topupLoading ? 'Processing...' : `Get ${chatLimitInfo.topup_prompts} more (${isKenyan ? 'KES ' + chatLimitInfo.topup_price_kes : '$' + chatLimitInfo.topup_price_usd.toFixed(2)})`}
                    </button>
                    <Link to="/upgrade" className="jackpot-chat-upgrade-link">Deposit funds</Link>
                  </div>
                </>
              ) : (
                <>
                  <span>{'\u{1F512}'} Free AI prompts used up.</span>
                  <Link to="/upgrade" className="jackpot-chat-upgrade-link">{'\u{1F680}'} Upgrade to Pro</Link>
                </>
              )}
            </div>
          ) : (
            <div className="jackpot-chat-input-row">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about this match..."
                disabled={loading}
              />
              <button className="jackpot-chat-send-btn" onClick={sendMessage} disabled={loading || !input.trim()}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Sub-components ---

function MatchSelectionPhase({ selectedMatches, onAddMatch, onRemoveMatch, onStartAnalysis, maxMatches, tier }) {
  const [selectedLeague, setSelectedLeague] = useState('PL')
  const [fixtures, setFixtures] = useState([])
  const [loadingFixtures, setLoadingFixtures] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [allFixturesCache, setAllFixturesCache] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchRef = useRef(null)
  const navigate = useNavigate()
  const { t } = useTranslation()

  useEffect(() => {
    setLoadingFixtures(true)
    axios.get(`/api/fixtures?days=14&competition=${selectedLeague}`)
      .then(res => {
        setFixtures(res.data.fixtures || [])
        setLoadingFixtures(false)
      })
      .catch(() => {
        setFixtures([])
        setLoadingFixtures(false)
      })
  }, [selectedLeague])

  // Search across all leagues
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }
    const doSearch = async () => {
      let all = allFixturesCache
      if (!all) {
        setSearchLoading(true)
        try {
          const res = await axios.get('/api/fixtures/upcoming-all?days=7')
          all = res.data.fixtures || []
          setAllFixturesCache(all)
        } catch {
          all = []
        }
        setSearchLoading(false)
      }
      const q = searchQuery.toLowerCase()
      const filtered = all.filter(f =>
        (f.home_team?.name || '').toLowerCase().includes(q) ||
        (f.away_team?.name || '').toLowerCase().includes(q)
      ).slice(0, 10)
      setSearchResults(filtered)
    }
    doSearch()
  }, [searchQuery, allFixturesCache])

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchResults([])
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const isSelected = (fixtureId) => selectedMatches.some(m => m.fixture_id === fixtureId)

  const handleAdd = (fixture) => {
    if (isSelected(fixture.id)) {
      onRemoveMatch(fixture.id)
    } else {
      onAddMatch({
        fixture_id: fixture.id,
        home_team_id: fixture.home_team.id,
        away_team_id: fixture.away_team.id,
        home_team_name: fixture.home_team.name,
        away_team_name: fixture.away_team.name,
        home_team_crest: fixture.home_team.crest,
        away_team_crest: fixture.away_team.crest,
        competition: fixture.competition?.code || selectedLeague,
        match_date: fixture.date,
      })
    }
  }

  const handleSearchAdd = (fixture) => {
    handleAdd(fixture)
    setSearchQuery('')
    setSearchResults([])
  }

  const grouped = groupByDate(fixtures)
  const dates = Object.keys(grouped).sort()

  return (
    <>
      <div className="jackpot-header">
        <div className="jackpot-header-icon">{'\u{1F3AF}'}</div>
        <h2>{t('jackpot.title')}</h2>
        <p>Select matches from different leagues for AI-powered multi-match analysis</p>
        <div className="jackpot-tier-notice">
          <span>{perMatchCost} credits per match {selectedMatches.length > 0 && <>&bull; {selectedMatches.length} selected = <strong>{selectedMatches.length * perMatchCost} credits</strong></>}</span>
        </div>
      </div>

      <div className="jackpot-search-wrapper" ref={searchRef}>
        <div className="jackpot-search-bar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder="Search any team across all leagues..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="jackpot-search-input"
          />
          {searchQuery && (
            <button className="jackpot-search-clear" onClick={() => { setSearchQuery(''); setSearchResults([]) }}>&times;</button>
          )}
        </div>
        {searchLoading && searchQuery.trim().length >= 2 && (
          <div className="jackpot-search-dropdown">
            <div className="jackpot-search-loading">Searching...</div>
          </div>
        )}
        {!searchLoading && searchResults.length > 0 && (
          <div className="jackpot-search-dropdown">
            {searchResults.map(fixture => {
              const selected = isSelected(fixture.id)
              const atLimit = selectedMatches.length >= maxMatches && !selected
              return (
                <div
                  key={fixture.id}
                  className={`jackpot-search-result ${selected ? 'selected' : ''} ${atLimit ? 'disabled' : ''}`}
                  onClick={() => !atLimit && handleSearchAdd(fixture)}
                >
                  <div className="jackpot-search-result-teams">
                    {fixture.home_team.crest && <img src={fixture.home_team.crest} alt="" className="jackpot-search-crest" />}
                    <span>{fixture.home_team.name}</span>
                    <span className="jackpot-search-vs">vs</span>
                    <span>{fixture.away_team.name}</span>
                    {fixture.away_team.crest && <img src={fixture.away_team.crest} alt="" className="jackpot-search-crest" />}
                  </div>
                  <div className="jackpot-search-result-meta">
                    <span className="jackpot-search-time">{formatDate(fixture.date)} {formatTime(fixture.date)}</span>
                    {fixture.competition?.name && <span className="jackpot-search-league">{fixture.competition.name}</span>}
                  </div>
                  <span className={`jackpot-search-add ${selected ? 'added' : ''} ${atLimit ? 'disabled' : ''}`}>
                    {selected ? '\u2713' : atLimit ? 'Full' : '+'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {!searchLoading && searchQuery.trim().length >= 2 && searchResults.length === 0 && allFixturesCache && (
          <div className="jackpot-search-dropdown">
            <div className="jackpot-search-empty">No matches found for "{searchQuery}"</div>
          </div>
        )}
      </div>

      <div className="jackpot-league-tabs">
        {COMPETITIONS.map(comp => (
          <button
            key={comp.id}
            className={`jackpot-league-chip ${selectedLeague === comp.id ? 'active' : ''}`}
            onClick={() => setSelectedLeague(comp.id)}
          >
            <span className="chip-flag">{comp.flag}</span>
            <span className="chip-name">{comp.shortName}</span>
          </button>
        ))}
      </div>

      {loadingFixtures ? (
        <div className="jackpot-loading-fixtures">
          <div className="spinner"></div>
          <p>Loading fixtures...</p>
        </div>
      ) : fixtures.length === 0 ? (
        <div className="jackpot-no-fixtures">
          <p>No upcoming fixtures for this league in the next 14 days.</p>
        </div>
      ) : (
        <div className="jackpot-fixtures-list">
          {dates.map(date => (
            <div key={date} className="jackpot-date-group">
              <div className="jackpot-date-header">
                <span>{formatDate(date + 'T00:00:00')}</span>
                <span className="jackpot-date-count">{grouped[date].length} matches</span>
              </div>
              <div className="jackpot-fixtures-grid">
                {grouped[date].map(fixture => {
                  const selected = isSelected(fixture.id)
                  const atLimit = selectedMatches.length >= maxMatches && !selected
                  return (
                    <div
                      key={fixture.id}
                      className={`jackpot-fixture-card ${selected ? 'selected' : ''} ${atLimit ? 'disabled' : ''}`}
                      onClick={() => !atLimit && handleAdd(fixture)}
                    >
                      <div className="jackpot-fixture-time">{formatTime(fixture.date)}</div>
                      <div className="jackpot-fixture-teams">
                        <div className="jackpot-fixture-team">
                          {fixture.home_team.crest && (
                            <img src={fixture.home_team.crest} alt="" className="jackpot-crest" />
                          )}
                          <span>{fixture.home_team.name}</span>
                        </div>
                        <span className="jackpot-vs">vs</span>
                        <div className="jackpot-fixture-team">
                          <span>{fixture.away_team.name}</span>
                          {fixture.away_team.crest && (
                            <img src={fixture.away_team.crest} alt="" className="jackpot-crest" />
                          )}
                        </div>
                      </div>
                      <div className={`jackpot-add-btn ${selected ? 'added' : ''} ${atLimit ? 'disabled' : ''}`}>
                        {selected ? '\u2713 Added' : atLimit ? 'Limit reached' : '+ Add'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating analyze bar - shows when 2+ matches selected */}
      {selectedMatches.length >= 2 && (
        <div className="jackpot-floating-bar">
          <div className="jackpot-floating-info">
            <span className="jackpot-floating-count">{selectedMatches.length}/{maxMatches}</span>
            <span className="jackpot-floating-label">matches selected</span>
          </div>
          <button
            className="jackpot-floating-analyze-btn"
            onClick={onStartAnalysis}
          >
            {'\u{1F52E}'} Analyze {selectedMatches.length} Matches
          </button>
        </div>
      )}

      {/* Selected matches panel */}
      {selectedMatches.length > 0 && (
        <div className="jackpot-selected-panel">
          <div className="jackpot-selected-header">
            <span className="jackpot-selected-title">
              {'\u{1F3AF}'} Selected Matches
            </span>
            <span className="jackpot-selected-count">{selectedMatches.length}/{maxMatches}</span>
          </div>
          <div className="jackpot-selected-list">
            {selectedMatches.map(m => (
              <div key={m.fixture_id} className="jackpot-selected-item">
                <span className="jackpot-selected-match">
                  {m.home_team_name} vs {m.away_team_name}
                </span>
                <button
                  className="jackpot-remove-btn"
                  onClick={() => onRemoveMatch(m.fixture_id)}
                >{'\u2715'}</button>
              </div>
            ))}
          </div>
          <button
            className="jackpot-analyze-btn"
            onClick={onStartAnalysis}
            disabled={selectedMatches.length < 2}
          >
            {'\u{1F52E}'} {t('jackpot.analyze')} {selectedMatches.length} Match{selectedMatches.length !== 1 ? 'es' : ''}
          </button>
          {selectedMatches.length < 2 && (
            <p className="jackpot-min-hint">Select at least 2 matches to analyze</p>
          )}
        </div>
      )}
    </>
  )
}


function AnalysisPhase({ totalMatches }) {
  const { t } = useTranslation()
  return (
    <div className="jackpot-analyzing">
      <div className="jackpot-analyzing-spinner"></div>
      <h3>{t('jackpot.analyzing')}</h3>
      <p>Our AI is analyzing {totalMatches} matches...</p>
      <p className="jackpot-analyzing-sub">Checking H2H records, team form, injuries, coaching data, goals patterns, and more</p>
    </div>
  )
}


function CombinationCard({ combo, accentColor }) {
  if (!combo) return null
  return (
    <div className="jackpot-combination-card" style={{ borderColor: accentColor }}>
      <div className="jackpot-combo-header" style={{ background: accentColor }}>
        <span className="jackpot-combo-name">{combo.name}</span>
      </div>
      <p className="jackpot-combo-desc">{combo.description}</p>
      <div className="jackpot-combo-picks">
        {combo.picks.map((pick, i) => (
          <div key={i} className="jackpot-combo-pick">
            <span className="jackpot-combo-match">{pick.match}</span>
            <span className="jackpot-combo-pick-value">
              <span className="jackpot-combo-market">{pick.market}:</span> {pick.pick}
              <span className="jackpot-combo-prob">{pick.probability.toFixed(1)}%</span>
            </span>
          </div>
        ))}
      </div>
      <div className="jackpot-combo-total">
        Combined Probability: <strong>{combo.combined_probability.toFixed(4)}%</strong>
      </div>
    </div>
  )
}


function MatchResultCard({ result, index, isKenyan }) {
  const [expanded, setExpanded] = useState(false)

  if (result.status === 'failed') {
    return (
      <div className="jackpot-match-card failed">
        <div className="jackpot-match-header">
          <span className="jackpot-match-num">#{index + 1}</span>
          <span className="jackpot-match-teams-label">
            {result.home_team.name} vs {result.away_team.name}
          </span>
          <span className="jackpot-match-status-badge failed">Failed</span>
        </div>
      </div>
    )
  }

  const preds = result.predictions || {}
  const oneXTwo = preds['1x2'] || {}
  const dc = preds.double_chance || {}
  const factors = result.factors || {}
  const goalsAnalysis = result.goals_analysis
  const scoringByHalf = result.scoring_by_half

  return (
    <div className="jackpot-match-card">
      <div className="jackpot-match-header" onClick={() => setExpanded(!expanded)}>
        <span className="jackpot-match-num">#{index + 1}</span>
        <div className="jackpot-match-teams-info">
          <div className="jackpot-match-teams-label">
            {result.home_team.crest && <img src={result.home_team.crest} alt="" className="jackpot-mini-crest" />}
            <span>{result.home_team.name}</span>
            <span className="jackpot-match-vs">vs</span>
            <span>{result.away_team.name}</span>
            {result.away_team.crest && <img src={result.away_team.crest} alt="" className="jackpot-mini-crest" />}
          </div>
        </div>
        <div className="jackpot-match-rec">
          <span className="jackpot-rec-badge">{oneXTwo.recommended_label || '?'}</span>
          <span className={`jackpot-confidence ${(oneXTwo.confidence || '').toLowerCase()}`}>
            {oneXTwo.confidence}
          </span>
        </div>
        <span className="jackpot-expand-icon">{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {expanded && (
        <div className="jackpot-match-details">
          {/* 1X2 Probabilities */}
          <div className="jackpot-section">
            <h4>Match Result (1X2)</h4>
            <div className="jackpot-1x2-bars">
              <div className="jackpot-bar-row">
                <span className="jackpot-bar-label">{result.home_team.name}</span>
                <div className="jackpot-bar-track">
                  <div className="jackpot-bar-fill home" style={{ width: `${oneXTwo.home_win}%` }}>
                    {oneXTwo.home_win?.toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="jackpot-bar-row">
                <span className="jackpot-bar-label">Draw</span>
                <div className="jackpot-bar-track">
                  <div className="jackpot-bar-fill draw" style={{ width: `${oneXTwo.draw}%` }}>
                    {oneXTwo.draw?.toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="jackpot-bar-row">
                <span className="jackpot-bar-label">{result.away_team.name}</span>
                <div className="jackpot-bar-track">
                  <div className="jackpot-bar-fill away" style={{ width: `${oneXTwo.away_win}%` }}>
                    {oneXTwo.away_win?.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Double Chance */}
          <div className="jackpot-section">
            <h4>Double Chance</h4>
            <div className="jackpot-dc-grid">
              {['1X', 'X2', '12'].map(opt => (
                <div key={opt} className={`jackpot-dc-card ${dc.recommended === opt ? 'recommended' : ''}`}>
                  <span className="jackpot-dc-label">{opt}</span>
                  <span className="jackpot-dc-prob">{dc[opt]?.toFixed(1)}%</span>
                  {dc.recommended === opt && <span className="jackpot-dc-rec-tag">Best</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Goals Analysis */}
          {goalsAnalysis && (
            <div className="jackpot-section">
              <h4>{'\u26BD'} Goals Analysis</h4>
              <div className="jackpot-goals-grid">
                <div className="jackpot-goals-stat">
                  <span className="jackpot-goals-num">{goalsAnalysis.avg_total_goals}</span>
                  <span className="jackpot-goals-lbl">Avg Goals/Game</span>
                </div>
                <div className="jackpot-goals-stat">
                  <span className="jackpot-goals-num">{goalsAnalysis.avg_home_goals}</span>
                  <span className="jackpot-goals-lbl">{result.home_team.name} Avg</span>
                </div>
                <div className="jackpot-goals-stat">
                  <span className="jackpot-goals-num">{goalsAnalysis.avg_away_goals}</span>
                  <span className="jackpot-goals-lbl">{result.away_team.name} Avg</span>
                </div>
              </div>

              {/* Predicted Score */}
              {goalsAnalysis.scoring_prediction && (
                <div className="jackpot-predicted-score">
                  <span className="jackpot-predicted-label">Predicted Score:</span>
                  <span className="jackpot-predicted-value">{goalsAnalysis.scoring_prediction.predicted_score}</span>
                </div>
              )}

              {/* Over/Under */}
              <div className="jackpot-ou-grid">
                {Object.entries(goalsAnalysis.over_under || {}).map(([key, val]) => (
                  <div key={key} className={`jackpot-ou-item ${val.prediction === 'Yes' ? 'likely' : ''}`}>
                    <span className="jackpot-ou-label">{key.replace('_', ' ').replace('over ', 'O')}</span>
                    <span className="jackpot-ou-pct">{val.percentage}%</span>
                    <span className={`jackpot-ou-pred ${val.prediction === 'Yes' ? 'yes' : 'no'}`}>{val.prediction}</span>
                  </div>
                ))}
              </div>

              {/* BTTS */}
              {goalsAnalysis.btts && (
                <div className="jackpot-btts">
                  <span className="jackpot-btts-label">Both Teams To Score:</span>
                  <span className={`jackpot-btts-value ${goalsAnalysis.btts.prediction === 'Yes' ? 'yes' : 'no'}`}>
                    {goalsAnalysis.btts.prediction} ({goalsAnalysis.btts.yes_percentage}%)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Scoring By Half */}
          {scoringByHalf && (
            <div className="jackpot-section">
              <h4>{'\u{1F551}'} Scoring By Half</h4>
              <div className="jackpot-halves-grid">
                <div className="jackpot-half-card">
                  <span className="jackpot-half-title">1st Half</span>
                  <span className="jackpot-half-goals">~{scoringByHalf.first_half.avg_goals} goals</span>
                  <div className="jackpot-half-detail">
                    <span>Over 0.5: {scoringByHalf.first_half.over_05}%</span>
                    <span>Over 1.5: {scoringByHalf.first_half.over_15}%</span>
                  </div>
                </div>
                <div className="jackpot-half-card">
                  <span className="jackpot-half-title">2nd Half</span>
                  <span className="jackpot-half-goals">~{scoringByHalf.second_half.avg_goals} goals</span>
                  <div className="jackpot-half-detail">
                    <span>Over 0.5: {scoringByHalf.second_half.over_05}%</span>
                    <span>Over 1.5: {scoringByHalf.second_half.over_15}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* H2H */}
          {factors.h2h && factors.h2h.total_matches > 0 && (
            <div className="jackpot-section">
              <h4>Head to Head ({factors.h2h.total_matches} matches)</h4>
              <div className="jackpot-h2h-stats">
                <div className="jackpot-h2h-stat">
                  <span className="jackpot-h2h-num">{factors.h2h.home_wins}</span>
                  <span className="jackpot-h2h-lbl">{result.home_team.name} wins</span>
                </div>
                <div className="jackpot-h2h-stat">
                  <span className="jackpot-h2h-num">{factors.h2h.draws}</span>
                  <span className="jackpot-h2h-lbl">Draws</span>
                </div>
                <div className="jackpot-h2h-stat">
                  <span className="jackpot-h2h-num">{factors.h2h.away_wins}</span>
                  <span className="jackpot-h2h-lbl">{result.away_team.name} wins</span>
                </div>
              </div>
              {factors.h2h.home_goals != null && (
                <div className="jackpot-h2h-goals">
                  <span>{result.home_team.name}: {factors.h2h.home_goals} goals</span>
                  <span>{result.away_team.name}: {factors.h2h.away_goals} goals</span>
                </div>
              )}
            </div>
          )}

          {/* Form */}
          {(factors.form?.home_form || factors.form?.away_form) && (
            <div className="jackpot-section">
              <h4>Current Form</h4>
              <div className="jackpot-form-row">
                <span className="jackpot-form-team">{result.home_team.name}:</span>
                <div className="jackpot-form-badges">
                  {(factors.form.home_form || '').split('').map((r, i) => (
                    <span key={i} className={`jackpot-form-badge ${r === 'W' ? 'win' : r === 'D' ? 'draw' : 'loss'}`}>
                      {r}
                    </span>
                  ))}
                </div>
                <span className="jackpot-form-score">{factors.form.home_form_score?.toFixed(0)}%</span>
              </div>
              <div className="jackpot-form-row">
                <span className="jackpot-form-team">{result.away_team.name}:</span>
                <div className="jackpot-form-badges">
                  {(factors.form.away_form || '').split('').map((r, i) => (
                    <span key={i} className={`jackpot-form-badge ${r === 'W' ? 'win' : r === 'D' ? 'draw' : 'loss'}`}>
                      {r}
                    </span>
                  ))}
                </div>
                <span className="jackpot-form-score">{factors.form.away_form_score?.toFixed(0)}%</span>
              </div>
            </div>
          )}

          {/* Standings */}
          {factors.standings && (
            <div className="jackpot-section">
              <h4>{'\u{1F3C6}'} League Standings</h4>
              <div className="jackpot-standings-grid">
                <div className="jackpot-standings-team">
                  <span className="jackpot-standings-pos">#{factors.standings.home_position || '?'}</span>
                  <span className="jackpot-standings-name">{result.home_team.name}</span>
                  <span className="jackpot-standings-record">{factors.standings.home_record}</span>
                  <span className="jackpot-standings-pts">{factors.standings.home_points} pts (GD: {factors.standings.home_gd > 0 ? '+' : ''}{factors.standings.home_gd})</span>
                </div>
                <div className="jackpot-standings-team">
                  <span className="jackpot-standings-pos">#{factors.standings.away_position || '?'}</span>
                  <span className="jackpot-standings-name">{result.away_team.name}</span>
                  <span className="jackpot-standings-record">{factors.standings.away_record}</span>
                  <span className="jackpot-standings-pts">{factors.standings.away_points} pts (GD: {factors.standings.away_gd > 0 ? '+' : ''}{factors.standings.away_gd})</span>
                </div>
              </div>
            </div>
          )}

          {/* Motivation */}
          {factors.motivation && factors.motivation.home && (
            <div className="jackpot-section">
              <h4>{'\u{1F525}'} Team Motivation</h4>
              <div className="jackpot-motivation-grid">
                <div className="jackpot-motivation-item">
                  <span className="jackpot-motivation-team">{result.home_team.name}</span>
                  <span className={`jackpot-motivation-level ${factors.motivation.home.level?.toLowerCase()}`}>
                    {factors.motivation.home.level}
                  </span>
                  <span className="jackpot-motivation-note">{factors.motivation.home.note}</span>
                </div>
                <div className="jackpot-motivation-item">
                  <span className="jackpot-motivation-team">{result.away_team.name}</span>
                  <span className={`jackpot-motivation-level ${factors.motivation.away.level?.toLowerCase()}`}>
                    {factors.motivation.away.level}
                  </span>
                  <span className="jackpot-motivation-note">{factors.motivation.away.note}</span>
                </div>
              </div>
            </div>
          )}

          {/* Injuries */}
          {(factors.injuries?.home?.length > 0 || factors.injuries?.away?.length > 0) && (
            <div className="jackpot-section">
              <h4>{'\u{1F3E5}'} Injuries & Suspensions</h4>
              {factors.injury_impact && (
                <div className={`jackpot-injury-verdict ${factors.injury_impact.advantage}`}>
                  {factors.injury_impact.verdict}
                </div>
              )}
              {factors.injuries.home?.length > 0 && (
                <div className="jackpot-injury-group">
                  <span className="jackpot-injury-team">{result.home_team.name} ({factors.injuries.home.length}):</span>
                  {factors.injuries.home.map((inj, i) => (
                    <span key={i} className="jackpot-injury-item">
                      {inj.player} ({inj.reason || inj.type})
                    </span>
                  ))}
                </div>
              )}
              {factors.injuries.away?.length > 0 && (
                <div className="jackpot-injury-group">
                  <span className="jackpot-injury-team">{result.away_team.name} ({factors.injuries.away.length}):</span>
                  {factors.injuries.away.map((inj, i) => (
                    <span key={i} className="jackpot-injury-item">
                      {inj.player} ({inj.reason || inj.type})
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Coaches */}
          {(factors.coaches?.home || factors.coaches?.away) && (
            <div className="jackpot-section">
              <h4>{'\u{1F9D1}\u200D\u{1F3EB}'} Coaches</h4>
              <div className="jackpot-coaches">
                {factors.coaches.home && (
                  <div className="jackpot-coach">
                    {factors.coaches.home.photo && (
                      <img src={factors.coaches.home.photo} alt="" className="jackpot-coach-photo" />
                    )}
                    <div>
                      <strong>{factors.coaches.home.name}</strong>
                      <span className="jackpot-coach-team">{result.home_team.name}</span>
                    </div>
                  </div>
                )}
                {factors.coaches.away && (
                  <div className="jackpot-coach">
                    {factors.coaches.away.photo && (
                      <img src={factors.coaches.away.photo} alt="" className="jackpot-coach-photo" />
                    )}
                    <div>
                      <strong>{factors.coaches.away.name}</strong>
                      <span className="jackpot-coach-team">{result.away_team.name}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Insights */}
          {factors.ai_insights && (factors.ai_insights.motivation || factors.ai_insights.player_strength || factors.ai_insights.new_signings || factors.ai_insights.coaching_impact) && (
            <div className="jackpot-section jackpot-ai-section">
              <h4>{'\u{1F916}'} AI Insights</h4>
              {factors.ai_insights.motivation && (
                <div className="jackpot-ai-item">
                  <span className="jackpot-ai-label">Motivation:</span>
                  <span>{factors.ai_insights.motivation}</span>
                </div>
              )}
              {factors.ai_insights.player_strength && (
                <div className="jackpot-ai-item">
                  <span className="jackpot-ai-label">Key Players:</span>
                  <span>{factors.ai_insights.player_strength}</span>
                </div>
              )}
              {factors.ai_insights.new_signings && (
                <div className="jackpot-ai-item">
                  <span className="jackpot-ai-label">Transfers:</span>
                  <span>{factors.ai_insights.new_signings}</span>
                </div>
              )}
              {factors.ai_insights.coaching_impact && (
                <div className="jackpot-ai-item">
                  <span className="jackpot-ai-label">Coaching:</span>
                  <span>{factors.ai_insights.coaching_impact}</span>
                </div>
              )}
            </div>
          )}

          {/* Key Factors */}
          {result.key_factors?.length > 0 && (
            <div className="jackpot-section">
              <h4>Key Factors</h4>
              <ul className="jackpot-key-factors">
                {result.key_factors.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="jackpot-data-source">
            Data: <span className={`source-badge ${result.data_source}`}>{result.data_source?.toUpperCase()}</span>
          </div>

          {/* AI Chat */}
          <MatchChatBox matchResult={result} isKenyan={isKenyan} />
        </div>
      )}
    </div>
  )
}


function ResultsPhase({ results, combinations, onReset, isKenyan }) {
  const completed = results.filter(r => r.status === 'completed').length
  const failed = results.filter(r => r.status === 'failed').length
  const { t } = useTranslation()

  return (
    <div className="jackpot-results">
      <div className="jackpot-results-header">
        <h2>{'\u{1F3AF}'} {t('jackpot.results')}</h2>
        <p>{completed} match{completed !== 1 ? 'es' : ''} analyzed
          {failed > 0 ? `, ${failed} failed` : ''}
        </p>
        <button className="jackpot-new-btn" onClick={onReset}>
          {'\u{1F504}'} New Jackpot
        </button>
      </div>

      {/* Combination Cards */}
      {combinations && (
        <div className="jackpot-combinations">
          <h3>Recommended Combinations</h3>
          <div className="jackpot-combinations-grid">
            <CombinationCard combo={combinations.safest} accentColor="#22c55e" />
            <CombinationCard combo={combinations.balanced} accentColor="#3b82f6" />
            <CombinationCard combo={combinations.high_value} accentColor="#f59e0b" />
          </div>
        </div>
      )}

      {/* Individual Match Results */}
      <div className="jackpot-match-results">
        <h3>Match-by-Match Analysis</h3>
        {results.map((result, i) => (
          <MatchResultCard key={result.fixture_id || i} result={result} index={i} isKenyan={isKenyan} />
        ))}
      </div>
    </div>
  )
}


// --- Main Component ---

export default function JackpotAnalyzer() {
  const [phase, setPhase] = useState('select') // 'select' | 'analyzing' | 'results'
  const [selectedMatches, setSelectedMatches] = useState([])
  const [analysisResults, setAnalysisResults] = useState([])
  const [combinations, setCombinations] = useState(null)
  const [error, setError] = useState(null)
  const [maxMatches, setMaxMatches] = useState(5)
  const [tier, setTier] = useState('free')
  const [sessionsUsed, setSessionsUsed] = useState(0)
  const [maxSessions, setMaxSessions] = useState(2)
  const [limitsLoaded, setLimitsLoaded] = useState(false)
  const [perMatchCost, setPerMatchCost] = useState(130)
  const [lockedUntil, setLockedUntil] = useState(null)
  const [isLocked, setIsLocked] = useState(false)
  const { t } = useTranslation()
  const { isKenyan } = useCurrency()
  const { totalCredits, refreshCredits } = useCredits()

  // Fetch tier limits on mount
  useEffect(() => {
    axios.get('/api/jackpot/limits')
      .then(res => {
        setMaxMatches(res.data.max_matches || 5)
        setTier(res.data.tier || 'free')
        setSessionsUsed(res.data.sessions_used || 0)
        setMaxSessions(res.data.max_sessions ?? 2)
        setPerMatchCost(res.data.per_match_cost || 130)
        setLockedUntil(res.data.locked_until || null)
        setIsLocked(res.data.locked || false)
        setLimitsLoaded(true)
      })
      .catch(() => {
        setMaxMatches(5)
        setTier('free')
        setLimitsLoaded(true)
      })
  }, [])

  const addMatch = (match) => {
    if (selectedMatches.length >= maxMatches) return
    if (selectedMatches.some(m => m.fixture_id === match.fixture_id)) return
    setSelectedMatches(prev => [...prev, match])
  }

  const removeMatch = (fixtureId) => {
    setSelectedMatches(prev => prev.filter(m => m.fixture_id !== fixtureId))
  }

  const startAnalysis = async () => {
    setPhase('analyzing')
    setError(null)

    try {
      const res = await axios.post('/api/jackpot/analyze', { matches: selectedMatches })
      setAnalysisResults(res.data.results || [])
      setCombinations(res.data.combinations || null)
      setPhase('results')
      // Refresh credit badge in header
      refreshCredits()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Analysis failed. Please try again.'
      setError(msg)
      setPhase('select')
    }
  }

  const resetJackpot = () => {
    setPhase('select')
    setSelectedMatches([])
    setAnalysisResults([])
    setCombinations(null)
    setError(null)
  }

  return (
    <div className="jackpot-page">
      <SEOHead
        title="Jackpot & Accumulator Analyzer — AI-Powered Multi-Bet Predictions"
        description="Boost your jackpot and accumulator bets with AI analysis. Select fixtures, get probability-weighted predictions, and optimize your multi-bet strategy."
        path="/jackpot"
      />
      {error && (
        <div className="jackpot-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>{'\u2715'}</button>
        </div>
      )}

      {phase === 'select' && isLocked && (
        <div className="jackpot-locked-overlay">
          <div className="jackpot-locked-icon">{"⚡"}</div>
          <h2 className="jackpot-locked-title">Insufficient Credits</h2>
          <p className="jackpot-locked-text">
            You need at least <strong>{perMatchCost * 2} credits</strong> for a jackpot analysis ({perMatchCost} credits per match, minimum 2 matches).
            You currently have <strong>{totalCredits} credits</strong>.
          </p>
          <Link to="/upgrade" className="jackpot-locked-upgrade-btn">
            {"⚡"} Add Credits
          </Link>
          <Link to="/my-analysis" className="jackpot-locked-history-link">
            View your past analyses
          </Link>
        </div>
      )}

      {phase === 'select' && !isLocked && (
        <MatchSelectionPhase
          selectedMatches={selectedMatches}
          onAddMatch={addMatch}
          onRemoveMatch={removeMatch}
          onStartAnalysis={startAnalysis}
          maxMatches={maxMatches}
          tier={tier}
        />
      )}

      {phase === 'analyzing' && (
        <AnalysisPhase totalMatches={selectedMatches.length} />
      )}

      {phase === 'results' && (
        <ResultsPhase
          results={analysisResults}
          combinations={combinations}
          onReset={resetJackpot}
          isKenyan={isKenyan}
        />
      )}
    </div>
  )
}
