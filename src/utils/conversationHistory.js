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
  if (idx === -1) return // not found, do nothing
  list[idx] = session
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
