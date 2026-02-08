import { useBetSlip } from '../context/BetSlipContext'
import { useState } from 'react'

export default function BetSlip() {
  const {
    selectedBets,
    removeBet,
    clearAllBets,
    combinedProbability,
    riskScore,
    betCount
  } = useBetSlip()

  const [isExpanded, setIsExpanded] = useState(true)

  if (betCount === 0) return null

  return (
    <div className="bet-slip-container">
      <div className="bet-slip-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="bet-slip-title">
          <span className="bet-slip-icon">📋</span>
          <span>Bet Slip</span>
          <span className="bet-count">{betCount}</span>
        </div>
        <button className="expand-btn">
          {isExpanded ? '▼' : '▲'}
        </button>
      </div>

      {isExpanded && (
        <div className="bet-slip-content">
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

          <button className="clear-all-btn" onClick={clearAllBets}>
            Clear All Selections
          </button>
        </div>
      )}
    </div>
  )
}
