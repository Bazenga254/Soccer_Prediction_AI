import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import axios from 'axios'

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ matches: [], users: [] })
  const [loading, setLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const navigate = useNavigate()
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)
  const { t } = useTranslation()

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close dropdown on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') setDropdownOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleSearch = (value) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim().length < 2) {
      setResults({ matches: [], users: [] })
      setLoading(false)
      setDropdownOpen(false)
      return
    }

    setLoading(true)
    setDropdownOpen(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await axios.get(`/api/search?q=${encodeURIComponent(value.trim())}`)
        setResults(res.data)
      } catch {
        setResults({ matches: [], users: [] })
      }
      setLoading(false)
    }, 300)
  }

  const clearSearch = () => {
    setQuery('')
    setResults({ matches: [], users: [] })
    setDropdownOpen(false)
  }

  const handleMatchClick = (match) => {
    const compCode = match.competition?.code || match.competition?.id || 'PL'
    const homeId = match.home_team?.id
    const awayId = match.away_team?.id
    if (homeId && awayId) {
      navigate(`/match/${compCode}/${homeId}/${awayId}`)
    }
    clearSearch()
  }

  const handleUserClick = (user) => {
    navigate(`/community?user_id=${user.user_id}`)
    clearSearch()
  }

  const hasResults = results.matches.length > 0 || results.users.length > 0

  return (
    <div className="search-bar" ref={containerRef}>
      <div className="search-input-wrapper">
        <svg className="search-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => { if (query.trim().length >= 2) setDropdownOpen(true) }}
        />
        {query && (
          <button className="search-close" onClick={clearSearch}>
            &times;
          </button>
        )}
      </div>

      {dropdownOpen && query.trim().length >= 2 && (
        <div className="search-dropdown">
          {loading ? (
            <div className="search-loading">
              <div className="spinner" style={{ width: 20, height: 20 }}></div>
              <span>Searching...</span>
            </div>
          ) : !hasResults ? (
            <div className="search-empty">{t('search.noResults')} "{query}"</div>
          ) : (
            <>
              {results.matches.length > 0 && (
                <div className="search-section">
                  <div className="search-section-title">Matches</div>
                  {results.matches.map((m) => (
                    <div key={m.id} className="search-match-item" onClick={() => handleMatchClick(m)}>
                      <div className="search-match-teams">
                        {m.home_team?.crest && <img src={m.home_team.crest} alt="" className="search-team-crest" />}
                        <span className="search-match-name">{m.home_team?.name} vs {m.away_team?.name}</span>
                        {m.away_team?.crest && <img src={m.away_team.crest} alt="" className="search-team-crest" />}
                      </div>
                      <div className="search-match-meta">
                        {m.competition?.name && <span className="search-match-comp">{m.competition.name}</span>}
                        {m.date && <span className="search-match-date">{new Date(m.date).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {results.users.length > 0 && (
                <div className="search-section">
                  <div className="search-section-title">Predictors</div>
                  {results.users.map((u) => (
                    <div key={u.user_id} className="search-user-item" onClick={() => handleUserClick(u)}>
                      <span className="search-user-avatar" style={{ background: u.avatar_color }}>
                        {(u.display_name || u.username || '?')[0].toUpperCase()}
                      </span>
                      <div className="search-user-info">
                        <strong>{u.display_name}</strong>
                        <span className="search-user-username">@{u.username}</span>
                      </div>
                      <div className="search-user-stats">
                        {u.total_predictions > 0 && <span>{u.total_predictions} picks</span>}
                        {u.accuracy > 0 && <span className="search-user-accuracy">{u.accuracy}%</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
