import { useState, useRef, useCallback, useEffect } from 'react'
import { generateConversationGoal } from '../api'
import { buildUniversalPrompt, buildSceneParams } from '../api/prompts'
import { getProficiencyGuidance } from '../config/proficiency'
import { getCustomScenarios, addCustomScenario, deleteCustomScenario, getUniversalPrompt, getScenePrompt, getSceneDesc, getDiversity, getDiversityText } from '../utils/scenarioStore'

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
  const [customScenarios, setCustomScenarios] = useState([])

  const conversationContextRef = useRef(null)
  const conversationIdRef = useRef(0)
  const [conversationKey, setConversationKey] = useState(0)

  // Load custom scenarios when language changes
  useEffect(() => {
    getCustomScenarios(language).then(setCustomScenarios)
  }, [language])

  // Reset scenario when language changes
  useEffect(() => {
    const firstScenario = currentScenarios[0]?.value || 'restaurant'
    setScenario(firstScenario)
    setConversationGoal('')
  }, [language, currentScenarios])

  // ── Custom scenario handlers ─────────────────────────────────────
  const handleAddScenario = useCallback(async (label) => {
    const newScenario = await addCustomScenario(language, label)
    setCustomScenarios(prev => [...prev, newScenario])
    return newScenario
  }, [language])

  const handleDeleteScenario = useCallback(async (value) => {
    await deleteCustomScenario(language, value)
    setCustomScenarios(prev => prev.filter(s => s.value !== value))
  }, [language])

  // Add to customScenarios state without re-persisting (scenario already saved by modal)
  const handleAddToCustomScenarios = useCallback((newScenario) => {
    setCustomScenarios(prev => {
      if (prev.some(s => s.value === newScenario.value)) return prev
      return [...prev, newScenario]
    })
  }, [])

  // ── Transition handlers ──────────────────────────────────────────
  const handleStartChat = useCallback(async (params) => {
    // Load custom universal + scene notes (if any)
    const [universalCustom, sceneNotes, diversityLevel] = await Promise.all([
      getUniversalPrompt(language),
      getScenePrompt(language, params.scenario),
      getDiversity(language, params.scenario),
    ])

    // Build the full prompt programmatically:
    //   0. proficiency guidance (dynamic, based on user's score)
    //   1. universal (custom || preset) — role, personality, style, rules
    //   2. sceneParams (auto-generated from form) — scenario, sensitivity, targets, diversity
    //   3. sceneNotes (user-edited in modal) — role-play details, flow, key phrases
    const sceneCtx = {
      scenario: params.scenario,
      scenarioLabel: params.scenarioLabel || params.scenario,
      goal: params.goal || '',
      sensitivity: params.sensitivity,
      maxRounds: params.maxRounds,
      targetKnowledge: params.targetKnowledge,
      language,
      isAssessment: false,
    }
    const profGuidance = proficiencyScore !== null
      ? getProficiencyGuidance(proficiencyScore, language)
      : null
    const universal = universalCustom || buildUniversalPrompt(language)
    const sceneParams = buildSceneParams(sceneCtx, language)
    const diversityText = getDiversityText(diversityLevel, language)

    // Build goal as a concise directive (guidance is already in universal preset)
    const goalLine = params.goal?.trim()
      ? (language === 'ja'
        ? `【会話目標】${params.goal.trim()}`
        : `CONVERSATION GOAL: ${params.goal.trim()}`)
      : ''

    const fullPrompt = [profGuidance, goalLine, universal, diversityText, sceneParams, sceneNotes].filter(Boolean).join('\n\n')

    conversationContextRef.current = {
      scenario: params.scenario,
      scenarioLabel: params.scenarioLabel || params.scenario,
      goal: params.goal || '',
      sensitivity: params.sensitivity,
      maxRounds: params.maxRounds,
      targetKnowledge: params.targetKnowledge,
      proficiencyScore,
      language,
      isAssessment: false,
      customSystemPrompt: fullPrompt,
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

  /**
   * Continue a previously interrupted conversation.
   * Builds the same prompt as handleStartChat but from a saved session,
   * then sets centerState and all data in one batch so ChatArea mounts
   * with initialMessages already available.
   */
  const handleContinueChat = useCallback(async (session) => {
    const [universalCustom, sceneNotes, diversityLevel] = await Promise.all([
      getUniversalPrompt(language),
      getScenePrompt(language, session.scenario),
      getDiversity(language, session.scenario),
    ])

    const sceneCtx = {
      scenario: session.scenario,
      scenarioLabel: session.scenarioLabel || session.scenario,
      goal: session.goal || '',
      sensitivity: session.sensitivity || 'normal',
      maxRounds: session.maxRounds || 10,
      targetKnowledge: session.targetKnowledge ?? 0,
      language,
      isAssessment: false,
    }
    const profGuidance = proficiencyScore !== null
      ? getProficiencyGuidance(proficiencyScore, language)
      : null
    const universal = universalCustom || buildUniversalPrompt(language)
    const sceneParams = buildSceneParams(sceneCtx, language)
    const diversityText = getDiversityText(diversityLevel, language)

    const goalLine = session.goal?.trim()
      ? (language === 'ja'
        ? `【会話目標】${session.goal.trim()}`
        : `CONVERSATION GOAL: ${session.goal.trim()}`)
      : ''

    const fullPrompt = [profGuidance, goalLine, universal, diversityText, sceneParams, sceneNotes].filter(Boolean).join('\n\n')

    conversationContextRef.current = {
      scenario: session.scenario,
      scenarioLabel: session.scenarioLabel || session.scenario,
      goal: session.goal || '',
      sensitivity: session.sensitivity || 'normal',
      maxRounds: session.maxRounds || 10,
      targetKnowledge: session.targetKnowledge ?? 0,
      proficiencyScore,
      language,
      isAssessment: false,
      customSystemPrompt: fullPrompt,
    }
    conversationIdRef.current += 1
    setConversationKey(conversationIdRef.current)
    setCenterState('chatting')
  }, [proficiencyScore, language])

  const handleGenerateGoal = useCallback(async (scenarioLabel, scenarioValue) => {
    // Look up scene context (notes + description) for this scenario
    const [sceneNotes, sceneDesc] = scenarioValue
      ? await Promise.all([
          getScenePrompt(language, scenarioValue),
          getSceneDesc(language, scenarioValue),
        ])
      : [null, null]

    const context = {
      description: sceneDesc || '',
      sceneNotes: sceneNotes || '',
    }

    const rawGoal = await generateConversationGoal(scenarioLabel, language, proficiencyScore, context)
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
    customScenarios,
    // Refs (for ChatArea to read/write)
    conversationContextRef,
    // Handlers
    handleStartChat,
    handleContinueChat,
    handleGenerateGoal,
    handleChatEnd,
    handleStartQuiz,
    handleQuizEnd,
    handleStartAssessment,
    handleSkipAssessment,
    handleAssessmentEnd,
    handleAddScenario,
    handleDeleteScenario,
    handleAddToCustomScenarios,
  }
}
