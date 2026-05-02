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
import type { ArchiverDataStores } from '../store/data_stores.js';
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
    return this.stores.blocks.getLatestCheckpointNumber();
  }

  public getSynchedCheckpointNumber(): Promise<CheckpointNumber> {
    return this.stores.blocks.getLatestCheckpointNumber();
  }

  public getProvenCheckpointNumber(): Promise<CheckpointNumber> {
    return this.stores.blocks.getProvenCheckpointNumber();
  }

  public getBlockNumber(): Promise<BlockNumber> {
    return this.stores.blocks.getLatestL2BlockNumber();
  }

  public getProvenBlockNumber(): Promise<BlockNumber> {
    return this.stores.blocks.getProvenBlockNumber();
  }

  public async getBlockHeader(number: BlockNumber | 'latest'): Promise<BlockHeader | undefined> {
    const blockNumber = number === 'latest' ? await this.stores.blocks.getLatestL2BlockNumber() : number;
    if (blockNumber === 0) {
      return undefined;
    }
    const headers = await this.stores.blocks.getBlockHeaders(blockNumber, 1);
    return headers.length === 0 ? undefined : headers[0];
  }

  public getCheckpointedBlock(number: BlockNumber): Promise<CheckpointedL2Block | undefined> {
    return this.stores.blocks.getCheckpointedBlock(number);
  }

  public getCheckpointedL2BlockNumber(): Promise<BlockNumber> {
    return this.stores.blocks.getCheckpointedL2BlockNumber();
  }

  public getFinalizedL2BlockNumber(): Promise<BlockNumber> {
    return this.stores.blocks.getFinalizedL2BlockNumber();
  }

  public async getCheckpointHeader(number: CheckpointNumber | 'latest'): Promise<CheckpointHeader | undefined> {
    if (number === 'latest') {
      number = await this.stores.blocks.getLatestCheckpointNumber();
    }
    if (number === 0) {
      return undefined;
    }
    const checkpoint = await this.stores.blocks.getCheckpointData(number);
    if (!checkpoint) {
      return undefined;
    }
    return checkpoint.header;
  }

  public async getLastBlockNumberInCheckpoint(checkpointNumber: CheckpointNumber): Promise<BlockNumber | undefined> {
    const checkpointData = await this.stores.blocks.getCheckpointData(checkpointNumber);
    if (!checkpointData) {
      return undefined;
    }
    return BlockNumber(checkpointData.startBlock + checkpointData.blockCount - 1);
  }

  public getCheckpointedBlocks(from: BlockNumber, limit: number): Promise<CheckpointedL2Block[]> {
    return this.stores.blocks.getCheckpointedBlocks(from, limit);
  }

  public getCheckpointData(checkpointNumber: CheckpointNumber): Promise<CheckpointData | undefined> {
    return this.stores.blocks.getCheckpointData(checkpointNumber);
  }

  public getCheckpointDataRange(from: CheckpointNumber, limit: number): Promise<CheckpointData[]> {
    return this.stores.blocks.getRangeOfCheckpoints(from, limit);
  }

  public getCheckpointNumberBySlot(slot: SlotNumber): Promise<CheckpointNumber | undefined> {
    return this.stores.blocks.getCheckpointNumberBySlot(slot);
  }

  public getBlockDataWithCheckpointContext(blockNumber: BlockNumber) {
    return this.stores.blocks.getBlockDataWithCheckpointContext(blockNumber);
  }

  public getBlockHeaderByHash(blockHash: BlockHash): Promise<BlockHeader | undefined> {
    return this.stores.blocks.getBlockHeaderByHash(blockHash);
  }

  public getBlockHeaderByArchive(archive: Fr): Promise<BlockHeader | undefined> {
    return this.stores.blocks.getBlockHeaderByArchive(archive);
  }

  public getBlockData(number: BlockNumber): Promise<BlockData | undefined> {
    return this.stores.blocks.getBlockData(number);
  }

  public getBlockDataByArchive(archive: Fr): Promise<BlockData | undefined> {
    return this.stores.blocks.getBlockDataByArchive(archive);
  }

  public async getL2Block(number: BlockNumber): Promise<L2Block | undefined> {
    // If the number provided is -ve, then return the latest block.
    if (number < 0) {
      number = await this.stores.blocks.getLatestL2BlockNumber();
    }
    if (number === 0) {
      return undefined;
    }
    return this.stores.blocks.getBlock(number);
  }

  public getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    return this.stores.blocks.getTxEffect(txHash);
  }

  public getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    return this.stores.blocks.getSettledTxReceipt(txHash, this.l1Constants);
  }

  public getLastCheckpoint(): Promise<CommonCheckpointData | undefined> {
    return this.stores.blocks.getLastCheckpoint();
  }

  public getLastProposedCheckpoint(): Promise<ProposedCheckpointData | undefined> {
    return this.stores.blocks.getLastProposedCheckpoint();
  }

  public isPendingChainInvalid(): Promise<boolean> {
    return this.getPendingChainValidationStatus().then(status => !status.valid);
  }

  public async getPendingChainValidationStatus(): Promise<ValidateCheckpointResult> {
    return (await this.stores.blocks.getPendingChainValidationStatus()) ?? { valid: true };
  }

  public getPrivateLogsByTags(
    tags: SiloedTag[],
    page?: number,
    upToBlockNumber?: BlockNumber,
  ): Promise<TxScopedL2Log[][]> {
    return this.stores.logs.getPrivateLogsByTags(tags, page, upToBlockNumber);
  }

  public getPublicLogsByTagsFromContract(
    contractAddress: AztecAddress,
    tags: Tag[],
    page?: number,
    upToBlockNumber?: BlockNumber,
  ): Promise<TxScopedL2Log[][]> {
    return this.stores.logs.getPublicLogsByTagsFromContract(contractAddress, tags, page, upToBlockNumber);
  }

  public getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    return this.stores.logs.getPublicLogs(filter);
  }

  public getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    return this.stores.logs.getContractClassLogs(filter);
  }

  public getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.stores.contractClasses.getContractClass(id);
  }

  public getBytecodeCommitment(id: Fr): Promise<Fr | undefined> {
    return this.stores.contractClasses.getBytecodeCommitment(id);
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

    return this.stores.contractInstances.getContractInstance(address, timestamp);
  }

  public getContractClassIds(): Promise<Fr[]> {
    return this.stores.contractClasses.getContractClassIds();
  }

  /** Looks up a public function name given a selector. */
  public getDebugFunctionName(_address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return Promise.resolve(this.stores.functionNames.get(selector));
  }

  /** Register public function signatures so they can be looked up by selector. */
  public registerContractFunctionSignatures(signatures: string[]): Promise<void> {
    return this.stores.functionNames.register(signatures);
  }

  public getL1ToL2Messages(checkpointNumber: CheckpointNumber): Promise<Fr[]> {
    return this.stores.messages.getL1ToL2Messages(checkpointNumber);
  }

  public getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    return this.stores.messages.getL1ToL2MessageIndex(l1ToL2Message);
  }

  public async getCheckpoints(checkpointNumber: CheckpointNumber, limit: number): Promise<PublishedCheckpoint[]> {
    const checkpoints = await this.stores.blocks.getRangeOfCheckpoints(checkpointNumber, limit);
    return Promise.all(checkpoints.map(ch => this.getPublishedCheckpointFromCheckpointData(ch)));
  }

  private async getPublishedCheckpointFromCheckpointData(checkpoint: CheckpointData): Promise<PublishedCheckpoint> {
    const blocksForCheckpoint = await this.stores.blocks.getBlocksForCheckpoint(checkpoint.checkpointNumber);
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
    return this.stores.blocks.getBlocksForSlot(slotNumber);
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
    return this.stores.blocks.getCheckpointDataForSlotRange(start, end);
  }

  public async getBlock(number: BlockNumber): Promise<L2Block | undefined> {
    // If the number provided is -ve, then return the latest block.
    if (number < 0) {
      number = await this.stores.blocks.getLatestL2BlockNumber();
    }
    if (number === 0) {
      return undefined;
    }
    return this.stores.blocks.getBlock(number);
  }

  public getBlocks(from: BlockNumber, limit: number): Promise<L2Block[]> {
    return this.stores.blocks.getBlocks(from, limit);
  }

  public getCheckpointedBlockByHash(blockHash: BlockHash): Promise<CheckpointedL2Block | undefined> {
    return this.stores.blocks.getCheckpointedBlockByHash(blockHash);
  }

  public getCheckpointedBlockByArchive(archive: Fr): Promise<CheckpointedL2Block | undefined> {
    return this.stores.blocks.getCheckpointedBlockByArchive(archive);
  }

  public async getL2BlockByHash(blockHash: BlockHash): Promise<L2Block | undefined> {
    const checkpointedBlock = await this.stores.blocks.getCheckpointedBlockByHash(blockHash);
    return checkpointedBlock?.block;
  }

  public async getL2BlockByArchive(archive: Fr): Promise<L2Block | undefined> {
    const checkpointedBlock = await this.stores.blocks.getCheckpointedBlockByArchive(archive);
    return checkpointedBlock?.block;
  }
}
