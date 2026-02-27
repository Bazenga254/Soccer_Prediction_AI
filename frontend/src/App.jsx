import { useEffect, lazy, Suspense, Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Header from './components/Header'
import { useTracking } from './hooks/useTracking'
import { BetSlipProvider } from './context/BetSlipContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CreditProvider } from './context/CreditContext'
import { CurrencyProvider } from './context/CurrencyContext'
import { ThemeProvider } from './context/ThemeContext'
import OfflineBanner from './components/OfflineBanner'
import './App.css'

// Retry dynamic imports once by clearing SW caches and reloading on chunk failure
function lazyRetry(importFn) {
  return lazy(() =>
    importFn().catch(async () => {
      const reloaded = sessionStorage.getItem('chunk_reload')
      if (!reloaded) {
        sessionStorage.setItem('chunk_reload', '1')
        // Clear all service worker caches so stale index.html is purged
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map(k => caches.delete(k)))
        }
        // Unregister stale service workers
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map(r => r.unregister()))
        }
        window.location.reload()
        return new Promise(() => {}) // never resolves, page is reloading
      }
      sessionStorage.removeItem('chunk_reload')
      return importFn() // second attempt after reload
    })
  )
}

// Error Boundary to catch chunk load failures and render errors
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <h2 style={{ color: '#f1f5f9', marginBottom: 12 }}>Something went wrong</h2>
          <p>The page failed to load. This usually fixes itself with a refresh.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 15 }}
          >
            Reload Page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Lazy-load all page components for code splitting
