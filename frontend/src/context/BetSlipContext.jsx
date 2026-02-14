import { createContext, useContext, useState, useCallback } from 'react'
import axios from 'axios'

const BetSlipContext = createContext(null)

export function BetSlipProvider({ children }) {
  const [selectedBets, setSelectedBets] = useState([])
  const [confirming, setConfirming] = useState(false)
  const [confirmResult, setConfirmResult] = useState(null)

  const addBet = useCallback((bet) => {
    // Auto-capture competitionId from URL if not provided
    if (!bet.competitionId) {
      const match = window.location.pathname.match(/\/match\/([^/]+)\//)
      if (match) bet.competitionId = match[1]
    }
    setSelectedBets(prev => {
      // Check if this exact bet already exists (same match + same category + same outcome)
      const existingIndex = prev.findIndex(
        b => b.matchId === bet.matchId && b.category === bet.category && b.outcome === bet.outcome
      )

      if (existingIndex >= 0) {
        // Remove if already selected (toggle off)
        return prev.filter((_, i) => i !== existingIndex)
      }

      // Only ONE bet per match allowed - remove any existing bet for this match
      const filteredBets = prev.filter(b => b.matchId !== bet.matchId)

      // Add new bet
      return [...filteredBets, bet]
    })
    setConfirmResult(null)
  }, [])

  const removeBet = useCallback((matchId) => {
    setSelectedBets(prev => prev.filter(b => b.matchId !== matchId))
    setConfirmResult(null)
  }, [])

  const clearAllBets = useCallback(() => {
    setSelectedBets([])
    setConfirmResult(null)
  }, [])

  const isBetSelected = useCallback((matchId, category, outcome) => {
    return selectedBets.some(
      b => b.matchId === matchId && b.category === category && b.outcome === outcome
    )
  }, [selectedBets])

  const hasMatchSelection = useCallback((matchId) => {
    return selectedBets.some(b => b.matchId === matchId)
  }, [selectedBets])

  const confirmPredictions = useCallback(async (options = {}) => {
    const { visibility = 'private', isPaid = false, priceUsd = 0, analysisNotes = '' } = options
    setConfirming(true)
    setConfirmResult(null)
    try {
      const res = await axios.post('/api/predictions/confirm', {
        predictions: selectedBets,
        visibility,
        is_paid: isPaid,
        price_usd: priceUsd,
        analysis_notes: analysisNotes,
      })
      if (res.data.success) {
        setConfirmResult({
          success: true,
          count: res.data.confirmed_count,
          shared: res.data.shared,
          isPaid: res.data.is_paid,
        })
        setSelectedBets([])
      }
      return res.data
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to confirm predictions'
      setConfirmResult({ success: false, error: msg })
      return { success: false, error: msg }
    } finally {
      setConfirming(false)
    }
  }, [selectedBets])

  // Calculate combined probability (multiply all probabilities)
  const combinedProbability = selectedBets.length > 0
    ? selectedBets.reduce((acc, bet) => acc * (bet.probability / 100), 1) * 100
    : 0

  // Calculate potential score (inverse of combined probability - higher is riskier)
  const riskScore = selectedBets.length > 0
    ? Math.round((1 / (combinedProbability / 100)) * 10) / 10
    : 0

  const value = {
    selectedBets,
    addBet,
    removeBet,
    clearAllBets,
    isBetSelected,
    hasMatchSelection,
    confirmPredictions,
    confirming,
    confirmResult,
    setConfirmResult,
    combinedProbability: Math.round(combinedProbability * 100) / 100,
    riskScore,
    betCount: selectedBets.length,
  }

  return (
    <BetSlipContext.Provider value={value}>
      {children}
    </BetSlipContext.Provider>
  )
}

export function useBetSlip() {
  const context = useContext(BetSlipContext)
  if (!context) {
    throw new Error('useBetSlip must be used within a BetSlipProvider')
  }
  return context
}
