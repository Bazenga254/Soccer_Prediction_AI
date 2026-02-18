import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '../context/CurrencyContext'
import axios from 'axios'
import LandingNav from '../components/LandingNav'
import HeroCarousel from '../components/HeroCarousel'
import AuthModal from '../components/AuthModal'
import sparkLogo from '../assets/spark-ai-logo.png'

// Placeholder gradient images until user uploads real ones
const PLACEHOLDER_IMAGES = [
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#0f172a"/><stop offset="50%" style="stop-color:#1e3a5f"/><stop offset="100%" style="stop-color:#0f172a"/></linearGradient></defs><rect fill="url(#g)" width="1920" height="1080"/><text x="960" y="540" text-anchor="middle" fill="#334155" font-size="48" font-family="sans-serif">Hero Image 1</text></svg>'),
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#1a1f35"/><stop offset="50%" style="stop-color:#0d2847"/><stop offset="100%" style="stop-color:#0f172a"/></linearGradient></defs><rect fill="url(#g)" width="1920" height="1080"/><text x="960" y="540" text-anchor="middle" fill="#334155" font-size="48" font-family="sans-serif">Hero Image 2</text></svg>'),
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#0f172a"/><stop offset="50%" style="stop-color:#1e293b"/><stop offset="100%" style="stop-color:#162033"/></linearGradient></defs><rect fill="url(#g)" width="1920" height="1080"/><text x="960" y="540" text-anchor="middle" fill="#334155" font-size="48" font-family="sans-serif">Hero Image 3</text></svg>'),
]

// Try to load real images if they exist
let heroImages = PLACEHOLDER_IMAGES
try {
  const imgModules = import.meta.glob('../assets/landing/hero-*.{jpg,jpeg,png,webp}', { eager: true })
  const loaded = Object.values(imgModules).map(m => m.default)
  if (loaded.length > 0) heroImages = loaded
} catch { /* use placeholders */ }

// Feature icons (SVGs don't need translation)
const FEATURE_ICONS = [
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/><path d="M12 6v6l4 2"/></svg>,
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6"/><path d="M16 12H8"/></svg>,
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
]

const STEP_ICONS = [
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
]

