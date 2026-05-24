import { useState, useRef, useEffect, useCallback } from 'react'
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
import { logActivity } from '../utils/learningLog'
import { speak, stopSpeaking, isSpeaking, isTTSAvailable } from '../utils/tts'
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

// ===== Simplified and Reliable Word Diff =====
// This is a practical diff for word sequences that handles insert, delete, replace
// Improved: uses look-ahead to better align words and merges adjacent DELETE+INSERT into REPLACE
const computeWordDiff = (originalWords, correctedWords) => {
  const ops = []
  let i = 0, j = 0
  
  debug.log('[computeWordDiff] original:', originalWords)
  debug.log('[computeWordDiff] corrected:', correctedWords)
  
  while (i < originalWords.length || j < correctedWords.length) {
    if (i < originalWords.length && j < correctedWords.length && originalWords[i] === correctedWords[j]) {
      // Words match
      ops.push({ type: 'EQUAL', value: originalWords[i] })
      i++
      j++
    } else {
      // Not equal - try to find a match ahead
      let foundMatch = false
      
      // Look ahead in corrected words to see if current original word appears later
      for (let lookAhead = 1; lookAhead <= 3 && j + lookAhead < correctedWords.length; lookAhead++) {
        if (originalWords[i] === correctedWords[j + lookAhead]) {
          // Insert the missing words before this match
          for (let k = 0; k < lookAhead; k++) {
            ops.push({ type: 'INSERT', value: correctedWords[j + k] })
          }
          j += lookAhead
          foundMatch = true
          break
        }
      }
      
      if (!foundMatch) {
        // Look ahead in original words to see if current corrected word appears later
        for (let lookAhead = 1; lookAhead <= 3 && i + lookAhead < originalWords.length; lookAhead++) {
          if (correctedWords[j] === originalWords[i + lookAhead]) {
            // Delete the words before this match
            for (let k = 0; k < lookAhead; k++) {
              ops.push({ type: 'DELETE', value: originalWords[i + k] })
            }
            i += lookAhead
            foundMatch = true
            break
          }
        }
      }
      
      if (!foundMatch) {
        // No match found - treat as DELETE + INSERT (will be merged into REPLACE later)
        ops.push({ type: 'DELETE', value: originalWords[i] })
        ops.push({ type: 'INSERT', value: correctedWords[j] })
        i++
        j++
      }
    }
  }
  
  // Post-process: merge adjacent DELETE+INSERT into REPLACE
  const mergedOps = []
  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx]
    const nextOp = ops[idx + 1]
    
    if (op.type === 'DELETE' && nextOp && nextOp.type === 'INSERT') {
      mergedOps.push({ type: 'REPLACE', original: op.value, corrected: nextOp.value })
      idx++ // skip the next INSERT
    } else {
      mergedOps.push(op)
    }
  }
  
  debug.log('[computeWordDiff] merged ops:', mergedOps)
  return mergedOps
}

// ===== Helper: convert edit script to annotation objects =====
// Now expects pre-merged ops (DELETE+INSERT already combined into REPLACE by computeWordDiff)
// For Japanese (no spaces between tokens), the separator offset is 0 instead of 1
const convertOpsToAnnotations = (ops, originalText, originalWords, hasSpaces = true) => {
  const annotations = []
  let currentPos = 0
  const separatorLen = hasSpaces ? 1 : 0
  
  for (const op of ops) {
    if (op.type === 'EQUAL') {
      currentPos += op.value.length + separatorLen
    } else if (op.type === 'DELETE') {
      const start = currentPos
      const end = currentPos + op.value.length
      annotations.push({
        type: 'DELETE',
        original: op.value,
        startIndex: start,
        endIndex: end
      })
      currentPos += op.value.length + separatorLen
    } else if (op.type === 'INSERT') {
      annotations.push({
        type: 'INSERT',
        corrected: op.value,
        position: currentPos
      })
    } else if (op.type === 'REPLACE') {
      const start = currentPos
      const end = currentPos + op.original.length
      annotations.push({
        type: 'REPLACE',
        original: op.original,
        corrected: op.corrected,
        startIndex: start,
        endIndex: end
      })
      currentPos += op.original.length + separatorLen
    }
  }
  
  return annotations
}

