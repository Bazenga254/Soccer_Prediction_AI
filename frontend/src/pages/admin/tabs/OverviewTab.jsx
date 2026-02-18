import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'
import StatCard from '../components/StatCard'

// ─── Chart helpers ───

function niceYTicks(maxVal, count = 5) {
  if (maxVal <= 0) return [0]
  const rawStep = maxVal / (count - 1)
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const residual = rawStep / mag
  let niceStep
  if (residual <= 1.5) niceStep = 1 * mag
  else if (residual <= 3) niceStep = 2 * mag
  else if (residual <= 7) niceStep = 5 * mag
  else niceStep = 10 * mag
  const ticks = []
  for (let v = 0; v <= maxVal + niceStep * 0.01; v += niceStep) {
    ticks.push(Math.round(v * 100) / 100)
    if (ticks.length >= count) break
  }
  return ticks
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

function fmtDate(dateStr) {
  const parts = dateStr.split('-')
  const m = parseInt(parts[1], 10) - 1
  const d = parseInt(parts[2], 10)
  return `${MONTH_SHORT[m]} ${d}`
}

function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

// ─── SVG Line Chart ───

function MiniChart({ labels, data, color, prefix = '', height = 180 }) {
  const svgRef = useRef(null)
  if (!data || data.length === 0) return null

  const width = 700
  const pad = { top: 24, right: 20, bottom: 36, left: 65 }
  const chartW = width - pad.left - pad.right
  const chartH = height - pad.top - pad.bottom
  const rawMax = Math.max(...data, 1)

  const yTickVals = niceYTicks(rawMax, 5)
  const maxVal = yTickVals[yTickVals.length - 1] || rawMax

  const points = data.map((v, i) => ({
    x: pad.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: pad.top + chartH - (v / maxVal) * chartH,
    val: v,
  }))

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaD = pathD + ` L${points[points.length - 1].x},${pad.top + chartH} L${points[0].x},${pad.top + chartH} Z`

  const yTicks = yTickVals.map(val => ({
    val,
    y: pad.top + chartH - (val / maxVal) * chartH,
  }))

  const fmtY = (v) => {
    if (v >= 10000) return `${prefix}${(v / 1000).toFixed(0)}k`
    if (v >= 1000) return `${prefix}${(v / 1000).toFixed(1)}k`
    return `${prefix}${Math.round(v).toLocaleString()}`
  }

  const xCount = Math.min(6, labels.length)
  const xTicks = []
  for (let i = 0; i < xCount; i++) {
    const idx = Math.round((i / Math.max(xCount - 1, 1)) * (labels.length - 1))
    xTicks.push({
      label: fmtDate(labels[idx]),
      x: pad.left + (idx / Math.max(labels.length - 1, 1)) * chartW,
    })
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }} ref={svgRef}>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={pad.left} y1={t.y} x2={pad.left + chartW} y2={t.y} stroke="#1e293b" strokeWidth="1" />
          <text x={pad.left - 10} y={t.y + 4} textAnchor="end" fill="#64748b" fontSize="11" fontFamily="monospace">
            {fmtY(t.val)}
          </text>
        </g>
      ))}
      <path d={areaD} fill={color} opacity="0.08" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => p.val > 0 && (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={color} stroke="#0f172a" strokeWidth="2" />
      ))}
      {xTicks.map((t, i) => (
        <text key={i} x={t.x} y={pad.top + chartH + 22} textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="sans-serif">{t.label}</text>
      ))}
    </svg>
  )
}

// ─── Calendar Picker ───

