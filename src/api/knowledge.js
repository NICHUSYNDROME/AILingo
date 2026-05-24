/**
 * Knowledge extraction API — extract structured knowledge points from triggers.
 */

import { API_URL, getApiKey, parseJSONResponse } from './client'

/**
 * Extract a single structured knowledge point from a specific trigger event.
 *
 * @param {Object} trigger - The trigger event
 *   - type 'user_asked': { type: 'user_asked', word: '用户查询的单词或短语' }
 *   - type 'correction': { type: 'correction', original: '原始错误', corrected: '纠正后', explanation: 'AI解释' }
 * @param {string} context - Surrounding conversation context
 * @param {string} [language='en'] - Language code
 * @returns {Object|null} Structured knowledge point or null on failure
 */
export async function extractSpecificKnowledge(trigger, context, language = 'en') {
  const apiKey = await getApiKey()
  if (!apiKey) return null

  let triggerDescription = ''
  if (trigger.type === 'user_asked') {
    triggerDescription = language === 'ja'
      ? `ユーザーが単語・フレーズを検索しました: "${trigger.word}"`
      : `用户主动查询了单词或短语: "${trigger.word}"`
  } else if (trigger.type === 'correction') {
    triggerDescription = language === 'ja'
      ? `AIがユーザーの表現を訂正しました:\n` +
        `- ユーザーの元の表現: "${trigger.original}"\n` +
        `- 訂正後: "${trigger.corrected}"\n` +
        `- AIの説明: "${trigger.explanation}"`
      : `AI纠正了用户的表达错误:\n` +
        `- 用户原始表达: "${trigger.original}"\n` +
        `- 纠正后: "${trigger.corrected}"\n` +
        `- AI解释: "${trigger.explanation}"`
  } else {
    return null
  }

  const systemPrompt = language === 'ja'
    ? '以下のトリガー情報から構造化された知識ポイントを抽出してください。\n' +
      '厳密な JSON 形式で返してください。他のテキストは不要です。JSON には以下のフィールドがすべて含まれている必要があります：\n' +
      '{\n' +
      '  "word": "xxx",\n' +
      '  "meaning": "日本語の定義（必須）",\n' +
      '  "meaningChinese": "中国語の意味（必須、空にしないこと）",\n' +
      '  "type": "word|phrase|grammar|collocation|keigo|joshi|katsuyou",\n' +
      '  "partOfSpeech": "noun|verb|adjective...",\n' +
      '  "example": "例文",\n' +
      '  "context": "出典の文",\n' +
      '  "phonetic": "読み仮名（例：れすとらん）"\n' +
      '}\n' +
      '\n' +
      'ユーザーが自ら検索した単語の場合は、その単語の完全な情報を抽出し、例文を必ず含めてください。\n' +
      '訂正がトリガーの場合は、訂正対象の表現を抽出：word は正しい表現、meaning は日本語での説明、context はユーザーの元の誤った文、正しい使い方を示す例文を必ず含めてください。\n' +
      '厳密にこの1つの知識ポイントのみを抽出してください。\n' +
      '\n' +
      'type 分類基準：\n' +
      '- word：単一の単語、例：「食べる」「美味しい」\n' +
      '- phrase：複数単語の定型表現、例：「お願いします」「いただきます」\n' +
      '- grammar：文法ルールや文型、例：「〜なければならない」「〜たほうがいい」\n' +
      '- collocation：よく使われる語の組み合わせ、例：「お茶を飲む」「電話をかける」\n' +
      '- keigo：敬語（尊敬語・謙譲語・丁寧語）、例：「いらっしゃいます」「おっしゃる」\n' +
      '- joshi：助詞、例：「は」「が」「を」「に」\n' +
      '- katsuyou：活用（動詞・形容詞の活用形）、例：「行く→行って」「食べる→食べない」\n' +
      '\n' +
      'CRITICAL: meaningChinese フィールドは有効な中国語の意味でなければなりません。空文字列は不可。\n' +
      'If you cannot provide a Chinese meaning, do not return the knowledge point at all.\n' +
      '\n' +
      'word normalization: 単語フィールドを標準形に正規化してください。動詞は辞書形（例：「食べる」）、形容詞は基本形（例：「美味しい」）。\n' +
      '\n' +
      'phonetic rules:\n' +
      '- For type "word" and "keigo": phonetic フィールドは必須。読み仮名（ひらがな）を提供してください。\n' +
      '- For type "phrase": 新しい語彙を含む場合は主要な単語の読みを提供。それ以外は空文字列。\n' +
      '- For type "grammar", "collocation", "joshi", "katsuyou": phonetic は空文字列。\n' +
      '\n' +
      'CRITICAL: Return ONLY the JSON object. Do not add any greeting, explanation, or other text. Start with { and end with }.'
    : '从以下触发信息中提取结构化的知识点。\n' +
      '以严格的 JSON 格式返回，不要其他文字。JSON 必须包含以下字段，每个字段都必须有值：\n' +
      '{\n' +
      '  "word": "xxx",\n' +
      '  "meaning": "English definition (required)",\n' +
      '  "meaningChinese": "中文释义 (required, must not be empty)",\n' +
      '  "type": "word|phrase|grammar|collocation",\n' +
      '  "partOfSpeech": "noun|verb|adjective...",\n' +
      '  "example": "an example sentence",\n' +
      '  "context": "source sentence",\n' +
      '  "phonetic": "phonetic transcription (e.g., /ˈrestərɒnt/)"\n' +
      '}\n' +
      '\n' +
      '如果是用户主动查询的词，提取该词的完整信息，必须包含一个例句。\n' +
      '如果是纠错触发的，提取纠正目标表达：word 为正确表达，meaning 为英文解释，context 为用户原始错误句子，必须包含一个例句展示正确用法。\n' +
      '严格只提取这一个知识点。\n' +
      '\n' +
      'type 分类标准：\n' +
      '- word：单个单词，如 "bellboy"、"overwhelming"\n' +
      '- phrase：多个单词的固定表达，如 "check in"、"soup of the day"\n' +
      '- grammar：语法规则或句型结构，如 "If I were you, I would..."\n' +
      '- collocation：常见词语搭配，如 "make a decision"、"heavy rain"\n' +
      '\n' +
      'CRITICAL: meaningChinese 字段必须是有效的中文释义，不能为空字符串。\n' +
      'If you cannot provide a Chinese meaning, do not return the knowledge point at all.\n' +
      '\n' +
      'word normalization: Normalize the word field to its standard form: most words should be lowercase, except proper nouns.\n' +
      '\n' +
      'phonetic rules (STRICT):\n' +
      '- For type "word": phonetic field is REQUIRED. You MUST provide IPA phonetic transcription.\n' +
      '- For type "phrase": provide IPA for the key word if it contains a new vocabulary word, otherwise set to empty string.\n' +
      '- For type "grammar" and "collocation": set phonetic to empty string.\n' +
      '\n' +
      'CRITICAL: Return ONLY the JSON object. Do not add any greeting, explanation, or other text. Start with { and end with }.'

  const userContent = language === 'ja'
    ? `トリガー情報：\n${triggerDescription}\n\n会話コンテキスト：\n${context}\n\n知識ポイントを抽出し、JSONで返してください。`
    : `触发信息：\n${triggerDescription}\n\n对话上下文：\n${context}\n\n请提取知识点，以 JSON 返回。`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]

  // Debug: log the full system prompt to verify phonetic instructions are present
  console.log('[extractSpecificKnowledge] === System Prompt (phonetic debug) ===')
  console.log(systemPrompt)
  console.log('[extractSpecificKnowledge] === End System Prompt ===')
  console.log('[extractSpecificKnowledge] Trigger:', triggerDescription)

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0,
        stream: false,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      console.warn('[extractSpecificKnowledge] API request failed:', response.status)
      return null
    }

    const data = await response.json()
    const parsed = parseJSONResponse(data.choices[0].message.content)

    // Debug: log the parsed knowledge point to verify phonetic field
    console.log('[extractSpecificKnowledge] Parsed knowledge point:', JSON.stringify(parsed, null, 2))

    // Ensure it's a single object (not array)
    if (Array.isArray(parsed)) {
      const result = parsed.length > 0 ? parsed[0] : null
      console.log('[extractSpecificKnowledge] Result (from array):', result ? result.word : null, 'phonetic:', result?.phonetic)
      return result
    }
    if (parsed && typeof parsed === 'object' && parsed.word) {
      console.log('[extractSpecificKnowledge] Result:', parsed.word, 'phonetic:', parsed.phonetic)
      return parsed
    }
    console.log('[extractSpecificKnowledge] No valid knowledge point found in response')
    return null
  } catch (error) {
    console.warn('[extractSpecificKnowledge] Failed to parse:', error)
    return null
  }
}
