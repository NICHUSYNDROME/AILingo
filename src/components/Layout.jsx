import { useTranslation } from 'react-i18next'
import './Layout.css'

function Layout({ left, center, right, settingsPanel, onHamburgerClick, isNarrow, leftOpen, rightOpen, onLeftToggle, onRightToggle, showTopToggles, topbarRight }) {
  const { t } = useTranslation()
  const showLeftSidebar = !isNarrow || leftOpen
  const showRightSidebar = !isNarrow || rightOpen

  return (
    <div className={`layout ${isNarrow ? 'layout-narrow' : ''}`}>
      {/* ── Narrow top bar ── */}
      {isNarrow && (
        <div className="layout-topbar">
          <button className="hamburger-btn" onClick={onHamburgerClick} aria-label="Settings">
            <span className="hamburger-line" />
            <span className="hamburger-line" />
            <span className="hamburger-line" />
          </button>
          <span className="layout-topbar-title">AILingo</span>
          <div className="layout-topbar-right">
            {topbarRight}
            {showTopToggles && (
              <div className="layout-topbar-toggles">
                <button className="layout-topbar-toggle-btn" onClick={onLeftToggle} title={t('knowledgeBtnTitle')}>📚</button>
                <button className="layout-topbar-toggle-btn" onClick={onRightToggle} title={t('dictionaryBtnTitle')}>📖</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="layout-body">
        {/* Left sidebar — fixed overlay in narrow mode, slides from top */}
        <aside className={`layout-left ${showLeftSidebar ? 'layout-left-open' : ''}`}>
          {isNarrow && (
            <button className="layout-panel-back" onClick={onLeftToggle}>{t('quizBack')}</button>
          )}
          {left}
        </aside>

        {/* Narrow left backdrop */}
        {isNarrow && leftOpen && (
          <div className="layout-sidebar-backdrop" onClick={onLeftToggle} />
        )}

        <main className="layout-center">
          {center}
        </main>

        {/* Right sidebar — fixed overlay in narrow mode, slides from top */}
        <aside className={`layout-right ${showRightSidebar ? 'layout-right-open' : ''}`}>
          {isNarrow && (
            <button className="layout-panel-back" onClick={onRightToggle}>{t('quizBack')}</button>
          )}
          {right}
        </aside>

        {/* Narrow right backdrop */}
        {isNarrow && rightOpen && (
          <div className="layout-sidebar-backdrop" onClick={onRightToggle} />
        )}
      </div>

      {/* Wide-mode hamburger */}
      {!isNarrow && (
        <button className="hamburger-btn hamburger-btn-fixed" onClick={onHamburgerClick} aria-label="Settings">
          <span className="hamburger-line" />
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>
      )}

      {/* Settings panel */}
      {settingsPanel}
    </div>
  )
}

export default Layout
