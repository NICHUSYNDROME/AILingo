import { createContext, useContext, useState, useCallback, useMemo } from 'react'
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

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang)
    try {
      localStorage.setItem(STORAGE_KEY, lang)
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
