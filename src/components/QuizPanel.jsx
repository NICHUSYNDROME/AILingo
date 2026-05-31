import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getItem, removeItem } from '../utils/storage'
import { debug } from '../utils/debug'
import { API_URL } from '../api/client'
import { calculateNextReview } from '../utils/sm2'
import { logActivity } from '../utils/learningLog'
import { getLocalDateString } from '../utils/date'

/**
 * Extract the option letter (A, B, C, D) from an answer string.
 * Supports formats like "B. text", "B) text", "B text", or just "B".
 * Falls back to the trimmed input if no letter pattern is found.
 */
function extractOptionLetter(answer) {
  if (!answer) return ''
  const trimmed = answer.trim()
  const match = trimmed.match(/^([A-Da-d])[.)\s]/)
  if (match) return match[1].toUpperCase()
  // If the answer is just a single letter like "B"
  if (/^[A-Da-d]$/.test(trimmed)) return trimmed.toUpperCase()
  return trimmed
}

function getQuizSystemPrompt(language) {
  if (language === 'ja') {
    return `You are a Japanese quiz generator. Based on the provided knowledge point list, generate a mixed-type quiz.

Question types:
- fill: Fill in the blank (sentence with _____, user types the missing word/phrase)
- correction: Error correction (show a sentence with an error, user provides the corrected version)
- spelling: Reading quiz (漢字の読み方) — ONLY for knowledge points whose type is "word" (単語) AND the word contains at least one KANJI character (漢字). The question shows the kanji word, user types its hiragana reading.
- joshi: Particle quiz — test the user's knowledge of Japanese particles (助詞: は/が/を/に/で/と/へ/から/まで/より/の/も/か/や/し/ね/よ etc.)

CRITICAL spelling rules:
- ONLY generate spelling for knowledge points where type="word" AND the word contains 漢字.
- NEVER generate spelling for: phrases (type="phrase"), grammar (type="grammar"), particles (type="joshi"), keigo (type="keigo"), conjugations (type="katsuyou").
- NEVER generate spelling for pure katakana words like ポーター, レストラン, チェックイン.
- NEVER generate spelling for pure hiragana words like ありがとう, ください.
- If a word has BOTH kanji and kana (e.g., 食べる, 大盛り, 朝食), spelling IS allowed.
- Never ask the user to write kanji — always show kanji and test the hiragana reading.

Rules:
- Generate 1 question per knowledge point from the provided list.
- Minimum 8 questions, maximum 10 questions.
- If there are fewer than 8 knowledge points, you MUST generate supplementary questions (especially joshi and fill types using common JLPT N5-N4 grammar) to reach at least 8 questions.
- For supplementary questions (not tied to a knowledge point), set "knowledgePointId" to an empty string "".
- Return ONLY valid JSON, no other text.
- Use double quotes only.

JSON format:
{
  "questions": [
    {
      "type": "fill" | "correction" | "spelling" | "joshi" | "choice",
      "joshiType": "fill" | "choice",
      "question": "Question text (JAPANESE ONLY, no Chinese in this field)",
      "hint": "Chinese hint explaining meaning/context (中文提示)",
      "options": ["A. option1", "B. option2", "C. option3", "D. option4"],
      "answer": "Correct answer",
      "knowledgePointId": "the id string of the knowledge point, or empty string for supplementary questions"
    }
  ]
}

IMPORTANT about "question" and "hint" fields:
- The "question" field MUST contain ONLY Japanese text. Do NOT put Chinese hints, parenthetical explanations, or English in the question field.
- Put ALL Chinese hints/meanings/explanations in the separate "hint" field instead.
- For spelling type, the hint should be the Chinese meaning of the word (e.g., "早餐", "大份").
- For fill and joshi types, the hint should explain what the sentence means in Chinese, so the user understands the context.

For fill type: use _____ to indicate the blank. question='毎日日本語を_____。', hint='学习', answer='勉強します'

For correction type: show the incorrect sentence in the question field, and the corrected version in the answer field. Do NOT include options. The correction instruction goes in the hint field. Example: question='進捗はいいです。', hint='请使用更自然的日文表达', answer='進捗は順調です。'

For spelling type: question is just the kanji word (no extra text), hint is the Chinese meaning. Example: question='食べる', hint='吃', answer='たべる'

For joshi type: you MUST set the "joshiType" field.
  - joshiType "fill": question='私_____学生です。', hint='我是学生', answer='は'
  - joshiType "choice": question='電車_____学校に行きます。', hint='坐电车去学校', options=["A. は", "B. で", "C. を", "D. が"], answer="B. で"

Distribute question types: roughly 20% fill, 20% correction, 20% spelling (kanji words only), 20% joshi, 20% choice. 
- choice type: suitable for grammar-related knowledge points (grammar, joshi, keigo, katsuyou) — create 4-option multiple choice questions testing the correct usage.
- Adjust based on available knowledge point types. If there aren't enough eligible kanji words for spelling, increase joshi, choice and fill proportions instead — NEVER force a spelling question on a non-kanji word.`
  }

  return `You are an English quiz generator. Based on the provided knowledge point list, generate a mixed-type quiz.

Question types include:
- choice: Multiple choice (4 options, single correct answer)
- fill: Fill in the blank
- spelling: Spelling (provide phonetic transcription and English definition, user types the word)
- correction: Error correction (show a sentence with an error, user provides the corrected version)

Rules:
- Generate 1 question per knowledge point.
- Maximum 10 questions total.
- If there are fewer than 10 knowledge points, generate questions for all of them.
- Return ONLY valid JSON, no other text.
- Use double quotes only.

JSON format:
{
  "questions": [
    {
      "type": "choice" | "fill" | "spelling" | "correction",
      "question": "Question text",
      "options": ["A. option1", "B. option2", "C. option3", "D. option4"],
      "answer": "Correct answer",
      "knowledgePointId": "the id string of the knowledge point"
    }
  ]
}

For choice type: provide exactly 4 options in the options array.
For fill type: use _____ to indicate the blank. Include a hint in parentheses after the sentence, indicating what kind of word is expected (e.g., a verb, a noun, or the Chinese meaning to express). Example: 'I usually _____ at 7 PM after work. (动词，表达"散步")'
For spelling type: Provide phonetic transcription (音标) and English definition. The user must type the correct English word. The question field should contain the phonetic symbol and definition. Example: question: '/ˈrestərɒnt/ — a place where people pay to sit and eat meals', answer: 'restaurant'
For correction type: show the incorrect sentence in the question field, and the corrected version in the answer field. Do NOT include options.

Distribute question types evenly: roughly 25% choice, 25% fill, 25% spelling, 25% correction. Adjust based on knowledge point types (e.g., word type is good for spelling, grammar type is good for correction).`
}

