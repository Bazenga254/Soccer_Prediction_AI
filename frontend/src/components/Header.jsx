import { Link, useLocation } from 'react-router-dom'

const COMPETITIONS = [
  // Top 5 Leagues
  { id: 'PL', name: 'Premier League', shortName: 'PL', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 'PD', name: 'La Liga', shortName: 'La Liga', flag: '🇪🇸' },
  { id: 'BL1', name: 'Bundesliga', shortName: 'Bundesliga', flag: '🇩🇪' },
  { id: 'SA', name: 'Serie A', shortName: 'Serie A', flag: '🇮🇹' },
  { id: 'FL1', name: 'Ligue 1', shortName: 'Ligue 1', flag: '🇫🇷' },
  // Other Leagues
  { id: 'ELC', name: 'Championship', shortName: 'EFL', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 'DED', name: 'Eredivisie', shortName: 'Eredivisie', flag: '🇳🇱' },
  { id: 'PPL', name: 'Primeira Liga', shortName: 'Liga Portugal', flag: '🇵🇹' },
  // Continental & International
  { id: 'CL', name: 'Champions League', shortName: 'UCL', flag: '🏆' },
  { id: 'CLI', name: 'Copa Libertadores', shortName: 'Libertadores', flag: '🌎' },
  { id: 'EC', name: 'Euro Championship', shortName: 'EURO', flag: '🇪🇺' },
  { id: 'WC', name: 'World Cup', shortName: 'World Cup', flag: '🌍' },
]

export default function Header() {
  const location = useLocation()

  // Extract current competition from URL or default to PL
  const getCurrentCompetition = () => {
    // Check for competition page: /competition/:id
    const compMatch = location.pathname.match(/^\/competition\/([^/]+)/)
    if (compMatch) return compMatch[1]

    // Check for match analysis page: /match/:competitionId/:homeId/:awayId
    const matchMatch = location.pathname.match(/^\/match\/([^/]+)\//)
    if (matchMatch) return matchMatch[1]

    // Default to Premier League
    return 'PL'
  }

  const currentCompetition = getCurrentCompetition()
  const isLivePage = location.pathname === '/live'
  const isMyPredictions = location.pathname === '/my-predictions'
  const isCommunity = location.pathname === '/community'

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="header-logo" style={{ textDecoration: 'none' }}>
          <span className="logo-icon">⚽</span>
          <div className="logo-text">
            <h1>Spark AI Prediction</h1>
            <span className="logo-subtitle">Smart Match Analysis & Predictions</span>
          </div>
        </Link>
      </div>

      <nav className="competition-nav">
        <Link
          to="/live"
          className={`competition-tab live-tab ${isLivePage ? 'active' : ''}`}
        >
          <span className="live-indicator"></span>
          <span className="comp-name">Live Scores</span>
        </Link>
        <Link
          to="/my-predictions"
          className={`competition-tab ${isMyPredictions ? 'active' : ''}`}
        >
          <span className="comp-flag">📊</span>
          <span className="comp-name">My Predictions</span>
        </Link>
        <Link
          to="/community"
          className={`competition-tab ${isCommunity ? 'active' : ''}`}
        >
          <span className="comp-flag">👥</span>
          <span className="comp-name">Community</span>
        </Link>
        {COMPETITIONS.map(comp => (
          <Link
            key={comp.id}
            to={comp.id === 'PL' ? '/' : `/competition/${comp.id}`}
            className={`competition-tab ${currentCompetition === comp.id ? 'active' : ''}`}
          >
            <span className="comp-flag">{comp.flag}</span>
            <span className="comp-name">{comp.shortName}</span>
          </Link>
        ))}
      </nav>
    </header>
  )
}
