import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import axios from 'axios'

const TXN_PER_PAGE = 10

const TxnIcon = ({ type }) => {
  const icons = {
    deposit: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>,
    withdrawal: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>,
    subscription: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    purchase: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
    sale: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
    earning: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>,
    deduction: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
    adjustment: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  }
  return icons[type] || icons.deduction
}

const formatTxnDate = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Transactions() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { isKenyan } = useCurrency()
  const [txnList, setTxnList] = useState([])
  const [txnTotal, setTxnTotal] = useState(0)
  const [txnFilter, setTxnFilter] = useState('all')
  const [txnPage, setTxnPage] = useState(1)
  const [txnLoading, setTxnLoading] = useState(true)
  const [kesRate, setKesRate] = useState(130)

  const totalPages = Math.max(1, Math.ceil(txnTotal / TXN_PER_PAGE))

  const fetchTransactions = async (filter = 'all', page = 1) => {
    setTxnLoading(true)
    try {
      const offset = (page - 1) * TXN_PER_PAGE
      const res = await axios.get('/api/user/transactions', { params: { filter, offset, limit: TXN_PER_PAGE } })
      setTxnList(res.data.transactions)
      setTxnTotal(res.data.total)
    } catch { /* ignore */ }
    finally { setTxnLoading(false) }
  }

  useEffect(() => { fetchTransactions() }, [])

  // Fetch KES exchange rate for Kenyan users
  useEffect(() => {
    if (!isKenyan) return
    axios.post('/api/payment/quote', { amount_usd: 1 })
      .then(res => { if (res.data.amount_kes) setKesRate(res.data.amount_kes) })
      .catch(() => {})
  }, [isKenyan])

  // Convert amount to display currency
  const displayAmount = (amount, txCurrency) => {
    if (isKenyan && txCurrency === 'USD') {
      return { amount: Math.round(amount * kesRate), currency: 'KES' }
    }
    if (!isKenyan && txCurrency === 'KES') {
      return { amount: kesRate > 0 ? +(amount / kesRate).toFixed(2) : amount, currency: 'USD' }
    }
    return { amount, currency: txCurrency }
  }

  const formatAmount = (val, cur) => {
    if (cur === 'KES') return `KES ${Math.abs(val).toLocaleString()}`
    return `$${Math.abs(val).toFixed(2)}`
  }

  const handleTxnFilterChange = (f) => {
    setTxnFilter(f)
    setTxnPage(1)
    fetchTransactions(f, 1)
  }

  const goToPage = (p) => {
    if (p < 1 || p > totalPages || p === txnPage) return
    setTxnPage(p)
    fetchTransactions(txnFilter, p)
  }

  // Build page numbers to display
  const getPageNumbers = () => {
    const pages = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (txnPage > 3) pages.push('...')
      const start = Math.max(2, txnPage - 1)
      const end = Math.min(totalPages - 1, txnPage + 1)
      for (let i = start; i <= end; i++) pages.push(i)
      if (txnPage < totalPages - 2) pages.push('...')
      pages.push(totalPages)
    }
    return pages
  }

  if (!user) return null

  return (
    <div className="profile-page">
      <div className="profile-container">
        <h2 className="profile-title">{t('profile.transactions')}</h2>
        <p className="profile-section-desc" style={{ marginBottom: 16 }}>{t('profile.transactionsDesc')}</p>

        <div className="profile-transactions">
          <div className="txn-filter-tabs">
            {['all', 'payments', 'withdrawals', 'earnings', 'deductions'].map(f => (
              <button
                key={f}
                className={`txn-filter-tab ${txnFilter === f ? 'active' : ''}`}
                onClick={() => handleTxnFilterChange(f)}
              >
                {t(`profile.txnFilter_${f}`)}
              </button>
            ))}
          </div>

          <div className="txn-list">
            {txnList.length === 0 && !txnLoading && (
              <div className="txn-empty">{t('profile.noTransactions')}</div>
            )}
            {txnLoading && txnList.length === 0 && (
              <div className="txn-empty">{t('common.loading')}</div>
            )}
            {txnList.map(tx => (
              <div key={tx.id} className="txn-item">
                <div className={`txn-icon-wrap txn-icon-${tx.type}`}>
                  <TxnIcon type={tx.type} />
                </div>
                <div className="txn-details">
                  <div className="txn-desc">{tx.description}</div>
                  <div className="txn-meta">
                    <span className="txn-date">{formatTxnDate(tx.date)}</span>
                    {tx.payment_method && (
                      <span className="txn-method">{tx.payment_method.toUpperCase()}</span>
                    )}
                    {tx.reference && (
                      <span className="txn-ref">Ref: {tx.reference}</span>
                    )}
                  </div>
                  {tx.fee > 0 && (
                    <div className="txn-fee">
                      Fee: {(() => {
                        const d = displayAmount(tx.fee, tx.fee_currency || tx.currency)
                        return formatAmount(d.amount, d.currency)
                      })()}
                      {tx.fee_description && <span className="txn-fee-info" title={tx.fee_description}> (?)</span>}
                    </div>
                  )}
                </div>
                <div className="txn-amount-col">
                  {(() => {
                    const d = displayAmount(tx.amount, tx.currency)
                    return (
                      <span className={`txn-amount ${tx.amount >= 0 ? 'positive' : 'negative'}`}>
                        {tx.amount >= 0 ? '+' : '-'}{formatAmount(d.amount, d.currency)}
                      </span>
                    )
                  })()}
                  {tx.amount_secondary != null && tx.currency_secondary && (
                    <span className="txn-amount-secondary">
                      {(() => {
                        const d = displayAmount(tx.amount_secondary, tx.currency_secondary)
                        return formatAmount(d.amount, d.currency)
                      })()}
                    </span>
                  )}
                  <span className={`txn-status txn-status-${tx.status}`}>
                    {tx.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {txnTotal > TXN_PER_PAGE && (
            <div className="txn-pagination">
              <button
                className="txn-page-btn"
                onClick={() => goToPage(txnPage - 1)}
                disabled={txnPage <= 1 || txnLoading}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              </button>

              {getPageNumbers().map((p, i) =>
                p === '...' ? (
                  <span key={`dots-${i}`} className="txn-page-dots">...</span>
                ) : (
                  <button
                    key={p}
                    className={`txn-page-btn ${p === txnPage ? 'active' : ''}`}
                    onClick={() => goToPage(p)}
                    disabled={txnLoading}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                className="txn-page-btn"
                onClick={() => goToPage(txnPage + 1)}
                disabled={txnPage >= totalPages || txnLoading}
                >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          )}

          {txnTotal > 0 && (
            <div className="txn-count">
              Page {txnPage} of {totalPages} ({txnTotal} transactions)
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
