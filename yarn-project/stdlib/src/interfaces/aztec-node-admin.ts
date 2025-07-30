import { createSafeJsonRpcClient, defaultFetch } from '@aztec/foundation/json-rpc/client';

import { z } from 'zod';

import type { ApiSchemaFor } from '../schemas/schemas.js';
import { type ComponentsVersions, getVersioningResponseHandler } from '../versioning/index.js';
import { type SequencerConfig, SequencerConfigSchema } from './configs.js';
import { type ProverConfig, ProverConfigSchema } from './prover-client.js';
import { type SlasherConfig, SlasherConfigSchema } from './slasher.js';

/**
 * Aztec node admin API.
 */
export interface AztecNodeAdmin {
  /**
   * Retrieves the configuration of this node.
   */
  getConfig(): Promise<AztecNodeAdminConfig>;

  /**
   * Updates the configuration of this node.
   * @param config - Updated configuration to be merged with the current one.
   */
  setConfig(config: Partial<AztecNodeAdminConfig>): Promise<void>;

  /**
   * Pauses syncing, creates a backup of archiver and world-state databases, and uploads them. Returns immediately.
   * @param location - The location to upload the snapshot to.
   */
  startSnapshotUpload(location: string): Promise<void>;

  /**
   * Pauses syncing and rolls back the database to the target L2 block number.
   * @param targetBlockNumber - The block number to roll back to.
   * @param force - If true, clears the world state db and p2p dbs if rolling back to behind the finalized block.
   */
  rollbackTo(targetBlockNumber: number, force?: boolean): Promise<void>;

  /** Pauses archiver and world state syncing. */
  pauseSync(): Promise<void>;

  /** Resumes archiver and world state syncing. */
  resumeSync(): Promise<void>;
}

export type AztecNodeAdminConfig = SequencerConfig & ProverConfig & SlasherConfig & { maxTxPoolSize: number };

export const AztecNodeAdminConfigSchema = SequencerConfigSchema.merge(ProverConfigSchema)
  .merge(SlasherConfigSchema)
  .merge(z.object({ maxTxPoolSize: z.number() }));

export const AztecNodeAdminApiSchema: ApiSchemaFor<AztecNodeAdmin> = {
  getConfig: z.function().returns(AztecNodeAdminConfigSchema),
  setConfig: z.function().args(AztecNodeAdminConfigSchema.partial()).returns(z.void()),
  startSnapshotUpload: z.function().args(z.string()).returns(z.void()),
  rollbackTo: z.function().args(z.number()).returns(z.void()),
  pauseSync: z.function().returns(z.void()),
  resumeSync: z.function().returns(z.void()),
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
