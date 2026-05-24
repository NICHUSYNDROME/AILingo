import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getItem, setItem } from '../utils/storage'
import { debug } from '../utils/debug'
import { testDeepSeekKey, testTTSKey } from '../api'
import './ApiKeyModal.css'

/**
 * 脱敏 API Key
 * 如果 key 长度 <= 8，返回 '****'
 * 否则保留前 4 个字符 + '****' + 后 4 个字符
 */
function maskApiKey(key) {
  if (!key) return ''
  if (key.length <= 8) return '****'
  return key.slice(0, 4) + '****' + key.slice(-4)
}

/**
 * API Key 配置弹窗
 * @param {string} mode - 'welcome' 引导模式（不可关闭）| 'settings' 设置模式（可关闭）
 * @param {function} onComplete - 引导模式保存成功后回调
 * @param {function} onClose - 设置模式关闭时回调
 */
export default function ApiKeyModal({ mode = 'welcome', onComplete, onClose }) {
  const { t } = useTranslation()
  const [deepseekKey, setDeepseekKey] = useState('')
  const [ttsKey, setTtsKey] = useState('')
  const [showDeepseek, setShowDeepseek] = useState(false)
  const [showTTS, setShowTTS] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null) // { type: 'success'|'error'|'info', message: string }
  const [hasExistingDeepseek, setHasExistingDeepseek] = useState(false)
  const [hasExistingTTS, setHasExistingTTS] = useState(false)

  const originalDeepseekKeyRef = useRef('')
  const originalTTSKeyRef = useRef('')

  const isWelcome = mode === 'welcome'

  // 组件挂载时读取已保存的 Key，脱敏后回显
  useEffect(() => {
    const loadSavedKeys = async () => {
      const savedDeepseek = await getItem('deepseek_api_key')
      debug.log('[ApiKeyModal] getItem deepseek_api_key:', savedDeepseek)
      if (savedDeepseek) {
        originalDeepseekKeyRef.current = savedDeepseek
        const maskedDeepseek = maskApiKey(savedDeepseek)
        setDeepseekKey(maskedDeepseek)
        debug.log('[ApiKeyModal] masked deepseek:', maskedDeepseek)
        debug.log('[ApiKeyModal] deepseekKey state after set:', maskedDeepseek)
        setHasExistingDeepseek(true)
      }

      const savedTTS = await getItem('qwen_tts_api_key')
      debug.log('[ApiKeyModal] getItem qwen_tts_api_key:', savedTTS)
      if (savedTTS) {
        originalTTSKeyRef.current = savedTTS
        const maskedTTS = maskApiKey(savedTTS)
        setTtsKey(maskedTTS)
        debug.log('[ApiKeyModal] masked tts:', maskedTTS)
        debug.log('[ApiKeyModal] ttsKey state after set:', maskedTTS)
        setHasExistingTTS(true)
      }

      debug.log('[ApiKeyModal] loadSavedKeys finished, deepseekKey will be:', maskApiKey(savedDeepseek || ''))
    }

    loadSavedKeys()
  }, [])

  // 在 Electron 中用系统浏览器打开链接，否则用 window.open
  const openExternalLink = (url) => {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url)
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleTestAndSave = async () => {
    // 确定实际要使用的 Key：如果用户没有修改脱敏值，使用原始完整 Key；否则使用用户新输入的值
    const actualDeepseekKey = hasExistingDeepseek && deepseekKey === maskApiKey(originalDeepseekKeyRef.current)
      ? originalDeepseekKeyRef.current
      : deepseekKey.trim()
    const actualTTSKey = hasExistingTTS && ttsKey === maskApiKey(originalTTSKeyRef.current)
      ? originalTTSKeyRef.current
      : ttsKey.trim()

    // 清除旧结果
    setTestResult(null)

    // 校验必填
    if (!actualDeepseekKey) {
      setTestResult({ type: 'error', message: t('validateKeyEmpty') })
      return
    }

    setTesting(true)
    setTestResult({ type: 'info', message: t('testingDeepseek') })

    // 测试 DeepSeek
    const dsResult = await testDeepSeekKey(actualDeepseekKey)
    if (!dsResult.valid) {
      setTestResult({ type: 'error', message: `${t('deepseekInvalid')}${dsResult.error}` })
      setTesting(false)
      return
    }

    // DeepSeek 有效，保存
    await setItem('deepseek_api_key', actualDeepseekKey)
    originalDeepseekKeyRef.current = actualDeepseekKey
    setHasExistingDeepseek(true)

    // 如果填了 TTS Key，测试并保存（失败不影响）
    if (actualTTSKey) {
      setTestResult({ type: 'info', message: t('testingTTS') })
      const ttsResult = await testTTSKey(actualTTSKey)
      if (ttsResult.valid) {
        await setItem('qwen_tts_api_key', actualTTSKey)
        originalTTSKeyRef.current = actualTTSKey
        setHasExistingTTS(true)
      } else {
        // TTS 失败仅提示，不阻塞流程
        debug.warn('TTS Key 测试失败:', ttsResult.error)
      }
    }

    setTestResult({ type: 'success', message: t('deepseekSuccess') })
    setTesting(false)

    // 引导模式：延迟跳转
    if (isWelcome && onComplete) {
      setTimeout(() => onComplete(), 600)
    }
  }

  const handleCancel = () => {
    if (!isWelcome && onClose) {
      onClose()
    }
  }

  return (
    <div className="apikey-modal-overlay">
      <div className="apikey-modal-card">
        <h1 className="apikey-modal-title">AILingo</h1>
        <p className="apikey-modal-subtitle">{t('apiKeySubtitle')}</p>

        {/* DeepSeek API Key */}
        <div className="apikey-modal-field">
          <label>{t('apiKeyDeepseekLabel')} <span className="required">{t('apiKeyRequired')}</span></label>
          <div className="apikey-modal-input-row">
            <input
              type={showDeepseek ? 'text' : 'password'}
              value={deepseekKey}
              onChange={(e) => setDeepseekKey(e.target.value)}
              placeholder={t('apiKeyDeepseekPlaceholder')}
              disabled={testing}
              autoFocus
            />
            <button
              className="toggle-visibility"
              onClick={() => setShowDeepseek(!showDeepseek)}
              tabIndex={-1}
            >
              {showDeepseek ? '🙈' : '👁'}
            </button>
          </div>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); openExternalLink('https://platform.deepseek.com/api_keys') }}
            className="apikey-link"
          >
            {t('apiKeyGetDeepseek')}
          </a>
        </div>

        {/* 千问 TTS API Key */}
        <div className="apikey-modal-field">
          <label>{t('apiKeyTtsLabel')} <span className="optional">{t('apiKeyTtsOptional')}</span></label>
          <div className="apikey-modal-input-row">
            <input
              type={showTTS ? 'text' : 'password'}
              value={ttsKey}
              onChange={(e) => setTtsKey(e.target.value)}
              placeholder={t('apiKeyTtsPlaceholder')}
              disabled={testing}
            />
            <button
              className="toggle-visibility"
              onClick={() => setShowTTS(!showTTS)}
              tabIndex={-1}
            >
              {showTTS ? '🙈' : '👁'}
            </button>
          </div>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); openExternalLink('https://bailian.console.aliyun.com/cn-beijing?tab=model#/api-key') }}
            className="apikey-link"
          >
            {t('apiKeyGetTts')}
          </a>
        </div>

        {/* 测试结果 */}
        {testResult && (
          <div className={`apikey-test-result ${testResult.type}`}>
            {testResult.type === 'info' && <span className="spinner" />}
            {testResult.message}
          </div>
        )}

        {/* 按钮区 */}
        <div className="apikey-modal-buttons">
          {isWelcome ? (
            <button
              className="btn-primary"
              onClick={handleTestAndSave}
              disabled={testing || !deepseekKey.trim()}
            >
              {testing ? t('testing') : t('testAndStart')}
            </button>
          ) : (
            <>
              <button className="btn-secondary" onClick={handleCancel}>{t('confirmCancel')}</button>
              <button
                className="btn-primary"
                onClick={handleTestAndSave}
                disabled={testing || !deepseekKey.trim()}
              >
                {testing ? t('testing') : t('testAndSave')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
