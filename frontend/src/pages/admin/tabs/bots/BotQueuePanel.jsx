import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

const QUEUE_ACTION_TYPES = [
  { value: 'match_chat', label: 'Live Chat', icon: '\u26BD' },
  { value: 'prediction_chat', label: 'Prediction Chat', icon: '\uD83D\uDCAC' },
  { value: 'comment', label: 'Comment on Prediction', icon: '\uD83D\uDCDD' },
]

export default function BotQueuePanel({ getAuthHeaders, selectedBotIds: externalSelectedIds }) {
  // --- Create Queue Form State ---
  const [actionType, setActionType] = useState('match_chat')
  const [targetId, setTargetId] = useState('')
  const [message, setMessage] = useState('')
  const [messageMode, setMessageMode] = useState('same') // 'same' | 'varied' | 'bulk'
  const [variedMessages, setVariedMessages] = useState(false)
  const [messagesList, setMessagesList] = useState(['', ''])
  const [bulkText, setBulkText] = useState('')
  const [delayMin, setDelayMin] = useState(30)
  const [delayMax, setDelayMax] = useState(40)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  // --- Bot selector state ---
  const [allBots, setAllBots] = useState([])
  const [loadingBots, setLoadingBots] = useState(false)
  const [localSelectedIds, setLocalSelectedIds] = useState([])
  const [botSearch, setBotSearch] = useState('')
  const [botSelectorOpen, setBotSelectorOpen] = useState(false)

  // Merge external selections with local — local takes priority once user interacts
  const selectedBotIds = localSelectedIds.length > 0 ? localSelectedIds : (externalSelectedIds || [])

  // --- Target selection data ---
  const [liveMatches, setLiveMatches] = useState([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [predictions, setPredictions] = useState([])
  const [loadingPredictions, setLoadingPredictions] = useState(false)
  const [predictionPage, setPredictionPage] = useState(1)
  const [predictionTotalPages, setPredictionTotalPages] = useState(1)

  // --- Active Queues State ---
  const [activeQueues, setActiveQueues] = useState([])
  const [loadingQueues, setLoadingQueues] = useState(false)
  const [queueStatuses, setQueueStatuses] = useState({})
  const pollInterval = useRef(null)
  const queuePollInterval = useRef(null)

  // --- Fetch all bots for selector ---
  useEffect(() => {
    const fetchBots = async () => {
      setLoadingBots(true)
      try {
        const res = await axios.get('/api/admin/bots', { headers: getAuthHeaders() })
        setAllBots((res.data.bots || []).filter(b => b.is_active !== false))
      } catch { setAllBots([]) }
      setLoadingBots(false)
    }
    fetchBots()
  }, [])

  // Sync external selections when they change (if user hasn't made local selections)
  useEffect(() => {
    if (externalSelectedIds?.length > 0 && localSelectedIds.length === 0) {
      setLocalSelectedIds(externalSelectedIds)
    }
  }, [externalSelectedIds])

  // --- Fetch targets based on action type ---
  useEffect(() => {
    setTargetId('')
    if (actionType === 'match_chat') {
      fetchLiveMatches()
    } else {
      fetchPredictions(1)
    }
  }, [actionType])

  // --- Poll active queues every 5 seconds ---
  useEffect(() => {
    fetchActiveQueues()
    pollInterval.current = setInterval(fetchActiveQueues, 5000)
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current)
    }
  }, [])

  // --- Poll individual running queues every 5 seconds ---
  useEffect(() => {
    if (queuePollInterval.current) clearInterval(queuePollInterval.current)

    const runningQueues = activeQueues.filter(q => q.status === 'running')
    if (runningQueues.length === 0) return

    const pollRunning = async () => {
      const updates = {}
      for (const q of runningQueues) {
        try {
          const res = await axios.get(`/api/admin/bots/queue-status/${q.batch_id}`, {
            headers: getAuthHeaders(),
          })
          updates[q.batch_id] = res.data
        } catch {
          // ignore individual failures
        }
      }
      setQueueStatuses(prev => ({ ...prev, ...updates }))
    }

    pollRunning()
    queuePollInterval.current = setInterval(pollRunning, 5000)

    return () => {
      if (queuePollInterval.current) clearInterval(queuePollInterval.current)
    }
  }, [activeQueues])

  // --- Clear success message after 5 seconds ---
  useEffect(() => {
    if (!formSuccess) return
    const timer = setTimeout(() => setFormSuccess(''), 5000)
    return () => clearTimeout(timer)
  }, [formSuccess])

  const fetchLiveMatches = async () => {
    setLoadingMatches(true)
    try {
      const res = await axios.get('/api/admin/bots/live-matches', { headers: getAuthHeaders() })
      setLiveMatches(res.data.matches || [])
    } catch {
      setLiveMatches([])
    }
    setLoadingMatches(false)
  }

  const fetchPredictions = async (pg = 1) => {
    setLoadingPredictions(true)
    try {
      const res = await axios.get('/api/admin/bots/predictions', {
        headers: getAuthHeaders(),
        params: { page: pg },
      })
      setPredictions(res.data.predictions || [])
      setPredictionPage(res.data.page || 1)
      setPredictionTotalPages(res.data.total_pages || 1)
    } catch {
      setPredictions([])
    }
    setLoadingPredictions(false)
  }

  const fetchActiveQueues = async () => {
    try {
      const res = await axios.get('/api/admin/bots/active-queues', { headers: getAuthHeaders() })
      setActiveQueues(res.data.queues || res.data || [])
    } catch {
      // ignore
    }
  }

  const handleCancelQueue = async (batchId) => {
    try {
      await axios.post(`/api/admin/bots/queue-cancel/${batchId}`, {}, { headers: getAuthHeaders() })
      fetchActiveQueues()
    } catch {
      // ignore
    }
  }

  const selectMatch = (match) => {
    setTargetId(String(match.match_key || match.id))
  }

  const selectPrediction = (pred) => {
    setTargetId(String(pred.id))
  }

  const handleAddMessage = () => {
    if (messagesList.length >= 10) return
    setMessagesList(prev => [...prev, ''])
  }

  const handleRemoveMessage = (index) => {
    if (messagesList.length <= 2) return
    setMessagesList(prev => prev.filter((_, i) => i !== index))
  }

  const handleMessageChange = (index, value) => {
    setMessagesList(prev => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const handleStartQueue = async () => {
    setFormError('')
    setFormSuccess('')

    if (!selectedBotIds || selectedBotIds.length === 0) {
      setFormError('No bots selected. Select bots from the bot selector above.')
      return
    }
    if (!targetId.trim()) {
      setFormError('Please select a target.')
      return
    }

    // Build messages list based on mode
    let finalMessagesList = []
    let finalMessage = ''

    if (messageMode === 'bulk') {
      const lines = bulkText.split('\n').filter(l => l.trim())
      if (lines.length === 0) {
        setFormError('Please enter at least one message (one per line).')
        return
      }
      if (lines.length < selectedBotIds.length) {
        setFormError(`You have ${selectedBotIds.length} bots but only ${lines.length} messages. Add more messages or select fewer bots.`)
        return
      }
      // Take exactly as many messages as bots, in order
      finalMessagesList = lines.slice(0, selectedBotIds.length).map(l => l.trim())
    } else if (messageMode === 'varied') {
      const validMessages = messagesList.filter(m => m.trim())
      if (validMessages.length === 0) {
        setFormError('Please enter at least one message.')
        return
      }
      finalMessagesList = validMessages
    } else {
      if (!message.trim()) {
        setFormError('Please enter a message.')
        return
      }
      finalMessage = message.trim()
    }

    if (delayMin < 0 || delayMax < 0) {
      setFormError('Delay values must be positive.')
      return
    }
    if (delayMin > delayMax) {
      setFormError('Min delay cannot be greater than max delay.')
      return
    }

    setSubmitting(true)
    try {
      const body = {
        bot_ids: selectedBotIds,
        action: actionType,
        target_id: targetId.trim(),
        message: finalMessage,
        delay_min: Number(delayMin),
        delay_max: Number(delayMax),
        messages_list: finalMessagesList,
      }
      await axios.post('/api/admin/bots/staggered-batch', body, { headers: getAuthHeaders() })
      setFormSuccess(`Queue started with ${selectedBotIds.length} bots! You can start another batch now — select different bots, action, or target below.`)
      setMessage('')
      setMessagesList(['', ''])
      setBulkText('')
      setTargetId('')
      fetchActiveQueues()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to start queue.')
    }
    setSubmitting(false)
  }

  const getQueueData = (queue) => {
    const status = queueStatuses[queue.batch_id]
    if (status) return status
    return queue
  }

  const formatEta = (seconds) => {
    if (!seconds || seconds <= 0) return 'Done'
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  const getStatusBadge = (status) => {
    if (status === 'running') {
      return { background: 'rgba(241,196,15,0.15)', color: '#f1c40f', border: 'rgba(241,196,15,0.3)', text: 'Running' }
    }
    if (status === 'completed') {
      return { background: 'rgba(46,204,113,0.15)', color: '#2ecc71', border: 'rgba(46,204,113,0.3)', text: 'Completed' }
    }
    if (status === 'cancelled') {
      return { background: 'rgba(231,76,60,0.15)', color: '#e74c3c', border: 'rgba(231,76,60,0.3)', text: 'Cancelled' }
    }
    return { background: 'rgba(149,165,166,0.15)', color: '#95a5a6', border: 'rgba(149,165,166,0.3)', text: status || 'Unknown' }
  }

  return (
    <div className="bot-queue-panel">
      {/* ========== SECTION 1: Create Queue Form ========== */}
      <div className="bot-queue-section">
        <h3 className="bot-queue-section-title">
          Create Staggered Queue
          {activeQueues.filter(q => q.status === 'running').length > 0 && (
            <span className="bot-queue-running-badge">
              {activeQueues.filter(q => q.status === 'running').length} running
            </span>
          )}
        </h3>

        {formError && (
          <div className="bot-queue-error">
            {formError}
          </div>
        )}
        {formSuccess && (
          <div className="bot-queue-success">
            {formSuccess}
          </div>
        )}

        {/* Action type selector */}
        <div className="bot-queue-field">
          <label className="bot-queue-label">Action Type</label>
          <div className="bot-queue-action-buttons">
            {QUEUE_ACTION_TYPES.map(at => (
              <button
                key={at.value}
                onClick={() => setActionType(at.value)}
                className={`bot-queue-action-btn ${actionType === at.value ? 'bot-queue-action-btn-active' : ''}`}
              >
                {at.icon} {at.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bot selector */}
        <div className="bot-queue-field">
          <label className="bot-queue-label">Select Bots</label>
          <div className="bot-queue-bot-selector">
            <div
              className="bot-queue-bot-selector-header"
              onClick={() => setBotSelectorOpen(!botSelectorOpen)}
            >
              <span>{selectedBotIds.length} bot{selectedBotIds.length !== 1 ? 's' : ''} selected</span>
              <span style={{ fontSize: '12px' }}>{botSelectorOpen ? '\u25B2' : '\u25BC'}</span>
            </div>
            {botSelectorOpen && (
              <div className="bot-queue-bot-selector-dropdown">
                <input
                  type="text"
                  placeholder="Search bots..."
                  value={botSearch}
                  onChange={e => setBotSearch(e.target.value)}
                  className="bot-queue-bot-search"
                />
                <div className="bot-queue-bot-selector-actions">
                  <button onClick={() => {
                    const filtered = allBots.filter(b => !botSearch || b.username?.toLowerCase().includes(botSearch.toLowerCase()))
                    setLocalSelectedIds(prev => {
                      const ids = new Set(prev)
                      filtered.forEach(b => ids.add(b.id))
                      return [...ids]
                    })
                  }} className="bot-queue-bot-select-action">Select All{botSearch ? ' filtered' : ''}</button>
                  <button onClick={() => {
                    if (botSearch) {
                      const filtered = allBots.filter(b => b.username?.toLowerCase().includes(botSearch.toLowerCase()))
                      const filterIds = new Set(filtered.map(b => b.id))
                      setLocalSelectedIds(prev => prev.filter(id => !filterIds.has(id)))
                    } else {
                      setLocalSelectedIds([])
                    }
                  }} className="bot-queue-bot-select-action">Deselect All{botSearch ? ' filtered' : ''}</button>
                </div>
                <div className="bot-queue-bot-list">
                  {loadingBots ? (
                    <div className="bot-queue-loading-text">Loading bots...</div>
                  ) : (
                    allBots
                      .filter(b => !botSearch || b.username?.toLowerCase().includes(botSearch.toLowerCase()))
                      .map(bot => (
                        <label key={bot.id} className="bot-queue-bot-item">
                          <input
                            type="checkbox"
                            checked={localSelectedIds.includes(bot.id)}
                            onChange={() => {
                              setLocalSelectedIds(prev =>
                                prev.includes(bot.id)
                                  ? prev.filter(id => id !== bot.id)
                                  : [...prev, bot.id]
                              )
                            }}
                          />
                          <span className="bot-queue-bot-name">{bot.username}</span>
                        </label>
                      ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Target selector: Live Matches */}
        {actionType === 'match_chat' && (
          <div className="bot-queue-field">
            <label className="bot-queue-label">Select a Match</label>
            {loadingMatches ? (
              <div className="bot-queue-loading-text">Loading matches...</div>
            ) : liveMatches.length === 0 ? (
              <div className="bot-queue-empty-list">
                No live or scheduled matches available.
                <button onClick={fetchLiveMatches} className="bot-queue-refresh-btn">
                  Refresh
                </button>
              </div>
            ) : (
              <div className="bot-queue-target-list">
                {liveMatches.map(m => {
                  const matchId = String(m.match_key || m.id)
                  const isSelected = targetId === matchId
                  const isLive = ['1H', '2H', 'HT', 'ET', 'LIVE'].includes(m.status)
                  return (
                    <div
                      key={m.id || m.match_key}
                      onClick={() => selectMatch(m)}
                      className={`bot-queue-target-item ${isSelected ? 'bot-queue-target-item-selected' : ''}`}
                    >
                      <div className="bot-queue-target-item-main">
                        <div className="bot-queue-match-teams">
                          {m.home_team} vs {m.away_team}
                        </div>
                        <div className="bot-queue-match-details">
                          {m.league}
                          {m.score && m.score !== '0-0' ? ` | ${m.score}` : ''}
                          {m.minute ? ` | ${m.minute}'` : ''}
                        </div>
                      </div>
                      <span className={`bot-queue-match-status ${isLive ? 'bot-queue-match-live' : 'bot-queue-match-scheduled'}`}>
                        {isLive ? 'LIVE' : m.status || 'Scheduled'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            <button onClick={fetchLiveMatches} className="bot-queue-refresh-btn" style={{ marginTop: 4 }}>
              Refresh matches
            </button>
          </div>
        )}

        {/* Target selector: Predictions */}
        {(actionType === 'prediction_chat' || actionType === 'comment') && (
          <div className="bot-queue-field">
            <label className="bot-queue-label">Select a Prediction</label>
            {loadingPredictions ? (
              <div className="bot-queue-loading-text">Loading predictions...</div>
            ) : predictions.length === 0 ? (
              <div className="bot-queue-empty-list">
                No predictions found.
              </div>
            ) : (
              <div className="bot-queue-target-list">
                {predictions.map(p => {
                  const isSelected = targetId === String(p.id)
                  return (
                    <div
                      key={p.id}
                      onClick={() => selectPrediction(p)}
                      className={`bot-queue-target-item ${isSelected ? 'bot-queue-target-item-selected' : ''}`}
                    >
                      <div className="bot-queue-prediction-header">
                        <span
                          className="admin-user-avatar-sm"
                          style={{ background: p.avatar_color || '#6c5ce7', width: 24, height: 24, fontSize: 10 }}
                        >
                          {(p.display_name || '?')[0].toUpperCase()}
                        </span>
                        <strong className="bot-queue-prediction-author">{p.display_name}</strong>
                        <span className="bot-queue-prediction-username">@{p.username}</span>
                      </div>
                      <div className="bot-queue-prediction-match">
                        {p.match_description || 'Match prediction'}
                      </div>
                      <div className="bot-queue-prediction-text">
                        &ldquo;{p.prediction_text?.substring(0, 100)}{p.prediction_text?.length > 100 ? '...' : ''}&rdquo;
                      </div>
                      <div className="bot-queue-prediction-stats">
                        <span style={{ color: '#2ecc71' }}>{'\uD83D\uDC4D'} {p.likes || 0}</span>
                        <span style={{ color: '#e74c3c' }}>{'\uD83D\uDC4E'} {p.dislikes || 0}</span>
                        <span style={{ color: '#888' }}>{'\uD83D\uDCAC'} {p.comment_count || 0}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {predictionTotalPages > 1 && (
              <div className="bot-queue-pagination">
                <button
                  onClick={() => fetchPredictions(predictionPage - 1)}
                  disabled={predictionPage <= 1 || loadingPredictions}
                  className="bot-queue-page-btn"
                >
                  Prev
                </button>
                <span className="bot-queue-page-info">
                  {predictionPage} / {predictionTotalPages}
                </span>
                <button
                  onClick={() => fetchPredictions(predictionPage + 1)}
                  disabled={predictionPage >= predictionTotalPages || loadingPredictions}
                  className="bot-queue-page-btn"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* Selected target display */}
        {targetId && (
          <div className="bot-queue-selected-target">
            Selected target: <strong>{targetId}</strong>
            <button
              onClick={() => setTargetId('')}
              className="bot-queue-clear-target"
            >
              Clear
            </button>
          </div>
        )}

        {/* Message mode selector */}
        <div className="bot-queue-field">
          <label className="bot-queue-label">Message Mode</label>
          <div className="bot-queue-action-buttons">
            <button
              onClick={() => { setMessageMode('same'); setVariedMessages(false) }}
              className={`bot-queue-action-btn ${messageMode === 'same' ? 'bot-queue-action-btn-active' : ''}`}
            >
              Same Message
            </button>
            <button
              onClick={() => { setMessageMode('varied'); setVariedMessages(true) }}
              className={`bot-queue-action-btn ${messageMode === 'varied' ? 'bot-queue-action-btn-active' : ''}`}
            >
              Varied (Cycle)
            </button>
            <button
              onClick={() => { setMessageMode('bulk'); setVariedMessages(false) }}
              className={`bot-queue-action-btn ${messageMode === 'bulk' ? 'bot-queue-action-btn-active' : ''}`}
            >
              Bulk Paste
            </button>
          </div>
          <div className="bot-queue-toggle-hint">
            {messageMode === 'same' && 'All bots send the same message.'}
            {messageMode === 'varied' && 'Each bot sends a different message, cycling through the list below.'}
            {messageMode === 'bulk' && 'Paste one message per line. Each line goes to one bot in order.'}
          </div>
        </div>

        {/* Message input based on mode */}
        {messageMode === 'bulk' ? (
          <div className="bot-queue-field">
            <label className="bot-queue-label">
              Messages — one per line
              <span className="bot-queue-bulk-counter" style={{
                marginLeft: 8,
                fontSize: 12,
                color: bulkText.split('\n').filter(l => l.trim()).length === (selectedBotIds?.length || 0) ? '#2ecc71' :
                       bulkText.split('\n').filter(l => l.trim()).length < (selectedBotIds?.length || 0) ? '#e74c3c' : '#f39c12'
              }}>
                {bulkText.split('\n').filter(l => l.trim()).length} / {selectedBotIds?.length || 0} messages
              </span>
            </label>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              className="bot-queue-textarea bot-queue-bulk-textarea"
              placeholder={`Paste ${selectedBotIds?.length || 'your'} messages here, one per line:\nGreat match so far! ⚽\nThis team is on fire 🔥\nCome on boys! 💪\n...`}
              rows={Math.min(Math.max(selectedBotIds?.length || 5, 5), 20)}
            />
            <div className="bot-queue-bulk-info">
              {(() => {
                const lineCount = bulkText.split('\n').filter(l => l.trim()).length
                const botCount = selectedBotIds?.length || 0
                if (botCount === 0) return 'Select bots first to see the message limit.'
                if (lineCount === 0) return `Enter ${botCount} messages — one per line. Line 1 → Bot 1, Line 2 → Bot 2, etc.`
                if (lineCount < botCount) return `Need ${botCount - lineCount} more message${botCount - lineCount > 1 ? 's' : ''}. Each bot needs its own line.`
                if (lineCount === botCount) return `Perfect! ${lineCount} messages for ${botCount} bots.`
                return `${lineCount} messages entered. Only the first ${botCount} will be used (one per bot).`
              })()}
            </div>
          </div>
        ) : messageMode === 'varied' ? (
          <div className="bot-queue-field">
            <label className="bot-queue-label">Messages ({messagesList.length}/10)</label>
            {messagesList.map((msg, index) => (
              <div key={index} className="bot-queue-varied-message-row">
                <span className="bot-queue-varied-message-index">{index + 1}.</span>
                <textarea
                  value={msg}
                  onChange={(e) => handleMessageChange(index, e.target.value)}
                  className="bot-queue-textarea"
                  placeholder={`Message variant ${index + 1}...`}
                  rows={2}
                />
                {messagesList.length > 2 && (
                  <button
                    onClick={() => handleRemoveMessage(index)}
                    className="bot-queue-remove-message-btn"
                    title="Remove this message"
                  >
                    {'\u2716'}
                  </button>
                )}
              </div>
            ))}
            {messagesList.length < 10 && (
              <button onClick={handleAddMessage} className="bot-queue-add-message-btn">
                + Add another
              </button>
            )}
          </div>
        ) : (
          <div className="bot-queue-field">
            <label className="bot-queue-label">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="bot-queue-textarea"
              placeholder="Enter the message bots will send..."
              rows={3}
            />
          </div>
        )}

        {/* Delay range */}
        <div className="bot-queue-field">
          <label className="bot-queue-label">Delay Between Messages (seconds)</label>
          <div className="bot-queue-delay-row">
            <div className="bot-queue-delay-input-group">
              <span className="bot-queue-delay-label">Min</span>
              <input
                type="number"
                value={delayMin}
                onChange={(e) => setDelayMin(parseInt(e.target.value, 10) || 0)}
                className="bot-queue-delay-input"
                min={0}
              />
            </div>
            <span className="bot-queue-delay-separator">to</span>
            <div className="bot-queue-delay-input-group">
              <span className="bot-queue-delay-label">Max</span>
              <input
                type="number"
                value={delayMax}
                onChange={(e) => setDelayMax(parseInt(e.target.value, 10) || 0)}
                className="bot-queue-delay-input"
                min={0}
              />
            </div>
            <span className="bot-queue-delay-hint">seconds</span>
          </div>
        </div>

        {/* Bot count display + Start button */}
        <div className="bot-queue-submit-row">
          <div className="bot-queue-bot-count">
            <span className="bot-queue-bot-count-number">{selectedBotIds?.length || 0}</span>
            <span className="bot-queue-bot-count-label">bots selected</span>
          </div>
          <button
            onClick={handleStartQueue}
            disabled={submitting || !selectedBotIds || selectedBotIds.length === 0}
            className="bot-queue-start-btn"
          >
            {submitting ? 'Starting...' : 'Start Queue'}
          </button>
        </div>
      </div>

      {/* ========== SECTION 2: Active Queues Monitor ========== */}
      <div className="bot-queue-section">
        <div className="bot-queue-section-header">
          <h3 className="bot-queue-section-title">Active Queues</h3>
          <button onClick={fetchActiveQueues} className="bot-queue-refresh-btn">
            Refresh
          </button>
        </div>

        {activeQueues.length === 0 ? (
          <div className="bot-queue-empty-queues">
            No active queues. Create one above to get started.
          </div>
        ) : (
          <div className="bot-queue-cards">
            {activeQueues.map(queue => {
              const data = getQueueData(queue)
              const completed = data.completed || 0
              const total = data.total || 1
              const percentage = Math.round((completed / total) * 100)
              const statusStyle = getStatusBadge(data.status || queue.status)
              const isRunning = (data.status || queue.status) === 'running'
              const eta = data.estimated_duration || data.eta || 0

              return (
                <div key={queue.batch_id} className="bot-queue-card">
                  <div className="bot-queue-card-header">
                    <div className="bot-queue-card-id">
                      <span className="bot-queue-card-batch-label">Batch</span>
                      <span className="bot-queue-card-batch-id">{(queue.batch_id || '').substring(0, 8)}</span>
                    </div>
                    <span
                      className="bot-queue-status-badge"
                      style={{
                        background: statusStyle.background,
                        color: statusStyle.color,
                        border: `1px solid ${statusStyle.border}`,
                      }}
                    >
                      {statusStyle.text}
                    </span>
                  </div>

                  <div className="bot-queue-card-info">
                    <div className="bot-queue-card-info-row">
                      <span className="bot-queue-card-info-label">Action:</span>
                      <span className="bot-queue-card-info-value">
                        {QUEUE_ACTION_TYPES.find(a => a.value === (data.action || queue.action))?.label || data.action || queue.action}
                      </span>
                    </div>
                    <div className="bot-queue-card-info-row">
                      <span className="bot-queue-card-info-label">Target:</span>
                      <span className="bot-queue-card-info-value">{data.target_id || data.target || queue.target_id || queue.target || '-'}</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="bot-queue-progress-container">
                    <div className="bot-queue-progress-bar">
                      <div
                        className="bot-queue-progress-fill"
                        style={{
                          width: `${percentage}%`,
                          background: isRunning ? '#f1c40f' : percentage === 100 ? '#2ecc71' : '#e74c3c',
                        }}
                      />
                    </div>
                    <div className="bot-queue-progress-text">
                      {completed} / {total} ({percentage}%)
                    </div>
                  </div>

                  {/* ETA */}
                  {isRunning && eta > 0 && (
                    <div className="bot-queue-eta">
                      ETA: {formatEta(eta)}
                    </div>
                  )}

                  {/* Cancel button */}
                  {isRunning && (
                    <button
                      onClick={() => handleCancelQueue(queue.batch_id)}
                      className="bot-queue-cancel-btn"
                    >
                      Cancel Queue
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ========== Inline Styles ========== */}
      <style>{`
        .bot-queue-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .bot-queue-section {
          background: #1e2130;
          border: 1px solid #2d313a;
          border-radius: 12px;
          padding: 20px;
        }

        .bot-queue-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .bot-queue-section-title {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 700;
          color: #e4e4e7;
        }

        .bot-queue-section-header .bot-queue-section-title {
          margin-bottom: 0;
        }

        .bot-queue-error {
          background: rgba(231,76,60,0.12);
          border: 1px solid rgba(231,76,60,0.25);
          color: #e74c3c;
          padding: 10px 14px;
          border-radius: 8px;
          margin-bottom: 14px;
          font-size: 13px;
        }

        .bot-queue-success {
          background: rgba(46,204,113,0.12);
          border: 1px solid rgba(46,204,113,0.25);
          color: #2ecc71;
          padding: 10px 14px;
          border-radius: 8px;
          margin-bottom: 14px;
          font-size: 13px;
        }

        .bot-queue-field {
          margin-bottom: 16px;
        }

        .bot-queue-label {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 6px;
          font-size: 12px;
          color: #8b8fa3;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          font-weight: 600;
        }

        .bot-queue-action-buttons {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .bot-queue-action-btn {
          padding: 7px 14px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid #2d313a;
          background: transparent;
          color: #aaa;
          transition: all 0.15s;
        }

        .bot-queue-action-btn:hover {
          border-color: #6c5ce7;
          color: #ccc;
        }

        .bot-queue-action-btn-active {
          background: #6c5ce7;
          border-color: #6c5ce7;
          color: #fff;
        }

        .bot-queue-action-btn-active:hover {
          background: #5b4bd5;
          color: #fff;
        }

        .bot-queue-loading-text {
          text-align: center;
          padding: 20px;
          color: #888;
          font-size: 13px;
        }

        .bot-queue-empty-list {
          text-align: center;
          padding: 20px;
          color: #666;
          background: #1a1d23;
          border-radius: 8px;
          border: 1px solid #2d313a;
          font-size: 13px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .bot-queue-target-list {
          max-height: 240px;
          overflow-y: auto;
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 8px;
        }

        .bot-queue-target-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          cursor: pointer;
          border-bottom: 1px solid #2d313a;
          border-left: 3px solid transparent;
          transition: background 0.12s;
          flex-direction: column;
          align-items: stretch;
        }

        .bot-queue-target-item:last-child {
          border-bottom: none;
        }

        .bot-queue-target-item:hover {
          background: rgba(255,255,255,0.03);
        }

        .bot-queue-target-item-selected {
          background: rgba(108,92,231,0.15);
          border-left-color: #6c5ce7;
        }

        .bot-queue-target-item-selected:hover {
          background: rgba(108,92,231,0.18);
        }

        /* Match specific styles within target item */
        .bot-queue-target-item[class*="match"] {
          flex-direction: row;
          align-items: center;
        }

        .bot-queue-target-item-main {
          flex: 1;
          min-width: 0;
        }

        .bot-queue-match-teams {
          font-size: 13px;
          font-weight: 600;
          color: #e4e4e7;
        }

        .bot-queue-match-details {
          font-size: 11px;
          color: #8b8fa3;
          margin-top: 2px;
        }

        .bot-queue-match-status {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
          flex-shrink: 0;
          align-self: center;
        }

        .bot-queue-match-live {
          background: rgba(231,76,60,0.15);
          color: #e74c3c;
        }

        .bot-queue-match-scheduled {
          background: rgba(52,152,219,0.15);
          color: #3498db;
        }

        /* Match target items should be row layout */
        .bot-queue-field .bot-queue-target-list .bot-queue-target-item:has(.bot-queue-target-item-main) {
          flex-direction: row;
          align-items: center;
        }

        .bot-queue-prediction-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .bot-queue-prediction-author {
          font-size: 13px;
          color: #e4e4e7;
        }

        .bot-queue-prediction-username {
          color: #666;
          font-size: 11px;
        }

        .bot-queue-prediction-match {
          font-size: 12px;
          color: #b0b3c6;
          margin-bottom: 3px;
        }

        .bot-queue-prediction-text {
          font-size: 12px;
          color: #8b8fa3;
          font-style: italic;
          margin-bottom: 6px;
        }

        .bot-queue-prediction-stats {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 11px;
        }

        .bot-queue-pagination {
          display: flex;
          gap: 4px;
          justify-content: center;
          margin-top: 8px;
          align-items: center;
        }

        .bot-queue-page-btn {
          background: none;
          border: 1px solid #2d313a;
          color: #aaa;
          border-radius: 4px;
          padding: 3px 10px;
          cursor: pointer;
          font-size: 12px;
        }

        .bot-queue-page-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .bot-queue-page-info {
          font-size: 12px;
          color: #888;
          padding: 3px 8px;
        }

        .bot-queue-refresh-btn {
          background: none;
          border: none;
          color: #6c5ce7;
          cursor: pointer;
          font-size: 12px;
          padding: 2px 4px;
        }

        .bot-queue-refresh-btn:hover {
          text-decoration: underline;
        }

        .bot-queue-selected-target {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          margin-bottom: 14px;
          background: rgba(108,92,231,0.08);
          border: 1px solid rgba(108,92,231,0.2);
          border-radius: 6px;
          font-size: 13px;
          color: #b0b3c6;
        }

        .bot-queue-selected-target strong {
          color: #a29bfe;
        }

        .bot-queue-clear-target {
          background: none;
          border: none;
          color: #e74c3c;
          cursor: pointer;
          font-size: 12px;
          margin-left: auto;
        }

        .bot-queue-toggle {
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid;
          transition: all 0.15s;
        }

        .bot-queue-toggle-on {
          background: rgba(46,204,113,0.15);
          border-color: rgba(46,204,113,0.3);
          color: #2ecc71;
        }

        .bot-queue-toggle-off {
          background: rgba(149,165,166,0.1);
          border-color: #2d313a;
          color: #95a5a6;
        }

        .bot-queue-toggle-hint {
          font-size: 11px;
          color: #666;
          margin-top: 2px;
        }

        .bot-queue-textarea {
          width: 100%;
          background: #161822;
          border: 1px solid #2d313a;
          border-radius: 6px;
          color: #e4e4e7;
          padding: 10px 12px;
          font-size: 13px;
          font-family: inherit;
          resize: vertical;
          outline: none;
          box-sizing: border-box;
        }

        .bot-queue-textarea:focus {
          border-color: #6c5ce7;
        }

        .bot-queue-textarea::placeholder {
          color: #555;
        }

        .bot-queue-varied-message-row {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 8px;
        }

        .bot-queue-varied-message-index {
          font-size: 12px;
          color: #8b8fa3;
          font-weight: 600;
          min-width: 20px;
          padding-top: 10px;
          text-align: right;
        }

        .bot-queue-varied-message-row .bot-queue-textarea {
          flex: 1;
        }

        .bot-queue-remove-message-btn {
          background: none;
          border: none;
          color: #e74c3c;
          cursor: pointer;
          font-size: 14px;
          padding: 8px 4px;
          line-height: 1;
          flex-shrink: 0;
        }

        .bot-queue-remove-message-btn:hover {
          color: #ff6b6b;
        }

        .bot-queue-add-message-btn {
          background: none;
          border: 1px dashed #2d313a;
          color: #6c5ce7;
          cursor: pointer;
          font-size: 12px;
          padding: 6px 14px;
          border-radius: 6px;
          width: 100%;
          transition: border-color 0.15s;
        }

        .bot-queue-add-message-btn:hover {
          border-color: #6c5ce7;
        }

        .bot-queue-delay-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .bot-queue-delay-input-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .bot-queue-delay-label {
          font-size: 12px;
          color: #8b8fa3;
        }

        .bot-queue-delay-input {
          width: 80px;
          background: #161822;
          border: 1px solid #2d313a;
          border-radius: 6px;
          color: #e4e4e7;
          padding: 6px 10px;
          font-size: 13px;
          outline: none;
          text-align: center;
        }

        .bot-queue-delay-input:focus {
          border-color: #6c5ce7;
        }

        .bot-queue-delay-separator {
          font-size: 13px;
          color: #666;
        }

        .bot-queue-delay-hint {
          font-size: 11px;
          color: #666;
        }

        .bot-queue-submit-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 14px;
          border-top: 1px solid #2d313a;
          margin-top: 4px;
        }

        .bot-queue-bot-count {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .bot-queue-bot-count-number {
          font-size: 22px;
          font-weight: 700;
          color: #a29bfe;
        }

        .bot-queue-bot-count-label {
          font-size: 13px;
          color: #8b8fa3;
        }

        .bot-queue-start-btn {
          padding: 10px 28px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          background: #6c5ce7;
          color: #fff;
          transition: background 0.15s;
        }

        .bot-queue-start-btn:hover:not(:disabled) {
          background: #5b4bd5;
        }

        .bot-queue-start-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        /* Active Queues */
        .bot-queue-empty-queues {
          text-align: center;
          padding: 30px 20px;
          color: #555;
          font-size: 13px;
        }

        .bot-queue-cards {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .bot-queue-card {
          background: #161822;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 16px;
        }

        .bot-queue-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .bot-queue-card-id {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .bot-queue-card-batch-label {
          font-size: 11px;
          color: #8b8fa3;
          text-transform: uppercase;
        }

        .bot-queue-card-batch-id {
          font-size: 13px;
          font-weight: 600;
          color: #e4e4e7;
          font-family: monospace;
        }

        .bot-queue-status-badge {
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
        }

        .bot-queue-card-info {
          margin-bottom: 12px;
        }

        .bot-queue-card-info-row {
          display: flex;
          gap: 8px;
          font-size: 12px;
          margin-bottom: 2px;
        }

        .bot-queue-card-info-label {
          color: #8b8fa3;
          min-width: 50px;
        }

        .bot-queue-card-info-value {
          color: #b0b3c6;
          font-weight: 500;
        }

        .bot-queue-progress-container {
          margin-bottom: 8px;
        }

        .bot-queue-progress-bar {
          width: 100%;
          height: 8px;
          background: #2d313a;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 4px;
        }

        .bot-queue-progress-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.4s ease;
        }

        .bot-queue-progress-text {
          font-size: 12px;
          color: #8b8fa3;
          text-align: right;
        }

        .bot-queue-eta {
          font-size: 12px;
          color: #f1c40f;
          margin-bottom: 8px;
        }

        .bot-queue-cancel-btn {
          padding: 5px 14px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid rgba(231,76,60,0.3);
          background: rgba(231,76,60,0.1);
          color: #e74c3c;
          transition: all 0.15s;
        }

        .bot-queue-cancel-btn:hover {
          background: rgba(231,76,60,0.2);
          border-color: rgba(231,76,60,0.5);
        }
      `}</style>
    </div>
  )
}
