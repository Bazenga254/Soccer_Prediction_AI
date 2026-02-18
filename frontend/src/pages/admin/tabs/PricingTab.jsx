import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'

const CATEGORY_LABELS = {
  subscription_plans: 'Subscription Plans',
  commissions: 'Commissions',
  pay_per_use: 'Pay-Per-Use Pricing',
  free_tier: 'Free Tier Limits',
}

// Predefined feature options for plan creation
const FEATURE_OPTIONS = [
  { id: 'match_analyses', label: 'Match analyses', hasLimit: true, unlimitedLabel: 'Unlimited match analyses', limitLabel: '{n} match analyses per day' },
  { id: 'jackpot_analyses', label: 'Jackpot analyses', hasLimit: true, unlimitedLabel: 'Unlimited jackpot analyses', limitLabel: '{n} jackpot analyses per day' },
  { id: 'ai_chat', label: 'AI chat prompts', hasLimit: true, unlimitedLabel: 'Unlimited AI chat prompts', limitLabel: '{n} AI chat prompts' },
  { id: 'advanced_analytics', label: 'Advanced analytics & value betting', hasLimit: false },
  { id: 'ad_free', label: 'Ad-free experience', hasLimit: false },
  { id: 'priority_support', label: 'Priority support', hasLimit: false },
  { id: 'save_weekly', label: 'Save vs weekly pricing', hasLimit: false, customLabel: true, placeholder: 'e.g. Save 20% vs weekly' },
  { id: 'monthly_report', label: 'Monthly insights report', hasLimit: false },
  { id: 'everything_weekly', label: 'Everything in Weekly', hasLimit: false },
]

