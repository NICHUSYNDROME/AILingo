/**
 * Learning Activity Log
 *
 * Records daily learning activities (conversation, knowledge confirmation, quiz)
 * to localStorage for display in the heatmap calendar and statistics dashboard.
 */

function getStorageKey(language) {
  return language === 'ja' ? 'ja_learning_log' : 'en_learning_log'
}

/**
 * Get today's date string in YYYY-MM-DD format.
 */
function getTodayKey() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Load the full learning log from localStorage.
 * @param {string} [language='en'] - Language key ('en' | 'ja')
 * @returns {Object} Keyed by 'YYYY-MM-DD', each value is { conversation, knowledge, quiz }
 */
function loadLog(language = 'en') {
  const STORAGE_KEY = getStorageKey(language)
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * Save the full learning log to localStorage.
 * @param {Object} log - The log object
 * @param {string} [language='en'] - Language key ('en' | 'ja')
 */
function saveLog(log, language = 'en') {
  const STORAGE_KEY = getStorageKey(language)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log))
  } catch {
    // storage full — silently ignore
  }
}

/**
 * Log an activity for today.
 *
 * @param {'conversation'|'knowledge'|'quiz'} type - Activity type
 * @param {number} count - Number of units to add (default: 1)
 * @param {string} [language='en'] - Language key ('en' | 'ja')
 */
export function logActivity(type, count = 1, language = 'en') {
  const today = getTodayKey()
  const log = loadLog(language)

  if (!log[today]) {
    log[today] = { conversation: 0, knowledge: 0, quiz: 0 }
  }

  if (type === 'conversation') {
    log[today].conversation += count
  } else if (type === 'knowledge') {
    log[today].knowledge += count
  } else if (type === 'quiz') {
    log[today].quiz += count
  }

  saveLog(log, language)
}

/**
 * Get activity data for a specific month.
 *
 * @param {number} year - Full year (e.g., 2026)
 * @param {number} month - Month (1-12)
 * @param {string} [language='en'] - Language key ('en' | 'ja')
 * @returns {Object} Activity data keyed by 'YYYY-MM-DD'
 */
export function getMonthlyData(year, month, language = 'en') {
  const log = loadLog(language)
  const result = {}

  // Determine the number of days in the month
  const daysInMonth = new Date(year, month, 0).getDate()

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    result[key] = log[key] || { conversation: 0, knowledge: 0, quiz: 0 }
  }

  return result
}

/**
 * Get the total activity count for a single day.
 * Used to determine heatmap color intensity.
 *
 * @param {Object} dayData - { conversation, knowledge, quiz }
 * @returns {number} Weighted total score
 */
export function getDayScore(dayData) {
  if (!dayData) return 0
  // Weight: conversation=1, knowledge=2, quiz=3
  return (
    (dayData.conversation || 0) * 1 +
    (dayData.knowledge || 0) * 2 +
    (dayData.quiz || 0) * 3
  )
}

/**
 * Get the total activity count for the current week (Mon-Sun).
 * @param {string} [language='en'] - Language key ('en' | 'ja')
 * @returns {{ conversation: number, knowledge: number, quiz: number }}
 */
export function getWeeklyStats(language = 'en') {
  const log = loadLog(language)
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon, ...
  // Calculate Monday of this week
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(monday.getDate() + mondayOffset)

  const stats = { conversation: 0, knowledge: 0, quiz: 0 }

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const dayData = log[key]
    if (dayData) {
      stats.conversation += dayData.conversation || 0
      stats.knowledge += dayData.knowledge || 0
      stats.quiz += dayData.quiz || 0
    }
  }

  return stats
}
