/**
 * AILingo 持久化存储模块
 * - 开发模式（浏览器）：使用 localStorage
 * - 生产模式（Electron）：使用 window.electronAPI 读写本地文件
 */

const isElectron = typeof window !== 'undefined' && window.electronAPI;

export async function getItem(key) {
  if (isElectron) {
    try {
      const settings = await window.electronAPI.readSettings();
      return settings[key] || null;
    } catch {
      return null;
    }
  }
  // 降级：localStorage
  return localStorage.getItem(key);
}

export async function setItem(key, value) {
  if (isElectron) {
    try {
      const settings = await window.electronAPI.readSettings();
      settings[key] = value;
      await window.electronAPI.writeSettings(settings);
      return;
    } catch {
      // 降级
    }
  }
  localStorage.setItem(key, value);
}

export async function removeItem(key) {
  if (isElectron) {
    try {
      const settings = await window.electronAPI.readSettings();
      delete settings[key];
      await window.electronAPI.writeSettings(settings);
      return;
    } catch {
      // 降级
    }
  }
  localStorage.removeItem(key);
}
