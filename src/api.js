const API_URL = 'https://api.deepseek.com/chat/completions'

/**
 * Shared helper: parse JSON from AI response (handles markdown code blocks).
 * Robust: extracts first {…} or […] block, logs on failure.
 */
function parseJSONResponse(content) {
  if (!content || typeof content !== 'string') {
    console.warn('[parseJSONResponse] Invalid input:', content)
    return null
  }

  let jsonStr = content.trim()

  // 1. Try extracting from markdown code block first
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  // 2. Try parsing as-is
  try {
    return JSON.parse(jsonStr)
  } catch {
    // 3. Try extracting first {…} block
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0])
      } catch {
        // fall through
      }
    }

    // 4. Try extracting first […] block (array format)
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0])
      } catch {
        // fall through
      }
    }

    // 5. All attempts failed — log for debugging
    console.warn('[parseJSONResponse] Failed to parse content:', content)
    return null
  }
}

function buildSystemPrompt(ctx, language = 'en') {
  if (!ctx) {
    if (language === 'ja') {
      return 'あなたは親切な日本語学習アシスタントです。会話はすべて日本語で行います。'
    }
    return '你是一个友好的英语学习助手。对话全部使用英语。仅在解释语法或生词时短暂使用中文。'
  }

  console.log(`[buildSystemPrompt] 收到的 goal: "${ctx.goal}", language: "${language}"`)

  if (language === 'ja') {
    return buildJapaneseSystemPrompt(ctx)
  }

  return buildEnglishSystemPrompt(ctx)
}

function buildEnglishSystemPrompt(ctx) {
  const scenarioLabels = {
    restaurant: 'Restaurant Ordering',
    hotel: 'Hotel Check-in',
    business: 'Business Meeting',
    casual: 'Casual Chat',
    custom: ctx.scenario || 'Custom',
  }

  const sensitivityDescriptions = {
    loose:
      'Loose: Casual speech, ignore minor errors, focus on communication. ' +
      'Use casual expressions (gonna, wanna, kinda). Speak like a friend.',
    normal:
      'Normal: Standard polite English, gently model correct forms naturally in your responses.',
    strict:
      'Strict: More precise language, complete sentences, model correct grammar in your responses.',
  }

  const goalText = ctx.goal
    ? `Conversation Goal (background reference, not for output tagging): ${ctx.goal}`
    : ''

  const parts = [
    'You are a friendly English conversation partner. You are having a role-play conversation with a language learner.',
    '',
    'Your Personality:',
    '- Warm, patient, and encouraging',
    '- Speak naturally like a real person, not a teacher',
    '- Use contractions (I\'ll, don\'t, gonna) and natural expressions',
    '- Be creative and varied — avoid repeating the same phrases',
    '',
    'Conversation Style:',
    '- You are the conversation leader. Ask questions to move the conversation forward.',
    '- Don\'t wait for the user to lead — take initiative.',
    '- Keep the conversation flowing naturally based on the scenario.',
    '',
    `Scenario: ${scenarioLabels[ctx.scenario] || ctx.scenario}`,
    '',
    `Correction Sensitivity (affects how you speak, NOT output format):`,
    sensitivityDescriptions[ctx.sensitivity] || sensitivityDescriptions.normal,
    '',
    `Target knowledge points: ${ctx.targetKnowledge}. Guide the user to learn and use this many knowledge points during the conversation.`,
    `Max rounds: ${ctx.maxRounds}. Keep track of the conversation pace.`,
    '',
    'DIVERSITY RULES:',
    '- Even for the same scenario, provide different menu items, services, or topics each time.',
    '- Avoid overused clichés (steak, salmon, Caesar salad, coffee, etc.). Offer more varied options.',
    '- Examples:',
    '  * Restaurant: ethnic cuisine, vegetarian menu, regional specialties, seasonal limited items, etc.',
    '  * Hotel: special request handling, local sightseeing info, unique services, etc.',
    '  * Business: industry trends, budget adjustments, team strategy discussions, etc.',
    '- Ensure the user gets a fresh experience even when choosing the same scenario repeatedly.',
    '',
    'Language rules:',
    '- The conversation must be conducted entirely in English',
    '- When explaining vocabulary or grammar, use SIMPLE ENGLISH first. Only use Chinese as a fallback for very rare or abstract words.',
    '- Provide English definitions, parts of speech, and example sentences when explaining new words',
    '- Encourage the user to express themselves and create a relaxed learning atmosphere',
    '',
    'IMPORTANT RULES:',
    '- Do NOT use any tags like [correction], [sidebar], [GOAL_ACHIEVED], or [CONVERSATION_ENDED]',
    '- Just respond with plain text — nothing else',
    '- If the user makes a mistake, you may naturally model the correct form (e.g., "Oh, you went to the restaurant? How was it?") — do not explicitly call out errors',
    '- When the conversation reaches the final round or user signals ending (goodbye, etc.), you MUST:',
    '  * NOT ask any questions',
    '  * NOT suggest new topics',
    '  * NOT offer additional services',
    '  * Just give a brief closing statement and farewell',
    '- Be diverse: avoid clichés like steak, salmon, Caesar salad, coffee',
    '',
    goalText,
  ]

  return parts.filter(Boolean).join('\n')
}

