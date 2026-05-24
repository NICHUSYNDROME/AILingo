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
  // 始终写入 localStorage（浏览器 & Electron 双写，确保数据互通）
  localStorage.setItem(key, value);

  if (isElectron) {
    try {
      const settings = await window.electronAPI.readSettings();
      settings[key] = value;
      await window.electronAPI.writeSettings(settings);
    } catch {
      // Electron 写入失败，localStorage 已保存，不影响使用
    }
  }
}

export async function removeItem(key) {
  // 始终从 localStorage 移除
  localStorage.removeItem(key);

  if (isElectron) {
    try {
      const settings = await window.electronAPI.readSettings();
      delete settings[key];
      await window.electronAPI.writeSettings(settings);
    } catch {
      // Electron 删除失败，不影响使用
    }
  }
}

/**
 * 将 Electron 文件存储中的所有数据同步到 localStorage。
 * 在应用启动时调用一次，确保浏览器开发模式与 Electron 模式数据互通。
 *
 * 调用时机：
 * - Electron 环境：应用启动时自动调用
 * - 浏览器环境：无需调用（没有 Electron 数据源）
 *
 * @returns {Promise<number>} 同步的数据项数量
 */
export async function syncAllFromFile() {
  if (!isElectron) return 0;

  try {
    const settings = await window.electronAPI.readSettings();
    const keys = Object.keys(settings);
    for (const key of keys) {
      localStorage.setItem(key, settings[key]);
    }
    console.log(`[storage] 已从 Electron 文件同步 ${keys.length} 项数据到 localStorage`);
    return keys.length;
  } catch (e) {
    console.warn('[storage] 从 Electron 文件同步失败:', e);
    return 0;
  }
}
