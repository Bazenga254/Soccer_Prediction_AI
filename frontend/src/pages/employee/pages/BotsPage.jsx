import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useEmployee } from '../context/EmployeeContext'

const ACTION_TYPES = [
  { value: 'match_chat', label: 'Live Chat', icon: '\u26BD', targetLabel: 'Match Key', needsMessage: true },
  { value: 'prediction_chat', label: 'Prediction Chat', icon: '\uD83D\uDCAC', targetLabel: 'Prediction ID', needsMessage: true },
  { value: 'comment', label: 'Comment', icon: '\uD83D\uDCDD', targetLabel: 'Prediction ID', needsMessage: true },
  { value: 'follow', label: 'Follow User', icon: '\u2795', targetLabel: 'User ID', needsMessage: false },
  { value: 'unfollow', label: 'Unfollow User', icon: '\u2796', targetLabel: 'User ID', needsMessage: false },
  { value: 'react', label: 'React', icon: '\uD83D\uDC4D', targetLabel: 'Prediction ID', needsMessage: false, hasReaction: true },
]

const NEEDS_MESSAGE = ['match_chat', 'prediction_chat', 'comment']

export default function BotsPage() {
  const { getAuthHeaders } = useEmployee()

  const [bots, setBots] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Selection state
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Action modal state
  const [actionModal, setActionModal] = useState(null) // bot object or null
  const [actionType, setActionType] = useState('match_chat')
  const [actionTarget, setActionTarget] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionReaction, setActionReaction] = useState('like')
  const [executing, setExecuting] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  // Bulk toggling state
  const [toggling, setToggling] = useState(false)

  // Live matches for match_chat action
  const [liveMatches, setLiveMatches] = useState([])
  const [loadingMatches, setLoadingMatches] = useState(false)

  // Predictions browser
  const [predictions, setPredictions] = useState([])
  const [loadingPredictions, setLoadingPredictions] = useState(false)
  const [predictionSearch, setPredictionSearch] = useState('')
  const [predictionPage, setPredictionPage] = useState(1)
  const [predictionTotalPages, setPredictionTotalPages] = useState(1)
  const predSearchTimer = useRef(null)

  // User search for follow/unfollow
  const [userSearch, setUserSearch] = useState('')
  const [userResults, setUserResults] = useState([])
  const [searchingUsers, setSearchingUsers] = useState(false)

  // Fetch bots
  const fetchBots = useCallback(async () => {
    try {
      setError('')
      const res = await axios.get('/api/employee/bots', {
        headers: getAuthHeaders(),
      })
      setBots(res.data.bots || [])
      setTotal(res.data.total ?? (res.data.bots || []).length)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load bots')
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  useEffect(() => {
    fetchBots()
  }, [fetchBots])

  // Clear success messages after 3s
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(''), 3000)
    return () => clearTimeout(t)
  }, [success])

  // Fetch live matches or predictions when action type changes in modal
  const actionModalOpen = !!actionModal
  useEffect(() => {
    if (!actionModalOpen) return
    if (actionType === 'match_chat') {
      fetchLiveMatches()
    } else if (['comment', 'react', 'prediction_chat'].includes(actionType)) {
      setPredictionSearch('')
      fetchPredictions(1, '')
    }
  }, [actionType, actionModalOpen])

  const fetchLiveMatches = async () => {
    setLoadingMatches(true)
    try {
      const res = await axios.get('/api/employee/bots/live-matches', { headers: getAuthHeaders() })
      setLiveMatches(res.data.matches || [])
    } catch { /* ignore */ }
    setLoadingMatches(false)
  }

  const fetchPredictions = async (pg = 1, q = '') => {
    setLoadingPredictions(true)
    try {
      const res = await axios.get('/api/employee/bots/predictions', {
        headers: getAuthHeaders(),
        params: { page: pg, search: q }
      })
      setPredictions(res.data.predictions || [])
      setPredictionPage(res.data.page || 1)
      setPredictionTotalPages(res.data.total_pages || 1)
    } catch { /* ignore */ }
    setLoadingPredictions(false)
  }

  const searchUsers = async (q) => {
    setUserSearch(q)
    if (!q.trim()) { setUserResults([]); return }
    setSearchingUsers(true)
    try {
      const res = await axios.get('/api/employee/bots/users-search', {
        headers: getAuthHeaders(),
        params: { search: q.trim(), limit: 10 }
      })
      setUserResults(res.data.users || [])
    } catch { /* ignore */ }
    setSearchingUsers(false)
  }

  const selectMatch = (match) => {
    setActionTarget(String(match.match_key || match.id))
  }

  const selectPrediction = (pred) => {
    setActionTarget(String(pred.id))
  }

  const selectUserTarget = (user) => {
    setActionTarget(String(user.id))
    setUserSearch('')
    setUserResults([])
  }

  const handlePredictionQuickAction = async (pred, action) => {
    if (!actionModal) return
    const botId = actionModal.id || actionModal.bot_id
    setExecuting(true)
    setActionError('')
    setActionSuccess('')
    try {
      const payload = {
        bot_id: botId,
        action: action,
        target_id: action === 'follow' ? String(pred.user_id) : String(pred.id),
      }
      if (action === 'react') payload.reaction = 'like'
      await axios.post('/api/employee/bots/action', payload, { headers: getAuthHeaders() })
      setActionSuccess(`${action === 'follow' ? 'Followed user' : action === 'react' ? 'Liked prediction' : 'Done'}`)
      setTimeout(() => setActionSuccess(''), 3000)
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Action failed')
    }
    setExecuting(false)
  }

  // Toggle individual bot
  const handleToggleBot = async (botId, currentActive) => {
    try {
      setToggling(true)
      await axios.post(
        '/api/employee/bots/toggle',
        { bot_ids: [botId], activate: !currentActive },
        { headers: getAuthHeaders() }
      )
      setBots(prev =>
        prev.map(b =>
          (b.id || b.bot_id) === botId
            ? { ...b, is_active: !currentActive }
            : b
        )
      )
      setSuccess(`Bot ${!currentActive ? 'activated' : 'deactivated'} successfully`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to toggle bot')
    } finally {
      setToggling(false)
    }
  }

  // Toggle all bots
  const handleToggleAll = async (activate) => {
    try {
      setToggling(true)
      setError('')
      await axios.post(
        '/api/employee/bots/toggle-all',
        { activate },
        { headers: getAuthHeaders() }
      )
      setBots(prev => prev.map(b => ({ ...b, is_active: activate })))
      setSuccess(`All bots ${activate ? 'activated' : 'deactivated'} successfully`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to toggle all bots')
    } finally {
      setToggling(false)
    }
  }

  // Toggle selected bots
  const handleToggleSelected = async (activate) => {
    if (selectedIds.size === 0) return
    try {
      setToggling(true)
      setError('')
      await axios.post(
        '/api/employee/bots/toggle',
        { bot_ids: Array.from(selectedIds), activate },
        { headers: getAuthHeaders() }
      )
      setBots(prev =>
        prev.map(b =>
          selectedIds.has(b.id || b.bot_id)
            ? { ...b, is_active: activate }
            : b
        )
      )
      setSelectedIds(new Set())
      setSuccess(`${selectedIds.size} bot(s) ${activate ? 'activated' : 'deactivated'} successfully`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to toggle selected bots')
    } finally {
      setToggling(false)
    }
  }

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === bots.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(bots.map(b => b.id || b.bot_id)))
    }
  }

  const handleSelectBot = (botId) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(botId)) {
        next.delete(botId)
      } else {
        next.add(botId)
      }
      return next
    })
  }

  // Action modal
  const openActionModal = (bot) => {
    setActionModal(bot)
    setActionType('match_chat')
    setActionTarget('')
    setActionMessage('')
    setActionReaction('like')
    setActionError('')
    setActionSuccess('')
  }

  const closeActionModal = () => {
    setActionModal(null)
    setActionError('')
    setActionSuccess('')
  }

  const handleExecuteAction = async () => {
    if (!actionModal) return

    const botId = actionModal.id || actionModal.bot_id
    if (!actionTarget.trim()) {
      setActionError('Target is required')
      return
    }
    if (NEEDS_MESSAGE.includes(actionType) && !actionMessage.trim()) {
      setActionError('Message is required for this action')
      return
    }

    try {
      setExecuting(true)
      setActionError('')
      setActionSuccess('')

      const payload = {
        bot_id: botId,
        action: actionType,
        target_id: actionTarget.trim(),
        message: NEEDS_MESSAGE.includes(actionType) ? actionMessage.trim() : undefined,
        reaction: actionType === 'react' ? actionReaction : undefined,
      }

      await axios.post('/api/employee/bots/action', payload, {
        headers: getAuthHeaders(),
      })

      setActionSuccess('Action executed successfully')
      setActionMessage('')

      setTimeout(() => setActionSuccess(''), 3000)
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to execute action')
    } finally {
      setExecuting(false)
    }
  }

  if (loading) {
    return (
      <div className="bots-loading">
        <div className="bots-loading-spinner" />
        Loading bots...
      </div>
    )
  }

  const allSelected = bots.length > 0 && selectedIds.size === bots.length

  return (
    <div className="bots-page">
      {/* Header */}
      <div className="bots-header">
        <h2 className="bots-title">My Bots ({total})</h2>
        <div className="bots-header-actions">
          <button
            className="bots-btn bots-btn-success"
            onClick={() => handleToggleAll(true)}
            disabled={toggling}
          >
            Activate All
          </button>
          <button
            className="bots-btn bots-btn-danger"
            onClick={() => handleToggleAll(false)}
            disabled={toggling}
          >
            Deactivate All
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bots-alert bots-alert-error">
          {error}
          <button className="bots-alert-close" onClick={() => setError('')}>&times;</button>
        </div>
      )}
      {success && (
        <div className="bots-alert bots-alert-success">
          {success}
        </div>
      )}

      {/* Bulk Selection Bar */}
      {selectedIds.size > 0 && (
        <div className="bots-bulk-bar">
          <span>{selectedIds.size} bot(s) selected</span>
          <div className="bots-bulk-actions">
            <button
              className="bots-btn bots-btn-sm bots-btn-success"
              onClick={() => handleToggleSelected(true)}
              disabled={toggling}
            >
              Activate Selected
            </button>
            <button
              className="bots-btn bots-btn-sm bots-btn-danger"
              onClick={() => handleToggleSelected(false)}
              disabled={toggling}
            >
              Deactivate Selected
            </button>
            <button
              className="bots-btn bots-btn-sm bots-btn-ghost"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Bot Grid */}
      {bots.length === 0 ? (
        <div className="bots-empty">
          <p>No bots assigned to you yet.</p>
        </div>
      ) : (
        <>
          {/* Select All checkbox */}
          <div className="bots-select-all-row">
            <label className="bots-checkbox-label">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
                className="bots-checkbox"
              />
              <span>Select All</span>
            </label>
          </div>

          <div className="bots-grid">
            {bots.map(bot => {
              const botId = bot.id || bot.bot_id
              const isActive = bot.is_active === true || bot.is_active === 1
              const displayName = bot.display_name || bot.username || 'Bot'
              const avatarColor = bot.avatar_color || '#6c5ce7'
              const firstLetter = displayName[0]?.toUpperCase() || 'B'
              const isSelected = selectedIds.has(botId)

              return (
                <div
                  key={botId}
                  className={`bots-card ${isSelected ? 'selected' : ''}`}
                >
                  {/* Checkbox */}
                  <div className="bots-card-select">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectBot(botId)}
                      className="bots-checkbox"
                    />
                  </div>

                  {/* Avatar + Info */}
                  <div className="bots-card-identity">
                    <div
                      className="bots-avatar"
                      style={{ background: avatarColor }}
                    >
                      {firstLetter}
                    </div>
                    <div className="bots-card-info">
                      <div className="bots-card-name">{displayName}</div>
                      <div className="bots-card-username">@{bot.username || 'unknown'}</div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="bots-card-status-row">
                    <span className={`bots-status-badge ${isActive ? 'active' : 'inactive'}`}>
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="bots-card-actions">
                    <button
                      className={`bots-btn bots-btn-sm ${isActive ? 'bots-btn-warning' : 'bots-btn-success'}`}
                      onClick={() => handleToggleBot(botId, isActive)}
                      disabled={toggling}
                    >
                      {isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      className="bots-btn bots-btn-sm bots-btn-primary"
                      onClick={() => openActionModal(bot)}
                    >
                      Action
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Action Modal */}
      {actionModal && (
        <div className="bots-modal-overlay" onClick={closeActionModal}>
          <div className="bots-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="bots-modal-header">
              <h3>Bot Action</h3>
              <button className="bots-modal-close" onClick={closeActionModal}>&times;</button>
            </div>

            <div className="bots-modal-bot-info">
              <div
                className="bots-avatar bots-avatar-sm"
                style={{ background: actionModal.avatar_color || '#6c5ce7' }}
              >
                {(actionModal.display_name || actionModal.username || 'B')[0].toUpperCase()}
              </div>
              <div>
                <strong>{actionModal.display_name || actionModal.username}</strong>
                <span className="bots-modal-username">@{actionModal.username || 'unknown'}</span>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {/* Action Type Buttons */}
              <div className="bots-form-group">
                <label className="bots-label">Action Type</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ACTION_TYPES.map(at => (
                    <button
                      key={at.value}
                      onClick={() => { setActionType(at.value); setActionError(''); setActionTarget('') }}
                      style={{
                        padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                        cursor: 'pointer', border: '1px solid',
                        background: actionType === at.value ? '#6c5ce7' : 'transparent',
                        borderColor: actionType === at.value ? '#6c5ce7' : '#2d313a',
                        color: actionType === at.value ? '#fff' : '#aaa',
                      }}
                    >
                      {at.icon} {at.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Matches Browser - shown for match_chat */}
              {actionType === 'match_chat' && (
                <div className="bots-form-group">
                  <label className="bots-label">Select a Match</label>
                  {loadingMatches ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#888' }}>Loading matches...</div>
                  ) : liveMatches.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#666', background: '#0f1117', borderRadius: 8, border: '1px solid #2d313a' }}>
                      No live or scheduled matches right now
                    </div>
                  ) : (
                    <div style={{ maxHeight: 200, overflowY: 'auto', background: '#0f1117', border: '1px solid #2d313a', borderRadius: 8 }}>
                      {liveMatches.map(m => {
                        const isSelected = actionTarget === String(m.match_key || m.id)
                        const isLive = ['1H', '2H', 'HT', 'ET', 'LIVE'].includes(m.status)
                        return (
                          <div
                            key={m.id || m.match_key}
                            onClick={() => selectMatch(m)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '10px 14px', cursor: 'pointer',
                              borderBottom: '1px solid #2d313a',
                              background: isSelected ? 'rgba(108,92,231,0.15)' : 'transparent',
                              borderLeft: isSelected ? '3px solid #6c5ce7' : '3px solid transparent',
                            }}
                            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7' }}>
                                {m.home_team} vs {m.away_team}
                              </div>
                              <div style={{ fontSize: 11, color: '#8b8fa3', marginTop: 2 }}>
                                {m.league}{m.score && m.score !== '0-0' ? ` | ${m.score}` : ''}{m.minute ? ` | ${m.minute}'` : ''}
                              </div>
                            </div>
                            <span style={{
                              padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                              background: isLive ? 'rgba(231,76,60,0.15)' : 'rgba(52,152,219,0.15)',
                              color: isLive ? '#e74c3c' : '#3498db',
                            }}>
                              {isLive ? 'LIVE' : m.status || 'Scheduled'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <button
                    onClick={fetchLiveMatches}
                    style={{ marginTop: 4, background: 'none', border: 'none', color: '#6c5ce7', cursor: 'pointer', fontSize: 12 }}
                  >
                    Refresh matches
                  </button>
                </div>
              )}

              {/* Predictions Browser - shown for comment, react, prediction_chat */}
              {['comment', 'react', 'prediction_chat'].includes(actionType) && (
                <div className="bots-form-group">
                  <label className="bots-label">Browse Predictions</label>
                  <input
                    type="text"
                    className="bots-input"
                    value={predictionSearch}
                    onChange={(e) => {
                      const val = e.target.value
                      setPredictionSearch(val)
                      if (predSearchTimer.current) clearTimeout(predSearchTimer.current)
                      predSearchTimer.current = setTimeout(() => fetchPredictions(1, val), 400)
                    }}
                    placeholder="Search predictions by user or match..."
                    style={{ marginBottom: 8 }}
                  />
                  {loadingPredictions ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#888' }}>Loading predictions...</div>
                  ) : predictions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#666', background: '#0f1117', borderRadius: 8, border: '1px solid #2d313a' }}>
                      No predictions found
                    </div>
                  ) : (
                    <div style={{ maxHeight: 240, overflowY: 'auto', background: '#0f1117', border: '1px solid #2d313a', borderRadius: 8 }}>
                      {predictions.map(p => {
                        const isSelected = actionTarget === String(p.id)
                        return (
                          <div
                            key={p.id}
                            onClick={() => selectPrediction(p)}
                            style={{
                              padding: '10px 14px', cursor: 'pointer',
                              borderBottom: '1px solid #2d313a',
                              background: isSelected ? 'rgba(108,92,231,0.15)' : 'transparent',
                              borderLeft: isSelected ? '3px solid #6c5ce7' : '3px solid transparent',
                            }}
                            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <div className="bots-avatar" style={{ background: p.avatar_color || '#6c5ce7', width: 24, height: 24, fontSize: 10 }}>
                                {(p.display_name || '?')[0].toUpperCase()}
                              </div>
                              <strong style={{ fontSize: 13, color: '#e4e4e7' }}>{p.display_name}</strong>
                              <span style={{ color: '#666', fontSize: 11 }}>@{p.username}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#b0b3c6', marginBottom: 3 }}>
                              {p.match_description || 'Match prediction'}
                            </div>
                            <div style={{ fontSize: 12, color: '#8b8fa3', marginBottom: 6, fontStyle: 'italic' }}>
                              &ldquo;{p.prediction_text?.substring(0, 80)}{p.prediction_text?.length > 80 ? '...' : ''}&rdquo;
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11 }}>
                              <span style={{ color: '#2ecc71' }}>{'\uD83D\uDC4D'} {p.likes || 0}</span>
                              <span style={{ color: '#e74c3c' }}>{'\uD83D\uDC4E'} {p.dislikes || 0}</span>
                              <span style={{ color: '#888' }}>{'\uD83D\uDCAC'} {p.comment_count || 0}</span>
                              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handlePredictionQuickAction(p, 'react') }}
                                  disabled={executing}
                                  style={{
                                    background: 'rgba(46,204,113,0.12)', border: '1px solid rgba(46,204,113,0.25)',
                                    color: '#2ecc71', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11,
                                  }}
                                  title="Like this prediction"
                                >
                                  {'\uD83D\uDC4D'} Like
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handlePredictionQuickAction(p, 'follow') }}
                                  disabled={executing}
                                  style={{
                                    background: 'rgba(108,92,231,0.12)', border: '1px solid rgba(108,92,231,0.25)',
                                    color: '#a29bfe', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11,
                                  }}
                                  title="Follow this user"
                                >
                                  + Follow
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {predictionTotalPages > 1 && (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 8 }}>
                      <button
                        onClick={() => fetchPredictions(predictionPage - 1, predictionSearch)}
                        disabled={predictionPage <= 1 || loadingPredictions}
                        style={{ background: 'none', border: '1px solid #2d313a', color: '#aaa', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
                      >
                        Prev
                      </button>
                      <span style={{ fontSize: 12, color: '#888', padding: '3px 8px' }}>
                        {predictionPage} / {predictionTotalPages}
                      </span>
                      <button
                        onClick={() => fetchPredictions(predictionPage + 1, predictionSearch)}
                        disabled={predictionPage >= predictionTotalPages || loadingPredictions}
                        style={{ background: 'none', border: '1px solid #2d313a', color: '#aaa', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* User search for follow/unfollow targets */}
              {['follow', 'unfollow'].includes(actionType) && (
                <div className="bots-form-group">
                  <label className="bots-label">Search Users</label>
                  <input
                    type="text"
                    className="bots-input"
                    value={userSearch}
                    onChange={(e) => searchUsers(e.target.value)}
                    placeholder="Search users by name or username..."
                    style={{ marginBottom: 4 }}
                  />
                  {userResults.length > 0 && (
                    <div style={{
                      background: '#0f1117', border: '1px solid #2d313a', borderRadius: 6,
                      maxHeight: 160, overflowY: 'auto'
                    }}>
                      {userResults.map(u => (
                        <div
                          key={u.id}
                          onClick={() => selectUserTarget(u)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 10px', cursor: 'pointer', fontSize: 13,
                            borderBottom: '1px solid #2d313a',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(108,92,231,0.1)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <div className="bots-avatar" style={{ background: u.avatar_color || '#6c5ce7', width: 26, height: 26, fontSize: 11 }}>
                            {(u.display_name || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <strong style={{ color: '#e4e4e7' }}>{u.display_name}</strong>
                            <span style={{ color: '#888', marginLeft: 6 }}>@{u.username}</span>
                          </div>
                          <span style={{ marginLeft: 'auto', color: '#555', fontSize: 11 }}>ID: {u.id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Target ID */}
              <div className="bots-form-group">
                <label className="bots-label">{ACTION_TYPES.find(a => a.value === actionType)?.targetLabel || 'Target ID'}</label>
                <input
                  type="text"
                  className="bots-input"
                  value={actionTarget}
                  onChange={e => setActionTarget(e.target.value)}
                  placeholder={`Enter ${(ACTION_TYPES.find(a => a.value === actionType)?.targetLabel || 'target ID').toLowerCase()}...`}
                />
              </div>

              {/* Message textarea */}
              {NEEDS_MESSAGE.includes(actionType) && (
                <div className="bots-form-group">
                  <label className="bots-label">Message</label>
                  <textarea
                    className="bots-textarea"
                    value={actionMessage}
                    onChange={e => setActionMessage(e.target.value)}
                    placeholder="Enter message..."
                    rows={3}
                  />
                </div>
              )}

              {/* Reaction radio */}
              {actionType === 'react' && (
                <div className="bots-form-group">
                  <label className="bots-label">Reaction</label>
                  <div className="bots-radio-group">
                    <label className="bots-radio-label">
                      <input
                        type="radio" name="reaction" value="like"
                        checked={actionReaction === 'like'}
                        onChange={() => setActionReaction('like')}
                      />
                      <span>{'\uD83D\uDC4D'} Like</span>
                    </label>
                    <label className="bots-radio-label">
                      <input
                        type="radio" name="reaction" value="dislike"
                        checked={actionReaction === 'dislike'}
                        onChange={() => setActionReaction('dislike')}
                      />
                      <span>{'\uD83D\uDC4E'} Dislike</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Action Alerts */}
              {actionError && (
                <div className="bots-alert bots-alert-error" style={{ margin: '0 0 12px 0' }}>
                  {actionError}
                </div>
              )}
              {actionSuccess && (
                <div className="bots-alert bots-alert-success" style={{ margin: '0 0 12px 0' }}>
                  {actionSuccess}
                </div>
              )}

              <button
                type="button"
                className="bots-btn bots-btn-primary bots-btn-block"
                onClick={handleExecuteAction}
                disabled={executing || !actionTarget.trim() || (NEEDS_MESSAGE.includes(actionType) && !actionMessage.trim())}
              >
                {executing ? 'Executing...' : 'Execute Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* ─── Bots Page (Dark Theme) ─── */
        .bots-page {
          padding: 24px;
          color: #e0e0e0;
          min-height: 100%;
        }

        /* Header */
        .bots-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 20px;
        }
        .bots-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }
        .bots-header-actions {
          display: flex;
          gap: 8px;
        }

        /* Buttons */
        .bots-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .bots-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .bots-btn-primary {
          background: #6c5ce7;
          color: #fff;
        }
        .bots-btn-primary:hover:not(:disabled) {
          background: #5b4bd5;
        }
        .bots-btn-success {
          background: rgba(46, 204, 113, 0.15);
          border: 1px solid rgba(46, 204, 113, 0.3);
          color: #2ecc71;
        }
        .bots-btn-success:hover:not(:disabled) {
          background: rgba(46, 204, 113, 0.25);
        }
        .bots-btn-danger {
          background: rgba(231, 76, 60, 0.12);
          border: 1px solid rgba(231, 76, 60, 0.25);
          color: #e74c3c;
        }
        .bots-btn-danger:hover:not(:disabled) {
          background: rgba(231, 76, 60, 0.2);
        }
        .bots-btn-warning {
          background: rgba(243, 156, 18, 0.12);
          border: 1px solid rgba(243, 156, 18, 0.25);
          color: #f39c12;
        }
        .bots-btn-warning:hover:not(:disabled) {
          background: rgba(243, 156, 18, 0.2);
        }
        .bots-btn-ghost {
          background: transparent;
          border: 1px solid #2d313a;
          color: #8b8fa3;
        }
        .bots-btn-ghost:hover:not(:disabled) {
          background: rgba(255,255,255,0.05);
          color: #c0c4d6;
        }
        .bots-btn-sm {
          padding: 5px 12px;
          font-size: 0.78rem;
        }
        .bots-btn-block {
          width: 100%;
        }

        /* Alerts */
        .bots-alert {
          padding: 10px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 0.88rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .bots-alert-error {
          background: rgba(231, 76, 60, 0.15);
          border: 1px solid rgba(231, 76, 60, 0.3);
          color: #e74c3c;
        }
        .bots-alert-success {
          background: rgba(46, 204, 113, 0.15);
          border: 1px solid rgba(46, 204, 113, 0.3);
          color: #2ecc71;
        }
        .bots-alert-close {
          background: none;
          border: none;
          color: inherit;
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
          opacity: 0.7;
        }
        .bots-alert-close:hover {
          opacity: 1;
        }

        /* Bulk Selection Bar */
        .bots-bulk-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          padding: 10px 16px;
          background: rgba(108, 92, 231, 0.08);
          border: 1px solid rgba(108, 92, 231, 0.2);
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 0.88rem;
          color: #c0c4d6;
        }
        .bots-bulk-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        /* Select All Row */
        .bots-select-all-row {
          margin-bottom: 12px;
          padding: 0 4px;
        }
        .bots-checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          color: #8b8fa3;
          cursor: pointer;
          user-select: none;
        }
        .bots-checkbox-label:hover {
          color: #c0c4d6;
        }
        .bots-checkbox {
          width: 16px;
          height: 16px;
          accent-color: #6c5ce7;
          cursor: pointer;
        }

        /* Bot Grid */
        .bots-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 14px;
        }

        /* Bot Card */
        .bots-card {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: border-color 0.2s, background 0.2s;
        }
        .bots-card:hover {
          border-color: #3a3f4b;
        }
        .bots-card.selected {
          border-color: rgba(108, 92, 231, 0.5);
          background: rgba(108, 92, 231, 0.04);
        }

        .bots-card-select {
          position: relative;
        }

        .bots-card-identity {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .bots-avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
        }
        .bots-avatar-sm {
          width: 34px;
          height: 34px;
          font-size: 13px;
        }

        .bots-card-info {
          min-width: 0;
        }
        .bots-card-name {
          font-size: 0.95rem;
          font-weight: 600;
          color: #e4e4e7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .bots-card-username {
          font-size: 0.8rem;
          color: #8b8fa3;
        }

        /* Status Badge */
        .bots-card-status-row {
          display: flex;
          align-items: center;
        }
        .bots-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .bots-status-badge::before {
          content: '';
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .bots-status-badge.active {
          background: rgba(46, 204, 113, 0.15);
          color: #2ecc71;
        }
        .bots-status-badge.active::before {
          background: #2ecc71;
        }
        .bots-status-badge.inactive {
          background: rgba(139, 143, 163, 0.15);
          color: #8b8fa3;
        }
        .bots-status-badge.inactive::before {
          background: #8b8fa3;
        }

        /* Card Actions */
        .bots-card-actions {
          display: flex;
          gap: 8px;
          margin-top: auto;
        }

        /* Empty State */
        .bots-empty {
          text-align: center;
          padding: 60px 20px;
          color: #8b8fa3;
          font-size: 0.95rem;
        }
        .bots-empty p {
          margin: 0;
        }

        /* Loading */
        .bots-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          color: #8b8fa3;
          font-size: 0.92rem;
          gap: 12px;
        }
        .bots-loading-spinner {
          width: 36px;
          height: 36px;
          border: 3px solid #2a2d38;
          border-top-color: #6c5ce7;
          border-radius: 50%;
          animation: bots-spin 0.8s linear infinite;
        }
        @keyframes bots-spin {
          to { transform: rotate(360deg); }
        }

        /* ─── Modal ─── */
        .bots-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .bots-modal {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 12px;
          width: 100%;
          max-width: 480px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
          animation: bots-modal-in 0.2s ease;
        }
        @keyframes bots-modal-in {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .bots-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #2d313a;
        }
        .bots-modal-header h3 {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 600;
          color: #ffffff;
        }
        .bots-modal-close {
          background: none;
          border: none;
          color: #8b8fa3;
          font-size: 22px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
          transition: color 0.15s;
        }
        .bots-modal-close:hover {
          color: #e4e4e7;
        }

        .bots-modal-bot-info {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          background: rgba(108, 92, 231, 0.05);
          border-bottom: 1px solid #2d313a;
        }
        .bots-modal-bot-info strong {
          font-size: 0.92rem;
          color: #e4e4e7;
        }
        .bots-modal-username {
          display: block;
          font-size: 0.78rem;
          color: #8b8fa3;
        }

        /* Form inside modal */
        .bots-modal-form {
          padding: 20px;
        }
        .bots-form-group {
          margin-bottom: 16px;
        }
        .bots-label {
          display: block;
          font-size: 0.82rem;
          font-weight: 600;
          color: #c0c4d6;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .bots-select,
        .bots-input,
        .bots-textarea {
          width: 100%;
          padding: 9px 12px;
          background: #0f1117;
          border: 1px solid #2d313a;
          border-radius: 6px;
          color: #e4e4e7;
          font-size: 0.88rem;
          font-family: inherit;
          outline: none;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .bots-select:focus,
        .bots-input:focus,
        .bots-textarea:focus {
          border-color: #6c5ce7;
        }
        .bots-input::placeholder,
        .bots-textarea::placeholder {
          color: #8b8fa3;
        }
        .bots-textarea {
          resize: vertical;
          min-height: 60px;
        }
        .bots-select {
          cursor: pointer;
        }

        /* Radio group */
        .bots-radio-group {
          display: flex;
          gap: 20px;
        }
        .bots-radio-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.88rem;
          color: #c0c4d6;
          cursor: pointer;
        }
        .bots-radio-label input[type="radio"] {
          accent-color: #6c5ce7;
          cursor: pointer;
        }

        /* Responsive */
        @media (max-width: 640px) {
          .bots-page {
            padding: 16px;
          }
          .bots-header {
            flex-direction: column;
            align-items: flex-start;
          }
          .bots-grid {
            grid-template-columns: 1fr;
          }
          .bots-bulk-bar {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  )
}
