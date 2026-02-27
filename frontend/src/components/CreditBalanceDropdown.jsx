import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCredits } from '../context/CreditContext'
import './CreditBalanceDropdown.css'

export default function CreditBalanceDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { credits, costs, totalCredits, refreshCredits } = useCredits()

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleOpen = () => {
    if (!isOpen) refreshCredits()
    setIsOpen(!isOpen)
  }

  const getStatusColor = () => {
    if (totalCredits < 50) return 'credit-critical'
    if (totalCredits < 200) return 'credit-low'
    return 'credit-ok'
  }

  const formatTime = (isoStr) => {
    if (!isoStr) return ''
    try {
      const d = new Date(isoStr)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  return (
    <div className="credit-balance-wrapper" ref={dropdownRef}>
      <button
        className={`credit-balance-btn ${getStatusColor()}`}
        onClick={handleOpen}
        title="Credit Balance"
      >
        <span className="credit-icon">&#9889;</span>
        <span className="credit-count">{totalCredits.toLocaleString()}</span>
      </button>

      {isOpen && (
        <div className="credit-dropdown">
          <div className="credit-dropdown-header">
            <span className="credit-icon-large">&#9889;</span>
            <div>
              <div className="credit-total">{totalCredits.toLocaleString()} credits</div>
              <div className="credit-subtitle">
                {credits?.has_subscription ? 'Pro Subscriber' : 'Pay as you go'}
              </div>
            </div>
          </div>

          <div className="credit-breakdown">
            <div className="credit-row">
              <span>Purchased</span>
              <span>{(credits?.purchased_credits || 0).toLocaleString()}</span>
            </div>
            {credits?.has_subscription && (
              <>
                <div className="credit-row">
                  <span>Daily (Pro)</span>
                  <span>{(credits?.daily_credits || 0).toLocaleString()}</span>
                </div>
                {credits?.daily_expires_at && (
                  <div className="credit-row credit-row-sub">
                    <span>Resets at</span>
                    <span>{formatTime(credits.daily_expires_at)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {costs && (
            <div className="credit-costs">
              <div className="credit-costs-title">Credit Costs</div>
              <div className="credit-cost-item">
                <span>AI Prediction</span>
                <span>{costs.prediction} cr</span>
              </div>
              <div className="credit-cost-item">
                <span>Match Analysis</span>
                <span>{costs.match_analysis} cr</span>
              </div>
              <div className="credit-cost-item">
                <span>Jackpot Analysis</span>
                <span>{costs.jackpot} cr</span>
              </div>
              <div className="credit-cost-item">
                <span>AI Chat</span>
                <span>{costs.chat_prompt} cr</span>
              </div>
            </div>
          )}

          <div className="credit-actions">
            <button
              className="credit-add-btn"
              onClick={() => { setIsOpen(false); navigate('/upgrade') }}
            >
              + Add Credits
            </button>
            <button
              className="credit-history-btn"
              onClick={() => { setIsOpen(false); navigate('/transactions') }}
            >
              View History
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