function buildJapaneseSystemPrompt(ctx) {
  const scenarioLabels = {
    restaurant: 'レストラン注文',
    hotel: 'ホテルチェックイン',
    business: 'ビジネス会議',
    casual: 'カジュアル会話',
    custom: ctx.scenario || 'カスタム',
  }

  const sensitivityDescriptions = {
    loose:
      'ゆるめ: カジュアルな話し方。軽いミスは気にせず、コミュニケーションを重視。砕けた表現（〜だよね、〜じゃん）を使ってOK。',
    normal:
      '標準: 丁寧な標準語（です・ます調）。自然に正しい形を会話の中でモデル提示する。',
    strict:
      'きびしめ: より正確な表現、完全な文章、正しい文法を意識した返答。',
  }

  const goalText = ctx.goal
    ? `会話の目標（背景参照用、出力タグ付け不要）: ${ctx.goal}`
    : ''

  const parts = [
    'あなたはフレンドリーな日本語会話パートナーです。言語学習者とロールプレイ会話をしています。',
    '',
    'あなたの性格:',
    '- 温かく、忍耐強く、励ますような態度',
    '- 先生のようにではなく、実際の人のように自然に話す',
    '- 縮約形（〜してる、〜とく、〜ちゃう）や自然な表現を使う',
    '- 創造的でバラエティ豊かに — 同じフレーズを繰り返さない',
    '',
    '会話スタイル:',
    '- あなたが会話をリードする。質問をして会話を進めてください。',
    '- ユーザーがリードするのを待たずに、自らイニシアチブを取る。',
    '- シナリオに基づいて自然に会話の流れを作る。',
    '',
    `シナリオ: ${scenarioLabels[ctx.scenario] || ctx.scenario}`,
    '',
    `訂正感度（出力形式ではなく、話し方に影響します）:`,
    sensitivityDescriptions[ctx.sensitivity] || sensitivityDescriptions.normal,
    '',
    `目標知識ポイント数: ${ctx.targetKnowledge}。会話中にこの数の知識ポイントを学習・使用できるように導いてください。`,
    `最大ラウンド数: ${ctx.maxRounds}。会話のペースを管理してください。`,
    '',
    '【多様性ルール】',
    '- 同じシーンでも、毎回異なるメニューや話題を提供すること。',
    '- よく使われる定番（ステーキ、サーモン、コーヒーなど）は避け、より多様な選択肢を提示する。',
    '- 例：',
    '  * レストラン：エスニック料理、ベジタリアンメニュー、地方の郷土料理、季節限定メニューなど',
    '  * ホテル：特別なリクエスト対応、周辺の観光情報、珍しいサービスなど',
    '  * ビジネス：業界トレンド、予算調整、チーム戦略の相談など',
    '- ユーザーが同じシーンを選んでも、毎回新鮮な体験ができるようにする。',
    '',
    '【言語ルール】',
    '- 会話はすべて日本語で行う',
    '- 単語や文法の説明が必要な場合は、簡単な日本語で説明する。難しい場合のみ英語や中国語で補足',
    '- 新しい単語を説明する時は、日本語の定義、品詞、例文を提供する',
    '- リラックスした学習雰囲気を作り、ユーザーが自分から表現することを促す',
    '',
    '【重要ルール】',
    '- [correction]、[sidebar]、[GOAL_ACHIEVED]、[CONVERSATION_ENDED] などのタグを一切使用しないでください',
    '- プレーンテキストのみで返答すること — それ以外は何も付け加えない',
    '- ユーザーが間違えた場合、自然に正しい形を会話の中でモデル提示してください（例：「あ、レストランに行ったんですね。どうでしたか？」）— 明示的に間違いを指摘しない',
    '- 会話が最終ラウンドに達した場合、またはユーザーが終了を合図した場合（さようなら、など）、以下を厳守：',
    '  * 質問をしない',
    '  * 新しい話題を提案しない',
    '  * 追加のサービスを提案しない',
    '  * 簡潔な締めくくりと別れの言葉だけを述べる',
    '- 多様性を保つ：定番表現（ステーキ、サーモン、コーヒーなど）を避ける',
    '',
    goalText,
  ]

  return parts.filter(Boolean).join('\n')
}

export function getApiKey() {
  let key = localStorage.getItem('deepseek_api_key')
  if (!key) {
    key = prompt('请输入你的 DeepSeek API Key：')
    if (key) {
      localStorage.setItem('deepseek_api_key', key)
    }
  }
  return key
}

/**
 * Parse AI reply to extract [CONVERSATION_ENDED], [GOAL_ACHIEVED],
 * and [TASK_COMPLETED: N] content.
 * Returns { mainText, conversationEnded, goalAchieved, completedTasks }
 *
 * NOTE: [correction] and [sidebar] extraction has been removed in Phase 1.
 * Phase 2 will introduce a new Tips/Hints mechanism via Agent 2.
 */
export function parseAIReply(reply) {
  let mainText = reply
  let conversationEnded = false
  let goalAchieved = false
  let completedTasks = []

  // Detect [GOAL_ACHIEVED] tag (machine-read, not shown to user)
  if (/\[GOAL_ACHIEVED\]/.test(mainText)) {
    goalAchieved = true
    mainText = mainText.replace('[GOAL_ACHIEVED]', '')
  }

  // Detect [CONVERSATION_ENDED] tag (machine-read, not shown to user)
  if (/\[CONVERSATION_ENDED\]/.test(mainText)) {
    conversationEnded = true
    mainText = mainText.replace('[CONVERSATION_ENDED]', '')
  }

  // Extract [TASK_COMPLETED: N] tags (machine-read, not shown to user)
  const taskRegex = /\[TASK_COMPLETED:\s*(\d+)\]/g
  let taskMatch
  while ((taskMatch = taskRegex.exec(mainText)) !== null) {
    completedTasks.push(parseInt(taskMatch[1], 10))
  }
  mainText = mainText.replace(/\[TASK_COMPLETED:\s*\d+\]/g, '')

  // Strip any remaining stray tags that might appear (defensive cleanup)
  mainText = mainText
    .replace(/\[\/?correction\]/g, '')
    .replace(/\[\/?sidebar\]/g, '')
    .replace(/<\/?sidebar>/g, '')
    .replace(/<\/?correction>/g, '')
  mainText = mainText.trim()

  return { mainText, conversationEnded, goalAchieved, completedTasks }
}

