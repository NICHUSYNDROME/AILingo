import { describe, it, expect, vi } from 'vitest'
import { parseJSONResponse } from './client'

describe('parseJSONResponse — AI response JSON parser', () => {
  // ── Basic parsing ───────────────────────────────────────────────────
  describe('basic JSON parsing', () => {
    it('parses a plain JSON object', () => {
      expect(parseJSONResponse('{"word":"hello","type":"word"}')).toEqual({
        word: 'hello',
        type: 'word',
      })
    })

    it('parses a plain JSON array', () => {
      expect(parseJSONResponse('[1, 2, 3]')).toEqual([1, 2, 3])
    })

    it('trims whitespace', () => {
      expect(parseJSONResponse('  {"a": 1}  ')).toEqual({ a: 1 })
    })
  })

  // ── Markdown code blocks ────────────────────────────────────────────
  describe('markdown code blocks', () => {
    it('extracts JSON from ```json block', () => {
      const input = '```json\n{"word":"hello"}\n```'
      expect(parseJSONResponse(input)).toEqual({ word: 'hello' })
    })

    it('extracts JSON from plain ``` block (no lang)', () => {
      const input = '```\n{"word":"hello"}\n```'
      expect(parseJSONResponse(input)).toEqual({ word: 'hello' })
    })

    it('ignores text before/after the code block', () => {
      const input = 'Here is the result:\n```json\n{"word":"hello"}\n```\nHope this helps!'
      expect(parseJSONResponse(input)).toEqual({ word: 'hello' })
    })
  })

  // ── Nested / complex JSON ───────────────────────────────────────────
  describe('nested and complex JSON', () => {
    it('handles nested objects', () => {
      const input = '{"user":{"name":"Alice","scores":[1,2,3]}}'
      expect(parseJSONResponse(input)).toEqual({
        user: { name: 'Alice', scores: [1, 2, 3] },
      })
    })

    it('handles arrays of objects', () => {
      const input = '[{"id":1},{"id":2}]'
      expect(parseJSONResponse(input)).toEqual([{ id: 1 }, { id: 2 }])
    })
  })

  // ── Extraction from mixed text ──────────────────────────────────────
  describe('extraction from mixed text (no code block)', () => {
    it('extracts first JSON object from surrounding text', () => {
      const input = 'Some text {"result":"ok"} more text'
      expect(parseJSONResponse(input)).toEqual({ result: 'ok' })
    })

    it('extracts first JSON array from surrounding text', () => {
      const input = 'Here [1,2,3] you go'
      expect(parseJSONResponse(input)).toEqual([1, 2, 3])
    })
  })

  // ── Edge cases / invalid input ──────────────────────────────────────
  describe('edge cases and invalid input', () => {
    it('returns null for empty string', () => {
      expect(parseJSONResponse('')).toBeNull()
    })

    it('returns null for null input', () => {
      expect(parseJSONResponse(null)).toBeNull()
    })

    it('returns null for undefined input', () => {
      expect(parseJSONResponse(undefined)).toBeNull()
    })

    it('returns null for a number', () => {
      expect(parseJSONResponse(42)).toBeNull()
    })

    it('returns null for completely invalid text', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(parseJSONResponse('This is not JSON at all')).toBeNull()
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('returns null for unclosed JSON', () => {
      expect(parseJSONResponse('{"word":"hello"')).toBeNull()
    })

    it('handles string with only whitespace', () => {
      expect(parseJSONResponse('   \n  \t  ')).toBeNull()
    })
  })

  // ── Special characters ──────────────────────────────────────────────
  describe('special characters', () => {
    it('handles unicode characters', () => {
      const input = '{"word":"日本語","meaning":"日本語の説明"}'
      expect(parseJSONResponse(input)).toEqual({
        word: '日本語',
        meaning: '日本語の説明',
      })
    })

    it('handles escaped quotes in strings', () => {
      const input = '{"example":"He said \\"hello\\""}'
      expect(parseJSONResponse(input)).toEqual({
        example: 'He said "hello"',
      })
    })

    it('handles newlines in JSON values', () => {
      const input = '{"text":"line1\\nline2"}'
      expect(parseJSONResponse(input)).toEqual({ text: 'line1\nline2' })
    })
  })
})
