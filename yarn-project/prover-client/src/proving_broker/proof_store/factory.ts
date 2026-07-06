import { createFileStore } from '@aztec/file-store';
import { createLogger } from '@aztec/foundation/log';

import { FileStoreProofStore } from './file_store_proof_store.js';
import { InlineProofStore } from './inline_proof_store.js';
import type { ProofStore } from './proof_store.js';

export async function createProofStore(
  config: string | undefined,
  logger = createLogger('prover-client:proof-store'),
): Promise<ProofStore> {
  if (!config) {
    logger.info('Creating inline proof store');
    return new InlineProofStore();
  }

  const fileStore = await createFileStore(config, logger);
  logger.info(`Creating file store proof store at ${config}`);
  return new FileStoreProofStore(fileStore);
}