function getReviewSystemPrompt(language) {
  if (language === 'ja') {
    return `You are a Japanese quiz reviewer. Review the user's answers to subjective questions (fill-in-the-blank, error correction, and joshi-fill).

For each subjective question, determine if the answer is correct or incorrect, and provide a brief explanation in Japanese.

IMPORTANT — Use second-person pronouns (あなた/あなたの) in the explanation to address the user directly. For example: 「あなたの回答は正解です」or「あなたの回答は不正解です。正しい助詞は「は」です。」

Return ONLY valid JSON, no other text. Use double quotes only.

JSON format:
{
  "reviews": [
    {
      "questionIndex": 0,
      "correct": true or false,
      "explanation": "Brief explanation in Japanese (use あなた/あなたの)"
    }
  ]
}

Only include questions of type 'fill', 'correction', or 'joshi' (where joshiType is 'fill') in the reviews array.
For 'fill' type: consider the answer correct if the key word/phrase matches, ignoring minor spacing or script differences (hiragana/katakana/kanji).
For 'correction' type: consider the answer correct if the user's correction fixes the error in the sentence.
For 'joshi' type with joshiType 'fill': the answer is a single particle. Consider it correct if the particle matches exactly. Be lenient with particle variants (e.g., には vs は when context allows).`
  }

  return `You are an English quiz reviewer. Review the user's answers to subjective questions (fill-in-the-blank and error correction).

For each subjective question, determine if the answer is correct or incorrect, and provide a brief explanation.

IMPORTANT — Address the user directly with second-person pronouns (you/your) in the explanation. For example: "Your answer is correct" or "You missed the verb tense here."

Return ONLY valid JSON, no other text. Use double quotes only.

JSON format:
{
  "reviews": [
    {
      "questionIndex": 0,
      "correct": true or false,
      "explanation": "Brief explanation in English (use you/your)"
    }
  ]
}

Only include questions of type 'fill' or 'correction' in the reviews array.
For 'fill' type: consider the answer correct if the key word/phrase matches, ignoring minor spacing or capitalization differences.
For 'correction' type: consider the answer correct if the user's correction fixes the error in the sentence.`
}

