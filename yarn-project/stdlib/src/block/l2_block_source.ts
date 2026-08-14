import {
  BlockNumber,
  BlockNumberSchema,
  CheckpointNumber,
  CheckpointNumberSchema,
  type EpochNumber,
  EpochNumberSchema,
  type SlotNumber,
  SlotNumberSchema,
} from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { schemas } from '@aztec/foundation/schemas';
import type { TypedEventEmitter } from '@aztec/foundation/types';

import { z } from 'zod';

import type { CheckpointData, ProposedCheckpointData, ProposedCheckpointInput } from '../checkpoint/checkpoint_data.js';
import type { CheckpointInfo } from '../checkpoint/checkpoint_info.js';
import type { PublishedCheckpoint } from '../checkpoint/published_checkpoint.js';
import type { L1RollupConstants } from '../epoch-helpers/index.js';
import { MAX_RPC_CHECKPOINTS_DATA_LEN } from '../interfaces/api_limit.js';
import type { L2ToL1MembershipWitness } from '../messaging/l2_to_l1_membership.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import type { IndexedTxEffect } from '../tx/indexed_tx_effect.js';
import type { TxHash } from '../tx/tx_hash.js';
import type { BlockData } from './block_data.js';
import { BlockHash } from './block_hash.js';
import { BlockTagWithoutLatestSchema, type NormalizedBlockParameter } from './block_parameter.js';
import type { L2Block } from './l2_block.js';
import type { ValidateCheckpointNegativeResult, ValidateCheckpointResult } from './validate_block_result.js';

/** Lookup a single block by block number, hash, archive root, or chain-tip tag. */
export type BlockQuery = NormalizedBlockParameter;

/**
 * Query a range of blocks by start/limit or by epoch.
 *
 * The `epoch` variant requires `onlyCheckpointed: true` because epoch boundaries are only
 * meaningful for the checkpointed chain — the proposed chain may include uncheckpointed
 * blocks past the epoch boundary that callers should not receive.
 */
export type BlocksQuery =
  | { from: BlockNumber; limit: number; onlyCheckpointed?: boolean }
  | { epoch: EpochNumber; onlyCheckpointed: true };

export const BlockQuerySchema: z.ZodType<BlockQuery, unknown> = z.union([
  z.object({ number: BlockNumberSchema }).strict(),
  z.object({ hash: BlockHash.schema }).strict(),
  z.object({ archive: schemas.Fr }).strict(),
  z.object({ tag: BlockTagWithoutLatestSchema }).strict(),
]);

export const BlocksQuerySchema: z.ZodType<BlocksQuery, unknown> = z.union([
  z
    .object({ from: BlockNumberSchema, limit: z.number().int().min(1), onlyCheckpointed: z.boolean().optional() })
    .strict(),
  z.object({ epoch: EpochNumberSchema, onlyCheckpointed: z.literal(true) }).strict(),
]);

/** Lookup a single confirmed checkpoint by checkpoint number, slot, or chain-tip tag. */
export type CheckpointQuery =
  | { number: CheckpointNumber }
  | { slot: SlotNumber }
  | { tag: 'checkpointed' | 'proven' | 'finalized' };

/**
 * Query a range of confirmed checkpoints by start/limit, by slot anchor, or by epoch.
 *
 * The `fromSlot` variant walks the slot index: it returns up to `limit` checkpoints anchored at
 * `fromSlot`, ordered nearest-first. With `reverse` it takes the checkpoints at or before the slot
 * (descending); otherwise the checkpoints at or after it (ascending). Use `limit: 1, reverse: true`
 * to find the latest checkpoint at or before a slot in a single range scan.
 */
export type CheckpointsQuery =
  | { from: CheckpointNumber; limit: number }
  | { fromSlot: SlotNumber; limit: number; reverse?: boolean }
  | { epoch: EpochNumber };

/**
 * Lookup a proposed (archiver-internal, not-yet-L1-confirmed) checkpoint.
 * Distinct from CheckpointQuery because proposed checkpoints have a different shape
 * (no l1, no attestations, but carries totalManaUsed) and live in their own LMDB map.
 */
export type ProposedCheckpointQuery = { number: CheckpointNumber } | { slot: SlotNumber } | { tag: 'proposed' };

export const CheckpointQuerySchema: z.ZodType<CheckpointQuery, unknown> = z.union([
  z.object({ number: CheckpointNumberSchema }).strict(),
  z.object({ slot: SlotNumberSchema }).strict(),
  z.object({ tag: z.union([z.literal('checkpointed'), z.literal('proven'), z.literal('finalized')]) }).strict(),
]);

