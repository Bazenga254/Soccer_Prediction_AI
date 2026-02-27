import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import LiveChatPopup from '../components/LiveChatPopup'
import axios from 'axios'

// Match tracking notifications

const HEADLINES = {
  tracking_started: [
    'Good Choice! \u{1F44D}', "Let's Go! \u{1F525}", 'Locked In! \u{1F512}',
    'Game On! \u{1F3AE}', "You're Set! \u2705", 'Eyes On! \u{1F440}',
  ],
  celebration: [
    'GOOOAAAL! \u{1F389}', 'GET IN! \u{1F4AA}', 'YESSS! \u{1F525}',
    'WHAT A GOAL! \u26BD', 'UNSTOPPABLE! \u{1F680}', 'BEAUTY! \u{1F60D}',
    'TAKE A BOW! \u{1F3AF}', 'SCENES! \u{1F38A}',
  ],
  sad: [
    'Oh No... \u{1F622}', 'Gutted... \u{1F494}', 'That Hurts... \u{1F629}',
    'Nooo! \u{1F62D}', 'Stay Strong... \u{1F97A}', 'Pain... \u{1F480}',
  ],
  worried: [
    "It's Level... \u{1F630}", 'All Square... \u{1F62C}', 'Nervous Times... \u{1FAE3}',
    'Hold On... \u{1F624}', "Don't Panic... \u{1F64F}",
  ],
  big_lead: [
    'RUNNING RIOT! \u{1F3C6}', 'UNSTOPPABLE! \u{1F4AB}', 'ON FIRE! \u{1F525}\u{1F525}\u{1F525}',
    'DEMOLITION! \u{1F4AA}', 'TOO EASY! \u{1F60E}',
  ],
  match_won: [
    'VICTORY! \u{1F3C6}', 'WE WON! \u{1F389}\u{1F389}', 'CHAMPIONS! \u{1F451}',
    'FULL TIME - WIN! \u{1F525}', 'GET IN THERE! \u{1F4AA}', 'WHAT A WIN! \u{1F60D}',
  ],
  match_lost: [
    'Full Time - Defeat \u{1F494}', 'We Lost... \u{1F62D}', 'Heartbreak \u{1F480}',
    'Not Our Day... \u{1F622}', 'Tough Loss \u{1F629}', 'Gutted... \u{1F61E}',
  ],
  match_draw: [
    'Full Time - Draw \u{1F91D}', 'Honors Even \u{1F610}', 'A Point Each \u{1F937}',
    'So Close... \u{1F614}', 'Shared the Spoils \u{1F91D}',
  ],
}

const SUB_MESSAGES = {
  tracking_started: [
    'You made the right choice!', "We'll keep you posted on every goal!",
    'Sit back and enjoy the match!', "You'll get notified when they score!",
    'Tracking is live! Good luck!', 'May the best team win!',
  ],
  celebration: [
    'Your team just scored!', 'What a moment!', 'The crowd goes wild!',
    'Pure class!', 'Brilliant finish!', 'Get in there!',
  ],
  sad: [
    'Stay strong, anything can happen!', 'Keep believing!',
    "It's not over yet...", 'There is still time!', 'Chin up!',
  ],
  worried: [
    'Come on, you can do this!', 'Time to fight back!',
    "It's anyone's game now!", 'Stay focused!', 'Deep breaths...',
  ],
  big_lead: [
    'Absolutely dominant!', 'No mercy!', 'A masterclass!',
    'Running the show!', 'Total control!',
  ],
  match_won: [
    'Congratulations! What a performance!', 'Your team did it!',
    'Three points in the bag!', 'Well deserved victory!',
    'Time to celebrate!', 'What a result!',
  ],
  match_lost: [
    'Better luck next time...', "There's always the next match.",
    'Keep your head up!', "It wasn't meant to be today.",
    'Chin up, move forward!', 'The comeback starts next match!',
  ],
  match_draw: [
    'A fair result in the end.', 'Could have gone either way.',
    'Not a bad point away from home.', 'Almost had it!',
    'On to the next one!',
  ],
}

