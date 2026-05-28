/**
 * Correction & analysis API — Agents 2A through 2E.
 *
 * 2A: correctUserMessage — spelling & grammar correction
 * 2B: analyzeGrammar — grammar analysis expert
 * 2C: generateHints — hints generation from assistant reply
 * 2D: extractCorrectionsFromReply — reply formatting expert
 * 2E: summarizeTipsAndExtractKnowledge — merge, deduplicate, extract knowledge
 */

import { API_URL, getApiKey, parseJSONResponse, fetchWithTimeout } from './client'
import { debug } from '../utils/debug'

// =========================================================================
// Agent 2A: 拼写+语法纠正专家
// =========================================================================

/**
 * Correct spelling and grammar errors in user's message based on sensitivity.
 */
export async function correctUserMessage(userMessage, sensitivity = 'normal', language = 'en') {
  if (!userMessage || userMessage.trim() === '') return null

  const apiKey = await getApiKey()
  if (!apiKey) return null

  const systemPrompt = language === 'ja'
    ? `あなたは文章修正の専門家です。ユーザーのメッセージを感度設定に従って修正してください。

感度設定: ${sensitivity}
- loose: 意味理解に影響する重大なエラーのみ修正（スペル + 明らかな文法ミス）
- normal: 一般的なスペルミスと文法エラーを修正（標準的な修正）
- strict: すべてのスペルミスと文法エラーを修正し、語順や自然さも改善

出力は JSON のみ:
{
  "correction": {
    "original": "ユーザーの元のメッセージ",
    "corrected": "感度設定に従って修正したバージョン",
    "explanation": "変更内容の簡単な説明",
    "changes": [
      {
        "original": "元のテキスト断片",
        "corrected": "修正後のテキスト断片",
        "type": "spelling|grammar|word_order",
        "explanation": "簡単な理由"
      }
    ]
  } | null
}

ルール:
- loose: 意味を変えるか理解困難にするエラーのみ修正
- normal: 一般的なエラーを修正（時制、主語-動詞の一致、冠詞、前置詞、よくあるスペルミス）
- strict: すべてのエラーを修正、流暢さと自然さを改善
- ユーザーの意図した意味は変えない
- 修正が必要ない場合は null を返す`

    : `You are a language correction expert. Correct the user's message according to the sensitivity setting.

Sensitivity setting: ${sensitivity}
- loose: fix only major errors that seriously affect comprehension (spelling + obvious grammar)
- normal: fix common spelling and grammar errors (standard corrections)
- strict: fix all spelling and grammar errors, improve word order and naturalness

Output JSON only:
{
  "correction": {
    "original": "full user message",
    "corrected": "corrected version following sensitivity rules",
    "explanation": "brief explanation of what was changed",
    "changes": [
      {
        "original": "original text fragment",
        "corrected": "corrected text fragment",
        "type": "spelling|grammar|word_order",
        "explanation": "brief reason"
      }
    ]
  } | null
}

Rules:
- For loose: only fix errors that change meaning or make message hard to understand
- For normal: fix common errors (tense, subject-verb agreement, articles, prepositions, common misspellings)
- For strict: fix all errors, improve fluency and naturalness
- Do NOT change the user's intended meaning
- If no corrections needed (according to sensitivity), return null`

  const response = await fetchWithTimeout(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Correct this message: "${userMessage}"` }
      ],
      temperature: 0,
      stream: false,
      max_tokens: 500
    })
  })

  if (!response.ok) return null
  const data = await response.json()
  return parseJSONResponse(data.choices[0].message.content)
}

// =========================================================================
// Agent 2B: 语法分析专家
// =========================================================================

/**
 * Analyze grammar and spelling errors in user message.
 */
export async function analyzeGrammar(userMessage, correctedMessage, conversationHistory, sensitivity = 'normal', language = 'en') {
  if (!userMessage || userMessage.trim() === '') return null

  const apiKey = await getApiKey()
  if (!apiKey) return null

  const historyText = conversationHistory.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')

  const systemPrompt = language === 'ja'
    ? `あなたは文法とスペルの分析専門家です。ユーザーのメッセージのスペルミスと文法エラーを分析してください。

重要: あなたは2つのバージョンを受け取ります:
1. ユーザーの元のメッセージ（ユーザーが実際に書いたもの）
2. 修正版（Agent 2A による - スペルと基本文法が修正済み）

あなたの仕事:
1. 元のメッセージと修正版を比較して、すべてのスペルミスを特定する（感度設定に関係なく、すべてのスペルミスを指摘すること）
2. 修正版に残っている文法エラーを特定する（感度設定に従う）

修正版が正しいと仮定しないでください。独立して分析してください。

入力:
- ユーザーの元のメッセージ: ${userMessage}
- 修正版: ${correctedMessage}
- 最近の会話履歴:
${historyText}
- 感度設定（文法エラーのみに適用）: ${sensitivity}

感度設定による指摘レベル（文法エラーのみ）:
- loose: 意味に影響する重大な文法エラーのみ
- normal: 一般的な文法エラー
- strict: すべての文法問題

出力形式: プレーンテキスト、自然言語

ガイドライン:
- 各スペルミスをリストアップ：間違った単語 → 正しいスペルを提示（感度設定に関係なくすべて）
- 各文法エラーをリストアップ：説明と修正方法
- 簡潔に。日本語で出力
- エラーがない場合は "エラーは見つかりませんでした" と出力`

    : `You are a grammar and spelling analysis expert. Analyze the user's message for spelling errors and grammar errors.

IMPORTANT: You receive TWO versions:
1. Original user message (what the user actually wrote)
2. Corrected version (from Agent 2A - spelling and basic grammar fixed)

Your job is to:
1. Compare the original with the corrected version to identify ALL spelling errors (regardless of sensitivity — always point out every spelling mistake)
2. Identify ANY grammar errors that remain in the corrected version (follow sensitivity setting)

DO NOT assume the corrected version is correct. Analyze it independently.

Input:
- Original user message: ${userMessage}
- Corrected version: ${correctedMessage}
- Recent conversation history:
${historyText}
- Sensitivity setting (applies ONLY to grammar errors): ${sensitivity}

Sensitivity affects what grammar errors you should point out:
- loose: only serious grammar errors that affect meaning
- normal: common grammar errors
- strict: all grammar issues

Output format: plain text, natural language.

Guidelines:
- List each spelling error: show wrong word → correct spelling (regardless of sensitivity)
- List each grammar error with explanation and fix
- Be concise. Use English
- If no errors at all, say "No errors found."

Example output:
"Spelling: 'recommed' → 'recommend'
Spelling: 'interesting' → 'interested'
Grammar: 'don't have no' → 'don't have any' (double negative)"`

  const userPrompt = language === 'ja'
    ? `分析対象:
元のユーザーメッセージ: "${userMessage}"
修正版: "${correctedMessage}"
最近の会話履歴:
${historyText}

スペルミスと文法エラーを分析し、プレーンテキストで返してください。`
    : `Analysis target:
Original user message: "${userMessage}"
Corrected version: "${correctedMessage}"
Recent conversation history:
${historyText}

Please analyze spelling errors and grammar errors, and return plain text.`

  const response = await fetchWithTimeout(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0,
      stream: false,
      max_tokens: 500
    })
  })

  if (!response.ok) return null
  const data = await response.json()
  const result = data.choices[0].message.content
  debug.log('[2B] 输出（含拼写+语法）:', result)
  return result
}

