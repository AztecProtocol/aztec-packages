import {
  BlockNumberSchema,
  CheckpointNumberSchema,
  IndexWithinCheckpointSchema,
} from '@aztec/foundation/branded-types';
import type { BlockNumber, CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import type { PickIfFlag, Prettify } from '@aztec/foundation/types';

import { z } from 'zod';

import { BlockHash } from '../block/block_hash.js';
import { Body } from '../block/body.js';
import { CommitteeAttestation } from '../block/proposal/committee_attestation.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { BlockHeader } from '../tx/block_header.js';
import { type L1PublishInfo, L1PublishInfoSchema } from './l1_publish_info.js';

/** Options for narrowing the response of `getBlock`. */
export type BlockIncludeOptions = {
  /** Include the block body (tx effects). Off by default. */
  includeTransactions?: boolean;
  /** Include L1 publish info (populated with `published: false` if not yet on L1). Off by default. */
  includeL1PublishInfo?: boolean;
  /** Include committee attestations. Empty array until the block's checkpoint is published. Off by default. */
  includeAttestations?: boolean;
};

export const BlockIncludeOptionsSchema: z.ZodType<BlockIncludeOptions> = z.object({
  includeTransactions: z.boolean().optional(),
  includeL1PublishInfo: z.boolean().optional(),
  includeAttestations: z.boolean().optional(),
});

/** Options for narrowing the response of `getBlocks` (range). Extends single-block options with range-only flags. */
export type BlocksIncludeOptions = BlockIncludeOptions & {
  /** Only return blocks that belong to a confirmed L1 checkpoint. Off by default. */
  onlyCheckpointed?: boolean;
};

export const BlocksIncludeOptionsSchema: z.ZodType<BlocksIncludeOptions> = z.object({
  includeTransactions: z.boolean().optional(),
  includeL1PublishInfo: z.boolean().optional(),
  includeAttestations: z.boolean().optional(),
  onlyCheckpointed: z.boolean().optional(),
});

/** Required metadata always present on a {@link BlockResponse}. */
export type BlockResponseBase = {
  /** Block header. */
  header: BlockHeader;
  /** Archive tree snapshot after this block. */
  archive: AppendOnlyTreeSnapshot;
  /** Hash of the block header. */
  hash: BlockHash;
  /** Checkpoint number this block belongs to. */
  checkpointNumber: CheckpointNumber;
  /** Position of the block within its checkpoint. */
  indexWithinCheckpoint: IndexWithinCheckpoint;
  /** L2 block number. */
  number: BlockNumber;
};

/**
 * RPC-surface representation of an L2 block.
 *
 * Generic over the include-options so that flagged fields become required when the caller passes a
 * literal `true`. The default type argument ({@link BlockIncludeOptions}) yields the widest shape
 * (all include-fields optional) — this is what the JSON-RPC wire layer validates against.
 *
 * @example
 * const b: BlockResponse<{ includeTransactions: true }> = await node.getBlock(1, { includeTransactions: true });
 * b.body; // required, not optional
 */
export type BlockResponse<Opts extends BlockIncludeOptions = BlockIncludeOptions> = Prettify<
  BlockResponseBase &
    PickIfFlag<BlockIncludeOptions, Opts, 'includeTransactions', { body: Body }> &
    PickIfFlag<BlockIncludeOptions, Opts, 'includeL1PublishInfo', { l1: L1PublishInfo }> &
    PickIfFlag<BlockIncludeOptions, Opts, 'includeAttestations', { attestations: CommitteeAttestation[] }>
>;

/** Zod schema for the widest {@link BlockResponse} shape (all include-gated fields optional). */
export const BlockResponseSchema = z.object({
  header: BlockHeader.schema,
  archive: AppendOnlyTreeSnapshot.schema,
  hash: BlockHash.schema,
  checkpointNumber: CheckpointNumberSchema,
  indexWithinCheckpoint: IndexWithinCheckpointSchema,
  number: BlockNumberSchema,
  body: Body.schema.optional(),
  l1: L1PublishInfoSchema.optional(),
  attestations: z.array(CommitteeAttestation.schema).optional(),
});
