import { getLocalDateString, formatLocalDate } from './date'

/**
 * SM-2 Spaced Repetition Algorithm (Optimized for language learning)
 *
 * Based on the SuperMemo SM-2 algorithm by Piotr Wozniak, with adjustments
 * for language learning: new cards enter review immediately, correct answers
 * quickly space out intervals to avoid over-reviewing.
 *
 * @param {number} quality - 0-3 score:
 *   0: complete blackout
 *   1: incorrect, but upon seeing the answer, remembered
 *   2: correct with serious difficulty
 *   3: correct with perfect response
 * @param {Object} currentData - Current SM-2 state
 * @param {number} currentData.easeFactor - Ease factor (default: 2.5)
 * @param {number} currentData.interval - Current interval in days (default: 0)
 * @param {number} currentData.repetitions - Number of consecutive correct responses (default: 0)
 * @returns {Object} Updated SM-2 state
 * @returns {number} easeFactor - Updated ease factor
 * @returns {number} interval - Updated interval in days
 * @returns {number} repetitions - Updated repetition count
 * @returns {string} nextReview - ISO date string of next review date
 */
export function calculateNextReview(quality, currentData = {}) {
  const {
    easeFactor: ef = 2.5,
    interval: prevInterval = 0,
    repetitions: reps = 0,
  } = currentData

  let newEF = ef
  let newInterval
  let newReps

  if (reps === 0) {
    // New card, first review — always show again tomorrow
    newInterval = 1
    if (quality >= 2) {
      // Correct: advance to next stage
      newReps = 1
    } else {
      // Incorrect: keep reps=0 so next incorrect also stays as "new card"
      // (prevents 0↔1 oscillation when user keeps getting it wrong)
      newReps = 0
    }
  } else if (reps === 1) {
    // Second review
    if (quality >= 2) {
      // Correct: jump to 3 days
      newInterval = 3
      newReps = 2
    } else {
      // Incorrect: reset to 1 day
      newInterval = 1
      newReps = 0
    }
  } else {
    // Standard SM-2 for subsequent reviews
    if (quality < 2) {
      // Incorrect: reset
      newReps = 0
      newInterval = 1
    } else {
      // Correct: standard SM-2 progression
      newReps = reps + 1
      newInterval = Math.round(prevInterval * ef)
    }
  }

  // Update ease factor (SM-2 formula)
  newEF =
    ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))

  // Clamp ease factor to minimum of 1.3
  if (newEF < 1.3) {
    newEF = 1.3
  }

  // Calculate next review date
  const now = new Date()
  const nextDate = new Date(now)
  nextDate.setDate(nextDate.getDate() + newInterval)
  const nextReview = formatLocalDate(nextDate) // YYYY-MM-DD in local timezone

  return {
    easeFactor: Math.round(newEF * 100) / 100,
    interval: newInterval,
    repetitions: newReps,
    nextReview,
  }
}
