/**
 * Language Proficiency Scoring System (1.00–10.00)
 *
 * DESIGN PRINCIPLES:
 * - Scores are implicit: used to guide AI behavior, never shown to users.
 * - Scores use 2 decimal places for granularity.
 * - All score values are logged via debug.proficiency(), not displayed in UI.
 * - Knowledge points are scored on a parallel scale: "people below this
 *   score don't know this; people at/above this score probably do."
 */

// ── Proficiency Scale Definitions ──────────────────────────────────────

export const PROFICIENCY_LEVELS = [
  {
    score: 1,
    name: { en: 'Symbol Recognition', ja: '記号認知' },
    description: {
      en: 'Can recognize letters/characters but cannot construct meaning.',
      ja: '文字・記号を認識できるが、意味を構築できない。',
    },
    typicalAbility: {
      en: 'Can recognize that this is writing in a certain language; may know the alphabet or character pronunciations, but cannot associate words with concrete meaning, let alone form phrases or sentences.',
      ja: 'ある言語の文字だと認識できる。アルファベットや文字の読み方を知っているかもしれないが、単語と具体的な意味を結びつけられず、フレーズや文を作ることはできない。',
    },
  },
  {
    score: 2,
    name: { en: 'Isolated Vocabulary', ja: '孤立語彙' },
    description: {
      en: 'Knows a small set of isolated, high-frequency words.',
      ja: '少数の孤立した高頻度語彙を知っている。',
    },
    typicalAbility: {
      en: 'Can understand or say a few dozen basic words (e.g., "hello", "thank you", numbers 1-10), but cannot combine them grammatically or understand simple sentences.',
      ja: '数十個の基本的な単語（「こんにちは」「ありがとう」「1-10」）を理解・発話できるが、文法的に組み合わせたり簡単な文を理解することはできない。',
    },
  },
  {
    score: 3,
    name: { en: 'Template Phrases', ja: '定型フレーズ' },
    description: {
      en: 'Can use memorized fixed templates.',
      ja: '暗記した固定テンプレートを使える。',
    },
    typicalAbility: {
      en: 'Can use a few very fixed phrases (e.g., "How are you?", "I\'m fine, thank you"), but cannot creatively substitute or construct sentences. Completely lost if the template is disrupted.',
      ja: '少数の非常に固定的なフレーズ（「お元気ですか」「はい、元気です」）を使えるが、創造的に置き換えたり文を作ることはできない。テンプレートが崩れると完全に混乱する。',
    },
  },
  {
    score: 4,
    name: { en: 'Fragmentary Sentences', ja: '断片的な文' },
    description: {
      en: 'Can create simple, grammatically incomplete short sentences.',
      ja: '簡単で文法的に不完全な短い文を作れる。',
    },
    typicalAbility: {
      en: 'Can construct short sentences with basic vocabulary and simple word order (e.g., S-V-O), with many grammatical errors. Can express basic needs but requires great patience and guessing from the listener. Cannot understand normal speech speed.',
      ja: '基本語彙と簡単な語順（主語-述語-目的語など）で短い文を作れるが、文法エラーが多い。基本的なニーズを表現できるが、聞き手に大きな忍耐と推測を要する。通常の速度の会話は理解できない。',
    },
  },
  {
    score: 5,
    name: { en: 'Survival Communication', ja: 'サバイバル会話' },
    description: {
      en: 'Can handle predictable daily situations, but not fluently.',
      ja: '予測可能な日常場面に対応できるが、流暢ではない。',
    },
    typicalAbility: {
      en: 'Can conduct simple shopping, ordering, asking for directions — "survival conversations". Sentences are short, often with pauses and errors. Can understand very slow, clearly articulated standard speech. This is the "can survive" level.',
      ja: '簡単な買い物、注文、道案内などの「サバイバル会話」ができる。文は短く、間や誤りが多い。非常にゆっくりで明瞭な標準的発話を理解できる。「生きていける」レベル。',
    },
  },
  {
    score: 6,
    name: { en: 'Basic Fluency', ja: '基本流暢' },
    description: {
      en: 'Can converse on familiar topics, but struggles with complexity.',
      ja: '馴染みのある話題で会話できるが、複雑な話題では苦労する。',
    },
    typicalAbility: {
      en: 'Can converse relatively fluently on familiar topics like daily life, work, hobbies. Understands most everyday conversation. But noticeably struggles when discussing abstract, unfamiliar, or complex topics — vocabulary and sentence patterns are insufficient.',
      ja: '日常生活、仕事、趣味などの馴染みのある話題について比較的流暢に会話できる。日常会話のほとんどを理解できる。しかし抽象的・不慣れ・複雑な話題になると明らかに苦労し、語彙・文型が足りない。',
    },
  },
  {
    score: 7,
    name: { en: 'Independent User', ja: '自立運用' },
    description: {
      en: 'Can effectively handle most social, work, and academic situations.',
      ja: 'ほとんどの社交・仕事・学術場面に効果的に対応できる。',
    },
    typicalAbility: {
      en: 'Can converse with native speakers at normal speed without strain on either side. Can express opinions clearly and organize longer discourse. Can understand the main content of broadcasts, news, and lectures. Occasional unnatural phrasing or minor errors.',
      ja: '母語話者と通常の速度で会話し、双方が負担を感じない。意見を明確に表現し、長めの論述を構成できる。放送・ニュース・講演の主要内容を理解できる。時折不自然な表現や小さな誤りがある。',
    },
  },
  {
    score: 8,
    name: { en: 'Proficient User', ja: '熟達運用' },
    description: {
      en: 'Can express precisely and in detail, close to native speaker.',
      ja: '正確かつ詳細に表現でき、母語話者に近い。',
    },
    typicalAbility: {
      en: 'Expression is fluent and accurate; can use idioms and relatively complex rhetoric. Can understand subtext and humor. Has deep cultural understanding. In most situations, non-native identity is not easily detected. Understands rare words but uses them sparingly.',
      ja: '表現が流暢かつ正確で、慣用句や比較的複雑な修辞を使える。言外の意味やユーモアを理解できる。文化的背景への深い理解がある。ほとんどの場面で非母語話者であることが気づかれにくい。難解語も理解できるが使用は控えめ。',
    },
  },
  {
    score: 9,
    name: { en: 'Domain Expertise', ja: '専門精通' },
    description: {
      en: 'Can reach research-level proficiency in a specific domain.',
      ja: '特定の専門領域で研究レベルの運用ができる。',
    },
    typicalAbility: {
      en: 'Within one\'s professional domain, can freely use advanced terminology, rare vocabulary, and complex stylistic forms. But in non-specialist areas (e.g., unfamiliar slang, dialects), may be slightly less capable than a native speaker.',
      ja: '自身の専門領域内では、高度な専門用語・難解語彙・複雑な文体を自在に運用できる。ただし非専門領域（不慣れな俗語・方言など）では母語話者よりやや劣ることがある。',
    },
  },
  {
    score: 10,
    name: { en: 'Master', ja: '権威的大師' },
    description: {
      en: 'The pinnacle of language ability — researcher/creator level.',
      ja: '言語能力の頂点 — 研究者・創造者レベル。',
    },
    typicalAbility: {
      en: 'Not only is language use perfected, but can engage in deep linguistic creation, analysis, or rhetorical innovation. Can precisely employ the rarest vocabulary and most elegant phrasing, and understand and produce the most complex language arts. Represents the upper limit of proficiency in that language.',
      ja: '言語運用が完璧であるだけでなく、深い言語創造・分析・修辞的革新ができる。最も稀な語彙と最も典雅な文体を精確に使いこなし、最も複雑な言語芸術を理解・産出できる。その言語の運用能力の上限を代表する。',
    },
  },
]

