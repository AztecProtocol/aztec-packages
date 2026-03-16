import type { Logger } from '@aztec/aztec.js/log';
import type { BBConfig } from '@aztec/bb-prover';
import { tryRmDir } from '@aztec/foundation/fs';

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';
import { fileURLToPath } from 'url';

const {
  BB_RELEASE_DIR = 'barretenberg/cpp/build/bin',
  BB_BINARY_PATH,
  BB_SKIP_CLEANUP = '',
  TEMP_DIR = tmpdir(),
  BB_WORKING_DIRECTORY = '',
  BB_IVC_CONCURRENCY = '1',
  BB_NUM_IVC_VERIFIERS = '8',
  BB_RPC_VERIFY_BATCH_SIZE,
  BB_PEER_VERIFY_BATCH_SIZE,
} = process.env;

export const getBBConfig = async (
  logger: Logger,
): Promise<(BBConfig & { cleanup: () => Promise<void> }) | undefined> => {
  try {
    const bbBinaryPath =
      BB_BINARY_PATH ??
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../', BB_RELEASE_DIR, 'bb-avm');
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
    const cleanup = bbSkipCleanup ? () => Promise.resolve() : () => tryRmDir(directoryToCleanup);

    const ivcConcurrency = Number(BB_IVC_CONCURRENCY);

    const numIvcVerifiers = Number(BB_NUM_IVC_VERIFIERS);

    return {
      bbSkipCleanup,
      bbBinaryPath,
      bbWorkingDirectory,
      cleanup,
      bbIVCConcurrency: ivcConcurrency,
      bbRpcVerifyBatchSize: BB_RPC_VERIFY_BATCH_SIZE ? Number(BB_RPC_VERIFY_BATCH_SIZE) : numIvcVerifiers,
      bbPeerVerifyBatchSize: BB_PEER_VERIFY_BATCH_SIZE ? Number(BB_PEER_VERIFY_BATCH_SIZE) : numIvcVerifiers,
    };
  } catch (err) {
    logger.error(`Native BB not available, error: ${err}`);
    return undefined;
  }
};
