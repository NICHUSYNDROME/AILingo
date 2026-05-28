/**
 * Scenario Store — custom scenarios & custom system prompt persistence.
 *
 * Storage keys:
 *   custom_scenarios_{lang}              → JSON Array<{value: string, label: string}>
 *   custom_universal_prompt_{lang}       → string (shared universal background, per language)
 *   custom_scene_prompt_{lang}_{value}   → string (scenario-specific prompt, per scenario)
 *
 * Preset prompts (from buildSystemPrompt/buildUniversalPrompt/buildScenarioPrompt)
 * are NEVER stored here. They live in source code and are read-only.
 * Custom prompts are independent copies that override the preset when non-empty.
 */

import { getItem, setItem, removeItem } from './storage'

// ── Custom Scenarios ────────────────────────────────────────────────────

function scenariosKey(lang) {
  return `custom_scenarios_${lang}`
}

/** Get all custom scenarios for a language. Returns [] if none. */
export async function getCustomScenarios(lang) {
  try {
    const raw = await getItem(scenariosKey(lang))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Add a new custom scenario. Returns the created scenario object. */
export async function addCustomScenario(lang, label) {
  const scenarios = await getCustomScenarios(lang)
  const value = `custom_${Date.now()}`
  const newScenario = { value, label: label.trim() }
  scenarios.push(newScenario)
  await setItem(scenariosKey(lang), JSON.stringify(scenarios))
  return newScenario
}

/**
 * Rename a custom scenario. Does nothing for non-custom scenarios.
 * Returns the updated scenario or null.
 */
export async function renameCustomScenario(lang, value, newLabel) {
  const scenarios = await getCustomScenarios(lang)
  const idx = scenarios.findIndex(s => s.value === value)
  if (idx === -1) return null
  scenarios[idx].label = newLabel.trim()
  await setItem(scenariosKey(lang), JSON.stringify(scenarios))
  return scenarios[idx]
}

/**
 * Delete a custom scenario and its associated prompts.
 * Does nothing if the scenario doesn't exist.
 */
export async function deleteCustomScenario(lang, value) {
  const scenarios = await getCustomScenarios(lang)
  const filtered = scenarios.filter(s => s.value !== value)
  if (filtered.length === scenarios.length) return // nothing to delete
  await setItem(scenariosKey(lang), JSON.stringify(filtered))
  // Cascade: also remove the scenario-specific prompt
  await deleteScenePrompt(lang, value)
}

// ── Universal Prompt (shared across all scenarios per language) ─────────

function universalKey(lang) {
  return `custom_universal_prompt_${lang}`
}

export async function getUniversalPrompt(lang) {
  try {
    const raw = await getItem(universalKey(lang))
    return raw || null
  } catch {
    return null
  }
}

export async function setUniversalPrompt(lang, promptText) {
  if (!promptText || !promptText.trim()) {
    await deleteUniversalPrompt(lang)
    return
  }
  await setItem(universalKey(lang), promptText)
}

export async function deleteUniversalPrompt(lang) {
  await removeItem(universalKey(lang))
}

// ── Scenario-Specific Prompt (per scenario) ────────────────────────────

function scenePromptKey(lang, scenarioValue) {
  return `custom_scene_prompt_${lang}_${scenarioValue}`
}

export async function getScenePrompt(lang, scenarioValue) {
  try {
    const raw = await getItem(scenePromptKey(lang, scenarioValue))
    return raw || null
  } catch {
    return null
  }
}

export async function setScenePrompt(lang, scenarioValue, promptText) {
  if (!promptText || !promptText.trim()) {
    await deleteScenePrompt(lang, scenarioValue)
    return
  }
  await setItem(scenePromptKey(lang, scenarioValue), promptText)
}

export async function deleteScenePrompt(lang, scenarioValue) {
  await removeItem(scenePromptKey(lang, scenarioValue))
}

// ── Scene Description (brief context for AI generation) ───────────────

function sceneDescKey(lang, scenarioValue) {
  return `custom_scene_desc_${lang}_${scenarioValue}`
}

export async function getSceneDesc(lang, scenarioValue) {
  try {
    const raw = await getItem(sceneDescKey(lang, scenarioValue))
    return raw || null
  } catch {
    return null
  }
}

export async function setSceneDesc(lang, scenarioValue, desc) {
  if (!desc || !desc.trim()) {
    await removeItem(sceneDescKey(lang, scenarioValue))
    return
  }
  await setItem(sceneDescKey(lang, scenarioValue), desc.trim())
}

// ── Scene Diversity Level (slider 0-4) ───────────────────────────────

function diversityKey(lang, scenarioValue) {
  return `custom_diversity_${lang}_${scenarioValue}`
}

export async function getDiversity(lang, scenarioValue) {
  try {
    const raw = await getItem(diversityKey(lang, scenarioValue))
    if (raw === null) return 2 // default: balanced
    const n = parseInt(raw, 10)
    return isNaN(n) ? 2 : Math.max(0, Math.min(4, n))
  } catch {
    return 2
  }
}

export async function setDiversity(lang, scenarioValue, level) {
  const n = Math.max(0, Math.min(4, level))
  await setItem(diversityKey(lang, scenarioValue), String(n))
}

const DIVERSITY_LABELS = {
  en: [
    'Be consistent and predictable. Use the same style and opening approach every time.',
    'Mild variation. Occasionally change phrasing, but keep the structure similar.',
    'Natural variation. Vary responses and avoid repeating the same opening lines.',
    'Be creative. Use different opening scenarios, different details, and varied expressions each time.',
    'MAX creativity. Every conversation must start differently — vary the specific situation, location, problem, mood, and details. Never repeat the same scenario setup.',
  ],
  ja: [
    '一貫性を重視。毎回同じスタイル・同じ切り出し方で返答してください。',
    '軽い変化を。時々言い回しを変えますが、構造は似たままに。',
    '自然な変化を。返答を多様にし、同じ出だしを繰り返さないでください。',
    '創造的に。毎回異なる切り出し方、異なる具体的状況、異なる表現を使ってください。',
    '最大の創造性。毎回必ず異なる会話の始まり方に——具体的な場所・問題・雰囲気・詳細を変え、同じシチュエーション設定を二度と繰り返さないでください。',
  ],
}

export function getDiversityText(level, language = 'en') {
  const labels = DIVERSITY_LABELS[language] || DIVERSITY_LABELS.en
  const label = labels[Math.max(0, Math.min(4, level))] || labels[2]
  const prefix = language === 'ja'
    ? `多様性レベル ${level}`
    : `Diversity level ${level}`
  return `${prefix}: ${label}`
}