/**
 * Sort confirmed knowledge points by review urgency.
 * Priority:
 *   1. nextReview is null (never reviewed)
 *   2. nextReview <= today (overdue)
 *   3. nextReview closest to today (upcoming)
 *   4. nextReview farthest away
 * Tie-breaker: createdAt ascending (first created, first reviewed)
 */
function sortByReviewUrgency(points) {
  const todayStr = getLocalDateString()

  return [...points].sort((a, b) => {
    const aNull = !a.nextReview
    const bNull = !b.nextReview

    // Priority 1: null nextReview first
    if (aNull && !bNull) return -1
    if (!aNull && bNull) return 1

    // Both have nextReview
    if (!aNull && !bNull) {
      const aOverdue = a.nextReview <= todayStr
      const bOverdue = b.nextReview <= todayStr

      // Priority 2: overdue items first
      if (aOverdue && !bOverdue) return -1
      if (!aOverdue && bOverdue) return 1

      // Priority 3 & 4: sort by nextReview ascending (closest deadline first)
      if (a.nextReview !== b.nextReview) {
        return a.nextReview.localeCompare(b.nextReview)
      }
    }

    // Tie-breaker: createdAt ascending
    return new Date(a.createdAt) - new Date(b.createdAt)
  })
}

/**
 * Get the display label for a question type.
 */
function getTypeLabel(type, t) {
  switch (type) {
    case 'choice':
      return t('quizMultipleChoice')
    case 'fill':
      return t('quizFillBlank')
    case 'spelling':
      return t('quizSpelling')
    case 'correction':
      return t('quizErrorCorrection')
    case 'joshi':
      return t('quizJoshi')
    default:
      return type
  }
}

/**
 * Extract the hint part from a fill-in-the-blank question.
 * The hint is the text in parentheses at the end.
 */
function extractFillHint(question) {
  if (!question) return null
  // Match text in parentheses at the end of the question
  const match = question.match(/\(([^)]+)\)\s*$/)
  return match ? match[1] : null
}

