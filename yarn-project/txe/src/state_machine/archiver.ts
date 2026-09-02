import { ArchiverDataSourceBase, ArchiverDataStoreUpdater, createArchiverDataStores } from '@aztec/archiver';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import { CheckpointNumber, type EpochNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import {
  type CheckpointId,
  GENESIS_BLOCK_HEADER_HASH,
  type L2BlockId,
  type L2Frontier,
  type L2TipId,
  type L2Tips,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import type { PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { EmptyL1RollupConstants, type L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { BlockHeader } from '@aztec/stdlib/tx';

/**
 * TXE Archiver implementation.
 * Provides most of the endpoints needed by the node for reading from and writing to state,
 * without needing any of the extra overhead that the Archiver itself requires (i.e. an L1 client).
 */
export class TXEArchiver extends ArchiverDataSourceBase {
  private readonly updater = new ArchiverDataStoreUpdater(this.stores);

  constructor(db: AztecAsyncKVStore) {
    super(
      createArchiverDataStores(db, GENESIS_BLOCK_HEADER_HASH),
      undefined,
      BlockHeader.empty(),
      GENESIS_BLOCK_HEADER_HASH,
      new Fr(GENESIS_ARCHIVE_ROOT),
    );
  }

  public async addCheckpoints(checkpoints: PublishedCheckpoint[], result?: ValidateCheckpointResult): Promise<void> {
    await this.updater.addCheckpoints(checkpoints, result);
  }

  public getRollupAddress(): Promise<EthAddress> {
    throw new Error('TXE Archiver does not implement "getRollupAddress"');
  }

  public getRegistryAddress(): Promise<EthAddress> {
    throw new Error('TXE Archiver does not implement "getRegistryAddress"');
  }

  public getL1Constants(): Promise<L1RollupConstants> {
    // The TXE has no L1, so it serves the empty constants (epochDuration=1) used throughout the TXE state machine
    // (see mock_epoch_cache). The node calls this when assembling a mined tx receipt to derive the epoch number.
    return Promise.resolve(EmptyL1RollupConstants);
  }

  public getGenesisValues(): Promise<{ genesisArchiveRoot: Fr }> {
    return Promise.resolve({ genesisArchiveRoot: new Fr(GENESIS_ARCHIVE_ROOT) });
  }

  public getL1Timestamp(): Promise<bigint | undefined> {
    throw new Error('TXE Archiver does not implement "getL1Timestamp"');
  }

  public async getL2Tips(): Promise<L2Tips> {
    return (await this.getL2Frontier()).tips;
  }

  public async getL2Frontier(): Promise<L2Frontier> {
    // In TXE there is no possibility of reorgs and no blocks are ever getting proven so we just set 'latest', 'proven'
    // and 'finalized' to the latest block. The TXE never holds proposed checkpoints: every checkpoint is added
    // directly as confirmed.
    const latestBlockNumber = await this.stores.blocks.getLatestL2BlockNumber();
    if (latestBlockNumber === 0) {
      throw new Error('L2Tips requested from TXE Archiver but no block found');
    }
    const latestBlockData = await this.stores.blocks.getBlockData({ number: latestBlockNumber });
    if (!latestBlockData) {
      throw new Error('L2Tips requested from TXE Archiver but no block header found');
    }

    const number = latestBlockData.header.globalVariables.blockNumber;
    const hash = latestBlockData.blockHash.toString();

    // TXE uses 1-block-per-checkpoint for testing simplicity, so we can use block number as checkpoint number.
    // This uses the deprecated fromBlockNumber method intentionally for the TXE testing environment.
    const checkpoint = await this.stores.blocks.getRangeOfCheckpoints(CheckpointNumber.fromBlockNumber(number), 1);
    if (checkpoint.length === 0) {
      throw new Error(`L2Tips requested from TXE Archiver but no checkpoint found for block number ${number}`);
    }
    const blockId: L2BlockId = { number, hash };
    const checkpointId: CheckpointId = {
      number: checkpoint[0].checkpointNumber,
      hash: checkpoint[0].header.hash().toString(),
    };
    const tipId: L2TipId = { block: blockId, checkpoint: checkpointId };
    return {
      tips: {
        proposed: blockId,
        proven: tipId,
        finalized: tipId,
        checkpointed: tipId,
      },
      proposedCheckpoint: undefined,
      l1SyncPoint: undefined,
      latestBlockHeader: latestBlockData.header,
      checkpointedCheckpoint: { header: checkpoint[0].header, l1: checkpoint[0].l1 },
      pendingChainValidationStatus: { valid: true },
    };
  }

  public getSyncedL2SlotNumber(): Promise<SlotNumber | undefined> {
    throw new Error('TXE Archiver does not implement "getSyncedL2SlotNumber"');
  }

  public getSyncedL2EpochNumber(): Promise<EpochNumber | undefined> {
    throw new Error('TXE Archiver does not implement "getSyncedL2EpochNumber"');
  }

  public isEpochComplete(_epochNumber: EpochNumber): Promise<boolean> {
    throw new Error('TXE Archiver does not implement "isEpochComplete"');
  }

  public syncImmediate(): Promise<void> {
    throw new Error('TXE Archiver does not implement "syncImmediate"');
  }

  public getL2ToL1MembershipWitness(): Promise<undefined> {
    // TXE doesn't drive the L2-to-L1 message flow through this archiver.
    return Promise.resolve(undefined);
  }
}
