import { useState, useCallback, useEffect } from 'react'
import { useAdmin } from '../../context/AdminContext'

const PLATFORM_ICONS = {
  telegram: '\u{1F4AC}',
  whatsapp: '\u{1F4F1}',
  facebook: '\u{1F30D}',
  instagram: '\u{1F4F7}',
  x: '\u{1D54F}',
}

export default function SocialCompose({ accounts }) {
  const { getAuthHeaders } = useAdmin()
  const [activeSubTab, setActiveSubTab] = useState('create')
  const [title, setTitle] = useState('')
  const [contentText, setContentText] = useState('')
  const [mediaUrls, setMediaUrls] = useState([])
  const [selectedPlatforms, setSelectedPlatforms] = useState([])
  const [scheduleType, setScheduleType] = useState('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [posts, setPosts] = useState([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  // Channels/groups per account
  const [accountChannels, setAccountChannels] = useState({})
  const [selectedChannels, setSelectedChannels] = useState({})

  const connectedAccounts = accounts.filter(a => a.status === 'connected')

  const fetchPosts = useCallback(async () => {
    setPostsLoading(true)
    try {
      const res = await fetch('/api/admin/social/posts', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setPosts(data.posts || [])
      }
    } catch {}
    setPostsLoading(false)
  }, [getAuthHeaders])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  // Fetch channels for an account when selected
  const fetchChannels = useCallback(async (accountId) => {
    if (accountChannels[accountId]) return
    try {
      const res = await fetch(`/api/admin/social/accounts/${accountId}/channels`, {
        headers: getAuthHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setAccountChannels(prev => ({ ...prev, [accountId]: data.channels || [] }))
      }
    } catch {}
  }, [getAuthHeaders, accountChannels])

  const togglePlatform = (accountId, platform) => {
    setSelectedPlatforms(prev => {
      const exists = prev.find(p => p.account_id === accountId)
      if (exists) {
        // Deselecting — also clear channel selection
        setSelectedChannels(prev => {
          const next = { ...prev }
          delete next[accountId]
          return next
        })
        return prev.filter(p => p.account_id !== accountId)
      }
      // Selecting — fetch channels
      fetchChannels(accountId)
      return [...prev, { platform, account_id: accountId }]
    })
  }

  const selectChannel = (accountId, chatId) => {
    setSelectedChannels(prev => ({ ...prev, [accountId]: chatId }))
  }

  const handleMediaUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const hdrs = getAuthHeaders()
      delete hdrs['Content-Type']
      const res = await fetch('/api/admin/social/media/upload', {
        method: 'POST',
        headers: hdrs,
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        setMediaUrls(prev => [...prev, data.media.file_url])
      } else {
        const err = await res.json().catch(() => ({}))
        setResult({ success: false, error: err.detail || 'Upload failed' })
      }
    } catch (e) {
      setResult({ success: false, error: `Upload error: ${e.message}` })
    }
    setUploading(false)
    e.target.value = ''
  }

  const removeMedia = (idx) => {
    setMediaUrls(prev => prev.filter((_, i) => i !== idx))
  }

  const handlePublish = async () => {
    if (!contentText.trim() || selectedPlatforms.length === 0) return

    // Build target_platforms with channel_id
    const targets = selectedPlatforms.map(p => {
      const target = { platform: p.platform, account_id: p.account_id }
      if (p.platform === 'telegram') {
        target.channel_id = selectedChannels[p.account_id] || ''
      }
      return target
    })

    // Validate Telegram targets have a channel selected
    const missingChannel = targets.find(t => t.platform === 'telegram' && !t.channel_id)
    if (missingChannel) {
      setResult({ success: false, error: 'Please select a group/channel for Telegram. If none appear, send a message in the group first so the bot detects it.' })
      return
    }

    setPublishing(true)
    setResult(null)
    try {
      const createRes = await fetch('/api/admin/social/posts', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content_text: contentText,
          media_urls: mediaUrls,
          target_platforms: targets,
          scheduled_at: scheduleType === 'later' ? scheduledAt : null,
        })
      })

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}))
        setResult({ success: false, error: err.detail || `Create failed (${createRes.status})` })
        setPublishing(false)
        return
      }

      const createData = await createRes.json()

      if (scheduleType === 'now') {
        const pubRes = await fetch(`/api/admin/social/posts/${createData.post.id}/publish`, {
          method: 'POST',
          headers: getAuthHeaders(),
        })
        const pubData = await pubRes.json().catch(() => ({}))
        if (pubRes.ok) {
          const allSuccess = pubData.results?.every(r => r.success)
          const anyFail = pubData.results?.some(r => !r.success)
          if (allSuccess) {
            setResult({ success: true, results: pubData.results })
          } else {
            const errors = pubData.results?.filter(r => !r.success).map(r => r.error).join(', ')
            setResult({ success: !anyFail, partial: anyFail, error: errors, results: pubData.results })
          }
        } else {
          setResult({ success: false, error: pubData.detail || 'Publish failed' })
        }
      } else {
        setResult({ success: true, scheduled: true })
      }

      // Reset form
      setTitle('')
      setContentText('')
      setMediaUrls([])
      setSelectedPlatforms([])
      setSelectedChannels({})
      setScheduleType('now')
      setScheduledAt('')
      fetchPosts()
    } catch (e) {
      setResult({ success: false, error: `Network error: ${e.message}` })
    }
    setPublishing(false)
  }

  const handleSaveDraft = async () => {
    if (!contentText.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/social/posts', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content_text: contentText,
          media_urls: mediaUrls,
          target_platforms: selectedPlatforms,
        })
      })
      if (res.ok) {
        setTitle('')
        setContentText('')
        setMediaUrls([])
        setSelectedPlatforms([])
        setSelectedChannels({})
        setResult({ success: true, draft: true })
        fetchPosts()
      } else {
        const err = await res.json().catch(() => ({}))
        setResult({ success: false, error: err.detail || 'Save failed' })
      }
    } catch (e) {
      setResult({ success: false, error: `Network error: ${e.message}` })
    }
    setSaving(false)
  }

  const statusColors = {
    draft: '#94a3b8',
    scheduled: '#f59e0b',
    publishing: '#3b82f6',
    published: '#22c55e',
    failed: '#ef4444',
    partial: '#f97316',
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={`social-filter-btn ${activeSubTab === 'create' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('create')}
        >
          Create New
        </button>
        <button
          className={`social-filter-btn ${activeSubTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('history')}
        >
          Post History ({posts.length})
        </button>
      </div>

      {activeSubTab === 'create' ? (
        <div className="social-compose-form">
          {/* Title */}
          <div className="social-compose-field">
            <label>Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Post title..."
              className="social-setup-input"
              style={{ marginTop: 0 }}
            />
          </div>

          {/* Content */}
          <div className="social-compose-field">
            <label>Content</label>
            <textarea
              className="social-compose-textarea"
              value={contentText}
              onChange={e => setContentText(e.target.value)}
              placeholder="Write your message here..."
            />
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 4, textAlign: 'right' }}>
              {contentText.length} characters
            </div>
          </div>

          {/* Media */}
          <div className="social-compose-field">
            <label>Media</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {mediaUrls.map((url, i) => (
                <div key={i} style={{
                  position: 'relative', width: 80, height: 80, borderRadius: 8,
                  border: '1px solid var(--admin-border)', overflow: 'hidden'
                }}>
                  {url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  height: '100%', fontSize: 24, background: 'var(--admin-surface)' }}>
                      {'\u{1F4CE}'}
                    </div>
                  )}
                  <button
                    onClick={() => removeMedia(i)}
                    style={{
                      position: 'absolute', top: 2, right: 2, width: 20, height: 20,
                      borderRadius: '50%', background: 'rgba(0,0,0,0.7)', color: '#fff',
                      border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1,
                    }}
                  >
                    {'\u00D7'}
                  </button>
                </div>
              ))}
              <label style={{
                width: 80, height: 80, borderRadius: 8, border: '2px dashed var(--admin-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 24, color: 'var(--admin-text-muted)',
              }}>
                {uploading ? '\u23F3' : '+'}
                <input type="file" hidden onChange={handleMediaUpload}
                       accept="image/*,video/*,.pdf,.doc,.docx" />
              </label>
            </div>
          </div>

          {/* Target Platforms */}
          <div className="social-compose-field">
            <label>Publish To</label>
            {connectedAccounts.length === 0 ? (
              <p style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>
                No connected accounts. Go to Accounts tab to connect a platform.
              </p>
            ) : (
              <div className="social-platform-checkboxes">
                {connectedAccounts.map(acc => {
                  const selected = selectedPlatforms.find(p => p.account_id === acc.id)
                  const channels = accountChannels[acc.id] || []
                  return (
                    <div key={acc.id}>
                      <button
                        className={`social-platform-check ${selected ? 'selected' : ''}`}
                        onClick={() => togglePlatform(acc.id, acc.platform)}
                      >
                        <span>{PLATFORM_ICONS[acc.platform]}</span>
                        <span>{acc.account_name}</span>
                        <span style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
                          {acc.account_identifier}
                        </span>
                      </button>

                      {/* Channel/Group selector for Telegram */}
                      {selected && acc.platform === 'telegram' && (
                        <div style={{ marginTop: 6, marginLeft: 12, marginBottom: 8 }}>
                          <label style={{ fontSize: 12, color: 'var(--admin-text-muted)', display: 'block', marginBottom: 4 }}>
                            Select group/channel:
                          </label>
                          {channels.length === 0 ? (
                            <p style={{ fontSize: 12, color: '#f59e0b', margin: '4px 0' }}>
                              No groups detected yet. Send a message in the Telegram group first so the bot picks it up.
                            </p>
                          ) : (
                            <select
                              className="social-setup-input"
                              style={{ marginTop: 0, maxWidth: 320, fontSize: 13 }}
                              value={selectedChannels[acc.id] || ''}
                              onChange={e => selectChannel(acc.id, e.target.value)}
                            >
                              <option value="">-- Select group/channel --</option>
                              {channels.map(ch => (
                                <option key={ch.chat_id} value={ch.chat_id}>
                                  {ch.name} ({ch.chat_type === 'private' ? 'DM' : ch.chat_type})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Schedule */}
          <div className="social-compose-field">
            <label>When to Publish</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={`social-filter-btn ${scheduleType === 'now' ? 'active' : ''}`}
                onClick={() => setScheduleType('now')}
              >
                Publish Now
              </button>
              <button
                className={`social-filter-btn ${scheduleType === 'later' ? 'active' : ''}`}
                onClick={() => setScheduleType('later')}
              >
                Schedule
              </button>
            </div>
            {scheduleType === 'later' && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="social-setup-input"
                style={{ marginTop: 8, maxWidth: 280 }}
              />
            )}
          </div>

          {/* Result message */}
          {result && (
            <div style={{
              padding: '12px 16px', borderRadius: 8, marginBottom: 16,
              background: result.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${result.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: result.success ? '#86efac' : '#fca5a5', fontSize: 13,
            }}>
              {result.success
                ? (result.scheduled ? 'Post scheduled successfully!'
                  : result.draft ? 'Draft saved successfully!'
                  : 'Post published successfully!')
                : `Error: ${result.error || 'Failed to publish post.'}`}
              {result.results && (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  {result.results.map((r, i) => (
                    <div key={i} style={{ color: r.success ? '#86efac' : '#fca5a5' }}>
                      {r.platform}: {r.success ? 'Sent' : r.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="social-send-btn"
              onClick={handlePublish}
              disabled={!contentText.trim() || selectedPlatforms.length === 0 || publishing}
              style={{ flex: 1 }}
            >
              {publishing ? 'Publishing...' : (scheduleType === 'later' ? 'Schedule Post' : 'Publish Now')}
            </button>
            <button
              className="social-action-btn"
              onClick={handleSaveDraft}
              disabled={!contentText.trim() || saving}
              style={{ padding: '8px 16px' }}
            >
              {saving ? '...' : 'Save Draft'}
            </button>
          </div>
        </div>
      ) : (
        /* Post History */
        <div>
          {postsLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--admin-text-muted)', padding: 40 }}>Loading...</div>
          ) : posts.length === 0 ? (
            <div className="social-empty-state">
              <div className="social-empty-icon">{'\u{1F4DD}'}</div>
              <p style={{ color: 'var(--admin-text-muted)' }}>No posts yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {posts.map(post => (
                <div key={post.id} className="social-account-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      {post.title && (
                        <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--admin-text)' }}>
                          {post.title}
                        </div>
                      )}
                      <div style={{ fontSize: 13, color: 'var(--admin-text-muted)', marginBottom: 8 }}>
                        {post.content_text?.substring(0, 150)}{post.content_text?.length > 150 ? '...' : ''}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10,
                          background: `${statusColors[post.status] || '#94a3b8'}20`,
                          color: statusColors[post.status] || '#94a3b8',
                          fontWeight: 600, textTransform: 'uppercase',
                        }}>
                          {post.status}
                        </span>
                        {post.target_platforms?.map((tp, i) => (
                          <span key={i}>{PLATFORM_ICONS[tp.platform] || tp.platform}</span>
                        ))}
                        <span style={{ color: 'var(--admin-text-muted)' }}>
                          {new Date(post.created_at).toLocaleDateString()}
                        </span>
                        {post.created_by_name && (
                          <span style={{ color: 'var(--admin-text-muted)' }}>by {post.created_by_name}</span>
                        )}
                      </div>
                    </div>
                    {post.status === 'draft' && (
                      <button
                        className="social-send-btn"
                        style={{ padding: '6px 12px', fontSize: 12 }}
                        onClick={async () => {
                          const res = await fetch(`/api/admin/social/posts/${post.id}/publish`, {
                            method: 'POST', headers: getAuthHeaders()
                          })
                          fetchPosts()
                        }}
                      >
                        Publish
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
