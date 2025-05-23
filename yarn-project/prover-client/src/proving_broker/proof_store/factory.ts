import { createLogger } from '@aztec/foundation/log';

import { GoogleCloudStorageProofStore } from './gcs_proof_store.js';
import { InlineProofStore } from './inline_proof_store.js';
import type { ProofStore } from './proof_store.js';

export function createProofStore(config: string | undefined, logger = createLogger('prover-client:proof-store')) {
  if (config === undefined) {
    logger.info('Creating inline proof store');
    return new InlineProofStore();
  } else if (config.startsWith('gs://')) {
    try {
      const url = new URL(config);
      const bucket = url.host;
      const path = url.pathname.replace(/^\/+/, '');
      logger.info(`Creating google cloud proof store at ${bucket}`, { bucket, path });
      return new GoogleCloudStorageProofStore(bucket, path);
    } catch {
      throw new Error(
        `Invalid google cloud proof store definition: '${config}'. Supported values are 'gs://bucket-name/path/to/store'.`,
      );
    }
  } else {
    throw new Error(`Unknown proof store config: '${config}'. Supported values are 'gs://bucket-name/path/to/store'.`);
  }
}

export function createProofStoreForUri(
  uri: string,
  logger = createLogger('prover-client:proof-store'),
): Pick<ProofStore, 'getProofInput' | 'getProofOutput'> {
  if (uri.startsWith('data://')) {
    return createProofStore(undefined, logger);
  } else if (uri.startsWith('gs://')) {
    const url = new URL(uri);
    const basePath = url.pathname.replace(/^\/+/, '').split('/').slice(0, -3);
    url.pathname = basePath.join('/');
    return createProofStore(uri, logger);
  } else {
    throw new Error(`Unknown proof store config: '${uri}'. Supported protocols are 'data://' and 'gs://'.`);
  }
}
