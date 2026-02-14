import { GENESIS_BLOCK_HEADER_HASH, INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { type BlockData, type CheckpointId, GENESIS_CHECKPOINT_HEADER_HASH, type L2Tips } from '@aztec/stdlib/block';

import type { BlockStore } from './block_store.js';

/**
 * In-memory cache for L2 chain tips (proposed, checkpointed, proven, finalized).
 * Populated from the BlockStore on first access, then kept up-to-date by the ArchiverDataStoreUpdater.
 * Refresh calls should happen within the store transaction that mutates block data to ensure consistency.
 */
export class L2TipsCache {
  #tipsPromise: Promise<L2Tips> | undefined;

  constructor(private blockStore: BlockStore) {}

  /** Returns the cached L2 tips. Loads from the block store on first call. */
  public getL2Tips(): Promise<L2Tips> {
    return (this.#tipsPromise ??= this.loadFromStore());
  }

  /** Reloads the L2 tips from the block store. Should be called within the store transaction that mutates data. */
  public async refresh(): Promise<void> {
    this.#tipsPromise = this.loadFromStore();
    await this.#tipsPromise;
  }

  private async loadFromStore(): Promise<L2Tips> {
    const [latestBlockNumber, provenBlockNumber, checkpointedBlockNumber, finalizedBlockNumber] = await Promise.all([
      this.blockStore.getLatestBlockNumber(),
      this.blockStore.getProvenBlockNumber(),
      this.blockStore.getCheckpointedL2BlockNumber(),
      this.blockStore.getFinalizedL2BlockNumber(),
    ]);

    const genesisBlockHeader = {
      blockHash: GENESIS_BLOCK_HEADER_HASH,
      checkpointNumber: CheckpointNumber.ZERO,
    } as const;
    const beforeInitialBlockNumber = BlockNumber(INITIAL_L2_BLOCK_NUM - 1);

    const getBlockData = (blockNumber: BlockNumber) =>
      blockNumber > beforeInitialBlockNumber ? this.blockStore.getBlockData(blockNumber) : genesisBlockHeader;

    const [latestBlockData, provenBlockData, checkpointedBlockData, finalizedBlockData] = await Promise.all(
      [latestBlockNumber, provenBlockNumber, checkpointedBlockNumber, finalizedBlockNumber].map(getBlockData),
    );

    if (!latestBlockData || !provenBlockData || !finalizedBlockData || !checkpointedBlockData) {
      throw new Error('Failed to load block data for L2 tips');
    }

    const [provenCheckpointId, finalizedCheckpointId, checkpointedCheckpointId] = await Promise.all([
      this.getCheckpointIdForBlock(provenBlockData),
      this.getCheckpointIdForBlock(finalizedBlockData),
      this.getCheckpointIdForBlock(checkpointedBlockData),
    ]);

    return {
      proposed: { number: latestBlockNumber, hash: latestBlockData.blockHash.toString() },
      proven: {
        block: { number: provenBlockNumber, hash: provenBlockData.blockHash.toString() },
        checkpoint: provenCheckpointId,
      },
      finalized: {
        block: { number: finalizedBlockNumber, hash: finalizedBlockData.blockHash.toString() },
        checkpoint: finalizedCheckpointId,
      },
      checkpointed: {
        block: { number: checkpointedBlockNumber, hash: checkpointedBlockData.blockHash.toString() },
        checkpoint: checkpointedCheckpointId,
      },
    };
  }

  private async getCheckpointIdForBlock(blockData: Pick<BlockData, 'checkpointNumber'>): Promise<CheckpointId> {
    const checkpointData = await this.blockStore.getCheckpointData(blockData.checkpointNumber);
    if (!checkpointData) {
      return {
        number: CheckpointNumber.ZERO,
        hash: GENESIS_CHECKPOINT_HEADER_HASH.toString(),
      };
    }
    return {
      number: checkpointData.checkpointNumber,
      hash: checkpointData.header.hash().toString(),
    };
  }
}
