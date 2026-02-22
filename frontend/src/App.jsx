import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Header from './components/Header'
import FixturesList from './components/FixturesList'
import MatchAnalysis from './pages/MatchAnalysis'
import LiveScores from './pages/LiveScores'
import TrackRecord from './pages/TrackRecord'
import AccessGate from './pages/AccessGate'
import LandingPage from './pages/LandingPage'
import Admin from './pages/admin/Admin'
import Employee from './pages/employee/Employee'
import InviteRegistration from './pages/InviteRegistration'
import Profile from './pages/Profile'
import Community from './pages/Community'
import Upgrade from './pages/Upgrade'
import CreatorDashboard from './pages/CreatorDashboard'
import Transactions from './pages/Transactions'
import JackpotAnalyzer from './pages/JackpotAnalyzer'
import MyAnalysis from './pages/MyAnalysis'
import DocsPage from './pages/DocsPage'
import ReferralLanding from './pages/ReferralLanding'
import ResetPassword from './pages/ResetPassword'
import TermsOfService from './pages/TermsOfService'
import BetSlip from './components/BetSlip'
import SupportChat from './components/SupportChat'
import AccountSetup from './components/AccountSetup'
import TermsAcceptance from './components/TermsAcceptance'
import LanguageBanner from './components/LanguageBanner'
import CookieConsent from './components/CookieConsent'
import { useTracking } from './hooks/useTracking'
import { BetSlipProvider } from './context/BetSlipContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CurrencyProvider } from './context/CurrencyContext'
import './App.css'

function ProtectedApp() {
  const { isAuthenticated, loading, user, logout } = useAuth()

  if (loading) {
    return (
      <div className="app">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LandingPage />
  }

  // Redirect employees to employee portal
  if (user && (user.staff_role || user.role_id)) {
    return <Navigate to="/employee" replace />
  }

  // Block access until profile is complete (security question set)
  if (user && user.profile_complete === false) {
    return (
      <div className="app">
        <AccountSetup />
      </div>
    )
  }

  // Block access until Terms of Service are accepted
  if (user && user.terms_accepted === false) {
    return (
      <div className="app">
        <TermsAcceptance />
      </div>
    )
  }

  return (
    <BetSlipProvider>
      <div className="app">
        <Header user={user} logout={logout} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<LiveScores />} />
            <Route path="/live" element={<LiveScores />} />
            <Route path="/competition/:competitionId" element={<FixturesList />} />
            <Route path="/match/:competitionId/:homeId/:awayId" element={<MatchAnalysis />} />
            <Route path="/my-predictions" element={<TrackRecord />} />
            <Route path="/predictions" element={<Community />} />
            <Route path="/jackpot" element={<JackpotAnalyzer />} />
            <Route path="/my-analysis" element={<MyAnalysis />} />
            <Route path="/upgrade" element={<Upgrade />} />
            <Route path="/creator" element={<CreatorDashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/docs" element={<DocsPage />} />
          </Routes>
        </main>
        <BetSlip />
        <SupportChat />
      </div>
    </BetSlipProvider>
  )
}

function TrackingWrapper({ children }) {
  useTracking()
  return children
}

function App() {
  const { i18n } = useTranslation()

  useEffect(() => {
    const lang = i18n.language?.split('-')[0] || 'en'
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [i18n.language])

  return (
    <BrowserRouter>
      <CurrencyProvider>
      <AuthProvider>
        <LanguageBanner />
        <CookieConsent />
        <TrackingWrapper>
          <Routes>
            <Route path="/admin" element={<Admin />} />
            <Route path="/employee" element={<Employee />} />
            <Route path="/invite/:token" element={<InviteRegistration />} />
            <Route path="/ref/:username" element={<ReferralLanding />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/login" element={<AccessGate />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="*" element={<ProtectedApp />} />
          </Routes>
        </TrackingWrapper>
      </AuthProvider>
      </CurrencyProvider>
    </BrowserRouter>
  )
}

export default App
