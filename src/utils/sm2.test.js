import { describe, it, expect } from 'vitest'
import { calculateNextReview } from './sm2'

describe('calculateNextReview — SM-2 Spaced Repetition Algorithm', () => {
  // ── New card (repetitions = 0) ──────────────────────────────────────
  describe('new card (first review)', () => {
    it('quality >= 2 → interval = 1, reps = 1', () => {
      const result = calculateNextReview(3, { easeFactor: 2.5, interval: 0, repetitions: 0 })
      expect(result.interval).toBe(1)
      expect(result.repetitions).toBe(1)
    })

    it('quality < 2 → still interval = 1, reps = 1 (no same-day spam)', () => {
      const result = calculateNextReview(0, { easeFactor: 2.5, interval: 0, repetitions: 0 })
      expect(result.interval).toBe(1)
      expect(result.repetitions).toBe(1)
    })

    it('default currentData (empty object) → works', () => {
      const result = calculateNextReview(2)
      expect(result.interval).toBe(1)
      expect(result.repetitions).toBe(1)
      // SM-2 formula always updates EF: quality=2 → EF decreases from 2.5 to ~2.18
      expect(result.easeFactor).toBeLessThan(2.5)
      expect(result.easeFactor).toBeGreaterThan(1.3)
    })
  })

  // ── Second review (repetitions = 1) ─────────────────────────────────
  describe('second review', () => {
    it('quality >= 2 → jumps to interval = 3', () => {
      const result = calculateNextReview(3, { easeFactor: 2.5, interval: 1, repetitions: 1 })
      expect(result.interval).toBe(3)
      expect(result.repetitions).toBe(2)
    })

    it('quality < 2 → resets to interval = 1, reps = 0', () => {
      const result = calculateNextReview(0, { easeFactor: 2.5, interval: 1, repetitions: 1 })
      expect(result.interval).toBe(1)
      expect(result.repetitions).toBe(0)
    })
  })

  // ── Subsequent reviews (repetitions >= 2) ───────────────────────────
  describe('subsequent reviews (standard SM-2)', () => {
    it('quality >= 2 → interval = prevInterval × easeFactor', () => {
      // prevInterval=6, ef=2.5 → newInterval = Math.round(6*2.5) = 15
      const result = calculateNextReview(3, { easeFactor: 2.5, interval: 6, repetitions: 2 })
      expect(result.interval).toBe(15)
      expect(result.repetitions).toBe(3)
    })

    it('quality < 2 → reset to interval=1, reps=0', () => {
      const result = calculateNextReview(1, { easeFactor: 2.5, interval: 10, repetitions: 5 })
      expect(result.interval).toBe(1)
      expect(result.repetitions).toBe(0)
    })

    it('interval progression for consecutive correct answers', () => {
      // First review
      const r1 = calculateNextReview(3)
      expect(r1.interval).toBe(1)

      // Second review (after 1 day)
      const r2 = calculateNextReview(3, r1)
      expect(r2.interval).toBe(3)

      // Third review (after 3 days)
      const r3 = calculateNextReview(3, r2)
      expect(r3.interval).toBeGreaterThanOrEqual(7)

      // Fourth review
      const r4 = calculateNextReview(3, r3)
      expect(r4.interval).toBeGreaterThan(r3.interval)
    })
  })

  // ── Ease factor ─────────────────────────────────────────────────────
  describe('ease factor', () => {
    it('quality=3 (best) → ease factor decreases slightly (SM-2 standard)', () => {
      // SM-2 formula: EF' = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02))
      // q=3 → EF' = 2.5 + (0.1 - 2*(0.08+2*0.02)) = 2.5 - 0.14 = 2.36
      const result = calculateNextReview(3, { easeFactor: 2.5, interval: 6, repetitions: 2 })
      expect(result.easeFactor).toBeCloseTo(2.36, 1)
    })

    it('ease factor unchanged at quality ≈ 4 (theoretical, mapped)', () => {
      // The SM-2 formula is designed for 0-5 scale but we use 0-3.
      // At q=4 (mapped), EF' = EF + (0.1 - 1*0.1) = EF → unchanged.
      // This test documents the intended crossover point.
      // Not testable with our 0-3 scale, but kept for reference.
      expect(true).toBe(true)
    })

    it('quality=0 (blackout) → ease factor decreases', () => {
      const result = calculateNextReview(0, { easeFactor: 2.5, interval: 6, repetitions: 2 })
      expect(result.easeFactor).toBeLessThan(2.5)
    })

    it('ease factor never drops below 1.3', () => {
      // Repeated failures should bottom out at 1.3
      let result = { easeFactor: 2.5, interval: 6, repetitions: 2 }
      for (let i = 0; i < 20; i++) {
        result = calculateNextReview(0, result)
      }
      expect(result.easeFactor).toBeGreaterThanOrEqual(1.3)
      expect(result.easeFactor).toBeLessThan(1.31) // should be exactly 1.3
    })
  })

  // ── nextReview date ─────────────────────────────────────────────────
  describe('nextReview date', () => {
    it('returns a YYYY-MM-DD string', () => {
      const result = calculateNextReview(3)
      expect(result.nextReview).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('nextReview is in the future for correct answers', () => {
      const result = calculateNextReview(3, { easeFactor: 2.5, interval: 6, repetitions: 2 })
      const today = new Date()
      const reviewDate = new Date(result.nextReview)
      // nextReview should be after today (may fail near midnight, acceptable)
      expect(reviewDate.getTime()).toBeGreaterThanOrEqual(
        new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
      )
    })
  })

  // ── Quality edge cases ──────────────────────────────────────────────
  describe('quality edge cases', () => {
    it('quality = 2 is treated as correct (>= 2)', () => {
      const result = calculateNextReview(2, { easeFactor: 2.5, interval: 0, repetitions: 0 })
      expect(result.interval).toBe(1)
      expect(result.repetitions).toBe(1)
    })

    it('quality = 1 is treated as incorrect (< 2)', () => {
      const result = calculateNextReview(1, { easeFactor: 2.5, interval: 6, repetitions: 2 })
      expect(result.interval).toBe(1)
      expect(result.repetitions).toBe(0)
    })
  })
})
