import { useBetSlip } from '../context/BetSlipContext'
import { useState } from 'react'

export default function BetSlip() {
  const {
    selectedBets,
    removeBet,
    clearAllBets,
    combinedProbability,
    riskScore,
    betCount,
    confirmPredictions,
    confirming,
    confirmResult,
    setConfirmResult,
  } = useBetSlip()

  const [isExpanded, setIsExpanded] = useState(true)
  const [showConfirmPanel, setShowConfirmPanel] = useState(false)
  const [visibility, setVisibility] = useState('private')
  const [isPaid, setIsPaid] = useState(false)
  const [price, setPrice] = useState('2.00')
  const [analysisNotes, setAnalysisNotes] = useState('')

  const wordCount = analysisNotes.trim() ? analysisNotes.trim().split(/\s+/).length : 0

  const handleConfirm = async () => {
    const result = await confirmPredictions({
      visibility,
      isPaid: visibility === 'public' && isPaid,
      priceUsd: visibility === 'public' && isPaid ? parseFloat(price) || 0 : 0,
      analysisNotes,
    })
    if (result?.success) {
      setShowConfirmPanel(false)
      setVisibility('private')
      setIsPaid(false)
      setPrice('2.00')
      setAnalysisNotes('')
    }
  }

  // Show success message briefly
  if (confirmResult?.success && betCount === 0) {
    return (
      <div className="bet-slip-container">
        <div className="bet-slip-header">
          <div className="bet-slip-title">
            <span className="bet-slip-icon">✓</span>
            <span>My Predictions</span>
          </div>
        </div>
        <div className="bet-slip-content">
          <div className="confirm-success">
            <div className="confirm-success-icon">✓</div>
            <p>{confirmResult.count} prediction{confirmResult.count !== 1 ? 's' : ''} confirmed!</p>
            {confirmResult.shared && (
              <p className="confirm-success-sub">
                {confirmResult.isPaid ? 'Listed for sale' : 'Shared publicly'} in Community
              </p>
            )}
            {!confirmResult.shared && (
              <p className="confirm-success-sub">Saved to your prediction history</p>
            )}
            <button className="confirm-dismiss-btn" onClick={() => setConfirmResult(null)}>OK</button>
          </div>
        </div>
      </div>
    )
  }

  if (betCount === 0) return null

  return (
    <div className="bet-slip-container">
      <div className="bet-slip-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="bet-slip-title">
          <span className="bet-slip-icon">📋</span>
          <span>My Predictions</span>
          <span className="bet-count">{betCount}</span>
        </div>
        <button className="expand-btn">
          {isExpanded ? '▼' : '▲'}
        </button>
      </div>

      {isExpanded && (
        <div className="bet-slip-content">
          {!showConfirmPanel ? (
            <>
              {/* Staging view - list of selected predictions */}
              <div className="bet-slip-items">
                {selectedBets.map((bet, index) => (
                  <div key={`${bet.matchId}-${bet.category}-${index}`} className="bet-slip-item">
                    <div className="bet-item-info">
                      <div className="bet-match">{bet.matchName}</div>
                      <div className="bet-selection">
                        <span className="bet-category">{bet.category}:</span>
                        <span className="bet-outcome">{bet.outcome}</span>
                      </div>
                    </div>
                    <div className="bet-item-right">
                      <span className="bet-probability">{bet.probability}%</span>
                      <button
                        className="remove-bet-btn"
                        onClick={() => removeBet(bet.matchId)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bet-slip-summary">
                <div className="summary-row">
                  <span className="summary-label">Total Selections</span>
                  <span className="summary-value">{betCount}</span>
                </div>
                <div className="summary-row highlight">
                  <span className="summary-label">Combined Probability</span>
                  <span className="summary-value probability">
                    {combinedProbability.toFixed(2)}%
                  </span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Risk Score</span>
                  <span className={`summary-value risk ${riskScore > 10 ? 'high' : riskScore > 5 ? 'medium' : 'low'}`}>
                    {riskScore.toFixed(1)}x
                  </span>
                </div>

                <div className="probability-bar">
                  <div
                    className="probability-fill"
                    style={{ width: `${Math.min(combinedProbability, 100)}%` }}
                  ></div>
                </div>

                <p className="probability-note">
                  {combinedProbability >= 50
                    ? 'Good chance of success'
                    : combinedProbability >= 25
                      ? 'Moderate risk'
                      : combinedProbability >= 10
                        ? 'High risk accumulator'
                        : 'Very high risk - proceed with caution'}
                </p>
              </div>

              <button className="confirm-predictions-btn" onClick={() => setShowConfirmPanel(true)}>
                Confirm {betCount > 1 ? `All ${betCount} Predictions` : 'Prediction'}
              </button>
              <button className="clear-all-btn" onClick={clearAllBets}>
                Clear All
              </button>
            </>
          ) : (
            <>
              {/* Confirm options panel */}
              <div className="confirm-options-panel">
                <h4 className="confirm-panel-title">Confirm Your Predictions</h4>
                <p className="confirm-panel-sub">{betCount} prediction{betCount !== 1 ? 's' : ''} selected</p>

                {/* Visibility toggle */}
                <div className="confirm-section">
                  <label className="confirm-label">Visibility</label>
                  <div className="visibility-toggle">
                    <button
                      className={`toggle-btn ${visibility === 'private' ? 'active' : ''}`}
                      onClick={() => { setVisibility('private'); setIsPaid(false) }}
                    >
                      Private
                    </button>
                    <button
                      className={`toggle-btn ${visibility === 'public' ? 'active' : ''}`}
                      onClick={() => setVisibility('public')}
                    >
                      Public
                    </button>
                  </div>
                  <p className="confirm-hint">
                    {visibility === 'private'
                      ? 'Only you can see these predictions'
                      : 'Visible to the community'}
                  </p>
                </div>

                {/* Monetize toggle (only when public) */}
                {visibility === 'public' && (
                  <div className="confirm-section">
                    <label className="confirm-label">Monetize</label>
                    <div className="monetize-toggle">
                      <button
                        className={`toggle-btn ${!isPaid ? 'active' : ''}`}
                        onClick={() => setIsPaid(false)}
                      >
                        Free
                      </button>
                      <button
                        className={`toggle-btn paid-toggle ${isPaid ? 'active' : ''}`}
                        onClick={() => setIsPaid(true)}
                      >
                        Sell
                      </button>
                    </div>
                  </div>
                )}

                {/* Price input (only when selling) */}
                {visibility === 'public' && isPaid && (
                  <div className="confirm-section">
                    <label className="confirm-label">Price</label>
                    <div className="price-row">
                      <span className="price-currency">$</span>
                      <input
                        type="number"
                        className="price-input"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        min="0.50"
                        max="50.00"
                        step="0.50"
                      />
                      <span className="price-currency">USD</span>
                    </div>
                    <p className="confirm-hint">
                      You earn 70% (${(parseFloat(price || 0) * 0.7).toFixed(2)}) | Platform fee 30%
                    </p>
                  </div>
                )}

                {/* Analysis notes */}
                {visibility === 'public' && (
                  <div className="confirm-section">
                    <label className="confirm-label">
                      Analysis Notes {isPaid && <span className="required-badge">Required</span>}
                    </label>
                    <textarea
                      className="analysis-notes-input"
                      value={analysisNotes}
                      onChange={(e) => setAnalysisNotes(e.target.value)}
                      placeholder={isPaid
                        ? 'Explain your reasoning (min 30 words)...'
                        : 'Add your analysis notes (optional)...'}
                      maxLength={1000}
                      rows={4}
                    />
                    <div className={`word-count ${isPaid && wordCount < 30 ? 'insufficient' : ''}`}>
                      {wordCount} word{wordCount !== 1 ? 's' : ''}
                      {isPaid && wordCount < 30 && ` (${30 - wordCount} more needed)`}
                    </div>
                  </div>
                )}

                {confirmResult?.error && (
                  <div className="confirm-error">{confirmResult.error}</div>
                )}

                <div className="confirm-actions">
                  <button
                    className="confirm-submit-btn"
                    onClick={handleConfirm}
                    disabled={confirming || (visibility === 'public' && isPaid && wordCount < 30)}
                  >
                    {confirming
                      ? 'Confirming...'
                      : visibility === 'public'
                        ? isPaid ? `Sell for $${price}` : 'Confirm & Share'
                        : 'Confirm as Private'}
                  </button>
                  <button
                    className="confirm-back-btn"
                    onClick={() => setShowConfirmPanel(false)}
                    disabled={confirming}
                  >
                    Back
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
