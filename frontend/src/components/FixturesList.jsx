import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import axios from 'axios'

const COMPETITION_NAMES = {
  // Top 5 European Leagues
  'PL': 'Premier League',
  'PD': 'La Liga',
  'BL1': 'Bundesliga',
  'SA': 'Serie A',
  'FL1': 'Ligue 1',
  // Other European Leagues
  'ELC': 'Championship',
  'DED': 'Eredivisie',
  'PPL': 'Primeira Liga',
  'SPL': 'Scottish Premiership',
  'BPL': 'Belgian Pro League',
  'TSL': 'Turkish Super Lig',
  'SSL': 'Swiss Super League',
  'ABL': 'Austrian Bundesliga',
  'GSL': 'Greek Super League',
  'DSL': 'Danish Superliga',
  'SWA': 'Swedish Allsvenskan',
  'NOE': 'Norwegian Eliteserien',
  'CFL': 'Czech First League',
  'EPL': 'Polish Ekstraklasa',
  'HNL': 'Croatian HNL',
  'SRS': 'Serbian Super Liga',
  'ROL': 'Romanian Liga I',
  'UPL': 'Ukrainian Premier League',
  'RPL': 'Russian Premier League',
  // South America
  'BSA': 'Brazilian Serie A',
  'ALP': 'Argentine Liga Profesional',
  'COL': 'Colombian Primera A',
  'CHL': 'Chilean Primera Division',
  'URU': 'Uruguayan Primera Division',
  'PAR': 'Paraguayan Division',
  'PER': 'Peruvian Liga 1',
  'ECU': 'Ecuadorian Serie A',
  // North/Central America
  'MLS': 'MLS',
  'LMX': 'Liga MX',
  // Africa
  'EGY': 'Egyptian Premier League',
  'ZAF': 'South African Premier League',
  'MAR': 'Moroccan Botola Pro',
  'ALG': 'Algerian Ligue 1',
  'TUN': 'Tunisian Ligue 1',
  'NGA': 'Nigerian NPFL',
  'KEN': 'Kenyan Premier League',
  'GHA': 'Ghanaian Premier League',
  // Asia & Oceania
  'JPN': 'J-League',
  'KOR': 'K-League',
  'SAU': 'Saudi Pro League',
  'CHN': 'Chinese Super League',
  'IND': 'Indian Super League',
  'AUS': 'A-League',
  'THA': 'Thai League 1',
  'UAE': 'UAE Pro League',
  // Continental Competitions
  'CL': 'Champions League',
  'EL': 'Europa League',
  'ECL': 'Conference League',
  'CLI': 'Copa Libertadores',
  'CAF': 'CAF Champions League',
  'AFC': 'AFC Champions League',
  // International
  'EC': 'Euro Championship',
  'WC': 'World Cup',
  'CA': 'Copa America',
  'ACN': 'Africa Cup of Nations',
}

function formatDate(dateStr) {
  const date = new Date(dateStr)
  const options = { weekday: 'short', month: 'short', day: 'numeric' }
  return date.toLocaleDateString('en-GB', options)
}

function formatTime(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function groupByDate(fixtures) {
  const groups = {}
  fixtures.forEach(fixture => {
    const date = fixture.date.split('T')[0]
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(fixture)
  })
  return groups
}

function FixtureCard({ fixture, onAnalyze }) {
  return (
    <div className="fixture-card clickable" onClick={onAnalyze}>
      <div className="fixture-card-header">
        <div className="fixture-time">{formatTime(fixture.date)}</div>

        <div className="fixture-teams-row">
          <div className="fixture-team home">
            {fixture.home_team.crest && (
              <img src={fixture.home_team.crest} alt="" className="team-crest" />
            )}
            <span className="team-name">{fixture.home_team.name}</span>
          </div>

          <div className="fixture-vs">vs</div>

          <div className="fixture-team away">
            <span className="team-name">{fixture.away_team.name}</span>
            {fixture.away_team.crest && (
              <img src={fixture.away_team.crest} alt="" className="team-crest" />
            )}
          </div>
        </div>

        <div className="fixture-analyze-btn">
          <span>View Analysis</span>
          <span className="arrow">&rarr;</span>
        </div>
      </div>
    </div>
  )
}

export default function FixturesList({ competition: propCompetition }) {
  const { t } = useTranslation()
  const { competitionId } = useParams()
  const competition = competitionId || propCompetition || 'PL'
  const competitionName = COMPETITION_NAMES[competition] || 'Unknown League'

  const [fixtures, setFixtures] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isHistorical, setIsHistorical] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    setError(null)

    axios.get(`/api/fixtures?days=14&competition=${competition}`)
      .then(res => {
        setFixtures(res.data.fixtures || [])
        setIsHistorical(res.data.is_historical || false)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load fixtures. Make sure the backend is running on port 8000.')
        setLoading(false)
      })
  }, [competition])

  const handleAnalyze = (fixture) => {
    navigate(`/match/${competition}/${fixture.home_team.id}/${fixture.away_team.id}`, {
      state: { fixture, competition }
    })
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>{t('common.loading')}</p>
      </div>
    )
  }

  if (error) {
    return <div className="error-banner">{error}</div>
  }

  const groupedFixtures = groupByDate(fixtures)
  const dates = Object.keys(groupedFixtures).sort()

  return (
    <div className="fixtures-container">
      <div className="fixtures-header">
        <h2>{isHistorical ? 'Recent' : t('fixtures.upcoming')} {competitionName} Fixtures</h2>
        <p className="fixtures-subtitle">
          Click on a match to see H2H analysis and predictions
        </p>
        {isHistorical && (
          <div className="historical-notice">
            ⚠️ Showing recent matches from 2024-25 season (free API tier limitation)
          </div>
        )}
      </div>

      {fixtures.length === 0 ? (
        <div className="no-fixtures">
          <div className="no-fixtures-icon">📅</div>
          <h3>{t('fixtures.noFixtures')}</h3>
          <p>There are no scheduled matches in the next 14 days.</p>
          <div className="no-fixtures-reasons">
            <p className="hint">Possible reasons:</p>
            <ul>
              <li>The league is currently in off-season</li>
              <li>International break or cup competitions</li>
              <li>The tournament hasn't started yet</li>
            </ul>
          </div>
          <p className="hint">Try selecting another competition from the navigation bar above.</p>
        </div>
      ) : (
        <div className="fixtures-list">
          {dates.map(date => (
            <div key={date} className="fixture-day">
              <div className="fixture-date-header">
                <span className="date-label">{formatDate(date + 'T00:00:00')}</span>
                <span className="match-count">{groupedFixtures[date].length} matches</span>
              </div>

              <div className="fixture-day-matches">
                {groupedFixtures[date].map(fixture => (
                  <FixtureCard
                    key={fixture.id}
                    fixture={fixture}
                    onAnalyze={() => handleAnalyze(fixture)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
