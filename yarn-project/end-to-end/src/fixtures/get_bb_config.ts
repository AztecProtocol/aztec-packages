import { type Logger, fileURLToPath } from '@aztec/aztec.js';
import { type BBConfig } from '@aztec/bb-prover';

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

const {
  BB_RELEASE_DIR = 'barretenberg/cpp/build/bin',
  BB_BINARY_PATH,
  BB_SKIP_CLEANUP = '',
  TEMP_DIR = tmpdir(),
  BB_WORKING_DIRECTORY = '',
} = process.env;

export const getBBConfig = async (
  logger: Logger,
): Promise<(BBConfig & { cleanup: () => Promise<void> }) | undefined> => {
  try {
    const bbBinaryPath =
      BB_BINARY_PATH ??
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../', BB_RELEASE_DIR, 'bb');
    await fs.access(bbBinaryPath, fs.constants.R_OK);

    let bbWorkingDirectory: string;
    let directoryToCleanup: string | undefined;

    if (BB_WORKING_DIRECTORY) {
      bbWorkingDirectory = BB_WORKING_DIRECTORY;
    } else {
      bbWorkingDirectory = await fs.mkdtemp(path.join(TEMP_DIR, 'bb-'));
      directoryToCleanup = bbWorkingDirectory;
    }

    await fs.mkdir(bbWorkingDirectory, { recursive: true });

    const bbSkipCleanup = ['1', 'true'].includes(BB_SKIP_CLEANUP);

    const cleanup = async () => {
      if (directoryToCleanup && !bbSkipCleanup) {
        await fs.rm(directoryToCleanup, { recursive: true, force: true });
      }
    };

    return { bbSkipCleanup, bbBinaryPath, bbWorkingDirectory, cleanup };
  } catch (err) {
    logger.error(`Native BB not available, error: ${err}`);
    return undefined;
  }
};
