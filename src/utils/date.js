/**
 * Date utility functions using local timezone.
 *
 * All date strings in this project use "YYYY-MM-DD" format in the user's local
 * timezone (Asia/Shanghai, UTC+8).  Using raw `new Date().toISOString().split('T')[0]`
 * would give the UTC date, which can be one day behind the local date (e.g. 01:00
 * Beijing time is still the previous day in UTC).
 */

/**
 * Get today's date string in YYYY-MM-DD format using the local timezone.
 * @returns {string} e.g. "2026-05-12"
 */
export function getLocalDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get a date string for a Date object in YYYY-MM-DD format using the local timezone.
 * @param {Date} date
 * @returns {string} e.g. "2026-05-12"
 */
export function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
