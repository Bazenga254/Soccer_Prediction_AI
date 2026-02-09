import { useBetSlip } from '../context/BetSlipContext'

export default function SelectableProbability({
  matchId,
  matchName,
  category,
  outcome,
  probability,
  className = '',
  children
}) {
  const { addBet, isBetSelected } = useBetSlip()

  const isSelected = isBetSelected(matchId, category, outcome)

  const handleClick = (e) => {
    e.stopPropagation()
    addBet({
      matchId,
      matchName,
      category,
      outcome,
      probability: parseFloat(probability)
    })
  }

  return (
    <div
      className={`selectable-probability ${className} ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
      title={isSelected ? 'Click to remove from predictions' : 'Click to add to predictions'}
    >
      {children}
      <div className="selection-indicator">
        {isSelected ? '✓' : '+'}
      </div>
    </div>
  )
}
