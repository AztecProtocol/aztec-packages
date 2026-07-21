import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import {
  BlockNumber,
  CheckpointNumber,
  type EpochNumber,
  IndexWithinCheckpoint,
  type SlotNumber,
} from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type BlockData,
  type BlockHash,
  type BlockQuery,
  type BlockTag,
  type BlocksQuery,
  Body,
  type CheckpointQuery,
  type CheckpointsQuery,
  L2Block,
  type L2Tips,
  type ProposedCheckpointQuery,
} from '@aztec/stdlib/block';
import {
  Checkpoint,
  type CheckpointData,
  type ProposedCheckpointData,
  PublishedCheckpoint,
} from '@aztec/stdlib/checkpoint';
import type { ContractClassPublic, ContractDataSource, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import {
  type L1RollupConstants,
  getEpochAtSlot,
  getEpochNumberAtTimestamp,
  getLastL1SlotTimestampForL2Slot,
  getProofSubmissionDeadlineEpoch,
  getSlotRangeForEpoch,
} from '@aztec/stdlib/epoch-helpers';
import type { L2LogsSource } from '@aztec/stdlib/interfaces/server';
import type { LogResult, PrivateLogsQuery, PublicLogsQuery } from '@aztec/stdlib/logs';
import type { L1ToL2MessageSource, L2ToL1MembershipWitness } from '@aztec/stdlib/messaging';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import type { BlockHeader, IndexedTxEffect, TxHash } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import type { ArchiverDataSource } from '../interfaces.js';
import type { ResolvedBlockQuery, ResolvedBlocksQuery } from '../store/block_store.js';
import type { ArchiverDataStores } from '../store/data_stores.js';
import type { ValidateCheckpointResult } from './validation.js';

/**
 * Sentinel returned by {@link ArchiverDataSourceBase#resolveBlockQuery} when a query resolves
 * to the genesis block. Forces single-block lookup methods to take the genesis branch
 * explicitly rather than silently falling through to the BlockStore (which never has a block 0).
 */
type GenesisBlockQuery = { genesis: true };

/**
 * Abstract base class implementing ArchiverDataSource using a bundle of archiver substores.
 * Provides implementations for all read-side methods and declares abstract methods for
 * L1-dependent functionality that subclasses must implement.
 */
export abstract class ArchiverDataSourceBase
  implements ArchiverDataSource, L2LogsSource, ContractDataSource, L1ToL2MessageSource
{
  /** The injected genesis block header. */
  protected readonly initialHeader: BlockHeader;
  /** Precomputed hash of the initial header, exposed via {@link getGenesisBlockHash}. */
  protected readonly initialBlockHash: BlockHash;
  /** Archive root after block 0 was appended — read from L1 (`Rollup.getGenesisArchiveTreeRoot`). */
  protected readonly genesisArchiveRoot: Fr;

  /** Memoized synthetic genesis block — callers rely on referential identity for caching. */
  private readonly genesisBlock: L2Block;
  /** Memoized synthetic genesis block data — kept consistent with {@link genesisBlock}. */
  private readonly genesisBlockData: BlockData;

  constructor(
    protected readonly stores: ArchiverDataStores,
    protected readonly l1Constants: L1RollupConstants | undefined,
    initialHeader: BlockHeader,
    initialBlockHash: BlockHash,
    genesisArchiveRoot: Fr,
  ) {
    this.initialHeader = initialHeader;
    this.initialBlockHash = initialBlockHash;
    this.genesisArchiveRoot = genesisArchiveRoot;

    const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
    this.genesisBlock = new L2Block(
      genesisArchive,
      initialHeader,
      Body.empty(),
      CheckpointNumber.ZERO,
      IndexWithinCheckpoint(0),
    );
    this.genesisBlockData = {
      header: initialHeader,
      archive: genesisArchive,
      blockHash: initialBlockHash,
      checkpointNumber: CheckpointNumber.ZERO,
      indexWithinCheckpoint: IndexWithinCheckpoint(0),
    };
  }

  /** Returns the precomputed hash of the genesis block header. */
  public getGenesisBlockHash(): BlockHash {
    return this.initialBlockHash;
  }

  /** Returns the synthetic genesis L2Block (memoized — same instance across calls). */
  private getGenesisBlock(): L2Block {
    return this.genesisBlock;
  }

  /** Returns genesis block data (memoized — same instance across calls). */
  private getGenesisBlockData(): BlockData {
    return this.genesisBlockData;
  }

  /**
   * Type guard distinguishing the genesis sentinel from a {@link ResolvedBlockQuery}.
   * `resolveBlockQuery` already rewrites every genesis-matching shape to the sentinel,
   * so callers only need this single sync check.
   */
  private isGenesisBlockQuery(query: ResolvedBlockQuery | GenesisBlockQuery): query is GenesisBlockQuery {
    return 'genesis' in query;
  }

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

  abstract getL2ToL1MembershipWitness(
    txHash: TxHash,
    message: Fr,
    messageIndexInTx?: number,
  ): Promise<L2ToL1MembershipWitness | undefined>;

  public async isPruneDueAtSlot(slot: SlotNumber): Promise<boolean> {
    if (!this.l1Constants) {
      throw new Error('isPruneDueAtSlot requires l1Constants');
    }
    const tips = await this.getL2Tips();
    const proven = tips.proven.checkpoint.number;
    const pending = tips.checkpointed.checkpoint.number;
    if (pending === proven) {
      return false;
    }

    const oldestUnproven = await this.getCheckpointData({ number: CheckpointNumber(Number(proven) + 1) });
    if (!oldestUnproven) {
      return false;
    }

    const slotTs = getLastL1SlotTimestampForL2Slot(slot, this.l1Constants);
    const slotEpoch = getEpochNumberAtTimestamp(slotTs, this.l1Constants);
    const oldestUnprovenEpoch = getEpochAtSlot(oldestUnproven.header.slotNumber, this.l1Constants);
    const deadlineEpoch = getProofSubmissionDeadlineEpoch(oldestUnprovenEpoch, this.l1Constants);
    return slotEpoch >= deadlineEpoch;
  }

  public getCheckpointNumber(): Promise<CheckpointNumber> {
    return this.stores.blocks.getLatestCheckpointNumber();
  }

  public getProvenCheckpointNumber(): Promise<CheckpointNumber> {
    return this.stores.blocks.getProvenCheckpointNumber();
  }

  public getBlockNumber(): Promise<BlockNumber>;
  public getBlockNumber(query: BlockQuery): Promise<BlockNumber | undefined>;
  public async getBlockNumber(query?: BlockQuery): Promise<BlockNumber | undefined> {
    if (!query) {
      return this.stores.blocks.getLatestL2BlockNumber();
    }
    const resolved = await this.resolveBlockQuery(query);
    if (resolved === undefined) {
      return undefined;
    }
    if (this.isGenesisBlockQuery(resolved)) {
      return BlockNumber.ZERO;
    }
    return this.stores.blocks.getBlockNumber(resolved);
  }

  /**
   * Resolves a {@link CheckpointQuery} to a concrete `CheckpointNumber`, or undefined when the
   * query refers to a position that has no checkpoint yet (e.g. `{ slot }` not found).
   */
  private resolveCheckpointQuery(query: CheckpointQuery): Promise<CheckpointNumber | undefined> {
    if ('number' in query) {
      return Promise.resolve(query.number);
    }
    if ('slot' in query) {
      return this.stores.blocks.getCheckpointNumberBySlot(query.slot);
    }
    // tag variant
    switch (query.tag) {
      case 'checkpointed':
        return this.stores.blocks.getLatestCheckpointNumber();
      case 'proven':
        return this.stores.blocks.getProvenCheckpointNumber();
      case 'finalized':
        return this.stores.blocks.getFinalizedCheckpointNumber();
    }
  }

  public async getCheckpoint(query: CheckpointQuery): Promise<PublishedCheckpoint | undefined> {
    const number = await this.resolveCheckpointQuery(query);
    if (number === undefined || number === 0) {
      return undefined;
    }
    const data = await this.stores.blocks.getCheckpointData(number);
    if (!data) {
      return undefined;
    }
    return this.getPublishedCheckpointFromCheckpointData(data);
  }

  public async getCheckpoints(query: CheckpointsQuery): Promise<PublishedCheckpoint[]> {
    const checkpoints = await this.getCheckpointsData(query);
    return Promise.all(checkpoints.map(ch => this.getPublishedCheckpointFromCheckpointData(ch)));
  }

  public async getCheckpointData(query: CheckpointQuery): Promise<CheckpointData | undefined> {
    const number = await this.resolveCheckpointQuery(query);
    if (number === undefined || number === 0) {
      return undefined;
    }
    return this.stores.blocks.getCheckpointData(number);
  }

  public async getCheckpointsData(query: CheckpointsQuery): Promise<CheckpointData[]> {
    if ('fromSlot' in query) {
      return this.stores.blocks.getCheckpointsBySlot(query.fromSlot, query.limit, query.reverse ?? false);
    }
    if ('from' in query) {
      return this.stores.blocks.getRangeOfCheckpoints(query.from, query.limit);
    }
    const numbers = await this.getCheckpointNumbersForEpoch(query.epoch);
    return numbers.length > 0 ? this.stores.blocks.getRangeOfCheckpoints(numbers[0], numbers.length) : [];
  }

  public getProposedCheckpointData(query?: ProposedCheckpointQuery): Promise<ProposedCheckpointData | undefined> {
    if (!query || 'tag' in query) {
      return this.stores.blocks.getLastProposedCheckpoint();
    }
    if ('number' in query) {
      return this.stores.blocks.getProposedCheckpointByNumber(query.number);
    }
    return this.stores.blocks.getProposedCheckpointBySlot(query.slot);
  }

  public getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    return this.stores.blocks.getTxEffect(txHash);
  }

  public isPendingChainInvalid(): Promise<boolean> {
    return this.getPendingChainValidationStatus().then(status => !status.valid);
  }

  public async getPendingChainValidationStatus(): Promise<ValidateCheckpointResult> {
    return (await this.stores.blocks.getPendingChainValidationStatus()) ?? { valid: true };
  }

  public getPrivateLogsByTags(query: PrivateLogsQuery): Promise<LogResult[][]> {
    return this.stores.logs.getPrivateLogsByTags(query);
  }

  public getPublicLogsByTags(query: PublicLogsQuery): Promise<LogResult[][]> {
    return this.stores.logs.getPublicLogsByTags(query);
  }

  public getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.stores.contractClasses.getContractClass(id);
  }

  public getBytecodeCommitment(id: Fr): Promise<Fr | undefined> {
    return this.stores.contractClasses.getBytecodeCommitment(id);
  }

  public getContract(address: AztecAddress, timestamp: UInt64): Promise<ContractInstanceWithAddress | undefined> {
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

  /** Returns just the checkpoint numbers for all checkpoints whose slot falls within the given epoch. */
  private getCheckpointNumbersForEpoch(epochNumber: EpochNumber): Promise<CheckpointNumber[]> {
    if (!this.l1Constants) {
      throw new Error('L1 constants not set');
    }

    const [start, end] = getSlotRangeForEpoch(epochNumber, this.l1Constants);
    return this.stores.blocks.getCheckpointNumbersForSlotRange(start, end);
  }

  public async getBlock(query: BlockQuery): Promise<L2Block | undefined> {
    const resolved = await this.resolveBlockQuery(query);
    if (resolved === undefined) {
      return undefined;
    }
    if (this.isGenesisBlockQuery(resolved)) {
      return this.getGenesisBlock();
    }
    return this.stores.blocks.getBlock(resolved);
  }

  /**
   * Range queries iterate physical blocks only; the genesis block is NOT prepended.
   * `L2BlockStream` consumers (`world-state.handleL2Blocks`, etc.) emit `blocks-added` events for
   * real blocks and would be surprised by a synthetic block 0. Use {@link getBlock} or
   * {@link getBlockData} for genesis-aware single-block lookups.
   */
  public async getBlocks(query: BlocksQuery): Promise<L2Block[]> {
    const resolved = await this.resolveBlocksQuery(query);
    return resolved ? this.stores.blocks.getBlocks(resolved) : [];
  }

  public async getBlockData(query: BlockQuery): Promise<BlockData | undefined> {
    const resolved = await this.resolveBlockQuery(query);
    if (resolved === undefined) {
      return undefined;
    }
    if (this.isGenesisBlockQuery(resolved)) {
      return this.getGenesisBlockData();
    }
    return this.stores.blocks.getBlockData(resolved);
  }

  /** See {@link getBlocks} — range queries do not prepend the genesis block. */
  public async getBlocksData(query: BlocksQuery): Promise<BlockData[]> {
    const resolved = await this.resolveBlocksQuery(query);
    return resolved ? this.stores.blocks.getBlocksData(resolved) : [];
  }

  /**
   * Resolves a {@link BlockQuery} to either the genesis sentinel or a {@link ResolvedBlockQuery}
   * understood by BlockStore. Detects every shape that points at block 0 — `{number:0}`,
   * `{hash}` matching the initial header, `{archive}` matching the post-genesis archive root,
   * and `{tag}` resolving to 0 — and rewrites them to the sentinel so callers branch once.
   */
  private async resolveBlockQuery(query: BlockQuery): Promise<ResolvedBlockQuery | GenesisBlockQuery | undefined> {
    if ('number' in query) {
      return query.number === BlockNumber.ZERO ? { genesis: true } : query;
    }
    if ('hash' in query) {
      return query.hash.equals(this.initialBlockHash) ? { genesis: true } : query;
    }
    if ('archive' in query) {
      return query.archive.equals(this.genesisArchiveRoot) ? { genesis: true } : query;
    }
    const number = await this.resolveBlockTag(query.tag);
    if (number === BlockNumber.ZERO) {
      return { genesis: true };
    }
    return { number };
  }

  /** Maps a {@link BlockTag} to the matching block number for the current chain state. */
  private resolveBlockTag(tag: BlockTag): Promise<BlockNumber> {
    switch (tag) {
      case 'latest':
      case 'proposed':
        return this.stores.blocks.getLatestL2BlockNumber();
      case 'checkpointed':
        return this.stores.blocks.getCheckpointedL2BlockNumber();
      case 'proven':
        return this.stores.blocks.getProvenBlockNumber();
      case 'finalized':
        return this.stores.blocks.getFinalizedL2BlockNumber();
    }
  }

  /**
   * Converts an epoch-based BlocksQuery to a from/limit query using l1Constants.
   * Returns undefined when the epoch has no checkpoints, so callers can return [] without
   * entering BlockStore. Reads only the two endpoint checkpoints rather than the whole epoch.
   */
  private async resolveBlocksQuery(query: BlocksQuery): Promise<ResolvedBlocksQuery | undefined> {
    if (!('epoch' in query)) {
      if (query.from < INITIAL_L2_BLOCK_NUM) {
        throw new Error(
          `getBlocks/getBlocksData: 'from' must be >= ${INITIAL_L2_BLOCK_NUM}, got ${query.from}. ` +
            `Use getBlock({number:0})/getBlockData({number:0}) for genesis-aware single-block lookups.`,
        );
      }
      return query;
    }
    const checkpointNumbers = await this.getCheckpointNumbersForEpoch(query.epoch);
    if (checkpointNumbers.length === 0) {
      return undefined;
    }
    const firstNumber = checkpointNumbers[0];
    const lastNumber = checkpointNumbers[checkpointNumbers.length - 1];
    const first = await this.stores.blocks.getCheckpointData(firstNumber);
    if (!first) {
      return undefined;
    }
    const last = firstNumber === lastNumber ? first : await this.stores.blocks.getCheckpointData(lastNumber);
    if (!last) {
      return undefined;
    }
    const from = BlockNumber(first.startBlock);
    const limit = last.startBlock + last.blockCount - first.startBlock;
    return { from, limit, onlyCheckpointed: true };
  }
}
