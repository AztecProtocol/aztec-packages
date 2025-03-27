import { rm } from 'fs/promises';

import type { Logger } from '../log/index.js';

export async function tryRmDir(dir: string | undefined, logger?: Logger): Promise<void> {
  if (dir === undefined) {
    return;
  }
  try {
    logger?.debug(`Cleaning up directory at ${dir}`);
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch (err) {
    logger?.warn(`Failed to delete directory at ${dir}: ${err}`);
  }
}
