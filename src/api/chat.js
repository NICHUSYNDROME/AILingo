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

    if (conversationHistory.length === 0) {
      messages.push({
        role: 'system',
        content:
          'DIVERSITY NOTE: Avoid cliché recommendations (steak, salmon, Caesar salad, coffee). ' +
          'Be creative with menu items, services, or topics. Surprise the user with something fresh.',
      })
    }
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
export async function generateConversationGoal(scenario, language = 'en', proficiencyScore = null) {
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
  const jaPrevScoreLine = (prevScore !== null && prevScore !== undefined && !isAssessment)
    ? `前回のスコア（${prevScore.toFixed(2)}）を基準に変化を測ってください。\n`
    : '前回のスコア（もしあれば）を基準に変化を測ってください。\n'

  const enPrevScoreLine = (prevScore !== null && prevScore !== undefined && !isAssessment)
    ? `The learner's previous proficiency score was ${prevScore.toFixed(2)}. Use it as a baseline to compute scoreChange.\n`
    : 'Use the previous score (if available) as a reference for the change.\n'

  const systemPrompt = language === 'ja'
    ? 'あなたは' + (isAssessment ? '日本語能力評価の専門家です。この会話はレベル診断テストです。' : '日本語学習分析の専門家です。') + '会話履歴に基づいて、' + (isAssessment ? '診断レポート' : '構造化された学習サマリー') + 'を生成してください。\n' +
      'JSON 形式で返してください。他のテキストは不要です：\n' +
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
      '各フィールドの説明：\n' +
      '- completion.rating: 簡潔な評価（例：「優秀」「良好」「基本的に完了」）\n' +
      '- completion.detail: 達成状況の詳細説明（1-2文、日本語）\n' +
      '- strengths: 良かった点、各 point は一文で。必ず1つ以上書くこと。\n' +
      '- weaknesses: 改善が必要な文法ポイント、各 point は問題説明、example は会話中の誤りの例\n' +
      '- newKnowledge: 新しい知識、各 word は日本語の単語、meaning は日本語での説明\n' +
      '- suggestions: 学習アドバイス、各 suggestion は一文で。必ず1つ以上書くこと。\n' +
      '\n' +
      '【習熟度評価の指示】\n' +
      'proficiencyAssessment は学習者の現在の習熟度を1-10の小数点数で評価します。\n' +
      '- currentScore: 今回の会話に基づく現在の評価スコア（例: 4.25）\n' +
      '- scoreChange: 前回と比較した変化量（正=向上、負=低下、0=維持）\n' +
      '- direction: "up"（向上）、"down"（低下）、または "same"（維持）\n' +
      '- summary: 習熟度変化の簡潔な説明（日本語で一言。前回と比較した表現を使ってください。例：「前回より語彙力が向上しています」）\n' +
      '\n' +
      '採点の参考: レベル5=サバイバル会話可能、レベル6=基本流暢、レベル7=自立運用\n' +
      '小さな変化（±0.05〜0.30）を適切に反映してください。\n' +
      jaPrevScoreLine +
      (isAssessment
        ? '\n' +
          '【診断特別指示】\n' +
          'これは初回レベル診断です。以下の点に注意してください：\n' +
          '- scoreChange は 0 にしてください（初回評価のため）\n' +
          '- direction は "same" にしてください\n' +
          '- 総合スコアに加えて、summaryフィールドに以下の4次元の内訳を含めてください：\n' +
          '  「語彙: X.X / 文法: X.X / 流暢さ: X.X / 理解力: X.X」\n' +
          '- 会話の進行に応じて適切なレベルを判断してください\n' +
          '- レベル1-4: 基本的な文が作れない・単語レベル\n' +
          '- レベル5-6: 日常会話が可能だが複雑な話題で苦戦\n' +
          '- レベル7-8: 幅広い話題で自然に会話可能\n' +
          '- レベル9-10: 母語話者に近い・専門的な運用が可能\n'
        : '') +
      '\n' +
      'すべて日本語で記述してください。各配列は少なくとも1項目含むこと。JSONのみ返してください。\n' +
      'CRITICAL: Return ONLY the JSON object. Do not add any greeting, explanation, or other text. Start with { and end with {}.'
    : (isAssessment
      ? 'You are a language proficiency assessment specialist. This conversation was a level diagnostic. Generate a diagnostic report.\n'
      : '你是英语学习分析专家。根据对话历史，生成结构化的学习总结。\n') +
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
