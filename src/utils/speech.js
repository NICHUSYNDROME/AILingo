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

  // Priority order for English: Google > Apple > Microsoft > any en-US
  const priorityPatterns = lang === 'ja'
    ? ['Google', 'ja-JP']
    : ['Google US English', 'Samantha', 'Microsoft Zira', 'en-US']

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
 * Speak a word/phrase using the browser's built-in speech synthesis.
 * @param {string} text - The text to speak
 * @param {string} language - 'en' or 'ja'
 * @returns {Promise<void>} Resolves when speech completes
 */
export function speakWord(text, language = 'en') {
  return new Promise((resolve, reject) => {
    if (!text || text.trim() === '') {
      resolve()
      return
    }

    // Cancel any ongoing speech first (mutual interruption with TTS)
    speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language === 'ja' ? 'ja-JP' : 'en-US'
    utterance.rate = 0.9  // Slightly slower for learners
    utterance.pitch = 1.0
    utterance.volume = 1.0

    // Try to get a good voice
    const voice = getBestVoice(language)
    if (voice) {
      utterance.voice = voice
    }

    utterance.onend = () => resolve()
    utterance.onerror = (event) => {
      // 'canceled' is intentional, don't treat as error
      if (event.error === 'canceled' || event.error === 'interrupted') {
        resolve()
      } else {
        debug.warn('[speakWord] Speech error:', event.error)
        reject(event)
      }
    }

    speechSynthesis.speak(utterance)
  })
}
