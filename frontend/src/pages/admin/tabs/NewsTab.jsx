import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'

const CATEGORIES = ['transfers', 'match-updates', 'injuries', 'results', 'rumors', 'general']

const POPULAR_EMOJIS = [
  '⚽','🔥','🚨','💰','✅','❌','🏆','🥇','📈','📊','💪','👀','🎯','⭐','🔴',
  '🟢','🟡','🔵','⚪','🟠','🤝','✍️','💬','📌','🗓️','🚀','💡','⚠️','🎉','👏',
]

export default function NewsTab() {
  const { getAuthHeaders } = useAdmin()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [scraping, setScraping] = useState(false)
  const [sendPush, setSendPush] = useState(true)

  // Composer state
  const [composing, setComposing] = useState(false)
  const [editPost, setEditPost] = useState(null)
  const [form, setForm] = useState({
    title: '', body: '', category: 'general', tags: '',
    cover_image: '', status: 'draft', author_name: 'Spark AI', excerpt: '',
    teams: '',
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const fileRef = useRef(null)
  const bodyRef = useRef(null)
  const emojiRef = useRef(null)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const params = { post_type: 'news' }
      if (filterStatus) params.status = filterStatus
      if (filterCategory) params.category = filterCategory
      const res = await axios.get('/api/admin/blog', { headers: getAuthHeaders(), params })
      setPosts(res.data.posts || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders, filterStatus, filterCategory])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  // Auto-refresh every 60 seconds to pick up new scraped posts
  useEffect(() => {
    const interval = setInterval(() => { fetchPosts() }, 60000)
    return () => clearInterval(interval)
  }, [fetchPosts])

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  // Close emoji picker on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmojiPicker(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const resetForm = () => {
    setForm({ title: '', body: '', category: 'general', tags: '', cover_image: '', status: 'draft', author_name: 'Spark AI', excerpt: '', teams: '' })
    setEditPost(null)
    setComposing(false)
    setShowEmojiPicker(false)
  }

  const openComposer = (post = null) => {
    if (post) {
      setEditPost(post)
      setForm({
        title: post.title || '',
        body: post.body || '',
        category: post.category || 'general',
        tags: Array.isArray(post.tags) ? post.tags.join(', ') : (post.tags || '').replace(/[\[\]']/g, ''),
        cover_image: post.cover_image || '',
        status: post.status || 'draft',
        author_name: post.author_name || 'Spark AI',
        excerpt: post.excerpt || '',
        teams: Array.isArray(post.teams) ? post.teams.join(', ') : (post.teams || '').replace(/[\[\]']/g, ''),
      })
    } else {
      setEditPost(null)
      setForm({ title: '', body: '', category: 'general', tags: '', cover_image: '', status: 'draft', author_name: 'Spark AI', excerpt: '', teams: '' })
    }
    setComposing(true)
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await axios.post('/api/admin/blog/upload-image', fd, {
        headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' },
      })
      setForm(f => ({ ...f, cover_image: res.data.url }))
      showMsg('success', 'Image uploaded')
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Upload failed')
    }
    setUploading(false)
  }

  const insertEmoji = (emoji) => {
    const ta = bodyRef.current
    if (!ta) { setForm(f => ({ ...f, body: f.body + emoji })); return }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const newBody = form.body.substring(0, start) + emoji + form.body.substring(end)
    setForm(f => ({ ...f, body: newBody }))
    setShowEmojiPicker(false)
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + emoji.length }, 0)
  }

  const handleSave = async (publishOverride) => {
    if (!form.body.trim() && !form.title.trim()) { showMsg('error', 'Write something first'); return }
    setSaving(true)
    // Auto-generate title from body if not provided
    const title = form.title.trim() || form.body.substring(0, 80).replace(/<[^>]*>/g, '').trim() || 'News Update'
    const excerpt = form.excerpt.trim() || form.body.substring(0, 160).replace(/<[^>]*>/g, '').trim()
    const payload = {
      ...form,
      title,
      excerpt,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      teams: form.teams.split(',').map(t => t.trim()).filter(Boolean),
      status: publishOverride || form.status,
      post_type: 'news',
    }
    try {
      if (editPost) {
        await axios.put(`/api/admin/blog/${editPost.id}`, { ...payload, send_push: sendPush }, { headers: getAuthHeaders() })
        showMsg('success', 'Post updated')
      } else {
        await axios.post('/api/admin/blog', payload, { headers: getAuthHeaders() })
        showMsg('success', 'Post created')
      }
      resetForm()
      fetchPosts()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Save failed')
    }
    setSaving(false)
  }

  const handleScrapeNow = async () => {
    setScraping(true)
    try {
      const res = await axios.post('/api/admin/blog/scrape-now', {}, { headers: getAuthHeaders() })
      const { new_posts, skipped } = res.data
      if (new_posts > 0) {
        showMsg('success', `Scraped ${new_posts} new post(s) from Telegram`)
        setFilterStatus('pending')
        fetchPosts()
      } else {
        showMsg('success', `No new posts found (${skipped} already imported)`)
      }
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Scrape failed')
    }
    setScraping(false)
  }

  const handleDelete = async (postId) => {
    try {
      await axios.delete(`/api/admin/blog/${postId}`, { headers: getAuthHeaders() })
      showMsg('success', 'Post deleted')
      setDeleteConfirm(null)
      fetchPosts()
    } catch {
      showMsg('error', 'Delete failed')
    }
  }

  const handlePublishToggle = async (post, withPush = true) => {
    const newStatus = post.status === 'published' ? 'draft' : 'published'
    try {
      await axios.put(`/api/admin/blog/${post.id}`, {
        ...post, status: newStatus,
        tags: Array.isArray(post.tags) ? post.tags : [],
        send_push: withPush && newStatus === 'published',
      }, { headers: getAuthHeaders() })
      showMsg('success', newStatus === 'published' ? 'Published & notified users!' : 'Unpublished')
      fetchPosts()
    } catch {
      showMsg('error', 'Update failed')
    }
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const now = new Date()
    const diff = (now - d) / 1000
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Render body text with basic formatting
  const renderBody = (text) => {
    if (!text) return ''
    let html = text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#3b82f6">$1</a>')
    // Wrap plain text paragraphs
    html = html.split('\n\n').map(block => {
      const trimmed = block.trim()
      if (!trimmed) return ''
      if (/^<(h[1-6]|ul|ol|li|div|img|iframe|hr|figure|video|table|blockquote|section|br)/i.test(trimmed)) return trimmed
      if (/<(img|div|iframe|video|figure|hr)\b/i.test(trimmed)) return trimmed
      return `<p style="margin:0 0 8px">${trimmed.replace(/\n/g, '<br/>')}</p>`
    }).join('')
    return html
  }

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={s.pageTitle}>News Feed</h2>
            <p style={s.pageSubtitle}>Post updates, transfer news, match results & more</p>
          </div>
          <button style={s.scrapeBtn} onClick={handleScrapeNow} disabled={scraping}>
            {scraping ? (
              <><div className="spinner" style={{ width: 14, height: 14 }} /> Scraping...</>
            ) : (
              <><span style={{ fontSize: 16 }}>📡</span> Fetch from Telegram</>
            )}
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div style={{ ...s.msg, background: message.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: message.type === 'success' ? '#22c55e' : '#ef4444' }}>
          {message.text}
        </div>
      )}

      {/* Composer */}
      <div style={s.composer}>
        {!composing ? (
          <div style={s.composerPrompt} onClick={() => openComposer()}>
            <div style={s.composerAvatar}>
              <span style={{ fontSize: 18 }}>📰</span>
            </div>
            <span style={s.composerPlaceholder}>What's the latest news?</span>
            <button style={s.composeBtn}>Post</button>
          </div>
        ) : (
          <div style={s.composerExpanded}>
            <div style={s.composerTop}>
              <div style={s.composerAvatar}>
                <span style={{ fontSize: 18 }}>📰</span>
              </div>
              <div style={{ flex: 1 }}>
                <input style={s.titleInput} placeholder="Headline (optional)" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <button style={s.closeComposer} onClick={resetForm}>&times;</button>
            </div>

            <textarea ref={bodyRef} style={s.bodyInput} placeholder="Write your news update..." rows={4}
              value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} autoFocus spellCheck />

            {/* Image preview */}
            {form.cover_image && (
              <div style={s.imagePreview}>
                <img src={form.cover_image} alt="attached" style={s.previewImg} />
                <button style={s.removeImg} onClick={() => setForm(f => ({ ...f, cover_image: '' }))}>&times;</button>
              </div>
            )}

            {/* Composer toolbar */}
            <div style={s.composerToolbar}>
              <div style={s.toolbarLeft}>
                {/* Image upload */}
                <input type="file" accept="image/*" ref={fileRef} style={{ display: 'none' }} onChange={handleImageUpload} />
                <button style={s.toolIcon} title="Add image" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  )}
                </button>

                {/* Emoji picker */}
                <div ref={emojiRef} style={{ position: 'relative', display: 'inline-flex' }}>
                  <button style={s.toolIcon} title="Add emoji" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                    <span style={{ fontSize: 18 }}>😀</span>
                  </button>
                  {showEmojiPicker && (
                    <div style={s.emojiDropdown}>
                      <div style={s.emojiGrid}>
                        {POPULAR_EMOJIS.map(em => (
                          <button key={em} type="button" style={s.emojiBtn} onClick={() => insertEmoji(em)}>{em}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Category */}
                <select style={s.categorySelect} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}</option>)}
                </select>

                {/* Teams */}
                <input style={s.teamsInput} placeholder="⚽ Teams (e.g. Man City, Arsenal)" value={form.teams}
                  onChange={e => setForm(f => ({ ...f, teams: e.target.value }))} />
              </div>

              <div style={s.toolbarRight}>
                <label style={s.pushToggle} title="Send push notification to all users">
                  <input type="checkbox" checked={sendPush} onChange={e => setSendPush(e.target.checked)} />
                  <span style={{ fontSize: 14 }}>🔔</span>
                </label>
                <button style={s.draftBtn} onClick={() => handleSave('draft')} disabled={saving}>
                  {saving ? '...' : 'Save Draft'}
                </button>
                <button style={s.publishBtn} onClick={() => handleSave('published')} disabled={saving}>
                  {saving ? '...' : (editPost ? 'Update & Publish' : 'Publish')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={s.filterBar}>
        <div style={s.filterTabs}>
          <button style={filterStatus === '' ? s.filterTabActive : s.filterTab} onClick={() => setFilterStatus('')}>All</button>
          <button style={filterStatus === 'pending' ? s.filterTabActive : s.filterTab} onClick={() => setFilterStatus('pending')}>
            Pending
          </button>
          <button style={filterStatus === 'published' ? s.filterTabActive : s.filterTab} onClick={() => setFilterStatus('published')}>Published</button>
          <button style={filterStatus === 'draft' ? s.filterTabActive : s.filterTab} onClick={() => setFilterStatus('draft')}>Drafts</button>
        </div>
        <select style={s.catFilter} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}</option>)}
        </select>
      </div>

      {/* Feed */}
      {loading ? (
        <div style={s.center}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
      ) : posts.length === 0 ? (
        <div style={s.emptyState}>
          <span style={{ fontSize: 40 }}>📰</span>
          <p style={s.emptyText}>No news posts yet</p>
          <p style={s.emptyHint}>Create your first update above</p>
        </div>
      ) : (
        <div style={s.feed}>
          {posts.map(post => (
            <div key={post.id} style={s.feedCard}>
              {/* Card header */}
              <div style={s.cardHeader}>
                <div style={s.cardAuthor}>
                  <div style={s.authorAvatar}>
                    <span style={{ fontSize: 14 }}>📰</span>
                  </div>
                  <div>
                    <div style={s.authorName}>{post.author_name || 'Spark AI'}</div>
                    <div style={s.cardTime}>{formatTime(post.created_at)}</div>
                  </div>
                </div>
                <div style={s.cardBadges}>
                  {post.source === 'telegram' && (
                    <span style={s.telegramBadge}>Telegram</span>
                  )}
                  <span style={{
                    ...s.statusBadge,
                    background: post.status === 'published' ? 'rgba(34,197,94,0.12)' : post.status === 'pending' ? 'rgba(59,130,246,0.12)' : 'rgba(245,158,11,0.12)',
                    color: post.status === 'published' ? '#22c55e' : post.status === 'pending' ? '#3b82f6' : '#f59e0b',
                  }}>{post.status === 'published' ? 'Live' : post.status === 'pending' ? 'Pending' : 'Draft'}</span>
                  <span style={s.catBadge}>{(post.category || 'general').split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}</span>
                </div>
              </div>

              {/* Title */}
              {post.title && <h3 style={s.cardTitle}>{post.title}</h3>}

              {/* Body */}
              <div style={s.cardBody} dangerouslySetInnerHTML={{ __html: renderBody(post.body || post.excerpt || '') }} />

              {/* Image */}
              {post.cover_image && (
                <div style={s.cardImage}>
                  <img src={post.cover_image} alt="" style={s.cardImg} />
                </div>
              )}

              {/* Teams */}
              {Array.isArray(post.teams) && post.teams.length > 0 && (
                <div style={s.cardTeams}>
                  {post.teams.map(team => <span key={team} style={s.teamBadge}>⚽ {team}</span>)}
                </div>
              )}

              {/* Tags */}
              {Array.isArray(post.tags) && post.tags.length > 0 && (
                <div style={s.cardTags}>
                  {post.tags.map(tag => <span key={tag} style={s.tag}>#{tag}</span>)}
                </div>
              )}

              {/* Source link */}
              {post.source_url && (
                <a href={post.source_url} target="_blank" rel="noopener noreferrer" style={s.sourceLink}>
                  View original &rarr;
                </a>
              )}

              {/* Footer actions */}
              <div style={s.cardFooter}>
                <span style={s.viewCount}>{post.views || 0} views</span>
                <div style={s.cardActions}>
                  {post.status === 'pending' ? (
                    <>
                      <button style={s.actionBtnPublish} onClick={() => handlePublishToggle(post, true)}>
                        Approve & Publish
                      </button>
                      <button style={s.actionBtnEdit} onClick={() => {
                        axios.get(`/api/admin/blog/${post.id}`, { headers: getAuthHeaders() })
                          .then(r => openComposer(r.data))
                          .catch(() => openComposer(post))
                      }}>Edit</button>
                      <button style={s.actionBtnDanger} onClick={() => handleDelete(post.id)}>Reject</button>
                    </>
                  ) : (
                    <>
                      <button style={s.actionBtn} onClick={() => handlePublishToggle(post)}>
                        {post.status === 'published' ? 'Unpublish' : 'Publish'}
                      </button>
                      <button style={s.actionBtnEdit} onClick={() => {
                        axios.get(`/api/admin/blog/${post.id}`, { headers: getAuthHeaders() })
                          .then(r => openComposer(r.data))
                          .catch(() => openComposer(post))
                      }}>Edit</button>
                      {deleteConfirm === post.id ? (
                        <>
                          <button style={s.actionBtnDanger} onClick={() => handleDelete(post.id)}>Confirm</button>
                          <button style={s.actionBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
                        </>
                      ) : (
                        <button style={s.actionBtnDanger} onClick={() => setDeleteConfirm(post.id)}>Delete</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// -- Styles --
const s = {
  container: { padding: 0, maxWidth: 720, margin: '0 auto' },
  header: { marginBottom: 20 },
  pageTitle: { margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' },
  pageSubtitle: { margin: '4px 0 0', fontSize: 13, color: '#64748b' },
  msg: { padding: '10px 16px', borderRadius: 10, fontSize: 13, marginBottom: 16 },
  center: { display: 'flex', justifyContent: 'center', padding: 40 },

  // Composer
  composer: { marginBottom: 20 },
  composerPrompt: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
    background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b', borderRadius: 14,
    cursor: 'pointer', transition: 'border-color 0.2s',
  },
  composerAvatar: {
    width: 40, height: 40, borderRadius: '50%', background: 'rgba(59,130,246,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  composerPlaceholder: { flex: 1, color: '#64748b', fontSize: 14 },
  composeBtn: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 20, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  composerExpanded: {
    background: 'rgba(15,23,42,0.6)', border: '1px solid #334155', borderRadius: 14, padding: 16,
  },
  composerTop: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  closeComposer: { background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1 },
  titleInput: {
    width: '100%', background: 'transparent', border: 'none', color: '#f1f5f9',
    fontSize: 16, fontWeight: 600, padding: '4px 0', outline: 'none',
  },
  bodyInput: {
    width: '100%', background: 'transparent', border: 'none', color: '#e2e8f0',
    fontSize: 14, lineHeight: 1.6, padding: '0 0 0 12px', resize: 'none', outline: 'none',
    minHeight: 100, boxSizing: 'border-box',
  },
  imagePreview: { position: 'relative', marginLeft: 12, marginTop: 10, borderRadius: 12, overflow: 'hidden', maxWidth: 400 },
  previewImg: { width: '100%', maxHeight: 250, objectFit: 'cover', borderRadius: 12 },
  removeImg: {
    position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%',
    background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', fontSize: 16,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  composerToolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 12, marginTop: 12, borderTop: '1px solid #1e293b', flexWrap: 'wrap', gap: 8,
  },
  toolbarLeft: { display: 'flex', alignItems: 'center', gap: 6 },
  toolbarRight: { display: 'flex', gap: 8 },
  toolIcon: {
    background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer',
    padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center',
    transition: 'background 0.15s',
  },
  categorySelect: {
    background: '#0f172a', color: '#94a3b8', border: '1px solid #1e293b',
    borderRadius: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer',
  },
  tagsInput: {
    background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b',
    borderRadius: 8, padding: '4px 8px', fontSize: 12, width: 100, outline: 'none',
  },
  draftBtn: {
    background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid #334155',
    borderRadius: 20, padding: '7px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
  },
  publishBtn: {
    background: '#22c55e', color: '#fff', border: 'none',
    borderRadius: 20, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  emojiDropdown: {
    position: 'absolute', top: '100%', left: -60, marginTop: 6, background: '#1e293b',
    border: '1px solid #334155', borderRadius: 12, padding: 8, zIndex: 100,
    width: 240, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },
  emojiGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2 },
  emojiBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 4, borderRadius: 6 },

  // Filters
  filterBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 },
  filterTabs: { display: 'flex', gap: 4 },
  filterTab: {
    background: 'none', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 500,
    padding: '6px 14px', cursor: 'pointer', borderRadius: 20, transition: 'all 0.15s',
  },
  filterTabActive: {
    background: 'rgba(59,130,246,0.12)', border: 'none', color: '#3b82f6', fontSize: 13,
    fontWeight: 600, padding: '6px 14px', cursor: 'pointer', borderRadius: 20,
  },
  catFilter: {
    background: '#0f172a', color: '#94a3b8', border: '1px solid #1e293b',
    borderRadius: 8, padding: '6px 10px', fontSize: 12,
  },

  // Empty state
  emptyState: { textAlign: 'center', padding: '60px 20px' },
  emptyText: { color: '#64748b', fontSize: 16, margin: '12px 0 4px' },
  emptyHint: { color: '#475569', fontSize: 13 },

  // Feed
  feed: { display: 'flex', flexDirection: 'column', gap: 16 },
  feedCard: {
    background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b', borderRadius: 14,
    padding: 18, transition: 'border-color 0.2s',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardAuthor: { display: 'flex', gap: 10, alignItems: 'center' },
  authorAvatar: {
    width: 36, height: 36, borderRadius: '50%', background: 'rgba(59,130,246,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  authorName: { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  cardTime: { fontSize: 11, color: '#64748b' },
  cardBadges: { display: 'flex', gap: 6 },
  statusBadge: { fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12 },
  catBadge: {
    fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 12,
    background: 'rgba(99,102,241,0.1)', color: '#818cf8',
  },
  cardTitle: { margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3 },
  cardBody: { fontSize: 14, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 10 },
  cardImage: { borderRadius: 12, overflow: 'hidden', marginBottom: 10, maxHeight: 350 },
  cardImg: { width: '100%', maxHeight: 350, objectFit: 'cover', display: 'block' },
  cardTags: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  tag: { fontSize: 12, color: '#3b82f6', fontWeight: 500 },
  cardFooter: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 10, borderTop: '1px solid rgba(30,41,59,0.8)',
  },
  viewCount: { fontSize: 12, color: '#64748b' },
  cardActions: { display: 'flex', gap: 6 },
  actionBtn: {
    background: 'rgba(100,116,139,0.1)', color: '#94a3b8', border: 'none',
    borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
  },
  actionBtnEdit: {
    background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: 'none',
    borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
  },
  actionBtnPublish: {
    background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: 'none',
    borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
  },
  telegramBadge: {
    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12,
    background: 'rgba(0,136,204,0.12)', color: '#0088cc',
  },
  sourceLink: {
    fontSize: 12, color: '#3b82f6', textDecoration: 'none', marginBottom: 8, display: 'inline-block',
  },
  scrapeBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'rgba(0,136,204,0.12)', color: '#0088cc', border: '1px solid rgba(0,136,204,0.25)',
    borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  pushToggle: {
    display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, color: '#94a3b8',
  },
  actionBtnDanger: {
    background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none',
    borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
  },
  teamsInput: {
    background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b',
    borderRadius: 8, padding: '4px 8px', fontSize: 12, width: 180, outline: 'none',
  },
  cardTeams: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  teamBadge: {
    fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
    background: 'rgba(34,197,94,0.12)', color: '#22c55e', display: 'inline-flex',
    alignItems: 'center', gap: 4,
  },
}
