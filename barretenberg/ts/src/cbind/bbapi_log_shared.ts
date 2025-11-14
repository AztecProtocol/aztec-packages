/**
 * Shared BBAPI logging infrastructure
 * Uses dynamic imports to avoid bundling both browser and node implementations
 */

// Detect environment
const isNode = typeof process !== 'undefined' && process.env;
const isBrowser = typeof window !== 'undefined';

// Initialize global BBAPI_LOGGING by checking environment settings directly
// This avoids needing to import shouldLogBbapi at module load time
let logPath: string | null = null;

const BBAPI_LOGGING: boolean = (() => {
  if (isNode && process.env.BBAPI_DEBUG_LOG) {
    logPath = process.env.BBAPI_DEBUG_LOG;
    console.log(`BBAPI logging enabled (node mode): ${logPath}`);
    return true;
  }

  if (isBrowser) {
    try {
      if (typeof localStorage !== 'undefined') {
        const localStorageValue = localStorage.getItem('BBAPI_DEBUG_LOG');
        if (localStorageValue && localStorageValue.length > 0) {
          console.log('BBAPI logging enabled (browser mode)');
          return true;
        }
      }

      if (window.location) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('BBAPI_DEBUG_LOG')) {
          console.log('BBAPI logging enabled (browser mode)');
          return true;
        }
      }
    } catch (e) {
      // Silent fail
    }
  }

  return false;
})();

export { BBAPI_LOGGING };

// Global list of bbapi calls
const BBAPI_CALL_LOG: Uint8Array[] = [];

/**
 * Log a BBAPI call (msgpack buffer).
 * This is called automatically by the generated API code.
 *
 * @param msgpackBuffer - The msgpack-encoded request buffer
 */
export function logBbapiCall(msgpackBuffer: Uint8Array): void {
  if (!BBAPI_LOGGING) {
    return;
  }

  // Store a copy of the buffer
  BBAPI_CALL_LOG.push(new Uint8Array(msgpackBuffer));
}

/**
 * Save all logged BBAPI calls to a file.
 * This is called automatically in Backend destroy methods.
 * Uses dynamic import to avoid bundling both browser and node code.
 */
export function flushBbapiLogs(): void {
  if (BBAPI_CALL_LOG.length === 0) {
    return;
  }

  // Dynamically import the appropriate implementation to avoid bundling both
  if (isNode && logPath) {
    import('./node/bbapi_log.js')
      .then(({ saveBbapiLogs }) => {
        saveBbapiLogs(BBAPI_CALL_LOG, logPath!);
        BBAPI_CALL_LOG.length = 0;
      })
      .catch(e => {
        console.error('Failed to save BBAPI logs (node):', e);
      });
  } else if (isBrowser) {
    import('./browser/bbapi_log.js')
      .then(({ saveBbapiLogs }) => {
        saveBbapiLogs(BBAPI_CALL_LOG);
        BBAPI_CALL_LOG.length = 0;
      })
      .catch(e => {
        console.error('Failed to save BBAPI logs (browser):', e);
      });
  }
}

/**
 * Get the current number of logged calls.
 */
export function getBbapiLogCount(): number {
  return BBAPI_CALL_LOG.length;
}

/**
 * Clear all logged BBAPI calls without saving.
 */
export function clearBbapiLogs(): void {
  BBAPI_CALL_LOG.length = 0;
}
