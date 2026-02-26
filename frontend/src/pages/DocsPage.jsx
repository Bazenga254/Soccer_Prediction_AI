import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SEOHead from '../components/SEOHead'
import { useTranslation } from 'react-i18next'
import axios from 'axios'

const ICON_MAP = {
  rocket: '🚀',
  brain: '🧠',
  activity: '📡',
  users: '👥',
  diamond: '💎',
  link: '🔗',
  user: '👤',
  headphones: '🎧',
  'bar-chart': '📊',
  trophy: '🏆',
  chart: '📈',
  shield: '🔒',
}

export default function DocsPage({ embedded = false }) {
  const { t } = useTranslation()
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeSection, setActiveSection] = useState(null)
  const contentRef = useRef(null)
  const navigate = embedded ? null : useNavigate()
  const params = embedded ? {} : useParams()
  const urlSectionId = params.sectionId || null

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const res = await axios.get('/api/docs')
        setSections(res.data.sections || [])
      } catch {
        setSections([])
      }
      setLoading(false)
    }
    fetchDocs()
  }, [])

  // Handle URL-based section navigation on load
  useEffect(() => {
    if (sections.length > 0) {
      // Check URL path param first, then hash fallback
      const target = urlSectionId || window.location.hash.replace('#', '')
      if (target && sections.find(s => s.id === target)) {
        setActiveSection(target)
        setTimeout(() => scrollToSection(target), 100)
      } else {
        setActiveSection(sections[0]?.id || null)
      }
    }
  }, [sections, urlSectionId])

  const scrollToSection = (id) => {
    const el = document.getElementById(`docs-section-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleSectionClick = (id) => {
    setActiveSection(id)
    if (!embedded && navigate) {
      navigate(`/docs/${id}`, { replace: true })
    }
    scrollToSection(id)
  }

  // Track active section on scroll
  useEffect(() => {
    const container = contentRef.current
    if (!container || sections.length === 0) return

    const handleScroll = () => {
      const sectionEls = sections.map(s => document.getElementById(`docs-section-${s.id}`))
      let current = sections[0]?.id
      for (let i = 0; i < sectionEls.length; i++) {
        const el = sectionEls[i]
        if (el) {
          const rect = el.getBoundingClientRect()
          const offset = embedded ? 80 : 140
          if (rect.top <= offset) current = sections[i].id
        }
      }
      if (current !== activeSection) setActiveSection(current)
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [sections, activeSection, embedded])

  // Filter sections by search
  const filtered = search.trim()
    ? sections.filter(s =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.content.some(c =>
        c.heading.toLowerCase().includes(search.toLowerCase()) ||
        c.body.toLowerCase().includes(search.toLowerCase())
      )
    )
    : sections

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <p style={{ color: '#94a3b8' }}>{t('docs.loadingDocs')}</p>
      </div>
    )
  }

  return (
    <>
    <SEOHead
      title="Documentation - How to Use Spark AI"
      description="Complete guide to Spark AI soccer predictions platform. Learn about AI predictions, live scores, community features, and more."
      path="/docs"
    />
    <div style={{
      ...styles.container,
      ...(embedded ? styles.embedded : {}),
    }}>
      {/* Header - only show when not embedded */}
      {!embedded && (
        <div style={styles.header}>
          <div style={styles.headerContent}>
            <button style={styles.backBtn} onClick={() => navigate('/')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              {t('common.back')}
            </button>
            <h1 style={styles.headerTitle}>
              <span style={styles.headerIcon}>📚</span>
              {t('docs.sparkAIDocumentation')}
            </h1>
            <p style={styles.headerSub}>{t('docs.docsSubtitle')}</p>
          </div>
        </div>
      )}

      <div style={styles.layout}>
        {/* Sidebar */}
        <div style={{
          ...styles.sidebar,
          ...(embedded ? styles.sidebarEmbedded : {}),
        }}>
          <div style={styles.searchBox}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={t('docs.searchDocs')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.searchInput}
            />
            {search && (
              <button style={styles.clearBtn} onClick={() => setSearch('')}>×</button>
            )}
          </div>

          <nav style={styles.sidebarNav}>
            {sections.map(s => (
              <button
                key={s.id}
                style={{
                  ...styles.sidebarItem,
                  ...(activeSection === s.id ? styles.sidebarItemActive : {}),
                }}
                onClick={() => handleSectionClick(s.id)}
              >
                <span style={styles.sidebarIcon}>{ICON_MAP[s.icon] || '📄'}</span>
                <span>{s.title}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div ref={contentRef} style={{
          ...styles.content,
          ...(embedded ? styles.contentEmbedded : {}),
        }}>
          {filtered.length === 0 ? (
            <div style={styles.noResults}>
              <p style={{ fontSize: 18, color: '#e2e8f0' }}>{t('docs.noResults')}</p>
              <p style={{ color: '#64748b', fontSize: 14 }}>{t('docs.noResultsHint')}</p>
            </div>
          ) : (
            filtered.map(section => (
              <div key={section.id} id={`docs-section-${section.id}`} style={styles.section}>
                <div style={styles.sectionHeader}>
                  <span style={styles.sectionIcon}>{ICON_MAP[section.icon] || '📄'}</span>
                  <h2 style={styles.sectionTitle}>{section.title}</h2>
                </div>

                <div style={styles.cards}>
                  {section.content.map((item, idx) => (
                    <div key={idx} style={styles.card}>
                      <h3 style={styles.cardHeading}>{item.heading}</h3>
                      <p style={styles.cardBody}>{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Footer */}
          {!embedded && (
            <div style={styles.footer}>
              <p style={{ color: '#64748b', fontSize: 13 }}>
                {t('docs.footerHelp')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0a0e17',
    color: '#e2e8f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  embedded: {
    minHeight: 'auto',
    background: 'transparent',
    borderRadius: 12,
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 400,
    gap: 12,
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #1e293b',
    borderTop: '3px solid #6c5ce7',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  header: {
    background: 'linear-gradient(135deg, #0f1629 0%, #1a1040 100%)',
    borderBottom: '1px solid #1e293b',
    padding: '24px 0 28px',
  },
  headerContent: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 24px',
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'none',
    border: 'none',
    color: '#6c5ce7',
    cursor: 'pointer',
    fontSize: 14,
    padding: '4px 0',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 700,
    color: '#fff',
    margin: '0 0 6px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    fontSize: 28,
  },
  headerSub: {
    color: '#94a3b8',
    fontSize: 15,
    margin: 0,
  },
  layout: {
    display: 'flex',
    maxWidth: 1200,
    margin: '0 auto',
    gap: 0,
    position: 'relative',
  },
  sidebar: {
    width: 240,
    flexShrink: 0,
    position: 'sticky',
    top: 0,
    height: 'calc(100vh - 120px)',
    overflowY: 'auto',
    padding: '20px 16px 20px 24px',
    borderRight: '1px solid #1e293b',
  },
  sidebarEmbedded: {
    height: 'calc(100vh - 60px)',
    padding: '16px 12px 16px 16px',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#111827',
    border: '1px solid #1e293b',
    borderRadius: 8,
    padding: '8px 12px',
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    background: 'none',
    border: 'none',
    color: '#e2e8f0',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: 16,
    padding: '0 2px',
    lineHeight: 1,
  },
  sidebarNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 10px',
    background: 'none',
    border: 'none',
    borderRadius: 6,
    color: '#94a3b8',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
  },
  sidebarItemActive: {
    background: 'rgba(108, 92, 231, 0.12)',
    color: '#a78bfa',
  },
  sidebarIcon: {
    fontSize: 15,
    width: 22,
    textAlign: 'center',
    flexShrink: 0,
  },
  content: {
    flex: 1,
    padding: '24px 32px 60px',
    overflowY: 'auto',
    height: 'calc(100vh - 120px)',
  },
  contentEmbedded: {
    height: 'calc(100vh - 60px)',
    padding: '16px 24px 40px',
  },
  noResults: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  section: {
    marginBottom: 40,
    scrollMarginTop: 20,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingBottom: 10,
    borderBottom: '1px solid #1e293b',
  },
  sectionIcon: {
    fontSize: 22,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 600,
    color: '#f1f5f9',
    margin: 0,
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 14,
  },
  card: {
    background: '#111827',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '16px 18px',
    transition: 'border-color 0.2s',
  },
  cardHeading: {
    fontSize: 14,
    fontWeight: 600,
    color: '#e2e8f0',
    margin: '0 0 8px',
  },
  cardBody: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 1.6,
    margin: 0,
  },
  footer: {
    textAlign: 'center',
    padding: '30px 0 10px',
    borderTop: '1px solid #1e293b',
    marginTop: 20,
  },
}
