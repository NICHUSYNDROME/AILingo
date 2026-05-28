/**
 * Chat API module — conversation flow, goal generation, summary, task tracking.
 */

import { removeItem } from '../utils/storage'
import { API_URL, getApiKey } from './client'
import { parseJSONResponse } from './client'
import { buildSystemPrompt } from './prompts'
import { debug } from '../utils/debug'

/**
 * Parse AI reply to extract [CONVERSATION_ENDED], [GOAL_ACHIEVED],
 * and [TASK_COMPLETED: N] content.
 * Returns { mainText, conversationEnded, goalAchieved, completedTasks }
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
  // Strip stage directions: （non-kana content）but preserve furigana like 漢字（かんじ）
  mainText = mainText.replace(/（(?![\u3040-\u309f\u30a0-\u30ff]+）)[^）]+）/g, '')
  // Clean up blank lines left by removals
  mainText = mainText.replace(/\n{3,}/g, '\n\n')
  mainText = mainText.trim()

  return { mainText, conversationEnded, goalAchieved, completedTasks }
}

/**
 * Send a message to the AI conversation partner.
 */
export async function sendToAI(
  userMessage,
  conversationHistory = [],
  ctx = null,
  isLastRound = false,
  language = 'en'
) {
  const apiKey = await getApiKey()
  if (!apiKey) {
    return language === 'ja'
      ? '有効なAPI Keyを入力してからもう一度試してください。'
      : 'Please provide a valid API Key and try again.'
  }

  const systemPrompt = buildSystemPrompt(ctx, language, ctx?.proficiencyScore ?? null)

  // Build messages array
  let messages
  if (isLastRound) {
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
    debug.log('[sendToAI] 收尾轮：已追加结束指令')
  } else {
    messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
    ]
  }



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
        await removeItem('deepseek_api_key')
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
 */
export async function generateConversationGoal(scenario, language = 'en', proficiencyScore = null, context = {}) {
  const apiKey = await getApiKey()
  if (!apiKey) return ''

  const scoreStr = proficiencyScore !== null ? proficiencyScore.toFixed(1) : 'N/A'

  // Build proficiency-aware guidance
  let levelGuidance = ''
  if (proficiencyScore !== null) {
    if (language === 'ja') {
      levelGuidance = `ユーザーの日本語レベル: 約${scoreStr}/10\n`
      if (proficiencyScore < 4) {
        levelGuidance += '- 非常に簡単な目標のみ。例：「はい/いいえ」で答えられる簡単な質問に返答する。「〜です」だけで答えられる質問に答える。\n'
        levelGuidance += '- 1つだけ目標を生成してください。\n'
      } else if (proficiencyScore < 6) {
        levelGuidance += '- 日常的な場面での基本的な会話目標。短文で表現できること。\n'
        levelGuidance += '- 最大2つの目標。\n'
      } else {
        levelGuidance += '- より複雑な会話目標。意見表明や理由説明を含む。\n'
        levelGuidance += '- 最大3つの目標。\n'
      }
    } else {
      levelGuidance = `Learner's English level: ~${scoreStr}/10\n`
      if (proficiencyScore < 4) {
        levelGuidance += '- VERY simple goals only. E.g., respond to simple yes/no questions, answer with single words or very short phrases.\n'
        levelGuidance += '- Generate only 1 goal.\n'
      } else if (proficiencyScore < 6) {
        levelGuidance += '- Basic daily conversation goals. Short sentences, familiar topics.\n'
        levelGuidance += '- Generate at most 2 goals.\n'
      } else {
        levelGuidance += '- More complex goals. Expressing opinions, giving reasons, handling unexpected turns.\n'
        levelGuidance += '- Generate at most 3 goals.\n'
      }
    }
  }

  const systemPrompt = language === 'ja'
    ? 'あなたは会話シーンアシスタントです。ユーザーは日本語を練習しています。選択されたシーンに基づいて、具体的な会話目標を生成してください。中文で返し、複数のサブ目標は改行で区切ってください。\n\n' +
      levelGuidance + '\n' +
      '例（レストラン注文）：\n' +
      '用日语点一道主菜\n' +
      '用日语询问今日特色菜\n' +
      '用日语请求开发票\n\n' +
      'そのままテキストだけを返してください。'
    : '用户正在练习英语对话，目标是提升英语口语能力。你是一个对话场景助手。根据用户选择的场景，生成具体的英语对话练习目标。\n\n' +
      levelGuidance + '\n' +
      '要求：\n' +
      '- 用中文返回，多个子目标用换行符分隔，每个子目标一行\n' +
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

  const contextStr = context.description
    ? (language === 'ja'
      ? `\nシーン説明: ${context.description}`
      : `\nScene description: ${context.description}`)
    : ''
  const notesStr = context.sceneNotes
    ? (language === 'ja'
      ? `\nシーンノート（参考）: ${context.sceneNotes}`
      : `\nScene notes (reference): ${context.sceneNotes}`)
    : ''

  const userContent = language === 'ja'
    ? `シーン：${scenario}${contextStr}${notesStr}\nランダムシード：${seed}`
    : `场景：${scenario}${contextStr}${notesStr}\n随机种子：${seed}`

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
        max_tokens: 250,
      }),
    })

    if (!response.ok) {
      debug.warn('[generateConversationGoal] API request failed:', response.status)
      return ''
    }

    const data = await response.json()
    const goal = data.choices[0].message.content.trim()
    return goal
  } catch (error) {
    debug.warn('[generateConversationGoal] Failed:', error)
    return ''
  }
}

