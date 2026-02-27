import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import PlayerImpact from '../components/PlayerImpact'
import LiveChatPopup from '../components/LiveChatPopup'
import { useBetSlip } from '../context/BetSlipContext'
import { useAuth } from '../context/AuthContext'

function formatDateTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatOverUnderLabel(key) {
  const match = key.match(/over_(\d)(\d)/)
  if (match) {
    return `Over ${match[1]}.${match[2]}`
  }
  return key
}

function formatCardLabel(key) {
  const match = key.match(/over_(\d)(\d)_cards/)
  if (match) {
    return `Over ${match[1]}.${match[2]} Cards`
  }
  return key
}

function round1(val) {
  return Math.round(val * 10) / 10
}

const COMPETITION_NAMES = {
  'PL': 'Premier League',
  'ELC': 'Championship',
  'PD': 'La Liga',
  'BL1': 'Bundesliga',
  'SA': 'Serie A',
  'FL1': 'Ligue 1',
  'DED': 'Eredivisie',
  'PPL': 'Primeira Liga',
  'CL': 'Champions League',
  'CLI': 'Copa Libertadores',
  'EC': 'Euro Championship',
  'WC': 'World Cup',
}

// Part 1: Home Team H2H Analysis (vs All Opponents at Home)
function HomeFormSection({ homeForm, teamName }) {
  if (!homeForm) return null

  return (
    <div className="analysis-section form-section home-form">
      <h3 className="section-title">H2H Part 1: {teamName} - Home Record</h3>
      <p className="section-subtitle">Performance against all opponents when playing at home</p>

      <div className="form-stats-grid">
        <div className="form-stat win">
          <div className="form-stat-value">{homeForm.wins}</div>
          <div className="form-stat-label">Wins</div>
          <div className="form-stat-pct">{homeForm.win_percentage}%</div>
        </div>
        <div className="form-stat draw">
          <div className="form-stat-value">{homeForm.draws}</div>
          <div className="form-stat-label">Draws</div>
          <div className="form-stat-pct">{homeForm.draw_percentage}%</div>
        </div>
        <div className="form-stat loss">
          <div className="form-stat-value">{homeForm.losses}</div>
          <div className="form-stat-label">Losses</div>
          <div className="form-stat-pct">{homeForm.loss_percentage}%</div>
        </div>
      </div>

      <div className="form-goals-row">
        <div className="form-goal-stat">
          <span className="goal-label">Goals Scored (Home)</span>
          <span className="goal-value">{homeForm.avg_goals_scored} per game</span>
        </div>
        <div className="form-goal-stat">
          <span className="goal-label">Goals Conceded (Home)</span>
          <span className="goal-value">{homeForm.avg_goals_conceded} per game</span>
        </div>
      </div>

      <div className={`form-strength strength-${homeForm.strength}`}>
        <div className="strength-badge">{homeForm.strength.toUpperCase()}</div>
        <div className="strength-note">{homeForm.strength_note}</div>
      </div>

      <div className="form-notes">
        {homeForm.notes && homeForm.notes.map((note, idx) => (
          <div key={idx} className="form-note">
            <span className="note-icon">→</span>
            <span className="note-text">{note}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Part 2: Away Team H2H Analysis (vs All Opponents Away)
function AwayFormSection({ awayForm, teamName }) {
  if (!awayForm) return null

  return (
    <div className="analysis-section form-section away-form">
      <h3 className="section-title">H2H Part 2: {teamName} - Away Record</h3>
      <p className="section-subtitle">Performance against all opponents when playing away</p>

      <div className="form-stats-grid">
        <div className="form-stat win">
          <div className="form-stat-value">{awayForm.wins}</div>
          <div className="form-stat-label">Wins</div>
          <div className="form-stat-pct">{awayForm.win_percentage}%</div>
        </div>
        <div className="form-stat draw">
          <div className="form-stat-value">{awayForm.draws}</div>
          <div className="form-stat-label">Draws</div>
          <div className="form-stat-pct">{awayForm.draw_percentage}%</div>
        </div>
        <div className="form-stat loss">
          <div className="form-stat-value">{awayForm.losses}</div>
          <div className="form-stat-label">Losses</div>
          <div className="form-stat-pct">{awayForm.loss_percentage}%</div>
        </div>
      </div>

      <div className="form-goals-row">
        <div className="form-goal-stat">
          <span className="goal-label">Goals Scored (Away)</span>
          <span className="goal-value">{awayForm.avg_goals_scored} per game</span>
        </div>
        <div className="form-goal-stat">
          <span className="goal-label">Goals Conceded (Away)</span>
          <span className="goal-value">{awayForm.avg_goals_conceded} per game</span>
        </div>
      </div>

      <div className={`form-strength strength-${awayForm.strength}`}>
        <div className="strength-badge">{awayForm.strength.toUpperCase()}</div>
        <div className="strength-note">{awayForm.strength_note}</div>
      </div>

      <div className="form-notes">
        {awayForm.notes && awayForm.notes.map((note, idx) => (
          <div key={idx} className="form-note">
            <span className="note-icon">→</span>
            <span className="note-text">{note}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Part 3: Direct H2H Analysis
function H2HSection({ h2hData, teamAName, teamBName }) {
  const { t } = useTranslation()
  if (!h2hData || h2hData.total_matches === 0) {
    return (
      <div className="analysis-section">
        <h3 className="section-title">{t('match.headToHead')}</h3>
        <div className="no-data-message">
          No head-to-head history between these teams
        </div>
      </div>
    )
  }

  const { goals_analysis, result_analysis, matches, total_matches } = h2hData

  return (
    <div className="analysis-section h2h-section">
      <h3 className="section-title">H2H Part 3: {teamAName} vs {teamBName} - Direct Meetings</h3>
      <p className="section-subtitle">Analysis based on the last {total_matches} matches between these teams</p>

      {/* 1X2 Result Analysis */}
      <div className="h2h-subsection">
        <h4>Match Result (1X2)</h4>
        <div className="h2h-1x2-grid">
          <div className={`result-card ${result_analysis['1x2'].prediction === '1' ? 'recommended' : ''}`}>
            <div className="result-label">1 ({teamAName})</div>
            <div className="result-value">{result_analysis['1x2'].team_a_wins.percentage}%</div>
            <div className="result-count">{result_analysis['1x2'].team_a_wins.count} wins</div>
          </div>
          <div className={`result-card ${result_analysis['1x2'].prediction === 'X' ? 'recommended' : ''}`}>
            <div className="result-label">X (Draw)</div>
            <div className="result-value">{result_analysis['1x2'].draws.percentage}%</div>
            <div className="result-count">{result_analysis['1x2'].draws.count} draws</div>
          </div>
          <div className={`result-card ${result_analysis['1x2'].prediction === '2' ? 'recommended' : ''}`}>
            <div className="result-label">2 ({teamBName})</div>
            <div className="result-value">{result_analysis['1x2'].team_b_wins.percentage}%</div>
            <div className="result-count">{result_analysis['1x2'].team_b_wins.count} wins</div>
          </div>
        </div>
      </div>

      {/* Double Chance */}
      <div className="h2h-subsection">
        <h4>Double Chance</h4>
        <div className="double-chance-grid">
          <div className={`dc-option ${result_analysis.double_chance['1X'].percentage >= 70 ? 'strong' : ''}`}>
            <span className="dc-label">1X</span>
            <div className="dc-bar">
              <div className="dc-fill" style={{ width: `${result_analysis.double_chance['1X'].percentage}%` }}></div>
            </div>
            <span className="dc-value">{result_analysis.double_chance['1X'].percentage}%</span>
          </div>
          <div className={`dc-option ${result_analysis.double_chance['X2'].percentage >= 70 ? 'strong' : ''}`}>
            <span className="dc-label">X2</span>
            <div className="dc-bar">
              <div className="dc-fill" style={{ width: `${result_analysis.double_chance['X2'].percentage}%` }}></div>
            </div>
            <span className="dc-value">{result_analysis.double_chance['X2'].percentage}%</span>
          </div>
          <div className={`dc-option ${result_analysis.double_chance['12'].percentage >= 70 ? 'strong' : ''}`}>
            <span className="dc-label">12</span>
            <div className="dc-bar">
              <div className="dc-fill" style={{ width: `${result_analysis.double_chance['12'].percentage}%` }}></div>
            </div>
            <span className="dc-value">{result_analysis.double_chance['12'].percentage}%</span>
          </div>
        </div>
      </div>

      {/* Goals Analysis */}
      <div className="h2h-subsection">
        <h4>Goals Analysis</h4>
        <div className="goals-stats-row">
          <div className="goals-stat">
            <span className="stat-label">Avg Goals/Match</span>
            <span className="stat-value">{goals_analysis.avg_total_goals}</span>
          </div>
          <div className="goals-stat">
            <span className="stat-label">{teamAName} Avg</span>
            <span className="stat-value">{goals_analysis.avg_team_a_goals}</span>
          </div>
          <div className="goals-stat">
            <span className="stat-label">{teamBName} Avg</span>
            <span className="stat-value">{goals_analysis.avg_team_b_goals}</span>
          </div>
        </div>

        <h5>Over/Under Predictions</h5>
        <div className="ou-grid">
          {Object.entries(goals_analysis.over_under).map(([key, data]) => (
            <div key={key} className={`ou-item ${data.prediction === 'Yes' ? 'likely' : 'unlikely'}`}>
              <span className="ou-label">{formatOverUnderLabel(key)}</span>
              <span className="ou-pct">{data.percentage}%</span>
              <span className={`ou-prediction ${data.prediction === 'Yes' ? 'yes' : 'no'}`}>
                {data.prediction}
              </span>
            </div>
          ))}
        </div>

        <div className="btts-section">
          <div className="btts-label">Both Teams to Score (BTTS)</div>
          <div className="btts-options">
            <span className={`btts-option ${goals_analysis.btts.prediction === 'Yes' ? 'selected' : ''}`}>
              Yes: {goals_analysis.btts.yes.percentage}%
            </span>
            <span className={`btts-option ${goals_analysis.btts.prediction === 'No' ? 'selected' : ''}`}>
              No: {goals_analysis.btts.no.percentage}%
            </span>
          </div>
        </div>
      </div>

      {/* Recent Matches */}
      <div className="h2h-subsection">
        <h4>Recent Meetings</h4>
        <div className="h2h-matches-table">
          {matches.slice(0, 5).map((match, idx) => (
            <div key={idx} className="h2h-match-row">
              <span className="match-date">{match.date}</span>
              <span className="match-home">{match.home_team}</span>
              <span className="match-score">
                {match.home_score} - {match.away_score}
              </span>
              <span className="match-away">{match.away_team}</span>
              <span className={`match-result result-${match.team_a_result}`}>
                {match.team_a_result}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Collapsible H2H Section (combines Home Form, Away Form, Direct H2H)
function CollapsibleH2H({ h2hData, teamAName, teamBName, homeId, awayId }) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState('direct') // 'direct', 'home', 'away'

  if (!h2hData) return null

  const totalMatches = h2hData.total_matches || 0

  return (
    <div className="h2h-collapsible">
      <div className="h2h-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="h2h-header-left">
          <h3>{t('match.headToHead')}</h3>
          <span className="h2h-badge">{totalMatches} matches</span>
        </div>
        <span className={`h2h-toggle ${isExpanded ? 'expanded' : ''}`}>▼</span>
      </div>

      {isExpanded && (
        <div className="h2h-content">
          <div className="h2h-tabs">
            <button
              className={`h2h-tab ${activeTab === 'direct' ? 'active' : ''}`}
              onClick={() => setActiveTab('direct')}
            >
              Direct H2H
            </button>
            <button
              className={`h2h-tab ${activeTab === 'home' ? 'active' : ''}`}
              onClick={() => setActiveTab('home')}
            >
              {teamAName} Matches
            </button>
            <button
              className={`h2h-tab ${activeTab === 'away' ? 'active' : ''}`}
              onClick={() => setActiveTab('away')}
            >
              {teamBName} Matches
            </button>
          </div>

          <div className="h2h-tab-content">
            {activeTab === 'direct' && (
              <DirectH2HContent h2hData={h2hData} teamAName={teamAName} teamBName={teamBName} homeId={homeId} awayId={awayId} />
            )}
            {activeTab === 'home' && (
              <TeamMatchesContent form={h2hData.home_form} teamName={teamAName} isHome={true} />
            )}
            {activeTab === 'away' && (
              <TeamMatchesContent form={h2hData.away_form} teamName={teamBName} isHome={false} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Direct H2H Content (with selectable probabilities)
function DirectH2HContent({ h2hData, teamAName, teamBName, homeId, awayId }) {
  const { addBet, isBetSelected } = useBetSlip()
  const matchId = `${homeId}-${awayId}`
  const matchName = `${teamAName} vs ${teamBName}`

  if (!h2hData || h2hData.total_matches === 0) {
    return (
      <div className="no-data-message">
        No head-to-head history between these teams
      </div>
    )
  }

  const { goals_analysis, result_analysis, matches, total_matches } = h2hData

  const handleSelectBet = (category, outcome, probability) => {
    addBet({
      matchId,
      matchName,
      category,
      outcome,
      probability: parseFloat(probability)
    })
  }

  const isSelected = (category, outcome) => isBetSelected(matchId, category, outcome)

  return (
    <>
      {/* 1X2 Result Analysis */}
      <div className="h2h-subsection">
        <h4>Match Result (1X2) - Click to add to My Predictions</h4>
        <div className="h2h-1x2-grid">
          <div
            className={`result-card selectable-probability ${result_analysis['1x2'].prediction === '1' ? 'recommended' : ''} ${isSelected('1X2', `${teamAName} Win`) ? 'selected' : ''}`}
            onClick={() => handleSelectBet('1X2', `${teamAName} Win`, result_analysis['1x2'].team_a_wins.percentage)}
          >
            <div className="result-label">1 ({teamAName})</div>
            <div className="result-value">{result_analysis['1x2'].team_a_wins.percentage}%</div>
            <div className="result-count">{result_analysis['1x2'].team_a_wins.count} wins</div>
            <div className="selection-indicator">{isSelected('1X2', `${teamAName} Win`) ? '✓' : '+'}</div>
          </div>
          <div
            className={`result-card selectable-probability ${result_analysis['1x2'].prediction === 'X' ? 'recommended' : ''} ${isSelected('1X2', 'Draw') ? 'selected' : ''}`}
            onClick={() => handleSelectBet('1X2', 'Draw', result_analysis['1x2'].draws.percentage)}
          >
            <div className="result-label">X (Draw)</div>
            <div className="result-value">{result_analysis['1x2'].draws.percentage}%</div>
            <div className="result-count">{result_analysis['1x2'].draws.count} draws</div>
            <div className="selection-indicator">{isSelected('1X2', 'Draw') ? '✓' : '+'}</div>
          </div>
          <div
            className={`result-card selectable-probability ${result_analysis['1x2'].prediction === '2' ? 'recommended' : ''} ${isSelected('1X2', `${teamBName} Win`) ? 'selected' : ''}`}
            onClick={() => handleSelectBet('1X2', `${teamBName} Win`, result_analysis['1x2'].team_b_wins.percentage)}
          >
            <div className="result-label">2 ({teamBName})</div>
            <div className="result-value">{result_analysis['1x2'].team_b_wins.percentage}%</div>
            <div className="result-count">{result_analysis['1x2'].team_b_wins.count} wins</div>
            <div className="selection-indicator">{isSelected('1X2', `${teamBName} Win`) ? '✓' : '+'}</div>
          </div>
        </div>
      </div>

      {/* Double Chance */}
      <div className="h2h-subsection">
        <h4>Double Chance</h4>
        <div className="double-chance-grid">
          <div
            className={`dc-option selectable-probability ${result_analysis.double_chance['1X'].percentage >= 70 ? 'strong' : ''} ${isSelected('Double Chance', '1X') ? 'selected' : ''}`}
            onClick={() => handleSelectBet('Double Chance', '1X', result_analysis.double_chance['1X'].percentage)}
          >
            <span className="dc-label">1X</span>
            <div className="dc-bar">
              <div className="dc-fill" style={{ width: `${result_analysis.double_chance['1X'].percentage}%` }}></div>
            </div>
            <span className="dc-value">{result_analysis.double_chance['1X'].percentage}%</span>
            <div className="selection-indicator">{isSelected('Double Chance', '1X') ? '✓' : '+'}</div>
          </div>
          <div
            className={`dc-option selectable-probability ${result_analysis.double_chance['X2'].percentage >= 70 ? 'strong' : ''} ${isSelected('Double Chance', 'X2') ? 'selected' : ''}`}
            onClick={() => handleSelectBet('Double Chance', 'X2', result_analysis.double_chance['X2'].percentage)}
          >
            <span className="dc-label">X2</span>
            <div className="dc-bar">
              <div className="dc-fill" style={{ width: `${result_analysis.double_chance['X2'].percentage}%` }}></div>
            </div>
            <span className="dc-value">{result_analysis.double_chance['X2'].percentage}%</span>
            <div className="selection-indicator">{isSelected('Double Chance', 'X2') ? '✓' : '+'}</div>
          </div>
          <div
            className={`dc-option selectable-probability ${result_analysis.double_chance['12'].percentage >= 70 ? 'strong' : ''} ${isSelected('Double Chance', '12') ? 'selected' : ''}`}
            onClick={() => handleSelectBet('Double Chance', '12', result_analysis.double_chance['12'].percentage)}
          >
            <span className="dc-label">12</span>
            <div className="dc-bar">
              <div className="dc-fill" style={{ width: `${result_analysis.double_chance['12'].percentage}%` }}></div>
            </div>
            <span className="dc-value">{result_analysis.double_chance['12'].percentage}%</span>
            <div className="selection-indicator">{isSelected('Double Chance', '12') ? '✓' : '+'}</div>
          </div>
        </div>
      </div>

      {/* Goals Analysis */}
      <div className="h2h-subsection">
        <h4>Goals Analysis</h4>
        <div className="goals-stats-row">
          <div className="goals-stat">
            <span className="stat-label">Avg Goals/Match</span>
            <span className="stat-value">{goals_analysis.avg_total_goals}</span>
          </div>
          <div className="goals-stat">
            <span className="stat-label">{teamAName} Avg</span>
            <span className="stat-value">{goals_analysis.avg_team_a_goals}</span>
          </div>
          <div className="goals-stat">
            <span className="stat-label">{teamBName} Avg</span>
            <span className="stat-value">{goals_analysis.avg_team_b_goals}</span>
          </div>
        </div>

        <h5>Over/Under Predictions</h5>
        <div className="ou-grid ou-grid-paired">
          {Object.entries(goals_analysis.over_under).map(([key, data]) => {
            const overLabel = formatOverUnderLabel(key)
            const underLabel = overLabel.replace('Over', 'Under')
            const underPct = round1(100 - data.percentage)
            return (
              <div key={key} className="ou-pair">
                <div
                  className={`ou-item selectable-probability ${data.percentage >= 50 ? 'likely' : 'unlikely'} ${isSelected('Over/Under', overLabel) ? 'selected' : ''}`}
                  onClick={() => handleSelectBet('Over/Under', overLabel, data.percentage)}
                >
                  <span className="ou-label">{overLabel}</span>
                  <span className="ou-pct">{data.percentage}%</span>
                  <span className={`ou-prediction ${data.percentage >= 50 ? 'yes' : 'no'}`}>{data.percentage >= 50 ? 'Yes' : 'No'}</span>
                  <div className="selection-indicator">{isSelected('Over/Under', overLabel) ? '✓' : '+'}</div>
                </div>
                <div
                  className={`ou-item selectable-probability ${underPct >= 50 ? 'likely' : 'unlikely'} ${isSelected('Over/Under', underLabel) ? 'selected' : ''}`}
                  onClick={() => handleSelectBet('Over/Under', underLabel, underPct)}
                >
                  <span className="ou-label">{underLabel}</span>
                  <span className="ou-pct">{underPct}%</span>
                  <span className={`ou-prediction ${underPct >= 50 ? 'yes' : 'no'}`}>{underPct >= 50 ? 'Yes' : 'No'}</span>
                  <div className="selection-indicator">{isSelected('Over/Under', underLabel) ? '✓' : '+'}</div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="btts-section">
          <div className="btts-label">Both Teams to Score (BTTS)</div>
          <div className="btts-options">
            <span
              className={`btts-option selectable-probability ${goals_analysis.btts.prediction === 'Yes' ? 'selected-pred' : ''} ${isSelected('BTTS', 'Yes') ? 'selected' : ''}`}
              onClick={() => handleSelectBet('BTTS', 'Yes', goals_analysis.btts.yes.percentage)}
            >
              Yes: {goals_analysis.btts.yes.percentage}%
              <div className="selection-indicator">{isSelected('BTTS', 'Yes') ? '✓' : '+'}</div>
            </span>
            <span
              className={`btts-option selectable-probability ${goals_analysis.btts.prediction === 'No' ? 'selected-pred' : ''} ${isSelected('BTTS', 'No') ? 'selected' : ''}`}
              onClick={() => handleSelectBet('BTTS', 'No', goals_analysis.btts.no.percentage)}
            >
              No: {goals_analysis.btts.no.percentage}%
              <div className="selection-indicator">{isSelected('BTTS', 'No') ? '✓' : '+'}</div>
            </span>
          </div>
        </div>
      </div>

      {/* Recent Matches */}
      <div className="h2h-subsection">
        <h4>Recent Meetings</h4>
        <div className="h2h-matches-table">
          {matches.slice(0, 5).map((match, idx) => (
            <div key={idx} className="h2h-match-row">
              <span className="match-date">{match.date}</span>
              <span className="match-home">{match.home_team}</span>
              <span className="match-score">
                {match.home_score} - {match.away_score}
              </span>
              <span className="match-away">{match.away_team}</span>
              <span className={`match-result result-${match.team_a_result}`}>
                {match.team_a_result}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// Team Matches Content (for Home/Away form tabs)
function TeamMatchesContent({ form, teamName, isHome }) {
  if (!form) {
    return (
      <div className="no-data-message">
        No match data available for {teamName}
      </div>
    )
  }

  return (
    <div className="team-form-content">
      <div className="form-stats-grid">
        <div className="form-stat win">
          <div className="form-stat-value">{form.wins}</div>
          <div className="form-stat-label">Wins</div>
          <div className="form-stat-pct">{form.win_percentage}%</div>
        </div>
        <div className="form-stat draw">
          <div className="form-stat-value">{form.draws}</div>
          <div className="form-stat-label">Draws</div>
          <div className="form-stat-pct">{form.draw_percentage}%</div>
        </div>
        <div className="form-stat loss">
          <div className="form-stat-value">{form.losses}</div>
          <div className="form-stat-label">Losses</div>
          <div className="form-stat-pct">{form.loss_percentage}%</div>
        </div>
      </div>

      <div className="form-goals-row">
        <div className="form-goal-stat">
          <span className="goal-label">Goals Scored ({isHome ? 'Home' : 'Away'})</span>
          <span className="goal-value">{form.avg_goals_scored} per game</span>
        </div>
        <div className="form-goal-stat">
          <span className="goal-label">Goals Conceded ({isHome ? 'Home' : 'Away'})</span>
          <span className="goal-value">{form.avg_goals_conceded} per game</span>
        </div>
      </div>

      <div className={`form-strength strength-${form.strength}`}>
        <div className="strength-badge">{form.strength.toUpperCase()}</div>
        <div className="strength-note">{form.strength_note}</div>
      </div>

      <div className="form-notes">
        {form.notes && form.notes.map((note, idx) => (
          <div key={idx} className="form-note">
            <span className="note-icon">→</span>
            <span className="note-text">{note}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Additional Goal Markets Section
function GoalMarketsSection({ h2hData, teamAName, teamBName, matchId, matchName }) {
  const { addBet, isBetSelected } = useBetSlip()

  if (!h2hData?.result_analysis) return null

  const resultAnalysis = h2hData.result_analysis
  const dnb = resultAnalysis.draw_no_bet || {}
  const firstGoal = resultAnalysis.first_goal || {}
  const multigoals = resultAnalysis.multigoals || {}
  const teamTotals = resultAnalysis.team_totals || {}
  const firstHalf = resultAnalysis.first_half || {}

  const handleSelect = (category, outcome, probability) => {
    addBet({ matchId, matchName, category, outcome, probability: parseFloat(probability) })
  }

  const isSelected = (category, outcome) => isBetSelected(matchId, category, outcome)

  return (
    <div className="analysis-section">
      <h3 className="section-title">Additional Goal Markets</h3>
      <p className="section-subtitle">Click any probability to add to My Predictions</p>

      {/* Draw No Bet */}
      {dnb.team_a && (
        <div className="h2h-subsection">
          <h4>Draw No Bet</h4>
          <div className="double-chance-grid">
            <div
              className={`dc-option selectable-probability ${dnb.prediction === '1' ? 'strong' : ''} ${isSelected('Draw No Bet', teamAName) ? 'selected' : ''}`}
              onClick={() => handleSelect('Draw No Bet', teamAName, dnb.team_a.percentage)}
            >
              <span className="dc-label">{teamAName}</span>
              <div className="dc-bar">
                <div className="dc-fill" style={{ width: `${dnb.team_a.percentage}%` }}></div>
              </div>
              <span className="dc-value">{dnb.team_a.percentage}%</span>
              <div className="selection-indicator">{isSelected('Draw No Bet', teamAName) ? '✓' : '+'}</div>
            </div>
            <div
              className={`dc-option selectable-probability ${dnb.prediction === '2' ? 'strong' : ''} ${isSelected('Draw No Bet', teamBName) ? 'selected' : ''}`}
              onClick={() => handleSelect('Draw No Bet', teamBName, dnb.team_b.percentage)}
            >
              <span className="dc-label">{teamBName}</span>
              <div className="dc-bar">
                <div className="dc-fill" style={{ width: `${dnb.team_b.percentage}%` }}></div>
              </div>
              <span className="dc-value">{dnb.team_b.percentage}%</span>
              <div className="selection-indicator">{isSelected('Draw No Bet', teamBName) ? '✓' : '+'}</div>
            </div>
          </div>
        </div>
      )}

      {/* First Goal */}
      {firstGoal.team_a && (
        <div className="h2h-subsection">
          <h4>First Goal</h4>
          <div className="h2h-1x2-grid">
            <div
              className={`result-card selectable-probability ${firstGoal.team_a.percentage > firstGoal.team_b.percentage ? 'recommended' : ''} ${isSelected('First Goal', teamAName) ? 'selected' : ''}`}
              onClick={() => handleSelect('First Goal', teamAName, firstGoal.team_a.percentage)}
            >
              <div className="result-label">{teamAName}</div>
              <div className="result-value">{firstGoal.team_a.percentage}%</div>
              <div className="selection-indicator">{isSelected('First Goal', teamAName) ? '✓' : '+'}</div>
            </div>
            <div
              className={`result-card selectable-probability ${isSelected('First Goal', 'No Goal') ? 'selected' : ''}`}
              onClick={() => handleSelect('First Goal', 'No Goal', firstGoal.no_goal?.percentage || 5)}
            >
              <div className="result-label">No Goal</div>
              <div className="result-value">{firstGoal.no_goal?.percentage}%</div>
              <div className="selection-indicator">{isSelected('First Goal', 'No Goal') ? '✓' : '+'}</div>
            </div>
            <div
              className={`result-card selectable-probability ${firstGoal.team_b.percentage > firstGoal.team_a.percentage ? 'recommended' : ''} ${isSelected('First Goal', teamBName) ? 'selected' : ''}`}
              onClick={() => handleSelect('First Goal', teamBName, firstGoal.team_b.percentage)}
            >
              <div className="result-label">{teamBName}</div>
              <div className="result-value">{firstGoal.team_b.percentage}%</div>
              <div className="selection-indicator">{isSelected('First Goal', teamBName) ? '✓' : '+'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Team Totals */}
      {teamTotals.team_a && (
        <div className="h2h-subsection">
          <h4>Team Total Goals</h4>
          <div className="team-cards-comparison">
            <div className="team-card-stats">
              <h4>{teamAName}</h4>
              <div className="card-details">
                {[['over_05', '0.5'], ['over_15', '1.5'], ['over_25', '2.5']].map(([k, t]) => (
                  <div key={k} className="card-detail-pair">
                    <div className="card-detail"><span className="detail-label">Over {t}</span><span className="detail-value">{teamTotals.team_a[k]}%</span></div>
                    <div className="card-detail under"><span className="detail-label">Under {t}</span><span className="detail-value">{round1(100 - teamTotals.team_a[k])}%</span></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="team-card-stats">
              <h4>{teamBName}</h4>
              <div className="card-details">
                {[['over_05', '0.5'], ['over_15', '1.5'], ['over_25', '2.5']].map(([k, t]) => (
                  <div key={k} className="card-detail-pair">
                    <div className="card-detail"><span className="detail-label">Over {t}</span><span className="detail-value">{teamTotals.team_b[k]}%</span></div>
                    <div className="card-detail under"><span className="detail-label">Under {t}</span><span className="detail-value">{round1(100 - teamTotals.team_b[k])}%</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multigoals */}
      {Object.keys(multigoals).length > 0 && (
        <div className="h2h-subsection">
          <h4>Multigoals (Goal Ranges)</h4>
          <div className="ou-grid">
            {Object.entries(multigoals)
              .filter(([range]) => !['0', '7+'].includes(range))
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([range, prob]) => (
                <div key={range} className={`ou-item ${prob >= 40 ? 'likely' : ''}`}>
                  <span className="ou-label">{range} Goals</span>
                  <span className="ou-pct">{prob}%</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* First Half */}
      {firstHalf['1x2'] && (
        <div className="h2h-subsection">
          <h4>First Half Analysis</h4>

          <h5>1st Half - 1X2</h5>
          <div className="h2h-1x2-grid">
            <div className="result-card">
              <div className="result-label">{teamAName}</div>
              <div className="result-value">{firstHalf['1x2'].team_a}%</div>
            </div>
            <div className={`result-card ${firstHalf['1x2'].draw >= 40 ? 'recommended' : ''}`}>
              <div className="result-label">Draw</div>
              <div className="result-value">{firstHalf['1x2'].draw}%</div>
            </div>
            <div className="result-card">
              <div className="result-label">{teamBName}</div>
              <div className="result-value">{firstHalf['1x2'].team_b}%</div>
            </div>
          </div>

          <h5 style={{ marginTop: '16px' }}>1st Half - Total Goals</h5>
          <div className="ou-grid ou-grid-paired">
            {[['over_05', '0.5'], ['over_15', '1.5'], ['over_25', '2.5']].map(([k, t]) => (
              <div key={k} className="ou-pair">
                <div className={`ou-item ${firstHalf[k] >= 50 ? 'likely' : 'unlikely'}`}>
                  <span className="ou-label">Over {t}</span>
                  <span className="ou-pct">{firstHalf[k]}%</span>
                </div>
                <div className={`ou-item ${(100 - firstHalf[k]) >= 50 ? 'likely' : 'unlikely'}`}>
                  <span className="ou-label">Under {t}</span>
                  <span className="ou-pct">{round1(100 - firstHalf[k])}%</span>
                </div>
              </div>
            ))}
          </div>

          <h5 style={{ marginTop: '16px' }}>1st Half - Double Chance</h5>
          <div className="double-chance-grid">
            <div className={`dc-option ${firstHalf.double_chance?.['1X'] >= 60 ? 'strong' : ''}`}>
              <span className="dc-label">1X</span>
              <div className="dc-bar">
                <div className="dc-fill" style={{ width: `${firstHalf.double_chance?.['1X'] || 50}%` }}></div>
              </div>
              <span className="dc-value">{firstHalf.double_chance?.['1X']}%</span>
            </div>
            <div className={`dc-option ${firstHalf.double_chance?.['X2'] >= 60 ? 'strong' : ''}`}>
              <span className="dc-label">X2</span>
              <div className="dc-bar">
                <div className="dc-fill" style={{ width: `${firstHalf.double_chance?.['X2'] || 50}%` }}></div>
              </div>
              <span className="dc-value">{firstHalf.double_chance?.['X2']}%</span>
            </div>
            <div className={`dc-option ${firstHalf.double_chance?.['12'] >= 60 ? 'strong' : ''}`}>
              <span className="dc-label">12</span>
              <div className="dc-bar">
                <div className="dc-fill" style={{ width: `${firstHalf.double_chance?.['12'] || 50}%` }}></div>
              </div>
              <span className="dc-value">{firstHalf.double_chance?.['12']}%</span>
            </div>
          </div>

          {/* 1st Half BTTS */}
          {firstHalf.btts && (
            <>
              <h5 style={{ marginTop: '16px' }}>1st Half - Both Teams to Score</h5>
              <div className="btts-options">
                <span className={`btts-option ${firstHalf.btts.prediction === 'Yes' ? 'selected-pred' : ''}`}>
                  Yes: {firstHalf.btts.yes}%
                </span>
                <span className={`btts-option ${firstHalf.btts.prediction === 'No' ? 'selected-pred' : ''}`}>
                  No: {firstHalf.btts.no}%
                </span>
              </div>
            </>
          )}

          {/* 1st Half Team Total */}
          {firstHalf.team_total && (
            <>
              <h5 style={{ marginTop: '16px' }}>1st Half - Team Total Goals</h5>
              <div className="team-cards-comparison">
                <div className="team-card-stats">
                  <h4>{teamAName}</h4>
                  <div className="card-details">
                    {[['over_05', '0.5'], ['over_15', '1.5']].map(([k, t]) => (
                      <div key={k} className="card-detail-pair">
                        <div className="card-detail"><span className="detail-label">Over {t}</span><span className="detail-value">{firstHalf.team_total.team_a[k]}%</span></div>
                        <div className="card-detail under"><span className="detail-label">Under {t}</span><span className="detail-value">{round1(100 - firstHalf.team_total.team_a[k])}%</span></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="team-card-stats">
                  <h4>{teamBName}</h4>
                  <div className="card-details">
                    {[['over_05', '0.5'], ['over_15', '1.5']].map(([k, t]) => (
                      <div key={k} className="card-detail-pair">
                        <div className="card-detail"><span className="detail-label">Over {t}</span><span className="detail-value">{firstHalf.team_total.team_b[k]}%</span></div>
                        <div className="card-detail under"><span className="detail-label">Under {t}</span><span className="detail-value">{round1(100 - firstHalf.team_total.team_b[k])}%</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 1st Half Exact Goals */}
          {firstHalf.exact_goals && (
            <>
              <h5 style={{ marginTop: '16px' }}>1st Half - Exact Goals</h5>
              <div className="ou-grid">
                {Object.entries(firstHalf.exact_goals).map(([goals, pct]) => (
                  <div key={goals} className={`ou-item ${pct >= 30 ? 'likely' : ''}`}>
                    <span className="ou-label">{goals === '2+' ? '2+' : goals} Goal{goals !== '1' ? 's' : ''}</span>
                    <span className="ou-pct">{pct}%</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 1st Half Handicap */}
          {firstHalf.handicap && (
            <>
              <h5 style={{ marginTop: '16px' }}>1st Half - Handicap</h5>
              {Object.entries(firstHalf.handicap).map(([h, data]) => (
                <div key={h} style={{ marginBottom: '8px' }}>
                  <div className="handicap-label">{teamAName} ({h > 0 ? '+' : ''}{h})</div>
                  <div className="h2h-1x2-grid">
                    <div className="result-card"><div className="result-label">{teamAName}</div><div className="result-value">{data.team_a}%</div></div>
                    <div className="result-card"><div className="result-label">Draw</div><div className="result-value">{data.draw}%</div></div>
                    <div className="result-card"><div className="result-label">{teamBName}</div><div className="result-value">{data.team_b}%</div></div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* 1st Half 1X2 & BTTS */}
          {firstHalf['1x2_btts'] && Object.values(firstHalf['1x2_btts']).some(v => v > 0) && (
            <>
              <h5 style={{ marginTop: '16px' }}>1st Half - 1X2 & Both Teams to Score</h5>
              <div className="combined-market-grid">
                {[['1_yes', '1 & Yes'], ['1_no', '1 & No'], ['x_yes', 'X & Yes'], ['x_no', 'X & No'], ['2_yes', '2 & Yes'], ['2_no', '2 & No']].map(([k, label]) => (
                  <div key={k} className={`combined-market-item ${firstHalf['1x2_btts'][k] >= 20 ? 'likely' : ''}`}>
                    <span className="cm-label">{label}</span>
                    <span className="cm-pct">{firstHalf['1x2_btts'][k]}%</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 1st Half 1X2 & Total */}
          {firstHalf['1x2_total'] && Object.values(firstHalf['1x2_total']).some(v => v > 0) && (
            <>
              <h5 style={{ marginTop: '16px' }}>1st Half - 1X2 & Total O/U 1.5</h5>
              <div className="combined-market-grid">
                {[['1_over', '1 & Over 1.5'], ['1_under', '1 & Under 1.5'], ['x_over', 'X & Over 1.5'], ['x_under', 'X & Under 1.5'], ['2_over', '2 & Over 1.5'], ['2_under', '2 & Under 1.5']].map(([k, label]) => (
                  <div key={k} className={`combined-market-item ${firstHalf['1x2_total'][k] >= 20 ? 'likely' : ''}`}>
                    <span className="cm-label">{label}</span>
                    <span className="cm-pct">{firstHalf['1x2_total'][k]}%</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 1st Half Bookings O/U */}
          {firstHalf.bookings_ou && (
            <>
              <h5 style={{ marginTop: '16px' }}>1st Half - Total Bookings</h5>
              <div className="estimate-disclaimer">Rough estimate - limited data available for per-half bookings</div>
              <div className="ou-grid ou-grid-paired">
                {[['over_05', '0.5'], ['over_15', '1.5'], ['over_25', '2.5']].map(([k, t]) => (
                  <div key={k} className="ou-pair">
                    <div className={`ou-item ${firstHalf.bookings_ou[k] >= 50 ? 'likely' : 'unlikely'}`}>
                      <span className="ou-label">Over {t}</span>
                      <span className="ou-pct">{firstHalf.bookings_ou[k]}%</span>
                    </div>
                    <div className={`ou-item ${(100 - firstHalf.bookings_ou[k]) >= 50 ? 'likely' : 'unlikely'}`}>
                      <span className="ou-label">Under {t}</span>
                      <span className="ou-pct">{round1(100 - firstHalf.bookings_ou[k])}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 1st Half Corners O/U */}
          {firstHalf.corners_ou && (
            <>
              <h5 style={{ marginTop: '16px' }}>1st Half - Total Corners</h5>
              <div className="estimate-disclaimer">Rough estimate - limited data available for per-half corners</div>
              <div className="ou-grid ou-grid-paired">
                {[['over_35', '3.5'], ['over_45', '4.5'], ['over_55', '5.5']].map(([k, t]) => (
                  <div key={k} className="ou-pair">
                    <div className={`ou-item ${firstHalf.corners_ou[k] >= 50 ? 'likely' : 'unlikely'}`}>
                      <span className="ou-label">Over {t}</span>
                      <span className="ou-pct">{firstHalf.corners_ou[k]}%</span>
                    </div>
                    <div className={`ou-item ${(100 - firstHalf.corners_ou[k]) >= 50 ? 'likely' : 'unlikely'}`}>
                      <span className="ou-label">Under {t}</span>
                      <span className="ou-pct">{round1(100 - firstHalf.corners_ou[k])}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Full-Time Handicap */}
      {resultAnalysis.handicap && Object.keys(resultAnalysis.handicap).length > 0 && (
        <div className="h2h-subsection">
          <h4>Full-Time Handicap (European)</h4>
          {Object.entries(resultAnalysis.handicap).map(([h, data]) => (
            <div key={h} style={{ marginBottom: '8px' }}>
              <div className="handicap-label">{teamAName} ({parseInt(h) > 0 ? '+' : ''}{h})</div>
              <div className="h2h-1x2-grid">
                <div className={`result-card selectable-probability ${isSelected('Handicap', `${teamAName} (${h})`) ? 'selected' : ''}`}
                  onClick={() => handleSelect('Handicap', `${teamAName} (${h})`, data.team_a)}>
                  <div className="result-label">{teamAName}</div><div className="result-value">{data.team_a}%</div>
                  <div className="selection-indicator">{isSelected('Handicap', `${teamAName} (${h})`) ? '✓' : '+'}</div>
                </div>
                <div className="result-card"><div className="result-label">Draw</div><div className="result-value">{data.draw}%</div></div>
                <div className={`result-card selectable-probability ${isSelected('Handicap', `${teamBName} (${-parseInt(h)})`) ? 'selected' : ''}`}
                  onClick={() => handleSelect('Handicap', `${teamBName} (${-parseInt(h)})`, data.team_b)}>
                  <div className="result-label">{teamBName}</div><div className="result-value">{data.team_b}%</div>
                  <div className="selection-indicator">{isSelected('Handicap', `${teamBName} (${-parseInt(h)})`) ? '✓' : '+'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Exact Goals */}
      {resultAnalysis.exact_goals && (
        <div className="h2h-subsection">
          <h4>Exact Goals</h4>
          <div className="ou-grid">
            {Object.entries(resultAnalysis.exact_goals).map(([goals, pct]) => (
              <div key={goals} className={`ou-item selectable-probability ${pct >= 15 ? 'likely' : ''} ${isSelected('Exact Goals', `${goals} Goals`) ? 'selected' : ''}`}
                onClick={() => handleSelect('Exact Goals', `${goals} Goals`, pct)}>
                <span className="ou-label">{goals === '6+' ? '6+' : goals} Goal{goals !== '1' ? 's' : ''}</span>
                <span className="ou-pct">{pct}%</span>
                <div className="selection-indicator">{isSelected('Exact Goals', `${goals} Goals`) ? '✓' : '+'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Exact Goals */}
      {resultAnalysis.team_exact_goals && (
        <div className="h2h-subsection">
          <h4>Team Exact Goals</h4>
          <div className="team-cards-comparison">
            <div className="team-card-stats">
              <h4>{teamAName}</h4>
              <div className="card-details">
                {Object.entries(resultAnalysis.team_exact_goals.team_a).map(([g, pct]) => (
                  <div key={g} className="card-detail">
                    <span className="detail-label">{g === '3+' ? '3+' : g} Goal{g !== '1' ? 's' : ''}</span>
                    <span className="detail-value">{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="team-card-stats">
              <h4>{teamBName}</h4>
              <div className="card-details">
                {Object.entries(resultAnalysis.team_exact_goals.team_b).map(([g, pct]) => (
                  <div key={g} className="card-detail">
                    <span className="detail-label">{g === '3+' ? '3+' : g} Goal{g !== '1' ? 's' : ''}</span>
                    <span className="detail-value">{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Multigoals */}
      {resultAnalysis.team_multigoals && (
        <div className="h2h-subsection">
          <h4>Team Multigoals</h4>
          <div className="team-cards-comparison">
            <div className="team-card-stats">
              <h4>{teamAName}</h4>
              <div className="card-details">
                {Object.entries(resultAnalysis.team_multigoals.team_a).map(([range, pct]) => (
                  <div key={range} className="card-detail">
                    <span className="detail-label">{range === '0' ? 'No Goal' : range === '4+' ? '4+ Goals' : `${range} Goals`}</span>
                    <span className="detail-value">{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="team-card-stats">
              <h4>{teamBName}</h4>
              <div className="card-details">
                {Object.entries(resultAnalysis.team_multigoals.team_b).map(([range, pct]) => (
                  <div key={range} className="card-detail">
                    <span className="detail-label">{range === '0' ? 'No Goal' : range === '4+' ? '4+ Goals' : `${range} Goals`}</span>
                    <span className="detail-value">{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Clean Sheet */}
      {resultAnalysis.clean_sheet && (
        <div className="h2h-subsection">
          <h4>Clean Sheet</h4>
          <div className="clean-sheet-info">
            A clean sheet means a team does not concede (let in) any goals during the match. Betting "Yes" means you predict the team will keep a clean sheet (0 goals conceded).
          </div>
          <div className="team-cards-comparison">
            <div className="team-card-stats">
              <h4>{teamAName}</h4>
              <div className="card-details">
                <div className="card-detail"><span className="detail-label">Yes</span><span className="detail-value">{resultAnalysis.clean_sheet.team_a.yes}%</span></div>
                <div className="card-detail"><span className="detail-label">No</span><span className="detail-value">{resultAnalysis.clean_sheet.team_a.no}%</span></div>
              </div>
            </div>
            <div className="team-card-stats">
              <h4>{teamBName}</h4>
              <div className="card-details">
                <div className="card-detail"><span className="detail-label">Yes</span><span className="detail-value">{resultAnalysis.clean_sheet.team_b.yes}%</span></div>
                <div className="card-detail"><span className="detail-label">No</span><span className="detail-value">{resultAnalysis.clean_sheet.team_b.no}%</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1X2 & BTTS (Full-time) */}
      {resultAnalysis['1x2_btts'] && (
        <div className="h2h-subsection">
          <h4>1X2 & Both Teams to Score</h4>
          <div className="combined-market-grid">
            {[['1_yes', '1 & Yes'], ['1_no', '1 & No'], ['x_yes', 'X & Yes'], ['x_no', 'X & No'], ['2_yes', '2 & Yes'], ['2_no', '2 & No']].map(([k, label]) => (
              <div key={k} className={`combined-market-item selectable-probability ${resultAnalysis['1x2_btts'][k] >= 20 ? 'likely' : ''} ${isSelected('1X2 & BTTS', label) ? 'selected' : ''}`}
                onClick={() => handleSelect('1X2 & BTTS', label, resultAnalysis['1x2_btts'][k])}>
                <span className="cm-label">{label}</span>
                <span className="cm-pct">{resultAnalysis['1x2_btts'][k]}%</span>
                <div className="selection-indicator">{isSelected('1X2 & BTTS', label) ? '✓' : '+'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Total & BTTS */}
      {resultAnalysis.total_btts && (
        <div className="h2h-subsection">
          <h4>Total & Both Teams to Score</h4>
          <div className="combined-market-grid">
            {[['over25_yes', 'Over 2.5 & Yes'], ['over25_no', 'Over 2.5 & No'], ['under25_yes', 'Under 2.5 & Yes'], ['under25_no', 'Under 2.5 & No']].map(([k, label]) => (
              <div key={k} className={`combined-market-item selectable-probability ${resultAnalysis.total_btts[k] >= 25 ? 'likely' : ''} ${isSelected('Total & BTTS', label) ? 'selected' : ''}`}
                onClick={() => handleSelect('Total & BTTS', label, resultAnalysis.total_btts[k])}>
                <span className="cm-label">{label}</span>
                <span className="cm-pct">{resultAnalysis.total_btts[k]}%</span>
                <div className="selection-indicator">{isSelected('Total & BTTS', label) ? '✓' : '+'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Correct Score */}
      {resultAnalysis.correct_score && Object.keys(resultAnalysis.correct_score).length > 0 && (
        <div className="h2h-subsection">
          <h4>Correct Score</h4>
          <div className="correct-score-grid">
            {Object.entries(resultAnalysis.correct_score)
              .sort((a, b) => b[1] - a[1])
              .map(([score, pct]) => (
                <div key={score} className={`correct-score-item selectable-probability ${pct >= 8 ? 'likely' : ''} ${isSelected('Correct Score', score) ? 'selected' : ''}`}
                  onClick={() => handleSelect('Correct Score', score, pct)}>
                  <span className="cs-score">{score}</span>
                  <span className="cs-pct">{pct}%</span>
                  <div className="selection-indicator">{isSelected('Correct Score', score) ? '✓' : '+'}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* HT/FT */}
      {resultAnalysis.htft && Object.keys(resultAnalysis.htft).length > 0 && (
        <div className="h2h-subsection">
          <h4>HalfTime / FullTime</h4>
          <div className="combined-market-grid">
            {['1/1', '1/x', '1/2', 'x/1', 'x/x', 'x/2', '2/1', '2/x', '2/2'].map(key => (
              <div key={key} className={`combined-market-item selectable-probability ${(resultAnalysis.htft[key] || 0) >= 15 ? 'likely' : ''} ${isSelected('HT/FT', key.toUpperCase()) ? 'selected' : ''}`}
                onClick={() => handleSelect('HT/FT', key.toUpperCase(), resultAnalysis.htft[key] || 0)}>
                <span className="cm-label">{key.toUpperCase()}</span>
                <span className="cm-pct">{resultAnalysis.htft[key] || 0}%</span>
                <div className="selection-indicator">{isSelected('HT/FT', key.toUpperCase()) ? '✓' : '+'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Both Halves Over/Under 1.5 */}
      {resultAnalysis.both_halves && (
        <div className="h2h-subsection">
          <h4>Both Halves Over/Under 1.5</h4>
          <div className="ou-grid">
            <div className={`ou-item ${resultAnalysis.both_halves.over_15 >= 30 ? 'likely' : ''}`}>
              <span className="ou-label">Both Over 1.5</span>
              <span className="ou-pct">{resultAnalysis.both_halves.over_15}%</span>
            </div>
            <div className={`ou-item ${resultAnalysis.both_halves.under_15 >= 30 ? 'likely' : ''}`}>
              <span className="ou-label">Both Under 1.5</span>
              <span className="ou-pct">{resultAnalysis.both_halves.under_15}%</span>
            </div>
          </div>
        </div>
      )}

      {/* 1st Goal & 1X2 */}
      {resultAnalysis.first_goal_1x2 && (
        <div className="h2h-subsection">
          <h4>1st Goal & 1X2</h4>
          <div className="combined-market-grid">
            {[['1_goal_1', `${teamAName} Goal & 1`], ['1_goal_x', `${teamAName} Goal & X`], ['1_goal_2', `${teamAName} Goal & 2`],
              ['2_goal_1', `${teamBName} Goal & 1`], ['2_goal_x', `${teamBName} Goal & X`], ['2_goal_2', `${teamBName} Goal & 2`],
              ['no_goal', 'No Goal']].map(([k, label]) => (
              <div key={k} className={`combined-market-item selectable-probability ${resultAnalysis.first_goal_1x2[k] >= 15 ? 'likely' : ''} ${isSelected('1st Goal & 1X2', label) ? 'selected' : ''}`}
                onClick={() => handleSelect('1st Goal & 1X2', label, resultAnalysis.first_goal_1x2[k])}>
                <span className="cm-label">{label}</span>
                <span className="cm-pct">{resultAnalysis.first_goal_1x2[k]}%</span>
                <div className="selection-indicator">{isSelected('1st Goal & 1X2', label) ? '✓' : '+'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2nd Half - 1X2 & BTTS */}
      {resultAnalysis.second_half?.['1x2_btts'] && Object.values(resultAnalysis.second_half['1x2_btts']).some(v => v > 0) && (
        <div className="h2h-subsection">
          <h4>2nd Half - 1X2 & Both Teams to Score</h4>
          <div className="combined-market-grid">
            {[['1_yes', '1 & Yes'], ['1_no', '1 & No'], ['x_yes', 'X & Yes'], ['x_no', 'X & No'], ['2_yes', '2 & Yes'], ['2_no', '2 & No']].map(([k, label]) => (
              <div key={k} className={`combined-market-item ${resultAnalysis.second_half['1x2_btts'][k] >= 20 ? 'likely' : ''}`}>
                <span className="cm-label">{label}</span>
                <span className="cm-pct">{resultAnalysis.second_half['1x2_btts'][k]}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2nd Half - 1X2 & Total */}
      {resultAnalysis.second_half?.['1x2_total'] && Object.values(resultAnalysis.second_half['1x2_total']).some(v => v > 0) && (
        <div className="h2h-subsection">
          <h4>2nd Half - 1X2 & Total O/U 1.5</h4>
          <div className="combined-market-grid">
            {[['1_over', '1 & Over 1.5'], ['1_under', '1 & Under 1.5'], ['x_over', 'X & Over 1.5'], ['x_under', 'X & Under 1.5'], ['2_over', '2 & Over 1.5'], ['2_under', '2 & Under 1.5']].map(([k, label]) => (
              <div key={k} className={`combined-market-item ${resultAnalysis.second_half['1x2_total'][k] >= 20 ? 'likely' : ''}`}>
                <span className="cm-label">{label}</span>
                <span className="cm-pct">{resultAnalysis.second_half['1x2_total'][k]}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CornersSection({ cornerAnalysis, teamAName, teamBName, matchId, matchName }) {
  const { addBet, isBetSelected } = useBetSlip()

  if (!cornerAnalysis) return null

  const corner1x2 = cornerAnalysis.corner_1x2 || {}
  const cornerRanges = cornerAnalysis.corner_ranges || {}
  const firstCorner = cornerAnalysis.first_corner || {}

  const handleSelect = (category, outcome, probability) => {
    addBet({ matchId, matchName, category, outcome, probability: parseFloat(probability) })
  }

  const isSelected = (category, outcome) => isBetSelected(matchId, category, outcome)

  return (
    <div className="analysis-section corners-section">
      <h3 className="section-title">Corner Analysis</h3>
      <p className="section-subtitle">Click any probability to add to My Predictions</p>

      <div className="corners-stats-row">
        <div className="corner-stat">
          <span className="stat-label">Expected Total</span>
          <span className="stat-value">{cornerAnalysis.expected_total}</span>
        </div>
        <div className="corner-stat">
          <span className="stat-label">{teamAName}</span>
          <span className="stat-value">{cornerAnalysis.team_a_expected}</span>
        </div>
        <div className="corner-stat">
          <span className="stat-label">{teamBName}</span>
          <span className="stat-value">{cornerAnalysis.team_b_expected}</span>
        </div>
      </div>

      {/* Corner 1X2 */}
      <div className="h2h-subsection">
        <h4>Corner 1X2 (Most Corners)</h4>
        <div className="h2h-1x2-grid">
          <div
            className={`result-card selectable-probability ${corner1x2.prediction === '1' ? 'recommended' : ''} ${isSelected('Corner 1X2', teamAName) ? 'selected' : ''}`}
            onClick={() => handleSelect('Corner 1X2', teamAName, corner1x2.team_a?.percentage)}
          >
            <div className="result-label">{teamAName}</div>
            <div className="result-value">{corner1x2.team_a?.percentage}%</div>
            <div className="selection-indicator">{isSelected('Corner 1X2', teamAName) ? '✓' : '+'}</div>
          </div>
          <div
            className={`result-card selectable-probability ${isSelected('Corner 1X2', 'Draw') ? 'selected' : ''}`}
            onClick={() => handleSelect('Corner 1X2', 'Draw', corner1x2.draw?.percentage)}
          >
            <div className="result-label">Draw</div>
            <div className="result-value">{corner1x2.draw?.percentage}%</div>
            <div className="selection-indicator">{isSelected('Corner 1X2', 'Draw') ? '✓' : '+'}</div>
          </div>
          <div
            className={`result-card selectable-probability ${corner1x2.prediction === '2' ? 'recommended' : ''} ${isSelected('Corner 1X2', teamBName) ? 'selected' : ''}`}
            onClick={() => handleSelect('Corner 1X2', teamBName, corner1x2.team_b?.percentage)}
          >
            <div className="result-label">{teamBName}</div>
            <div className="result-value">{corner1x2.team_b?.percentage}%</div>
            <div className="selection-indicator">{isSelected('Corner 1X2', teamBName) ? '✓' : '+'}</div>
          </div>
        </div>
      </div>

      {/* First Corner */}
      {firstCorner.team_a && (
        <div className="h2h-subsection">
          <h4>First Corner</h4>
          <div className="double-chance-grid">
            <div
              className={`dc-option selectable-probability ${firstCorner.team_a.percentage > 50 ? 'strong' : ''} ${isSelected('First Corner', teamAName) ? 'selected' : ''}`}
              onClick={() => handleSelect('First Corner', teamAName, firstCorner.team_a.percentage)}
            >
              <span className="dc-label">{teamAName}</span>
              <div className="dc-bar">
                <div className="dc-fill" style={{ width: `${firstCorner.team_a.percentage}%` }}></div>
              </div>
              <span className="dc-value">{firstCorner.team_a.percentage}%</span>
              <div className="selection-indicator">{isSelected('First Corner', teamAName) ? '✓' : '+'}</div>
            </div>
            <div
              className={`dc-option selectable-probability ${firstCorner.team_b.percentage > 50 ? 'strong' : ''} ${isSelected('First Corner', teamBName) ? 'selected' : ''}`}
              onClick={() => handleSelect('First Corner', teamBName, firstCorner.team_b.percentage)}
            >
              <span className="dc-label">{teamBName}</span>
              <div className="dc-bar">
                <div className="dc-fill" style={{ width: `${firstCorner.team_b.percentage}%` }}></div>
              </div>
              <span className="dc-value">{firstCorner.team_b.percentage}%</span>
              <div className="selection-indicator">{isSelected('First Corner', teamBName) ? '✓' : '+'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Corner Ranges */}
      {Object.keys(cornerRanges).length > 0 && (
        <div className="h2h-subsection">
          <h4>Corner Range</h4>
          <div className="ou-grid">
            {Object.entries(cornerRanges).map(([range, prob]) => (
              <div
                key={range}
                className={`ou-item selectable-probability ${prob >= 40 ? 'likely' : ''} ${isSelected('Corner Range', range) ? 'selected' : ''}`}
                onClick={() => handleSelect('Corner Range', range, prob)}
              >
                <span className="ou-label">{range}</span>
                <span className="ou-pct">{prob}%</span>
                <div className="selection-indicator">{isSelected('Corner Range', range) ? '✓' : '+'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h4>Over/Under Total Corners</h4>
      <div className="ou-grid ou-grid-paired corners-ou">
        {Object.entries(cornerAnalysis.over_under).map(([key, data]) => {
          const overLabel = formatOverUnderLabel(key)
          const underLabel = overLabel.replace('Over', 'Under')
          const underPct = round1(100 - data.percentage)
          return (
            <div key={key} className="ou-pair">
              <div
                className={`ou-item selectable-probability ${data.percentage >= 50 ? 'likely' : 'unlikely'} ${isSelected('Corners O/U', overLabel) ? 'selected' : ''}`}
                onClick={() => handleSelect('Corners O/U', overLabel, data.percentage)}
              >
                <span className="ou-label">{overLabel}</span>
                <span className="ou-pct">{data.percentage}%</span>
                <span className={`ou-prediction ${data.percentage >= 50 ? 'yes' : 'no'}`}>{data.percentage >= 50 ? 'Yes' : 'No'}</span>
                <div className="selection-indicator">{isSelected('Corners O/U', overLabel) ? '✓' : '+'}</div>
              </div>
              <div
                className={`ou-item selectable-probability ${underPct >= 50 ? 'likely' : 'unlikely'} ${isSelected('Corners O/U', underLabel) ? 'selected' : ''}`}
                onClick={() => handleSelect('Corners O/U', underLabel, underPct)}
              >
                <span className="ou-label">{underLabel}</span>
                <span className="ou-pct">{underPct}%</span>
                <span className={`ou-prediction ${underPct >= 50 ? 'yes' : 'no'}`}>{underPct >= 50 ? 'Yes' : 'No'}</span>
                <div className="selection-indicator">{isSelected('Corners O/U', underLabel) ? '✓' : '+'}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CardsSection({ cardAnalysis, teamAName, teamBName, matchId, matchName }) {
  const { addBet, isBetSelected } = useBetSlip()

  if (!cardAnalysis) return null

  const redCard = cardAnalysis.red_card || {}
  const booking1x2 = cardAnalysis.booking_1x2 || {}

  const handleSelect = (category, outcome, probability) => {
    addBet({ matchId, matchName, category, outcome, probability: parseFloat(probability) })
  }

  const isSelected = (category, outcome) => isBetSelected(matchId, category, outcome)

  return (
    <div className="analysis-section cards-section">
      <h3 className="section-title">Card Analysis</h3>
      <p className="section-subtitle">Click any probability to add to My Predictions</p>

      <div className="cards-summary">
        <div className="card-stat yellow">
          <span className="card-icon">🟨</span>
          <div>
            <span className="stat-label">Expected Yellow Cards</span>
            <span className="stat-value">{cardAnalysis.expected_yellow_cards}</span>
          </div>
        </div>
        <div
          className={`card-stat red selectable-probability ${isSelected('Red Card', redCard.no >= 80 ? 'No' : 'Yes') ? 'selected' : ''}`}
          onClick={() => handleSelect('Red Card', redCard.no >= 80 ? 'No' : 'Yes', redCard.no >= 80 ? redCard.no : redCard.yes)}
        >
          <span className="card-icon">🟥</span>
          <div>
            <span className="stat-label">Red Card</span>
            <span className="stat-value">
              {redCard.no >= 80 ? `No (${redCard.no}%)` : `Yes (${redCard.yes}%)`}
            </span>
          </div>
          <div className="selection-indicator">{isSelected('Red Card', redCard.no >= 80 ? 'No' : 'Yes') ? '✓' : '+'}</div>
        </div>
      </div>

      {/* Booking 1X2 */}
      {booking1x2.team_a && (
        <div className="h2h-subsection">
          <h4>Booking 1X2 (Most Cards)</h4>
          <div className="h2h-1x2-grid">
            <div
              className={`result-card selectable-probability ${booking1x2.team_a.percentage > booking1x2.team_b.percentage ? 'recommended' : ''} ${isSelected('Booking 1X2', teamAName) ? 'selected' : ''}`}
              onClick={() => handleSelect('Booking 1X2', teamAName, booking1x2.team_a.percentage)}
            >
              <div className="result-label">{teamAName}</div>
              <div className="result-value">{booking1x2.team_a.percentage}%</div>
              <div className="selection-indicator">{isSelected('Booking 1X2', teamAName) ? '✓' : '+'}</div>
            </div>
            <div
              className={`result-card selectable-probability ${isSelected('Booking 1X2', 'Draw') ? 'selected' : ''}`}
              onClick={() => handleSelect('Booking 1X2', 'Draw', booking1x2.draw?.percentage)}
            >
              <div className="result-label">Draw</div>
              <div className="result-value">{booking1x2.draw?.percentage}%</div>
              <div className="selection-indicator">{isSelected('Booking 1X2', 'Draw') ? '✓' : '+'}</div>
            </div>
            <div
              className={`result-card selectable-probability ${booking1x2.team_b.percentage > booking1x2.team_a.percentage ? 'recommended' : ''} ${isSelected('Booking 1X2', teamBName) ? 'selected' : ''}`}
              onClick={() => handleSelect('Booking 1X2', teamBName, booking1x2.team_b.percentage)}
            >
              <div className="result-label">{teamBName}</div>
              <div className="result-value">{booking1x2.team_b.percentage}%</div>
              <div className="selection-indicator">{isSelected('Booking 1X2', teamBName) ? '✓' : '+'}</div>
            </div>
          </div>
        </div>
      )}

      <div className="team-cards-comparison">
        <div className="team-card-stats">
          <h4>{teamAName}</h4>
          <div className="card-details">
            <div className="card-detail">
              <span className="detail-label">Yellow/Match</span>
              <span className="detail-value">{cardAnalysis.team_a.yellow_per_match}</span>
            </div>
            <div className="card-detail">
              <span className="detail-label">Total Yellow</span>
              <span className="detail-value">{cardAnalysis.team_a.total_yellow}</span>
            </div>
            <div className="card-detail">
              <span className="detail-label">Total Red</span>
              <span className="detail-value">{cardAnalysis.team_a.total_red}</span>
            </div>
          </div>
        </div>

        <div className="team-card-stats">
          <h4>{teamBName}</h4>
          <div className="card-details">
            <div className="card-detail">
              <span className="detail-label">Yellow/Match</span>
              <span className="detail-value">{cardAnalysis.team_b.yellow_per_match}</span>
            </div>
            <div className="card-detail">
              <span className="detail-label">Total Yellow</span>
              <span className="detail-value">{cardAnalysis.team_b.total_yellow}</span>
            </div>
            <div className="card-detail">
              <span className="detail-label">Total Red</span>
              <span className="detail-value">{cardAnalysis.team_b.total_red}</span>
            </div>
          </div>
        </div>
      </div>

      <h4>Card Over/Under Predictions</h4>
      <div className="ou-grid ou-grid-paired cards-ou">
        {Object.entries(cardAnalysis.over_under).map(([key, data]) => {
          const overLabel = formatCardLabel(key)
          const underLabel = overLabel.replace('Over', 'Under')
          const underPct = round1(100 - data.percentage)
          return (
            <div key={key} className="ou-pair">
              <div
                className={`ou-item selectable-probability ${data.percentage >= 50 ? 'likely' : 'unlikely'} ${isSelected('Cards O/U', overLabel) ? 'selected' : ''}`}
                onClick={() => handleSelect('Cards O/U', overLabel, data.percentage)}
              >
                <span className="ou-label">{overLabel}</span>
                <span className="ou-pct">{data.percentage}%</span>
                <span className={`ou-prediction ${data.percentage >= 50 ? 'yes' : 'no'}`}>{data.percentage >= 50 ? 'Yes' : 'No'}</span>
                <div className="selection-indicator">{isSelected('Cards O/U', overLabel) ? '✓' : '+'}</div>
              </div>
              <div
                className={`ou-item selectable-probability ${underPct >= 50 ? 'likely' : 'unlikely'} ${isSelected('Cards O/U', underLabel) ? 'selected' : ''}`}
                onClick={() => handleSelect('Cards O/U', underLabel, underPct)}
              >
                <span className="ou-label">{underLabel}</span>
                <span className="ou-pct">{underPct}%</span>
                <span className={`ou-prediction ${underPct >= 50 ? 'yes' : 'no'}`}>{underPct >= 50 ? 'Yes' : 'No'}</span>
                <div className="selection-indicator">{isSelected('Cards O/U', underLabel) ? '✓' : '+'}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Form Badges + Motivation Section
function FormAndMotivation({ h2hData, teamAName, teamBName }) {
  const formA = h2hData?.form_strings?.team_a || ''
  const formB = h2hData?.form_strings?.team_b || ''
  const motivationA = h2hData?.motivation?.team_a
  const motivationB = h2hData?.motivation?.team_b
  const posA = h2hData?.positions?.team_a
  const posB = h2hData?.positions?.team_b

  if (!formA && !formB && !motivationA && !motivationB) return null

  const renderFormBadges = (formStr) => {
    if (!formStr) return <span className="no-data">N/A</span>
    return formStr.split('').map((ch, i) => {
      const cls = ch === 'W' ? 'form-w' : ch === 'D' ? 'form-d' : ch === 'L' ? 'form-l' : ''
      return <span key={i} className={`form-badge ${cls}`}>{ch}</span>
    })
  }

  const getMotivationColor = (level) => {
    if (level === 'Maximum' || level === 'Desperate') return 'motivation-high'
    if (level === 'Very High' || level === 'High') return 'motivation-medium'
    return 'motivation-low'
  }

  return (
    <div className="analysis-section">
      <h3 className="section-title">Current Form & Motivation</h3>
      <div className="form-motivation-grid">
        <div className="form-motivation-team">
          <h4>{teamAName}</h4>
          <div className="form-badges-row">
            <span className="form-label">Last 5:</span>
            {renderFormBadges(formA)}
          </div>
          {posA && <div className="team-position">League Position: <strong>#{posA}</strong></div>}
          {motivationA && (
            <div className={`motivation-tag ${getMotivationColor(motivationA.level)}`}>
              {motivationA.note}
            </div>
          )}
        </div>
        <div className="form-motivation-team">
          <h4>{teamBName}</h4>
          <div className="form-badges-row">
            <span className="form-label">Last 5:</span>
            {renderFormBadges(formB)}
          </div>
          {posB && <div className="team-position">League Position: <strong>#{posB}</strong></div>}
          {motivationB && (
            <div className={`motivation-tag ${getMotivationColor(motivationB.level)}`}>
              {motivationB.note}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Goals Per Minute Distribution
function GoalsPerMinute({ matchStats, teamAName, teamBName }) {
  const statsA = matchStats?.team_a?.goals_by_minute
  const statsB = matchStats?.team_b?.goals_by_minute
  if (!statsA?.scored && !statsB?.scored) return null

  const periods = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90']

  const renderBars = (data, label) => {
    if (!data?.scored) return null
    const maxGoals = Math.max(...periods.map(p => data.scored[p] || 0), 1)
    return (
      <div className="goals-minute-team">
        <h4>{label}</h4>
        <div className="minute-bars">
          {periods.map(period => {
            const scored = data.scored[period] || 0
            const conceded = data.conceded?.[period] || 0
            const pct = Math.round((scored / maxGoals) * 100)
            return (
              <div key={period} className="minute-bar-row">
                <span className="minute-label">{period}'</span>
                <div className="minute-bar-track">
                  <div className="minute-bar-fill scored" style={{ width: `${pct}%` }}></div>
                </div>
                <span className="minute-bar-value">{scored}</span>
                <span className="minute-bar-conceded">({conceded})</span>
              </div>
            )
          })}
        </div>
        <div className="minute-legend">
          <span className="legend-scored">Scored</span>
          <span className="legend-conceded">(Conceded)</span>
        </div>
      </div>
    )
  }

  return (
    <div className="analysis-section">
      <h3 className="section-title">Goals by Time Period</h3>
      <p className="section-subtitle">When teams score and concede throughout the match</p>
      <div className="goals-minute-grid">
        {renderBars(statsA, teamAName)}
        {renderBars(statsB, teamBName)}
      </div>
    </div>
  )
}

// Render a single live stat comparison bar
function LiveMetricBar({ label, homeVal, awayVal, homeTeam, awayTeam }) {
  const h = homeVal || 0
  const a = awayVal || 0
  const homeDominant = h >= a
  const homeColor = homeDominant ? '#22c55e' : '#ef4444'
  const awayColor = homeDominant ? '#ef4444' : '#22c55e'

  return (
    <div className="lma-metric">
      <div className="lma-label">{label}</div>
      <div className="lma-bar-row">
        <span className="lma-pct" style={{ color: homeColor }}>{h}%</span>
        <div className="lma-track">
          <div
            className="lma-fill-home"
            style={{
              width: `${h}%`,
              background: homeColor,
              boxShadow: `0 0 12px ${homeColor}88`,
            }}
          />
          <div
            className="lma-fill-away"
            style={{
              width: `${a}%`,
              background: awayColor,
              boxShadow: `0 0 12px ${awayColor}88`,
            }}
          />
        </div>
        <span className="lma-pct" style={{ color: awayColor }}>{a}%</span>
      </div>
      <div className="lma-teams">
        <span style={{ color: homeColor }}>{homeTeam}</span>
        <span style={{ color: awayColor }}>{awayTeam}</span>
      </div>
    </div>
  )
}

function LiveNeutralBar({ label, homeVal, awayVal, suffix = '%', colorClass = 'neutral' }) {
  const h = homeVal || 0
  const a = awayVal || 0
  const total = h + a || 1
  const homePct = suffix === '%' ? h : Math.round((h / total) * 100)
  const awayPct = suffix === '%' ? a : 100 - homePct

  return (
    <div className="lma-metric">
      <div className="lma-label">{label}</div>
      <div className="lma-bar-row">
        <span className="lma-pct lma-pct-neutral">{h}{suffix}</span>
        <div className="lma-track">
          <div className={`lma-fill-home lma-neutral-${colorClass}`} style={{ width: `${homePct}%` }} />
          <div className={`lma-fill-away lma-neutral-${colorClass}-dim`} style={{ width: `${awayPct}%` }} />
        </div>
        <span className="lma-pct lma-pct-neutral">{a}{suffix}</span>
      </div>
    </div>
  )
}

// Live Match Analysis Section with real-time polling
function LiveAnalysisSection({ analysis, teamAName, teamBName }) {
  const { t } = useTranslation()
  if (!analysis) return null

  return (
    <div className="lma-container">
      <div className="lma-header">
        <span className="lma-live-dot"></span>
        <h3 className="lma-title">{t('match.aiAnalysis')}</h3>
      </div>
      <p className="lma-subtitle">Real-time match insights — updates every 30 seconds</p>

      <div className="lma-metrics">
        <LiveMetricBar label="DOMINATION" homeVal={analysis.domination?.home} awayVal={analysis.domination?.away} homeTeam={teamAName} awayTeam={teamBName} />
        {analysis.possession && <LiveNeutralBar label="POSSESSION" homeVal={analysis.possession.home} awayVal={analysis.possession.away} colorClass="possession" />}
        <LiveMetricBar label="LIKELY TO SCORE" homeVal={analysis.likely_next_goal?.home} awayVal={analysis.likely_next_goal?.away} homeTeam={teamAName} awayTeam={teamBName} />
        <LiveMetricBar label="AGGRESSION" homeVal={analysis.aggression?.home} awayVal={analysis.aggression?.away} homeTeam={teamAName} awayTeam={teamBName} />
        {analysis.shots && <LiveNeutralBar label="SHOTS" homeVal={analysis.shots.home} awayVal={analysis.shots.away} suffix="" colorClass="shots" />}
        {analysis.dangerous_attacks && <LiveNeutralBar label="DANGEROUS ATTACKS" homeVal={analysis.dangerous_attacks.home} awayVal={analysis.dangerous_attacks.away} suffix="" colorClass="attacks" />}
      </div>
    </div>
  )
}

// Live Match Statistics (possession, shots, corners, fouls, etc.) - Free tier
function LiveMatchStatsPanel({ statistics, teamAName, teamBName, homeTeamCrest, awayTeamCrest, homeTeamId, goals, status, elapsed, events }) {
  if (!statistics) return null
  const { home, away } = statistics
  if (!home || !away || (Object.keys(home).length === 0 && Object.keys(away).length === 0)) return null

  const getStat = (...keys) => {
    for (const k of keys) {
      if (home[k] != null || away[k] != null) return { home: home[k], away: away[k], label: k }
    }
    return null
  }

  const statRows = [
    { data: getStat('Ball Possession'), label: 'Possession' },
    { data: getStat('Total Shots'), label: 'Total Shots' },
    { data: getStat('Shots on Goal'), label: 'Shots on Target' },
    { data: getStat('Shots off Goal'), label: 'Shots off Target' },
    { data: getStat('Corner Kicks'), label: 'Corners' },
    { data: getStat('Fouls'), label: 'Fouls' },
    { data: getStat('Yellow Cards'), label: 'Yellow Cards' },
    { data: getStat('Red Cards'), label: 'Red Cards' },
    { data: getStat('Offsides'), label: 'Offsides' },
    { data: getStat('Passes accurate', 'Passes Accurate'), label: 'Accurate Passes' },
    { data: getStat('Passes %', 'Pass Accuracy'), label: 'Pass Accuracy' },
    { data: getStat('expected_goals'), label: 'Expected Goals (xG)' },
  ].filter(s => s.data)

  if (statRows.length === 0) return null

  const getStatus = () => {
    switch (status) {
      case '1H': case '2H': case 'LIVE': return `${elapsed}'`
      case 'HT': return 'HT'
      case 'FT': return 'FT'
      case 'ET': return `ET ${elapsed}'`
      case 'AET': return 'AET'
      case 'P': case 'PEN': return 'PEN'
      default: return status || ''
    }
  }

  const isLiveNow = ['1H', '2H', 'LIVE', 'ET', 'HT'].includes(status)

  return (
    <div className="analysis-section live-stats-section">
      <div className="live-stats-header">
        {isLiveNow && <span className="lma-live-dot"></span>}
        <h3 className="section-title" style={{ margin: 0 }}>Match Statistics</h3>
      </div>
      {isLiveNow && <p className="section-subtitle">Live stats — auto-updates every 30 seconds</p>}

      {/* Score header */}
      <div className="stats-score-header">
        <div className="stats-team-col home">
          {homeTeamCrest && <img src={homeTeamCrest} alt="" className="stats-team-crest" />}
          <span className="stats-team-name">{teamAName}</span>
        </div>
        <div className="stats-score-center">
          <span className="stats-score-num">{goals?.home ?? '?'} - {goals?.away ?? '?'}</span>
          <span className="stats-match-status">{getStatus()}</span>
        </div>
        <div className="stats-team-col away">
          {awayTeamCrest && <img src={awayTeamCrest} alt="" className="stats-team-crest" />}
          <span className="stats-team-name">{teamBName}</span>
        </div>
      </div>

      {/* Goal scorers */}
      {events && events.length > 0 && (() => {
        const goalEvents = events.filter(e => e.type === 'Goal')
        if (goalEvents.length === 0) return null
        const homeGoals = goalEvents.filter(e => e.team_id === homeTeamId)
        const awayGoals = goalEvents.filter(e => e.team_id !== homeTeamId)
        return (
          <div className="stats-scorers-row">
            <div className="stats-scorers-col home">
              {homeGoals.map((g, i) => (
                <span key={i} className="stats-scorer">{g.player} {g.time}'</span>
              ))}
            </div>
            <div className="stats-scorers-col away">
              {awayGoals.map((g, i) => (
                <span key={i} className="stats-scorer">{g.player} {g.time}'</span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Stat comparison bars */}
      <div className="stats-comparison">
        {statRows.map(({ data, label }) => {
          const hVal = data.home
          const aVal = data.away
          const hNum = typeof hVal === 'string' ? parseFloat(hVal) : (hVal || 0)
          const aNum = typeof aVal === 'string' ? parseFloat(aVal) : (aVal || 0)
          const total = hNum + aNum || 1
          const hPct = Math.round((hNum / total) * 100)
          const aPct = 100 - hPct
          return (
            <div key={label} className="stat-comparison-row">
              <span className={`stat-val home ${hNum > aNum ? 'leading' : ''}`}>{hVal ?? 0}</span>
              <div className="stat-bar-section">
                <span className="stat-label">{label}</span>
                <div className="stat-bar-track">
                  <div className={`stat-bar-home ${hNum > aNum ? 'leading' : hNum < aNum ? 'trailing' : ''}`} style={{ width: `${hPct}%` }} />
                  <div className={`stat-bar-away ${aNum > hNum ? 'leading' : aNum < hNum ? 'trailing' : ''}`} style={{ width: `${aPct}%` }} />
                </div>
              </div>
              <span className={`stat-val away ${aNum > hNum ? 'leading' : ''}`}>{aVal ?? 0}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Formation Display with pitch visualization
function FormationDisplay({ lineups }) {
  if (!lineups || lineups.length === 0) return null

  // Position mapping for formation grid layout
  const posLabel = { G: 'GK', D: 'DEF', M: 'MID', F: 'FWD' }

  const renderFormation = (lineup, isHome) => {
    const formation = lineup.formation
    const players = lineup.startXI || []
    const subs = lineup.substitutes || []
    const team = lineup.team
    const coach = lineup.coach
    const colors = team?.colors

    // Parse formation rows (e.g. "4-3-3" => [4,3,3])
    const rows = formation ? formation.split('-').map(Number) : []

    // Group players by grid row
    const gridRows = {}
    players.forEach(p => {
      if (p.grid) {
        const row = p.grid.split(':')[0]
        if (!gridRows[row]) gridRows[row] = []
        gridRows[row].push(p)
      }
    })

    // Sort rows by grid position
    const sortedRowKeys = Object.keys(gridRows).sort((a, b) => {
      const aNum = parseInt(a)
      const bNum = parseInt(b)
      return isHome ? bNum - aNum : aNum - bNum
    })

    // Team primary color
    const primaryColor = colors?.player?.primary || (isHome ? '#3b82f6' : '#f97316')
    const numberColor = colors?.player?.number || '#ffffff'

    return (
      <div className={`formation-team ${isHome ? 'home' : 'away'}`}>
        <div className="formation-header">
          {team?.logo && <img src={team.logo} alt="" className="formation-team-logo" />}
          <div className="formation-team-info">
            <span className="formation-team-name">{team?.name}</span>
            <span className="formation-str">{formation || 'N/A'}</span>
          </div>
        </div>

        {coach?.name && (
          <div className="formation-coach">
            {coach.photo && <img src={coach.photo} alt="" className="formation-coach-photo" />}
            <span>{coach.name}</span>
          </div>
        )}

        <div className="pitch-formation">
          {sortedRowKeys.map(rowKey => (
            <div key={rowKey} className="pitch-row">
              {gridRows[rowKey]
                .sort((a, b) => {
                  const aCol = parseInt(a.grid?.split(':')[1] || 0)
                  const bCol = parseInt(b.grid?.split(':')[1] || 0)
                  return aCol - bCol
                })
                .map(player => (
                  <div key={player.id || player.number} className="pitch-player">
                    <div className="player-circle" style={{ background: primaryColor, color: numberColor }}>
                      {player.number}
                    </div>
                    <span className="player-name-label">{player.name?.split(' ').pop()}</span>
                    {player.pos && <span className="player-pos-tag">{posLabel[player.pos] || player.pos}</span>}
                  </div>
                ))}
            </div>
          ))}
        </div>

        {subs.length > 0 && (
          <div className="formation-subs">
            <span className="subs-header">Substitutes</span>
            <div className="subs-list">
              {subs.map(p => (
                <span key={p.id || p.number} className="sub-player">
                  <span className="sub-number">{p.number}</span>
                  {p.name?.split(' ').pop()}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="analysis-section formation-section">
      <h3 className="section-title">Team Formations & Lineups</h3>
      <p className="section-subtitle">Starting XI and substitutes</p>
      <div className="formations-container">
        {lineups[0] && renderFormation(lineups[0], true)}
        {lineups[1] && renderFormation(lineups[1], false)}
      </div>
    </div>
  )
}

// Squad Stability + Injuries + Coach Section
function SquadInfo({ matchStats, teamAName, teamBName }) {
  const stabilityA = matchStats?.team_a?.squad_stability
  const stabilityB = matchStats?.team_b?.squad_stability
  const injuriesA = matchStats?.injuries?.team_a || []
  const injuriesB = matchStats?.injuries?.team_b || []
  const coachA = matchStats?.coaches?.team_a
  const coachB = matchStats?.coaches?.team_b

  if (!stabilityA && !coachA && injuriesA.length === 0 && injuriesB.length === 0) return null

  const stabilityColor = (rating) => {
    if (rating === 'High') return 'stability-high'
    if (rating === 'Medium') return 'stability-medium'
    return 'stability-low'
  }

  const renderTeamSquad = (stability, injuries, coach, name) => (
    <div className="squad-info-team">
      <h4>{name}</h4>

      {coach && (
        <div className="coach-info">
          {coach.photo && <img src={coach.photo} alt="" className="coach-photo" />}
          <div className="coach-details">
            <span className="coach-name">{coach.name}</span>
            <span className="coach-meta">{coach.nationality}{coach.age ? `, ${coach.age}` : ''}</span>
          </div>
        </div>
      )}

      {stability?.primary_formation && (
        <div className="stability-info">
          <span className="formation-label">Formation: <strong>{stability.primary_formation}</strong></span>
          <span className={`stability-badge ${stabilityColor(stability.rating)}`}>
            {stability.rating} Stability ({stability.usage_percentage}%)
          </span>
          {stability.formations_used > 1 && (
            <span className="formations-used">{stability.formations_used} formations used this season</span>
          )}
        </div>
      )}

      {injuries.length > 0 ? (() => {
        const unique = injuries.filter((inj, idx, arr) => arr.findIndex(x => x.player === inj.player) === idx)
        return (
        <div className="injuries-list">
          <span className="injuries-header">Injuries/Suspensions ({unique.length})</span>
          {unique.slice(0, 5).map((inj, i) => (
            <div key={i} className="injury-item">
              <span className="injury-player">{inj.player}</span>
              <span className="injury-reason">{inj.reason}</span>
            </div>
          ))}
          {unique.length > 5 && <span className="injuries-more">+{unique.length - 5} more</span>}
        </div>
        )
      })() : (
        <div className="no-injuries">No reported injuries</div>
      )}
    </div>
  )

  return (
    <div className="analysis-section">
      <h3 className="section-title">Squad & Manager Info</h3>
      <div className="squad-info-grid">
        {renderTeamSquad(stabilityA, injuriesA, coachA, teamAName)}
        {renderTeamSquad(stabilityB, injuriesB, coachB, teamBName)}
      </div>
    </div>
  )
}

// Final Prediction Section - Analyzes ALL outcomes
function FinalPrediction({ prediction, h2hData, matchStats, odds, teamAName, teamBName }) {
  const { t } = useTranslation()
  if (!prediction) return null

  const outcome = prediction.outcome || {}
  const oddsData = odds || {}
  const goalsAnalysis = h2hData?.goals_analysis || {}
  const resultAnalysis = h2hData?.result_analysis || {}
  const cornerAnalysis = matchStats?.corner_analysis || {}
  const cardAnalysis = matchStats?.card_analysis || {}

  // Collect ALL predictions with their probabilities and odds
  const allPredictions = []

  // 1X2 Predictions
  const teamAWin = outcome.team_a_win || 0
  const draw = outcome.draw || 0
  const teamBWin = outcome.team_b_win || 0

  if (teamAWin > 0) {
    const oddsInfo = oddsData?.outcomes?.team_a_win || {}
    allPredictions.push({
      category: '1X2',
      bet: `${teamAName} Win (1)`,
      probability: teamAWin,
      odds: oddsInfo.best_odds || null,
      bookmaker: oddsInfo.best_bookmaker || null,
      reasoning: `${teamAWin}% win probability based on form and H2H`
    })
  }
  if (draw > 0) {
    const oddsInfo = oddsData?.outcomes?.draw || {}
    allPredictions.push({
      category: '1X2',
      bet: 'Draw (X)',
      probability: draw,
      odds: oddsInfo.best_odds || null,
      bookmaker: oddsInfo.best_bookmaker || null,
      reasoning: `${draw}% draw probability`
    })
  }
  if (teamBWin > 0) {
    const oddsInfo = oddsData?.outcomes?.team_b_win || {}
    allPredictions.push({
      category: '1X2',
      bet: `${teamBName} Win (2)`,
      probability: teamBWin,
      odds: oddsInfo.best_odds || null,
      bookmaker: oddsInfo.best_bookmaker || null,
      reasoning: `${teamBWin}% win probability based on form and H2H`
    })
  }

  // Double Chance Predictions
  const dc = resultAnalysis?.double_chance || {}
  if (dc['1X']?.percentage >= 55) {
    allPredictions.push({
      category: 'Double Chance',
      bet: `${teamAName} or Draw (1X)`,
      probability: dc['1X'].percentage,
      odds: null,
      bookmaker: null,
      reasoning: `${teamAName} wins or draws in ${dc['1X'].percentage}% of H2H matches`
    })
  }
  if (dc['X2']?.percentage >= 55) {
    allPredictions.push({
      category: 'Double Chance',
      bet: `${teamBName} or Draw (X2)`,
      probability: dc['X2'].percentage,
      odds: null,
      bookmaker: null,
      reasoning: `${teamBName} wins or draws in ${dc['X2'].percentage}% of H2H matches`
    })
  }
  if (dc['12']?.percentage >= 65) {
    allPredictions.push({
      category: 'Double Chance',
      bet: 'No Draw (12)',
      probability: dc['12'].percentage,
      odds: null,
      bookmaker: null,
      reasoning: `Decisive result (no draw) in ${dc['12'].percentage}% of H2H matches`
    })
  }

  // Draw No Bet
  const dnb = resultAnalysis?.draw_no_bet || {}
  if (dnb.team_a?.percentage >= 55) {
    allPredictions.push({
      category: 'Draw No Bet',
      bet: `${teamAName} (DNB)`,
      probability: dnb.team_a.percentage,
      odds: null,
      bookmaker: null,
      reasoning: `${teamAName} wins ${dnb.team_a.percentage}% when excluding draws`
    })
  }
  if (dnb.team_b?.percentage >= 55) {
    allPredictions.push({
      category: 'Draw No Bet',
      bet: `${teamBName} (DNB)`,
      probability: dnb.team_b.percentage,
      odds: null,
      bookmaker: null,
      reasoning: `${teamBName} wins ${dnb.team_b.percentage}% when excluding draws`
    })
  }

  // Over/Under Goals Predictions
  const ouGoals = goalsAnalysis?.over_under || {}
  Object.entries(ouGoals).forEach(([key, data]) => {
    if (data.percentage >= 55) {
      const label = key.replace('over_', 'Over ').replace(/(\d)(\d)/, '$1.$2')
      allPredictions.push({
        category: 'Total Goals',
        bet: `${label} Goals`,
        probability: data.percentage,
        odds: null,
        bookmaker: null,
        reasoning: `${data.percentage}% of H2H matches had ${label.toLowerCase()} goals`
      })
    }
  })

  // BTTS Prediction
  const btts = goalsAnalysis?.btts || {}
  if (btts.yes?.percentage >= 50) {
    allPredictions.push({
      category: 'BTTS',
      bet: 'Both Teams to Score - Yes',
      probability: btts.yes.percentage,
      odds: null,
      bookmaker: null,
      reasoning: `Both teams scored in ${btts.yes.percentage}% of H2H matches`
    })
  }
  if (btts.no?.percentage >= 50) {
    allPredictions.push({
      category: 'BTTS',
      bet: 'Both Teams to Score - No',
      probability: btts.no.percentage,
      odds: null,
      bookmaker: null,
      reasoning: `At least one team failed to score in ${btts.no.percentage}% of H2H`
    })
  }

  // First Goal
  const firstGoal = resultAnalysis?.first_goal || {}
  if (firstGoal.team_a?.percentage >= 55) {
    allPredictions.push({
      category: '1st Goal',
      bet: `${teamAName} Scores First`,
      probability: firstGoal.team_a.percentage,
      odds: null,
      bookmaker: null,
      reasoning: `${teamAName} scores first ${firstGoal.team_a.percentage}% of the time`
    })
  }
  if (firstGoal.team_b?.percentage >= 55) {
    allPredictions.push({
      category: '1st Goal',
      bet: `${teamBName} Scores First`,
      probability: firstGoal.team_b.percentage,
      odds: null,
      bookmaker: null,
      reasoning: `${teamBName} scores first ${firstGoal.team_b.percentage}% of the time`
    })
  }

  // Team Totals
  const teamTotals = resultAnalysis?.team_totals || {}
  if (teamTotals.team_a?.over_05 >= 70) {
    allPredictions.push({
      category: 'Team Total',
      bet: `${teamAName} Over 0.5 Goals`,
      probability: teamTotals.team_a.over_05,
      odds: null,
      bookmaker: null,
      reasoning: `${teamAName} scores in ${teamTotals.team_a.over_05}% of matches`
    })
  }
  if (teamTotals.team_b?.over_05 >= 70) {
    allPredictions.push({
      category: 'Team Total',
      bet: `${teamBName} Over 0.5 Goals`,
      probability: teamTotals.team_b.over_05,
      odds: null,
      bookmaker: null,
      reasoning: `${teamBName} scores in ${teamTotals.team_b.over_05}% of matches`
    })
  }

  // First Half Markets
  const firstHalf = resultAnalysis?.first_half || {}
  if (firstHalf.over_05 >= 60) {
    allPredictions.push({
      category: '1st Half',
      bet: '1st Half Over 0.5 Goals',
      probability: firstHalf.over_05,
      odds: null,
      bookmaker: null,
      reasoning: `${firstHalf.over_05}% chance of goal in first half`
    })
  }
  if (firstHalf['1x2']?.draw >= 45) {
    allPredictions.push({
      category: '1st Half',
      bet: '1st Half Draw',
      probability: firstHalf['1x2'].draw,
      odds: null,
      bookmaker: null,
      reasoning: `${firstHalf['1x2'].draw}% of matches level at half-time`
    })
  }

  // Multigoals
  const multigoals = resultAnalysis?.multigoals || {}
  Object.entries(multigoals).forEach(([range, prob]) => {
    if (prob >= 50 && range !== '0' && range !== '7+') {
      allPredictions.push({
        category: 'Multigoals',
        bet: `${range} Total Goals`,
        probability: prob,
        odds: null,
        bookmaker: null,
        reasoning: `${prob}% probability of ${range} goals in match`
      })
    }
  })

  // Corner Predictions
  const ouCorners = cornerAnalysis?.over_under || {}
  Object.entries(ouCorners).forEach(([key, data]) => {
    if (data.percentage >= 55) {
      const label = key.replace('over_', 'Over ').replace(/(\d)(\d)/, '$1.$2')
      allPredictions.push({
        category: 'Total Corners',
        bet: `${label} Corners`,
        probability: data.percentage,
        odds: null,
        bookmaker: null,
        reasoning: `${data.percentage}% probability based on team corner averages`
      })
    }
  })

  // Corner 1x2
  const corner1x2 = cornerAnalysis?.corner_1x2 || {}
  if (corner1x2.team_a?.percentage >= 55) {
    allPredictions.push({
      category: 'Corner 1X2',
      bet: `${teamAName} Most Corners`,
      probability: corner1x2.team_a.percentage,
      odds: null,
      bookmaker: null,
      reasoning: `${teamAName} wins corner count ${corner1x2.team_a.percentage}% of matches`
    })
  }
  if (corner1x2.team_b?.percentage >= 55) {
    allPredictions.push({
      category: 'Corner 1X2',
      bet: `${teamBName} Most Corners`,
      probability: corner1x2.team_b.percentage,
      odds: null,
      bookmaker: null,
      reasoning: `${teamBName} wins corner count ${corner1x2.team_b.percentage}% of matches`
    })
  }

  // Corner Ranges
  const cornerRanges = cornerAnalysis?.corner_ranges || {}
  Object.entries(cornerRanges).forEach(([range, prob]) => {
    if (prob >= 40) {
      allPredictions.push({
        category: 'Corner Range',
        bet: `${range} Corners`,
        probability: prob,
        odds: null,
        bookmaker: null,
        reasoning: `${prob}% probability of ${range} total corners`
      })
    }
  })

  // Card Predictions
  const ouCards = cardAnalysis?.over_under || {}
  Object.entries(ouCards).forEach(([key, data]) => {
    if (data.percentage >= 55) {
      const label = key.replace('over_', 'Over ').replace('_cards', '').replace(/(\d)(\d)/, '$1.$2')
      allPredictions.push({
        category: 'Total Cards',
        bet: `${label} Cards`,
        probability: data.percentage,
        odds: null,
        bookmaker: null,
        reasoning: `${data.percentage}% probability based on team discipline records`
      })
    }
  })

  // Red Card
  const redCard = cardAnalysis?.red_card || {}
  if (redCard.no >= 85) {
    allPredictions.push({
      category: 'Red Card',
      bet: 'No Red Card',
      probability: redCard.no,
      odds: null,
      bookmaker: null,
      reasoning: `${redCard.no}% of matches have no red cards`
    })
  }

  // Calculate value score for each prediction
  // value_score = probability * log2(estimated_odds)
  // Higher odds with decent probability = better value for betting
  const MIN_PROBABILITY = 45
  allPredictions.forEach(pred => {
    const estimatedOdds = pred.odds || (100 / pred.probability)
    pred.estimatedOdds = estimatedOdds
    pred.valueScore = estimatedOdds > 1 ? pred.probability * Math.log2(estimatedOdds) : 0
  })

  // Value predictions: filter by min probability, sort by value score
  const valuePredictions = allPredictions
    .filter(p => p.probability >= MIN_PROBABILITY)
    .sort((a, b) => b.valueScore - a.valueScore)
    .slice(0, 5)

  // Safest predictions: sort by raw probability
  const safePredictions = [...allPredictions]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5)

  const bestValue = valuePredictions[0]

  // Determine confidence based on probability
  const getConfidence = (prob) => {
    if (prob >= 70) return 'High'
    if (prob >= 55) return 'Medium'
    return 'Low'
  }

  const getRisk = (valueScore) => {
    if (valueScore >= 60) return { label: 'Great Value', cls: 'great' }
    if (valueScore >= 35) return { label: 'Good Value', cls: 'good' }
    return { label: 'Fair Value', cls: 'fair' }
  }

  return (
    <div className="analysis-section final-prediction">
      <h3 className="section-title">{t('match.aiAnalysis')}</h3>
      <p className="section-subtitle">AI-ranked predictions balancing probability with betting value</p>

      {/* Best Value Prediction */}
      {bestValue && (
        <div className="prediction-main">
          <div className="prediction-bet">
            <div className="bet-label">BEST VALUE BET - {bestValue.category}</div>
            <div className="bet-value">{bestValue.bet}</div>
            <div className={`bet-confidence confidence-${getConfidence(bestValue.probability).toLowerCase()}`}>
              {bestValue.probability}% Probability - {getConfidence(bestValue.probability)} Confidence
            </div>
          </div>
        </div>
      )}

      {/* Best Value Predictions */}
      <div className="prediction-reasoning">
        <h4>Best Value Predictions</h4>
        <p className="value-explainer">Ranked by value score based on probability strength</p>
        <div className="top-predictions-grid">
          {valuePredictions.map((pred, idx) => (
            <div key={idx} className={`top-prediction-card ${idx === 0 ? 'best' : ''}`}>
              <div className="pred-category">{pred.category}</div>
              <div className="pred-bet">{pred.bet}</div>
              <div className="pred-stats">
                <span className="pred-probability">{pred.probability}%</span>
              </div>
              <div className={`pred-value-score value-${getRisk(pred.valueScore).cls}`}>
                Value: {pred.valueScore.toFixed(0)}
              </div>
              <div className="pred-reason">{pred.reasoning}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Safest Bets */}
      <div className="prediction-reasoning">
        <h4>Safest Bets</h4>
        <p className="value-explainer">Ranked by raw probability - highest likelihood of winning</p>
        <div className="top-predictions-grid">
          {safePredictions.map((pred, idx) => (
            <div key={idx} className={`top-prediction-card ${idx === 0 ? 'best' : ''}`}>
              <div className="pred-category">{pred.category}</div>
              <div className="pred-bet">{pred.bet}</div>
              <div className="pred-stats">
                <span className="pred-probability">{pred.probability}%</span>
              </div>
              <div className="pred-reason">{pred.reasoning}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 1X2 Probability Bars */}
      <div className="prediction-probabilities">
        <h4>Match Result Probabilities (1X2)</h4>
        <div className="prob-bars">
          <div className="prob-bar-row">
            <span className="prob-label">{teamAName} (1)</span>
            <div className="prob-bar">
              <div className="prob-fill home" style={{ width: `${teamAWin}%` }}></div>
            </div>
            <span className="prob-value">{teamAWin}%</span>
          </div>
          <div className="prob-bar-row">
            <span className="prob-label">Draw (X)</span>
            <div className="prob-bar">
              <div className="prob-fill draw" style={{ width: `${draw}%` }}></div>
            </div>
            <span className="prob-value">{draw}%</span>
          </div>
          <div className="prob-bar-row">
            <span className="prob-label">{teamBName} (2)</span>
            <div className="prob-bar">
              <div className="prob-fill away" style={{ width: `${teamBWin}%` }}></div>
            </div>
            <span className="prob-value">{teamBWin}%</span>
          </div>
        </div>
      </div>

      {/* Quick Summary of All Markets */}
      <div className="markets-summary">
        <h4>Quick Market Summary</h4>
        <div className="market-summary-grid">
          <div className="market-item">
            <span className="market-label">Double Chance</span>
            <span className="market-value">
              {dc['1X']?.percentage >= dc['X2']?.percentage && dc['1X']?.percentage >= dc['12']?.percentage
                ? `1X (${dc['1X']?.percentage}%)`
                : dc['X2']?.percentage >= dc['12']?.percentage
                  ? `X2 (${dc['X2']?.percentage}%)`
                  : `12 (${dc['12']?.percentage}%)`}
            </span>
          </div>
          <div className="market-item">
            <span className="market-label">Over/Under 2.5</span>
            <span className="market-value">
              {(ouGoals.over_25?.percentage || 0) >= 50
                ? `Over (${ouGoals.over_25?.percentage}%)`
                : `Under (${100 - (ouGoals.over_25?.percentage || 50)}%)`}
            </span>
          </div>
          <div className="market-item">
            <span className="market-label">BTTS</span>
            <span className="market-value">
              {(btts.yes?.percentage || 0) >= 50
                ? `Yes (${btts.yes?.percentage}%)`
                : `No (${btts.no?.percentage}%)`}
            </span>
          </div>
          <div className="market-item">
            <span className="market-label">Draw No Bet</span>
            <span className="market-value">
              {dnb.team_a?.percentage >= dnb.team_b?.percentage
                ? `${teamAName.split(' ')[0]} (${dnb.team_a?.percentage}%)`
                : `${teamBName.split(' ')[0]} (${dnb.team_b?.percentage}%)`}
            </span>
          </div>
          <div className="market-item">
            <span className="market-label">1st Goal</span>
            <span className="market-value">
              {firstGoal.team_a?.percentage >= firstGoal.team_b?.percentage
                ? `${teamAName.split(' ')[0]} (${firstGoal.team_a?.percentage}%)`
                : `${teamBName.split(' ')[0]} (${firstGoal.team_b?.percentage}%)`}
            </span>
          </div>
          <div className="market-item">
            <span className="market-label">Total Corners</span>
            <span className="market-value">
              {cornerAnalysis.expected_total
                ? `~${cornerAnalysis.expected_total}`
                : 'N/A'}
            </span>
          </div>
          <div className="market-item">
            <span className="market-label">Corner Winner</span>
            <span className="market-value">
              {corner1x2.team_a?.percentage >= corner1x2.team_b?.percentage
                ? `${teamAName.split(' ')[0]} (${corner1x2.team_a?.percentage}%)`
                : `${teamBName.split(' ')[0]} (${corner1x2.team_b?.percentage}%)`}
            </span>
          </div>
          <div className="market-item">
            <span className="market-label">Red Card</span>
            <span className="market-value">
              {redCard.no >= 80 ? `No (${redCard.no}%)` : `Yes (${redCard.yes}%)`}
            </span>
          </div>
        </div>
      </div>

    </div>
  )
}

function CountdownTimer({ resetAt, onExpire }) {
  const [timeLeft, setTimeLeft] = useState('')
  useEffect(() => {
    const update = () => {
      const diff = new Date(resetAt).getTime() - Date.now()
      if (diff <= 0) { onExpire?.(); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${h}h ${m}m ${s}s`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [resetAt, onExpire])
  return <span className="analysis-countdown">{timeLeft}</span>
}

export default function MatchAnalysis() {
  const { t } = useTranslation()
  const { competitionId, homeId, awayId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [fixture, setFixture] = useState(location.state?.fixture || null)
  const competition = competitionId || 'PL'
  const competitionName = COMPETITION_NAMES[competition] || fixture?.competition?.name || 'League'
  const fixtureId = fixture?.id

  const { user } = useAuth()
  const [prediction, setPrediction] = useState(null)
  const [h2hData, setH2hData] = useState(null)
  const [matchStats, setMatchStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lineups, setLineups] = useState(null)
  const [liveData, setLiveData] = useState(null)
  const [liveStats, setLiveStats] = useState(null)
  const [showChat, setShowChat] = useState(true)
  const [viewBlocked, setViewBlocked] = useState(false)
  const [viewResetAt, setViewResetAt] = useState(null)
  const [balanceUsd, setBalanceUsd] = useState(0)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [fetchTrigger, setFetchTrigger] = useState(0)
  const pollRef = useRef(null)
  const matchKey = `${homeId}-${awayId}-${competition}`

  const isLive = (status) => ['1H', '2H', 'LIVE', 'ET', 'HT'].includes(status)
  const matchIsLive = isLive(liveData?.status || fixture?.status)

  // If fixture not passed in state, try to find it from today's fixtures
  useEffect(() => {
    if (fixture) return
    const findFixture = async () => {
      try {
        const [liveRes, todayRes] = await Promise.allSettled([
          axios.get('/api/live-matches'),
          axios.get(`/api/fixtures/${competition}`)
        ])
        const allMatches = [
          ...(liveRes.status === 'fulfilled' ? liveRes.value.data.matches || [] : []),
          ...(todayRes.status === 'fulfilled' ? todayRes.value.data.fixtures || todayRes.value.data || [] : [])
        ]
        const match = allMatches.find(m =>
          String(m.home_team?.id) === String(homeId) && String(m.away_team?.id) === String(awayId)
        )
        if (match) setFixture(match)
      } catch { /* ignore */ }
    }
    findFixture()
  }, [homeId, awayId, competition])

  // Fetch prediction, H2H, match stats
  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true)
      setError(null)

      // Check & record analysis view for free users
      if (user && user.tier !== 'pro' && user.tier !== 'trial') {
        try {
          const viewRes = await axios.post('/api/analysis-views/record', { match_key: matchKey })
          if (!viewRes.data.allowed) {
            setViewBlocked(true)
            setViewResetAt(viewRes.data.reset_at)
            // Fetch balance to show "Use Balance" option
            try {
              const balRes = await axios.get('/api/user/balance')
              setBalanceUsd(balRes.data.balance?.balance_usd || 0)
            } catch { /* ignore */ }
            setLoading(false)
            return
          }
        } catch (err) {
          if (err.response?.status === 401) {
            // Not logged in, let them view (or handle differently)
          }
        }
      }

      try {
        const requests = [
          axios.post('/api/predict', {
            team_a_id: parseInt(homeId),
            team_b_id: parseInt(awayId),
            venue: 'team_a',
            competition: competition,
            team_a_name: fixture?.home_team?.name || null,
            team_b_name: fixture?.away_team?.name || null
          }),
          axios.get(`/api/h2h-analysis/${homeId}/${awayId}?competition=${competition}`),
          axios.get(`/api/match-stats/${homeId}/${awayId}?competition=${competition}`),
        ]
        // Fetch lineups if we have a fixture ID
        if (fixtureId) {
          requests.push(axios.get(`/api/fixture-lineups/${fixtureId}`))
        }

        const [predictionResult, h2hResult, statsResult, lineupsResult] = await Promise.allSettled(requests)

        if (predictionResult.status === 'fulfilled') {
          if (predictionResult.value.data.error) {
            setError(predictionResult.value.data.error)
          } else {
            setPrediction(predictionResult.value.data)
          }
        } else {
          console.error('Prediction API failed:', predictionResult.reason)
          setError('Failed to get match prediction. Please try again.')
        }

        if (h2hResult.status === 'fulfilled') {
          setH2hData(h2hResult.value.data)
        }

        if (statsResult.status === 'fulfilled') {
          setMatchStats(statsResult.value.data)
        }

        if (lineupsResult?.status === 'fulfilled' && lineupsResult.value.data.lineups) {
          setLineups(lineupsResult.value.data.lineups)
        }
      } catch (err) {
        console.error('Error fetching data:', err)
        setError('Failed to analyze match. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchAllData()
  }, [homeId, awayId, competition, fixtureId, fetchTrigger])

  // Fetch fixture statistics (possession, shots, corners, etc.)
  const fetchLiveStats = useCallback(async () => {
    if (!fixtureId) return
    try {
      const res = await axios.get(`/api/live-stats/${fixtureId}`)
      const rawStats = res.data.statistics
      if (rawStats && typeof rawStats === 'object') {
        const parsed = { home: {}, away: {} }
        const homeTeamId = fixture?.home_team?.id || parseInt(homeId)
        const awayTeamId = fixture?.away_team?.id || parseInt(awayId)
        Object.entries(rawStats).forEach(([teamId, data]) => {
          if (parseInt(teamId) === homeTeamId) parsed.home = data.stats || data || {}
          else if (parseInt(teamId) === awayTeamId) parsed.away = data.stats || data || {}
        })
        if (Object.keys(parsed.home).length > 0 || Object.keys(parsed.away).length > 0) {
          setLiveStats(parsed)
        }
      }
    } catch (e) {
      // Stats not available yet - that's fine
    }
  }, [fixtureId, fixture?.home_team?.id, fixture?.away_team?.id, homeId, awayId])

  // Poll for live match data every 30 seconds when match is live
  const pollLiveData = useCallback(async () => {
    if (!fixtureId) return
    try {
      const res = await axios.get(`/api/live-match-data/${fixtureId}`)
      if (res.data && res.data.status) {
        setLiveData(res.data)
      }
    } catch (e) {
      console.error('Live poll error:', e)
    }
  }, [fixtureId])

  // Fetch stats once on mount for any match that has a fixture ID (live, FT, PEN, etc.)
  useEffect(() => {
    if (fixtureId) {
      fetchLiveStats()
    }
  }, [fixtureId, fetchLiveStats])

  // Poll live data + stats for active matches
  useEffect(() => {
    const matchStatus = fixture?.status
    const isActiveMatch = isLive(matchStatus) || ['FT', 'AET', 'PEN', 'P'].includes(matchStatus)
    if (fixtureId && isActiveMatch) {
      pollLiveData()
      const interval = setInterval(() => {
        pollLiveData()
        if (isLive(matchStatus)) fetchLiveStats()
      }, 30000)
      pollRef.current = interval
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fixtureId, fixture?.status, pollLiveData, fetchLiveStats])

  const teamAName = prediction?.match_info?.team_a?.name || fixture?.home_team?.name || 'Home Team'
  const teamBName = prediction?.match_info?.team_b?.name || fixture?.away_team?.name || 'Away Team'

  // Use polled live data if available, otherwise fixture data
  const currentGoals = liveData?.goals || fixture?.goals
  const currentStatus = liveData?.status || fixture?.status
  const currentElapsed = liveData?.elapsed || fixture?.elapsed
  const currentAnalysis = liveData?.live_analysis || fixture?.live_analysis
  const currentStatistics = liveStats || null
  const currentEvents = liveData?.events || fixture?.events || []

  const getMatchStatus = (status, elapsed) => {
    switch (status) {
      case '1H': case '2H': case 'LIVE': return `${elapsed}'`
      case 'HT': return 'HT'
      case 'FT': return 'FT'
      case 'ET': return `ET ${elapsed}'`
      case 'AET': return 'AET'
      case 'P': case 'PEN': return 'PEN'
      default: return status || ''
    }
  }

  return (
    <div className="match-analysis-page">
      <button className="back-btn" onClick={() => navigate(-1)}>
        ← Back to {location.state?.from === 'predictions' ? 'Predictions' : location.state?.from === 'upcoming' ? 'Upcoming Matches' : `${competitionName} Fixtures`}
      </button>

      <div className="header-disclaimer" style={{ margin: '0 auto 16px', maxWidth: 520 }}>
        <span className="disclaimer-icon">⚠</span>
        <span>Predictions are probabilistic estimates only. Always gamble responsibly.</span>
      </div>

      {/* Match Header */}
      <div className={`match-header-card ${matchIsLive ? 'header-live' : ''}`}>
        <div className="match-header-teams">
          <div className="match-header-team home">
            {fixture?.home_team?.crest && (
              <img src={fixture.home_team.crest} alt="" className="header-crest" />
            )}
            <div className="header-team-info">
              <span className="header-team-name">{teamAName}</span>
              <span className="header-team-label">HOME</span>
            </div>
          </div>

          {/* Live Score or VS */}
          <div className="match-header-vs">
            {currentGoals && (currentStatus && currentStatus !== 'NS') ? (
              <div className="header-live-score">
                {matchIsLive && <span className="header-live-badge">{t('liveScores.liveNow')}</span>}
                <div className="header-score-display">
                  <span className="header-score-num">{currentGoals.home ?? 0}</span>
                  <span className="header-score-sep">-</span>
                  <span className="header-score-num">{currentGoals.away ?? 0}</span>
                </div>
                <span className="header-match-time">
                  {getMatchStatus(currentStatus, currentElapsed)}
                </span>
              </div>
            ) : (
              <>
                <span className="vs-text">VS</span>
                {fixture?.date && (
                  <span className="match-datetime">{formatDateTime(fixture.date)}</span>
                )}
              </>
            )}
          </div>

          <div className="match-header-team away">
            <div className="header-team-info">
              <span className="header-team-name">{teamBName}</span>
              <span className="header-team-label">AWAY</span>
            </div>
            {fixture?.away_team?.crest && (
              <img src={fixture.away_team.crest} alt="" className="header-crest" />
            )}
          </div>
        </div>

        <div className="match-header-meta">
          <span className="competition-name">
            {prediction?.match_info?.competition || competitionName}
          </span>
        </div>
      </div>

      {loading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t('match.analyzing')}</p>
          <p className="loading-hint">Fetching H2H, corners, cards, and odds data</p>
        </div>
      )}

      {error && (
        <div className="error-banner">
          {error}
          <button className="retry-btn" onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      )}

      {/* Live Match Statistics - Free tier (always visible, even when views are blocked) */}
      {!loading && currentStatistics && (
        <LiveMatchStatsPanel
          statistics={currentStatistics}
          teamAName={teamAName}
          teamBName={teamBName}
          homeTeamCrest={fixture?.home_team?.crest}
          awayTeamCrest={fixture?.away_team?.crest}
          homeTeamId={fixture?.home_team?.id}
          goals={currentGoals}
          status={currentStatus}
          elapsed={currentElapsed}
          events={currentEvents}
        />
      )}

      {viewBlocked && (
        <div className="analysis-view-blocked">
          <div className="analysis-blurred-placeholder">
            <div className="blurred-card" /><div className="blurred-card short" /><div className="blurred-card" />
          </div>
          <div className="analysis-blocked-overlay">
            <div className="analysis-blocked-icon">{'\u{1F512}'}</div>
            <h2 className="analysis-blocked-title">Free Views Used Up</h2>
            <p className="analysis-blocked-text">
              You've used your 3 free match analyses.
              {viewResetAt && (<>
                {' '}Your free views reset in{' '}
                <CountdownTimer resetAt={viewResetAt} onExpire={() => { setViewBlocked(false); window.location.reload() }} />.
              </>)}
            </p>
            {balanceUsd >= 0.50 && (
              <button
                className="balance-pay-btn"
                disabled={balanceLoading}
                onClick={async () => {
                  setBalanceLoading(true)
                  try {
                    const deductRes = await axios.post('/api/balance/use-for-analysis')
                    if (deductRes.data.success) {
                      await axios.post('/api/analysis-views/record', { match_key: matchKey, balance_paid: true })
                      setBalanceUsd(deductRes.data.balance?.balance_usd || 0)
                      setViewBlocked(false)
                      setFetchTrigger(prev => prev + 1)
                    }
                  } catch { /* ignore */ }
                  setBalanceLoading(false)
                }}
              >
                {balanceLoading ? 'Processing...' : `Use 250 Credits \u2014 $${balanceUsd.toFixed(2)} available`}
              </button>
            )}
            <Link to="/upgrade" className="analysis-blocked-upgrade-btn">
              {'\u{1F680}'} {balanceUsd < 0.50 ? 'Add Credits to Unlock' : 'Upgrade to Pro for Unlimited Access'}
            </Link>
            <button className="analysis-blocked-back-btn" onClick={() => navigate(-1)}>
              ← Go Back
            </button>
          </div>
        </div>
      )}

      {!loading && !error && !viewBlocked && (
        <div className="analysis-results">
          {/* AI Disclaimer Banner */}
          <div className="ai-disclaimer-banner">
            <div className="disclaimer-icon">&#9888;</div>
            <div className="disclaimer-text">
              <strong>Disclaimer</strong> — The probabilities displayed on this page are AI-generated estimates based on historical head-to-head records, recent form, and team performance data. They are intended for informational purposes only and do not guarantee outcomes. We strongly advise conducting your own analysis and exercising independent judgement before making any betting decisions. <strong>Please gamble responsibly.</strong>
            </div>
          </div>

          {/* Live Analysis (real-time polled or from fixture) */}
          {currentAnalysis && (
            <LiveAnalysisSection
              analysis={currentAnalysis}
              teamAName={teamAName}
              teamBName={teamBName}
            />
          )}

          {/* Formation & Lineups */}
          {lineups && <FormationDisplay lineups={lineups} />}

          {/* Collapsible H2H Section (combines Direct H2H, Home Form, Away Form) */}
          {h2hData && (
            <CollapsibleH2H
              h2hData={h2hData}
              teamAName={teamAName}
              teamBName={teamBName}
              homeId={homeId}
              awayId={awayId}
            />
          )}

          {/* Additional Goal Markets (Draw No Bet, First Goal, Team Totals, etc.) */}
          {h2hData && (
            <GoalMarketsSection
              h2hData={h2hData}
              teamAName={teamAName}
              teamBName={teamBName}
              matchId={`${homeId}-${awayId}`}
              matchName={`${teamAName} vs ${teamBName}`}
            />
          )}

          {/* Corners Analysis */}
          {matchStats?.corner_analysis && (
            <CornersSection
              cornerAnalysis={matchStats.corner_analysis}
              teamAName={teamAName}
              teamBName={teamBName}
              matchId={`${homeId}-${awayId}`}
              matchName={`${teamAName} vs ${teamBName}`}
            />
          )}

          {/* Cards Analysis */}
          {matchStats?.card_analysis && (
            <CardsSection
              cardAnalysis={matchStats.card_analysis}
              teamAName={teamAName}
              teamBName={teamBName}
              matchId={`${homeId}-${awayId}`}
              matchName={`${teamAName} vs ${teamBName}`}
            />
          )}

          {/* Form Badges & Motivation */}
          {h2hData && (
            <FormAndMotivation
              h2hData={h2hData}
              teamAName={teamAName}
              teamBName={teamBName}
            />
          )}

          {/* Goals Per Minute */}
          {matchStats && (
            <GoalsPerMinute
              matchStats={matchStats}
              teamAName={teamAName}
              teamBName={teamBName}
            />
          )}

          {/* Squad Info (Stability, Injuries, Coach) */}
          {matchStats && (
            <SquadInfo
              matchStats={matchStats}
              teamAName={teamAName}
              teamBName={teamBName}
            />
          )}

          {/* Player Impact */}
          <PlayerImpact players={prediction?.players} matchInfo={prediction?.match_info} />

          {/* Final Prediction - Always at the bottom */}
          <FinalPrediction
            prediction={prediction}
            h2hData={h2hData}
            matchStats={matchStats}
            odds={prediction?.odds}
            teamAName={teamAName}
            teamBName={teamBName}
          />
        </div>
      )}

      {showChat && fixtureId && !viewBlocked && (
        <LiveChatPopup
          matchKey={String(fixtureId)}
          matchName={`${teamAName} vs ${teamBName}`}
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  )
}
