import { ArchiverDataSourceBase, ArchiverDataStoreUpdater, KVArchiverDataStore } from '@aztec/archiver';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import { CheckpointNumber, type EpochNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { CheckpointId, L2BlockId, L2TipId, L2Tips, ValidateCheckpointResult } from '@aztec/stdlib/block';
import type { PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';

/**
 * TXE Archiver implementation.
 * Provides most of the endpoints needed by the node for reading from and writing to state,
 * without needing any of the extra overhead that the Archiver itself requires (i.e. an L1 client).
 */
export class TXEArchiver extends ArchiverDataSourceBase {
  private readonly updater = new ArchiverDataStoreUpdater(this.store);

  constructor(db: AztecAsyncKVStore) {
    const store = new KVArchiverDataStore(db, 9999);
    super(store);
  }

  // TXE-specific method for adding checkpoints
  public async addCheckpoints(checkpoints: PublishedCheckpoint[], result?: ValidateCheckpointResult): Promise<boolean> {
    await this.updater.setNewCheckpointData(checkpoints, result);
    return true;
  }

  // Abstract method implementations

  public getRollupAddress(): Promise<EthAddress> {
    throw new Error('TXE Archiver does not implement "getRollupAddress"');
  }

  public getRegistryAddress(): Promise<EthAddress> {
    throw new Error('TXE Archiver does not implement "getRegistryAddress"');
  }

  public getL1Constants(): Promise<L1RollupConstants> {
    throw new Error('TXE Archiver does not implement "getL1Constants"');
  }

  public getGenesisValues(): Promise<{ genesisArchiveRoot: Fr }> {
    return Promise.resolve({ genesisArchiveRoot: new Fr(GENESIS_ARCHIVE_ROOT) });
  }

  public getL1Timestamp(): Promise<bigint | undefined> {
    throw new Error('TXE Archiver does not implement "getL1Timestamp"');
  }

  public async getL2Tips(): Promise<L2Tips> {
    // In TXE there is no possibility of reorgs and no blocks are ever getting proven so we just set 'latest', 'proven'
    // and 'finalized' to the latest block.
    const blockHeader = await this.getBlockHeader('latest');
    if (!blockHeader) {
      throw new Error('L2Tips requested from TXE Archiver but no block header found');
    }

    const number = blockHeader.globalVariables.blockNumber;
    const hash = (await blockHeader.hash()).toString();
    const checkpointedBlock = await this.getCheckpointedBlock(number);
    if (!checkpointedBlock) {
      throw new Error(`L2Tips requested from TXE Archiver but no checkpointed block found for block number ${number}`);
    }
    const checkpoint = await this.store.getRangeOfCheckpoints(CheckpointNumber(number), 1);
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
      proposed: blockId,
      proven: tipId,
      finalized: tipId,
      checkpointed: tipId,
    };
  }

  public getL2SlotNumber(): Promise<SlotNumber | undefined> {
    throw new Error('TXE Archiver does not implement "getL2SlotNumber"');
  }

  public getL2EpochNumber(): Promise<EpochNumber | undefined> {
    throw new Error('TXE Archiver does not implement "getL2EpochNumber"');
  }

  public isEpochComplete(_epochNumber: EpochNumber): Promise<boolean> {
    throw new Error('TXE Archiver does not implement "isEpochComplete"');
  }

  public syncImmediate(): Promise<void> {
    throw new Error('TXE Archiver does not implement "syncImmediate"');
  }
}
