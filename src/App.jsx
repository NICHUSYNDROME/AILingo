import { useState, useCallback, useEffect, useMemo } from 'react'
import AppView from './AppView'
import { testDeepSeekKey } from './api'
import { getItem, setItem, syncAllFromFile } from './utils/storage'
import { debug } from './utils/debug'
import { useScenarioState } from './hooks/useScenarioState'
import { useSidebarState } from './hooks/useSidebarState'
import { useKnowledgePoints } from './hooks/useKnowledgePoints'
import { useProficiency } from './hooks/useProficiency'
import { useLanguage } from './context/LanguageContext'
import { useTheme } from './context/ThemeContext'
import { SCENARIOS } from './config/languages'
import { getDictSystemPrompt } from './config/prompts'
import { DEFAULT_PROFICIENCY_SCORE } from './config/proficiency'
import { getLocalDateString } from './utils/date'
import { useResponsive } from './hooks/useResponsive'
import './App.css'

function App() {
  const { language, setLanguage } = useLanguage()
  const { theme, setTheme, followSystem, setFollowSystem } = useTheme()
  const isNarrow = useResponsive(900)

  // === API Key modal state ===
  const [showApiModal, setShowApiModal] = useState(false)
  const [modalMode, setModalMode] = useState('welcome')

  // Init: sync Electron file → localStorage, then validate API Key
  useEffect(() => {
    async function initApp() {
      await syncAllFromFile()
      const key = await getItem('deepseek_api_key')
      if (!key) {
        setModalMode('welcome')
        setShowApiModal(true)
        return
      }
      const result = await testDeepSeekKey(key)
      if (!result.valid) {
        setModalMode('welcome')
        setShowApiModal(true)
      }
    }
    initApp()
  }, [])

  // === TTS mute state (persisted to localStorage & Electron storage) ===
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('tts_muted') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('tts_muted', isMuted ? 'true' : 'false')
    setItem('tts_muted', isMuted ? 'true' : 'false')
  }, [isMuted])

  useEffect(() => {
    async function loadMutedState() {
      const saved = await getItem('tts_muted')
      if (saved !== null) {
        setIsMuted(saved === 'true')
      }
    }
    loadMutedState()
  }, [])

  // === Proficiency scoring (implicit, debug-only) ===
  const { score: proficiencyScore, setScore: setProficiencyScore, isFirstTime, resetScore: resetProficiencyScore } = useProficiency(language)

  // === Scenario + center state machine ===
  const currentScenarios = SCENARIOS[language] || SCENARIOS.en
  const {
    centerState,
    scenario, setScenario,
    conversationGoal, setConversationGoal,
    sensitivity, setSensitivity,
    maxRounds, setMaxRounds,
    targetKnowledge, setTargetKnowledge,
    conversationKey,
    conversationContextRef,
    handleStartChat,
    handleGenerateGoal,
    handleChatEnd,
    handleStartQuiz,
    handleQuizEnd,
    handleStartAssessment,
    handleSkipAssessment,
    handleAssessmentEnd,
  } = useScenarioState(language, currentScenarios, proficiencyScore)

  // === Knowledge points ===
  const {
    knowledgePoints,
    addPoint,
    deletePoint,
    markMastered,
    confirmPoint,
    getPointById,
    getConfirmedCount,
    updatePointReview,
    updatePoint,
  } = useKnowledgePoints(language)

  // Count confirmed points due for review today
  const dueForReviewCount = useMemo(() => {
    const todayStr = getLocalDateString()
    return knowledgePoints.filter((p) => {
      if (p.status === 'deleted') return false
      if (p.confirmed !== true) return false
      if (!p.nextReview) return true
      return p.nextReview <= todayStr
    }).length
  }, [knowledgePoints])

  // === Sidebar + dictionary ===
  const {
    sidebarContent, sidebarContentType,
    expandedChinese, setExpandedChinese,
    dictQuery, setDictQuery,
    dictLoading,
    selectedPointId, setSelectedPointId,
    selectionBubble, dismissSelectionBubble,
    handleSidebarUpdate, handleSidebarClose,
    handleSelectPoint,
    handleDictSearch, handleDictSearchFromSelection, handleDictKeyDown,
  } = useSidebarState(language, knowledgePoints, addPoint, getPointById, conversationContextRef, getDictSystemPrompt)

  // === Knowledge point mutation handlers ===
  const handleDeletePoint = useCallback(
    (pointOrId) => {
      const id = typeof pointOrId === 'object' ? pointOrId.id : pointOrId
      deletePoint(id)
      handleSidebarClose()
      setDictQuery('')
    },
    [deletePoint, handleSidebarClose, setDictQuery]
  )

  const handleMarkMastered = useCallback(
    (id) => { markMastered(id) },
    [markMastered]
  )

  const handleConfirmPoint = useCallback(
    (pointOrId) => {
      const id = typeof pointOrId === 'object' ? pointOrId.id : pointOrId
      confirmPoint(id)
      setTimeout(() => {
        const confirmedCount = getConfirmedCount()
        debug.log(`当前已确认知识点数: ${confirmedCount}, 目标: ${targetKnowledge}`)
      }, 50)
    },
    [confirmPoint, getConfirmedCount, targetKnowledge]
  )

  const handleUpdatePoint = useCallback(
    (id, fields) => { updatePoint(id, fields) },
    [updatePoint]
  )

  // Assessment skip: set default score and stay idle
  const handleSkipAssessmentWithDefault = useCallback(() => {
    setProficiencyScore(DEFAULT_PROFICIENCY_SCORE, 'user skipped assessment')
    handleSkipAssessment()
  }, [setProficiencyScore, handleSkipAssessment])

  // Clear proficiency results (keeps knowledge points)
  const handleClearProficiency = useCallback(() => {
    resetProficiencyScore()
  }, [resetProficiencyScore])

  // Clear all knowledge points for current language
  const handleClearKnowledge = useCallback(() => {
    const STORAGE_KEY = language === 'ja' ? 'ja_knowledge_points' : 'en_knowledge_points'
    localStorage.removeItem(STORAGE_KEY)
    window.location.reload()
  }, [language])

  // ── Delegate rendering to AppView ──────────────────────────────
  return (
    <AppView
      language={language}
      setLanguage={setLanguage}
      theme={theme}
      setTheme={setTheme}
      followSystem={followSystem}
      setFollowSystem={setFollowSystem}
      showApiModal={showApiModal}
      modalMode={modalMode}
      setShowApiModal={setShowApiModal}
      setModalMode={setModalMode}
      isMuted={isMuted}
      setIsMuted={setIsMuted}
      isNarrow={isNarrow}
      centerState={centerState}
      scenario={scenario}
      setScenario={setScenario}
      conversationGoal={conversationGoal}
      setConversationGoal={setConversationGoal}
      sensitivity={sensitivity}
      setSensitivity={setSensitivity}
      maxRounds={maxRounds}
      setMaxRounds={setMaxRounds}
      targetKnowledge={targetKnowledge}
      setTargetKnowledge={setTargetKnowledge}
      conversationKey={conversationKey}
      conversationContextRef={conversationContextRef}
      handleStartChat={handleStartChat}
      handleGenerateGoal={handleGenerateGoal}
      handleChatEnd={handleChatEnd}
      handleStartQuiz={handleStartQuiz}
      handleQuizEnd={handleQuizEnd}
      handleStartAssessment={handleStartAssessment}
      handleSkipAssessment={handleSkipAssessmentWithDefault}
      handleAssessmentEnd={handleAssessmentEnd}
      isFirstTime={isFirstTime}
      onClearProficiency={handleClearProficiency}
      onClearKnowledge={handleClearKnowledge}
      knowledgePoints={knowledgePoints}
      addPoint={addPoint}
      deletePoint={handleDeletePoint}
      markMastered={handleMarkMastered}
      confirmPoint={handleConfirmPoint}
      getPointById={getPointById}
      getConfirmedCount={getConfirmedCount}
      dueForReviewCount={dueForReviewCount}
      updatePointReview={updatePointReview}
      updatePoint={handleUpdatePoint}
      sidebarContent={sidebarContent}
      sidebarContentType={sidebarContentType}
      expandedChinese={expandedChinese}
      setExpandedChinese={setExpandedChinese}
      proficiencyScore={proficiencyScore}
      setProficiencyScore={setProficiencyScore}
      dictQuery={dictQuery}
      setDictQuery={setDictQuery}
      dictLoading={dictLoading}
      selectedPointId={selectedPointId}
      handleSidebarUpdate={handleSidebarUpdate}
      handleSidebarClose={handleSidebarClose}
      handleSelectPoint={handleSelectPoint}
      handleDictSearch={handleDictSearch}
      handleDictSearchFromSelection={handleDictSearchFromSelection}
      handleDictKeyDown={handleDictKeyDown}
      selectionBubble={selectionBubble}
      dismissSelectionBubble={dismissSelectionBubble}
    />
  )
}

export default App
