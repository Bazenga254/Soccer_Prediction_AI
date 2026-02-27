import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function WhopCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { whopLogin } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [needsTerms, setNeedsTerms] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const processedRef = useRef(false)

  const code = searchParams.get('code')
  const state = searchParams.get('state')

  useEffect(() => {
    if (processedRef.current) return
    if (!code || !state) {
      setError('Invalid callback. Missing authorization code.')
      setLoading(false)
      return
    }

    processedRef.current = true

    const processCallback = async () => {
      const result = await whopLogin(code, state)
      if (result.success) {
        navigate('/', { replace: true })
      } else if (result.needs_terms) {
        setNeedsTerms(true)
        setLoading(false)
      } else {
        setError(result.error || 'Login failed. Please try again.')
        setLoading(false)
      }
    }

    processCallback()
  }, [code, state, whopLogin, navigate])

  const handleAcceptTerms = async () => {
    if (!termsAccepted) return
    setLoading(true)
    setError('')
    const result = await whopLogin(code, state, true)
    if (result.success) {
      navigate('/', { replace: true })
    } else {
      setError(result.error || 'Login failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f172a',
      color: '#f1f5f9',
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{
        maxWidth: 420,
        width: '100%',
        padding: '40px',
        borderRadius: '16px',
        background: 'rgba(30, 41, 59, 0.8)',
        textAlign: 'center',
      }}>
        <span style={{ fontSize: 48 }}>&#9917;</span>
        <h2 style={{ margin: '12px 0', color: '#f1f5f9' }}>Spark AI</h2>

        {loading && (
          <div>
            <div style={{
              width: 40, height: 40, border: '3px solid #3b82f6',
              borderTopColor: 'transparent', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '24px auto',
            }} />
            <p style={{ color: '#94a3b8' }}>Signing you in with Whop...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && (
          <div>
            <p style={{ color: '#ef4444', margin: '16px 0' }}>{error}</p>
            <button
              onClick={() => navigate('/login')}
              style={{
                padding: '10px 24px', borderRadius: '8px',
                background: '#3b82f6', color: '#fff', border: 'none',
                cursor: 'pointer', fontSize: '14px', fontWeight: 600,
              }}
            >
              Back to Login
            </button>
          </div>
        )}

        {needsTerms && !loading && (
          <div>
            <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
              Welcome! To create your Spark AI account, please accept our Terms of Service.
            </p>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              color: '#94a3b8', cursor: 'pointer', justifyContent: 'center',
              marginBottom: '16px',
            }}>
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
              />
              I accept the{' '}
              <a href="/terms" target="_blank" style={{ color: '#3b82f6' }}>Terms of Service</a>
            </label>
            <button
              onClick={handleAcceptTerms}
              disabled={!termsAccepted}
              style={{
                padding: '10px 24px', borderRadius: '8px',
                background: termsAccepted ? '#3b82f6' : '#475569',
                color: '#fff', border: 'none',
                cursor: termsAccepted ? 'pointer' : 'not-allowed',
                fontSize: '14px', fontWeight: 600,
              }}
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
