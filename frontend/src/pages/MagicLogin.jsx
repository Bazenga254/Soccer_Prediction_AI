import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function MagicLogin() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { magicLogin } = useAuth()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const token = searchParams.get('token')
  const email = searchParams.get('email')

  useEffect(() => {
    if (!token || !email) {
      setError('Invalid login link. Missing required parameters.')
      setLoading(false)
      return
    }

    const processLogin = async () => {
      const result = await magicLogin(email, token)
      if (result.success) {
        navigate('/', { replace: true })
      } else {
        setError(result.error || 'Login link expired or invalid.')
        setLoading(false)
      }
    }

    processLogin()
  }, [token, email, magicLogin, navigate])

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
            <p style={{ color: '#94a3b8' }}>Logging you in...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && !loading && (
          <div>
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '16px',
              margin: '16px 0',
            }}>
              <p style={{ color: '#ef4444', margin: 0 }}>{error}</p>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '14px', margin: '16px 0' }}>
              You can log in using your email and password, or use "Continue with Whop" on the login page.
            </p>
            <button
              onClick={() => navigate('/login')}
              style={{
                padding: '10px 24px', borderRadius: '8px',
                background: '#3b82f6', color: '#fff', border: 'none',
                cursor: 'pointer', fontSize: '14px', fontWeight: 600,
              }}
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