const LiveScores = lazyRetry(() => import('./pages/LiveScores'))
const AccountActivation = lazyRetry(() => import('./components/AccountActivation'))
const FixturesList = lazyRetry(() => import('./components/FixturesList'))
const MatchAnalysis = lazyRetry(() => import('./pages/MatchAnalysis'))
const TrackRecord = lazyRetry(() => import('./pages/TrackRecord'))
const AccessGate = lazyRetry(() => import('./pages/AccessGate'))
const LandingPage = lazyRetry(() => import('./pages/LandingPage'))
const Admin = lazyRetry(() => import('./pages/admin/Admin'))
const Employee = lazyRetry(() => import('./pages/employee/Employee'))
const InviteRegistration = lazyRetry(() => import('./pages/InviteRegistration'))
const Profile = lazyRetry(() => import('./pages/Profile'))
const Community = lazyRetry(() => import('./pages/Community'))
const Upgrade = lazyRetry(() => import('./pages/Upgrade'))
const CreatorDashboard = lazyRetry(() => import('./pages/CreatorDashboard'))
const Transactions = lazyRetry(() => import('./pages/Transactions'))
const JackpotAnalyzer = lazyRetry(() => import('./pages/JackpotAnalyzer'))
const MyAnalysis = lazyRetry(() => import('./pages/MyAnalysis'))
const DocsPage = lazyRetry(() => import('./pages/DocsPage'))
const ReferralLanding = lazyRetry(() => import('./pages/ReferralLanding'))
const ResetPassword = lazyRetry(() => import('./pages/ResetPassword'))
const TermsOfService = lazyRetry(() => import('./pages/TermsOfService'))
const ExtensionInstall = lazyRetry(() => import('./pages/ExtensionInstall'))
const Settings = lazyRetry(() => import('./pages/Settings'))
const WhopCallback = lazyRetry(() => import('./pages/WhopCallback'))
const MagicLogin = lazyRetry(() => import('./pages/MagicLogin'))
const LangLayout = lazyRetry(() => import('./components/LangLayout'))
const TodayPredictions = lazyRetry(() => import('./pages/TodayPredictions'))
const LeaguePredictions = lazyRetry(() => import('./pages/LeaguePredictions'))
const BlogIndex = lazyRetry(() => import('./pages/BlogIndex'))
const BlogArticle = lazyRetry(() => import('./pages/BlogArticle'))
const BetSlip = lazyRetry(() => import('./components/BetSlip'))
const SupportChat = lazyRetry(() => import('./components/SupportChat'))
const AccountSetup = lazyRetry(() => import('./components/AccountSetup'))
const TermsAcceptance = lazyRetry(() => import('./components/TermsAcceptance'))
const InstallPrompt = lazyRetry(() => import('./components/InstallPrompt'))
const CookieConsent = lazyRetry(() => import('./components/CookieConsent'))
const LanguageBanner = lazyRetry(() => import('./components/LanguageBanner'))
const NotificationPrompt = lazyRetry(() => import('./components/NotificationPrompt'))

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

  // Block access until account is activated (initial deposit required)
  if (user && user.account_activated === false) {
    return (
      <div className="app">
        <Suspense fallback={<PageLoader />}>
          <AccountActivation />
        </Suspense>
      </div>
    )
  }

  return (
    <BetSlipProvider>
      <div className="app">
        <Header user={user} logout={logout} />
        <main className="main-content">
          <ErrorBoundary>
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
                <Route path="/settings" element={<Settings />} />
                <Route path="/docs" element={<DocsPage />} />
                <Route path="/docs/:sectionId" element={<DocsPage />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
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
      <ThemeProvider>
      <CreditProvider>
      <CurrencyProvider>
      <AuthProvider>
        <Suspense fallback={null}>
          <LanguageBanner />
          <CookieConsent />
          <InstallPrompt />
        </Suspense>
        <TrackingWrapper>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/spark-ctrl-8k2v9x" element={<Admin />} />
                <Route path="/employee" element={<Employee />} />
                <Route path="/invite/:token" element={<InviteRegistration />} />
                <Route path="/ref/:username" element={<ReferralLanding />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/login" element={<AccessGate />} />
                <Route path="/extension" element={<ExtensionInstall />} />
                <Route path="/auth/whop/callback" element={<WhopCallback />} />
                <Route path="/magic-login" element={<MagicLogin />} />

                {/* Public SEO routes: English (no prefix) */}
                <Route element={<LangLayout />}>
                  <Route path="/today" element={<TodayPredictions />} />
                  <Route path="/predictions/:leagueSlug" element={<LeaguePredictions />} />
                  <Route path="/blog" element={<BlogIndex />} />
                  <Route path="/blog/:slug" element={<BlogArticle />} />
                  <Route path="/docs" element={<DocsPage />} />
                  <Route path="/docs/:sectionId" element={<DocsPage />} />
                  <Route path="/terms" element={<TermsOfService />} />
                </Route>

                {/* Public SEO routes: Language-prefixed (fr, es, pt, sw, ar) */}
                <Route path="/fr" element={<LangLayout />}>
                  <Route index element={<LandingPage />} />
                  <Route path="today" element={<TodayPredictions />} />
                  <Route path="predictions/:leagueSlug" element={<LeaguePredictions />} />
                  <Route path="blog" element={<BlogIndex />} />
                  <Route path="blog/:slug" element={<BlogArticle />} />
                  <Route path="docs" element={<DocsPage />} />
                  <Route path="docs/:sectionId" element={<DocsPage />} />
                  <Route path="terms" element={<TermsOfService />} />
                </Route>
                <Route path="/es" element={<LangLayout />}>
                  <Route index element={<LandingPage />} />
                  <Route path="today" element={<TodayPredictions />} />
                  <Route path="predictions/:leagueSlug" element={<LeaguePredictions />} />
                  <Route path="blog" element={<BlogIndex />} />
                  <Route path="blog/:slug" element={<BlogArticle />} />
                  <Route path="docs" element={<DocsPage />} />
                  <Route path="docs/:sectionId" element={<DocsPage />} />
                  <Route path="terms" element={<TermsOfService />} />
                </Route>
                <Route path="/pt" element={<LangLayout />}>
                  <Route index element={<LandingPage />} />
                  <Route path="today" element={<TodayPredictions />} />
                  <Route path="predictions/:leagueSlug" element={<LeaguePredictions />} />
                  <Route path="blog" element={<BlogIndex />} />
                  <Route path="blog/:slug" element={<BlogArticle />} />
                  <Route path="docs" element={<DocsPage />} />
                  <Route path="docs/:sectionId" element={<DocsPage />} />
                  <Route path="terms" element={<TermsOfService />} />
                </Route>
                <Route path="/sw" element={<LangLayout />}>
                  <Route index element={<LandingPage />} />
                  <Route path="today" element={<TodayPredictions />} />
                  <Route path="predictions/:leagueSlug" element={<LeaguePredictions />} />
                  <Route path="blog" element={<BlogIndex />} />
                  <Route path="blog/:slug" element={<BlogArticle />} />
                  <Route path="docs" element={<DocsPage />} />
                  <Route path="docs/:sectionId" element={<DocsPage />} />
                  <Route path="terms" element={<TermsOfService />} />
                </Route>
                <Route path="/ar" element={<LangLayout />}>
                  <Route index element={<LandingPage />} />
                  <Route path="today" element={<TodayPredictions />} />
                  <Route path="predictions/:leagueSlug" element={<LeaguePredictions />} />
                  <Route path="blog" element={<BlogIndex />} />
                  <Route path="blog/:slug" element={<BlogArticle />} />
                  <Route path="docs" element={<DocsPage />} />
                  <Route path="docs/:sectionId" element={<DocsPage />} />
                  <Route path="terms" element={<TermsOfService />} />
                </Route>

                <Route path="*" element={<ProtectedApp />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </TrackingWrapper>
      </AuthProvider>
      </CurrencyProvider>
      </CreditProvider>
      </ThemeProvider>
    </BrowserRouter>
    </>
  )
}

export default App
