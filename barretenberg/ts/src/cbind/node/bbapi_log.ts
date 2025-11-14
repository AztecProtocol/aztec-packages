/**
 * Node.js-specific BBAPI call logging utilities
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Checks if BBAPI logging should be enabled in Node.js environment.
 * Returns the directory path if the BBAPI_DEBUG_LOG environment variable is set.
 *
 * @returns The directory path if logging is enabled, null otherwise
 */
export function shouldLogBbapi(): string | null {
  const logPath = process.env.BBAPI_DEBUG_LOG;
  if (logPath && logPath.length > 0) {
    return logPath;
  }
  return null;
}

/**
 * Saves BBAPI logs as a timestamped msgpack file in Node.js.
 * Creates a msgpack file with size-prefixed objects.
 *
 * Format: [4-byte size][msgpack data][4-byte size][msgpack data]...
 * This matches the format that `bb msgpack run` accepts.
 *
 * @param logs - Array of msgpack buffers to save
 * @param logDirectory - Directory where the log file should be saved
 */
export function saveBbapiLogs(logs: Uint8Array[], logDirectory: string): void {
  if (logs.length === 0) {
    return;
  }

  try {
    // Create directory if it doesn't exist
    mkdirSync(logDirectory, { recursive: true });

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

    // Create timestamped filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `bbapi-logs-${timestamp}.msgpack`;
    const filepath = join(logDirectory, filename);

    // Write to file
    writeFileSync(filepath, buffer);

    console.log(`BBAPI logs saved: ${filepath} (${logs.length} calls, ${totalSize} bytes)`);
  } catch (e) {
    console.error('Failed to save BBAPI logs:', e);
  }
}
