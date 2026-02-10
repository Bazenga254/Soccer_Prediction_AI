import { useState, useEffect } from 'react'

export default function LandingNav({ onSignIn, onSignUp }) {
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
          <span className="landing-nav-icon">&#9917;</span>
          <span className="landing-nav-brand">Spark AI</span>
        </div>

        <div className={`landing-nav-links ${mobileOpen ? 'open' : ''}`}>
          <button className="landing-nav-link" onClick={() => handleNavClick('features')}>Features</button>
          <button className="landing-nav-link" onClick={() => handleNavClick('pricing')}>Pricing</button>
          <button className="landing-nav-link" onClick={() => handleNavClick('how-it-works')}>How It Works</button>
          <div className="landing-nav-mobile-actions">
            <button className="landing-signin-btn" onClick={() => { setMobileOpen(false); onSignIn() }}>Sign In</button>
            <button className="landing-cta-btn" onClick={() => { setMobileOpen(false); onSignUp() }}>Get Started</button>
          </div>
        </div>

        <div className="landing-nav-actions">
          <button className="landing-signin-btn" onClick={onSignIn}>Sign In</button>
          <button className="landing-cta-btn" onClick={onSignUp}>Get Started</button>
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
