/**
 * AILingo Electron Main Process
 * 
 * Loads the built Vite production build in production mode.
 * In development mode, it connects to the Vite dev server.
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { startTTSServer, createTTSHandler } = require('../server/tts-proxy.cjs');
const http = require('http');

// === 修复双击打开时的工作目录问题 ===
// 将工作目录切换到 Resources/app/，确保相对路径正确解析
if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'development') {
  const appPath = path.join(__dirname, '..');
  process.chdir(appPath);
  console.log('[AILingo] 工作目录已切换至:', process.cwd());
}
// ===================================

let mainWindow = null;
let ttsServer = null;

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

function createWindow() {
  // Lazily require BrowserWindow — it must be accessed after app.whenReady()
  const { BrowserWindow } = require('electron');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
  });

  if (isDev) {
    const vitePort = process.env.VITE_PORT || '5173';
    mainWindow.loadURL(`http://localhost:${vitePort}`);
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '..', 'index.html');
    console.log('[AILingo] Loading:', indexPath);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Start the TTS proxy server embedded in the Electron main process.
 * Uses the shared tts-proxy.cjs module.
 */
function initTTSServer() {
  ttsServer = startTTSServer(3001, { logPrefix: 'AILingo' });
}

/**
 * Stop the TTS server gracefully.
 */
function stopTTSServer() {
  if (ttsServer) {
    ttsServer.close(() => {
      console.log('[AILingo] TTS server stopped');
    });
    ttsServer = null;
  }
}

app.whenReady().then(() => {
  const { ipcMain, shell, BrowserWindow } = require('electron');

  // === 本地文件存储 IPC ===
  function getSettingsPath() {
    return path.join(app.getPath('userData'), 'ailingo_settings.json');
  }

  function readSettingsFile() {
    try {
      const settingsPath = getSettingsPath();
      if (fs.existsSync(settingsPath)) {
        const raw = fs.readFileSync(settingsPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('[AILingo] 读取设置文件失败:', e);
    }
    return {};
  }

  function writeSettingsFile(data) {
    try {
      const settingsPath = getSettingsPath();
      fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[AILingo] 写入设置文件失败:', e);
      return false;
    }
  }

  ipcMain.handle('read-settings', () => readSettingsFile());
  ipcMain.handle('write-settings', (_, data) => writeSettingsFile(data));
  ipcMain.handle('open-external', async (event, url) => {
    if (url && typeof url === 'string') {
      await shell.openExternal(url);
    }
  });
  // ===========================

  createWindow();

  if (!isDev) {
    initTTSServer();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopTTSServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopTTSServer();
});
