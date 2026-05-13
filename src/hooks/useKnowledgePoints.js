import { useState, useCallback } from 'react'
import { getLocalDateString } from '../utils/date'

function getStorageKey(language) {
  return language === 'ja' ? 'ja_knowledge_points' : 'en_knowledge_points'
}

function loadFromStorage(language) {
  const STORAGE_KEY = getStorageKey(language)
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const points = JSON.parse(raw)
      console.log(`[useKnowledgePoints] 从 localStorage 加载知识点 (${STORAGE_KEY})，数量:`, points.length)
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
          console.log('[useKnowledgePoints] 数据迁移完成：为旧数据补充 meaningChinese/phonetic 字段')
        } catch {
          // storage full — silently ignore
        }
      }
      return Array.isArray(migrated) ? migrated : []
    }
  } catch (e) {
    console.error('[useKnowledgePoints] 加载知识点失败:', e)
  }
  return []
}

function saveToStorage(points, language) {
  const STORAGE_KEY = getStorageKey(language)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(points))
    console.log(`[useKnowledgePoints] 知识点已保存到 localStorage (${STORAGE_KEY})，数量:`, points.length)
  } catch (e) {
    console.error('[useKnowledgePoints] 保存知识点失败:', e)
  }
}

function generateId() {
  // Simple UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function useKnowledgePoints(language = 'en') {
  const [knowledgePoints, setKnowledgePoints] = useState(() => {
    const loaded = loadFromStorage(language)
    console.log('[useKnowledgePoints] 初始化，加载知识点数:', loaded.length)
    return loaded
  })

  const addPoint = useCallback((data) => {
    // Debug: log received phonetic value
    console.log('[addPoint] Received phonetic:', data.phonetic, 'type:', data.type)

    // === 兜底检查：如果 meaningChinese 为空或只有空白字符，不添加该知识点 ===
    // 例外：source 为 'spelling_correction' 或 'grammar_correction' 的知识点允许跳过此检查
    const meaningChinese = (data.meaningChinese || '').trim()
    if (!meaningChinese && data.source !== 'spelling_correction' && data.source !== 'grammar_correction') {
      console.warn(`[useKnowledgePoints] 知识点 "${data.word || 'unknown'}" 的中文释义为空，跳过添加`)
      return null
    }

    // Normalize: API now returns "example" (string), but old code expects "examples" (array)
    let examples = data.examples
    if (!examples && data.example) {
      examples = [data.example]
    }
    if (!Array.isArray(examples)) {
      examples = []
    }

    const pointType = data.type || 'word'

    // Phonetic only applies to word and phrase types
    let phonetic = data.phonetic || ''
    if (pointType === 'grammar' || pointType === 'collocation') {
      phonetic = ''
    }

    // Warn if type is word and phonetic is empty
    if (pointType === 'word' && !phonetic) {
      console.warn(`[addPoint] ⚠️  type is "word" but phonetic is empty for: "${data.word}"`)
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
      nextReview: getLocalDateString(), // today, immediately enters review queue
      status: 'active',
      confirmed: false,
      createdAt: new Date().toISOString(),
    }
    let added = false
    let existingId = null
    setKnowledgePoints((prev) => {
      // Dedup by word (lowercase + trim) — ignore type/context differences
      const normalizedWord = point.word.toLowerCase().trim()
      const existing = prev.find(
        (p) =>
          p.word.toLowerCase().trim() === normalizedWord &&
          p.status !== 'deleted'
      )
      if (existing) {
        // 对于 spelling_correction / grammar_correction 来源的重复知识点，调整掌握程度
        if (data.source === 'spelling_correction' || data.source === 'grammar_correction') {
          const updatedPoint = {
            ...existing,
            repetitions: (existing.repetitions || 0) + 0.5,
            easeFactor: Math.max(1.3, (existing.easeFactor || 2.5) - 0.1),
            nextReview: getLocalDateString(),
            // 如果占位知识点被查词补全了，保留已补全的信息
            ...(data.meaning ? { meaning: data.meaning } : {}),
            ...(data.meaningChinese ? { meaningChinese: data.meaningChinese } : {}),
            ...(data.phonetic ? { phonetic: data.phonetic } : {}),
          }
          const updated = prev.map(p => p.id === existing.id ? updatedPoint : p)
          saveToStorage(updated, language)
          console.log(`[useKnowledgePoints] 知识点已存在，调整掌握程度: ${point.word} (repetitions=${updatedPoint.repetitions}, easeFactor=${updatedPoint.easeFactor})`)
          existingId = existing.id
          return updated
        }
        // 其他来源：原有逻辑，直接跳过
        console.log(`[useKnowledgePoints] 知识点已存在，跳过: ${point.word}`)
        return prev
      }
      added = true
      const updated = [point, ...prev]
      saveToStorage(updated, language)
      console.log('[useKnowledgePoints] 添加知识点，当前总数:', updated.length)
      return updated
    })
    // 返回添加的知识点或其 id（用于后续更新）
    if (existingId) {
      return { id: existingId }
    }
    return added ? point : null
  }, [language])

  const deletePoint = useCallback((id) => {
    setKnowledgePoints((prev) => {
      const updated = prev.map((p) =>
        p.id === id ? { ...p, status: 'deleted' } : p
      )
      saveToStorage(updated, language)
      console.log('[useKnowledgePoints] 删除知识点，当前总数:', updated.length)
      return updated
    })
  }, [language])

  const markMastered = useCallback((id) => {
    setKnowledgePoints((prev) => {
      const updated = prev.map((p) =>
        p.id === id ? { ...p, status: 'mastered' } : p
      )
      saveToStorage(updated, language)
      console.log('[useKnowledgePoints] 标记已掌握，当前总数:', updated.length)
      return updated
    })
  }, [language])

  const confirmPoint = useCallback((id) => {
    setKnowledgePoints((prev) => {
      const updated = prev.map((p) =>
        p.id === id ? { ...p, confirmed: true } : p
      )
      saveToStorage(updated, language)
      console.log('[useKnowledgePoints] 确认知识点，当前总数:', updated.length)
      return updated
    })
  }, [language])

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
          // Sort by easeFactor ascending (lower = harder to remember)
          sorted.sort((a, b) => a.easeFactor - b.easeFactor)
          break
        case 'recent':
          sorted.sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
          )
          break
        case 'mastery':
          // active first, then mastered, then deleted
          const order = { active: 0, mastered: 1, deleted: 2 }
          sorted.sort((a, b) => order[a.status] - order[b.status])
          break
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

  /**
   * Update a knowledge point's SM-2 review data after a quiz.
   *
   * @param {string} id - Knowledge point ID
   * @param {Object} reviewData - { easeFactor, interval, repetitions, nextReview }
   */
  /**
   * Update a knowledge point's fields (used for async completion of meaning/phonetic etc.)
   *
   * @param {string} id - Knowledge point ID
   * @param {Object} fields - Partial fields to update (e.g. { meaning, meaningChinese, phonetic })
   */
  const updatePoint = useCallback((id, fields) => {
    setKnowledgePoints((prev) => {
      const updated = prev.map((p) =>
        p.id === id
          ? { ...p, ...fields }
          : p
      )
      saveToStorage(updated, language)
      console.log('[useKnowledgePoints] 更新知识点字段，当前总数:', updated.length)
      return updated
    })
  }, [language])

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
      saveToStorage(updated, language)
      console.log('[useKnowledgePoints] 更新复习数据，当前总数:', updated.length)
      return updated
    })
  }, [language])

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
