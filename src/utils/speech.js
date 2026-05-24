/**
 * Web Speech API wrapper for local word/phrase pronunciation.
 * Uses browser's built-in SpeechSynthesis — free, offline-capable, low latency.
 */

/**
 * Get the best available voice for a given language.
 * Prioritizes high-quality voices (Google, Apple, Microsoft).
 * @param {string} lang - Language code: 'en' for English, 'ja' for Japanese
 * @returns {SpeechSynthesisVoice|null}
 */

import { debug } from './debug'
function getBestVoice(lang) {
  const voices = speechSynthesis.getVoices()
  if (voices.length === 0) return null

  const langPrefix = lang === 'ja' ? 'ja-JP' : 'en-US'

  // For Japanese: prefer native voices (Kyoko, Otoya)
  // For English: try clear male US voices, fallback to natural voices
  const priorityPatterns = lang === 'ja'
    ? ['Kyoko', 'Otoya', 'Google', 'ja-JP']
    : ['Daniel', 'Samantha', 'Kathy', 'en-US']

  for (const pattern of priorityPatterns) {
    const match = voices.find(v => v.name.includes(pattern) || v.lang === pattern)
    if (match) return match
  }

  // Fallback: any voice matching the lang prefix
  const fallback = voices.find(v => v.lang.startsWith(langPrefix))
  return fallback || voices[0]
}

/**
 * Check if SpeechSynthesis is currently speaking.
 * @returns {boolean}
 */
export function isSpeaking() {
  return speechSynthesis.speaking
}

/**
 * Stop all current speech immediately.
 */
export function stopSpeaking() {
  speechSynthesis.cancel()
}

/**
 * Speak a word/phrase.
 * English: uses Youdao public dictvoice API (native speaker recordings).
 * Japanese / fallback: uses browser's Web Speech API.
 */

const audioCache = new Map()

export function speakWord(text, language = 'en') {
  return new Promise((resolve) => {
    if (!text || text.trim() === '') { resolve(); return }

    // Build Youdao dictvoice URL
    const params = language === 'ja'
      ? `le=jap&type=3&audio=${encodeURIComponent(text)}`
      : `type=1&audio=${encodeURIComponent(text)}`
    const url = `http://dict.youdao.com/dictvoice?${params}`

    // Cache hit — replay immediately
    const cached = audioCache.get(url)
    if (cached && cached.readyState >= 2) { cached.play(); resolve(); return }

    const audio = new Audio(url)
    audio.preload = 'auto'
    audioCache.set(url, audio)
    if (audioCache.size > 100) audioCache.delete(audioCache.keys().next().value)

    audio.onended = () => resolve()
    audio.onerror = () => {
      debug.warn('[speakWord] Youdao failed, falling back to Web Speech')
      webSpeechSpeak(text, language).finally(resolve)
    }
    audio.play().catch(() => {
      webSpeechSpeak(text, language).finally(resolve)
    })
  })
}

function webSpeechSpeak(text, language) {
  return new Promise((resolve) => {
    speechSynthesis.cancel()
    speechSynthesis.getVoices()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.85
    utterance.pitch = 1.0
    utterance.volume = 1.0
    const voice = getBestVoice(language)
    utterance.lang = voice ? voice.lang : (language === 'ja' ? 'ja-JP' : 'en-US')
    if (voice) utterance.voice = voice
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    setTimeout(() => speechSynthesis.speak(utterance), 50)
  })
}
