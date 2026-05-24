import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getItem, setItem } from '../utils/storage'

const STORAGE_KEY = 'app_language'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const { i18n } = useTranslation()
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

  // Sync language to i18next whenever it changes
  useEffect(() => {
    i18n.changeLanguage(language)
  }, [language, i18n])

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang)
    try {
      localStorage.setItem(STORAGE_KEY, lang)
      setItem(STORAGE_KEY, lang) // 异步写入 Electron 存储
    } catch {
      // silently ignore
    }
  }, [])

  const value = useMemo(
    () => ({ language, setLanguage }),
    [language, setLanguage]
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