function CalendarPicker({ value, onChange, onClose }) {
  // value = { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
  const [viewYear, setViewYear] = useState(() => parseInt(value.start.split('-')[0]))
  const [viewMonth, setViewMonth] = useState(() => parseInt(value.start.split('-')[1]) - 1)
  const [picking, setPicking] = useState(null) // null | 'start' | 'end'
  const [tempStart, setTempStart] = useState(value.start)
  const [tempEnd, setTempEnd] = useState(value.end)
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const days = daysInMonth(viewYear, viewMonth)
  const firstDay = new Date(viewYear, viewMonth, 1).getDay() // 0=Sun
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(d)

  const handleDayClick = (day) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (!picking || picking === 'start') {
      setTempStart(dateStr)
      setTempEnd(dateStr)
      setPicking('end')
    } else {
      if (dateStr < tempStart) {
        setTempStart(dateStr)
        setTempEnd(tempStart)
      } else {
        setTempEnd(dateStr)
      }
      setPicking(null)
    }
  }

  const isInRange = (day) => {
    if (!day) return false
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return dateStr >= tempStart && dateStr <= tempEnd
  }

  const isStart = (day) => {
    if (!day) return false
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return dateStr === tempStart
  }

  const isEnd = (day) => {
    if (!day) return false
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return dateStr === tempEnd
  }

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const applyRange = () => {
    onChange({ start: tempStart, end: tempEnd })
    onClose()
  }

  // Quick select buttons
  const today = new Date()
  const quickSelect = (label) => {
    let s, e
    const t = toDateStr(today)
    if (label === 'today') {
      s = e = t
    } else if (label === '7d') {
      s = toDateStr(new Date(today.getTime() - 6 * 86400000))
      e = t
    } else if (label === '30d') {
      s = toDateStr(new Date(today.getTime() - 29 * 86400000))
      e = t
    } else if (label === 'this_month') {
      s = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
      e = t
    } else if (label === 'last_month') {
      const lm = today.getMonth() === 0 ? 11 : today.getMonth() - 1
      const ly = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
      s = `${ly}-${String(lm + 1).padStart(2, '0')}-01`
      e = `${ly}-${String(lm + 1).padStart(2, '0')}-${String(daysInMonth(ly, lm)).padStart(2, '0')}`
    }
    setTempStart(s)
    setTempEnd(e)
    setPicking(null)
    // Navigate calendar to start date
    setViewYear(parseInt(s.split('-')[0]))
    setViewMonth(parseInt(s.split('-')[1]) - 1)
  }

  return (
    <div className="cal-picker" ref={ref}>
      <div className="cal-quick-btns">
        <button onClick={() => quickSelect('today')}>Today</button>
        <button onClick={() => quickSelect('7d')}>Last 7 Days</button>
        <button onClick={() => quickSelect('30d')}>Last 30 Days</button>
        <button onClick={() => quickSelect('this_month')}>This Month</button>
        <button onClick={() => quickSelect('last_month')}>Last Month</button>
      </div>

      <div className="cal-nav">
        <button onClick={prevMonth}>&lsaquo;</button>
        <span className="cal-nav-title">{MONTH_FULL[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth}>&rsaquo;</button>
      </div>

      <div className="cal-grid">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className="cal-day-header">{d}</div>
        ))}
        {cells.map((day, i) => (
          <div
            key={i}
            className={`cal-day ${day ? 'active' : ''} ${isInRange(day) ? 'in-range' : ''} ${isStart(day) ? 'range-start' : ''} ${isEnd(day) ? 'range-end' : ''}`}
            onClick={() => day && handleDayClick(day)}
          >
            {day || ''}
          </div>
        ))}
      </div>

      <div className="cal-footer">
        <div className="cal-range-display">
          <span>{fmtDate(tempStart)}</span>
          <span className="cal-range-arrow">→</span>
          <span>{fmtDate(tempEnd)}</span>
        </div>
        <button className="cal-apply-btn" onClick={applyRange}>Apply</button>
      </div>
    </div>
  )
}


// ─── Main Component ───

