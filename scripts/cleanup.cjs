/**
 * Auto-cleanup: remove debug logs and resolved feedback older than 7 days.
 *
 * Usage:
 *   node scripts/cleanup.cjs              # dry-run (list what would be deleted)
 *   node scripts/cleanup.cjs --execute     # actually delete
 *
 * Called automatically from Electron main process on startup (dry-run log only).
 * For actual deletion, use --execute flag or call via IPC 'cleanup-old-logs'.
 */

const fs = require('fs');
const path = require('path');

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PROJECT_ROOT = path.resolve(__dirname, '..');

const DIRS_TO_CLEAN = [
  'ai-feedback/debug-logs',
  'ai-feedback/resolved',
];

function getAgeMs(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return Date.now() - stat.mtimeMs;
  } catch {
    return 0;
  }
}

function humanAge(ms) {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ago`;
}

/**
 * Scan and optionally delete old files.
 * @param {boolean} execute - if false, dry-run only
 * @returns {{ deleted: string[], kept: number, totalSize: number }}
 */
function cleanup(execute = false) {
  const result = { deleted: [], kept: 0, totalSize: 0 };
  const now = Date.now();

  for (const relDir of DIRS_TO_CLEAN) {
    const dirPath = path.join(PROJECT_ROOT, relDir);
    if (!fs.existsSync(dirPath)) {
      console.log(`[cleanup] Directory not found, skipping: ${relDir}`);
      continue;
    }

    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const ageMs = getAgeMs(fullPath);

      if (ageMs > MAX_AGE_MS) {
        const size = fs.statSync(fullPath).size;
        result.totalSize += size;

        if (execute) {
          try {
            fs.unlinkSync(fullPath);
            console.log(`[cleanup] DELETED: ${relDir}/${entry} (${humanAge(ageMs)}, ${(size / 1024).toFixed(1)}KB)`);
            result.deleted.push(`${relDir}/${entry}`);
          } catch (e) {
            console.error(`[cleanup] Failed to delete: ${fullPath}`, e.message);
          }
        } else {
          console.log(`[cleanup] WOULD DELETE: ${relDir}/${entry} (${humanAge(ageMs)}, ${(size / 1024).toFixed(1)}KB)`);
          result.deleted.push(`${relDir}/${entry}`);
        }
      } else {
        result.kept++;
      }
    }
  }

  if (result.deleted.length === 0) {
    console.log(`[cleanup] No old files found (${result.kept} files kept).`);
  } else if (!execute) {
    console.log(`[cleanup] Dry-run complete. ${result.deleted.length} files would be deleted (${(result.totalSize / 1024).toFixed(1)}KB).\n[cleanup] Run with --execute to actually delete.`);
  } else {
    console.log(`[cleanup] Cleanup complete. Deleted ${result.deleted.length} files (${(result.totalSize / 1024).toFixed(1)}KB), ${result.kept} files kept.`);
  }

  return result;
}

// CLI mode
if (require.main === module) {
  const execute = process.argv.includes('--execute');
  cleanup(execute);
}

module.exports = { cleanup };
