// 语言列表
export const LANGUAGES = [
  { key: 'en', label: 'English', flag: '🇬🇧' },
  { key: 'ja', label: '日本語', flag: '🇯🇵' },
]

// 各语言的场景列表
export const SCENARIOS = {
  en: [
    { value: 'restaurant', label: 'Restaurant Ordering' },
    { value: 'hotel', label: 'Hotel Check-in' },
    { value: 'business', label: 'Business Meeting' },
    { value: 'casual', label: 'Casual Chat' },
    { value: 'custom', label: 'Custom' },
  ],
  ja: [
    { value: 'restaurant', label: 'レストランで注文' },
    { value: 'hotel', label: 'ホテルチェックイン' },
    { value: 'station', label: '駅で切符購入' },
    { value: 'convenience', label: 'コンビニで買い物' },
    { value: 'casual', label: '日常会話' },
    { value: 'custom', label: 'カスタム' },
  ],
}

// 各语言的纠错敏感度标签
export const SENSITIVITY_LABELS = {
  en: { loose: 'Loose', normal: 'Normal', strict: 'Strict' },
  ja: { loose: 'ゆるめ', normal: '標準', strict: 'きびしめ' },
}

// UI 文案（需要国际化的固定文字）
export const UI_TEXT = {
  en: {
    // Scenario Setup
    scenarioSetup: 'Scenario Setup',
    scenario: 'Scenario',
    conversationGoal: 'Conversation Goal',
    random: 'Random',
    sensitivity: 'Sensitivity',
    maxRounds: 'Max Rounds',
    targetKnowledge: 'Target Knowledge Points',
    startChat: 'Start Conversation',
    confirmTitle: 'Confirm Conversation Settings',
    confirmCancel: 'Cancel',
    confirmOk: 'Confirm & Start',
    confirmGeneratingGoal: 'Generating goal...',
    confirmUnfilled: '(Not filled)',
    customScenarioLabel: 'Custom Scenario Description',
    customScenarioPlaceholder: 'Enter custom scenario...',
    goalPlaceholder: 'Enter conversation goal, or generate randomly...',
    validationCustomScenario: 'Please enter a custom scenario',
    validationGoal: 'Please enter or generate a conversation goal',
    validationMaxRounds: 'Max rounds and target knowledge cannot be empty',

    // Knowledge Sidebar
    knowledgePoints: 'Knowledge Points',
    searchPlaceholder: 'Search knowledge points...',
    noPoints: 'No knowledge points yet. Start a conversation!',
    noMatchingPoints: 'No matching knowledge points.',
    sortAlphabet: 'Alphabet',
    sortDifficulty: 'Difficulty',
    sortRecent: 'Recent',
    sortMastery: 'Mastery',
    confirmed: 'Confirmed',
    pendingConfirmation: 'Pending confirmation',
    keep: '✓ Keep',
    discard: '🗑 Discard',
    keepTooltip: 'Keep this knowledge point',
    discardTooltip: 'Discard this knowledge point',
    grammarRule: 'Grammar rule',

    // LookUp Panel
    lookUp: 'Look Up',
    dictPlaceholder: 'Ask about a word or phrase...',
    definition: 'Definition',
    showChinese: 'Show Chinese ▼',
    hideChinese: 'Hide Chinese ▲',
    noDefinition: '（暂无释义）',
    noChineseDefinition: '暂无中文释义',
    partOfSpeech: 'Part of Speech',
    example: 'Example',
    context: 'Context',
    grammarRulePrefix: 'Grammar rule: ',
    lookUpTipSelect: 'Select a word in the conversation and press <kbd>Cmd+Shift+K</kbd> to look it up',
    lookUpTipType: 'Or type a word or phrase in the search box above',
    lookUpTipConfirm: 'Confirm knowledge points from corrections to build your vocabulary list',
    lookUpTipReview: 'Review confirmed knowledge points with the quiz system',

    // Progress Dashboard
    learningProgress: 'Learning Progress',
    conversationsThisWeek: 'Conversations this week',
    confirmedPoints: 'Confirmed Knowledge Points',
    dueForReview: 'Due for Review',
    startQuiz: 'Start Review Quiz',
    noDueForReviewTitle: 'No items due for review',
    noDueForReviewLabel: 'No items due',

    // Heatmap Calendar
    heatmapLess: 'Less',
    heatmapMore: 'More',
    heatmapActivities: 'activities',

    // Quiz Panel
    quizTitle: 'Knowledge Review Quiz',
    quizResults: 'Quiz Results',
    quizCorrect: 'correct',
    quizCorrectExclaim: 'Correct!',
    quizCorrectAnswer: 'The correct answer is: ',
    quizYourAnswer: 'Your answer: ',
    quizNoAnswer: '(No answer)',
    quizBackToHome: 'Back to Home',
    quizBack: '← Back',
    quizGenerating: 'Generating quiz...',
    quizNoQuestions: 'No questions generated.',
    quizDiscardConfirm: 'Discard current quiz progress?',
    quizDiscard: 'Discard',
    quizCancel: 'Cancel',
    quizTypePlaceholder: 'Type your answer...',
    quizSpellPlaceholder: 'Type the word...',
    quizMultipleChoice: 'Multiple Choice',
    quizFillBlank: 'Fill in the Blank',
    quizSpelling: 'Spelling',
    quizErrorCorrection: 'Error Correction',
    quizApiKeyMissing: 'Please provide a valid API Key first.',
    quizNoPointsDue: 'No knowledge points due for review.',
    quizApiKeyInvalid: 'API Key is invalid or expired.',
    quizGenFailed: 'Quiz generation failed',
    quizParseFailed: 'Failed to parse quiz data. Please try again.',
    quizGenError: 'Failed to generate quiz. Please try again.',
    quizManualCheck: 'Could not auto-review. Please check manually.',
    quizNoApiKey: 'No API key available for review.',
    quizQuestionCount: 'questions',
    back: 'Back',
    endConversation: 'End Conversation',

    // Settings Panel
    settings: 'Settings',
    settingsLanguage: 'Language',
    settingsTheme: 'Theme',
    settingsFollowSystem: 'Follow System',
    settingsDarkMode: 'Dark Mode',
    settingsAutoRead: 'Auto-read AI Replies',
    on: 'On',
    off: 'Off',

    // AppView / Misc
    loadingConversation: 'Loading conversation…',
    loadingQuiz: 'Loading quiz…',
    search: 'Search',
    dictLoading: '...',

    // Chat AI prompt
    aiStartPrompt: 'Please start the conversation based on the scenario settings. You go first, naturally leading into the topic.',

    // Chat Area
    backToHome: 'Back to Home',
    backToHomeTooltip: 'Back to home (abandon conversation)',
    readAloud: 'Read aloud',
    conversationEnded: 'The conversation has ended. Click "Start New Conversation" to begin a new session.',
  },
  ja: {
    // Scenario Setup
    scenarioSetup: 'シーン設定',
    scenario: 'シーン',
    conversationGoal: '会話の目標',
    random: 'ランダム',
    sensitivity: '訂正レベル',
    maxRounds: '最大往復数',
    targetKnowledge: '目標単語数',
    startChat: '会話を始める',
    confirmTitle: '会話設定の確認',
    confirmCancel: 'キャンセル',
    confirmOk: '確認して開始',
    confirmGeneratingGoal: '会話の目標を生成中...',
    confirmUnfilled: '（未入力）',
    customScenarioLabel: 'カスタムシーン説明',
    customScenarioPlaceholder: 'カスタムシーンを入力...',
    goalPlaceholder: '会話の目標を入力、またはランダム生成...',
    validationCustomScenario: 'カスタムシーンを入力してください',
    validationGoal: '会話の目標を入力または生成してください',
    validationMaxRounds: '最大往復数と目標単語数を入力してください',

    // Knowledge Sidebar
    knowledgePoints: '単語帳',
    searchPlaceholder: '単語を検索...',
    noPoints: 'まだ単語がありません。会話を始めましょう！',
    noMatchingPoints: '一致する単語がありません。',
    sortAlphabet: 'アルファベット順',
    sortDifficulty: '難易度順',
    sortRecent: '最近',
    sortMastery: '習得度順',
    confirmed: '確認済み',
    pendingConfirmation: '未確認',
    keep: '✓ 保持',
    discard: '🗑 削除',
    keepTooltip: 'この単語を保持',
    discardTooltip: 'この単語を削除',
    grammarRule: '文法ルール',

    // LookUp Panel
    lookUp: '辞書',
    dictPlaceholder: '単語やフレーズを入力...',
    definition: '定義',
    showChinese: '中国語を表示 ▼',
    hideChinese: '中国語を隠す ▲',
    noDefinition: '（定義なし）',
    noChineseDefinition: '中国語の释义なし',
    partOfSpeech: '品詞',
    example: '例文',
    context: '文脈',
    grammarRulePrefix: '文法ルール: ',
    lookUpTipSelect: '会話内の単語を選択し <kbd>Cmd+Shift+K</kbd> で辞書検索',
    lookUpTipType: 'または上の検索ボックスに単語やフレーズを入力',
    lookUpTipConfirm: '修正から単語を確認して単語帳を作成',
    lookUpTipReview: '確認済み単語をクイズで復習',

    // Progress Dashboard
    learningProgress: '学習の進捗',
    conversationsThisWeek: '今週の会話数',
    confirmedPoints: '確認済み単語',
    dueForReview: '復習待ち',
    startQuiz: '復習する',
    noDueForReviewTitle: '復習待ちはありません',
    noDueForReviewLabel: '復習待ちなし',

    // Heatmap Calendar
    heatmapLess: '少ない',
    heatmapMore: '多い',
    heatmapActivities: 'アクティビティ',

    // Quiz Panel
    quizTitle: '単語復習クイズ',
    quizResults: 'クイズ結果',
    quizCorrect: '正解',
    quizCorrectExclaim: '正解！',
    quizCorrectAnswer: '正解: ',
    quizYourAnswer: 'あなたの回答: ',
    quizNoAnswer: '（未回答）',
    quizBackToHome: 'ホームに戻る',
    quizBack: '← 戻る',
    quizGenerating: 'クイズを生成中...',
    quizNoQuestions: '問題が生成されませんでした。',
    quizDiscardConfirm: '現在の進捗を破棄しますか？',
    quizDiscard: '破棄',
    quizCancel: 'キャンセル',
    quizTypePlaceholder: '回答を入力...',
    quizSpellPlaceholder: '単語を入力...',
    quizMultipleChoice: '選択問題',
    quizFillBlank: '穴埋め問題',
    quizSpelling: 'スペリング',
    quizErrorCorrection: '誤り訂正',
    quizApiKeyMissing: '有効なAPIキーを入力してください。',
    quizNoPointsDue: '復習待ちの単語がありません。',
    quizApiKeyInvalid: 'APIキーが無効または期限切れです。',
    quizGenFailed: 'クイズ生成に失敗しました',
    quizParseFailed: 'クイズデータの解析に失敗しました。もう一度お試しください。',
    quizGenError: 'クイズの生成に失敗しました。もう一度お試しください。',
    quizManualCheck: '自動採点できませんでした。手動で確認してください。',
    quizNoApiKey: 'レビュー用のAPIキーがありません。',
    quizQuestionCount: '問',
    back: '戻る',
    endConversation: '会話を終了',

    // Settings Panel
    settings: '設定',
    settingsLanguage: '言語',
    settingsTheme: 'テーマ',
    settingsFollowSystem: 'システム設定に従う',
    settingsDarkMode: 'ダークモード',
    settingsAutoRead: 'AIの返信を自動読み上げ',
    on: 'オン',
    off: 'オフ',

    // AppView / Misc
    loadingConversation: '会話を読み込み中…',
    loadingQuiz: 'クイズを読み込み中…',
    search: '検索',
    dictLoading: '...',

    // Chat AI prompt
    aiStartPrompt: 'シナリオ設定に基づいて会話を始めてください。あなたから自然に話題に入ってください。',

    // Chat Area
    backToHome: 'ホームに戻る',
    backToHomeTooltip: 'ホームに戻る（会話を破棄）',
    readAloud: '読み上げ',
    conversationEnded: '会話が終了しました。「新しい会話を始める」をクリックして新しいセッションを開始してください。',
  },
}

// 知识类型配置（英文版）
export const TYPE_CONFIG = {
  word: { label: 'Word', color: '#1677ff', bg: '#e6f4ff' },
  phrase: { label: 'Phrase', color: '#52c41a', bg: '#f6ffed' },
  grammar: { label: 'Grammar', color: '#fa8c16', bg: '#fff7e6' },
  collocation: { label: 'Collocation', color: '#eb2f96', bg: '#fff0f6' },
}

// 知识类型配置（日文版）
export const JA_TYPE_CONFIG = {
  word: { label: '単語', color: '#1677ff', bg: '#e6f4ff' },
  phrase: { label: 'フレーズ', color: '#52c41a', bg: '#f6ffed' },
  grammar: { label: '文法', color: '#fa8c16', bg: '#fff7e6' },
  collocation: { label: 'コロケーション', color: '#eb2f96', bg: '#fff0f6' },
  keigo: { label: '敬語', color: '#722ed1', bg: '#f9f0ff' },
  joshi: { label: '助詞', color: '#13c2c2', bg: '#e6fffb' },
  katsuyou: { label: '活用', color: '#f5222d', bg: '#fff1f0' },
}
