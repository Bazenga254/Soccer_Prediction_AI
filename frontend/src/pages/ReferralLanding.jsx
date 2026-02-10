import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function ReferralLanding() {
  const { username } = useParams()
  const navigate = useNavigate()
  const [referrer, setReferrer] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchReferrer = async () => {
      try {
        const res = await axios.get(`/api/user/profile/${username}`)
        if (res.data.user) {
          setReferrer(res.data.user)
          // Set cookie with 30-day expiry
          const expires = new Date()
          expires.setDate(expires.getDate() + 30)
          document.cookie = `spark_ref=${res.data.user.referral_code};expires=${expires.toUTCString()};path=/`
        }
      } catch {
        // Invalid referral link, redirect to home
      }
      setLoading(false)
      // Redirect to signup after a brief display
      setTimeout(() => navigate('/'), 3000)
    }
    fetchReferrer()
  }, [username, navigate])

  if (loading) {
    return (
      <div className="access-gate-page">
        <div className="access-gate-container">
          <div className="access-gate-header">
            <div className="gate-logo"><span className="gate-icon">&#9917;</span></div>
            <h1>Loading...</h1>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="access-gate-page">
      <div className="access-gate-container">
        <div className="access-gate-header">
          <div className="gate-logo"><span className="gate-icon">&#9917;</span></div>
          <h1>Spark AI Prediction</h1>
          <p className="gate-subtitle">Smart Match Analysis & Predictions</p>
        </div>

        {referrer ? (
          <div className="referral-landing-card">
            <div className="referral-landing-avatar">
              {referrer.avatar_url ? (
                <img src={referrer.avatar_url} alt={referrer.display_name} className="referral-avatar-img" />
              ) : (
                <div className="referral-avatar-circle" style={{ background: referrer.avatar_color }}>
                  {(referrer.display_name || '?')[0].toUpperCase()}
                </div>
              )}
            </div>
            <p className="referral-landing-text">
              <strong>{referrer.display_name}</strong> invited you to join Spark AI Prediction!
            </p>
            <p className="referral-landing-sub">Redirecting to sign up...</p>
          </div>
        ) : (
          <div className="referral-landing-card">
            <p className="referral-landing-text">Invalid referral link</p>
            <p className="referral-landing-sub">Redirecting to home...</p>
          </div>
        )}
      </div>
    </div>
  )
}
