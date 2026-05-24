import { Suspense, memo, lazy } from 'react'
import Layout from './components/Layout'
import ScenarioSetup from './components/ScenarioSetup'
import KnowledgeSidebar from './components/KnowledgeSidebar'
import LookUpPanel from './components/LookUpPanel'
import ProgressDashboard from './components/ProgressDashboard'
import { LANGUAGES } from './config/languages'
import './App.css'

const ChatArea = lazy(() => import('./components/ChatArea'))
const QuizPanel = lazy(() => import('./components/QuizPanel'))
const ApiKeyModal = lazy(() => import('./components/ApiKeyModal'))

// ── Sub-components memoized to prevent cascading re-renders ────────────

const CenterPanel = memo(function CenterPanel(props) {
  const {
    centerState,
    conversationKey,
    language,
    uiText,
    scenario,
    conversationGoal,
    sensitivity,
    maxRounds,
    targetKnowledge,
    setScenario,
    setConversationGoal,
    setSensitivity,
    setMaxRounds,
    setTargetKnowledge,
    handleStartChat,
    handleGenerateGoal,
    handleChatEnd,
    handleQuizEnd,
    handleSidebarUpdate,
    handleDictSearchFromSelection,
    getConfirmedCount,
    isMuted,
    addPoint,
    updatePoint,
    knowledgePoints,
    getPointById,
    updatePointReview,
    handleStartQuiz,
    conversationContextRef,
  } = props

  switch (centerState) {
    case 'idle':
      return (
        <div className="center-idle">
          <div className="idle-scenario-section">
            <ScenarioSetup
              language={language}
              uiText={uiText}
              scenario={scenario}
              conversationGoal={conversationGoal}
              sensitivity={sensitivity}
              maxRounds={maxRounds}
              targetKnowledge={targetKnowledge}
              onScenarioChange={setScenario}
              onConversationGoalChange={setConversationGoal}
              onSensitivityChange={setSensitivity}
              onMaxRoundsChange={setMaxRounds}
              onTargetKnowledgeChange={setTargetKnowledge}
              onStartChat={handleStartChat}
              generateGoal={handleGenerateGoal}
            />
          </div>
          <div className="idle-progress-section">
            <ProgressDashboard
              language={language}
              uiText={uiText}
              knowledgePoints={knowledgePoints}
              getConfirmedCount={getConfirmedCount}
              onStartQuiz={handleStartQuiz}
            />
          </div>
        </div>
      )

    case 'chatting':
      return (
        <Suspense fallback={<div className="center-loading">Loading conversation…</div>}>
          <ChatArea
            key={conversationKey}
            language={language}
            isChatStarted={true}
            conversationContextRef={conversationContextRef}
            onSidebarUpdate={handleSidebarUpdate}
            onReset={handleChatEnd}
            onDictSearchFromSelection={handleDictSearchFromSelection}
            getConfirmedCount={getConfirmedCount}
            targetKnowledge={targetKnowledge}
            isMuted={isMuted}
            onAddKnowledgePoint={addPoint}
            onUpdatePoint={updatePoint}
            knowledgePoints={knowledgePoints}
          />
        </Suspense>
      )

    case 'quiz':
      return (
        <Suspense fallback={<div className="center-loading">Loading quiz…</div>}>
          <QuizPanel
            language={language}
            knowledgePoints={knowledgePoints}
            getPointById={getPointById}
            updatePointReview={updatePointReview}
            onBackToHome={handleQuizEnd}
          />
        </Suspense>
      )

    default:
      return null
  }
})

