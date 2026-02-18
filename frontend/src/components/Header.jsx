import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import NotificationDropdown from './NotificationDropdown'
import MessagesDropdown from './MessagesDropdown'
import EarningsDropdown from './EarningsDropdown'
import UserMenuDropdown from './UserMenuDropdown'
import SearchBar from './SearchBar'
import LanguageSelector from './LanguageSelector'
import sparkLogo from '../assets/spark-ai-logo.png'

const COMPETITIONS = [
  // Europe - Top 5
  { id: 'PL', name: 'Premier League', shortName: 'PL', flag: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}' },
  { id: 'PD', name: 'La Liga', shortName: 'La Liga', flag: '\u{1F1EA}\u{1F1F8}' },
  { id: 'BL1', name: 'Bundesliga', shortName: 'Bundesliga', flag: '\u{1F1E9}\u{1F1EA}' },
  { id: 'SA', name: 'Serie A', shortName: 'Serie A', flag: '\u{1F1EE}\u{1F1F9}' },
  { id: 'FL1', name: 'Ligue 1', shortName: 'Ligue 1', flag: '\u{1F1EB}\u{1F1F7}' },
  // Europe - Other
  { id: 'ELC', name: 'Championship', shortName: 'EFL', flag: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}' },
  { id: 'DED', name: 'Eredivisie', shortName: 'Eredivisie', flag: '\u{1F1F3}\u{1F1F1}' },
  { id: 'PPL', name: 'Primeira Liga', shortName: 'Liga Portugal', flag: '\u{1F1F5}\u{1F1F9}' },
  { id: 'SPL', name: 'Scottish Premiership', shortName: 'Scotland', flag: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}' },
  { id: 'BPL', name: 'Belgian Pro League', shortName: 'Belgium', flag: '\u{1F1E7}\u{1F1EA}' },
  { id: 'TSL', name: 'Turkish S\u00FCper Lig', shortName: 'Turkey', flag: '\u{1F1F9}\u{1F1F7}' },
  { id: 'SSL', name: 'Swiss Super League', shortName: 'Switzerland', flag: '\u{1F1E8}\u{1F1ED}' },
  { id: 'ABL', name: 'Austrian Bundesliga', shortName: 'Austria', flag: '\u{1F1E6}\u{1F1F9}' },
  { id: 'GSL', name: 'Greek Super League', shortName: 'Greece', flag: '\u{1F1EC}\u{1F1F7}' },
  { id: 'DSL', name: 'Danish Superliga', shortName: 'Denmark', flag: '\u{1F1E9}\u{1F1F0}' },
  { id: 'SWA', name: 'Swedish Allsvenskan', shortName: 'Sweden', flag: '\u{1F1F8}\u{1F1EA}' },
  { id: 'NOE', name: 'Norwegian Eliteserien', shortName: 'Norway', flag: '\u{1F1F3}\u{1F1F4}' },
  { id: 'CFL', name: 'Czech First League', shortName: 'Czechia', flag: '\u{1F1E8}\u{1F1FF}' },
  { id: 'EPL', name: 'Polish Ekstraklasa', shortName: 'Poland', flag: '\u{1F1F5}\u{1F1F1}' },
  { id: 'HNL', name: 'Croatian HNL', shortName: 'Croatia', flag: '\u{1F1ED}\u{1F1F7}' },
  { id: 'SRS', name: 'Serbian Super Liga', shortName: 'Serbia', flag: '\u{1F1F7}\u{1F1F8}' },
  { id: 'ROL', name: 'Romanian Liga I', shortName: 'Romania', flag: '\u{1F1F7}\u{1F1F4}' },
  { id: 'UPL', name: 'Ukrainian Premier League', shortName: 'Ukraine', flag: '\u{1F1FA}\u{1F1E6}' },
  { id: 'RPL', name: 'Russian Premier League', shortName: 'Russia', flag: '\u{1F1F7}\u{1F1FA}' },
  // South America
  { id: 'BSA', name: 'Brazilian S\u00E9rie A', shortName: 'Brazil', flag: '\u{1F1E7}\u{1F1F7}' },
  { id: 'ALP', name: 'Argentine Liga Profesional', shortName: 'Argentina', flag: '\u{1F1E6}\u{1F1F7}' },
  { id: 'COL', name: 'Colombian Primera A', shortName: 'Colombia', flag: '\u{1F1E8}\u{1F1F4}' },
  { id: 'CHL', name: 'Chilean Primera', shortName: 'Chile', flag: '\u{1F1E8}\u{1F1F1}' },
  { id: 'URU', name: 'Uruguayan Primera', shortName: 'Uruguay', flag: '\u{1F1FA}\u{1F1FE}' },
  { id: 'PAR', name: 'Paraguayan Division', shortName: 'Paraguay', flag: '\u{1F1F5}\u{1F1FE}' },
  { id: 'PER', name: 'Peruvian Liga 1', shortName: 'Peru', flag: '\u{1F1F5}\u{1F1EA}' },
  { id: 'ECU', name: 'Ecuadorian Serie A', shortName: 'Ecuador', flag: '\u{1F1EA}\u{1F1E8}' },
  // North / Central America
  { id: 'MLS', name: 'MLS', shortName: 'MLS', flag: '\u{1F1FA}\u{1F1F8}' },
  { id: 'LMX', name: 'Liga MX', shortName: 'Liga MX', flag: '\u{1F1F2}\u{1F1FD}' },
  // Africa
  { id: 'EGY', name: 'Egyptian Premier League', shortName: 'Egypt', flag: '\u{1F1EA}\u{1F1EC}' },
  { id: 'ZAF', name: 'South African PSL', shortName: 'South Africa', flag: '\u{1F1FF}\u{1F1E6}' },
  { id: 'MAR', name: 'Moroccan Botola Pro', shortName: 'Morocco', flag: '\u{1F1F2}\u{1F1E6}' },
  { id: 'ALG', name: 'Algerian Ligue 1', shortName: 'Algeria', flag: '\u{1F1E9}\u{1F1FF}' },
  { id: 'TUN', name: 'Tunisian Ligue 1', shortName: 'Tunisia', flag: '\u{1F1F9}\u{1F1F3}' },
  { id: 'NGA', name: 'Nigerian NPFL', shortName: 'Nigeria', flag: '\u{1F1F3}\u{1F1EC}' },
  { id: 'KEN', name: 'Kenyan Premier League', shortName: 'Kenya', flag: '\u{1F1F0}\u{1F1EA}' },
  { id: 'GHA', name: 'Ghanaian Premier League', shortName: 'Ghana', flag: '\u{1F1EC}\u{1F1ED}' },
  // Asia & Oceania
  { id: 'JPN', name: 'J-League', shortName: 'Japan', flag: '\u{1F1EF}\u{1F1F5}' },
  { id: 'KOR', name: 'K-League', shortName: 'S. Korea', flag: '\u{1F1F0}\u{1F1F7}' },
  { id: 'SAU', name: 'Saudi Pro League', shortName: 'Saudi', flag: '\u{1F1F8}\u{1F1E6}' },
  { id: 'CHN', name: 'Chinese Super League', shortName: 'China', flag: '\u{1F1E8}\u{1F1F3}' },
  { id: 'IND', name: 'Indian Super League', shortName: 'India', flag: '\u{1F1EE}\u{1F1F3}' },
  { id: 'AUS', name: 'A-League', shortName: 'Australia', flag: '\u{1F1E6}\u{1F1FA}' },
  { id: 'THA', name: 'Thai League 1', shortName: 'Thailand', flag: '\u{1F1F9}\u{1F1ED}' },
  { id: 'UAE', name: 'UAE Pro League', shortName: 'UAE', flag: '\u{1F1E6}\u{1F1EA}' },
  // Continental & International
  { id: 'CL', name: 'Champions League', shortName: 'UCL', flag: '\u{1F3C6}' },
  { id: 'EL', name: 'Europa League', shortName: 'UEL', flag: '\u{1F3C5}' },
  { id: 'ECL', name: 'Conference League', shortName: 'UECL', flag: '\u26BD' },
  { id: 'CLI', name: 'Copa Libertadores', shortName: 'Libertadores', flag: '\u{1F30E}' },
  { id: 'CAF', name: 'CAF Champions League', shortName: 'CAF CL', flag: '\u{1F30D}' },
  { id: 'AFC', name: 'AFC Champions League', shortName: 'AFC CL', flag: '\u{1F30F}' },
  { id: 'EC', name: 'Euro Championship', shortName: 'EURO', flag: '\u{1F1EA}\u{1F1FA}' },
  { id: 'WC', name: 'World Cup', shortName: 'World Cup', flag: '\u{1F30D}' },
  { id: 'CA', name: 'Copa America', shortName: 'Copa Am\u00E9rica', flag: '\u{1F30E}' },
  { id: 'ACN', name: 'Africa Cup of Nations', shortName: 'AFCON', flag: '\u{1F30D}' },
]

