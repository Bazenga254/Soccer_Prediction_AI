import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useAdmin } from '../context/AdminContext'

const CATEGORIES = ['general', 'predictions', 'tips', 'news', 'tutorials', 'updates']

const FONT_SIZES = [
  { label: 'Small', tag: 'small', style: 'font-size:13px' },
  { label: 'Normal', tag: null, style: null },
  { label: 'Large', tag: 'span', style: 'font-size:20px' },
  { label: 'Huge', tag: 'span', style: 'font-size:26px;font-weight:600' },
]

const POPULAR_EMOJIS = [
  '😀','😂','🤣','😍','🥰','😎','🤔','😮','😢','😡','👍','👎','👏','🙌','💪',
  '🎯','🔥','⚽','🏆','🥇','💰','📈','📊','✅','❌','⚠️','💡','🎉','🚀','⭐',
  '❤️','💙','💚','💛','🧡','💜','🤝','✍️','📝','🗒️','📌','🔗','💬','👀','🎓',
]

export default function BlogTab() {
  const { getAuthHeaders } = useAdmin()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // list | editor | analytics
  const [editPost, setEditPost] = useState(null)
  const [message, setMessage] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Editor state
  const [form, setForm] = useState({
    title: '', excerpt: '', body: '', category: 'general',
    tags: '', cover_image: '', video_url: '', status: 'draft', author_name: 'Spark AI',
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inlineUploading, setInlineUploading] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showFontSize, setShowFontSize] = useState(false)
  const [spellCheck, setSpellCheck] = useState(true)
  const fileRef = useRef(null)
  const inlineFileRef = useRef(null)
  const bodyRef = useRef(null)
  const emojiRef = useRef(null)
  const fontSizeRef = useRef(null)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterStatus) params.status = filterStatus
      if (filterCategory) params.category = filterCategory
      const res = await axios.get('/api/admin/blog', { headers: getAuthHeaders(), params })
      setPosts(res.data.posts || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [getAuthHeaders, filterStatus, filterCategory])

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    try {
      const res = await axios.get('/api/admin/blog/analytics', { headers: getAuthHeaders() })
      setAnalytics(res.data)
    } catch { /* ignore */ }
    setAnalyticsLoading(false)
  }, [getAuthHeaders])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  useEffect(() => {
    if (view === 'analytics') fetchAnalytics()
  }, [view, fetchAnalytics])

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const openEditor = (post = null) => {
    if (post) {
      setEditPost(post)
      setForm({
        title: post.title || '',
        excerpt: post.excerpt || '',
        body: post.body || '',
        category: post.category || 'general',
        tags: Array.isArray(post.tags) ? post.tags.join(', ') : (post.tags || '').replace(/[\[\]']/g, ''),
        cover_image: post.cover_image || '',
        video_url: post.video_url || '',
        status: post.status || 'draft',
        author_name: post.author_name || 'Spark AI',
      })
    } else {
      setEditPost(null)
      setForm({
        title: '', excerpt: '', body: '', category: 'general',
        tags: '', cover_image: '', video_url: '', status: 'draft', author_name: 'Spark AI',
      })
    }
    setView('editor')
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

  // Insert text/html at cursor position in body textarea
  const insertAtCursor = (text) => {
    const ta = bodyRef.current
    if (!ta) { setForm(f => ({ ...f, body: f.body + text })); return }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = form.body.substring(0, start)
    const after = form.body.substring(end)
    const newBody = before + text + after
    setForm(f => ({ ...f, body: newBody }))
    // Restore cursor after the inserted text
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + text.length }, 0)
  }

  const wrapSelection = (before, after) => {
    const ta = bodyRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = form.body.substring(start, end)
    const replacement = before + (selected || 'text') + after
    const newBody = form.body.substring(0, start) + replacement + form.body.substring(end)
    setForm(f => ({ ...f, body: newBody }))
    setTimeout(() => { ta.focus(); ta.selectionStart = start + before.length; ta.selectionEnd = start + before.length + (selected || 'text').length }, 0)
  }

  // Upload image inline into body
  const handleInlineImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setInlineUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await axios.post('/api/admin/blog/upload-image', fd, {
        headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' },
      })
      const url = res.data.url
      insertAtCursor(`\n<img src="${url}" alt="${file.name.replace(/\.[^.]+$/, '')}" style="max-width:100%;border-radius:8px;margin:16px 0" />\n`)
      showMsg('success', 'Image inserted')
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Upload failed')
    }
    setInlineUploading(false)
    if (inlineFileRef.current) inlineFileRef.current.value = ''
  }

  const insertVideoEmbed = () => {
    const url = prompt('Paste YouTube or video URL:')
    if (!url) return
    // Convert YouTube watch URL to embed
    let embedUrl = url
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
    if (ytMatch) {
      embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`
    }
    insertAtCursor(`\n<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;margin:16px 0"><iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allowfullscreen></iframe></div>\n`)
    showMsg('success', 'Video embedded')
  }

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmojiPicker(false)
      if (fontSizeRef.current && !fontSizeRef.current.contains(e.target)) setShowFontSize(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const applyFontSize = (size) => {
    if (!size.tag) {
      // Normal — just insert selected text as-is
      setShowFontSize(false)
      return
    }
    const ta = bodyRef.current
    if (!ta) { setShowFontSize(false); return }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = form.body.substring(start, end) || 'text'
    const html = `<${size.tag} style="${size.style}">${selected}</${size.tag}>`
    const newBody = form.body.substring(0, start) + html + form.body.substring(end)
    setForm(f => ({ ...f, body: newBody }))
    setShowFontSize(false)
    setTimeout(() => { ta.focus() }, 0)
  }

  const insertEmoji = (emoji) => {
    insertAtCursor(emoji)
    setShowEmojiPicker(false)
  }

  // Render markdown/HTML to preview HTML (same logic as BlogArticle.jsx)
  const renderPreviewHtml = (text) => {
    if (!text) return '<p style="color:#64748b">Start writing to see a preview...</p>'
    let html = text
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#3b82f6">$1</a>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #334155;margin:24px 0" />')
    html = html.split('\n\n').map(block => {
      const trimmed = block.trim()
      if (!trimmed) return ''
      if (/^<(h[1-6]|ul|ol|li|div|img|iframe|hr|figure|video|table|blockquote|section|br)/i.test(trimmed)) return trimmed
      if (/<(img|div|iframe|video|figure|hr)\b/i.test(trimmed)) return trimmed
      return `<p>${trimmed}</p>`
    }).join('\n')
    return html
  }

  const handleSave = async (publishOverride) => {
    if (!form.title.trim()) { showMsg('error', 'Title is required'); return }
    setSaving(true)
    const payload = {
      ...form,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      status: publishOverride || form.status,
    }
    try {
      if (editPost) {
        await axios.put(`/api/admin/blog/${editPost.id}`, payload, { headers: getAuthHeaders() })
        showMsg('success', 'Post updated')
      } else {
        await axios.post('/api/admin/blog', payload, { headers: getAuthHeaders() })
        showMsg('success', 'Post created')
      }
      setView('list')
      fetchPosts()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Save failed')
    }
    setSaving(false)
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

  // ── Analytics View ──
  const renderAnalytics = () => {
    if (analyticsLoading) return <div style={s.center}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
    if (!analytics) return <div style={s.center}><p style={s.muted}>No analytics data</p></div>

    const { summary, top_posts, daily_chart } = analytics
    return (
      <div style={s.analyticsWrap}>
        {/* Summary cards */}
        <div style={s.statsGrid}>
          {[
            { label: 'Today', value: summary.daily, color: '#3b82f6' },
            { label: 'This Week', value: summary.weekly, color: '#8b5cf6' },
            { label: 'This Month', value: summary.monthly, color: '#22c55e' },
            { label: 'This Year', value: summary.yearly, color: '#f59e0b' },
            { label: 'All Time', value: summary.total, color: '#ef4444' },
          ].map(s2 => (
            <div key={s2.label} style={{ ...s.statCard, borderColor: s2.color + '40' }}>
              <div style={{ ...s.statValue, color: s2.color }}>{(s2.value || 0).toLocaleString()}</div>
              <div style={s.statLabel}>{s2.label}</div>
            </div>
          ))}
          <div style={{ ...s.statCard, borderColor: '#64748b40' }}>
            <div style={{ ...s.statValue, color: '#94a3b8' }}>{analytics.total_posts || 0}</div>
            <div style={s.statLabel}>Total Posts</div>
          </div>
          <div style={{ ...s.statCard, borderColor: '#22c55e40' }}>
            <div style={{ ...s.statValue, color: '#22c55e' }}>{analytics.published_posts || 0}</div>
            <div style={s.statLabel}>Published</div>
          </div>
          <div style={{ ...s.statCard, borderColor: '#f59e0b40' }}>
            <div style={{ ...s.statValue, color: '#f59e0b' }}>{analytics.draft_posts || 0}</div>
            <div style={s.statLabel}>Drafts</div>
          </div>
        </div>

        {/* 30-day chart */}
        {daily_chart && daily_chart.length > 0 && (
          <div style={s.chartSection}>
            <h4 style={s.sectionTitle}>Views - Last 30 Days</h4>
            <div style={s.barChart}>
              {(() => {
                const maxV = Math.max(...daily_chart.map(d => d.views), 1)
                return daily_chart.map((d, i) => (
                  <div key={i} style={s.barCol} title={`${d.day}: ${d.views} views`}>
                    <div style={{ ...s.bar, height: `${Math.max((d.views / maxV) * 100, 2)}%` }} />
                    <span style={s.barLabel}>{d.day?.slice(5)}</span>
                  </div>
                ))
              })()}
            </div>
          </div>
        )}

        {/* Top posts */}
        {top_posts && top_posts.length > 0 && (
          <div style={s.chartSection}>
            <h4 style={s.sectionTitle}>Top Posts</h4>
            <div style={s.topPostsList}>
              {top_posts.map((p, i) => (
                <div key={p.id} style={s.topPostRow}>
                  <span style={s.topPostRank}>#{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={s.topPostTitle}>{p.title}</div>
                    <div style={s.topPostMeta}>
                      <span style={{ color: p.status === 'published' ? '#22c55e' : '#f59e0b' }}>{p.status}</span>
                      {' · '}{p.views} total · {p.daily_views} today · {p.weekly_views} week · {p.monthly_views} month
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Editor View ──
  const renderEditor = () => (
    <div style={s.editorWrap}>
      <div style={s.editorHeader}>
        <button style={s.backBtn} onClick={() => setView('list')}>&larr; Back</button>
        <h3 style={s.editorTitle}>{editPost ? 'Edit Post' : 'New Post'}</h3>
      </div>

      <div style={s.formGrid}>
        <div style={s.formMain}>
          {/* Title */}
          <input style={s.titleInput} placeholder="Post title..." value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />

          {/* Excerpt */}
          <textarea style={s.excerptInput} placeholder="Short excerpt / description..." rows={2}
            value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} />

          {/* Body toolbar + editor + live preview */}
          <div style={s.bodyWrap}>
            <div style={s.toolbar}>
              {/* Text formatting */}
              <button type="button" style={s.toolBtn} title="Bold" onClick={() => wrapSelection('**', '**')}>
                <b>B</b>
              </button>
              <button type="button" style={s.toolBtn} title="Italic" onClick={() => wrapSelection('*', '*')}>
                <i>I</i>
              </button>
              <button type="button" style={s.toolBtn} title="Underline" onClick={() => wrapSelection('<u>', '</u>')}>
                <span style={{ textDecoration: 'underline' }}>U</span>
              </button>
              <button type="button" style={s.toolBtn} title="Strikethrough" onClick={() => wrapSelection('<s>', '</s>')}>
                <span style={{ textDecoration: 'line-through' }}>S</span>
              </button>
              <div style={s.toolDivider} />

              {/* Headings */}
              <button type="button" style={s.toolBtn} title="Heading 2" onClick={() => insertAtCursor('\n## ')}>
                H2
              </button>
              <button type="button" style={s.toolBtn} title="Heading 3" onClick={() => insertAtCursor('\n### ')}>
                H3
              </button>

              {/* Font size dropdown */}
              <div ref={fontSizeRef} style={{ position: 'relative' }}>
                <button type="button" style={s.toolBtn} title="Font Size" onClick={() => { setShowFontSize(!showFontSize); setShowEmojiPicker(false) }}>
                  <span style={{ fontSize: 13 }}>A</span><span style={{ fontSize: 9 }}>A</span>
                  <span style={{ fontSize: 9, marginLeft: 2 }}>&#9660;</span>
                </button>
                {showFontSize && (
                  <div style={s.dropdown}>
                    {FONT_SIZES.map(sz => (
                      <button key={sz.label} type="button" style={s.dropdownItem} onClick={() => applyFontSize(sz)}>
                        <span style={sz.style ? { [sz.style.split(';')[0].split(':')[0]]: sz.style.split(';')[0].split(':')[1] } : {}}>{sz.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={s.toolDivider} />

              {/* Lists & links */}
              <button type="button" style={s.toolBtn} title="Bullet list" onClick={() => insertAtCursor('\n- ')}>
                <span style={{ fontSize: 15 }}>&#8226;</span>
              </button>
              <button type="button" style={s.toolBtn} title="Numbered list" onClick={() => insertAtCursor('\n1. ')}>
                <span style={{ fontSize: 12 }}>1.</span>
              </button>
              <button type="button" style={s.toolBtn} title="Hyperlink" onClick={() => {
                const text = prompt('Link text:')
                if (!text) return
                const url = prompt('Paste URL:')
                if (url) insertAtCursor(`[${text}](${url})`)
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              </button>
              <button type="button" style={s.toolBtn} title="Blockquote" onClick={() => insertAtCursor('\n> ')}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>&ldquo;</span>
              </button>
              <div style={s.toolDivider} />

              {/* Emoji picker */}
              <div ref={emojiRef} style={{ position: 'relative' }}>
                <button type="button" style={s.toolBtn} title="Insert Emoji" onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowFontSize(false) }}>
                  <span style={{ fontSize: 16 }}>😀</span>
                </button>
                {showEmojiPicker && (
                  <div style={s.emojiDropdown}>
                    <div style={s.emojiGrid}>
                      {POPULAR_EMOJIS.map(em => (
                        <button key={em} type="button" style={s.emojiBtn} onClick={() => insertEmoji(em)}>
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={s.toolDivider} />

              {/* Media */}
              <input type="file" accept="image/*" ref={inlineFileRef} style={{ display: 'none' }}
                onChange={handleInlineImageUpload} />
              <button type="button" style={{ ...s.toolBtn, ...s.toolBtnMedia }} title="Insert Image"
                onClick={() => inlineFileRef.current?.click()} disabled={inlineUploading}>
                {inlineUploading ? (
                  <div className="spinner" style={{ width: 14, height: 14 }} />
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                )}
                <span style={{ fontSize: 11, marginLeft: 4 }}>Image</span>
              </button>
              <button type="button" style={{ ...s.toolBtn, ...s.toolBtnMedia }} title="Embed Video"
                onClick={insertVideoEmbed}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span style={{ fontSize: 11, marginLeft: 4 }}>Video</span>
              </button>
              <button type="button" style={{ ...s.toolBtn, ...s.toolBtnMedia }} title="Horizontal Rule"
                onClick={() => insertAtCursor('\n\n---\n\n')}>
                <span style={{ fontSize: 11 }}>&#8212; HR</span>
              </button>
              <div style={s.toolDivider} />

              {/* Spell check toggle */}
              <button type="button" style={{ ...s.toolBtn, ...(spellCheck ? s.toolBtnActive : {}) }} title={spellCheck ? 'Spell Check: ON' : 'Spell Check: OFF'}
                onClick={() => setSpellCheck(!spellCheck)}>
                <span style={{ fontSize: 12 }}>ABC</span>
                <span style={{ fontSize: 9, marginLeft: 2, color: spellCheck ? '#22c55e' : '#64748b' }}>{spellCheck ? '✓' : '✗'}</span>
              </button>
            </div>
            <textarea ref={bodyRef} style={s.bodyInput} placeholder="Write your blog post here... Use the toolbar to insert images, videos, and formatting." rows={12}
              spellCheck={spellCheck}
              value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} />
          </div>

          {/* Live Preview - always visible */}
          <div style={s.previewSection}>
            <div style={s.previewHeader}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span style={s.previewLabel}>Live Preview</span>
            </div>
            <div style={s.previewPane} dangerouslySetInnerHTML={{ __html: renderPreviewHtml(form.body) }} />
          </div>

          {/* Video URL */}
          <input style={s.input} placeholder="Video URL (YouTube embed, etc.)" value={form.video_url}
            onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} />
        </div>

        <div style={s.formSidebar}>
          {/* Status */}
          <label style={s.label}>Status</label>
          <select style={s.select} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>

          {/* Category */}
          <label style={s.label}>Category</label>
          <select style={s.select} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>

          {/* Tags */}
          <label style={s.label}>Tags (comma-separated)</label>
          <input style={s.input} placeholder="e.g. football, tips, AI" value={form.tags}
            onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />

          {/* Author */}
          <label style={s.label}>Author</label>
          <input style={s.input} value={form.author_name}
            onChange={e => setForm(f => ({ ...f, author_name: e.target.value }))} />

          {/* Cover image */}
          <label style={s.label}>Cover Image</label>
          {form.cover_image && (
            <div style={s.coverPreview}>
              <img src={form.cover_image} alt="cover" style={s.coverImg} />
              <button style={s.removeCoverBtn} onClick={() => setForm(f => ({ ...f, cover_image: '' }))}>Remove</button>
            </div>
          )}
          <input type="file" accept="image/*" ref={fileRef} style={{ display: 'none' }}
            onChange={handleImageUpload} />
          <button style={s.uploadBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload Image'}
          </button>

          {/* Actions */}
          <div style={s.actionGroup}>
            <button style={s.saveDraftBtn} onClick={() => handleSave('draft')} disabled={saving}>
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button style={s.publishBtn} onClick={() => handleSave('published')} disabled={saving}>
              {saving ? 'Saving...' : 'Publish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── List View ──
  const renderList = () => (
    <div>
      {/* Header bar */}
      <div style={s.listHeader}>
        <div style={s.filters}>
          <select style={s.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          <select style={s.filterSelect} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
        <button style={s.newPostBtn} onClick={() => openEditor()}>+ New Post</button>
      </div>

      {loading ? (
        <div style={s.center}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
      ) : posts.length === 0 ? (
        <div style={s.center}><p style={s.muted}>No blog posts yet</p></div>
      ) : (
        <div style={s.postGrid}>
          {posts.map(post => (
            <div key={post.id} style={s.postCard}>
              {post.cover_image && (
                <div style={s.postCover}>
                  <img src={post.cover_image} alt="" style={s.postCoverImg} />
                </div>
              )}
              <div style={s.postContent}>
                <div style={s.postMeta}>
                  <span style={{
                    ...s.statusBadge,
                    background: post.status === 'published' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                    color: post.status === 'published' ? '#22c55e' : '#f59e0b',
                  }}>{post.status}</span>
                  <span style={s.categoryBadge}>{post.category}</span>
                  <span style={s.viewsBadge}>{post.views || 0} views</span>
                </div>
                <h4 style={s.postTitle}>{post.title}</h4>
                {post.excerpt && <p style={s.postExcerpt}>{post.excerpt.slice(0, 120)}{post.excerpt.length > 120 ? '...' : ''}</p>}
                <div style={s.postFooter}>
                  <span style={s.postDate}>{post.created_at?.slice(0, 10)}</span>
                  <div style={s.postActions}>
                    <button style={s.editBtn} onClick={() => {
                      // Fetch full post before editing
                      axios.get(`/api/admin/blog/${post.id}`, { headers: getAuthHeaders() })
                        .then(r => openEditor(r.data))
                        .catch(() => openEditor(post))
                    }}>Edit</button>
                    {deleteConfirm === post.id ? (
                      <>
                        <button style={s.confirmDeleteBtn} onClick={() => handleDelete(post.id)}>Confirm</button>
                        <button style={s.cancelBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
                      </>
                    ) : (
                      <button style={s.deleteBtn} onClick={() => setDeleteConfirm(post.id)}>Delete</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div style={s.container}>
      {/* Tab nav */}
      <div style={s.tabNav}>
        {[
          { id: 'list', label: 'All Posts' },
          { id: 'editor', label: editPost ? 'Edit Post' : 'New Post' },
          { id: 'analytics', label: 'Analytics' },
        ].map(t => (
          <button key={t.id} style={view === t.id ? s.tabActive : s.tab}
            onClick={() => { if (t.id === 'editor' && !editPost) openEditor(); else setView(t.id) }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Message */}
      {message && (
        <div style={{ ...s.msg, background: message.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: message.type === 'success' ? '#22c55e' : '#ef4444' }}>
          {message.text}
        </div>
      )}

      {/* View */}
      {view === 'list' && renderList()}
      {view === 'editor' && renderEditor()}
      {view === 'analytics' && renderAnalytics()}
    </div>
  )
}

// ── Styles ──
const s = {
  container: { padding: 0 },
  tabNav: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #1e293b', paddingBottom: 8 },
  tab: { background: 'none', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 500, padding: '8px 16px', cursor: 'pointer', borderRadius: '8px 8px 0 0' },
  tabActive: { background: 'rgba(59,130,246,0.1)', border: 'none', color: '#3b82f6', fontSize: 13, fontWeight: 600, padding: '8px 16px', cursor: 'pointer', borderRadius: '8px 8px 0 0', borderBottom: '2px solid #3b82f6' },
  center: { display: 'flex', justifyContent: 'center', padding: 40 },
  muted: { color: '#64748b', fontSize: 14 },
  msg: { padding: '10px 16px', borderRadius: 8, fontSize: 13, marginBottom: 16 },

  // List
  listHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 },
  filters: { display: 'flex', gap: 8 },
  filterSelect: { background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '6px 12px', fontSize: 13 },
  newPostBtn: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  postGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 },
  postCard: { background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' },
  postCover: { width: '100%', height: 160, overflow: 'hidden' },
  postCoverImg: { width: '100%', height: '100%', objectFit: 'cover' },
  postContent: { padding: 16 },
  postMeta: { display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  statusBadge: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6 },
  categoryBadge: { fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.12)', color: '#818cf8' },
  viewsBadge: { fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6, background: 'rgba(100,116,139,0.12)', color: '#94a3b8' },
  postTitle: { margin: 0, fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 6 },
  postExcerpt: { margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 10 },
  postFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  postDate: { fontSize: 11, color: '#64748b' },
  postActions: { display: 'flex', gap: 6 },
  editBtn: { background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  deleteBtn: { background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  confirmDeleteBtn: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  cancelBtn: { background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },

  // Editor
  editorWrap: {},
  editorHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  backBtn: { background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer' },
  editorTitle: { margin: 0, fontSize: 16, color: '#f1f5f9', fontWeight: 600 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 },
  formMain: { display: 'flex', flexDirection: 'column', gap: 12 },
  formSidebar: { display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b', borderRadius: 12, padding: 16 },
  titleInput: { background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', fontSize: 18, fontWeight: 600 },
  excerptInput: { background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 10, padding: '10px 14px', fontSize: 14, resize: 'vertical' },
  bodyWrap: { display: 'flex', flexDirection: 'column', border: '1px solid #334155', borderRadius: 10, overflow: 'hidden' },
  toolbar: { display: 'flex', alignItems: 'center', gap: 2, padding: '6px 8px', background: '#1e293b', borderBottom: '1px solid #334155', flexWrap: 'wrap' },
  toolBtn: { background: 'none', border: '1px solid transparent', color: '#94a3b8', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', minHeight: 28 },
  toolBtnMedia: { background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', color: '#60a5fa', borderRadius: 6, padding: '4px 10px', gap: 2 },
  toolBtnActive: { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' },
  toolDivider: { width: 1, height: 20, background: '#334155', margin: '0 4px' },
  dropdown: { position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 4, zIndex: 100, minWidth: 120, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' },
  dropdownItem: { display: 'block', width: '100%', background: 'none', border: 'none', color: '#e2e8f0', padding: '6px 12px', fontSize: 13, cursor: 'pointer', textAlign: 'left', borderRadius: 4, whiteSpace: 'nowrap' },
  emojiDropdown: { position: 'absolute', top: '100%', left: -100, marginTop: 4, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 8, zIndex: 100, width: 260, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' },
  emojiGrid: { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 },
  emojiBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: 4, borderRadius: 4, lineHeight: 1, transition: 'background 0.15s' },
  previewSection: { border: '1px solid rgba(139,92,246,0.25)', borderRadius: 10, overflow: 'hidden', marginTop: 4 },
  previewHeader: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(139,92,246,0.08)', borderBottom: '1px solid rgba(139,92,246,0.15)' },
  previewLabel: { fontSize: 12, fontWeight: 600, color: '#a78bfa' },
  previewPane: { background: '#0f172a', color: '#e2e8f0', padding: '20px 18px', fontSize: 15, lineHeight: 1.7, minHeight: 200, maxHeight: 500, overflowY: 'auto' },
  bodyInput: { background: '#0f172a', color: '#e2e8f0', border: 'none', borderRadius: 0, padding: '12px 14px', fontSize: 14, resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.6 },
  input: { background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' },
  select: { background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' },
  label: { fontSize: 12, color: '#94a3b8', fontWeight: 500, marginTop: 4 },
  coverPreview: { borderRadius: 8, overflow: 'hidden', marginBottom: 4, position: 'relative' },
  coverImg: { width: '100%', height: 120, objectFit: 'cover', borderRadius: 8 },
  removeCoverBtn: { position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.7)', color: '#f87171', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' },
  uploadBtn: { background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  actionGroup: { display: 'flex', gap: 8, marginTop: 12 },
  saveDraftBtn: { flex: 1, background: 'rgba(100,116,139,0.15)', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '10px', fontSize: 13, cursor: 'pointer', fontWeight: 500 },
  publishBtn: { flex: 1, background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },

  // Analytics
  analyticsWrap: { display: 'flex', flexDirection: 'column', gap: 20 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 },
  statCard: { background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b', borderRadius: 12, padding: '16px 14px', textAlign: 'center' },
  statValue: { fontSize: 26, fontWeight: 700, lineHeight: 1 },
  statLabel: { fontSize: 12, color: '#94a3b8', marginTop: 6 },
  chartSection: { background: 'rgba(15,23,42,0.6)', border: '1px solid #1e293b', borderRadius: 12, padding: 16 },
  sectionTitle: { margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#e2e8f0' },
  barChart: { display: 'flex', alignItems: 'flex-end', gap: 3, height: 140, overflow: 'hidden' },
  barCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', minWidth: 0 },
  bar: { width: '100%', background: 'linear-gradient(180deg, #3b82f6, #1d4ed8)', borderRadius: '3px 3px 0 0', minHeight: 2 },
  barLabel: { fontSize: 9, color: '#64748b', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' },
  topPostsList: { display: 'flex', flexDirection: 'column', gap: 8 },
  topPostRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(30,41,59,0.5)', borderRadius: 8 },
  topPostRank: { fontSize: 13, fontWeight: 700, color: '#3b82f6', minWidth: 28 },
  topPostTitle: { fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 },
  topPostMeta: { fontSize: 11, color: '#64748b' },
}

// Responsive: collapse editor grid on small screens
if (typeof window !== 'undefined' && window.innerWidth < 768) {
  s.formGrid = { ...s.formGrid, gridTemplateColumns: '1fr' }
  s.postGrid = { ...s.postGrid, gridTemplateColumns: '1fr' }
}
