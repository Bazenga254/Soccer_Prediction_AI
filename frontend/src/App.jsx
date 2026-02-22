import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Header from './components/Header'
import { useTracking } from './hooks/useTracking'
import { BetSlipProvider } from './context/BetSlipContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CurrencyProvider } from './context/CurrencyContext'
import OfflineBanner from './components/OfflineBanner'
import './App.css'

// Lazy-load all page components for code splitting
const LiveScores = lazy(() => import('./pages/LiveScores'))
const FixturesList = lazy(() => import('./components/FixturesList'))
const MatchAnalysis = lazy(() => import('./pages/MatchAnalysis'))
const TrackRecord = lazy(() => import('./pages/TrackRecord'))
const AccessGate = lazy(() => import('./pages/AccessGate'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const Admin = lazy(() => import('./pages/admin/Admin'))
const Employee = lazy(() => import('./pages/employee/Employee'))
const InviteRegistration = lazy(() => import('./pages/InviteRegistration'))
const Profile = lazy(() => import('./pages/Profile'))
const Community = lazy(() => import('./pages/Community'))
const Upgrade = lazy(() => import('./pages/Upgrade'))
const CreatorDashboard = lazy(() => import('./pages/CreatorDashboard'))
const Transactions = lazy(() => import('./pages/Transactions'))
const JackpotAnalyzer = lazy(() => import('./pages/JackpotAnalyzer'))
const MyAnalysis = lazy(() => import('./pages/MyAnalysis'))
const DocsPage = lazy(() => import('./pages/DocsPage'))
const ReferralLanding = lazy(() => import('./pages/ReferralLanding'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const TermsOfService = lazy(() => import('./pages/TermsOfService'))
const ExtensionInstall = lazy(() => import('./pages/ExtensionInstall'))
const BetSlip = lazy(() => import('./components/BetSlip'))
const SupportChat = lazy(() => import('./components/SupportChat'))
const AccountSetup = lazy(() => import('./components/AccountSetup'))
const TermsAcceptance = lazy(() => import('./components/TermsAcceptance'))
const InstallPrompt = lazy(() => import('./components/InstallPrompt'))
const CookieConsent = lazy(() => import('./components/CookieConsent'))
const LanguageBanner = lazy(() => import('./components/LanguageBanner'))
const NotificationPrompt = lazy(() => import('./components/NotificationPrompt'))

function PageLoader() {
  return (
    <div className="loading-container">
      <div className="spinner"></div>
    </div>
  )
}

function ProtectedApp() {
  const { isAuthenticated, loading, user, logout } = useAuth()

  if (loading) {
    return (
      <div className="app">
        <PageLoader />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoader />}>
        <LandingPage />
      </Suspense>
    )
  }

  // Redirect employees to employee portal
  if (user && (user.staff_role || user.role_id)) {
    return <Navigate to="/employee" replace />
  }

  // Block access until profile is complete (security question set)
  if (user && user.profile_complete === false) {
    return (
      <div className="app">
        <Suspense fallback={<PageLoader />}>
          <AccountSetup />
        </Suspense>
      </div>
    )
  }

  // Block access until Terms of Service are accepted
  if (user && user.terms_accepted === false) {
    return (
      <div className="app">
        <Suspense fallback={<PageLoader />}>
          <TermsAcceptance />
        </Suspense>
      </div>
    )
  }

  return (
    <BetSlipProvider>
      <div className="app">
        <Header user={user} logout={logout} />
        <main className="main-content">
          <Suspense fallback={<PageLoader />}>
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
          </Suspense>
        </main>
        <Suspense fallback={null}>
          <BetSlip />
          <SupportChat />
          <NotificationPrompt />
        </Suspense>
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
    <>
    <OfflineBanner />
    <BrowserRouter>
      <CurrencyProvider>
      <AuthProvider>
        <Suspense fallback={null}>
          <LanguageBanner />
          <CookieConsent />
          <InstallPrompt />
        </Suspense>
        <TrackingWrapper>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/admin" element={<Admin />} />
              <Route path="/employee" element={<Employee />} />
              <Route path="/invite/:token" element={<InviteRegistration />} />
              <Route path="/ref/:username" element={<ReferralLanding />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/login" element={<AccessGate />} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/extension" element={<ExtensionInstall />} />
              <Route path="*" element={<ProtectedApp />} />
            </Routes>
          </Suspense>
        </TrackingWrapper>
      </AuthProvider>
      </CurrencyProvider>
    </BrowserRouter>
    </>
  )
}

export default App
