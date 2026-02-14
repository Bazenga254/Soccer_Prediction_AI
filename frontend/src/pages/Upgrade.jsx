import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'
import MpesaPaymentModal from '../components/MpesaPaymentModal'

export default function Upgrade() {
  const { user } = useAuth()
  const [plans, setPlans] = useState({})
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('USD')
  const [mpesaModal, setMpesaModal] = useState({ open: false, planId: '', amountKes: 0, amountUsd: 0, title: '', description: '', txType: 'subscription' })
  const [balance, setBalance] = useState(null)
  const [depositAmount, setDepositAmount] = useState(2)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [plansRes, statusRes, balRes] = await Promise.allSettled([
          axios.get('/api/subscription/plans'),
          axios.get('/api/subscription/status'),
          axios.get('/api/user/balance'),
        ])
        if (plansRes.status === 'fulfilled') setPlans(plansRes.value.data.plans || {})
        if (statusRes.status === 'fulfilled') setSubscription(statusRes.value.data.subscription)
        if (balRes.status === 'fulfilled') setBalance(balRes.value.data.balance)
      } catch { /* ignore */ }
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="upgrade-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading plans...</p>
        </div>
      </div>
    )
  }

  const isPro = user?.tier === 'pro'

  const weeklyPlan = currency === 'USD' ? plans.weekly_usd : plans.weekly_kes
  const monthlyPlan = currency === 'USD' ? plans.monthly_usd : plans.monthly_kes
  const currencySymbol = currency === 'USD' ? '$' : 'KES '

  const handleUpgrade = (planId, plan) => {
    if (plan.currency === 'KES') {
      setMpesaModal({
        open: true,
        planId,
        amountKes: plan.price,
        amountUsd: 0,
        title: `Subscribe to ${plan.name}`,
        description: `KES ${plan.price.toLocaleString()} / ${plan.duration_days === 7 ? 'week' : 'month'}`,
        txType: 'subscription',
      })
    } else {
      // USD plans — switch to KES tab for M-Pesa payment
      setCurrency('KES')
    }
  }

  const handleDeposit = () => {
    if (depositAmount < 2) return
    setMpesaModal({
      open: true,
      planId: 'balance_topup',
      amountKes: 0,
      amountUsd: depositAmount,
      title: 'Deposit to Balance',
      description: `$${depositAmount.toFixed(2)} Pay on the Go deposit`,
      txType: 'balance_topup',
    })
  }

  const handlePaymentSuccess = async () => {
    setMpesaModal({ open: false, planId: '', amountKes: 0, amountUsd: 0, title: '', description: '', txType: 'subscription' })
    try {
      const [statusRes, balRes] = await Promise.allSettled([
        axios.get('/api/subscription/status'),
        axios.get('/api/user/balance'),
      ])
      if (statusRes.status === 'fulfilled') setSubscription(statusRes.value.data.subscription)
      if (balRes.status === 'fulfilled') setBalance(balRes.value.data.balance)
      window.location.reload()
    } catch { /* ignore */ }
  }

  return (
    <div className="upgrade-page">
      {/* Active subscription banner */}
      {isPro && subscription && (
        <div className="active-sub-banner">
          <div className="sub-banner-content">
            <span className="sub-banner-badge">PRO ACTIVE</span>
            <span className="sub-banner-text">
              Your subscription expires on {new Date(subscription.expires_at).toLocaleDateString()}
              ({subscription.days_remaining} days remaining)
            </span>
          </div>
        </div>
      )}

      <div className="upgrade-header">
        <h2>{isPro ? 'Manage Subscription' : 'Upgrade to Pro'}</h2>
        <p className="upgrade-subtitle">
          {isPro
            ? 'You have full access to all features'
            : 'Unlock advanced analytics, unlimited predictions, and ad-free experience'}
        </p>
      </div>

      {/* Currency Toggle */}
      <div className="currency-toggle">
        <button
          className={`currency-btn ${currency === 'USD' ? 'active' : ''}`}
          onClick={() => setCurrency('USD')}
        >
          USD ($)
        </button>
        <button
          className={`currency-btn ${currency === 'KES' ? 'active' : ''}`}
          onClick={() => setCurrency('KES')}
        >
          KES (Ksh)
        </button>
      </div>

      {/* Plan Cards */}
      <div className="plans-grid">
        {/* Free Plan */}
        <div className={`plan-card ${!isPro ? 'current' : ''}`}>
          <div className="plan-header">
            <h3 className="plan-name">Free</h3>
            <div className="plan-price">
              <span className="price-amount">{currencySymbol}0</span>
              <span className="price-period">forever</span>
            </div>
          </div>
          <ul className="plan-features">
            <li className="feature-item">3 match analyses per 24h</li>
            <li className="feature-item">2 jackpot analyses, then 1 per 72h</li>
            <li className="feature-item">10 AI chat prompts</li>
            <li className="feature-item">Basic H2H statistics</li>
            <li className="feature-item">1 community share per day</li>
            <li className="feature-item disabled">Advanced analytics</li>
            <li className="feature-item disabled">Value betting insights</li>
            <li className="feature-item disabled">Ad-free experience</li>
          </ul>
          {!isPro && (
            <div className="plan-current-badge">Current Plan</div>
          )}
        </div>

        {/* Pay on the Go */}
        {!isPro && (
          <div className="plan-card paygo">
            <div className="plan-ribbon paygo-ribbon">Flexible</div>
            <div className="plan-header">
              <h3 className="plan-name">Pay on the Go</h3>
              <div className="plan-price">
                <span className="price-amount">From $2</span>
                <span className="price-period">deposit</span>
              </div>
            </div>
            <div className="paygo-pricing">
              <div className="paygo-price-item">
                <span className="paygo-price-label">Match Analysis</span>
                <span className="paygo-price-value">$0.50</span>
              </div>
              <div className="paygo-price-item">
                <span className="paygo-price-label">Jackpot Analysis</span>
                <span className="paygo-price-value">$1.00</span>
              </div>
            </div>
            <ul className="plan-features">
              <li className="feature-item included">Unlock any analysis instantly</li>
              <li className="feature-item included">Pay only when you need it</li>
              <li className="feature-item included">No commitment or expiry</li>
              <li className="feature-item included">Deposit any amount ($2 min)</li>
              <li className="feature-item included">Balance never expires</li>
            </ul>
            {balance && balance.balance_usd > 0 && (
              <div className="paygo-balance">
                Balance: <strong>${balance.balance_usd.toFixed(2)}</strong>
              </div>
            )}
            <div className="paygo-deposit-row">
              <div className="paygo-input-group">
                <span className="paygo-input-prefix">$</span>
                <input
                  type="number"
                  min="2"
                  step="1"
                  value={depositAmount}
                  onChange={e => setDepositAmount(Math.max(2, Number(e.target.value)))}
                  className="paygo-input"
                />
              </div>
              <button className="paygo-deposit-btn" onClick={handleDeposit}>
                Deposit via M-Pesa
              </button>
            </div>
          </div>
        )}

        {/* Weekly Plan */}
        {weeklyPlan && (
          <div className={`plan-card pro ${isPro ? 'current' : 'recommended'}`}>
            {!isPro && <div className="plan-ribbon">Popular</div>}
            <div className="plan-header">
              <h3 className="plan-name">Pro Weekly</h3>
              <div className="plan-price">
                <span className="price-amount">
                  {currencySymbol}{weeklyPlan.price}
                </span>
                <span className="price-period">/ week</span>
              </div>
            </div>
            <ul className="plan-features">
              {weeklyPlan.features.map((f, i) => (
                <li key={i} className="feature-item included">{f}</li>
              ))}
            </ul>
            {isPro ? (
              <div className="plan-current-badge pro">Active</div>
            ) : (
              <button className="plan-upgrade-btn" onClick={() => handleUpgrade(currency === 'USD' ? 'weekly_usd' : 'weekly_kes', weeklyPlan)}>
                {currency === 'KES' ? 'Pay with M-Pesa' : 'Upgrade Now'}
              </button>
            )}
          </div>
        )}

        {/* Monthly Plan */}
        {monthlyPlan && (
          <div className="plan-card pro-monthly">
            <div className="plan-save-tag">Save 20%</div>
            <div className="plan-header">
              <h3 className="plan-name">Pro Monthly</h3>
              <div className="plan-price">
                <span className="price-amount">
                  {currencySymbol}{monthlyPlan.price}
                </span>
                <span className="price-period">/ month</span>
              </div>
            </div>
            <ul className="plan-features">
              {monthlyPlan.features.map((f, i) => (
                <li key={i} className="feature-item included">{f}</li>
              ))}
            </ul>
            {isPro ? (
              <div className="plan-current-badge pro">Active</div>
            ) : (
              <button className="plan-upgrade-btn monthly" onClick={() => handleUpgrade(currency === 'USD' ? 'monthly_usd' : 'monthly_kes', monthlyPlan)}>
                {currency === 'KES' ? 'Pay with M-Pesa' : 'Upgrade Now'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Payment Methods Info */}
      {!isPro && (
        <div className="payment-methods-info">
          <h3>Payment Methods</h3>
          <div className="payment-methods-grid">
            <div className="payment-method active">
              <span className="pm-icon">📱</span>
              <span className="pm-name">M-Pesa</span>
              <span className="pm-note">Pay with M-Pesa</span>
            </div>
          </div>
          <p className="payment-note">
            Select a KES plan above and pay instantly via M-Pesa STK Push.
          </p>
        </div>
      )}

      <MpesaPaymentModal
        isOpen={mpesaModal.open}
        onClose={() => setMpesaModal({ ...mpesaModal, open: false })}
        onSuccess={handlePaymentSuccess}
        amountKes={mpesaModal.amountKes}
        amountUsd={mpesaModal.amountUsd || 0}
        transactionType={mpesaModal.txType || 'subscription'}
        referenceId={mpesaModal.planId}
        title={mpesaModal.title}
        description={mpesaModal.description}
      />

      {/* Pro vs Free comparison */}
      <div className="comparison-section">
        <h3>Free vs Pay on the Go vs Pro</h3>
        <div className="comparison-table wide">
          <div className="comparison-header">
            <span>Feature</span>
            <span>Free</span>
            <span>Pay on the Go</span>
            <span>Pro</span>
          </div>
          <div className="comparison-row">
            <span>Match Analysis</span>
            <span>3 per 24h</span>
            <span>$0.50 each</span>
            <span className="pro-value">Unlimited</span>
          </div>
          <div className="comparison-row">
            <span>Jackpot Analysis</span>
            <span>2, then 1/72h</span>
            <span>$1.00 each</span>
            <span className="pro-value">Unlimited</span>
          </div>
          <div className="comparison-row">
            <span>AI Chat Prompts</span>
            <span>10 total</span>
            <span>10 total</span>
            <span className="pro-value">Unlimited</span>
          </div>
          <div className="comparison-row">
            <span>Advanced Analytics</span>
            <span className="no-value">-</span>
            <span className="no-value">-</span>
            <span className="pro-value">Yes</span>
          </div>
          <div className="comparison-row">
            <span>Value Betting</span>
            <span className="no-value">-</span>
            <span className="no-value">-</span>
            <span className="pro-value">Yes</span>
          </div>
          <div className="comparison-row">
            <span>Advertisements</span>
            <span>Yes</span>
            <span>Yes</span>
            <span className="pro-value">None</span>
          </div>
          <div className="comparison-row">
            <span>Priority Support</span>
            <span className="no-value">-</span>
            <span className="no-value">-</span>
            <span className="pro-value">Yes</span>
          </div>
        </div>
      </div>
    </div>
  )
}
