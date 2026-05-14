/**
 * AILingo Electron Main Process
 * 
 * Loads the built Vite production build in production mode.
 * In development mode, it connects to the Vite dev server.
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
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
 * Listens on port 3001 and proxies TTS requests to Qwen DashScope API.
 */
function startTTSServer() {
  const PORT = 3001;

  ttsServer = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/tts') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const { text, apiKey, voice, languageType } = JSON.parse(body);

          if (!text || !apiKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing text or apiKey' }));
            return;
          }

          console.log('[TTS] Sending to Qwen:', {
            model: 'qwen3-tts-instruct-flash',
            text: text.substring(0, 30),
            voice,
            languageType,
            apiKeyPrefix: apiKey.substring(0, 8) + '...',
          });

          const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'qwen3-tts-instruct-flash',
              input: {
                text,
                voice: voice || 'Kai',
                language_type: languageType || 'Japanese',
                speed: 1.0,
                volume: 1.0,
              },
              instructions: '语速偏慢，语气沉稳冷静，像纪录片旁白一样平稳地朗读。',
              optimize_instructions: true,
            }),
          });

          const rawData = await response.text();
          console.log('[TTS] Qwen API response status:', response.status);
          const data = JSON.parse(rawData);

          if (data.output?.audio?.url) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ audioUrl: data.output.audio.url }));
          } else if (response.status !== 200 || data.code) {
            console.error('[TTS] Qwen API error:', JSON.stringify(data, null, 2));
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'TTS API error', detail: data }));
          } else {
            console.error('[TTS] Unexpected response:', JSON.stringify(data, null, 2));
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unexpected response', detail: data }));
          }
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  ttsServer.listen(PORT, () => {
    console.log(`[AILingo] TTS proxy server running at http://localhost:${PORT}`);
  });

  ttsServer.on('error', (err) => {
    console.error('[AILingo] TTS server error:', err.message);
  });
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
    startTTSServer();
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