const checkpointsQueryLimitSchema = () =>
  z
    .number()
    .int()
    .min(1)
    .max(MAX_RPC_CHECKPOINTS_DATA_LEN, {
      message: `limit must be at most ${MAX_RPC_CHECKPOINTS_DATA_LEN}`,
    });

export const CheckpointsQuerySchema: z.ZodType<CheckpointsQuery, unknown> = z.union([
  z.object({ from: CheckpointNumberSchema, limit: checkpointsQueryLimitSchema() }).strict(),
  z
    .object({ fromSlot: SlotNumberSchema, limit: checkpointsQueryLimitSchema(), reverse: z.boolean().optional() })
    .strict(),
  z.object({ epoch: EpochNumberSchema }).strict(),
]);

export const ProposedCheckpointQuerySchema: z.ZodType<ProposedCheckpointQuery, unknown> = z.union([
  z.object({ number: CheckpointNumberSchema }).strict(),
  z.object({ slot: SlotNumberSchema }).strict(),
  z.object({ tag: z.literal('proposed') }).strict(),
]);

/**
 * Interface of classes allowing for the retrieval of L2 blocks.
 */
export interface L2BlockSource {
  /**
   * Method to fetch the rollup contract address at the base-layer.
   * @returns The rollup address.
   */
  getRollupAddress(): Promise<EthAddress>;

  /**
   * Method to fetch the registry contract address at the base-layer.
   * @returns The registry address.
   */
  getRegistryAddress(): Promise<EthAddress>;

  /**
   * Gets the number of the latest L2 block processed by the block source implementation.
   * @returns The number of the latest L2 block processed by the block source implementation.
   */
  getBlockNumber(): Promise<BlockNumber>;

  /**
   * Resolves a {@link BlockQuery} to its concrete L2 block number.
   * @param query - Lookup by block number, hash, archive root, or chain-tip tag.
   * @returns The block number, or undefined if no block matches the query.
   */
  getBlockNumber(query: BlockQuery): Promise<BlockNumber | undefined>;
  getBlockNumber(query?: BlockQuery): Promise<BlockNumber | undefined>;

  /**
   * Gets the number of the latest L2 checkpoint processed by the block source implementation.
   * @returns The number of the latest L2 checkpoint processed by the block source implementation.
   */
  getCheckpointNumber(): Promise<CheckpointNumber>;

  /**
   * Gets a single confirmed checkpoint matching the given query.
   * Heavy shape: includes nested full `L2Block`s with transaction bodies.
   * @param query - Lookup by checkpoint number, slot, or chain-tip tag.
   */
  getCheckpoint(query: CheckpointQuery): Promise<PublishedCheckpoint | undefined>;

  /**
   * Gets a collection of confirmed checkpoints matching the given query.
   * Heavy shape: includes nested full `L2Block`s with transaction bodies.
   * @param query - Range by start/limit or by epoch.
   */
  getCheckpoints(query: CheckpointsQuery): Promise<PublishedCheckpoint[]>;

  /**
   * Gets lightweight checkpoint metadata for a single checkpoint.
   * Cheap passthrough for metadata-only queries (no block body reads).
   * @param query - Lookup by checkpoint number, slot, or chain-tip tag.
   */
  getCheckpointData(query: CheckpointQuery): Promise<CheckpointData | undefined>;

  /**
   * Gets a collection of lightweight checkpoint metadata entries matching the given query.
   * Cheap passthrough for metadata-only queries (no block body reads).
   * @param query - Range by start/limit or by epoch.
   */
  getCheckpointsData(query: CheckpointsQuery): Promise<CheckpointData[]>;

  /**
   * Gets a tx effect.
   * @param txHash - The hash of the tx corresponding to the tx effect.
   * @returns The requested tx effect with block info (or undefined if not found).
   */
  getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined>;

  /**
   * Returns the L2-to-L1 membership witness for `message` emitted by tx `txHash`, built against the
   * smallest partial-proof root on the Outbox that covers the tx's checkpoint.
   *
   * The Outbox roots are read lazily, pinned to the node's synced L1 block, so the witness reflects
   * the node's synced view. Returns `undefined` if the tx isn't yet in a block/epoch or no covering
   * root has landed on L1 as of the synced block.
   *
   * Caveat: cached roots that are sealed and L1-finalized are not re-validated. A reorg deeper than
   * L1 finality could leave the node serving a witness against a no-longer-canonical root.
   */
  getL2ToL1MembershipWitness(
    txHash: TxHash,
    message: Fr,
    messageIndexInTx?: number,
  ): Promise<L2ToL1MembershipWitness | undefined>;

