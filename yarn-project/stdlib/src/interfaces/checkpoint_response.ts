import { BlockNumberSchema, CheckpointNumberSchema } from '@aztec/foundation/branded-types';
import type { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';
import type { PickIfFlag, Prettify } from '@aztec/foundation/types';

import { z } from 'zod';

import { CommitteeAttestation } from '../block/proposal/committee_attestation.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { type BlockResponse, BlockResponseSchema } from './block_response.js';
import { type L1PublishInfo, L1PublishInfoSchema } from './l1_publish_info.js';

/** Options for narrowing the response of `getCheckpoint` / `getCheckpoints`. */
export type CheckpointIncludeOptions = {
  /** Include the nested blocks. Off by default. */
  includeBlocks?: boolean;
  /** When `includeBlocks` is true, include each block's body (tx effects). Off by default. No-op if `includeBlocks` is false. */
  includeTransactions?: boolean;
  /** Include L1 publish info. Off by default. */
  includeL1PublishInfo?: boolean;
  /** Include committee attestations. Off by default. */
  includeAttestations?: boolean;
};

export const CheckpointIncludeOptionsSchema: z.ZodType<CheckpointIncludeOptions> = z.object({
  includeBlocks: z.boolean().optional(),
  includeTransactions: z.boolean().optional(),
  includeL1PublishInfo: z.boolean().optional(),
  includeAttestations: z.boolean().optional(),
});

/** Required metadata always present on a {@link CheckpointResponse}. */
export type CheckpointResponseBase = {
  /** Checkpoint number. */
  number: CheckpointNumber;
  /** Checkpoint header. */
  header: CheckpointHeader;
  /** Archive tree snapshot after this checkpoint. */
  archive: AppendOnlyTreeSnapshot;
  /** Hash of the checkpoint out messages. */
  checkpointOutHash: Fr;
  /** First block number in this checkpoint. */
  startBlock: BlockNumber;
  /** Number of blocks in this checkpoint. */
  blockCount: number;
  /** Fee asset price modifier in basis points applied during this checkpoint. */
  feeAssetPriceModifier: bigint;
};

// Only forward `includeTransactions` to nested blocks — the other include-flags on the checkpoint
// options do not apply to the nested block responses (those carry no independent L1 / attestations).
type NestedBlockOpts<Opts> = Opts extends { includeTransactions: true } ? { includeTransactions: true } : {};

/**
 * RPC-surface representation of an L2 checkpoint.
 *
 * Generic over the include-options so that flagged fields become required when the caller passes a
 * literal `true`. Only `includeTransactions` is forwarded to nested blocks, so
 * `includeL1PublishInfo` / `includeAttestations` on a checkpoint request do not imply the same on
 * its nested blocks. The default type argument ({@link CheckpointIncludeOptions}) yields the
 * widest shape — what the JSON-RPC wire layer validates against.
 */
export type CheckpointResponse<Opts extends CheckpointIncludeOptions = CheckpointIncludeOptions> = Prettify<
  CheckpointResponseBase &
    PickIfFlag<CheckpointIncludeOptions, Opts, 'includeBlocks', { blocks: BlockResponse<NestedBlockOpts<Opts>>[] }> &
    PickIfFlag<CheckpointIncludeOptions, Opts, 'includeL1PublishInfo', { l1: L1PublishInfo }> &
    PickIfFlag<CheckpointIncludeOptions, Opts, 'includeAttestations', { attestations: CommitteeAttestation[] }>
>;

/** Zod schema for the widest {@link CheckpointResponse} shape (all include-gated fields optional). */
export const CheckpointResponseSchema = z.object({
  number: CheckpointNumberSchema,
  header: CheckpointHeader.schema,
  archive: AppendOnlyTreeSnapshot.schema,
  checkpointOutHash: schemas.Fr,
  startBlock: BlockNumberSchema,
  blockCount: z.number(),
  feeAssetPriceModifier: schemas.BigInt,
  blocks: z.array(BlockResponseSchema).optional(),
  l1: L1PublishInfoSchema.optional(),
  attestations: z.array(CommitteeAttestation.schema).optional(),
});
