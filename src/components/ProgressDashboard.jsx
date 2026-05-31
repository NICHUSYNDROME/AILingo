import { useMemo, memo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import HeatmapCalendar from './HeatmapCalendar'
import { loadConversations, getConversationsByDate, deleteConversation, getWeeklyConversationCount } from '../utils/conversationHistory'

const ProgressDashboard = memo(function ProgressDashboard({
  language,
  getConfirmedCount,
  dueForReviewCount,
  onStartQuiz,
  onContinueConversation,
}) {
  const { t } = useTranslation()

  const [selectedDate, setSelectedDate] = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  // Force re-render when conversations change (delete)
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const weeklyConversationCount = useMemo(() => getWeeklyConversationCount(language), [language, refreshKey])

  const confirmedCount = useMemo(() => {
    return getConfirmedCount ? getConfirmedCount() : 0
  }, [getConfirmedCount])

  // Load conversations, filtered by selectedDate if any
  const conversations = useMemo(() => {
    if (selectedDate) {
      return getConversationsByDate(language, selectedDate)
    }
    return loadConversations(language)
  }, [language, selectedDate, refreshKey])

  const handleDateClick = useCallback((dateKey) => {
    setSelectedDate((prev) => (prev === dateKey ? null : dateKey))
  }, [])

  const handleDelete = useCallback((id) => {
    deleteConversation(language, id)
    setDeleteConfirmId(null)
    refresh()
  }, [language, refresh])

  // Button is disabled when there are zero due-for-review points
  const hasDueForReview = dueForReviewCount > 0

  return (
    <div className="progress-dashboard">
      <h3 className="progress-title">{t('learningProgress')}</h3>

      <div className="progress-body">
        {/* Left column: Heatmap Calendar */}
        <div className="progress-left">
          <HeatmapCalendar
            language={language}
            onDateClick={handleDateClick}
            selectedDate={selectedDate}
            refreshKey={refreshKey}
          />
        </div>

        {/* Divider */}
        <div className="progress-divider" />

        {/* Right column: Stats + Button */}
        <div className="progress-right">
          <div className="progress-right-inner">
            <div className="progress-stats">
              <div className="progress-stat-item">
                <span className="progress-stat-value">{weeklyConversationCount}</span>
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

      {/* ── 对话历史列表 ──────────────────────────────────────── */}
      <div className="conversation-history-section">
        <div className="conversation-history-header">
          <h4 className="conversation-history-title">{t('conversationHistory')}</h4>
          {selectedDate && (
            <button className="conversation-history-filter-clear" onClick={() => setSelectedDate(null)}>
              ✕ {selectedDate}
            </button>
          )}
        </div>

        {conversations.length === 0 ? (
          <p className="conversation-history-empty">{t('noConversations')}</p>
        ) : (
          <div className="conversation-history-list" key={refreshKey}>
            {conversations.map((conv) => {
              const totalTasks = conv.todos?.length || 0
              const timeStr = new Date(conv.timestamp).toLocaleString()

              return (
                <div
                  key={conv.id}
                  className={`conversation-history-item ${conv.endedNormally ? '' : 'conversation-interrupted'}`}
                  onClick={() => onContinueConversation?.(conv)}
                >
                  <div className="conversation-history-item-main">
                    <div className="conversation-history-item-top">
                      <span className="conversation-history-scenario">🏷 {conv.scenarioLabel || conv.scenario}</span>
                      <span className="conversation-history-time">{timeStr}</span>
                    </div>
                    <div className="conversation-history-item-bottom">
                      {totalTasks > 0 ? (
                        <div className="conv-history-todo-items">
                          {conv.todos.map((task, i) => (
                            <div key={i} className={`conv-history-todo-item ${task.completed ? 'completed' : ''}`}>
                              <span className="conv-history-todo-checkbox">{task.completed ? '☑' : '☐'}</span>
                              <span className="conv-history-todo-text">{task.text}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className={`conversation-history-status ${conv.endedNormally ? 'status-completed' : 'status-interrupted'}`}>
                          {conv.endedNormally
                            ? t('conversationCompleted')
                            : t('conversationInterrupted')
                          }
                        </span>
                      )}
                      <span className="conversation-history-rounds">
                        🔄 {conv.roundCount}/{conv.maxRounds}
                      </span>
                    </div>
                  </div>
                  <button
                    className="conversation-history-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteConfirmId(conv.id)
                    }}
                    title={t('deleteConversation')}
                  >
                    🗑
                  </button>

                  {/* Delete confirmation */}
                  {deleteConfirmId === conv.id && (
                    <div className="conversation-history-delete-confirm" onClick={(e) => e.stopPropagation()}>
                      <span>{t('confirmDeleteConversation')}</span>
                      <button onClick={() => handleDelete(conv.id)}>✓</button>
                      <button onClick={() => setDeleteConfirmId(null)}>✕</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
})

export default ProgressDashboard
