/**
 * Shared TTS Proxy — Qwen DashScope API handler.
 *
 * Used by both:
 *   - server/tts-server.cjs   (standalone, browser dev mode)
 *   - electron/main.cjs       (embedded in Electron)
 *
 * API key is passed per-request — never stored server-side.
 */

const http = require('http')

/**
 * Create a request handler that proxies POST /tts to Qwen DashScope.
 * @returns {Function} (req, res) handler
 */
function createTTSHandler() {
  return (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method !== 'POST' || req.url !== '/tts') {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const { text, apiKey, voice, languageType } = JSON.parse(body)

        if (!text || !apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing text or apiKey' }))
          return
        }

        console.log('[TTS] Sending to Qwen:', {
          model: 'qwen3-tts-instruct-flash',
          text: text.substring(0, 30),
          voice,
          languageType,
          apiKeyPrefix: apiKey.substring(0, 8) + '...',
        })

        const apiResp = await fetch(
          'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'qwen3-tts-instruct-flash',
              input: {
                text,
                voice: voice || 'Kai',
                language_type: languageType || 'Japanese',
                speed: 1.0,
                volume: 1.0,
              },
              instructions: '语速偏慢，语气沉稳冷静，像纪录片旁白一样平稳地朗读。',
              optimize_instructions: true,
            }),
          }
        )

        const rawData = await apiResp.text()
        console.log('[TTS] Qwen API status:', apiResp.status)
        const data = JSON.parse(rawData)

        if (data.output?.audio?.url) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ audioUrl: data.output.audio.url }))
        } else if (apiResp.status !== 200 || data.code) {
          console.error('[TTS] Qwen API error:', JSON.stringify(data, null, 2))
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'TTS API error', detail: data }))
        } else {
          console.error('[TTS] Unexpected response:', JSON.stringify(data, null, 2))
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Unexpected response', detail: data }))
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    })
  }
}

/**
 * Start the TTS proxy server on the given port.
 * @param {number} port
 * @param {Object} [opts]
 * @param {string} [opts.logPrefix='TTS'] - Log prefix for console output
 * @returns {http.Server}
 */
function startTTSServer(port, opts = {}) {
  const prefix = opts.logPrefix || 'TTS'
  const server = http.createServer(createTTSHandler())

  server.listen(port, () => {
    console.log(`[${prefix}] TTS proxy running at http://localhost:${port}`)
  })

  server.on('error', (err) => {
    console.error(`[${prefix}] TTS server error:`, err.message)
  })

  return server
}

module.exports = { createTTSHandler, startTTSServer }
