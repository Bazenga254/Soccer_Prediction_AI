import { useState, useEffect } from 'react'
import axios from 'axios'

export default function CreatorDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawPhone, setWithdrawPhone] = useState(localStorage.getItem('mpesa_phone') || '')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawResult, setWithdrawResult] = useState(null)
  const [withdrawals, setWithdrawals] = useState([])
  const [hidden, setHidden] = useState(() => localStorage.getItem('earnings_hidden') === 'true')

  const fetchData = async () => {
    try {
      const [dashRes, wdRes] = await Promise.all([
        axios.get('/api/creator/dashboard'),
        axios.get('/api/withdrawal/history'),
      ])
      setData(dashRes.data)
      setWithdrawals(wdRes.data.withdrawals || [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount)
    if (!amount || amount < 5) return
    const phone = withdrawPhone.replace(/[^0-9]/g, '')
    const normalized = phone.startsWith('0') ? '254' + phone.slice(1) : phone
    if (!/^254[17]\d{8}$/.test(normalized)) {
      setWithdrawResult({ error: 'Enter a valid M-Pesa number' })
      return
    }

    setWithdrawing(true)
    setWithdrawResult(null)
    try {
      const res = await axios.post('/api/withdrawal/request', {
        amount_usd: amount,
        phone: normalized,
      })
      setWithdrawResult({ success: true, message: res.data.message })
      localStorage.setItem('mpesa_phone', withdrawPhone)
      fetchData()
    } catch (err) {
      setWithdrawResult({ error: err.response?.data?.detail || 'Withdrawal failed' })
    }
    setWithdrawing(false)
  }

  const toggleHidden = () => {
    const next = !hidden
    setHidden(next)
    localStorage.setItem('earnings_hidden', next ? 'true' : 'false')
  }

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

  const { wallet, paid_predictions, recent_sales, referral_stats } = data

  return (
    <div className="creator-page">
      <div className="creator-header">
        <h2>Creator Dashboard</h2>
        <div className="creator-header-actions">
          <p className="creator-subtitle">Track your prediction sales and earnings</p>
          <button className="creator-privacy-btn" onClick={toggleHidden} title={hidden ? 'Show amounts' : 'Hide amounts'}>
            {hidden ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Wallet Section */}
      <div className="creator-wallet">
        <div className="wallet-card main">
          <div className="wallet-label">Available Balance</div>
          <div className="wallet-amount">{hidden ? '****' : `$${wallet.balance_usd.toFixed(2)}`}</div>
          <button
            className={`withdraw-btn ${wallet.balance_usd >= 5 ? 'active' : ''}`}
            disabled={wallet.balance_usd < 5}
            onClick={() => { setShowWithdraw(true); setWithdrawResult(null); setWithdrawAmount('') }}
          >
            {wallet.balance_usd < 5 ? 'Min $5.00 to withdraw' : 'Withdraw to M-Pesa'}
          </button>
        </div>
        <div className="wallet-card">
          <div className="wallet-label">Total Earned</div>
          <div className="wallet-amount">{hidden ? '****' : `$${wallet.total_earned_usd.toFixed(2)}`}</div>
        </div>
        <div className="wallet-card">
          <div className="wallet-label">Total Sales</div>
          <div className="wallet-amount">{wallet.total_sales}</div>
        </div>
      </div>

      {/* Earnings Breakdown */}
      <div className="creator-section">
        <h3>Earnings Breakdown</h3>
        <div className="creator-earnings-breakdown">
          <div className="earnings-breakdown-card predictions">
            <div className="breakdown-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <div className="breakdown-info">
              <span className="breakdown-label">Prediction Sales</span>
              <strong className="breakdown-value">{hidden ? '****' : `$${wallet.total_earned_usd.toFixed(2)}`}</strong>
              <small>{wallet.total_sales} sale{wallet.total_sales !== 1 ? 's' : ''} (70% commission)</small>
            </div>
          </div>
          <div className="earnings-breakdown-card referrals">
            <div className="breakdown-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
            </div>
            <div className="breakdown-info">
              <span className="breakdown-label">Referral Commissions</span>
              <strong className="breakdown-value">
                {hidden ? '****' : `${referral_stats?.pro_referred || 0} Pro signups`}
              </strong>
              <small>{referral_stats?.total_referred || 0} total referral{(referral_stats?.total_referred || 0) !== 1 ? 's' : ''} (30% lifetime commission)</small>
            </div>
          </div>
        </div>
      </div>

      {/* Withdraw Modal */}
      {showWithdraw && (
        <div className="withdraw-modal-overlay" onClick={() => setShowWithdraw(false)}>
          <div className="withdraw-modal" onClick={e => e.stopPropagation()}>
            <button className="mpesa-modal-close" onClick={() => setShowWithdraw(false)}>&times;</button>

            {withdrawResult?.success ? (
              <div className="withdraw-success">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <h4>Withdrawal Requested</h4>
                <p>{withdrawResult.message}</p>
                <button className="mpesa-retry-btn" onClick={() => setShowWithdraw(false)}>Close</button>
              </div>
            ) : (
              <>
                <h3>Withdraw to M-Pesa</h3>
                <p className="withdraw-balance">Available: <strong>${wallet.balance_usd.toFixed(2)}</strong></p>

                <div className="withdraw-form-group">
                  <label>Amount (USD)</label>
                  <input
                    type="number"
                    min="5"
                    max={wallet.balance_usd}
                    step="0.50"
                    placeholder="5.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                  />
                </div>

                <div className="withdraw-form-group">
                  <label>M-Pesa Phone Number</label>
                  <input
                    type="tel"
                    placeholder="0712345678"
                    value={withdrawPhone}
                    onChange={(e) => setWithdrawPhone(e.target.value)}
                    maxLength={13}
                  />
                </div>

                <p className="withdraw-info-text">
                  Minimum withdrawal: $5.00. You'll receive the KES equivalent via M-Pesa within 24 hours.
                </p>

                {withdrawResult?.error && (
                  <div className="mpesa-error">{withdrawResult.error}</div>
                )}

                <button
                  className="withdraw-submit-btn"
                  onClick={handleWithdraw}
                  disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) < 5}
                >
                  {withdrawing ? 'Requesting...' : 'Request Withdrawal'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Withdrawal History */}
      {withdrawals.length > 0 && (
        <div className="withdrawal-history">
          <h3>Withdrawal History</h3>
          {withdrawals.map(wd => (
            <div key={wd.id} className="withdrawal-item">
              <div className="withdrawal-item-info">
                <span className="withdrawal-item-amount">{hidden ? '****' : `$${wd.amount_usd.toFixed(2)}`}</span>
                <span className="withdrawal-item-phone">M-Pesa: ...{wd.phone_number.slice(-4)}</span>
                <span className="withdrawal-item-date">{new Date(wd.created_at).toLocaleDateString()}</span>
              </div>
              <span className={`withdrawal-status-badge ${wd.status}`}>{wd.status}</span>
            </div>
          ))}
        </div>
      )}

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
                <div className="creator-pred-price">{hidden ? '***' : `$${p.price_usd.toFixed(2)}`}</div>
                <div className="creator-pred-buyers">
                  {p.purchase_count} buyer{p.purchase_count !== 1 ? 's' : ''}
                </div>
                <div className="creator-pred-revenue">{hidden ? '***' : `$${p.total_revenue.toFixed(2)}`}</div>
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
                <span className="sale-amount">{hidden ? '***' : `+$${(s.price_amount * 0.7).toFixed(2)}`}</span>
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
            <p>Earn 70% of every sale. Withdraw to M-Pesa anytime.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
