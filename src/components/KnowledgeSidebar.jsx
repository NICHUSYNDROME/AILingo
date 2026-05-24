import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react'
import { useTranslation } from 'react-i18next'
import './KnowledgeSidebar.css'
import { TYPE_CONFIG, JA_TYPE_CONFIG, ALPHABETS, getJaSortKey } from '../config/languages'
import LookUpPanel from './LookUpPanel'

const KnowledgeSidebar = memo(function KnowledgeSidebar({
  knowledgePoints,
  onDelete,
  onConfirmPoint,
  onSelectPoint,
  selectedPointId,
  language = 'en',
  isNarrow,
  getPointById,
}) {
  const { t } = useTranslation()
  const typeConfigMap = language === 'ja' ? JA_TYPE_CONFIG : TYPE_CONFIG
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMethod, setSortMethod] = useState('recent')
  const [sortReversed, setSortReversed] = useState(false)
  const [newPointIds, setNewPointIds] = useState(new Set())
  const [expandedPointId, setExpandedPointId] = useState(null)  // narrow-mode inline detail
  const [expandedChinese, setExpandedChinese] = useState(false)
  const listRef = useRef(null)
  const prevCountRef = useRef(knowledgePoints.length)
  // Build alphabet index map for the current language（英语用，区分大小写）
  const alphaIndex = useMemo(() => {
    const alphabet = ALPHABETS[language] || ALPHABETS.en
    const map = {}
    for (let i = 0; i < alphabet.length; i++) {
      map[alphabet[i]] = i
    }
    return map
  }, [language])

  // Compare two points alphabetically
  const alphaCompare = useCallback((a, b) => {
    if (language === 'ja') {
      // 日语按假名读音排序（用 phonetic，无则用 word）
      const aText = a.phonetic || a.word
      const bText = b.phonetic || b.word
      const aKey = getJaSortKey(aText)
      const bKey = getJaSortKey(bText)
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0
    }
    // 英语：区分大小写，大写在前
    const aCh = a.word[0] ?? ''
    const bCh = b.word[0] ?? ''
    const aIdx = alphaIndex[aCh] ?? Infinity
    const bIdx = alphaIndex[bCh] ?? Infinity
    if (aIdx !== bIdx) return aIdx - bIdx
    return a.word.localeCompare(b.word)
  }, [language, alphaIndex])
  // Detect new points added and scroll to top (new points are inserted at the front)
  useEffect(() => {
    const currentCount = knowledgePoints.length
    if (currentCount > prevCountRef.current) {
      // New points were added — mark them as "new"
      const addedIds = new Set(newPointIds)
      for (let i = prevCountRef.current; i < currentCount; i++) {
        addedIds.add(knowledgePoints[i].id)
      }
      setNewPointIds(addedIds)

      // Scroll to top — new points are inserted at the front of the array
      if (listRef.current) {
        listRef.current.scrollTo({ top: 0, behavior: 'smooth' })
      }

      // Clear "new" status after 2 seconds
      setTimeout(() => {
        setNewPointIds(new Set())
      }, 2000)
    }
    prevCountRef.current = currentCount
  }, [knowledgePoints])

  // Scroll to the selected point when selectedPointId changes (e.g. from dict search)
  useEffect(() => {
    if (selectedPointId && listRef.current) {
      const el = listRef.current.querySelector(`[data-point-id="${selectedPointId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [selectedPointId])

  // Filter and sort knowledge points
  const displayPoints = useMemo(() => {
    let filtered = knowledgePoints.filter((p) => p.status !== 'deleted')

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.word.toLowerCase().includes(q) ||
          p.meaning.toLowerCase().includes(q) ||
          p.context.toLowerCase().includes(q)
      )
    }

    // Sort: unconfirmed first, then by creation date descending
    const sorted = [...filtered]
    switch (sortMethod) {
      case 'alphabet':
        sorted.sort(alphaCompare)
        break
      case 'difficulty':
        sorted.sort((a, b) => a.easeFactor - b.easeFactor)
        break
      case 'recent':
        sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        break
      case 'mastery':
        sorted.sort((a, b) => {
          if (!a.confirmed && b.confirmed) return -1
          if (a.confirmed && !b.confirmed) return 1
          return 0
        })
        break
      default:
        break
    }
    if (sortReversed) sorted.reverse()

    return sorted
  }, [knowledgePoints, searchQuery, sortMethod, sortReversed, alphaCompare])

  const handleSortClick = useCallback((method) => {
    if (sortMethod === method) {
      setSortReversed(prev => !prev)
    } else {
      setSortMethod(method)
      setSortReversed(false)
    }
  }, [sortMethod])

  const handleDeleteClick = useCallback(
    (e, point) => {
      e.stopPropagation()
      onDelete(point)
    },
    [onDelete]
  )

  const handleKeepClick = useCallback(
    (e, id) => {
      e.stopPropagation()
      onConfirmPoint(id)
    },
    [onConfirmPoint]
  )

  const handleSelectPoint = useCallback(
    (id) => {
      if (isNarrow) {
        // Toggle inline detail expansion
        setExpandedPointId((prev) => (prev === id ? null : id))
        setExpandedChinese(false)
      } else {
        onSelectPoint(id)
      }
    },
    [onSelectPoint, isNarrow]
  )

  const handleCloseInlineDetail = useCallback((e) => {
    e.stopPropagation()
    setExpandedPointId(null)
  }, [])

  const sortButtons = [
    { key: 'alphabet', label: t('sortAlphabet') },
    { key: 'difficulty', label: t('sortDifficulty') },
    { key: 'recent', label: t('sortRecent') },
    { key: 'mastery', label: t('sortMastery') },
  ]

  return (
    <div className="kp-sidebar">
      <h3 className="kp-sidebar-title">{t('knowledgePoints')}</h3>

      {/* Search bar */}
      <div className="kp-search-bar">
        <input
          className="kp-search-input"
          type="text"
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Sort buttons */}
      <div className="kp-sort-bar">
        {sortButtons.map((btn) => (
          <button
            key={btn.key}
            className={`kp-sort-btn ${sortMethod === btn.key ? 'active' : ''}`}
            onClick={() => handleSortClick(btn.key)}
          >
            {btn.label}{sortMethod === btn.key ? (sortReversed ? ' ▼' : ' ▲') : ''}
          </button>
        ))}
      </div>

      {/* Knowledge points list */}
      <div className="kp-list" ref={listRef}>
        {displayPoints.length === 0 ? (
          <p className="kp-empty">
            {searchQuery.trim()
              ? t('noMatchingPoints')
              : t('noPoints')}
          </p>
        ) : (
          displayPoints.map((point) => {
            const typeCfg = typeConfigMap[point.type] || typeConfigMap.word
            const isConfirmed = point.confirmed === true
            const isNew = newPointIds.has(point.id)

            return (
              <div
                key={point.id}
                data-point-id={point.id}
                className={`kp-item ${isConfirmed ? 'kp-confirmed' : 'kp-unconfirmed'} ${
                  selectedPointId === point.id ? 'kp-selected' : ''
                } ${isNew ? 'kp-new-item' : ''}`}
                onClick={() => handleSelectPoint(point.id)}
              >
                <div className="kp-item-main">
                  {/* Status dot */}
                  <span
                    className={`kp-status-dot ${isConfirmed ? 'kp-dot-confirmed' : 'kp-dot-unconfirmed'}`}
                    title={isConfirmed ? t('confirmed') : t('pendingConfirmation')}
                  />

                  {/* Type tag */}
                  <span
                    className="kp-type-tag"
                    style={{
                      color: typeCfg.color,
                      backgroundColor: typeCfg.bg,
                    }}
                  >
                    {typeCfg.label}
                  </span>

                  {/* Word + English meaning preview (50 chars max) */}
                  <div className="kp-item-text">
                    <span className="kp-item-word">{point.word}</span>
                    {(point.type === 'word' || (point.type === 'phrase' && point.phonetic)) && (
                      <span className="kp-item-phonetic">{point.phonetic}</span>
                    )}
                    <span className="kp-item-meaning">
                      {point.meaning
                        ? (point.meaning.length > 50
                          ? point.meaning.slice(0, 50) + '...'
                          : point.meaning)
                        : (point.type === 'grammar'
                          ? (point.meaningChinese || t('grammarRule'))
                          : '')}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="kp-item-actions">
                    {!isConfirmed && (
                      <button
                        className="kp-action-btn kp-keep-btn"
                        onClick={(e) => handleKeepClick(e, point.id)}
                        title={t('keepTooltip')}
                      >
                        {t('keep')}
                      </button>
                    )}
                    <button
                      className="kp-action-btn kp-discard-btn"
                      onClick={(e) => handleDeleteClick(e, point)}
                      title={t('discardTooltip')}
                    >
                      {t('discard')}
                    </button>
                  </div>
                </div>
                {/* Narrow-mode inline detail */}
                {isNarrow && expandedPointId === point.id && (
                  <div className="kp-inline-detail">
                    <button className="kp-inline-close" onClick={handleCloseInlineDetail}>✕</button>
                    <LookUpPanel
                      point={point}
                      expandedChinese={expandedChinese}
                      onToggleChinese={() => setExpandedChinese((prev) => !prev)}
                      language={language}
                    />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
})

export default KnowledgeSidebar