  /**
   * Returns the last L2 slot number for which we have all L1 data needed to build the next checkpoint.
   * Determined by the max of two signals: L1 block sync progress and latest synced checkpoint slot.
   * The checkpoint signal handles missed L1 blocks, since a published checkpoint seals the message tree
   * for the next checkpoint via the inbox LAG mechanism.
   */
  getSyncedL2SlotNumber(): Promise<SlotNumber | undefined>;

  /**
   * Returns the last L2 epoch number that has been fully synchronized from L1.
   * An epoch is fully synced when all its L2 slots have been fully synced.
   */
  getSyncedL2EpochNumber(): Promise<EpochNumber | undefined>;

  /**
   * Returns whether the given epoch is completed on L1, based on the current L1 and L2 block numbers.
   * @param epochNumber - The epoch number to check.
   */
  isEpochComplete(epochNumber: EpochNumber): Promise<boolean>;

  /**
   * Returns the tips of the L2 chain.
   */
  getL2Tips(): Promise<L2Tips>;

  /**
   * Returns the rollup constants for the current chain.
   */
  getL1Constants(): Promise<L1RollupConstants>;

  /**
   * Returns true iff `canPruneAtTime` would be true at the latest L1 timestamp inside
   * the L2 slot's window. Computed entirely from local archiver state (no L1 RPC).
   * @param slot - The L2 slot to check.
   */
  isPruneDueAtSlot(slot: SlotNumber): Promise<boolean>;

  /** Returns values for the genesis block */
  getGenesisValues(): Promise<{ genesisArchiveRoot: Fr }>;

  /**
   * Returns the precomputed hash of the genesis block header. Synchronous because the hash
   * is derived from the initial block header at construction time and cached by implementers.
   */
  getGenesisBlockHash(): BlockHash;

  /** Latest synced L1 timestamp. */
  getL1Timestamp(): Promise<bigint | undefined>;

  /**
   * Returns whether the latest block in the pending chain on L1 is invalid (ie its attestations are incorrect).
   * Note that invalid blocks do not get synced, so the latest block returned by the block source is always a valid one.
   */
  isPendingChainInvalid(): Promise<boolean>;

  /**
   * Returns the status of the pending chain validation. If the chain is invalid, reports the earliest consecutive
   * checkpoint that is invalid, along with the reason for being invalid, which can be used to trigger an invalidation.
   */
  getPendingChainValidationStatus(): Promise<ValidateCheckpointResult>;

  /**
   * Looks up a proposed (archiver-internal, not-yet-L1-confirmed) checkpoint.
   * Returns the latest proposed entry when called with no args or `{ tag: 'proposed' }`; since a
   * proposed entry can only be stored with a checkpoint number beyond the confirmed frontier (and is
   * deleted on confirmation), the latest entry is always the leading one. Callers derive the proposed
   * tip from the payload (checkpoint number, and last block `startBlock + blockCount - 1`).
   * With `{ number }` or `{ slot }`, returns the matching entry or undefined.
   * Never falls back to confirmed checkpoints.
   */
  getProposedCheckpointData(query?: ProposedCheckpointQuery): Promise<ProposedCheckpointData | undefined>;

  /** Force a sync. */
  syncImmediate(): Promise<void>;

  /**
   * Gets an L2 block matching the given query.
   * @param query - Lookup by block number, hash, or archive root.
   */
  getBlock(query: BlockQuery): Promise<L2Block | undefined>;

  /**
   * Gets a collection of L2 blocks matching the given query.
   * @param query - Range by start/limit or by epoch; optionally restricted to checkpointed blocks.
   */
  getBlocks(query: BlocksQuery): Promise<L2Block[]>;

  /**
   * Gets block metadata (without tx data) matching the given query.
   * @param query - Lookup by block number, hash, or archive root.
   */
  getBlockData(query: BlockQuery): Promise<BlockData | undefined>;

  /**
   * Gets a collection of block metadata entries matching the given query.
   * @param query - Range by start/limit or by epoch; optionally restricted to checkpointed blocks.
   */
  getBlocksData(query: BlocksQuery): Promise<BlockData[]>;

  /**
   * Returns all blocks for a given slot.
   * @dev Use this method only with recent slots, since it walks the block list backwards.
   * @param slotNumber - The slot number to return blocks for.
   */
  getBlocksForSlot(slotNumber: SlotNumber): Promise<L2Block[]>;
}

/**
 * Interface for classes that can receive and store L2 blocks.
 */
