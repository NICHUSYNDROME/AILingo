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

Question types include:
- choice: Multiple choice (4 options, single correct answer)
- fill: Fill in the blank
- spelling: Spelling (show a kanji word, user types its hiragana reading)
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

For choice type: provide exactly 4 options in the options array. Questions and options should be in Japanese.
For fill type: use _____ to indicate the blank. Include a hint in CHINESE (not Japanese) in parentheses, indicating the required word type, meaning, or reading. Example: '毎日日本語を_____。 (中文提示：学习)' -> answer: '勉強します'
For spelling type in Japanese: Show a kanji word and ask the user to type its correct reading in hiragana. The question should contain the kanji word and optionally the English/Chinese meaning. The answer should be in hiragana only. Example: question: '食べる (to eat)', answer: 'たべる'. Never ask the user to write kanji from hiragana.

日本語のスペリング問題では、必ず漢字を見せて、読み方（ひらがな）を答えさせる形式にしてください。漢字を書かせる問題は出さないでください。
For correction type: show the incorrect sentence in the question field, and the corrected version in the answer field. Do NOT include options. In the question field, add a prompt in CHINESE describing what needs to be corrected. Example: question: '進捗はいいです。 (请使用更自然的日文表达)', answer: '進捗は順調です。'

Distribute question types evenly: roughly 25% choice, 25% fill, 25% spelling, 25% correction. Adjust based on knowledge point types.`
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
    return `You are a Japanese quiz reviewer. Review the user's answers to subjective questions (fill-in-the-blank and error correction).

For each subjective question, determine if the answer is correct or incorrect, and provide a brief explanation in Japanese.

Return ONLY valid JSON, no other text. Use double quotes only.

JSON format:
{
  "reviews": [
    {
      "questionIndex": 0,
      "correct": true or false,
      "explanation": "Brief explanation in Japanese"
    }
  ]
}

Only include questions of type 'fill' or 'correction' in the reviews array.
For 'fill' type: consider the answer correct if the key word/phrase matches, ignoring minor spacing or script differences (hiragana/katakana/kanji).
For 'correction' type: consider the answer correct if the user's correction fixes the error in the sentence.`
  }

  return `You are an English quiz reviewer. Review the user's answers to subjective questions (fill-in-the-blank and error correction).

For each subjective question, determine if the answer is correct or incorrect, and provide a brief explanation.

Return ONLY valid JSON, no other text. Use double quotes only.

JSON format:
{
  "reviews": [
    {
      "questionIndex": 0,
      "correct": true or false,
      "explanation": "Brief explanation in English"
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
        setError(t('quizNoPointsDue'))
        setLoading(false)
        return
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
              content: `Generate a quiz for these knowledge points (max 10 questions):\n${JSON.stringify(pointsForPrompt, null, 2)}`,
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
        if (q.type === 'choice') {
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
          // fill or correction — send to AI for review
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
            {questions.map((q, idx) => {
              const review = reviewData.reviews[idx]
              const isCorrect = review ? review.correct : false
              const userAnswer = answers[idx] || ''

              return (
                <div
                  key={idx}
                  className={`quiz-review-item ${isCorrect ? 'quiz-review-correct' : 'quiz-review-wrong'}`}
                >
                  <div className="quiz-review-q-header">
                    <span className="quiz-review-status">
                      {isCorrect ? '✓' : '✗'}
                    </span>
                    <span className="quiz-review-q-type">
                      {getTypeLabel(q.type, t)}
                    </span>
                    <span className="quiz-review-q-number">Q{idx + 1}</span>
                  </div>

                  <div className="quiz-review-question">{q.question}</div>

                  {q.type === 'choice' && q.options && (
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
                    <span className={`quiz-review-answer-value ${isCorrect ? 'text-correct' : 'text-wrong'}`}>
                      {userAnswer || t('quizNoAnswer')}
                    </span>
                  </div>

                  {!isCorrect && (
                    <div className="quiz-review-answer-row">
                      <span className="quiz-review-answer-label">{t('quizCorrectAnswer')}</span>
                      <span className="quiz-review-answer-value text-correct">
                        {q.answer}
                      </span>
                    </div>
                  )}

                  {review && review.explanation && (
                    <div className="quiz-review-explanation">
                      {review.explanation}
                    </div>
                  )}
                </div>
              )
            })}
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
                {extractFillHint(q.question) && (
                  <div className="quiz-q-hint">
                    💡 {extractFillHint(q.question)}
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
