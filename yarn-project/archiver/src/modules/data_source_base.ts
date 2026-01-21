import { BlockNumber, CheckpointNumber, type EpochNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { isDefined } from '@aztec/foundation/types';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CheckpointedL2Block, CommitteeAttestation, L2BlockNew, type L2Tips } from '@aztec/stdlib/block';
import { Checkpoint, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { ContractClassPublic, ContractDataSource, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { type L1RollupConstants, getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';
import type { GetContractClassLogsResponse, GetPublicLogsResponse } from '@aztec/stdlib/interfaces/client';
import type { L2LogsSource } from '@aztec/stdlib/interfaces/server';
import type { LogFilter, SiloedTag, Tag, TxScopedL2Log } from '@aztec/stdlib/logs';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { BlockHeader, IndexedTxEffect, TxHash, TxReceipt } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import type { ArchiverDataSource } from '../interfaces.js';
import type { CheckpointData } from '../store/block_store.js';
import type { KVArchiverDataStore } from '../store/kv_archiver_store.js';
import type { ValidateCheckpointResult } from './validation.js';

/**
 * Abstract base class implementing ArchiverDataSource using a KVArchiverDataStore.
 * Provides implementations for all store-delegating methods and declares abstract methods
 * for L1-dependent functionality that subclasses must implement.
 */
export abstract class ArchiverDataSourceBase
  implements ArchiverDataSource, L2LogsSource, ContractDataSource, L1ToL2MessageSource
{
  constructor(
    protected readonly store: KVArchiverDataStore,
    protected readonly l1Constants?: L1RollupConstants,
  ) {}

  abstract getRollupAddress(): Promise<EthAddress>;

  abstract getRegistryAddress(): Promise<EthAddress>;

  abstract getL1Constants(): Promise<L1RollupConstants>;

  abstract getGenesisValues(): Promise<{ genesisArchiveRoot: Fr }>;

  abstract getL1Timestamp(): Promise<bigint | undefined>;

  abstract getL2Tips(): Promise<L2Tips>;

  abstract getL2SlotNumber(): Promise<SlotNumber | undefined>;

  abstract getL2EpochNumber(): Promise<EpochNumber | undefined>;

  abstract isEpochComplete(epochNumber: EpochNumber): Promise<boolean>;

  abstract syncImmediate(): Promise<void>;

  public getCheckpointNumber(): Promise<CheckpointNumber> {
    return this.store.getSynchedCheckpointNumber();
  }

  public getSynchedCheckpointNumber(): Promise<CheckpointNumber> {
    return this.store.getSynchedCheckpointNumber();
  }

  public getProvenCheckpointNumber(): Promise<CheckpointNumber> {
    return this.store.getProvenCheckpointNumber();
  }

  public getBlockNumber(): Promise<BlockNumber> {
    return this.store.getLatestBlockNumber();
  }

  public getProvenBlockNumber(): Promise<BlockNumber> {
    return this.store.getProvenBlockNumber();
  }

  public async getBlockHeader(number: BlockNumber | 'latest'): Promise<BlockHeader | undefined> {
    const blockNumber = number === 'latest' ? await this.store.getLatestBlockNumber() : number;
    if (blockNumber === 0) {
      return undefined;
    }
    const headers = await this.store.getBlockHeaders(blockNumber, 1);
    return headers.length === 0 ? undefined : headers[0];
  }

  public getCheckpointedBlock(number: BlockNumber): Promise<CheckpointedL2Block | undefined> {
    return this.store.getCheckpointedBlock(number);
  }

  public getCheckpointedL2BlockNumber(): Promise<BlockNumber> {
    return this.store.getCheckpointedL2BlockNumber();
  }

  public getFinalizedL2BlockNumber(): Promise<BlockNumber> {
    return this.store.getFinalizedL2BlockNumber();
  }

  public async getCheckpointHeader(number: CheckpointNumber | 'latest'): Promise<CheckpointHeader | undefined> {
    if (number === 'latest') {
      number = await this.store.getSynchedCheckpointNumber();
    }
    if (number === 0) {
      return undefined;
    }
    const checkpoint = await this.store.getCheckpointData(number);
    if (!checkpoint) {
      return undefined;
    }
    return checkpoint.header;
  }

  public async getLastBlockNumberInCheckpoint(checkpointNumber: CheckpointNumber): Promise<BlockNumber | undefined> {
    const checkpointData = await this.store.getCheckpointData(checkpointNumber);
    if (!checkpointData) {
      return undefined;
    }
    return BlockNumber(checkpointData.startBlock + checkpointData.numBlocks - 1);
  }

  public async getCheckpointedBlocks(
    from: BlockNumber,
    limit: number,
    proven?: boolean,
  ): Promise<CheckpointedL2Block[]> {
    const blocks = await this.store.getCheckpointedBlocks(from, limit);

    if (proven === true) {
      const provenBlockNumber = await this.store.getProvenBlockNumber();
      return blocks.filter(b => b.block.number <= provenBlockNumber);
    }
    return blocks;
  }

  public getBlockHeaderByHash(blockHash: Fr): Promise<BlockHeader | undefined> {
    return this.store.getBlockHeaderByHash(blockHash);
  }

  public getBlockHeaderByArchive(archive: Fr): Promise<BlockHeader | undefined> {
    return this.store.getBlockHeaderByArchive(archive);
  }

  public async getL2BlockNew(number: BlockNumber): Promise<L2BlockNew | undefined> {
    // If the number provided is -ve, then return the latest block.
    if (number < 0) {
      number = await this.store.getLatestBlockNumber();
    }
    if (number === 0) {
      return undefined;
    }
    const publishedBlock = await this.store.getBlock(number);
    return publishedBlock;
  }

  public getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    return this.store.getTxEffect(txHash);
  }

  public getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    return this.store.getSettledTxReceipt(txHash);
  }

  public isPendingChainInvalid(): Promise<boolean> {
    return this.getPendingChainValidationStatus().then(status => !status.valid);
  }

  public async getPendingChainValidationStatus(): Promise<ValidateCheckpointResult> {
    return (await this.store.getPendingChainValidationStatus()) ?? { valid: true };
  }

  public async getL2BlocksNew(from: BlockNumber, limit: number, proven?: boolean): Promise<L2BlockNew[]> {
    const blocks = await this.store.getBlocks(from, limit);

    if (proven === true) {
      const provenBlockNumber = await this.store.getProvenBlockNumber();
      return blocks.filter(b => b.number <= provenBlockNumber);
    }
    return blocks;
  }

  public getPrivateLogsByTags(tags: SiloedTag[], page?: number): Promise<TxScopedL2Log[][]> {
    return this.store.getPrivateLogsByTags(tags, page);
  }

  public getPublicLogsByTagsFromContract(
    contractAddress: AztecAddress,
    tags: Tag[],
    page?: number,
  ): Promise<TxScopedL2Log[][]> {
    return this.store.getPublicLogsByTagsFromContract(contractAddress, tags, page);
  }

  public getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    return this.store.getPublicLogs(filter);
  }

  public getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    return this.store.getContractClassLogs(filter);
  }

  public getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.store.getContractClass(id);
  }

  public getBytecodeCommitment(id: Fr): Promise<Fr | undefined> {
    return this.store.getBytecodeCommitment(id);
  }

  public async getContract(
    address: AztecAddress,
    maybeTimestamp?: UInt64,
  ): Promise<ContractInstanceWithAddress | undefined> {
    let timestamp;
    if (maybeTimestamp === undefined) {
      const latestBlockHeader = await this.getBlockHeader('latest');
      // If we get undefined block header, it means that the archiver has not yet synced any block so we default to 0.
      timestamp = latestBlockHeader ? latestBlockHeader.globalVariables.timestamp : 0n;
    } else {
      timestamp = maybeTimestamp;
    }

    return this.store.getContractInstance(address, timestamp);
  }

  public getContractClassIds(): Promise<Fr[]> {
    return this.store.getContractClassIds();
  }

  public getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return this.store.getDebugFunctionName(address, selector);
  }

  public registerContractFunctionSignatures(signatures: string[]): Promise<void> {
    return this.store.registerContractFunctionSignatures(signatures);
  }

  public getL1ToL2Messages(checkpointNumber: CheckpointNumber): Promise<Fr[]> {
    return this.store.getL1ToL2Messages(checkpointNumber);
  }

  public getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    return this.store.getL1ToL2MessageIndex(l1ToL2Message);
  }

  public async getCheckpoints(checkpointNumber: CheckpointNumber, limit: number): Promise<PublishedCheckpoint[]> {
    const checkpoints = await this.store.getRangeOfCheckpoints(checkpointNumber, limit);
    const blocks = (
      await Promise.all(checkpoints.map(ch => this.store.getBlocksForCheckpoint(ch.checkpointNumber)))
    ).filter(isDefined);

    const fullCheckpoints: PublishedCheckpoint[] = [];
    for (let i = 0; i < checkpoints.length; i++) {
      const blocksForCheckpoint = blocks[i];
      const checkpoint = checkpoints[i];
      const fullCheckpoint = new Checkpoint(
        checkpoint.archive,
        checkpoint.header,
        blocksForCheckpoint,
        checkpoint.checkpointNumber,
      );
      const publishedCheckpoint = new PublishedCheckpoint(
        fullCheckpoint,
        checkpoint.l1,
        checkpoint.attestations.map(x => CommitteeAttestation.fromBuffer(x)),
      );
      fullCheckpoints.push(publishedCheckpoint);
    }
    return fullCheckpoints;
  }

  public getBlocksForSlot(slotNumber: SlotNumber): Promise<L2BlockNew[]> {
    return this.store.getBlocksForSlot(slotNumber);
  }

  public async getCheckpointedBlocksForEpoch(epochNumber: EpochNumber): Promise<CheckpointedL2Block[]> {
    if (!this.l1Constants) {
      throw new Error('L1 constants not set');
    }

    const [start, end] = getSlotRangeForEpoch(epochNumber, this.l1Constants);
    const blocks: CheckpointedL2Block[] = [];

    // Walk the list of checkpoints backwards and filter by slots matching the requested epoch.
    // We'll typically ask for checkpoints for a very recent epoch, so we shouldn't need an index here.
    let checkpoint = await this.store.getCheckpointData(await this.store.getSynchedCheckpointNumber());
    const slot = (b: CheckpointData) => b.header.slotNumber;
    while (checkpoint && slot(checkpoint) >= start) {
      if (slot(checkpoint) <= end) {
        // push the blocks on backwards
        const endBlock = checkpoint.startBlock + checkpoint.numBlocks - 1;
        for (let i = endBlock; i >= checkpoint.startBlock; i--) {
          const checkpointedBlock = await this.getCheckpointedBlock(BlockNumber(i));
          if (checkpointedBlock) {
            blocks.push(checkpointedBlock);
          }
        }
      }
      checkpoint = await this.store.getCheckpointData(CheckpointNumber(checkpoint.checkpointNumber - 1));
    }

    return blocks.reverse();
  }

  public async getCheckpointedBlockHeadersForEpoch(epochNumber: EpochNumber): Promise<BlockHeader[]> {
    if (!this.l1Constants) {
      throw new Error('L1 constants not set');
    }

    const [start, end] = getSlotRangeForEpoch(epochNumber, this.l1Constants);
    const blocks: BlockHeader[] = [];

    // Walk the list of checkpoints backwards and filter by slots matching the requested epoch.
    // We'll typically ask for checkpoints for a very recent epoch, so we shouldn't need an index here.
    let checkpoint = await this.store.getCheckpointData(await this.store.getSynchedCheckpointNumber());
    const slot = (b: CheckpointData) => b.header.slotNumber;
    while (checkpoint && slot(checkpoint) >= start) {
      if (slot(checkpoint) <= end) {
        // push the blocks on backwards
        const endBlock = checkpoint.startBlock + checkpoint.numBlocks - 1;
        for (let i = endBlock; i >= checkpoint.startBlock; i--) {
          const block = await this.getBlockHeader(BlockNumber(i));
          if (block) {
            blocks.push(block);
          }
        }
      }
      checkpoint = await this.store.getCheckpointData(CheckpointNumber(checkpoint.checkpointNumber - 1));
    }
    return blocks.reverse();
  }

  public async getCheckpointsForEpoch(epochNumber: EpochNumber): Promise<Checkpoint[]> {
    if (!this.l1Constants) {
      throw new Error('L1 constants not set');
    }

    const [start, end] = getSlotRangeForEpoch(epochNumber, this.l1Constants);
    const checkpoints: Checkpoint[] = [];

    // Walk the list of checkpoints backwards and filter by slots matching the requested epoch.
    // We'll typically ask for checkpoints for a very recent epoch, so we shouldn't need an index here.
    let checkpointData = await this.store.getCheckpointData(await this.store.getSynchedCheckpointNumber());
    const slot = (b: CheckpointData) => b.header.slotNumber;
    while (checkpointData && slot(checkpointData) >= start) {
      if (slot(checkpointData) <= end) {
        // push the checkpoints on backwards
        const [checkpoint] = await this.getCheckpoints(checkpointData.checkpointNumber, 1);
        checkpoints.push(checkpoint.checkpoint);
      }
      checkpointData = await this.store.getCheckpointData(CheckpointNumber(checkpointData.checkpointNumber - 1));
    }

    return checkpoints.reverse();
  }

  public async getBlock(number: BlockNumber): Promise<L2BlockNew | undefined> {
    // If the number provided is -ve, then return the latest block.
    if (number < 0) {
      number = await this.store.getLatestBlockNumber();
    }
    if (number === 0) {
      return undefined;
    }
    return this.store.getBlock(number);
  }

  public async getBlocks(from: BlockNumber, limit: number, proven?: boolean): Promise<L2BlockNew[]> {
    const blocks = await this.store.getBlocks(from, limit);

    if (proven === true) {
      const provenBlockNumber = await this.store.getProvenBlockNumber();
      return blocks.filter(b => b.number <= provenBlockNumber);
    }
    return blocks;
  }

  public getCheckpointedBlockByHash(blockHash: Fr): Promise<CheckpointedL2Block | undefined> {
    return this.store.getCheckpointedBlockByHash(blockHash);
  }

  public getCheckpointedBlockByArchive(archive: Fr): Promise<CheckpointedL2Block | undefined> {
    return this.store.getCheckpointedBlockByArchive(archive);
  }

  public async getL2BlockNewByHash(blockHash: Fr): Promise<L2BlockNew | undefined> {
    const checkpointedBlock = await this.store.getCheckpointedBlockByHash(blockHash);
    return checkpointedBlock?.block;
  }

  public async getL2BlockNewByArchive(archive: Fr): Promise<L2BlockNew | undefined> {
    const checkpointedBlock = await this.store.getCheckpointedBlockByArchive(archive);
    return checkpointedBlock?.block;
  }
}
