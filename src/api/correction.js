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
- normal: 一般的なエラーを修正（時制、主語-動詞の一致、助詞の脱落・誤用、よくあるスペルミス）
- strict: すべてのエラーを修正、流暢さと自然さを改善
- **ユーザーの意図した意味は変えない（特に、疑問文を平叙文に変えない、疑問符「？」を句点「。」に変えない）**
- **冗長な表現は修正する。特に「ください」と「お願いします」の重複は、どちらか一方のみに統合する**
- **【最重要】日本語の助詞（を、が、は、に、で、の、へ 等）の脱落は、たとえ意味が通じても normal 以上で必ず修正する。助詞の脱落は「自然な省略」ではなく文法エラーである。**
- **助詞だけではなく、連体修飾の「の」の脱落（例：「おすすめ料理」→「おすすめの料理」）も normal 以上で必ず修正する**
- **名詞と名詞の間の「の」脱落も助詞脱落の一種として必ず修正対象とする**
- **「ください」「お願いします」を含む依頼表現で目的語の後に助詞「を」がない場合（例：「オレンジジュースお願いします」「水ください」）は、normal 以上で必ず「オレンジジュースをお願いします」「水をください」に修正する**
- 修正が必要ない場合は null を返す

例:
- 「おすすめ料理ありますか？」→ 助詞「の」と「は」が脱落 → normal 以上で「おすすめの料理はありますか？」に修正
- 「ラーメンください」→ 助詞「を」が脱落 → normal 以上で「ラーメンをください」に修正
- 「はい、オレンジジュースお願いします」→ 助詞「を」が脱落 → normal 以上で「はい、オレンジジュースをお願いします」に修正
- 「おすすめの料理、何ですか？」→ 助詞「は」が脱落（読点は助詞ではない） → normal 以上で「おすすめの料理は何ですか？」に修正`

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
- Do NOT change the user's intended meaning (especially: do NOT turn a question into a statement, do NOT replace "?" with ".")
- **Fix redundant expressions. In Japanese, when both "ください" and "お願いします" appear redundantly, consolidate to just one form.**
- **【CRITICAL】Missing particles in Japanese (を, が, は, に, で, の, へ) must be corrected at normal+ sensitivity, even if the meaning is still understandable. A missing particle is a grammar error, not a casual omission.**
- **For request expressions with "ください" or "お願いします", if the object is missing the particle "を" (e.g., "オレンジジュースお願いします"), always add it at normal+ sensitivity → "オレンジジュースをお願いします"**
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
  }, 15000, '2A_correctUserMessage')

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
  }, 15000, '2B_analyzeGrammar')

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
export async function generateHints(assistantReply, language = 'en', isEnding = false, conversationGoal = '') {
  if (!assistantReply || assistantReply.trim() === '') return null
  if (isEnding) {
    debug.log('[2C] 对话已结束，跳过提示生成')
    return null
  }

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
- 複数の質問がある場合は、最も直接的な質問を triggerQuestion として使用する
- **【厳守】AIの返信に既に出現している単語は絶対に提案しないこと。返信内のすべての単語（送り仮名・活用形も含む）をチェックし、1文字でも一致する語彙があれば除外すること。提案すべき語彙がなくなった場合は null を返すこと。（例：AIが「オレンジジュースは、しぼりたてでとてもあまいです」と言った場合、「しぼりたて」「あまい」「オレンジジュース」はすべて既出現なので提案しない）**
- **【厳守】提案する語彙は、ユーザーが会話の文脈だけから自力で見つけられないものに限定すること。AIの返信中に説明や注釈付きで登場した単語は提案しない（ユーザーが既に目にしているため）。提案する価値があるのは、AIの返信に登場しておらず、かつ会話の続きに役立つ語彙のみ。**
- **AIの返信が会話の終了・まとめ（例：「〜ですね」「〜でいいですよ」「学習になりましたね」など）で、次のアクションを促す質問でない場合は null を返す**
- **【重要】会話の目標（conversationGoal）を考慮し、ユーザーが目標を達成できるように誘導する語彙を優先的に提案すること。目標に関連する語彙を提案し、目標から逸脱する汎用的な語彙は避けること。**`

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
- If multiple questions, use the most direct one as triggerQuestion.
- **【STRICT】Never suggest words that already appear anywhere in the assistant's reply. Check every word (including inflected forms). If no safe words remain to suggest, return null. (e.g., if AI says "The orange juice is freshly squeezed and very sweet", do NOT suggest "orange juice", "freshly squeezed", or "sweet" — they all appear in the reply.)**
- **【STRICT】Only suggest words that the user could NOT discover on their own from the conversation context. If a word is explained or glossed in the AI's reply, do NOT suggest it (the user has already seen it). Only suggest vocabulary that is genuinely new and useful for continuing the conversation.**
- **If the assistant's reply is a conversation wrap-up / summary (e.g., "it was great talking", "you did well", "that's correct") without a forward-looking question, return null.**`

  debug.log('[2C] 检测 AI 回复中的提问:', assistantReply?.slice(0, 200))
  debug.log('[2C] 是否包含问号:', assistantReply?.includes('?'))

  const response = await fetchWithTimeout(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Assistant's reply: "${assistantReply}"${conversationGoal ? `\nConversation goal: "${conversationGoal}"` : ''}` }
      ],
      temperature: 0.5,
      stream: false,
      max_tokens: 400
    })
  }, 15000, '2C_generateHints')

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
export async function extractCorrectionsFromReply(assistantReply, language = 'en', isEnding = false) {
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
10. **「〜でいいですよ」「〜で大丈夫ですよ」のようにユーザーの発言を「許容する」評価パターン — これらは教育的な承認であり、純粋な対話ではない**
11. **「〜だけでも通じます」「〜でも意味は通じます」のように「許容範囲」を説明する文**
12. **「たとえば、〜とか〜とか」「例えば〜」「〜などの〜」のように例示や提案を含む文（会話を続けるための自然な例示ではなく、語彙提案としての例示）**
13. **「そうですね」「そうですよ」のような短い肯定のみで構成され、その後に教育的アドバイスが続く場合はアドバイス部分のみ除去**
14. **「〜ですね」「〜でいいですね」のように、ユーザーの発言を修正/評価する形で引用した後に続く「ですね」 — これは教育的な承認・確認であり、純粋な対話ではない**

重要: 学習アドバイスを含む文全体（または節）を除去してください。ただし、前後の対話内容が自然につながるように注意してください。

=== isEnding モード（会話終了時）の追加ルール ===
isEnding=true の場合、上記のルールに加えて以下を適用：
16. **アシスタントの返信に含まれる「次のアクションを促す質問」（ユーザーに返答を求める疑問文）をすべて除去すること**
17. **除去対象の質問パターン：「〜は何がいいですか？」「〜はどうですか？」「〜を食べますか？」「〜を飲みますか？」「〜はいかがですか？」「〜しませんか？」「〜したいですか？」「〜は好きですか？」など、会話を続けるように仕向ける質問**
18. **質問を除去した後、残った文が意味をなさない場合は、その文も除去してcleanReplyを空文字列にしても構わない**

=== 修正項目を抽出するルール ===
- **アシスタントがユーザーの発言の誤りを直接修正した場合のみ抽出すること**
- **アシスタントが自発的に教えた語彙（例：「「しぼりたて」はfreshly squeezedという意味です」）は修正ではない — 抽出しないこと。これはユーザーの誤りではなく、新しい知識の提示である。**
- **original と corrected が同じ単語の場合、それは修正ではないので extractedCorrections を null にすること**
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
11. **"X is fine / X is correct / you can say X" — evaluative approval patterns that teach rather than converse**
12. **"X is also understandable / X works too / people will understand X" — tolerance/acceptability explanations**
13. **"for example, X or Y" / "like X or Y" / "such as X" — example-giving that serves as vocabulary suggestions rather than natural conversation flow**
14. **Short affirmations ("That's right", "Exactly") that are followed by teaching advice — remove the advice part only**
15. **"〜ですね" / "that's X, isn't it" / "so you said X" — patterns where the AI quotes/repeats the corrected form followed by an approving confirmation — this is teaching, not conversation**

IMPORTANT: Remove the ENTIRE sentence or clause containing the teaching advice. Ensure the remaining dialogue still flows naturally.

=== RULES FOR EXTRACTING CORRECTIONS ===
1. **Only extract corrections where the AI is directly correcting a specific mistake the user made.**
2. **Do NOT extract vocabulary items that the AI proactively teaches (e.g., "「しぼりたて」means freshly squeezed" — this is new knowledge, not a correction of user error).**
3. **If original and corrected are the same word, it is NOT a correction — set extractedCorrections to null.**
4. Grammar errors: Extract grammar issues that the AI explicitly points out or strongly implies through correct forms.
5. Expression suggestions: Extract more natural/idiomatic expressions suggested by the AI.
6. Spelling errors: Extract spelling issues that the AI naturally corrects.
7. Learning tips: Extract hints like "we usually say X instead of Y", "small tip", etc., followed by corrections.

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
        { role: 'user', content: `Assistant's reply: "${assistantReply}"${isEnding ? '\nThis is the closing message of the conversation. Remove any forward-looking questions from the cleaned reply.' : ''}` }
      ],
      temperature: 0,
      stream: false,
      max_tokens: 500
    })
  }, 15000, '2D_extractCorrections')

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
      "type": "word|grammar",
      "context": "ユーザーの元の文"
    }
  ]

knowledgePoints の各項目には以下の追加フィールドを含めることができます（type に応じて必須）:
- type が "word" の場合: meaning（日本語の定義）、meaningChinese（中国語の意味）は任意
- type が "grammar" の場合: meaning（日本語での文法ルールの説明、1-2文）と meaningChinese（中国語での文法ルールの説明、1-2文）を必ず含めること
- type が "grammar" の場合、partOfSpeech は空文字列に設定
}

tips のルール:
- ユニークなヒントをマージ。同じ意味の重複は除去
- より明確で実用的な表現を優先
- 各ヒントは一文で簡潔に

knowledgePoints のルール:
- すべての修正から学習可能な知識ポイントを漏れなく出力すること。省略しないでください。
- 並び順: word タイプを先に、次に grammar タイプ。
- word: 最も短く自然な形式で記述 — これは修正後の正しい形にしてください。
- 文法ルールは最大4単語、可能なら1-2単語を優先
- **【重要】"phrase"（フレーズ/慣用句）タイプの知識ポイントは自動抽出しないでください。フレーズはユーザーが辞書検索したときのみ生成すべきものであり、会話終了時の自動抽出対象ではありません。word と grammar のみを出力すること。**

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
  }, 15000, '2E_summarizeTips')

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
