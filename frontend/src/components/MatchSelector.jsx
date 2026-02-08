export default function MatchSelector({ teams, teamA, teamB, venue, onTeamAChange, onTeamBChange, onVenueChange, onPredict, loading }) {
  const nameA = teams.find(t => String(t.id) === String(teamA))?.name || 'Team A'
  const nameB = teams.find(t => String(t.id) === String(teamB))?.name || 'Team B'

  return (
    <section className="card match-selector">
      <h2 className="section-title">Select Match</h2>
      <div className="selector-row">
        <div className="team-select-group">
          <label>Team A</label>
          <select value={teamA} onChange={e => onTeamAChange(e.target.value)}>
            <option value="">Choose a team...</option>
            {teams.map(t => (
              <option key={t.id} value={t.id} disabled={String(t.id) === String(teamB)}>
                {t.name}  (League #{t.position})
              </option>
            ))}
          </select>
        </div>
        <div className="vs-badge">VS</div>
        <div className="team-select-group">
          <label>Team B</label>
          <select value={teamB} onChange={e => onTeamBChange(e.target.value)}>
            <option value="">Choose a team...</option>
            {teams.map(t => (
              <option key={t.id} value={t.id} disabled={String(t.id) === String(teamA)}>
                {t.name}  (League #{t.position})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="venue-row">
        <span>Venue:</span>
        <div className="radio-group">
          <label className={`radio-option ${venue === 'team_a' ? 'active' : ''}`}>
            <input type="radio" name="venue" value="team_a" checked={venue === 'team_a'} onChange={e => onVenueChange(e.target.value)} />
            {nameA} Home
          </label>
          <label className={`radio-option ${venue === 'team_b' ? 'active' : ''}`}>
            <input type="radio" name="venue" value="team_b" checked={venue === 'team_b'} onChange={e => onVenueChange(e.target.value)} />
            {nameB} Home
          </label>
        </div>
      </div>

      <button
        className="predict-btn"
        onClick={onPredict}
        disabled={!teamA || !teamB || loading || String(teamA) === String(teamB)}
      >
        {loading ? 'Analyzing...' : 'Analyze Match'}
      </button>
    </section>
  )
}