// ===== Helper: find word-level differences between original and corrected sentences =====
const findDifferences = (original, corrected, language) => {
  if (!original || !corrected || original === corrected) return []
  
  const tokenize = (str, lang) => {
    if (lang === 'ja') {
      // Japanese tokenization strategy:
      // 1. Kanji sequences
      // 2. Hiragana sequences
      // 3. Katakana sequences
      // 4. Punctuation marks (、。！？)
      // 5. Spaces (preserved as-is)
      const matches = str.match(/[\p{Script=Hani}]+|[\p{Script=Hiragana}]+|[\p{Script=Katakana}]+|[、。！？]|\s+/ug)
      return matches || []
    }
    // English and other languages: split by whitespace
    return str.match(/\S+/g) || []
  }
  const originalWords = tokenize(original, language)
  const correctedWords = tokenize(corrected, language)
  
  debug.log('[findDifferences] ===== START DIFF =====')
  debug.log('[findDifferences] original:', original)
  debug.log('[findDifferences] corrected:', corrected)
  debug.log('[findDifferences] original words:', originalWords)
  debug.log('[findDifferences] corrected words:', correctedWords)
  
  const ops = computeWordDiff(originalWords, correctedWords)
  debug.log('[findDifferences] edit script ops:', ops)
  
  // Japanese has no spaces between tokens; English does
  const hasSpaces = language !== 'ja'
  const annotations = convertOpsToAnnotations(ops, original, originalWords, hasSpaces)
  debug.log('[findDifferences] final annotations:', annotations)
  debug.log('[findDifferences] ===== END DIFF =====')
  
  return annotations
}

// ===== Helper: generate annotated HTML with spelling corrections =====
const generateAnnotatedMessage = (originalText, annotations) => {
  if (!annotations || annotations.length === 0) {
    return { annotatedHtml: escapeHtml(originalText), missingWords: [] }
  }
  
  const inserts = annotations.filter(a => a.type === 'INSERT')
  const replacesAndDeletes = annotations.filter(a => a.type === 'REPLACE' || a.type === 'DELETE')
  
  // Process from end to start to avoid offset issues
  let result = originalText
  const sorted = [...replacesAndDeletes].sort((a, b) => b.startIndex - a.startIndex)
  
  for (const ann of sorted) {
    const before = result.slice(0, ann.startIndex)
    const after = result.slice(ann.endIndex)
    
    let annotated
    if (ann.type === 'REPLACE') {
      annotated = '<span class="spelling-correction">' + escapeHtml(ann.original) + '</span> <span class="spelling-suggestion">' + escapeHtml(ann.corrected) + '</span>'
    } else {
      annotated = '<span class="spelling-correction">' + escapeHtml(ann.original) + '</span>'
    }
    
    result = before + annotated + after
  }
  
  debug.log('[generateAnnotatedMessage] missing words (INSERT):', inserts.map(i => i.corrected))
  
  return {
    annotatedHtml: result,
    missingWords: inserts.map(i => i.corrected)
  }
}

