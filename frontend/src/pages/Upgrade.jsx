import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import axios from 'axios'
import MpesaPaymentModal from '../components/MpesaPaymentModal'
import WhopCheckoutModal from '../components/WhopCheckoutModal'

export default function Upgrade() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { currency, currencySymbol, isKenyan } = useCurrency()
  const [plans, setPlans] = useState({})
  const [subscription, setSubscription] = useState(null)
  const [trialEligible, setTrialEligible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mpesaModal, setMpesaModal] = useState({ open: false, planId: '', amountKes: 0, amountUsd: 0, title: '', description: '', txType: 'subscription' })
  const [balance, setBalance] = useState(null)
  const [depositAmount, setDepositAmount] = useState(currency === 'KES' ? 100 : 1)
  const [minDepositKes, setMinDepositKes] = useState(100)
  const [whopModal, setWhopModal] = useState({ open: false, transactionType: '', planId: '', amountUsd: 0, title: '' })
  const [pricingInfo, setPricingInfo] = useState(null)
  const [creatorWallet, setCreatorWallet] = useState(null)
  const [balancePayLoading, setBalancePayLoading] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [plansRes, statusRes, balRes, pricingRes, earningsRes] = await Promise.allSettled([
          axios.get('/api/subscription/plans'),
          axios.get('/api/subscription/status'),
          axios.get('/api/user/balance'),
          axios.get('/api/pricing'),
          axios.get('/api/user/earnings'),
        ])
        if (plansRes.status === 'fulfilled') setPlans(plansRes.value.data.plans || {})
        if (statusRes.status === 'fulfilled') {
          setSubscription(statusRes.value.data.subscription)
          setTrialEligible(!statusRes.value.data.has_used_trial)
        }
        if (balRes.status === 'fulfilled') setBalance(balRes.value.data.balance)
        if (pricingRes.status === 'fulfilled') setPricingInfo(pricingRes.value.data)
        if (earningsRes.status === 'fulfilled') setCreatorWallet({
          balance_usd: earningsRes.value.data.balance_usd || 0,
          balance_kes: earningsRes.value.data.balance_kes || 0,
        })
      } catch { /* ignore */ }
      setLoading(false)
    }
    fetchData()
  }, [])

  const [kesRate, setKesRate] = useState(130) // KES per 1 USD

  // Fetch KES exchange rate (min deposit is fixed at KES 100 / $1)
  useEffect(() => {
    if (currency !== 'KES') return
    axios.post('/api/payment/quote', { amount_usd: 1 })
      .then(res => {
        if (res.data.amount_kes) {
          setKesRate(res.data.amount_kes)
        }
      })
      .catch(() => {})
  }, [currency])

  if (loading) {
    return (
      <div className="upgrade-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t('upgrade.loadingPlans')}</p>
        </div>
      </div>
    )
  }

  const isPro = user?.tier === 'pro'
  const isTrial = user?.tier === 'trial'
  const hasActiveSub = isPro || isTrial

  const weeklyPlan = currency === 'USD' ? plans.weekly_usd : plans.weekly_kes
  const monthlyPlan = currency === 'USD' ? plans.monthly_usd : plans.monthly_kes
  const trialPlan = currency === 'USD' ? plans.trial_usd : plans.trial_kes

  // Gather extra plans (not the default ones)
  const DEFAULT_PLAN_IDS = ['weekly_usd', 'weekly_kes', 'monthly_usd', 'monthly_kes', 'trial_usd', 'trial_kes']
  const extraPlans = Object.entries(plans)
    .filter(([id]) => !DEFAULT_PLAN_IDS.includes(id))
    .filter(([, plan]) => plan.currency === currency)

  const matchPrice = currency === 'KES'
    ? (pricingInfo?.pay_per_use?.match_analysis_price_kes ?? 25)
    : (pricingInfo?.pay_per_use?.match_analysis_price_usd ?? 0.25)
  const jackpotPrice = currency === 'KES'
    ? (pricingInfo?.pay_per_use?.jackpot_analysis_price_kes ?? 65)
    : (pricingInfo?.pay_per_use?.jackpot_analysis_price_usd ?? 0.65)
  const chatTopupPrice = currency === 'KES'
    ? (pricingInfo?.pay_per_use?.chat_topup_price_kes ?? 50)
    : (pricingInfo?.pay_per_use?.chat_topup_price_usd ?? 0.50)
  const chatTopupPrompts = pricingInfo?.pay_per_use?.chat_topup_prompts ?? 2

  const handleUpgrade = (planId, plan) => {
    if (plan.currency === 'KES' || isKenyan) {
      // Kenyan IP users always pay via M-Pesa, no card allowed
      const periodLabel = plan.duration_days === 3 ? '3 days' : plan.duration_days === 7 ? 'week' : 'month'
      setMpesaModal({
        open: true,
        planId,
        amountKes: plan.currency === 'KES' ? plan.price : 0,
        amountUsd: plan.currency === 'USD' ? plan.price : 0,
        title: `Subscribe to ${plan.name}`,
        description: `${plan.currency === 'KES' ? 'KES' : '$'}${plan.currency === 'KES' ? ' ' + plan.price.toLocaleString() : plan.price} / ${periodLabel}`,
        txType: 'subscription',
      })
    } else {
      // Non-Kenyan USD plans — open Whop checkout for card payment
      setWhopModal({
        open: true,
        transactionType: 'subscription',
        planId,
        amountUsd: plan.price,
        title: `Subscribe to ${plan.name}`,
      })
    }
  }

  const handleDeposit = () => {
    if (isKenyan) {
      if (depositAmount < minDepositKes) return
      setMpesaModal({
        open: true,
        planId: 'balance_topup',
        amountKes: depositAmount,
        amountUsd: 0,
        title: 'Deposit to Balance',
        description: `KES ${depositAmount.toLocaleString()} Pay on the Go deposit`,
        txType: 'balance_topup',
      })
    } else {
      if (depositAmount < 1) return
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
  }

  const getTotalBalance = (plan) => {
    const cur = plan?.currency || currency
    const userUsd = balance?.balance_usd || 0
    const userKes = balance?.balance_kes || 0
    const creatorUsd = creatorWallet?.balance_usd || 0
    const creatorKes = creatorWallet?.balance_kes || 0
    if (cur === 'KES') {
      // Convert USD to KES and add KES balances
      return Math.round(userUsd * kesRate) + Math.round(userKes) + Math.round(creatorUsd * kesRate) + Math.round(creatorKes)
    }
    // For USD plans, convert KES to USD and add
    return userUsd + creatorUsd + (kesRate > 0 ? (userKes + creatorKes) / kesRate : 0)
  }

  const handleBalancePay = async (planId) => {
    if (balancePayLoading) return
    setBalancePayLoading(true)
    try {
      const res = await axios.post('/api/subscription/pay-with-balance', { plan_id: planId })
      if (res.data.success) {
        alert(`Subscription activated! Expires: ${res.data.expires_at?.slice(0, 10)}`)
        window.location.reload()
      }
    } catch (err) {
      alert(err.response?.data?.detail || 'Payment failed')
    } finally {
      setBalancePayLoading(false)
    }
  }

  const handlePaymentSuccess = async () => {
    setMpesaModal({ open: false, planId: '', amountKes: 0, amountUsd: 0, title: '', description: '', txType: 'subscription' })
    setWhopModal({ open: false, transactionType: '', planId: '', amountUsd: 0, title: '' })
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
            <span className="sub-banner-badge">{t('upgrade.proActive')}</span>
            <span className="sub-banner-text">
              {t('upgrade.expiresOn', { date: new Date(subscription.expires_at).toLocaleDateString(), days: subscription.days_remaining })}
            </span>
          </div>
        </div>
      )}

      {/* Trial active banner */}
      {isTrial && subscription && (
        <div className="active-sub-banner trial-banner">
          <div className="sub-banner-content">
            <span className="sub-banner-badge trial">TRIAL ACTIVE</span>
            <span className="sub-banner-text">
              Your trial expires on {new Date(subscription.expires_at).toLocaleDateString()} ({subscription.days_remaining} days remaining). Upgrade to continue!
            </span>
          </div>
        </div>
      )}

      <div className="upgrade-header">
        <h2>{hasActiveSub ? t('upgrade.manageSub') : t('upgrade.title')}</h2>
        <p className="upgrade-subtitle">
          {hasActiveSub
            ? (isTrial ? 'You are on a 3-day trial. Upgrade to a full plan for unlimited access!' : t('upgrade.fullAccess'))
            : t('upgrade.unlockFeatures')}
        </p>
      </div>

      {/* Plan Cards */}
      <div className="plans-grid">
        {/* Free Plan - only visible after trial has been used */}
        {!trialEligible && !hasActiveSub && (
          <div className={`plan-card current`}>
            <div className="plan-header">
              <h3 className="plan-name">{t('upgrade.freePlan')}</h3>
              <div className="plan-price">
                <span className="price-amount">{currencySymbol}0</span>
                <span className="price-period">{t('upgrade.forever')}</span>
              </div>
            </div>
            <ul className="plan-features">
              <li className="feature-item">{t('upgrade.freeFeature1')}</li>
              <li className="feature-item">{t('upgrade.freeFeature2')}</li>
              <li className="feature-item">{t('upgrade.freeFeature3')}</li>
              <li className="feature-item">{t('upgrade.freeFeature4')}</li>
              <li className="feature-item">{t('upgrade.freeFeature5')}</li>
              <li className="feature-item disabled">{t('upgrade.advancedAnalytics')}</li>
              <li className="feature-item disabled">{t('upgrade.valueBetting')}</li>
              <li className="feature-item disabled">{t('upgrade.adFree')}</li>
            </ul>
            <div className="plan-current-badge">{t('upgrade.currentPlan')}</div>
          </div>
        )}

        {/* Trial Plan - between Free and Pro Weekly */}
        {trialEligible && !hasActiveSub && trialPlan && (
          <div className="plan-card trial">
            <div className="plan-ribbon trial-ribbon">Try for {currencySymbol}{trialPlan.price}!</div>
            <div className="plan-header">
              <h3 className="plan-name">3-Day Trial</h3>
              <div className="plan-price">
                <span className="price-amount">
                  {currencySymbol}{trialPlan.price}
                </span>
                <span className="price-period">/ 3 days</span>
              </div>
            </div>
            <ul className="plan-features">
              {(trialPlan.features || []).map((f, i) => (
                <li key={i} className="feature-item included">{f}</li>
              ))}
            </ul>
            <div className="plan-btn-group">
              <button className="plan-upgrade-btn trial-btn" onClick={() => handleUpgrade(currency === 'USD' ? 'trial_usd' : 'trial_kes', trialPlan)}>
                {currency === 'KES' ? `Pay with M-Pesa` : `Start 3-Day Trial`}
              </button>
              {getTotalBalance(trialPlan) >= trialPlan.price && (
                <button className="plan-upgrade-btn balance-btn" disabled={balancePayLoading} onClick={() => handleBalancePay(currency === 'USD' ? 'trial_usd' : 'trial_kes')}>
                  {balancePayLoading ? 'Processing...' : `Pay with Balance`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Weekly Plan */}
        {weeklyPlan && (
          <div className={`plan-card pro ${isPro ? 'current' : 'recommended'}`}>
            {!hasActiveSub && <div className="plan-ribbon">{t('upgrade.popular')}</div>}
            <div className="plan-header">
              <h3 className="plan-name">{t('upgrade.proWeekly')}</h3>
              <div className="plan-price">
                <span className="price-amount">
                  {currencySymbol}{weeklyPlan.price}
                </span>
                <span className="price-period">{t('upgrade.perWeek')}</span>
              </div>
            </div>
            <ul className="plan-features">
              {weeklyPlan.features.map((f, i) => (
                <li key={i} className="feature-item included">{f}</li>
              ))}
            </ul>
            {isPro ? (
              <div className="plan-current-badge pro">{t('common.active')}</div>
            ) : (
              <div className="plan-btn-group">
                <button className="plan-upgrade-btn" onClick={() => handleUpgrade(currency === 'USD' ? 'weekly_usd' : 'weekly_kes', weeklyPlan)}>
                  {currency === 'KES' ? t('upgrade.payWithMpesa') : t('upgrade.upgradeNow')}
                </button>
                {getTotalBalance(weeklyPlan) >= weeklyPlan.price && (
                  <button className="plan-upgrade-btn balance-btn" disabled={balancePayLoading} onClick={() => handleBalancePay(currency === 'USD' ? 'weekly_usd' : 'weekly_kes')}>
                    {balancePayLoading ? 'Processing...' : 'Pay with Balance'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Monthly Plan */}
        {monthlyPlan && (
          <div className="plan-card pro-monthly">
            <div className="plan-save-tag">{t('upgrade.save20')}</div>
            <div className="plan-header">
              <h3 className="plan-name">{t('upgrade.proMonthly')}</h3>
              <div className="plan-price">
                <span className="price-amount">
                  {currencySymbol}{monthlyPlan.price}
                </span>
                <span className="price-period">{t('upgrade.perMonth')}</span>
              </div>
            </div>
            <ul className="plan-features">
              {monthlyPlan.features.map((f, i) => (
                <li key={i} className="feature-item included">{f}</li>
              ))}
            </ul>
            {isPro ? (
              <div className="plan-current-badge pro">{t('common.active')}</div>
            ) : (
              <div className="plan-btn-group">
                <button className="plan-upgrade-btn monthly" onClick={() => handleUpgrade(currency === 'USD' ? 'monthly_usd' : 'monthly_kes', monthlyPlan)}>
                  {currency === 'KES' ? t('upgrade.payWithMpesa') : t('upgrade.upgradeNow')}
                </button>
                {getTotalBalance(monthlyPlan) >= monthlyPlan.price && (
                  <button className="plan-upgrade-btn balance-btn" disabled={balancePayLoading} onClick={() => handleBalancePay(currency === 'USD' ? 'monthly_usd' : 'monthly_kes')}>
                    {balancePayLoading ? 'Processing...' : 'Pay with Balance'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Extra Plans (admin-created) */}
        {extraPlans.map(([planId, plan]) => (
          <div key={planId} className="plan-card pro-extra">
            <div className="plan-header">
              <h3 className="plan-name">{plan.name}</h3>
              <div className="plan-price">
                <span className="price-amount">
                  {plan.currency === 'KES' ? 'KES ' : '$'}{plan.price}
                </span>
                <span className="price-period">
                  {plan.duration_days === 1 ? '/ day' : plan.duration_days === 7 ? '/ week' : plan.duration_days === 30 ? '/ month' : `/ ${plan.duration_days} days`}
                </span>
              </div>
            </div>
            <ul className="plan-features">
              {(plan.features || []).map((f, i) => (
                <li key={i} className="feature-item included">{f}</li>
              ))}
            </ul>
            {isPro ? (
              <div className="plan-current-badge pro">{t('common.active')}</div>
            ) : (
              <div className="plan-btn-group">
                <button className="plan-upgrade-btn" onClick={() => handleUpgrade(planId, plan)}>
                  {plan.currency === 'KES' ? t('upgrade.payWithMpesa') : t('upgrade.upgradeNow')}
                </button>
                {getTotalBalance(plan) >= plan.price && (
                  <button className="plan-upgrade-btn balance-btn" disabled={balancePayLoading} onClick={() => handleBalancePay(planId)}>
                    {balancePayLoading ? 'Processing...' : 'Pay with Balance'}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pay on the Go - separate section */}
      {(
        <div className="paygo-section">
          <div className="plan-card paygo">
            <div className="plan-ribbon paygo-ribbon">{t('upgrade.flexible')}</div>
            <div className="plan-header">
              <h3 className="plan-name">{t('upgrade.payOnTheGo')}</h3>
              <div className="plan-price">
                <span className="price-amount">{isKenyan ? `From KES ${minDepositKes.toLocaleString()}` : t('upgrade.fromDeposit')}</span>
                <span className="price-period">{t('upgrade.deposit')}</span>
              </div>
            </div>
            <div className="paygo-pricing">
              <div className="paygo-price-item">
                <span className="paygo-price-label">{t('upgrade.matchAnalysis')}</span>
                <span className="paygo-price-value">{currencySymbol}{matchPrice.toFixed(2)}</span>
              </div>
              <div className="paygo-price-item">
                <span className="paygo-price-label">{t('upgrade.jackpotAnalysis')}</span>
                <span className="paygo-price-value">{currencySymbol}{jackpotPrice.toFixed(2)}</span>
              </div>
              <div className="paygo-price-item">
                <span className="paygo-price-label">AI Chat Prompts (x{chatTopupPrompts})</span>
                <span className="paygo-price-value">{currencySymbol}{chatTopupPrice.toFixed(2)}</span>
              </div>
            </div>
            <ul className="plan-features">
              <li className="feature-item included">{t('upgrade.unlockAnalysis')}</li>
              <li className="feature-item included">{t('upgrade.payWhenNeeded')}</li>
              <li className="feature-item included">{t('upgrade.noCommitment')}</li>
              <li className="feature-item included">{isKenyan ? `Deposit any amount (KES ${minDepositKes.toLocaleString()} min)` : t('upgrade.depositMin')}</li>
              <li className="feature-item included">{t('upgrade.balanceNoExpiry')}</li>
            </ul>
            {balance && ((balance.balance_usd || 0) > 0 || (balance.balance_kes || 0) > 0) && (
              <div className="paygo-balance">
                {t('upgrade.balance')}: <strong>
                  {isKenyan
                    ? `KES ${(Math.round((balance.balance_usd || 0) * kesRate) + Math.round(balance.balance_kes || 0)).toLocaleString()}`
                    : `$${(balance.balance_usd || 0).toFixed(2)}`
                  }
                </strong>
              </div>
            )}
            <div className="paygo-deposit-row">
              <div className="paygo-input-group">
                <span className="paygo-input-prefix">{currencySymbol}</span>
                <input
                  type="number"
                  min={isKenyan ? minDepositKes : 1}
                  step={isKenyan ? 10 : 1}
                  value={depositAmount}
                  onChange={e => setDepositAmount(Math.max(isKenyan ? minDepositKes : 1, Number(e.target.value)))}
                  className="paygo-input"
                />
              </div>
              <button className="paygo-deposit-btn" onClick={handleDeposit}>
                {t('upgrade.depositViaMpesa')}
              </button>
              {!isKenyan && (
                <button className="paygo-deposit-btn card" onClick={() => {
                  if (depositAmount < 1) return
                  setWhopModal({
                    open: true,
                    transactionType: 'balance_topup',
                    planId: '',
                    amountUsd: depositAmount,
                    title: `Deposit $${depositAmount.toFixed(2)} to Balance`,
                  })
                }}>
                  {t('upgrade.depositViaCard')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Methods Info */}
      {!isPro && !isTrial && (
        <div className="payment-methods-info">
          <h3>{t('upgrade.paymentMethods')}</h3>
          <div className="payment-methods-grid">
            <div className="payment-method active">
              <span className="pm-icon">📱</span>
              <span className="pm-name">M-Pesa</span>
              <span className="pm-note">{t('upgrade.payWithMpesaNote')}</span>
            </div>
            {!isKenyan && (
              <div className="payment-method active">
                <span className="pm-icon">💳</span>
                <span className="pm-name">{t('upgrade.cardPayment')}</span>
                <span className="pm-note">{t('upgrade.cardPaymentNote')}</span>
              </div>
            )}
          </div>
          <p className="payment-note">
            {t('upgrade.paymentMethodsNote')}
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

      <WhopCheckoutModal
        isOpen={whopModal.open}
        onClose={() => setWhopModal({ ...whopModal, open: false })}
        onSuccess={handlePaymentSuccess}
        transactionType={whopModal.transactionType}
        planId={whopModal.planId}
        amountUsd={whopModal.amountUsd}
        title={whopModal.title}
      />

      {/* Pro vs Free comparison */}
      <div className="comparison-section">
        <h3>{t('upgrade.comparisonTitle')}</h3>
        <p className="comparison-subtitle">See what each plan offers at a glance</p>
        <div className="comparison-table wide">
          <div className="comparison-header">
            <span>{t('upgrade.feature')}</span>
            <span>{t('upgrade.freePlan')}</span>
            <span>{t('upgrade.payOnTheGo')}</span>
            <span className="pro-col-header">{t('common.pro')}</span>
          </div>
          <div className="comparison-row">
            <span className="feature-label">{t('upgrade.matchAnalysis')}</span>
            <span>{t('upgrade.threePer24h')}</span>
            <span>{currencySymbol}{matchPrice} each</span>
            <span className="pro-value">20 per day</span>
          </div>
          <div className="comparison-row">
            <span className="feature-label">{t('upgrade.jackpotAnalysis')}</span>
            <span>{t('upgrade.twoThen172h')}</span>
            <span>{currencySymbol}{jackpotPrice} each</span>
            <span className="pro-value">5 per day</span>
          </div>
          <div className="comparison-row">
            <span className="feature-label">{t('upgrade.aiChatPrompts')}</span>
            <span>{t('upgrade.total10')}</span>
            <span>{t('upgrade.total10')}</span>
            <span className="pro-value">50 per day</span>
          </div>
          <div className="comparison-row">
            <span className="feature-label">Live Score Tracking</span>
            <span className="pro-value check-value">&#10003;</span>
            <span className="pro-value check-value">&#10003;</span>
            <span className="pro-value check-value">&#10003;</span>
          </div>
          <div className="comparison-row">
            <span className="feature-label">40+ Leagues Worldwide</span>
            <span className="pro-value check-value">&#10003;</span>
            <span className="pro-value check-value">&#10003;</span>
            <span className="pro-value check-value">&#10003;</span>
          </div>
          <div className="comparison-row">
            <span className="feature-label">Odds Comparison</span>
            <span className="no-value">&mdash;</span>
            <span className="no-value">&mdash;</span>
            <span className="pro-value check-value">&#10003;</span>
          </div>
          <div className="comparison-row">
            <span className="feature-label">{t('upgrade.advancedAnalytics')}</span>
            <span className="no-value">&mdash;</span>
            <span className="no-value">&mdash;</span>
            <span className="pro-value check-value">&#10003;</span>
          </div>
          <div className="comparison-row">
            <span className="feature-label">{t('upgrade.valueBetting')}</span>
            <span className="no-value">&mdash;</span>
            <span className="no-value">&mdash;</span>
            <span className="pro-value check-value">&#10003;</span>
          </div>
          <div className="comparison-row">
            <span className="feature-label">Chrome Extension</span>
            <span className="no-value">&mdash;</span>
            <span className="no-value">&mdash;</span>
            <span className="pro-value check-value">&#10003;</span>
          </div>
          <div className="comparison-row">
            <span className="feature-label">Community Predictions</span>
            <span>1 share/day</span>
            <span>1 share/day</span>
            <span className="pro-value">{t('upgrade.unlimited')}</span>
          </div>
          <div className="comparison-row">
            <span className="feature-label">Sell Predictions</span>
            <span className="no-value">&mdash;</span>
            <span className="no-value">&mdash;</span>
            <span className="pro-value check-value">&#10003;</span>
          </div>
          <div className="comparison-row">
            <span className="feature-label">{t('upgrade.advertisements')}</span>
            <span className="has-ads">Yes</span>
            <span className="has-ads">Yes</span>
            <span className="pro-value">{t('upgrade.none')}</span>
          </div>
          <div className="comparison-row">
            <span className="feature-label">{t('upgrade.prioritySupport')}</span>
            <span className="no-value">&mdash;</span>
            <span className="no-value">&mdash;</span>
            <span className="pro-value check-value">&#10003;</span>
          </div>
        </div>
      </div>
    </div>
  )
}
