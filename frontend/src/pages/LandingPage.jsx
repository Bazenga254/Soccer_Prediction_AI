import { useState } from 'react'
import LandingNav from '../components/LandingNav'
import HeroCarousel from '../components/HeroCarousel'
import AuthModal from '../components/AuthModal'

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

const FEATURES = [
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
        <path d="M12 6v6l4 2"/>
      </svg>
    ),
    title: 'AI-Powered Predictions',
    description: 'Advanced algorithm weighing H2H records, recent form, home/away stats, goals analysis, and league position for accurate match predictions.',
    badge: null,
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6"/><path d="M16 12H8"/>
      </svg>
    ),
    title: 'Live Scores',
    description: 'Real-time match scores and updates across 50+ football leagues worldwide. Never miss a moment.',
    badge: null,
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: 'Community Marketplace',
    description: 'Share your predictions, discover top analysts, rate and comment on community picks. Build your reputation.',
    badge: null,
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    title: 'Odds Comparison',
    description: 'Compare odds from multiple bookmakers side by side. Find the best value across markets instantly.',
    badge: null,
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
    title: 'Player Impact Analysis',
    description: 'See how key player injuries, suspensions, and form affect match outcomes with detailed player stats.',
    badge: null,
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    title: 'Risk Assessment',
    description: 'Clear risk levels for every prediction. Know exactly what you\'re getting into before making a decision.',
    badge: null,
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    title: 'Track Record',
    description: 'Full prediction history with accuracy metrics. Track your performance and improve over time.',
    badge: null,
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
    title: 'Advanced Analytics',
    description: 'Deep statistical models, trend analysis, and comprehensive data visualizations for informed decisions.',
    badge: 'PRO',
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
    title: 'Value Betting Insights',
    description: 'Find bets where the odds exceed the true probability. Maximize your edge with data-driven value picks.',
    badge: 'PRO',
  },
]

const STEPS = [
  {
    number: '01',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
    title: 'Create Your Account',
    description: 'Sign up for free in seconds. No credit card required.',
  },
  {
    number: '02',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    title: 'Pick a Match',
    description: 'Browse fixtures across 50+ leagues. Select any upcoming match for analysis.',
  },
  {
    number: '03',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    title: 'Get AI Predictions',
    description: 'Receive detailed predictions with confidence levels, risk factors, and value insights.',
  },
]

const FREE_FEATURES = [
  '3 predictions per day',
  'Basic match analysis',
  'H2H statistics',
  '1 community share per day',
]

const PRO_FEATURES = [
  'Unlimited predictions',
  'Advanced analytics',
  'Value betting insights',
  'Ad-free experience',
  'Unlimited community shares',
  'Priority support',
]

export default function LandingPage() {
  const [authModal, setAuthModal] = useState({ open: false, mode: 'login' })

  const openSignIn = () => setAuthModal({ open: true, mode: 'login' })
  const openSignUp = () => setAuthModal({ open: true, mode: 'signup' })
  const closeModal = () => setAuthModal({ open: false, mode: 'login' })

  return (
    <div className="landing-page">
      <LandingNav onSignIn={openSignIn} onSignUp={openSignUp} />

      {/* Hero Section */}
      <HeroCarousel images={heroImages} interval={3000}>
        <h1 className="hero-title">AI-Powered Match Predictions</h1>
        <p className="hero-subtitle">
          Make smarter decisions with data-driven insights across 50+ football leagues worldwide
        </p>
        <div className="hero-actions">
          <button className="hero-cta-btn" onClick={openSignUp}>
            Get Started Free
          </button>
          <button className="hero-secondary-btn" onClick={() => {
            document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
          }}>
            See How It Works
          </button>
        </div>
      </HeroCarousel>

      {/* Stats Bar */}
      <div className="landing-stats">
        <div className="landing-stats-inner">
          <div className="landing-stat-item">
            <span className="stat-number">50+</span>
            <span className="stat-label">Leagues Covered</span>
          </div>
          <div className="landing-stat-item">
            <span className="stat-number">24/7</span>
            <span className="stat-label">Live Scores</span>
          </div>
          <div className="landing-stat-item">
            <span className="stat-number">AI</span>
            <span className="stat-label">Powered Analysis</span>
          </div>
          <div className="landing-stat-item">
            <span className="stat-number">$0</span>
            <span className="stat-label">Free to Start</span>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <section id="features" className="landing-section">
        <div className="landing-section-inner">
          <h2 className="landing-section-title">Everything You Need for Smarter Predictions</h2>
          <p className="landing-section-subtitle">
            Our platform combines real football data with AI analysis to give you the edge
          </p>
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
          <h2 className="landing-section-title">How It Works</h2>
          <p className="landing-section-subtitle">Get started in three simple steps</p>
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
          <h2 className="landing-section-title">Simple, Transparent Pricing</h2>
          <p className="landing-section-subtitle">Start free, upgrade when you're ready</p>
          <div className="landing-plans-grid">
            {/* Free Plan */}
            <div className="landing-plan-card">
              <div className="landing-plan-header">
                <h3 className="landing-plan-name">Free</h3>
                <div className="landing-plan-price">
                  <span className="landing-price-amount">$0</span>
                  <span className="landing-price-period">forever</span>
                </div>
              </div>
              <ul className="landing-plan-features">
                {FREE_FEATURES.map((f, i) => (
                  <li key={i} className="landing-feature-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {f}
                  </li>
                ))}
                <li className="landing-feature-item disabled">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Advanced analytics
                </li>
                <li className="landing-feature-item disabled">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Value betting insights
                </li>
              </ul>
              <button className="landing-plan-btn free" onClick={openSignUp}>
                Get Started Free
              </button>
            </div>

            {/* Pro Weekly */}
            <div className="landing-plan-card popular">
              <div className="landing-plan-ribbon">Most Popular</div>
              <div className="landing-plan-header">
                <h3 className="landing-plan-name">Pro Weekly</h3>
                <div className="landing-plan-price">
                  <span className="landing-price-amount">$9</span>
                  <span className="landing-price-period">/ week</span>
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
              <button className="landing-plan-btn pro" onClick={openSignUp}>
                Get Pro Weekly
              </button>
            </div>

            {/* Pro Monthly */}
            <div className="landing-plan-card">
              <div className="landing-plan-save">Save 19%</div>
              <div className="landing-plan-header">
                <h3 className="landing-plan-name">Pro Monthly</h3>
                <div className="landing-plan-price">
                  <span className="landing-price-amount">$29</span>
                  <span className="landing-price-period">/ month</span>
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
              <button className="landing-plan-btn monthly" onClick={openSignUp}>
                Get Pro Monthly
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta-section">
        <div className="landing-section-inner">
          <h2 className="landing-cta-title">Ready to Make Smarter Predictions?</h2>
          <p className="landing-cta-subtitle">Join thousands of football fans using AI to gain an edge</p>
          <button className="hero-cta-btn" onClick={openSignUp}>
            Sign Up Free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <span className="landing-nav-icon">&#9917;</span>
            <span className="landing-nav-brand">Spark AI Prediction</span>
          </div>
          <div className="landing-footer-links">
            <button className="landing-footer-link" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>Features</button>
            <button className="landing-footer-link" onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}>Pricing</button>
            <button className="landing-footer-link" onClick={openSignIn}>Sign In</button>
          </div>
          <p className="landing-footer-copy">&copy; 2026 Spark AI Prediction. All rights reserved.</p>
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
