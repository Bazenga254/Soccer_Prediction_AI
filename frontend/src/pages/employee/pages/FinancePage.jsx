import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useEmployee } from '../context/EmployeeContext'

const INVOICE_STATUSES = ['All', 'Pending', 'Approved', 'Paid', 'Overdue']
const EXPENSE_STATUSES = ['All', 'Pending', 'Approved', 'Rejected']
const INVOICE_CATEGORIES = ['general', 'services', 'subscriptions', 'consulting', 'other']
const EXPENSE_CATEGORIES = ['operational', 'marketing', 'salaries', 'infrastructure', 'office', 'travel', 'other']

const STATUS_COLORS = {
  pending: '#f39c12',
  approved: '#2ecc71',
  paid: '#3498db',
  overdue: '#e74c3c',
  rejected: '#e74c3c',
}

function formatKES(amount) {
  return `KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-KE', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('en-KE', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/* ─── Invoices Tab ─────────────────────────────────────────────── */
function InvoicesTab({ getAuthHeaders }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('All')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    title: '', amount: '', category: 'general',
    client_name: '', due_date: '', description: '',
  })

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page }
      if (statusFilter !== 'All') params.status = statusFilter.toLowerCase()
      const res = await axios.get('/api/employee/finance/invoices', {
        headers: getAuthHeaders(), params,
      })
      setInvoices(res.data.invoices || res.data || [])
      setTotalPages(res.data.total_pages || 1)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load invoices')
    }
    setLoading(false)
  }, [getAuthHeaders, statusFilter, page])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      await axios.post('/api/employee/finance/invoices', {
        ...form,
        amount: parseFloat(form.amount),
      }, { headers: getAuthHeaders() })
      setSuccess('Invoice created successfully')
      setForm({ title: '', amount: '', category: 'general', client_name: '', due_date: '', description: '' })
      setShowForm(false)
      fetchInvoices()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create invoice')
    }
    setSubmitting(false)
  }

  const updateStatus = async (id, status) => {
    setError('')
    setSuccess('')
    try {
      await axios.put(`/api/employee/finance/invoices/${id}/status`, { status }, {
        headers: getAuthHeaders(),
      })
      setSuccess(`Invoice ${status} successfully`)
      fetchInvoices()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update status')
    }
  }

  return (
    <div className="emp-tab-content">
      {error && <div className="emp-alert emp-alert-error">{error}</div>}
      {success && <div className="emp-alert emp-alert-success">{success}</div>}

      <div className="emp-toolbar">
        <div className="emp-filter-group">
          {INVOICE_STATUSES.map(s => (
            <button
              key={s}
              className={`emp-filter-btn ${statusFilter === s ? 'active' : ''}`}
              onClick={() => { setStatusFilter(s); setPage(1) }}
            >
              {s}
            </button>
          ))}
        </div>
        <button className="emp-btn emp-btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Invoice'}
        </button>
      </div>

      {showForm && (
        <form className="emp-form" onSubmit={handleCreate}>
          <h4 className="emp-form-title">Create Invoice</h4>
          <div className="emp-form-grid">
            <div className="emp-form-group">
              <label className="emp-label">Title *</label>
              <input
                className="emp-input"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                required
                placeholder="Invoice title"
              />
            </div>
            <div className="emp-form-group">
              <label className="emp-label">Amount (KES) *</label>
              <input
                className="emp-input"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                required
                placeholder="0.00"
              />
            </div>
            <div className="emp-form-group">
              <label className="emp-label">Category *</label>
              <select
                className="emp-select"
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
              >
                {INVOICE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="emp-form-group">
              <label className="emp-label">Client Name *</label>
              <input
                className="emp-input"
                value={form.client_name}
                onChange={e => setForm({ ...form, client_name: e.target.value })}
                required
                placeholder="Client name"
              />
            </div>
            <div className="emp-form-group">
              <label className="emp-label">Due Date *</label>
              <input
                className="emp-input"
                type="date"
                value={form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })}
                required
              />
            </div>
            <div className="emp-form-group emp-form-full">
              <label className="emp-label">Description</label>
              <textarea
                className="emp-textarea"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Optional description..."
              />
            </div>
          </div>
          <div className="emp-form-actions">
            <button type="submit" className="emp-btn emp-btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Invoice'}
            </button>
            <button type="button" className="emp-btn emp-btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="emp-table-wrapper">
        {loading ? (
          <div className="emp-loading">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="emp-empty">No invoices found</div>
        ) : (
          <table className="emp-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Title</th>
                <th>Amount</th>
                <th>Category</th>
                <th>Status</th>
                <th>Client</th>
                <th>Due Date</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td className="emp-mono">{inv.invoice_number}</td>
                  <td>{inv.title}</td>
                  <td className="emp-amount">{formatKES(inv.amount)}</td>
                  <td>
                    <span className="emp-badge emp-badge-neutral">
                      {inv.category}
                    </span>
                  </td>
                  <td>
                    <span
                      className="emp-badge"
                      style={{ background: STATUS_COLORS[inv.status] || '#6c757d', color: '#fff' }}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td>{inv.client_name}</td>
                  <td>{formatDate(inv.due_date)}</td>
                  <td>{formatDateTime(inv.created_at)}</td>
                  <td className="emp-actions">
                    {inv.status === 'pending' && (
                      <button
                        className="emp-btn emp-btn-sm emp-btn-approve"
                        onClick={() => updateStatus(inv.id, 'approved')}
                      >
                        Approve
                      </button>
                    )}
                    {(inv.status === 'pending' || inv.status === 'approved') && (
                      <button
                        className="emp-btn emp-btn-sm emp-btn-info"
                        onClick={() => updateStatus(inv.id, 'paid')}
                      >
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="emp-pagination">
          <button
            className="emp-btn emp-btn-sm emp-btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </button>
          <span className="emp-page-info">Page {page} of {totalPages}</span>
          <button
            className="emp-btn emp-btn-sm emp-btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Expenses Tab ─────────────────────────────────────────────── */
function ExpensesTab({ getAuthHeaders }) {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('All')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    title: '', amount: '', category: 'operational', notes: '',
  })

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page }
      if (statusFilter !== 'All') params.status = statusFilter.toLowerCase()
      const res = await axios.get('/api/employee/finance/expenses', {
        headers: getAuthHeaders(), params,
      })
      setExpenses(res.data.expenses || res.data || [])
      setTotalPages(res.data.total_pages || 1)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load expenses')
    }
    setLoading(false)
  }, [getAuthHeaders, statusFilter, page])

  useEffect(() => { fetchExpenses() }, [fetchExpenses])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      await axios.post('/api/employee/finance/expenses', {
        ...form,
        amount: parseFloat(form.amount),
      }, { headers: getAuthHeaders() })
      setSuccess('Expense submitted successfully')
      setForm({ title: '', amount: '', category: 'operational', notes: '' })
      setShowForm(false)
      fetchExpenses()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit expense')
    }
    setSubmitting(false)
  }

  const handleApproval = async (id, approve) => {
    setError('')
    setSuccess('')
    try {
      await axios.put(`/api/employee/finance/expenses/${id}/approve`, { approve }, {
        headers: getAuthHeaders(),
      })
      setSuccess(`Expense ${approve ? 'approved' : 'rejected'} successfully`)
      fetchExpenses()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update expense')
    }
  }

  return (
    <div className="emp-tab-content">
      {error && <div className="emp-alert emp-alert-error">{error}</div>}
      {success && <div className="emp-alert emp-alert-success">{success}</div>}

      <div className="emp-toolbar">
        <div className="emp-filter-group">
          {EXPENSE_STATUSES.map(s => (
            <button
              key={s}
              className={`emp-filter-btn ${statusFilter === s ? 'active' : ''}`}
              onClick={() => { setStatusFilter(s); setPage(1) }}
            >
              {s}
            </button>
          ))}
        </div>
        <button className="emp-btn emp-btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Submit Expense'}
        </button>
      </div>

      {showForm && (
        <form className="emp-form" onSubmit={handleCreate}>
          <h4 className="emp-form-title">Submit Expense</h4>
          <div className="emp-form-grid">
            <div className="emp-form-group">
              <label className="emp-label">Title *</label>
              <input
                className="emp-input"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                required
                placeholder="Expense title"
              />
            </div>
            <div className="emp-form-group">
              <label className="emp-label">Amount (KES) *</label>
              <input
                className="emp-input"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                required
                placeholder="0.00"
              />
            </div>
            <div className="emp-form-group">
              <label className="emp-label">Category *</label>
              <select
                className="emp-select"
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
              >
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="emp-form-group emp-form-full">
              <label className="emp-label">Notes</label>
              <textarea
                className="emp-textarea"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <div className="emp-form-actions">
            <button type="submit" className="emp-btn emp-btn-primary" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Expense'}
            </button>
            <button type="button" className="emp-btn emp-btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="emp-table-wrapper">
        {loading ? (
          <div className="emp-loading">Loading expenses...</div>
        ) : expenses.length === 0 ? (
          <div className="emp-empty">No expenses found</div>
        ) : (
          <table className="emp-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Amount</th>
                <th>Category</th>
                <th>Submitted By</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(exp => (
                <tr key={exp.id}>
                  <td>{exp.title}</td>
                  <td className="emp-amount">{formatKES(exp.amount)}</td>
                  <td>
                    <span className="emp-badge emp-badge-neutral">{exp.category}</span>
                  </td>
                  <td>{exp.submitted_by}</td>
                  <td>
                    <span
                      className="emp-badge"
                      style={{ background: STATUS_COLORS[exp.status] || '#6c757d', color: '#fff' }}
                    >
                      {exp.status}
                    </span>
                  </td>
                  <td>{formatDateTime(exp.created_at)}</td>
                  <td className="emp-actions">
                    {exp.status === 'pending' && (
                      <>
                        <button
                          className="emp-btn emp-btn-sm emp-btn-approve"
                          onClick={() => handleApproval(exp.id, true)}
                        >
                          Approve
                        </button>
                        <button
                          className="emp-btn emp-btn-sm emp-btn-danger"
                          onClick={() => handleApproval(exp.id, false)}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="emp-pagination">
          <button
            className="emp-btn emp-btn-sm emp-btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </button>
          <span className="emp-page-info">Page {page} of {totalPages}</span>
          <button
            className="emp-btn emp-btn-sm emp-btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Summary Tab ──────────────────────────────────────────────── */
function SummaryTab({ getAuthHeaders }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState('month')
  const [error, setError] = useState('')

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await axios.get('/api/employee/finance/summary', {
        headers: getAuthHeaders(), params: { period },
      })
      setSummary(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load summary')
    }
    setLoading(false)
  }, [getAuthHeaders, period])

  useEffect(() => { fetchSummary() }, [fetchSummary])

  const netAmount = (summary?.total_invoiced || 0) - (summary?.total_expenses || 0)
  const isProfit = netAmount >= 0

  return (
    <div className="emp-tab-content">
      {error && <div className="emp-alert emp-alert-error">{error}</div>}

      <div className="emp-toolbar">
        <div className="emp-filter-group">
          {['month', 'quarter', 'year'].map(p => (
            <button
              key={p}
              className={`emp-filter-btn ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <button className="emp-btn emp-btn-secondary" onClick={fetchSummary} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="emp-loading">Loading summary...</div>
      ) : summary ? (
        <>
          <div className="emp-stats-grid">
            <div className="emp-stat-card">
              <div className="emp-stat-label">Total Invoiced</div>
              <div className="emp-stat-value emp-text-blue">
                {formatKES(summary.total_invoiced || 0)}
              </div>
            </div>
            <div className="emp-stat-card">
              <div className="emp-stat-label">Total Expenses</div>
              <div className="emp-stat-value emp-text-orange">
                {formatKES(summary.total_expenses || 0)}
              </div>
            </div>
            <div className="emp-stat-card">
              <div className="emp-stat-label">Net {isProfit ? 'Profit' : 'Loss'}</div>
              <div className={`emp-stat-value ${isProfit ? 'emp-text-green' : 'emp-text-red'}`}>
                {formatKES(Math.abs(netAmount))}
              </div>
            </div>
            <div className="emp-stat-card">
              <div className="emp-stat-label">Pending Invoices</div>
              <div className="emp-stat-value emp-text-yellow">
                {summary.pending_invoices ?? 0}
              </div>
            </div>
            <div className="emp-stat-card">
              <div className="emp-stat-label">Pending Expenses</div>
              <div className="emp-stat-value emp-text-yellow">
                {summary.pending_expenses ?? 0}
              </div>
            </div>
          </div>

          <div className="emp-breakdown-row">
            {summary.invoice_categories && Object.keys(summary.invoice_categories).length > 0 && (
              <div className="emp-breakdown-card">
                <h4 className="emp-breakdown-title">Invoice Breakdown by Category</h4>
                <div className="emp-breakdown-list">
                  {Object.entries(summary.invoice_categories).map(([cat, amount]) => (
                    <div key={cat} className="emp-breakdown-item">
                      <span className="emp-breakdown-label">
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </span>
                      <span className="emp-breakdown-value">{formatKES(amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary.expense_categories && Object.keys(summary.expense_categories).length > 0 && (
              <div className="emp-breakdown-card">
                <h4 className="emp-breakdown-title">Expense Breakdown by Category</h4>
                <div className="emp-breakdown-list">
                  {Object.entries(summary.expense_categories).map(([cat, amount]) => (
                    <div key={cat} className="emp-breakdown-item">
                      <span className="emp-breakdown-label">
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </span>
                      <span className="emp-breakdown-value">{formatKES(amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="emp-empty">No summary data available</div>
      )}
    </div>
  )
}

/* ─── Main Finance Page ────────────────────────────────────────── */
const FINANCE_TABS = [
  { id: 'invoices', label: 'Invoices' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'summary', label: 'Summary' },
]

export default function FinancePage() {
  const { getAuthHeaders } = useEmployee()
  const [activeTab, setActiveTab] = useState('invoices')

  return (
    <div className="emp-page">
      <div className="emp-page-header">
        <h2 className="emp-page-title">Finance Management</h2>
      </div>

      <div className="emp-sub-tabs">
        {FINANCE_TABS.map(tab => (
          <button
            key={tab.id}
            className={`emp-sub-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'invoices' && <InvoicesTab getAuthHeaders={getAuthHeaders} />}
      {activeTab === 'expenses' && <ExpensesTab getAuthHeaders={getAuthHeaders} />}
      {activeTab === 'summary' && <SummaryTab getAuthHeaders={getAuthHeaders} />}

      <style>{`
        /* ─── Finance Page Inline Styles (Dark Theme) ─── */
        .emp-page {
          padding: 24px;
          color: #e0e0e0;
          min-height: 100%;
        }
        .emp-page-header {
          margin-bottom: 20px;
        }
        .emp-page-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }

        /* Sub-tabs */
        .emp-sub-tabs {
          display: flex;
          gap: 4px;
          background: #1a1d23;
          border-radius: 10px;
          padding: 4px;
          margin-bottom: 20px;
          width: fit-content;
        }
        .emp-sub-tab {
          padding: 8px 20px;
          border: none;
          background: transparent;
          color: #8b8fa3;
          cursor: pointer;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.2s;
        }
        .emp-sub-tab:hover {
          color: #c0c4d6;
          background: rgba(255,255,255,0.05);
        }
        .emp-sub-tab.active {
          background: #2d313a;
          color: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }

        /* Toolbar */
        .emp-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
        }
        .emp-filter-group {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .emp-filter-btn {
          padding: 6px 14px;
          border: 1px solid #2d313a;
          background: #1a1d23;
          color: #8b8fa3;
          cursor: pointer;
          border-radius: 6px;
          font-size: 0.82rem;
          transition: all 0.2s;
        }
        .emp-filter-btn:hover {
          border-color: #3a3f4b;
          color: #c0c4d6;
        }
        .emp-filter-btn.active {
          background: #6c5ce7;
          border-color: #6c5ce7;
          color: #ffffff;
        }

        /* Buttons */
        .emp-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .emp-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .emp-btn-primary {
          background: #6c5ce7;
          color: #fff;
        }
        .emp-btn-primary:hover:not(:disabled) {
          background: #5b4bd5;
        }
        .emp-btn-secondary {
          background: #2d313a;
          color: #c0c4d6;
        }
        .emp-btn-secondary:hover:not(:disabled) {
          background: #3a3f4b;
        }
        .emp-btn-sm {
          padding: 4px 10px;
          font-size: 0.78rem;
        }
        .emp-btn-approve {
          background: #2ecc71;
          color: #fff;
        }
        .emp-btn-approve:hover {
          background: #27ae60;
        }
        .emp-btn-danger {
          background: #e74c3c;
          color: #fff;
        }
        .emp-btn-danger:hover {
          background: #c0392b;
        }
        .emp-btn-info {
          background: #3498db;
          color: #fff;
        }
        .emp-btn-info:hover {
          background: #2980b9;
        }

        /* Alerts */
        .emp-alert {
          padding: 10px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 0.88rem;
        }
        .emp-alert-error {
          background: rgba(231, 76, 60, 0.15);
          border: 1px solid rgba(231, 76, 60, 0.3);
          color: #e74c3c;
        }
        .emp-alert-success {
          background: rgba(46, 204, 113, 0.15);
          border: 1px solid rgba(46, 204, 113, 0.3);
          color: #2ecc71;
        }

        /* Forms */
        .emp-form {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .emp-form-title {
          font-size: 1.05rem;
          font-weight: 600;
          color: #ffffff;
          margin: 0 0 16px 0;
        }
        .emp-form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 14px;
        }
        .emp-form-full {
          grid-column: 1 / -1;
        }
        .emp-form-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .emp-label {
          font-size: 0.82rem;
          color: #8b8fa3;
          font-weight: 500;
        }
        .emp-input,
        .emp-select,
        .emp-textarea {
          padding: 8px 12px;
          background: #12141a;
          border: 1px solid #2d313a;
          border-radius: 6px;
          color: #e0e0e0;
          font-size: 0.88rem;
          transition: border-color 0.2s;
        }
        .emp-input:focus,
        .emp-select:focus,
        .emp-textarea:focus {
          outline: none;
          border-color: #6c5ce7;
        }
        .emp-textarea {
          resize: vertical;
          font-family: inherit;
        }
        .emp-form-actions {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }

        /* Table */
        .emp-table-wrapper {
          overflow-x: auto;
          border-radius: 10px;
          border: 1px solid #2d313a;
          background: #1a1d23;
        }
        .emp-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }
        .emp-table th {
          padding: 12px 14px;
          text-align: left;
          background: #12141a;
          color: #8b8fa3;
          font-weight: 600;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #2d313a;
          white-space: nowrap;
        }
        .emp-table td {
          padding: 10px 14px;
          border-bottom: 1px solid rgba(45, 49, 58, 0.5);
          color: #c0c4d6;
        }
        .emp-table tbody tr:hover {
          background: rgba(108, 92, 231, 0.05);
        }
        .emp-table tbody tr:last-child td {
          border-bottom: none;
        }
        .emp-mono {
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 0.82rem;
          color: #8b8fa3;
        }
        .emp-amount {
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-weight: 600;
          color: #e0e0e0;
          white-space: nowrap;
        }
        .emp-actions {
          display: flex;
          gap: 6px;
          white-space: nowrap;
        }

        /* Badges */
        .emp-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: capitalize;
        }
        .emp-badge-neutral {
          background: #2d313a;
          color: #c0c4d6;
        }

        /* Pagination */
        .emp-pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: 16px;
          padding: 12px 0;
        }
        .emp-page-info {
          font-size: 0.85rem;
          color: #8b8fa3;
        }

        /* Loading / Empty */
        .emp-loading,
        .emp-empty {
          text-align: center;
          padding: 40px 20px;
          color: #8b8fa3;
          font-size: 0.92rem;
        }

        /* Stats Grid */
        .emp-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 14px;
          margin-bottom: 24px;
        }
        .emp-stat-card {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 18px;
          text-align: center;
        }
        .emp-stat-label {
          font-size: 0.8rem;
          color: #8b8fa3;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
        .emp-stat-value {
          font-size: 1.3rem;
          font-weight: 700;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
        }
        .emp-text-blue { color: #3498db; }
        .emp-text-orange { color: #e67e22; }
        .emp-text-green { color: #2ecc71; }
        .emp-text-red { color: #e74c3c; }
        .emp-text-yellow { color: #f39c12; }

        /* Breakdown Cards */
        .emp-breakdown-row {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }
        .emp-breakdown-card {
          background: #1a1d23;
          border: 1px solid #2d313a;
          border-radius: 10px;
          padding: 18px;
        }
        .emp-breakdown-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: #ffffff;
          margin: 0 0 14px 0;
        }
        .emp-breakdown-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .emp-breakdown-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #12141a;
          border-radius: 6px;
        }
        .emp-breakdown-label {
          color: #c0c4d6;
          font-size: 0.85rem;
        }
        .emp-breakdown-value {
          color: #e0e0e0;
          font-weight: 600;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 0.85rem;
        }

        .emp-tab-content {
          animation: empFadeIn 0.2s ease;
        }
        @keyframes empFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