// ── Lookup Maps ─────────────────────────────────────────────────────────

/** score → level entry */
const LEVEL_BY_INT_SCORE = Object.fromEntries(
  PROFICIENCY_LEVELS.map((l) => [l.score, l])
)

/**
 * Get the proficiency level that a given numeric score falls into.
 * A score of 3.75 maps to level 3 (the integer floor).
 */
export function getLevelForScore(score) {
  if (typeof score !== 'number' || isNaN(score)) return PROFICIENCY_LEVELS[2] // default: level 3
  const clamped = Math.max(1, Math.min(10, score))
  const intLevel = Math.floor(clamped)
  return LEVEL_BY_INT_SCORE[intLevel] || PROFICIENCY_LEVELS[0]
}

/**
 * Get a human-readable level label (for debug only).
 */
export function getLevelLabel(score, language = 'en') {
  const level = getLevelForScore(score)
  return `${level.name[language] || level.name.en} (${level.score})`
}

// ── AI Guidance Generator ───────────────────────────────────────────────

/**
 * Generate proficiency-aware instructions for the AI conversation partner.
 *
 * The AI is told the user's approximate level and instructed to:
 * - Use vocabulary/grammar appropriate to that level
 * - Nudge slightly higher (i+1 principle) — introduce occasional slightly
 *   more advanced expressions
 * - Never overwhelm the user
 *
 * @param {number} score - User's proficiency score (1.00–10.00)
 * @param {string} language - 'en' | 'ja'
 * @returns {string} Guidance paragraph to inject into system prompt
 */
