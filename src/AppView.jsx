import { Suspense, memo, lazy, useState } from 'react'
import Layout from './components/Layout'
import ScenarioSetup from './components/ScenarioSetup'
import KnowledgeSidebar from './components/KnowledgeSidebar'
import LookUpPanel from './components/LookUpPanel'
import ProgressDashboard from './components/ProgressDashboard'
import SettingsPanel from './components/SettingsPanel'
import TabNav from './components/TabNav'
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
    dueForReviewCount,
    isMuted,
    addPoint,
    updatePoint,
    knowledgePoints,
    getPointById,
    updatePointReview,
    handleStartQuiz,
    conversationContextRef,
  } = props

  const [activeTab, setActiveTab] = useState('chat')

  switch (centerState) {
    case 'idle':
      return (
        <div className="center-idle">
          <TabNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            dueCount={dueForReviewCount}
            uiText={uiText}
          />
          <div className="idle-content">
            {activeTab === 'chat' ? (
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
            ) : (
              <ProgressDashboard
                language={language}
                uiText={uiText}
                getConfirmedCount={getConfirmedCount}
                dueForReviewCount={dueForReviewCount}
                onStartQuiz={handleStartQuiz}
              />
            )}
          </div>
        </div>
      )

    case 'chatting':
      return (
        <Suspense fallback={<div className="center-loading">{uiText.loadingConversation}</div>}>
          <ChatArea
            key={conversationKey}
            language={language}
            uiText={uiText}
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
        <Suspense fallback={<div className="center-loading">{uiText.loadingQuiz}</div>}>
          <QuizPanel
            language={language}
            uiText={uiText}
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
          {dictLoading ? uiText.dictLoading : uiText.search}
        </button>
      </div>
      {sidebarContentType === 'point' ? (
        <LookUpPanel
          point={sidebarPoint}
          expandedChinese={expandedChinese}
          onToggleChinese={() => setExpandedChinese((prev) => !prev)}
          language={language}
          uiText={uiText}
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
          uiText={uiText}
        />
      )}
    </div>
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
    setLanguage,
    uiText,
    theme,
    followSystem,
    setFollowSystem,
    setTheme,
    isMuted,
    setIsMuted,
  } = props

  const [settingsOpen, setSettingsOpen] = useState(false)
  const autoReadAloud = !isMuted

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
            uiText={uiText}
          />
        }
        center={<CenterPanel {...props} />}
        right={<RightSidebar {...props} />}
        onHamburgerClick={() => setSettingsOpen(true)}
        settingsPanel={
          <SettingsPanel
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            language={language}
            setLanguage={setLanguage}
            uiText={uiText}
            theme={theme}
            followSystem={followSystem}
            setFollowSystem={setFollowSystem}
            setTheme={setTheme}
            autoReadAloud={autoReadAloud}
            setAutoReadAloud={(v) => setIsMuted(!v)}
          />
        }
      />
    </>
  )
}

export default memo(AppView)
