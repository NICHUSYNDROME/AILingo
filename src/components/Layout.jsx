import './Layout.css'

function Layout({ left, center, right, headerRight }) {
  return (
    <div className="layout">
      {headerRight && (
        <div className="layout-header-right">
          {headerRight}
        </div>
      )}
      <aside className="layout-left">{left}</aside>
      <main className="layout-center">{center}</main>
      <aside className="layout-right">{right}</aside>
    </div>
  )
}

export default Layout
