/**
 * AILingo Daemon
 *
 * Application startup core. Dynamically allocates ports, manages TTS & Vite
 * services, saves PID files, and handles graceful shutdown.
 *
 * Usage:
 *   node daemon.cjs
 *
 * Environment variables:
 *   DASHSCOPE_API_KEY  — passed to the TTS server if set
 */

const { spawn } = require('child_process');
const { createServer } = require('net');
const fs = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// ── Silent Mode ───────────────────────────────────────────────────────────
// When AILINGO_SILENT=1, reduce log output (used when launched as background service)
const isSilent = process.env.AILINGO_SILENT === '1';

function log(...args) {
  if (!isSilent) {
    console.log(...args);
  }
}

function logError(...args) {
  if (!isSilent) {
    console.error(...args);
  }
}

// ── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  TTS_START_PORT: 3001,
  VITE_START_PORT: 5173,
  MAX_PORT_ATTEMPTS: 10,
  PID_FILE: path.join(__dirname, '.ailingo-pids.json'),
  TTS_SERVER_PATH: path.join(__dirname, 'server/tts-server.cjs'),
};

// ── Port Detection ────────────────────────────────────────────────────────

/**
 * Check whether a given TCP port is available (not in use).
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        server.close();
        resolve(true);
      })
      .listen(port);
  });
}

/**
 * Find the first available port starting from `startPort`, trying up to
 * MAX_PORT_ATTEMPTS ports.
 * @param {number} startPort
 * @returns {Promise<number>}
 */
