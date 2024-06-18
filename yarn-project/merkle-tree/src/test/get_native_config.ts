import { type DebugLogger, fileURLToPath } from '@aztec/aztec.js';

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

const {
  BB_RELEASE_DIR = 'barretenberg/cpp/build/bin',
  WORLD_STATE_BINARY_PATH,
  TEMP_DIR = tmpdir(),
  DATA_DIRECTORY = '',
} = process.env;

export const getWorldStateConfig = async (
  logger: DebugLogger,
): Promise<{ worldStateBinaryPath: string; } | undefined> => {
  try {
    const worldStateBinaryPath =
    WORLD_STATE_BINARY_PATH ??
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../', BB_RELEASE_DIR, 'world_state');
    await fs.access(worldStateBinaryPath, fs.constants.R_OK);

    return { worldStateBinaryPath };
  } catch (err) {
    logger.error(`Native BB not available, error: ${err}`);
    return undefined;
  }
};
