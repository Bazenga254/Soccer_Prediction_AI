function icon(severity) {
  if (severity === 'high')   return '🔴'
  if (severity === 'medium') return '🟡'
  return 'ℹ️'
}

export default function RiskFactors({ risks }) {
  return (
    <section className="card">
      <h2 className="card-title">Risk Factors & Disclaimers</h2>
      <div className="risk-list">
        {risks.map((r, i) => (
          <div key={i} className={`risk-item sev-${r.severity}`}>
            <span className="risk-icon">{icon(r.severity)}</span>
            <p>{r.message}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
