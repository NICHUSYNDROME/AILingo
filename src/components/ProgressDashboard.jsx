import { useMemo, memo } from 'react'
import { useTranslation } from 'react-i18next'
import HeatmapCalendar from './HeatmapCalendar'
import { getWeeklyStats } from '../utils/learningLog'

const ProgressDashboard = memo(function ProgressDashboard({
  language,
  getConfirmedCount,
  dueForReviewCount,
  onStartQuiz,
}) {
  const { t } = useTranslation()
  const weeklyStats = useMemo(() => getWeeklyStats(language), [language])

  const confirmedCount = useMemo(() => {
    return getConfirmedCount ? getConfirmedCount() : 0
  }, [getConfirmedCount])

  // Button is disabled when there are zero due-for-review points
  const hasDueForReview = dueForReviewCount > 0

  return (
    <div className="progress-dashboard">
      <h3 className="progress-title">{t('learningProgress')}</h3>

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
                <span className="progress-stat-label">{t('conversationsThisWeek')}</span>
              </div>
              <div className="progress-stat-item">
                <span className="progress-stat-value">{confirmedCount}</span>
                <span className="progress-stat-label">{t('confirmedPoints')}</span>
              </div>
              <div className="progress-stat-item">
                <span className="progress-stat-value">{dueForReviewCount}</span>
                <span className="progress-stat-label">{t('dueForReview')}</span>
              </div>
            </div>

            <button
              className={`quiz-start-btn ${hasDueForReview ? '' : 'quiz-start-btn-disabled'}`}
              onClick={hasDueForReview ? onStartQuiz : undefined}
              disabled={!hasDueForReview}
              title={
                hasDueForReview
                  ? t('startQuiz')
                  : t('noDueForReviewTitle')
              }
            >
              {hasDueForReview ? `📝 ${t('startQuiz')}` : t('noDueForReviewLabel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})

export default ProgressDashboard
