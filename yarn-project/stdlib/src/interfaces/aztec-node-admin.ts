import { createSafeJsonRpcClient, defaultFetch } from '@aztec/foundation/json-rpc/client';

import { z } from 'zod';

import type { ApiSchemaFor } from '../schemas/schemas.js';
import { type ComponentsVersions, getVersioningResponseHandler } from '../versioning/index.js';
import { type SequencerConfig, SequencerConfigSchema } from './configs.js';
import { type ProverConfig, ProverConfigSchema } from './prover-client.js';

/**
 * Aztec node admin API.
 */
export interface AztecNodeAdmin {
  /**
   * Updates the configuration of this node.
   * @param config - Updated configuration to be merged with the current one.
   */
  setConfig(config: Partial<SequencerConfig & ProverConfig>): Promise<void>;

  /**
   * Forces the next block to be built bypassing all time and pending checks.
   * Useful for testing.
   */
  flushTxs(): Promise<void>;

  /**
   * Pauses syncing, creates a backup of archiver and world-state databases, and uploads them. Returns immediately.
   * @param location - The location to upload the snapshot to.
   */
  startSnapshotUpload(location: string): Promise<void>;
}

export const AztecNodeAdminApiSchema: ApiSchemaFor<AztecNodeAdmin> = {
  setConfig: z.function().args(SequencerConfigSchema.merge(ProverConfigSchema).partial()).returns(z.void()),
  flushTxs: z.function().returns(z.void()),
  startSnapshotUpload: z.function().args(z.string()).returns(z.void()),
};

export function createAztecNodeAdminClient(
  url: string,
  versions: Partial<ComponentsVersions> = {},
  fetch = defaultFetch,
): AztecNodeAdmin {
  return createSafeJsonRpcClient<AztecNodeAdmin>(url, AztecNodeAdminApiSchema, {
    namespaceMethods: 'nodeAdmin',
    fetch,
    onResponse: getVersioningResponseHandler(versions),
  });
}
