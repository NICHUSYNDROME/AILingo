import { useState, useRef, useCallback, useEffect } from 'react'
import Layout from './components/Layout'
import ScenarioSetup from './components/ScenarioSetup'
import ChatArea from './components/ChatArea'
import KnowledgeSidebar from './components/KnowledgeSidebar'
import LookUpPanel from './components/LookUpPanel'
import ProgressDashboard from './components/ProgressDashboard'
import QuizPanel from './components/QuizPanel'
import { getApiKey, generateConversationGoal } from './api'
import { startHeartbeat, stopHeartbeat } from './utils/tts'
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

  // === TTS mute state (persisted to localStorage) ===
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('tts_muted') === 'true'
  })

  // Persist mute state changes
  useEffect(() => {
    localStorage.setItem('tts_muted', isMuted ? 'true' : 'false')
  }, [isMuted])

  // === Heartbeat: keep TTS backend alive while browser tab is open ===
  // Starts on mount, stops on unmount (tab close / navigation away)
  useEffect(() => {
    startHeartbeat()
    return () => stopHeartbeat()
  }, [])

  // === Three-state management: 'idle' | 'chatting' | 'quiz' ===
  const [centerState, setCenterState] = useState('idle')

  // Get scenarios for current language
  const currentScenarios = SCENARIOS[language] || SCENARIOS.en
  // Default to the first scenario value
  const [scenario, setScenario] = useState(currentScenarios[0]?.value || 'restaurant')
  const [conversationGoal, setConversationGoal] = useState('')
  const [sensitivity, setSensitivity] = useState('normal')
  const [maxRounds, setMaxRounds] = useState(10)
  const [targetKnowledge, setTargetKnowledge] = useState(5)
  const [sidebarContent, setSidebarContent] = useState(null)
  const [sidebarContentType, setSidebarContentType] = useState(null) // 'dict' | 'point'
  const [expandedChinese, setExpandedChinese] = useState(false)
  const [dictQuery, setDictQuery] = useState('')
  const [dictLoading, setDictLoading] = useState(false)
  const [selectedPointId, setSelectedPointId] = useState(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)

  const conversationContextRef = useRef(null)
  const conversationIdRef = useRef(0)
  const [conversationKey, setConversationKey] = useState(0)

  // Pass language to useKnowledgePoints for data isolation
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

  // Reset scenario when language changes (only when idle)
  useEffect(() => {
    const firstScenario = currentScenarios[0]?.value || 'restaurant'
    setScenario(firstScenario)
    setConversationGoal('')
  }, [language]) // eslint-disable-line react-hooks/exhaustive-deps

  // Use a ref to hold the latest handleDictSearchFromSelection callback,
  // so the global keydown listener can safely reference it without
  // initialization-order issues (TDZ / "Cannot access before initialization").
  const dictSearchRef = useRef(null)

  // Global keyboard shortcut: Cmd+Shift+K (Mac) / Ctrl+Shift+K (Windows)
  // for selection-based dictionary search. Works in any app state (idle/chatting/quiz).
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if focus is inside an input or textarea (let normal typing work)
      if (e.target.closest('input, textarea, [contenteditable]')) return

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        const selection = window.getSelection().toString().trim()
        if (selection && dictSearchRef.current) {
          dictSearchRef.current(selection)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, []) // empty deps — ref is stable, never needs re-registration

  // === State transition handlers ===

  const handleStartChat = useCallback((params) => {
    conversationContextRef.current = {
      scenario: params.scenario,
      goal: params.goal || '',
      sensitivity: params.sensitivity,
      maxRounds: params.maxRounds,
      targetKnowledge: params.targetKnowledge,
    }
    // Increment conversation key to force ChatArea remount (resets all internal state)
    conversationIdRef.current += 1
    setConversationKey(conversationIdRef.current)
    setCenterState('chatting')
  }, [])

  const handleGenerateGoal = useCallback(async (scenario) => {
    return await generateConversationGoal(scenario, language)
  }, [language])

  // Called by ChatArea when conversation ends (summary done + user clicks "Start New Conversation")
  const handleChatEnd = useCallback(() => {
    setCenterState('idle')
  }, [])

  // Called by ProgressDashboard "Start Quiz" button
  const handleStartQuiz = useCallback(() => {
    setCenterState('quiz')
  }, [])

  // Called by QuizPanel "Back to Home" button
  const handleQuizEnd = useCallback(() => {
    setCenterState('idle')
  }, [])

  const handleSidebarUpdate = useCallback((content) => {
    setSidebarContent(content)
    setSidebarContentType('dict')
  }, [])

  const handleSidebarClose = useCallback(() => {
    setSidebarContent(null)
    setSidebarContentType(null)
    setExpandedChinese(false)
    setSelectedPointId(null)
  }, [])

  // Handle selecting a knowledge point (backtracking)
  // Uses getPointById to always show live data (confirmed status stays in sync)
  const handleSelectPoint = useCallback(
    (pointId) => {
      setSelectedPointId(pointId)
      const point = getPointById(pointId)
      if (!point) return

      // We set sidebarContent to the live point so LookUpPanel can use it
      setSidebarContent(point)
      setSidebarContentType('point')
      setExpandedChinese(false)

      // Highlight source message in chat area
      if (point.sourceMessageId) {
        setHighlightedMessageId(point.sourceMessageId)

        // Scroll to the message
        setTimeout(() => {
          const el = document.querySelector(
            `[data-message-id="${point.sourceMessageId}"]`
          )
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            // Add highlight class
            el.classList.add('message-highlight')
            // Remove highlight after 2 seconds
            setTimeout(() => {
              el.classList.remove('message-highlight')
            }, 2000)
          }
        }, 100)
      }
    },
    [getPointById]
  )

  /**
   * Parse JSON from AI response, handling markdown code blocks if present.
   */
  const parseJSONResponse = useCallback((text) => {
    let jsonStr = text.trim()
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }
    return JSON.parse(jsonStr)
  }, [])

  /**
   * Perform a dictionary search: call the AI API with a JSON-format prompt,
   * parse the structured result, and display it in the LookUp panel.
   */
  const handleDictSearch = useCallback(async () => {
    const word = dictQuery.trim()
    if (!word || dictLoading) return

    setDictLoading(true)
    setSidebarContent(`🔍 Searching for "${word}"...`)
    setSidebarContentType('dict')

    try {
      const apiKey = getApiKey()
      if (!apiKey) {
        setSidebarContent({ error: '⚠️ Please provide a valid API Key first.' })
        setSidebarContentType('dict')
        setDictLoading(false)
        return
      }

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: getDictSystemPrompt(language) },
            { role: 'user', content: `Define the word: "${word}"` },
          ],
          stream: false,
          temperature: 0,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('deepseek_api_key')
          setSidebarContent({ error: '⚠️ API Key is invalid or expired.' })
        } else {
          setSidebarContent({ error: `❌ Query failed (${response.status}).` })
        }
        setDictLoading(false)
        return
      }

      const data = await response.json()
      const aiResponse = data.choices[0].message.content

      // Parse JSON from AI response
      let dictData
      try {
        dictData = parseJSONResponse(aiResponse)
      } catch (parseError) {
        console.error('Failed to parse AI response as JSON:', aiResponse)
        setSidebarContent({ error: 'Failed to parse word definition', raw: aiResponse })
        setSidebarContentType('dict')
        setDictLoading(false)
        return
      }

      // Build complete knowledge point
      const knowledgePoint = {
        id: Date.now(),
        word: dictData.word || word,
        type: dictData.type || 'word',
        meaning: dictData.definition || 'Definition not found',
        meaningChinese: dictData.meaningChinese || '',
        phonetic: dictData.phonetic || '',
        partOfSpeech: dictData.partOfSpeech || '',
        context: conversationContextRef.current?.scenario || 'Dictionary',
        examples: dictData.examples || [`Example using "${word}"`],
        createdAt: new Date().toISOString(),
        confirmed: false,
        status: 'active',
      }

      // Check for existing point
      const existingPoint = knowledgePoints.find(
        (p) => p.word.toLowerCase() === word.toLowerCase() && p.status !== 'deleted'
      )

      if (existingPoint) {
        setSelectedPointId(existingPoint.id)
        setSidebarContent(existingPoint)
      } else {
        const added = addPoint(knowledgePoint)
        if (added) {
          setSelectedPointId(added.id)
          setSidebarContent(added)
        } else {
          // If addPoint failed (race condition), still display the point
          setSelectedPointId(knowledgePoint.id)
          setSidebarContent(knowledgePoint)
        }
      }

      setSidebarContentType('point')
      setExpandedChinese(false)
    } catch {
      setSidebarContent({ error: '❌ Network error. Please try again.' })
      setSidebarContentType('dict')
    }
    setDictLoading(false)
  }, [dictQuery, dictLoading, knowledgePoints, addPoint, parseJSONResponse])

  const handleDictKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleDictSearch()
      }
    },
    [handleDictSearch]
  )

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

  // Handle dict search triggered by Cmd+Shift+K selection
  const handleDictSearchFromSelection = useCallback(
    async (word) => {
      setDictQuery(word)
      setDictLoading(true)
      setSidebarContent(`🔍 Searching for "${word}"...`)
      setSidebarContentType('dict')

      try {
        const apiKey = getApiKey()
        if (!apiKey) {
          setSidebarContent({ error: '⚠️ Please provide a valid API Key first.' })
          setSidebarContentType('dict')
          setDictLoading(false)
          return
        }

        const response = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: getDictSystemPrompt(language) },
              { role: 'user', content: `Define the word: "${word}"` },
            ],
            stream: false,
            temperature: 0,
          }),
        })

        if (!response.ok) {
          if (response.status === 401) {
            localStorage.removeItem('deepseek_api_key')
            setSidebarContent({ error: '⚠️ API Key is invalid or expired.' })
          } else {
            setSidebarContent({ error: `❌ Query failed (${response.status}).` })
          }
          setDictLoading(false)
          return
        }

        const data = await response.json()
        const aiResponse = data.choices[0].message.content

        // Parse JSON from AI response
        let dictData
        try {
          dictData = parseJSONResponse(aiResponse)
        } catch (parseError) {
          console.error('Failed to parse AI response as JSON:', aiResponse)
          setSidebarContent({ error: 'Failed to parse word definition', raw: aiResponse })
          setSidebarContentType('dict')
          setDictLoading(false)
          return
        }

        // Build complete knowledge point
        const knowledgePoint = {
          id: Date.now(),
          word: dictData.word || word,
          type: dictData.type || 'word',
          meaning: dictData.definition || 'Definition not found',
          meaningChinese: dictData.meaningChinese || '',
          phonetic: dictData.phonetic || '',
          partOfSpeech: dictData.partOfSpeech || '',
          context: conversationContextRef.current?.scenario || 'Dictionary',
          examples: dictData.examples || [`Example using "${word}"`],
          createdAt: new Date().toISOString(),
          confirmed: false,
          status: 'active',
        }

        // Check for existing point
        const existingPoint = knowledgePoints.find(
          (p) => p.word.toLowerCase() === word.toLowerCase() && p.status !== 'deleted'
        )

        if (existingPoint) {
          setSelectedPointId(existingPoint.id)
          setSidebarContent(existingPoint)
        } else {
          const added = addPoint(knowledgePoint)
          if (added) {
            setSelectedPointId(added.id)
            setSidebarContent(added)
          } else {
            setSelectedPointId(knowledgePoint.id)
            setSidebarContent(knowledgePoint)
          }
        }

        setSidebarContentType('point')
        setExpandedChinese(false)
      } catch {
        setSidebarContent({ error: '❌ Network error. Please try again.' })
        setSidebarContentType('dict')
      }
      setDictLoading(false)
    },
    [knowledgePoints, addPoint, parseJSONResponse]
  )

  // Keep the global shortcut ref in sync with the latest callback
  useEffect(() => {
    dictSearchRef.current = handleDictSearchFromSelection
  }, [handleDictSearchFromSelection])

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
        )

      case 'quiz':
        return (
          <QuizPanel
            language={language}
            knowledgePoints={knowledgePoints}
            getPointById={getPointById}
            updatePointReview={updatePointReview}
            onBackToHome={handleQuizEnd}
          />
        )

      default:
        return null
    }
  }

  return (
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
  )
}

export default App
