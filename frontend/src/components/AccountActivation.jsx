import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '../context/CurrencyContext'
import { useAuth } from '../context/AuthContext'
import MpesaPaymentModal from './MpesaPaymentModal'
import WhopCheckoutModal from './WhopCheckoutModal'
import axios from 'axios'
import './AccountActivation.css'

export default function AccountActivation() {
  const { t } = useTranslation()
  const { isKenyan } = useCurrency()
  const { refreshProfile } = useAuth()
  const [showMpesa, setShowMpesa] = useState(false)
  const [showWhop, setShowWhop] = useState(false)
  const [activationInfo, setActivationInfo] = useState(null)

  useEffect(() => {
    axios.get('/api/user/activation-status')
      .then(res => setActivationInfo(res.data))
      .catch(() => {})
  }, [])

  const minKes = activationInfo?.min_deposit_kes || 35
  const minUsd = activationInfo?.min_deposit_usd || 1
  const kesRate = activationInfo?.credit_rate_kes || 10
  const usdRate = activationInfo?.credit_rate_usd || 1300
  const creditsFromMin = isKenyan ? minKes * kesRate : minUsd * usdRate

  const handlePaymentSuccess = () => {
    setShowMpesa(false)
    setShowWhop(false)
    refreshProfile()
  }

  return (
    <div className="activation-overlay">
      <div className="activation-card">
        <div className="activation-icon">&#9889;</div>
        <h2 className="activation-title">Activate Your Account</h2>
        <p className="activation-desc">
          Make a small initial deposit to activate your account and start using Spark AI.
          Your deposit converts to credits you can use immediately.
        </p>

        <div className="activation-credit-info">
          <div className="activation-credit-row">
            <span>Minimum deposit</span>
            <span className="activation-amount">
              {isKenyan ? `KES ${minKes}` : `$${minUsd}`}
            </span>
          </div>
          <div className="activation-credit-row">
            <span>You receive</span>
            <span className="activation-credits">
              &#9889; {creditsFromMin.toLocaleString()} credits
            </span>
          </div>
        </div>

        <div className="activation-features">
          <div className="activation-feature">
            <span className="activation-check">&#10003;</span>
            <span>AI match predictions &amp; analysis</span>
          </div>
          <div className="activation-feature">
            <span className="activation-check">&#10003;</span>
            <span>Jackpot analyzer</span>
          </div>
          <div className="activation-feature">
            <span className="activation-check">&#10003;</span>
            <span>AI chat assistant</span>
          </div>
          <div className="activation-feature">
            <span className="activation-check">&#10003;</span>
            <span>Community predictions</span>
          </div>
          <div className="activation-feature free-label">
            <span className="activation-free">FREE</span>
            <span>Live scores &amp; match tracking always free</span>
          </div>
        </div>

        <div className="activation-buttons">
          {isKenyan ? (
            <button
              className="activation-btn activation-btn-mpesa"
              onClick={() => setShowMpesa(true)}
            >
              Activate with M-Pesa (KES {minKes}+)
            </button>
          ) : (
            <button
              className="activation-btn activation-btn-card"
              onClick={() => setShowWhop(true)}
            >
              Activate with Card (${minUsd}+)
            </button>
          )}
          {isKenyan && (
            <button
              className="activation-btn activation-btn-alt"
              onClick={() => setShowWhop(true)}
            >
              Pay with Card instead
            </button>
          )}
        </div>

        <p className="activation-note">
          Credits never expire. Add more anytime.
        </p>
      </div>

      {showMpesa && (
        <MpesaPaymentModal
          isOpen={true}
          onClose={() => setShowMpesa(false)}
          transactionType="balance_topup"
          amountKes={minKes}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {showWhop && (
        <WhopCheckoutModal
          isOpen={true}
          onClose={() => setShowWhop(false)}
          transactionType="balance_topup"
          amount={minUsd}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  )
}
