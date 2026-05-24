import { useState, useRef, useCallback, useEffect } from 'react'
import { getItem, removeItem } from '../utils/storage'

/**
 * Manages sidebar panel state, dictionary search, and knowledge point selection.
 *
 * @param {string} language - Current language code
 * @param {Array} knowledgePoints - Current knowledge points list
 * @param {Function} addPoint - Function to add a knowledge point
 * @param {Function} getPointById - Function to get a point by ID
 * @param {Object} conversationContextRef - Ref to current conversation context
 * @param {Function} getDictSystemPrompt - Returns the dictionary system prompt for the language
 * @returns {Object} Sidebar state + handlers
 */
export function useSidebarState(language, knowledgePoints, addPoint, getPointById, conversationContextRef, getDictSystemPrompt) {
  const [sidebarContent, setSidebarContent] = useState(null)
  const [sidebarContentType, setSidebarContentType] = useState(null)
  const [expandedChinese, setExpandedChinese] = useState(false)
  const [dictQuery, setDictQuery] = useState('')
  const [dictLoading, setDictLoading] = useState(false)
  const [selectedPointId, setSelectedPointId] = useState(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)

  const dictSearchRef = useRef(null)

  // ── JSON parsing helper ──────────────────────────────────────────
  const parseJSONResponse = useCallback((text) => {
    let jsonStr = text.trim()
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) jsonStr = jsonMatch[1].trim()
    return JSON.parse(jsonStr)
  }, [])

  // ── Shared dict search logic ─────────────────────────────────────
  const performDictSearch = useCallback(async (word) => {
    const apiKey = await getItem('deepseek_api_key')
    if (!apiKey) {
      setSidebarContent({ error: '⚠️ Please provide a valid API Key first.' })
      setSidebarContentType('dict')
      return null
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
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
        await removeItem('deepseek_api_key')
        setSidebarContent({ error: '⚠️ API Key is invalid or expired.' })
      } else {
        setSidebarContent({ error: `❌ Query failed (${response.status}).` })
      }
      return null
    }

    const data = await response.json()
    const aiResponse = data.choices[0].message.content

    try {
      return parseJSONResponse(aiResponse)
    } catch {
      console.error('Failed to parse AI response as JSON:', aiResponse)
      setSidebarContent({ error: 'Failed to parse word definition', raw: aiResponse })
      return null
    }
  }, [language, getDictSystemPrompt, parseJSONResponse])

  // ── Build knowledge point from dict result ───────────────────────
  const buildKnowledgePoint = useCallback((word, dictData) => ({
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
  }), [conversationContextRef])

  // ── Display a knowledge point in the sidebar ─────────────────────
  const displayKnowledgePoint = useCallback((word, knowledgePoint) => {
    const existingPoint = knowledgePoints.find(
      (p) => p.word.toLowerCase() === word.toLowerCase() && p.status !== 'deleted'
    )
    if (existingPoint) {
      setSelectedPointId(existingPoint.id)
      setSidebarContent(existingPoint)
    } else {
      const added = addPoint(knowledgePoint)
      setSelectedPointId(added ? added.id : knowledgePoint.id)
      setSidebarContent(added || knowledgePoint)
    }
    setSidebarContentType('point')
    setExpandedChinese(false)
  }, [knowledgePoints, addPoint])

  // ── Handlers ─────────────────────────────────────────────────────
  const handleDictSearch = useCallback(async () => {
    const word = dictQuery.trim()
    if (!word || dictLoading) return
    setDictLoading(true)
    setSidebarContent(`🔍 Searching for "${word}"...`)
    setSidebarContentType('dict')

    try {
      const dictData = await performDictSearch(word)
      if (dictData) displayKnowledgePoint(word, buildKnowledgePoint(word, dictData))
    } catch {
      setSidebarContent({ error: '❌ Network error. Please try again.' })
      setSidebarContentType('dict')
    }
    setDictLoading(false)
  }, [dictQuery, dictLoading, performDictSearch, buildKnowledgePoint, displayKnowledgePoint])

  const handleDictSearchFromSelection = useCallback(async (word) => {
    setDictQuery(word)
    setDictLoading(true)
    setSidebarContent(`🔍 Searching for "${word}"...`)
    setSidebarContentType('dict')

    try {
      const dictData = await performDictSearch(word)
      if (dictData) displayKnowledgePoint(word, buildKnowledgePoint(word, dictData))
    } catch {
      setSidebarContent({ error: '❌ Network error. Please try again.' })
      setSidebarContentType('dict')
    }
    setDictLoading(false)
  }, [performDictSearch, buildKnowledgePoint, displayKnowledgePoint])

  const handleDictKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleDictSearch() }
  }, [handleDictSearch])

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

  const handleSelectPoint = useCallback((pointId) => {
    setSelectedPointId(pointId)
    const point = getPointById(pointId)
    if (!point) return
    setSidebarContent(point)
    setSidebarContentType('point')
    setExpandedChinese(false)

    if (point.sourceMessageId) {
      setHighlightedMessageId(point.sourceMessageId)
      setTimeout(() => {
        const el = document.querySelector(`[data-message-id="${point.sourceMessageId}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('message-highlight')
          setTimeout(() => el.classList.remove('message-highlight'), 2000)
        }
      }, 100)
    }
  }, [getPointById])

  // ── Global keyboard shortcut ─────────────────────────────────────
  useEffect(() => {
    dictSearchRef.current = handleDictSearchFromSelection
  }, [handleDictSearchFromSelection])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.closest('input, textarea, [contenteditable]')) return
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        const selection = window.getSelection().toString().trim()
        if (selection && dictSearchRef.current) dictSearchRef.current(selection)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return {
    sidebarContent, sidebarContentType,
    expandedChinese, setExpandedChinese,
    dictQuery, setDictQuery,
    dictLoading,
    selectedPointId, setSelectedPointId,
    highlightedMessageId,
    handleSidebarUpdate, handleSidebarClose,
    handleSelectPoint,
    handleDictSearch, handleDictSearchFromSelection, handleDictKeyDown,
  }
}
