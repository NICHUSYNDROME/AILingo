import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react'
import { getItem, setItem } from '../utils/storage'
import { UI_TEXT } from '../config/languages'

const STORAGE_KEY = 'app_language'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved === 'ja' ? 'ja' : 'en'
    } catch {
      return 'en'
    }
  })

  // Electron 环境下，从主进程文件加载真实值
  useEffect(() => {
    const loadFromStorage = async () => {
      const saved = await getItem(STORAGE_KEY)
      if (saved === 'ja' || saved === 'en') {
        setLanguageState(saved)
      }
    }
    loadFromStorage()
  }, [])

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang)
    try {
      localStorage.setItem(STORAGE_KEY, lang)
      setItem(STORAGE_KEY, lang) // 异步写入 Electron 存储
    } catch {
      // silently ignore
    }
  }, [])

  const uiText = useMemo(() => UI_TEXT[language] || UI_TEXT.en, [language])

  const value = useMemo(
    () => ({ language, setLanguage, uiText }),
    [language, setLanguage, uiText]
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return ctx
}

export default LanguageContext