export { COMPETITIONS }

export default function Header({ user, logout }) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [activeUsers, setActiveUsers] = useState(0)
  const [tickerPaused, setTickerPaused] = useState(false)
  const [leagueSearchOpen, setLeagueSearchOpen] = useState(false)
  const [leagueQuery, setLeagueQuery] = useState('')
  const leagueSearchRef = useRef(null)
  const leagueInputRef = useRef(null)

  // Group competitions by region for the search dropdown
  const REGIONS = [
    { label: t('nav.topLeagues'), ids: ['PL', 'PD', 'BL1', 'SA', 'FL1'] },
    { label: t('nav.europe'), ids: ['ELC', 'DED', 'PPL', 'SPL', 'BPL', 'TSL', 'SSL', 'ABL', 'GSL', 'DSL', 'SWA', 'NOE', 'CFL', 'EPL', 'HNL', 'SRS', 'ROL', 'UPL', 'RPL'] },
    { label: t('nav.southAmerica'), ids: ['BSA', 'ALP', 'COL', 'CHL', 'URU', 'PAR', 'PER', 'ECU'] },
    { label: t('nav.northAmerica'), ids: ['MLS', 'LMX'] },
    { label: t('nav.africa'), ids: ['EGY', 'ZAF', 'MAR', 'ALG', 'TUN', 'NGA', 'KEN', 'GHA'] },
    { label: t('nav.asiaOceania'), ids: ['JPN', 'KOR', 'SAU', 'CHN', 'IND', 'AUS', 'THA', 'UAE'] },
    { label: t('nav.continental'), ids: ['CL', 'EL', 'ECL', 'CLI', 'CAF', 'AFC', 'EC', 'WC', 'CA', 'ACN'] },
  ]

  const compMap = Object.fromEntries(COMPETITIONS.map(c => [c.id, c]))

  const filteredRegions = leagueQuery.trim()
    ? [{
        label: t('nav.searchResults'),
        ids: COMPETITIONS
          .filter(c =>
            c.name.toLowerCase().includes(leagueQuery.toLowerCase()) ||
            c.shortName.toLowerCase().includes(leagueQuery.toLowerCase()) ||
            c.id.toLowerCase().includes(leagueQuery.toLowerCase())
          )
          .map(c => c.id)
      }]
    : REGIONS

  useEffect(() => {
    if (leagueSearchOpen && leagueInputRef.current) {
      leagueInputRef.current.focus()
    }
  }, [leagueSearchOpen])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (leagueSearchRef.current && !leagueSearchRef.current.contains(e.target)) {
        setLeagueSearchOpen(false)
        setLeagueQuery('')
      }
    }
    if (leagueSearchOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [leagueSearchOpen])

  const handleLeagueSelect = (compId) => {
    setLeagueSearchOpen(false)
    setLeagueQuery('')
    navigate(compId === 'PL' ? '/' : `/competition/${compId}`)
  }

  useEffect(() => {
    const fetchCount = () => {
      axios.get('/api/active-users-count').then(res => {
        setActiveUsers(res.data.active_users || 0)
      }).catch(() => {})
    }
    fetchCount()
    const interval = setInterval(fetchCount, 1000)
    return () => clearInterval(interval)
  }, [])

  const getCurrentCompetition = () => {
    const compMatch = location.pathname.match(/^\/competition\/([^/]+)/)
    if (compMatch) return compMatch[1]
    const matchMatch = location.pathname.match(/^\/match\/([^/]+)\//)
    if (matchMatch) return matchMatch[1]
    if (location.pathname === '/') return 'PL'
    return null
  }

  const currentCompetition = getCurrentCompetition()
  const isLivePage = location.pathname === '/live'
  const isPredictions = location.pathname === '/predictions'
  const isJackpot = location.pathname === '/jackpot'
  const isMyAnalysis = location.pathname === '/my-analysis'

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="header-logo" style={{ textDecoration: 'none' }}>
          <img src={sparkLogo} alt="Spark AI" className="logo-icon-img" />
          <div className="logo-text">
            <h1>Spark AI Prediction</h1>
            <span className="logo-subtitle">Smart Match Analysis & Predictions</span>
          </div>
        </Link>

        {activeUsers > 0 && (
          <div className="active-users-badge">
            <span className="active-users-dot"></span>
            <span className="active-users-count">{activeUsers.toLocaleString()} online</span>
          </div>
        )}

        {user && (
          <div className="header-user-controls">
            <SearchBar />
            <EarningsDropdown />
            <NotificationDropdown />
            <MessagesDropdown />
            <LanguageSelector />
            <UserMenuDropdown user={user} logout={logout} />
          </div>
        )}
      </div>

      {/* Main navigation - static items */}
      <nav className="competition-nav">
        <Link
          to="/live"
          className={`competition-tab live-tab ${isLivePage ? 'active' : ''}`}
        >
          <span className="live-indicator"></span>
          <span className="comp-name">{t('nav.liveScores')}</span>
        </Link>
        <Link
          to="/predictions"
          className={`competition-tab ${isPredictions ? 'active' : ''}`}
        >
          <span className="comp-flag">{'\u{1F465}'}</span>
          <span className="comp-name">{t('nav.predictions')}</span>
        </Link>
        <Link
          to="/jackpot"
          className={`competition-tab jackpot-tab ${isJackpot ? 'active' : ''}`}
        >
          <span className="comp-flag">{'\u{1F3AF}'}</span>
          <span className="comp-name">{t('nav.jackpot')}</span>
        </Link>
        <Link
          to="/my-analysis"
          className={`competition-tab ${isMyAnalysis ? 'active' : ''}`}
        >
          <span className="comp-flag">{'\u{1F4CA}'}</span>
          <span className="comp-name">{t('nav.myAnalysis')}</span>
        </Link>
      </nav>

      {/* League ticker - scrolling marquee with search */}
      <div className="league-ticker-wrapper">
        <div
          className="league-ticker"
          onMouseEnter={() => setTickerPaused(true)}
          onMouseLeave={() => setTickerPaused(false)}
        >
          <div
            className="league-ticker-track"
            style={{ animationPlayState: tickerPaused ? 'paused' : 'running' }}
          >
            {[...COMPETITIONS, ...COMPETITIONS].map((comp, i) => (
              <Link
                key={`${comp.id}-${i}`}
                to={comp.id === 'PL' ? '/' : `/competition/${comp.id}`}
                className={`league-ticker-item ${currentCompetition === comp.id ? 'active' : ''}`}
              >
                <span className="ticker-flag">{comp.flag}</span>
                <span className="ticker-name">{comp.shortName}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* League search button + dropdown */}
        <div className="league-search-container" ref={leagueSearchRef}>
          <button
            className={`league-search-btn ${leagueSearchOpen ? 'active' : ''}`}
            onClick={() => { setLeagueSearchOpen(!leagueSearchOpen); setLeagueQuery('') }}
            title="Search leagues"
          >
            {leagueSearchOpen ? '\u2715' : '\u{1F50D}'}
          </button>

          {leagueSearchOpen && (
            <div className="league-search-dropdown">
              <div className="league-search-input-wrap">
                <input
                  ref={leagueInputRef}
                  type="text"
                  className="league-search-input"
                  placeholder={t('nav.searchLeagues')}
                  value={leagueQuery}
                  onChange={e => setLeagueQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setLeagueSearchOpen(false); setLeagueQuery('') }
                  }}
                />
              </div>
              <div className="league-search-results">
                {filteredRegions.map(region => {
                  const leagues = region.ids.map(id => compMap[id]).filter(Boolean)
                  if (leagues.length === 0) return null
                  return (
                    <div key={region.label} className="league-search-region">
                      <div className="league-search-region-label">{region.label}</div>
                      {leagues.map(comp => (
                        <button
                          key={comp.id}
                          className={`league-search-item ${currentCompetition === comp.id ? 'active' : ''}`}
                          onClick={() => handleLeagueSelect(comp.id)}
                        >
                          <span className="league-search-flag">{comp.flag}</span>
                          <span className="league-search-name">{comp.name}</span>
                          <span className="league-search-code">{comp.id}</span>
                        </button>
                      ))}
                    </div>
                  )
                })}
                {leagueQuery && filteredRegions[0]?.ids.length === 0 && (
                  <div className="league-search-empty">{t('nav.noLeaguesFound')}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
