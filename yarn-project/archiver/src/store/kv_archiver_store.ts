import type { L1BlockId } from '@aztec/ethereum/l1-types';
import type { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, CustomRange, StoreSize } from '@aztec/kv-store';
import { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CheckpointedL2Block, L2Block, L2BlockHash, type ValidateCheckpointResult } from '@aztec/stdlib/block';
import type { PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type {
  ContractClassPublic,
  ContractDataSource,
  ContractInstanceUpdateWithAddress,
  ContractInstanceWithAddress,
  ExecutablePrivateFunctionWithMembershipProof,
  UtilityFunctionWithMembershipProof,
} from '@aztec/stdlib/contract';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { GetContractClassLogsResponse, GetPublicLogsResponse } from '@aztec/stdlib/interfaces/client';
import type { LogFilter, SiloedTag, Tag, TxScopedL2Log } from '@aztec/stdlib/logs';
import type { BlockHeader, TxHash, TxReceipt } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import { join } from 'path';

import type { InboxMessage } from '../structs/inbox_message.js';
import { BlockStore, type CheckpointData, type RemoveCheckpointsResult } from './block_store.js';
import { ContractClassStore } from './contract_class_store.js';
import { ContractInstanceStore } from './contract_instance_store.js';
import { LogStore } from './log_store.js';
import { MessageStore } from './message_store.js';

export const ARCHIVER_DB_VERSION = 5;
export const MAX_FUNCTION_SIGNATURES = 1000;
export const MAX_FUNCTION_NAME_LEN = 256;

/**
 * Represents the latest L1 block processed by the archiver for various objects in L2.
 */
export type ArchiverL1SynchPoint = {
  /** Number of the last L1 block that added a new L2 checkpoint metadata.  */
  blocksSynchedTo?: bigint;
  /** Last L1 block checked for L1 to L2 messages. */
  messagesSynchedTo?: L1BlockId;
};

/**
 * LMDB-based data store for the archiver.
 * Stores all archiver data including blocks, logs, contract classes/instances, and L1 to L2 messages.
 */
export class KVArchiverDataStore implements ContractDataSource {
  public static readonly SCHEMA_VERSION = ARCHIVER_DB_VERSION;

  #blockStore: BlockStore;
  #logStore: LogStore;
  #messageStore: MessageStore;
  #contractClassStore: ContractClassStore;
  #contractInstanceStore: ContractInstanceStore;

  private functionNames = new Map<string, string>();

  #log = createLogger('archiver:data-store');

  constructor(
    private db: AztecAsyncKVStore,
    logsMaxPageSize: number = 1000,
    l1Constants: Pick<L1RollupConstants, 'epochDuration'>,
  ) {
    this.#blockStore = new BlockStore(db, l1Constants);
    this.#logStore = new LogStore(db, this.#blockStore, logsMaxPageSize);
    this.#messageStore = new MessageStore(db);
    this.#contractClassStore = new ContractClassStore(db);
    this.#contractInstanceStore = new ContractInstanceStore(db);
  }

  /** Opens a new transaction to the underlying store and runs all operations within it. */
  public transactionAsync<T>(callback: () => Promise<T>): Promise<T> {
    return this.db.transactionAsync(callback);
  }

  public getBlockNumber(): Promise<BlockNumber> {
    return this.#blockStore.getLatestL2BlockNumber();
  }

  public async getContract(
    address: AztecAddress,
    maybeTimestamp?: UInt64,
  ): Promise<ContractInstanceWithAddress | undefined> {
    const [header] = await this.getBlockHeaders(await this.getBlockNumber(), 1);
    const timestamp = maybeTimestamp ?? header!.globalVariables.timestamp;
    return this.getContractInstance(address, timestamp);
  }

  /** Backups the archiver db to the target folder. Returns the path to the db file. */
  public async backupTo(path: string, compress = true): Promise<string> {
    await this.db.backupTo(path, compress);
    return join(path, 'data.mdb');
  }

  /** Closes the underlying data store. */
  public close() {
    return this.db.close();
  }

  /** Computes the finalized block number based on the proven block number. */
  getFinalizedL2BlockNumber(): Promise<BlockNumber> {
    return this.#blockStore.getFinalizedL2BlockNumber();
  }

  /** Looks up a public function name given a selector. */
  getDebugFunctionName(_address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return Promise.resolve(this.functionNames.get(selector.toString()));
  }

  /** Register a public function signature, so it can be looked up by selector. */
  async registerContractFunctionSignatures(signatures: string[]): Promise<void> {
    for (const sig of signatures) {
      if (this.functionNames.size > MAX_FUNCTION_SIGNATURES) {
        return;
      }
      try {
        const selector = await FunctionSelector.fromSignature(sig);
        this.functionNames.set(selector.toString(), sig.slice(0, sig.indexOf('(')).slice(0, MAX_FUNCTION_NAME_LEN));
      } catch {
        this.#log.warn(`Failed to parse signature: ${sig}. Ignoring`);
      }
    }
  }

  /**
   * Returns a contract class given its id, or undefined if not exists.
   * @param id - Id of the contract class.
   */
  getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.#contractClassStore.getContractClass(id);
  }

  /** Returns the list of all class ids known by the archiver. */
  getContractClassIds(): Promise<Fr[]> {
    return this.#contractClassStore.getContractClassIds();
  }

  /**
   * Returns a contract instance given its address and the given timestamp, or undefined if not exists.
   * @param address - Address of the contract.
   * @param timestamp - Timestamp to get the contract instance at. Contract updates might change the instance.
   * @returns The contract instance or undefined if not found.
   */
  getContractInstance(address: AztecAddress, timestamp: UInt64): Promise<ContractInstanceWithAddress | undefined> {
    return this.#contractInstanceStore.getContractInstance(address, timestamp);
  }

  getContractInstanceDeploymentBlockNumber(address: AztecAddress): Promise<number | undefined> {
    return this.#contractInstanceStore.getContractInstanceDeploymentBlockNumber(address);
  }

  /**
   * Add new contract classes from an L2 block to the store's list.
   * @param data - List of contract classes to be added.
   * @param bytecodeCommitments - Bytecode commitments for the contract classes.
   * @param blockNumber - Number of the L2 block the contracts were registered in.
   * @returns True if the operation is successful.
   */
  async addContractClasses(
    data: ContractClassPublic[],
    bytecodeCommitments: Fr[],
    blockNumber: BlockNumber,
  ): Promise<boolean> {
    return (
      await Promise.all(
        data.map((c, i) => this.#contractClassStore.addContractClass(c, bytecodeCommitments[i], blockNumber)),
      )
    ).every(Boolean);
  }

  async deleteContractClasses(data: ContractClassPublic[], blockNumber: BlockNumber): Promise<boolean> {
    return (await Promise.all(data.map(c => this.#contractClassStore.deleteContractClasses(c, blockNumber)))).every(
      Boolean,
    );
  }

  getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined> {
    return this.#contractClassStore.getBytecodeCommitment(contractClassId);
  }

  /** Adds private functions to a contract class. */
  addFunctions(
    contractClassId: Fr,
    privateFunctions: ExecutablePrivateFunctionWithMembershipProof[],
    utilityFunctions: UtilityFunctionWithMembershipProof[],
  ): Promise<boolean> {
    return this.#contractClassStore.addFunctions(contractClassId, privateFunctions, utilityFunctions);
  }

  /**
   * Add new contract instances from an L2 block to the store's list.
   * @param data - List of contract instances to be added.
   * @param blockNumber - Number of the L2 block the instances were deployed in.
   * @returns True if the operation is successful.
   */
  async addContractInstances(data: ContractInstanceWithAddress[], blockNumber: BlockNumber): Promise<boolean> {
    return (await Promise.all(data.map(c => this.#contractInstanceStore.addContractInstance(c, blockNumber)))).every(
      Boolean,
    );
  }

  async deleteContractInstances(data: ContractInstanceWithAddress[], _blockNumber: BlockNumber): Promise<boolean> {
    return (await Promise.all(data.map(c => this.#contractInstanceStore.deleteContractInstance(c)))).every(Boolean);
  }

  /**
   * Add new contract instance updates
   * @param data - List of contract updates to be added.
   * @param timestamp - Timestamp at which the updates were scheduled.
   * @returns True if the operation is successful.
   */
  async addContractInstanceUpdates(data: ContractInstanceUpdateWithAddress[], timestamp: UInt64): Promise<boolean> {
    return (
      await Promise.all(
        data.map((update, logIndex) =>
          this.#contractInstanceStore.addContractInstanceUpdate(update, timestamp, logIndex),
        ),
      )
    ).every(Boolean);
  }
  async deleteContractInstanceUpdates(data: ContractInstanceUpdateWithAddress[], timestamp: UInt64): Promise<boolean> {
    return (
      await Promise.all(
        data.map((update, logIndex) =>
          this.#contractInstanceStore.deleteContractInstanceUpdate(update, timestamp, logIndex),
        ),
      )
    ).every(Boolean);
  }

  /**
   * Append new proposed blocks to the store's list.
   * These are uncheckpointed blocks that have been proposed by the sequencer but not yet included in a checkpoint on L1.
   * For checkpointed blocks (already published to L1), use addCheckpoints() instead.
   * @param blocks - The proposed L2 blocks to be added to the store.
   * @returns True if the operation is successful.
   */
  addProposedBlocks(blocks: L2Block[], opts: { force?: boolean; checkpointNumber?: number } = {}): Promise<boolean> {
    return this.#blockStore.addProposedBlocks(blocks, opts);
  }

  /**
   * Returns an array of checkpoint objects
   * @param from The first checkpoint number to be retrieved
   * @param limit The maximum number of checkpoints to retrieve
   * @returns The array of requested checkpoint data objects
   */
  getRangeOfCheckpoints(from: CheckpointNumber, limit: number): Promise<CheckpointData[]> {
    return this.#blockStore.getRangeOfCheckpoints(from, limit);
  }
  /**
   * Returns the number of the latest block
   * @returns The number of the latest block
   */
  getLatestBlockNumber(): Promise<BlockNumber> {
    return this.#blockStore.getLatestBlockNumber();
  }

  /**
   * Removes all checkpoints with checkpoint number > checkpointNumber.
   * Also removes ALL blocks (both checkpointed and uncheckpointed) after the last block of the given checkpoint.
   * @param checkpointNumber - Remove all checkpoints strictly after this one.
   */
  removeCheckpointsAfter(checkpointNumber: CheckpointNumber): Promise<RemoveCheckpointsResult> {
    return this.#blockStore.removeCheckpointsAfter(checkpointNumber);
  }

  /**
   * Appends new checkpoints, and their blocks to the store's collection
   * @param checkpoints The collection of checkpoints to be added
   * @returns True if the operation is successful
   */
  addCheckpoints(checkpoints: PublishedCheckpoint[]): Promise<boolean> {
    return this.#blockStore.addCheckpoints(checkpoints);
  }

  /**
   * Returns the block for the given number, or undefined if not exists.
   * @param number - The block number to return.
   */
  getCheckpointedBlock(number: BlockNumber): Promise<CheckpointedL2Block | undefined> {
    return this.#blockStore.getCheckpointedBlock(number);
  }
  /**
   * Returns the block for the given hash, or undefined if not exists.
   * @param blockHash - The block hash to return.
   */
  getCheckpointedBlockByHash(blockHash: Fr): Promise<CheckpointedL2Block | undefined> {
    return this.#blockStore.getCheckpointedBlockByHash(blockHash);
  }
  /**
   * Returns the block for the given archive root, or undefined if not exists.
   * @param archive - The archive root to return.
   */
  getCheckpointedBlockByArchive(archive: Fr): Promise<CheckpointedL2Block | undefined> {
    return this.#blockStore.getCheckpointedBlockByArchive(archive);
  }
  /**
   * Returns the block for the given number, or undefined if not exists.
   * @param number - The block number to return.
   */
  getBlock(number: BlockNumber): Promise<L2Block | undefined> {
    return this.#blockStore.getBlock(number);
  }
  /**
   * Returns the block for the given hash, or undefined if not exists.
   * @param blockHash - The block hash to return.
   */
  getBlockByHash(blockHash: Fr): Promise<L2Block | undefined> {
    return this.#blockStore.getBlockByHash(L2BlockHash.fromField(blockHash));
  }
  /**
   * Returns the block for the given archive root, or undefined if not exists.
   * @param archive - The archive root to return.
   */
  getBlockByArchive(archive: Fr): Promise<L2Block | undefined> {
    return this.#blockStore.getBlockByArchive(archive);
  }

  /**
   * Gets up to `limit` amount of published L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 blocks.
   */
  getBlocks(from: BlockNumber, limit: number): Promise<L2Block[]> {
    return toArray(this.#blockStore.getBlocks(from, limit));
  }

  /**
   * Gets up to `limit` amount of checkpointed L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested checkpointed L2 blocks.
   */
  getCheckpointedBlocks(from: BlockNumber, limit: number): Promise<CheckpointedL2Block[]> {
    return toArray(this.#blockStore.getCheckpointedBlocks(from, limit));
  }

  /**
   * Gets up to `limit` amount of L2 block headers starting from `from`.
   * @param start - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 block headers.
   */
  getBlockHeaders(start: BlockNumber, limit: number): Promise<BlockHeader[]> {
    return toArray(this.#blockStore.getBlockHeaders(start, limit));
  }

  /**
   * Returns the block header for the given hash, or undefined if not exists.
   * @param blockHash - The block hash to return.
   */
  getBlockHeaderByHash(blockHash: Fr): Promise<BlockHeader | undefined> {
    return this.#blockStore.getBlockHeaderByHash(L2BlockHash.fromField(blockHash));
  }

  /**
   * Returns the block header for the given archive root, or undefined if not exists.
   * @param archive - The archive root to return.
   */
  getBlockHeaderByArchive(archive: Fr): Promise<BlockHeader | undefined> {
    return this.#blockStore.getBlockHeaderByArchive(archive);
  }

  /**
   * Gets a tx effect.
   * @param txHash - The hash of the tx corresponding to the tx effect.
   * @returns The requested tx effect with block info (or undefined if not found).
   */
  getTxEffect(txHash: TxHash) {
    return this.#blockStore.getTxEffect(txHash);
  }

  /**
   * Gets a receipt of a settled tx.
   * @param txHash - The hash of a tx we try to get the receipt for.
   * @returns The requested tx receipt (or undefined if not found).
   */
  getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    return this.#blockStore.getSettledTxReceipt(txHash);
  }

  /**
   * Append new logs to the store's list.
   * @param blocks - The blocks for which to add the logs.
   * @returns True if the operation is successful.
   */
  addLogs(blocks: L2Block[]): Promise<boolean> {
    return this.#logStore.addLogs(blocks);
  }

  deleteLogs(blocks: L2Block[]): Promise<boolean> {
    return this.#logStore.deleteLogs(blocks);
  }

  /**
   * Get the total number of L1 to L2 messages
   * @returns The number of L1 to L2 messages in the store
   */
  getTotalL1ToL2MessageCount(): Promise<bigint> {
    return this.#messageStore.getTotalL1ToL2MessageCount();
  }

  /** Returns the last L1 to L2 message stored. */
  getLastL1ToL2Message(): Promise<InboxMessage | undefined> {
    return this.#messageStore.getLastMessage();
  }

  /**
   * Append L1 to L2 messages to the store.
   * @param messages - The L1 to L2 messages to be added to the store.
   * @returns True if the operation is successful.
   */
  addL1ToL2Messages(messages: InboxMessage[]): Promise<void> {
    return this.#messageStore.addL1ToL2Messages(messages);
  }

  /**
   * Gets the L1 to L2 message index in the L1 to L2 message tree.
   * @param l1ToL2Message - The L1 to L2 message.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    return this.#messageStore.getL1ToL2MessageIndex(l1ToL2Message);
  }

  /**
   * Gets L1 to L2 message (to be) included in a given checkpoint.
   * @param checkpointNumber - Checkpoint number to get messages for.
   * @returns The L1 to L2 messages/leaves of the messages subtree (throws if not found).
   */
  getL1ToL2Messages(checkpointNumber: CheckpointNumber): Promise<Fr[]> {
    return this.#messageStore.getL1ToL2Messages(checkpointNumber);
  }

  /**
   * Gets private logs that match any of the `tags`. For each tag, an array of matching logs is returned. An empty
   * array implies no logs match that tag.
   * @param tags - The tags to search for.
   * @param page - The page number (0-indexed) for pagination. Returns at most 10 logs per tag per page.
   */
  getPrivateLogsByTags(tags: SiloedTag[], page?: number): Promise<TxScopedL2Log[][]> {
    try {
      return this.#logStore.getPrivateLogsByTags(tags, page);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Gets public logs that match any of the `tags` from the specified contract. For each tag, an array of matching
   * logs is returned. An empty array implies no logs match that tag.
   * @param contractAddress - The contract address to search logs for.
   * @param tags - The tags to search for.
   * @param page - The page number (0-indexed) for pagination. Returns at most 10 logs per tag per page.
   */
  getPublicLogsByTagsFromContract(
    contractAddress: AztecAddress,
    tags: Tag[],
    page?: number,
  ): Promise<TxScopedL2Log[][]> {
    try {
      return this.#logStore.getPublicLogsByTagsFromContract(contractAddress, tags, page);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Gets public logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    try {
      return this.#logStore.getPublicLogs(filter);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    try {
      return this.#logStore.getContractClassLogs(filter);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Gets the number of the latest proven checkpoint processed.
   * @returns The number of the latest proven checkpoint processed.
   */
  getProvenCheckpointNumber(): Promise<CheckpointNumber> {
    return this.#blockStore.getProvenCheckpointNumber();
  }

  /**
   * Stores the number of the latest proven checkpoint processed.
   * @param checkpointNumber - The number of the latest proven checkpoint processed.
   */
  async setProvenCheckpointNumber(checkpointNumber: CheckpointNumber) {
    await this.#blockStore.setProvenCheckpointNumber(checkpointNumber);
  }

  async setBlockSynchedL1BlockNumber(l1BlockNumber: bigint) {
    await this.#blockStore.setSynchedL1BlockNumber(l1BlockNumber);
  }

  /**
   * Stores the l1 block that messages have been synched until
   */
  async setMessageSynchedL1Block(l1Block: L1BlockId) {
    await this.#messageStore.setSynchedL1Block(l1Block);
  }

  /**
   * Returns the number of the most recent proven block
   * @returns The number of the most recent proven block
   */
  getProvenBlockNumber(): Promise<BlockNumber> {
    return this.#blockStore.getProvenBlockNumber();
  }

  /**
   * Gets the synch point of the archiver
   */
  async getSynchPoint(): Promise<ArchiverL1SynchPoint> {
    const [blocksSynchedTo, messagesSynchedTo] = await Promise.all([
      this.#blockStore.getSynchedL1BlockNumber(),
      this.#messageStore.getSynchedL1Block(),
    ]);
    return {
      blocksSynchedTo,
      messagesSynchedTo,
    };
  }

  /** Estimates the size of the store in bytes. */
  public estimateSize(): Promise<StoreSize> {
    return this.db.estimateSize();
  }

  /** Deletes all L1 to L2 messages up until (excluding) the target checkpoint number. */
  public rollbackL1ToL2MessagesToCheckpoint(targetCheckpointNumber: CheckpointNumber): Promise<void> {
    return this.#messageStore.rollbackL1ToL2MessagesToCheckpoint(targetCheckpointNumber);
  }

  /** Returns an async iterator to all L1 to L2 messages on the range. */
  public iterateL1ToL2Messages(range: CustomRange<bigint> = {}): AsyncIterableIterator<InboxMessage> {
    return this.#messageStore.iterateL1ToL2Messages(range);
  }

  /** Removes all L1 to L2 messages starting from the given index (inclusive). */
  public removeL1ToL2Messages(startIndex: bigint): Promise<void> {
    return this.#messageStore.removeL1ToL2Messages(startIndex);
  }

  /** Returns the last synced validation status of the pending chain. */
  public getPendingChainValidationStatus(): Promise<ValidateCheckpointResult | undefined> {
    return this.#blockStore.getPendingChainValidationStatus();
  }

  /** Sets the last synced validation status of the pending chain. */
  public setPendingChainValidationStatus(status: ValidateCheckpointResult | undefined): Promise<void> {
    return this.#blockStore.setPendingChainValidationStatus(status);
  }

  /**
   * Gets the number of the latest L2 block processed.
   * @returns The number of the latest L2 block processed.
   */
  public getCheckpointedL2BlockNumber(): Promise<BlockNumber> {
    return this.#blockStore.getCheckpointedL2BlockNumber();
  }
  /**
   * Gets the number of the latest published checkpoint processed.
   * @returns The number of the latest published checkpoint processed
   */
  public getSynchedCheckpointNumber(): Promise<CheckpointNumber> {
    return this.#blockStore.getLatestCheckpointNumber();
  }
  /**
   * Stores the l1 block number that checkpoints have been synched until
   * @param l1BlockNumber  - The l1 block number
   */
  async setCheckpointSynchedL1BlockNumber(l1BlockNumber: bigint): Promise<void> {
    await this.#blockStore.setSynchedL1BlockNumber(l1BlockNumber);
  }

  /**
   * Retrieves all blocks for the requested checkpoint
   * @param checkpointNumber Retrieves all blocks for the given checkpoint
   * @returns The collection of blocks for the requested checkpoint if available (undefined otherwise)
   */
  getBlocksForCheckpoint(checkpointNumber: CheckpointNumber): Promise<L2Block[] | undefined> {
    return this.#blockStore.getBlocksForCheckpoint(checkpointNumber);
  }

  /**
   * Returns checkpoint data for the requested checkpoint number
   * @param checkpointNumber - The checkpoint requested
   * @returns The checkpoint data or undefined if not found
   */
  getCheckpointData(checkpointNumber: CheckpointNumber): Promise<CheckpointData | undefined> {
    return this.#blockStore.getCheckpointData(checkpointNumber);
  }

  /**
   * Gets all blocks that have the given slot number.
   * @param slotNumber - The slot number to search for.
   * @returns All blocks with the given slot number.
   */
  getBlocksForSlot(slotNumber: SlotNumber): Promise<L2Block[]> {
    return this.#blockStore.getBlocksForSlot(slotNumber);
  }

  /**
   * Removes all blocks with block number > blockNumber.
   * Does not remove any associated checkpoints.
   * @param blockNumber - The block number to remove after.
   * @returns The removed blocks (for event emission).
   */
  removeBlocksAfter(blockNumber: BlockNumber): Promise<L2Block[]> {
    return this.#blockStore.removeBlocksAfter(blockNumber);
  }
}
