import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getItem, setItem } from '../utils/storage'

const ThemeContext = createContext(null)

function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    // 同步读取 localStorage 作为初始值（开发环境 + Electron fallback）
    const stored = localStorage.getItem('app_theme')
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
    // 无存储值，使用系统偏好
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  // 是否用户手动设置过
  const [userSet, setUserSet] = useState(() => {
    return localStorage.getItem('app_theme') !== null
  })

  // Electron 环境下，从主进程文件加载真实值（覆盖 localStorage 初始值）
  useEffect(() => {
    const loadFromStorage = async () => {
      const saved = await getItem('app_theme')
      if (saved === 'light' || saved === 'dark') {
        setThemeState(saved)
        setUserSet(true)
      }
    }
    loadFromStorage()
  }, [])

  // 切换主题时同时写入 localStorage（同步，开发环境）和 storage.js（异步，Electron）
  const setTheme = useCallback((newTheme) => {
    setThemeState(newTheme)
    setUserSet(true)
    localStorage.setItem('app_theme', newTheme)
    setItem('app_theme', newTheme) // 异步，不等待
  }, [])

  // 监听系统主题变化
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e) => {
      // 仅当用户没有手动设置过主题时，跟随系统变化
      if (!userSet) {
        setThemeState(e.matches ? 'dark' : 'light')
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [userSet])

  // 将 data-theme 属性设置在根元素上
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export { ThemeProvider, useTheme }
