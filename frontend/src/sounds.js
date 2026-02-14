/**
 * Sound utility for Spark AI
 * Uses Web Audio API to generate notification sounds.
 * Preference stored in localStorage (default: enabled).
 */

const STORAGE_KEY = 'spark_sound_enabled'

let audioCtx = null

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioCtx
}

/**
 * Check if sounds are enabled (default: true)
 */
export function isSoundEnabled() {
  const val = localStorage.getItem(STORAGE_KEY)
  return val === null ? true : val === 'true'
}

/**
 * Set sound enabled/disabled
 */
export function setSoundEnabled(enabled) {
  localStorage.setItem(STORAGE_KEY, String(enabled))
}

/**
 * Play a swoosh notification sound
 */
export function playSwoosh() {
  if (!isSoundEnabled()) return

  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') ctx.resume()

    const now = ctx.currentTime

    // Main tone — short rising sweep
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(600, now)
    osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.08)
    osc1.frequency.exponentialRampToValueAtTime(800, now + 0.15)
    gain1.gain.setValueAtTime(0.15, now)
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.2)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.2)

    // Secondary soft chime
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1050, now + 0.05)
    gain2.gain.setValueAtTime(0.08, now + 0.05)
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.05)
    osc2.stop(now + 0.25)
  } catch {
    // Silently fail — sound is non-critical
  }
}
