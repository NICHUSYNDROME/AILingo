import { memo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
  onClearProficiency,
  onClearKnowledge,
  onOpenApiSettings,
}) {
  const { t } = useTranslation()
  const [confirmAction, setConfirmAction] = useState(null) // 'proficiency' | 'knowledge' | null

  const handleConfirm = useCallback(() => {
    if (confirmAction === 'proficiency') onClearProficiency?.()
    else if (confirmAction === 'knowledge') onClearKnowledge?.()
    setConfirmAction(null)
  }, [confirmAction, onClearProficiency, onClearKnowledge])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="settings-backdrop" onClick={onClose} />

      {/* Panel */}
      <div className={`settings-panel ${open ? 'settings-panel-open' : ''}`}>
        <div className="settings-panel-header">
          <h3 className="settings-panel-title">{t('settings')}</h3>
          <button className="settings-panel-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-panel-body">
          {/* Language */}
          <div className="settings-group">
            <label className="settings-label">{t('settingsLanguage')}</label>
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
            <label className="settings-label">{t('settingsTheme')}</label>

            <div className="settings-toggle-row">
              <span className="settings-toggle-label">{t('settingsFollowSystem')}</span>
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
                {t('settingsDarkMode')}
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
            <label className="settings-label">{t('settingsAutoRead')}</label>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">
                {autoReadAloud ? t('on') : t('off')}
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

          {/* Danger zone */}
          <div className="settings-group settings-group-danger">
            <label className="settings-label">{t('settingsDataManagement')}</label>
            <button
              className="settings-danger-btn"
              onClick={() => setConfirmAction('proficiency')}
            >
              {t('settingsClearProficiency')}
            </button>
            <button
              className="settings-danger-btn"
              onClick={() => setConfirmAction('knowledge')}
            >
              {t('settingsClearKnowledge')}
            </button>
          </div>

          {/* API settings */}
          <div className="settings-group">
            <label className="settings-label">{t('settingsApiSettings')}</label>
            <button
              className="settings-action-btn"
              onClick={onOpenApiSettings}
            >
              {t('settingsManageApiKey')}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation dialog — rendered outside panel for proper z-index */}
      {confirmAction && (
        <>
          <div className="settings-confirm-backdrop" onClick={() => setConfirmAction(null)} />
          <div className="settings-confirm-dialog">
            <div className="settings-confirm-title">确认清除</div>
            <div className="settings-confirm-body">
              {confirmAction === 'proficiency'
                ? '确定要清除当前语言的水平评估结果吗？这不会影响已保存的知识点记录。'
                : '确定要清除当前语言的所有知识点记录吗？此操作不可撤销。'}
            </div>
            <div className="settings-confirm-actions">
              <button className="settings-confirm-cancel" onClick={() => setConfirmAction(null)}>取消</button>
              <button className="settings-confirm-ok" onClick={handleConfirm}>确认清除</button>
            </div>
          </div>
        </>
      )}
    </>
  )
})

export default SettingsPanel
