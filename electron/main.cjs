/**
 * AILingo Electron Main Process
 * 
 * Loads the built Vite production build in production mode.
 * In development mode, it connects to the Vite dev server.
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const { fork } = require('child_process');

// === 修复双击打开时的工作目录问题 ===
// 将工作目录切换到 Resources/app/，确保相对路径正确解析
if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'development') {
  const appPath = path.join(__dirname, '..');
  process.chdir(appPath);
  console.log('[AILingo] 工作目录已切换至:', process.cwd());
}
// ===================================

let mainWindow = null;
let daemonProcess = null;

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

function createWindow() {
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

function startDaemon() {
  const daemonPath = path.join(__dirname, '..', 'daemon.cjs');
  daemonProcess = fork(daemonPath, [], {
    env: { ...process.env, AILINGO_SILENT: '1' },
    stdio: 'pipe',
  });

  daemonProcess.stdout.on('data', (data) => {
    console.log(`[Daemon] ${data.toString().trim()}`);
  });

  daemonProcess.stderr.on('data', (data) => {
    console.error(`[Daemon] ${data.toString().trim()}`);
  });

  daemonProcess.on('exit', (code) => {
    console.log(`[Daemon] exited with code ${code}`);
    daemonProcess = null;
  });
}

// === 本地文件存储 IPC ===
const settingsPath = path.join(app.getPath('userData'), 'ailingo_settings.json');

function readSettingsFile() {
  try {
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

app.whenReady().then(() => {
  createWindow();

  if (!isDev) {
    startDaemon();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (daemonProcess) {
    daemonProcess.kill('SIGTERM');
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (daemonProcess) {
    daemonProcess.kill('SIGTERM');
  }
});

