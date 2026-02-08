function stars(n) {
  return '\u2605'.repeat(n) + '\u2606'.repeat(5 - n)
}

function OddsMarket({ data }) {
  return (
    <div className={`odds-market ${data.has_value ? 'value-detected' : ''}`}>
      <div className="odds-mkt-header">
        <h3>{data.label}</h3>
        <div className="odds-mkt-meta">
          <span className="ai-prob-tag">AI Prob: {data.ai_prob}%</span>
          {data.has_value && <span className="value-tag">+{data.value_edge}% edge</span>}
        </div>
      </div>

      <table className="odds-table">
        <thead>
          <tr>
            <th>Bookmaker</th>
            <th>Odds</th>
            <th>Impl. Prob</th>
          </tr>
        </thead>
        <tbody>
          {data.odds.map((o, i) => (
            <tr key={i} className={o.is_best ? 'best-row' : ''}>
              <td>{o.is_best && <span className="best-tag">BEST</span>}{o.bookmaker}</td>
              <td>{o.odds.toFixed(2)}</td>
              <td>{o.implied_prob}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="odds-mkt-footer">
        <span>Best: {data.best_odds.toFixed(2)} @ {data.best_bookmaker} | Avg: {data.avg_odds.toFixed(2)}</span>
        <span className="star-rating">{stars(data.value_rating)}</span>
      </div>
    </div>
  )
}

export default function OddsComparison({ odds, matchInfo }) {
  const { outcomes, recommendation } = odds

  return (
    <section className="card">
      <h2 className="card-title">Odds Comparison & Value Detection</h2>

      <div className="odds-markets">
        <OddsMarket data={{ ...outcomes.team_a_win, label: matchInfo.team_a.name + ' Win' }} />
        <OddsMarket data={{ ...outcomes.draw, label: 'Draw' }} />
        <OddsMarket data={{ ...outcomes.team_b_win, label: matchInfo.team_b.name + ' Win' }} />
      </div>

      {recommendation && (
        <div className={`recommendation-box ${recommendation.has_value ? 'has-value' : 'no-value'}`}>
          <h3>Recommendation</h3>
          <p>
            <strong>Best Value:</strong> {recommendation.label} @ {recommendation.odds.toFixed(2)} with {recommendation.bookmaker}
          </p>
          <p className="rec-reason">
            {recommendation.has_value
              ? `AI probability (${outcomes[recommendation.outcome].ai_prob}%) exceeds the implied probability by ${recommendation.edge}% — potential value bet identified.`
              : 'No strong value detected across current market odds. Exercise caution before placing bets.'}
          </p>
        </div>
      )}
    </section>
  )
}
