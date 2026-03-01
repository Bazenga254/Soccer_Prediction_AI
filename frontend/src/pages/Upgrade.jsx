import { useState, useEffect, useMemo, useCallback } from 'react'
import { useCurrency } from '../context/CurrencyContext'
import { useCredits } from '../context/CreditContext'
import { useAuth } from '../context/AuthContext'
import MpesaPaymentModal from '../components/MpesaPaymentModal'
import WhopCheckoutModal from '../components/WhopCheckoutModal'
import SEOHead from '../components/SEOHead'
import axios from 'axios'

const FALLBACK_PLANS = {
  weekly_kes:  { name: 'Pro Weekly',  price: 250,  currency: 'KES', duration_days: 7  },
  weekly_usd:  { name: 'Pro Weekly',  price: 2.50, currency: 'USD', duration_days: 7  },
  monthly_kes: { name: 'Pro Monthly', price: 800,  currency: 'KES', duration_days: 30 },
  monthly_usd: { name: 'Pro Monthly', price: 8.00, currency: 'USD', duration_days: 30 },
}

export default function Upgrade() {
  const { currency, isKenyan, currencySymbol } = useCurrency()
  const { totalCredits, refreshCredits } = useCredits()
  const { refreshProfile } = useAuth()

  // UI state
  const [paymentMode, setPaymentMode] = useState('paygo')
  const [billingCycle, setBillingCycle] = useState('weekly')
  const [depositAmount, setDepositAmount] = useState('')

  // Data state
  const [plans, setPlans] = useState({})
  const [creditCosts, setCreditCosts] = useState(null)
  const [activeSub, setActiveSub] = useState(null)
  const [loading, setLoading] = useState(true)

  // Modal state
  const [mpesaModal, setMpesaModal] = useState({ open: false, amountKes: 0, amountUsd: 0, txType: 'balance_topup', refId: '', title: '' })
  const [whopModal, setWhopModal] = useState({ open: false, txType: 'balance_topup', planId: '', amountUsd: 0, title: '' })

  // Fetch data on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [plansRes, costsRes, statusRes] = await Promise.allSettled([
          axios.get('/api/subscription/plans'),
          axios.get('/api/credits/costs'),
          axios.get('/api/subscription/status'),
        ])
        if (plansRes.status === 'fulfilled') setPlans(plansRes.value.data.plans || plansRes.value.data || {})
        if (costsRes.status === 'fulfilled') setCreditCosts(costsRes.value.data)
        if (statusRes.status === 'fulfilled') setActiveSub(statusRes.value.data)
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  // Credit calculation
  const creditRate = isKenyan ? (creditCosts?.credit_rate_kes || 10) : (creditCosts?.credit_rate_usd || 1300)
  const minDeposit = isKenyan ? 10 : 1
  const numericAmount = parseFloat(depositAmount) || 0
  const calculatedCredits = Math.floor(numericAmount * creditRate)
  const isValidAmount = numericAmount >= minDeposit

  // Selected subscription plan
  const selectedPlan = useMemo(() => {
    const key = `${billingCycle}_${isKenyan ? 'kes' : 'usd'}`
    return plans[key] || FALLBACK_PLANS[key]
  }, [plans, billingCycle, isKenyan])

  const planPrice = selectedPlan?.price || 0
  const planId = `${billingCycle}_${isKenyan ? 'kes' : 'usd'}`
  const dailyCredits = creditCosts?.daily_credits_subscriber || 2000

  // Active subscription check
  const isSubActive = activeSub?.status === 'active' || activeSub?.status === 'trial'
  const activeSubCycle = activeSub?.plan_id?.includes('monthly') ? 'monthly' : activeSub?.plan_id?.includes('weekly') ? 'weekly' : null

  // Payment handlers
  const openPaygoMpesa = () => {
    setMpesaModal({
      open: true,
      amountKes: isKenyan ? numericAmount : 0,
      amountUsd: isKenyan ? 0 : numericAmount,
      txType: 'balance_topup',
      refId: '',
      title: 'Buy Credits',
    })
  }

  const openPaygoCard = () => {
    const usdAmount = isKenyan ? numericAmount / 130 : numericAmount
    setWhopModal({
      open: true,
      txType: 'balance_topup',
      planId: '',
      amountUsd: Math.max(usdAmount, 1),
      title: 'Buy Credits',
    })
  }

  const openSubMpesa = () => {
    setMpesaModal({
      open: true,
      amountKes: isKenyan ? planPrice : 0,
      amountUsd: isKenyan ? 0 : planPrice,
      txType: 'subscription',
      refId: planId,
      title: `Subscribe - ${selectedPlan?.name || billingCycle}`,
    })
  }

  const openSubCard = () => {
    const usdPrice = isKenyan ? planPrice / 130 : planPrice
    setWhopModal({
      open: true,
      txType: 'subscription',
      planId: planId,
      amountUsd: usdPrice,
      title: `Subscribe - ${selectedPlan?.name || billingCycle}`,
    })
  }

  const handlePaymentSuccess = useCallback(async () => {
    setMpesaModal(prev => ({ ...prev, open: false }))
    setWhopModal(prev => ({ ...prev, open: false }))
    await refreshCredits()
    refreshProfile()
    try {
      const res = await axios.get('/api/subscription/status')
      setActiveSub(res.data)
    } catch {}
    // Track purchase conversion
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'purchase', {
        currency: isKenyan ? 'KES' : 'USD',
        value: parseFloat(depositAmount) || 0,
        items: [{ item_name: 'Credits Purchase', quantity: 1 }],
      })
    }
    setDepositAmount('')
  }, [refreshCredits, refreshProfile, isKenyan, depositAmount])

  const costPrediction = creditCosts?.prediction || 50
  const costAnalysis = creditCosts?.match_analysis || 250
  const costJackpotMatch = 130

  return (
    <div className="upgrade-page-v2">
      <SEOHead title="Get Credits - Spark AI" description="Buy credits or subscribe for daily credit allocations." path="/upgrade" />

      {/* Header */}
      <div className="upgrade-v2-header">
        <h1>Get Credits</h1>
        <div className="upgrade-v2-balance">
          {"\u26A1"} {totalCredits.toLocaleString()} credits
        </div>
      </div>

      {/* Payment Mode Toggle */}
      <div className="upgrade-v2-mode-toggle">
        <button
          className={`upgrade-v2-mode-pill ${paymentMode === 'paygo' ? 'active' : ''}`}
          onClick={() => setPaymentMode('paygo')}
        >
          Pay on the Go
        </button>
        <button
          className={`upgrade-v2-mode-pill ${paymentMode === 'plans' ? 'active' : ''}`}
          onClick={() => setPaymentMode('plans')}
        >
          Subscription Plans
        </button>
      </div>

      {/* Pay on the Go */}
      {paymentMode === 'paygo' && (
        <div className="upgrade-v2-card">
          <h2 className="upgrade-v2-card-title">Buy Credits</h2>

          {/* Amount Input */}
          <div className="upgrade-v2-input-group">
            <span className="upgrade-v2-currency-prefix">{isKenyan ? 'KES' : 'USD'}</span>
            <input
              type="number"
              min={minDeposit}
              step={isKenyan ? 1 : 0.01}
              placeholder={String(minDeposit)}
              value={depositAmount}
              onChange={e => setDepositAmount(e.target.value)}
              className="upgrade-v2-amount-input"
            />
          </div>

          {/* Validation */}
          {depositAmount !== '' && numericAmount > 0 && numericAmount < minDeposit && (
            <p className="upgrade-v2-validation">Minimum deposit is {currencySymbol}{minDeposit}</p>
          )}

          {/* Credit Calculation */}
          <div className="upgrade-v2-credit-calc">
            {numericAmount >= minDeposit ? (
              <p className="upgrade-v2-credit-result">
                You'll receive: {"\u26A1"} <strong>{calculatedCredits.toLocaleString()}</strong> credits
              </p>
            ) : (
              <p className="upgrade-v2-credit-placeholder">
                Enter an amount to see credits
              </p>
            )}
          </div>

          {/* Credit Cost Reference */}
          <div className="upgrade-v2-cost-ref">
            <p className="upgrade-v2-cost-ref-title">What credits buy:</p>
            <div className="upgrade-v2-cost-ref-items">
              <span>{costPrediction} cr = 1 prediction</span>
              <span>{costJackpotMatch} cr = 1 jackpot match</span>
              <span>{costAnalysis} cr = 1 full analysis</span>
            </div>
          </div>

          {/* Primary Payment Button */}
          {isKenyan ? (
            <button
              className="upgrade-v2-pay-btn upgrade-v2-mpesa-btn"
              disabled={!isValidAmount}
              onClick={openPaygoMpesa}
            >
              Pay with M-Pesa
            </button>
          ) : (
            <button
              className="upgrade-v2-pay-btn upgrade-v2-card-btn"
              disabled={!isValidAmount}
              onClick={openPaygoCard}
            >
              Pay with Card
            </button>
          )}

          {/* Alt Payment */}
          <p className="upgrade-v2-alt-pay">
            {isKenyan ? (
              <>Or <button className="upgrade-v2-link-btn" disabled={!isValidAmount} onClick={openPaygoCard}>pay with card</button></>
            ) : (
              <>Kenyan? <button className="upgrade-v2-link-btn" disabled={!isValidAmount} onClick={openPaygoMpesa}>Use M-Pesa</button></>
            )}
          </p>
        </div>
      )}

      {/* Subscription Plans */}
      {paymentMode === 'plans' && (
        <div className="upgrade-v2-plans-section">
          {/* Billing Cycle Toggle */}
          <div className="upgrade-v2-cycle-toggle">
            <button
              className={`upgrade-v2-cycle-pill ${billingCycle === 'weekly' ? 'active' : ''}`}
              onClick={() => setBillingCycle('weekly')}
            >
              Weekly
            </button>
            <button
              className={`upgrade-v2-cycle-pill ${billingCycle === 'monthly' ? 'active' : ''}`}
              onClick={() => setBillingCycle('monthly')}
            >
              Monthly {billingCycle !== 'monthly' && <span className="upgrade-v2-save-tag">Save 20%</span>}
            </button>
          </div>

          {/* Plan Card */}
          <div className="upgrade-v2-card upgrade-v2-plan-card">
            <div className="upgrade-v2-plan-price">
              <span className="upgrade-v2-price-amount">{currencySymbol}{planPrice}</span>
              <span className="upgrade-v2-price-cycle">/{billingCycle === 'weekly' ? 'week' : 'month'}</span>
            </div>

            <div className="upgrade-v2-plan-headline">
              {"\u26A1"} {dailyCredits.toLocaleString()} credits/day
            </div>

            <ul className="upgrade-v2-plan-features">
              <li>{"\u2713"} AI predictions & match analysis</li>
              <li>{"\u2713"} Jackpot analyzer</li>
              <li>{"\u2713"} AI chat assistant</li>
              <li>{"\u2713"} Community predictions</li>
              <li>{"\u2713"} Ad-free experience</li>
              <li>{"\u2713"} Priority support</li>
            </ul>

            {isSubActive && activeSubCycle === billingCycle ? (
              <button className="upgrade-v2-pay-btn upgrade-v2-active-btn" disabled>
                {"\u2713"} Current Plan
              </button>
            ) : isKenyan ? (
              <button className="upgrade-v2-pay-btn upgrade-v2-mpesa-btn" onClick={openSubMpesa}>
                Subscribe with M-Pesa
              </button>
            ) : (
              <button className="upgrade-v2-pay-btn upgrade-v2-card-btn" onClick={openSubCard}>
                Subscribe with Card
              </button>
            )}

            {/* Alt payment for subscription */}
            {!(isSubActive && activeSubCycle === billingCycle) && (
              <p className="upgrade-v2-alt-pay">
                {isKenyan ? (
                  <>Or <button className="upgrade-v2-link-btn" onClick={openSubCard}>pay with card</button></>
                ) : (
                  <>Kenyan? <button className="upgrade-v2-link-btn" onClick={openSubMpesa}>Use M-Pesa</button></>
                )}
              </p>
            )}
          </div>

          <p className="upgrade-v2-rollover-note">
            Daily credits refresh at midnight. Unused daily credits do not roll over.
          </p>
        </div>
      )}

      {/* Active Subscription Info */}
      {isSubActive && (
        <div className="upgrade-v2-active-info">
          <p>{"\u2713"} You have an active {activeSub?.plan_id?.includes('monthly') ? 'monthly' : 'weekly'} subscription</p>
          {activeSub?.expires_at && (
            <p className="upgrade-v2-active-expiry">
              Renews: {new Date(activeSub.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>
      )}

      {/* Modals */}
      {mpesaModal.open && (
        <MpesaPaymentModal
          isOpen={true}
          onClose={() => setMpesaModal(prev => ({ ...prev, open: false }))}
          onSuccess={handlePaymentSuccess}
          amountKes={mpesaModal.amountKes}
          amountUsd={mpesaModal.amountUsd}
          transactionType={mpesaModal.txType}
          referenceId={mpesaModal.refId}
          title={mpesaModal.title}
        />
      )}

      {whopModal.open && (
        <WhopCheckoutModal
          isOpen={true}
          onClose={() => setWhopModal(prev => ({ ...prev, open: false }))}
          onSuccess={handlePaymentSuccess}
          transactionType={whopModal.txType}
          planId={whopModal.planId}
          amountUsd={whopModal.amountUsd}
          title={whopModal.title}
        />
      )}
    </div>
  )
}
