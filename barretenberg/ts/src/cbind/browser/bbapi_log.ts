/**
 * Browser-specific BBAPI call logging utilities
 */

/**
 * Checks if BBAPI logging should be enabled in browser environment.
 * Checks:
 * 1. localStorage for 'BBAPI_DEBUG_LOG' key
 * 2. URL query parameter 'BBAPI_DEBUG_LOG'
 */
export function shouldLogBbapi(): boolean {
  try {
    // Check localStorage
    if (typeof localStorage !== 'undefined') {
      const localStorageValue = localStorage.getItem('BBAPI_DEBUG_LOG');
      if (localStorageValue && localStorageValue.length > 0) {
        return true;
      }
    }

    // Check URL query parameter
    if (typeof window !== 'undefined' && window.location) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('BBAPI_DEBUG_LOG')) {
        return true;
      }
    }
  } catch (e) {
    // Silently fail if localStorage or window is not available
  }

  return false;
}

/**
 * Saves BBAPI logs as a downloadable file in the browser.
 * Creates a msgpack file with size-prefixed objects and triggers a download.
 *
 * Format: [4-byte size][msgpack data][4-byte size][msgpack data]...
 * This matches the format that `bb msgpack run` accepts.
 *
 * @param logs - Array of msgpack buffers to save
 */
export function saveBbapiLogs(logs: Uint8Array[]): void {
  if (logs.length === 0) {
    return;
  }

  try {
    // Calculate total size: 4 bytes per entry for size prefix + actual data
    let totalSize = 0;
    for (const log of logs) {
      totalSize += 4 + log.length;
    }

    // Create buffer with size-prefixed entries
    const buffer = new Uint8Array(totalSize);
    let offset = 0;

    for (const log of logs) {
      // Write 4-byte size prefix (little-endian)
      const size = log.length;
      buffer[offset] = size & 0xff;
      buffer[offset + 1] = (size >> 8) & 0xff;
      buffer[offset + 2] = (size >> 16) & 0xff;
      buffer[offset + 3] = (size >> 24) & 0xff;
      offset += 4;

      // Write the msgpack data
      buffer.set(log, offset);
      offset += log.length;
    }

    // Create blob and trigger download
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `bbapi-logs-${timestamp}.msgpack`;

    // Create temporary anchor element to trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    console.log(`BBAPI logs saved: ${filename} (${logs.length} calls, ${totalSize} bytes)`);
  } catch (e) {
    console.error('Failed to save BBAPI logs:', e);
  }
}
