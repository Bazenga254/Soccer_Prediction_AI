function posClass(pos) {
  if (pos === 'GK')  return 'pos-gk'
  if (pos === 'DEF') return 'pos-def'
  if (pos === 'MID') return 'pos-mid'
  return 'pos-fwd'
}

function PlayerCard({ player }) {
  return (
    <div className="player-card">
      <div className="player-top">
        {player.photo ? (
          <img src={player.photo} alt="" className="player-photo" />
        ) : (
          <div className="player-num">#{player.shirt_number}</div>
        )}
        <div className="player-mid">
          <h4>{player.name}</h4>
          <div className="player-meta-row">
            <span className={`pos-badge ${posClass(player.position)}`}>{player.position}</span>
            {player.shirt_number > 0 && player.photo && (
              <span className="player-shirt">#{player.shirt_number}</span>
            )}
            {player.rating > 0 && (
              <span className={`player-rating ${player.rating >= 7.0 ? 'rating-high' : player.rating >= 6.5 ? 'rating-mid' : 'rating-low'}`}>
                {player.rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
        <div className="impact-box">
          <span className="impact-num">{player.impact_score}</span>
          <span className="impact-denom">/10</span>
        </div>
      </div>

      <div className="stat-list">
        <div className="stat-line">
          <span className="s-label">Scoring Probability</span>
          <span className="s-value">{player.scoring_prob}%</span>
        </div>
        <div className="stat-line">
          <span className="s-label">Assist Likelihood</span>
          <span className="s-value">{player.assist_prob}%</span>
        </div>
        {player.shot_accuracy > 0 && (
          <div className="stat-line">
            <span className="s-label">Shot Accuracy</span>
            <span className="s-value">{player.shot_accuracy}%</span>
          </div>
        )}
        {(player.position === 'DEF' || player.position === 'GK') && player.clean_sheet_rate > 0 && (
          <div className="stat-line">
            <span className="s-label">Clean Sheet Rate</span>
            <span className="s-value">{player.clean_sheet_rate}%</span>
          </div>
        )}
        {player.position === 'MID' && player.key_passes_per_game > 0 && (
          <div className="stat-line">
            <span className="s-label">Key Passes / Game</span>
            <span className="s-value">{player.key_passes_per_game}</span>
          </div>
        )}
        <div className="stat-line">
          <span className="s-label">Card Risk</span>
          <span className={`risk-badge ${player.card_risk.toLowerCase()}`}>
            {player.card_risk} ({player.card_risk_prob}%)
          </span>
        </div>
      </div>

      <div className="player-season-row">
        <span>{player.goals} goals</span>
        <span>•</span>
        <span>{player.assists} assists</span>
        <span>•</span>
        <span>{player.games_played} apps</span>
      </div>
    </div>
  )
}

export default function PlayerImpact({ players, matchInfo }) {
  if (!players?.team_a?.length && !players?.team_b?.length) return null

  return (
    <section className="card">
      <h2 className="card-title">Player Impact Analysis</h2>
      <div className="players-grid">
        <div>
          <div className="team-column-title title-green">{matchInfo?.team_a?.name || 'Home'}</div>
          {(players.team_a || []).map(p => <PlayerCard key={p.id} player={p} />)}
        </div>
        <div>
          <div className="team-column-title title-blue">{matchInfo?.team_b?.name || 'Away'}</div>
          {(players.team_b || []).map(p => <PlayerCard key={p.id} player={p} />)}
        </div>
      </div>
    </section>
  )
}
