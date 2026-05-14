import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import {
  type BlockData,
  type BlockHash,
  type CheckpointId,
  GENESIS_CHECKPOINT_HEADER_HASH,
  type L2BlockId,
  type L2TipId,
  type L2Tips,
  clampL2TipNumbers,
} from '@aztec/stdlib/block';

import type { BlockStore } from './block_store.js';

/**
 * In-memory cache for L2 chain tips (proposed, checkpointed, proven, finalized).
 * Populated from the BlockStore on first access, then kept up-to-date by the ArchiverDataStoreUpdater.
 * Refresh calls should happen *after* the store transaction that mutates block data has committed,
 * so the cache loads from committed state and is never replaced if the writer aborts.
 */
export class L2TipsCache {
  #tipsPromise: Promise<L2Tips> | undefined;

  /**
   * Asymmetric by design: the genesis block hash is dynamic — derived from the injected initial header,
   * which depends on `genesisTimestamp` and any prefilled state. The genesis checkpoint hash is static —
   * checkpoint 0 is fully synthetic (no real checkpoint header exists at 0), so it stays at the protocol
   * constant `GENESIS_CHECKPOINT_HEADER_HASH`.
   */
  constructor(
    private blockStore: BlockStore,
    private readonly initialBlockHash: BlockHash,
  ) {}

  /** Returns the cached L2 tips. Loads from the block store on first call. */
  public getL2Tips(): Promise<L2Tips> {
    return (this.#tipsPromise ??= this.loadFromStore());
  }

  /** Reloads the L2 tips from the block store. Should be called after the writer transaction has committed. */
  public async refresh(): Promise<void> {
    this.#tipsPromise = this.loadFromStore();
    await this.#tipsPromise;
  }

  private async loadFromStore(): Promise<L2Tips> {
    const [rawProposed, rawProven, rawProposedCheckpoint, rawCheckpointed, rawFinalized] = await Promise.all([
      this.blockStore.getLatestL2BlockNumber(),
      this.blockStore.getProvenBlockNumber(),
      this.blockStore.getProposedCheckpointL2BlockNumber(),
      this.blockStore.getCheckpointedL2BlockNumber(),
      this.blockStore.getFinalizedL2BlockNumber(),
    ]);

    // Tip block numbers are populated from independent sources, so during sync they can violate
    // `finalized ≤ ... ≤ proposed`. Clamp before resolving block data to avoid 'block not found'.
    const clamped = clampL2TipNumbers({
      proposed: rawProposed,
      proposedCheckpoint: rawProposedCheckpoint,
      checkpointed: rawCheckpointed,
      proven: rawProven,
      finalized: rawFinalized,
    });

    const [proposed, proven, checkpointed, finalized] = await Promise.all([
      this.resolveBlockId(clamped.proposed),
      this.resolveTipId(clamped.proven),
      this.resolveTipId(clamped.checkpointed),
      this.resolveTipId(clamped.finalized),
    ]);

    // If the pending proposed checkpoint pointed past the latest proposed block, its stored
    // checkpoint identity references a block we haven't synced. Fall back to `checkpointed`
    // entirely rather than emitting a mixed (proposed block, stale checkpoint identity) pair.
    const proposedCheckpoint: L2TipId =
      rawProposedCheckpoint > rawProposed
        ? checkpointed
        : {
            block: await this.resolveBlockId(clamped.proposedCheckpoint),
            checkpoint: await this.resolveProposedCheckpointId(checkpointed.checkpoint),
          };

    return { proposed, proven, checkpointed, finalized, proposedCheckpoint };
  }

  private async resolveBlockId(blockNumber: BlockNumber): Promise<L2BlockId> {
    if (blockNumber < INITIAL_L2_BLOCK_NUM) {
      return { number: BlockNumber.ZERO, hash: this.initialBlockHash.toString() };
    }
    const blockData = await this.blockStore.getBlockData({ number: blockNumber });
    if (!blockData) {
      throw new Error(`Failed to load block data for L2 tip at block ${blockNumber}`);
    }
    return { number: blockNumber, hash: blockData.blockHash.toString() };
  }

  private async resolveTipId(blockNumber: BlockNumber): Promise<L2TipId> {
    if (blockNumber < INITIAL_L2_BLOCK_NUM) {
      return {
        block: { number: BlockNumber.ZERO, hash: this.initialBlockHash.toString() },
        checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
      };
    }
    const blockData = await this.blockStore.getBlockData({ number: blockNumber });
    if (!blockData) {
      throw new Error(`Failed to load block data for L2 tip at block ${blockNumber}`);
    }
    return {
      block: { number: blockNumber, hash: blockData.blockHash.toString() },
      checkpoint: await this.getCheckpointIdForBlock(blockData),
    };
  }

  private async resolveProposedCheckpointId(checkpointedFallback: CheckpointId): Promise<CheckpointId> {
    const proposed = await this.blockStore.getLastProposedCheckpoint();
    if (!proposed) {
      return checkpointedFallback;
    }
    return { number: proposed.checkpointNumber, hash: proposed.header.hash().toString() };
  }

  private async getCheckpointIdForBlock(blockData: Pick<BlockData, 'checkpointNumber'>): Promise<CheckpointId> {
    const checkpointData = await this.blockStore.getCheckpointData(blockData.checkpointNumber);
    if (!checkpointData) {
      return { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() };
    }
    return { number: checkpointData.checkpointNumber, hash: checkpointData.header.hash().toString() };
  }
}
