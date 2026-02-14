import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import MpesaPaymentModal from '../components/MpesaPaymentModal'
import { COMPETITIONS } from '../components/Header'

const SORT_OPTIONS = [
  { value: 'best', label: 'Best', icon: '\u{1F3C6}' },
  { value: 'new', label: 'New', icon: '\u{1F195}' },
  { value: 'top_rated', label: 'Top Rated', icon: '\u2B50' },
  { value: 'hot', label: 'Hot', icon: '\u{1F525}' },
]

function StarRating({ rating, onRate, interactive = false }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map(star => (
        <span
          key={star}
          className={`star ${star <= (hover || rating) ? 'filled' : ''} ${interactive ? 'clickable' : ''}`}
          onClick={() => interactive && onRate && onRate(star)}
          onMouseEnter={() => interactive && setHover(star)}
          onMouseLeave={() => interactive && setHover(0)}
        >
          {'\u2605'}
        </span>
      ))}
    </div>
  )
}

const CHAT_EMOJIS = [
  '\u26BD', '\u{1F945}', '\u{1F3C6}', '\u{1F525}', '\u{1F4AA}', '\u{1F44F}', '\u{1F3AF}', '\u{1F44D}', '\u{1F44E}',
  '\u{1F602}', '\u{1F62D}', '\u{1F64F}', '\u2764\uFE0F', '\u{1F4AF}', '\u{1F914}', '\u{1F60D}', '\u{1F923}', '\u{1F480}',
  '\u{1F624}', '\u{1FAE1}', '\u{1F389}', '\u{1F60E}', '\u{1F91D}', '\u{1F4B0}', '\u2B50', '\u{1F680}', '\u{1F631}',
]

