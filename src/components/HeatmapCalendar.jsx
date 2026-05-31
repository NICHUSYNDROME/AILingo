import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getMonthlyData, getDayScore } from '../utils/learningLog'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Get color for a given score using CSS variables for theme support.
 * Score ranges: 0 → light gray, 1-2 → light blue, 3-5 → medium blue, 6+ → dark blue
 */
function getColor(score) {
  if (score === 0) return 'var(--heatmap-empty)'
  if (score <= 2) return 'var(--heatmap-level1)'
  if (score <= 5) return 'var(--heatmap-level2)'
  if (score <= 10) return 'var(--heatmap-level3)'
  return 'var(--heatmap-level4)'
}

function HeatmapCalendar({ language = 'en', onDateClick = null, selectedDate = null }) {
  const { t } = useTranslation()
  const now = new Date()
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1) // 1-12

  const monthlyData = useMemo(
    () => getMonthlyData(currentYear, currentMonth, language),
    [currentYear, currentMonth, language]
  )

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay() // 0=Sun

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const cells = []

    // Empty cells before the first day
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push(null)
    }

    // Actual days
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dayData = monthlyData[key] || { conversation: 0, knowledge: 0, quiz: 0 }
      const score = getDayScore(dayData)
      const isToday = (() => {
        const today = new Date()
        return (
          today.getFullYear() === currentYear &&
          today.getMonth() + 1 === currentMonth &&
          today.getDate() === day
        )
      })()

      cells.push({ day, key, score, isToday })
    }

    return cells
  }, [monthlyData, currentYear, currentMonth, daysInMonth, firstDayOfWeek])

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear((y) => y - 1)
      setCurrentMonth(12)
    } else {
      setCurrentMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear((y) => y + 1)
      setCurrentMonth(1)
    } else {
      setCurrentMonth((m) => m + 1)
    }
  }

  const CELL_STYLE = {
    width: 28,
    height: 28,
    minWidth: 28,
    minHeight: 28,
    maxWidth: 28,
    maxHeight: 28,
    flexShrink: 0,
    flexGrow: 0,
  }

  return (
    <div className="heatmap-calendar">
      {/* Month navigation */}
      <div className="heatmap-header">
        <button
          className="heatmap-nav-btn"
          onClick={handlePrevMonth}
          style={{ width: 16, height: 16, flexShrink: 0, flexGrow: 0, fontSize: 11, padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ←
        </button>
        <span className="heatmap-month-label">
          {MONTH_NAMES[currentMonth - 1]} {currentYear}
        </span>
        <button
          className="heatmap-nav-btn"
          onClick={handleNextMonth}
          style={{ width: 16, height: 16, flexShrink: 0, flexGrow: 0, fontSize: 11, padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          →
        </button>
      </div>

      {/* Day-of-week labels */}
      <div className="heatmap-weekdays">
        {DAY_NAMES.map((name) => (
          <div key={name} className="heatmap-weekday-label" style={{ height: 14, lineHeight: '14px', fontSize: 8 }}>
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="heatmap-grid">
        {calendarDays.map((cell, i) => {
          if (!cell) {
            return (
              <div
                key={`empty-${i}`}
                className="heatmap-cell empty"
                style={CELL_STYLE}
              />
            )
          }
          return (
            <div
              key={cell.key}
              className={`heatmap-cell ${cell.isToday ? 'heatmap-today' : ''} ${cell.score > 0 ? 'heatmap-clickable' : ''} ${selectedDate === cell.key ? 'heatmap-selected' : ''}`}
              style={{
                ...CELL_STYLE,
                backgroundColor: getColor(cell.score),
              }}
              title={`${cell.key}: ${cell.score} ${t('heatmapActivities')}`}
              onClick={cell.score > 0 && onDateClick ? () => onDateClick(cell.key) : undefined}
            />
          )
        })}
      </div>

      {/* Legend */}
      <div className="heatmap-legend" style={{ height: 16, maxHeight: 16 }}>
        <span className="heatmap-legend-label" style={{ fontSize: 8, lineHeight: 1 }}>{t('heatmapLess')}</span>
        <span className="heatmap-legend-swatch" style={{ width: 8, height: 8, minWidth: 8, minHeight: 8, backgroundColor: 'var(--heatmap-empty)', flexShrink: 0, flexGrow: 0 }} />
        <span className="heatmap-legend-swatch" style={{ width: 8, height: 8, minWidth: 8, minHeight: 8, backgroundColor: 'var(--heatmap-level1)', flexShrink: 0, flexGrow: 0 }} />
        <span className="heatmap-legend-swatch" style={{ width: 8, height: 8, minWidth: 8, minHeight: 8, backgroundColor: 'var(--heatmap-level2)', flexShrink: 0, flexGrow: 0 }} />
        <span className="heatmap-legend-swatch" style={{ width: 8, height: 8, minWidth: 8, minHeight: 8, backgroundColor: 'var(--heatmap-level3)', flexShrink: 0, flexGrow: 0 }} />
        <span className="heatmap-legend-swatch" style={{ width: 8, height: 8, minWidth: 8, minHeight: 8, backgroundColor: 'var(--heatmap-level4)', flexShrink: 0, flexGrow: 0 }} />
        <span className="heatmap-legend-label" style={{ fontSize: 8, lineHeight: 1 }}>{t('heatmapMore')}</span>
      </div>
    </div>
  )
}

export default HeatmapCalendar
