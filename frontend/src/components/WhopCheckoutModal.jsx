import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

export default function WhopCheckoutModal({
  isOpen,
  onClose,
  onSuccess,
  transactionType,
  planId = '',
  predictionId = 0,
  amountUsd = 0,
  title = 'Payment',
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [waitingForPayment, setWaitingForPayment] = useState(false)
  const [completed, setCompleted] = useState(false)
  const popupRef = useRef(null)
  const pollRef = useRef(null)
  const txIdRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      setLoading(true)
      setError('')
      setWaitingForPayment(false)
      setCompleted(false)
      txIdRef.current = null
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    const createAndOpen = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await axios.post('/api/whop/create-checkout', {
          transaction_type: transactionType,
          plan_id: planId,
          prediction_id: predictionId,
          amount_usd: amountUsd,
        })

        const { purchase_url, checkout_id } = response.data
        txIdRef.current = checkout_id

        if (purchase_url) {
          // Open Whop's hosted checkout in a new tab
          popupRef.current = window.open(purchase_url, '_blank')
          setLoading(false)
          setWaitingForPayment(true)

          // Poll for payment completion
          pollRef.current = setInterval(async () => {
            try {
              const statusRes = await axios.get('/api/whop/check-payment/' + checkout_id)
              if (statusRes.data.status === 'completed') {
                clearInterval(pollRef.current)
                setCompleted(true)
                setTimeout(() => {
                  if (onSuccess) onSuccess()
                }, 1500)
              }
            } catch {
              // Keep polling
            }
          }, 3000)
        } else {
          setError('No checkout URL returned. Please try again.')
          setLoading(false)
        }
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to initialize checkout')
        setLoading(false)
      }
    }

    createAndOpen()

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [isOpen, transactionType, planId, predictionId, amountUsd])

  if (!isOpen) return null

  return (
    <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h3 style={styles.title}>{title}</h3>
          <button style={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {loading && (
          <div style={styles.loadingContainer}>
            <div className="spinner" style={{ width: 32, height: 32 }}></div>
            <p style={styles.loadingText}>{t('whop.loading')}</p>
          </div>
        )}

        {error && (
          <div style={styles.errorContainer}>
            <p style={styles.errorText}>{error}</p>
            <button style={styles.retryBtn} onClick={() => {
              setError('')
              setLoading(true)
              setWaitingForPayment(false)
            }}>
              {t('whop.retry')}
            </button>
          </div>
        )}

        {completed && (
          <div style={styles.successContainer}>
            <div style={styles.successIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <p style={styles.successText}>{t('whop.paymentConfirmed')}</p>
            <p style={styles.successSubtext}>{t('whop.processing')}</p>
          </div>
        )}

        {waitingForPayment && !error && !completed && (
          <div style={styles.waitingContainer}>
            <div style={styles.waitingIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
            </div>
            <p style={styles.waitingTitle}>Complete payment in the new tab</p>
            <p style={styles.waitingSubtext}>
              A secure Whop checkout page has opened. Complete your payment there and this page will update automatically.
            </p>
            <div style={styles.waitingDots}>
              <div className="spinner" style={{ width: 20, height: 20 }}></div>
              <span style={styles.waitingStatus}>Waiting for payment...</span>
            </div>
            <button style={styles.reopenBtn} onClick={() => {
              if (txIdRef.current) {
                // Re-create checkout for a new URL
                setWaitingForPayment(false)
                setLoading(true)
                setError('')
                if (pollRef.current) clearInterval(pollRef.current)
                // Trigger re-creation by toggling
                const reopen = async () => {
                  try {
                    const response = await axios.post('/api/whop/create-checkout', {
                      transaction_type: transactionType,
                      plan_id: planId,
                      prediction_id: predictionId,
                      amount_usd: amountUsd,
                    })
                    const { purchase_url, checkout_id } = response.data
                    txIdRef.current = checkout_id
                    if (purchase_url) {
                      window.open(purchase_url, '_blank')
                      setLoading(false)
                      setWaitingForPayment(true)
                      pollRef.current = setInterval(async () => {
                        try {
                          const statusRes = await axios.get('/api/whop/check-payment/' + checkout_id)
                          if (statusRes.data.status === 'completed') {
                            clearInterval(pollRef.current)
                            setCompleted(true)
                            setTimeout(() => { if (onSuccess) onSuccess() }, 1500)
                          }
                        } catch { /* keep polling */ }
                      }, 3000)
                    }
                  } catch (err) {
                    setError(err.response?.data?.detail || 'Failed to open checkout')
                    setLoading(false)
                  }
                }
                reopen()
              }
            }}>
              Reopen checkout page
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
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 20px',
    gap: '12px',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: '14px',
    margin: 0,
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '48px 20px',
    gap: '16px',
  },
  errorText: {
    color: '#f87171',
    fontSize: '14px',
    textAlign: 'center',
    margin: 0,
  },
  retryBtn: {
    padding: '8px 24px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  successContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '48px 20px',
    gap: '12px',
  },
  successIcon: {
    marginBottom: '8px',
  },
  successText: {
    color: '#22c55e',
    fontSize: '18px',
    fontWeight: '600',
    margin: 0,
  },
  successSubtext: {
    color: '#94a3b8',
    fontSize: '14px',
    margin: 0,
  },
  waitingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '36px 24px',
    gap: '16px',
  },
  waitingIcon: {
    marginBottom: '4px',
  },
  waitingTitle: {
    color: '#f1f5f9',
    fontSize: '16px',
    fontWeight: '600',
    margin: 0,
    textAlign: 'center',
  },
  waitingSubtext: {
    color: '#94a3b8',
    fontSize: '13px',
    margin: 0,
    textAlign: 'center',
    lineHeight: '1.5',
  },
  waitingDots: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px',
  },
  waitingStatus: {
    color: '#64748b',
    fontSize: '13px',
  },
  reopenBtn: {
    padding: '8px 20px',
    background: 'transparent',
    color: '#3b82f6',
    border: '1px solid #334155',
    borderRadius: '8px',
    fontSize: '13px',
    cursor: 'pointer',
    marginTop: '8px',
  },
}
