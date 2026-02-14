export default function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className="admin-stat-card" style={color ? { borderLeftColor: color } : undefined}>
      {icon && <div className="admin-stat-icon">{icon}</div>}
      <div className="admin-stat-content">
        <div className="admin-stat-value">{value ?? '—'}</div>
        <div className="admin-stat-label">{label}</div>
        {sub && <div className="admin-stat-sub">{sub}</div>}
      </div>
    </div>
  )
}
