import { memo } from 'react'
import './TabNav.css'

const TabNav = memo(function TabNav({ activeTab, onTabChange, dueCount, uiText }) {
  return (
    <nav className="tab-nav">
      <button
        className={`tab-nav-btn ${activeTab === 'chat' ? 'tab-nav-active' : ''}`}
        onClick={() => onTabChange('chat')}
        title={uiText.scenarioSetup}
      >
        💬
      </button>

      <button
        className={`tab-nav-btn ${activeTab === 'review' ? 'tab-nav-active' : ''}`}
        onClick={() => onTabChange('review')}
        title={uiText.learningProgress}
      >
        <span className="tab-nav-icon-wrap">
          📊
          {dueCount > 0 && (
            <span className="tab-nav-badge">{dueCount > 99 ? '99+' : dueCount}</span>
          )}
        </span>
      </button>
    </nav>
  )
})

export default TabNav
