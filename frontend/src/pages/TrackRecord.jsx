import { useState, useEffect } from 'react'
import axios from 'axios'

export default function TrackRecord() {
  const [predictions, setPredictions] = useState([])
  const [accuracy, setAccuracy] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [clearing, setClearing] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [scoreInputs, setScoreInputs] = useState({})

  const fetchData = async () => {
    try {
      setLoading(true)
      const [predsRes, accRes] = await Promise.allSettled([
        axios.get('/api/predictions?limit=100'),
        axios.get('/api/predictions/accuracy'),
      ])
      if (predsRes.status === 'fulfilled') setPredictions(predsRes.value.data.predictions || [])
      if (accRes.status === 'fulfilled') setAccuracy(accRes.value.data)
    } catch (err) {
      console.error('Error fetching predictions:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleUpdateResult = async (fixtureId) => {
    const scores = scoreInputs[fixtureId]
    if (!scores || scores.home === undefined || scores.away === undefined) return

    setUpdating(fixtureId)
    try {
      await axios.post('/api/predictions/update-result', {
        fixture_id: fixtureId,
        home_goals: parseInt(scores.home),
        away_goals: parseInt(scores.away),
      })
      await fetchData()
    } catch (err) {
      console.error('Error updating result:', err)
    } finally {
      setUpdating(null)
    }
  }

  const handleClearAll = async () => {
    setClearing(true)
    try {
      await axios.delete('/api/predictions/clear')
      setPredictions([])
      setAccuracy(null)
      setShowClearConfirm(false)
      await fetchData()
    } catch (err) {
      console.error('Error clearing predictions:', err)
    } finally {
      setClearing(false)
    }
  }

  const setScore = (fixtureId, team, value) => {
    setScoreInputs(prev => ({
      ...prev,
      [fixtureId]: { ...prev[fixtureId], [team]: value }
    }))
  }

  // Calculate outcome probability for a prediction
  const getOutcomeProb = (pred) => {
    const prob = pred.predicted_result_prob
    if (!prob) return null
    if (prob >= 65) return { label: 'High', className: 'prob-high' }
    if (prob >= 45) return { label: 'Medium', className: 'prob-medium' }
    return { label: 'Low', className: 'prob-low' }
  }

  if (loading) {
    return (
      <div className="track-record-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading predictions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="track-record-page">
      <div className="track-record-header">
        <h1>My Predictions</h1>
        <div className="track-record-actions">
          <button className="refresh-btn" onClick={fetchData}>Refresh</button>
          {predictions.length > 0 && (
            <button className="clear-all-btn" onClick={() => setShowClearConfirm(true)}>
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <div className="clear-confirm-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="clear-confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>Clear All Predictions?</h3>
            <p>This will permanently delete all {predictions.length} prediction{predictions.length !== 1 ? 's' : ''} and reset your accuracy stats. This cannot be undone.</p>
            <div className="clear-confirm-actions">
              <button className="clear-cancel-btn" onClick={() => setShowClearConfirm(false)}>Cancel</button>
              <button className="clear-delete-btn" onClick={handleClearAll} disabled={clearing}>
                {clearing ? 'Clearing...' : 'Yes, Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accuracy Cards */}
      {accuracy && accuracy.total_predictions > 0 && (
        <div className="accuracy-cards">
          <div className="accuracy-card total">
            <div className="accuracy-number">{accuracy.total_predictions}</div>
            <div className="accuracy-label">Total Predictions</div>
            <div className="accuracy-sub">
              {accuracy.matches_finished} finished, {accuracy.pending} pending
            </div>
          </div>

          <div className={`accuracy-card ${accuracy.result_accuracy.percentage >= 50 ? 'good' : 'needs-work'}`}>
            <div className="accuracy-number">{accuracy.result_accuracy.percentage}%</div>
            <div className="accuracy-label">1X2 Accuracy</div>
            <div className="accuracy-sub">
              {accuracy.result_accuracy.correct}/{accuracy.result_accuracy.total} correct
            </div>
          </div>

          <div className={`accuracy-card ${accuracy.over25_accuracy.percentage >= 50 ? 'good' : 'needs-work'}`}>
            <div className="accuracy-number">{accuracy.over25_accuracy.percentage}%</div>
            <div className="accuracy-label">Over/Under 2.5</div>
            <div className="accuracy-sub">
              {accuracy.over25_accuracy.correct}/{accuracy.over25_accuracy.total} correct
            </div>
          </div>

          <div className={`accuracy-card ${accuracy.btts_accuracy.percentage >= 50 ? 'good' : 'needs-work'}`}>
            <div className="accuracy-number">{accuracy.btts_accuracy.percentage}%</div>
            <div className="accuracy-label">BTTS Accuracy</div>
            <div className="accuracy-sub">
              {accuracy.btts_accuracy.correct}/{accuracy.btts_accuracy.total} correct
            </div>
          </div>
        </div>
      )}

      {/* Predictions Table */}
      <div className="predictions-table-container">
        <h2>Prediction History</h2>
        {predictions.length === 0 ? (
          <div className="no-predictions">
            <p>No predictions yet. Analyze some matches to start building your prediction history!</p>
          </div>
        ) : (
          <div className="predictions-table">
            <div className="pred-table-header">
              <span className="col-date">Date</span>
              <span className="col-match">Match</span>
              <span className="col-pick">Our Pick</span>
              <span className="col-prob">Probability</span>
              <span className="col-result">Result</span>
              <span className="col-correct">Status</span>
            </div>

            {predictions.map((pred) => {
              const outcomeProb = getOutcomeProb(pred)
              return (
                <div key={pred.fixture_id} className={`pred-table-row ${pred.match_finished ? (pred.result_correct ? 'correct' : 'wrong') : 'pending'}`}>
                  <span className="col-date">
                    {new Date(pred.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </span>
                  <span className="col-match">
                    <span className="match-teams-text">{pred.team_a_name} vs {pred.team_b_name}</span>
                  </span>
                  <span className="col-pick">{pred.predicted_result}</span>
                  <span className="col-prob">
                    <span className="prob-value">{pred.predicted_result_prob?.toFixed(0)}%</span>
                    {outcomeProb && (
                      <span className={`prob-badge ${outcomeProb.className}`}>{outcomeProb.label}</span>
                    )}
                  </span>
                  <span className="col-result">
                    {pred.match_finished ? (
                      <span className="actual-score">
                        {pred.actual_home_goals} - {pred.actual_away_goals}
                      </span>
                    ) : (
                      <span className="enter-score">
                        <input
                          type="number"
                          min="0"
                          max="20"
                          placeholder="H"
                          className="score-input"
                          value={scoreInputs[pred.fixture_id]?.home ?? ''}
                          onChange={(e) => setScore(pred.fixture_id, 'home', e.target.value)}
                        />
                        <span>-</span>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          placeholder="A"
                          className="score-input"
                          value={scoreInputs[pred.fixture_id]?.away ?? ''}
                          onChange={(e) => setScore(pred.fixture_id, 'away', e.target.value)}
                        />
                        <button
                          className="submit-score-btn"
                          onClick={() => handleUpdateResult(pred.fixture_id)}
                          disabled={updating === pred.fixture_id}
                        >
                          {updating === pred.fixture_id ? '...' : 'OK'}
                        </button>
                      </span>
                    )}
                  </span>
                  <span className="col-correct">
                    {pred.match_finished ? (
                      pred.result_correct ? (
                        <span className="status-correct">WIN</span>
                      ) : (
                        <span className="status-wrong">LOSS</span>
                      )
                    ) : (
                      <span className="status-pending">Pending</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
