import type { L1BlockId } from '@aztec/ethereum';
import type { Fr } from '@aztec/foundation/fields';
import type { CustomRange } from '@aztec/kv-store';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2Block } from '@aztec/stdlib/block';
import type {
  ContractClassPublic,
  ContractInstanceUpdateWithAddress,
  ContractInstanceWithAddress,
  ExecutablePrivateFunctionWithMembershipProof,
  UtilityFunctionWithMembershipProof,
} from '@aztec/stdlib/contract';
import type { GetContractClassLogsResponse, GetPublicLogsResponse } from '@aztec/stdlib/interfaces/client';
import type { LogFilter, PrivateLog, TxScopedL2Log } from '@aztec/stdlib/logs';
import { BlockHeader, type IndexedTxEffect, type TxHash, type TxReceipt } from '@aztec/stdlib/tx';

import type { InboxMessage } from './structs/inbox_message.js';
import type { PublishedL2Block } from './structs/published.js';

/**
 * Represents the latest L1 block processed by the archiver for various objects in L2.
 */
export type ArchiverL1SynchPoint = {
  /** Number of the last L1 block that added a new L2 block metadata.  */
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
  addBlocks(blocks: PublishedL2Block[], opts?: { force?: boolean }): Promise<boolean>;

  /**
   * Unwinds blocks from the database
   * @param from -  The tip of the chain, passed for verification purposes,
   *                ensuring that we don't end up deleting something we did not intend
   * @param blocksToUnwind - The number of blocks we are to unwind
   * @returns True if the operation is successful
   */
  unwindBlocks(from: number, blocksToUnwind: number): Promise<boolean>;

  /**
   * Returns the block for the given number, or undefined if not exists.
   * @param number - The block number to return.
   */
  getPublishedBlock(number: number): Promise<PublishedL2Block | undefined>;

  /**
   * Gets up to `limit` amount of published L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 blocks.
   */
  getPublishedBlocks(from: number, limit: number): Promise<PublishedL2Block[]>;

  /**
   * Gets up to `limit` amount of L2 block headers starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 block headers.
   */
  getBlockHeaders(from: number, limit: number): Promise<BlockHeader[]>;

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
  addLogs(blocks: L2Block[]): Promise<boolean>;
  deleteLogs(blocks: L2Block[]): Promise<boolean>;

  /**
   * Append L1 to L2 messages to the store.
   * @param messages - The L1 to L2 messages to be added to the store.
   * @returns True if the operation is successful.
   */
  addL1ToL2Messages(messages: InboxMessage[]): Promise<void>;

  /**
   * Gets L1 to L2 message (to be) included in a given block.
   * @param blockNumber - L2 block number to get messages for.
   * @returns The L1 to L2 messages/leaves of the messages subtree (throws if not found).
   */
  getL1ToL2Messages(blockNumber: number): Promise<Fr[]>;

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
   * Retrieves all private logs from up to `limit` blocks, starting from the block number `from`.
   * @param from - The block number from which to begin retrieving logs.
   * @param limit - The maximum number of blocks to retrieve logs from.
   * @returns An array of private logs from the specified range of blocks.
   */
  getPrivateLogs(from: number, limit: number): Promise<PrivateLog[]>;

  /**
   * Gets all logs that match any of the received tags (i.e. logs with their first field equal to a tag).
   * @param tags - The tags to filter the logs by.
   * @param logsPerTag - The number of logs to return per tag. Defaults to everything
   * @returns For each received tag, an array of matching logs is returned. An empty array implies no logs match
   * that tag.
   */
  getLogsByTags(tags: Fr[], logsPerTag?: number): Promise<TxScopedL2Log[][]>;

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
  getSynchedL2BlockNumber(): Promise<number>;

  /**
   * Gets the number of the latest proven L2 block processed.
   * @returns The number of the latest proven L2 block processed.
   */
  getProvenL2BlockNumber(): Promise<number>;

  /**
   * Stores the number of the latest proven L2 block processed.
   * @param l2BlockNumber - The number of the latest proven L2 block processed.
   */
  setProvenL2BlockNumber(l2BlockNumber: number): Promise<void>;

  /**
   * Stores the l1 block number that blocks have been synched until
   * @param l1BlockNumber  - The l1 block number
   */
  setBlockSynchedL1BlockNumber(l1BlockNumber: bigint): Promise<void>;

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
  addContractClasses(data: ContractClassPublic[], bytecodeCommitments: Fr[], blockNumber: number): Promise<boolean>;

  deleteContractClasses(data: ContractClassPublic[], blockNumber: number): Promise<boolean>;

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
  addContractInstances(data: ContractInstanceWithAddress[], blockNumber: number): Promise<boolean>;
  deleteContractInstances(data: ContractInstanceWithAddress[], blockNumber: number): Promise<boolean>;

  /**
   * Add new contract instance updates
   * @param data - List of contract updates to be added.
   * @param blockNumber - Number of the L2 block the updates were scheduled in.
   * @returns True if the operation is successful.
   */
  addContractInstanceUpdates(data: ContractInstanceUpdateWithAddress[], blockNumber: number): Promise<boolean>;
  deleteContractInstanceUpdates(data: ContractInstanceUpdateWithAddress[], blockNumber: number): Promise<boolean>;
  /**
   * Adds private functions to a contract class.
   */
  addFunctions(
    contractClassId: Fr,
    privateFunctions: ExecutablePrivateFunctionWithMembershipProof[],
    utilityFunctions: UtilityFunctionWithMembershipProof[],
  ): Promise<boolean>;

  /**
   * Returns a contract instance given its address and the given block number, or undefined if not exists.
   * @param address - Address of the contract.
   * @param blockNumber - Block number to get the contract instance at. Contract updates might change the instance at a given block.
   */
  getContractInstance(address: AztecAddress, blockNumber: number): Promise<ContractInstanceWithAddress | undefined>;

  /** Returns the list of all class ids known by the archiver. */
  getContractClassIds(): Promise<Fr[]>;

  // TODO:  These function names are in memory only as they are for development/debugging. They require the full contract
  //        artifact supplied to the node out of band. This should be reviewed and potentially removed as part of
  //        the node api cleanup process.
  registerContractFunctionSignatures(address: AztecAddress, signatures: string[]): Promise<void>;
  getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined>;

  /** Estimates the size of the store in bytes. */
  estimateSize(): Promise<{ mappingSize: number; physicalFileSize: number; actualSize: number; numItems: number }>;

  /** Backups the archiver db to the target folder. Returns the path to the db file. */
  backupTo(path: string): Promise<string>;

  /** Closes the underlying data store. */
  close(): Promise<void>;

  /** Deletes all L1 to L2 messages up until (excluding) the target L2 block number. */
  rollbackL1ToL2MessagesToL2Block(targetBlockNumber: number): Promise<void>;

  /** Returns an async iterator to all L1 to L2 messages on the range. */
  iterateL1ToL2Messages(range?: CustomRange<bigint>): AsyncIterableIterator<InboxMessage>;

  /** Removes all L1 to L2 messages starting from the given index (inclusive). */
  removeL1ToL2Messages(startIndex: bigint): Promise<void>;

  /** Returns the last L1 to L2 message stored. */
  getLastL1ToL2Message(): Promise<InboxMessage | undefined>;
}
