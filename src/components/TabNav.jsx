import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import './TabNav.css'

const TabNav = memo(function TabNav({ activeTab, onTabChange, dueCount, isNarrow, onToggleLeft, onToggleRight }) {
  const { t } = useTranslation()
  return (
    <nav className="tab-nav">
      <button
        className={`tab-nav-btn ${activeTab === 'chat' ? 'tab-nav-active' : ''}`}
        onClick={() => onTabChange('chat')}
        title={t('scenarioSetup')}
      >
        💬
      </button>

      <button
        className={`tab-nav-btn ${activeTab === 'review' ? 'tab-nav-active' : ''}`}
        onClick={() => onTabChange('review')}
        title={t('learningProgress')}
      >
        <span className="tab-nav-icon-wrap">
          📊
          {dueCount > 0 && (
            <span className="tab-nav-badge">{dueCount > 99 ? '99+' : dueCount}</span>
          )}
        </span>
      </button>

      {/* Narrow-mode extra tabs: Knowledge & LookUp panels */}
      {isNarrow && (
        <>
          <button
            className={`tab-nav-btn tab-nav-extra ${activeTab === 'knowledge' ? 'tab-nav-active' : ''}`}
            onClick={() => onTabChange('knowledge')}
            title={t('knowledgePoints')}
          >
            📚
          </button>
          <button
            className={`tab-nav-btn tab-nav-extra ${activeTab === 'lookup' ? 'tab-nav-active' : ''}`}
            onClick={() => onTabChange('lookup')}
            title={t('lookUp')}
          >
            📖
          </button>
        </>
      )}
    </nav>
  )
})

export default TabNav
