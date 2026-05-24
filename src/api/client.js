import { getItem, setItem } from '../utils/storage'
import { debug } from '../utils/debug'

export const API_URL = 'https://api.deepseek.com/chat/completions'

/**
 * Test a DeepSeek API key by making a minimal API call.
 * @param {string} key - The API key to test
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function testDeepSeekKey(key) {
  try {
    const response = await fetch('https://api.deepseek.com/models', {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (response.ok) {
      return { valid: true }
    }
    const data = await response.json().catch(() => ({}))
    return { valid: false, error: data.error?.message || `HTTP ${response.status}` }
  } catch (error) {
    return { valid: false, error: error.message }
  }
}

/**
 * Test a Qwen TTS API key by making a minimal API call.
 * @param {string} key - The TTS API key to test
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function testTTSKey(key) {
  try {
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'qwen-turbo',
        input: { messages: [{ role: 'user', content: 'hi' }] },
      }),
    })
    if (response.ok) {
      return { valid: true }
    }
    const data = await response.json().catch(() => ({}))
    return { valid: false, error: data.message || `HTTP ${response.status}` }
  } catch (error) {
    return { valid: false, error: error.message }
  }
}

/**
 * Fetch with timeout support using AbortController.
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default 15000)
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Shared helper: parse JSON from AI response (handles markdown code blocks).
 * Robust: extracts first {…} or […] block, logs on failure.
 */
export function parseJSONResponse(content) {
  if (!content || typeof content !== 'string') {
    debug.warn('[parseJSONResponse] Invalid input:', content)
    return null
  }

  let jsonStr = content.trim()

  // 1. Try extracting from markdown code block first
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  // 2. Try parsing as-is
  try {
    return JSON.parse(jsonStr)
  } catch {
    // 3. Try extracting first {…} block
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0])
      } catch {
        // fall through
      }
    }

    // 4. Try extracting first […] block (array format)
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0])
      } catch {
        // fall through
      }
    }

    // 5. All attempts failed — log for debugging
    debug.warn('[parseJSONResponse] Failed to parse content:', content)
    return null
  }
}

/**
 * Get API key from storage. Falls back to prompting the user.
 * @returns {Promise<string|null>}
 */
export async function getApiKey() {
  const key = await getItem('deepseek_api_key')
  if (!key) {
    const newKey = prompt('请输入你的 DeepSeek API Key：')
    if (newKey) {
      await setItem('deepseek_api_key', newKey)
      return newKey
    }
  }
  return key
}
