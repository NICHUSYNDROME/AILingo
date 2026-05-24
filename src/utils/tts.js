/**
 * TTS (Text-to-Speech) utility module
 *
 * Proxies TTS requests through a local Node.js backend to the Qwen DashScope API.
 * API key is provided by the user on first use and stored persistently.
 * The backend never stores the key.
 *
 * Audio responses are cached in-memory (Map) for the current page session
 * to avoid redundant API calls for the same text.
 */

import { getItem } from './storage'

const TTS_PROXY_URL = 'http://localhost:3001/tts'

// In-memory audio cache: key = `${language}_${voice}_${text[:100]}`, value = audioUrl
const audioCache = new Map()
const MAX_CACHE_SIZE = 50

let currentAudio = null

/**
 * Check if TTS is available (always true for proxy-based approach).
 * @returns {boolean}
 */
export function isTTSAvailable() {
  return true
}

/**
 * Stop any currently playing TTS audio immediately.
 */
export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio.onended = null
    currentAudio.onerror = null
    currentAudio = null
  }
}

/**
 * Check if TTS is currently speaking.
 * @returns {boolean}
 */
export function isSpeaking() {
  return currentAudio !== null && !currentAudio.paused
}

/**
 * Speak the given text using Qwen TTS via the local proxy server.
 *
 * Automatically stops any previously playing audio before starting a new one.
 *
 * The TTS API key must be configured in advance via the settings modal
 * (ApiKeyModal). If no key is stored, a warning is logged and the call
 * silently returns without playing audio.
 * 
 * Audio responses are cached in-memory: repeated calls with the same text
 * reuse the cached audio URL without making a new API request.
 *
 * @param {string} text - The text to read aloud.
 * @param {'en'|'ja'} language - Language code ('en' or 'ja').
 * @param {string|null} apiKey - Optional API key override. If null, reads from storage.
 * @returns {Promise<void>}
 */
export async function speak(text, language = 'en', apiKey = null) {
  // Stop any currently playing audio before starting new one
  stopSpeaking()

  // Also stop any Web Speech API playback
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel()
  }

  // Resolve API key: param → storage
  if (!apiKey) {
    apiKey = await getItem('qwen_tts_api_key')
  }

  if (!apiKey) {
    console.warn('未配置 TTS API Key，请在设置中配置千问 TTS API Key')
    return
  }

  // Voice — qwen3-tts-instruct-flash supports: Cherry, Serena, Ethan, Chelsie, Ryan
  // Ryan is a male voice
  const voice = 'Kai'
  const languageType = language === 'ja' ? 'Japanese' : 'English'

  // Generate cache key (truncate text to 100 chars to avoid excessively long keys)
  const cacheKey = `${language}_${voice}_${text.slice(0, 100)}`

  // Check cache first
  const cachedUrl = audioCache.get(cacheKey)
  if (cachedUrl) {
    const audio = new Audio(cachedUrl)
      currentAudio = audio
      audio.onended = () => { currentAudio = null }
      audio.onerror = () => { currentAudio = null }
      await audio.play()
    return
  }

  try {
    const response = await fetch(TTS_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        apiKey,
        voice,
        languageType,
        model: 'qwen3-tts-instruct-flash',
        instructions: '语速偏慢，语气沉稳冷静，像纪录片旁白一样平稳地朗读。',
        optimize_instructions: true,
      }),
    })

    const data = await response.json()

    if (data.audioUrl) {
      // Store in cache (evict oldest entry if at capacity)
      if (audioCache.size >= MAX_CACHE_SIZE) {
        const firstKey = audioCache.keys().next().value
        if (firstKey !== undefined) {
          audioCache.delete(firstKey)
      }
}
      audioCache.set(cacheKey, data.audioUrl)

      const audio = new Audio(data.audioUrl)
      currentAudio = audio
      audio.onended = () => { currentAudio = null }
      audio.onerror = () => { currentAudio = null }
      await audio.play()
    } else {
      console.error('TTS 请求失败:', data.error || data.detail)
    }
  } catch (e) {
    console.error('TTS 请求出错:', e)
  }
}

