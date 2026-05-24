/**
 * AILingo API — barrel export
 *
 * All API functions are now organized into sub-modules under src/api/.
 * This file re-exports everything for backward compatibility.
 *
 * Modules:
 *   client.js     — HTTP client, key testing, JSON parsing
 *   prompts.js    — System prompt builders (EN / JA)
 *   chat.js       — Conversation flow, goal generation, summary, task tracking
 *   knowledge.js  — Structured knowledge point extraction
 *   correction.js — Spelling/grammar correction, hints, reply formatting (Agents 2A-2E)
 */

// Client & utilities
export {
  API_URL,
  testDeepSeekKey,
  testTTSKey,
  fetchWithTimeout,
  parseJSONResponse,
  getApiKey,
} from './api/client'

// Prompts
export { buildSystemPrompt } from './api/prompts'

// Chat
export {
  sendToAI,
  parseAIReply,
  generateConversationGoal,
  generateSummary,
  checkTaskCompletion,
} from './api/chat'

// Knowledge extraction
export { extractSpecificKnowledge } from './api/knowledge'

// Correction agents (2A - 2E)
export {
  correctUserMessage,
  analyzeGrammar,
  generateHints,
  extractCorrectionsFromReply,
  summarizeTipsAndExtractKnowledge,
} from './api/correction'
