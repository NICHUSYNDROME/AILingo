/**
 * useProficiency — Per-language proficiency score management hook.
 *
 * Manages a single float (1.00–10.00) per language, persisted to
 * localStorage + Electron storage. Scores are NEVER rendered in UI;
 * they only appear in debug.proficiency() output and are injected
 * into AI system prompts for difficulty calibration.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { getItem, setItem } from '../utils/storage'
import { debug } from '../utils/debug'
import {
  DEFAULT_PROFICIENCY_SCORE,
  PROFICIENCY_STORAGE_KEYS,
} from '../config/proficiency'

/**
 * @param {string} language - 'en' | 'ja'
 * @returns {{ score: number, setScore: (s: number, reason?: string) => void, history: Array, isFirstTime: boolean }}
 */
export function useProficiency(language = 'en') {
  const storageKey = PROFICIENCY_STORAGE_KEYS[language] || PROFICIENCY_STORAGE_KEYS.en
  const historyKey = PROFICIENCY_STORAGE_KEYS[`${language}History`] || ''

  // ── Synchronous seed from localStorage (fast first render) ──────
  const [score, setScoreState] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw !== null) {
        const parsed = parseFloat(raw)
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) return parsed
      }
    } catch { /* fall through */ }
    return DEFAULT_PROFICIENCY_SCORE
  })

  const [history, setHistory] = useState([])
  const scoreEverPersisted = useRef(false)

  // ── Reconcile with Electron storage on mount / language change ──
  useEffect(() => {
    let cancelled = false
    async function load() {
      const saved = await getItem(storageKey)
      if (saved !== null && !cancelled) {
        const parsed = parseFloat(saved)
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
          setScoreState(parsed)
          scoreEverPersisted.current = true
        }
      } else if (!cancelled) {
        // No stored score for this language — reset to default
        setScoreState(DEFAULT_PROFICIENCY_SCORE)
        setHistory([])
        scoreEverPersisted.current = false
      }
      // Also check history to detect past assessments (for isFirstTime)
      const savedHistory = await getItem(historyKey)
      if (savedHistory && !cancelled) {
        try {
          const arr = JSON.parse(savedHistory)
          if (Array.isArray(arr) && arr.length > 0) {
            scoreEverPersisted.current = true
          }
        } catch { /* ignore */ }
      }
    }
    load()
    return () => { cancelled = true }
  }, [storageKey, historyKey])

  // ── Load history ────────────────────────────────────────────────
  useEffect(() => {
    if (!historyKey) return
    let cancelled = false
    async function loadHistory() {
      const saved = await getItem(historyKey)
      if (!cancelled && saved) {
        try {
          const arr = JSON.parse(saved)
          if (Array.isArray(arr)) setHistory(arr)
        } catch { /* ignore */ }
      }
    }
    loadHistory()
    return () => { cancelled = true }
  }, [historyKey])

  // ── Set score ────────────────────────────────────────────────────
  const setScore = useCallback((newScore, reason = 'manual') => {
    const clamped = Math.max(1, Math.min(10, newScore))
    const rounded = Math.round(clamped * 100) / 100

    // Mark as having been assessed
    scoreEverPersisted.current = true

    setScoreState((prev) => {
      const delta = Math.round((rounded - prev) * 100) / 100
      const direction = delta > 0.01 ? 'up' : delta < -0.01 ? 'down' : 'same'

      // Persist score immediately
      localStorage.setItem(storageKey, String(rounded))
      setItem(storageKey, String(rounded))

      // Log to debug only
      debug.proficiency(
        `[Proficiency] ${language.toUpperCase()} score: ${prev.toFixed(2)} → ${rounded.toFixed(2)} ` +
        `(${direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→'} ${Math.abs(delta).toFixed(2)}) — ${reason}`
      )

      // Append to history (async, keep last 100 entries)
      const entry = {
        date: new Date().toISOString(),
        score: rounded,
        delta,
        direction,
        reason,
      }
      setHistory((prevHistory) => {
        const updated = [...prevHistory, entry].slice(-100)
        if (historyKey) {
          localStorage.setItem(historyKey, JSON.stringify(updated))
          setItem(historyKey, JSON.stringify(updated))
        }
        return updated
      })

      return rounded
    })
  }, [storageKey, historyKey, language])

  return { score, setScore, history, isFirstTime: !scoreEverPersisted.current && history.length === 0,
    resetScore: () => {
      localStorage.removeItem(storageKey)
      localStorage.removeItem(historyKey)
      setItem(storageKey, null)
      setItem(historyKey, null)
      setScoreState(DEFAULT_PROFICIENCY_SCORE)
      setHistory([])
      scoreEverPersisted.current = false
      debug.proficiency(`[Proficiency] ${language.toUpperCase()} score reset to default ${DEFAULT_PROFICIENCY_SCORE}`)
    }
  }
}
