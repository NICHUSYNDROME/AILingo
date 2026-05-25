import { useState, useCallback, useEffect, useRef } from 'react'
import { getItem, setItem } from '../utils/storage'
import { debug } from '../utils/debug'
import { getLocalDateString } from '../utils/date'

// ── Debounced persistence ────────────────────────────────────────────
const SAVE_DELAY = 300 // ms

function getStorageKey(language) {
  return language === 'ja' ? 'ja_knowledge_points' : 'en_knowledge_points'
}

/**
 * Synchronous load from localStorage (fast first-render seed).
 */
function loadFromStorage(language) {
  const STORAGE_KEY = getStorageKey(language)
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const points = JSON.parse(raw)
      if (!Array.isArray(points)) return []
      debug.log(`[useKnowledgePoints] 从 localStorage 加载知识点 (${STORAGE_KEY})，数量:`, points.length)
      // Data migration: ensure all old data has meaningChinese and phonetic fields
      let needsSave = false
      const migrated = points.map((p) => {
        let updated = { ...p }
        if (updated.meaningChinese === undefined) {
          needsSave = true
          updated.meaningChinese = ''
        }
        if (updated.phonetic === undefined) {
          needsSave = true
          updated.phonetic = ''
        }
        return updated
      })
      if (needsSave) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
          debug.log('[useKnowledgePoints] 数据迁移完成：为旧数据补充 meaningChinese/phonetic 字段')
        } catch {
          // storage full — silently ignore
        }
      }
      return Array.isArray(migrated) ? migrated : []
    }
  } catch (e) {
    debug.error('[useKnowledgePoints] 加载知识点失败:', e)
  }
  return []
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function useKnowledgePoints(language = 'en') {
  const [knowledgePoints, setKnowledgePoints] = useState(() => {
    const loaded = loadFromStorage(language)
    debug.log('[useKnowledgePoints] 初始化，加载知识点数:', loaded.length)
    return loaded
  })

  // ── Debounced persistence ──────────────────────────────────────
  const storageKeyRef = useRef(getStorageKey(language))
  const saveTimerRef = useRef(null)
  const unmountedRef = useRef(false)

  /** Immediately persist current points to localStorage + schedule Electron flush.
   *  Only confirmed (kept) points are persisted; unconfirmed and deleted are discarded. */
  const persistNow = useCallback((points) => {
    const key = storageKeyRef.current
    const confirmed = points.filter(p => p.confirmed === true && p.status !== 'deleted')
    try {
      localStorage.setItem(key, JSON.stringify(confirmed))
    } catch (e) {
      debug.error('[useKnowledgePoints] 保存到 localStorage 失败:', e)
    }
    // Async write to Electron (debounced via storage.js)
    setItem(key, JSON.stringify(confirmed)).catch((e) => {
      debug.error('[useKnowledgePoints] 保存到 Electron 存储失败:', e)
    })
  }, [])

  /** Schedule a debounced persist. Merges rapid mutations into one write. */
  const schedulePersist = useCallback((points) => {
    if (unmountedRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      persistNow(points)
    }, SAVE_DELAY)
  }, [persistNow])

  // Flush any pending save on unmount
  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [])

  // ── Reload data when language changes ─────────────────────────
  // Update storageKey reference
  useEffect(() => {
    storageKeyRef.current = getStorageKey(language)
  }, [language])

  // When language changes, reload from localStorage immediately and
  // then reconcile with Electron storage (safety net).
  useEffect(() => {
    let cancelled = false

    async function reloadForLanguage() {
      // 1) Load from localStorage for the NEW language (synchronous, instant).
      const localData = loadFromStorage(language)

      if (cancelled) return

      // 2) Also try Electron storage for the new language.
      const key = getStorageKey(language)
      const stored = await getItem(key)

      let resolved = localData
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed)) {
            // Prefer Electron data; fall back to localStorage if Electron is empty.
            resolved = parsed.length > 0 ? parsed : localData
          }
        } catch {
          // ignore parse errors, keep localStorage data
        }
      }

      if (cancelled) return

      setKnowledgePoints(resolved)
    }

    reloadForLanguage()

    return () => {
      cancelled = true
    }
  }, [language])

  const addPoint = useCallback((data) => {
    debug.log('[addPoint] Received phonetic:', data.phonetic, 'type:', data.type)

    const meaningChinese = (data.meaningChinese || '').trim()

    let examples = data.examples
    if (!examples && data.example) {
      examples = [data.example]
    }
    if (!Array.isArray(examples)) {
      examples = []
    }

    const pointType = data.type || 'word'
    let phonetic = data.phonetic || ''
    if (pointType === 'grammar' || pointType === 'collocation') {
      phonetic = ''
    }
    if (pointType === 'word' && !phonetic) {
      debug.warn(`[addPoint] ⚠️  type is "word" but phonetic is empty for: "${data.word}"`)
    }

    const point = {
      id: generateId(),
      type: pointType,
      word: data.word || '',
      meaning: data.meaning || '',
      meaningChinese,
      phonetic,
      context: data.context || '',
      sourceMessageId: data.sourceMessageId || '',
      partOfSpeech: data.partOfSpeech || '',
      pattern: data.pattern || '',
      examples,
      notes: data.notes || '',
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      nextReview: getLocalDateString(),
      status: 'active',
      confirmed: false,
      createdAt: new Date().toISOString(),
    }
    setKnowledgePoints((prev) => {
      const normalizedWord = point.word.toLowerCase().trim()
      const existing = prev.find(
        (p) =>
          p.word.toLowerCase().trim() === normalizedWord &&
          p.status !== 'deleted'
      )
      if (existing && (data.source === 'spelling_correction' || data.source === 'grammar_correction')) {
        const updatedPoint = {
          ...existing,
          repetitions: (existing.repetitions || 0) + 0.5,
          easeFactor: Math.max(1.3, (existing.easeFactor || 2.5) - 0.1),
          nextReview: getLocalDateString(),
          ...(data.meaning ? { meaning: data.meaning } : {}),
          ...(data.meaningChinese ? { meaningChinese: data.meaningChinese } : {}),
          ...(data.phonetic ? { phonetic: data.phonetic } : {}),
        }
        const updated = prev.map(p => p.id === existing.id ? updatedPoint : p)
        schedulePersist(updated)
        debug.log(`[useKnowledgePoints] 知识点已存在，调整掌握程度: ${point.word}`)
        return updated
      }
      const updated = [point, ...prev]
      schedulePersist(updated)
      debug.log('[useKnowledgePoints] 添加知识点，当前总数:', updated.length)
      return updated
    })
    return point
  }, [schedulePersist])

  const deletePoint = useCallback((id) => {
    setKnowledgePoints((prev) => {
      const updated = prev.map((p) =>
        p.id === id ? { ...p, status: 'deleted' } : p
      )
      schedulePersist(updated)
      debug.log('[useKnowledgePoints] 删除知识点，当前总数:', updated.length)
      return updated
    })
  }, [schedulePersist])

  const markMastered = useCallback((id) => {
    setKnowledgePoints((prev) => {
      const updated = prev.map((p) =>
        p.id === id ? { ...p, status: 'mastered' } : p
      )
      schedulePersist(updated)
      debug.log('[useKnowledgePoints] 标记已掌握，当前总数:', updated.length)
      return updated
    })
  }, [schedulePersist])

  const confirmPoint = useCallback((id) => {
    setKnowledgePoints((prev) => {
      const updated = prev.map((p) =>
        p.id === id ? { ...p, confirmed: true } : p
      )
      schedulePersist(updated)
      debug.log('[useKnowledgePoints] 确认知识点，当前总数:', updated.length)
      return updated
    })
  }, [schedulePersist])

  const searchPoints = useCallback((query) => {
    if (!query.trim()) return knowledgePoints
    const q = query.toLowerCase()
    return knowledgePoints.filter(
      (p) =>
        p.word.toLowerCase().includes(q) ||
        p.meaning.toLowerCase().includes(q) ||
        p.context.toLowerCase().includes(q)
    )
  }, [knowledgePoints])

  const sortPoints = useCallback(
    (method) => {
      const sorted = [...knowledgePoints]
      switch (method) {
        case 'alphabet':
          sorted.sort((a, b) => a.word.localeCompare(b.word))
          break
        case 'difficulty':
          sorted.sort((a, b) => a.easeFactor - b.easeFactor)
          break
        case 'recent':
          sorted.sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
          )
          break
        case 'mastery': {
          const order = { active: 0, mastered: 1, deleted: 2 }
          sorted.sort((a, b) => order[a.status] - order[b.status])
          break
        }
        default:
          break
      }
      return sorted
    },
    [knowledgePoints]
  )

  const getPointById = useCallback(
    (id) => knowledgePoints.find((p) => p.id === id) || null,
    [knowledgePoints]
  )

  const getConfirmedCount = useCallback(() => {
    return knowledgePoints.filter(
      (p) => p.confirmed === true && p.status !== 'deleted'
    ).length
  }, [knowledgePoints])

  const updatePoint = useCallback((id, fields) => {
    setKnowledgePoints((prev) => {
      const updated = prev.map((p) =>
        p.id === id
          ? { ...p, ...fields }
          : p
      )
      schedulePersist(updated)
      debug.log('[useKnowledgePoints] 更新知识点字段，当前总数:', updated.length)
      return updated
    })
  }, [schedulePersist])

  const updatePointReview = useCallback((id, reviewData) => {
    setKnowledgePoints((prev) => {
      const updated = prev.map((p) =>
        p.id === id
          ? {
              ...p,
              easeFactor: reviewData.easeFactor,
              interval: reviewData.interval,
              repetitions: reviewData.repetitions,
              nextReview: reviewData.nextReview,
            }
          : p
      )
      schedulePersist(updated)
      debug.log('[useKnowledgePoints] 更新复习数据，当前总数:', updated.length)
      return updated
    })
  }, [schedulePersist])

  return {
    knowledgePoints,
    addPoint,
    deletePoint,
    markMastered,
    confirmPoint,
    searchPoints,
    sortPoints,
    getPointById,
    getConfirmedCount,
    updatePointReview,
    updatePoint,
  }
}
