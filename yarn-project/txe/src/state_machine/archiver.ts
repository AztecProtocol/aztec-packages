import { ArchiverStoreHelper, KVArchiverDataStore } from '@aztec/archiver';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type {
  CheckpointedL2Block,
  L2Block,
  L2BlockNew,
  L2BlockSource,
  L2Tips,
  PublishedL2Block,
  ValidateBlockResult,
} from '@aztec/stdlib/block';
import type { Checkpoint, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { BlockHeader } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

// We are extending the ArchiverDataStoreHelper here because it provides most of the endpoints needed by the
// node for reading from and writing to state, without needing any of the extra overhead that the Archiver itself
// requires (i.e. an L1 client)
export class TXEArchiver extends ArchiverStoreHelper implements L2BlockSource {
  constructor(db: AztecAsyncKVStore) {
    super(new KVArchiverDataStore(db, 9999));
  }

  /**
   * Gets an L2 block by block number.
   * @param number - The block number to return.
   * @returns The requested L2 block (or undefined if not found).
   */
  public async getL2BlockNew(number: BlockNumber): Promise<L2BlockNew | undefined> {
    if (number < 0) {
      number = await this.store.getLatestBlockNumber();
    }
    if (number === 0) {
      return undefined;
    }
    return this.store.getBlock(number);
  }

  /**
   * Gets a checkpointed L2 block by block number.
   * Returns undefined if the block doesn't exist or hasn't been checkpointed yet.
   * @param number - The block number to retrieve.
   * @returns The requested checkpointed L2 block (or undefined if not found or not checkpointed).
   */
  public override getCheckpointedBlock(number: BlockNumber): Promise<CheckpointedL2Block | undefined> {
    return this.store.getCheckpointedBlock(number);
  }

  public override async addCheckpoints(
    checkpoints: PublishedCheckpoint[],
    _result?: ValidateBlockResult,
  ): Promise<boolean> {
    const allBlocks = checkpoints.flatMap(ch => ch.checkpoint.blocks);
    const opResults = await Promise.all([this.store.addLogs(allBlocks), this.store.addCheckpoints(checkpoints)]);

    return opResults.every(Boolean);
  }

  /**
   * Gets the number of the latest L2 block processed by the block source implementation.
   * @returns The number of the latest L2 block processed by the block source implementation.
   */
  public getBlockNumber(): Promise<BlockNumber> {
    return this.store.getLatestBlockNumber();
  }

  /**
   * Gets the number of the latest L2 block proven seen by the block source implementation.
   * @returns The number of the latest L2 block proven seen by the block source implementation.
   */
  public override getProvenBlockNumber(): Promise<BlockNumber> {
    return this.store.getProvenBlockNumber();
  }

  /**
   * Gets an l2 block header.
   * @param number - The block number to return or 'latest' for the most recent one.
   * @returns The requested L2 block header.
   */
  public async getBlockHeader(number: number | 'latest'): Promise<BlockHeader | undefined> {
    if (number === 'latest') {
      number = await this.store.getLatestBlockNumber();
    }
    if (number === 0) {
      return undefined;
    }
    const headers = await this.store.getBlockHeaders(BlockNumber(number), 1);
    return headers.length === 0 ? undefined : headers[0];
  }

  public getPublishedCheckpoints(_from: CheckpointNumber, _limit: number): Promise<PublishedCheckpoint[]> {
    throw new Error('TXE Archiver does not implement "getPublishedCheckpoints"');
  }

  public getCheckpointByArchive(_archive: Fr): Promise<Checkpoint | undefined> {
    throw new Error('TXE Archiver does not implement "getCheckpointByArchive"');
  }

  public getL2SlotNumber(): Promise<SlotNumber | undefined> {
    throw new Error('TXE Archiver does not implement "getL2SlotNumber"');
  }

  public getL2EpochNumber(): Promise<EpochNumber> {
    throw new Error('TXE Archiver does not implement "getL2EpochNumber"');
  }

  public getCheckpointsForEpoch(_epochNumber: EpochNumber): Promise<Checkpoint[]> {
    throw new Error('TXE Archiver does not implement "getCheckpointsForEpoch"');
  }

  public getBlockHeadersForEpoch(_epochNumber: EpochNumber): Promise<BlockHeader[]> {
    throw new Error('TXE Archiver does not implement "getBlockHeadersForEpoch"');
  }

  public isEpochComplete(_epochNumber: EpochNumber): Promise<boolean> {
    throw new Error('TXE Archiver does not implement "isEpochComplete"');
  }

  public getL2Tips(): Promise<L2Tips> {
    throw new Error('TXE Archiver does not implement "getL2Tips"');
  }

  public getL1Constants(): Promise<L1RollupConstants> {
    throw new Error('TXE Archiver does not implement "getL1Constants"');
  }

  public getGenesisValues(): Promise<{ genesisArchiveRoot: Fr }> {
    return Promise.resolve({ genesisArchiveRoot: new Fr(GENESIS_ARCHIVE_ROOT) });
  }

  public syncImmediate(): Promise<void> {
    throw new Error('TXE Archiver does not implement "syncImmediate"');
  }

  public getContract(_address: AztecAddress, _timestamp?: UInt64): Promise<ContractInstanceWithAddress | undefined> {
    throw new Error('TXE Archiver does not implement "getContract"');
  }

  public getRollupAddress(): Promise<EthAddress> {
    throw new Error('TXE Archiver does not implement "getRollupAddress"');
  }

  public getRegistryAddress(): Promise<EthAddress> {
    throw new Error('TXE Archiver does not implement "getRegistryAddress"');
  }

  public getL1Timestamp(): Promise<bigint> {
    throw new Error('TXE Archiver does not implement "getL1Timestamp"');
  }

  public isPendingChainInvalid(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public override getPendingChainValidationStatus(): Promise<ValidateBlockResult> {
    return Promise.resolve({ valid: true });
  }

  /* Legacy APIs - These return L2Block/PublishedL2Block types which are deprecated */

  public getBlock(_number: BlockNumber): Promise<L2Block | undefined> {
    throw new Error('TXE Archiver does not implement legacy "getBlock" - use getL2BlockNew instead');
  }

  public getBlocks(_from: BlockNumber, _limit: number, _proven?: boolean): Promise<L2Block[]> {
    throw new Error('TXE Archiver does not implement legacy "getBlocks" - use getCheckpointedBlock instead');
  }

  public getPublishedBlocks(_from: BlockNumber, _limit: number, _proven?: boolean): Promise<PublishedL2Block[]> {
    throw new Error('TXE Archiver does not implement legacy "getPublishedBlocks" - use getCheckpointedBlock instead');
  }

  public getBlocksForEpoch(_epochNumber: EpochNumber): Promise<L2Block[]> {
    throw new Error('TXE Archiver does not implement "getBlocksForEpoch"');
  }

  public getPublishedBlockByHash(_blockHash: Fr): Promise<PublishedL2Block | undefined> {
    throw new Error('TXE Archiver does not implement "getPublishedBlockByHash"');
  }

  public getPublishedBlockByArchive(_archive: Fr): Promise<PublishedL2Block | undefined> {
    throw new Error('TXE Archiver does not implement "getPublishedBlockByArchive"');
  }
}
