import { promises as fs } from 'fs';
import * as path from 'path';

import { createLogger } from '../log/pino-logger.js';

// Create a random directory underneath a 'base' directory
// Calls a provided method, ensures the random directory is cleaned up afterwards unless the operation fails
export async function runInDirectory<T>(
  workingDirBase: string,
  fn: (dir: string) => Promise<T>,
  skipCleanup: boolean | undefined,
  logger = createLogger('foundation:run-in-directory'),
): Promise<T> {
  // Create random directory to be used for temp files
  const workingDirectory = await fs.mkdtemp(path.join(workingDirBase, 'tmp-'));

  await fs.access(workingDirectory);

  try {
    return await fn(workingDirectory);
  } catch (err) {
    skipCleanup = true;
    throw err;
  } finally {
    if (!skipCleanup) {
      try {
        await fs.rm(workingDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch (err) {
        logger.warn(`Failed to cleanup temporary directory ${workingDirectory}: ${err}`, { err });
      }
    }
  }
}
