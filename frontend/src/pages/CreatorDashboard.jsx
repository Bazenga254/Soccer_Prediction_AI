import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import axios from 'axios'

export default function CreatorDashboard() {
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawPhone, setWithdrawPhone] = useState(localStorage.getItem('mpesa_phone') || '')
  const [withdrawMethod, setWithdrawMethod] = useState('mpesa')
  const [whopAvailable, setWhopAvailable] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawResult, setWithdrawResult] = useState(null)
  const [withdrawals, setWithdrawals] = useState([])
  const [hidden, setHidden] = useState(() => localStorage.getItem('earnings_hidden') === 'true')
  const [activeTab, setActiveTab] = useState('analytics')
  const [referralEarnings, setReferralEarnings] = useState({ total_earned: 0, earnings: [] })
  const refreshRef = useRef(null)

  // Withdrawal methods state
  const [wdOptions, setWdOptions] = useState([])
  const [wdOptionsLoading, setWdOptionsLoading] = useState(false)
  const [addingMethod, setAddingMethod] = useState(null) // null, 'mpesa', 'whop'
  const [mpesaPhone, setMpesaPhone] = useState('')
  const [otpStep, setOtpStep] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpPhone, setOtpPhone] = useState('')
  const [methodLoading, setMethodLoading] = useState(false)
  const [methodMsg, setMethodMsg] = useState({ type: '', text: '' })
  const [feePreview, setFeePreview] = useState(null)
  const [feePreviewLoading, setFeePreviewLoading] = useState(false)

  const fetchData = async () => {
    try {
      const [dashRes, wdRes, refRes, whopRes] = await Promise.all([
        axios.get('/api/creator/dashboard'),
        axios.get('/api/withdrawal/history'),
        axios.get('/api/user/referral-earnings').catch(() => ({ data: { total_earned: 0, earnings: [] } })),
        axios.get('/api/withdrawal/whop-available').catch(() => ({ data: { available: false } })),
      ])
      setData(dashRes.data)
      setWithdrawals(wdRes.data.withdrawals || [])
      setReferralEarnings(refRes.data)
      setWhopAvailable(whopRes.data.available)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    // Auto-refresh every 30 seconds
    refreshRef.current = setInterval(fetchData, 30000)
    return () => clearInterval(refreshRef.current)
  }, [])

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount)
    if (!amount || amount < 5) return

    if (withdrawMethod === 'mpesa') {
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
          withdrawal_method: 'mpesa',
        })
        setWithdrawResult({ success: true, message: res.data.message })
        localStorage.setItem('mpesa_phone', withdrawPhone)
        fetchData()
      } catch (err) {
        setWithdrawResult({ error: err.response?.data?.detail || 'Withdrawal failed' })
      }
      setWithdrawing(false)
    } else {
      // Whop withdrawal
      setWithdrawing(true)
      setWithdrawResult(null)
      try {
        const res = await axios.post('/api/withdrawal/request', {
          amount_usd: amount,
          withdrawal_method: 'whop',
        })
        setWithdrawResult({ success: true, message: res.data.message })
        fetchData()
      } catch (err) {
        setWithdrawResult({ error: err.response?.data?.detail || 'Withdrawal failed' })
      }
      setWithdrawing(false)
    }
  }

  const toggleHidden = () => {
    const next = !hidden
    setHidden(next)
    localStorage.setItem('earnings_hidden', next ? 'true' : 'false')
  }

  // ── Withdrawal Options Methods ──

  const fetchWdOptions = async () => {
    setWdOptionsLoading(true)
    try {
      const res = await axios.get('/api/withdrawal/options')
      setWdOptions(res.data.options || [])
    } catch { /* ignore */ }
    setWdOptionsLoading(false)
  }

  const handleAddMethod = async (method) => {
    setMethodMsg({ type: '', text: '' })
    if (method === 'mpesa') {
      setAddingMethod('mpesa')
      setMpesaPhone('')
      setOtpStep(false)
      setOtpCode('')
    } else {
      setMethodLoading(true)
      try {
        const res = await axios.post('/api/withdrawal/options/add', { method: 'whop' })
        if (res.data.success) {
          setMethodMsg({ type: 'success', text: 'Whop withdrawal method linked and added successfully!' })
          fetchWdOptions()
        } else {
          setMethodMsg({ type: 'error', text: res.data.error || 'Failed to add Whop method.' })
        }
      } catch (err) {
        setMethodMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to add Whop method.' })
      }
      setMethodLoading(false)
    }
  }

  const handleSendOtp = async () => {
    const phone = mpesaPhone.replace(/[^0-9]/g, '')
    if (!phone || phone.length < 9) {
      setMethodMsg({ type: 'error', text: 'Enter a valid phone number.' })
      return
    }
    setMethodLoading(true)
    setMethodMsg({ type: '', text: '' })
    try {
      const res = await axios.post('/api/withdrawal/options/add', { method: 'mpesa', mpesa_phone: phone })
      if (res.data.success || res.data.otp_sent) {
        setOtpStep(true)
        setOtpPhone(phone)
        setMethodMsg({ type: 'success', text: 'Verification code sent to your associated email. Enter the 6-digit code below.' })
      } else {
        setMethodMsg({ type: 'error', text: res.data.error || 'Failed to send OTP.' })
      }
    } catch (err) {
      setMethodMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to send OTP.' })
    }
    setMethodLoading(false)
  }

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      setMethodMsg({ type: 'error', text: 'Enter the 6-digit code.' })
      return
    }
    setMethodLoading(true)
    setMethodMsg({ type: '', text: '' })
    try {
      const res = await axios.post('/api/withdrawal/options/verify-phone', { phone: otpPhone, code: otpCode })
      if (res.data.success) {
        setMethodMsg({ type: 'success', text: 'Phone verified! M-Pesa withdrawal method is now active.' })
        setAddingMethod(null)
        setOtpStep(false)
        fetchWdOptions()
      } else {
        setMethodMsg({ type: 'error', text: res.data.error || 'Verification failed.' })
      }
    } catch (err) {
      setMethodMsg({ type: 'error', text: err.response?.data?.detail || 'Verification failed.' })
    }
    setMethodLoading(false)
  }

  const handleRemoveMethod = async (method) => {
    if (!confirm(`Remove ${method === 'mpesa' ? 'M-Pesa' : 'Whop'} withdrawal method? A 48-hour cooldown will apply before you can add a new one.`)) return
    setMethodLoading(true)
    setMethodMsg({ type: '', text: '' })
    try {
      await axios.delete(`/api/withdrawal/options/${method}`)
      setMethodMsg({ type: 'success', text: 'Withdrawal method removed.' })
      fetchWdOptions()
    } catch (err) {
      setMethodMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to remove.' })
    }
    setMethodLoading(false)
  }

  const handleSetPrimary = async (method) => {
    setMethodLoading(true)
    try {
      await axios.put('/api/withdrawal/options/primary', { method })
      setMethodMsg({ type: 'success', text: `${method === 'mpesa' ? 'M-Pesa' : 'Whop'} set as primary.` })
      fetchWdOptions()
    } catch (err) {
      setMethodMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to set primary.' })
    }
    setMethodLoading(false)
  }

  const handleFeePreview = async (amount, method) => {
    if (!amount || amount < 5) return
    setFeePreviewLoading(true)
    try {
      const res = await axios.post('/api/withdrawal/fee-preview', { amount_usd: parseFloat(amount), method })
      setFeePreview(res.data)
    } catch { setFeePreview(null) }
    setFeePreviewLoading(false)
  }

  if (loading) {
    return (
      <div className="creator-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="creator-page">
        <div className="creator-empty">
          <h2>{t('creator.dashboard')}</h2>
          <p>Start selling predictions to see your earnings here.</p>
        </div>
      </div>
    )
  }

  const { wallet, all_predictions, paid_predictions, recent_sales, referral_stats, analytics_summary } = data
  const preds = all_predictions || paid_predictions || []
  const summary = analytics_summary || {}

  return (
    <div className="creator-page">
      <div className="creator-header">
        <h2>{t('creator.dashboard')}</h2>
        <div className="creator-header-actions">
          <p className="creator-subtitle">Track your prediction sales and earnings</p>
          <button className="creator-privacy-btn" onClick={toggleHidden} title={hidden ? t('creator.showRevenue') : t('creator.hideRevenue')}>
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

      {/* Tab Navigation */}
      <div className="creator-tab-bar" style={styles.tabBar}>
        <button style={{...styles.tab, ...(activeTab === 'analytics' ? styles.tabActive : {})}} onClick={() => setActiveTab('analytics')}>
          {t('creator.predictionAnalytics')} ({preds.length})
        </button>
        <button style={{...styles.tab, ...(activeTab === 'sales' ? styles.tabActive : {})}} onClick={() => setActiveTab('sales')}>
          {t('creator.recentSales')} ({recent_sales.length})
        </button>
        <button style={{...styles.tab, ...(activeTab === 'withdrawals' ? styles.tabActive : {})}} onClick={() => setActiveTab('withdrawals')}>
          {t('creator.withdrawals')} ({withdrawals.length})
        </button>
        <button style={{...styles.tab, ...(activeTab === 'methods' ? styles.tabActive : {})}} onClick={() => { setActiveTab('methods'); fetchWdOptions() }}>
          Withdrawal Methods
        </button>
        <button style={{...styles.tab, ...(activeTab === 'referrals' ? styles.tabActive : {})}} onClick={() => setActiveTab('referrals')}>
          {t('creator.referralEarnings')} ({referralEarnings.earnings.length})
        </button>
      </div>

      {/* Prediction Analytics Tab */}
      {activeTab === 'analytics' && (
        <>
          {/* Analytics Overview Stats */}
          <div className="creator-section">
            <h3>{t('creator.analytics')}</h3>
            <div style={styles.analyticsGrid}>
              <div style={styles.analyticsCard}>
                <div style={styles.analyticsIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </div>
                <div style={styles.analyticsValue}>{(summary.total_views || 0).toLocaleString()}</div>
                <div style={styles.analyticsLabel}>{t('creator.totalImpressions')}</div>
              </div>
              <div style={styles.analyticsCard}>
                <div style={styles.analyticsIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                </div>
                <div style={styles.analyticsValue}>{(summary.total_clicks || 0).toLocaleString()}</div>
                <div style={styles.analyticsLabel}>{t('creator.totalClicks')}</div>
              </div>
              <div style={styles.analyticsCard}>
                <div style={styles.analyticsIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                </div>
                <div style={styles.analyticsValue}>{summary.total_likes || 0}</div>
                <div style={styles.analyticsLabel}>{t('creator.totalLikes')}</div>
              </div>
              <div style={styles.analyticsCard}>
                <div style={styles.analyticsIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div style={styles.analyticsValue}>{summary.total_comments || 0}</div>
                <div style={styles.analyticsLabel}>{t('creator.totalComments')}</div>
              </div>
              <div style={styles.analyticsCard}>
                <div style={styles.analyticsIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </div>
                <div style={styles.analyticsValue}>{summary.avg_rating_overall || 0}</div>
                <div style={styles.analyticsLabel}>{t('creator.avgRating')}</div>
              </div>
              <div style={styles.analyticsCard}>
                <div style={styles.analyticsIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                </div>
                <div style={styles.analyticsValue}>{summary.total_predictions || 0}</div>
                <div style={styles.analyticsLabel}>{t('creator.totalPredictions')}</div>
              </div>
            </div>
          </div>

          {/* Predictions Table */}
          <div className="creator-section">
            {preds.length === 0 ? (
              <p className="creator-empty-text">
                {t('creator.noPredictions')}
              </p>
            ) : (
              <>
                <div className="creator-pred-table">
                <div style={styles.tableHeader}>
                  <span style={{...styles.col, flex: 2}}>{t('creator.teams')}</span>
                  <span style={{...styles.col, flex: 1}}>{t('creator.pickResult')}</span>
                  <span style={styles.colNum}>{t('creator.viewsCol')}</span>
                  <span style={styles.colNum}>{t('creator.clicksCol')}</span>
                  <span style={styles.colNum}>{t('creator.likesCol')}</span>
                  <span style={styles.colNum}>{t('creator.commentsCol')}</span>
                  <span style={styles.colNum}>{t('creator.ratingCol')}</span>
                  <span style={styles.colNum}>{t('creator.buyersCol')}</span>
                  <span style={styles.colNum}>{t('creator.revenueCol')}</span>
                </div>
                {preds.map(p => (
                  <div key={p.id} style={styles.tableRow}>
                    <span style={{...styles.col, flex: 2}}>
                      <strong style={{fontSize: 13, color: '#e2e8f0'}}>{p.team_a_name} vs {p.team_b_name}</strong>
                      <span style={{fontSize: 11, color: '#64748b', display: 'block'}}>
                        {p.competition && `${p.competition} | `}{new Date(p.created_at).toLocaleDateString()}
                      </span>
                    </span>
                    <span style={{...styles.col, flex: 1}}>
                      <span style={{fontSize: 13, color: '#e2e8f0'}}>{p.predicted_result}</span>
                      <span style={{display: 'flex', gap: 4, marginTop: 2}}>
                        {p.is_paid && <span style={styles.paidBadge}>$</span>}
                        {p.match_finished && (
                          <span style={{...styles.resultBadge, background: p.result_correct ? '#16a34a' : '#dc2626'}}>
                            {p.result_correct ? 'W' : 'L'}
                          </span>
                        )}
                      </span>
                    </span>
                    <span style={styles.colNum}>{p.view_count}</span>
                    <span style={styles.colNum}>{p.click_count}</span>
                    <span style={styles.colNum}>{p.likes}</span>
                    <span style={styles.colNum}>{p.comment_count}</span>
                    <span style={styles.colNum}>{p.avg_rating > 0 ? p.avg_rating : '-'}</span>
                    <span style={styles.colNum}>{p.is_paid ? p.purchase_count : '-'}</span>
                    <span style={styles.colNum}>{p.is_paid ? (hidden ? '***' : `$${p.total_revenue.toFixed(2)}`) : '-'}</span>
                  </div>
                ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Recent Sales Tab */}
      {activeTab === 'sales' && (
        <>
          {/* Sales Summary Stats */}
          <div className="creator-section">
            <div style={styles.analyticsGrid}>
              <div style={styles.analyticsCard}>
                <div style={styles.analyticsIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div style={styles.analyticsValue}>{hidden ? '****' : `$${wallet.total_earned_usd.toFixed(2)}`}</div>
                <div style={styles.analyticsLabel}>Total Revenue</div>
              </div>
              <div style={styles.analyticsCard}>
                <div style={styles.analyticsIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                </div>
                <div style={styles.analyticsValue}>{wallet.total_sales}</div>
                <div style={styles.analyticsLabel}>Total Sales</div>
              </div>
              <div style={styles.analyticsCard}>
                <div style={styles.analyticsIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                </div>
                <div style={styles.analyticsValue}>{hidden ? '****' : `$${wallet.total_sales > 0 ? (wallet.total_earned_usd / wallet.total_sales).toFixed(2) : '0.00'}`}</div>
                <div style={styles.analyticsLabel}>Avg per Sale</div>
              </div>
            </div>
          </div>

          {/* Sales List */}
          <div className="creator-section">
            {recent_sales.length === 0 ? (
              <p className="creator-empty-text">{t('creator.noSales')}</p>
            ) : (
              <div className="creator-sales-list">
                {recent_sales.map((s, i) => (
                  <div key={i} className="creator-sale-row">
                    <span className="sale-match">{s.team_a_name} vs {s.team_b_name}</span>
                    <span className="sale-amount">{hidden ? '***' : `+$${(s.price_amount * 0.7).toFixed(2)}`}</span>
                    <span className="sale-date">{new Date(s.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Withdrawals Tab */}
      {activeTab === 'withdrawals' && (
        <>
          {/* Wallet Balance */}
          <div className="creator-wallet">
            <div className="wallet-card main">
              <div className="wallet-label">{t('creator.availableBalance')}</div>
              <div className="wallet-amount">{hidden ? '****' : `$${wallet.balance_usd.toFixed(2)}`}</div>
              <button
                className={`withdraw-btn ${wallet.balance_usd >= 10 ? 'active' : ''}`}
                disabled={wallet.balance_usd < 10}
                onClick={() => { setShowWithdraw(true); setWithdrawResult(null); setWithdrawAmount('') }}
              >
                {wallet.balance_usd < 10 ? 'Min $10.00 to withdraw' : t('creator.requestWithdrawal')}
              </button>
            </div>
            <div className="wallet-card">
              <div className="wallet-label">{t('creator.totalEarned')}</div>
              <div className="wallet-amount">{hidden ? '****' : `$${wallet.total_earned_usd.toFixed(2)}`}</div>
            </div>
            <div className="wallet-card">
              <div className="wallet-label">Total Withdrawn</div>
              <div className="wallet-amount">{hidden ? '****' : `$${(wallet.total_earned_usd - wallet.balance_usd).toFixed(2)}`}</div>
            </div>
          </div>

          {/* Withdrawal History */}
          <div className="creator-section">
            <h3>Withdrawal History</h3>
            {withdrawals.length === 0 ? (
              <p className="creator-empty-text">No withdrawals yet.</p>
            ) : (
              <div className="withdrawal-history">
                {withdrawals.map(wd => (
                  <div key={wd.id} className="withdrawal-item">
                    <div className="withdrawal-item-info">
                      <span className="withdrawal-item-amount">{hidden ? '****' : `$${wd.amount_usd.toFixed(2)}`}</span>
                      <span className="withdrawal-item-phone">
                        {wd.withdrawal_method === 'whop'
                          ? 'Whop (USD)'
                          : `M-Pesa: ...${(wd.phone_number || '').slice(-4)}`
                        }
                      </span>
                      <span className="withdrawal-item-date">{new Date(wd.created_at).toLocaleDateString()}</span>
                    </div>
                    <span className={`withdrawal-status-badge ${wd.status}`}>{wd.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Withdrawal Methods Tab */}
      {activeTab === 'methods' && (
        <div className="creator-section">
          {methodMsg.text && (
            <div className={`wd-method-msg ${methodMsg.type}`}>{methodMsg.text}</div>
          )}

          {wdOptionsLoading ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>Loading...</p>
          ) : (
            <>
              {/* Existing Methods */}
              {wdOptions.length > 0 && (
                <div className="wd-methods-list">
                  <h4 style={{ margin: '0 0 12px', color: '#e2e8f0', fontSize: 15 }}>Your Withdrawal Methods</h4>
                  {wdOptions.map((opt, i) => (
                    <div key={i} className="wd-method-card">
                      <div className="wd-method-info">
                        <div className="wd-method-name">
                          <span className={`wd-method-badge ${opt.method}`}>
                            {opt.method === 'mpesa' ? 'M-Pesa (KES)' : 'Whop (USD)'}
                          </span>
                          {opt.is_primary && <span className="wd-primary-badge">Primary</span>}
                        </div>
                        <div className="wd-method-detail">
                          {opt.method === 'mpesa' && (
                            <>
                              <span>Phone: {opt.mpesa_phone_masked || '---'}</span>
                              {opt.mpesa_phone_verified
                                ? <span className="wd-verified">Verified</span>
                                : <span className="wd-unverified">Unverified</span>
                              }
                            </>
                          )}
                          {opt.method === 'whop' && (
                            <span>{opt.whop_linked ? 'Account linked' : 'Not linked'}</span>
                          )}
                        </div>
                        {opt.cooldown_active && (
                          <div className="wd-cooldown">
                            Cooldown: {opt.cooldown_remaining_hours}h remaining
                          </div>
                        )}
                      </div>
                      <div className="wd-method-actions">
                        {!opt.is_primary && opt.is_active && !opt.cooldown_active && (
                          <button className="wd-action-btn primary" onClick={() => handleSetPrimary(opt.method)}
                            disabled={methodLoading}>
                            Set Primary
                          </button>
                        )}
                        <button className="wd-action-btn remove" onClick={() => handleRemoveMethod(opt.method)}
                          disabled={methodLoading || opt.cooldown_active}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Method Section — only show if no active method */}
              {!addingMethod && wdOptions.length === 0 ? (
                <div className="wd-add-section">
                  <h4 style={{ margin: '16px 0 12px', color: '#e2e8f0', fontSize: 15 }}>
                    Set Up Withdrawal Method
                  </h4>
                  <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 12px' }}>
                    Add a withdrawal method to receive automatic weekly payouts every Friday.
                    You can have one method at a time. A 48-hour cooldown applies after changes.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="wd-add-btn mpesa" onClick={() => handleAddMethod('mpesa')}
                      disabled={methodLoading}>
                      + Add M-Pesa
                    </button>
                    <button className="wd-add-btn whop" onClick={() => handleAddMethod('whop')}
                      disabled={methodLoading}>
                      {methodLoading ? 'Linking...' : '+ Add Whop — Link email associated with your account'}
                    </button>
                  </div>
                  <p style={{ color: '#64748b', fontSize: 13, margin: '12px 0 0' }}>
                    Don't have a Whop account? Don't worry — you can{' '}
                    <a href="https://whop.com/signup" target="_blank" rel="noopener noreferrer"
                      style={{ color: '#a78bfa', textDecoration: 'underline' }}>
                      create one here
                    </a>{' '}
                    and link it to your account.
                  </p>
                  <p style={{ color: '#f59e0b', fontSize: 13, margin: '8px 0 0' }}>
                    Note: You will need to verify your Whop account in order to receive payments.
                  </p>
                </div>
              ) : addingMethod === 'mpesa' && (
                <div className="wd-add-form">
                  <h4 style={{ margin: '16px 0 12px', color: '#e2e8f0', fontSize: 15 }}>
                    {otpStep ? 'Verify Phone Number' : 'Add M-Pesa Number'}
                  </h4>
                  {!otpStep ? (
                    <>
                      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 12px' }}>
                        Enter your M-Pesa phone number. We'll send a verification code to your email.
                      </p>
                      <div className="withdraw-form-group">
                        <label>M-Pesa Phone Number</label>
                        <input type="tel" placeholder="0712345678" value={mpesaPhone}
                          onChange={e => setMpesaPhone(e.target.value)} maxLength={13} />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="wd-add-btn mpesa" onClick={handleSendOtp} disabled={methodLoading}>
                          {methodLoading ? 'Sending...' : 'Send OTP'}
                        </button>
                        <button className="wd-action-btn remove" onClick={() => { setAddingMethod(null); setMethodMsg({ type: '', text: '' }) }}>
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 12px' }}>
                        Enter the 6-digit code sent to your email.
                      </p>
                      <div className="withdraw-form-group">
                        <label>Verification Code</label>
                        <input type="text" placeholder="000000" value={otpCode}
                          onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          maxLength={6} style={{ letterSpacing: 8, textAlign: 'center', fontSize: 20 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="wd-add-btn mpesa" onClick={handleVerifyOtp} disabled={methodLoading}>
                          {methodLoading ? 'Verifying...' : 'Verify'}
                        </button>
                        <button className="wd-action-btn remove" onClick={() => { setOtpStep(false); setMethodMsg({ type: '', text: '' }) }}>
                          Back
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Fee Preview */}
              {wdOptions.length > 0 && (
                <div className="wd-fee-section">
                  <h4 style={{ margin: '24px 0 12px', color: '#e2e8f0', fontSize: 15 }}>Fee Calculator</h4>
                  <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 12px' }}>
                    See how much you'll receive after withdrawal fees.
                  </p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="withdraw-form-group" style={{ margin: 0, flex: '1 1 120px' }}>
                      <label>Amount (USD)</label>
                      <input type="number" min="10" step="1" placeholder="10.00" id="fee-preview-amount" />
                    </div>
                    <div className="withdraw-form-group" style={{ margin: 0, flex: '1 1 120px' }}>
                      <label>Method</label>
                      <select id="fee-preview-method" style={{
                        width: '100%', padding: '10px 12px', background: '#111827', border: '1px solid #1e293b',
                        borderRadius: 8, color: '#e2e8f0', fontSize: 14, fontFamily: 'inherit'
                      }}>
                        {wdOptions.map(o => (
                          <option key={o.method} value={o.method}>
                            {o.method === 'mpesa' ? 'M-Pesa (KES)' : 'Whop (USD)'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button className="wd-add-btn whop" style={{ padding: '10px 16px', height: 42 }}
                      onClick={() => {
                        const amt = document.getElementById('fee-preview-amount')?.value
                        const mth = document.getElementById('fee-preview-method')?.value
                        if (amt && mth) handleFeePreview(amt, mth)
                      }}
                      disabled={feePreviewLoading}>
                      {feePreviewLoading ? '...' : 'Calculate'}
                    </button>
                  </div>
                  {feePreview && feePreview.success && (
                    <div className="wd-fee-result">
                      {feePreview.method === 'mpesa' ? (
                        <>
                          <div className="wd-fee-row">
                            <span>Amount</span>
                            <span>${feePreview.amount_usd.toFixed(2)} = KES {feePreview.amount_kes?.toFixed(0)}</span>
                          </div>
                          <div className="wd-fee-row">
                            <span>Exchange Rate</span>
                            <span>1 USD = {feePreview.exchange_rate?.toFixed(2)} KES</span>
                          </div>
                          <div className="wd-fee-row fee">
                            <span>Transaction Fee</span>
                            <span>- KES {feePreview.fee_kes}</span>
                          </div>
                          <div className="wd-fee-row total">
                            <span>You Receive</span>
                            <span>KES {feePreview.net_amount_kes?.toFixed(0)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="wd-fee-row">
                            <span>Amount</span>
                            <span>${feePreview.gross_amount_usd?.toFixed(2)}</span>
                          </div>
                          <div className="wd-fee-row fee">
                            <span>Platform Fee (3%)</span>
                            <span>- ${feePreview.platform_fee_usd?.toFixed(2)}</span>
                          </div>
                          <div className="wd-fee-row fee">
                            <span>Processing Fee (2.7% + $0.30)</span>
                            <span>- ${feePreview.processing_fee_usd?.toFixed(2)}</span>
                          </div>
                          <div className="wd-fee-row total">
                            <span>You Receive</span>
                            <span>${feePreview.net_amount_usd?.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                      <p className="wd-fee-desc">{feePreview.fee_description}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Referral Earnings Tab */}
      {activeTab === 'referrals' && (
        <>
          {/* Referral Stats */}
          <div className="creator-section">
            <div style={styles.analyticsGrid}>
              <div style={styles.analyticsCard}>
                <div style={styles.analyticsIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div style={styles.analyticsValue}>{hidden ? '****' : `$${referralEarnings.total_earned.toFixed(2)}`}</div>
                <div style={styles.analyticsLabel}>Total Earned</div>
              </div>
              <div style={styles.analyticsCard}>
                <div style={styles.analyticsIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                </div>
                <div style={styles.analyticsValue}>{referral_stats?.total_referred || 0}</div>
                <div style={styles.analyticsLabel}>Total Referrals</div>
              </div>
              <div style={styles.analyticsCard}>
                <div style={styles.analyticsIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </div>
                <div style={styles.analyticsValue}>{referral_stats?.pro_referred || 0}</div>
                <div style={styles.analyticsLabel}>Pro Referrals</div>
              </div>
            </div>
          </div>

          {/* Referral Earnings List */}
          <div className="creator-section">
            <h3>{t('creator.referralEarnings')}</h3>
            {referralEarnings.earnings.length === 0 ? (
              <p className="creator-empty-text">{t('creator.noReferralEarnings')}</p>
            ) : (
              <div className="creator-sales-list">
                {referralEarnings.earnings.map((e, i) => (
                  <div key={i} className="creator-sale-row">
                    <span className="sale-match">
                      <span style={{color: '#94a3b8', fontSize: 12}}>{t('creator.referredUser')}</span>
                      <br />
                      <span style={{fontSize: 13}}>{e.subscription_plan}</span>
                    </span>
                    <span className="sale-amount" style={{color: '#22c55e'}}>
                      {hidden ? '***' : `+$${e.commission_amount.toFixed(2)}`}
                    </span>
                    <span className="sale-date">{new Date(e.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

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
                <button className="mpesa-retry-btn" onClick={() => setShowWithdraw(false)}>{t('common.close')}</button>
              </div>
            ) : (
              <>
                <h3>Withdraw Earnings</h3>
                <p className="withdraw-balance">Available: <strong>${wallet.balance_usd.toFixed(2)}</strong></p>

                {/* Method Selector */}
                <div style={styles.methodToggle}>
                  <button
                    style={{...styles.methodBtn, ...(withdrawMethod === 'mpesa' ? styles.methodBtnActive : {})}}
                    onClick={() => setWithdrawMethod('mpesa')}
                  >
                    <span style={{fontSize: 16}}>📱</span> M-Pesa (KES)
                  </button>
                  <button
                    style={{
                      ...styles.methodBtn,
                      ...(withdrawMethod === 'whop' ? styles.methodBtnActive : {}),
                      ...(!whopAvailable ? styles.methodBtnDisabled : {}),
                    }}
                    onClick={() => whopAvailable && setWithdrawMethod('whop')}
                    disabled={!whopAvailable}
                    title={!whopAvailable ? 'Make a card payment first to link your Whop account' : ''}
                  >
                    <span style={{fontSize: 16}}>{whopAvailable ? '💳' : '🔒'}</span> Whop (USD)
                  </button>
                </div>
                {!whopAvailable && withdrawMethod === 'mpesa' && (
                  <p style={styles.whopHint}>
                    Want USD payouts? Make any card payment to automatically link your Whop account.
                  </p>
                )}

                <div className="withdraw-form-group">
                  <label>Amount (USD)</label>
                  <input
                    type="number"
                    min="10"
                    max={wallet.balance_usd}
                    step="0.50"
                    placeholder="10.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                  />
                </div>

                {withdrawMethod === 'mpesa' && (
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
                )}

                <p className="withdraw-info-text">
                  {withdrawMethod === 'mpesa'
                    ? "Minimum withdrawal: $10.00 (KES 1,000). You'll receive the KES equivalent via M-Pesa within 24 hours."
                    : "Minimum withdrawal: $10.00. USD will be transferred to your Whop account instantly upon admin approval."
                  }
                </p>

                {withdrawResult?.error && (
                  <div className="mpesa-error">{withdrawResult.error}</div>
                )}

                <button
                  className="withdraw-submit-btn"
                  onClick={handleWithdraw}
                  disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) < 10}
                >
                  {withdrawing ? 'Requesting...' : t('creator.requestWithdrawal')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

const styles = {
  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 12,
  },
  analyticsCard: {
    background: '#111827',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '14px 16px',
    textAlign: 'center',
  },
  analyticsIcon: {
    marginBottom: 6,
  },
  analyticsValue: {
    fontSize: 22,
    fontWeight: 700,
    color: '#f1f5f9',
  },
  analyticsLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tabBar: {
    display: 'flex',
    gap: 4,
    background: '#0f1629',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: 4,
    marginTop: 12,
    marginBottom: 20,
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
  },
  tab: {
    flex: 'none',
    padding: '10px 14px',
    background: 'none',
    border: 'none',
    borderRadius: 8,
    color: '#64748b',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  tabActive: {
    background: '#1e293b',
    color: '#f1f5f9',
    fontWeight: 700,
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderBottom: '1px solid #1e293b',
    marginBottom: 4,
  },
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderBottom: '1px solid rgba(30,41,59,0.5)',
    transition: 'background 0.15s',
  },
  col: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: 12,
    color: '#94a3b8',
    minWidth: 0,
  },
  colNum: {
    width: 50,
    textAlign: 'center',
    fontSize: 13,
    color: '#cbd5e1',
    flexShrink: 0,
  },
  paidBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: '#6c5ce7',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
  },
  resultBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    borderRadius: '50%',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
  },
  referralSummary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.2)',
    borderRadius: 10,
    marginBottom: 12,
  },
  referralTotal: {
    fontSize: 15,
    fontWeight: 600,
    color: '#22c55e',
  },
  methodToggle: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
  },
  methodBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '10px 12px',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 8,
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  },
  methodBtnActive: {
    background: 'rgba(59, 130, 246, 0.15)',
    borderColor: '#3b82f6',
    color: '#60a5fa',
  },
  methodBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  whopHint: {
    fontSize: 11,
    color: '#64748b',
    margin: '0 0 12px 0',
    textAlign: 'center',
    lineHeight: 1.4,
  },
}