export async function sendToAI(
  userMessage,
  conversationHistory = [],
  ctx = null,
  isLastRound = false,
  language = 'en'
) {
  const apiKey = getApiKey()
  if (!apiKey) {
    return language === 'ja'
      ? '有効なAPI Keyを入力してからもう一度試してください。'
      : 'Please provide a valid API Key and try again.'
  }

  const systemPrompt = buildSystemPrompt(ctx, language)

  // Build messages array
  // NOTE: conversationHistory already contains the user's latest message
  // (built in ChatArea.handleSend from newMessages = [...messages, userMessage]).
  // Do NOT append { role: 'user', content: userMessage } again to avoid duplication.
  let messages
  if (isLastRound) {
    // For the last round: append a short, forceful closing instruction.
    // The system prompt already contains detailed ending rules; this just reinforces.
    messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      {
        role: 'system',
        content:
          'FINAL MESSAGE. End now. NO questions. NO suggestions. NO offers. ' +
          'Just a brief closing statement and farewell. If you ask a question, you have failed.',
      },
    ]
    console.log('[sendToAI] 收尾轮：已追加结束指令')
  } else {
    messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
    ]

    // For the very first message of a new conversation, inject a diversity hint
    // to avoid cliché recommendations (steak, salmon, Caesar salad, coffee, etc.)
    if (conversationHistory.length === 0) {
      messages.push({
        role: 'system',
        content:
          'DIVERSITY NOTE: Avoid cliché recommendations (steak, salmon, Caesar salad, coffee). ' +
          'Be creative with menu items, services, or topics. Surprise the user with something fresh.',
      })
    }
  }

  // Debug: log messages count and last 3 messages
  console.log(
    `[sendToAI] Messages count: ${messages.length}, isLastRound: ${isLastRound}`
  )
  const last3 = messages.slice(-3)
  last3.forEach((m, i) => {
    console.log(`[sendToAI] 消息 #${messages.length - 3 + i}: role=${m.role}, content="${(m.content || '').slice(0, 80)}..."`)
  })

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
        stream: false,
      }),
    })

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('deepseek_api_key')
        return 'API Key is invalid or expired. Please re-enter.'
      }
      return `Request failed (${response.status}). Please try again later.`
    }

    const data = await response.json()
    return data.choices[0].message.content
  } catch (error) {
    return 'Network connection failed. Please check your network and try again.'
  }
}

/**
 * Generate a conversation goal based on the selected scenario.
 * Calls DeepSeek API to produce goal descriptions in the target language.
 */
export async function generateConversationGoal(scenario, language = 'en') {
  const apiKey = getApiKey()
  if (!apiKey) return ''

  const systemPrompt = language === 'ja'
    ? 'あなたは会話シーンアシスタントです。ユーザーは日本語を練習しています。選択されたシーンに基づいて、具体的な会話目標を生成してください。日本語で返し、複数のサブ目標は改行で区切ってください。最大3つ。\n\n' +
      '例（レストラン注文）：\n' +
      '日本語でメインディッシュを注文する\n' +
      '本日のおすすめを日本語で尋ねる\n' +
      '会計時に領収書を日本語で依頼する\n\n' +
      'そのままテキストだけを返してください。'
    : '用户正在练习英语对话，目标是提升英语口语能力。你是一个对话场景助手。根据用户选择的场景，生成具体的英语对话练习目标。\n\n' +
      '要求：\n' +
      '- 用中文返回，多个子目标用换行符分隔，每个子目标一行\n' +
      '- 最多3条子目标\n' +
      '- 直接返回纯文本，不要编号、不要其他内容\n' +
      '- 每次生成的内容要有随机性和多样性，不要每次都返回类似的子目标\n' +
      '- 可以从不同角度切入：点餐流程、社交礼仪、特殊需求、文化差异、价格沟通、口味偏好等\n\n' +
      '示例（仅供参考，不要照搬）：\n' +
      '场景"餐厅点餐"可返回：\n' +
      '成功用英语点一道主菜\n' +
      '用英语询问服务员今日特色菜\n' +
      '用英语确认账单是否包含服务费\n\n' +
      '场景"酒店入住"可返回：\n' +
      '用英语完成入住登记手续\n' +
      '向酒店前台询问早餐时间和地点\n' +
      '用英语请求客房额外服务\n\n' +
      '场景"机场出行"可返回：\n' +
      '用英语办理登机手续并托运行李\n' +
      '听懂登机口变更广播并确认\n' +
      '用英语向空乘人员索要饮品'

  const seed = Date.now() % 10000

  const userContent = language === 'ja'
    ? `シーン：${scenario}\nランダムシード：${seed}`
    : `场景：${scenario}\n随机种子：${seed}`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]

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
        temperature: 1.2,
        stream: false,
        max_tokens: 150,
      }),
    })

    if (!response.ok) {
      console.warn('[generateConversationGoal] API request failed:', response.status)
      return ''
    }

    const data = await response.json()
    const goal = data.choices[0].message.content.trim()
    return goal
  } catch (error) {
    console.warn('[generateConversationGoal] Failed:', error)
    return ''
  }
}

