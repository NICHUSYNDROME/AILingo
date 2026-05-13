import { useMemo } from 'react'
import HeatmapCalendar from './HeatmapCalendar'
import { getWeeklyStats } from '../utils/learningLog'
import { getLocalDateString } from '../utils/date'

function ProgressDashboard({
  language,
  uiText,
  knowledgePoints,
  getConfirmedCount,
  onStartQuiz,
}) {
  const weeklyStats = useMemo(() => getWeeklyStats(language), [language])

  const confirmedCount = useMemo(() => {
    return getConfirmedCount ? getConfirmedCount() : 0
  }, [getConfirmedCount])

  // Count points due for review: nextReview <= today or nextReview is null
  const dueForReviewCount = useMemo(() => {
    const todayStr = getLocalDateString()
    return knowledgePoints.filter((p) => {
      if (p.status === 'deleted') return false
      if (p.confirmed !== true) return false
      if (!p.nextReview) return true // null = never reviewed
      return p.nextReview <= todayStr
    }).length
  }, [knowledgePoints])

  // Button is disabled when there are zero due-for-review points
  const hasDueForReview = dueForReviewCount > 0

  return (
    <div className="progress-dashboard">
      <h3 className="progress-title">{uiText.learningProgress}</h3>

      <div className="progress-body">
        {/* Left column: Heatmap Calendar */}
        <div className="progress-left">
          <HeatmapCalendar language={language} />
        </div>

        {/* Divider */}
        <div className="progress-divider" />

        {/* Right column: Stats + Button */}
        <div className="progress-right">
          <div className="progress-right-inner">
            <div className="progress-stats">
              <div className="progress-stat-item">
                <span className="progress-stat-value">{weeklyStats.conversation}</span>
                <span className="progress-stat-label">{uiText.conversationsThisWeek}</span>
              </div>
              <div className="progress-stat-item">
                <span className="progress-stat-value">{confirmedCount}</span>
                <span className="progress-stat-label">{uiText.confirmedPoints}</span>
              </div>
              <div className="progress-stat-item">
                <span className="progress-stat-value">{dueForReviewCount}</span>
                <span className="progress-stat-label">{uiText.dueForReview}</span>
              </div>
            </div>

            <button
              className={`quiz-start-btn ${hasDueForReview ? '' : 'quiz-start-btn-disabled'}`}
              onClick={hasDueForReview ? onStartQuiz : undefined}
              disabled={!hasDueForReview}
              title={
                hasDueForReview
                  ? uiText.startQuiz
                  : (language === 'ja' ? '復習待ちはありません' : '暂无待复习')
              }
            >
              {hasDueForReview ? `📝 ${uiText.startQuiz}` : (language === 'ja' ? '復習待ちなし' : '暂无待复习')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProgressDashboard
