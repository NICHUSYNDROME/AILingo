import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { debug } from '../utils/debug'
import { SCENARIOS, SENSITIVITY_LABELS } from '../config/languages'
import {
  sendToAI,
  parseAIReply,
  generateSummary,
  checkTaskCompletion,
  correctUserMessage,
  analyzeGrammar,
  generateHints,
  extractCorrectionsFromReply,
  summarizeTipsAndExtractKnowledge,
  extractSpecificKnowledge
} from '../api'
// learningLog removed — stats computed from conversation records directly
import { speak, stopSpeaking, isSpeaking, isTTSAvailable } from '../utils/tts'
import { getLocalDateString } from '../utils/date'
import './ChatArea.css'

// ===== Helper: escape HTML special chars =====
const escapeHtml = (str) => {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')  // Use HTML entity for single quote
}

// ===== Simple Markdown renderer (supports **bold** and *italic*) =====
const renderMarkdown = (text) => {
  if (!text) return ''
  // First escape HTML special chars
  let html = escapeHtml(text)
  // Bold: **text** -> <strong>text</strong>
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  // Italic: *text* -> <em>text</em>
  html = html.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
  return html
}

// ===== Helper: generate annotated HTML with character-level diff =====
// Strategy C: shows removed chars with strikethrough (red), added chars in green
const generateCorrectionHtml = (original, corrected) => {
  if (!original || !corrected || original === corrected) return escapeHtml(original || corrected || '')
  let result = ''
  let oi = 0, ci = 0
  while (oi < original.length || ci < corrected.length) {
    if (oi < original.length && ci < corrected.length && original[oi] === corrected[ci]) {
      result += escapeHtml(corrected[ci])
      oi++; ci++
    } else if (oi < original.length) {
      // Try to find original[oi] later in corrected text
      let found = false
      for (let look = ci; look < corrected.length; look++) {
        if (corrected[look] === original[oi]) {
          // Everything from corrected[ci..look-1] is newly added
          const added = corrected.slice(ci, look)
          if (added) result += '<span class="corr-added">' + escapeHtml(added) + '</span>'
          ci = look
          found = true
          break
        }
      }
      if (!found) {
        // original[oi] was removed
        result += '<span class="corr-removed">' + escapeHtml(original[oi]) + '</span>'
        oi++
      }
    } else {
      // Original text exhausted; rest of corrected is newly added
      const remaining = corrected.slice(ci)
      result += '<span class="corr-added">' + escapeHtml(remaining) + '</span>'
      break
    }
  }
  return result
}

// ===== Memoized bubble content — prevents React re-renders from clearing text selection =====
const AssistantBubbleContent = memo(function AssistantBubbleContent({ content }) {
  return <div className="bubble-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
})

const UserBubbleContent = memo(function UserBubbleContent({ content }) {
  return <div className="bubble-text">{content}</div>
})

// ================================================================

