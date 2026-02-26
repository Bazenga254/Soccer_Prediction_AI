import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import AuthForm from './AuthForm'

export default function AuthModal({ isOpen, onClose, initialMode = 'login' }) {
  const { t } = useTranslation()

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="auth-modal-overlay" onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}>
      <div className="auth-modal-container">
        <AuthForm initialMode={initialMode} onClose={onClose} compact />
      </div>
    </div>
  )
}
