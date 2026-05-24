// 语言列表
export const LANGUAGES = [
  { key: 'en', label: 'English', flag: '🇺🇸' },
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
