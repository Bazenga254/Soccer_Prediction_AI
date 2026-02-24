import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import axios from 'axios'

function normalizePhone(input) {
  const digits = input.replace(/[^0-9]/g, '')
  if (digits.startsWith('0') && digits.length === 10) return '254' + digits.slice(1)
  if (digits.startsWith('254') && digits.length === 12) return digits
  if (digits.startsWith('+254')) return digits.slice(1)
  return digits
}

function isValidPhone(phone) {
  return /^254[17]\d{8}$/.test(phone)
}

export default function MpesaPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  amountKes = 0,
  amountUsd = 0,
  transactionType,
  referenceId = '',
  title = 'Payment',
  description = '',
}) {
  const [step, setStep] = useState('phone_input')
  const [phone, setPhone] = useState(localStorage.getItem('mpesa_phone') || '')
  const [transactionId, setTransactionId] = useState(null)
  const [error, setError] = useState('')
  const [kesAmount, setKesAmount] = useState(amountKes)
  const [usdAmount, setUsdAmount] = useState(amountUsd)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const pollRef = useRef(null)
  const pollCount = useRef(0)
  const { t } = useTranslation()

  // Fetch KES quote if only USD amount provided
  useEffect(() => {
    if (!isOpen) return
    if (amountKes > 0) {
      setKesAmount(amountKes)
      return
    }
    if (amountUsd > 0) {
      setQuoteLoading(true)
      axios.post('/api/payment/quote', { amount_usd: amountUsd })
        .then(res => {
          setKesAmount(res.data.amount_kes || 0)
          setUsdAmount(res.data.amount_usd || amountUsd)
        })
        .catch(() => setError('Failed to get price quote'))
        .finally(() => setQuoteLoading(false))
    }
  }, [isOpen, amountKes, amountUsd])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('phone_input')
      setError('')
      setTransactionId(null)
      pollCount.current = 0
    } else {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [isOpen])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const handleInitiate = async () => {
    const normalized = normalizePhone(phone)
    if (!isValidPhone(normalized)) {
      setError(t('payment.invalidPhone'))
      return
    }

    setError('')
    setStep('stk_sent')
    localStorage.setItem('mpesa_phone', phone)

    try {
      const res = await axios.post('/api/payment/mpesa/initiate', {
        phone: normalized,
        amount_kes: kesAmount,
        transaction_type: transactionType,
        reference_id: String(referenceId),
      })
      setTransactionId(res.data.transaction_id)
      startPolling(res.data.transaction_id)
    } catch (err) {
      let msg
      if (!err.response) {
        // Network error — request never reached the server (wrong port, service worker, ad-blocker, offline)
        msg = 'Network error — could not reach the server. Please check your connection and try again.'
      } else {
        const detail = err.response.data?.detail
        if (typeof detail === 'string' && detail) {
          msg = detail
        } else if (Array.isArray(detail)) {
          // FastAPI 422 validation error
          msg = detail.map(d => d.msg || d.message || JSON.stringify(d)).join('; ')
        } else {
          msg = `Server error (${err.response.status}) — please try again.`
        }
      }
      setError(msg)
      setStep('failed')
    }
  }

  const startPolling = (txId) => {
    pollCount.current = 0
    pollRef.current = setInterval(async () => {
      pollCount.current++
      // Timeout after 30 polls (90 seconds)
      if (pollCount.current > 30) {
        clearInterval(pollRef.current)
        setStep('expired')
        return
      }
      try {
        const res = await axios.get(`/api/payment/status/${txId}`)
        const status = res.data.status
        if (status === 'completed') {
          clearInterval(pollRef.current)
          setStep('success')
          setTimeout(() => {
            onSuccess?.(res.data.transaction)
          }, 2000)
        } else if (status === 'failed') {
          clearInterval(pollRef.current)
          setError(res.data.message || t('payment.paymentFailed'))
          setStep('failed')
        } else if (status === 'expired') {
          clearInterval(pollRef.current)
          setStep('expired')
        }
      } catch {
        // Keep polling on network errors
      }
    }, 3000)
  }

  const handleRetry = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setStep('phone_input')
    setError('')
    setTransactionId(null)
    pollCount.current = 0
  }

  if (!isOpen) return null

  return (
    <div className="mpesa-modal-overlay" onClick={onClose}>
      <div className="mpesa-modal" onClick={e => e.stopPropagation()}>
        <button className="mpesa-modal-close" onClick={onClose}>&times;</button>

        <div className="mpesa-modal-header">
          <div className="mpesa-logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#43b02a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          </div>
          <h3 className="mpesa-modal-title">{title}</h3>
          {description && <p className="mpesa-modal-desc">{description}</p>}
        </div>

        {/* Step: Phone Input */}
        {step === 'phone_input' && (
          <div className="mpesa-modal-body">
            <div className="mpesa-amount-display">
              {quoteLoading ? (
                <div className="mpesa-quote-loading">Getting price...</div>
              ) : (
                <>
                  <div className="mpesa-amount-kes">KES {Math.ceil(kesAmount).toLocaleString()}</div>
                  {usdAmount > 0 && <div className="mpesa-amount-usd">(~${usdAmount.toFixed(2)} USD)</div>}
                </>
              )}
            </div>

            <label className="mpesa-label">{t('payment.phoneNumber')}</label>
            <input
              type="tel"
              className="mpesa-phone-input"
              placeholder={t('payment.phonePlaceholder')}
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setError('') }}
              maxLength={13}
            />
            <p className="mpesa-phone-hint">An STK push will be sent to this number</p>

            {error && <div className="mpesa-error">{error}</div>}

            <button
              className="mpesa-pay-btn"
              onClick={handleInitiate}
              disabled={!phone.trim() || quoteLoading || kesAmount <= 0}
            >
              {t('payment.pay')}
            </button>
          </div>
        )}

        {/* Step: STK Sent / Waiting */}
        {(step === 'stk_sent' || step === 'waiting') && (
          <div className="mpesa-modal-body mpesa-status-screen">
            <div className="mpesa-waiting-icon">
              <div className="mpesa-pulse-ring"></div>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#43b02a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <h4 className="mpesa-status-title">{t('payment.checkPhone')}</h4>
            <p className="mpesa-status-msg">
              An M-Pesa payment prompt has been sent to your phone.
              Please enter your M-Pesa PIN to confirm the payment.
            </p>
            <div className="mpesa-spinner-row">
              <div className="spinner" style={{ width: 18, height: 18 }}></div>
              <span>{t('payment.waitingConfirmation')}</span>
            </div>
          </div>
        )}

        {/* Step: Success */}
        {step === 'success' && (
          <div className="mpesa-modal-body mpesa-status-screen">
            <div className="mpesa-success-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h4 className="mpesa-status-title mpesa-success-text">{t('payment.paymentSuccess')}</h4>
            <p className="mpesa-status-msg">Your payment has been confirmed.</p>
          </div>
        )}

        {/* Step: Failed */}
        {step === 'failed' && (
          <div className="mpesa-modal-body mpesa-status-screen">
            <div className="mpesa-failed-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h4 className="mpesa-status-title mpesa-failed-text">{t('payment.paymentFailed')}</h4>
            <p className="mpesa-status-msg">{error || 'The payment could not be completed.'}</p>
            <button className="mpesa-retry-btn" onClick={handleRetry}>Try Again</button>
          </div>
        )}

        {/* Step: Expired */}
        {step === 'expired' && (
          <div className="mpesa-modal-body mpesa-status-screen">
            <div className="mpesa-expired-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h4 className="mpesa-status-title mpesa-expired-text">Payment Timed Out</h4>
            <p className="mpesa-status-msg">
              The payment wasn't confirmed in time. If you completed the payment on your phone,
              your purchase will be credited automatically.
            </p>
            <button className="mpesa-retry-btn" onClick={handleRetry}>Try Again</button>
          </div>
        )}
      </div>
    </div>
  )
}
