/**
 * Development-only debug logging utility.
 *
 * In production builds (`import.meta.env.PROD`), `log` and `warn` become no-ops
 * that are tree-shaken away.  `error` is always preserved.
 */

const isDev = import.meta.env.DEV

export const debug = {
  /** Development-only log.  Stripped in production. */
  log: (...args) => {
    if (isDev) console.log(...args)
  },
  /** Development-only warning.  Stripped in production. */
  warn: (...args) => {
    if (isDev) console.warn(...args)
  },
  /** Always-on error logging.  Never stripped. */
  error: (...args) => {
    console.error(...args)
  },
  /** Proficiency score logging (dev only, prefixed for easy filtering). */
  proficiency: (...args) => {
    if (isDev) console.log('[PROFICIENCY]', ...args)
  },
}
