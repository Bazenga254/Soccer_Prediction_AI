import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

export default function CryptoCheckoutModal({
  isOpen,
  onClose,
  onSuccess,
  transactionType,
  planId = '',
  predictionId = 0,
  amountUsd = 0,
  title = 'Crypto Payment',
}) {
  // NOWPayments requires ~$10 minimum per transaction
  const CRYPTO_MIN_USD = 10
  const effectiveAmount = Math.max(amountUsd, CRYPTO_MIN_USD)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [waitingForPayment, setWaitingForPayment] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [expired, setExpired] = useState(false)
  const [hostedUrl, setHostedUrl] = useState('')
  const pollRef = useRef(null)
  const chargeCodeRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      setLoading(true)
      setError('')
      setWaitingForPayment(false)
      setCompleted(false)
      setExpired(false)
      setHostedUrl('')
      chargeCodeRef.current = null
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    const createCharge = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await axios.post('/api/coinbase/create-charge', {
          transaction_type: transactionType,
          plan_id: planId,
          prediction_id: predictionId,
          amount_usd: effectiveAmount,
        })

        const { hosted_url, charge_code } = response.data
        chargeCodeRef.current = charge_code
        setHostedUrl(hosted_url)

        if (hosted_url) {
          window.open(hosted_url, '_blank')
          setLoading(false)
          setWaitingForPayment(true)

          // Poll for payment confirmation
          pollRef.current = setInterval(async () => {
            try {
              const statusRes = await axios.get('/api/coinbase/check-payment/' + charge_code)
              const st = statusRes.data.status
              if (st === 'completed') {
                clearInterval(pollRef.current)
                setCompleted(true)
                setTimeout(() => {
                  if (onSuccess) onSuccess()
                }, 1500)
              } else if (st === 'expired') {
                clearInterval(pollRef.current)
                setExpired(true)
              } else if (st === 'failed') {
                clearInterval(pollRef.current)
                setError('Payment failed or was cancelled.')
                setWaitingForPayment(false)
              }
            } catch {
              // Keep polling
            }
          }, 5000) // Crypto confirmations take longer, poll every 5s
        } else {
          setError('No checkout URL returned. Please try again.')
          setLoading(false)
        }
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to create crypto charge')
        setLoading(false)
      }
    }

    createCharge()

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [isOpen, transactionType, planId, predictionId, effectiveAmount])

  if (!isOpen) return null

  return (
    <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f7931a" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.5 8h3.5a2 2 0 0 1 0 4H9.5V8z" />
              <path d="M9.5 12h4a2 2 0 0 1 0 4H9.5v-4z" />
              <line x1="11" y1="6" x2="11" y2="8" />
              <line x1="13" y1="6" x2="13" y2="8" />
              <line x1="11" y1="16" x2="11" y2="18" />
              <line x1="13" y1="16" x2="13" y2="18" />
            </svg>
            <h3 style={styles.title}>{title}</h3>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {loading && (
          <div style={styles.centerContainer}>
            <div className="spinner" style={{ width: 32, height: 32 }}></div>
            <p style={styles.subText}>Creating crypto charge...</p>
          </div>
        )}

        {error && !loading && (
          <div style={styles.centerContainer}>
            <div style={styles.errorIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <p style={styles.errorText}>{error}</p>
            <button style={styles.retryBtn} onClick={() => {
              setError('')
              setLoading(true)
              setWaitingForPayment(false)
              setExpired(false)
            }}>
              Try Again
            </button>
          </div>
        )}

        {completed && (
          <div style={styles.centerContainer}>
            <div style={{ marginBottom: 8 }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <p style={styles.successText}>Payment Confirmed!</p>
            <p style={styles.subText}>Your crypto payment has been verified on the blockchain.</p>
          </div>
        )}

        {expired && !error && (
          <div style={styles.centerContainer}>
            <div style={{ marginBottom: 8 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <p style={{ ...styles.successText, color: '#fbbf24' }}>Charge Expired</p>
            <p style={styles.subText}>The payment window has expired. Please create a new charge.</p>
            <button style={styles.retryBtn} onClick={() => {
              setExpired(false)
              setError('')
              setLoading(true)
              setWaitingForPayment(false)
            }}>
              Create New Charge
            </button>
          </div>
        )}

        {waitingForPayment && !error && !completed && !expired && (
          <div style={styles.centerContainer}>
            {/* Crypto icon */}
            <div style={styles.cryptoIconWrap}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f7931a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.5 8h3.5a2 2 0 0 1 0 4H9.5V8z" />
                <path d="M9.5 12h4a2 2 0 0 1 0 4H9.5v-4z" />
              </svg>
            </div>

            <p style={styles.waitingTitle}>Complete payment in the new tab</p>
            <p style={styles.subText}>
              A crypto checkout has opened in a new tab. Select your preferred coin, send payment, and this page will update once the blockchain confirms the transaction.
            </p>

            {/* Amount display */}
            <div style={styles.amountBadge}>
              ${effectiveAmount.toFixed(2)} USD
            </div>

            {/* Supported coins */}
            <div style={styles.coinsRow}>
              <span style={styles.coinBadge}>BTC</span>
              <span style={styles.coinBadge}>ETH</span>
              <span style={styles.coinBadge}>USDT</span>
              <span style={styles.coinBadge}>USDC</span>
              <span style={styles.coinBadge}>LTC</span>
              <span style={styles.coinBadge}>SOL</span>
              <span style={styles.coinBadge}>DOGE</span>
              <span style={styles.coinBadge}>TRX</span>
              <span style={{...styles.coinBadge, color: '#64748b'}}>+300</span>
            </div>

            {/* Disclaimer */}
            <p style={styles.disclaimer}>
              Minimum crypto payment is ${CRYPTO_MIN_USD} USD due to network fees. Select a coin with lower fees (e.g. USDT TRC20, LTC, or TRX) for the best rates.
            </p>

            <div style={styles.waitingDots}>
              <div className="spinner" style={{ width: 18, height: 18 }}></div>
              <span style={styles.waitingStatus}>Waiting for blockchain confirmation...</span>
            </div>

            <button style={styles.reopenBtn} onClick={() => {
              if (hostedUrl) window.open(hostedUrl, '_blank')
            }}>
              Reopen payment page
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(4px)',
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  modal: {
    background: 'rgba(30, 41, 59, 0.97)',
    backdropFilter: 'blur(20px)',
    border: '1px solid #334155',
    borderRadius: '20px',
    padding: '0',
    maxWidth: '480px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #334155',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '600',
    color: '#f1f5f9',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: '24px',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  centerContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '36px 24px',
    gap: '12px',
  },
  subText: {
    color: '#94a3b8',
    fontSize: '13px',
    margin: 0,
    textAlign: 'center',
    lineHeight: '1.5',
  },
  errorIcon: {
    marginBottom: '4px',
  },
  errorText: {
    color: '#f87171',
    fontSize: '14px',
    textAlign: 'center',
    margin: 0,
  },
  retryBtn: {
    padding: '10px 24px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    cursor: 'pointer',
    marginTop: '4px',
  },
  successText: {
    color: '#22c55e',
    fontSize: '18px',
    fontWeight: '600',
    margin: 0,
  },
  cryptoIconWrap: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: 'rgba(247, 147, 26, 0.1)',
    border: '2px solid rgba(247, 147, 26, 0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '4px',
  },
  waitingTitle: {
    color: '#f1f5f9',
    fontSize: '16px',
    fontWeight: '600',
    margin: 0,
    textAlign: 'center',
  },
  amountBadge: {
    background: 'rgba(247, 147, 26, 0.12)',
    border: '1px solid rgba(247, 147, 26, 0.25)',
    color: '#f7931a',
    fontSize: '18px',
    fontWeight: '700',
    padding: '8px 20px',
    borderRadius: '10px',
    marginTop: '4px',
  },
  coinsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    justifyContent: 'center',
    marginTop: '4px',
  },
  coinBadge: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#cbd5e1',
    fontSize: '11px',
    fontWeight: '600',
    padding: '3px 8px',
    borderRadius: '6px',
    letterSpacing: '0.5px',
  },
  waitingDots: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '12px',
  },
  waitingStatus: {
    color: '#64748b',
    fontSize: '13px',
  },
  disclaimer: {
    color: '#94a3b8',
    fontSize: '11px',
    margin: 0,
    textAlign: 'center',
    lineHeight: '1.5',
    padding: '8px 12px',
    background: 'rgba(251, 191, 36, 0.08)',
    border: '1px solid rgba(251, 191, 36, 0.15)',
    borderRadius: '8px',
    marginTop: '4px',
  },
  reopenBtn: {
    padding: '8px 20px',
    background: 'transparent',
    color: '#f7931a',
    border: '1px solid rgba(247, 147, 26, 0.3)',
    borderRadius: '8px',
    fontSize: '13px',
    cursor: 'pointer',
    marginTop: '8px',
  },
}
