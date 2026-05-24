import { memo } from 'react'
import { LANGUAGES } from '../config/languages'
import './SettingsPanel.css'

const SettingsPanel = memo(function SettingsPanel({
  open,
  onClose,
  language,
  setLanguage,
  theme,
  followSystem,
  setFollowSystem,
  setTheme,
  autoReadAloud,
  setAutoReadAloud,
  uiText,
}) {
  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="settings-backdrop" onClick={onClose} />

      {/* Panel */}
      <div className={`settings-panel ${open ? 'settings-panel-open' : ''}`}>
        <div className="settings-panel-header">
          <h3 className="settings-panel-title">{uiText.settings}</h3>
          <button className="settings-panel-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-panel-body">
          {/* Language */}
          <div className="settings-group">
            <label className="settings-label">{uiText.settingsLanguage}</label>
            <select
              className="settings-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.key} value={lang.key}>
                  {lang.flag} {lang.label}
                </option>
              ))}
            </select>
          </div>

          {/* Theme */}
          <div className="settings-group">
            <label className="settings-label">{uiText.settingsTheme}</label>

            <div className="settings-toggle-row">
              <span className="settings-toggle-label">{uiText.settingsFollowSystem}</span>
              <button
                className={`settings-toggle ${followSystem ? 'settings-toggle-on' : ''}`}
                onClick={() => setFollowSystem(!followSystem)}
                role="switch"
                aria-checked={followSystem}
              >
                <span className="settings-toggle-thumb" />
              </button>
            </div>

            <div className="settings-toggle-row">
              <span className={`settings-toggle-label ${followSystem ? 'settings-toggle-disabled' : ''}`}>
                {uiText.settingsDarkMode}
              </span>
              <button
                className={`settings-toggle ${!followSystem && theme === 'dark' ? 'settings-toggle-on' : ''}`}
                onClick={() => {
                  if (!followSystem) {
                    setTheme(theme === 'dark' ? 'light' : 'dark')
                  }
                }}
                disabled={followSystem}
                role="switch"
                aria-checked={!followSystem && theme === 'dark'}
              >
                <span className="settings-toggle-thumb" />
              </button>
            </div>
          </div>

          {/* Auto-read AI replies */}
          <div className="settings-group">
            <label className="settings-label">{uiText.settingsAutoRead}</label>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">
                {autoReadAloud ? uiText.on : uiText.off}
              </span>
              <button
                className={`settings-toggle ${autoReadAloud ? 'settings-toggle-on' : ''}`}
                onClick={() => setAutoReadAloud(!autoReadAloud)}
                role="switch"
                aria-checked={autoReadAloud}
              >
                <span className="settings-toggle-thumb" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
})

export default SettingsPanel