function EmojiPicker({ onSelect }) {
  return (
    <div className="emoji-picker" onClick={e => e.stopPropagation()}>
      <div className="emoji-picker-grid">
        {CHAT_EMOJIS.map(emoji => (
          <button key={emoji} className="emoji-picker-btn" onClick={() => onSelect(emoji)} type="button">
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

function LiveChat({ predictionId }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [chatCount, setChatCount] = useState(0)
  const [showEmoji, setShowEmoji] = useState(false)
  const lastIdRef = useRef(0)
  const chatEndRef = useRef(null)
  const intervalRef = useRef(null)
  const inputRef = useRef(null)

  const fetchMessages = async (sinceId = 0) => {
    try {
      const res = await axios.get(`/api/community/${predictionId}/chat?since_id=${sinceId}`)
      const msgs = res.data.messages || []
      if (sinceId === 0) {
        setMessages(msgs)
        setChatCount(msgs.length)
      } else if (msgs.length > 0) {
        setMessages(prev => [...prev, ...msgs])
        setChatCount(prev => prev + msgs.length)
      }
      if (msgs.length > 0) {
        lastIdRef.current = msgs[msgs.length - 1].id
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (expanded) {
      lastIdRef.current = 0
      fetchMessages(0)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [expanded])

  useEffect(() => {
    if (expanded) {
      intervalRef.current = setInterval(() => {
        fetchMessages(lastIdRef.current)
      }, 3000)
      return () => clearInterval(intervalRef.current)
    }
  }, [expanded])

  useEffect(() => {
    if (expanded && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, expanded])

  const handleSend = async () => {
    if (!newMsg.trim()) return
    setSending(true)
    setShowEmoji(false)
    try {
      const res = await axios.post(`/api/community/${predictionId}/chat`, { message: newMsg })
      if (res.data.success) {
        setMessages(prev => [...prev, res.data.chat])
        lastIdRef.current = res.data.chat.id
        setNewMsg('')
        setChatCount(prev => prev + 1)
      }
    } catch { /* ignore */ }
    setSending(false)
  }

  const handleEmojiSelect = (emoji) => {
    setNewMsg(prev => prev + emoji)
    inputRef.current?.focus()
  }

  const formatTime = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="live-chat-section">
      <button className="live-chat-toggle" onClick={() => setExpanded(!expanded)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>{expanded ? 'Hide Chat' : 'Live Chat'}</span>
        {chatCount > 0 && !expanded && <span className="chat-count-badge">{chatCount}</span>}
        {expanded && <span className="live-dot"></span>}
      </button>

      {expanded && (
        <div className="live-chat-panel">
          <div className="live-chat-messages">
            {messages.length === 0 && (
              <p className="chat-empty">No messages yet. Start the conversation!</p>
            )}
            {messages.map(m => (
              <div key={m.id} className={`chat-bubble ${m.user_id === user?.id ? 'own' : ''}`}>
                <span className="chat-avatar" style={{ background: m.avatar_color }}>
                  {(m.display_name || '?')[0].toUpperCase()}
                </span>
                <div className="chat-bubble-content">
                  <div className="chat-bubble-header">
                    <strong>{m.display_name}</strong>
                    <span className="chat-time">{formatTime(m.created_at)}</span>
                  </div>
                  <p className="chat-text">{m.message}</p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="live-chat-input">
            <button className="emoji-toggle-btn" onClick={() => setShowEmoji(!showEmoji)} type="button" title="Emojis">
              {'\u{1F600}'}
            </button>
            {showEmoji && <EmojiPicker onSelect={handleEmojiSelect} />}
            <input
              ref={inputRef}
              type="text"
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              placeholder="Type a message..."
              maxLength={500}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              disabled={sending}
            />
            <button className="chat-send-btn" onClick={handleSend} disabled={sending || !newMsg.trim()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ReactionButtons({ predictionId, initialLikes = 0, initialDislikes = 0, onLiked }) {
  const { user } = useAuth()
  const [likes, setLikes] = useState(initialLikes)
  const [dislikes, setDislikes] = useState(initialDislikes)
  const [userReaction, setUserReaction] = useState(null)

  const handleReact = async (reaction) => {
    if (!user) return
    try {
      const res = await axios.post(`/api/community/${predictionId}/react`, { reaction })
      if (res.data.success) {
        setLikes(res.data.likes)
        setDislikes(res.data.dislikes)
        setUserReaction(res.data.user_reaction)
        if (res.data.user_reaction === 'like' && onLiked) onLiked()
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="reaction-buttons">
      <button
        className={`reaction-btn like ${userReaction === 'like' ? 'active' : ''}`}
        onClick={() => handleReact('like')}
        title="Like"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={userReaction === 'like' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
        </svg>
        <span>{likes}</span>
      </button>
      <button
        className={`reaction-btn dislike ${userReaction === 'dislike' ? 'active' : ''}`}
        onClick={() => handleReact('dislike')}
        title="Dislike"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={userReaction === 'dislike' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
        </svg>
        <span>{dislikes}</span>
      </button>
    </div>
  )
}

function FollowPromptModal({ userId, displayName, avatarColor, onClose, onFollowed }) {
  const handleFollow = async () => {
    try {
      const res = await axios.post(`/api/community/follow/${userId}`)
      if (res.data.success) onFollowed()
    } catch { /* ignore */ }
    onClose()
  }
  return (
    <div className="follow-prompt-overlay" onClick={onClose}>
      <div className="follow-prompt-modal" onClick={e => e.stopPropagation()}>
        <div className="follow-prompt-avatar" style={{ background: avatarColor }}>
          {(displayName || '?')[0].toUpperCase()}
        </div>
        <h3>Like their predictions?</h3>
        <p>Follow <strong>{displayName}</strong> to get notified when they post new predictions.</p>
        <div className="follow-prompt-actions">
          <button className="follow-prompt-btn primary" onClick={handleFollow}>Follow</button>
          <button className="follow-prompt-btn secondary" onClick={onClose}>Not now</button>
        </div>
      </div>
    </div>
  )
}

function PredictionCard({ pred, onRate, onPurchase }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isOwn = user?.id === pred.user_id
  const [showMpesa, setShowMpesa] = useState(false)
  const [showFollowPrompt, setShowFollowPrompt] = useState(false)
  const [followState, setFollowState] = useState({
    isFollowing: false,
    followersCount: pred.followers_count || 0,
    loaded: false,
  })

  useEffect(() => {
    if (!user || isOwn) return
    let cancelled = false
    const checkFollow = async () => {
      try {
        const res = await axios.get(`/api/community/follow-status/${pred.user_id}`)
        if (!cancelled) {
          setFollowState({
            isFollowing: res.data.is_following,
            followersCount: res.data.followers_count,
            loaded: true,
          })
        }
      } catch { /* ignore */ }
    }
    checkFollow()
    return () => { cancelled = true }
  }, [pred.user_id, user, isOwn])

  const handleFollow = async (e) => {
    e.stopPropagation()
    if (isOwn) return
    if (!user) {
      navigate('/login')
      return
    }
    try {
      if (followState.isFollowing) {
        const res = await axios.delete(`/api/community/follow/${pred.user_id}`)
        if (res.data.success) setFollowState(s => ({ ...s, isFollowing: false, followersCount: res.data.followers_count }))
      } else {
        const res = await axios.post(`/api/community/follow/${pred.user_id}`)
        if (res.data.success) setFollowState(s => ({ ...s, isFollowing: true, followersCount: res.data.followers_count }))
      }
    } catch { /* ignore */ }
  }

  const handleCardClick = (e) => {
    // Don't navigate if clicking on interactive elements
    if (e.target.closest('button, a, .live-chat-section, .reaction-buttons, .star-rating, input')) return
    // Parse fixture_id: "homeId-awayId-YYYYMMDD"
    const parts = (pred.fixture_id || '').split('-')
    if (parts.length >= 2) {
      const homeId = parts[0]
      const awayId = parts[1]
      const comp = pred.competition_code || 'PL'
      navigate(`/match/${comp}/${homeId}/${awayId}`, { state: { from: 'predictions' } })
    }
  }

  const handleRate = async (rating) => {
    try {
      const res = await axios.post(`/api/community/${pred.id}/rate`, { rating })
      if (res.data.success) {
        onRate(pred.id, res.data.avg_rating, res.data.rating_count)
      }
    } catch { /* ignore */ }
  }

  const handlePaymentSuccess = () => {
    setShowMpesa(false)
    if (onPurchase) onPurchase(pred.id)
    if (!isOwn && !followState.isFollowing && followState.loaded) {
      setTimeout(() => setShowFollowPrompt(true), 500)
    }
  }

  const isPaidLocked = pred.is_paid && !pred.unlocked

  return (
    <div className={`community-card ${pred.is_paid ? 'paid-card' : ''}`} onClick={handleCardClick} style={{ cursor: 'pointer' }}>
      <div className="community-card-top">
        {pred.rank && (
          <div className="prediction-rank-number">
            <span>{pred.rank}</span>
          </div>
        )}

        <div className="community-card-left">
          <div className="predictor-info">
            <span className="predictor-avatar" style={{ background: pred.avatar_color }}>
              {(pred.display_name || pred.username || '?')[0].toUpperCase()}
            </span>
            <div>
              <div className="predictor-name-row">
                <strong className="predictor-name">{pred.display_name}</strong>
                {pred.predictor_accuracy != null && (
                  <span className={`predictor-accuracy-badge ${pred.predictor_accuracy >= 60 ? 'good' : pred.predictor_accuracy >= 40 ? 'average' : 'low'}`}>
                    {pred.predictor_accuracy}%
                  </span>
                )}
              </div>
              <div className="predictor-follow-row">
                <span className="predictor-username">@{pred.username}</span>
              </div>
            </div>
          </div>
          <div className="community-match">
            <span className="community-teams">{pred.team_a_name} vs {pred.team_b_name}</span>
            {pred.competition && <span className="community-comp">{pred.competition}</span>}
          </div>
        </div>

        <div className="community-card-center">
          {isPaidLocked ? (
            <div className="locked-prediction-inline">
              <span className="locked-icon-sm">{'\u{1F512}'}</span>
              <span className="locked-text-sm">Premium</span>
              {!isOwn && (
                <button className="unlock-btn-sm" onClick={() => setShowMpesa(true)}>
                  Unlock ${pred.price_usd}
                </button>
              )}
            </div>
          ) : (
            <div className="community-picks">
              <div className="pick-item main-pick">
                <span className="pick-label">Prediction</span>
                <span className="pick-value">{pred.predicted_result}</span>
                {pred.predicted_result_prob > 0 && (
                  <span className="pick-prob">{Math.round(pred.predicted_result_prob)}%</span>
                )}
              </div>
              {pred.predicted_over25 && (
                <div className="pick-item">
                  <span className="pick-label">O/U 2.5</span>
                  <span className="pick-value">{pred.predicted_over25}</span>
                </div>
              )}
              {pred.predicted_btts && (
                <div className="pick-item">
                  <span className="pick-label">BTTS</span>
                  <span className="pick-value">{pred.predicted_btts}</span>
                </div>
              )}
              {pred.best_value_bet && (
                <div className="pick-item value-pick">
                  <span className="pick-label">Best Value</span>
                  <span className="pick-value">{pred.best_value_bet}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="community-card-right">
          <span className="community-time">{new Date(pred.created_at).toLocaleDateString()}</span>
          {pred.is_paid && (
            <span className={`paid-badge ${pred.unlocked ? 'unlocked' : ''}`}>
              {pred.unlocked ? 'UNLOCKED' : `$${pred.price_usd}`}
            </span>
          )}
          {pred.match_finished && (
            <div className={`community-result ${pred.result_correct ? 'correct' : 'incorrect'}`}>
              {pred.result_correct ? 'Correct' : 'Incorrect'}
            </div>
          )}
          <div className="rating-section">
            <StarRating
              rating={Math.round(pred.avg_rating)}
              interactive={!isOwn && !isPaidLocked}
              onRate={handleRate}
            />
            <span className="rating-text">
              {pred.avg_rating > 0 ? `${pred.avg_rating}` : '0'} ({pred.rating_count})
            </span>
          </div>
        </div>
      </div>

      {!isPaidLocked && pred.analysis_summary && (
        <p className="community-summary">{pred.analysis_summary}</p>
      )}

      {!isOwn && (
        <div className="community-card-follow-bar">
          <button
            className={`follow-bar-btn ${followState.isFollowing ? 'following' : ''}`}
            onClick={handleFollow}
          >
            {followState.isFollowing ? (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg> Following</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Follow {pred.display_name?.split(' ')[0]}</>
            )}
          </button>
          {followState.followersCount > 0 && (
            <span className="follow-bar-count">{followState.followersCount} follower{followState.followersCount !== 1 ? 's' : ''}</span>
          )}
        </div>
      )}

      <div className="community-card-footer">
        <ReactionButtons
          predictionId={pred.id}
          initialLikes={pred.likes || 0}
          initialDislikes={pred.dislikes || 0}
          onLiked={() => {
            if (!isOwn && user && !followState.isFollowing && followState.loaded) {
              setShowFollowPrompt(true)
            }
          }}
        />
        {!isPaidLocked && <LiveChat predictionId={pred.id} />}
      </div>

      {showMpesa && (
        <MpesaPaymentModal
          isOpen={showMpesa}
          onClose={() => setShowMpesa(false)}
          onSuccess={handlePaymentSuccess}
          amountUsd={pred.price_usd}
          transactionType="prediction_purchase"
          referenceId={String(pred.id)}
          title="Unlock Prediction"
          description={`${pred.team_a_name} vs ${pred.team_b_name}`}
        />
      )}

      {showFollowPrompt && (
        <FollowPromptModal
          userId={pred.user_id}
          displayName={pred.display_name}
          avatarColor={pred.avatar_color}
          onClose={() => setShowFollowPrompt(false)}
          onFollowed={() => setFollowState(s => ({ ...s, isFollowing: true, followersCount: s.followersCount + 1 }))}
        />
      )}
    </div>
  )
}

function formatFixtureDate(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatFixtureTime(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function groupFixturesByDate(fixtures) {
  const groups = {}
  fixtures.forEach(f => {
    const date = f.date.split('T')[0]
    if (!groups[date]) groups[date] = []
    groups[date].push(f)
  })
  return groups
}

function UpcomingMatchesTab() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [selectedLeague, setSelectedLeague] = useState('PL')
  const [fixtures, setFixtures] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const MATCHES_PER_PAGE = 20
  const isPro = user?.tier === 'pro'

  useEffect(() => {
    const fetchFixtures = async () => {
      setLoading(true)
      setMessage('')
      try {
        const res = await axios.get(`/api/fixtures?competition=${selectedLeague}&days=14`)
        setFixtures(res.data.fixtures || [])
        if (res.data.message) setMessage(res.data.message)
      } catch { setFixtures([]) }
      setLoading(false)
    }
    fetchFixtures()
    setCurrentPage(1)
    setSearchQuery('')
  }, [selectedLeague])

  // Filter fixtures by search query
  const filteredFixtures = fixtures.filter(f => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (f.home_team?.name || '').toLowerCase().includes(q) ||
      (f.away_team?.name || '').toLowerCase().includes(q)
    )
  })

  // Flatten all fixtures for pagination
  const allFixturesSorted = [...filteredFixtures].sort((a, b) => new Date(a.date) - new Date(b.date))
  const totalPages = Math.max(1, Math.ceil(allFixturesSorted.length / MATCHES_PER_PAGE))
  const paginatedFixtures = allFixturesSorted.slice((currentPage - 1) * MATCHES_PER_PAGE, currentPage * MATCHES_PER_PAGE)

  // Group paginated fixtures by date
  const grouped = groupFixturesByDate(paginatedFixtures)
  const sortedDates = Object.keys(grouped).sort()

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="upcoming-matches-section">
      <div className="league-selector">
        {COMPETITIONS.map(comp => (
          <button
            key={comp.id}
            className={`league-chip ${selectedLeague === comp.id ? 'active' : ''}`}
            onClick={() => { setSelectedLeague(comp.id); setCurrentPage(1) }}
          >
            <span className="league-chip-flag">{comp.flag}</span>
            <span className="league-chip-name">{comp.shortName}</span>
          </button>
        ))}
      </div>

      <div className="upcoming-search-bar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          type="text"
          placeholder="Search by team name..."
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1) }}
          className="upcoming-search-input"
        />
        {searchQuery && (
          <button className="upcoming-search-clear" onClick={() => { setSearchQuery(''); setCurrentPage(1) }}>&times;</button>
        )}
      </div>

      {message && <p className="upcoming-notice">{message}</p>}

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading fixtures...</p>
        </div>
      ) : filteredFixtures.length === 0 ? (
        <div className="empty-community">
          {searchQuery ? (
            <p>No matches found for "{searchQuery}"</p>
          ) : (
            <>
              <p>No upcoming matches found for {COMPETITIONS.find(c => c.id === selectedLeague)?.name || selectedLeague}.</p>
              <p className="empty-hint">Try another league or check back later.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="upcoming-match-count">
            Showing {(currentPage - 1) * MATCHES_PER_PAGE + 1}-{Math.min(currentPage * MATCHES_PER_PAGE, filteredFixtures.length)} of {filteredFixtures.length} matches
          </div>
          <div className="upcoming-fixtures-list">
            {sortedDates.map(date => (
              <div key={date} className="upcoming-date-group">
                <div className="upcoming-date-header">
                  <span>{formatFixtureDate(date + 'T00:00:00')}</span>
                  <span className="upcoming-date-count">{grouped[date].length} match{grouped[date].length !== 1 ? 'es' : ''}</span>
                </div>
                <div className="upcoming-fixtures-grid">
                  {grouped[date].map(fixture => {
                    const matchStarted = fixture.status && fixture.status !== 'NS' && fixture.status !== 'TBD'
                    return (
                      <div
                        key={fixture.id}
                        className={`upcoming-fixture-card ${matchStarted ? 'match-started' : ''} ${!isPro && !matchStarted ? 'pro-gated' : ''}`}
                        onClick={() => {
                          if (matchStarted) return
                          if (!isPro) {
                            navigate('/upgrade', { state: { from: 'predictions' } })
                            return
                          }
                          navigate(`/match/${selectedLeague}/${fixture.home_team.id}/${fixture.away_team.id}`, { state: { from: 'predictions' } })
                        }}
                      >
                        <div className="upcoming-fixture-time">
                          {matchStarted ? <span className="match-started-badge">Started</span> : formatFixtureTime(fixture.date)}
                        </div>
                        <div className="upcoming-fixture-teams">
                          <div className="upcoming-team home">
                            {fixture.home_team.crest && <img src={fixture.home_team.crest} alt="" className="upcoming-team-crest" />}
                            <span>{fixture.home_team.name}</span>
                          </div>
                          <span className="upcoming-vs">vs</span>
                          <div className="upcoming-team away">
                            <span>{fixture.away_team.name}</span>
                            {fixture.away_team.crest && <img src={fixture.away_team.crest} alt="" className="upcoming-team-crest" />}
                          </div>
                        </div>
                        <div className={`upcoming-analyze-btn ${!isPro && !matchStarted ? 'pro-only' : ''}`}>
                          {matchStarted ? 'Started' : isPro ? 'Analyze' : 'Pro Only'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="upcoming-pagination">
              <button
                className="upcoming-page-btn"
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(currentPage - 1)}
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  className={`upcoming-page-btn ${p === currentPage ? 'active' : ''}`}
                  onClick={() => handlePageChange(p)}
                >
                  {p}
                </button>
              ))}
              <button
                className="upcoming-page-btn"
                disabled={currentPage >= totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const LIVE_PREDICTION_TYPES = [
  { value: 'match_winner', label: 'Match Winner', options: ['Home Win', 'Draw', 'Away Win'] },
  { value: 'next_goal', label: 'Next Goal', options: ['Home Team', 'Away Team', 'No More Goals'] },
  { value: 'total_goals', label: 'Total Goals', options: ['Over 0.5', 'Over 1.5', 'Over 2.5', 'Over 3.5', 'Under 1.5', 'Under 2.5', 'Under 3.5'] },
  { value: 'btts', label: 'Both Teams Score', options: ['Yes', 'No'] },
]

function LiveBetsTab() {
  const { user } = useAuth()
  const [liveMatches, setLiveMatches] = useState([])
  const [livePredictions, setLivePredictions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [predictionType, setPredictionType] = useState('match_winner')
  const [predictionValue, setPredictionValue] = useState('')
  const [confidence, setConfidence] = useState(50)
  const [submitting, setSubmitting] = useState(false)
  const [analysisNotes, setAnalysisNotes] = useState('')
  const [submitMsg, setSubmitMsg] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const formRef = useRef(null)

  const fetchLive = useCallback(async () => {
    try {
      const [matchRes, predRes] = await Promise.all([
        axios.get('/api/live-matches'),
        axios.get('/api/community/live-predictions'),
      ])
      setLiveMatches((matchRes.data.matches || []).filter(m =>
        ['1H', '2H', 'HT', 'ET', 'LIVE'].includes(m.status)
      ))
      setLivePredictions(predRes.data.predictions || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchLive()
    const interval = setInterval(fetchLive, 30000)
    return () => clearInterval(interval)
  }, [fetchLive])

  const handleSubmitLiveBet = async () => {
    if (!selectedMatch || !predictionValue || !user) return
    setSubmitting(true)
    setSubmitMsg('')
    try {
      const res = await axios.post('/api/community/live-bet', {
        predictions: [{
          fixture_id: selectedMatch.id,
          match_name: `${selectedMatch.home_team.name} vs ${selectedMatch.away_team.name}`,
          prediction_type: LIVE_PREDICTION_TYPES.find(t => t.value === predictionType)?.label || predictionType,
          prediction_value: predictionValue,
          confidence,
          analysis_notes: analysisNotes,
        }],
        visibility: 'public',
      })
      if (res.data.success) {
        setSubmitMsg('Live prediction submitted!')
        setSelectedMatch(null)
        setPredictionValue('')
        setConfidence(50)
        setAnalysisNotes('')
        fetchLive()
        setTimeout(() => setSubmitMsg(''), 3000)
      }
    } catch { setSubmitMsg('Failed to submit. Try again.') }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading live matches...</p>
      </div>
    )
  }

  return (
    <div className="live-bets-section">
      <div className="live-bets-strip-header">
        <span className="live-pulse-dot"></span>
        <span>Live Matches ({liveMatches.length})</span>
      </div>

      {liveMatches.length > 0 && (
        <div className="live-search-bar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder="Search live matches by team or league..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="live-search-input"
          />
          {searchQuery && (
            <button className="live-search-clear" onClick={() => setSearchQuery('')}>&times;</button>
          )}
        </div>
      )}

      {liveMatches.length === 0 ? (
        <div className="empty-community">
          <p>No live matches right now.</p>
          <p className="empty-hint">Live matches will appear here when games are being played.</p>
        </div>
      ) : (
        <div className="live-bets-match-grid">
          {liveMatches
            .filter(m => {
              if (!searchQuery.trim()) return true
              const q = searchQuery.toLowerCase()
              return (
                (m.home_team?.name || '').toLowerCase().includes(q) ||
                (m.away_team?.name || '').toLowerCase().includes(q) ||
                (m.competition?.name || '').toLowerCase().includes(q)
              )
            })
            .map(match => (
            <div
              key={match.id}
              className={`live-bet-match-card ${selectedMatch?.id === match.id ? 'selected' : ''}`}
              onClick={() => {
                const newMatch = selectedMatch?.id === match.id ? null : match
                setSelectedMatch(newMatch)
                if (newMatch) setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
              }}
            >
              <div className="live-bet-card-left">
                <div className="live-bet-match-status">
                  <span className="live-indicator-dot"></span>
                  <span>{match.elapsed || match.status}'</span>
                </div>
                <div className="live-bet-competition">
                  {match.competition?.name || ''}
                </div>
              </div>
              <div className="live-bet-card-center">
                <div className="live-bet-team home">
                  {match.home_team?.crest && <img src={match.home_team.crest} alt="" className="live-bet-crest" />}
                  <span>{match.home_team?.name}</span>
                </div>
                <div className="live-bet-score">
                  {match.goals?.home ?? 0} - {match.goals?.away ?? 0}
                </div>
                <div className="live-bet-team away">
                  {match.away_team?.crest && <img src={match.away_team.crest} alt="" className="live-bet-crest" />}
                  <span>{match.away_team?.name}</span>
                </div>
              </div>
              <div className="live-bet-card-right">
                <button className="live-bet-predict-btn">
                  {selectedMatch?.id === match.id ? 'Selected' : 'Predict'}
                </button>
              </div>
            </div>
          ))}
          {liveMatches.filter(m => {
            if (!searchQuery.trim()) return true
            const q = searchQuery.toLowerCase()
            return (m.home_team?.name || '').toLowerCase().includes(q) || (m.away_team?.name || '').toLowerCase().includes(q) || (m.competition?.name || '').toLowerCase().includes(q)
          }).length === 0 && (
            <div className="empty-community">
              <p>No matches found for "{searchQuery}"</p>
            </div>
          )}
        </div>
      )}

      {selectedMatch && user && (
        <div className="live-bet-form" ref={formRef}>
          <div className="live-bet-form-header">
            <span className="live-pulse-dot"></span>
            <strong>Predict: {selectedMatch.home_team?.name} vs {selectedMatch.away_team?.name}</strong>
            <span className="live-bet-minute">{selectedMatch.elapsed || selectedMatch.status}'</span>
          </div>

          <div className="live-bet-type-selector">
            {LIVE_PREDICTION_TYPES.map(type => (
              <button
                key={type.value}
                className={`live-bet-type-btn ${predictionType === type.value ? 'active' : ''}`}
                onClick={() => { setPredictionType(type.value); setPredictionValue('') }}
              >
                {type.label}
              </button>
            ))}
          </div>

          <div className="live-bet-options">
            {LIVE_PREDICTION_TYPES.find(t => t.value === predictionType)?.options.map(opt => (
              <button
                key={opt}
                className={`live-bet-option ${predictionValue === opt ? 'selected' : ''}`}
                onClick={() => setPredictionValue(opt)}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className="live-bet-confidence">
            <label>Confidence: <strong>{confidence}%</strong></label>
            <input
              type="range"
              min="10"
              max="95"
              value={confidence}
              onChange={e => setConfidence(Number(e.target.value))}
              className="confidence-slider"
            />
            <div className="confidence-labels">
              <span>Low</span>
              <span>Medium</span>
              <span>High</span>
            </div>
          </div>

          <textarea
            className="live-bet-notes"
            placeholder="Quick analysis (optional)..."
            value={analysisNotes}
            onChange={e => setAnalysisNotes(e.target.value)}
            maxLength={300}
            rows={2}
          />

          <button
            className="live-bet-submit-btn"
            disabled={!predictionValue || submitting}
            onClick={handleSubmitLiveBet}
          >
            {submitting ? 'Submitting...' : 'Submit Live Prediction'}
          </button>

          {submitMsg && <p className="live-bet-msg">{submitMsg}</p>}
        </div>
      )}

      {selectedMatch && !user && (
        <div className="live-bet-form" ref={formRef}>
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '16px' }}>Log in to submit live predictions.</p>
        </div>
      )}

      {livePredictions.length > 0 && (
        <div className="live-predictions-feed">
          <h3 className="live-predictions-title">Recent Live Predictions</h3>
          <div className="community-grid">
            {livePredictions.map(pred => (
              <PredictionCard key={pred.id} pred={pred} onRate={() => {}} onPurchase={() => {}} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Community() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filterUserId = searchParams.get('user_id')
  const [filterUserName, setFilterUserName] = useState('')
  const [predictions, setPredictions] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [tab, setTab] = useState('all')
  const [sortBy, setSortBy] = useState('best')

  const tabRef = useRef(tab)
  const pageRef = useRef(page)
  const filterUserIdRef = useRef(filterUserId)
  const sortByRef = useRef(sortBy)
  tabRef.current = tab
  pageRef.current = page
  filterUserIdRef.current = filterUserId
  sortByRef.current = sortBy

  const fetchPredictions = async (p = 1, feedTab = tab, silent = false, userId = filterUserId, sort = sortBy) => {
    if (!silent) setLoading(true)
    try {
      let endpoint = feedTab === 'paid'
        ? `/api/community/paid?page=${p}&per_page=20&sort_by=${sort}`
        : `/api/community/predictions?page=${p}&per_page=20&sort_by=${sort}`
      if (userId && feedTab !== 'paid') {
        endpoint += `&user_id=${userId}`
      }
      const res = await axios.get(endpoint)
      setPredictions(res.data.predictions || [])
      setTotalPages(res.data.total_pages || 1)
      setTotalCount(res.data.total || 0)
      setPage(p)
      if (userId && res.data.predictions?.length > 0 && !filterUserName) {
        setFilterUserName(res.data.predictions[0].display_name || '')
      }
    } catch { /* ignore */ }
    if (!silent) setLoading(false)
  }

  useEffect(() => {
    if (tab !== 'upcoming') {
      fetchPredictions(1, tab, false, filterUserId, sortBy)
    }
  }, [tab, filterUserId, sortBy])

  useEffect(() => {
    const interval = setInterval(() => {
      if (tabRef.current !== 'upcoming' && tabRef.current !== 'live') {
        fetchPredictions(pageRef.current, tabRef.current, true, filterUserIdRef.current, sortByRef.current)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const clearUserFilter = () => {
    setSearchParams({})
    setFilterUserName('')
  }

  const handleRateUpdate = (predId, avgRating, ratingCount) => {
    setPredictions(prev => prev.map(p =>
      p.id === predId ? { ...p, avg_rating: avgRating, rating_count: ratingCount } : p
    ))
  }

  const handlePurchase = () => {
    fetchPredictions(page, tab, false, filterUserId, sortBy)
  }

  const handleTabChange = (newTab) => {
    setTab(newTab)
    setPage(1)
  }

  const handleSortChange = (newSort) => {
    setSortBy(newSort)
    setPage(1)
  }

  const getPageNumbers = () => {
    const pages = []
    const maxVisible = 5
    let start = Math.max(1, page - Math.floor(maxVisible / 2))
    let end = Math.min(totalPages, start + maxVisible - 1)
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1)
    }
    for (let i = start; i <= end; i++) {
      pages.push(i)
    }
    return pages
  }

  return (
    <div className="community-page">
      <div className="community-header-section">
        <h2>Predictions</h2>
        <p className="community-subtitle">See what other predictors are picking</p>
      </div>

      <div className="disclaimer-banner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>These predictions can be risky. Bet at your own risk. Company will not be liable for any damages.</span>
      </div>

      {filterUserId && (
        <div className="community-filter-banner">
          <span>Showing predictions by <strong>{filterUserName || `User #${filterUserId}`}</strong></span>
          <button onClick={clearUserFilter}>Show All</button>
        </div>
      )}

      <div className="community-tabs">
        <button className={`community-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => handleTabChange('all')}>
          All Predictions
        </button>
        <button className={`community-tab ${tab === 'paid' ? 'active' : ''}`} onClick={() => handleTabChange('paid')}>
          Premium Picks
        </button>
        <button className={`community-tab live-tab ${tab === 'live' ? 'active' : ''}`} onClick={() => handleTabChange('live')}>
          <span className="live-tab-dot"></span>
          Live Bets
        </button>
        <button className={`community-tab ${tab === 'upcoming' ? 'active' : ''}`} onClick={() => handleTabChange('upcoming')}>
          Upcoming Matches
        </button>
      </div>

      {tab === 'upcoming' && <UpcomingMatchesTab />}
      {tab === 'live' && <LiveBetsTab />}

      {tab !== 'upcoming' && tab !== 'live' && (
        <>
          <div className="sort-selector">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`sort-btn ${sortBy === opt.value ? 'active' : ''}`}
                onClick={() => handleSortChange(opt.value)}
              >
                <span className="sort-icon">{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
            {totalCount > 0 && <span className="sort-total">{totalCount} predictions</span>}
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Loading predictions...</p>
            </div>
          ) : predictions.length === 0 ? (
            <div className="empty-community">
              <p>{tab === 'paid' ? 'No premium predictions yet.' : 'No community predictions yet. Be the first to share yours!'}</p>
              <p className="empty-hint">After making a prediction on any match, you can share it with the community.</p>
            </div>
          ) : (
            <>
              <div className="community-grid">
                {predictions.map((pred, idx) => (
                  <React.Fragment key={pred.id}>
                    <PredictionCard pred={pred} onRate={handleRateUpdate} onPurchase={handlePurchase} />
                  </React.Fragment>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="pagination-numbered">
                  <button className="pagination-btn" disabled={page <= 1} onClick={() => fetchPredictions(page - 1, tab, false, filterUserId, sortBy)}>
                    Prev
                  </button>
                  {getPageNumbers()[0] > 1 && (
                    <>
                      <button className="pagination-btn" onClick={() => fetchPredictions(1, tab, false, filterUserId, sortBy)}>1</button>
                      {getPageNumbers()[0] > 2 && <span className="pagination-dots">...</span>}
                    </>
                  )}
                  {getPageNumbers().map(p => (
                    <button
                      key={p}
                      className={`pagination-btn ${p === page ? 'active' : ''}`}
                      onClick={() => fetchPredictions(p, tab, false, filterUserId, sortBy)}
                    >
                      {p}
                    </button>
                  ))}
                  {getPageNumbers()[getPageNumbers().length - 1] < totalPages && (
                    <>
                      {getPageNumbers()[getPageNumbers().length - 1] < totalPages - 1 && <span className="pagination-dots">...</span>}
                      <button className="pagination-btn" onClick={() => fetchPredictions(totalPages, tab, false, filterUserId, sortBy)}>
                        {totalPages}
                      </button>
                    </>
                  )}
                  <button className="pagination-btn" disabled={page >= totalPages} onClick={() => fetchPredictions(page + 1, tab, false, filterUserId, sortBy)}>
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
