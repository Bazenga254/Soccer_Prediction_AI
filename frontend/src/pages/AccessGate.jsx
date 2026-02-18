import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AuthForm from '../components/AuthForm'

export default function AccessGate() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const isSuspended = searchParams.get('suspended') === '1'

  return (
    <div className="access-gate-page">
      <div className="access-gate-container">
        {isSuspended && (
          <div className="suspension-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>{t('auth.suspendedBanner')}</span>
          </div>
        )}
        <AuthForm initialMode="login" />
      </div>
    </div>
  )
}
