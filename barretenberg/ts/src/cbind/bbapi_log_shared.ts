/**
 * Shared BBAPI logging infrastructure
 * Initializes BBAPI_LOGGING global by calling shouldLogBbapi from the appropriate environment
 */

// Import utilities based on environment
//  These will be resolved at build time to the correct implementation
import { shouldLogBbapi as shouldLogBbapiNode, saveBbapiLogs as saveBbapiLogsNode } from './node/bbapi_log.js';
import { shouldLogBbapi as shouldLogBbapiBrowser, saveBbapiLogs as saveBbapiLogsBrowser } from './browser/bbapi_log.js';

// Detect environment
const isNode = typeof process !== 'undefined' && process.env;
const isBrowser = typeof window !== 'undefined';

// Initialize global BBAPI_LOGGING by calling shouldLogBbapi from correct environment
let logPath: string | boolean | null = null;

if (isNode) {
  logPath = shouldLogBbapiNode();
} else if (isBrowser) {
  logPath = shouldLogBbapiBrowser();
}

export const BBAPI_LOGGING: boolean = logPath !== null && logPath !== false;

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
 * This is called automatically in Backend destroy methods or in finally blocks.
 */
export function flushBbapiLogs(): void {
  if (!BBAPI_LOGGING || BBAPI_CALL_LOG.length === 0) {
    return;
  }

  // Call the appropriate save function based on environment
  if (isNode && typeof logPath === 'string') {
    saveBbapiLogsNode(BBAPI_CALL_LOG, logPath);
    BBAPI_CALL_LOG.length = 0;
  } else if (isBrowser) {
    saveBbapiLogsBrowser(BBAPI_CALL_LOG);
    BBAPI_CALL_LOG.length = 0;
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
