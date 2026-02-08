export default function OutcomeProbabilities({ outcome, matchInfo }) {
  const { team_a_win, draw, team_b_win, confidence, key_factors } = outcome

  const confClass = confidence === 'High' ? 'conf-high' : confidence === 'Medium' ? 'conf-medium' : 'conf-low'

  const bars = [
    { label: matchInfo.team_a.name + ' Win', value: team_a_win, fill: 'fill-green' },
    { label: 'Draw',                         value: draw,       fill: 'fill-yellow' },
    { label: matchInfo.team_b.name + ' Win', value: team_b_win, fill: 'fill-blue' },
  ]

  return (
    <section className="card">
      <div className="outcome-header">
        <h2>Match Outcome Probabilities</h2>
        <span className={`confidence-badge ${confClass}`}>Confidence: {confidence}</span>
      </div>

      <div className="fixture-display">
        <div className="fixture-teams">
          <span className="fixture-team-name">{matchInfo.team_a.name}</span>
          <span className="fixture-vs">vs</span>
          <span className="fixture-team-name">{matchInfo.team_b.name}</span>
        </div>
        <div className="fixture-meta">
          {matchInfo.competition} &nbsp;•&nbsp; Venue: {matchInfo.venue === 'team_a' ? matchInfo.team_a.name : matchInfo.team_b.name}'s Home
        </div>
      </div>

      <div className="prob-bars">
        {bars.map(b => (
          <div className="prob-row" key={b.label}>
            <span className="prob-label">{b.label}</span>
            <div className="prob-track">
              <div className={`prob-fill ${b.fill}`} style={{ width: `${b.value}%` }}>
                <span className="prob-number">{b.value}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="key-factors">
        <div className="key-factors-title">Key Influencing Factors</div>
        <ol>
          {key_factors.map((f, i) => <li key={i}>{f}</li>)}
        </ol>
      </div>
    </section>
  )
}