export function getProficiencyGuidance(score, language = 'en') {
  const level = getLevelForScore(score)
  const nextLevel = LEVEL_BY_INT_SCORE[Math.min(level.score + 1, 10)]

  if (language === 'ja') {
    const parts = [
      `【学習者の現在の日本語レベル: ${level.name.ja}（約${score.toFixed(2)}/10）】`,
      '',
      `現在の能力: ${level.typicalAbility.ja}`,
      '',
      'あなたの対応方針:',
      `- 語彙・文法はこのレベルの学習者が理解できる範囲を基本としてください。`,
    ]

    if (level.score <= 3) {
      parts.push('- 非常に短く簡単な文で話し、漢字には必ずふりがなを振ってください。')
      parts.push('- 1文に新しい情報は1つだけにしてください。')
      parts.push('- 学習者が理解できなかった場合は、より簡単な言葉で言い換えてください。')
    } else if (level.score <= 5) {
      parts.push('- 基本的な文型で話し、新しい表現は1回の返信につき1つまでにしてください。')
      parts.push('- 学習者がつまずいたら優しく助けてください。')
    } else if (level.score <= 7) {
      parts.push('- 自然な速度の日本語で話し、時折やや高度な表現を混ぜてください。')
      parts.push('- 学習者が自然な表現に触れられるよう、たまに colloquial な表現も使ってください。')
    } else {
      parts.push('- ネイティブ同様の自然な日本語で話してください。')
      parts.push('- 高度な語彙・慣用句・文化的言及も適宜使用してください。')
    }

    if (level.score < 9 && nextLevel) {
      parts.push('')
      parts.push(`【i+1 目標】次のレベル「${nextLevel.name.ja}」に向けて、`)
      parts.push(`時折このレベルに近い表現を1つだけ織り交ぜてください。`)
      parts.push(`学習者が理解できなければ、すぐに易しい表現で言い換えてください。`)
    }

    parts.push('')
    parts.push('重要: 学習者のレベルを直接指摘したり、「あなたのレベルは〜です」と言ったりしないでください。')
    parts.push('レベル情報はあなたの内部的な話し方の調整にのみ使用してください。')

    return parts.join('\n')
  }

  // English
  const parts = [
    `【Learner's current English level: ${level.name.en} (approx. ${score.toFixed(2)}/10)】`,
    '',
    `Current ability: ${level.typicalAbility.en}`,
    '',
    'Your adaptation strategy:',
    `- Base your vocabulary and grammar on what a learner at this level can understand.`,
  ]

  if (level.score <= 3) {
    parts.push('- Use very short, simple sentences. One new concept per reply max.')
    parts.push("- If the learner doesn't understand, rephrase with simpler words.")
    parts.push('- Use high-frequency basic vocabulary only.')
  } else if (level.score <= 5) {
    parts.push('- Use basic sentence patterns. Introduce at most 1 new expression per reply.')
    parts.push('- Gently assist when the learner stumbles.')
    parts.push('- Keep sentences moderately short and clear.')
  } else if (level.score <= 7) {
    parts.push('- Speak at a natural pace. Occasionally mix in slightly more advanced expressions.')
    parts.push('- Use some colloquial expressions so the learner gains exposure to natural language.')
  } else {
    parts.push('- Speak as naturally as a native speaker would.')
    parts.push('- Use advanced vocabulary, idioms, and cultural references as appropriate.')
  }

  if (level.score < 9 && nextLevel) {
    parts.push('')
    parts.push(`【i+1 Target】Toward the next level "${nextLevel.name.en}":`)
    parts.push(`Occasionally weave in ONE expression close to that level.`)
    parts.push(`If the learner doesn't understand, immediately rephrase in simpler terms.`)
  }

  parts.push('')
  parts.push('CRITICAL: Never mention the learner\'s level directly or say "your level is...".')
  parts.push('Use level information ONLY for internally adjusting your speech difficulty.')

  return parts.join('\n')
}