export default function LandingPage() {
  const { t } = useTranslation()
  const { currency, currencySymbol, isKenyan } = useCurrency()
  const [authModal, setAuthModal] = useState({ open: false, mode: 'login' })
  const [pricing, setPricing] = useState(null)

  useEffect(() => {
    axios.get('/api/pricing').then(res => setPricing(res.data)).catch(() => {})
  }, [])

  const openSignIn = () => setAuthModal({ open: true, mode: 'login' })
  const openSignUp = () => setAuthModal({ open: true, mode: 'signup' })
  const closeModal = () => setAuthModal({ open: false, mode: 'login' })
  const scrollToPricing = () => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })

  const FEATURES = [
    { icon: FEATURE_ICONS[0], title: t('landing.feature1Title'), description: t('landing.feature1Desc'), badge: null },
    { icon: FEATURE_ICONS[1], title: t('landing.feature2Title'), description: t('landing.feature2Desc'), badge: null },
    { icon: FEATURE_ICONS[2], title: t('landing.feature3Title'), description: t('landing.feature3Desc'), badge: null },
    { icon: FEATURE_ICONS[3], title: t('landing.feature4Title'), description: t('landing.feature4Desc'), badge: null },
    { icon: FEATURE_ICONS[4], title: t('landing.feature5Title'), description: t('landing.feature5Desc'), badge: null },
    { icon: FEATURE_ICONS[5], title: t('landing.feature6Title'), description: t('landing.feature6Desc'), badge: null },
    { icon: FEATURE_ICONS[6], title: t('landing.feature7Title'), description: t('landing.feature7Desc'), badge: null },
    { icon: FEATURE_ICONS[7], title: t('landing.feature8Title'), description: t('landing.feature8Desc'), badge: 'PRO' },
    { icon: FEATURE_ICONS[8], title: t('landing.feature9Title'), description: t('landing.feature9Desc'), badge: 'PRO' },
  ]

  const STEPS = [
    { number: '01', icon: STEP_ICONS[0], title: t('landing.step1Title'), description: t('landing.step1Desc') },
    { number: '02', icon: STEP_ICONS[1], title: t('landing.step2Title'), description: t('landing.step2Desc') },
    { number: '03', icon: STEP_ICONS[2], title: t('landing.step3Title'), description: t('landing.step3Desc') },
  ]

  const TRIAL_FEATURES = [
    '10 AI analyses per day',
    '3 jackpot analyses per day',
    'Unlimited AI chat usage',
    'Unlimited game analysis',
    '3 days access',
  ]

  const PRO_FEATURES = [
    t('landing.proFeature1'), t('landing.proFeature2'), t('landing.proFeature3'),
    t('landing.proFeature4'), t('landing.proFeature5'), t('landing.proFeature6'),
  ]

  return (
    <div className="landing-page">
      <LandingNav onSignIn={openSignIn} onGetStarted={scrollToPricing} />

      {/* Hero Section */}
      <HeroCarousel images={heroImages} interval={5000}>
        <h1 className="hero-title">{t('landing.heroTitle')}</h1>
        <p className="hero-subtitle">{t('landing.heroSubtitle')}</p>
        <div className="hero-actions">
          <button className="hero-cta-btn" onClick={scrollToPricing}>Try for KES 100</button>
          <button className="hero-secondary-btn" onClick={() => {
            document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
          }}>{t('landing.seeHowItWorks')}</button>
        </div>
      </HeroCarousel>

      {/* Stats Bar */}
      <div className="landing-stats">
        <div className="landing-stats-inner">
          <div className="landing-stat-item">
            <span className="stat-number">50+</span>
            <span className="stat-label">{t('landing.leaguesCovered')}</span>
          </div>
          <div className="landing-stat-item">
            <span className="stat-number">24/7</span>
            <span className="stat-label">{t('landing.liveScores')}</span>
          </div>
          <div className="landing-stat-item">
            <span className="stat-number">AI</span>
            <span className="stat-label">{t('landing.poweredAnalysis')}</span>
          </div>
          <div className="landing-stat-item">
            <span className="stat-number">{currencySymbol}0</span>
            <span className="stat-label">{t('landing.freeToStart')}</span>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <section id="features" className="landing-section">
        <div className="landing-section-inner">
          <h2 className="landing-section-title">{t('landing.featuresTitle')}</h2>
          <p className="landing-section-subtitle">{t('landing.featuresSubtitle')}</p>
          <div className="features-grid">
            {FEATURES.map((feature, i) => (
              <div key={i} className="feature-card">
                <div className="feature-card-icon">{feature.icon}</div>
                <h3 className="feature-card-title">{feature.title}</h3>
                <p className="feature-card-desc">{feature.description}</p>
                {feature.badge && <span className="feature-card-badge">{feature.badge}</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="landing-section landing-section-alt">
        <div className="landing-section-inner">
          <h2 className="landing-section-title">{t('landing.howItWorksTitle')}</h2>
          <p className="landing-section-subtitle">{t('landing.howItWorksSubtitle')}</p>
          <div className="steps-container">
            {STEPS.map((step, i) => (
              <div key={i} className="step-item">
                <div className="step-number">{step.number}</div>
                <div className="step-icon">{step.icon}</div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-desc">{step.description}</p>
                {i < STEPS.length - 1 && <div className="step-connector" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="landing-section">
        <div className="landing-section-inner">
          <h2 className="landing-section-title">{t('landing.pricingTitle')}</h2>
          <p className="landing-section-subtitle">{t('landing.pricingSubtitle')}</p>
          <div className="landing-plans-grid">
            {/* 3-Day Trial */}
            <div className="landing-plan-card trial">
              <div className="landing-plan-ribbon trial-ribbon">Try It Out!</div>
              <div className="landing-plan-header">
                <h3 className="landing-plan-name">3-Day Trial</h3>
                <div className="landing-plan-price">
                  <span className="landing-price-amount">{isKenyan ? 'KES' : currencySymbol}{isKenyan ? ' 100' : (pricing?.plans?.trial_usd?.price || '1')}</span>
                  <span className="landing-price-period">/ 3 days</span>
                </div>
              </div>
              <ul className="landing-plan-features">
                {TRIAL_FEATURES.map((f, i) => (
                  <li key={i} className="landing-feature-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button className="landing-plan-btn trial" onClick={openSignUp}>Start Free Trial</button>
            </div>

            {/* Pro Weekly */}
            <div className="landing-plan-card popular">
              <div className="landing-plan-ribbon">{t('landing.mostPopular')}</div>
              <div className="landing-plan-header">
                <h3 className="landing-plan-name">{t('landing.proWeekly')}</h3>
                <div className="landing-plan-price">
                  <span className="landing-price-amount">{currencySymbol}{pricing?.plans?.[isKenyan ? 'weekly_kes' : 'weekly_usd']?.price || (isKenyan ? 1950 : 15)}</span>
                  <span className="landing-price-period">{t('landing.perWeek')}</span>
                </div>
              </div>
              <ul className="landing-plan-features">
                {PRO_FEATURES.map((f, i) => (
                  <li key={i} className="landing-feature-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button className="landing-plan-btn pro" onClick={openSignUp}>{t('landing.getProWeekly')}</button>
            </div>

            {/* Pro Monthly */}
            <div className="landing-plan-card">
              <div className="landing-plan-save">{t('landing.save20')}</div>
              <div className="landing-plan-header">
                <h3 className="landing-plan-name">{t('landing.proMonthly')}</h3>
                <div className="landing-plan-price">
                  <span className="landing-price-amount">{currencySymbol}{pricing?.plans?.[isKenyan ? 'monthly_kes' : 'monthly_usd']?.price || (isKenyan ? 6200 : 48)}</span>
                  <span className="landing-price-period">{t('landing.perMonth')}</span>
                </div>
              </div>
              <ul className="landing-plan-features">
                {PRO_FEATURES.map((f, i) => (
                  <li key={i} className="landing-feature-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button className="landing-plan-btn monthly" onClick={openSignUp}>{t('landing.getProMonthly')}</button>
            </div>

            {/* Extra Plans (admin-created) */}
            {pricing?.plans && Object.entries(pricing.plans)
              .filter(([id]) => !['weekly_usd', 'weekly_kes', 'monthly_usd', 'monthly_kes', 'trial_usd', 'trial_kes'].includes(id))
              .filter(([, plan]) => plan.currency === currency)
              .map(([planId, plan]) => (
                <div key={planId} className="landing-plan-card">
                  <div className="landing-plan-header">
                    <h3 className="landing-plan-name">{plan.name}</h3>
                    <div className="landing-plan-price">
                      <span className="landing-price-amount">{currencySymbol}{plan.price}</span>
                      <span className="landing-price-period">
                        {plan.duration_days === 1 ? t('landing.perDay') || '/ day' : plan.duration_days === 7 ? t('landing.perWeek') : plan.duration_days === 30 ? t('landing.perMonth') : `/ ${plan.duration_days} days`}
                      </span>
                    </div>
                  </div>
                  <ul className="landing-plan-features">
                    {(plan.features || []).map((f, i) => (
                      <li key={i} className="landing-feature-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button className="landing-plan-btn pro" onClick={openSignUp}>{t('landing.getStartedFree')}</button>
                </div>
              ))
            }
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta-section">
        <div className="landing-section-inner">
          <h2 className="landing-cta-title">{t('landing.ctaTitle')}</h2>
          <p className="landing-cta-subtitle">{t('landing.ctaSubtitle')}</p>
          <button className="hero-cta-btn" onClick={openSignUp}>{t('landing.signUpFree')}</button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <img src={sparkLogo} alt="Spark AI" className="landing-nav-logo-img" />
            <span className="landing-nav-brand">Spark AI Prediction</span>
          </div>
          <div className="landing-footer-links">
            <button className="landing-footer-link" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>{t('nav.features')}</button>
            <button className="landing-footer-link" onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}>{t('nav.pricing')}</button>
            <button className="landing-footer-link" onClick={openSignIn}>{t('nav.signIn')}</button>
            <a href="/terms" className="landing-footer-link">{t('landing.termsOfService')}</a>
          </div>
          <p className="landing-footer-copy">&copy; {t('landing.copyright')}</p>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModal.open}
        onClose={closeModal}
        initialMode={authModal.mode}
      />
    </div>
  )
}