/**
 * Generate a learning summary of the completed conversation.
 */
export async function generateSummary(conversationHistory, ctx, language = 'en') {
  const apiKey = getApiKey()
  if (!apiKey) return 'Unable to generate summary: Please provide a valid API Key.'

  const systemPrompt = language === 'ja'
    ? 'あなたは日本語学習分析の専門家です。会話履歴に基づいて、構造化された学習サマリーを生成してください。\n' +
      'JSON 形式で返してください。他のテキストは不要です：\n' +
      '{\n' +
      '  completion: { rating: string, detail: string },\n' +
      '  strengths: [{ point: string }],\n' +
      '  weaknesses: [{ point: string, example: string }],\n' +
      '  newKnowledge: [{ word: string, meaning: string }],\n' +
      '  suggestions: [{ suggestion: string }]\n' +
      '}\n' +
      '\n' +
      '各フィールドの説明：\n' +
      '- completion.rating: 簡潔な評価（例：「優秀」「良好」「基本的に完了」）\n' +
      '- completion.detail: 達成状況の詳細説明（1-2文、日本語）\n' +
      '- strengths: 良かった点、各 point は一文で。必ず1つ以上書くこと。ユーザーがうまくできた点を具体的に挙げる。\n' +
      '- weaknesses: 改善が必要な文法ポイント、各 point は問題説明、example は会話中の誤りの例\n' +
      '- newKnowledge: 新しい知識、各 word は日本語の単語、meaning は日本語での説明\n' +
      '- suggestions: 学習アドバイス、各 suggestion は一文で。必ず1つ以上書くこと。次回の学習に向けた具体的なアドバイスを書く。\n' +
      '\n' +
      'すべて日本語で記述してください。各配列は少なくとも1項目含むこと。JSONのみ返してください。\n' +
      'CRITICAL: Return ONLY the JSON object. Do not add any greeting, explanation, or other text. Start with { and end with {}.'
    : '你是英语学习分析专家。根据对话历史，生成结构化的学习总结。\n' +
      '返回 JSON 格式，不要其他文字：\n' +
      '{\n' +
      '  completion: { rating: string, detail: string },\n' +
      '  strengths: [{ point: string }],\n' +
      '  weaknesses: [{ point: string, example: string }],\n' +
      '  newKnowledge: [{ word: string, meaning: string }],\n' +
      '  suggestions: [{ suggestion: string }]\n' +
      '}\n' +
      '\n' +
      '各字段说明：\n' +
      '- completion.rating: 简短评价（如"优秀"/"良好"/"基本完成"）\n' +
      '- completion.detail: 完成情况详细描述（1-2句中文）\n' +
      '- strengths: 表现好的地方，每项 point 一句话。必须写至少1项，具体指出用户做得好的地方。\n' +
      '- weaknesses: 需改进的语法点，每项 point 是问题描述，example 是对话中的错误示例\n' +
      '- newKnowledge: 新知识点，每项 word 是英文，meaning 是中文释义\n' +
      '- suggestions: 学习建议，每项 suggestion 一句话。必须写至少1项，给出下次学习的具体建议。\n' +
      '\n' +
      '所有内容用中文撰写。每个数组至少包含1项。只返回 JSON。\n' +
      'CRITICAL: Return ONLY the JSON object. Do not add any greeting, explanation, or other text. Start with { and end with {}.'

  const userContent = language === 'ja'
    ? '上記の会話に基づいて、日本語学習サマリーを生成してください。'
    : 'Please generate a Chinese learning summary based on the conversation above.'

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    {
      role: 'user',
      content: userContent,
    },
  ]

  console.log(
    `[generateSummary] Messages count: ${messages.length}, language: ${language}, generating summary...`
  )

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
        temperature: 0.3,
        stream: false,
        max_tokens: 2000,
      }),
    })

    if (!response.ok) {
      return 'Summary generation failed. Please try again later.'
    }

    const data = await response.json()
    const rawContent = data.choices[0].message.content

    // 尝试解析 JSON，如果 strengths 或 suggestions 为空则填充默认值
    try {
      const parsed = JSON.parse(rawContent)
      let needsRepair = false

      if (!parsed.strengths || parsed.strengths.length === 0) {
        parsed.strengths = language === 'ja'
          ? [{ point: '会話を最後まで続けることができました' }]
          : [{ point: 'Successfully completed the conversation' }]
        needsRepair = true
      }

      if (!parsed.suggestions || parsed.suggestions.length === 0) {
        parsed.suggestions = language === 'ja'
          ? [{ suggestion: '引き続き練習を重ねましょう' }]
          : [{ suggestion: 'Keep practicing to build on your progress' }]
        needsRepair = true
      }

      if (needsRepair) {
        return JSON.stringify(parsed)
      }
    } catch {
      // 不是合法 JSON，直接返回原始内容
    }

    return rawContent
  } catch (error) {
    return 'Summary generation failed. Please check your network and try again.'
  }
}

/**
 * Check which TODO items have been completed based on the conversation.
 * @param {string} goal - The conversation goal
 * @param {Array} todos - Array of { id, text, completed } objects
 * @param {Array} conversationHistory - Array of { role, content } messages
 * @param {string} language - Language code ('en' or 'ja')
 * @returns {Array<number>} Array of completed TODO IDs (1-based)
 */
