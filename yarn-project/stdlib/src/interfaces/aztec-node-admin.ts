import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { createSafeJsonRpcClient, defaultFetch } from '@aztec/foundation/json-rpc/client';

import { z } from 'zod';

import type { ApiSchemaFor } from '../schemas/schemas.js';
import { optional } from '../schemas/schemas.js';
import { type Offense, OffenseSchema } from '../slashing/index.js';
import { type ComponentsVersions, getVersioningResponseHandler } from '../versioning/index.js';
import { type ArchiverSpecificConfig, ArchiverSpecificConfigSchema } from './archiver.js';
import { type SequencerConfig, SequencerConfigSchema } from './configs.js';
import { type ProverConfig, ProverConfigSchema } from './prover-client.js';
import { type SlasherConfig, SlasherConfigSchema } from './slasher.js';
import { type ValidatorClientFullConfig, ValidatorClientFullConfigSchema } from './validator.js';

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
   * @param resumeSync - If true (default), resumes archiver and world state sync after rollback.
   */
  rollbackTo(targetBlockNumber: number, force?: boolean, resumeSync?: boolean): Promise<void>;

  /** Pauses archiver and world state syncing. */
  pauseSync(): Promise<void>;

  /** Resumes archiver and world state syncing. */
  resumeSync(): Promise<void>;

  /**
   * Pauses block production. Pending txs remain in the mempool; no new blocks will be
   * produced until {@link resumeSequencer} is called. Throws if no sequencer is running.
   */
  pauseSequencer(): Promise<void>;

  /** Resumes block production previously paused via {@link pauseSequencer}. */
  resumeSequencer(): Promise<void>;

  /** Returns all offenses applicable for the given round. */
  getSlashOffenses(round: bigint | 'all' | 'current'): Promise<Offense[]>;

  /**
   * Reloads keystore configuration from disk.
   *
   * What is updated:
   * - Validator attester keys
   * - Coinbase address per validator
   * - Fee recipient address per validator
   *
   * What is NOT updated (requires node restart):
   * - L1 publisher signers (the funded accounts that send L1 transactions)
   * - Prover keys
   * - HA signer PostgreSQL connections
   *
   * Notes:
   * - New validators must use a publisher key that was already configured at node
   *   startup (or omit the publisher field to fall back to the attester key).
   *   A validator with an unknown publisher key will cause the reload to be rejected.
   */
  reloadKeystore(): Promise<void>;
}

// L1 contract addresses are pinned at startup and are not mutable via admin updates.
export type AztecNodeAdminConfig = Omit<ValidatorClientFullConfig, keyof L1ContractAddresses> &
  SequencerConfig &
  ProverConfig &
  SlasherConfig &
  Pick<
    ArchiverSpecificConfig,
    'archiverPollingIntervalMS' | 'archiverBatchSize' | 'skipValidateCheckpointAttestations'
  > & {
    maxPendingTxCount: number;
    // Keep in sync with P2PConfig.skipIncomingProposals (circular dep prevents Pick<P2PConfig, ...> here)
    skipIncomingProposals?: boolean;
    // Keep in sync with P2PConfig.preferredPeers (circular dep prevents Pick<P2PConfig, ...> here)
    preferredPeers?: string[];
  };

export const AztecNodeAdminConfigSchema = SequencerConfigSchema.merge(ProverConfigSchema)
  .merge(SlasherConfigSchema)
  .merge(ValidatorClientFullConfigSchema.omit({ rollupAddress: true }))
  .merge(
    ArchiverSpecificConfigSchema.pick({
      archiverPollingIntervalMS: true,
      archiverBatchSize: true,
      skipValidateCheckpointAttestations: true,
    }),
  )
  .merge(
    z.object({
      maxPendingTxCount: z.number(),
      skipIncomingProposals: z.boolean().optional(),
      preferredPeers: z.array(z.string()).optional(),
    }),
  );

export const AztecNodeAdminApiSchema: ApiSchemaFor<AztecNodeAdmin> = {
  getConfig: z.function({ input: z.tuple([]), output: AztecNodeAdminConfigSchema }),
  setConfig: z.function({ input: z.tuple([AztecNodeAdminConfigSchema.partial()]), output: z.void() }),
  startSnapshotUpload: z.function({ input: z.tuple([z.string()]), output: z.void() }),
  rollbackTo: z.function({
    input: z.tuple([z.number(), optional(z.boolean()), optional(z.boolean())]),
    output: z.void(),
  }),
  pauseSync: z.function({ input: z.tuple([]), output: z.void() }),
  resumeSync: z.function({ input: z.tuple([]), output: z.void() }),
  pauseSequencer: z.function({ input: z.tuple([]), output: z.void() }),
  resumeSequencer: z.function({ input: z.tuple([]), output: z.void() }),
  getSlashOffenses: z.function({
    input: z.tuple([z.union([z.bigint(), z.literal('all'), z.literal('current')])]),
    output: z.array(OffenseSchema),
  }),
  reloadKeystore: z.function({ input: z.tuple([]), output: z.void() }),
};

export function createAztecNodeAdminClient(
  url: string,
  versions: Partial<ComponentsVersions> = {},
  fetch = defaultFetch,
  apiKey?: string,
): AztecNodeAdmin {
  return createSafeJsonRpcClient<AztecNodeAdmin>(url, AztecNodeAdminApiSchema, {
    namespaceMethods: 'aztecAdmin',
    fetch,
    onResponse: getVersioningResponseHandler(versions),
    ...(apiKey ? { extraHeaders: { 'x-api-key': apiKey } } : {}),
  });
}
