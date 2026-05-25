import { useState, useRef, useCallback, useEffect } from 'react'
import { generateConversationGoal } from '../api'

/**
 * Manages scenario configuration and center panel state machine.
 *
 * State machine: 'idle' → 'chatting' → 'idle', 'idle' → 'quiz' → 'idle',
 *                'idle' → 'assessment' → 'idle'
 *
 * @param {string} language - Current language code ('en' | 'ja')
 * @param {Array} currentScenarios - Available scenarios for the current language
 * @param {number|null} proficiencyScore - Current proficiency score
 * @returns {Object} Scenario state + transition handlers
 */
export function useScenarioState(language, currentScenarios, proficiencyScore = null) {
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
      proficiencyScore,
      language,
      isAssessment: false,
    }
    conversationIdRef.current += 1
    setConversationKey(conversationIdRef.current)
    setCenterState('chatting')
  }, [proficiencyScore, language])

  const handleStartAssessment = useCallback(() => {
    conversationContextRef.current = {
      scenario: 'assessment',
      goal: '',
      sensitivity: 'normal',
      maxRounds: 10,
      targetKnowledge: 0,
      proficiencyScore,
      language,
      isAssessment: true,
    }
    conversationIdRef.current += 1
    setConversationKey(conversationIdRef.current)
    setCenterState('assessment')
  }, [proficiencyScore, language])

  const handleSkipAssessment = useCallback((defaultScore) => {
    // Caller sets the default score, then transitions to idle
    setCenterState('idle')
  }, [])

  const handleAssessmentEnd = useCallback(() => setCenterState('idle'), [])

  const handleChatEnd = useCallback(() => setCenterState('idle'), [])
  const handleStartQuiz = useCallback(() => setCenterState('quiz'), [])
  const handleQuizEnd = useCallback(() => setCenterState('idle'), [])

  const handleGenerateGoal = useCallback(async (scenarioValue) => {
    const rawGoal = await generateConversationGoal(scenarioValue, language, proficiencyScore)
    if (!rawGoal) return rawGoal
    // Limit goal count based on proficiency score
    const lines = rawGoal.split('\n').filter(l => l.trim())
    let maxLines = 3
    if (proficiencyScore !== null) {
      if (proficiencyScore < 4) maxLines = 1
      else if (proficiencyScore < 6) maxLines = 2
    }
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n')
    }
    return rawGoal
  }, [language, proficiencyScore])

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
    handleStartAssessment,
    handleSkipAssessment,
    handleAssessmentEnd,
  }
}