export async function checkTaskCompletion(goal, todos, conversationHistory, language = 'en') {
  const apiKey = getApiKey()
  if (!apiKey) return []

  const pendingTodos = todos.filter(t => !t.completed)
  if (pendingTodos.length === 0) return []

  const todoListStr = pendingTodos.map(t => `${t.id + 1}. ${t.text}`).join('\n')

  const systemPrompt = language === 'ja'
    ? `あなたは会話の進行状況を追跡するアシスタントです。\n` +
      `会話の目標: ${goal}\n\n` +
      `以下の TODO リストを確認し、最新の会話に基づいてどの TODO が完了したかを判断してください。\n` +
      `TODO リスト:\n${todoListStr}\n\n` +
      `完了した TODO の番号（1から始まる）のみを JSON 配列として返してください。\n` +
      `例: [1, 3]\n` +
      `完了した TODO がない場合は空の配列 [] を返してください。\n` +
      `JSON のみを返し、他のテキストは含めないでください。`
    : `You are an assistant that tracks conversation progress.\n` +
      `Conversation goal: ${goal}\n\n` +
      `Review the following TODO list and determine which TODOs have been completed based on the latest conversation.\n` +
      `TODO list:\n${todoListStr}\n\n` +
      `Return ONLY a JSON array of completed TODO numbers (1-based).\n` +
      `Example: [1, 3]\n` +
      `Return an empty array [] if none are completed.\n` +
      `Return ONLY the JSON, no other text.`

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-6),
    { role: 'user', content: language === 'ja'
      ? '上記の会話に基づいて、どの TODO が完了しましたか？'
      : 'Based on the conversation above, which TODOs have been completed?'
    }
  ]

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0,
        max_tokens: 200
      })
    })

    if (!response.ok) return []

    const data = await response.json()
    const content = data.choices[0].message.content
    const parsed = parseJSONResponse(content)

    if (Array.isArray(parsed)) {
      return parsed.filter(n => typeof n === 'number' && n >= 1 && n <= todos.length)
    }
    return []
  } catch (error) {
    console.error('[checkTaskCompletion] Error:', error)
    return []
  }
}

/**
 * Extract a single structured knowledge point from a specific trigger event.
 *
 * @param {Object} trigger - The trigger event
 *   - type 'user_asked': { type: 'user_asked', word: '用户查询的单词或短语' }
 *   - type 'correction': { type: 'correction', original: '原始错误', corrected: '纠正后', explanation: 'AI解释' }
 * @param {string} context - Surrounding conversation context
 * @returns {Object|null} Structured knowledge point or null on failure
 */