const RightSidebar = memo(function RightSidebar(props) {
  const {
    uiText,
    sidebarContent,
    sidebarContentType,
    dictQuery,
    dictLoading,
    selectedPointId,
    expandedChinese,
    getPointById,
    setDictQuery,
    handleDictKeyDown,
    handleDictSearch,
    handleSidebarClose,
    setExpandedChinese,
    language,
  } = props

  const sidebarPoint = selectedPointId ? getPointById(selectedPointId) || sidebarContent : sidebarContent

  return (
    <div className="sidebar-content">
      <div className="sidebar-header">
        <h3 className="sidebar-title">{uiText.lookUp}</h3>
        {sidebarContent && (
          <button className="sidebar-close-btn" onClick={handleSidebarClose}>
            ×
          </button>
        )}
      </div>
      <div className="sidebar-dict-bar">
        <input
          className="sidebar-dict-input"
          type="text"
          placeholder={uiText.dictPlaceholder}
          value={dictQuery}
          onChange={(e) => setDictQuery(e.target.value)}
          onKeyDown={handleDictKeyDown}
        />
        <button
          className="sidebar-dict-btn"
          onClick={handleDictSearch}
          disabled={dictLoading || !dictQuery.trim()}
        >
          {dictLoading ? '...' : 'Search'}
        </button>
      </div>
      {sidebarContentType === 'point' ? (
        <LookUpPanel
          point={sidebarPoint}
          expandedChinese={expandedChinese}
          onToggleChinese={() => setExpandedChinese((prev) => !prev)}
          language={language}
        />
      ) : sidebarContent?.error ? (
        <div className="sidebar-detail" style={{ color: '#ff4d4f' }}>
          <p>{sidebarContent.error}</p>
          {sidebarContent.raw && (
            <pre style={{ fontSize: '12px', marginTop: '8px', whiteSpace: 'pre-wrap' }}>
              {sidebarContent.raw}
            </pre>
          )}
        </div>
      ) : sidebarContent ? (
        <div className="sidebar-detail">{sidebarContent}</div>
      ) : (
        <LookUpPanel
          point={null}
          expandedChinese={expandedChinese}
          onToggleChinese={() => setExpandedChinese((prev) => !prev)}
          language={language}
        />
      )}
    </div>
  )
})

const HeaderRight = memo(function HeaderRight(props) {
  const { theme, setTheme, isMuted, setIsMuted, language, setLanguage, setShowApiModal, setModalMode } = props

  return (
    <>
      <button
        className="theme-toggle-btn"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <button
        className="mute-toggle-btn"
        onClick={() => setIsMuted((prev) => !prev)}
        title={isMuted ? 'Unmute TTS' : 'Mute TTS'}
      >
        {isMuted ? '🔇' : '🔊'}
      </button>
      <button
        className="settings-btn"
        onClick={() => { setModalMode('settings'); setShowApiModal(true) }}
        title="API Key 设置"
      >
        ⚙️
      </button>
      <div className="language-switcher">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.key}
            className={`lang-btn ${language === lang.key ? 'lang-btn-active' : ''}`}
            onClick={() => setLanguage(lang.key)}
            title={lang.label}
          >
            {lang.flag} {lang.label}
          </button>
        ))}
      </div>
    </>
  )
})

// ── AppView — top-level view, delegates to memo'd sub‑panels ──────────

function AppView(props) {
  const {
    showApiModal,
    modalMode,
    setShowApiModal,
    knowledgePoints,
    deletePoint,
    confirmPoint,
    handleSelectPoint,
    selectedPointId,
    language,
  } = props

  return (
    <>
      {showApiModal && (
        <Suspense fallback={null}>
          <ApiKeyModal
            mode={modalMode}
            onComplete={() => setShowApiModal(false)}
            onClose={() => setShowApiModal(false)}
          />
        </Suspense>
      )}
      <Layout
        left={
          <KnowledgeSidebar
            knowledgePoints={knowledgePoints}
            onDelete={deletePoint}
            onConfirmPoint={confirmPoint}
            onSelectPoint={handleSelectPoint}
            selectedPointId={selectedPointId}
            language={language}
          />
        }
        center={<CenterPanel {...props} />}
        right={<RightSidebar {...props} />}
        headerRight={<HeaderRight {...props} />}
      />
    </>
  )
}

export default memo(AppView)
