/**
 * TTS Proxy Server — standalone entry point (browser dev mode).
 *
 * Uses shared tts-proxy.cjs module for the actual handler logic.
 * API key is passed from the frontend per-request — never stored server-side.
 */

const { startTTSServer } = require('./tts-proxy.cjs')

const PORT = process.env.PORT || 3001

startTTSServer(PORT, { logPrefix: 'TTS' })

