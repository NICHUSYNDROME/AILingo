import { Suspense, memo, lazy, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Layout from './components/Layout'
import ScenarioSetup from './components/ScenarioSetup'
import KnowledgeSidebar from './components/KnowledgeSidebar'
import LookUpPanel from './components/LookUpPanel'
import ProgressDashboard from './components/ProgressDashboard'
import SettingsPanel from './components/SettingsPanel'
import TabNav from './components/TabNav'
import './App.css'

const ChatArea = lazy(() => import('./components/ChatArea'))
const QuizPanel = lazy(() => import('./components/QuizPanel'))
const ApiKeyModal = lazy(() => import('./components/ApiKeyModal'))

// ── Sub-components memoized to prevent cascading re-renders ────────────

const CenterPanel = memo(function CenterPanel(props) {
  const { t } = useTranslation()
  const {
    centerState,
    conversationKey,
    language,
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
    isNarrow,
    activeTab,
    setActiveTab,
  } = props

  switch (centerState) {
    case 'idle':
      return (
        <div className="center-idle">
          {!isNarrow && (
            <TabNav
              activeTab={activeTab}
              onTabChange={setActiveTab}
              dueCount={dueForReviewCount}
            />
          )}
          <div className="idle-content">
            {activeTab === 'chat' && (
              <ScenarioSetup
                language={language}
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
            )}
            {activeTab === 'review' && (
              <ProgressDashboard
                language={language}
                getConfirmedCount={getConfirmedCount}
                dueForReviewCount={dueForReviewCount}
                onStartQuiz={handleStartQuiz}
              />
            )}
            {activeTab === 'knowledge' && (
              <KnowledgeSidebar
                knowledgePoints={knowledgePoints}
                onDelete={props.deletePoint}
                onConfirmPoint={props.confirmPoint}
                onSelectPoint={props.handleSelectPoint}
                selectedPointId={props.selectedPointId}
                language={language}
                isNarrow={isNarrow}
                getPointById={props.getPointById}
              />
            )}
            {activeTab === 'lookup' && (
              <RightSidebar {...props} isNarrow={isNarrow} />
            )}
          </div>
        </div>
      )

    case 'chatting':
      return (
        <Suspense fallback={<div className="center-loading">{t('loadingConversation')}</div>}>
          <ChatArea
            key={conversationKey}
            language={language}
            isNarrow={isNarrow}
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
        <Suspense fallback={<div className="center-loading">{t('loadingQuiz')}</div>}>
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
  const { t } = useTranslation()
  const {
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
    isNarrow,
    confirmPoint,
    deletePoint,
  } = props

  const sidebarPoint = selectedPointId ? (getPointById(selectedPointId) || sidebarContent) : sidebarContent

  return (
    <div className="sidebar-content">
      <div className="sidebar-header">
        <h3 className="sidebar-title">{t('lookUp')}</h3>
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
          placeholder={t('dictPlaceholder')}
          value={dictQuery}
          onChange={(e) => setDictQuery(e.target.value)}
          onKeyDown={handleDictKeyDown}
        />
        <button
          className="sidebar-dict-btn"
          onClick={handleDictSearch}
          disabled={dictLoading || !dictQuery.trim()}
        >
          {dictLoading ? t('dictLoading') : t('search')}
        </button>
      </div>
      {sidebarContentType === 'point' ? (
        <LookUpPanel
          point={sidebarPoint}
          expandedChinese={expandedChinese}
          onToggleChinese={() => setExpandedChinese((prev) => !prev)}
          language={language}
          isNarrow={isNarrow}
          onConfirmPoint={confirmPoint}
          onDeletePoint={deletePoint}
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
      ) : sidebarContent?.info ? (
        <div className="sidebar-detail" style={{ color: '#888' }}>
          <p>{sidebarContent.info}</p>
        </div>
      ) : sidebarContent ? (
        <div className="sidebar-detail">{sidebarContent}</div>
      ) : (
        <LookUpPanel
          point={null}
          expandedChinese={expandedChinese}
          onToggleChinese={() => setExpandedChinese((prev) => !prev)}
          language={language}
          isNarrow={isNarrow}
          onConfirmPoint={confirmPoint}
          onDeletePoint={deletePoint}
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
    theme,
    followSystem,
    setFollowSystem,
    setTheme,
    isMuted,
    setIsMuted,
    isNarrow,
    centerState,
    dueForReviewCount,
    selectionBubble,
    dismissSelectionBubble,
  } = props

  const showTopToggles = isNarrow && centerState !== 'idle'

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('chat')
  const autoReadAloud = !isMuted

  const handleLeftToggle = () => {
    setLeftOpen((v) => !v)
    setRightOpen(false)
  }
  const handleRightToggle = () => {
    setRightOpen((v) => !v)
    setLeftOpen(false)
  }

  // Wrap dict search to also open right sidebar in narrow mode
  const handleDictSearchOpenRight = useCallback((word) => {
    props.handleDictSearchFromSelection(word)
    if (isNarrow) {
      setRightOpen(true)
      setLeftOpen(false)
    }
  }, [props.handleDictSearchFromSelection, isNarrow])

  // Narrow idle: build TabNav for topbar
  const narrowTabNav = isNarrow && centerState === 'idle' ? (
    <TabNav
      activeTab={activeTab}
      onTabChange={setActiveTab}
      dueCount={dueForReviewCount}
      isNarrow={true}
    />
  ) : null

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
      {/* ── Mobile selection lookup bubble ── */}
      {isNarrow && selectionBubble && (
        <button
          className="selection-lookup-btn"
          style={{ left: selectionBubble.x, top: selectionBubble.y }}
          onClick={() => {
            handleDictSearchOpenRight(selectionBubble.word)
            dismissSelectionBubble()
          }}
        >
          🔍
        </button>
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
            isNarrow={isNarrow}
            getPointById={props.getPointById}
          />
        }
        center={<CenterPanel {...props} isNarrow={isNarrow} activeTab={activeTab} setActiveTab={setActiveTab} handleDictSearchFromSelection={handleDictSearchOpenRight} />}
        right={<RightSidebar {...props} isNarrow={isNarrow} />}
        onHamburgerClick={() => setSettingsOpen(true)}
        isNarrow={isNarrow}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onLeftToggle={handleLeftToggle}
        onRightToggle={handleRightToggle}
        showTopToggles={showTopToggles}
        topbarRight={narrowTabNav}
        settingsPanel={
          <SettingsPanel
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            language={language}
            setLanguage={setLanguage}
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
