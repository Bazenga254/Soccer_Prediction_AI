import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import { useCurrency } from '../context/CurrencyContext'
import MpesaPaymentModal from '../components/MpesaPaymentModal'
import WhopCheckoutModal from '../components/WhopCheckoutModal'

// Module-level set to prevent duplicate impression tracking across re-mounts
const _trackedImpressions = new Set()
import { COMPETITIONS } from '../components/Header'

const SORT_OPTIONS = [
  { value: 'best', labelKey: 'community.best', icon: '\u{1F3C6}' },
  { value: 'new', labelKey: 'community.new', icon: '\u{1F195}' },
  { value: 'top_rated', labelKey: 'community.topRated', icon: '\u2B50' },
  { value: 'hot', labelKey: 'community.hot', icon: '\u{1F525}' },
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
  const { t } = useTranslation()
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
        <span>{expanded ? t('community.hideChat') : t('community.liveChat')}</span>
        {chatCount > 0 && !expanded && <span className="chat-count-badge">{chatCount}</span>}
        {expanded && <span className="live-dot"></span>}
      </button>

      {expanded && (
        <div className="live-chat-panel">
          <div className="live-chat-messages">
            {messages.length === 0 && (
              <p className="chat-empty">{t('community.noChatMessages')}</p>
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
              placeholder={t('community.typeMessage')}
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
  const { t } = useTranslation()
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
        <h3>{t('community.likePredictions')}</h3>
        <p dangerouslySetInnerHTML={{ __html: t('community.followNotify', { name: displayName }) }} />
        <div className="follow-prompt-actions">
          <button className="follow-prompt-btn primary" onClick={handleFollow}>{t('community.follow')}</button>
          <button className="follow-prompt-btn secondary" onClick={onClose}>{t('community.notNow')}</button>
        </div>
      </div>
    </div>
  )
}

function UserStatsModal({ userId, displayName, avatarColor, onClose }) {
  const { t } = useTranslation()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axios.get(`/api/community/user-stats/${userId}`)
        setStats(res.data)
      } catch { /* ignore */ }
      setLoading(false)
    }
    fetchStats()
  }, [userId])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="user-stats-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>&times;</button>
        <div className="user-stats-header">
          <span className="predictor-avatar" style={{ background: avatarColor, width: 48, height: 48, fontSize: 20 }}>
            {(displayName || '?')[0].toUpperCase()}
          </span>
          <h3 style={{ margin: 0, color: '#f1f5f9' }}>{displayName}</h3>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Loading...</div>
        ) : !stats ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>No data available</div>
        ) : (
          <>
            <div className="stats-summary">
              <div className="stat-item wins">
                <span className="stat-number">{stats.wins}</span>
                <span className="stat-label">Wins</span>
              </div>
              <div className="stat-item losses">
                <span className="stat-number">{stats.losses}</span>
                <span className="stat-label">Losses</span>
              </div>
              <div className="stat-item percentage">
                <span className="stat-number">{stats.win_percentage}%</span>
                <span className="stat-label">Win Rate</span>
              </div>
              <div className="stat-item pending">
                <span className="stat-number">{stats.pending}</span>
                <span className="stat-label">Pending</span>
              </div>
            </div>
            {stats.recent_history.length > 0 && (
              <div className="stats-history">
                <h4 style={{ color: '#94a3b8', margin: '0 0 12px', fontSize: 13 }}>Recent Results</h4>
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th>Predicted</th>
                      <th>Actual</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent_history.map((h, i) => (
                      <tr key={i} className={h.correct ? 'row-correct' : 'row-incorrect'}>
                        <td>{h.match}</td>
                        <td>{h.predicted}</td>
                        <td>{h.actual}</td>
                        <td style={{ textAlign: 'center' }}>{h.correct ? '\u2705' : '\u274C'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function PredictionCard({ pred, onRate, onPurchase }) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const { isKenyan } = useCurrency()
  const navigate = useNavigate()
  const isOwn = user?.id === pred.user_id
  const [showMpesa, setShowMpesa] = useState(false)
  const [showWhop, setShowWhop] = useState(false)
  const [showPayChoice, setShowPayChoice] = useState(false)
  const [showFollowPrompt, setShowFollowPrompt] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showSlipPicks, setShowSlipPicks] = useState(false)
  const cardRef = useRef(null)
  const isMultiPick = pred.slip_picks && pred.slip_picks.length > 1

  // Impression tracking via IntersectionObserver
  useEffect(() => {
    if (!cardRef.current || _trackedImpressions.has(pred.id)) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !_trackedImpressions.has(pred.id)) {
          _trackedImpressions.add(pred.id)
          axios.post('/api/community/track-views', { prediction_ids: [pred.id] }).catch(() => {})
          observer.disconnect()
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(cardRef.current)
    return () => observer.disconnect()
  }, [pred.id])

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

  const handleAnalyze = () => {
    axios.post(`/api/community/${pred.id}/track-click`).catch(() => {})
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
    setShowWhop(false)
    if (onPurchase) onPurchase(pred.id)
    if (!isOwn && !followState.isFollowing && followState.loaded) {
      setTimeout(() => setShowFollowPrompt(true), 500)
    }
  }

  const isPaidLocked = pred.is_paid && !pred.unlocked

  return (
    <div ref={cardRef} className={`community-card ${pred.is_paid ? 'paid-card' : ''}`}>
      <div className="community-card-top">
        {pred.rank && (
          <div className="prediction-rank-number">
            <span>{pred.rank}</span>
          </div>
        )}

        <div className="community-card-left">
          <div className="predictor-info" onClick={(e) => { e.stopPropagation(); setShowStats(true) }} style={{ cursor: 'pointer' }}>
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
                {(pred.predictor_wins > 0 || pred.predictor_losses > 0) && (
                  <span className="predictor-record">
                    <span className="record-wins">{pred.predictor_wins}W</span>
                    <span className="record-sep">-</span>
                    <span className="record-losses">{pred.predictor_losses}L</span>
                  </span>
                )}
              </div>
              <div className="predictor-follow-row">
                <span className="predictor-username">@{pred.username}</span>
              </div>
            </div>
          </div>
          {isMultiPick ? (
            <div className="community-match">
              <span className="community-teams slip-label">{pred.slip_picks.length} Picks - Combined Slip</span>
              <div className="community-match-meta">
                {pred.combined_odds && (
                  <span className="slip-combined-odds">Total Odds: {pred.combined_odds.toFixed(2)}</span>
                )}
                <button className="slip-toggle-btn" onClick={(e) => { e.stopPropagation(); setShowSlipPicks(!showSlipPicks) }}>
                  {showSlipPicks ? 'Hide Picks' : 'Show Picks'} {showSlipPicks ? '\u25B2' : '\u25BC'}
                </button>
              </div>
            </div>
          ) : (
            <div className="community-match">
              <span className="community-teams">{pred.team_a_name} vs {pred.team_b_name}</span>
              <div className="community-match-meta">
                {pred.competition && <span className="community-comp">{pred.competition}</span>}
                {(() => {
                  const parts = (pred.fixture_id || '').split('-')
                  if (parts.length >= 3) {
                    const ds = parts[parts.length - 1]
                    if (ds.length === 8) {
                      const d = new Date(ds.slice(0,4) + '-' + ds.slice(4,6) + '-' + ds.slice(6,8))
                      if (!isNaN(d)) return <span className="community-match-date">{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    }
                  }
                  return null
                })()}
                <button className="analyze-btn-sm" onClick={(e) => { e.stopPropagation(); handleAnalyze() }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20"/><path d="M5 17V7l5 4 4-8 6 7"/></svg>
                  {t('community.analyze') || 'Analyze'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="community-card-center">
          {isPaidLocked ? (
            <div className="locked-prediction-inline">
              <span className="locked-icon-sm">{'\u{1F512}'}</span>
              <span className="locked-text-sm">{t('community.premium')}</span>
              {!isOwn && !showPayChoice && (
                <button className="unlock-btn-sm" onClick={() => setShowPayChoice(true)}>
                  {t('community.unlock')} ${pred.price_usd}
                </button>
              )}
              {!isOwn && showPayChoice && (
                <div className="pay-choice-row">
                  <button className="pay-choice-btn mpesa" onClick={() => { setShowPayChoice(false); setShowMpesa(true) }}>
                    M-Pesa
                  </button>
                  {!isKenyan && (
                    <button className="pay-choice-btn card" onClick={() => { setShowPayChoice(false); setShowWhop(true) }}>
                      {t('upgrade.cardPayment')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : isMultiPick ? (
            <div className="community-picks slip-picks-summary">
              <div className="pick-item main-pick">
                <span className="pick-label">{t('community.prediction')}</span>
                <span className="pick-value">{pred.slip_picks.length} selections</span>
                {pred.combined_odds && (
                  <span className="pick-prob slip-odds-badge">{pred.combined_odds.toFixed(2)}</span>
                )}
              </div>
              {showSlipPicks && (
                <div className="slip-picks-dropdown">
                  {pred.slip_picks.map((pick, idx) => (
                    <div key={pick.id || idx} className="slip-pick-item">
                      <div className="slip-pick-match">{pick.team_a_name} vs {pick.team_b_name}</div>
                      <div className="slip-pick-details">
                        <span className="slip-pick-result">{pick.predicted_result}</span>
                        {pick.odds && <span className="slip-pick-odds">{pick.odds.toFixed(2)}</span>}
                        {pick.predicted_result_prob > 0 && (
                          <span className="slip-pick-prob">{Math.round(pick.predicted_result_prob)}%</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="community-picks">
              <div className="pick-item main-pick">
                <span className="pick-label">{t('community.prediction')}</span>
                <span className="pick-value">{pred.predicted_result}</span>
                {pred.predicted_result_prob > 0 && (
                  <span className="pick-prob">{Math.round(pred.predicted_result_prob)}%</span>
                )}
              </div>
              {pred.odds && (
                <div className="pick-item">
                  <span className="pick-label">Odds</span>
                  <span className="pick-value pick-odds-value">{pred.odds.toFixed(2)}</span>
                </div>
              )}
              {pred.predicted_over25 && (
                <div className="pick-item">
                  <span className="pick-label">{t('community.overUnder')}</span>
                  <span className="pick-value">{pred.predicted_over25}</span>
                </div>
              )}
              {pred.predicted_btts && (
                <div className="pick-item">
                  <span className="pick-label">{t('community.btts')}</span>
                  <span className="pick-value">{pred.predicted_btts}</span>
                </div>
              )}
              {pred.best_value_bet && (
                <div className="pick-item value-pick">
                  <span className="pick-label">{t('community.bestValue')}</span>
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
              {pred.unlocked ? t('community.unlocked') : `$${pred.price_usd}`}
            </span>
          )}
          {pred.match_finished && (
            <div className={`community-result ${pred.result_correct ? 'correct' : 'incorrect'}`}>
              {pred.result_correct ? '\u2705 ' : '\u274C '}{pred.result_correct ? t('community.correct') : t('community.incorrect')}
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
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg> {t('community.followingBtn')}</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> {t('community.follow')} {pred.display_name?.split(' ')[0]}</>
            )}
          </button>
          {followState.followersCount > 0 && (
            <span className="follow-bar-count">{followState.followersCount} {followState.followersCount !== 1 ? t('community.followers') : t('community.follower')}</span>
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
          title={t('community.unlockPrediction')}
          description={`${pred.team_a_name} vs ${pred.team_b_name}`}
        />
      )}

      {showWhop && (
        <WhopCheckoutModal
          isOpen={showWhop}
          onClose={() => setShowWhop(false)}
          onSuccess={handlePaymentSuccess}
          transactionType="prediction_purchase"
          predictionId={pred.id}
          amountUsd={pred.price_usd}
          title={`${t('community.unlock')}: ${pred.team_a_name} vs ${pred.team_b_name}`}
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

      {showStats && (
        <UserStatsModal
          userId={pred.user_id}
          displayName={pred.display_name}
          avatarColor={pred.avatar_color}
          onClose={() => setShowStats(false)}
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [selectedLeague, setSelectedLeague] = useState('ALL')
  const [fixtures, setFixtures] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const MATCHES_PER_PAGE = 15
  const isPro = user?.tier === 'pro'

  useEffect(() => {
    const fetchFixtures = async () => {
      setLoading(true)
      setMessage('')
      try {
        const url = selectedLeague === 'ALL'
          ? '/api/fixtures/upcoming-all?days=7'
          : `/api/fixtures?competition=${selectedLeague}&days=14`
        const res = await axios.get(url)
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
        <button
          className={`league-chip ${selectedLeague === 'ALL' ? 'active' : ''}`}
          onClick={() => { setSelectedLeague('ALL'); setCurrentPage(1) }}
        >
          <span className="league-chip-flag">{'\u26BD'}</span>
          <span className="league-chip-name">All</span>
        </button>
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
          placeholder={t('community.searchTeamName')}
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
          <p>{t('community.loadingFixtures')}</p>
        </div>
      ) : filteredFixtures.length === 0 ? (
        <div className="empty-community">
          {searchQuery ? (
            <p>{t('community.noMatchesFor', { query: searchQuery })}</p>
          ) : (
            <>
              <p>{selectedLeague === 'ALL' ? 'No upcoming matches found' : t('community.noUpcomingMatches', { league: COMPETITIONS.find(c => c.id === selectedLeague)?.name || selectedLeague })}</p>
              <p className="empty-hint">{t('community.tryAnotherLeague')}</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="upcoming-match-count">
            {t('community.showingMatches', { start: (currentPage - 1) * MATCHES_PER_PAGE + 1, end: Math.min(currentPage * MATCHES_PER_PAGE, filteredFixtures.length), total: filteredFixtures.length })}
          </div>
          <div className="upcoming-fixtures-list">
            {sortedDates.map(date => (
              <div key={date} className="upcoming-date-group">
                <div className="upcoming-date-header">
                  <span>{formatFixtureDate(date + 'T00:00:00')}</span>
                  <span className="upcoming-date-count">{grouped[date].length} {grouped[date].length !== 1 ? t('community.matches') : t('community.match')}</span>
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
                            navigate('/upgrade', { state: { from: 'upcoming' } })
                            return
                          }
                          const compCode = fixture.competition?.code || selectedLeague
                          navigate(`/match/${compCode}/${fixture.home_team.id}/${fixture.away_team.id}`, { state: { from: 'upcoming' } })
                        }}
                      >
                        <div className="upcoming-fixture-time">
                          {matchStarted ? <span className="match-started-badge">{t('community.started')}</span> : formatFixtureTime(fixture.date)}
                          {selectedLeague === 'ALL' && fixture.competition?.name && (
                            <span className="upcoming-fixture-league">{fixture.competition.name}</span>
                          )}
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
                          {matchStarted ? t('community.started') : isPro ? t('community.analyze') : t('community.proOnly')}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (() => {
            const maxVisible = 5
            let start = Math.max(1, currentPage - Math.floor(maxVisible / 2))
            let end = Math.min(totalPages, start + maxVisible - 1)
            if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1)
            const pages = []
            for (let i = start; i <= end; i++) pages.push(i)
            return (
              <div className="upcoming-pagination">
                <button className="upcoming-page-btn" disabled={currentPage <= 1} onClick={() => handlePageChange(currentPage - 1)}>
                  {t('community.prev')}
                </button>
                {start > 1 && (
                  <>
                    <button className="upcoming-page-btn" onClick={() => handlePageChange(1)}>1</button>
                    {start > 2 && <span className="pagination-dots">...</span>}
                  </>
                )}
                {pages.map(p => (
                  <button key={p} className={`upcoming-page-btn ${p === currentPage ? 'active' : ''}`} onClick={() => handlePageChange(p)}>
                    {p}
                  </button>
                ))}
                {end < totalPages && (
                  <>
                    {end < totalPages - 1 && <span className="pagination-dots">...</span>}
                    <button className="upcoming-page-btn" onClick={() => handlePageChange(totalPages)}>{totalPages}</button>
                  </>
                )}
                <button className="upcoming-page-btn" disabled={currentPage >= totalPages} onClick={() => handlePageChange(currentPage + 1)}>
                  {t('community.next')}
                </button>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}

const LIVE_PREDICTION_TYPES = [
  { value: 'match_winner', labelKey: 'community.matchWinner', optionKeys: ['community.homeWin', 'community.draw', 'community.awayWin'] },
  { value: 'next_goal', labelKey: 'community.nextGoal', optionKeys: ['community.homeTeam', 'community.awayTeam', 'community.noMoreGoals'] },
  { value: 'total_goals', labelKey: 'community.totalGoals', options: ['Over 0.5', 'Over 1.5', 'Over 2.5', 'Over 3.5', 'Under 1.5', 'Under 2.5', 'Under 3.5'] },
  { value: 'btts', labelKey: 'community.bothTeamsScore', optionKeys: ['common.yes', 'common.no'] },
]

function LiveBetsTab() {
  const { user } = useAuth()
  const { t } = useTranslation()
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
          prediction_type: LIVE_PREDICTION_TYPES.find(t => t.value === predictionType)?.labelKey || predictionType,
          prediction_value: predictionValue,
          confidence,
          analysis_notes: analysisNotes,
        }],
        visibility: 'public',
      })
      if (res.data.success) {
        setSubmitMsg(t('community.livePredictionSubmitted'))
        setSelectedMatch(null)
        setPredictionValue('')
        setConfidence(50)
        setAnalysisNotes('')
        fetchLive()
        setTimeout(() => setSubmitMsg(''), 3000)
      }
    } catch { setSubmitMsg(t('community.failedSubmit')) }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="live-bets-section">
      <div className="live-bets-strip-header">
        <span className="live-pulse-dot"></span>
        <span>{t('community.liveMatchesCount', { count: liveMatches.length })}</span>
      </div>

      {liveMatches.length > 0 && (
        <div className="live-search-bar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder={t('community.searchLiveMatches')}
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
          <p>{t('community.noLiveMatches')}</p>
          <p className="empty-hint">{t('community.liveMatchesHint')}</p>
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
                  {selectedMatch?.id === match.id ? t('community.selected') : t('community.predict')}
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
              <p>{t('community.noMatchesFor', { query: searchQuery })}</p>
            </div>
          )}
        </div>
      )}

      {selectedMatch && user && (
        <div className="live-bet-form" ref={formRef}>
          <div className="live-bet-form-header">
            <span className="live-pulse-dot"></span>
            <strong>{t('community.predictMatch', { match: `${selectedMatch.home_team?.name} vs ${selectedMatch.away_team?.name}` })}</strong>
            <span className="live-bet-minute">{selectedMatch.elapsed || selectedMatch.status}'</span>
          </div>

          <div className="live-bet-type-selector">
            {LIVE_PREDICTION_TYPES.map(type => (
              <button
                key={type.value}
                className={`live-bet-type-btn ${predictionType === type.value ? 'active' : ''}`}
                onClick={() => { setPredictionType(type.value); setPredictionValue('') }}
              >
                {t(type.labelKey)}
              </button>
            ))}
          </div>

          <div className="live-bet-options">
            {(() => {
              const currentType = LIVE_PREDICTION_TYPES.find(tp => tp.value === predictionType)
              if (!currentType) return null
              const optionsList = currentType.optionKeys
                ? currentType.optionKeys.map(key => ({ display: t(key), value: t(key) }))
                : (currentType.options || []).map(opt => ({ display: opt, value: opt }))
              return optionsList.map(opt => (
                <button
                  key={opt.value}
                  className={`live-bet-option ${predictionValue === opt.value ? 'selected' : ''}`}
                  onClick={() => setPredictionValue(opt.value)}
                >
                  {opt.display}
                </button>
              ))
            })()}
          </div>

          <div className="live-bet-confidence">
            <label>{t('community.confidence')}: <strong>{confidence}%</strong></label>
            <input
              type="range"
              min="10"
              max="95"
              value={confidence}
              onChange={e => setConfidence(Number(e.target.value))}
              className="confidence-slider"
            />
            <div className="confidence-labels">
              <span>{t('community.low')}</span>
              <span>{t('community.medium')}</span>
              <span>{t('community.high')}</span>
            </div>
          </div>

          <textarea
            className="live-bet-notes"
            placeholder={t('community.quickAnalysis')}
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
            {submitting ? t('community.submitting') : t('community.submitLivePrediction')}
          </button>

          {submitMsg && <p className="live-bet-msg">{submitMsg}</p>}
        </div>
      )}

      {selectedMatch && !user && (
        <div className="live-bet-form" ref={formRef}>
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '16px' }}>{t('community.loginToPredict')}</p>
        </div>
      )}

      {livePredictions.length > 0 && (
        <div className="live-predictions-feed">
          <h3 className="live-predictions-title">{t('community.recentLivePredictions')}</h3>
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
  const { t } = useTranslation()
  const { isKenyan } = useCurrency()
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
        <h2>{t('community.title')}</h2>
        <p className="community-subtitle">{t('community.subtitle')}</p>
      </div>

      <div className="disclaimer-banner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>{t('community.disclaimer')}</span>
      </div>

      {filterUserId && (
        <div className="community-filter-banner">
          <span>{t('community.showingPredictionsBy')} <strong>{filterUserName || `User #${filterUserId}`}</strong></span>
          <button onClick={clearUserFilter}>{t('community.showAll')}</button>
        </div>
      )}

      <div className="community-tabs">
        <button className={`community-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => handleTabChange('all')}>
          {t('community.allPredictions')}
        </button>
        <button className={`community-tab ${tab === 'paid' ? 'active' : ''}`} onClick={() => handleTabChange('paid')}>
          {t('community.premiumPicks')}
        </button>
        <button className={`community-tab live-tab ${tab === 'live' ? 'active' : ''}`} onClick={() => handleTabChange('live')}>
          <span className="live-tab-dot"></span>
          {t('community.liveBets')}
        </button>
        <button className={`community-tab ${tab === 'upcoming' ? 'active' : ''}`} onClick={() => handleTabChange('upcoming')}>
          {t('community.upcomingMatches')}
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
                <span>{t(opt.labelKey)}</span>
              </button>
            ))}
            {totalCount > 0 && <span className="sort-total">{totalCount} {t('community.predictionsCount')}</span>}
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>{t('community.loadingPredictions')}</p>
            </div>
          ) : predictions.length === 0 ? (
            <div className="empty-community">
              <p>{tab === 'paid' ? t('community.noPremium') : t('community.noCommunity')}</p>
              <p className="empty-hint">{t('community.shareHint')}</p>
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
                    {t('community.prev')}
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
                    {t('community.next')}
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
