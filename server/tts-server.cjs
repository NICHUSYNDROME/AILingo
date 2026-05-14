/**
 * TTS Proxy Server
 *
 * Lightweight Node.js backend that proxies TTS requests to Qwen DashScope API.
 * API key is passed from the frontend per-request — never stored server-side.
 *
 * This server runs as a persistent service and is started/stopped by the
 * Electron main process. It does not use heartbeat-based auto-shutdown.
 */

const http = require('http')

const PORT = process.env.PORT || 3001

const server = http.createServer((req, res) => {
  // CORS — allow frontend cross-origin access
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/tts') {
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

        // Debug: log request (masked API key)
        console.log('Sending to Qwen:', {
          model: 'qwen3-tts-instruct-flash',
          text: text.substring(0, 30),
          voice,
          languageType,
          apiKeyPrefix: apiKey.substring(0, 8) + '...',
        })

        // Call Qwen TTS API (DashScope)
        const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'qwen3-tts-instruct-flash',
            input: {
              text: text,
              voice: voice || 'Kai',
              language_type: languageType || 'Japanese',
              speed: 1.0,
              volume: 1.0,
            },
            instructions: '语速偏慢，语气沉稳冷静，像纪录片旁白一样平稳地朗读。',
            optimize_instructions: true,
          }),
        })

        // Debug: log raw response
        console.log('Qwen API response status:', response.status)
        const rawData = await response.text()
        console.log('Qwen API raw response:', rawData)
        const data = JSON.parse(rawData)

        if (data.output?.audio?.url) {
          // Success — Qwen returns audio URL in output.audio.url (no outer status_code)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ audioUrl: data.output.audio.url }))
        } else if (response.status !== 200 || data.code) {
          // API returned an error
          console.error('Qwen API error response:', JSON.stringify(data, null, 2))
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'TTS API error', detail: data }))
        } else {
          // Unexpected response shape
          console.error('Qwen API unexpected response:', JSON.stringify(data, null, 2))
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Unexpected response', detail: data }))
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, () => {
  console.log(`TTS proxy server running at http://localhost:${PORT}`)
})