export default function PricingTab() {
  const { getAuthHeaders } = useAdmin()
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [editedValues, setEditedValues] = useState({})

  // New plan form
  const [showNewPlan, setShowNewPlan] = useState(false)
  const [newPlan, setNewPlan] = useState({ plan_id: '', name: '', price: '', currency: 'USD', duration_days: '' })
  const [selectedFeatures, setSelectedFeatures] = useState({})
  // selectedFeatures shape: { match_analyses: { enabled: true, unlimited: true, limit: '' }, ad_free: { enabled: true }, ... }
  const [createLoading, setCreateLoading] = useState(false)

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const fetchPricing = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/pricing', { headers: getAuthHeaders() })
      setConfigs(res.data.configs || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchPricing() }, [fetchPricing])

  const handleValueChange = (key, value) => {
    setEditedValues(prev => ({ ...prev, [key]: value }))
  }

  const getDisplayValue = (config) => {
    if (editedValues[config.config_key] !== undefined) return editedValues[config.config_key]
    return config.parsed_value
  }

  const handleSave = async () => {
    if (Object.keys(editedValues).length === 0) return
    setSaving(true)
    setMessage(null)
    try {
      await axios.put('/api/admin/pricing', { updates: editedValues }, { headers: getAuthHeaders() })
      setMessage({ type: 'success', text: 'Pricing updated successfully! Changes are now live across the entire site.' })
      setEditedValues({})
      fetchPricing()
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Failed to save pricing changes' })
    }
    setSaving(false)
    setTimeout(() => setMessage(null), 5000)
  }

  const handleDiscard = () => {
    setEditedValues({})
    setMessage(null)
  }

  const handleCreatePlan = async () => {
    if (!newPlan.plan_id || !newPlan.name || !newPlan.price || !newPlan.duration_days) {
      setMessage({ type: 'error', text: 'Please fill in all required fields for the new plan' })
      return
    }
    setCreateLoading(true)
    try {
      // Build features list from selected options
      const features = []
      FEATURE_OPTIONS.forEach(opt => {
        const sel = selectedFeatures[opt.id]
        if (!sel?.enabled) return
        if (opt.hasLimit) {
          if (sel.unlimited) {
            features.push(opt.unlimitedLabel)
          } else if (sel.limit) {
            features.push(opt.limitLabel.replace('{n}', sel.limit))
          }
        } else if (opt.customLabel && sel.customText) {
          features.push(sel.customText)
        } else {
          features.push(opt.label)
        }
      })
      await axios.post('/api/admin/pricing/plans', {
        plan_id: newPlan.plan_id,
        name: newPlan.name,
        price: parseFloat(newPlan.price),
        currency: newPlan.currency,
        duration_days: parseInt(newPlan.duration_days),
        features,
      }, { headers: getAuthHeaders() })
      setMessage({ type: 'success', text: `Plan "${newPlan.name}" created successfully!` })
      setNewPlan({ plan_id: '', name: '', price: '', currency: 'USD', duration_days: '' })
      setSelectedFeatures({})
      setShowNewPlan(false)
      fetchPricing()
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Failed to create plan' })
    }
    setCreateLoading(false)
  }

  const toggleFeature = (featureId) => {
    setSelectedFeatures(prev => {
      const current = prev[featureId] || {}
      if (current.enabled) {
        const next = { ...prev }
        delete next[featureId]
        return next
      }
      return { ...prev, [featureId]: { enabled: true, unlimited: true, limit: '', customText: '' } }
    })
  }

  const updateFeatureOption = (featureId, key, value) => {
    setSelectedFeatures(prev => ({
      ...prev,
      [featureId]: { ...prev[featureId], [key]: value }
    }))
  }

  const handleDeletePlan = async (planId) => {
    try {
      await axios.delete(`/api/admin/pricing/plans/${planId}`, { headers: getAuthHeaders() })
      setMessage({ type: 'success', text: `Plan "${planId}" deleted successfully` })
      setDeleteConfirm(null)
      fetchPricing()
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Failed to delete plan' })
    }
  }

  if (loading) return <div className="admin-loading">Loading pricing configuration...</div>

  // Group configs by category
  const grouped = {}
  configs.forEach(c => {
    if (!grouped[c.category]) grouped[c.category] = []
    grouped[c.category].push(c)
  })

  // Extract plans list for plan cards
  const plansList = configs.find(c => c.config_key === 'plans_list')
  const activePlans = plansList ? JSON.parse(plansList.config_value) : []

  const hasChanges = Object.keys(editedValues).length > 0

  return (
    <div className="admin-tab-content pricing-tab">
      <div className="admin-section-header">
        <h3>Pricing Management</h3>
        <span className="pricing-subtitle">Changes apply instantly across the entire platform</span>
      </div>

      {message && (
        <div className={`pricing-message ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* ─── Subscription Plans ─── */}
      <div className="pricing-section">
        <div className="pricing-section-header">
          <h4>Subscription Plans</h4>
          <button className="pricing-add-btn" onClick={() => setShowNewPlan(!showNewPlan)}>
            {showNewPlan ? 'Cancel' : '+ New Plan'}
          </button>
        </div>

        {showNewPlan && (
          <div className="pricing-new-plan-form">
            <h5>Create New Plan</h5>
            <div className="pricing-form-grid">
              <div className="pricing-form-group">
                <label>Plan ID *</label>
                <input
                  type="text"
                  value={newPlan.plan_id}
                  onChange={e => setNewPlan(p => ({ ...p, plan_id: e.target.value }))}
                  placeholder="e.g. quarterly_usd"
                  className="pricing-input"
                />
                <small>Unique identifier (lowercase, no spaces)</small>
              </div>
              <div className="pricing-form-group">
                <label>Plan Name *</label>
                <input
                  type="text"
                  value={newPlan.name}
                  onChange={e => setNewPlan(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Pro Quarterly (USD)"
                  className="pricing-input"
                />
              </div>
              <div className="pricing-form-group">
                <label>Price *</label>
                <input
                  type="number"
                  value={newPlan.price}
                  onChange={e => setNewPlan(p => ({ ...p, price: e.target.value }))}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="pricing-input"
                />
              </div>
              <div className="pricing-form-group">
                <label>Currency</label>
                <select
                  value={newPlan.currency}
                  onChange={e => setNewPlan(p => ({ ...p, currency: e.target.value }))}
                  className="pricing-input"
                >
                  <option value="USD">USD</option>
                  <option value="KES">KES</option>
                </select>
              </div>
              <div className="pricing-form-group">
                <label>Duration (days) *</label>
                <input
                  type="number"
                  value={newPlan.duration_days}
                  onChange={e => setNewPlan(p => ({ ...p, duration_days: e.target.value }))}
                  placeholder="30"
                  min="1"
                  className="pricing-input"
                />
              </div>
              <div className="pricing-form-group full-width">
                <label>Plan Features</label>
                <div className="pricing-features-selector">
                  {FEATURE_OPTIONS.map(opt => {
                    const sel = selectedFeatures[opt.id]
                    const isEnabled = sel?.enabled
                    return (
                      <div key={opt.id} className={`pricing-feature-option ${isEnabled ? 'active' : ''}`}>
                        <label className="pricing-feature-checkbox">
                          <input
                            type="checkbox"
                            checked={!!isEnabled}
                            onChange={() => toggleFeature(opt.id)}
                          />
                          <span>{opt.label}</span>
                        </label>
                        {isEnabled && opt.hasLimit && (
                          <div className="pricing-feature-limit">
                            <label className="pricing-limit-toggle">
                              <input
                                type="checkbox"
                                checked={sel?.unlimited ?? true}
                                onChange={e => updateFeatureOption(opt.id, 'unlimited', e.target.checked)}
                              />
                              <span>Unlimited</span>
                            </label>
                            {!sel?.unlimited && (
                              <input
                                type="number"
                                className="pricing-limit-input"
                                value={sel?.limit || ''}
                                onChange={e => updateFeatureOption(opt.id, 'limit', e.target.value)}
                                placeholder="Limit per day"
                                min="1"
                              />
                            )}
                          </div>
                        )}
                        {isEnabled && opt.customLabel && (
                          <input
                            type="text"
                            className="pricing-input pricing-custom-label"
                            value={sel?.customText || ''}
                            onChange={e => updateFeatureOption(opt.id, 'customText', e.target.value)}
                            placeholder={opt.placeholder}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <button className="pricing-create-btn" onClick={handleCreatePlan} disabled={createLoading}>
              {createLoading ? 'Creating...' : 'Create Plan'}
            </button>
          </div>
        )}

        {/* Render plan cards grouped by currency tier */}
        {(() => {
          const renderPlanCard = (planId) => {
            const priceConfig = configs.find(c => c.config_key === `plan_${planId}_price`)
            const nameConfig = configs.find(c => c.config_key === `plan_${planId}_name`)
            const durationConfig = configs.find(c => c.config_key === `plan_${planId}_duration`)
            const currencyConfig = configs.find(c => c.config_key === `plan_${planId}_currency`)
            const featuresConfig = configs.find(c => c.config_key === `plan_${planId}_features`)
            if (!priceConfig || !nameConfig) return null

            const planCurrency = currencyConfig ? getDisplayValue(currencyConfig) : (planId.endsWith('_kes') ? 'KES' : 'USD')
            const planCurrSymbol = planCurrency === 'USD' ? '$' : 'KES '
            const currentFeatures = getDisplayValue(featuresConfig)
            const featuresArr = Array.isArray(currentFeatures) ? currentFeatures : []

            return (
              <div key={planId} className="pricing-plan-card">
                <div className="pricing-plan-card-header">
                  <span className={`pricing-currency-badge ${planCurrency.toLowerCase()}`}>{planCurrency}</span>
                  <span className="pricing-plan-id">{planId}</span>
                  {!['weekly_usd', 'weekly_kes', 'monthly_usd', 'monthly_kes'].includes(planId) && (
                    <button className="pricing-delete-btn" onClick={() => setDeleteConfirm(planId)} title="Delete plan">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  )}
                </div>
                <div className="pricing-plan-fields">
                  <div className="pricing-field">
                    <label>Name</label>
                    <input
                      type="text"
                      value={getDisplayValue(nameConfig)}
                      onChange={e => handleValueChange(nameConfig.config_key, e.target.value)}
                      className="pricing-input"
                    />
                  </div>
                  <div className="pricing-field">
                    <label>Price ({planCurrSymbol.trim()})</label>
                    <input
                      type="number"
                      value={getDisplayValue(priceConfig)}
                      onChange={e => handleValueChange(priceConfig.config_key, e.target.value)}
                      min="0"
                      step="0.01"
                      className="pricing-input"
                    />
                  </div>
                  <div className="pricing-field">
                    <label>Duration (days)</label>
                    <input
                      type="number"
                      value={getDisplayValue(durationConfig)}
                      onChange={e => handleValueChange(durationConfig.config_key, e.target.value)}
                      min="1"
                      className="pricing-input"
                    />
                  </div>
                  <div className="pricing-field full-width">
                    <label>Features ({featuresArr.length})</label>
                    <textarea
                      value={featuresArr.join('\n')}
                      onChange={e => handleValueChange(featuresConfig.config_key, e.target.value.split('\n').filter(Boolean))}
                      className="pricing-input pricing-textarea"
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            )
          }

          // Split plans by currency
          const usdPlans = activePlans.filter(id => {
            const cc = configs.find(c => c.config_key === `plan_${id}_currency`)
            const cur = cc ? getDisplayValue(cc) : (id.endsWith('_kes') ? 'KES' : 'USD')
            return cur === 'USD'
          })
          const kesPlans = activePlans.filter(id => {
            const cc = configs.find(c => c.config_key === `plan_${id}_currency`)
            const cur = cc ? getDisplayValue(cc) : (id.endsWith('_kes') ? 'KES' : 'USD')
            return cur === 'KES'
          })

          return (
            <>
              {/* USD Tier */}
              <div className="pricing-tier">
                <div className="pricing-tier-header usd">
                  <span className="pricing-tier-badge usd">$</span>
                  <div>
                    <h5 className="pricing-tier-title">USD Packages — Rest of World</h5>
                    <small className="pricing-tier-desc">Visible to all users outside Kenya. Payments via card.</small>
                  </div>
                </div>
                <div className="pricing-plans-grid">
                  {usdPlans.map(renderPlanCard)}
                </div>
              </div>

              {/* KES Tier */}
              <div className="pricing-tier">
                <div className="pricing-tier-header kes">
                  <span className="pricing-tier-badge kes">KES</span>
                  <div>
                    <h5 className="pricing-tier-title">KES Packages — Kenya Only</h5>
                    <small className="pricing-tier-desc">Visible only to users with a Kenyan IP address. Payments via M-Pesa.</small>
                  </div>
                </div>
                <div className="pricing-plans-grid">
                  {kesPlans.map(renderPlanCard)}
                </div>
              </div>
            </>
          )
        })()}
      </div>

      {/* ─── Pay-Per-Use Pricing ─── */}
      {(() => {
        const payPerUse = grouped.pay_per_use || []
        const usdPPU = payPerUse.filter(c => c.config_key.includes('_usd'))
        const kesPPU = payPerUse.filter(c => c.config_key.includes('_kes'))
        const renderPPUCard = (config, prefix) => (
          <div key={config.config_key} className="pricing-setting-card">
            <div className="pricing-setting-label">
              <span>{config.label}</span>
              {config.description && <small>{config.description}</small>}
            </div>
            <div className="pricing-setting-input">
              <span className="pricing-input-prefix">{prefix}</span>
              <input
                type="number"
                value={getDisplayValue(config)}
                onChange={e => handleValueChange(config.config_key, e.target.value)}
                min="0"
                step="0.01"
                className="pricing-input"
              />
            </div>
          </div>
        )
        return (
          <div className="pricing-section">
            <h4>Pay-Per-Use Pricing</h4>
            <div className="pricing-tier">
              <div className="pricing-tier-header usd" style={{marginBottom: 12}}>
                <span className="pricing-tier-badge usd">$</span>
                <h5 className="pricing-tier-title" style={{margin: 0}}>USD Pricing</h5>
              </div>
              <div className="pricing-settings-grid">
                {usdPPU.map(c => renderPPUCard(c, '$'))}
              </div>
            </div>
            <div className="pricing-tier">
              <div className="pricing-tier-header kes" style={{marginBottom: 12}}>
                <span className="pricing-tier-badge kes">KES</span>
                <h5 className="pricing-tier-title" style={{margin: 0}}>KES Pricing</h5>
              </div>
              <div className="pricing-settings-grid">
                {kesPPU.map(c => renderPPUCard(c, 'KES'))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ─── Commissions ─── */}
      <div className="pricing-section">
        <h4>Commission Rates</h4>
        <div className="pricing-settings-grid">
          {(grouped.commissions || []).map(config => {
            const pctValue = getDisplayValue(config)
            const displayPct = Math.round(pctValue * 100)
            return (
              <div key={config.config_key} className="pricing-setting-card">
                <div className="pricing-setting-label">
                  <span>{config.label}</span>
                  {config.description && <small>{config.description}</small>}
                </div>
                <div className="pricing-setting-input">
                  <input
                    type="number"
                    value={displayPct}
                    onChange={e => handleValueChange(config.config_key, (parseFloat(e.target.value) / 100).toFixed(2))}
                    min="0"
                    max="100"
                    step="1"
                    className="pricing-input"
                  />
                  <span className="pricing-input-suffix">%</span>
                </div>
              </div>
            )
          })}
        </div>
        {(() => {
          const creatorShare = getDisplayValue(configs.find(c => c.config_key === 'creator_sale_share') || { parsed_value: 0.70 })
          const platformFee = Math.round((1 - creatorShare) * 100)
          return (
            <div className="pricing-computed-note">
              Platform fee on prediction sales: <strong>{platformFee}%</strong> (100% - {Math.round(creatorShare * 100)}% creator share)
            </div>
          )
        })()}
      </div>

      {/* ─── Free Tier Limits ─── */}
      <div className="pricing-section">
        <h4>Free Tier Limits</h4>
        <div className="pricing-settings-grid">
          {(grouped.free_tier || []).map(config => (
            <div key={config.config_key} className="pricing-setting-card">
              <div className="pricing-setting-label">
                <span>{config.label}</span>
                {config.description && <small>{config.description}</small>}
              </div>
              <div className="pricing-setting-input">
                <input
                  type="number"
                  value={getDisplayValue(config)}
                  onChange={e => handleValueChange(config.config_key, e.target.value)}
                  min="0"
                  step="1"
                  className="pricing-input"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Save Bar ─── */}
      {hasChanges && (
        <div className="pricing-save-bar">
          <span className="pricing-save-count">{Object.keys(editedValues).length} unsaved change(s)</span>
          <button className="pricing-discard-btn" onClick={handleDiscard}>Discard</button>
          <button className="pricing-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="admin-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <h3>Delete Plan</h3>
            <p className="admin-modal-user">
              Are you sure you want to delete plan <strong>{deleteConfirm}</strong>?
            </p>
            <p style={{ color: '#fca5a5', fontSize: 13 }}>
              This will remove the plan from the subscription options. Existing subscribers on this plan will not be affected.
            </p>
            <div className="admin-modal-actions">
              <button className="admin-modal-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="admin-modal-confirm" style={{ background: '#dc2626' }} onClick={() => handleDeletePlan(deleteConfirm)}>
                Delete Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
