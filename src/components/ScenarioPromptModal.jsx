import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { buildUniversalPrompt, buildSceneParams, getDefaultSceneNotes } from '../api/prompts'
import { generateSystemPrompt } from '../api/chat'
import {
  getUniversalPrompt, setUniversalPrompt, deleteUniversalPrompt,
  getScenePrompt, setScenePrompt, deleteScenePrompt,
  getSceneDesc, setSceneDesc,
  addCustomScenario, renameCustomScenario,
} from '../utils/scenarioStore'
import './ScenarioPromptModal.css'

/**
 * Modal for editing scenario name, scenario-specific prompt, and universal prompt.
 *
 * Props:
 *   isOpen              - Show/hide the modal
 *   onClose             - Called when modal is dismissed
 *   scenarioValue       - Scenario identifier (empty/null = new scenario)
 *   scenarioLabel       - Human-readable scenario name (empty for new)
 *   isPreset            - True if this is a preset scenario (name not renamable, but can copy)
 *   language            - Current language ("en" | "ja")
 *   proficiencyScore    - User's current proficiency (number | null)
 *   onScenarioCreated   - Called with new scenario: ({value, label}) => void
 *   onScenarioRenamed   - Called with: (oldValue, newValue, newLabel) => void
 */
export default function ScenarioPromptModal({
  isOpen,
  onClose,
  scenarioValue,
  scenarioLabel,
  isPreset = false,
  language,
  proficiencyScore,
  onScenarioCreated,
  onScenarioRenamed,
}) {
  const { t } = useTranslation()

  // Name
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')

  // Description (brief context for AI generation)
  const [description, setDescription] = useState('')

  // Scenario-specific prompt
  const [scenePrompt, setScenePromptState] = useState('')
  const [scenePromptPreset, setScenePromptPreset] = useState('')

  // Universal prompt
  const [universalPrompt, setUniversalPromptState] = useState('')
  const [universalPreset, setUniversalPreset] = useState('')
  const [universalExpanded, setUniversalExpanded] = useState(false)

  const [isGenerating, setIsGenerating] = useState(false)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const sceneTextareaRef = useRef(null)
  const nameInputRef = useRef(null)

  const isNew = !scenarioValue

  // ── Load presets and saved prompts when modal opens ──────────────────
  useEffect(() => {
    if (!isOpen) return

    setName(isNew ? '' : (scenarioLabel || ''))
    setNameError('')
    setDescription('')
    setUniversalExpanded(false)
    setSavedIndicator(false)

    // Build universal preset
    const universal = buildUniversalPrompt(language)
    setUniversalPreset(universal)

    // Build scene params preset (for reference only, NOT for textarea)
    if (!isNew && scenarioValue) {
      const ctx = {
        scenario: scenarioValue,
        scenarioLabel: scenarioLabel,
        goal: '',
        sensitivity: 'normal',
        maxRounds: 10,
        targetKnowledge: 5,
        language,
        isAssessment: false,
      }
      setScenePromptPreset(buildSceneParams(ctx, language))
    } else {
      setScenePromptPreset('')
    }

    // Load saved universal prompt; if none, pre-fill with preset
    getUniversalPrompt(language).then(saved => {
      setUniversalPromptState(saved || universal)
    })

    // Load saved scene notes; if none, pre-fill with default notes for presets
    if (!isNew && scenarioValue) {
      getScenePrompt(language, scenarioValue).then(saved => {
        if (saved) {
          setScenePromptState(saved)
        } else {
          setScenePromptState(getDefaultSceneNotes(scenarioValue, language))
        }
      })
      // Load saved description
      getSceneDesc(language, scenarioValue).then(saved => {
        setDescription(saved || '')
      })
    } else {
      setScenePromptState('')
    }
  }, [isOpen, isNew, scenarioValue, scenarioLabel, language, proficiencyScore])

  // Focus name input for new scenario, scene textarea for existing
  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => {
      if (isNew && nameInputRef.current) {
        nameInputRef.current.focus()
      } else if (sceneTextareaRef.current) {
        sceneTextareaRef.current.focus()
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [isOpen, isNew])

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    const sceneName = name.trim() || scenarioLabel || ''
    if (!sceneName) {
      setNameError(t('aiGenerateNeedName'))
      return
    }
    setIsGenerating(true)
    try {
      const generated = await generateSystemPrompt(sceneName, language, proficiencyScore, description)
      if (generated) {
        setScenePromptState(generated)
      }
    } finally {
      setIsGenerating(false)
    }
  }, [name, scenarioLabel, description, language, proficiencyScore, t])

  const handleResetScene = useCallback(async () => {
    // Revert to default scene notes for presets, empty for custom/new
    const defaultNotes = (!isNew && isPreset)
      ? getDefaultSceneNotes(scenarioValue, language)
      : ''
    setScenePromptState(defaultNotes)
    if (!isNew && scenarioValue) {
      await deleteScenePrompt(language, scenarioValue)
    }
  }, [isNew, isPreset, language, scenarioValue])

  const handleResetUniversal = useCallback(async () => {
    setUniversalPromptState(universalPreset)
    await deleteUniversalPrompt(language)
  }, [language, universalPreset])

  const handleSave = useCallback(async () => {
    const sceneName = name.trim()

    if (!sceneName) {
      setNameError(t('validationCustomScenario'))
      return
    }

    let actualValue = scenarioValue

    if (isNew) {
      const created = await addCustomScenario(language, sceneName)
      if (!created) return
      actualValue = created.value
      onScenarioCreated?.(created)
    } else if (sceneName !== scenarioLabel) {
      if (!isPreset) {
        await renameCustomScenario(language, scenarioValue, sceneName)
        onScenarioRenamed?.(scenarioValue, actualValue, sceneName)
      }
    }

    if (scenePrompt.trim()) {
      await setScenePrompt(language, actualValue, scenePrompt.trim())
    } else {
      await deleteScenePrompt(language, actualValue)
    }

    await setSceneDesc(language, actualValue, description)
    await setUniversalPrompt(language, universalPrompt)

    setSavedIndicator(true)
    setTimeout(() => onClose(), 600)
  }, [isNew, name, scenarioLabel, scenarioValue, isPreset, scenePrompt, description, universalPrompt, language, onScenarioCreated, onScenarioRenamed, onClose, t])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const hasSceneCustom = scenePrompt.trim() !== '' &&
    scenePrompt.trim() !== getDefaultSceneNotes(scenarioValue, language).trim()
  const hasUniversalCustom = universalPrompt.trim() !== '' &&
    universalPrompt.trim() !== universalPreset.trim()

  return (
    <div className="spm-overlay" onClick={handleOverlayClick}>
      <div className="spm-card">
        {/* Header */}
        <div className="spm-header">
          <h2 className="spm-title">{t('editSystemPrompt')}</h2>
          <div className="spm-header-actions">
            <button className="spm-help-btn" onClick={() => setHelpOpen(true)} aria-label="Help" title={t('help')}>?</button>
            <button className="spm-close-btn" onClick={handleClose} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Scenario Name */}
        <div className="spm-field">
          <label className="spm-label">{t('scenario')}</label>
          <input
            ref={nameInputRef}
            type="text"
            className={`spm-name-input ${nameError ? 'spm-name-input-error' : ''} ${isPreset && !isNew ? 'spm-name-readonly' : ''}`}
            placeholder={t('newScenarioPlaceholder')}
            value={name}
            onChange={(e) => { if (!isPreset || isNew) { setName(e.target.value); setNameError('') } }}
            readOnly={isPreset && !isNew}
          />
          {nameError && <span className="spm-error">{nameError}</span>}
          {isPreset && !isNew && <span className="spm-hint">{t('presetNameHint')}</span>}
        </div>

        {/* Description (optional context for AI generation) */}
        <div className="spm-field">
          <label className="spm-label">{t('sceneDescription')}</label>
          <input
            type="text"
            className="spm-name-input"
            placeholder={t('sceneDescriptionPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Scenario-Specific Prompt (main editing area) */}
        <div className="spm-section">
          <div className="spm-label-row">
            <label className="spm-label">
              {t('scenePromptLabel')}
              {hasSceneCustom && <span className="spm-modified-dot" title={t('customPromptSavedHint')} />}
            </label>
            <button
              className="spm-btn spm-btn-generate"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? t('aiGeneratingPrompt') : t('aiGeneratePrompt')}
            </button>
          </div>
          <textarea
            ref={sceneTextareaRef}
            className="spm-textarea spm-textarea-scene"
            value={scenePrompt}
            onChange={(e) => setScenePromptState(e.target.value)}
            placeholder={t('scenePromptPlaceholder')}
            rows={8}
          />
          <p className="spm-hint">{t('scenePromptHint')}</p>
          {hasSceneCustom && (
            <button className="spm-btn spm-btn-reset" onClick={handleResetScene}>
              {t('resetPromptToDefault')}
            </button>
          )}
        </div>

        {/* Universal Prompt (collapsed, expandable) */}
        <details
          className="spm-section spm-universal-section"
          open={universalExpanded}
          onToggle={(e) => setUniversalExpanded(e.target.open)}
        >
          <summary className="spm-universal-summary">
            {t('universalPromptLabel')}
            {hasUniversalCustom && <span className="spm-modified-dot" />}
            <span className="spm-universal-arrow">{universalExpanded ? '▼' : '▶'}</span>
          </summary>
          <div className="spm-universal-body">
            <p className="spm-hint">{t('universalPromptHint')}</p>
            <textarea
              className="spm-textarea spm-textarea-universal"
              value={universalPrompt}
              onChange={(e) => setUniversalPromptState(e.target.value)}
              placeholder={universalPreset}
              rows={6}
            />
            {hasUniversalCustom && (
              <button className="spm-btn spm-btn-reset spm-universal-reset" onClick={handleResetUniversal}>
                {t('resetPromptToDefault')}
              </button>
            )}
          </div>
        </details>

        {/* Footer */}
        <div className="spm-actions">
          <div className="spm-actions-right">
            <button className="spm-btn spm-btn-cancel" onClick={handleClose}>
              {t('confirmCancel')}
            </button>
            <button className="spm-btn spm-btn-save" onClick={handleSave}>
              {savedIndicator ? t('promptSaved') : t('save')}
            </button>
          </div>
        </div>

        {/* Help modal */}
        {helpOpen && (
          <div className="spm-help-overlay" onClick={() => setHelpOpen(false)}>
            <div className="spm-help-card" onClick={(e) => e.stopPropagation()}>
              <div className="spm-help-header">
                <h3>System Prompt 结构说明</h3>
                <button className="spm-close-btn" onClick={() => setHelpOpen(false)}>✕</button>
              </div>
              <div className="spm-help-body">
                <p className="spm-help-intro">最终发送给 AI 的 System Prompt 由以下四部分按顺序拼接而成：</p>

                <div className="spm-help-block">
                  <h4>① 水平指导（自动生成）</h4>
                  <p>根据用户的当前水平分（proficiency score）动态生成，<strong>不在任何编辑窗口中显示</strong>。包含当前级别描述、适应策略和 i+1 目标。每次对话开始时由程序自动注入。</p>
                </div>

                <div className="spm-help-block">
                  <h4>② 通用设定 / Universal Settings（手动编辑）</h4>
                  <p>对应弹窗底部的 <strong>「共通設定（役割・スタイル・ルール）」</strong> 折叠面板。包含 AI 的角色定义、人格特征、会话风格、语言规则和禁止事项。默认为预制的通用设定，展开后可编辑。修改后按语言全局生效。</p>
                </div>

                <div className="spm-help-block">
                  <h4>③ 场景参数（自动生成）</h4>
                  <p>根据下方 Scenario Setup 表单中的设置自动生成，<strong>不在任何编辑窗口中显示</strong>。包含：场景名、订正感度、目标知识点数、最大轮次、多样性规则、对话目标。</p>
                </div>

                <div className="spm-help-block">
                  <h4>④ 场景笔记 / Scene Notes（手动编辑）</h4>
                  <p>对应弹窗中的 <strong>「シーンノート（役割・会話の流れ）（Scene Notes）」</strong> 编辑框。用于描述该场景下 AI 的角色扮演细节、会话流程和关键短语。<strong>不需要写</strong>订正感度、知识点数等参数（这些由场景参数自动生成）。</p>
                  <p className="spm-help-eg">示例格式：<br/>役割: 你是餐厅服务员<br/>会话流程: 迎客→介绍菜单→点单→确认→结账<br/>关键短语: 「欢迎光临」「今天推荐…」</p>
                </div>

                <div className="spm-help-block spm-help-final">
                  <h4>最终拼接结果</h4>
                  <code>水平指导 + 通用设定 + 场景参数 + 场景笔记</code>
                  <p style={{marginTop:8}}>四部分之间以空行分隔。用户自定义的内容会覆盖对应部分的预制默认值。</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