function QuizPanel({ knowledgePoints, getPointById, updatePointReview, onBackToHome, language = 'en' }) {
  const { t } = useTranslation()
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewData, setReviewData] = useState(null) // { correctCount, totalCount, reviews: [] }
  const [submitting, setSubmitting] = useState(false)
  const [showBackConfirm, setShowBackConfirm] = useState(false)
  const quizGeneratedRef = useRef(false)

  // Get confirmed knowledge points that are due for review (nextReview <= today or null), max 10
  const quizPoints = useMemo(() => {
    const todayStr = getLocalDateString()

    const confirmed = knowledgePoints.filter(
      (p) => p.confirmed === true && p.status !== 'deleted'
    )

    // Only include points due for review
    const dueForReview = confirmed.filter((p) => {
      if (!p.nextReview) return true // null = never reviewed
      return p.nextReview <= todayStr
    })

    const sorted = sortByReviewUrgency(dueForReview)
    return sorted.slice(0, 10)
  }, [knowledgePoints])

  // Generate quiz on mount
  useEffect(() => {
    if (quizGeneratedRef.current) return
    quizGeneratedRef.current = true
    generateQuiz()
  }, [])

  const generateQuiz = async () => {
    setLoading(true)
    setError(null)

    try {
      const apiKey = await getItem('deepseek_api_key')
      if (!apiKey) {
        setError(t('quizApiKeyMissing'))
        setLoading(false)
        return
      }

      if (quizPoints.length === 0) {
        // For Japanese, allow generating supplementary questions even without due knowledge points
        if (language === 'ja') {
          setError(null)
          // fall through to generate supplementary-only quiz
        } else {
          setError(t('quizNoPointsDue'))
          setLoading(false)
          return
        }
      }

      // Build knowledge point list for the prompt
      const pointsForPrompt = quizPoints.map((p) => ({
        id: p.id,
        word: p.word,
        type: p.type,
        meaning: p.meaning,
        nextReview: p.nextReview,
      }))

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: getQuizSystemPrompt(language) },
            {
              role: 'user',
              content: language === 'ja'
                ? `Generate a Japanese quiz (min 8, max 10 questions). Language: Japanese.\nKnowledge points for reference:\n${JSON.stringify(pointsForPrompt, null, 2)}\n\n${quizPoints.length < 8 ? 'Since there are fewer than 8 knowledge points, please generate supplementary questions (especially joshi and common JLPT N5-N4 grammar fill questions) to reach at least 8 total questions. For supplementary questions, set knowledgePointId to "".' : ''}`
                : `Generate a quiz for these knowledge points (max 10 questions):\n${JSON.stringify(pointsForPrompt, null, 2)}`,
            },
          ],
          stream: false,
          temperature: 0.7,
          max_tokens: 4000,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          await removeItem('deepseek_api_key')
          setError(t('quizApiKeyInvalid'))
        } else {
          setError(`${t('quizGenFailed')} (${response.status}).`)
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      const aiResponse = data.choices[0].message.content

      // Parse JSON
      let jsonStr = aiResponse.trim()
      const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim()
      }
      const parsed = JSON.parse(jsonStr)

      if (parsed.questions && Array.isArray(parsed.questions)) {
        setQuestions(parsed.questions)
      } else {
        setError(t('quizParseFailed'))
      }
    } catch (e) {
      debug.error('Quiz generation error:', e)
      setError(t('quizGenError'))
    }
    setLoading(false)
  }

  const handleAnswer = useCallback((questionIndex, answer) => {
    setAnswers((prev) => ({ ...prev, [questionIndex]: answer }))
  }, [])

  const handleBackClick = useCallback(() => {
    if (Object.keys(answers).length > 0) {
      setShowBackConfirm(true)
    } else {
      onBackToHome()
    }
  }, [answers, onBackToHome])

  const handleConfirmBack = useCallback(() => {
    setShowBackConfirm(false)
    onBackToHome()
  }, [onBackToHome])

  const handleCancelBack = useCallback(() => {
    setShowBackConfirm(false)
  }, [])

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)

    try {
      // Grade multiple-choice and spelling questions locally
      const reviews = []
      let correctCount = 0

      // Collect subjective questions for AI review
      const subjectiveQuestions = []

      questions.forEach((q, idx) => {
        const userAnswer = answers[idx] || ''
        if (q.type === 'choice' || (q.type === 'joshi' && q.joshiType === 'choice')) {
          const isCorrect = extractOptionLetter(userAnswer) === extractOptionLetter(q.answer)
          if (isCorrect) correctCount++
          const correctLetter = extractOptionLetter(q.answer)
          reviews.push({
            questionIndex: idx,
            correct: isCorrect,
            explanation: isCorrect
              ? t('quizCorrectExclaim')
              : `${t('quizCorrectAnswer')}${correctLetter}`,
          })
        } else if (q.type === 'spelling') {
          // Spelling: local comparison (case-insensitive, trimmed)
          const isCorrect = userAnswer.toLowerCase().trim() === q.answer.toLowerCase().trim()
          if (isCorrect) correctCount++
          reviews.push({
            questionIndex: idx,
            correct: isCorrect,
            explanation: isCorrect
              ? t('quizCorrectExclaim')
              : `${t('quizCorrectAnswer')}${q.answer}`,
          })
        } else {
          // fill, correction, or joshi-fill — send to AI for review
          subjectiveQuestions.push({ index: idx, question: q, userAnswer })
        }
      })

      // If there are subjective questions, ask AI to review
      if (subjectiveQuestions.length > 0) {
        const apiKey = await getItem('deepseek_api_key')
        if (apiKey) {
          try {
            const response = await fetch(API_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                  { role: 'system', content: getReviewSystemPrompt(language) },
                  {
                    role: 'user',
                    content: `Review these answers:\n${JSON.stringify(subjectiveQuestions, null, 2)}`,
                  },
                ],
                stream: false,
                temperature: 0.3,
                max_tokens: 2000,
              }),
            })

            if (response.ok) {
              const data = await response.json()
              const aiResponse = data.choices[0].message.content
              let jsonStr = aiResponse.trim()
              const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/)
              if (jsonMatch) {
                jsonStr = jsonMatch[1].trim()
              }
              const parsed = JSON.parse(jsonStr)

              if (parsed.reviews && Array.isArray(parsed.reviews)) {
                parsed.reviews.forEach((r) => {
                  // Find existing review entry or add new
                  const existing = reviews.find((rev) => rev.questionIndex === r.questionIndex)
                  if (existing) {
                    existing.correct = r.correct
                    existing.explanation = r.explanation
                  } else {
                    reviews.push({
                      questionIndex: r.questionIndex,
                      correct: r.correct,
                      explanation: r.explanation,
                    })
                  }
                  if (r.correct) correctCount++
                })
              }
            }
          } catch {
            // If AI review fails, mark subjective questions as needing manual check
            subjectiveQuestions.forEach((sq) => {
              const existing = reviews.find((r) => r.questionIndex === sq.index)
              if (!existing) {
                reviews.push({
                  questionIndex: sq.index,
                  correct: false,
                  explanation: t('quizManualCheck'),
                })
              }
            })
          }
        } else {
          // No API key — mark all subjective as needing manual check
          subjectiveQuestions.forEach((sq) => {
            reviews.push({
              questionIndex: sq.index,
              correct: false,
              explanation: t('quizNoApiKey'),
            })
          })
        }
      }

      // Sort reviews by questionIndex
      reviews.sort((a, b) => a.questionIndex - b.questionIndex)

      setReviewData({
        correctCount,
        totalCount: questions.length,
        reviews,
      })
      setReviewMode(true)

      // Update knowledge points based on quiz results
      questions.forEach((q, idx) => {
        const review = reviews.find((r) => r.questionIndex === idx)
        const isCorrect = review ? review.correct : false
        const quality = isCorrect ? 3 : 1

        const point = getPointById(q.knowledgePointId)
        if (point) {
          const currentData = {
            easeFactor: point.easeFactor || 2.5,
            interval: point.interval || 0,
            repetitions: point.repetitions || 0,
          }
          const updated = calculateNextReview(quality, currentData)
          updatePointReview(q.knowledgePointId, updated)
        }
      })

      // Log quiz activity
      logActivity('quiz', questions.length, language)
    } catch (e) {
      debug.error('Quiz submission error:', e)
    }
    setSubmitting(false)
  }, [questions, answers, getPointById, updatePointReview])

  const allAnswered = questions.length > 0 && questions.every((_, idx) => answers[idx] && answers[idx].trim() !== '')

  // Loading state
  if (loading) {
    return (
      <div className="quiz-panel">
        <div className="quiz-loading">
          <div className="quiz-loading-spinner" />
          <p className="quiz-loading-text">{t('quizGenerating')}</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="quiz-panel">
        <div className="quiz-error">
          <p className="quiz-error-text">{error}</p>
          <button className="quiz-back-btn" onClick={onBackToHome}>
            {t('quizBackToHome')}
          </button>
        </div>
      </div>
    )
  }

  // No questions
  if (questions.length === 0) {
    return (
      <div className="quiz-panel">
        <div className="quiz-error">
          <p className="quiz-error-text">{t('quizNoQuestions')}</p>
          <button className="quiz-back-btn" onClick={onBackToHome}>
            {t('quizBackToHome')}
          </button>
        </div>
      </div>
    )
  }

  // Review mode
  if (reviewMode && reviewData) {
    return (
      <div className="quiz-panel">
        <div className="quiz-review">
          <div className="quiz-review-header">
            <h2 className="quiz-review-title">{t('quizResults')}</h2>
            <div className="quiz-score">
              <span className="quiz-score-value">
                {reviewData.correctCount}/{reviewData.totalCount}
              </span>
              <span className="quiz-score-label">{t('quizCorrect')}</span>
            </div>
          </div>

          <div className="quiz-review-questions">
            {/* Wrong answers — shown directly */}
            {questions.map((q, idx) => {
              const review = reviewData.reviews[idx]
              const isCorrect = review ? review.correct : false
              if (isCorrect) return null
              const userAnswer = answers[idx] || ''

              return (
                <div
                  key={idx}
                  className="quiz-review-item quiz-review-wrong"
                >
                  <div className="quiz-review-q-header">
                    <span className="quiz-review-status">✗</span>
                    <span className="quiz-review-q-type">
                      {getTypeLabel(q.type, t)}
                    </span>
                    <span className="quiz-review-q-number">Q{idx + 1}</span>
                  </div>

                  <div className="quiz-review-question">{q.question}</div>

                  {q.hint && (
                    <div className="quiz-q-hint" style={{ marginBottom: 8 }}>
                      💡 {q.hint}
                    </div>
                  )}

                  {(q.type === 'choice' || (q.type === 'joshi' && q.joshiType === 'choice')) && q.options && (
                    <div className="quiz-review-options">
                      {q.options.map((opt, oi) => {
                        const optLetter = extractOptionLetter(opt)
                        const correctLetter = extractOptionLetter(q.answer)
                        const userLetter = extractOptionLetter(userAnswer)
                        const isOptCorrect = optLetter === correctLetter
                        const isOptWrong = optLetter === userLetter && userLetter !== correctLetter
                        return (
                          <div
                            key={oi}
                            className={`quiz-review-option ${
                              isOptCorrect
                                ? 'quiz-review-opt-correct'
                                : isOptWrong
                                  ? 'quiz-review-opt-wrong'
                                  : ''
                            }`}
                          >
                            {opt}
                            {isOptCorrect && (
                              <span className="quiz-review-opt-mark">✓</span>
                            )}
                            {isOptWrong && (
                              <span className="quiz-review-opt-mark">✗</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="quiz-review-answer-row">
                    <span className="quiz-review-answer-label">{t('quizYourAnswer')}</span>
                    <span className="quiz-review-answer-value text-wrong">
                      {userAnswer || t('quizNoAnswer')}
                    </span>
                  </div>

                  <div className="quiz-review-answer-row">
                    <span className="quiz-review-answer-label">{t('quizCorrectAnswer')}</span>
                    <span className="quiz-review-answer-value text-correct">
                      {q.answer}
                    </span>
                  </div>

                  {review && review.explanation && (
                    <div className="quiz-review-explanation">
                      {review.explanation}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Correct answers — collapsible, default closed */}
            <details className="quiz-review-correct-details">
              <summary className="quiz-review-correct-summary">
                <span className="quiz-review-correct-summary-text">
                  {t('quizCorrectCollapsed')}
                </span>
                <span className="quiz-review-correct-badge">{reviewData.correctCount}</span>
              </summary>
              {questions.map((q, idx) => {
                const review = reviewData.reviews[idx]
                const isCorrect = review ? review.correct : false
                if (!isCorrect) return null
                const userAnswer = answers[idx] || ''

                return (
                  <div
                    key={idx}
                    className="quiz-review-item quiz-review-correct"
                  >
                    <div className="quiz-review-q-header">
                      <span className="quiz-review-status">✓</span>
                      <span className="quiz-review-q-type">
                        {getTypeLabel(q.type, t)}
                      </span>
                      <span className="quiz-review-q-number">Q{idx + 1}</span>
                    </div>

                    <div className="quiz-review-question">{q.question}</div>

                    <div className="quiz-review-answer-row">
                      <span className="quiz-review-answer-label">{t('quizYourAnswer')}</span>
                      <span className="quiz-review-answer-value text-correct">
                        {userAnswer || t('quizNoAnswer')}
                      </span>
                    </div>

                    {review && review.explanation && (
                      <div className="quiz-review-explanation">
                        {review.explanation}
                      </div>
                    )}
                  </div>
                )
              })}
            </details>
          </div>

          <div className="quiz-review-footer">
            <button className="quiz-back-btn" onClick={onBackToHome}>
              {t('quizBackToHome')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Active quiz — single page scroll
  return (
    <div className="quiz-panel">
      {/* Header with Back button */}
      <div className="quiz-header">
        <div className="quiz-header-left">
          <button className="quiz-header-back-btn" onClick={handleBackClick}>
            {t('quizBack')}
          </button>
          <h2 className="quiz-title">{t('quizTitle')}</h2>
        </div>
        <span className="quiz-progress">
          {questions.length} {t('quizQuestionCount')}
        </span>
      </div>

      {/* Back confirmation dialog */}
      {showBackConfirm && (
        <div className="quiz-confirm-overlay">
          <div className="quiz-confirm-dialog">
            <p className="quiz-confirm-text">{t('quizDiscardConfirm')}</p>
            <div className="quiz-confirm-actions">
              <button className="quiz-confirm-btn quiz-confirm-cancel" onClick={handleCancelBack}>
                {t('quizCancel')}
              </button>
              <button className="quiz-confirm-btn quiz-confirm-ok" onClick={handleConfirmBack}>
                {t('quizDiscard')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scrollable question list */}
      <div className="quiz-scroll-area">
        {questions.map((q, idx) => (
          <div key={idx} className="quiz-question-card">
            <div className="quiz-q-header-row">
              <span className="quiz-q-type-badge">
                {getTypeLabel(q.type, t)}
              </span>
              <span className="quiz-q-number-label">Q{idx + 1}</span>
            </div>

            <div className="quiz-q-text">{q.question}</div>

            {/* Choice type */}
            {q.type === 'choice' && q.options && (
              <div className="quiz-q-options">
                {q.options.map((opt, oi) => (
                  <label key={oi} className="quiz-q-option-label">
                    <input
                      type="radio"
                      name={`q-${idx}`}
                      value={opt}
                      checked={answers[idx] === opt}
                      onChange={() => handleAnswer(idx, opt)}
                      className="quiz-q-radio"
                    />
                    <span className="quiz-q-option-text">{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Fill type */}
            {q.type === 'fill' && (
              <div className="quiz-q-input-area">
                <input
                  type="text"
                  className="quiz-q-input"
                  placeholder={t('quizTypePlaceholder')}
                  value={answers[idx] || ''}
                  onChange={(e) => handleAnswer(idx, e.target.value)}
                />
                {(q.hint || extractFillHint(q.question)) && (
                  <div className="quiz-q-hint">
                    💡 {q.hint || extractFillHint(q.question)}
                  </div>
                )}
              </div>
            )}

            {/* Spelling type */}
            {q.type === 'spelling' && (
              <div className="quiz-q-input-area">
                <input
                  type="text"
                  className="quiz-q-input"
                  placeholder={t('quizSpellPlaceholder')}
                  value={answers[idx] || ''}
                  onChange={(e) => handleAnswer(idx, e.target.value)}
                />
                {q.hint && (
                  <div className="quiz-q-hint">
                    💡 {q.hint}
                  </div>
                )}
              </div>
            )}

            {/* Joshi type */}
            {q.type === 'joshi' && q.joshiType === 'choice' && q.options && (
              <div className="quiz-q-options">
                {q.options.map((opt, oi) => (
                  <label key={oi} className="quiz-q-option-label">
                    <input
                      type="radio"
                      name={`q-${idx}`}
                      value={opt}
                      checked={answers[idx] === opt}
                      onChange={() => handleAnswer(idx, opt)}
                      className="quiz-q-radio"
                    />
                    <span className="quiz-q-option-text">{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {q.type === 'joshi' && q.joshiType === 'fill' && (
              <div className="quiz-q-input-area">
                <input
                  type="text"
                  className="quiz-q-input"
                  placeholder={t('quizJoshiPlaceholder')}
                  value={answers[idx] || ''}
                  onChange={(e) => handleAnswer(idx, e.target.value)}
                />
                {(q.hint || extractFillHint(q.question)) && (
                  <div className="quiz-q-hint">
                    💡 {q.hint || extractFillHint(q.question)}
                  </div>
                )}
              </div>
            )}

            {/* Joshi choice hint */}
            {q.type === 'joshi' && q.joshiType === 'choice' && q.hint && (
              <div className="quiz-q-hint" style={{ marginTop: 4 }}>
                💡 {q.hint}
              </div>
            )}

            {/* Correction type */}
            {q.type === 'correction' && (
              <div className="quiz-q-input-area">
                <p className="quiz-q-correction-hint">
                  {t('quizCorrectionHint')}
                </p>
                <textarea
                  className="quiz-q-textarea"
                  placeholder={t('quizCorrectionPlaceholder')}
                  value={answers[idx] || ''}
                  onChange={(e) => handleAnswer(idx, e.target.value)}
                  rows={3}
                />
              </div>
            )}
          </div>
        ))}

        {/* Submit button at bottom */}
        <div className="quiz-scroll-submit">
          <button
            className={`quiz-submit-btn ${allAnswered ? '' : 'disabled'}`}
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
          >
            {submitting ? t('quizSubmitting') : t('quizSubmit')}
          </button>
          {!allAnswered && (
            <p className="quiz-scroll-submit-hint">
              {t('quizAnswerAllHint')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default QuizPanel
