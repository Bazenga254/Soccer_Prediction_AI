import SEOHead from '../components/SEOHead'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import './TermsOfService.css'

export default function TermsOfService() {
  const { t } = useTranslation()
  const { lang } = useParams()
  const currentLang = lang || 'en'

  return (
    <div className="terms-page">
      <div className="terms-container">
        <Link to="/" className="terms-back-link">
          &larr; {t('terms.backToHome')}
        </Link>

        <h1 className="terms-title">{t('terms.title')}</h1>
        <p className="terms-effective">{t('terms.effectiveDate')}</p>

        <div className="terms-content">
          <section className="terms-section">
            <h2>{t('terms.s1Title')}</h2>
            <p>{t('terms.s1Content')}</p>
          </section>

          <section className="terms-section">
            <h2>{t('terms.s2Title')}</h2>
            <p>{t('terms.s2Content')}</p>
          </section>

          <section className="terms-section">
            <h2>{t('terms.s3Title')}</h2>
            <p>{t('terms.s3Content')}</p>
          </section>

          <section className="terms-section">
            <h2>{t('terms.s4Title')}</h2>
            <p>{t('terms.s4Content')}</p>
          </section>

          <section className="terms-section">
            <h2>{t('terms.s5Title')}</h2>
            <p>{t('terms.s5Content')}</p>
          </section>

          <section className="terms-section">
            <h2>{t('terms.s6Title')}</h2>
            <p>{t('terms.s6Content')}</p>
          </section>

          <section className="terms-section terms-section-highlight">
            <h2>{t('terms.s7Title')}</h2>
            <p>{t('terms.s7Content')}</p>
          </section>

          <section className="terms-section terms-section-highlight">
            <h2>{t('terms.s8Title')}</h2>
            <p>{t('terms.s8Content')}</p>
          </section>

          <section className="terms-section">
            <h2>{t('terms.s9Title')}</h2>
            <p>{t('terms.s9Content')}</p>
          </section>

          <section className="terms-section">
            <h2>{t('terms.s10Title')}</h2>
            <p>{t('terms.s10Content')}</p>
          </section>

          <section className="terms-section">
            <h2>{t('terms.s11Title')}</h2>
            <p>{t('terms.s11Content')}</p>
          </section>

          <section className="terms-section">
            <h2>{t('terms.s12Title')}</h2>
            <p>{t('terms.s12Content')}</p>
          </section>
        </div>

        <div className="terms-footer">
          <Link to="/" className="terms-back-btn">
            &larr; {t('terms.backToHome')}
          </Link>
        </div>
      </div>
    </div>
  )
}
