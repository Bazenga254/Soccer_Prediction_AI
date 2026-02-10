import { useState, useEffect } from 'react'
import sparkLogo from '../assets/spark-ai-logo.png'

export default function LandingNav({ onSignIn, onGetStarted }) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleNavClick = (id) => {
    setMobileOpen(false)
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <nav className={`landing-nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="landing-nav-content">
        <div className="landing-nav-logo">
          <img src={sparkLogo} alt="Spark AI" className="landing-nav-logo-img" />
          <span className="landing-nav-brand">Spark AI</span>
        </div>

        <div className={`landing-nav-links ${mobileOpen ? 'open' : ''}`}>
          <button className="landing-nav-link" onClick={() => handleNavClick('features')}>Features</button>
          <button className="landing-nav-link" onClick={() => handleNavClick('pricing')}>Pricing</button>
          <button className="landing-nav-link" onClick={() => handleNavClick('how-it-works')}>How It Works</button>
          <div className="landing-nav-mobile-actions">
            <button className="landing-signin-btn" onClick={() => { setMobileOpen(false); onSignIn() }}>Sign In</button>
            <button className="landing-cta-btn" onClick={() => { setMobileOpen(false); onGetStarted() }}>Get Started</button>
          </div>
        </div>

        <div className="landing-nav-actions">
          <button className="landing-signin-btn" onClick={onSignIn}>Sign In</button>
          <button className="landing-cta-btn" onClick={onGetStarted}>Get Started</button>
        </div>

        <button
          className="landing-nav-mobile-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <span className={`hamburger ${mobileOpen ? 'open' : ''}`}>
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
      </div>
    </nav>
  )
}