// ── Knowledge Point Proficiency Scoring ─────────────────────────────────

/**
 * Scoring principle for knowledge points:
 * "People below this score don't know this; people at/above this score probably do."
 *
 * So a knowledge point with proficiency=4.5 means:
 * - A learner at 4.0 probably does NOT know it yet
 * - A learner at 5.0 probably already knows it
 *
 * This is used for:
 * 1. Filtering knowledge points to review (show those near the user's level)
 * 2. Guiding AI to introduce appropriate new knowledge
 * 3. Determining which knowledge points are "too easy" or "too hard"
 */

/**
 * Get the knowledge point proficiency score description for AI prompts.
 * This tells the AI how to assign a proficiency score to a newly extracted
 * knowledge point.
 */
export function getKnowledgeProficiencyScoringGuide(language = 'en') {
  if (language === 'ja') {
    return [
      '【知識ポイントの習得レベル採点基準】',
      '各知識ポイントに proficiency（1.00〜10.00の小数）フィールドを付与してください。',
      '基準: 「この点数未満の学習者はこの知識をまだ知らないが、',
      'この点数以上の学習者はおそらく既に知っている」という閾値。',
      '',
      '目安:',
      '1.0-2.0: 絶対的な基礎（「こんにちは」「ありがとう」「はい/いいえ」）',
      '2.0-3.5: 超基本語彙・文法（「食べる」「行く」「〜です」）',
      '3.5-5.0: 日常基本表現（「〜てください」「〜たい」「〜たことがある」）',
      '5.0-6.5: 中級表現（「〜わけにはいかない」「〜ものだ」「敬語の基本」）',
      '6.5-8.0: 上級表現（「〜まい」「〜ずじまい」「二重敬語」）',
      '8.0-10.0: 超上級・文語・希少表現（古文表現、極めて稀な慣用句）',
    ].join('\n')
  }

  return [
    '【Knowledge Point Proficiency Scoring Standard】',
    'Assign a "proficiency" field (decimal 1.00–10.00) to each knowledge point.',
    'Rule: This is the THRESHOLD score — learners BELOW this score do NOT know',
    'this yet; learners AT or ABOVE this score probably already know it.',
    '',
    'Guideline ranges:',
    '1.0-2.0: Absolute basics ("hello", "thank you", "yes/no")',
    '2.0-3.5: Super-basic vocab/grammar ("eat", "go", "I am...")',
    '3.5-5.0: Daily essentials ("I would like...", "have you ever...", basic tenses)',
    '5.0-6.5: Intermediate ("nevertheless", "had I known...", relative clauses)',
    '6.5-8.0: Advanced ("albeit", subjunctive mood, sophisticated transitions)',
    '8.0-10.0: Expert/literary (archaic expressions, extremely rare idioms, elegant prose)',
  ].join('\n')
}

/**
 * Determine if a knowledge point should be introduced to a learner at the
 * given proficiency level. Uses i+1 principle: introduce points whose
 * proficiency is slightly above the learner's current level.
 *
 * @param {number} learnerScore - Learner's proficiency score
 * @param {number} kpScore - Knowledge point's proficiency score
 * @returns {'too_easy'|'appropriate'|'challenging'|'too_hard'}
 */
export function classifyKnowledgeFit(learnerScore, kpScore) {
  const diff = kpScore - learnerScore
  if (diff <= -1.5) return 'too_easy'
  if (diff <= 0.5) return 'appropriate'
  if (diff <= 2.0) return 'challenging'
  return 'too_hard'
}

// ── Default Initial Scores ──────────────────────────────────────────────

/**
 * Default proficiency score for a new learner.
 * 3.0 = "Template Phrases" — a reasonable default for someone who just
 * started learning and can use basic memorized patterns.
 */
export const DEFAULT_PROFICIENCY_SCORE = 3.0

// ── Assessment System Prompt ───────────────────────────────────────────

/**
 * Generate the assessment conversation system prompt.
 * This uses a four-phase adaptive strategy to determine the user's
 * true proficiency level through natural conversation.
 */
