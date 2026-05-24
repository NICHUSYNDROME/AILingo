import { useState, useRef, useCallback, useEffect, memo } from 'react'
import { SCENARIOS, SENSITIVITY_LABELS } from '../config/languages'
import './ScenarioSetup.css'

const ScenarioSetup = memo(function ScenarioSetup({
  language,
  uiText,
  scenario,
  conversationGoal,
  sensitivity,
  maxRounds,
  targetKnowledge,
  onScenarioChange,
  onConversationGoalChange,
  onSensitivityChange,
  onMaxRoundsChange,
  onTargetKnowledgeChange,
  onStartChat,
  generateGoal,
}) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [goalLoading, setGoalLoading] = useState(false)
  const [customScenario, setCustomScenario] = useState('')
  const generatingRef = useRef(false)
  const goalTextareaRef = useRef(null)
  const customInputRef = useRef(null)

  // Get scenarios for current language
  const currentScenarios = SCENARIOS[language] || SCENARIOS.en
  const currentSensitivityLabels = SENSITIVITY_LABELS[language] || SENSITIVITY_LABELS.en

  // Helper: adjust textarea height based on content
  const adjustTextareaHeight = useCallback(() => {
    const ta = goalTextareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const newHeight = Math.min(ta.scrollHeight, 100)
    ta.style.height = newHeight + 'px'
    ta.style.overflowY = ta.scrollHeight > 100 ? 'auto' : 'hidden'
  }, [])

  // Auto-resize whenever conversationGoal changes (typing, random gen, etc.)
  useEffect(() => {
    adjustTextareaHeight()
  }, [conversationGoal, adjustTextareaHeight])

  // Auto-resize the goal textarea based on content
  const handleGoalInput = useCallback((e) => {
    onConversationGoalChange(e.target.value)
  }, [onConversationGoalChange])

  // Compute effective values: use defaults when input is empty
  const effectiveMaxRounds = maxRounds === '' ? 10 : maxRounds
  const effectiveTargetKnowledge = targetKnowledge === '' ? 5 : targetKnowledge

  // Determine if custom scenario is selected
  const isCustom = scenario === 'custom'

  // Get the actual scenario value to use (custom text or preset label)
  const getEffectiveScenario = () => {
    if (isCustom) return customScenario.trim()
    const found = currentScenarios.find((s) => s.value === scenario)
    return found ? found.label : scenario
  }

  // Handle "随机" button click — generate a goal via API and fill the input
  const handleRandomGoal = async () => {
    if (goalLoading || generatingRef.current) return
    generatingRef.current = true
    setGoalLoading(true)
    try {
      const goal = await generateGoal(getEffectiveScenario())
      if (goal) {
        onConversationGoalChange(goal)
      }
    } catch {
      // Silently fail
    }
    setGoalLoading(false)
    generatingRef.current = false
  }

  const handleStartClick = async () => {
    setConfirmError('')

    // Validate custom scenario
    if (isCustom && !customScenario.trim()) {
      setConfirmError(language === 'ja' ? 'カスタムシーンを入力してください' : '请输入自定义场景')
      return
    }

    // If input is empty, auto-generate a goal first
    if (!conversationGoal?.trim()) {
      setGoalLoading(true)
      try {
        const goal = await generateGoal(getEffectiveScenario())
        if (goal) {
          onConversationGoalChange(goal)
        }
      } catch {
        // Silently fail
      }
      setGoalLoading(false)
    }

    setShowConfirm(true)
  }

  const handleConfirm = () => {
    // Validate: goal must not be empty
    if (!conversationGoal?.trim()) {
      setConfirmError(language === 'ja' ? '会話の目標を入力または生成してください' : '请填写或生成对话目标')
      return
    }
    // Validate: if effective values are blank (shouldn't happen but safety check)
    if (!effectiveMaxRounds || !effectiveTargetKnowledge) {
      setConfirmError(language === 'ja' ? '最大往復数と目標単語数を入力してください' : '最大轮次和目标知识点数不能为空')
      return
    }
    setShowConfirm(false)
    setConfirmError('')

    const effectiveScenario = getEffectiveScenario()

    onStartChat({
      scenario: isCustom ? effectiveScenario : scenario,
      goal: conversationGoal.trim(),
      sensitivity: sensitivity,
      maxRounds: effectiveMaxRounds,
      targetKnowledge: effectiveTargetKnowledge,
    })
  }

  const handleCancel = () => {
    setShowConfirm(false)
    setConfirmError('')
  }

  const handleScenarioChange = (value) => {
    onScenarioChange(value)
    // Focus the custom input when switching to custom
    if (value === 'custom') {
      setTimeout(() => customInputRef.current?.focus(), 0)
    }
  }

  return (
    <div className="scenario-setup">
      <h2 className="scenario-title">{uiText.scenarioSetup}</h2>

      <div className="scenario-fields-wrapper">
        {/* 场景选择 */}
        <div className="scenario-field">
          <label className="scenario-label">{uiText.scenario}</label>
          <select
            className="scenario-select"
            value={scenario}
            onChange={(e) => handleScenarioChange(e.target.value)}
          >
            {currentScenarios.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* 自定义场景输入框 — 仅在选择"自定义"时显示 */}
        {isCustom && (
          <div className="scenario-field">
            <label className="scenario-label">
              {language === 'ja' ? 'カスタムシーン説明' : '自定义场景描述'}
            </label>
            <input
              ref={customInputRef}
              type="text"
              className="scenario-input custom-scenario-input"
              placeholder={language === 'ja' ? 'カスタムシーンを入力...' : '请输入自定义场景...'}
              value={customScenario}
              onChange={(e) => setCustomScenario(e.target.value)}
            />
          </div>
        )}

        {/* 对话目标 — textarea + 随机按钮 */}
        <div className="scenario-field">
          <label className="scenario-label">{uiText.conversationGoal}</label>
          <div className="goal-input-row">
            <textarea
              ref={goalTextareaRef}
              className="scenario-input goal-input goal-textarea"
              placeholder={language === 'ja' ? '会話の目標を入力、またはランダム生成...' : '输入对话目标，或点击随机生成...'}
              value={conversationGoal}
              onChange={handleGoalInput}
              rows={1}
            />
            <button
              className="goal-random-btn"
              onClick={handleRandomGoal}
              disabled={goalLoading}
              title={uiText.random}
            >
              {goalLoading ? '...' : `🎲 ${uiText.random}`}
            </button>
          </div>
        </div>

        {/* 纠错敏感度 */}
        <div className="scenario-field">
          <label className="scenario-label">{uiText.sensitivity}</label>
          <div className="sensitivity-group">
            {['loose', 'normal', 'strict'].map((key) => (
              <button
                key={key}
                className={`sensitivity-btn ${sensitivity === key ? 'active' : ''}`}
                onClick={() => onSensitivityChange(key)}
              >
                {currentSensitivityLabels[key]}
              </button>
            ))}
          </div>
        </div>

        {/* 最大轮次 */}
        <div className="scenario-field">
          <label className="scenario-label">{uiText.maxRounds}</label>
          <input
            type="text"
            inputMode="numeric"
            className="scenario-input"
            value={maxRounds === '' ? '' : maxRounds}
            onChange={(e) => {
              const val = e.target.value
              if (val === '') {
                onMaxRoundsChange('')
              } else if (/^\d+$/.test(val)) {
                onMaxRoundsChange(Number(val))
              }
            }}
          />
        </div>

        {/* 目标知识点数 */}
        <div className="scenario-field">
          <label className="scenario-label">{uiText.targetKnowledge}</label>
          <input
            type="text"
            inputMode="numeric"
            className="scenario-input"
            value={targetKnowledge === '' ? '' : targetKnowledge}
            onChange={(e) => {
              const val = e.target.value
              if (val === '') {
                onTargetKnowledgeChange('')
              } else if (/^\d+$/.test(val)) {
                onTargetKnowledgeChange(Number(val))
              }
            }}
          />
        </div>

        {/* 开始对话按钮 */}
        <button className="start-btn" onClick={handleStartClick}>
          {uiText.startChat}
        </button>
      </div>

      {showConfirm && (
        <div className="confirm-overlay" onClick={handleCancel}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm-title">
              {language === 'ja' ? '会話設定の確認' : '确认对话设置'}
            </h3>
            <div className="confirm-body">
              <div className="confirm-item">
                <span className="confirm-label">{uiText.scenario}</span>
                <span className="confirm-value">{isCustom ? customScenario : (currentScenarios.find((s) => s.value === scenario)?.label || scenario)}</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">{uiText.conversationGoal}</span>
                <span className="confirm-value confirm-goal-text">
                  {conversationGoal || (goalLoading ? (language === 'ja' ? '会話の目標を生成中...' : '正在生成对话目标...') : (language === 'ja' ? '（未入力）' : '（未填写）'))}
                </span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">{uiText.sensitivity}</span>
                <span className="confirm-value">{currentSensitivityLabels[sensitivity] || sensitivity}</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">{uiText.maxRounds}</span>
                <span className="confirm-value">{effectiveMaxRounds}</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">{uiText.targetKnowledge}</span>
                <span className="confirm-value">{effectiveTargetKnowledge}</span>
              </div>
            </div>
            {confirmError && (
              <div className="confirm-error">{confirmError}</div>
            )}
            <div className="confirm-actions">
              <button className="confirm-cancel-btn" onClick={handleCancel}>
                {language === 'ja' ? 'キャンセル' : '取消'}
              </button>
              <button className="confirm-ok-btn" onClick={handleConfirm}>
                {language === 'ja' ? '確認して開始' : '确认开始'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default ScenarioSetup