export interface L2BlockSink {
  /**
   * Adds a block to the store.
   * @param block - The L2 block to add.
   * @throws If block number is not incremental (i.e., not exactly one more than the last stored block).
   */
  addBlock(block: L2Block): Promise<void>;
}

/**
 * Interface for classes that can receive and store proposed (not-yet-L1-confirmed) checkpoints.
 */
export interface ProposedCheckpointSink {
  /**
   * Adds a proposed checkpoint to the store. The archive and checkpointOutHash are computed
   * internally from the already-stored blocks, so every block in the checkpoint must be added
   * (via {@link L2BlockSink.addBlock}) before calling this.
   * @param checkpoint - The proposed checkpoint metadata.
   */
  addProposedCheckpoint(checkpoint: ProposedCheckpointInput): Promise<void>;
}

/**
 * L2BlockSource that emits events upon pending / proven chain changes.
 * see L2BlockSourceEvents for the events emitted.
 */
export type ArchiverEmitter = TypedEventEmitter<{
  [L2BlockSourceEvents.L2PruneUnproven]: (args: L2PruneUnprovenEvent) => void;
  [L2BlockSourceEvents.L2PruneUncheckpointed]: (args: L2PruneUncheckpointedEvent) => void;
  [L2BlockSourceEvents.L2BlockProven]: (args: L2BlockProvenEvent) => void;
  [L2BlockSourceEvents.InvalidAttestationsCheckpointDetected]: (args: InvalidCheckpointDetectedEvent) => void;
  [L2BlockSourceEvents.L2BlocksCheckpointed]: (args: L2CheckpointEvent) => void;
  [L2BlockSourceEvents.CheckpointEquivocationDetected]: (args: CheckpointEquivocationDetectedEvent) => void;
  [L2BlockSourceEvents.DescendentOfInvalidAttestationsCheckpointDetected]: (
    args: DescendentOfInvalidAttestationsCheckpointEvent,
  ) => void;
  [L2BlockSourceEvents.L2BlockSourceUpdated]: (args: L2BlockSourceUpdatedEvent) => void;
}>;
export interface L2BlockSourceEventEmitter extends L2BlockSource {
  events: ArchiverEmitter;
}

/** Returns the emitter of a source that exposes one, or undefined for a source that reports no updates. */
export function getBlockSourceEmitter(source: L2BlockSource | L2BlockSourceEventEmitter): ArchiverEmitter | undefined {
  return 'events' in source ? source.events : undefined;
}

/**
 * Identifier for L2 block tags. Internal counterpart to {@link BlockTag} that omits `latest`
 * (which is an alias for `proposed` accepted only at the public RPC surface).
 *
 * - proposed: Latest block proposed on L2.
 * - checkpointed: Latest block whose enclosing checkpoint has been published on L1.
 * - proven: Latest block whose enclosing checkpoint has been proven on L1.
 * - finalized: Latest block whose proving L1 transaction has reached L1 finality.
 */
export type L2BlockTag = 'proposed' | 'checkpointed' | 'proven' | 'finalized';

/** Tips of the L2 chain. */
export type L2Tips = {
  proposed: L2BlockId;
  checkpointed: L2TipId;
  proven: L2TipId;
  finalized: L2TipId;
};

/**
 * Tips of the L2 chain as tracked by a local provider (world-state, l2-tips-store). Identical to
 * {@link L2Tips}; the alias is retained for call sites that document a local-only provenance.
 */
export type LocalL2Tips = L2Tips;

export const GENESIS_CHECKPOINT_HEADER_HASH = CheckpointHeader.empty().hash();

/** Identifies a block by number and hash. */
export type L2BlockId = { number: BlockNumber; hash: string };

export type CheckpointId = { number: CheckpointNumber; hash: string };

export type L2TipId = { block: L2BlockId; checkpoint: CheckpointId };

/** Creates an L2 block id */
export function makeL2BlockId(number: BlockNumber, hash?: string): L2BlockId {
  if (number !== 0 && !hash) {
    throw new Error(`Hash is required for non-genesis blocks (got block number ${number})`);
  }
  return { number, hash: hash! };
}

/** Creates an L2 checkpoint id */
export function makeL2CheckpointId(number: CheckpointNumber, hash: string): CheckpointId {
  return { number, hash };
}

function l2BlockIdEquals(a: L2BlockId, b: L2BlockId): boolean {
  return a.number === b.number && a.hash === b.hash;
}

