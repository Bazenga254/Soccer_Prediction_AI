import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'
import StatCard from '../components/StatCard'

const FLAG_LABELS = {
  high_clicks_no_engagement: 'High clicks, no engagement',
  suspicious_click_ratio: 'Suspicious click ratio (>80%)',
  review_purchase_volume: 'High purchase volume',
  possible_bot_views: 'Possible bot views',
}

export default function CreatorAnalyticsTab() {
  const { getAuthHeaders } = useAdmin()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/creator-analytics', {
        headers: getAuthHeaders()
      })
      setData(res.data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="admin-tab-content">
        <div className="admin-loading">
          <div className="admin-loading-spinner" />
          <p>Loading creator analytics...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="admin-tab-content">
        <div className="admin-error-banner">Failed to load analytics</div>
      </div>
    )
  }

  let creators = data.creators || []
  if (filter === 'flagged') creators = creators.filter(c => c.has_flags)
  if (search.trim()) {
    const q = search.toLowerCase()
    creators = creators.filter(c =>
      c.display_name.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q)
    )
  }

  return (
    <div className="admin-tab-content">
      <h2 className="admin-tab-title">Creator Analytics</h2>

      {/* Summary Stats */}
      <div className="admin-stats-grid">
        <StatCard label="Total Creators" value={data.summary.total_creators} icon="👥" color="#3498db" />
        <StatCard label="Flagged" value={data.summary.flagged_creators} icon="⚠️" color="#e74c3c" />
        <StatCard label="Total Views" value={(data.summary.total_views_all || 0).toLocaleString()} icon="👁️" color="#2ecc71" />
        <StatCard label="Total Clicks" value={(data.summary.total_clicks_all || 0).toLocaleString()} icon="👆" color="#8b5cf6" />
        <StatCard label="Total Revenue" value={`$${(data.summary.total_revenue_all || 0).toFixed(2)}`} icon="💰" color="#f39c12" />
      </div>

      {/* Filters */}
      <div style={s.filterBar}>
        <div style={s.filterTabs}>
          <button
            style={{...s.filterTab, ...(filter === 'all' ? s.filterTabActive : {})}}
            onClick={() => setFilter('all')}
          >
            All ({data.creators.length})
          </button>
          <button
            style={{...s.filterTab, ...(filter === 'flagged' ? s.filterTabActive : {})}}
            onClick={() => setFilter('flagged')}
          >
            Flagged ({data.summary.flagged_creators})
          </button>
        </div>
        <input
          type="text"
          placeholder="Search creators..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={s.searchInput}
        />
        <button style={s.refreshBtn} onClick={() => { setLoading(true); fetchData() }}>
          Refresh
        </button>
      </div>

      {/* Creator Table */}
      {creators.length === 0 ? (
        <div style={s.empty}>
          <p>{filter === 'flagged' ? 'No flagged creators found.' : 'No creators found.'}</p>
        </div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Creator</th>
                <th style={s.thNum}>Preds</th>
                <th style={s.thNum}>Views</th>
                <th style={s.thNum}>Clicks</th>
                <th style={s.thNum}>CTR</th>
                <th style={s.thNum}>Likes</th>
                <th style={s.thNum}>Cmts</th>
                <th style={s.thNum}>Rating</th>
                <th style={s.thNum}>Buys</th>
                <th style={s.thNum}>Revenue</th>
                <th style={s.thNum}>Earned</th>
                <th style={s.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {creators.map(c => (
                <tr key={c.user_id} style={c.has_flags ? s.flaggedRow : {}}>
                  <td style={s.td}>
                    <div style={s.creatorCell}>
                      <div style={{...s.avatar, background: c.avatar_color}}>
                        {(c.display_name || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <strong style={{fontSize: 13, color: '#e2e8f0'}}>{c.display_name}</strong>
                        <div style={{fontSize: 11, color: '#64748b'}}>@{c.username}</div>
                      </div>
                    </div>
                  </td>
                  <td style={s.tdNum}>{c.prediction_count}</td>
                  <td style={s.tdNum}>{c.total_views.toLocaleString()}</td>
                  <td style={s.tdNum}>{c.total_clicks.toLocaleString()}</td>
                  <td style={s.tdNum}>{c.click_through_rate}%</td>
                  <td style={s.tdNum}>{c.total_likes}</td>
                  <td style={s.tdNum}>{c.total_comments}</td>
                  <td style={s.tdNum}>{c.avg_rating}</td>
                  <td style={s.tdNum}>{c.total_purchases}</td>
                  <td style={s.tdNum}>${c.total_revenue.toFixed(2)}</td>
                  <td style={s.tdNum}>${c.wallet.total_earned_usd.toFixed(2)}</td>
                  <td style={s.td}>
                    {c.flags.length > 0 ? (
                      <div style={{display: 'flex', flexDirection: 'column', gap: 3}}>
                        {c.flags.map(f => (
                          <span key={f} style={s.flagBadge} title={FLAG_LABELS[f] || f}>
                            {FLAG_LABELS[f] || f}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={s.cleanBadge}>Clean</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const s = {
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  filterTabs: {
    display: 'flex',
    gap: 4,
    background: '#0f1629',
    borderRadius: 8,
    padding: 3,
  },
  filterTab: {
    padding: '6px 14px',
    background: 'none',
    border: 'none',
    borderRadius: 6,
    color: '#94a3b8',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  filterTabActive: {
    background: '#1e293b',
    color: '#e2e8f0',
  },
  searchInput: {
    flex: 1,
    minWidth: 160,
    padding: '7px 12px',
    background: '#111827',
    border: '1px solid #1e293b',
    borderRadius: 6,
    color: '#e2e8f0',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
  },
  refreshBtn: {
    padding: '7px 16px',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 6,
    color: '#94a3b8',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  empty: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#64748b',
    fontSize: 14,
  },
  tableWrap: {
    overflowX: 'auto',
    borderRadius: 8,
    border: '1px solid #1e293b',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    background: '#111827',
    color: '#94a3b8',
    fontWeight: 600,
    fontSize: 12,
    borderBottom: '1px solid #1e293b',
    whiteSpace: 'nowrap',
  },
  thNum: {
    textAlign: 'center',
    padding: '10px 8px',
    background: '#111827',
    color: '#94a3b8',
    fontWeight: 600,
    fontSize: 12,
    borderBottom: '1px solid #1e293b',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid rgba(30,41,59,0.5)',
    color: '#cbd5e1',
  },
  tdNum: {
    padding: '10px 8px',
    borderBottom: '1px solid rgba(30,41,59,0.5)',
    color: '#cbd5e1',
    textAlign: 'center',
  },
  flaggedRow: {
    background: 'rgba(239,68,68,0.06)',
  },
  creatorCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 140,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    flexShrink: 0,
  },
  flagBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 4,
    color: '#f87171',
    fontSize: 11,
    whiteSpace: 'nowrap',
  },
  cleanBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    background: 'rgba(34,197,94,0.12)',
    border: '1px solid rgba(34,197,94,0.3)',
    borderRadius: 4,
    color: '#4ade80',
    fontSize: 11,
  },
}
