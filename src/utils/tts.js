/**
 * TTS (Text-to-Speech) utility module
 *
 * Proxies TTS requests through a local Node.js backend to the Qwen DashScope API.
 * API key is provided by the user on first use and stored persistently.
 * The backend never stores the key.
 *
 * Audio responses are cached in-memory (Map) for the current page session
 * to avoid redundant API calls for the same text.
 *
 * Heartbeat: sends a POST /ping to the backend every 10 seconds while the
 * browser tab is open. If the tab is closed, the backend detects the timeout
 * and shuts itself down automatically.
 */

import { getItem, setItem } from './storage'

const TTS_PROXY_URL = 'http://localhost:3001/tts'
const PING_URL = 'http://localhost:3001/ping'

// In-memory audio cache: key = `${language}_${voice}_${text[:100]}`, value = audioUrl
const audioCache = new Map()
const MAX_CACHE_SIZE = 50

// === Heartbeat ===
let heartbeatTimer = null

/**
 * Start sending periodic heartbeat pings to the TTS backend.
 * The backend will auto-shutdown if no ping is received for 30 seconds.
 * Safe to call multiple times — only one timer runs at a time.
 */
export function startHeartbeat() {
  if (heartbeatTimer) return
  console.log('[TTS] 心跳检测已启动')
  heartbeatTimer = setInterval(async () => {
    try {
      await fetch(PING_URL, { method: 'POST' })
    } catch {
      // Backend may have shut down — stop sending
      stopHeartbeat()
    }
  }, 10000) // 每 10 秒一次
}

/**
 * Stop sending heartbeat pings.
 */
export function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
    console.log('[TTS] 心跳检测已停止')
  }
}

/**
 * Check if TTS is available (always true for proxy-based approach).
 * @returns {boolean}
 */
export function isTTSAvailable() {
  return true
}

/**
 * Speak the given text using Qwen TTS via the local proxy server.
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
  // Resolve API key: param → storage
  if (!apiKey) {
    apiKey = await getItem('qwen_tts_api_key')
  }

  if (!apiKey) {
    console.warn('未配置 TTS API Key，请在设置中配置千问 TTS API Key')
    return
  }

  // Voice — qwen3-tts-flash supports: Cherry, Serena, Ethan, Chelsie
  // Ethan is the only male voice available
  const voice = 'Ethan'
  const languageType = language === 'ja' ? 'Japanese' : 'English'

  // Generate cache key (truncate text to 100 chars to avoid excessively long keys)
  const cacheKey = `${language}_${voice}_${text.slice(0, 100)}`

  // Check cache first
  const cachedUrl = audioCache.get(cacheKey)
  if (cachedUrl) {
    const audio = new Audio(cachedUrl)
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
      await audio.play()
    } else {
      console.error('TTS 请求失败:', data.error || data.detail)
    }
  } catch (e) {
    console.error('TTS 请求出错:', e)
  }
}
