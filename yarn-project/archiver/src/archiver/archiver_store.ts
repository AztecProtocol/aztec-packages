import {
  type GetUnencryptedLogsResponse,
  type InBlock,
  type InboxLeaf,
  type L2Block,
  type LogFilter,
  type TxEffect,
  type TxHash,
  type TxReceipt,
  type TxScopedL2Log,
} from '@aztec/circuit-types';
import {
  type BlockHeader,
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  type ExecutablePrivateFunctionWithMembershipProof,
  type Fr,
  type PrivateLog,
  type UnconstrainedFunctionWithMembershipProof,
} from '@aztec/circuits.js';
import { type FunctionSelector } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';

import { type DataRetrieval } from './structs/data_retrieval.js';
import { type L1Published } from './structs/published.js';

/**
 * Represents the latest L1 block processed by the archiver for various objects in L2.
 */
export type ArchiverL1SynchPoint = {
  /** Number of the last L1 block that added a new L2 block metadata.  */
  blocksSynchedTo?: bigint;
  /** Number of the last L1 block that added L1 -> L2 messages from the Inbox. */
  messagesSynchedTo?: bigint;
  /** Number of the last L1 block that added a new proven block. */
  provenLogsSynchedTo?: bigint;
};

/**
 * Interface describing a data store to be used by the archiver to store all its relevant data
 * (blocks, encrypted logs, aztec contract data extended contract data).
 */
export interface ArchiverDataStore {
  /**
   * Append new blocks to the store's list.
   * @param blocks - The L2 blocks to be added to the store and the last processed L1 block.
   * @returns True if the operation is successful.
   */
  addBlocks(blocks: L1Published<L2Block>[]): Promise<boolean>;

  /**
   * Unwinds blocks from the database
   * @param from -  The tip of the chain, passed for verification purposes,
   *                ensuring that we don't end up deleting something we did not intend
   * @param blocksToUnwind - The number of blocks we are to unwind
   * @returns True if the operation is successful
   */
  unwindBlocks(from: number, blocksToUnwind: number): Promise<boolean>;

  /**
   * Gets up to `limit` amount of L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 blocks.
   */
  getBlocks(from: number, limit: number): Promise<L1Published<L2Block>[]>;

  /**
   * Gets up to `limit` amount of L2 block headers starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 block headers.
   */
  getBlockHeaders(from: number, limit: number): Promise<BlockHeader[]>;

  /**
   * Gets a tx effect.
   * @param txHash - The txHash of the tx corresponding to the tx effect.
   * @returns The requested tx effect (or undefined if not found).
   */
  getTxEffect(txHash: TxHash): Promise<InBlock<TxEffect> | undefined>;

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
   * Append new nullifiers to the store's list.
   * @param blocks - The blocks for which to add the nullifiers.
   * @returns True if the operation is successful.
   */
  addNullifiers(blocks: L2Block[]): Promise<boolean>;
  deleteNullifiers(blocks: L2Block[]): Promise<boolean>;

  /**
   * Returns the provided nullifier indexes scoped to the block
   * they were first included in, or undefined if they're not present in the tree
   * @param blockNumber Max block number to search for the nullifiers
   * @param nullifiers Nullifiers to get
   * @returns The block scoped indexes of the provided nullifiers, or undefined if the nullifier doesn't exist in the tree
   */
  findNullifiersIndexesWithBlock(blockNumber: number, nullifiers: Fr[]): Promise<(InBlock<bigint> | undefined)[]>;

  /**
   * Append L1 to L2 messages to the store.
   * @param messages - The L1 to L2 messages to be added to the store and the last processed L1 block.
   * @returns True if the operation is successful.
   */
  addL1ToL2Messages(messages: DataRetrieval<InboxLeaf>): Promise<boolean>;

  /**
   * Gets L1 to L2 message (to be) included in a given block.
   * @param blockNumber - L2 block number to get messages for.
   * @returns The L1 to L2 messages/leaves of the messages subtree (throws if not found).
   */
  getL1ToL2Messages(blockNumber: bigint): Promise<Fr[]>;

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
   * @returns For each received tag, an array of matching logs is returned. An empty array implies no logs match
   * that tag.
   */
  getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]>;

  /**
   * Gets unencrypted logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getUnencryptedLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse>;

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse>;

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
   * Gets the number of the latest proven L2 epoch.
   * @returns The number of the latest proven L2 epoch.
   */
  getProvenL2EpochNumber(): Promise<number | undefined>;

  /**
   * Stores the number of the latest proven L2 block processed.
   * @param l2BlockNumber - The number of the latest proven L2 block processed.
   */
  setProvenL2BlockNumber(l2BlockNumber: number): Promise<void>;

  /**
   * Stores the number of the latest proven L2 epoch.
   * @param l2EpochNumber - The number of the latest proven L2 epoch.
   */
  setProvenL2EpochNumber(l2EpochNumber: number): Promise<void>;

  /**
   * Stores the l1 block number that blocks have been synched until
   * @param l1BlockNumber  - The l1 block number
   */
  setBlockSynchedL1BlockNumber(l1BlockNumber: bigint): Promise<void>;

  /**
   * Stores the l1 block number that messages have been synched until
   * @param l1BlockNumber  - The l1 block number
   */
  setMessageSynchedL1BlockNumber(l1BlockNumber: bigint): Promise<void>;

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
   * Adds private functions to a contract class.
   */
  addFunctions(
    contractClassId: Fr,
    privateFunctions: ExecutablePrivateFunctionWithMembershipProof[],
    unconstrainedFunctions: UnconstrainedFunctionWithMembershipProof[],
  ): Promise<boolean>;

  /**
   * Returns a contract instance given its address, or undefined if not exists.
   * @param address - Address of the contract.
   */
  getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined>;

  /** Returns the list of all class ids known by the archiver. */
  getContractClassIds(): Promise<Fr[]>;

  // TODO:  These function names are in memory only as they are for development/debugging. They require the full contract
  //        artifact supplied to the node out of band. This should be reviewed and potentially removed as part of
  //        the node api cleanup process.
  registerContractFunctionSignatures(address: AztecAddress, signatures: string[]): Promise<void>;
  getContractFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined>;

  /**
   * Estimates the size of the store in bytes.
   */
  estimateSize(): { mappingSize: number; actualSize: number; numItems: number };
}
