import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import JackpotAnalyzer from './pages/JackpotAnalyzer'
import MyAnalysis from './pages/MyAnalysis'
import ReferralLanding from './pages/ReferralLanding'
import ResetPassword from './pages/ResetPassword'
import BetSlip from './components/BetSlip'
import SupportChat from './components/SupportChat'
import AccountSetup from './components/AccountSetup'
import { BetSlipProvider } from './context/BetSlipContext'
import { AuthProvider, useAuth } from './context/AuthContext'
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

  return (
    <BetSlipProvider>
      <div className="app">
        <Header user={user} logout={logout} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<FixturesList competition="PL" />} />
            <Route path="/competition/:competitionId" element={<FixturesList />} />
            <Route path="/match/:competitionId/:homeId/:awayId" element={<MatchAnalysis />} />
            <Route path="/live" element={<LiveScores />} />
            <Route path="/my-predictions" element={<TrackRecord />} />
            <Route path="/predictions" element={<Community />} />
            <Route path="/jackpot" element={<JackpotAnalyzer />} />
            <Route path="/my-analysis" element={<MyAnalysis />} />
            <Route path="/upgrade" element={<Upgrade />} />
            <Route path="/creator" element={<CreatorDashboard />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </main>
        <BetSlip />
        <SupportChat />
      </div>
    </BetSlipProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/admin" element={<Admin />} />
          <Route path="/employee" element={<Employee />} />
          <Route path="/invite/:token" element={<InviteRegistration />} />
          <Route path="/ref/:username" element={<ReferralLanding />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/login" element={<AccessGate />} />
          <Route path="*" element={<ProtectedApp />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
