import { rm } from 'fs/promises';

import type { Logger } from '../log/index.js';

export async function tryRmDir(dir: string | undefined, logger?: Logger): Promise<void> {
  if (dir === undefined) {
    return;
  }
  try {
    logger?.verbose(`Cleaning up directory at ${dir}`);
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch (err) {
    logger?.warn(`Failed to delete directory at ${dir}: ${err}`);
  }
}