// Pre-selected GIF pools (instant load, no API call needed)
const PRESELECTED_GIFS = {
  tracking_started: [
    'https://media0.giphy.com/media/d3mlE7uhX8KFgEmY/200.gif',
    'https://media1.tenor.com/m/oym8quGMVa8AAAAC/clap-clapping.gif',
    'https://media1.tenor.com/m/6-151WYmqfkAAAAC/very-smart-move-sander-bos.gif',
    'https://media1.tenor.com/m/w6J9ANCqIcIAAAAC/thats-good-smart-too-ego-nwodim.gif',
    'https://media1.tenor.com/m/-7z_hl4R9qUAAAAC/trump-maga.gif',
  ],
  celebration: [
    'https://media.giphy.com/media/3o7bu2D938PkrKrcYw/200.gif',
    'https://media.giphy.com/media/vGxiQNwXOrc17Aanuf/200.gif',
    'https://media.giphy.com/media/sirOb06HhLmVxV0LtQ/200.gif',
    'https://media.giphy.com/media/l3UcicwEsOOan1Q2c/200.gif',
    'https://media.giphy.com/media/KjFoWsZmuUzdoonjmz/200.gif',
    'https://media.giphy.com/media/QxMb25h7RhitNWgyy0/200.gif',
  ],
  sad: [
    'https://media.giphy.com/media/rDf21Jd6npuG94c8pe/200.gif',
    'https://media.giphy.com/media/Nuk8ZhBtEsS6kMBNCb/200.gif',
    'https://media.giphy.com/media/7SEVVDyj4dXyhIjcIh/200.gif',
    'https://media.giphy.com/media/c5nW05OqnQ5MsRM7X1/200.gif',
    'https://media.giphy.com/media/1naY1TdNLTlSEdzi5D/200.gif',
    'https://media.giphy.com/media/tFKHi78AVX0QkLuLeX/200.gif',
  ],
  worried: [
    'https://media.giphy.com/media/3oz8xLlw6GHVfokaNW/200.gif',
    'https://media.giphy.com/media/5io17TpOzP17cPqHpI/200.gif',
    'https://media.giphy.com/media/UJBrPPqsMpVtzBeHOZ/200.gif',
    'https://media.giphy.com/media/4QgiErmjZiPESRcKYt/200.gif',
    'https://media.giphy.com/media/Z406ds5hiUAoYUe9TR/200.gif',
    'https://media.giphy.com/media/l4FATJpd4LWgeruTK/200.gif',
  ],
  big_lead: [
    'https://media.giphy.com/media/nbQiWoHJFaJtcl3qT6/200.gif',
    'https://media.giphy.com/media/KQARp0xmXD90CIOIcb/200.gif',
    'https://media.giphy.com/media/DfbpTbQ9TvSX6/200.gif',
    'https://media.giphy.com/media/cZGwq7OWe0fStVrzND/200.gif',
    'https://media.giphy.com/media/15BuyagtKucHm/200.gif',
    'https://media.giphy.com/media/l4pTcr7Nbt29Hpx72/200.gif',
  ],
  match_won: [
    'https://media3.giphy.com/media/ddHhhUBn25cuQ/200.gif',
    'https://media1.tenor.com/m/sLjUbG5BVikAAAAC/trump-dance-trump-2024.gif',
    'https://media1.giphy.com/media/7OVCzBQkDSyU4tBZrA/200.gif',
    'https://media1.giphy.com/media/AGd0FlElEhcRy/200.gif',
    'https://media4.giphy.com/media/FA74MFGdGKKnC/200.gif',
  ],
  match_lost: [
    'https://media4.giphy.com/media/2ilegKh8fMdJAVqbG2/200.gif',
    'https://media2.giphy.com/media/USbYNzaNRPcMbMwgCz/200.gif',
    'https://media1.tenor.com/m/xaepTcNT4moAAAAC/don%27t-give-up-hope-yet-iroh.gif',
    'https://media3.giphy.com/media/bGPTxLislwm3u/200.gif',
    'https://media4.giphy.com/media/qOqqZq27NReUM/200.gif',
  ],
  match_draw: [
    'https://media.giphy.com/media/JRhS6WoswF8FxE0g2R/200.gif',
    'https://media.giphy.com/media/l4pTsh45Dg7jnDM6Q/200.gif',
    'https://media.giphy.com/media/EYUNo9AHh1qvx87fH1/200.gif',
    'https://media.giphy.com/media/eI3XK2wTJ9uPcc7cDv/200.gif',
    'https://media.giphy.com/media/3o7bu2PMhUljurpnWM/200.gif',
    'https://media.giphy.com/media/igGyenWV6Dy4rhXbc8/200.gif',
  ],
}

// Preload GIF images into browser cache
function preloadGifs() {
  Object.values(PRESELECTED_GIFS).forEach(urls => {
    urls.forEach(url => {
      const img = new Image()
      img.src = url
    })
  })
}

// Track rotation index per type so we cycle through instead of repeating
const gifIndexTracker = {}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function getGifForType(type) {
  const pool = PRESELECTED_GIFS[type] || PRESELECTED_GIFS.celebration
  if (!gifIndexTracker[type]) gifIndexTracker[type] = 0
  const gif = pool[gifIndexTracker[type] % pool.length]
  gifIndexTracker[type]++
  return gif
}

// Browser notifications
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

function sendBrowserNotification(title, body, iconUrl) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const notif = new Notification(title, {
      body,
      icon: iconUrl || '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'spark-goal-' + Date.now(),
      renotify: true,
    })
    notif.onclick = () => { window.focus(); notif.close() }
    setTimeout(() => notif.close(), 10000)
  } catch { /* ignore */ }
}

// League priority: lower number = shown first
const LEAGUE_PRIORITY = {
  39: 1,    // Premier League
  140: 2,   // La Liga
  78: 3,    // Bundesliga
  135: 4,   // Serie A
  61: 5,    // Ligue 1
  2: 6,     // Champions League
  3: 7,     // Europa League
  40: 8,    // Championship
  88: 9,    // Eredivisie
  94: 10,   // Primeira Liga
  1: 11,    // World Cup
  4: 12,    // Euro
  13: 13,   // Copa Libertadores
}

// Play whistle sound for goals
function playGoalSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    // Whistle: rising pitch
    osc.frequency.setValueAtTime(800, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.15)
    osc.frequency.linearRampToValueAtTime(1400, ctx.currentTime + 0.3)
    osc.frequency.setValueAtTime(1400, ctx.currentTime + 0.3)
    osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.5)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.6)
  } catch (e) {
    // Audio not available
  }
}

