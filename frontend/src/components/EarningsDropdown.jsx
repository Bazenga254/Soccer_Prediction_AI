import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '../context/CurrencyContext'
import axios from 'axios'

export default function EarningsDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const [earnings, setEarnings] = useState(null)
  const [loading, setLoading] = useState(false)
  const [hidden, setHidden] = useState(() => localStorage.getItem('earnings_hidden') === 'true')
  const [kesRate, setKesRate] = useState(130) // KES per 1 USD, updated from API
  const dropdownRef = useRef(null)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { isKenyan } = useCurrency()

  // Fetch balance on mount so it always shows
  useEffect(() => {
    fetchEarnings()
    // Fetch exchange rate for KES conversion
    if (isKenyan) {
      axios.post('/api/payment/quote', { amount_usd: 1 })
        .then(res => { if (res.data.amount_kes) setKesRate(res.data.amount_kes) })
        .catch(() => {})
    }
  }, [isKenyan])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchEarnings = async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/user/earnings')
      setEarnings(res.data)
    } catch (err) {
      // Silently fail - will show $0.00
    } finally {
      setLoading(false)
    }
  }

  const handleOpen = () => {
    if (!isOpen) {
      fetchEarnings()
    }
    setIsOpen(!isOpen)
  }

  const toggleHidden = (e) => {
    e.stopPropagation()
    const next = !hidden
    setHidden(next)
    localStorage.setItem('earnings_hidden', next ? 'true' : 'false')
    // Sync to server for cross-device consistency
    try {
      const token = localStorage.getItem('spark_token')
      if (token) {
        fetch('/api/user/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ preferences: { earnings_hidden: next } }),
        }).catch(() => {})
      }
    } catch { /* ignore */ }
  }

  const goToDashboard = () => {
    setIsOpen(false)
    setTimeout(() => navigate('/creator'), 50)
  }

  // Helper: format amount in user's currency
  const fmt = (usdAmount) => {
    if (isKenyan) return `KES ${Math.round(usdAmount * kesRate).toLocaleString()}`
    return `$${usdAmount.toFixed(2)}`
  }

  const balance = earnings ? earnings.balance_usd : 0
  const kesBal = earnings ? (earnings.account_balance_kes || 0) : 0
  const usdBal = earnings ? (earnings.account_balance_usd || 0) : 0
  const hasAnyBalance = kesBal > 0 || usdBal > 0

  // Account balance: combine USD (converted) + KES for Kenyan users
  const totalAcctKes = Math.round(usdBal * kesRate) + Math.round(kesBal)
  const fmtAcct = isKenyan
    ? `KES ${totalAcctKes.toLocaleString()}`
    : `$${usdBal.toFixed(2)}`

  return (
    <div className="earnings-dropdown-wrapper" ref={dropdownRef}>
      <button className="earnings-btn" onClick={handleOpen} title={t('earnings.title')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        <span className="earnings-inline-amount">{hidden ? '***' : fmtAcct}</span>
      </button>

      {isOpen && (
        <div className="earnings-dropdown">
          <div className="earnings-dropdown-header">
            <span className="earnings-dropdown-title">{t('earnings.title')}</span>
            <button className="earnings-privacy-toggle" onClick={toggleHidden} title={hidden ? 'Show amounts' : 'Hide amounts'}>
              {hidden ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          <div className="earnings-dropdown-body">
            {loading ? (
              <div className="earnings-loading">Loading...</div>
            ) : !earnings ? (
              <div className="earnings-empty">Failed to load earnings</div>
            ) : (
              <>
                {/* Account Balance (top-up) */}
                {hasAnyBalance && (
                  <div className="earnings-account-balance">
                    <div className="earnings-account-label">Account Balance</div>
                    <div className="earnings-account-amount">
                      {hidden ? '****' : fmtAcct}
                    </div>
                  </div>
                )}

                {/* Creator Earnings */}
                <div className="earnings-balance-card">
                  <div className="earnings-balance-label">Creator Earnings</div>
                  <div className="earnings-balance-amount">{hidden ? '****' : fmt(earnings.balance_usd)}</div>
                </div>

                <div className="earnings-stats-row">
                  <div className="earnings-stat">
                    <span className="earnings-stat-value">{hidden ? '***' : fmt(earnings.total_earned_usd)}</span>
                    <span className="earnings-stat-label">{t('earnings.totalEarned')}</span>
                  </div>
                  <div className="earnings-stat">
                    <span className="earnings-stat-value">{earnings.total_sales}</span>
                    <span className="earnings-stat-label">Sales</span>
                  </div>
                  <div className="earnings-stat">
                    <span className="earnings-stat-value">{earnings.paid_predictions}</span>
                    <span className="earnings-stat-label">Paid Picks</span>
                  </div>
                </div>

                {earnings.recent_sales.length > 0 && (
                  <div className="earnings-recent">
                    <div className="earnings-recent-title">Recent Sales</div>
                    {earnings.recent_sales.map((sale, i) => (
                      <div key={i} className="earnings-sale-item">
                        <span className="sale-match">{sale.match}</span>
                        <span className="sale-amount">{hidden ? '***' : `+${fmt(sale.amount)}`}</span>
                      </div>
                    ))}
                  </div>
                )}

              </>
            )}
          </div>

          <div className="earnings-dropdown-footer" onMouseDown={(e) => { e.stopPropagation(); goToDashboard() }}>
            {t('earnings.viewDashboard')}
          </div>
        </div>
      )}
    </div>
  )
}
