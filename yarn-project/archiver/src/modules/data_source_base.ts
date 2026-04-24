import { range } from '@aztec/foundation/array';
import { BlockNumber, CheckpointNumber, type EpochNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { isDefined } from '@aztec/foundation/types';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type BlockData, type BlockHash, CheckpointedL2Block, L2Block, type L2Tips } from '@aztec/stdlib/block';
import {
  Checkpoint,
  type CheckpointData,
  type CommonCheckpointData,
  type ProposedCheckpointData,
  PublishedCheckpoint,
} from '@aztec/stdlib/checkpoint';
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
import { type ArchiverDataStores, registerContractFunctionSignatures } from '../store/data_stores.js';
import type { ValidateCheckpointResult } from './validation.js';

/**
 * Abstract base class implementing ArchiverDataSource using a bundle of archiver substores.
 * Provides implementations for all read-side methods and declares abstract methods for
 * L1-dependent functionality that subclasses must implement.
 */
export abstract class ArchiverDataSourceBase
  implements ArchiverDataSource, L2LogsSource, ContractDataSource, L1ToL2MessageSource
{
  constructor(
    protected readonly stores: ArchiverDataStores,
    protected readonly l1Constants?: L1RollupConstants,
  ) {}

  abstract getRollupAddress(): Promise<EthAddress>;

  abstract getRegistryAddress(): Promise<EthAddress>;

  abstract getL1Constants(): Promise<L1RollupConstants>;

  abstract getGenesisValues(): Promise<{ genesisArchiveRoot: Fr }>;

  abstract getL1Timestamp(): Promise<bigint | undefined>;

  abstract getL2Tips(): Promise<L2Tips>;

  abstract getSyncedL2SlotNumber(): Promise<SlotNumber | undefined>;

  abstract getSyncedL2EpochNumber(): Promise<EpochNumber | undefined>;

  abstract isEpochComplete(epochNumber: EpochNumber): Promise<boolean>;

  abstract syncImmediate(): Promise<void>;

  public getCheckpointNumber(): Promise<CheckpointNumber> {
    return this.stores.blockStore.getLatestCheckpointNumber();
  }

  public getSynchedCheckpointNumber(): Promise<CheckpointNumber> {
    return this.stores.blockStore.getLatestCheckpointNumber();
  }

  public getProvenCheckpointNumber(): Promise<CheckpointNumber> {
    return this.stores.blockStore.getProvenCheckpointNumber();
  }

  public getBlockNumber(): Promise<BlockNumber> {
    return this.stores.blockStore.getLatestL2BlockNumber();
  }

  public getProvenBlockNumber(): Promise<BlockNumber> {
    return this.stores.blockStore.getProvenBlockNumber();
  }

  public async getBlockHeader(number: BlockNumber | 'latest'): Promise<BlockHeader | undefined> {
    const blockNumber = number === 'latest' ? await this.stores.blockStore.getLatestL2BlockNumber() : number;
    if (blockNumber === 0) {
      return undefined;
    }
    const headers = await this.stores.blockStore.getBlockHeaders(blockNumber, 1);
    return headers.length === 0 ? undefined : headers[0];
  }

  public getCheckpointedBlock(number: BlockNumber): Promise<CheckpointedL2Block | undefined> {
    return this.stores.blockStore.getCheckpointedBlock(number);
  }

  public getCheckpointedL2BlockNumber(): Promise<BlockNumber> {
    return this.stores.blockStore.getCheckpointedL2BlockNumber();
  }

  public getFinalizedL2BlockNumber(): Promise<BlockNumber> {
    return this.stores.blockStore.getFinalizedL2BlockNumber();
  }

  public async getCheckpointHeader(number: CheckpointNumber | 'latest'): Promise<CheckpointHeader | undefined> {
    if (number === 'latest') {
      number = await this.stores.blockStore.getLatestCheckpointNumber();
    }
    if (number === 0) {
      return undefined;
    }
    const checkpoint = await this.stores.blockStore.getCheckpointData(number);
    if (!checkpoint) {
      return undefined;
    }
    return checkpoint.header;
  }

  public async getLastBlockNumberInCheckpoint(checkpointNumber: CheckpointNumber): Promise<BlockNumber | undefined> {
    const checkpointData = await this.stores.blockStore.getCheckpointData(checkpointNumber);
    if (!checkpointData) {
      return undefined;
    }
    return BlockNumber(checkpointData.startBlock + checkpointData.blockCount - 1);
  }

  public getCheckpointedBlocks(from: BlockNumber, limit: number): Promise<CheckpointedL2Block[]> {
    return this.stores.blockStore.getCheckpointedBlocks(from, limit);
  }

  public getCheckpointData(checkpointNumber: CheckpointNumber): Promise<CheckpointData | undefined> {
    return this.stores.blockStore.getCheckpointData(checkpointNumber);
  }

  public getCheckpointDataRange(from: CheckpointNumber, limit: number): Promise<CheckpointData[]> {
    return this.stores.blockStore.getRangeOfCheckpoints(from, limit);
  }

  public getCheckpointNumberBySlot(slot: SlotNumber): Promise<CheckpointNumber | undefined> {
    return this.stores.blockStore.getCheckpointNumberBySlot(slot);
  }

  public getBlockDataWithCheckpointContext(blockNumber: BlockNumber) {
    return this.stores.blockStore.getBlockDataWithCheckpointContext(blockNumber);
  }

  public getBlockHeaderByHash(blockHash: BlockHash): Promise<BlockHeader | undefined> {
    return this.stores.blockStore.getBlockHeaderByHash(blockHash);
  }

  public getBlockHeaderByArchive(archive: Fr): Promise<BlockHeader | undefined> {
    return this.stores.blockStore.getBlockHeaderByArchive(archive);
  }

  public getBlockData(number: BlockNumber): Promise<BlockData | undefined> {
    return this.stores.blockStore.getBlockData(number);
  }

  public getBlockDataByArchive(archive: Fr): Promise<BlockData | undefined> {
    return this.stores.blockStore.getBlockDataByArchive(archive);
  }

  public async getL2Block(number: BlockNumber): Promise<L2Block | undefined> {
    // If the number provided is -ve, then return the latest block.
    if (number < 0) {
      number = await this.stores.blockStore.getLatestL2BlockNumber();
    }
    if (number === 0) {
      return undefined;
    }
    return this.stores.blockStore.getBlock(number);
  }

  public getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    return this.stores.blockStore.getTxEffect(txHash);
  }

  public getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    return this.stores.blockStore.getSettledTxReceipt(txHash, this.l1Constants);
  }

  public getLastCheckpoint(): Promise<CommonCheckpointData | undefined> {
    return this.stores.blockStore.getLastCheckpoint();
  }

  public getLastProposedCheckpoint(): Promise<ProposedCheckpointData | undefined> {
    return this.stores.blockStore.getLastProposedCheckpoint();
  }

  public isPendingChainInvalid(): Promise<boolean> {
    return this.getPendingChainValidationStatus().then(status => !status.valid);
  }

  public async getPendingChainValidationStatus(): Promise<ValidateCheckpointResult> {
    return (await this.stores.blockStore.getPendingChainValidationStatus()) ?? { valid: true };
  }

  public getPrivateLogsByTags(
    tags: SiloedTag[],
    page?: number,
    upToBlockNumber?: BlockNumber,
  ): Promise<TxScopedL2Log[][]> {
    return this.stores.logStore.getPrivateLogsByTags(tags, page, upToBlockNumber);
  }

  public getPublicLogsByTagsFromContract(
    contractAddress: AztecAddress,
    tags: Tag[],
    page?: number,
    upToBlockNumber?: BlockNumber,
  ): Promise<TxScopedL2Log[][]> {
    return this.stores.logStore.getPublicLogsByTagsFromContract(contractAddress, tags, page, upToBlockNumber);
  }

  public getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    return this.stores.logStore.getPublicLogs(filter);
  }

  public getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    return this.stores.logStore.getContractClassLogs(filter);
  }

  public getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.stores.contractClassStore.getContractClass(id);
  }

  public getBytecodeCommitment(id: Fr): Promise<Fr | undefined> {
    return this.stores.contractClassStore.getBytecodeCommitment(id);
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

    return this.stores.contractInstanceStore.getContractInstance(address, timestamp);
  }

  public getContractClassIds(): Promise<Fr[]> {
    return this.stores.contractClassStore.getContractClassIds();
  }

  /** Looks up a public function name given a selector. */
  public getDebugFunctionName(_address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return Promise.resolve(this.stores.functionNames.get(selector.toString()));
  }

  /** Register public function signatures so they can be looked up by selector. */
  public registerContractFunctionSignatures(signatures: string[]): Promise<void> {
    return registerContractFunctionSignatures(this.stores, signatures);
  }

  public getL1ToL2Messages(checkpointNumber: CheckpointNumber): Promise<Fr[]> {
    return this.stores.messageStore.getL1ToL2Messages(checkpointNumber);
  }

  public getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    return this.stores.messageStore.getL1ToL2MessageIndex(l1ToL2Message);
  }

  public async getCheckpoints(checkpointNumber: CheckpointNumber, limit: number): Promise<PublishedCheckpoint[]> {
    const checkpoints = await this.stores.blockStore.getRangeOfCheckpoints(checkpointNumber, limit);
    return Promise.all(checkpoints.map(ch => this.getPublishedCheckpointFromCheckpointData(ch)));
  }

  private async getPublishedCheckpointFromCheckpointData(checkpoint: CheckpointData): Promise<PublishedCheckpoint> {
    const blocksForCheckpoint = await this.stores.blockStore.getBlocksForCheckpoint(checkpoint.checkpointNumber);
    if (!blocksForCheckpoint) {
      throw new Error(`Blocks for checkpoint ${checkpoint.checkpointNumber} not found`);
    }
    const fullCheckpoint = new Checkpoint(
      checkpoint.archive,
      checkpoint.header,
      blocksForCheckpoint,
      checkpoint.checkpointNumber,
      checkpoint.feeAssetPriceModifier,
    );
    return new PublishedCheckpoint(fullCheckpoint, checkpoint.l1, checkpoint.attestations);
  }

  public getBlocksForSlot(slotNumber: SlotNumber): Promise<L2Block[]> {
    return this.stores.blockStore.getBlocksForSlot(slotNumber);
  }

  public async getCheckpointedBlocksForEpoch(epochNumber: EpochNumber): Promise<CheckpointedL2Block[]> {
    const checkpointsData = await this.getCheckpointsDataForEpoch(epochNumber);
    const blocks = await Promise.all(
      checkpointsData.flatMap(checkpoint =>
        range(checkpoint.blockCount, checkpoint.startBlock).map(blockNumber =>
          this.getCheckpointedBlock(BlockNumber(blockNumber)),
        ),
      ),
    );
    return blocks.filter(isDefined);
  }

  public async getCheckpointedBlockHeadersForEpoch(epochNumber: EpochNumber): Promise<BlockHeader[]> {
    const checkpointsData = await this.getCheckpointsDataForEpoch(epochNumber);
    const blocks = await Promise.all(
      checkpointsData.flatMap(checkpoint =>
        range(checkpoint.blockCount, checkpoint.startBlock).map(blockNumber =>
          this.getBlockHeader(BlockNumber(blockNumber)),
        ),
      ),
    );
    return blocks.filter(isDefined);
  }

  public async getCheckpointsForEpoch(epochNumber: EpochNumber): Promise<Checkpoint[]> {
    const checkpointsData = await this.getCheckpointsDataForEpoch(epochNumber);
    return Promise.all(
      checkpointsData.map(data => this.getPublishedCheckpointFromCheckpointData(data).then(p => p.checkpoint)),
    );
  }

  /** Returns checkpoint data for all checkpoints whose slot falls within the given epoch. */
  public getCheckpointsDataForEpoch(epochNumber: EpochNumber): Promise<CheckpointData[]> {
    if (!this.l1Constants) {
      throw new Error('L1 constants not set');
    }

    const [start, end] = getSlotRangeForEpoch(epochNumber, this.l1Constants);
    return this.stores.blockStore.getCheckpointDataForSlotRange(start, end);
  }

  public async getBlock(number: BlockNumber): Promise<L2Block | undefined> {
    // If the number provided is -ve, then return the latest block.
    if (number < 0) {
      number = await this.stores.blockStore.getLatestL2BlockNumber();
    }
    if (number === 0) {
      return undefined;
    }
    return this.stores.blockStore.getBlock(number);
  }

  public getBlocks(from: BlockNumber, limit: number): Promise<L2Block[]> {
    return this.stores.blockStore.getBlocks(from, limit);
  }

  public getCheckpointedBlockByHash(blockHash: BlockHash): Promise<CheckpointedL2Block | undefined> {
    return this.stores.blockStore.getCheckpointedBlockByHash(blockHash);
  }

  public getCheckpointedBlockByArchive(archive: Fr): Promise<CheckpointedL2Block | undefined> {
    return this.stores.blockStore.getCheckpointedBlockByArchive(archive);
  }

  public async getL2BlockByHash(blockHash: BlockHash): Promise<L2Block | undefined> {
    const checkpointedBlock = await this.stores.blockStore.getCheckpointedBlockByHash(blockHash);
    return checkpointedBlock?.block;
  }

  public async getL2BlockByArchive(archive: Fr): Promise<L2Block | undefined> {
    const checkpointedBlock = await this.stores.blockStore.getCheckpointedBlockByArchive(archive);
    return checkpointedBlock?.block;
  }
}
