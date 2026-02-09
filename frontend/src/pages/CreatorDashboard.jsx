import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

export default function CreatorDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('/api/creator/dashboard')
        setData(res.data)
      } catch { /* ignore */ }
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="creator-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="creator-page">
        <div className="creator-empty">
          <h2>Creator Dashboard</h2>
          <p>Start selling predictions to see your earnings here.</p>
        </div>
      </div>
    )
  }

  const { wallet, paid_predictions, recent_sales } = data

  return (
    <div className="creator-page">
      <div className="creator-header">
        <h2>Creator Dashboard</h2>
        <p className="creator-subtitle">Track your prediction sales and earnings</p>
      </div>

      {/* Wallet Section */}
      <div className="creator-wallet">
        <div className="wallet-card main">
          <div className="wallet-label">Available Balance</div>
          <div className="wallet-amount">${wallet.balance_usd.toFixed(2)}</div>
          <button className="withdraw-btn" disabled>
            Withdraw (Coming Soon)
          </button>
        </div>
        <div className="wallet-card">
          <div className="wallet-label">Total Earned</div>
          <div className="wallet-amount">${wallet.total_earned_usd.toFixed(2)}</div>
        </div>
        <div className="wallet-card">
          <div className="wallet-label">Total Sales</div>
          <div className="wallet-amount">{wallet.total_sales}</div>
        </div>
      </div>

      {/* Paid Predictions */}
      <div className="creator-section">
        <h3>Your Paid Predictions ({paid_predictions.length})</h3>
        {paid_predictions.length === 0 ? (
          <p className="creator-empty-text">
            You haven't shared any paid predictions yet.
            Go to a match analysis, then use "Sell Prediction" when sharing.
          </p>
        ) : (
          <div className="creator-predictions-list">
            {paid_predictions.map(p => (
              <div key={p.id} className="creator-pred-row">
                <div className="creator-pred-match">
                  <strong>{p.team_a_name} vs {p.team_b_name}</strong>
                  {p.competition && <small>{p.competition}</small>}
                </div>
                <div className="creator-pred-pick">
                  {p.predicted_result}
                </div>
                <div className="creator-pred-price">${p.price_usd.toFixed(2)}</div>
                <div className="creator-pred-buyers">
                  {p.purchase_count} buyer{p.purchase_count !== 1 ? 's' : ''}
                </div>
                <div className="creator-pred-revenue">${p.total_revenue.toFixed(2)}</div>
                <div className="creator-pred-date">
                  {new Date(p.created_at).toLocaleDateString()}
                </div>
                {p.match_finished && (
                  <span className={`creator-pred-result ${p.result_correct ? 'correct' : 'incorrect'}`}>
                    {p.result_correct ? 'W' : 'L'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Sales */}
      {recent_sales.length > 0 && (
        <div className="creator-section">
          <h3>Recent Sales</h3>
          <div className="creator-sales-list">
            {recent_sales.map((s, i) => (
              <div key={i} className="creator-sale-row">
                <span className="sale-match">{s.team_a_name} vs {s.team_b_name}</span>
                <span className="sale-amount">+${(s.price_amount * 0.7).toFixed(2)}</span>
                <span className="sale-date">{new Date(s.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="creator-info">
        <h3>How It Works</h3>
        <div className="creator-info-grid">
          <div className="creator-info-item">
            <span className="info-step">1</span>
            <p>Analyze a match and generate your prediction</p>
          </div>
          <div className="creator-info-item">
            <span className="info-step">2</span>
            <p>Click "Share to Community" and select "Sell Prediction"</p>
          </div>
          <div className="creator-info-item">
            <span className="info-step">3</span>
            <p>Set your price ($0.50 - $50.00)</p>
          </div>
          <div className="creator-info-item">
            <span className="info-step">4</span>
            <p>Earn 70% of every sale. We handle the rest.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
