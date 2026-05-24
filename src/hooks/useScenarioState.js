import { useState, useRef, useCallback, useEffect } from 'react'
import { generateConversationGoal } from '../api'

/**
 * Manages scenario configuration and center panel state machine.
 *
 * State machine: 'idle' → 'chatting' → 'idle', 'idle' → 'quiz' → 'idle'
 *
 * @param {string} language - Current language code ('en' | 'ja')
 * @param {Array} currentScenarios - Available scenarios for the current language
 * @returns {Object} Scenario state + transition handlers
 */
export function useScenarioState(language, currentScenarios) {
  const [centerState, setCenterState] = useState('idle')
  const [scenario, setScenario] = useState(currentScenarios[0]?.value || 'restaurant')
  const [conversationGoal, setConversationGoal] = useState('')
  const [sensitivity, setSensitivity] = useState('normal')
  const [maxRounds, setMaxRounds] = useState(10)
  const [targetKnowledge, setTargetKnowledge] = useState(5)

  const conversationContextRef = useRef(null)
  const conversationIdRef = useRef(0)
  const [conversationKey, setConversationKey] = useState(0)

  // Reset scenario when language changes
  useEffect(() => {
    const firstScenario = currentScenarios[0]?.value || 'restaurant'
    setScenario(firstScenario)
    setConversationGoal('')
  }, [language, currentScenarios])

  // ── Transition handlers ──────────────────────────────────────────
  const handleStartChat = useCallback((params) => {
    conversationContextRef.current = {
      scenario: params.scenario,
      goal: params.goal || '',
      sensitivity: params.sensitivity,
      maxRounds: params.maxRounds,
      targetKnowledge: params.targetKnowledge,
    }
    conversationIdRef.current += 1
    setConversationKey(conversationIdRef.current)
    setCenterState('chatting')
  }, [])

  const handleGenerateGoal = useCallback(async (scenarioValue) => {
    return await generateConversationGoal(scenarioValue, language)
  }, [language])

  const handleChatEnd = useCallback(() => setCenterState('idle'), [])
  const handleStartQuiz = useCallback(() => setCenterState('quiz'), [])
  const handleQuizEnd = useCallback(() => setCenterState('idle'), [])

  return {
    // State
    centerState,
    scenario, setScenario,
    conversationGoal, setConversationGoal,
    sensitivity, setSensitivity,
    maxRounds, setMaxRounds,
    targetKnowledge, setTargetKnowledge,
    conversationKey,
    // Refs (for ChatArea to read/write)
    conversationContextRef,
    // Handlers
    handleStartChat,
    handleGenerateGoal,
    handleChatEnd,
    handleStartQuiz,
    handleQuizEnd,
  }
}
