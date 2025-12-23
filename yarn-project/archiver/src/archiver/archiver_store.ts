import type { L1BlockId } from '@aztec/ethereum/l1-types';
import type { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { CustomRange } from '@aztec/kv-store';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CheckpointedL2Block, L2BlockNew, ValidateBlockResult } from '@aztec/stdlib/block';
import type { PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type {
  ContractClassPublic,
  ContractInstanceUpdateWithAddress,
  ContractInstanceWithAddress,
  ExecutablePrivateFunctionWithMembershipProof,
  UtilityFunctionWithMembershipProof,
} from '@aztec/stdlib/contract';
import type { GetContractClassLogsResponse, GetPublicLogsResponse } from '@aztec/stdlib/interfaces/client';
import type { LogFilter, SiloedTag, Tag, TxScopedL2Log } from '@aztec/stdlib/logs';
import { BlockHeader, type IndexedTxEffect, type TxHash, type TxReceipt } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import type { CheckpointData } from './kv_archiver_store/block_store.js';
import type { InboxMessage } from './structs/inbox_message.js';

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
 * Interface describing a data store to be used by the archiver to store all its relevant data
 * (blocks, encrypted logs, aztec contract data extended contract data).
 */
export interface ArchiverDataStore {
  /** Opens a new transaction to the underlying store and runs all operations within it. */
  transactionAsync<T>(callback: () => Promise<T>): Promise<T>;

  /**
   * Append new blocks to the store's list.
   * @param blocks - The L2 blocks to be added to the store and the last processed L1 block.
   * @param opts - Options for the operation.
   * @param opts.force - If true, the blocks will be added even if they have gaps.
   * @returns True if the operation is successful.
   */
  addBlocks(blocks: L2BlockNew[], opts?: { force?: boolean }): Promise<boolean>;

  /**
   * Appends new checkpoints, and their blocks to the store's collection
   * @param checkpoints The collectionn of checkpoints to be added
   * @returns True if the operation is successful
   */
  addCheckpoints(checkpoints: PublishedCheckpoint[]): Promise<boolean>;

  /**
   * Retrieves all blocks for the requested chackpoint
   * @param checkpointNumber Retreieves all blocks for the given checkpoint
   * @returns The collection of blocks for the requested checkpoint if available (undefined otherwise)
   */
  getBlocksForCheckpoint(checkpointNumber: CheckpointNumber): Promise<L2BlockNew[] | undefined>;

  /**
   * Returns an array of checkpoint objects
   * @param from The first checkpoint number to be retrieved
   * @param limit The maximum number of chackpoints to retrieve
   * @returns The array of requested checkpoint data objects
   */
  getRangeOfCheckpoints(from: CheckpointNumber, limit: number): Promise<CheckpointData[]>;

  /**
   * Unwinds checkpoints from the database
   * @param from -  The tip of the chain, passed for verification purposes,
   *                ensuring that we don't end up deleting something we did not intend
   * @param checkpointsToUnwind - The number of checkpoints we are to unwind
   * @returns True if the operation is successful
   */
  unwindCheckpoints(from: CheckpointNumber, checkpointsToUnwind: number): Promise<boolean>;

  /**
   * Returns the block for the given number, or undefined if not exists.
   * @param number - The block number to return.
   */
  getCheckpointedBlock(number: number): Promise<CheckpointedL2Block | undefined>;

  /**
   * Returns the block for the given hash, or undefined if not exists.
   * @param blockHash - The block hash to return.
   */
  getCheckpointedBlockByHash(blockHash: Fr): Promise<CheckpointedL2Block | undefined>;

  /**
   * Returns the block for the given archive root, or undefined if not exists.
   * @param archive - The archive root to return.
   */
  getCheckpointedBlockByArchive(archive: Fr): Promise<CheckpointedL2Block | undefined>;

  /**
   * Returns checkpoint data for the requested checkpoint number
   * @param checkpointNumber - The checkpoint requested
   * @returns The checkpoint data or undefined if not found
   */
  getCheckpointData(checkpointNumber: CheckpointNumber): Promise<CheckpointData | undefined>;

  /**
   * Returns the number of the latest block
   * @returns The number of the latest block
   */
  getLatestBlockNumber(): Promise<BlockNumber>;

  /**
   * Returns the block for the given number, or undefined if not exists.
   * @param number - The block number to return.
   */
  getBlock(number: number): Promise<L2BlockNew | undefined>;

  /**
   * Returns the block for the given hash, or undefined if not exists.
   * @param blockHash - The block hash to return.
   */
  getBlockByHash(blockHash: Fr): Promise<L2BlockNew | undefined>;

  /**
   * Returns the block for the given archive root, or undefined if not exists.
   * @param archive - The archive root to return.
   */
  getBlockByArchive(archive: Fr): Promise<L2BlockNew | undefined>;

  /**
   * Gets up to `limit` amount of published L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 blocks.
   */
  getBlocks(from: number, limit: number): Promise<L2BlockNew[]>;

  /**
   * Gets up to `limit` amount of L2 block headers starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 block headers.
   */
  getBlockHeaders(from: BlockNumber, limit: number): Promise<BlockHeader[]>;

  /**
   * Returns the block header for the given hash, or undefined if not exists.
   * @param blockHash - The block hash to return.
   */
  getBlockHeaderByHash(blockHash: Fr): Promise<BlockHeader | undefined>;

  /**
   * Returns the block header for the given archive root, or undefined if not exists.
   * @param archive - The archive root to return.
   */
  getBlockHeaderByArchive(archive: Fr): Promise<BlockHeader | undefined>;

  /**
   * Gets a tx effect.
   * @param txHash - The hash of the tx corresponding to the tx effect.
   * @returns The requested tx effect with block info (or undefined if not found).
   */
  getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined>;

  /**
   * Gets a receipt of a settled tx.
   * @param txHash - The hash of a tx we try to get the receipt for.
   * @returns The requested tx receipt (or undefined if not found).
   */
  getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined>;

  /**
   * Append new logs to the store's list.
   * @param blocks - The blocks for which to add the logs.
   * @returns True if the operation is successful.
   */
  addLogs(blocks: L2BlockNew[]): Promise<boolean>;
  deleteLogs(blocks: L2BlockNew[]): Promise<boolean>;

  /**
   * Append L1 to L2 messages to the store.
   * @param messages - The L1 to L2 messages to be added to the store.
   * @returns True if the operation is successful.
   */
  addL1ToL2Messages(messages: InboxMessage[]): Promise<void>;

  /**
   * Gets L1 to L2 message (to be) included in a given checkpoint.
   * @param checkpointNumber - Checkpoint number to get messages for.
   * @returns The L1 to L2 messages/leaves of the messages subtree (throws if not found).
   */
  getL1ToL2Messages(checkpointNumber: CheckpointNumber): Promise<Fr[]>;

  /**
   * Gets the L1 to L2 message index in the L1 to L2 message tree.
   * @param l1ToL2Message - The L1 to L2 message.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined>;

  /**
   * Get the total number of L1 to L2 messages
   * @returns The number of L1 to L2 messages in the store
   */
  getTotalL1ToL2MessageCount(): Promise<bigint>;

  /**
   * Gets all private logs that match any of the received tags (i.e. logs with their first field equal to a SiloedTag).
   * @param tags - The SiloedTags to filter the logs by.
   * @param logsPerTag - The number of logs to return per tag. Defaults to everything
   * @returns For each received tag, an array of matching private logs is returned. An empty array implies no logs match
   * that tag.
   */
  getPrivateLogsByTags(tags: SiloedTag[], logsPerTag?: number): Promise<TxScopedL2Log[][]>;

  /**
   * Gets all public logs that match any of the received tags from the specified contract (i.e. logs with their first field equal to a Tag).
   * @param contractAddress - The contract that emitted the public logs.
   * @param tags - The Tags to filter the logs by.
   * @param logsPerTag - The number of logs to return per tag. Defaults to everything
   * @returns For each received tag, an array of matching public logs is returned. An empty array implies no logs match
   * that tag.
   */
  getPublicLogsByTagsFromContract(
    contractAddress: AztecAddress,
    tags: Tag[],
    logsPerTag?: number,
  ): Promise<TxScopedL2Log[][]>;

  /**
   * Gets public logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse>;

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse>;

  /**
   * Gets the number of the latest L2 block processed.
   * @returns The number of the latest L2 block processed.
   */
  getCheckpointedL2BlockNumber(): Promise<BlockNumber>;

  /**
   * Gets the number of the latest published checkpoint processed.
   * @returns The number of the latest published checkpoint processed
   */
  getSynchedCheckpointNumber(): Promise<CheckpointNumber>;

  /**
   * Gets the number of the latest proven checkpoint processed.
   * @returns The number of the latest proven checkpoint processed.
   */
  getProvenCheckpointNumber(): Promise<CheckpointNumber>;

  /**
   * Returns the number of the most recent proven block
   * @returns The number of the most recent proven block
   */
  getProvenBlockNumber(): Promise<BlockNumber>;

  /**
   * Stores the number of the latest proven checkpoint processed.
   * @param checkpointNumber - The number of the latest proven checkpoint processed.
   */
  setProvenCheckpointNumber(checkpointNumber: CheckpointNumber): Promise<void>;

  /**
   * Stores the l1 block number that checkpoints have been synched until
   * @param l1BlockNumber  - The l1 block number
   */
  setCheckpointSynchedL1BlockNumber(l1BlockNumber: bigint): Promise<void>;

  /**
   * Stores the l1 block that messages have been synched until
   */
  setMessageSynchedL1Block(l1Block: L1BlockId): Promise<void>;

  /**
   * Gets the synch point of the archiver
   */
  getSynchPoint(): Promise<ArchiverL1SynchPoint>;

  /**
   * Add new contract classes from an L2 block to the store's list.
   * @param data - List of contract classes to be added.
   * @param blockNumber - Number of the L2 block the contracts were registered in.
   * @returns True if the operation is successful.
   */
  addContractClasses(
    data: ContractClassPublic[],
    bytecodeCommitments: Fr[],
    blockNumber: BlockNumber,
  ): Promise<boolean>;

  deleteContractClasses(data: ContractClassPublic[], blockNumber: BlockNumber): Promise<boolean>;

  getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined>;

  /**
   * Returns a contract class given its id, or undefined if not exists.
   * @param id - Id of the contract class.
   */
  getContractClass(id: Fr): Promise<ContractClassPublic | undefined>;

  /**
   * Add new contract instances from an L2 block to the store's list.
   * @param data - List of contract instances to be added.
   * @param blockNumber - Number of the L2 block the instances were deployed in.
   * @returns True if the operation is successful.
   */
  addContractInstances(data: ContractInstanceWithAddress[], blockNumber: BlockNumber): Promise<boolean>;
  deleteContractInstances(data: ContractInstanceWithAddress[], blockNumber: BlockNumber): Promise<boolean>;

  /**
   * Add new contract instance updates
   * @param data - List of contract updates to be added.
   * @param timestamp - Timestamp at which the updates were scheduled.
   * @returns True if the operation is successful.
   */
  addContractInstanceUpdates(data: ContractInstanceUpdateWithAddress[], timestamp: UInt64): Promise<boolean>;
  deleteContractInstanceUpdates(data: ContractInstanceUpdateWithAddress[], timestamp: UInt64): Promise<boolean>;
  /**
   * Adds private functions to a contract class.
   */
  addFunctions(
    contractClassId: Fr,
    privateFunctions: ExecutablePrivateFunctionWithMembershipProof[],
    utilityFunctions: UtilityFunctionWithMembershipProof[],
  ): Promise<boolean>;

  /**
   * Returns a contract instance given its address and the given timestamp, or undefined if not exists.
   * @param address - Address of the contract.
   * @param timestamp - Timestamp to get the contract instance at. Contract updates might change the instance.
   * @returns The contract instance or undefined if not found.
   */
  getContractInstance(address: AztecAddress, timestamp: UInt64): Promise<ContractInstanceWithAddress | undefined>;

  /** Returns the list of all class ids known by the archiver. */
  getContractClassIds(): Promise<Fr[]>;

  /** Register a public function signature, so it can be looked up by selector. */
  registerContractFunctionSignatures(signatures: string[]): Promise<void>;

  /** Looks up a public function name given a selector. */
  getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined>;

  /** Estimates the size of the store in bytes. */
  estimateSize(): Promise<{ mappingSize: number; physicalFileSize: number; actualSize: number; numItems: number }>;

  /** Backups the archiver db to the target folder. Returns the path to the db file. */
  backupTo(path: string): Promise<string>;

  /** Closes the underlying data store. */
  close(): Promise<void>;

  /** Deletes all L1 to L2 messages up until (excluding) the target checkpoint number. */
  rollbackL1ToL2MessagesToCheckpoint(targetCheckpointNumber: CheckpointNumber): Promise<void>;

  /** Returns an async iterator to all L1 to L2 messages on the range. */
  iterateL1ToL2Messages(range?: CustomRange<bigint>): AsyncIterableIterator<InboxMessage>;

  /** Removes all L1 to L2 messages starting from the given index (inclusive). */
  removeL1ToL2Messages(startIndex: bigint): Promise<void>;

  /** Returns the last L1 to L2 message stored. */
  getLastL1ToL2Message(): Promise<InboxMessage | undefined>;

  /** Returns the last synced validation status of the pending chain. */
  getPendingChainValidationStatus(): Promise<ValidateBlockResult | undefined>;

  /** Sets the last synced validation status of the pending chain. */
  setPendingChainValidationStatus(status: ValidateBlockResult | undefined): Promise<void>;
}