function ChatArea({ isChatStarted, conversationContextRef, onSidebarUpdate, onReset, onDictSearchFromSelection, getConfirmedCount, targetKnowledge, language = 'en', isMuted = false, onAddKnowledgePoint, onUpdatePoint, existingKnowledgePoints = [], uiText }) {
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
  const [speakingMsgId, setSpeakingMsgId] = useState(null)
  const playingMsgIdRef = useRef(null)
  const listRef = useRef(null)
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.debugAnalysisResults = analysisResults
    }
  }, [analysisResults])

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

  useEffect(() => {
    if (isChatStarted && ctx?.goal) {
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
      setAiStarted(true)
      setLoading(true)

      setSessionConfirmedCount(0)
      lastConfirmedCountRef.current = getConfirmedCount ? getConfirmedCount() : 0
      debug.log(`[ChatArea] 新会话开始，知识点计数已重置为 0，当前全局已确认数: ${lastConfirmedCountRef.current}`)

      const doAiStart = async () => {
        const reply = await sendToAI(
          uiText.aiStartPrompt,
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

        // 开场消息使用 Agent 2C (generateHints) 生成提示
        generateHints(mainText, language).then(hintsResult => {
          if (hintsResult && hintsResult.hints && hintsResult.hints.suggestions && hintsResult.hints.suggestions.length > 0) {
            setAnalysisResults(prev => ({
              ...prev,
              [openingAiMsgId]: {
                ...prev[openingAiMsgId],
                hints: hintsResult.hints
              }
            }))
          }
        }).catch(err => {
          debug.error('[Agent 2C] 开场提示生成失败:', err)
        })
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
        debug.log(`[ChatArea] 知识点确认计数增加 ${increment}，当前会话累计: ${newCount}`)
        return newCount
      })
      logActivity('knowledge', increment, language)
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
      debug.log(`本次对话新确认知识点数: ${sessionConfirmedCount}, 目标: ${target}`)
      debug.log('[ChatArea] 知识点目标已达到，标记 targetReachedRef，下一轮发送将触发收尾')
      targetReachedRef.current = true
    }
  }, [sessionConfirmedCount, targetKnowledge, isChatStarted, loading, summaryDone, messages, ctx])

  const getSystemMessage = () => {
    if (!ctx) return ''
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
        content: uiText.conversationEnded,
      }
      setMessages((prev) => [...prev, fallbackMessage])
      setSummaryError(true)
      setTimeout(scrollToBottom, 100)
    }
    setSummaryLoading(false)
    setSummaryDone(true)
    logActivity('conversation', 1, language)
  }, [ctx, scrollToBottom, language])

  const handleEndConversation = useCallback(async () => {
    if (endingRef.current || summaryDone || summaryTriggered.current) return
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
      logActivity('conversation', 1, language)
      return
    }

    await triggerSummary(currentMessages)
  }, [summaryDone, triggerSummary])

  const handleBackToIdle = useCallback(() => {
    setShowBackConfirm(false)
    debug.log('[ChatArea] 用户点击返回，放弃当前对话，不生成总结')
    if (onReset) onReset()
  }, [onReset])

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
            const today = new Date().toISOString().split('T')[0]
            onUpdatePoint(existing.id, {
              repetitions: 0,
              easeFactor: 2.5,
              interval: 0,
              nextReview: today,
              status: 'active',
              confirmed: false
            })
            debug.log('[processKnowledgePoints] 重置已有知识点:', point.word)
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
            debug.log('[processKnowledgePoints] 添加语法知识点:', point.word)
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
                debug.log('[processKnowledgePoints] 添加短语知识点（查词）:', point.word)
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
                debug.log('[processKnowledgePoints] 添加短语知识点（基础）:', point.word)
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
                debug.log('[processKnowledgePoints] 添加单词知识点（查词）:', point.word)
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
                debug.log('[processKnowledgePoints] 添加单词知识点（基础）:', point.word)
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

    debug.log(`[ChatArea handleSend] 当前 messages 总数: ${messages.length}`)
    debug.log(`[ChatArea handleSend] 本次用户消息: "${text.slice(0, 50)}..."`)

    const isLastRound = roundCount + 1 >= maxRounds
    const targetReached = targetReachedRef.current

    const endKeywords = ['goodbye', 'bye', 'see you', 'that\'s all', 'i have to go', 'see ya', 'talk to you later', 'bye-bye', 'good bye', 'gotta go', 'have to go', 'i\'m done', 'that is all', 'that\'s it']
    const userEnding = endKeywords.some(kw => text.toLowerCase().includes(kw))
    const effectiveLastRound = isLastRound || targetReached || userEnding
    if (userEnding) {
      debug.log('检测到用户结束意图，强制触发收尾')
    }
    if (targetReached) {
      debug.log('知识点目标已达成，本轮发送 isLastRound=true，给 AI 一轮机会自然收尾')
    }

    const conversationHistory = [...messages, { role: 'user', content: text }].map((m) => ({
      role: m.role,
      content: m.content,
    }))

    try {
      // ===== 提前创建 AI 消息 ID，用于后续 analysisResults 初始化 =====
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

      // ===== Step 1: 并行调用 Agent 1 + Agent 2A =====
      debug.log('[handleSend] Step 1: 并行调用 Agent 1 + Agent 2A')
      setIsProcessing(prev => ({ ...prev, spelling: true }))
      const sensitivity = ctx?.sensitivity || 'normal'

      const [agent1Result, spellCheckResult] = await Promise.allSettled([
        sendToAI(text, conversationHistory, ctx, effectiveLastRound, language),
        correctUserMessage(text, sensitivity, language)
      ])

      setIsProcessing(prev => ({ ...prev, spelling: false }))

      const agent1Reply = agent1Result.status === 'fulfilled' ? agent1Result.value : null
      const spellCheckResultValue = spellCheckResult.status === 'fulfilled' ? spellCheckResult.value : null

      // Agent 1 失败时的降级处理
      if (!agent1Reply) {
        debug.error('[handleSend] Agent 1 (sendToAI) failed:', agent1Result.reason)
        const errorMessage = {
          id: generateMessageId(),
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.'
        }
        setMessages(prev => [...prev, errorMessage])
        setLoading(false)
        isSendingRef.current = false
        return
      }

      if (spellCheckResult.status === 'rejected') {
        debug.warn('[handleSend] Agent 2A (correctUserMessage) failed:', spellCheckResult.reason)
      }

      setCorrectionResult(spellCheckResultValue)

      const parsed = parseAIReply(agent1Reply)
      const { mainText, goalAchieved } = parsed
      debug.log('[ChatArea handleSend] parseAIReply 结果:', { goalAchieved })

      // ===== Step 2: Agent 2B - 语法分析（基于用户原文 vs 纠正后）=====
      debug.log('[handleSend] Step 2: Agent 2B - 语法分析')
      setIsProcessing(prev => ({ ...prev, grammar: true }))
      const correction = spellCheckResultValue?.correction
      const correctedText = correction?.corrected || text
      const grammarResult = await analyzeGrammar(text, correctedText, conversationHistory, sensitivity, language)
      setIsProcessing(prev => ({ ...prev, grammar: false }))
      setGrammarAnalysis(grammarResult)

      // ===== Step 3: Agent 1 返回后，并行调用 Agent 2C + Agent 2D =====
      debug.log('[handleSend] Step 3: 并行调用 Agent 2C + Agent 2D')
      setIsProcessing(prev => ({ ...prev, hints: true, extraction: true }))

      const [hintsSettled, extractionSettled] = await Promise.allSettled([
        generateHints(mainText, language),
        extractCorrectionsFromReply(mainText, language)
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
      debug.log('[ChatArea] 2C hintsResult:', hintsResult)
      debug.log('[ChatArea] 2D extractionResult:', extractionResult)

      // ===== Step 4: Agent 2E - 汇总 Tips 并提取知识点 =====
      debug.log('[handleSend] Step 4: Agent 2E - 汇总 Tips 并提取知识点')
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

      // ===== 构建 Correction 气泡数据（使用 diff 算法生成内联标注）=====
      let correctionData = null
      if (correction && correction.original === text && correction.corrected !== text) {
        // 使用 diff 算法生成内联标注 HTML
        const differences = findDifferences(text, correction.corrected, language)
        let annotatedHtml = ''

        if (differences.length > 0) {
          const { annotatedHtml: diffHtml } = generateAnnotatedMessage(text, differences)
          annotatedHtml = diffHtml
          debug.log('[handleSend] 使用 diff 生成 Correction 标注，差异数:', differences.length)
        } else {
          // 降级：简单显示
          annotatedHtml = `<span class="spelling-correction">${escapeHtml(text)}</span> → <span class="spelling-suggestion">${escapeHtml(correction.corrected)}</span>`
        }

        correctionData = {
          original: text,
          corrected: correction.corrected,
          annotatedHtml: annotatedHtml,
          explanation: correction.explanation || ''
        }
        debug.log('[handleSend] Agent 2A 检测到拼写/语法纠正:', correction.corrected)
      }

      // ===== 处理知识点（Agent 2E 提取的）=====
      if (extractedKps && extractedKps.length > 0) {
        processKnowledgePoints(extractedKps, text)
      }

      // ===== 使用 2D 的 cleanedReply（如果存在）作为 AI 消息内容 =====
      // cleanedReply 移除了教学建议，只保留纯对话内容
      const cleanedContent = extractionResult?.cleanedReply || mainText
      const aiMessage = {
        id: aiMessageId,
        role: 'assistant',
        content: cleanedContent
      }
      if (extractionResult?.cleanedReply) {
        debug.log('[handleSend] 使用 2D cleanedReply 替换 AI 回复（已移除教学建议）')
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
      debug.log('[handleSend] 存储分析结果到 analysisResults，key:', aiMessage.id, 'value:', newAnalysisResult)
      setAnalysisResults(prev => ({
        ...prev,
        [aiMessage.id]: newAnalysisResult
      }))

      // ===== 检查 TODO 完成情况 =====
      ;(async () => {
        if (todos.length > 0 && ctx?.goal) {
          const latestMsgs = conversationHistory.map((m) => ({
            role: m.role,
            content: m.content,
          }))
          latestMsgs.push({ role: 'assistant', content: mainText })
          const newCompleted = await checkTaskCompletion(ctx.goal, todos, latestMsgs, language)
          if (newCompleted.length > 0) {
            debug.log('[ChatArea] checkTaskCompletion 检测到新完成任务:', newCompleted)
            setTodos((prev) => {
              const updated = prev.map((t) =>
                newCompleted.includes(t.id + 1) ? { ...t, completed: true } : t
              )
              const allDone = updated.every((t) => t.completed)
              if (allDone && !targetReachedRef.current) {
                debug.log('[ChatArea] 所有 TODO 任务已完成，触发目标达成')
                targetReachedRef.current = true
              }
              return updated
            })
          } else {
            debug.log('[ChatArea] checkTaskCompletion 未检测到新完成任务')
          }
        }
      })()
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

  const handleNewConversation = () => {
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
          <p className="chat-placeholder">Set up scenario parameters and start a conversation</p>
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
            <div className="chat-end-dialog-title">End this conversation?</div>
            <div className="chat-end-dialog-text">
              Your progress will not be saved as a summary.
            </div>
            <div className="chat-end-dialog-actions">
              <button className="chat-end-dialog-cancel" onClick={() => setShowBackConfirm(false)}>Cancel</button>
              <button className="chat-end-dialog-confirm" onClick={handleBackToIdle}>End</button>
            </div>
          </div>
        </div>
      )}

      {showEndConfirm && (
        <div className="chat-end-overlay" onClick={() => setShowEndConfirm(false)}>
          <div className="chat-end-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="chat-end-dialog-title">End this conversation?</div>
            <div className="chat-end-dialog-text">
              A learning summary will be generated for the current conversation.
            </div>
            <div className="chat-end-dialog-actions">
              <button className="chat-end-dialog-cancel" onClick={() => setShowEndConfirm(false)}>Cancel</button>
              <button className="chat-end-dialog-confirm" onClick={handleEndConversation}>End</button>
            </div>
          </div>
        </div>
      )}

      <div className="chat-header-row">
        <div className="chat-header-left">
          {!summaryDone && !summaryLoading && (
            <button className="chat-back-btn" onClick={() => setShowBackConfirm(true)} title={uiText.backToHomeTooltip}>{uiText.quizBack}</button>
          )}
          <div className="chat-system-msg">
            {(() => {
              const info = getSystemMessage()
              if (!info) return ''
              return (
                <>
                  <span className="scenario-name">📋 Scenario: {info.scenarioName}</span>
                  <br />
                  <span className="detail-line">Sensitivity: {info.sensitivity}</span>
                  <br />
                  <span className="detail-line">Max Rounds: {info.maxRounds} | Target Knowledge Points: {info.targetKnowledge}</span>
                </>
              )
            })()}
          </div>
        </div>
        {todos.length > 0 && (
          <div className="chat-todo-list">
            <div className="chat-todo-title">TODO</div>
            {todos.map((t) => (
              <div key={t.id} className={`chat-todo-item ${t.completed ? 'completed' : ''}`}>
                <span className="chat-todo-checkbox">{t.completed ? '☑' : '☐'}</span>
                <span className="chat-todo-text">{t.text}</span>
              </div>
            ))}
          </div>
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
                    <span className="summary-badge">Summary</span>
                    <div className="summary-title">📋 Learning Summary</div>
                    <div className="summary-block">
                      <div className="summary-block-header completion-header"><span className="summary-block-icon">🎯</span><span>任务完成度：{sd.completion.rating}</span></div>
                      <div className="summary-block-body">{sd.completion.detail}</div>
                    </div>
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
                  <span className="summary-badge">Summary</span>
                  <div className="summary-title">📋 Learning Summary</div>
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
                <div className="bubble-text">
                  {msg.role === "assistant" ? <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} /> : msg.content}
                </div>
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
                  }} title={uiText.readAloud}>{speakingMsgId === i ? '⏳' : '🔊'}</button>
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
                        <span>✏️ Corrections & Tips</span>
                        <span className="correction-tips-toggle">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                      {isExpanded && (
                        <div className="correction-tips-content">
                          {hasCorrection && (
                            <div className="correction-tips-section">
                              <div className="correction-tips-section-title">Correction</div>
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
                              <div className="correction-tips-section-title">Tips</div>
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
              {msg.role === 'assistant' && (
                <>
                  {debug.log('[渲染] AI 消息 ID:', msg.id)}
                  {debug.log('[渲染] analysisResults[msg.id]:', analysisResults[msg.id])}
                  {debug.log('[渲染] hints 存在?', !!analysisResults[msg.id]?.hints)}
                  {debug.log('[渲染] suggestions 数量?', analysisResults[msg.id]?.hints?.suggestions?.length)}
                  {debug.log('[渲染] hintsExpandedMap[msg.id]:', hintsExpandedMap[msg.id])}
                  {debug.log('[渲染] tips 数量?', analysisResults[msg.id]?.tips?.length)}
                </>
              )}
              {msg.role === 'assistant' && analysisResults[msg.id] && (
                <div className="analysis-container">
                  {analysisResults[msg.id]?.hints && analysisResults[msg.id]?.hints?.suggestions?.length > 0 && (
                    <div className={`hints-section ${hintsExpandedMap[msg.id] ? '' : 'collapsed'}`}>
                      <div className="hints-header" onClick={() => toggleHintsForMessage(msg.id)}>
                        <span>📘 Hints</span>
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
                                <button className="hint-lookup-btn" onClick={() => { if (onDictSearchFromSelection) { onDictSearchFromSelection(s.word) } }} title={language === 'ja' ? '辞書で調べる' : '查词'}>🔍 {language === 'ja' ? '調べる' : '查词'}</button>
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
            <span>Conversation ended, generating summary</span>
            <BouncingDots />
          </div>
        )}
      </div>

      {!isMaxReached && !summaryDone && !endingRef.current && (
        <div className="chat-input-bar">
          <textarea className="chat-input" placeholder="Type a message, Command+Enter to send" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} disabled={loading || endingRef.current} rows={1} />
          <button className="chat-send-btn" onClick={handleSend} disabled={loading || !input.trim() || endingRef.current}>Send</button>
        </div>
      )}

      {summaryDone && (
        <div className="chat-end-bar">
          <button className="chat-new-btn" onClick={handleNewConversation}>{uiText.backToHome}</button>
        </div>
      )}
    </div>
  )
}

export default ChatArea