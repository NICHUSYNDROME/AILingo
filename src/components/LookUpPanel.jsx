import { memo } from 'react'
import './LookUpPanel.css'
import { TYPE_CONFIG, JA_TYPE_CONFIG } from '../config/languages'

// 语法知识点备用释义映射
const GRAMMAR_FALLBACK_MEANINGS = {
  'double negatives': {
    en: "Using two negatives in a clause ('don't have no') which creates a positive meaning. Use 'any' instead of 'no' after negative verbs.",
    zh: "双重否定：在一个分句中使用两个否定词（如 'don't have no'），这会表达肯定含义。在否定动词后应使用 'any' 而不是 'no'。"
  },
  'past tense': {
    en: "Past tense indicates an action that happened before now. Regular verbs add '-ed', irregular verbs have special forms.",
    zh: "过去时：表示发生在过去的动作。规则动词加 '-ed'，不规则动词有特殊形式。"
  },
  'subject-verb agreement': {
    en: "The subject and verb must agree in number. A singular subject takes a singular verb, a plural subject takes a plural verb.",
    zh: "主谓一致：主语和动词必须在数上保持一致。单数主语用单数动词，复数主语用复数动词。"
  },
  'article usage': {
    en: "Articles (a/an/the) are used before nouns. 'A/an' for non-specific items, 'the' for specific ones. 'A' before consonant sounds, 'an' before vowel sounds.",
    zh: "冠词用法：冠词（a/an/the）用于名词前。'a/an' 表示非特定事物，'the' 表示特定事物。辅音前用 'a'，元音前用 'an'。"
  },
  'preposition': {
    en: "Prepositions show relationships between words (time, place, direction). Common prepositions: in, on, at, for, to, with, by.",
    zh: "介词：介词表示词与词之间的关系（时间、地点、方向）。常见介词：in, on, at, for, to, with, by。"
  },
  'word order': {
    en: "English follows Subject-Verb-Object word order. Adjectives come before nouns, adverbs can be flexible.",
    zh: "语序：英语遵循主-谓-宾的语序。形容词放在名词前，副词位置较灵活。"
  }
}

const getGrammarFallback = (word, field) => {
  const lower = word.toLowerCase()
  // Try exact match first
  if (GRAMMAR_FALLBACK_MEANINGS[lower]) {
    return GRAMMAR_FALLBACK_MEANINGS[lower][field]
  }
  // Try partial match
  for (const [key, val] of Object.entries(GRAMMAR_FALLBACK_MEANINGS)) {
    if (lower.includes(key) || key.includes(lower)) {
      return val[field]
    }
  }
  return null
}

const TIPS = [
  { key: 'select', icon: '\uD83D\uDD0D' },
  { key: 'type', icon: '\u2328\uFE0F' },
  { key: 'confirm', icon: '\u2705' },
  { key: 'review', icon: '\uD83D\uDCDD' },
]

const TIP_TEXT_KEYS = {
  select: 'lookUpTipSelect',
  type: 'lookUpTipType',
  confirm: 'lookUpTipConfirm',
  review: 'lookUpTipReview',
}

const LookUpPanel = memo(function LookUpPanel({ point, expandedChinese, onToggleChinese, language = 'en', uiText }) {
  const typeConfigMap = language === 'ja' ? JA_TYPE_CONFIG : TYPE_CONFIG

  if (!point) {
    return (
      <div className="lup-idle">
        <div className="lup-idle-icon">{'\uD83D\uDCD6'}</div>
        <div className="lup-idle-tips">
          {TIPS.map((tip) => (
            <div key={tip.key} className="lup-idle-tip">
              <span className="lup-idle-tip-icon">{tip.icon}</span>
              <span
                className="lup-idle-tip-text"
                dangerouslySetInnerHTML={{ __html: uiText[TIP_TEXT_KEYS[tip.key]] || '' }}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const typeConfig = typeConfigMap[point.type] || typeConfigMap.word

  // 为 grammar 类型生成备用释义
  const displayMeaning = point.meaning || (point.type === 'grammar' ? (getGrammarFallback(point.word, 'en') || uiText.grammarRulePrefix + point.word + ' - Check your correction for details.') : '')
  const displayMeaningChinese = point.meaningChinese || (point.type === 'grammar' ? (getGrammarFallback(point.word, 'zh') || '') : '')

  return (
    <div className="lup-card">
      {/* Word */}
      <div className="lup-word">{point.word}</div>

      {/* Phonetic — only for word or phrase types */}
      {(point.type === 'word' || point.type === 'phrase') && point.phonetic && (
        <div className="lup-phonetic">{point.phonetic}</div>
      )}

      {/* Type tag */}
      <span
        className="lup-type-tag"
        style={{ color: typeConfig.color, backgroundColor: typeConfig.bg }}
      >
        {typeConfig.label}
      </span>

      {/* Divider */}
      <div className="lup-divider" />

      {/* Definition */}
      <div className="lup-section">
        <div className="lup-section-label">{uiText.definition}</div>
        {displayMeaning ? (
          <div className="lup-meaning-en">{displayMeaning}</div>
        ) : (
          <div className="lup-meaning-en lup-meaning-empty">{uiText.noDefinition}</div>
        )}
        <div className="lup-chinese-area">
          {displayMeaningChinese ? (
            <>
              {expandedChinese && (
                <div className="lup-meaning-zh">{displayMeaningChinese}</div>
              )}
              <button className="lup-chinese-toggle" onClick={onToggleChinese}>
                {expandedChinese ? uiText.hideChinese : uiText.showChinese}
              </button>
            </>
          ) : (
            <div className="lup-chinese-placeholder">{uiText.noChineseDefinition}</div>
          )}
        </div>
      </div>

      {/* Part of Speech */}
      {point.partOfSpeech && (
        <div className="lup-section">
          <div className="lup-section-label">{uiText.partOfSpeech}</div>
          <div className="lup-value">{point.partOfSpeech}</div>
        </div>
      )}

      {/* Example */}
      {point.examples && point.examples.length > 0 && (
        <div className="lup-section">
          <div className="lup-section-label">{uiText.example}</div>
          <div className="lup-example">
            &ldquo;{point.examples[0]}&rdquo;
          </div>
        </div>
      )}

      {/* Context */}
      {point.context && (
        <div className="lup-section">
          <div className="lup-section-label">{uiText.context}</div>
          <div className="lup-context">{point.context}</div>
        </div>
      )}
    </div>
  )
})

export default LookUpPanel
