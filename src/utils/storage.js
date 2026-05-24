/**
 * AILingo 持久化存储模块（优化版）
 *
 * 策略：
 * - localStorage 始终作为主存储（同步读写，零延迟）
 * - Electron 环境下，将 localStorage 变更异步防抖批量同步到本地文件
 * - 内存缓存避免每次写入都 readSettings（读取全量文件）
 *
 * 模式：
 * - 浏览器：只使用 localStorage
 * - Electron：localStorage + 防抖同步到文件（300ms 合并窗口）
 */

import { debug } from './debug'

const isElectron = typeof window !== 'undefined' && window.electronAPI;

// ── Electron 内存缓存 + 防抖 ────────────────────────────────────────
let _electronCache = null;
let _electronCacheLoaded = false;
let _flushTimer = null;
const FLUSH_DELAY = 300; // ms，同一帧内的多次写入合并为一次文件写入

/** 延迟加载并缓存 Electron 文件内容 */
async function _ensureElectronCache() {
  if (!isElectron) return null;
  if (!_electronCacheLoaded) {
    try {
      _electronCache = await window.electronAPI.readSettings();
    } catch {
      _electronCache = {};
    }
    _electronCacheLoaded = true;
  }
  return _electronCache;
}

/** 安排防抖刷新：多次调用在 FLUSH_DELAY 内只触发一次 writeSettings */
function _scheduleFlush() {
  if (!isElectron) return;
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    _doFlush();
  }, FLUSH_DELAY);
}

/** 立即将缓存写入 Electron 文件（内部使用，通常由防抖调用） */
async function _doFlush() {
  if (!isElectron || !_electronCacheLoaded) return;
  try {
    await window.electronAPI.writeSettings(_electronCache);
  } catch {
    // 静默失败，localStorage 已保存
  }
}

/**
 * 强制立即刷新所有待写入的 Electron 数据。
 * 用于应用退出前或关键操作后确保数据已持久化。
 */
export async function flushAll() {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
    await _doFlush();
  }
}

// ── 公共 API ─────────────────────────────────────────────────────────

export async function getItem(key) {
  // 优先从 Electron 缓存读取（确保与文件一致）
  if (isElectron) {
    const cache = await _ensureElectronCache();
    if (cache && key in cache) {
      return cache[key];
    }
  }
  // 降级：localStorage
  return localStorage.getItem(key);
}

export async function setItem(key, value) {
  // 始终同步写 localStorage（主存储，即时生效）
  localStorage.setItem(key, value);

  // Electron：更新内存缓存 + 安排防抖写入文件
  if (isElectron) {
    const cache = await _ensureElectronCache();
    if (cache) {
      cache[key] = value;
      _scheduleFlush();
    }
  }
}

export async function removeItem(key) {
  localStorage.removeItem(key);

  if (isElectron) {
    const cache = await _ensureElectronCache();
    if (cache) {
      delete cache[key];
      _scheduleFlush();
    }
  }
}

/**
 * 将 Electron 文件存储同步到 localStorage + 内存缓存。
 * 应用启动时调用一次。
 *
 * @returns {Promise<number>} 同步的数据项数量
 */
export async function syncAllFromFile() {
  if (!isElectron) return 0;

  try {
    // 读取文件并填充缓存
    _electronCache = await window.electronAPI.readSettings();
    _electronCacheLoaded = true;

    const keys = Object.keys(_electronCache);
    for (const key of keys) {
      localStorage.setItem(key, _electronCache[key]);
    }
    debug.log(`[storage] 已从 Electron 文件同步 ${keys.length} 项数据到 localStorage`);
    return keys.length;
  } catch (e) {
    debug.warn('[storage] 从 Electron 文件同步失败:', e);
    return 0;
  }
}