// =========================================================================
// Agent 2C: Hints 生成专家
// =========================================================================

/**
 * Generate vocabulary hints based on assistant's reply.
 */
export async function generateHints(assistantReply, language = 'en') {
  if (!assistantReply || assistantReply.trim() === '') return null

  const apiKey = await getApiKey()
  if (!apiKey) return null

  const systemPrompt = language === 'ja'
    ? `あなたはヒント生成の専門家です。アシスタントの返信に質問が含まれているか確認してください。

出力は JSON のみ:
{
  "hints": {
    "triggerQuestion": "アシスタントの質問",
    "suggestions": [
      {
        "word": "日本語の単語",
        "translation": "中国語の翻訳"
      }
    ]
  } | null
}

ルール:
- アシスタントの返信に質問が含まれている場合、2-5個の語彙提案を提供
- word は日本語、translation は中国語
- 多様で役立つ提案を。温度は 0.5 に設定
- 質問がない場合は null を返す
- 文中に埋め込まれた質問も検出すること（例：「can I...」「let me know if...」「want me to...」）
- 「?」で終わるフレーズや、「can I」「shall I」「do you」「would you」「want me to」などの質問パターンを含むものは質問とみなす
- 複数の質問がある場合は、最も直接的な質問を triggerQuestion として使用する`

    : `You are a hint generator. Check if the assistant's reply contains a question.

Output JSON only:
{
  "hints": {
    "triggerQuestion": "the assistant's question",
    "suggestions": [
      {
        "word": "vocabulary word (target language)",
        "translation": "Chinese translation"
      }
    ]
  } | null
}

Rules:
- If assistant's reply contains a question, provide 2-5 vocabulary suggestions.
- word in target language (English/Japanese), translation in Chinese.
- Be varied and helpful. Temperature is set to 0.5 for creativity.
- If no question, return null.
- Detect questions even when they are embedded mid-sentence (e.g., "can I...", "let me know if...", "want me to...").
- A phrase ending with '?' or containing question patterns like 'can I', 'shall I', 'do you', 'would you', 'want me to' counts as a question.
- If multiple questions, use the most direct one as triggerQuestion.`

  debug.log('[2C] 检测 AI 回复中的提问:', assistantReply?.slice(0, 200))
  debug.log('[2C] 是否包含问号:', assistantReply?.includes('?'))

  const response = await fetchWithTimeout(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Assistant's reply: "${assistantReply}"` }
      ],
      temperature: 0.5,
      stream: false,
      max_tokens: 400
    })
  })

  if (!response.ok) return null
  const data = await response.json()
  const result = parseJSONResponse(data.choices[0].message.content)
  debug.log('[2C] 生成结果:', JSON.stringify(result, null, 2))
  return result
}

