import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'

const ACTION_TYPES = [
  { value: 'match_chat', label: 'Live Chat', icon: '\u26BD', targetLabel: 'Match Key', needsMessage: true },
  { value: 'prediction_chat', label: 'Send Prediction Chat', icon: '\uD83D\uDCAC', targetLabel: 'Prediction ID', needsMessage: true },
  { value: 'comment', label: 'Comment on Prediction', icon: '\uD83D\uDCDD', targetLabel: 'Prediction ID', needsMessage: true },
  { value: 'follow', label: 'Follow User', icon: '\u2795', targetLabel: 'User ID', needsMessage: false },
  { value: 'unfollow', label: 'Unfollow User', icon: '\u2796', targetLabel: 'User ID', needsMessage: false },
  { value: 'react', label: 'React to Prediction', icon: '\uD83D\uDC4D', targetLabel: 'Prediction ID', needsMessage: false, hasReaction: true },
]

export default function BotsTab() {
  const { getAuthHeaders } = useAdmin()

  // Stats
  const [stats, setStats] = useState({ total: 0, active: 0, assigned: 0, unassigned: 0 })

  // Bots list
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const searchTimer = useRef(null)

  // Selection
  const [selectedIds, setSelectedIds] = useState([])

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createCount, setCreateCount] = useState(50)
  const [createPrefix, setCreatePrefix] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')

  // Assign modal
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [staffList, setStaffList] = useState([])
  const [assignEmployeeId, setAssignEmployeeId] = useState('')
  const [assigning, setAssigning] = useState(false)

  // Action modal (single bot or batch)
  const [actionModal, setActionModal] = useState(null) // { mode: 'single'|'batch', bot?, botIds? }
  const [actionType, setActionType] = useState('match_chat')
  const [actionTarget, setActionTarget] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionReaction, setActionReaction] = useState('like')
  const [executing, setExecuting] = useState(false)
  const [actionResult, setActionResult] = useState(null)

  // User search for targeting
  const [userSearch, setUserSearch] = useState('')
  const [userResults, setUserResults] = useState([])
  const [searchingUsers, setSearchingUsers] = useState(false)

  // Bulk action loading
  const [bulkLoading, setBulkLoading] = useState(false)
  const [toast, setToast] = useState('')

  // Live matches for match_chat action
  const [liveMatches, setLiveMatches] = useState([])
  const [loadingMatches, setLoadingMatches] = useState(false)

  // Predictions browser for comment/react/prediction_chat
  const [predictions, setPredictions] = useState([])
  const [loadingPredictions, setLoadingPredictions] = useState(false)
  const [predictionSearch, setPredictionSearch] = useState('')
  const [predictionPage, setPredictionPage] = useState(1)
  const [predictionTotalPages, setPredictionTotalPages] = useState(1)
  const predSearchTimer = useRef(null)

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/bots/stats', { headers: getAuthHeaders() })
      setStats(res.data)
    } catch { /* ignore */ }
  }, [getAuthHeaders])

  const fetchBots = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page }
      if (filter === 'active') params.is_active = 1
      else if (filter === 'inactive') params.is_active = 0
      else if (filter === 'assigned') params.assigned_to = -1 // backend: any assigned
      else if (filter === 'unassigned') params.is_active = undefined // handled below
      if (search.trim()) params.search = search.trim()

      // For assigned/unassigned we need special handling
      if (filter === 'assigned') {
        delete params.assigned_to
        // Fetch all and filter client-side is not ideal. Better: pass filter to backend.
        // The backend get_all_bots supports assigned_to=int but not "any assigned".
        // Let's pass a special query param.
      }

      const res = await axios.get('/api/admin/bots', { headers: getAuthHeaders(), params })
      setBots(res.data.bots || [])
      setTotal(res.data.total || 0)
      setTotalPages(res.data.total_pages || 1)
    } catch (err) {
      console.error('Failed to fetch bots:', err)
    }
    setLoading(false)
  }, [getAuthHeaders, page, filter, search])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchBots() }, [fetchBots])
  useEffect(() => { setSelectedIds([]) }, [page, filter, search])

  // Fetch live matches or predictions when action type changes in modal
  const actionModalOpen = !!actionModal
  useEffect(() => {
    if (!actionModalOpen) return
    if (actionType === 'match_chat') {
      fetchLiveMatches()
    } else if (['comment', 'react', 'prediction_chat'].includes(actionType)) {
      setPredictionSearch('')
      fetchPredictions(1, '')
    }
  }, [actionType, actionModalOpen])

  const refreshAll = () => {
    fetchBots()
    fetchStats()
  }

  // Debounced search
  const handleSearchInput = (val) => {
    setSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1) }, 400)
  }

  // --- Create ---
  const handleCreate = async (e) => {
    e.preventDefault()
    setCreateError('')
    setCreateSuccess('')
    if (createCount < 1 || createCount > 500) {
      setCreateError('Count must be between 1 and 500')
      return
    }
    setCreating(true)
    try {
      const body = { count: createCount }
      if (createPrefix.trim()) body.name_prefix = createPrefix.trim()
      const res = await axios.post('/api/admin/bots/create', body, { headers: getAuthHeaders() })
      setCreateSuccess(`Created ${res.data.created || createCount} bot accounts`)
      setCreateCount(50)
      setCreatePrefix('')
      setShowCreateForm(false)
      refreshAll()
      setTimeout(() => setCreateSuccess(''), 5000)
    } catch (err) {
      setCreateError(err.response?.data?.detail || 'Failed to create bots')
    }
    setCreating(false)
  }

  // --- Selection ---
  const allSelected = bots.length > 0 && bots.every(b => selectedIds.includes(b.id))

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : bots.map(b => b.id))
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // --- Bulk Actions ---
  const handleActivateSelected = async () => {
    if (selectedIds.length === 0) return
    setBulkLoading(true)
    try {
      await axios.post('/api/admin/bots/activate', { bot_ids: selectedIds }, { headers: getAuthHeaders() })
      showToast(`Activated ${selectedIds.length} bot(s)`)
      setSelectedIds([])
      refreshAll()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed')
    }
    setBulkLoading(false)
  }

  const handleDeactivateSelected = async () => {
    if (selectedIds.length === 0) return
    setBulkLoading(true)
    try {
      await axios.post('/api/admin/bots/deactivate', { bot_ids: selectedIds }, { headers: getAuthHeaders() })
      showToast(`Deactivated ${selectedIds.length} bot(s)`)
      setSelectedIds([])
      refreshAll()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed')
    }
    setBulkLoading(false)
  }

  const handleActivateAll = async () => {
    setBulkLoading(true)
    try {
      await axios.post('/api/admin/bots/activate-all', {}, { headers: getAuthHeaders() })
      showToast('All bots activated')
      refreshAll()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed')
    }
    setBulkLoading(false)
  }

  const handleDeactivateAll = async () => {
    setBulkLoading(true)
    try {
      await axios.post('/api/admin/bots/deactivate-all', {}, { headers: getAuthHeaders() })
      showToast('All bots deactivated')
      refreshAll()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed')
    }
    setBulkLoading(false)
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Permanently delete ${selectedIds.length} bot(s)? This cannot be undone.`)) return
    setBulkLoading(true)
    try {
      await axios.post('/api/admin/bots/delete', { bot_ids: selectedIds }, { headers: getAuthHeaders() })
      showToast(`Deleted ${selectedIds.length} bot(s)`)
      setSelectedIds([])
      refreshAll()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed')
    }
    setBulkLoading(false)
  }

  const handleUnassignSelected = async () => {
    if (selectedIds.length === 0) return
    setBulkLoading(true)
    try {
      await axios.post('/api/admin/bots/unassign', { bot_ids: selectedIds }, { headers: getAuthHeaders() })
      showToast(`Unassigned ${selectedIds.length} bot(s)`)
      setSelectedIds([])
      refreshAll()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed')
    }
    setBulkLoading(false)
  }

  const handleToggleBot = async (bot) => {
    try {
      if (bot.is_active) {
        await axios.post('/api/admin/bots/deactivate', { bot_ids: [bot.id] }, { headers: getAuthHeaders() })
      } else {
        await axios.post('/api/admin/bots/activate', { bot_ids: [bot.id] }, { headers: getAuthHeaders() })
      }
      refreshAll()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed')
    }
  }

  const handleUnassignBot = async (botId) => {
    try {
      await axios.post('/api/admin/bots/unassign', { bot_ids: [botId] }, { headers: getAuthHeaders() })
      refreshAll()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed')
    }
  }

  // --- Assign Modal ---
  const openAssignModal = async () => {
    if (selectedIds.length === 0) return
    try {
      const res = await axios.get('/api/admin/staff', { headers: getAuthHeaders() })
      setStaffList(res.data.staff || [])
    } catch { /* ignore */ }
    setAssignEmployeeId('')
    setShowAssignModal(true)
  }

  const handleAssign = async () => {
    if (!assignEmployeeId) return
    setAssigning(true)
    try {
      await axios.post('/api/admin/bots/assign', {
        bot_ids: selectedIds,
        employee_user_id: parseInt(assignEmployeeId, 10)
      }, { headers: getAuthHeaders() })
      setShowAssignModal(false)
      setSelectedIds([])
      showToast(`Assigned ${selectedIds.length} bot(s)`)
      refreshAll()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed')
    }
    setAssigning(false)
  }

  // --- Action Modal ---
  const openSingleAction = (bot) => {
    setActionModal({ mode: 'single', bot })
    setActionType('match_chat')
    setActionTarget('')
    setActionMessage('')
    setActionReaction('like')
    setActionResult(null)
    setUserSearch('')
    setUserResults([])
  }

  const openBatchAction = () => {
    if (selectedIds.length === 0) return
    setActionModal({ mode: 'batch', botIds: [...selectedIds] })
    setActionType('follow')
    setActionTarget('')
    setActionMessage('')
    setActionReaction('like')
    setActionResult(null)
    setUserSearch('')
    setUserResults([])
  }

  const closeActionModal = () => {
    setActionModal(null)
    setActionResult(null)
  }

  const currentActionType = ACTION_TYPES.find(a => a.value === actionType)

  // User search for targeting
  const searchUsers = async (q) => {
    setUserSearch(q)
    if (!q.trim()) { setUserResults([]); return }
    setSearchingUsers(true)
    try {
      const res = await axios.get('/api/admin/bots/users-search', {
        headers: getAuthHeaders(),
        params: { search: q.trim(), limit: 10 }
      })
      setUserResults(res.data.users || [])
    } catch { /* ignore */ }
    setSearchingUsers(false)
  }

  const selectUserTarget = (user) => {
    setActionTarget(String(user.id))
    setUserSearch('')
    setUserResults([])
  }

  // Live matches fetch
  const fetchLiveMatches = async () => {
    setLoadingMatches(true)
    try {
      const res = await axios.get('/api/admin/bots/live-matches', { headers: getAuthHeaders() })
      setLiveMatches(res.data.matches || [])
    } catch { /* ignore */ }
    setLoadingMatches(false)
  }

  // Predictions fetch
  const fetchPredictions = async (pg = 1, q = '') => {
    setLoadingPredictions(true)
    try {
      const res = await axios.get('/api/admin/bots/predictions', {
        headers: getAuthHeaders(),
        params: { page: pg, search: q }
      })
      setPredictions(res.data.predictions || [])
      setPredictionPage(res.data.page || 1)
      setPredictionTotalPages(res.data.total_pages || 1)
    } catch { /* ignore */ }
    setLoadingPredictions(false)
  }

  const selectMatch = (match) => {
    setActionTarget(String(match.match_key || match.id))
  }

  const selectPrediction = (pred) => {
    setActionTarget(String(pred.id))
  }

  const handlePredictionQuickAction = async (pred, action) => {
    if (!actionModal) return
    setExecuting(true)
    setActionResult(null)
    try {
      const payload = {
        action: action,
        target_id: action === 'follow' ? String(pred.user_id) : String(pred.id),
      }
      if (action === 'react') payload.reaction = 'like'

      if (actionModal.mode === 'single') {
        payload.bot_id = actionModal.bot.id
        await axios.post('/api/admin/bots/action', payload, { headers: getAuthHeaders() })
        setActionResult({ success: true, message: `${action === 'follow' ? 'Followed user' : action === 'react' ? 'Liked prediction' : 'Done'}` })
      } else {
        payload.bot_ids = actionModal.botIds
        const res = await axios.post('/api/admin/bots/batch-action', payload, { headers: getAuthHeaders() })
        setActionResult({ success: true, message: `${res.data.successes}/${res.data.total} bots succeeded` })
      }
    } catch (err) {
      setActionResult({ success: false, message: err.response?.data?.detail || 'Action failed' })
    }
    setExecuting(false)
  }

  const handleExecuteAction = async () => {
    if (!actionTarget.trim()) return
    setExecuting(true)
    setActionResult(null)
    try {
      const payload = {
        action: actionType,
        target_id: actionTarget.trim(),
      }
      if (currentActionType?.needsMessage) payload.message = actionMessage
      if (currentActionType?.hasReaction) payload.reaction = actionReaction

      if (actionModal.mode === 'single') {
        payload.bot_id = actionModal.bot.id
        const res = await axios.post('/api/admin/bots/action', payload, { headers: getAuthHeaders() })
        setActionResult({ success: true, message: 'Action executed successfully' })
      } else {
        payload.bot_ids = actionModal.botIds
        const res = await axios.post('/api/admin/bots/batch-action', payload, { headers: getAuthHeaders() })
        setActionResult({
          success: true,
          message: `${res.data.successes}/${res.data.total} bots succeeded${res.data.failures > 0 ? ` (${res.data.failures} failed)` : ''}`
        })
      }
      // Clear message for next use but keep target
      setActionMessage('')
    } catch (err) {
      setActionResult({ success: false, message: err.response?.data?.detail || 'Action failed' })
    }
    setExecuting(false)
  }

  // --- Pagination ---
  const renderPagination = () => {
    if (totalPages <= 1) return null
    const btns = []
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPages, page + 2)
    for (let i = start; i <= end; i++) {
      btns.push(
        <button
          key={i}
          className={`admin-action-btn ${i === page ? 'upgrade' : ''}`}
          onClick={() => setPage(i)}
          style={{ minWidth: 36, padding: '4px 8px' }}
        >
          {i}
        </button>
      )
    }
    return (
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="admin-action-btn" onClick={() => setPage(1)} disabled={page === 1}>First</button>
        <button className="admin-action-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
        {btns}
        <button className="admin-action-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
        <button className="admin-action-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>Last</button>
        <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>Page {page} of {totalPages}</span>
      </div>
    )
  }

  if (loading && bots.length === 0) return <div className="admin-loading">Loading bots...</div>

  return (
    <div className="admin-tab-content">

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: '#2ecc71', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontWeight: 600, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      {/* Success banner */}
      {createSuccess && (
        <div style={{
          background: 'rgba(46,204,113,0.15)', border: '1px solid rgba(46,204,113,0.3)',
          color: '#2ecc71', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14,
        }}>
          {createSuccess}
        </div>
      )}

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Bots', value: stats.total, color: '#fff' },
          { label: 'Active', value: stats.active, color: '#2ecc71' },
          { label: 'Assigned', value: stats.assigned, color: '#3498db' },
          { label: 'Unassigned', value: stats.unassigned, color: '#e67e22' },
        ].map(s => (
          <div key={s.label} style={{ background: '#1e2130', borderRadius: 10, padding: '18px 20px', textAlign: 'center', border: '1px solid #2d313a' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#8b8fa3', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Create + Global Actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <button
          className={`admin-action-btn ${showCreateForm ? 'suspend' : 'upgrade'}`}
          onClick={() => { setShowCreateForm(!showCreateForm); setCreateError('') }}
        >
          {showCreateForm ? 'Cancel' : '+ Create Bots'}
        </button>
        <div style={{ borderLeft: '1px solid #2d313a', height: 24, margin: '0 4px' }} />
        <button className="admin-action-btn upgrade" onClick={handleActivateAll} disabled={bulkLoading}>
          Activate All
        </button>
        <button className="admin-action-btn suspend" onClick={handleDeactivateAll} disabled={bulkLoading}>
          Deactivate All
        </button>
      </div>

      {showCreateForm && (
        <div className="admin-create-staff-form" style={{ marginBottom: 16 }}>
          {createError && <div className="admin-create-staff-error">{createError}</div>}
          <form onSubmit={handleCreate}>
            <div className="admin-create-staff-grid">
              <div className="admin-create-staff-field">
                <label>Number of Bots</label>
                <input
                  type="number"
                  value={createCount}
                  onChange={(e) => setCreateCount(parseInt(e.target.value, 10) || 1)}
                  min={1} max={500} required
                />
              </div>
              <div className="admin-create-staff-field">
                <label>Name Prefix (optional)</label>
                <input
                  type="text"
                  value={createPrefix}
                  onChange={(e) => setCreatePrefix(e.target.value)}
                  placeholder="e.g. Fan, Supporter"
                  maxLength={50}
                />
              </div>
            </div>
            <p className="admin-create-staff-note">
              Bots get random names, usernames, and avatars. They appear as real users but cannot make purchases.
            </p>
            <button type="submit" className="admin-create-staff-submit" disabled={creating}>
              {creating ? 'Creating...' : `Create ${createCount} Bots`}
            </button>
          </form>
        </div>
      )}

      {/* Search + Filter + Selection Actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder="Search bots by name or username..."
          className="admin-search-input"
          style={{ flex: '1 1 200px', maxWidth: 300 }}
        />
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(1) }}
          className="admin-filter-select"
        >
          <option value="all">All Bots</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
        <span style={{ fontSize: 13, color: '#8b8fa3' }}>{total} total</span>
      </div>

      {/* Selection toolbar */}
      {selectedIds.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          padding: '10px 14px', marginBottom: 12,
          background: 'rgba(108,92,231,0.08)', border: '1px solid rgba(108,92,231,0.2)',
          borderRadius: 8, fontSize: 13
        }}>
          <strong style={{ color: '#a29bfe' }}>{selectedIds.length} selected</strong>
          <div style={{ borderLeft: '1px solid #2d313a', height: 20, margin: '0 4px' }} />
          <button className="admin-action-btn upgrade" onClick={handleActivateSelected} disabled={bulkLoading}>Activate</button>
          <button className="admin-action-btn suspend" onClick={handleDeactivateSelected} disabled={bulkLoading}>Deactivate</button>
          <button className="admin-action-btn upgrade" onClick={openAssignModal} disabled={bulkLoading}>Assign</button>
          <button className="admin-action-btn reset-pw" onClick={handleUnassignSelected} disabled={bulkLoading}>Unassign</button>
          <button className="admin-action-btn reset-pw" onClick={openBatchAction} disabled={bulkLoading}>Batch Action</button>
          <button className="admin-action-btn suspend" onClick={handleDeleteSelected} disabled={bulkLoading}>Delete</button>
          <button style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 12 }} onClick={() => setSelectedIds([])}>
            Clear
          </button>
        </div>
      )}

      {/* Bots Table */}
      <div className="admin-users-table">
        <div className="admin-table-header">
          <span style={{ width: 36, textAlign: 'center' }}>
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
          </span>
          <span className="col-name" style={{ flex: 2 }}>Bot</span>
          <span className="col-status">Status</span>
          <span className="col-tier" style={{ flex: 1 }}>Assigned To</span>
          <span className="col-joined">Created</span>
          <span className="col-actions" style={{ flex: 1.5 }}>Actions</span>
        </div>

        {loading ? (
          <div className="admin-loading" style={{ padding: 20 }}>Loading...</div>
        ) : bots.length === 0 ? (
          <div className="admin-empty-row">
            {search ? `No bots matching "${search}"` : 'No bots found. Create some above!'}
          </div>
        ) : (
          bots.map(bot => (
            <div key={bot.id} className={`admin-table-row ${!bot.is_active ? 'suspended' : ''}`}>
              <span style={{ width: 36, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(bot.id)}
                  onChange={() => toggleSelect(bot.id)}
                />
              </span>
              <span className="col-name" style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="admin-user-avatar-sm" style={{ background: bot.avatar_color || '#6c5ce7' }}>
                  {(bot.display_name || '?')[0].toUpperCase()}
                </span>
                <div>
                  <strong>{bot.display_name || 'Bot'}</strong>
                  <small style={{ display: 'block', color: '#666' }}>@{bot.username}</small>
                </div>
              </span>
              <span className="col-status">
                <span
                  className="admin-staff-role-tag"
                  style={{ background: bot.is_active ? '#2ecc71' : '#636e72', fontSize: 11, cursor: 'pointer' }}
                  onClick={() => handleToggleBot(bot)}
                  title={bot.is_active ? 'Click to deactivate' : 'Click to activate'}
                >
                  {bot.is_active ? '\u{1F7E2} Online' : '\u26AB Offline'}
                </span>
              </span>
              <span className="col-tier" style={{ flex: 1 }}>
                {bot.assigned_to_name ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: '#3498db' }}>{bot.assigned_to_name}</span>
                    <button
                      onClick={() => handleUnassignBot(bot.id)}
                      style={{
                        background: 'none', border: 'none', color: '#e74c3c',
                        cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1
                      }}
                      title="Unassign"
                    >
                      {'\u2716'}
                    </button>
                  </span>
                ) : (
                  <span style={{ color: '#555' }}>-</span>
                )}
              </span>
              <span className="col-joined" style={{ fontSize: 12 }}>
                {bot.created_at ? new Date(bot.created_at).toLocaleDateString() : '-'}
              </span>
              <span className="col-actions" style={{ flex: 1.5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button
                  className={`admin-action-btn ${bot.is_active ? 'suspend' : 'upgrade'}`}
                  onClick={() => handleToggleBot(bot)}
                  style={{ fontSize: 11, padding: '3px 8px' }}
                >
                  {bot.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  className="admin-action-btn reset-pw"
                  onClick={() => openSingleAction(bot)}
                  style={{ fontSize: 11, padding: '3px 8px' }}
                >
                  Action
                </button>
              </span>
            </div>
          ))
        )}
      </div>

      {renderPagination()}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="admin-modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Assign {selectedIds.length} Bot(s) to Employee</h3>
            <select
              value={assignEmployeeId}
              onChange={(e) => setAssignEmployeeId(e.target.value)}
              className="admin-modal-input"
            >
              <option value="">-- Select Employee --</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>
                  {s.display_name || s.username} ({s.role_display_name || s.staff_role || 'Staff'})
                </option>
              ))}
            </select>
            <div className="admin-modal-actions">
              <button className="admin-modal-cancel" onClick={() => setShowAssignModal(false)}>Cancel</button>
              <button className="admin-modal-confirm" onClick={handleAssign} disabled={!assignEmployeeId || assigning}>
                {assigning ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Modal (Single or Batch) */}
      {actionModal && (
        <div className="admin-modal-overlay" onClick={closeActionModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #2d313a' }}>
              <h3 style={{ margin: 0, marginBottom: 4 }}>
                {actionModal.mode === 'batch' ? `Batch Action (${actionModal.botIds.length} bots)` : 'Bot Action'}
              </h3>
              {actionModal.mode === 'single' && (
                <p className="admin-modal-user" style={{ margin: 0 }}>
                  <span className="admin-user-avatar-sm" style={{
                    background: actionModal.bot.avatar_color || '#6c5ce7',
                    display: 'inline-flex', verticalAlign: 'middle', marginRight: 8
                  }}>
                    {(actionModal.bot.display_name || '?')[0].toUpperCase()}
                  </span>
                  {actionModal.bot.display_name} (@{actionModal.bot.username})
                </p>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {/* Action type buttons */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#8b8fa3', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Action Type
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ACTION_TYPES.map(at => (
                    <button
                      key={at.value}
                      onClick={() => { setActionType(at.value); setActionResult(null); setActionTarget('') }}
                      style={{
                        padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                        cursor: 'pointer', border: '1px solid',
                        background: actionType === at.value ? '#6c5ce7' : 'transparent',
                        borderColor: actionType === at.value ? '#6c5ce7' : '#2d313a',
                        color: actionType === at.value ? '#fff' : '#aaa',
                      }}
                    >
                      {at.icon} {at.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Matches Browser - shown for match_chat */}
              {actionType === 'match_chat' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#8b8fa3', textTransform: 'uppercase' }}>
                    Select a Match
                  </label>
                  {loadingMatches ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#888' }}>Loading matches...</div>
                  ) : liveMatches.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#666', background: '#1a1d23', borderRadius: 8, border: '1px solid #2d313a' }}>
                      No live or scheduled matches right now
                    </div>
                  ) : (
                    <div style={{ maxHeight: 220, overflowY: 'auto', background: '#1a1d23', border: '1px solid #2d313a', borderRadius: 8 }}>
                      {liveMatches.map(m => {
                        const isSelected = actionTarget === String(m.match_key || m.id)
                        const isLive = ['1H', '2H', 'HT', 'ET', 'LIVE'].includes(m.status)
                        return (
                          <div
                            key={m.id || m.match_key}
                            onClick={() => selectMatch(m)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '10px 14px', cursor: 'pointer',
                              borderBottom: '1px solid #2d313a',
                              background: isSelected ? 'rgba(108,92,231,0.15)' : 'transparent',
                              borderLeft: isSelected ? '3px solid #6c5ce7' : '3px solid transparent',
                            }}
                            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7' }}>
                                {m.home_team} vs {m.away_team}
                              </div>
                              <div style={{ fontSize: 11, color: '#8b8fa3', marginTop: 2 }}>
                                {m.league}{m.score && m.score !== '0-0' ? ` | ${m.score}` : ''}{m.minute ? ` | ${m.minute}'` : ''}
                              </div>
                            </div>
                            <span style={{
                              padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                              background: isLive ? 'rgba(231,76,60,0.15)' : 'rgba(52,152,219,0.15)',
                              color: isLive ? '#e74c3c' : '#3498db',
                            }}>
                              {isLive ? 'LIVE' : m.status || 'Scheduled'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <button
                    onClick={fetchLiveMatches}
                    style={{ marginTop: 4, background: 'none', border: 'none', color: '#6c5ce7', cursor: 'pointer', fontSize: 12 }}
                  >
                    Refresh matches
                  </button>
                </div>
              )}

              {/* Predictions Browser - shown for comment, react, prediction_chat */}
              {['comment', 'react', 'prediction_chat'].includes(actionType) && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#8b8fa3', textTransform: 'uppercase' }}>
                    Browse Predictions
                  </label>
                  <input
                    type="text"
                    value={predictionSearch}
                    onChange={(e) => {
                      const val = e.target.value
                      setPredictionSearch(val)
                      if (predSearchTimer.current) clearTimeout(predSearchTimer.current)
                      predSearchTimer.current = setTimeout(() => fetchPredictions(1, val), 400)
                    }}
                    className="admin-modal-input"
                    placeholder="Search predictions by user or match..."
                    style={{ marginBottom: 8 }}
                  />
                  {loadingPredictions ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#888' }}>Loading predictions...</div>
                  ) : predictions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#666', background: '#1a1d23', borderRadius: 8, border: '1px solid #2d313a' }}>
                      No predictions found
                    </div>
                  ) : (
                    <div style={{ maxHeight: 260, overflowY: 'auto', background: '#1a1d23', border: '1px solid #2d313a', borderRadius: 8 }}>
                      {predictions.map(p => {
                        const isSelected = actionTarget === String(p.id)
                        return (
                          <div
                            key={p.id}
                            onClick={() => selectPrediction(p)}
                            style={{
                              padding: '10px 14px', cursor: 'pointer',
                              borderBottom: '1px solid #2d313a',
                              background: isSelected ? 'rgba(108,92,231,0.15)' : 'transparent',
                              borderLeft: isSelected ? '3px solid #6c5ce7' : '3px solid transparent',
                            }}
                            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span className="admin-user-avatar-sm" style={{ background: p.avatar_color || '#6c5ce7', width: 24, height: 24, fontSize: 10 }}>
                                {(p.display_name || '?')[0].toUpperCase()}
                              </span>
                              <strong style={{ fontSize: 13, color: '#e4e4e7' }}>{p.display_name}</strong>
                              <span style={{ color: '#666', fontSize: 11 }}>@{p.username}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#b0b3c6', marginBottom: 3 }}>
                              {p.match_description || 'Match prediction'}
                            </div>
                            <div style={{ fontSize: 12, color: '#8b8fa3', marginBottom: 6, fontStyle: 'italic' }}>
                              &ldquo;{p.prediction_text?.substring(0, 80)}{p.prediction_text?.length > 80 ? '...' : ''}&rdquo;
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11 }}>
                              <span style={{ color: '#2ecc71' }}>{'\uD83D\uDC4D'} {p.likes || 0}</span>
                              <span style={{ color: '#e74c3c' }}>{'\uD83D\uDC4E'} {p.dislikes || 0}</span>
                              <span style={{ color: '#888' }}>{'\uD83D\uDCAC'} {p.comment_count || 0}</span>
                              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handlePredictionQuickAction(p, 'react') }}
                                  disabled={executing}
                                  style={{
                                    background: 'rgba(46,204,113,0.12)', border: '1px solid rgba(46,204,113,0.25)',
                                    color: '#2ecc71', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11,
                                  }}
                                  title="Like this prediction"
                                >
                                  {'\uD83D\uDC4D'} Like
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handlePredictionQuickAction(p, 'follow') }}
                                  disabled={executing}
                                  style={{
                                    background: 'rgba(108,92,231,0.12)', border: '1px solid rgba(108,92,231,0.25)',
                                    color: '#a29bfe', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11,
                                  }}
                                  title="Follow this user"
                                >
                                  + Follow
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {predictionTotalPages > 1 && (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 8 }}>
                      <button
                        onClick={() => fetchPredictions(predictionPage - 1, predictionSearch)}
                        disabled={predictionPage <= 1 || loadingPredictions}
                        style={{ background: 'none', border: '1px solid #2d313a', color: '#aaa', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
                      >
                        Prev
                      </button>
                      <span style={{ fontSize: 12, color: '#888', padding: '3px 8px' }}>
                        {predictionPage} / {predictionTotalPages}
                      </span>
                      <button
                        onClick={() => fetchPredictions(predictionPage + 1, predictionSearch)}
                        disabled={predictionPage >= predictionTotalPages || loadingPredictions}
                        style={{ background: 'none', border: '1px solid #2d313a', color: '#aaa', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* User search for follow/unfollow targets */}
              {['follow', 'unfollow'].includes(actionType) && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#8b8fa3', textTransform: 'uppercase' }}>
                    Search Users
                  </label>
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => searchUsers(e.target.value)}
                    className="admin-modal-input"
                    placeholder="Search users by name or username..."
                    style={{ marginBottom: 4 }}
                  />
                  {userResults.length > 0 && (
                    <div style={{
                      background: '#1a1d23', border: '1px solid #2d313a', borderRadius: 6,
                      maxHeight: 160, overflowY: 'auto'
                    }}>
                      {userResults.map(u => (
                        <div
                          key={u.id}
                          onClick={() => selectUserTarget(u)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 10px', cursor: 'pointer', fontSize: 13,
                            borderBottom: '1px solid #2d313a',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(108,92,231,0.1)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <span className="admin-user-avatar-sm" style={{ background: u.avatar_color || '#6c5ce7', width: 26, height: 26, fontSize: 11 }}>
                            {(u.display_name || '?')[0].toUpperCase()}
                          </span>
                          <div>
                            <strong style={{ color: '#e4e4e7' }}>{u.display_name}</strong>
                            <span style={{ color: '#888', marginLeft: 6 }}>@{u.username}</span>
                          </div>
                          <span style={{ marginLeft: 'auto', color: '#555', fontSize: 11 }}>ID: {u.id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Target ID (manual entry / shows selected) */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#8b8fa3', textTransform: 'uppercase' }}>
                  {currentActionType?.targetLabel || 'Target ID'}
                </label>
                <input
                  type="text"
                  value={actionTarget}
                  onChange={(e) => setActionTarget(e.target.value)}
                  className="admin-modal-input"
                  placeholder={currentActionType?.targetLabel || 'Enter target...'}
                />
              </div>

              {/* Message field */}
              {currentActionType?.needsMessage && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#8b8fa3', textTransform: 'uppercase' }}>
                    Message
                  </label>
                  <textarea
                    value={actionMessage}
                    onChange={(e) => setActionMessage(e.target.value)}
                    className="admin-modal-input"
                    style={{ minHeight: 80, resize: 'vertical' }}
                    placeholder="Enter message..."
                  />
                </div>
              )}

              {/* Reaction field */}
              {currentActionType?.hasReaction && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#8b8fa3', textTransform: 'uppercase' }}>
                    Reaction
                  </label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {['like', 'dislike'].map(r => (
                      <label key={r} style={{
                        display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#ccc',
                        padding: '6px 12px', borderRadius: 6,
                        background: actionReaction === r ? 'rgba(108,92,231,0.15)' : 'transparent',
                        border: `1px solid ${actionReaction === r ? '#6c5ce7' : '#2d313a'}`,
                      }}>
                        <input
                          type="radio"
                          name="action_reaction"
                          value={r}
                          checked={actionReaction === r}
                          onChange={(e) => setActionReaction(e.target.value)}
                          style={{ accentColor: '#6c5ce7' }}
                        />
                        {r === 'like' ? '\uD83D\uDC4D Like' : '\uD83D\uDC4E Dislike'}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Result */}
              {actionResult && (
                <div style={{
                  padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13,
                  background: actionResult.success ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.12)',
                  color: actionResult.success ? '#2ecc71' : '#e74c3c',
                  border: `1px solid ${actionResult.success ? 'rgba(46,204,113,0.25)' : 'rgba(231,76,60,0.25)'}`,
                }}>
                  {actionResult.message}
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #2d313a', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="admin-modal-cancel" onClick={closeActionModal}>Close</button>
              <button
                className="admin-modal-confirm"
                onClick={handleExecuteAction}
                disabled={!actionTarget.trim() || executing || (currentActionType?.needsMessage && !actionMessage.trim())}
              >
                {executing ? 'Executing...' : actionModal.mode === 'batch' ? `Execute on ${actionModal.botIds.length} Bots` : 'Execute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
