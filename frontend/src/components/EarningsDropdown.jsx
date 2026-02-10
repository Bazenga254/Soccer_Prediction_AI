import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

export default function EarningsDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const [earnings, setEarnings] = useState(null)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)

  // Fetch balance on mount so it always shows
  useEffect(() => {
    fetchEarnings()
  }, [])

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

  // Use axios without manual headers - AuthContext sets Authorization globally
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

  const balance = earnings ? earnings.balance_usd : 0

  return (
    <div className="earnings-dropdown-wrapper" ref={dropdownRef}>
      <button className="earnings-btn" onClick={handleOpen} title="Earnings">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        <span className="earnings-inline-amount">${balance.toFixed(2)}</span>
      </button>

      {isOpen && (
        <div className="earnings-dropdown">
          <div className="earnings-dropdown-header">
            <span className="earnings-dropdown-title">Earnings</span>
          </div>

          <div className="earnings-dropdown-body">
            {loading ? (
              <div className="earnings-loading">Loading...</div>
            ) : !earnings ? (
              <div className="earnings-empty">Failed to load earnings</div>
            ) : (
              <>
                <div className="earnings-balance-card">
                  <div className="earnings-balance-label">Available Balance</div>
                  <div className="earnings-balance-amount">${earnings.balance_usd.toFixed(2)}</div>
                </div>

                <div className="earnings-stats-row">
                  <div className="earnings-stat">
                    <span className="earnings-stat-value">${earnings.total_earned_usd.toFixed(2)}</span>
                    <span className="earnings-stat-label">Total Earned</span>
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
                        <span className="sale-amount">+${sale.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <Link to="/creator" className="earnings-view-all" onClick={() => setIsOpen(false)}>
                  View Full Dashboard
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
