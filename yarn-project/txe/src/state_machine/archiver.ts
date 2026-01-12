import { ArchiverStoreHelper, KVArchiverDataStore } from '@aztec/archiver';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { isDefined } from '@aztec/foundation/types';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type CheckpointId,
  CommitteeAttestation,
  L2Block,
  type L2BlockId,
  type L2BlockNew,
  type L2BlockSource,
  type L2TipId,
  type L2Tips,
  PublishedL2Block,
  type ValidateBlockResult,
} from '@aztec/stdlib/block';
import { Checkpoint, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
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

  public async getBlock(number: BlockNumber): Promise<L2Block | undefined> {
    if (number === 0) {
      return undefined;
    }
    const publishedBlocks = await this.getPublishedBlocks(number, 1);
    if (publishedBlocks.length === 0) {
      return undefined;
    }
    return publishedBlocks[0].block;
  }

  public async getBlocks(from: BlockNumber, limit: number, proven?: boolean): Promise<L2Block[]> {
    const publishedBlocks = await this.getPublishedBlocks(from, limit, proven);
    return publishedBlocks.map(x => x.block);
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
   * Gets a published l2 block. If a negative number is passed, the block returned is the most recent.
   * @param number - The block number to return (inclusive).
   * @returns The requested L2 block.
   */
  public async getPublishedBlock(number: number): Promise<PublishedL2Block | undefined> {
    // If the number provided is -ve, then return the latest block.
    if (number < 0) {
      number = await this.store.getLatestBlockNumber();
    }
    if (number == 0) {
      return undefined;
    }
    const publishedBlocks = await this.retrievePublishedBlocks(BlockNumber(number), 1);
    return publishedBlocks.length === 0 ? undefined : publishedBlocks[0];
  }

  getPublishedBlocks(from: BlockNumber, limit: number, proven?: boolean): Promise<PublishedL2Block[]> {
    return this.retrievePublishedBlocks(from, limit, proven);
  }

  async getL2BlocksNew(from: BlockNumber, limit: number, proven?: boolean): Promise<L2BlockNew[]> {
    const blocks = await this.store.getBlocks(from, limit);

    if (proven === true) {
      const provenBlockNumber = await this.store.getProvenBlockNumber();
      return blocks.filter(b => b.number <= provenBlockNumber);
    }
    return blocks;
  }

  private async retrievePublishedBlocks(
    from: BlockNumber,
    limit: number,
    proven?: boolean,
  ): Promise<PublishedL2Block[]> {
    const checkpoints = await this.store.getRangeOfCheckpoints(CheckpointNumber(from), limit);
    const provenCheckpointNumber = await this.store.getProvenCheckpointNumber();
    const blocks = (
      await Promise.all(checkpoints.map(ch => this.store.getBlocksForCheckpoint(ch.checkpointNumber)))
    ).filter(isDefined);

    const olbBlocks: PublishedL2Block[] = [];
    for (let i = 0; i < checkpoints.length; i++) {
      const blockForCheckpoint = blocks[i][0];
      const checkpoint = checkpoints[i];
      if (proven === true && checkpoint.checkpointNumber > provenCheckpointNumber) {
        continue;
      }
      const oldCheckpoint = new Checkpoint(
        blockForCheckpoint.archive,
        checkpoint.header,
        [blockForCheckpoint],
        checkpoint.checkpointNumber,
      );
      const oldBlock = L2Block.fromCheckpoint(oldCheckpoint);
      const publishedBlock = new PublishedL2Block(
        oldBlock,
        checkpoint.l1,
        checkpoint.attestations.map(x => CommitteeAttestation.fromBuffer(x)),
      );
      olbBlocks.push(publishedBlock);
    }
    return olbBlocks;
  }

  /**
   * Gets an l2 block. If a negative number is passed, the block returned is the most recent.
   * @param number - The block number to return (inclusive).
   * @returns The requested L2 block.
   */
  public getL2Block(number: BlockNumber | 'latest'): Promise<L2Block | undefined> {
    return this.getPublishedBlock(number != 'latest' ? number : -1).then(b => b?.block);
  }

  /**
   * Gets an L2 block (new format).
   * @param number - The block number to return.
   * @returns The requested L2 block.
   */
  public getL2BlockNew(number: BlockNumber): Promise<L2BlockNew | undefined> {
    if (number === 0) {
      return Promise.resolve(undefined);
    }
    return this.store.getBlock(number);
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

  public getBlockRange(from: number, limit: number, _proven?: boolean): Promise<L2Block[]> {
    return this.getPublishedBlocks(BlockNumber(from), limit).then(blocks => blocks.map(b => b.block));
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

  public getBlocksForEpoch(_epochNumber: EpochNumber): Promise<L2Block[]> {
    throw new Error('TXE Archiver does not implement "getBlocksForEpoch"');
  }

  public getBlockHeadersForEpoch(_epochNumber: EpochNumber): Promise<BlockHeader[]> {
    throw new Error('TXE Archiver does not implement "getBlockHeadersForEpoch"');
  }

  public isEpochComplete(_epochNumber: EpochNumber): Promise<boolean> {
    throw new Error('TXE Archiver does not implement "isEpochComplete"');
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

  public getL1Constants(): Promise<L1RollupConstants> {
    throw new Error('TXE Archiver does not implement "getL2Constants"');
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

  getPublishedBlockByHash(_blockHash: Fr): Promise<PublishedL2Block | undefined> {
    throw new Error('Method not implemented.');
  }
  getPublishedBlockByArchive(_archive: Fr): Promise<PublishedL2Block | undefined> {
    throw new Error('Method not implemented.');
  }

  getCheckpointedBlocks(_from: BlockNumber, _limit: number, _proven?: boolean): Promise<never[]> {
    throw new Error('TXE Archiver does not implement "getCheckpointedBlocks"');
  }
}
