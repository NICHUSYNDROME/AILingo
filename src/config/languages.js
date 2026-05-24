// 语言列表
export const LANGUAGES = [
  { key: 'en', label: 'English', flag: '🇺🇸' },
  { key: 'ja', label: '日本語', flag: '🇯🇵' },
]

// 日语假名顺序表（五十音 + 浊音 + 拗音，按读音排列）
const JA_KANA_ORDER = [
  // あ行
  'あ','い','う','え','お',
  'ア','イ','ウ','エ','オ',
  // か行 + が行
  'か','き','く','け','こ','が','ぎ','ぐ','げ','ご',
  'カ','キ','ク','ケ','コ','ガ','ギ','グ','ゲ','ゴ',
  // きゃ行拗音
  'きゃ','きゅ','きょ','ぎゃ','ぎゅ','ぎょ',
  'キャ','キュ','キョ','ギャ','ギュ','ギョ',
  // さ行 + ざ行
  'さ','し','す','せ','そ','ざ','じ','ず','ぜ','ぞ',
  'サ','シ','ス','セ','ソ','ザ','ジ','ズ','ゼ','ゾ',
  // しゃ行拗音
  'しゃ','しゅ','しょ','じゃ','じゅ','じょ',
  'シャ','シュ','ショ','ジャ','ジュ','ジョ',
  // た行 + だ行
  'た','ち','つ','て','と','だ','ぢ','づ','で','ど',
  'タ','チ','ツ','テ','ト','ダ','ヂ','ヅ','デ','ド',
  // ちゃ行拗音 + 小つ
  'ちゃ','ちゅ','ちょ','っ',
  'チャ','チュ','チョ','ッ',
  // な行
  'な','に','ぬ','ね','の',
  'ナ','ニ','ヌ','ネ','ノ',
  // にゃ行拗音
  'にゃ','にゅ','にょ',
  'ニャ','ニュ','ニョ',
  // は行 + ば行 + ぱ行
  'は','ひ','ふ','へ','ほ','ば','び','ぶ','べ','ぼ','ぱ','ぴ','ぷ','ぺ','ぽ',
  'ハ','ヒ','フ','ヘ','ホ','バ','ビ','ブ','ベ','ボ','パ','ピ','プ','ペ','ポ',
  // ひゃ行拗音
  'ひゃ','ひゅ','ひょ','びゃ','びゅ','びょ','ぴゃ','ぴゅ','ぴょ',
  'ヒャ','ヒュ','ヒョ','ビャ','ビュ','ビョ','ピャ','ピュ','ピョ',
  // ま行
  'ま','み','む','め','も',
  'マ','ミ','ム','メ','モ',
  // みゃ行拗音
  'みゃ','みゅ','みょ',
  'ミャ','ミュ','ミョ',
  // や行
  'や','ゆ','よ',
  'ヤ','ユ','ヨ',
  // ら行
  'ら','り','る','れ','ろ',
  'ラ','リ','ル','レ','ロ',
  // りゃ行拗音
  'りゃ','りゅ','りょ',
  'リャ','リュ','リョ',
  // わ行 + ん
  'わ','を','ん',
  'ワ','ヲ','ン',
]

// 构建日语假名 → 排序位置映射
const JA_KANA_INDEX = {}
JA_KANA_ORDER.forEach((k, i) => { JA_KANA_INDEX[k] = i })

/**
 * 获取日语单词的排序键：将假名字符替换为排序位置数字
 * 无对应假名的字符（汉字等）跳过，不影响排序
 */
export function getJaSortKey(text) {
  let key = ''
  for (let i = 0; i < text.length;) {
    // 先尝试匹配双字符拗音
    const two = text.slice(i, i + 2)
    if (JA_KANA_INDEX[two] !== undefined) {
      key += String.fromCharCode(JA_KANA_INDEX[two] + 0x4e00)
      i += 2
      continue
    }
    // 单字符
    const one = text[i]
    if (JA_KANA_INDEX[one] !== undefined) {
      key += String.fromCharCode(JA_KANA_INDEX[one] + 0x4e00)
    }
    i++
  }
  return key
}

// 各语言的字母表（英语区分大小写）
export const ALPHABETS = {
  en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  ja: JA_KANA_ORDER,
}

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
