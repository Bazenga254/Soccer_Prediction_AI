import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'

const SUB_TABS = [
  { key: 'batch', label: 'Batch Disbursements', icon: '\u{1F4E6}' },
  { key: 'pending', label: 'Individual Requests', icon: '\u{23F3}' },
  { key: 'options', label: 'Withdrawal Methods', icon: '\u{1F4B3}' },
  { key: 'history', label: 'History', icon: '\u{1F4CB}' },
]

const STATUS_COLORS = {
  pending: 'warning',
  approved: 'info',
  processing: 'info',
  completed: 'success',
  partially_completed: 'warning',
  failed: 'danger',
  cancelled: 'neutral',
  rejected: 'danger',
  sent: 'success',
}

export default function WithdrawalsTab() {
  const { getAuthHeaders } = useAdmin()
  const [activeSubTab, setActiveSubTab] = useState('batch')

  // Batch state
  const [pendingBatch, setPendingBatch] = useState(null)
  const [batchItems, setBatchItems] = useState([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [approving, setApproving] = useState(false)
  const [showConfirmApprove, setShowConfirmApprove] = useState(false)

  // Individual requests state
  const [withdrawals, setWithdrawals] = useState([])
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false)

  // Withdrawal methods state
  const [options, setOptions] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(false)

  // History state
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedBatchId, setExpandedBatchId] = useState(null)

  // Shared messages
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // ── Fetchers ──

  const fetchBatch = useCallback(async () => {
    setBatchLoading(true)
    try {
      const res = await axios.get('/api/admin/disbursements/pending', { headers: getAuthHeaders() })
      setPendingBatch(res.data.batch || null)
      setBatchItems(res.data.items || [])
    } catch { /* ignore */ }
    setBatchLoading(false)
  }, [getAuthHeaders])

  const fetchWithdrawals = useCallback(async () => {
    setWithdrawalsLoading(true)
    try {
      const res = await axios.get('/api/admin/withdrawals/pending', { headers: getAuthHeaders() })
      setWithdrawals(res.data.withdrawals || [])
    } catch { /* ignore */ }
    setWithdrawalsLoading(false)
  }, [getAuthHeaders])

  const fetchOptions = useCallback(async () => {
    setOptionsLoading(true)
    try {
      const res = await axios.get('/api/admin/withdrawal-options', { headers: getAuthHeaders() })
      setOptions(res.data.options || [])
    } catch { /* ignore */ }
    setOptionsLoading(false)
  }, [getAuthHeaders])

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await axios.get('/api/admin/disbursements/history?limit=30', { headers: getAuthHeaders() })
      setHistory(res.data.batches || [])
    } catch { /* ignore */ }
    setHistoryLoading(false)
  }, [getAuthHeaders])

  // Lazy load on tab switch
  useEffect(() => {
    if (activeSubTab === 'batch') fetchBatch()
    else if (activeSubTab === 'pending') fetchWithdrawals()
    else if (activeSubTab === 'options') fetchOptions()
    else if (activeSubTab === 'history') fetchHistory()
  }, [activeSubTab, fetchBatch, fetchWithdrawals, fetchOptions, fetchHistory])

  // ── Batch Actions ──

  const handleGenerateBatch = async () => {
    setGenerating(true)
    setErrorMsg('')
    setStatusMsg('')
    try {
      const res = await axios.post('/api/admin/disbursements/generate', {}, { headers: getAuthHeaders() })
      setStatusMsg(`Batch #${res.data.batch_id} generated: ${res.data.total_users} users, $${res.data.total_amount_usd?.toFixed(2)} (M-Pesa: ${res.data.mpesa_users || 0}, Whop: ${res.data.whop_users || 0})`)
      fetchBatch()
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to generate batch')
    }
    setGenerating(false)
  }

  const handleApproveBatch = async () => {
    if (!pendingBatch) return
    setApproving(true)
    setErrorMsg('')
    try {
      const res = await axios.post(`/api/admin/disbursements/${pendingBatch.id}/approve`, {}, { headers: getAuthHeaders() })
      setStatusMsg(`Batch approved & executed: ${res.data.sent} sent, ${res.data.failed} failed`)
      setShowConfirmApprove(false)
      fetchBatch()
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Approval failed')
    }
    setApproving(false)
  }

  const handleCancelBatch = async () => {
    if (!pendingBatch) return
    setErrorMsg('')
    try {
      await axios.post(`/api/admin/disbursements/${pendingBatch.id}/cancel`, {}, { headers: getAuthHeaders() })
      setStatusMsg('Batch cancelled')
      setPendingBatch(null)
      setBatchItems([])
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Cancel failed')
    }
  }

  const handleRetryItem = async (itemId) => {
    setErrorMsg('')
    try {
      await axios.post(`/api/admin/disbursements/items/${itemId}/retry`, {}, { headers: getAuthHeaders() })
      setStatusMsg('Retry initiated')
      fetchBatch()
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Retry failed')
    }
  }

  // ── Individual Withdrawal Actions ──

  const handleAction = async (id, action) => {
    try {
      await axios.post(`/api/admin/withdrawals/${id}/${action}`, {}, { headers: getAuthHeaders() })
      fetchWithdrawals()
    } catch (err) {
      alert(err.response?.data?.detail || `Failed to ${action}`)
    }
  }

  const handleRetryWhop = async (id) => {
    try {
      await axios.post(`/api/admin/withdrawals/${id}/retry-whop`, {}, { headers: getAuthHeaders() })
      fetchWithdrawals()
    } catch (err) {
      alert(err.response?.data?.detail || 'Retry failed')
    }
  }

  // ── Render: Batch Disbursements ──

  const renderBatchSection = () => {
    if (batchLoading) return <div className="admin-loading">Loading batch data...</div>

    return (
      <div className="wd-section">
        <div className="wd-batch-actions">
          <button className="admin-btn admin-btn-primary" onClick={handleGenerateBatch}
            disabled={generating || !!pendingBatch}>
            {generating ? 'Generating...' : 'Generate Weekly Batch'}
          </button>
          {pendingBatch && pendingBatch.status === 'pending' && (
            <>
              <button className="admin-btn admin-btn-success" onClick={() => setShowConfirmApprove(true)}
                disabled={approving}>
                Approve & Execute
              </button>
              <button className="admin-btn admin-btn-danger" onClick={handleCancelBatch}>
                Cancel Batch
              </button>
            </>
          )}
          <button className="admin-btn admin-btn-outline" onClick={fetchBatch}>Refresh</button>
        </div>

        {!pendingBatch ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">{'\u{1F4E6}'}</div>
            <div className="admin-empty-title">No Pending Batch</div>
            <p style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>
              Generate a new batch to start the weekly disbursement process.
              Only users with verified, active withdrawal methods past their 48h cooldown will be included.
            </p>
          </div>
        ) : (
          <>
            <div className="admin-stats-grid" style={{ marginTop: 0 }}>
              <div className="admin-stat-card">
                <span className="admin-stat-icon">{'\u{1F465}'}</span>
                <div>
                  <div className="admin-stat-value">{pendingBatch.total_users}</div>
                  <div className="admin-stat-label">Total Users</div>
                </div>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-icon">{'\u{1F4F1}'}</span>
                <div>
                  <div className="admin-stat-value">{pendingBatch.total_mpesa_users || 0}</div>
                  <div className="admin-stat-label">M-Pesa Users</div>
                </div>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-icon">{'\u{1F49C}'}</span>
                <div>
                  <div className="admin-stat-value">{pendingBatch.total_whop_users || 0}</div>
                  <div className="admin-stat-label">Whop Users</div>
                </div>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-icon">{'\u{1F4B0}'}</span>
                <div>
                  <div className="admin-stat-value">${pendingBatch.total_amount_usd?.toFixed(2)}</div>
                  <div className="admin-stat-label">Total USD</div>
                  <div className="admin-stat-sub">
                    KES {pendingBatch.total_amount_kes?.toFixed(0)} @ {pendingBatch.exchange_rate?.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 8px' }}>
              <h4 style={{ margin: 0, fontWeight: 600 }}>Batch Items ({batchItems.length})</h4>
              <span className={`admin-badge admin-badge-${STATUS_COLORS[pendingBatch.status] || 'neutral'}`}>
                {pendingBatch.status}
              </span>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Method</th>
                    <th>Amount (USD)</th>
                    <th>Amount (KES)</th>
                    <th>Fee</th>
                    <th>Phone / ID</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batchItems.map(item => (
                    <tr key={item.id}>
                      <td>{item.display_name || item.username || `#${item.user_id}`}</td>
                      <td>
                        <span className={`admin-badge ${item.withdrawal_method === 'whop' ? 'admin-badge-info' : 'admin-badge-success'}`}>
                          {item.withdrawal_method === 'whop' ? 'Whop' : 'M-Pesa'}
                        </span>
                      </td>
                      <td>${item.amount_usd?.toFixed(2)}</td>
                      <td>{item.amount_kes ? `KES ${item.amount_kes.toFixed(0)}` : '-'}</td>
                      <td style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
                        {item.fee_kes ? `KES ${item.fee_kes}` : item.fee_usd ? `$${item.fee_usd.toFixed(2)}` : '-'}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {item.withdrawal_method === 'whop' ? (item.whop_user_id || '-') : (item.phone_masked || item.phone || '-')}
                      </td>
                      <td>
                        <span className={`admin-badge admin-badge-${STATUS_COLORS[item.status] || 'neutral'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>
                        {(item.status === 'failed' || item.status === 'timeout') && (item.retry_count || 0) < 3 && (
                          <button className="admin-btn admin-btn-sm admin-btn-warning"
                            onClick={() => handleRetryItem(item.id)}>
                            Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Render: Individual Requests ──

  const renderPendingSection = () => {
    if (withdrawalsLoading) return <div className="admin-loading">Loading withdrawal requests...</div>

    return (
      <div className="wd-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h4 style={{ margin: 0 }}>Pending Requests ({withdrawals.length})</h4>
          <button className="admin-btn admin-btn-sm admin-btn-outline" onClick={fetchWithdrawals}>Refresh</button>
        </div>

        {withdrawals.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">{'\u{2705}'}</div>
            <div className="admin-empty-title">All Clear</div>
            <p style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>No pending individual withdrawal requests.</p>
          </div>
        ) : (
          <div className="admin-withdrawal-list">
            {withdrawals.map(wd => {
              const isWhop = wd.withdrawal_method === 'whop'
              return (
                <div key={wd.id} className="admin-withdrawal-card">
                  <div className="admin-withdrawal-header">
                    <span className="admin-withdrawal-user">
                      {wd.display_name || wd.username || `User #${wd.user_id}`}
                      <span style={{
                        display: 'inline-block', marginLeft: 8, padding: '2px 8px',
                        borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: isWhop ? 'rgba(139, 92, 246, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                        color: isWhop ? '#a78bfa' : '#22c55e',
                      }}>
                        {isWhop ? 'Whop (USD)' : 'M-Pesa'}
                      </span>
                    </span>
                    <span className="admin-withdrawal-amount">${wd.amount_usd.toFixed(2)}</span>
                  </div>
                  <div className="admin-withdrawal-details">
                    {isWhop ? (
                      <>
                        <span>Whop ID: {wd.whop_user_id || 'N/A'}</span>
                        {wd.whop_transfer_id && <span>Transfer: {wd.whop_transfer_id}</span>}
                      </>
                    ) : (
                      <>
                        <span>~KES {(wd.amount_kes || 0).toFixed(0)}</span>
                        <span>M-Pesa: {wd.phone_number}</span>
                      </>
                    )}
                    <span>{new Date(wd.created_at).toLocaleString()}</span>
                    <span className={`withdrawal-status-badge ${wd.status}`}>{wd.status}</span>
                  </div>
                  {wd.admin_notes && (
                    <div style={{ fontSize: 12, color: '#94a3b8', padding: '4px 0', fontStyle: 'italic' }}>
                      Note: {wd.admin_notes}
                    </div>
                  )}
                  <div className="admin-withdrawal-actions">
                    {wd.status === 'pending' && (
                      <>
                        <button className="admin-approve-btn" onClick={() => handleAction(wd.id, 'approve')}>
                          {isWhop ? 'Approve & Transfer' : 'Approve'}
                        </button>
                        <button className="admin-reject-btn" onClick={() => handleAction(wd.id, 'reject')}>Reject</button>
                      </>
                    )}
                    {wd.status === 'approved' && !isWhop && (
                      <button className="admin-complete-btn" onClick={() => handleAction(wd.id, 'complete')}>
                        Mark Completed
                      </button>
                    )}
                    {wd.status === 'approved' && isWhop && (
                      <button className="admin-complete-btn" onClick={() => handleRetryWhop(wd.id)}
                        style={{ background: '#8b5cf6' }}>
                        Retry Whop Transfer
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Render: Withdrawal Methods ──

  const renderOptionsSection = () => {
    if (optionsLoading) return <div className="admin-loading">Loading withdrawal methods...</div>

    return (
      <div className="wd-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h4 style={{ margin: 0 }}>User Withdrawal Methods ({options.length})</h4>
          <button className="admin-btn admin-btn-sm admin-btn-outline" onClick={fetchOptions}>Refresh</button>
        </div>

        {options.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">{'\u{1F4B3}'}</div>
            <div className="admin-empty-title">No Withdrawal Methods</div>
            <p style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>No users have set up withdrawal methods yet.</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Method</th>
                  <th>Details</th>
                  <th>Verified</th>
                  <th>Cooldown</th>
                  <th>Primary</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {options.map(opt => (
                  <tr key={opt.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{opt.display_name || opt.username || `User #${opt.user_id}`}</div>
                      <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>ID: {opt.user_id}</div>
                    </td>
                    <td>
                      <span className={`admin-badge ${opt.method === 'whop' ? 'admin-badge-info' : 'admin-badge-success'}`}>
                        {opt.method === 'whop' ? 'Whop (USD)' : 'M-Pesa (KES)'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {opt.method === 'mpesa' ? (opt.mpesa_phone_masked || '-') : (opt.whop_linked ? 'Linked' : '-')}
                    </td>
                    <td>
                      {opt.method === 'mpesa' ? (
                        opt.mpesa_phone_verified
                          ? <span className="admin-badge admin-badge-success">Verified</span>
                          : <span className="admin-badge admin-badge-warning">Unverified</span>
                      ) : (
                        opt.whop_linked
                          ? <span className="admin-badge admin-badge-success">Linked</span>
                          : <span className="admin-badge admin-badge-warning">Not Linked</span>
                      )}
                    </td>
                    <td>
                      {opt.cooldown_active
                        ? <span className="admin-badge admin-badge-danger">{opt.cooldown_remaining_hours}h left</span>
                        : <span className="admin-badge admin-badge-neutral">Clear</span>
                      }
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {opt.is_primary
                        ? <span style={{ color: 'var(--admin-success)', fontWeight: 600 }}>{'\u2713'}</span>
                        : <span style={{ color: 'var(--admin-text-muted)' }}>-</span>
                      }
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
                      {new Date(opt.created_at).toLocaleDateString()}
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

  // ── Render: History ──

  const renderHistorySection = () => {
    if (historyLoading) return <div className="admin-loading">Loading history...</div>

    return (
      <div className="wd-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h4 style={{ margin: 0 }}>Disbursement History ({history.length})</h4>
          <button className="admin-btn admin-btn-sm admin-btn-outline" onClick={fetchHistory}>Refresh</button>
        </div>

        {history.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">{'\u{1F4CB}'}</div>
            <div className="admin-empty-title">No History Yet</div>
            <p style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>Past disbursement batches will appear here after processing.</p>
          </div>
        ) : (
          <div className="wd-history-list">
            {history.map(batch => {
              const isExpanded = expandedBatchId === batch.id
              return (
                <div key={batch.id} className="admin-card">
                  <div className="admin-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="admin-card-title">Batch #{batch.id}</span>
                      <span className={`admin-badge admin-badge-${STATUS_COLORS[batch.status] || 'neutral'}`}>
                        {batch.status}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
                      {batch.batch_date || new Date(batch.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="wd-history-stats">
                    <span>{'\u{1F465}'} {batch.total_users} users</span>
                    <span>{'\u{1F4B5}'} ${batch.total_amount_usd?.toFixed(2)}</span>
                    <span>{'\u{1F4B1}'} KES {batch.total_amount_kes?.toFixed(0)}</span>
                    <span>Rate: {batch.exchange_rate?.toFixed(2)}</span>
                    {batch.total_mpesa_users > 0 && <span>{'\u{1F4F1}'} {batch.total_mpesa_users} M-Pesa</span>}
                    {batch.total_whop_users > 0 && <span>{'\u{1F49C}'} {batch.total_whop_users} Whop</span>}
                  </div>

                  <button
                    className="admin-btn admin-btn-sm admin-btn-outline"
                    style={{ marginTop: 10 }}
                    onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                  >
                    {isExpanded ? 'Hide Details' : 'Show Details'}
                  </button>

                  {isExpanded && (
                    <div className="wd-batch-detail">
                      <dl className="wd-batch-detail-grid">
                        <div>
                          <dt>Created</dt>
                          <dd>{new Date(batch.created_at).toLocaleString()}</dd>
                        </div>
                        {batch.approved_at && (
                          <div>
                            <dt>Approved</dt>
                            <dd>{new Date(batch.approved_at).toLocaleString()}</dd>
                          </div>
                        )}
                        {batch.completed_at && (
                          <div>
                            <dt>Completed</dt>
                            <dd>{new Date(batch.completed_at).toLocaleString()}</dd>
                          </div>
                        )}
                        <div>
                          <dt>Exchange Rate</dt>
                          <dd>1 USD = {batch.exchange_rate?.toFixed(2)} KES</dd>
                        </div>
                        {batch.admin_notes && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <dt>Admin Notes</dt>
                            <dd style={{ fontStyle: 'italic' }}>{batch.admin_notes}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Render: Confirmation Modal ──

  const renderConfirmModal = () => (
    <div className="admin-confirm-overlay" onClick={() => setShowConfirmApprove(false)}>
      <div className="admin-confirm-dialog" onClick={e => e.stopPropagation()}>
        <h3>Confirm Batch Approval</h3>
        <p>
          This will execute <strong>{pendingBatch.total_users}</strong> disbursements totaling{' '}
          <strong>${pendingBatch.total_amount_usd?.toFixed(2)}</strong>{' '}
          (KES {pendingBatch.total_amount_kes?.toFixed(0)}).
        </p>
        <p style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
          M-Pesa: {pendingBatch.total_mpesa_users || 0} users | Whop: {pendingBatch.total_whop_users || 0} users
          <br />This action cannot be undone.
        </p>
        <div className="admin-confirm-actions">
          <button className="admin-btn admin-btn-outline" onClick={() => setShowConfirmApprove(false)}>Cancel</button>
          <button className="admin-btn admin-btn-success" onClick={handleApproveBatch} disabled={approving}>
            {approving ? 'Processing...' : 'Approve & Execute'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── Main Render ──

  return (
    <div className="admin-tab-content">
      <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>Withdrawal Management</h2>
      <p style={{ color: 'var(--admin-text-muted)', fontSize: 14, margin: '0 0 20px' }}>
        Manage batch disbursements, individual requests, and user withdrawal methods
      </p>

      <div className="wd-subtab-bar">
        {SUB_TABS.map(tab => (
          <button
            key={tab.key}
            className={`wd-subtab-btn ${activeSubTab === tab.key ? 'active' : ''}`}
            onClick={() => { setActiveSubTab(tab.key); setStatusMsg(''); setErrorMsg('') }}
          >
            <span className="wd-subtab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {statusMsg && <div className="wd-status-msg success">{statusMsg}</div>}
      {errorMsg && <div className="wd-status-msg error">{errorMsg}</div>}

      {activeSubTab === 'batch' && renderBatchSection()}
      {activeSubTab === 'pending' && renderPendingSection()}
      {activeSubTab === 'options' && renderOptionsSection()}
      {activeSubTab === 'history' && renderHistorySection()}

      {showConfirmApprove && pendingBatch && renderConfirmModal()}
    </div>
  )
}
