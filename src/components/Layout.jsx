import './Layout.css'

function Layout({ left, center, right, settingsPanel, onHamburgerClick }) {
  return (
    <div className="layout">
      <aside className="layout-left">{left}</aside>
      <main className="layout-center">{center}</main>
      <aside className="layout-right">{right}</aside>

      {/* Hamburger menu button — bottom-left */}
      <button
        className="hamburger-btn"
        onClick={onHamburgerClick}
        aria-label="Settings"
      >
        <span className="hamburger-line" />
        <span className="hamburger-line" />
        <span className="hamburger-line" />
      </button>

      {/* Settings panel */}
      {settingsPanel}
    </div>
  )
}

export default Layout