export default function OverviewTab() {
  const { getAuthHeaders } = useAdmin()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [txData, setTxData] = useState(null)
  const [txTab, setTxTab] = useState('kes')
  const [showCal, setShowCal] = useState(false)

  // Date range state (default: last 30 days)
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date()
    return {
      start: toDateStr(new Date(now.getTime() - 29 * 86400000)),
      end: toDateStr(now),
    }
  })

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/dashboard-stats', { headers: getAuthHeaders() })
      setStats(res.data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  const fetchTxAnalytics = useCallback(async (tab, range) => {
    try {
      const params = { currency: tab }
      if (range) {
        params.start_date = range.start
        params.end_date = range.end
      }
      const res = await axios.get('/api/admin/transaction-analytics', {
        headers: getAuthHeaders(),
        params,
      })
      setTxData(res.data)
    } catch { /* ignore */ }
  }, [getAuthHeaders])

  const [onlineCount, setOnlineCount] = useState(0)

  useEffect(() => {
    const fetchOnline = () => {
      axios.get('/api/active-users-count').then(res => {
        setOnlineCount(res.data.active_users || 0)
      }).catch(() => {})
    }
    fetchOnline()
    const interval = setInterval(fetchOnline, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  // Fetch tx data when tab or date range changes
  useEffect(() => {
    fetchTxAnalytics(txTab, dateRange)
  }, [txTab, dateRange, fetchTxAnalytics])

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(() => fetchTxAnalytics(txTab, dateRange), 60000)
    return () => clearInterval(interval)
  }, [txTab, dateRange, fetchTxAnalytics])

  if (loading) return <div className="admin-loading">Loading stats...</div>
  if (!stats) return null

  const { users, community, predictions, subscriptions: subs, balance_adjustments: bal } = stats

  const fmtAmount = (val, cur) => {
    if (cur === 'kes') return `KES ${Math.round(val).toLocaleString()}`
    return `$${val.toFixed(2)}`
  }

  const switchTab = (tab) => {
    setTxTab(tab)
  }

  const handleDateChange = (range) => {
    setDateRange(range)
  }

  // Chart title
  const rangeLabel = txData?.range
    ? `${fmtDate(txData.range.start)} — ${fmtDate(txData.range.end)}`
    : 'Last 30 Days'

  return (
    <div className="admin-tab-content">
      <div className="admin-overview-online">
        <span className="online-dot-pulse"></span>
        <span className="admin-overview-online-count">{onlineCount.toLocaleString()}</span>
        <span className="admin-overview-online-label">users online now</span>
      </div>

      <h3>Platform Overview</h3>
      <div className="admin-stats-grid">
        <StatCard label="Total Users" value={users?.total_users || 0} color="#6c5ce7" />
        <StatCard label="Active Users" value={users?.active_users || 0} color="#00b894" />
        <StatCard label="Pro Users" value={users?.pro_users || 0} color="#fdcb6e" />
        <StatCard label="Free Users" value={users?.free_users || 0} color="#74b9ff" />
        <StatCard label="New Today" value={users?.new_today || 0} color="#55efc4" />
      </div>

      {/* ═══ Transaction Analytics ═══ */}
      <div className="tx-analytics-section">
        <div className="tx-analytics-header">
          <h3>Transaction Analytics</h3>
          <div className="tx-header-right">
            <div className="tx-date-picker-wrapper">
              <button className="tx-date-btn" onClick={() => setShowCal(!showCal)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span>{fmtDate(dateRange.start)} — {fmtDate(dateRange.end)}</span>
              </button>
              {showCal && (
                <CalendarPicker
                  value={dateRange}
                  onChange={handleDateChange}
                  onClose={() => setShowCal(false)}
                />
              )}
            </div>
            <span className="tx-timezone-badge">EAT (UTC+3)</span>
          </div>
        </div>

        <div className="tx-tabs">
          <button className={`tx-tab ${txTab === 'kes' ? 'active kes' : ''}`} onClick={() => switchTab('kes')}>
            <span className="tx-tab-icon">📱</span> KES (M-Pesa)
          </button>
          <button className={`tx-tab ${txTab === 'usd' ? 'active usd' : ''}`} onClick={() => switchTab('usd')}>
            <span className="tx-tab-icon">💳</span> USD (Card)
          </button>
        </div>

        {txData ? (
          <div className="tx-content">
            <div className="tx-summary-grid">
              <div className="tx-summary-card daily">
                <div className="tx-summary-label">Today</div>
                <div className="tx-summary-amount">{fmtAmount(txData.daily.total, txTab)}</div>
                <div className="tx-summary-count">{txData.daily.count} transaction{txData.daily.count !== 1 ? 's' : ''}</div>
              </div>
              <div className="tx-summary-card weekly">
                <div className="tx-summary-label">This Week</div>
                <div className="tx-summary-amount">{fmtAmount(txData.weekly.total, txTab)}</div>
                <div className="tx-summary-count">{txData.weekly.count} transaction{txData.weekly.count !== 1 ? 's' : ''}</div>
              </div>
              <div className="tx-summary-card monthly">
                <div className="tx-summary-label">This Month</div>
                <div className="tx-summary-amount">{fmtAmount(txData.monthly.total, txTab)}</div>
                <div className="tx-summary-count">{txData.monthly.count} transaction{txData.monthly.count !== 1 ? 's' : ''}</div>
              </div>
            </div>

            {/* Range total card */}
            {txData.range && (
              <div className="tx-range-total">
                <span className="tx-range-label">Selected Period Total</span>
                <span className="tx-range-amount">{fmtAmount(txData.range.total, txTab)}</span>
                <span className="tx-range-count">{txData.range.count} transaction{txData.range.count !== 1 ? 's' : ''}</span>
              </div>
            )}

            {/* Income Chart */}
            <div className="tx-chart-container">
              <div className="tx-chart-header">
                <span className="tx-chart-title">
                  {txTab === 'kes' ? 'M-Pesa Income' : 'Card Income'} — {rangeLabel}
                </span>
              </div>
              <div className="tx-chart-body">
                <MiniChart
                  labels={txData.chart_labels}
                  data={txData.chart}
                  color={txTab === 'kes' ? '#22c55e' : '#3b82f6'}
                  prefix={txTab === 'kes' ? '' : '$'}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="tx-loading">Loading transaction data...</div>
        )}
      </div>

      <h3>Subscriptions & Revenue</h3>
      <div className="admin-stats-grid">
        <StatCard label="Active Subs" value={subs?.active || 0} color="#00b894" />
        <StatCard label="Total Subs" value={subs?.total_subscriptions || 0} color="#6c5ce7" />
        <StatCard label="Cancelled" value={subs?.cancelled || 0} color="#e17055" />
        <StatCard label="Expired" value={subs?.expired || 0} color="#636e72" />
        <StatCard label="Revenue (USD)" value={`$${subs?.revenue_usd || 0}`} color="#fdcb6e" />
        <StatCard label="Revenue (KES)" value={`KES ${subs?.revenue_kes || 0}`} color="#55efc4" />
      </div>

      {bal && bal.total_adjustments > 0 && (
        <>
          <h3>Balance Adjustments (by Super Admin)</h3>
          <div className="admin-stats-grid">
            <StatCard label="Total Adjustments" value={bal.total_adjustments} color="#a78bfa" />
            <StatCard label="Credited (USD)" value={`$${bal.total_credited_usd}`} color="#22c55e" />
            <StatCard label="Debited (USD)" value={`$${bal.total_debited_usd}`} color="#ef4444" />
            <StatCard label="Credited (KES)" value={`KES ${bal.total_credited_kes}`} color="#22c55e" />
            <StatCard label="Debited (KES)" value={`KES ${bal.total_debited_kes}`} color="#ef4444" />
          </div>
        </>
      )}

      <h3>Community Activity</h3>
      <div className="admin-stats-grid">
        <StatCard label="Predictions Shared" value={community?.total_predictions || 0} color="#e17055" />
        <StatCard label="Public" value={community?.public_predictions || 0} color="#00b894" />
        <StatCard label="Private" value={community?.private_predictions || 0} color="#636e72" />
        <StatCard label="Total Ratings" value={community?.total_ratings || 0} color="#fdcb6e" />
        <StatCard label="Total Comments" value={community?.total_comments || 0} color="#74b9ff" />
        <StatCard label="Unique Sharers" value={community?.unique_sharers || 0} color="#a29bfe" />
        <StatCard label="Today's Predictions" value={community?.predictions_today || 0} color="#55efc4" />
      </div>

      <h3>Prediction Accuracy</h3>
      <div className="admin-stats-grid">
        <StatCard label="Total Predictions" value={predictions?.total_predictions || 0} color="#6c5ce7" />
        <StatCard label="Completed" value={predictions?.matches_finished || 0} color="#00b894" />
        <StatCard
          label="Result Accuracy"
          value={predictions?.result_accuracy?.percentage ? `${predictions.result_accuracy.percentage}%` : 'N/A'}
          color={predictions?.result_accuracy?.percentage >= 60 ? '#00b894' : predictions?.result_accuracy?.percentage >= 40 ? '#fdcb6e' : '#e17055'}
        />
        <StatCard
          label="O/U 2.5 Accuracy"
          value={predictions?.over25_accuracy?.percentage ? `${predictions.over25_accuracy.percentage}%` : 'N/A'}
          color={predictions?.over25_accuracy?.percentage >= 60 ? '#00b894' : '#fdcb6e'}
        />
        <StatCard
          label="BTTS Accuracy"
          value={predictions?.btts_accuracy?.percentage ? `${predictions.btts_accuracy.percentage}%` : 'N/A'}
          color={predictions?.btts_accuracy?.percentage >= 60 ? '#00b894' : '#fdcb6e'}
        />
      </div>
    </div>
  )
}