/**
 * Generate a learning summary of the completed conversation.
 */
export async function generateSummary(conversationHistory, ctx, language = 'en') {
  const apiKey = await getApiKey()
  if (!apiKey) return 'Unable to generate summary: Please provide a valid API Key.'

  const isAssessment = ctx?.isAssessment === true
  const prevScore = ctx?.proficiencyScore

  // Build score context line — pass actual previous score so AI can compute meaningful scoreChange
  // P1-2: 日语版总结改用中文输出，便于学习者阅读
  const jaPrevScoreLine = (prevScore !== null && prevScore !== undefined && !isAssessment)
    ? `上次得分（${prevScore.toFixed(2)}）作为基准来衡量变化。\n`
    : '以上次得分（如有）作为变化参考。\n'

  const enPrevScoreLine = (prevScore !== null && prevScore !== undefined && !isAssessment)
    ? `The learner's previous proficiency score was ${prevScore.toFixed(2)}. Use it as a baseline to compute scoreChange.\n`
    : 'Use the previous score (if available) as a reference for the change.\n'

  const systemPrompt = language === 'ja'
    ? '你是一名日语学习分析专家。根据学习者的发言记录，生成结构化的学习总结。\n' +
      '返回 JSON 格式，不要其他文字：\n' +
      '{\n' +
      '  completion: { rating: string, detail: string },\n' +
      '  strengths: [{ point: string }],\n' +
      '  weaknesses: [{ point: string, example: string }],\n' +
      '  newKnowledge: [{ word: string, meaning: string }],\n' +
      '  suggestions: [{ suggestion: string }],\n' +
      '  proficiencyAssessment: {\n' +
      '    currentScore: number,\n' +
      '    scoreChange: number,\n' +
      '    direction: "up"|"down"|"same",\n' +
      '    summary: string\n' +
      '  }\n' +
      '}\n' +
      '\n' +
      '各字段说明：\n' +
      '- completion.rating: 简短评价（如"优秀"/"良好"/"基本完成"）\n' +
      '- completion.detail: 完成情况详细描述（1-2句中文）\n' +
      '- strengths: 表现好的地方，每项 point 一句话。必须写至少1项。\n' +
      '- weaknesses: 需改进的语法点，每项 point 是问题描述，example 是对话中的错误示例\n' +
      '- newKnowledge: 新知识点，每项 word 保留日语原文，meaning 用中文解释\n' +
      '- suggestions: 学习建议，每项 suggestion 一句话。必须写至少1项。\n' +
      '\n' +
      '【习熟度评估说明】\n' +
      'proficiencyAssessment 评估学习者的当前熟练度（1-10 小数）。\n' +
      '- currentScore: 基于本次对话的当前评估分数（如 4.25）\n' +
      '- scoreChange: 与上次相比的变化量（正=进步、负=退步、0=持平）\n' +
      '- direction: "up"（进步）、"down"（退步）、或 "same"（持平）\n' +
      '- summary: 简短的中文说明（一句话，含对比表述，如"比上次词汇量有提升"）\n' +
      '\n' +
      '评分参考：5=生存会话、6=基本流利、7=独立运用\n' +
      '小幅变化（±0.05～0.30）请适当反映。\n' +
      jaPrevScoreLine +
      (isAssessment
        ? '\n' +
          '【诊断特别指示】\n' +
          '这是首次水平诊断。请注意以下事项：\n' +
          '- scoreChange 设为 0（首次评估，无历史基线）\n' +
          '- direction 设为 "same"\n' +
          '- 在 summary 字段中附上 4 维度评分明细：\n' +
          '  「词汇: X.X / 语法: X.X / 流利度: X.X / 理解力: X.X」\n' +
          '- 根据对话表现判断合适水平：\n' +
          '- 1-4级：无法构建基本句子，仅单词水平\n' +
          '- 5-6级：能处理日常对话，但复杂话题有困难\n' +
          '- 7-8级：能自然应对广泛话题\n' +
          '- 9-10级：接近母语或专业水平\n'
        : '') +
      '\n' +
      '所有内容用中文撰写（newKnowledge.word 保留日语原文，meaning 用中文解释）。每个数组至少包含 1 项。只返回 JSON。\n' +
      'CRITICAL: Return ONLY the JSON object. Do not add any greeting, explanation, or other text. Start with { and end with {}.'
    : (isAssessment
      ? 'You are a language proficiency assessment specialist. This conversation was a level diagnostic.\n【重要】以下只包含学习者的发言，请只分析学习者的语言水平，不要评估 AI 助手。\nGenerate a diagnostic report.\n'
      : '你是英语学习分析专家。根据学习者的发言记录（不含 AI 回复），生成结构化的学习总结。\n【重要】只分析学习者的语言水平，不要评估 AI 助手的内容。\n') +
      '返回 JSON 格式，不要其他文字：\n' +
      '{\n' +
      '  completion: { rating: string, detail: string },\n' +
      '  strengths: [{ point: string }],\n' +
      '  weaknesses: [{ point: string, example: string }],\n' +
      '  newKnowledge: [{ word: string, meaning: string }],\n' +
      '  suggestions: [{ suggestion: string }],\n' +
      '  proficiencyAssessment: {\n' +
      '    currentScore: number,\n' +
      '    scoreChange: number,\n' +
      '    direction: "up"|"down"|"same",\n' +
      '    summary: string\n' +
      '  }\n' +
      '}\n' +
      '\n' +
      '各字段说明：\n' +
      '- completion.rating: 简短评价（如"优秀"/"良好"/"基本完成"）\n' +
      '- completion.detail: 完成情况详细描述（1-2句中文）\n' +
      '- strengths: 表现好的地方，每项 point 一句话。必须写至少1项。\n' +
      '- weaknesses: 需改进的语法点，每项 point 是问题描述，example 是对话中的错误示例\n' +
      '- newKnowledge: 新知识点，每项 word 是英文，meaning 是中文释义\n' +
      '- suggestions: 学习建议，每项 suggestion 一句话。必须写至少1项。\n' +
      '\n' +
      '【Proficiency Assessment Instructions】\n' +
      'proficiencyAssessment evaluates the learner\'s current proficiency as a 1-10 decimal.\n' +
      '- currentScore: Current assessed score based on this conversation (e.g., 4.25)\n' +
      '- scoreChange: Estimated change from the last conversation\n' +
      '  (positive=improvement, negative=regression, 0=maintained)\n' +
      '- direction: "up" (improved), "down" (regressed), or "same" (maintained)\n' +
      '- summary: Brief explanation in Chinese (one sentence with comparative phrasing, e.g., "比上次有明显进步，词汇运用更加自如")\n' +
      '\n' +
      'Scoring reference: Level 5=survival, Level 6=basic fluency, Level 7=independent\n' +
      'Reflect small changes appropriately (±0.05 to ±0.30).\n' +
      enPrevScoreLine +
      (isAssessment
        ? '\n' +
          '【Assessment Special Instructions】\n' +
          'This is a first-time level diagnostic. Note the following:\n' +
          '- Set scoreChange to 0 (first assessment, no prior baseline)\n' +
          '- Set direction to "same"\n' +
          '- In addition to the overall score, include the following 4-dimensional breakdown in the summary field:\n' +
          '  "Vocabulary: X.X / Grammar: X.X / Fluency: X.X / Comprehension: X.X"\n' +
          '- Judge the appropriate level based on how the conversation progressed:\n' +
          '- Level 1-4: Cannot form basic sentences, word-level only\n' +
          '- Level 5-6: Can handle daily conversation but struggles with complex topics\n' +
          '- Level 7-8: Can converse naturally on a wide range of topics\n' +
          '- Level 9-10: Near-native or expert-level proficiency\n'
        : '') +
      '\n' +
      '所有内容用中文撰写。每个数组至少包含1项。只返回 JSON。\n' +
      'CRITICAL: Return ONLY the JSON object. Do not add any greeting, explanation, or other text. Start with { and end with {}.'

  const userContent = language === 'ja'
    ? '请根据以上学习者的发言，生成日语学习总结。'
    : 'Please generate a Chinese learning summary based on the conversation above.'

  // P1-1: 只分析学习者发言，过滤 AI 回复
  const userOnlyHistory = conversationHistory.filter(m => m.role === 'user')

  const messages = [
    { role: 'system', content: systemPrompt },
    ...userOnlyHistory,
    {
      role: 'user',
      content: userContent,
    },
  ]

  debug.log(
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
          ? [{ point: '成功完成了本次对话' }]
          : [{ point: 'Successfully completed the conversation' }]
        needsRepair = true
      }

      if (!parsed.suggestions || parsed.suggestions.length === 0) {
        parsed.suggestions = language === 'ja'
          ? [{ suggestion: '请继续坚持练习，巩固学习成果' }]
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
 */
export async function checkTaskCompletion(goal, todos, conversationHistory, language = 'en') {
  const apiKey = await getApiKey()
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
    debug.error('[checkTaskCompletion] Error:', error)
    return []
  }
}

/**
 * Generate a scenario-specific system prompt using AI.
 * Called from ScenarioPromptModal when the user clicks "✨ AI Generate".
 * Only generates the scenario-dependent portion — universal background
 * (role, personality, rules) is handled separately by buildUniversalPrompt.
 *
 * @param {string} scenarioLabel - Human-readable scenario name (e.g. "咖啡店点单")
 * @param {string} language - Language code ("en" | "ja")
 * @param {number|null} proficiencyScore - User's current proficiency score
 * @returns {string} AI-generated scenario prompt, or empty string on failure
 */
export async function generateSystemPrompt(scenarioLabel, language = 'en', proficiencyScore = null, description = '') {
  const apiKey = await getApiKey()
  if (!apiKey) return ''

  const scoreStr = proficiencyScore !== null ? proficiencyScore.toFixed(1) : 'N/A'

  const systemInstruction = language === 'ja'
    ? `あなたは日本語教師向けの会話シーン設計アシスタントです。
ユーザーが指定した会話シーンに合わせて、AI会話パートナー用の「シーン固有の指示」だけを生成してください。

生成する内容（シーン関連部分のみ）：
- シナリオ名と簡単な状況説明
- 会話の流れ方（どのように会話を進めるか）
- シーン特有のロールプレイ要素（店員と客、面接官と応募者など）
- シーンに適した語彙やフレーズの提案
- 想定される会話の展開例

含めてはいけないもの（共通設定なので不要）：
- AIの役割定義（「あなたは〜会話パートナーです」など）
- 人格・性格設定
- 言語ルール（「会話はすべて日本語で」など）
- 禁止事項（タグ使用禁止など）
- レベル調整の指示

形式：純粋なシーン指示テキストのみを返してください。説明や前置きは不要です。
【重要】出力は必ず日本語で行ってください。シーン名が中国語で与えられても、すべての指示を日本語で記述してください。

参考フォーマット：
シナリオ: [シーン名]
状況: [簡単な状況説明]
会話の流れ: [自然な会話の進め方]
ロール: [AIの役割（店員/案内係など）]
キーフレーズ: [このシーンで使える重要な表現]`
    : `You are a conversation scene designer for AI language tutors.
Generate ONLY the scenario-specific instructions for an AI conversation partner based on the given scenario.

Include (scenario-specific only):
- Scenario name and brief situation description
- Conversation flow (how the conversation should progress)
- Role-play elements (e.g., waiter/customer, interviewer/applicant)
- Key vocabulary or phrases relevant to the scene
- Expected conversation developments

Do NOT include (these are universal and handled separately):
- AI role definition ("You are a conversation partner...")
- Personality/character settings
- Language rules ("Conduct the entire conversation in English...")
- Critical prohibitions (no tags, no stage directions, etc.)
- Level adjustment instructions

Format: Return ONLY the scenario instruction text. No explanations or prefixes.
CRITICAL: Output in English ONLY. Even if the scenario name is provided in another language (e.g. Chinese), write ALL instructions in English.

Reference format:
Scenario: [scene name]
Situation: [brief context]
Flow: [natural conversation progression]
Role: [AI's role - server/guide/etc.]
Key Phrases: [useful expressions for this scene]`

  const descPart = description.trim()
    ? (language === 'ja'
      ? `\nシーンの説明: ${description.trim()}`
      : `\nDescription: ${description.trim()}`)
    : ''

  const userMessage = language === 'ja'
    ? `シーン「${scenarioLabel}」のシーン固有指示を生成してください。${descPart}`
    : `Generate scenario-specific instructions for the "${scenarioLabel}" scene.${descPart}`

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.8,
        stream: false,
        max_tokens: 600,
      }),
    })

    if (!response.ok) {
      debug.warn('[generateSystemPrompt] API request failed:', response.status)
      return ''
    }

    const data = await response.json()
    return data.choices[0].message.content.trim()
  } catch (error) {
    debug.warn('[generateSystemPrompt] Failed:', error)
    return ''
  }
}
