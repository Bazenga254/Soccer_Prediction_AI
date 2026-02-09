import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'
import AdBanner from '../components/AdBanner'

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
          ★
        </span>
      ))}
    </div>
  )
}

function CommentSection({ predictionId }) {
  const { user } = useAuth()
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const fetchComments = async () => {
    try {
      const res = await axios.get(`/api/community/${predictionId}/comments`)
      setComments(res.data.comments || [])
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (expanded) fetchComments()
  }, [expanded])

  const handlePost = async () => {
    if (!newComment.trim()) return
    setLoading(true)
    try {
      const res = await axios.post(`/api/community/${predictionId}/comment`, { content: newComment })
      if (res.data.success) {
        setComments(prev => [...prev, res.data.comment])
        setNewComment('')
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  return (
    <div className="comment-section">
      <button className="toggle-comments-btn" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Hide Comments' : `Comments`}
      </button>
      {expanded && (
        <div className="comments-list">
          {comments.length === 0 && <p className="no-comments">No comments yet. Be the first!</p>}
          {comments.map(c => (
            <div key={c.id} className="comment-item">
              <span className="comment-avatar" style={{ background: c.avatar_color }}>
                {(c.display_name || c.username || '?')[0].toUpperCase()}
              </span>
              <div className="comment-body">
                <div className="comment-meta">
                  <strong>{c.display_name}</strong>
                  <span className="comment-time">{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <p className="comment-text">{c.content}</p>
              </div>
            </div>
          ))}
          <div className="comment-input-row">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              maxLength={500}
              onKeyDown={(e) => e.key === 'Enter' && handlePost()}
              disabled={loading}
            />
            <button onClick={handlePost} disabled={loading || !newComment.trim()}>Post</button>
          </div>
        </div>
      )}
    </div>
  )
}

function PredictionCard({ pred, onRate, onPurchase }) {
  const { user } = useAuth()
  const isOwn = user?.id === pred.user_id
  const [purchasing, setPurchasing] = useState(false)

  const handleRate = async (rating) => {
    try {
      const res = await axios.post(`/api/community/${pred.id}/rate`, { rating })
      if (res.data.success) {
        onRate(pred.id, res.data.avg_rating, res.data.rating_count)
      }
    } catch { /* ignore */ }
  }

  const handlePurchase = async () => {
    if (!confirm(`Unlock this prediction for $${pred.price_usd}?`)) return
    setPurchasing(true)
    try {
      const res = await axios.post(`/api/community/${pred.id}/purchase`, {})
      if (res.data.success && onPurchase) {
        onPurchase(pred.id)
      }
    } catch (err) {
      alert(err.response?.data?.detail || 'Purchase failed')
    }
    setPurchasing(false)
  }

  const isPaidLocked = pred.is_paid && !pred.unlocked

  return (
    <div className={`community-card ${pred.is_paid ? 'paid-card' : ''}`}>
      <div className="community-card-header">
        <div className="predictor-info">
          <span className="predictor-avatar" style={{ background: pred.avatar_color }}>
            {(pred.display_name || pred.username || '?')[0].toUpperCase()}
          </span>
          <div>
            <strong className="predictor-name">{pred.display_name}</strong>
            <span className="predictor-username">@{pred.username}</span>
          </div>
        </div>
        <div className="community-header-right">
          {pred.is_paid && (
            <span className={`paid-badge ${pred.unlocked ? 'unlocked' : ''}`}>
              {pred.unlocked ? 'UNLOCKED' : `$${pred.price_usd}`}
            </span>
          )}
          <span className="community-time">{new Date(pred.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="community-match">
        <span className="community-teams">{pred.team_a_name} vs {pred.team_b_name}</span>
        {pred.competition && <span className="community-comp">{pred.competition}</span>}
      </div>

      {isPaidLocked ? (
        <div className="locked-prediction">
          <div className="locked-icon">🔒</div>
          <p className="locked-text">This is a premium prediction</p>
          <p className="locked-sub">Unlock to see the full analysis and picks</p>
          {pred.purchase_count > 0 && (
            <span className="purchase-count">{pred.purchase_count} buyer{pred.purchase_count !== 1 ? 's' : ''}</span>
          )}
          {!isOwn && (
            <button className="unlock-btn" onClick={handlePurchase} disabled={purchasing}>
              {purchasing ? 'Processing...' : `Unlock for $${pred.price_usd}`}
            </button>
          )}
        </div>
      ) : (
        <>
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

          {pred.analysis_summary && (
            <p className="community-summary">{pred.analysis_summary}</p>
          )}
        </>
      )}

      {pred.match_finished && (
        <div className={`community-result ${pred.result_correct ? 'correct' : 'incorrect'}`}>
          {pred.result_correct ? 'Correct' : 'Incorrect'}
        </div>
      )}

      <div className="community-card-footer">
        <div className="rating-section">
          <StarRating
            rating={Math.round(pred.avg_rating)}
            interactive={!isOwn && !isPaidLocked}
            onRate={handleRate}
          />
          <span className="rating-text">
            {pred.avg_rating > 0 ? `${pred.avg_rating}` : 'No ratings'} ({pred.rating_count})
          </span>
        </div>
        {!isPaidLocked && <CommentSection predictionId={pred.id} />}
      </div>
    </div>
  )
}

export default function Community() {
  const [predictions, setPredictions] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [tab, setTab] = useState('all')

  const fetchPredictions = async (p = 1, feedTab = tab) => {
    setLoading(true)
    try {
      const endpoint = feedTab === 'paid'
        ? `/api/community/paid?page=${p}&per_page=15`
        : `/api/community/predictions?page=${p}&per_page=15`
      const res = await axios.get(endpoint)
      setPredictions(res.data.predictions || [])
      setTotalPages(res.data.total_pages || 1)
      setPage(p)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetchPredictions(1, tab) }, [tab])

  const handleRateUpdate = (predId, avgRating, ratingCount) => {
    setPredictions(prev => prev.map(p =>
      p.id === predId ? { ...p, avg_rating: avgRating, rating_count: ratingCount } : p
    ))
  }

  const handlePurchase = (predId) => {
    // Re-fetch to get unlocked content
    fetchPredictions(page, tab)
  }

  return (
    <div className="community-page">
      <div className="community-header-section">
        <h2>Community Predictions</h2>
        <p className="community-subtitle">See what other predictors are picking</p>
      </div>

      <div className="community-tabs">
        <button
          className={`community-tab ${tab === 'all' ? 'active' : ''}`}
          onClick={() => setTab('all')}
        >All Predictions</button>
        <button
          className={`community-tab ${tab === 'paid' ? 'active' : ''}`}
          onClick={() => setTab('paid')}
        >Premium Picks</button>
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
          <AdBanner format="leaderboard" slot="community-top" />
          <div className="community-grid">
            {predictions.map((pred, idx) => (
              <React.Fragment key={pred.id}>
                <PredictionCard pred={pred} onRate={handleRateUpdate} onPurchase={handlePurchase} />
                {idx === 2 && predictions.length > 3 && <AdBanner format="native" slot="community-mid" />}
              </React.Fragment>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => fetchPredictions(page - 1, tab)}>Previous</button>
              <span>Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => fetchPredictions(page + 1, tab)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