// =========================================================================
// Agent 2D: 回复整理专家
// =========================================================================

/**
 * Extract structured corrections from assistant's reply,
 * returning cleaned dialogue and extracted corrections.
 */
export async function extractCorrectionsFromReply(assistantReply, language = 'en') {
  if (!assistantReply || assistantReply.trim() === '') return null

  const apiKey = await getApiKey()
  if (!apiKey) return null

  const systemPrompt = language === 'ja'
    ? `あなたは返信整形の専門家です。アシスタントの返信から、学習アドバイス（提案や修正）を除去し、純粋な対話内容だけを残してください。同時に、除去したアドバイスから修正項目を抽出してください。

出力は JSON のみ:
{
  "cleanedReply": "学習アドバイスを除去した後の、純粋な対話テキスト",
  "extractedCorrections": [
    {
      "original": "ユーザーが書いたと思われる元の表現",
      "corrected": "アシスタントが提案した修正",
      "explanation": "簡単な説明",
      "type": "spelling|grammar|expression"
    }
  ] | null
}

=== 学習アドバイスを除去するルール ===
以下のパターンに一致する文や節を除去してください：

1. 「ちなみに、X と言いましたが、Y と言うのが自然です」パターン
2. 「X ではなく Y と言いましょう」パターン
3. 「ポイント：X は Y が正しいです」パターン
4. 「通常は X と言います」パターン
5. 「覚えておいてください：...」のような教育的なアドバイス
6. 「小さなヒント：...」「ヒント：...」で始まる文
7. ユーザーの間違いを直接指摘し、正しい形を提案する文
8. 会話の流れを中断する教育的な補足説明
9. 「（動作説明）」のような舞台指示・内心描写 — 括弧内が動作や状況を表す文は完全に除去

重要: 学習アドバイスを含む文全体（または節）を除去してください。ただし、前後の対話内容が自然につながるように注意してください。

=== 修正項目を抽出するルール ===
- アシスタントが自然にユーザーを修正した場合、その修正を抽出
- アシスタントの表現からユーザーの元のエラーを推測する
- 正確に。明示的または強く暗示された修正のみを抽出
- 抽出するものがない場合は extractedCorrections を null にする
- 各ヒントは extractedCorrections 配列内の個別のオブジェクトとして出力する`

    : `You are a reply formatting expert. Your task is to remove teaching suggestions/corrections from the assistant's reply, leaving only pure conversation dialogue. Also extract the removed suggestions into correction items.

Output JSON only:
{
  "cleanedReply": "the pure dialogue text after removing all teaching suggestions",
  "extractedCorrections": [
    {
      "original": "the user's incorrect expression or the issue pointed out by AI",
      "corrected": "the correct expression suggested by AI (empty string if not explicitly given)",
      "explanation": "brief explanation of why this change is needed",
      "type": "spelling|grammar|expression"
    }
  ] | null
}

=== RULES FOR REMOVING TEACHING SUGGESTIONS ===

Identify and REMOVE entire sentences or clauses that match these patterns:

1. "By the way, you said X — we'd say Y"
2. "I noticed you said X, but we usually say Y"
3. "Small tip: X should be Y" / "Quick tip:" / "Pro tip:" / "Just a tip:"
4. "we usually say X instead of Y"
5. "actually, it's X, not Y"
6. "remember to use X" / "don't forget to use X"
7. "a better way to say that is X"
8. Any sentence that directly corrects the user's mistake and suggests the correct form
9. Any teaching interruption that breaks the natural flow of conversation
10. Stage directions / inner thoughts in parentheses — e.g. "(places the water)" or "（动作描述）" — remove these entirely

IMPORTANT: Remove the ENTIRE sentence or clause containing the teaching advice. Ensure the remaining dialogue still flows naturally.

=== RULES FOR EXTRACTING CORRECTIONS ===
1. Grammar errors: Extract grammar issues that the AI explicitly points out or strongly implies through correct forms.
2. Expression suggestions: Extract more natural/idiomatic expressions suggested by the AI.
3. Spelling errors: Extract spelling issues that the AI naturally corrects.
4. Learning tips: Extract hints like "we usually say X instead of Y", "small tip", etc., followed by corrections.

CRITICAL: Each individual correction MUST be a SEPARATE object in the extractedCorrections array. Do NOT merge multiple corrections into one item.

If nothing to extract, set extractedCorrections to null.`

  debug.log('[2D] AI 回复:', assistantReply?.slice(0, 200))

  const response = await fetchWithTimeout(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Assistant's reply: "${assistantReply}"` }
      ],
      temperature: 0,
      stream: false,
      max_tokens: 500
    })
  })

  if (!response.ok) return null
  const data = await response.json()
  const result = parseJSONResponse(data.choices[0].message.content)
  debug.log('[2D] 提取结果:', JSON.stringify(result, null, 2))
  return result
}