function l2TipIdEquals(a: L2TipId, b: L2TipId): boolean {
  return (
    l2BlockIdEquals(a.block, b.block) &&
    a.checkpoint.number === b.checkpoint.number &&
    a.checkpoint.hash === b.checkpoint.hash
  );
}

/** Returns whether two {@link L2Tips} snapshots agree on every tier (proposed, checkpointed, proven, finalized). */
export function l2TipsEqual(a: L2Tips, b: L2Tips): boolean {
  return (
    l2BlockIdEquals(a.proposed, b.proposed) &&
    l2TipIdEquals(a.checkpointed, b.checkpointed) &&
    l2TipIdEquals(a.proven, b.proven) &&
    l2TipIdEquals(a.finalized, b.finalized)
  );
}

const L2BlockIdSchema = z.object({
  number: BlockNumberSchema,
  hash: z.string(),
});

const L2CheckpointIdSchema = z.object({
  number: CheckpointNumberSchema,
  hash: z.string(),
});

const L2TipIdSchema = z.object({
  block: L2BlockIdSchema,
  checkpoint: L2CheckpointIdSchema,
});

export const L2TipsSchema = z.object({
  proposed: L2BlockIdSchema,
  checkpointed: L2TipIdSchema,
  proven: L2TipIdSchema,
  finalized: L2TipIdSchema,
});

export enum L2BlockSourceEvents {
  L2PruneUnproven = 'l2PruneUnproven',
  L2PruneUncheckpointed = 'l2PruneUncheckpointed',
  L2BlockProven = 'l2BlockProven',
  L2BlocksCheckpointed = 'l2BlocksCheckpointed',
  InvalidAttestationsCheckpointDetected = 'invalidCheckpointDetected',
  CheckpointEquivocationDetected = 'checkpointEquivocationDetected',
  DescendentOfInvalidAttestationsCheckpointDetected = 'descendentOfInvalidAttestationsCheckpointDetected',
  L2BlockSourceUpdated = 'l2BlockSourceUpdated',
}

/**
 * Aggregate event emitted once per committed archiver sync pass that mutated local state. Carries the chain tips
 * before and after the pass; consumers compare `fromTips` and `toTips` to learn what moved, and read any data they
 * need from the source itself.
 *
 * This is an optimization signal that lets a block stream reconcile immediately on an archiver update rather than
 * waiting for its next poll. Polling remains the correctness fallback, so a missed event only affects latency.
 */
export type L2BlockSourceUpdatedEvent = {
  type: 'l2BlockSourceUpdated';
  fromTips: L2Tips;
  toTips: L2Tips;
};

export type L2BlockProvenEvent = {
  type: 'l2BlockProven';
  blockNumber: BlockNumber;
  slotNumber: SlotNumber;
  epochNumber: EpochNumber;
};

export type L2PruneUnprovenEvent = {
  type: 'l2PruneUnproven';
  epochNumber: EpochNumber;
  blocks: L2Block[];
};

export type L2PruneUncheckpointedEvent = {
  type: 'l2PruneUncheckpointed';
  slotNumber: SlotNumber;
  blocks: L2Block[];
};

export type L2CheckpointEvent = {
  type: 'l2BlocksCheckpointed';
  checkpoint: PublishedCheckpoint;
};

export type InvalidCheckpointDetectedEvent = {
  type: 'invalidCheckpointDetected';
  validationResult: ValidateCheckpointNegativeResult;
};

/**
 * Emitted when a local proposed checkpoint is found to disagree with the L1-confirmed
 * checkpoint at the same slot. The slot proposer signed both — equivocation.
 */
export type CheckpointEquivocationDetectedEvent = {
  type: 'checkpointEquivocationDetected';
  slotNumber: SlotNumber;
  checkpointNumber: CheckpointNumber;
  l1ArchiveRoot: Fr;
  proposedArchiveRoot: Fr;
};

/**
 * Emitted when the archiver observes a checkpoint that builds on a previously-rejected
 * ancestor (typically one with insufficient/invalid attestations). The descendant itself may
 * have valid attestations, but it cannot be ingested because the chain it extends was
 * skipped. The slasher uses this to slash the proposer of the descendant.
 */
export type DescendentOfInvalidAttestationsCheckpointEvent = {
  type: 'descendentOfInvalidAttestationsCheckpointDetected';
  /** The descendant checkpoint being rejected. */
  checkpoint: CheckpointInfo;
  /** Archive root of the rejected ancestor this descendant builds on. */
  ancestorArchiveRoot: Fr;
  /** Checkpoint number of the rejected ancestor. */
  ancestorCheckpointNumber: CheckpointNumber;
};
