import { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react'
import Layout from './components/Layout'
import ScenarioSetup from './components/ScenarioSetup'
import KnowledgeSidebar from './components/KnowledgeSidebar'
import LookUpPanel from './components/LookUpPanel'
import ProgressDashboard from './components/ProgressDashboard'
import { generateConversationGoal, testDeepSeekKey } from './api'
import { getItem, setItem, removeItem, syncAllFromFile } from './utils/storage'
import { useScenarioState } from './hooks/useScenarioState'
import { useSidebarState } from './hooks/useSidebarState'

// Lazy-loaded components (not on first screen)
const ChatArea = lazy(() => import('./components/ChatArea'))
const QuizPanel = lazy(() => import('./components/QuizPanel'))
const ApiKeyModal = lazy(() => import('./components/ApiKeyModal'))

import { useKnowledgePoints } from './hooks/useKnowledgePoints'
import { useLanguage } from './context/LanguageContext'
import { useTheme } from './context/ThemeContext'
import { SCENARIOS, LANGUAGES } from './config/languages'
import './App.css'

const TYPE_CONFIG = {
  word: { label: 'Word', color: '#1677ff', bg: '#e6f4ff' },
  phrase: { label: 'Phrase', color: '#52c41a', bg: '#f6ffed' },
  grammar: { label: 'Grammar', color: '#fa8c16', bg: '#fff7e6' },
  collocation: { label: 'Collocation', color: '#eb2f96', bg: '#fff0f6' },
}

function getDictSystemPrompt(language) {
  if (language === 'ja') {
    return `You are a Japanese dictionary assistant. Return ONLY valid JSON in the following format, no other text:

{
    
  "word": "the searched word",
  "type": "word|phrase|grammar|collocation|keigo|joshi|katsuyou",
  "partOfSpeech": "noun/verb/adjective/etc",
  "definition": "Japanese definition (日本語での定義)",
  "meaningChinese": "中文释义 (required, must not be empty)",
  "phonetic": "読み仮名 (e.g., れすとらん, たべる)",
  "examples": ["example sentence 1 in Japanese", "example sentence 2 in Japanese"]
}

Rules:
- word: Normalize the word to its standard form. Verbs should be in dictionary form (e.g., 食べる), adjectives in base form (e.g., 美味しい).
- type: 自行判断该查询内容的最佳分类。单个单词为 word，固定表达为 phrase，语法结构为 grammar，词语搭配为 collocation，敬语为 keigo，助词为 joshi，活用为 katsuyou。
- partOfSpeech: the primary part of speech (e.g., 名詞, 動詞, 形容詞, 助詞)
- definition: Simple, clear Japanese definition. Explain in Japanese.
- meaningChinese: Chinese translation/explanation of the word. Must be a valid non-empty string. Use concise Chinese to explain the word's meaning.
- phonetic: REQUIRED. Provide 読み仮名 (hiragana reading) for the word. Format like れすとらん, たべる. Never leave this empty.
- examples: array of 1-2 example sentences in Japanese
- DO NOT add any text outside the JSON
- Use double quotes only
- meaningChinese is required, do not leave it empty
- CRITICAL: Return ONLY the JSON object. Do not add any greeting, explanation, or other text. Start with { and end with }.`
  }

  return `You are an English dictionary assistant. Return ONLY valid JSON in the following format, no other text:

{
  "word": "the searched word",
  "type": "word|phrase|grammar|collocation",
  "partOfSpeech": "noun/verb/adjective/etc",
  "definition": "clear English definition",
  "meaningChinese": "中文释义 (required, must not be empty)",
  "phonetic": "IPA phonetic transcription (e.g., /ˈrestərɒnt/)",
  "examples": ["example sentence 1", "example sentence 2"]
}

Rules:
- word: Normalize the word to its standard form: most words should be lowercase, except proper nouns (country names, abbreviations, brand names) which should keep their correct capitalization. Set the 'word' field to this normalized form.
- type: 自行判断该查询内容的最佳分类。如果是单个单词标记为 word，固定表达为 phrase，语法结构为 grammar，词语搭配为 collocation。
- partOfSpeech: the primary part of speech
- definition: simple, clear English definition
- meaningChinese: Chinese translation/explanation of the word. Must be a valid non-empty string. Use concise Chinese to explain the word's meaning in the given context.
- phonetic: REQUIRED. Provide IPA phonetic transcription for the word. Format like /wɜːrd/ or /fəˈnetɪk/. Never leave this empty.
- examples: array of 1-2 example sentences
- DO NOT add any text outside the JSON
- Use double quotes only
- meaningChinese is required, do not leave it empty
- CRITICAL: Return ONLY the JSON object. Do not add any greeting, explanation, or other text. Start with { and end with }.`
}

function App() {
  const { language, setLanguage, uiText } = useLanguage()
  const { theme, setTheme } = useTheme()

  // === API Key 弹窗状态 ===
  const [showApiModal, setShowApiModal] = useState(false)
  const [modalMode, setModalMode] = useState('welcome') // 'welcome' | 'settings'
  const [appReady, setAppReady] = useState(false)

  // 初始化：同步 Electron 文件数据 → localStorage，然后检查 API Key
  useEffect(() => {
    async function initApp() {
      // 1. 将 Electron 文件存储同步到 localStorage，确保浏览器 dev 模式数据互通
      await syncAllFromFile()

      // 2. 检查 API Key
      const key = await getItem('deepseek_api_key')
      if (!key) {
        setModalMode('welcome')
        setShowApiModal(true)
        setAppReady(true)
        return
      }
      const result = await testDeepSeekKey(key)
      if (!result.valid) {
        setModalMode('welcome')
        setShowApiModal(true)
      }
      setAppReady(true)
    }
    initApp()
  }, [])

  // === TTS mute state (persisted to localStorage & Electron storage) ===
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('tts_muted') === 'true'
  })

  // Persist mute state changes
  useEffect(() => {
    localStorage.setItem('tts_muted', isMuted ? 'true' : 'false')
    setItem('tts_muted', isMuted ? 'true' : 'false') // 异步写入 Electron 存储
  }, [isMuted])

  // Electron 环境下，从主进程文件加载真实值
  useEffect(() => {
    async function loadMutedState() {
      const saved = await getItem('tts_muted')
      if (saved !== null) {
        setIsMuted(saved === 'true')
      }
    }
    loadMutedState()
  }, [])


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
  } = useScenarioState(language, currentScenarios)

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

  // === Sidebar + dictionary ===
  const {
    sidebarContent, sidebarContentType,
    expandedChinese, setExpandedChinese,
    dictQuery, setDictQuery,
    dictLoading,
    selectedPointId, setSelectedPointId,
    highlightedMessageId,
    handleSidebarUpdate, handleSidebarClose,
    handleSelectPoint,
    handleDictSearch, handleDictSearchFromSelection, handleDictKeyDown,
  } = useSidebarState(language, knowledgePoints, addPoint, getPointById, conversationContextRef, getDictSystemPrompt)

  /**
   * Parse JSON from AI response, handling markdown code blocks if present.
   */
  // === Knowledge point mutation handlers ===
  const handleDeletePoint = useCallback(
    (id) => {
      deletePoint(id)
      if (selectedPointId === id) {
        setSelectedPointId(null)
      }
    },
    [deletePoint, selectedPointId]
  )

  const handleMarkMastered = useCallback(
    (id) => {
      markMastered(id)
    },
    [markMastered]
  )

  const handleConfirmPoint = useCallback(
    (id) => {
      confirmPoint(id)
      setTimeout(() => {
        const count = getConfirmedCount()
        console.log(`当前已确认知识点数: ${count}, 目标: ${targetKnowledge}`)
      }, 50)
    },
    [confirmPoint, getConfirmedCount, targetKnowledge]
  )

  // 异步补全知识点缺失的释义信息（用于 spelling_correction / grammar_correction 来源的知识点）
  const handleUpdatePoint = useCallback(
    (id, fields) => {
      updatePoint(id, fields)
    },
    [updatePoint]
  )

  // === Render center content based on state ===
  const renderCenter = () => {
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
            onUpdatePoint={handleUpdatePoint}
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
  }

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
            onDelete={handleDeletePoint}
            onConfirmPoint={handleConfirmPoint}
            onSelectPoint={handleSelectPoint}
            selectedPointId={selectedPointId}
            language={language}
          />
        }
        center={renderCenter()}
        right={
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
              point={(() => {
                if (selectedPointId) {
                  const livePoint = getPointById(selectedPointId)
                  if (livePoint) return livePoint
                }
                return sidebarContent
              })()}
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
      }
      headerRight={
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
      }
    />
    </>
  )
}

export default App