// =========================================================================
// Agent 2E: 汇总去重 + 知识点提取专家
// =========================================================================

/**
 * Merge corrections from multiple sources, deduplicate, and extract knowledge points.
 */
export async function summarizeTipsAndExtractKnowledge(grammarAnalysis, extractedCorrections, sensitivity = 'normal', language = 'en') {
  const apiKey = await getApiKey()
  if (!apiKey) return { tips: [], knowledgePoints: [] }

  const systemPrompt = language === 'ja'
    ? `あなたは要約と知識抽出の専門家です。複数のソースから修正やヒントをマージして重複を除去し、学習用の知識ポイントを抽出してください。

感度設定: ${sensitivity}
- loose: マイナーなヒントはスキップ
- normal: 標準
- strict: すべてを含める

出力は JSON のみ:
{
  "tips": [
    {
      "content": "日本語の実用的なヒント",
      "type": "grammar|expression|spelling"
    }
  ],
  "knowledgePoints": [
    {
      "word": "最も短く自然な単語またはルール名",
      "type": "word|phrase|grammar",
      "context": "ユーザーの元の文"
    }
  ]

knowledgePoints の各項目には以下の追加フィールドを含めることができます（type に応じて必須）:
- type が "word" または "phrase" の場合: meaning（日本語の定義）、meaningChinese（中国語の意味）は任意
- type が "grammar" の場合: meaning（日本語での文法ルールの説明、1-2文）と meaningChinese（中国語での文法ルールの説明、1-2文）を必ず含めること
- type が "grammar" の場合、partOfSpeech は空文字列に設定
}

tips のルール:
- ユニークなヒントをマージ。同じ意味の重複は除去
- より明確で実用的な表現を優先
- 各ヒントは一文で簡潔に

knowledgePoints のルール:
- すべての修正から学習可能な知識ポイントを漏れなく出力すること。省略しないでください。
- 並び順: 最初に word、次に phrase、最後に grammar。
- word: 最も短く自然な形式で記述 — これは修正後の正しい形にしてください。
- 文法ルールは最大4単語、可能なら1-2単語を優先

重要: すべてのスペル修正と文法修正に対応する知識ポイントを必ず出力してください。
重要: word フィールドはできるだけ短く、ユーザーが覚えやすい形式にしてください。

=== スペル修正に関する厳格なルール ===
入力にスペル修正が含まれている場合、修正された各単語を個別の "word" タイプの知識ポイントとして出力しなければなりません。複数の修正を1つのフレーズにまとめてはいけません。

=== 文法分析結果の解析方法 ===
「文法分析結果」の入力には以下のような行が含まれる場合があります:
  "スペルミス: 'recommed' → 'recommend'"
  "文法エラー: 'don't have no' → 'don't have any'（二重否定の修正）"

これらの行を解析して知識ポイントを作成してください:
- 「スペルミス:」の各行 → 1つの "word" タイプの知識ポイント
- 「文法エラー:」の各行 → 1つの "grammar" タイプの知識ポイント`

    : `You are a summarization and knowledge extraction expert. Merge and deduplicate corrections and tips from multiple sources, and extract knowledge points for learning.

Sensitivity setting: ${sensitivity}
- loose: skip very minor tips
- normal: standard
- strict: include everything

Output JSON only:
{
  "tips": [
    {
      "content": "actionable tip in English",
      "type": "grammar|expression|spelling"
    }
  ],
  "knowledgePoints": [
    {
      "word": "shortest, most natural form of the word or rule",
      "type": "word|phrase|grammar",
      "context": "user's original sentence"
    }
  ]

Each knowledgePoint object can include additional fields depending on type:
- For type "word" or "phrase": meaning (English definition) and meaningChinese (Chinese translation) are optional
- For type "grammar": meaning (English explanation) and meaningChinese (Chinese explanation) are REQUIRED
- For type "grammar", set partOfSpeech to empty string
}

=== PARSING THE GRAMMAR ANALYSIS INPUT ===
Parse lines like:
"Spelling: 'recommed' → 'recommend'"
"Grammar: 'don't have no' → 'don't have any' (double negative)"

- Each "Spelling:" line → one "word" type knowledgePoint
- Each "Grammar:" line → one "grammar" type knowledgePoint

=== MERGING EXTRACTED CORRECTIONS (2D) ===
Each object from Agent 2D should be converted to a tip/knowledgePoint as appropriate. Avoid duplication with grammarAnalysis.

=== STRICT RULES FOR SPELLING CORRECTIONS ===
Each corrected word MUST be its own knowledge point with type "word". Do NOT combine multiple corrections into one knowledge point.

Tips rules:
- Merge all unique tips. Remove duplicates (same meaning, different wording).
- Prefer clearer, more actionable phrasing.
- Each tip should be one short sentence.

KnowledgePoints rules:
- Output ALL knowledge points that can be learned from the corrections. Do NOT omit any.
- Sort by type in this order: word first, then phrase, then grammar.
- word: Use the SHORTEST, most natural form.
- Max 4 words for grammar rules. Prefer 1-2 words when possible.`

  const extractedCorrectionsText = extractedCorrections
    ? JSON.stringify(extractedCorrections, null, 2)
    : 'None'

  const userPrompt = language === 'ja'
    ? `以下の情報を要約し、重複を除去して JSON で返してください。

文法分析結果:
${grammarAnalysis || 'なし'}

抽出された修正:
${extractedCorrectionsText}

感度設定: ${sensitivity}`
    : `Please summarize the following information, remove duplicates, and return JSON.

Grammar analysis result:
${grammarAnalysis || 'None'}

Extracted corrections:
${extractedCorrectionsText}

Sensitivity setting: ${sensitivity}`

  const response = await fetchWithTimeout(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0,
      stream: false,
      max_tokens: 800
    })
  })

  if (!response.ok) return { tips: [], knowledgePoints: [] }
  const data = await response.json()
  const parsed = parseJSONResponse(data.choices[0].message.content)
  debug.log('[2E] 从 grammarAnalysis 提取知识点:', parsed?.knowledgePoints?.length || 0, '个')
  debug.log('[2E] knowledgePoints:', JSON.stringify(parsed?.knowledgePoints, null, 2))
  return {
    tips: parsed?.tips || [],
    knowledgePoints: parsed?.knowledgePoints || []
  }
}