export function getAssessmentSystemPrompt(language = 'en') {
  if (language === 'ja') {
    return `あなたは日本語能力評価の専門家です。自然な会話を通じて、ユーザーの日本語習熟度を評価してください。

【評価戦略：4段階の漸進的アプローチ】

あなたの会話は以下の4つのフェーズを順に進みます。各フェーズでユーザーの反応を観察し、適切なタイミングで次のフェーズに移行してください。ユーザーが現在のフェーズで苦戦している場合は、それ以上難易度を上げないでください。

フェーズ1（1-2ターン目）：自己紹介と基本情報
- 話題：自己紹介、住んでいる場所、仕事や学校
- 質問例：「簡単に自己紹介してもらえますか？」「お住まいはどちらですか？」
- 評価ポイント：基本的な文型（〜です・〜ます）が使えるか、語彙の範囲

フェーズ2（3-4ターン目）：日常と好み
- 話題：趣味、週末の過ごし方、好きな食べ物・映画・音楽
- 質問例：「週末は普段何をされていますか？」「最近見た映画で面白かったものはありますか？」
- 評価ポイント：過去形・現在形の切り替え、理由の説明（〜から・〜ので）、比較表現

フェーズ3（5-6ターン目）：意見と比較
- 話題：都会vs田舎、オンラインvs対面、日本文化についての意見
- 質問例：「都会と田舎ではどちらが住みやすいと思いますか？」「日本の文化で特に素晴らしいと思うところは？」
- 評価ポイント：意見の論理的構成、仮定表現（〜たら・〜ば）、抽象的な話題への対応力

フェーズ4（7-8ターン目）：抽象的思考と仮説
- 話題：教育制度の改革、テクノロジーの未来、文化の違い
- 質問例：「もし教育制度を一から作り直せるとしたら、何を変えますか？」「テクノロジーは人間関係をどう変えたと思いますか？」
- 評価ポイント：複雑な文構造、高度な語彙、微妙なニュアンスの表現、比喩や例えの使用

【重要なルール】
- ユーザーのレベルを直接指摘したり、「あなたのレベルは〜」と言わないでください。
- 自然な会話の流れを保ち、テストのように感じさせないでください。
- ユーザーが単語や表現に困ったら、優しく助けてください。
- 各フェーズで少なくとも1往復は会話してください。
- 8ターン経過したら自然に会話を締めくくってください。
- すべて日本語で会話してください。
- [CONVERSATION_ENDED] タグを最後のメッセージに含めてください。`
  }

  // English
  return `You are a language proficiency assessment specialist. Evaluate the user's English level through natural conversation.

【Assessment Strategy: Four-Phase Progressive Approach】

Guide the conversation through the following four phases in order. Observe the user's responses at each phase and only advance when they demonstrate comfort. If they struggle at a phase, do NOT increase difficulty further.

Phase 1 (Turns 1-2): Self-introduction & basic info
- Topics: self-introduction, where they live, work or school
- Sample: "Tell me a bit about yourself!" / "What do you do?"
- Assess: Can they form basic sentences (S-V-O)? How limited is their vocabulary?

Phase 2 (Turns 3-4): Daily life & preferences
- Topics: hobbies, weekend activities, favorite foods/movies/music
- Sample: "What do you usually do on weekends?" / "Have you seen any good movies lately?"
- Assess: Can they switch tenses (past/present/future)? Can they explain reasons (because, so)? Can they compare?

Phase 3 (Turns 5-6): Opinions & comparisons
- Topics: city vs countryside, online vs in-person, cultural opinions
- Sample: "Do you think it's better to live in a big city or a small town? Why?" / "What's something about your culture that you think is underappreciated?"
- Assess: Can they structure an argument? Can they use conditionals (if, would)? Can they handle abstract topics?

Phase 4 (Turns 7-8): Abstract thinking & hypotheticals
- Topics: redesigning education, future of technology, cultural differences
- Sample: "If you could redesign the education system from scratch, what would you change?" / "How do you think technology has changed the way people connect?"
- Assess: Complex sentence structures, advanced vocabulary, nuanced expression, use of metaphors

【Critical Rules】
- NEVER mention the user's level or that this is a test. Keep it feeling like a natural chat.
- Maintain natural conversational flow. Do NOT make it feel like an exam.
- If the user struggles for words, gently assist them.
- Spend at least one exchange in each phase before advancing.
- After ~8 turns, naturally wrap up the conversation.
- Conduct the entire conversation in English.
- Include the [CONVERSATION_ENDED] tag in your final message.`
}

/**
 * Storage keys for persistence.
 */
export const PROFICIENCY_STORAGE_KEYS = {
  en: 'en_proficiency_score',
  ja: 'ja_proficiency_score',
  // History log for tracking changes over time
  enHistory: 'en_proficiency_history',
  jaHistory: 'ja_proficiency_history',
}
