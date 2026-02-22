import { useState, useEffect, useCallback } from 'react'
import { useAdmin } from '../context/AdminContext'
import StatCard from '../components/StatCard'

const API = '/api'

function formatDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString()
}

function formatDateTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString()
}

export default function PredictionsTab() {
  const { getAuthHeaders, hasPermission } = useAdmin()

  const [accuracy, setAccuracy] = useState(null)
  const [predictions, setPredictions] = useState([])
  const [communityPredictions, setCommunityPredictions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeSection, setActiveSection] = useState('overview') // overview | community
  const [deletingId, setDeletingId] = useState(null)

  const fetchAccuracy = useCallback(async () => {
    try {
      const res = await fetch(`${API}/predictions/accuracy`, {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setAccuracy(data)
      }
    } catch (err) {
      console.error('Failed to fetch prediction accuracy:', err)
    }
  }, [getAuthHeaders])

  const fetchPredictions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(`${API}/predictions?limit=50`, {
        headers: getAuthHeaders(),
      })

      if (!res.ok) throw new Error(`Failed to fetch predictions: ${res.status}`)

      const data = await res.json()
      const allPredictions = data.predictions || data.items || data || []
      setPredictions(allPredictions)

      // Separate community predictions (shared ones)
      const community = allPredictions.filter(p => p.shared || p.is_community || p.community)
      setCommunityPredictions(community)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  const deletePrediction = useCallback(async (predictionId) => {
    if (!confirm('Are you sure you want to delete this community prediction?')) return

    try {
      setDeletingId(predictionId)
      const res = await fetch(`${API}/predictions/${predictionId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })

      if (!res.ok) throw new Error(`Failed to delete prediction: ${res.status}`)

      // Remove from local state
      setCommunityPredictions(prev => prev.filter(p => (p.id || p._id) !== predictionId))
      setPredictions(prev => prev.filter(p => (p.id || p._id) !== predictionId))
    } catch (err) {
      alert('Failed to delete prediction: ' + err.message)
    } finally {
      setDeletingId(null)
    }
  }, [getAuthHeaders])

  useEffect(() => {
    fetchAccuracy()
    fetchPredictions()
  }, [fetchAccuracy, fetchPredictions])

  // Compute stats from accuracy data
  const totalPredictions = accuracy?.total_predictions || accuracy?.total || predictions.length
  const resultAcc = accuracy?.result_accuracy || {}
  const accuracyPct = resultAcc.percentage != null
    ? resultAcc.percentage.toFixed(1)
    : accuracy?.accuracy != null
      ? (accuracy.accuracy * 100).toFixed(1)
      : '—'
  const wins = resultAcc.correct || accuracy?.correct || 0
  const losses = resultAcc.total != null && resultAcc.correct != null
    ? resultAcc.total - resultAcc.correct
    : accuracy?.incorrect || 0

  return (
    <div className="admin-tab-content">
      <div className="admin-tab-header">
        <h2>Predictions Management</h2>
      </div>

      {/* Stats Summary */}
      <div className="admin-stats-grid">
        <StatCard
          label="Total Predictions"
          value={totalPredictions}
          icon="&#9917;"
          color="#3498db"
        />
        <StatCard
          label="Accuracy"
          value={accuracyPct !== '—' ? `${accuracyPct}%` : '—'}
          icon="&#127919;"
          color="#2ecc71"
        />
        <StatCard
          label="Correct"
          value={wins}
          icon="&#10003;"
          color="#27ae60"
          sub="Winning predictions"
        />
        <StatCard
          label="Incorrect"
          value={losses}
          icon="&#10007;"
          color="#e74c3c"
          sub="Lost predictions"
        />
      </div>

      {/* Section Tabs */}
      <div className="admin-section-tabs">
        <button
          className={`admin-section-tab ${activeSection === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveSection('overview')}
        >
          Recent Predictions
        </button>
        <button
          className={`admin-section-tab ${activeSection === 'community' ? 'active' : ''}`}
          onClick={() => setActiveSection('community')}
        >
          Community Predictions
          {communityPredictions.length > 0 && (
            <span className="admin-badge-count">{communityPredictions.length}</span>
          )}
        </button>
        <button
          className={`admin-section-tab ${activeSection === 'analysts' ? 'active' : ''}`}
          onClick={() => setActiveSection('analysts')}
        >
          Analyst Performance
        </button>
        <button
          className={`admin-section-tab ${activeSection === 'review' ? 'active' : ''}`}
          onClick={() => setActiveSection('review')}
        >
          Review Queue
        </button>
      </div>

      {error && (
        <div className="admin-error-banner">
          <span>{error}</span>
          <button className="admin-btn admin-btn-sm" onClick={fetchPredictions}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="admin-loading-section">
          <div className="admin-loading-spinner" />
          <p>Loading predictions data...</p>
        </div>
      ) : (
        <>
          {/* Recent Predictions Table */}
          {activeSection === 'overview' && (
            <div className="admin-section">
              <h3 className="admin-section-title">Recent Predictions</h3>
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>User</th>
                      <th>Match</th>
                      <th>Predicted Outcome</th>
                      <th>Actual Result</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="admin-table-empty">
                          No predictions tracked yet.
                        </td>
                      </tr>
                    ) : (
                      predictions.map((pred, idx) => {
                        const predId = pred.id || pred._id || idx
                        const isCorrect =
                          pred.correct === true ||
                          pred.status === 'correct' ||
                          pred.result === 'win'
                        const isIncorrect =
                          pred.correct === false ||
                          pred.status === 'incorrect' ||
                          pred.result === 'loss'
                        const isPending = !isCorrect && !isIncorrect
                        const userName = pred.user_name || pred.user || 'System'

                        return (
                          <tr key={predId}>
                            <td>{formatDate(pred.date || pred.match_date || pred.created_at)}</td>
                            <td>
                              <div className="admin-user-cell">
                                <div className="admin-avatar-sm" style={{ background: userName === 'System' ? '#8b8d97' : '#6c5ce7' }}>
                                  {userName.charAt(0).toUpperCase()}
                                </div>
                                <span>{userName}</span>
                              </div>
                            </td>
                            <td>
                              <div className="admin-match-cell">
                                <strong>
                                  {pred.match ||
                                    pred.match_name ||
                                    `${pred.home_team || '?'} vs ${pred.away_team || '?'}`}
                                </strong>
                                {pred.league && (
                                  <span className="admin-match-league">{pred.league}</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className="admin-badge admin-badge-info">
                                {pred.predicted_outcome ||
                                  pred.prediction ||
                                  pred.predicted ||
                                  '—'}
                              </span>
                            </td>
                            <td>
                              {pred.actual_result || pred.actual || pred.score || '—'}
                            </td>
                            <td>
                              {isPending ? (
                                <span className="admin-badge admin-badge-pending">Pending</span>
                              ) : isCorrect ? (
                                <span className="admin-badge admin-badge-success">Correct</span>
                              ) : (
                                <span className="admin-badge admin-badge-danger">Incorrect</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Community Predictions */}
          {activeSection === 'community' && (
            <div className="admin-section">
              <h3 className="admin-section-title">Community Predictions</h3>
              <p className="admin-section-desc">
                Shared predictions from the community. Use moderation controls to remove
                inappropriate content.
              </p>
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>User</th>
                      <th>Match</th>
                      <th>Prediction</th>
                      <th>Status</th>
                      {hasPermission('predictions', 'delete') && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {communityPredictions.length === 0 ? (
                      <tr>
                        <td
                          colSpan={hasPermission('predictions', 'delete') ? 6 : 5}
                          className="admin-table-empty"
                        >
                          No community predictions found.
                        </td>
                      </tr>
                    ) : (
                      communityPredictions.map((pred, idx) => {
                        const predId = pred.id || pred._id || idx
                        const isCorrect =
                          pred.correct === true ||
                          pred.status === 'correct' ||
                          pred.result === 'win'
                        const isIncorrect =
                          pred.correct === false ||
                          pred.status === 'incorrect' ||
                          pred.result === 'loss'
                        const isPending = !isCorrect && !isIncorrect

                        return (
                          <tr key={predId}>
                            <td>{formatDate(pred.date || pred.match_date || pred.created_at)}</td>
                            <td>
                              <div className="admin-user-cell">
                                <div className="admin-avatar-sm" style={{ background: '#6c5ce7' }}>
                                  {(pred.user_name || pred.user || '?').charAt(0).toUpperCase()}
                                </div>
                                <span>{pred.user_name || pred.user || 'Anonymous'}</span>
                              </div>
                            </td>
                            <td>
                              {pred.match ||
                                pred.match_name ||
                                `${pred.home_team || '?'} vs ${pred.away_team || '?'}`}
                            </td>
                            <td>
                              <span className="admin-badge admin-badge-info">
                                {pred.predicted_outcome ||
                                  pred.prediction ||
                                  pred.predicted ||
                                  '—'}
                              </span>
                            </td>
                            <td>
                              {isPending ? (
                                <span className="admin-badge admin-badge-pending">Pending</span>
                              ) : isCorrect ? (
                                <span className="admin-badge admin-badge-success">Correct</span>
                              ) : (
                                <span className="admin-badge admin-badge-danger">Incorrect</span>
                              )}
                            </td>
                            {hasPermission('predictions', 'delete') && (
                              <td>
                                <button
                                  className="admin-btn admin-btn-sm admin-btn-danger"
                                  onClick={() => deletePrediction(predId)}
                                  disabled={deletingId === predId}
                                >
                                  {deletingId === predId ? 'Deleting...' : 'Delete'}
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Analyst Performance - Coming Soon */}
          {activeSection === 'analysts' && (
            <div className="admin-section">
              <div className="admin-coming-soon">
                <div className="admin-coming-soon-icon">&#128200;</div>
                <h3>Analyst Performance</h3>
                <p>
                  Track and compare prediction accuracy across analysts. See individual win rates,
                  streaks, and specialization by league or market type.
                </p>
                <span className="admin-badge admin-badge-pending">Coming Soon</span>
              </div>
            </div>
          )}

          {/* Prediction Review Queue - Coming Soon */}
          {activeSection === 'review' && (
            <div className="admin-section">
              <div className="admin-coming-soon">
                <div className="admin-coming-soon-icon">&#128203;</div>
                <h3>Prediction Review Queue</h3>
                <p>
                  Review and approve predictions before they are published. Set quality standards,
                  add notes, and track review turnaround times.
                </p>
                <span className="admin-badge admin-badge-pending">Coming Soon</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