export async function extractSpecificKnowledge(trigger, context, language = 'en') {
  const apiKey = getApiKey()
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
      'CRITICAL: meaningChinese フィールドは有効な中国語の意味でなければなりません。空文字列は不可。簡潔な中国語でその単語やフレーズの意味を説明してください。\n' +
      'If you cannot provide a Chinese meaning, do not return the knowledge point at all. The meaningChinese field is mandatory.\n' +
      '\n' +
      'word normalization: 単語フィールドを標準形に正規化してください。動詞は辞書形（例：「食べる」）、形容詞は基本形（例：「美味しい」）。\n' +
      '\n' +
      'phonetic rules:\n' +
      '- For type "word" and "keigo": phonetic フィールドは必須。読み仮名（ひらがな）を提供してください。\n' +
      '- For type "phrase": 新しい語彙を含む場合は主要な単語の読みを提供。それ以外は空文字列。\n' +
      '- For type "grammar", "collocation", "joshi", "katsuyou": phonetic は空文字列。\n' +
      '- 例：れすとらん、たべる、いらっしゃいます\n' +
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
      'CRITICAL: meaningChinese 字段必须是有效的中文释义，不能为空字符串。用简洁的中文解释该单词或短语的意思。如果单词有多种含义，给出在上下文中最相关的那个释义。\n' +
      'If you cannot provide a Chinese meaning, do not return the knowledge point at all. The meaningChinese field is mandatory.\n' +
      '\n' +
      'word normalization: Normalize the word field to its standard form: most words should be lowercase, except proper nouns (country names, abbreviations, brand names) which should keep their correct capitalization. Set the "word" field to this normalized form.\n' +
      '\n' +
      'phonetic rules (STRICT):\n' +
      '- For type "word": phonetic field is REQUIRED, not optional. You MUST provide IPA phonetic transcription. If you absolutely cannot determine it, make your best guess based on standard pronunciation rules. Never leave it empty for word types.\n' +
      '- For type "phrase": provide IPA for the key word if it contains a new vocabulary word, otherwise set to empty string.\n' +
      '- For type "grammar" and "collocation": set phonetic to empty string.\n' +
      '- Example formats: /ˈrestərɒnt/, /ɪkˈsaɪtɪŋ/, /tʃek ɪn/\n' +
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

/**
 * Agent 2A: 拼写+语法纠正专家
 * 根据 sensitivity 设置纠正用户消息中的拼写和语法错误
 */
export async function correctUserMessage(userMessage, sensitivity = 'normal', language = 'en') {
  if (!userMessage || userMessage.trim() === '') return null

  const apiKey = getApiKey()
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

  const response = await fetch(API_URL, {
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

/**
 * Agent 2B: 语法分析专家
 * 分析用户消息中的语法错误，输出自然语言描述
 */
export async function analyzeGrammar(userMessage, correctedMessage, conversationHistory, sensitivity = 'normal', language = 'en') {
  if (!userMessage || userMessage.trim() === '') return null

  const apiKey = getApiKey()
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
- エラーがない場合は "エラーは見つかりませんでした" と出力

例:
"スペルミス: 'recommed' → 'recommend'
スペルミス: 'interesting' → 'interested'
文法エラー: 'don't have no' → 'don't have any'（二重否定の修正）"`

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

  const response = await fetch(API_URL, {
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
  console.log('[2B] 输出（含拼写+语法）:', result)
  return result
}

/**
 * Agent 2C: Hints 生成专家（结构化输出）
 * 检测 AI 回复是否包含提问，生成词汇提示
 */
export async function generateHints(assistantReply, language = 'en') {
  if (!assistantReply || assistantReply.trim() === '') return null

  const apiKey = getApiKey()
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

  console.log('[2C] 检测 AI 回复中的提问:', assistantReply?.slice(0, 200))
  console.log('[2C] 是否包含问号:', assistantReply?.includes('?'))

  const response = await fetch(API_URL, {
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
  console.log('[2C] 生成结果:', JSON.stringify(result, null, 2))
  return result
}

/**
 * Agent 2D: 回复整理专家（结构化输出）
 * 从 AI 回复中提取结构化纠正信息
 */
export async function extractCorrectionsFromReply(assistantReply, language = 'en') {
  if (!assistantReply || assistantReply.trim() === '') return null

  const apiKey = getApiKey()
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

重要: 学習アドバイスを含む文全体（または節）を除去してください。ただし、前後の対話内容が自然につながるように注意してください。

=== 修正項目を抽出するルール（既存のロジックを維持）===
- アシスタントが自然にユーザーを修正した場合、その修正を抽出
- アシスタントの表現からユーザーの元のエラーを推測する
- 正確に。明示的または強く暗示された修正のみを抽出
- 抽出するものがない場合は extractedCorrections を null にする
- 各ヒントは extractedCorrections 配列内の個別のオブジェクトとして出力する

例:
入力: "Good morning! How can I help you today? By the way, we usually say 'I'd like to order' instead of 'I want order' when ordering food. So, what would you like to have?"
出力:
{
  "cleanedReply": "Good morning! How can I help you today? So, what would you like to have?",
  "extractedCorrections": [
    {
      "original": "I want order",
      "corrected": "I'd like to order",
      "explanation": "レストランでの注文時には「I'd like to order」の方が丁寧で自然です",
      "type": "expression"
    }
  ]
}

例2（除去するものがない場合）:
入力: "That's great! I'm glad you enjoyed the movie. What did you like most about it?"
出力:
{
  "cleanedReply": "That's great! I'm glad you enjoyed the movie. What did you like most about it?",
  "extractedCorrections": null
}`

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

IMPORTANT: Remove the ENTIRE sentence or clause containing the teaching advice. Ensure the remaining dialogue still flows naturally.

=== RULES FOR EXTRACTING CORRECTIONS (existing logic) ===
1. Grammar errors: Extract grammar issues that the AI explicitly points out or strongly implies through correct forms.
2. Expression suggestions: Extract more natural/idiomatic expressions suggested by the AI.
3. Spelling errors: Extract spelling issues that the AI naturally corrects.
4. Learning tips: Extract hints like "we usually say X instead of Y", "small tip", "remember that", "actually it's", "by the way" followed by corrections.

CRITICAL: Each individual correction MUST be a SEPARATE object in the extractedCorrections array. Do NOT merge multiple corrections into one item.

If nothing to extract, set extractedCorrections to null.

Examples:

Input 1: "Good morning! How can I help you today? By the way, we usually say 'I'd like to order' instead of 'I want order' when ordering food. So, what would you like to have?"
Output 1:
{
  "cleanedReply": "Good morning! How can I help you today? So, what would you like to have?",
  "extractedCorrections": [
    {
      "original": "I want order",
      "corrected": "I'd like to order",
      "explanation": "Use 'I'd like to order' instead of 'I want order' when ordering at a restaurant — it's more polite and natural.",
      "type": "expression"
    }
  ]
}

Input 2 (nothing to remove): "That's great! I'm glad you enjoyed the movie. What did you like most about it?"
Output 2:
{
  "cleanedReply": "That's great! I'm glad you enjoyed the movie. What did you like most about it?",
  "extractedCorrections": null
}

Input 3 (multiple corrections embedded): "Oh, you don't have any allergies? Great! Small tip: use 'interested' not 'interesting' when describing your feelings. And you're interested in the lamb meatballs? Let me tell you about them..."
Output 3:
{
  "cleanedReply": "Oh, you don't have any allergies? Great! And you're interested in the lamb meatballs? Let me tell you about them...",
  "extractedCorrections": [
    {
      "original": "no",
      "corrected": "any",
      "explanation": "Use 'any' instead of 'no' after 'don't have'",
      "type": "spelling"
    },
    {
      "original": "interesting",
      "corrected": "interested",
      "explanation": "'Interested' describes how you feel, 'interesting' describes what causes the feeling",
      "type": "spelling"
    }
  ]
}

Input 4: "I see you're interested in the pasta. Actually, it's 'interested in' not 'interesting in'. The pasta here is really good, I recommend the carbonara!"
Output 4:
{
  "cleanedReply": "I see you're interested in the pasta. The pasta here is really good, I recommend the carbonara!",
  "extractedCorrections": [
    {
      "original": "interesting in",
      "corrected": "interested in",
      "explanation": "Use 'interested in' to express your feeling about something",
      "type": "spelling"
    }
  ]
}`

  console.log('[2D] AI 回复:', assistantReply?.slice(0, 200))

  const response = await fetch(API_URL, {
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
  console.log('[2D] 提取结果:', JSON.stringify(result, null, 2))
  return result
}

/**
 * Agent 2E: 汇总去重 + 知识点提取专家（结构化输出）
 * 合并 2B 和 2D 的输出，去重后输出结构化的 tips 和 knowledgePoints
 */
export async function summarizeTipsAndExtractKnowledge(grammarAnalysis, extractedCorrections, sensitivity = 'normal', language = 'en') {
  const apiKey = getApiKey()
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
- type が "word" または "phrase" の場合: meaning（英語の定義）、meaningChinese（中国語の意味）は任意
- type が "grammar" の場合: meaning（英語での文法ルールの説明、1-2文）と meaningChinese（中国語での文法ルールの説明、1-2文）を必ず含めること
  例: "double negatives" の場合:
    meaning: "Using two negatives in a clause which cancels out to make a positive, often considered incorrect in standard English. Use 'any' instead of 'no' after negatives."
    meaningChinese: "双重否定：在一个句子中使用两个否定词，这在标准英语中通常被视为错误。在否定词后应使用'any'而不是'no'。"
  - type が "grammar" の場合、partOfSpeech は空文字列に設定
}

tips のルール:
- ユニークなヒントをマージ。同じ意味の重複は除去
- より明確で実用的な表現を優先
- 各ヒントは一文で簡潔に

knowledgePoints のルール:
- すべての修正から学習可能な知識ポイントを漏れなく出力すること。省略しないでください。
- 並び順: 最初に word、次に phrase、最後に grammar。同じタイプ内では文中の出現順に並べてください。
- word: 最も短く自然な形式で記述 — これは修正後の正しい形にしてください。
  例: "went"（"goの過去形" ではない）、"want to"（"wantの後の不定詞" ではない）
  例: "a vs an"（"母音前の冠詞用法" ではない）、"past tense"（"過去の出来事に関する文法規則" ではない）
- 文法ルールは最大4単語、可能なら1-2単語を優先
- type: 単語は "word"、フレーズは "phrase"、文法ルールは "grammar"
- context: ユーザーの元の文をそのまま使用
- この出力内で重複しないこと

重要: すべてのスペル修正と文法修正に対応する知識ポイントを必ず出力してください。例えばユーザーが "recommed" と書いて正形が "recommend" なら、{ "word": "recommend", "type": "word", "context": "..." } を出力します。修正された単語をスキップしないでください。

重要: word フィールドはできるだけ短く、ユーザーが覚えやすい形式にしてください。

=== スペル修正に関する厳格なルール ===

入力にスペル修正（例："no → any"、"interesting → interested"、"no → know"、"recommed → recommend"）が含まれている場合、修正された各単語を個別の "word" タイプの知識ポイントとして出力しなければなりません。複数の修正を1つのフレーズ（例："don't have any"）にまとめてはいけません。

入力例:
  ユーザー原文: "I don't have no allergies but I'm interesting in the lamb meatballs. However I want to no if it's very spicy and also can you recommed any vegetarian options?"
  修正: no→any, interesting→interested, no→know, recommed→recommend, 二重否定の文法

出力例（以下すべてを含めること）:
  {
    "tips": [
      { "content": "否定には「don't have any」を使い、「don't have no」は避けましょう。", "type": "grammar" }
    ],
    "knowledgePoints": [
      { "word": "any", "type": "word", "context": "I don't have no allergies" },
      { "word": "interested", "type": "word", "context": "I'm interesting in the lamb meatballs" },
      { "word": "know", "type": "word", "context": "I want to no if it's very spicy" },
      { "word": "recommend", "type": "word", "context": "can you recommed any vegetarian options" },
      { "word": "double negatives", "type": "grammar", "context": "I don't have no allergies" }
    ]
  }

重要: 修正された各単語は、タイプ "word" の独立した知識ポイントでなければなりません。複数の修正を1つの知識ポイントにまとめてはいけません。"don't have any" をフレーズ知識ポイントとして出力しないでください。代わりに "any" を単語として、"double negatives" を文法として出力してください。

=== 文法分析結果の解析方法 ===

「文法分析結果」の入力には以下のような行が含まれる場合があります:
  "スペルミス: 'recommed' → 'recommend'"
  "スペルミス: 'interesting' → 'interested'"
  "文法エラー: 'don't have no' → 'don't have any'（二重否定の修正）"

これらの行を解析して知識ポイントを作成してください:
- 「スペルミス:」の各行 → 1つの "word" タイプの知識ポイント（修正後の単語を使用、例："recommend"）
- 「文法エラー:」の各行 → 1つの "grammar" タイプの知識ポイント（ルール名を使用、例："double negatives"）
- 「スペルミス:」の行をスキップしないでください — すべてのスペル修正が知識ポイントになる必要があります`

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
- For type "grammar": meaning (English explanation of the grammar rule, 1-2 sentences) and meaningChinese (Chinese explanation of the grammar rule, 1-2 sentences) are REQUIRED
  Example for "double negatives":
    meaning: "Using two negatives in a clause which cancels out to make a positive, often considered incorrect in standard English. Use 'any' instead of 'no' after negatives."
    meaningChinese: "双重否定：在一个句子中使用两个否定词，这在标准英语中通常被视为错误。在否定词后应使用'any'而不是'no'。"
  - For type "grammar", set partOfSpeech to empty string
}

=== PARSING THE GRAMMAR ANALYSIS INPUT ===

The "Grammar analysis result" input is natural language text in the following format:
"Spelling: 'recommed' → 'recommend'
Spelling: 'interesting' → 'interested'
Spelling: 'no' → 'know'
Grammar: 'don't have no' → 'don't have any' (double negative)"

You MUST parse this text and extract:
1. All spelling error lines (starting with "Spelling:")
   - Each spelling error generates one tip with type="spelling"
   - Each spelling error generates one knowledgePoint with type="word"
2. All grammar error lines (starting with "Grammar:")
   - Each grammar error generates one tip with type="grammar"
   - Each grammar error generates one knowledgePoint with type="grammar"

Tip content format:
- Spelling error: "The correct spelling is 'corrected', not 'original'."
- Grammar error: Use the explanation from grammarAnalysis, e.g. "Use 'any' instead of 'no' after 'don't have' to avoid double negative."

=== MERGING EXTRACTED CORRECTIONS (2D) ===

The "Extracted corrections" input contains objects from Agent 2D. Each object should:
1. If it contains valid information, convert to a tip and add to the tips array
2. If suitable as a knowledge point, convert to a knowledgePoint and add to the knowledgePoints array
3. Be careful to avoid duplication with content parsed from grammarAnalysis

=== TIPS DEDUPLICATION RULES ===

Merge tips from the following sources:
1. Tips parsed from grammarAnalysis
2. Tips extracted from extractedCorrections (use the explanation field)

Deduplication: Compare two tips' content strings. If they are the same or highly similar in meaning, keep only one — prefer the more detailed one.

=== TIPS SORTING RULES ===

Tips are sorted in the following order:
1. By type: spelling → expression → grammar
2. Within the same type, sort by appearance order in the user's original sentence

KnowledgePoints are sorted in the following order:
1. By type: word → phrase → grammar
2. Within the same type, sort by appearance order in the user's original sentence

=== STRICT RULES FOR SPELLING CORRECTIONS ===

When the input contains spelling corrections (e.g., "no → any", "interesting → interested", "no → know", "recommed → recommend"), you MUST output EACH corrected word as a SEPARATE "word"-type knowledge point. Do NOT group them into a single phrase like "don't have any".

Example input:
  User original: "I don't have no allergies but I'm interesting in the lamb meatballs. However I want to no if it's very spicy and also can you recommed any vegetarian options?"
  Corrections: no→any, interesting→interested, no→know, recommed→recommend, double negative grammar

Example output (MUST include ALL of these):
  {
    "tips": [
      { "content": "Use 'don't have any' instead of 'don't have no' for negation.", "type": "grammar" },
      { "content": "The correct spelling is 'interested', not 'interesting'.", "type": "spelling" },
      { "content": "The correct spelling is 'know', not 'no'.", "type": "spelling" },
      { "content": "The correct spelling is 'recommend', not 'recommed'.", "type": "spelling" }
    ],
    "knowledgePoints": [
      { "word": "any", "type": "word", "context": "I don't have no allergies" },
      { "word": "interested", "type": "word", "context": "I'm interesting in the lamb meatballs" },
      { "word": "know", "type": "word", "context": "I want to no if it's very spicy" },
      { "word": "recommend", "type": "word", "context": "can you recommed any vegetarian options" },
      { "word": "double negatives", "type": "grammar", "context": "I don't have no allergies" }
    ]
  }

IMPORTANT: Each corrected word MUST be its own knowledge point with type "word". Do NOT combine multiple corrections into one knowledge point. Do NOT output "don't have any" as a phrase knowledge point — instead output "any" as a word and "double negatives" as grammar.

Tips rules:
- Merge all unique tips. Remove duplicates (same meaning, different wording).
- Prefer clearer, more actionable phrasing.
- Each tip should be one short sentence.

KnowledgePoints rules:
- Output ALL knowledge points that can be learned from the corrections. Do NOT omit any.
- Sort by type in this order: word first, then phrase, then grammar. Within the same type, sort by appearance order in the sentence.
- word: Use the SHORTEST, most natural form — this should be the CORRECTED form of the word.
  Examples: "went" (not "the past tense of go"), "want to" (not "infinitive after want"),
  "a vs an" (not "article usage before vowels"), "past tense" (not "grammar rule about past events").
- Max 4 words for grammar rules. Prefer 1-2 words when possible.
- type: "word" for single words, "phrase" for multi-word expressions, "grammar" for grammar rules.
- context: Use the user's original sentence as-is.
- Do NOT duplicate knowledge points within this output.

CRITICAL: Every spelling correction and grammar correction from the input MUST produce a corresponding knowledge point. For example, if the user wrote "recommed" and the correct form is "recommend", output { "word": "recommend", "type": "word", "context": "..." }. Do not skip any corrected word.

IMPORTANT: Make the "word" field as short as possible and easy for users to remember.`

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

  const response = await fetch(API_URL, {
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
  console.log('[2E] 从 grammarAnalysis 提取知识点:', parsed?.knowledgePoints?.length || 0, '个')
  console.log('[2E] knowledgePoints:', JSON.stringify(parsed?.knowledgePoints, null, 2))
  return {
    tips: parsed?.tips || [],
    knowledgePoints: parsed?.knowledgePoints || []
  }
}
