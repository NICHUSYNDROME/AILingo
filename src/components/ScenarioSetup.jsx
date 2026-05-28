import { useState, useRef, useCallback, useEffect, useLayoutEffect, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { SCENARIOS } from '../config/languages'
import { debug } from '../utils/debug'
import ScenarioPromptModal from './ScenarioPromptModal'
import './ScenarioSetup.css'

const ScenarioSetup = memo(function ScenarioSetup({
  language,
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
  isFirstTime = false,
  onStartAssessment,
  onSkipAssessment,
  proficiencyScore = null,
  customScenarios = [],
  onAddScenario,
  onDeleteScenario,
  onScenarioCreated,
}) {
  const { t } = useTranslation()
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [goalLoading, setGoalLoading] = useState(false)
  const generatingRef = useRef(false)
  const goalTextareaRef = useRef(null)

  // ── Custom dropdown state ──────────────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // ── Prompt modal state ─────────────────────────────────────────────
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [promptModalTarget, setPromptModalTarget] = useState(null)
  // isNew: when adding a new scenario, no value/label yet
  const [promptModalIsNew, setPromptModalIsNew] = useState(false)

  // Build merged scenario list: presets (excluding 'custom') + user custom
  const presetScenarios = (SCENARIOS[language] || SCENARIOS.en)
    .filter(s => s.value !== 'custom')
  const allScenarios = [...presetScenarios, ...customScenarios]

  // Lookup helpers
  const getScenarioLabel = useCallback((value) => {
    const found = allScenarios.find(s => s.value === value)
    return found ? found.label : value
  }, [allScenarios])

  const isCustomScenario = useCallback((value) => {
    return customScenarios.some(s => s.value === value)
  }, [customScenarios])

  // Auto-resize textarea to fit content (runs before paint, every render)
  useLayoutEffect(() => {
    const ta = goalTextareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  })

  // Re-measure on window resize (media query changes affect text wrapping)
  useEffect(() => {
    const handleResize = () => {
      const ta = goalTextareaRef.current
      if (!ta) return
      ta.style.height = 'auto'
      ta.style.height = ta.scrollHeight + 'px'
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Click outside to close dropdown
  useEffect(() => {
    if (!dropdownOpen) return
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  // Compute effective values: use defaults when input is empty
  const effectiveMaxRounds = maxRounds === '' ? 10 : maxRounds
  const effectiveTargetKnowledge = targetKnowledge === '' ? 5 : targetKnowledge

  // Handle "随机" button click — generate a goal via API and fill the input
  const handleRandomGoal = async () => {
    if (goalLoading || generatingRef.current) return
    generatingRef.current = true
    setGoalLoading(true)
    const scenarioLabel = getScenarioLabel(scenario)
    debug.proficiency(`[ScenarioSetup] 随机生成目标时评分: ${language.toUpperCase()} = ${proficiencyScore !== null ? proficiencyScore.toFixed(2) : 'N/A'}`)
    try {
      const goal = await generateGoal(scenarioLabel, scenario)
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

    // If input is empty, auto-generate a goal first
    if (!conversationGoal?.trim()) {
      setGoalLoading(true)
      try {
        const scenarioLabel = getScenarioLabel(scenario)
        const goal = await generateGoal(scenarioLabel, scenario)
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
      setConfirmError(t('validationGoal'))
      return
    }
    if (!effectiveMaxRounds || !effectiveTargetKnowledge) {
      setConfirmError(t('validationMaxRounds'))
      return
    }
    setShowConfirm(false)
    setConfirmError('')

    onStartChat({
      scenario: scenario,
      scenarioLabel: getScenarioLabel(scenario),
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

  // ── Dropdown handlers ──────────────────────────────────────────────

  const handleSelectScenario = (value) => {
    onScenarioChange(value)
    setDropdownOpen(false)
  }

  const handleOpenPromptModal = (e, s) => {
    e.stopPropagation()
    setDropdownOpen(false)
    setPromptModalIsNew(false)
    setPromptModalTarget({ value: s.value, label: s.label, isPreset: !isCustomScenario(s.value) })
    setPromptModalOpen(true)
  }

  const handleDeleteScenario = (e, s) => {
    e.stopPropagation()
    if (window.confirm(t('deleteScenarioConfirm'))) {
      // If deleting the currently selected scenario, switch to first preset
      if (scenario === s.value) {
        onScenarioChange(presetScenarios[0]?.value || 'restaurant')
      }
      onDeleteScenario?.(s.value)
    }
  }

  const handleStartAddNew = (e) => {
    e.stopPropagation()
    setDropdownOpen(false)
    setPromptModalIsNew(true)
    setPromptModalTarget(null)
    setPromptModalOpen(true)
  }

  const handleScenarioCreated = useCallback((newScenario) => {
    onScenarioChange(newScenario.value)
    onScenarioCreated?.(newScenario)
  }, [onScenarioChange, onScenarioCreated])

  // ── Goal textarea handler ──────────────────────────────────────────
  const handleGoalInput = useCallback((e) => {
    onConversationGoalChange(e.target.value)
  }, [onConversationGoalChange])

  const selectedLabel = getScenarioLabel(scenario)

  return (
    <div className="scenario-setup">
      <h2 className="scenario-title">{t('scenarioSetup')}</h2>

      {/* Assessment banner for first-time users */}
      {isFirstTime && (
        <div className="assessment-banner">
          <div className="assessment-banner-icon">🔍</div>
          <div className="assessment-banner-text">
            <strong>欢迎！先来测测你的水平吧</strong>
            <p>通过一段简短的对话（约 8-10 轮）来评估你当前的外语水平。AI 会根据你的回答自动调整难度。</p>
          </div>
          <div className="assessment-banner-actions">
            <button
              className="assessment-start-btn"
              onClick={() => onStartAssessment?.()}
            >
              开始测评
            </button>
            <button
              className="assessment-skip-btn"
              onClick={() => onSkipAssessment?.()}
            >
              跳过（默认 Lv.3）
            </button>
          </div>
        </div>
      )}

      <div className="scenario-fields-wrapper">
        {/* 场景选择 — custom dropdown */}
        <div className="scenario-field">
          <label className="scenario-label">{t('scenario')}</label>
          <div className="scenario-dropdown" ref={dropdownRef}>
            <button
              type="button"
              className="scenario-dropdown-trigger"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              <span className="scenario-dropdown-label">{selectedLabel}</span>
              <span className={`scenario-dropdown-arrow ${dropdownOpen ? 'open' : ''}`}>▼</span>
            </button>

            {dropdownOpen && (
              <div className="scenario-dropdown-menu">
                {allScenarios.map((s) => (
                  <div
                    key={s.value}
                    className={`scenario-dropdown-item ${s.value === scenario ? 'selected' : ''}`}
                    onClick={() => handleSelectScenario(s.value)}
                  >
                    <span className="scenario-dropdown-item-name">{s.label}</span>
                    <div className="scenario-dropdown-item-actions">
                      <button
                        type="button"
                        className="scenario-gear-btn"
                        onClick={(e) => handleOpenPromptModal(e, s)}
                        title={t('scenarioSettings')}
                      >
                        ⚙️
                      </button>
                      {isCustomScenario(s.value) && (
                        <button
                          type="button"
                          className="scenario-delete-btn"
                          onClick={(e) => handleDeleteScenario(e, s)}
                          title={t('deleteScenario')}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Divider + Add new */}
                <div className="scenario-dropdown-divider" />

                <div
                  className="scenario-dropdown-item scenario-dropdown-add-new"
                  onClick={handleStartAddNew}
                >
                  <span>+ {t('addNewScenario')}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 对话目标 — textarea + 随机按钮 */}
        <div className="scenario-field">
          <label className="scenario-label">{t('conversationGoal')}</label>
          <div className="goal-input-row">
            <textarea
              ref={goalTextareaRef}
              className="scenario-input goal-input goal-textarea"
              placeholder={t('goalPlaceholder')}
              value={conversationGoal}
              onChange={handleGoalInput}
            />
            <button
              className="goal-random-btn"
              onClick={handleRandomGoal}
              disabled={goalLoading}
              title={t('random')}
            >
              {goalLoading ? '...' : `🎲 ${t('random')}`}
            </button>
          </div>
        </div>

        {/* 纠错敏感度 */}
        <div className="scenario-field">
          <label className="scenario-label">{t('sensitivity')}</label>
          <div className="sensitivity-group">
            {['loose', 'normal', 'strict'].map((key) => (
              <button
                key={key}
                className={`sensitivity-btn ${sensitivity === key ? 'active' : ''}`}
                onClick={() => onSensitivityChange(key)}
              >
                {{ loose: '🥱', normal: '🙂', strict: '🧐' }[key]}
              </button>
            ))}
          </div>
        </div>

        {/* 最大轮次 */}
        <div className="scenario-field">
          <label className="scenario-label">{t('maxRounds')}</label>
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
          <label className="scenario-label">{t('targetKnowledge')}</label>
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
          {t('startChat')}
        </button>
      </div>

      {/* Confirm dialog overlay */}
      {showConfirm && (
        <div className="confirm-overlay" onClick={handleCancel}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm-title">
              {t('confirmTitle')}
            </h3>
            <div className="confirm-body">
              <div className="confirm-item">
                <span className="confirm-label">{t('scenario')}</span>
                <span className="confirm-value">{selectedLabel}</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">{t('conversationGoal')}</span>
                <span className="confirm-value confirm-goal-text">
                  {conversationGoal || (goalLoading ? t('confirmGeneratingGoal') : t('confirmUnfilled'))}
                </span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">{t('sensitivity')}</span>
                <span className="confirm-value">{{ loose: '🥱', normal: '🙂', strict: '🧐' }[sensitivity] || sensitivity}</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">{t('maxRounds')}</span>
                <span className="confirm-value">{effectiveMaxRounds}</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">{t('targetKnowledge')}</span>
                <span className="confirm-value">{effectiveTargetKnowledge}</span>
              </div>
            </div>
            {confirmError && (
              <div className="confirm-error">{confirmError}</div>
            )}
            <div className="confirm-actions">
              <button className="confirm-cancel-btn" onClick={handleCancel}>
                {t('confirmCancel')}
              </button>
              <button className="confirm-ok-btn" onClick={handleConfirm}>
                {t('confirmOk')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt editing modal */}
      <ScenarioPromptModal
        isOpen={promptModalOpen}
        onClose={() => setPromptModalOpen(false)}
        scenarioValue={promptModalIsNew ? '' : (promptModalTarget?.value || '')}
        scenarioLabel={promptModalIsNew ? '' : (promptModalTarget?.label || '')}
        isPreset={!promptModalIsNew && (promptModalTarget?.isPreset ?? true)}
        language={language}
        proficiencyScore={proficiencyScore}
        onScenarioCreated={handleScenarioCreated}
      />
    </div>
  )
})

export default ScenarioSetup