export default function LiveScores() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [liveMatches, setLiveMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [expandedMatch, setExpandedMatch] = useState(null)
  const [chatMatch, setChatMatch] = useState(null)
  const [expandedTab, setExpandedTab] = useState('stats') // 'stats' | 'events' | 'analysis'
  const [matchStats, setMatchStats] = useState({}) // { fixtureId: { home: {...}, away: {...} } }
  const [statsLoading, setStatsLoading] = useState({})
  const matchStatsRef = useRef({})
  const statsLoadingRef = useRef({})
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('live_favorites') || '[]') } catch { return [] }
  })
  const [recentGoalIds, setRecentGoalIds] = useState(new Set())
  const prevGoalsRef = useRef({})
  const navigate = useNavigate()

  // Match tracking state
  const [trackedMatches, setTrackedMatches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('trackedMatches') || '{}') } catch { return {} }
  })
  const [teamSelectorMatch, setTeamSelectorMatch] = useState(null)
  const [goalNotification, setGoalNotification] = useState(null)
  const notifQueueRef = useRef([])
  const notifTimerRef = useRef(null)
  const trackedRef = useRef(trackedMatches)
  const prevStatusRef = useRef({}) // track match statuses for end-of-match detection
  const endedMatchesRef = useRef(new Set()) // avoid duplicate end-of-match notifications

  // Upcoming matches state
  const [upcomingMatches, setUpcomingMatches] = useState([])
  const [upcomingLoading, setUpcomingLoading] = useState(true)
  const [upcomingPage, setUpcomingPage] = useState(1)
  const [activeView, setActiveView] = useState('live') // 'live' | 'upcoming'

  const toggleFavorite = (matchId) => {
    setFavorites(prev => {
      const next = prev.includes(matchId) ? prev.filter(id => id !== matchId) : [...prev, matchId]
      localStorage.setItem('live_favorites', JSON.stringify(next))
      // Sync to server
      try {
        const token = localStorage.getItem('spark_token')
        if (token) {
          fetch('/api/user/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ preferences: { live_favorites: next } }),
          }).catch(() => {})
        }
      } catch { /* ignore */ }
      return next
    })
  }

  // Sync tracked matches to localStorage, ref, and server
  useEffect(() => {
    localStorage.setItem('trackedMatches', JSON.stringify(trackedMatches))
    trackedRef.current = trackedMatches
    // Sync to server for cross-device consistency
    try {
      const token = localStorage.getItem('spark_token')
      if (token) {
        fetch('/api/user/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ preferences: { tracked_matches: trackedMatches } }),
        }).catch(() => {})
      }
    } catch { /* ignore */ }
  }, [trackedMatches])

  // Preload GIFs and request notification permission on mount
  useEffect(() => {
    preloadGifs()
    requestNotificationPermission()
  }, [])

  const startTracking = (match, teamId) => {
    const isHome = teamId === match.home_team.id
    const tracked = {
      teamId,
      teamName: isHome ? match.home_team.name : match.away_team.name,
      teamCrest: isHome ? match.home_team.crest : match.away_team.crest,
      opponentName: isHome ? match.away_team.name : match.home_team.name,
      homeGoals: match.goals?.home || 0,
      awayGoals: match.goals?.away || 0,
      isHome,
    }
    setTrackedMatches(prev => ({ ...prev, [match.id]: tracked }))
    setTeamSelectorMatch(null)

    // Initialize prevGoals with current score so existing goals don't trigger false notifications
    prevGoalsRef.current[match.id] = (match.goals?.home || 0) + (match.goals?.away || 0)

    // Show tracking confirmation notification
    queueNotification(match, tracked, 'tracking_started', match.goals?.home || 0, match.goals?.away || 0)
  }

  const untrackMatch = (matchId) => {
    setTrackedMatches(prev => {
      const next = { ...prev }
      delete next[matchId]
      return next
    })
  }

  const showNextNotification = useCallback(() => {
    // Clear the expired timer ref first
    notifTimerRef.current = null
    if (notifQueueRef.current.length === 0) {
      setGoalNotification(null)
      return
    }
    const next = notifQueueRef.current.shift()
    setGoalNotification(next)
    notifTimerRef.current = setTimeout(() => {
      showNextNotification()
    }, 8000)
  }, [])

  const queueNotification = useCallback((match, tracked, type, newHome, newAway) => {
    const gifUrl = getGifForType(type)
    const headline = pickRandom(HEADLINES[type] || HEADLINES.celebration)
    const subMessage = pickRandom(SUB_MESSAGES[type] || SUB_MESSAGES.celebration)
    const notif = {
      id: Date.now(),
      type,
      gifUrl,
      headline,
      subMessage,
      homeTeam: match.home_team.name,
      awayTeam: match.away_team.name,
      homeCrest: match.home_team.crest,
      awayCrest: match.away_team.crest,
      homeGoals: newHome,
      awayGoals: newAway,
      trackedTeam: tracked.teamName,
      trackedCrest: tracked.teamCrest,
    }
    notifQueueRef.current.push(notif)

    // Send browser notification (works even when tab is in background)
    sendBrowserNotification(
      headline.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim(),
      `${match.home_team.name} ${newHome} - ${newAway} ${match.away_team.name}\n${subMessage}`,
      tracked.teamCrest || '/favicon.ico'
    )

    // If no notification showing, start
    if (!notifTimerRef.current) {
      showNextNotification()
    }
  }, [showNextNotification])

  const dismissNotification = useCallback(() => {
    clearTimeout(notifTimerRef.current)
    notifTimerRef.current = null
    showNextNotification()
  }, [showNextNotification])

  const fetchMatchStats = useCallback(async (fixtureId, homeTeamId, awayTeamId, forceRefresh = false) => {
    // Use refs for guard checks to avoid stale closure issues
    if (!forceRefresh && (matchStatsRef.current[fixtureId] || statsLoadingRef.current[fixtureId])) return
    statsLoadingRef.current[fixtureId] = true
    setStatsLoading(prev => ({ ...prev, [fixtureId]: true }))
    try {
      const res = await axios.get(`/api/live-stats/${fixtureId}`)
      const rawStats = res.data.statistics
      if (rawStats && typeof rawStats === 'object') {
        // Map team IDs to home/away
        const parsed = { home: {}, away: {} }
        Object.entries(rawStats).forEach(([teamId, data]) => {
          if (parseInt(teamId) === homeTeamId) parsed.home = data.stats || {}
          else if (parseInt(teamId) === awayTeamId) parsed.away = data.stats || {}
        })
        matchStatsRef.current[fixtureId] = parsed
        setMatchStats(prev => ({ ...prev, [fixtureId]: parsed }))
      }
    } catch (err) {
      console.error('[LiveScores] Stats fetch error for fixture', fixtureId, err)
    }
    statsLoadingRef.current[fixtureId] = false
    setStatsLoading(prev => ({ ...prev, [fixtureId]: false }))
  }, []) // No state dependencies - uses refs for guards

  const handleExpand = useCallback((match) => {
    setExpandedMatch(prev => {
      const newId = prev === match.id ? null : match.id
      if (newId) {
        fetchMatchStats(match.id, match.home_team.id, match.away_team.id)
      }
      return newId
    })
    setExpandedTab('stats')
  }, [fetchMatchStats])

  const fetchLiveMatches = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      const response = await axios.get('/api/live-matches')
      const matches = response.data.matches || []

      // Detect new goals
      const prevGoals = prevGoalsRef.current
      const newGoalMatchIds = new Set()
      matches.forEach(m => {
        const key = m.id
        const totalGoals = (m.goals?.home || 0) + (m.goals?.away || 0)
        if (prevGoals[key] !== undefined && totalGoals > prevGoals[key]) {
          newGoalMatchIds.add(key)
          playGoalSound()
        }
        prevGoals[key] = totalGoals
        // Initialize status tracking for all matches
        if (!prevStatusRef.current[key]) prevStatusRef.current[key] = m.status
      })

      if (newGoalMatchIds.size > 0) {
        setRecentGoalIds(newGoalMatchIds)
        setTimeout(() => setRecentGoalIds(new Set()), 8000)
      }

      // Check tracked matches for score changes
      const currentTracked = trackedRef.current
      Object.keys(currentTracked).forEach(matchId => {
        const match = matches.find(m => m.id === Number(matchId))
        if (!match) return
        const tracked = currentTracked[matchId]
        const newHome = match.goals?.home || 0
        const newAway = match.goals?.away || 0

        if (newHome !== tracked.homeGoals || newAway !== tracked.awayGoals) {
          const homeScored = newHome > tracked.homeGoals
          const awayScored = newAway > tracked.awayGoals
          const userTeamScored = (tracked.isHome && homeScored) || (!tracked.isHome && awayScored)
          const opponentScored = (tracked.isHome && awayScored) || (!tracked.isHome && homeScored)
          const isDraw = newHome === newAway
          const userGoals = tracked.isHome ? newHome : newAway
          const oppGoals = tracked.isHome ? newAway : newHome
          const bigLead = userGoals - oppGoals >= 2

          let type = 'celebration'
          if (userTeamScored && bigLead) type = 'big_lead'
          else if (userTeamScored) type = 'celebration'
          else if (opponentScored && isDraw) type = 'worried'
          else if (opponentScored) type = 'sad'

          queueNotification(match, tracked, type, newHome, newAway)

          // Update stored scores
          setTrackedMatches(prev => ({
            ...prev,
            [matchId]: { ...prev[matchId], homeGoals: newHome, awayGoals: newAway }
          }))
        }
      })

      // Check tracked matches for match ending (FT/AET/PEN)
      const finishedStatuses = ['FT', 'AET', 'PEN']
      Object.keys(currentTracked).forEach(matchId => {
        const match = matches.find(m => m.id === Number(matchId))
        if (!match) return
        const prevStatus = prevStatusRef.current[matchId]
        const currentStatus = match.status

        // Match just ended: was live before, now finished
        if (
          prevStatus && !finishedStatuses.includes(prevStatus) &&
          finishedStatuses.includes(currentStatus) &&
          !endedMatchesRef.current.has(matchId)
        ) {
          endedMatchesRef.current.add(matchId)
          const tracked = currentTracked[matchId]
          const finalHome = match.goals?.home || 0
          const finalAway = match.goals?.away || 0
          const userGoals = tracked.isHome ? finalHome : finalAway
          const oppGoals = tracked.isHome ? finalAway : finalHome

          let endType = 'match_draw'
          if (userGoals > oppGoals) endType = 'match_won'
          else if (userGoals < oppGoals) endType = 'match_lost'

          queueNotification(match, tracked, endType, finalHome, finalAway)

          // Auto-untrack ended matches after a delay
          setTimeout(() => {
            setTrackedMatches(prev => {
              const next = { ...prev }
              delete next[matchId]
              return next
            })
          }, 15000)
        }
        prevStatusRef.current[matchId] = currentStatus
      })

      setLiveMatches(matches)
      setLastUpdate(new Date())
      setError(null)
    } catch (err) {
      console.error('Error fetching live matches:', err)
      if (err.response?.status === 500) {
        setError('Server error. Please try again later.')
      }
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLiveMatches(true)
    const interval = setInterval(() => fetchLiveMatches(false), 45000)
    return () => clearInterval(interval)
  }, [fetchLiveMatches])

  // Fetch upcoming matches
  useEffect(() => {
    const fetchUpcoming = async () => {
      setUpcomingLoading(true)
      try {
        const res = await axios.get('/api/fixtures/upcoming-all?days=3')
        console.log('[LiveScores] Upcoming fixtures loaded:', res.data.fixtures?.length || 0)
        setUpcomingMatches(res.data.fixtures || [])
      } catch (err) {
        console.error('[LiveScores] Upcoming fetch error:', err)
        setUpcomingMatches([])
      }
      setUpcomingLoading(false)
    }
    fetchUpcoming()
  }, [])

  // Auto-refresh stats for expanded live match every 60s
  useEffect(() => {
    if (!expandedMatch) return
    const match = liveMatches.find(m => m.id === expandedMatch)
    if (!match || !['1H', '2H', 'LIVE', 'ET', 'HT'].includes(match.status)) return
    const interval = setInterval(() => {
      // Clear cached stats from ref and state, then force re-fetch
      delete matchStatsRef.current[expandedMatch]
      delete statsLoadingRef.current[expandedMatch]
      setMatchStats(prev => { const next = { ...prev }; delete next[expandedMatch]; return next })
      fetchMatchStats(expandedMatch, match.home_team.id, match.away_team.id, true)
    }, 60000)
    return () => clearInterval(interval)
  }, [expandedMatch, liveMatches, fetchMatchStats])

  // Status helpers
  const isLive = (status) => ['1H', '2H', 'LIVE', 'ET', 'HT'].includes(status)
  const isFinished = (status) => ['FT', 'AET', 'PEN'].includes(status)

  const getMatchStatus = (status, elapsed) => {
    switch (status) {
      case '1H': case '2H': case 'LIVE': return `${elapsed}'`
      case 'HT': return t('liveScores.halfTime')
      case 'FT': return t('liveScores.fullTime')
      case 'ET': return `ET ${elapsed}'`
      case 'AET': return 'AET'
      case 'P': case 'PEN': return 'PEN'
      case 'SUSP': return 'SUSP'
      case 'INT': return 'INT'
      default: return status || '-'
    }
  }

  // Group and sort matches
  const groupedMatches = useMemo(() => {
    const groups = {}
    liveMatches.forEach(match => {
      const leagueKey = `${match.competition?.id || 'unknown'}`
      if (!groups[leagueKey]) {
        groups[leagueKey] = {
          id: match.competition?.id,
          country: match.competition?.country || 'Unknown',
          league: match.competition?.name || 'Unknown',
          emblem: match.competition?.emblem,
          flag: match.competition?.flag,
          code: match.competition?.code,
          priority: LEAGUE_PRIORITY[match.competition?.id] || 99,
          matches: []
        }
      }
      groups[leagueKey].matches.push(match)
    })

    // Sort matches within each league
    Object.values(groups).forEach(group => {
      group.matches.sort((a, b) => {
        // Favorited matches first
        const aFav = favorites.includes(a.id) ? 0 : 1
        const bFav = favorites.includes(b.id) ? 0 : 1
        if (aFav !== bFav) return aFav - bFav
        // Recent goals to top
        const aGoal = recentGoalIds.has(a.id) ? 0 : 1
        const bGoal = recentGoalIds.has(b.id) ? 0 : 1
        if (aGoal !== bGoal) return aGoal - bGoal
        // Live > HT > FT
        const statusOrder = (s) => isLive(s) ? 0 : s === 'HT' ? 1 : isFinished(s) ? 3 : 2
        return statusOrder(a.status) - statusOrder(b.status)
      })
    })

    // Sort leagues: priority first, then alphabetical
    return Object.values(groups).sort((a, b) => {
      // Leagues with live matches first
      const aHasLive = a.matches.some(m => isLive(m.status))
      const bHasLive = b.matches.some(m => isLive(m.status))
      if (aHasLive && !bHasLive) return -1
      if (!aHasLive && bHasLive) return 1
      // Then by priority
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.country.localeCompare(b.country)
    })
  }, [liveMatches, favorites, recentGoalIds])

  const handleMatchClick = (match) => {
    const code = match.competition?.code || 'PL'
    navigate(`/match/${code}/${match.home_team.id}/${match.away_team.id}`, {
      state: { fixture: match }
    })
  }

  if (loading) {
    return (
      <div className="live-scores-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  const liveCount = liveMatches.filter(m => isLive(m.status)).length
  const finishedCount = liveMatches.filter(m => isFinished(m.status)).length

  return (
    <div className="live-scores-page">
      {/* Tab switcher */}
      <div className="ls-view-tabs">
        <button className={`ls-view-tab ${activeView === 'live' ? 'active' : ''}`} onClick={() => setActiveView('live')}>
          <span className="live-dot"></span>
          {t('liveScores.title')}
          {liveCount > 0 && <span className="ls-tab-badge live">{liveCount}</span>}
        </button>
        <button className={`ls-view-tab ${activeView === 'upcoming' ? 'active' : ''}`} onClick={() => setActiveView('upcoming')}>
          Upcoming Matches
          {!upcomingLoading && upcomingMatches.length > 0 && <span className="ls-tab-badge">{upcomingMatches.length}</span>}
        </button>
      </div>

      {/* === LIVE SCORES VIEW === */}
      {activeView === 'live' && (
        <>
          <div className="live-scores-header">
            <div className="header-actions">
              <div className="live-stats-bar">
                {liveCount > 0 && <span className="live-stat live">{liveCount} {t('fixtures.live')}</span>}
                {finishedCount > 0 && <span className="live-stat finished">{finishedCount} {t('liveScores.fullTime')}</span>}
              </div>
              {lastUpdate && (
                <span className="last-update-time">
                  {lastUpdate.toLocaleTimeString()}
                </span>
              )}
              <button className="refresh-btn" onClick={() => fetchLiveMatches(false)}>
                {t('common.refresh')}
              </button>
            </div>
          </div>

          {error && (
            <div className="error-banner">
              {error}
              <button className="retry-btn" onClick={() => fetchLiveMatches(true)}>Try Again</button>
            </div>
          )}

      {!error && liveMatches.length === 0 ? (
        <div className="no-live-matches">
          <div className="no-matches-icon">⚽</div>
          <h2>{t('liveScores.noLiveMatches')}</h2>
          <p>{t('liveScores.checkBackLater')}</p>
          <p className="hint-text">
            Live matches from ALL leagues worldwide are shown when games are being played.
          </p>
        </div>
      ) : (
        <div className="live-leagues-container">
          {groupedMatches.map((group, gIdx) => (
            <div key={gIdx} className="live-league-group">
              <div className="league-group-header">
                {group.flag ? (
                  <img src={group.flag} alt="" className="league-group-flag" />
                ) : group.emblem ? (
                  <img src={group.emblem} alt="" className="league-group-emblem" />
                ) : null}
                <div className="league-group-info">
                  <span className="league-group-country">{group.country}</span>
                  <span className="league-group-name">{group.league}</span>
                </div>
                <span className="league-match-count">{group.matches.length}</span>
              </div>

              <div className="league-matches-list">
                {group.matches.map((match) => {
                  const hasGoal = recentGoalIds.has(match.id)
                  const isFav = favorites.includes(match.id)
                  const analysis = match.live_analysis

                  return (
                    <div key={match.id}>
                      <div
                        className={`live-match-row ${isLive(match.status) ? 'is-live' : ''} ${isFinished(match.status) ? 'is-ft' : ''} ${hasGoal ? 'goal-flash' : ''}`}
                        onClick={() => handleExpand(match)}
                      >
                        <button
                          className={`fav-star ${isFav ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(match.id) }}
                        >
                          {isFav ? '\u2605' : '\u2606'}
                        </button>

                        <div className={`match-row-status ${isLive(match.status) ? 'live' : isFinished(match.status) ? 'ft' : ''}`}>
                          {isLive(match.status) && <span className="status-live-dot"></span>}
                          {getMatchStatus(match.status, match.elapsed)}
                        </div>

                        <div className="match-row-teams">
                          <div className="match-row-team home">
                            {match.home_team.crest && (
                              <img src={match.home_team.crest} alt="" className="match-row-crest" />
                            )}
                            <span className="match-row-name">{match.home_team.name}</span>
                          </div>
                          <div className="match-row-team away">
                            {match.away_team.crest && (
                              <img src={match.away_team.crest} alt="" className="match-row-crest" />
                            )}
                            <span className="match-row-name">{match.away_team.name}</span>
                          </div>
                        </div>

                        <div className={`match-row-score ${hasGoal ? 'score-flash' : ''}`}>
                          <span className={isLive(match.status) ? 'score-live' : ''}>
                            {match.goals?.home ?? 0}
                          </span>
                          <span className="score-separator">-</span>
                          <span className={isLive(match.status) ? 'score-live' : ''}>
                            {match.goals?.away ?? 0}
                          </span>
                        </div>

                        {/* Track match button */}
                        {isLive(match.status) && (
                          <div className="track-btn-wrap" onClick={e => e.stopPropagation()}>
                            <button
                              className={`track-btn ${trackedMatches[match.id] ? 'track-btn-active' : ''}`}
                              onClick={() => {
                                if (trackedMatches[match.id]) {
                                  untrackMatch(match.id)
                                } else {
                                  setTeamSelectorMatch(teamSelectorMatch === match.id ? null : match.id)
                                }
                              }}
                            >
                              {trackedMatches[match.id] ? '\u{1F514} Tracking' : '\u26BD Track Match'}
                            </button>
                            {teamSelectorMatch === match.id && (
                              <div className="team-selector-popup">
                                <div className="team-selector-title">Which team do you support?</div>
                                <div className="team-selector-options">
                                  <button className="team-selector-btn" onClick={() => startTracking(match, match.home_team.id)}>
                                    {match.home_team.crest && <img src={match.home_team.crest} alt="" className="team-selector-crest" />}
                                    <span>{match.home_team.name}</span>
                                  </button>
                                  <button className="team-selector-btn" onClick={() => startTracking(match, match.away_team.id)}>
                                    {match.away_team.crest && <img src={match.away_team.crest} alt="" className="team-selector-crest" />}
                                    <span>{match.away_team.name}</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="match-row-arrow">&rsaquo;</div>
                      </div>

                      {/* Expanded analysis panel */}
                      {expandedMatch === match.id && (() => {
                        const stats = matchStats[match.id] || match.statistics
                        const hasStats = stats && (Object.keys(stats.home || {}).length > 0 || Object.keys(stats.away || {}).length > 0)
                        const isStatsLoading = statsLoading[match.id]
                        const matchEvents = match.events || []
                        const goalEvents = matchEvents.filter(e => e.type === 'Goal')
                        const homeGoalEvents = goalEvents.filter(e => e.team_id === match.home_team.id)
                        const awayGoalEvents = goalEvents.filter(e => e.team_id === match.away_team.id)

                        // Helper to get stat value
                        const getStat = (key) => {
                          const h = stats?.home?.[key]
                          const a = stats?.away?.[key]
                          return { home: h, away: a, available: h != null || a != null }
                        }

                        // Helper to try multiple key variants
                        const getStatMulti = (...keys) => {
                          for (const k of keys) {
                            const r = getStat(k)
                            if (r.available) return { ...r, foundKey: k }
                          }
                          return { home: null, away: null, available: false, foundKey: null }
                        }

                        // Stats to display (with key variants for API inconsistencies)
                        const statRows = [
                          { keys: ['Ball Possession'], label: 'Possession' },
                          { keys: ['Total Shots'], label: 'Total Shots' },
                          { keys: ['Shots on Goal'], label: 'Shots on Target' },
                          { keys: ['Shots off Goal'], label: 'Shots off Target' },
                          { keys: ['Corner Kicks'], label: 'Corners' },
                          { keys: ['Fouls'], label: 'Fouls' },
                          { keys: ['Yellow Cards'], label: 'Yellow Cards' },
                          { keys: ['Red Cards'], label: 'Red Cards' },
                          { keys: ['Offsides'], label: 'Offsides' },
                          { keys: ['Passes accurate', 'Passes Accurate'], label: 'Accurate Passes' },
                          { keys: ['Passes %', 'Pass Accuracy'], label: 'Pass Accuracy' },
                          { keys: ['expected_goals'], label: 'Expected Goals (xG)' },
                        ].map(s => {
                          const result = getStatMulti(...s.keys)
                          return { ...s, ...result }
                        }).filter(s => s.available)

                        return (
                        <div className="match-expanded-panel">
                          {/* Tab Bar */}
                          <div className="expanded-tabs">
                            <button className={`expanded-tab ${expandedTab === 'stats' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setExpandedTab('stats') }}>Stats</button>
                            <button className={`expanded-tab ${expandedTab === 'events' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setExpandedTab('events') }}>Events</button>
                            {analysis && isLive(match.status) && (
                              <button className={`expanded-tab ${expandedTab === 'analysis' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setExpandedTab('analysis') }}>Analysis</button>
                            )}
                          </div>

                          {/* === STATS TAB === */}
                          {expandedTab === 'stats' && (
                            <div className="match-stats-panel">
                              {/* Score header with goal scorers */}
                              <div className="stats-score-header">
                                <div className="stats-team-col home">
                                  {match.home_team.crest && <img src={match.home_team.crest} alt="" className="stats-team-crest" />}
                                  <span className="stats-team-name">{match.home_team.name}</span>
                                </div>
                                <div className="stats-score-center">
                                  <span className="stats-score-num">{match.goals?.home ?? 0} - {match.goals?.away ?? 0}</span>
                                  <span className="stats-match-status">{getMatchStatus(match.status, match.elapsed)}</span>
                                </div>
                                <div className="stats-team-col away">
                                  {match.away_team.crest && <img src={match.away_team.crest} alt="" className="stats-team-crest" />}
                                  <span className="stats-team-name">{match.away_team.name}</span>
                                </div>
                              </div>

                              {/* Goal scorers under score */}
                              {goalEvents.length > 0 && (
                                <div className="stats-scorers-row">
                                  <div className="stats-scorers-col home">
                                    {homeGoalEvents.map((g, i) => (
                                      <span key={i} className="stats-scorer">{g.player} {g.time}'</span>
                                    ))}
                                  </div>
                                  <div className="stats-scorers-col away">
                                    {awayGoalEvents.map((g, i) => (
                                      <span key={i} className="stats-scorer">{g.player} {g.time}'</span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Stats comparison bars */}
                              {hasStats && statRows.length > 0 ? (
                                <div className="stats-comparison">
                                  {statRows.map((row) => {
                                    const hVal = row.home
                                    const aVal = row.away
                                    const hNum = typeof hVal === 'string' ? parseFloat(hVal) : (hVal || 0)
                                    const aNum = typeof aVal === 'string' ? parseFloat(aVal) : (aVal || 0)
                                    const total = hNum + aNum || 1
                                    const hPct = Math.round((hNum / total) * 100)
                                    const aPct = 100 - hPct
                                    const hDisplay = hVal ?? 0
                                    const aDisplay = aVal ?? 0
                                    return (
                                      <div key={row.label} className="stat-comparison-row">
                                        <span className={`stat-val home ${hNum > aNum ? 'leading' : ''}`}>{hDisplay}</span>
                                        <div className="stat-bar-section">
                                          <span className="stat-label">{row.label}</span>
                                          <div className="stat-bar-track">
                                            <div className={`stat-bar-home ${hNum > aNum ? 'leading' : hNum < aNum ? 'trailing' : ''}`} style={{ width: `${hPct}%` }} />
                                            <div className={`stat-bar-away ${aNum > hNum ? 'leading' : aNum < hNum ? 'trailing' : ''}`} style={{ width: `${aPct}%` }} />
                                          </div>
                                        </div>
                                        <span className={`stat-val away ${aNum > hNum ? 'leading' : ''}`}>{aDisplay}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : (
                                <div className="stats-unavailable">
                                  {isStatsLoading ? (
                                    <><div className="spinner" style={{ width: 20, height: 20, margin: '0 auto 8px' }}></div><p>{t('common.loading')}</p></>
                                  ) : (
                                    <p>Statistics not yet available for this match.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* === EVENTS TAB === */}
                          {expandedTab === 'events' && (
                            <div className="match-events-timeline">
                              {matchEvents.length > 0 ? (
                                <>
                                  <div className="events-timeline-header">
                                    <span className="etl-team-name">{match.home_team.name}</span>
                                    <span className="etl-center-label">Match Events</span>
                                    <span className="etl-team-name">{match.away_team.name}</span>
                                  </div>
                                  <div className="events-timeline-list">
                                    {matchEvents.map((event, idx) => {
                                      const isHome = event.team_id === match.home_team.id
                                      const icon = event.type === 'Goal' ? (event.detail === 'Own Goal' ? '\u26BD\u274C' : '\u26BD')
                                        : event.type === 'Card' ? (event.detail === 'Red Card' ? '\uD83D\uDFE5' : event.detail === 'Second Yellow card' ? '\uD83D\uDFE8\uD83D\uDFE5' : '\uD83D\uDFE8')
                                        : event.type === 'subst' ? '\uD83D\uDD04' : '\uD83D\uDCCB'
                                      return (
                                        <div key={idx} className={`etl-event ${isHome ? 'home' : 'away'}`}>
                                          {isHome && (
                                            <div className="etl-event-content home">
                                              <span className="etl-player">{event.player}</span>
                                              {event.detail && event.detail !== event.type && (
                                                <span className="etl-detail">{event.detail}</span>
                                              )}
                                            </div>
                                          )}
                                          <div className="etl-time-col">
                                            <span className="etl-icon">{icon}</span>
                                            <span className="etl-time">{event.time}'</span>
                                          </div>
                                          {!isHome && (
                                            <div className="etl-event-content away">
                                              <span className="etl-player">{event.player}</span>
                                              {event.detail && event.detail !== event.type && (
                                                <span className="etl-detail">{event.detail}</span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </>
                              ) : (
                                <div className="stats-unavailable">
                                  <p>No events recorded yet.</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* === ANALYSIS TAB === */}
                          {expandedTab === 'analysis' && analysis && isLive(match.status) && (
                            <div className="lma-container lma-compact">
                              {[
                                { key: 'dom', label: 'DOMINATION', data: analysis.domination },
                                { key: 'lts', label: 'LIKELY TO SCORE', data: analysis.likely_next_goal },
                                { key: 'agg', label: 'AGGRESSION', data: analysis.aggression },
                              ].filter(m => m.data).map(m => {
                                const h = m.data.home || 50
                                const a = m.data.away || 50
                                const hDom = h >= a
                                const hCol = hDom ? '#22c55e' : '#ef4444'
                                const aCol = hDom ? '#ef4444' : '#22c55e'
                                return (
                                  <div key={m.key} className="lma-metric">
                                    <div className="lma-label">{m.label}</div>
                                    <div className="lma-bar-row">
                                      <span className="lma-pct" style={{ color: hCol }}>{h}%</span>
                                      <div className="lma-track">
                                        <div className="lma-fill-home" style={{ width: `${h}%`, background: hCol, boxShadow: `0 0 12px ${hCol}88` }} />
                                        <div className="lma-fill-away" style={{ width: `${a}%`, background: aCol, boxShadow: `0 0 12px ${aCol}88` }} />
                                      </div>
                                      <span className="lma-pct" style={{ color: aCol }}>{a}%</span>
                                    </div>
                                    <div className="lma-teams">
                                      <span style={{ color: hCol }}>{match.home_team.name}</span>
                                      <span style={{ color: aCol }}>{match.away_team.name}</span>
                                    </div>
                                  </div>
                                )
                              })}

                              {analysis.possession && (() => {
                                const h = analysis.possession.home || 50
                                const a = analysis.possession.away || 50
                                return (
                                  <div className="lma-metric">
                                    <div className="lma-label">POSSESSION</div>
                                    <div className="lma-bar-row">
                                      <span className="lma-pct lma-pct-neutral">{h}%</span>
                                      <div className="lma-track">
                                        <div className="lma-fill-home lma-neutral-possession" style={{ width: `${h}%` }} />
                                        <div className="lma-fill-away lma-neutral-possession-dim" style={{ width: `${a}%` }} />
                                      </div>
                                      <span className="lma-pct lma-pct-neutral">{a}%</span>
                                    </div>
                                  </div>
                                )
                              })()}

                              {analysis.shots && (() => {
                                const h = analysis.shots.home || 0
                                const a = analysis.shots.away || 0
                                const total = h + a || 1
                                const hp = Math.round((h / total) * 100)
                                return (
                                  <div className="lma-metric">
                                    <div className="lma-label">SHOTS</div>
                                    <div className="lma-bar-row">
                                      <span className="lma-pct lma-pct-neutral">{h}</span>
                                      <div className="lma-track">
                                        <div className="lma-fill-home lma-neutral-shots" style={{ width: `${hp}%` }} />
                                        <div className="lma-fill-away lma-neutral-shots-dim" style={{ width: `${100 - hp}%` }} />
                                      </div>
                                      <span className="lma-pct lma-pct-neutral">{a}</span>
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="expanded-actions">
                            <button className="full-analysis-btn" onClick={(e) => { e.stopPropagation(); handleMatchClick(match) }}>
                              Full Match Analysis
                            </button>
                            <div className="match-live-chat-section" onClick={e => e.stopPropagation()}>
                              <button
                                className="match-chat-toggle"
                                onClick={() => setChatMatch({
                                  key: String(match.id),
                                  name: `${match.home_team.name} vs ${match.away_team.name}`
                                })}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                <span>Live Chat</span>
                              </button>
                            </div>
                          </div>
                        </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {/* === UPCOMING MATCHES VIEW === */}
      {activeView === 'upcoming' && (
        <div className="upcoming-section-livescores">
          {upcomingLoading ? (
            <div className="loading-container" style={{ padding: '24px 0' }}>
              <div className="spinner"></div>
              <p>Loading upcoming matches...</p>
            </div>
          ) : upcomingMatches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b' }}>
              <p>No upcoming matches found.</p>
            </div>
          ) : (() => {
            const allSorted = [...upcomingMatches].sort((a, b) => new Date(a.date) - new Date(b.date))
            const UPCOMING_PER_PAGE = 15
            const totalUpcomingPages = Math.max(1, Math.ceil(allSorted.length / UPCOMING_PER_PAGE))
            const paged = allSorted.slice((upcomingPage - 1) * UPCOMING_PER_PAGE, upcomingPage * UPCOMING_PER_PAGE)
            const groups = {}
            paged.forEach(f => {
              const d = f.date.split('T')[0]
              if (!groups[d]) groups[d] = []
              groups[d].push(f)
            })
            const sortedDates = Object.keys(groups).sort()

            return (
              <>
                <div className="upcoming-fixtures-list">
                  {sortedDates.map(date => (
                    <div key={date} className="upcoming-date-group">
                      <div className="upcoming-date-header">
                        <span>{new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        <span className="upcoming-date-count">{groups[date].length} {groups[date].length !== 1 ? 'matches' : 'match'}</span>
                      </div>
                      <div className="upcoming-fixtures-grid">
                        {groups[date].map(fixture => {
                          const isPro = user?.tier === 'pro' || user?.tier === 'trial'
                          const compCode = fixture.competition?.code || 'PL'
                          return (
                            <div
                              key={fixture.id}
                              className={`upcoming-fixture-card ${!isPro ? 'pro-gated' : ''}`}
                              onClick={() => {
                                if (!isPro) {
                                  navigate('/upgrade', { state: { from: 'upcoming' } })
                                  return
                                }
                                navigate(`/match/${compCode}/${fixture.home_team.id}/${fixture.away_team.id}`, { state: { fixture, from: 'upcoming' } })
                              }}
                            >
                              <div className="upcoming-fixture-time">
                                {new Date(fixture.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                {fixture.competition?.name && (
                                  <span className="upcoming-fixture-league">{fixture.competition.name}</span>
                                )}
                              </div>
                              <div className="upcoming-fixture-teams">
                                <div className="upcoming-team home">
                                  {fixture.home_team.crest && <img src={fixture.home_team.crest} alt="" className="upcoming-team-crest" />}
                                  <span>{fixture.home_team.name}</span>
                                </div>
                                <span className="upcoming-vs">vs</span>
                                <div className="upcoming-team away">
                                  <span>{fixture.away_team.name}</span>
                                  {fixture.away_team.crest && <img src={fixture.away_team.crest} alt="" className="upcoming-team-crest" />}
                                </div>
                              </div>
                              <div className={`upcoming-analyze-btn ${!isPro ? 'pro-only' : ''}`}>
                                {isPro ? 'Analyze' : '50 Credits'}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {totalUpcomingPages > 1 && (() => {
                  const maxVis = 5
                  let s = Math.max(1, upcomingPage - Math.floor(maxVis / 2))
                  let e = Math.min(totalUpcomingPages, s + maxVis - 1)
                  if (e - s < maxVis - 1) s = Math.max(1, e - maxVis + 1)
                  const pg = []
                  for (let i = s; i <= e; i++) pg.push(i)
                  return (
                    <div className="upcoming-pagination">
                      <button className="upcoming-page-btn" disabled={upcomingPage <= 1} onClick={() => setUpcomingPage(upcomingPage - 1)}>
                        Prev
                      </button>
                      {s > 1 && (
                        <>
                          <button className="upcoming-page-btn" onClick={() => setUpcomingPage(1)}>1</button>
                          {s > 2 && <span className="pagination-dots">...</span>}
                        </>
                      )}
                      {pg.map(p => (
                        <button key={p} className={`upcoming-page-btn ${p === upcomingPage ? 'active' : ''}`} onClick={() => setUpcomingPage(p)}>
                          {p}
                        </button>
                      ))}
                      {e < totalUpcomingPages && (
                        <>
                          {e < totalUpcomingPages - 1 && <span className="pagination-dots">...</span>}
                          <button className="upcoming-page-btn" onClick={() => setUpcomingPage(totalUpcomingPages)}>{totalUpcomingPages}</button>
                        </>
                      )}
                      <button className="upcoming-page-btn" disabled={upcomingPage >= totalUpcomingPages} onClick={() => setUpcomingPage(upcomingPage + 1)}>
                        Next
                      </button>
                    </div>
                  )
                })()}
              </>
            )
          })()}
        </div>
      )}

      {chatMatch && (
        <LiveChatPopup
          matchKey={chatMatch.key}
          matchName={chatMatch.name}
          onClose={() => setChatMatch(null)}
        />
      )}

      {/* Goal Notification Overlay */}
      {goalNotification && (
        <div className="goal-notif-overlay" onClick={dismissNotification}>
          <div className={`goal-notif-card goal-notif-${goalNotification.type}`} onClick={e => e.stopPropagation()}>
            <button className="goal-notif-close" onClick={dismissNotification}>{'\u2715'}</button>
            <div className="goal-notif-headline">{goalNotification.headline}</div>
            <div className="goal-notif-gif-wrap">
              {goalNotification.gifUrl ? (
                <img src={goalNotification.gifUrl} alt="Goal reaction" className="goal-notif-gif" />
              ) : (
                <div className="goal-notif-gif-loading">{'\u26BD'} Loading...</div>
              )}
            </div>
            <div className="goal-notif-score-section">
              <div className="goal-notif-team">
                {goalNotification.homeCrest && <img src={goalNotification.homeCrest} alt="" className="goal-notif-crest" />}
                <span>{goalNotification.homeTeam}</span>
              </div>
              <div className="goal-notif-score">
                {goalNotification.homeGoals} - {goalNotification.awayGoals}
              </div>
              <div className="goal-notif-team">
                <span>{goalNotification.awayTeam}</span>
                {goalNotification.awayCrest && <img src={goalNotification.awayCrest} alt="" className="goal-notif-crest" />}
              </div>
            </div>
            <div className="goal-notif-sub">{goalNotification.subMessage}</div>
            <div className="goal-notif-tracked">
              {goalNotification.trackedCrest && <img src={goalNotification.trackedCrest} alt="" className="goal-notif-tracked-crest" />}
              Tracking: {goalNotification.trackedTeam}
            </div>
            <div className="goal-notif-dismiss">Tap anywhere to dismiss</div>
          </div>
        </div>
      )}
    </div>
  )
}