async function findAvailablePort(startPort) {
  for (let offset = 0; offset < CONFIG.MAX_PORT_ATTEMPTS; offset++) {
    const port = startPort + offset;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// ── Service Starters ──────────────────────────────────────────────────────

/**
 * Start the TTS proxy server on the given port.
 * @param {number} port
 * @returns {Promise<import('child_process').ChildProcess>}
 */
async function startTTSServer(port) {
  const env = { ...process.env, PORT: String(port) };

  const ttsProcess = spawn('node', [CONFIG.TTS_SERVER_PATH], {
    env,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  ttsProcess.stdout.on('data', (data) => {
    log(`[TTS] ${data.toString().trim()}`);
  });

  ttsProcess.stderr.on('data', (data) => {
    logError(`[TTS Error] ${data.toString().trim()}`);
  });

  ttsProcess.on('error', (err) => {
    logError(`[TTS] Failed to start: ${err.message}`);
  });

  return ttsProcess;
}

/**
 * Start the Vite dev server on the given port.
 * @param {number} port
 * @returns {Promise<import('child_process').ChildProcess>}
 */
async function startViteServer(port) {
  const viteProcess = spawn('npx', ['vite', '--port', String(port), '--host'], {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  viteProcess.stdout.on('data', (data) => {
    log(`[Vite] ${data.toString().trim()}`);
  });

  viteProcess.stderr.on('data', (data) => {
    logError(`[Vite Error] ${data.toString().trim()}`);
  });

  viteProcess.on('error', (err) => {
    logError(`[Vite] Failed to start: ${err.message}`);
  });

  return viteProcess;
}

// ── PID File Management ───────────────────────────────────────────────────

/**
 * Save process information to the PID file.
 * @param {number} ttsPid
 * @param {number} vitePid
 * @param {number} ttsPort
 * @param {number} vitePort
 */
async function savePIDs(ttsPid, vitePid, ttsPort, vitePort) {
  const data = {
    tts: { pid: ttsPid, port: ttsPort },
    vite: { pid: vitePid, port: vitePort },
    startTime: Date.now(),
  };
  await fs.writeFile(CONFIG.PID_FILE, JSON.stringify(data, null, 2));
  log(`[Daemon] PID file saved: ${CONFIG.PID_FILE}`);
}

/**
 * Load process information from the PID file.
 * @returns {Promise<object|null>}
 */
async function loadPIDs() {
  try {
    const data = await fs.readFile(CONFIG.PID_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Remove the PID file.
 */
async function cleanPIDs() {
  try {
    await fs.unlink(CONFIG.PID_FILE);
  } catch {
    // File does not exist — ignore
  }
}

// ── Browser / Electron Launcher ──────────────────────────────────────────

// Electron process reference for graceful shutdown
let electronProcess = null;

/**
 * Launch Electron window pointing to the Vite dev server.
 * Falls back to opening the system browser if Electron fails.
 * @param {number} vitePort
 * @returns {Promise<import('child_process').ChildProcess>}
 */
async function openElectronWindow(vitePort) {
  // If an Electron process already exists, close it first
  if (electronProcess) {
    electronProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const url = `http://localhost:${vitePort}`;
  log(`[Daemon] Launching Electron window: ${url}`);

  // Set environment variables to indicate development mode
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    ELECTRON_IS_DEV: '1',
    VITE_PORT: String(vitePort)
  };

  // Start Electron
  electronProcess = spawn('npx', ['electron', 'electron/main.cjs'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  electronProcess.stdout.on('data', (data) => {
    log(`[Electron] ${data.toString().trim()}`);
  });

  electronProcess.stderr.on('data', (data) => {
    logError(`[Electron Error] ${data.toString().trim()}`);
  });

  electronProcess.on('exit', (code) => {
    log(`[Electron] exited with code ${code}`);
    electronProcess = null;
  });

  return electronProcess;
}

// ═══════════════════════════════════════════════════════════════════════════
// Fallback: open in system browser (kept as fallback / for future reference)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Open a URL in the default web browser.
 * Kept as a fallback — Electron window is the primary launcher.
 * @param {string} url
 *
async function openBrowser(url) {
  const platform = process.platform;
  let command;

  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  try {
    await execAsync(command);
    log(`[Daemon] Browser opened: ${url}`);
  } catch (err) {
    logError(`[Daemon] Failed to open browser: ${err.message}`);
  }
}
*/

// ── Graceful Shutdown ─────────────────────────────────────────────────────

let ttsProcess = null;
let viteProcess = null;

/**
 * Gracefully stop all services and clean up.
 */
async function shutdown() {
  log('\n[Daemon] Shutting down AILingo...');

  // Terminate Electron window
  if (electronProcess) {
    electronProcess.kill('SIGTERM');
    log('[Daemon] Electron window closed');
  }

  // Terminate child processes
  if (ttsProcess) {
    ttsProcess.kill('SIGTERM');
    log('[Daemon] TTS server stopped');
  }
  if (viteProcess) {
    viteProcess.kill('SIGTERM');
    log('[Daemon] Vite server stopped');
  }

  // Remove PID file
  await cleanPIDs();

  log('[Daemon] AILingo shutdown complete');
  process.exit(0);
}

// Register signal handlers
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  log('\n🚀 AILingo Daemon Starting...\n');

  // 1. Detect available ports
  log('🔍 Checking available ports...');
  const ttsPort = await findAvailablePort(CONFIG.TTS_START_PORT);
  const vitePort = await findAvailablePort(CONFIG.VITE_START_PORT);
  log(`   TTS:  port ${ttsPort} available`);
  log(`   Vite: port ${vitePort} available\n`);

  // 2. Start TTS server
  log('🎤 Starting TTS server...');
  ttsProcess = await startTTSServer(ttsPort);
  log(`   TTS server started (PID: ${ttsProcess.pid})\n`);

  // Wait 1 second for TTS to initialise
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 3. Start Vite server
  log('📦 Starting Vite dev server...');
  viteProcess = await startViteServer(vitePort);
  log(`   Vite server started (PID: ${viteProcess.pid})\n`);

  // 4. Save PID information
  await savePIDs(ttsProcess.pid, viteProcess.pid, ttsPort, vitePort);
  log('💾 PID information saved\n');

  // 5. Wait for Vite to be fully ready (poll port)
  log('⏳ Waiting for servers to be ready...');
  let viteReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch(`http://localhost:${vitePort}`);
      if (response.ok) {
        viteReady = true;
        break;
      }
    } catch {
      // Server not ready yet — keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (viteReady) {
    log('✅ All servers are ready!\n');
    // Launch Electron window (replaces browser open)
    await openElectronWindow(vitePort);
  } else {
    logError('❌ Vite server failed to start within timeout');
  }

  log('📊 AILingo is running');
  log(`   Frontend: http://localhost:${vitePort}`);
  log(`   TTS API:  http://localhost:${ttsPort}`);
  log('\nPress Ctrl+C to stop\n');
}

// Execute main
main().catch((err) => {
  logError('[Daemon] Failed to start AILingo:', err);
  process.exit(1);
});
