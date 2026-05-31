/**
 * Conversation History Storage
 *
 * Persists completed/interrupted conversation sessions to localStorage
 * (with Electron file sync via the unified storage module).
 *
 * Data model per session — see /memories/session/plan.md.
 *
 * Cap: 50 sessions per language; oldest evicted on overflow.
 */

import { getItem, setItem } from './storage'
import { debug } from './debug'
import { formatLocalDate } from './date'

const MAX_SESSIONS = 50

function getStorageKey(language) {
  return language === 'ja' ? 'ja_conversation_history' : 'en_conversation_history'
}

/** Synchronous load from localStorage. */
function loadFromStorage(language) {
  const key = getStorageKey(language)
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr
    }
  } catch (e) {
    debug.error('[conversationHistory] 加载失败:', e)
  }
  return []
}

/**
 * Save a conversation session.
 * Prepends to the array, truncates to MAX_SESSIONS, writes synchronously
 * to localStorage and schedules an async Electron file flush.
 *
 * @param {string} language - 'en' | 'ja'
 * @param {object} session - Full session snapshot
 */
export function saveConversation(language, session) {
  const key = getStorageKey(language)
  const list = loadFromStorage(language)

  // Prepend new session
  list.unshift(session)

  // Evict oldest if over cap
  if (list.length > MAX_SESSIONS) {
    list.length = MAX_SESSIONS
  }

  const json = JSON.stringify(list)
  try {
    localStorage.setItem(key, json)
  } catch {
    // storage full — trim more aggressively
    const trimmed = list.slice(0, Math.floor(MAX_SESSIONS / 2))
    try {
      localStorage.setItem(key, JSON.stringify(trimmed))
    } catch {
      // give up
    }
  }

  // Schedule Electron file sync (non-blocking)
  setItem(key, json).catch(() => {})
}

/**
 * Update an existing conversation session by ID.
 * Replaces the session with new data (same position in array).
 *
 * @param {string} language - 'en' | 'ja'
 * @param {object} session - Updated session (must have `id` matching existing)
 */
export function updateConversation(language, session) {
  const key = getStorageKey(language)
  const list = loadFromStorage(language)
  const idx = list.findIndex((s) => s.id === session.id)
  debug.log(`[updateConversation] 语言=${language} id=${session.id} 找到索引=${idx} endedNormally=${session.endedNormally} continueFromId=${session.continueFromId}`)
  if (idx === -1) {
    debug.warn(`[updateConversation] 未找到 id=${session.id}，尝试 saveConversation 兜底`)
    // 兜底：保存为新记录
    saveConversation(language, session)
    return
  }
  // 替换第一个匹配项，并移除多余的重复项（防止 StrictMode 等场景残留重复）
  list[idx] = session
  for (let i = list.length - 1; i > idx; i--) {
    if (list[i].id === session.id) {
      debug.warn(`[updateConversation] 移除重复记录 id=${session.id} at index=${i}`)
      list.splice(i, 1)
    }
  }
  const json = JSON.stringify(list)
  try {
    localStorage.setItem(key, json)
  } catch { /* ignore */ }
  setItem(key, json).catch(() => {})
}

/**
 * Load all conversation sessions for a language (newest first).
 *
 * @param {string} language
 * @returns {Array} Session objects, newest first
 */
export function loadConversations(language) {
  return loadFromStorage(language)
}

/**
 * Get a single conversation by ID.
 *
 * @param {string} language
 * @param {string} id
 * @returns {object|null}
 */
export function getConversationById(language, id) {
  const list = loadFromStorage(language)
  return list.find((s) => s.id === id) || null
}

/**
 * Get conversations for a specific date.
 *
 * @param {string} language
 * @param {string} dateKey - 'YYYY-MM-DD'
 * @returns {Array}
 */
export function getConversationsByDate(language, dateKey) {
  const list = loadFromStorage(language)
  return list.filter((s) => s.date === dateKey)
}

/**
 * Delete a conversation by ID.
 *
 * @param {string} language
 * @param {string} id
 */
export function deleteConversation(language, id) {
  const key = getStorageKey(language)
  const list = loadFromStorage(language)
  const filtered = list.filter((s) => s.id !== id)
  const json = JSON.stringify(filtered)
  try {
    localStorage.setItem(key, json)
  } catch { /* ignore */ }
  setItem(key, json).catch(() => {})
}

/**
 * Count conversations per day in a given month.
 * @returns {Object} keyed by 'YYYY-MM-DD', each value is a count
 */
export function getMonthlyConversationCount(year, month, language) {
  const list = loadFromStorage(language)
  const daysInMonth = new Date(year, month, 0).getDate()
  const result = {}
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    result[key] = 0
  }
  for (const conv of list) {
    if (conv.date && result[conv.date] !== undefined) {
      result[conv.date]++
    }
  }
  return result
}

/**
 * Count total conversations this week (Mon-Sun).
 * @returns {number}
 */
export function getWeeklyConversationCount(language) {
  const list = loadFromStorage(language)
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(monday.getDate() + mondayOffset)
  const weekDates = new Set()
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    weekDates.add(formatLocalDate(d))
  }
  let count = 0
  for (const conv of list) {
    if (conv.date && weekDates.has(conv.date)) {
      count++
    }
  }
  return count
}
