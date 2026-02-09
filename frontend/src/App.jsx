import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Header from './components/Header'
import FixturesList from './components/FixturesList'
import MatchAnalysis from './pages/MatchAnalysis'
import LiveScores from './pages/LiveScores'
import TrackRecord from './pages/TrackRecord'
import AccessGate from './pages/AccessGate'
import Admin from './pages/Admin'
import Profile from './pages/Profile'
import Community from './pages/Community'
import Upgrade from './pages/Upgrade'
import CreatorDashboard from './pages/CreatorDashboard'
import BetSlip from './components/BetSlip'
import NotificationDropdown from './components/NotificationDropdown'
import EarningsDropdown from './components/EarningsDropdown'
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
    return <AccessGate />
  }

  return (
    <BetSlipProvider>
      <div className="app">
        <Header />
        {user && (
          <div className="access-bar">
            <span className="user-bar-info">
              <span className="user-avatar-small" style={{ background: user.avatar_color }}>
                {(user.display_name || user.username || '?')[0].toUpperCase()}
              </span>
              <strong>{user.display_name || user.username}</strong>
              <span className={`tier-badge ${user.tier}`}>{user.tier === 'pro' ? 'PRO' : 'FREE'}</span>
            </span>
            <span className="user-bar-actions">
              <EarningsDropdown />
              <NotificationDropdown />
              <Link to="/creator" className="creator-link-btn">Creator</Link>
              {user.tier !== 'pro' && <Link to="/upgrade" className="upgrade-link-btn">Upgrade</Link>}
              <Link to="/profile" className="profile-link-btn">Profile</Link>
              <button className="logout-btn" onClick={logout}>Logout</button>
            </span>
          </div>
        )}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<FixturesList competition="PL" />} />
            <Route path="/competition/:competitionId" element={<FixturesList />} />
            <Route path="/match/:competitionId/:homeId/:awayId" element={<MatchAnalysis />} />
            <Route path="/live" element={<LiveScores />} />
            <Route path="/my-predictions" element={<TrackRecord />} />
            <Route path="/community" element={<Community />} />
            <Route path="/upgrade" element={<Upgrade />} />
            <Route path="/creator" element={<CreatorDashboard />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </main>
        <BetSlip />
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
          <Route path="*" element={<ProtectedApp />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
