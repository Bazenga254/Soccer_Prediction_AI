import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

export default function Upgrade() {
  const { user } = useAuth()
  const [plans, setPlans] = useState({})
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('USD')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [plansRes, statusRes] = await Promise.all([
          axios.get('/api/subscription/plans'),
          axios.get('/api/subscription/status'),
        ])
        setPlans(plansRes.data.plans || {})
        setSubscription(statusRes.data.subscription)
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
            <li className="feature-item">3 predictions per day</li>
            <li className="feature-item">Basic match analysis</li>
            <li className="feature-item">H2H statistics</li>
            <li className="feature-item">1 community share per day</li>
            <li className="feature-item disabled">Advanced analytics</li>
            <li className="feature-item disabled">Value betting insights</li>
            <li className="feature-item disabled">Ad-free experience</li>
          </ul>
          {!isPro && (
            <div className="plan-current-badge">Current Plan</div>
          )}
        </div>

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
              <button className="plan-upgrade-btn">
                Upgrade Now
              </button>
            )}
          </div>
        )}

        {/* Monthly Plan */}
        {monthlyPlan && (
          <div className="plan-card pro-monthly">
            <div className="plan-save-tag">Save {currency === 'USD' ? '19%' : '12%'}</div>
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
              <button className="plan-upgrade-btn monthly">
                Upgrade Now
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
            <div className="payment-method">
              <span className="pm-icon">📱</span>
              <span className="pm-name">M-Pesa</span>
              <span className="pm-note">KES payments</span>
            </div>
            <div className="payment-method">
              <span className="pm-icon">💳</span>
              <span className="pm-name">Card</span>
              <span className="pm-note">Visa / Mastercard</span>
            </div>
            <div className="payment-method">
              <span className="pm-icon">🅿️</span>
              <span className="pm-name">PayPal</span>
              <span className="pm-note">USD payments</span>
            </div>
          </div>
          <p className="payment-note">
            Payment integration coming soon. Contact admin for manual Pro activation.
          </p>
        </div>
      )}

      {/* Pro vs Free comparison */}
      <div className="comparison-section">
        <h3>Free vs Pro Comparison</h3>
        <div className="comparison-table">
          <div className="comparison-header">
            <span>Feature</span>
            <span>Free</span>
            <span>Pro</span>
          </div>
          <div className="comparison-row">
            <span>Daily Predictions</span>
            <span>3</span>
            <span className="pro-value">Unlimited</span>
          </div>
          <div className="comparison-row">
            <span>Match Analysis</span>
            <span>Basic</span>
            <span className="pro-value">Advanced</span>
          </div>
          <div className="comparison-row">
            <span>Value Betting</span>
            <span className="no-value">-</span>
            <span className="pro-value">Yes</span>
          </div>
          <div className="comparison-row">
            <span>Community Shares</span>
            <span>1 / day</span>
            <span className="pro-value">Unlimited</span>
          </div>
          <div className="comparison-row">
            <span>Advertisements</span>
            <span>Yes</span>
            <span className="pro-value">None</span>
          </div>
          <div className="comparison-row">
            <span>Priority Support</span>
            <span className="no-value">-</span>
            <span className="pro-value">Yes</span>
          </div>
        </div>
      </div>
    </div>
  )
}