function ChatArea({ isChatStarted, conversationContextRef, onSidebarUpdate, onReset, onDictSearchFromSelection, getConfirmedCount, targetKnowledge, language = 'en', isMuted = false, onAddKnowledgePoint, onUpdatePoint, existingKnowledgePoints = [], isNarrow, onProficiencyChange, onConversationEnd = null, initialMessages = null, initialCorrections = null, initialAnalysis = null, initialKnowledgePoints = null, initialTodos = null, initialRoundCount = 0, initialContinueFromId = null, initialSummaryDone = false }) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [roundCount, setRoundCount] = useState(0)
  const [aiStarted, setAiStarted] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryDone, setSummaryDone] = useState(false)
  const [summaryError, setSummaryError] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [showBackConfirm, setShowBackConfirm] = useState(false)
  const [showSysInfo, setShowSysInfo] = useState(false)
  const [speakingMsgId, setSpeakingMsgId] = useState(null)
  const playingMsgIdRef = useRef(null)
  const listRef = useRef(null)
  const textareaRef = useRef(null)
  const initialTriggered = useRef(false)
  const summaryTriggered = useRef(false)
  const targetReachedRef = useRef(false)
  const endingRef = useRef(false)
  const isSendingRef = useRef(false)
  const [sessionConfirmedCount, setSessionConfirmedCount] = useState(0)

  const [analysisResults, setAnalysisResults] = useState({})
  // Hints 默认收起
  const [hintsExpandedMap, setHintsExpandedMap] = useState({})
  // Correction & Tips 合并气泡，默认展开
  const [correctionTipsExpandedMap, setCorrectionTipsExpandedMap] = useState({})
  const [userCorrections, setUserCorrections] = useState({})

  // ===== Agent 2 拆分后的新状态 =====
  const [correctionResult, setCorrectionResult] = useState(null)           // 来自 2A
  const [grammarAnalysis, setGrammarAnalysis] = useState(null)            // 来自 2B
  const [hintsResult, setHintsResult] = useState(null)                    // 来自 2C
  const [extractedCorrections, setExtractedCorrections] = useState(null)  // 来自 2D
  const [tips, setTips] = useState([])                                    // 来自 2E.tips
  const [knowledgePoints, setKnowledgePointsState] = useState([])         // 来自 2E.knowledgePoints
  const [lastUserMessageId, setLastUserMessageId] = useState(null)
  const [isProcessing, setIsProcessing] = useState({
    spelling: false,
    grammar: false,
    hints: false,
    extraction: false,
    summary: false
  })

  // ── 继续对话：从 initial* props 预填 state ──────────────────
  const continueInitializedRef = useRef(false)
  // 渲染阶段立即检查 initialMessages，确保 isChatStarted effect 能可靠检测到
  if (initialMessages && initialMessages.length > 0 && !continueInitializedRef.current) {
    continueInitializedRef.current = true
  }
  const initialMessagesRef = useRef(initialMessages)
  const initialAnalysisRef = useRef(initialAnalysis)
  const initialCorrectionsRef = useRef(initialCorrections)
  const initialKnowledgePointsRef = useRef(initialKnowledgePoints)
  const initialTodosRef = useRef(initialTodos)
  const initialRoundCountRef = useRef(initialRoundCount)
  const initialSummaryDoneRef = useRef(initialSummaryDone)
  const initialContinueFromIdRef = useRef(initialContinueFromId)
  useEffect(() => {
    initialMessagesRef.current = initialMessages
    initialAnalysisRef.current = initialAnalysis
    initialCorrectionsRef.current = initialCorrections
    initialKnowledgePointsRef.current = initialKnowledgePoints
    initialTodosRef.current = initialTodos
    initialRoundCountRef.current = initialRoundCount
    initialSummaryDoneRef.current = initialSummaryDone
    initialContinueFromIdRef.current = initialContinueFromId
  })
  useEffect(() => {
    const im = initialMessagesRef.current
    if (im) {
      if (!continueInitializedRef.current) {
        continueInitializedRef.current = true
      }
      setMessages(im)
      setUserCorrections(initialCorrectionsRef.current || {})
      setAnalysisResults(initialAnalysisRef.current || {})
      setKnowledgePointsState(initialKnowledgePointsRef.current || [])
      setRoundCount(initialRoundCountRef.current || 0)
      if (initialSummaryDoneRef.current) {
        setSummaryDone(true)
      }
      // 如果 AI 已经错误启动（时序问题），重置加载状态
      if (initialTriggered.current) {
        setLoading(false)
        setAiStarted(false)
      }
      if (initialTodosRef.current) {
        setTodos(initialTodosRef.current)
      }
    }
  }, [initialMessages])

  // ── 卸载保存所需的 refs（始终持有最新 state 快照）─────────────
  const unmountStateRef = useRef({})
  const latestStateRef = useRef({})
  useEffect(() => {
    const snap = {
      messages,
      userCorrections,
      analysisResults,
      knowledgePoints,
      todos,
      roundCount,
      sessionConfirmedCount,
      summaryDone,
      conversationContext: conversationContextRef?.current,
      language,
      initialContinueFromId: initialContinueFromIdRef.current,
    }
    unmountStateRef.current = snap
    latestStateRef.current = snap
  })

  const generateMessageId = () => `msg-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`

  const toggleHintsForMessage = (messageId) => {
    setHintsExpandedMap(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }))
  }

  const toggleCorrectionTipsForMessage = (messageId) => {
    setCorrectionTipsExpandedMap(prev => ({
      ...prev,
      [messageId]: prev[messageId] === undefined ? false : !prev[messageId]
    }))
  }

  const [todos, setTodos] = useState([])

  // ── 快照组装（从 ref 读取最新状态，避免闭包过期）───────────
  const buildSessionSnapshot = useCallback((endedNormally) => {
    const s = latestStateRef.current
    const ctx = s.conversationContext || conversationContextRef?.current
    if (!ctx) return null
    const currentScenarios = SCENARIOS[s.language] || SCENARIOS.en
    const scenarioLabel = currentScenarios.find((sc) => sc.value === ctx.scenario)?.label || ctx.scenario

    const snapshot = {
      id: s.initialContinueFromId || `conv-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
      language: s.language,
      date: getLocalDateString(),
      timestamp: new Date().toISOString(),
      endedNormally,
      isAssessment: !!ctx.isAssessment,
      scenario: ctx.scenario,
      scenarioLabel,
      goal: ctx.goal || '',
      sensitivity: ctx.sensitivity || 'normal',
      maxRounds: ctx.maxRounds ?? 10,
      targetKnowledge: ctx.targetKnowledge ?? 0,
      roundCount: s.roundCount,
      todos: (s.todos || []).map((t) => ({ id: t.id, text: t.text, completed: t.completed })),
      messages: (s.messages || []).map((m) => ({ id: m.id, role: m.role, content: m.content, summaryData: m.summaryData || undefined })),
      corrections: { ...(s.userCorrections || {}) },
      analysis: { ...(s.analysisResults || {}) },
      knowledgePoints: (s.knowledgePoints || []).map((kp) => ({ ...kp })),
      sessionConfirmedCount: s.sessionConfirmedCount || 0,
      continueFromId: s.initialContinueFromId || null,
    }
    debug.log(`[buildSessionSnapshot] endedNormally=${endedNormally} id=${snapshot.id} continueFromId=${snapshot.continueFromId} initialContinueFromId=${s.initialContinueFromId}`)
    return snapshot
  }, [])

  // ── 组件卸载时保存（对话被中断）────────────────────────────
  const savedOnUnloadRef = useRef(false)
  useEffect(() => {
    const handleBeforeUnload = () => {
      // 防止 beforeunload 事件 + React cleanup 双重调用产生重复记录
      if (savedOnUnloadRef.current) return
      savedOnUnloadRef.current = true

      const s = unmountStateRef.current
      debug.log(`[handleBeforeUnload] messages.length=${s.messages?.length || 0} summaryDone=${s.summaryDone} initialContinueFromId=${s.initialContinueFromId}`)
      if (!s.messages || s.messages.length === 0) return
      if (s.summaryDone) return
      // 用 buildSessionSnapshot（从 latestStateRef 读取）构建快照
      const session = buildSessionSnapshot(false)
      if (!session) return
      // 同步写入 localStorage（beforeunload 中必须同步）
      const key = s.language === 'ja' ? 'ja_conversation_history' : 'en_conversation_history'
      try {
        const raw = localStorage.getItem(key)
        const list = raw ? JSON.parse(raw) : []
        if (!Array.isArray(list)) return
        // 先移除同 id 的旧记录（防止 StrictMode 双挂载产生重复）
        const existingIdx = list.findIndex((e) => e.id === session.id)
        if (existingIdx !== -1) list.splice(existingIdx, 1)
        list.unshift(session)
        if (list.length > 50) list.length = 50
        localStorage.setItem(key, JSON.stringify(list))
      } catch { /* 静默失败 */ }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      stopSpeaking()
      playingMsgIdRef.current = null
      setSpeakingMsgId(null)
      // 如果已通过 handleBackToIdle 或 summaryDone 保存，跳过卸载保存
      if (summarySavedRef.current) return
      handleBeforeUnload()
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  useEffect(() => {
    if (isChatStarted && ctx?.goal) {
      // 继续对话时跳过 TODO 重置，保留从 initialTodos 加载的状态
      if (continueInitializedRef.current) return
      const lines = ctx.goal.split('\n').filter((l) => l.trim())
      const items = lines.map((text, i) => ({
        id: i,
        text: text.trim(),
        completed: false,
      }))
      setTodos(items)
    } else if (!isChatStarted) {
      setTodos([])
    }
  }, [isChatStarted])

  const ctx = conversationContextRef?.current
  const maxRounds = ctx?.maxRounds ?? 10
  const isMaxReached = isChatStarted && roundCount >= maxRounds

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight
        }
      }, 50)
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (isMuted) return
    const lastMsg = messages[messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant' && !lastMsg._autoPlayed) {
      lastMsg._autoPlayed = true
      const timer = setTimeout(() => {
        speak(lastMsg.content, language)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [messages, language])

  useEffect(() => {
    if (isChatStarted && !initialTriggered.current) {
      initialTriggered.current = true

      // 检查 continueInitializedRef 判断是否已由前序 effect 加载了初始消息
      if (continueInitializedRef.current) {
        // 从 ref 读取并设置消息/分析/纠错等
        const initMsgs = initialMessagesRef.current
        if (initMsgs && initMsgs.length > 0) {
          setMessages(initMsgs)
          const initAnalysis = initialAnalysisRef.current
          if (initAnalysis) setAnalysisResults(initAnalysis)
          const initCorrections = initialCorrectionsRef.current
          if (initCorrections) setUserCorrections(initCorrections)
          const initKps = initialKnowledgePointsRef.current
          if (initKps) setKnowledgePointsState(initKps)
          setRoundCount(initialRoundCountRef.current || 0)
        }
        setLoading(false)
        setAiStarted(false)
        return
      }

      // 再通过 ref 检查（回退方案）
      const initMsgs = initialMessagesRef.current
      if (initMsgs && initMsgs.length > 0) {
        continueInitializedRef.current = true
        setMessages(initMsgs)
        // 预填 analysisResults / corrections / knowledgePoints
        const initAnalysis = initialAnalysisRef.current
        if (initAnalysis) {
          setAnalysisResults(initAnalysis)
        }
        const initCorrections = initialCorrectionsRef.current
        if (initCorrections) {
          setUserCorrections(initCorrections)
        }
        const initKps = initialKnowledgePointsRef.current
        if (initKps) {
          setKnowledgePointsState(initKps)
        }
        setRoundCount(initialRoundCountRef.current || 0)
        setLoading(false)
        setAiStarted(false)
        return
      }

      setAiStarted(true)
      setLoading(true)

      setSessionConfirmedCount(0)
      lastConfirmedCountRef.current = getConfirmedCount ? getConfirmedCount() : 0
      debug.log(`[ChatArea] 新会话开始，知识点计数已重置为 0，当前全局已确认数: ${lastConfirmedCountRef.current}`)

      const doAiStart = async () => {
        const reply = await sendToAI(
          t('aiStartPrompt'),
          [],
          ctx,
          false,
          language
        )
        const { mainText } = parseAIReply(reply)
        const openingAiMsgId = generateMessageId()
        const aiMessage = { id: openingAiMsgId, role: 'assistant', content: mainText }

        // 预先初始化 analysisResults（确保渲染时已存在）
        setAnalysisResults(prev => ({
          ...prev,
          [openingAiMsgId]: {
            tips: [],
            hints: null,
            spellingCorrection: null,
            grammarCorrections: []
          }
        }))

        setMessages([aiMessage])
        setLoading(false)
        setAiStarted(false)

        // 开场消息：评估模式下跳过 Agent 调用
        if (!ctx?.isAssessment) {
          Promise.all([
            generateHints(mainText, language, false, ctx?.goal),
            extractCorrectionsFromReply(mainText, language, false)
          ]).then(([hintsResult, extractionResult]) => {
            // 使用 2D 的 cleanedReply 更新开场消息内容（清除教学建议）
            if (extractionResult?.cleanedReply) {
              setMessages(prev => prev.map(msg =>
                msg.id === openingAiMsgId
                  ? { ...msg, content: extractionResult.cleanedReply }
                  : msg
              ))
            }
            setAnalysisResults(prev => ({
              ...prev,
              [openingAiMsgId]: {
                ...prev[openingAiMsgId],
                hints: hintsResult?.hints?.suggestions?.length > 0 ? hintsResult.hints : null,
                extractedCorrections: extractionResult
              }
            }))
          }).catch(err => {
            debug.error('[Agent 2C/2D] 开场Agent调用失败:', err)
          })
        }
      }

      doAiStart()
    }
  }, [isChatStarted, ctx, onSidebarUpdate])

  const lastConfirmedCountRef = useRef(0)
  useEffect(() => {
    if (!isChatStarted) return
    const currentCount = getConfirmedCount ? getConfirmedCount() : 0
    const lastCount = lastConfirmedCountRef.current

    if (currentCount > lastCount) {
      const increment = currentCount - lastCount
      setSessionConfirmedCount((prev) => {
        const newCount = prev + increment
  
        return newCount
      })
      // stats now computed from conversation records directly
    }
    lastConfirmedCountRef.current = currentCount
  }, [getConfirmedCount, isChatStarted])

  useEffect(() => {
    if (isMaxReached && !loading && !summaryDone && !summaryTriggered.current && !endingRef.current && messages.length > 0) {
      debug.log(`[ChatArea] 自动检测到轮次上限，触发总结生成 (messages: ${messages.length})`)
      endingRef.current = true
      triggerSummary(messages)
    }
  }, [isMaxReached, loading, summaryDone, messages.length])

  useEffect(() => {
    if (
      !isChatStarted ||
      loading ||
      summaryDone ||
      summaryTriggered.current ||
      targetReachedRef.current ||
      endingRef.current ||
      messages.length === 0
    ) return

    const target = targetKnowledge ?? ctx?.targetKnowledge ?? 0

    if (target > 0 && sessionConfirmedCount >= target) {

      debug.log('[ChatArea] 知识点目标已达到，标记 targetReachedRef，下一轮发送将触发收尾')
      targetReachedRef.current = true
    }
  }, [sessionConfirmedCount, targetKnowledge, isChatStarted, loading, summaryDone, messages, ctx])

  const getSystemMessage = () => {
    if (!ctx) return ''
    if (ctx.isAssessment) {
      return {
        scenarioName: language === 'ja' ? '🔍 レベル診断' : '🔍 Level Assessment',
        sensitivity: '-',
        maxRounds: ctx.maxRounds,
        targetKnowledge: '-',
      }
    }
    const currentScenarios = SCENARIOS[language] || SCENARIOS.en
    const currentSensitivityLabels = SENSITIVITY_LABELS[language] || SENSITIVITY_LABELS.en
    const scenarioLabel = currentScenarios.find((s) => s.value === ctx.scenario)?.label || ctx.scenario
    const sensitivityLabel = currentSensitivityLabels[ctx.sensitivity] || ctx.sensitivity
    return {
      scenarioName: scenarioLabel,
      sensitivity: sensitivityLabel,
      maxRounds: ctx.maxRounds,
      targetKnowledge: ctx.targetKnowledge,
    }
  }

  const triggerSummary = useCallback(async (currentMessages) => {
    if (summaryTriggered.current || summaryDone) return
    summaryTriggered.current = true
    setSummaryLoading(true)
    setSummaryError(false)

    try {
      const conversationHistory = currentMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
      const summary = await generateSummary(conversationHistory, ctx, language)

      let summaryData = null
      try {
        summaryData = JSON.parse(summary)
        if (!summaryData.completion || !summaryData.strengths || !summaryData.weaknesses ||
            !summaryData.newKnowledge || !summaryData.suggestions) {
          summaryData = null
        } else {
          // Handle proficiency assessment
          const pa = summaryData.proficiencyAssessment
          if (pa && typeof pa.currentScore === 'number') {
            // Apply 0.05 threshold: changes <= 0.05 are treated as "same"
            if (pa.scoreChange !== undefined && Math.abs(pa.scoreChange) <= 0.05) {
              pa.direction = 'same'
              pa.scoreChange = 0
            }
            if (onProficiencyChange) {
              onProficiencyChange(pa.currentScore, pa.summary || 'Conversation summary')
            }
            debug.proficiency(
              `[Summary] Proficiency assessment: ${pa.currentScore.toFixed(2)} ` +
              `(${pa.direction === 'up' ? '↑' : pa.direction === 'down' ? '↓' : '→'} ` +
              `${Math.abs(pa.scoreChange || 0).toFixed(2)}) — ${pa.summary || ''}`
            )
          } else if (pa) {
            debug.proficiency('[Summary] proficiencyAssessment found but onProficiencyChange not available, skipping score update.')
          }
        }
      } catch {
      }

      const summaryMessage = {
        role: 'summary',
        content: summary,
        summaryData,
      }
      setMessages((prev) => [...prev, summaryMessage])
      setTimeout(scrollToBottom, 100)
    } catch {
      const fallbackMessage = {
        role: 'summary',
        content: t('conversationEnded'),
      }
      setMessages((prev) => [...prev, fallbackMessage])
      setSummaryError(true)
      setTimeout(scrollToBottom, 100)
    }
    setSummaryLoading(false)
    setSummaryDone(true)
    // stats now computed from conversation records directly
  }, [ctx, scrollToBottom, language])

  const handleEndConversation = useCallback(async () => {
    if (endingRef.current || summaryDone || summaryTriggered.current) return
    stopSpeaking()
    playingMsgIdRef.current = null
    setSpeakingMsgId(null)
    endingRef.current = true
    setShowEndConfirm(false)

    debug.log('[ChatArea] 执行统一结束流程')

    let currentMessages = []
    setMessages((prev) => {
      currentMessages = prev
      return prev
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    if (currentMessages.length === 0) {
      setSummaryDone(true)
      // stats now computed from conversation records directly
      return
    }

    await triggerSummary(currentMessages)
  }, [summaryDone, triggerSummary, language])

  // 正常结束后保存快照（监听 summaryDone 确保 summary 已写入 messages）
  const summarySavedRef = useRef(false)
  useEffect(() => {
    if (summaryDone && messages.length > 0 && !summarySavedRef.current) {
      summarySavedRef.current = true
      // 在 setTimeout 之前立刻捕获快照，避免 initialContinueFromId 因卸载被清空
      const snapshot = buildSessionSnapshot(true)
      const timer = setTimeout(() => {
        onConversationEnd?.(snapshot)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [summaryDone, messages.length, onConversationEnd, buildSessionSnapshot])

  const handleBackToIdle = useCallback(() => {
    stopSpeaking()
    playingMsgIdRef.current = null
    setSpeakingMsgId(null)
    setShowBackConfirm(false)
    debug.log('[ChatArea] 用户点击返回，放弃当前对话，不生成总结')
    if (messages.length > 0) {
      summarySavedRef.current = true
      onConversationEnd?.(buildSessionSnapshot(false))
    }
    if (onReset) onReset()
  }, [onReset, messages.length, onConversationEnd, buildSessionSnapshot])

  const detectConversationEnd = useCallback((aiMessage) => {
    if (aiMessage.conversationEnded) {
      debug.log('[ChatArea] AI 回复包含 [CONVERSATION_ENDED] 标记，触发结束')
      return true
    }

    const farewellPatterns = [
      /\b(goodbye|farewell)\b/i,
      /\bhave a great (day|weekend|evening|week)\b/i,
      /\benjoy your\b/i,
      /\bconversation has (ended|finished|concluded)\b/i,
    ]
    const text = aiMessage.mainText || aiMessage.content || ''
    const hasFarewell = farewellPatterns.some((p) => p.test(text))

    if (hasFarewell) {
      debug.log('[ChatArea] AI 回复包含告别语，触发结束')
      return true
    }

    return false
  }, [])

  // ===== 处理知识点（去重 + SM-2 重置/创建）=====
  const processKnowledgePoints = useCallback(async (points, context) => {
    if (!points || points.length === 0 || !onAddKnowledgePoint) return

    // 使用从 App 传入的已有知识点列表
    const existingPoints = existingKnowledgePoints || []

    for (const point of points) {
      try {
        // 检查是否已存在（通过 word + type 去重）
        const existing = existingPoints.find(
          p => p.word?.toLowerCase() === point.word?.toLowerCase() && p.type === point.type && p.status !== 'deleted'
        )

        if (existing) {
          // 已存在：重置 SM-2 数据（标记为不熟悉）
          if (onUpdatePoint) {
            onUpdatePoint(existing.id, {
              repetitions: 0,
              easeFactor: 2.5,
              interval: 0,
              nextReview: getLocalDateString(),
              status: 'active',
              confirmed: false
            })
            debug.log("[processKnowledgePoints] 重置已有知识点:", point.word)
          }
        } else {
          // 不存在：创建新知识点
          if (point.type === 'grammar') {
            // 语法知识点直接添加，不调用查词
            // 使用 source='grammar_correction' 以绕过 useKnowledgePoints 的中文释义检查
            onAddKnowledgePoint({
              word: point.word,
              type: 'grammar',
              meaning: point.meaning || '',
              meaningChinese: point.meaningChinese || '',
              phonetic: '',
              context: context || '',
              source: 'grammar_correction'
          })
          } else if (point.type === 'phrase') {
            // 短语知识点：调用查词 API 获取释义
            try {
              const knowledge = await extractSpecificKnowledge(
                { type: 'user_asked', word: point.word },
                context || '',
                language
              )
              if (knowledge && knowledge.meaning) {
                onAddKnowledgePoint({
                  ...knowledge,
                  context: context || '',
                  source: 'spelling_correction'
                })
              } else {
                // 查词失败，使用 2E 提供的基本信息
                onAddKnowledgePoint({
                  word: point.word,
                  type: 'phrase',
                  meaning: point.meaning || '',
                  meaningChinese: point.meaningChinese || '',
                  phonetic: '',
                  context: context || '',
                  source: 'spelling_correction'
                })
              }
            } catch (err) {
              debug.warn('[processKnowledgePoints] 短语查词失败:', point.word, err)
              onAddKnowledgePoint({
                word: point.word,
                type: 'phrase',
                meaning: point.meaning || '',
                meaningChinese: point.meaningChinese || '',
                phonetic: '',
                context: context || '',
                source: 'spelling_correction'
              })
            }
          } else if (point.type === 'word') {
            // 单词知识点：调用查词 API 获取完整信息（音标、释义、例句）
            try {
              const knowledge = await extractSpecificKnowledge(
                { type: 'user_asked', word: point.word },
                context || '',
                language
              )
              if (knowledge && knowledge.meaning) {
                onAddKnowledgePoint({
                  ...knowledge,
                  context: context || '',
                  source: 'spelling_correction'
                })
              } else {
                // 查词失败，使用基本信息
                onAddKnowledgePoint({
                  word: point.word,
                  type: 'word',
                  meaning: point.meaning || '',
                  meaningChinese: '',
                  phonetic: '',
                  context: context || '',
                  source: 'spelling_correction'
                })
              }
            } catch (err) {
              debug.warn('[processKnowledgePoints] 查词失败:', point.word, err)
              onAddKnowledgePoint({
                word: point.word,
                type: 'word',
                meaning: point.meaning || '',
                meaningChinese: '',
                phonetic: '',
                context: context || '',
                source: 'spelling_correction'
              })
            }
          } else {
            // 未知类型，按 word 处理
            try {
              const knowledge = await extractSpecificKnowledge(
                { type: 'user_asked', word: point.word },
                context || '',
                language
              )
              if (knowledge && knowledge.meaning) {
                onAddKnowledgePoint({
                  ...knowledge,
                  context: context || '',
                  source: 'spelling_correction'
                })
              } else {
                onAddKnowledgePoint({
                  word: point.word,
                  type: 'word',
                  meaning: point.meaning || '',
                  meaningChinese: '',
                  phonetic: '',
                  context: context || '',
                  source: 'spelling_correction'
                })
              }
            } catch (err) {
              debug.warn('[processKnowledgePoints] 处理知识点失败:', point.word, err)
            }
          }
        }
      } catch (err) {
        debug.warn('[processKnowledgePoints] 处理知识点失败:', point.word, err)
      }
    }
  }, [existingKnowledgePoints, onAddKnowledgePoint, onUpdatePoint, language])

  const handleSend = async () => {
    const text = input.trim()

    if (!text || loading || isMaxReached || endingRef.current || isSendingRef.current) {
      if (isSendingRef.current) {
        debug.warn('[ChatArea handleSend] 检测到并发发送请求，已阻止')
      }
      return
    }
    isSendingRef.current = true

    const lastMsg = messages[messages.length - 1]
    if (lastMsg && lastMsg.role === 'user' && lastMsg.content === text) {
      debug.warn('[ChatArea handleSend] 检测到重复的用户消息，跳过本次发送')
      isSendingRef.current = false
      return
    }

    setInput('')

    // 立即创建并显示用户消息（无需等待 Agent 返回）
    const userMessageId = generateMessageId()
    const userMessage = {
      id: userMessageId,
      role: 'user',
      content: text
    }
    setMessages(prev => [...prev, userMessage])
    setLoading(true)
    setLastUserMessageId(userMessageId)



    const isLastRound = roundCount + 1 >= maxRounds
    const targetReached = targetReachedRef.current

    const endKeywords = ['goodbye', 'bye', 'see you', 'that\'s all', 'i have to go', 'see ya', 'talk to you later', 'bye-bye', 'good bye', 'gotta go', 'have to go', 'i\'m done', 'that is all', 'that\'s it']
    const userEnding = endKeywords.some(kw => text.toLowerCase().includes(kw))

    const conversationHistory = [...messages, { role: 'user', content: text }].map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // ===== 先检查 TODO 完成情况（在 AI 回复之前）=====
    const isAssessment = ctx?.isAssessment === true
    let allTasksDone = targetReached
    if (todos.length > 0 && ctx?.goal && !isAssessment) {
      const latestMsgs = conversationHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }))
      const newCompleted = await checkTaskCompletion(ctx.goal, todos, latestMsgs, language)
      if (newCompleted.length > 0) {
        debug.log('[ChatArea] checkTaskCompletion 检测到新完成任务:', newCompleted)
        const updatedTodos = todos.map((t) =>
          newCompleted.includes(t.id + 1) ? { ...t, completed: true } : t
        )
        setTodos(updatedTodos)
        allTasksDone = updatedTodos.every((t) => t.completed)
        if (allTasksDone) {
          debug.log('[ChatArea] 所有 TODO 任务已完成，本轮直接触发收尾')
          targetReachedRef.current = true
        }
      }
    }

    const effectiveLastRound = isLastRound || allTasksDone || userEnding
    if (userEnding) {
      debug.log('检测到用户结束意图，强制触发收尾')
    }
    if (allTasksDone && !targetReached) {
      debug.log('TODO 全部完成，本轮 isLastRound=true，AI 将直接结束对话')
    }

    try {
      // ===== 预先创建 AI 消息 ID，用于后续 analysisResults 初始化 =====
      const aiMessageId = generateMessageId()

      // ===== 立即初始化 analysisResults（确保渲染时已存在）=====
      setAnalysisResults(prev => ({
        ...prev,
        [aiMessageId]: {
          tips: [],
          hints: null,
          spellingCorrection: null,
          grammarCorrections: []
        }
      }))

      // ===== Step 1: 仅 Agent 1（评估模式下跳过 Agent 2 全部）=====
      const sensitivity = ctx?.sensitivity || 'normal'

      let spellCheckResultValue = null
      if (!isAssessment) {
        setIsProcessing(prev => ({ ...prev, spelling: true }))
      }

      const [agent1Result, spellCheckResult] = await Promise.allSettled([
        sendToAI(text, conversationHistory, ctx, effectiveLastRound, language),
        isAssessment ? Promise.resolve(null) : correctUserMessage(text, sensitivity, language)
      ])

      const agent1Reply = agent1Result.status === 'fulfilled' ? agent1Result.value : null

      if (!isAssessment) {
        setIsProcessing(prev => ({ ...prev, spelling: false }))
        spellCheckResultValue = spellCheckResult.status === 'fulfilled' ? spellCheckResult.value : null
      }

      // Agent 1 失败时的降级处理
      if (!agent1Reply) {
        debug.error('[handleSend] Agent 1 (sendToAI) failed:', agent1Result.reason)
        const errorMessage = {
          id: generateMessageId(),
          role: 'assistant',
          content: t('chatError')
        }
        setMessages(prev => [...prev, errorMessage])
        setLoading(false)
        isSendingRef.current = false
        return
      }

      if (spellCheckResult && spellCheckResult.status === 'rejected' && !isAssessment) {
        debug.warn('[handleSend] Agent 2A (correctUserMessage) failed:', spellCheckResult.reason)
      }

      if (!isAssessment) setCorrectionResult(spellCheckResultValue)

      const parsed = parseAIReply(agent1Reply)
      let { mainText, goalAchieved } = parsed

      // === 4.1 Fix: 收尾轮 AI 以问号结尾时替换为结束语 ===
      if (effectiveLastRound) {
        const endsWithQuestion = /[?？]\s*$/.test(mainText)
        if (endsWithQuestion) {
          mainText = mainText.replace(/[?？]\s*$/, '。')
          if (mainText.trim().length < 10) {
            const closing = language === 'ja'
              ? 'これで会話を終わります。練習お疲れ様でした。'
              : '我们的对话就到这里。继续加油练习吧！'
            mainText = mainText.trim() + ' ' + closing
          }
          debug.log('[ChatArea] 4.1 修复：AI 最后一句以问号结尾，已替换为结束语')
        }
      }

      let aiMessage

      if (!isAssessment) {
      // ===== Step 2: Agent 2B - 语法分析（基于用户原文 vs 纠正后）=====
      setIsProcessing(prev => ({ ...prev, grammar: true }))
      const correction = spellCheckResultValue?.correction
      const correctedText = correction?.corrected || text
      const grammarResult = await analyzeGrammar(text, correctedText, conversationHistory, sensitivity, language)
      setIsProcessing(prev => ({ ...prev, grammar: false }))
      setGrammarAnalysis(grammarResult)

      // ===== Step 3: Agent 1 返回后，并行调用 Agent 2C + Agent 2D =====
      setIsProcessing(prev => ({ ...prev, hints: true, extraction: true }))

      const [hintsSettled, extractionSettled] = await Promise.allSettled([
        generateHints(mainText, language, effectiveLastRound, ctx?.goal),
        extractCorrectionsFromReply(mainText, language, effectiveLastRound)
      ])

      setIsProcessing(prev => ({ ...prev, hints: false, extraction: false }))

      const hintsResult = hintsSettled.status === 'fulfilled' ? hintsSettled.value : null
      const extractionResult = extractionSettled.status === 'fulfilled' ? extractionSettled.value : null

      if (hintsSettled.status === 'rejected') {
        debug.warn('[handleSend] Agent 2C (generateHints) failed:', hintsSettled.reason)
      }
      if (extractionSettled.status === 'rejected') {
        debug.warn('[handleSend] Agent 2D (extractCorrectionsFromReply) failed:', extractionSettled.reason)
      }

      setHintsResult(hintsResult)
      setExtractedCorrections(extractionResult)
      // ===== Step 4: Agent 2E - 汇总 Tips 并提取知识点 =====
      setIsProcessing(prev => ({ ...prev, summary: true }))
      const summaryResult = await summarizeTipsAndExtractKnowledge(
        grammarResult,
        extractionResult,
        sensitivity,
        language
      )
      setIsProcessing(prev => ({ ...prev, summary: false }))

      const mergedTips = summaryResult?.tips || []
      const extractedKps = summaryResult?.knowledgePoints || []
      setTips(mergedTips)
      setKnowledgePointsState(extractedKps)

      // ===== 构建 Correction 气泡数据（字符级 diff 标注）=====
      let correctionData = null
      if (correction && correction.original === text && correction.corrected !== text) {
        // 使用字符级 diff 生成带标注的 HTML
        // - 删除的字符标为红色删除线 (.corr-removed)
        // - 新增的字符标为绿色 (.corr-added)
        const annotatedHtml = generateCorrectionHtml(text, correction.corrected)

        correctionData = {
          original: text,
          corrected: correction.corrected,
          annotatedHtml: annotatedHtml,
          explanation: correction.explanation || ''
        }

      }

      // ===== 处理知识点（Agent 2E 提取的）=====
      if (extractedKps && extractedKps.length > 0) {
        processKnowledgePoints(extractedKps, text)
      }

      // ===== 使用 2D 的 cleanedReply（如果存在）作为 AI 消息内容 =====
      // cleanedReply 移除了教学建议，只保留纯对话内容
      const cleanedContent = extractionResult?.cleanedReply || mainText
      aiMessage = {
        id: aiMessageId,
        role: 'assistant',
        content: cleanedContent
      }
      if (extractionResult?.cleanedReply) {

      }

      // 一次性添加 AI 回复
      setMessages(prev => [...prev, aiMessage])

      // 存储 Correction 数据
      if (correctionData) {
        setUserCorrections(prev => ({
          ...prev,
          [userMessageId]: correctionData
        }))
      }

      // 存储分析结果到 analysisResults（用于 Tips/Hints 渲染）
      // 注意：2E (summarizeTipsAndExtractKnowledge) 已经合并了 2D 的 extractedCorrections
      const newAnalysisResult = {
        tips: mergedTips,
        hints: hintsResult?.hints || null,
        spellingCorrection: spellCheckResultValue || null,
        grammarCorrections: grammarResult?.corrections || []
      }

      setAnalysisResults(prev => ({
        ...prev,
        [aiMessage.id]: newAnalysisResult
      }))

      } else {
        // Assessment mode: skip all Agent 2, just add the AI reply directly
        aiMessage = {
          id: aiMessageId,
          role: 'assistant',
          content: mainText
        }
        setMessages(prev => [...prev, aiMessage])
      }

      setRoundCount((prev) => prev + 1)

      const aiEnded = detectConversationEnd(parsed)
      const shouldEnd = effectiveLastRound || aiEnded || goalAchieved

      if (goalAchieved) {
        debug.log('[ChatArea] AI 检测到对话目标已完成 [GOAL_ACHIEVED]，触发结束流程')
      }

      if (shouldEnd && !summaryDone && !summaryTriggered.current && !endingRef.current) {
        debug.log('[ChatArea] 收尾轮 AI 回复完成，触发总结生成')
        endingRef.current = true

        setTimeout(async () => {
          const updatedMessages = [...messages, userMessage, aiMessage]
          await triggerSummary(updatedMessages)
        }, 100)
      } else {
        debug.log(`[ChatArea] 本轮不触发结束: shouldEnd=${shouldEnd}, summaryDone=${summaryDone}, summaryTriggered=${summaryTriggered.current}, endingRef=${endingRef.current}`)
      }
    } catch (error) {
      debug.error('[ChatArea] 发送失败:', error)
    } finally {
      setLoading(false)
      isSendingRef.current = false
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  // P3-1: textarea 自适应高度（最大 120px）
  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [])

  useEffect(() => {
    autoResize()
  }, [input, autoResize])

  const handleNewConversation = () => {
    stopSpeaking()
    setMessages([])
    setInput('')
    setLoading(false)
    setRoundCount(0)
    setAiStarted(false)
    setSummaryLoading(false)
    setSummaryDone(false)
    setSummaryError(false)
    setShowEndConfirm(false)
    setShowBackConfirm(false)
    initialTriggered.current = false
    summaryTriggered.current = false
    targetReachedRef.current = false
    endingRef.current = false
    isSendingRef.current = false
    setSessionConfirmedCount(0)
    setSpeakingMsgId(null)
    playingMsgIdRef.current = null
    setTodos([])
    setAnalysisResults({})
    setHintsExpandedMap({})
    setCorrectionTipsExpandedMap({})
    setUserCorrections({})
    setCorrectionResult(null)
    setGrammarAnalysis(null)
    setHintsResult(null)
    setExtractedCorrections(null)
    setTips([])
    setKnowledgePointsState([])
    setLastUserMessageId(null)
    setIsProcessing({
      spelling: false,
      grammar: false,
      hints: false,
      extraction: false,
      summary: false
    })
    if (onReset) onReset()
  }

  if (!isChatStarted) {
    return (
      <div className="chat-area">
        <div className="chat-messages">
          <p className="chat-placeholder">{t('chatPlaceholder')}</p>
        </div>
      </div>
    )
  }

  const BouncingDots = () => (
    <div className="typing-dots">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  )

  return (
    <div className="chat-area">
      {showBackConfirm && (
        <div className="chat-end-overlay" onClick={() => setShowBackConfirm(false)}>
          <div className="chat-end-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="chat-end-dialog-title">{t('endDialogTitle')}</div>
            <div className="chat-end-dialog-text">
              {t('endDialogBackText')}
            </div>
            <div className="chat-end-dialog-actions">
              <button className="chat-end-dialog-cancel" onClick={() => setShowBackConfirm(false)}>{t('confirmCancel')}</button>
              <button className="chat-end-dialog-confirm" onClick={handleBackToIdle}>{t('endDialogEnd')}</button>
            </div>
          </div>
        </div>
      )}

      {showEndConfirm && (
        <div className="chat-end-overlay" onClick={() => setShowEndConfirm(false)}>
          <div className="chat-end-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="chat-end-dialog-title">{t('endDialogTitle')}</div>
            <div className="chat-end-dialog-text">
              {t('endDialogEndText')}
            </div>
            <div className="chat-end-dialog-actions">
              <button className="chat-end-dialog-cancel" onClick={() => setShowEndConfirm(false)}>{t('confirmCancel')}</button>
              <button className="chat-end-dialog-confirm" onClick={handleEndConversation}>{t('endDialogEnd')}</button>
            </div>
          </div>
        </div>
      )}

      <div className={`chat-header-row ${isNarrow ? 'chat-header-narrow' : ''}`}>
        {/* ── Back button (always on left) ── */}
        {!summaryDone && !summaryLoading && (
          <button className="chat-back-btn" onClick={() => setShowBackConfirm(true)} title={t('backToHomeTooltip')}>{t('quizBack')}</button>
        )}

        {/* ── TODO list (center, always visible) ── */}
        {todos.length > 0 && (
          <div className={`chat-todo-list ${isNarrow ? 'chat-todo-wide' : ''}`}>
            <div className="chat-todo-title">{t('todo')}</div>
            <div className="chat-todo-items">
              {todos.map((t) => (
                <div key={t.id} className={`chat-todo-item ${t.completed ? 'completed' : ''}`}>
                  <span className="chat-todo-checkbox">{t.completed ? '☑' : '☐'}</span>
                  <span className="chat-todo-text">{t.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Scenario info (right) ── */}
        {!isNarrow && (
          <div className="chat-system-msg">
            {(() => {
              const info = getSystemMessage()
              if (!info) return null
              return (
                <>
                  <div className="scenario-name">📋 {info.scenarioName}</div>
                  <div className="detail-line">{t('sensitivityInfoLabel')} {info.sensitivity}</div>
                  <div className="detail-line">{t('maxRoundsInfoLabel')} {info.maxRounds}</div>
                  <div className="detail-line">{t('targetKnowledgeInfoLabel')} {info.targetKnowledge}</div>
                </>
              )
            })()}
          </div>
        )}
        {isNarrow && (
          <>
            <button className="chat-sysinfo-btn" onClick={() => setShowSysInfo((v) => !v)} title="Scenario info">
              📋
            </button>
            {showSysInfo && (
              <>
                <div className="chat-sysinfo-backdrop" onClick={() => setShowSysInfo(false)} />
                <div className="chat-sysinfo-popup">
                  {(() => {
                    const info = getSystemMessage()
                    if (!info) return null
                    return (
                      <>
                        <div className="chat-sysinfo-row"><strong>{t('scenarioInfoLabel')}</strong> {info.scenarioName}</div>
                        <div className="chat-sysinfo-row"><strong>{t('sensitivityInfoLabel')}</strong> {info.sensitivity}</div>
                        <div className="chat-sysinfo-row"><strong>{t('maxRoundsInfoLabel')}</strong> {info.maxRounds}</div>
                        <div className="chat-sysinfo-row"><strong>{t('targetKnowledgeInfoLabel')}</strong> {info.targetKnowledge}</div>
                      </>
                    )
                  })()}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.map((msg, i) => {
          if (msg.role === 'summary') {
            if (msg.summaryData) {
              const sd = msg.summaryData
              return (
                <div key={i} className="chat-summary">
                  <div className="summary-inner">
                    <div className="summary-title">📋 对话总结</div>
                    <div className="summary-block">
                      <div className="summary-block-header completion-header"><span className="summary-block-icon">🎯</span><span>任务完成度：{sd.completion.rating}</span></div>
                      <div className="summary-block-body">{sd.completion.detail}</div>
                    </div>
                    {/* ---- 4.2: 能力评估（仅展示方向，不展示具体分数） ---- */}
                    {sd.proficiencyAssessment && (
                      <div className="summary-block">
                        <div className="summary-block-header proficiency-header">
                          <span className="summary-block-icon">📊</span>
                          <span>能力评估</span>
                        </div>
                        <div className="summary-block-body">
                          <div className="summary-list-item">
                            <span className="summary-bullet">•</span>
                            <span>
                              {sd.proficiencyAssessment.scoreChange === 0
                                ? '首次评估，暂无对比'
                                : <>
                                    相比上次：
                                    <span className={`proficiency-direction ${sd.proficiencyAssessment.direction}`}>
                                      {sd.proficiencyAssessment.direction === 'up' ? '↑ 进步' : sd.proficiencyAssessment.direction === 'down' ? '↓ 退步' : '→ 保持'}
                                    </span>
                                  </>
                              }
                            </span>
                          </div>
                          {sd.proficiencyAssessment.summary && (
                            <div className="summary-list-item">
                              <span className="summary-bullet">•</span>
                              <span>{sd.proficiencyAssessment.summary}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="summary-block">
                      <div className="summary-block-header strengths-header"><span className="summary-block-icon">✅</span><span>表现好的地方</span></div>
                      <div className="summary-block-body">{sd.strengths.map((s, si) => (<div key={si} className="summary-list-item"><span className="summary-bullet">•</span><span>{s.point}</span></div>))}</div>
                    </div>
                    <div className="summary-block">
                      <div className="summary-block-header weaknesses-header"><span className="summary-block-icon">🔧</span><span>需要改进</span></div>
                      <div className="summary-block-body">{sd.weaknesses.map((w, wi) => (<div key={wi} className="summary-weakness-item"><div className="summary-list-item"><span className="summary-bullet">•</span><span>{w.point}</span></div>{w.example && <div className="summary-weakness-example">{w.example}</div>}</div>))}</div>
                    </div>
                    <div className="summary-block">
                      <div className="summary-block-header knowledge-header"><span className="summary-block-icon">📝</span><span>新知识点</span></div>
                      <div className="summary-block-body">{sd.newKnowledge.map((nk, nki) => (<div key={nki} className="summary-list-item"><span className="summary-bullet">•</span><span className="summary-knowledge-word">{nk.word}</span>{nk.meaning && <span className="summary-knowledge-meaning"> {nk.meaning}</span>}</div>))}</div>
                    </div>
                    <div className="summary-block">
                      <div className="summary-block-header suggestions-header"><span className="summary-block-icon">💡</span><span>学习建议</span></div>
                      <div className="summary-block-body">{sd.suggestions.map((sg, sgi) => (<div key={sgi} className="summary-list-item"><span className="summary-bullet">•</span><span>{sg.suggestion}</span></div>))}</div>
                    </div>
                  </div>
                </div>
              )
            }
            return (
              <div key={i} className="chat-summary">
                <div className="summary-inner">
                  <div className="summary-title">📋 对话总结</div>
                  <div className="summary-text">{msg.content}</div>
                </div>
              </div>
            )
          }

          // Find the next assistant message ID for Tips lookup
          const nextAssistantMsg = messages.slice(i + 1).find(m => m.role === 'assistant')
          const nextAssistantId = nextAssistantMsg?.id

          return (
            <div key={msg.id || i} className="chat-msg-group">
              <div className={`chat-bubble ${msg.role}`} data-message-id={`msg-${msg.id || i}`}>
                {msg.role === "assistant" ? (
                  <AssistantBubbleContent content={msg.content} />
                ) : (
                  <UserBubbleContent content={msg.content} />
                )}
                {msg.role === 'assistant' && isTTSAvailable() && (
                  <button className={`message-tts-btn ${speakingMsgId === i ? 'speaking' : ''}`} onClick={async () => {
                    if (playingMsgIdRef.current === i && isSpeaking()) {
                      stopSpeaking()
                      playingMsgIdRef.current = null
                      setSpeakingMsgId(null)
                      return
                    }
                    playingMsgIdRef.current = i
                    setSpeakingMsgId(i)
                    try {
                      await speak(msg.content, language)
                    } finally {
                      if (playingMsgIdRef.current === i) {
                        playingMsgIdRef.current = null
                        setSpeakingMsgId(null)
                      }
                    }
                  }} title={t('readAloud')}>{speakingMsgId === i ? '⏳' : '🔊'}</button>
                )}
              </div>

              {/* Correction & Tips merged bubble (Agent 2A + Agent 2E) */}
              {msg.role === 'user' && (
                (() => {
                  const hasCorrection = userCorrections[msg.id] && userCorrections[msg.id].annotatedHtml
                  const hasTips = nextAssistantId && analysisResults[nextAssistantId]?.tips?.length > 0
                  if (!hasCorrection && !hasTips) return null
                  const isExpanded = correctionTipsExpandedMap[msg.id] !== false
                  return (
                    <div className="correction-tips-bubble">
                      <div className="correction-tips-header" onClick={() => toggleCorrectionTipsForMessage(msg.id)} style={{ cursor: 'pointer' }}>
                        <span>✏️ {t('correctionsTips')}</span>
                        <span className="correction-tips-toggle">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                      {isExpanded && (
                        <div className="correction-tips-content">
                          {hasCorrection && (
                            <div className="correction-tips-section">
                              <div className="correction-tips-section-title">{t('sectionCorrection')}</div>
                              <div className="correction-content">
                                <div
                                  className="correction-text"
                                  dangerouslySetInnerHTML={{ __html: userCorrections[msg.id].annotatedHtml }}
                                />
                                {userCorrections[msg.id].explanation && (
                                  <div className="correction-explanation">
                                    {userCorrections[msg.id].explanation}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {hasTips && (
                            <div className="correction-tips-section">
                              <div className="correction-tips-section-title">{t('sectionTips')}</div>
                              <div className="tips-content">
                                {analysisResults[nextAssistantId].tips.map((tip, ti) => (
                                  <div key={ti} className="tip-item">
                                    <span className="tip-bullet">•</span>
                                    <span className="tip-text">{tip.content}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()
              )}
              {/* Hints under assistant message (Agent 2C - 来自 generateHints) */}
              {msg.role === 'assistant' && analysisResults[msg.id] && (
                <div className="analysis-container">
                  {analysisResults[msg.id]?.hints && analysisResults[msg.id]?.hints?.suggestions?.length > 0 && (
                    <div className={`hints-section ${hintsExpandedMap[msg.id] ? '' : 'collapsed'}`}>
                      <div className="hints-header" onClick={() => toggleHintsForMessage(msg.id)}>
                        <span>📘 {t('sectionHints')}</span>
                        <span className="hints-toggle">{hintsExpandedMap[msg.id] ? '▲' : '▼'}</span>
                      </div>
                      {hintsExpandedMap[msg.id] && (
                        <div className="hints-content">
                          <div className="hints-question">{analysisResults[msg.id].hints.triggerQuestion}</div>
                          <div className="hints-suggestions">
                            {analysisResults[msg.id].hints.suggestions.map((s, si) => (
                              <div key={si} className="hint-item">
                                <span className="hint-word">{s.word}</span>
                                <span className="hint-translation"> / {s.translation}</span>
                                <button className="hint-lookup-btn" onClick={() => { if (onDictSearchFromSelection) { onDictSearchFromSelection(s.word) } }} title={t('lookupBtnTitle')}>🔍 {t('lookupBtn')}</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {loading && !summaryLoading && (
          <div className="typing-bubble">
            <BouncingDots />
          </div>
        )}

        {summaryLoading && (
          <div className="summary-generating">
            <span>{t('summaryGenerating')}</span>
            <BouncingDots />
          </div>
        )}
      </div>

      {!isMaxReached && !summaryDone && !endingRef.current && (
        <div className="chat-input-bar">
          <textarea className="chat-input" ref={textareaRef} placeholder={t('inputPlaceholder')} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} disabled={loading || endingRef.current} />
          <button className="chat-send-btn" onClick={handleSend} disabled={loading || !input.trim() || endingRef.current}>{t('sendBtn')}</button>
        </div>
      )}

      {summaryDone && (
        <div className="chat-end-bar">
          <button className="chat-new-btn" onClick={handleNewConversation}>{t('backToHome')}</button>
        </div>
      )}
    </div>
  )
}

export default ChatArea