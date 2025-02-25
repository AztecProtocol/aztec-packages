import { FunctionSelector } from '@aztec/circuits.js/abi';
import { type AztecAddress } from '@aztec/circuits.js/aztec-address';
import type { InBlock, L2Block } from '@aztec/circuits.js/block';
import {
  type ContractClassPublic,
  type ContractInstanceUpdateWithAddress,
  type ContractInstanceWithAddress,
  type ExecutablePrivateFunctionWithMembershipProof,
  type UnconstrainedFunctionWithMembershipProof,
} from '@aztec/circuits.js/contract';
import type { GetContractClassLogsResponse, GetPublicLogsResponse } from '@aztec/circuits.js/interfaces/client';
import { type LogFilter, type TxScopedL2Log } from '@aztec/circuits.js/logs';
import type { PrivateLog } from '@aztec/circuits.js/logs';
import type { InboxLeaf } from '@aztec/circuits.js/messaging';
import type { BlockHeader, TxHash, TxReceipt } from '@aztec/circuits.js/tx';
import type { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import { type AztecAsyncKVStore, type StoreSize } from '@aztec/kv-store';

import { type ArchiverDataStore, type ArchiverL1SynchPoint } from '../archiver_store.js';
import { type DataRetrieval } from '../structs/data_retrieval.js';
import { type L1Published } from '../structs/published.js';
import { BlockStore } from './block_store.js';
import { ContractClassStore } from './contract_class_store.js';
import { ContractInstanceStore } from './contract_instance_store.js';
import { LogStore } from './log_store.js';
import { MessageStore } from './message_store.js';
import { NullifierStore } from './nullifier_store.js';

/**
 * LMDB implementation of the ArchiverDataStore interface.
 */
export class KVArchiverDataStore implements ArchiverDataStore {
  #blockStore: BlockStore;
  #logStore: LogStore;
  #nullifierStore: NullifierStore;
  #messageStore: MessageStore;
  #contractClassStore: ContractClassStore;
  #contractInstanceStore: ContractInstanceStore;
  private functionNames = new Map<string, string>();

  #log = createLogger('archiver:data-store');

  constructor(private db: AztecAsyncKVStore, logsMaxPageSize: number = 1000) {
    this.#blockStore = new BlockStore(db);
    this.#logStore = new LogStore(db, this.#blockStore, logsMaxPageSize);
    this.#messageStore = new MessageStore(db);
    this.#contractClassStore = new ContractClassStore(db);
    this.#contractInstanceStore = new ContractInstanceStore(db);
    this.#nullifierStore = new NullifierStore(db);
  }

  // TODO:  These function names are in memory only as they are for development/debugging. They require the full contract
  //        artifact supplied to the node out of band. This should be reviewed and potentially removed as part of
  //        the node api cleanup process.
  getContractFunctionName(_address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return Promise.resolve(this.functionNames.get(selector.toString()));
  }

  async registerContractFunctionSignatures(_address: AztecAddress, signatures: string[]): Promise<void> {
    for (const sig of signatures) {
      try {
        const selector = await FunctionSelector.fromSignature(sig);
        this.functionNames.set(selector.toString(), sig.slice(0, sig.indexOf('(')));
      } catch {
        this.#log.warn(`Failed to parse signature: ${sig}. Ignoring`);
      }
    }
  }

  getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.#contractClassStore.getContractClass(id);
  }

  getContractClassIds(): Promise<Fr[]> {
    return this.#contractClassStore.getContractClassIds();
  }

  async getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    const contract = this.#contractInstanceStore.getContractInstance(address, await this.getSynchedL2BlockNumber());
    return contract;
  }

  async addContractClasses(
    data: ContractClassPublic[],
    bytecodeCommitments: Fr[],
    blockNumber: number,
  ): Promise<boolean> {
    return (
      await Promise.all(
        data.map((c, i) => this.#contractClassStore.addContractClass(c, bytecodeCommitments[i], blockNumber)),
      )
    ).every(Boolean);
  }

  async deleteContractClasses(data: ContractClassPublic[], blockNumber: number): Promise<boolean> {
    return (await Promise.all(data.map(c => this.#contractClassStore.deleteContractClasses(c, blockNumber)))).every(
      Boolean,
    );
  }

  getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined> {
    return this.#contractClassStore.getBytecodeCommitment(contractClassId);
  }

  addFunctions(
    contractClassId: Fr,
    privateFunctions: ExecutablePrivateFunctionWithMembershipProof[],
    unconstrainedFunctions: UnconstrainedFunctionWithMembershipProof[],
  ): Promise<boolean> {
    return this.#contractClassStore.addFunctions(contractClassId, privateFunctions, unconstrainedFunctions);
  }

  async addContractInstances(data: ContractInstanceWithAddress[], _blockNumber: number): Promise<boolean> {
    return (await Promise.all(data.map(c => this.#contractInstanceStore.addContractInstance(c)))).every(Boolean);
  }

  async deleteContractInstances(data: ContractInstanceWithAddress[], _blockNumber: number): Promise<boolean> {
    return (await Promise.all(data.map(c => this.#contractInstanceStore.deleteContractInstance(c)))).every(Boolean);
  }

  async addContractInstanceUpdates(data: ContractInstanceUpdateWithAddress[], blockNumber: number): Promise<boolean> {
    return (
      await Promise.all(
        data.map((update, logIndex) =>
          this.#contractInstanceStore.addContractInstanceUpdate(update, blockNumber, logIndex),
        ),
      )
    ).every(Boolean);
  }
  async deleteContractInstanceUpdates(
    data: ContractInstanceUpdateWithAddress[],
    blockNumber: number,
  ): Promise<boolean> {
    return (
      await Promise.all(
        data.map((update, logIndex) =>
          this.#contractInstanceStore.deleteContractInstanceUpdate(update, blockNumber, logIndex),
        ),
      )
    ).every(Boolean);
  }

  /**
   * Append new blocks to the store's list.
   * @param blocks - The L2 blocks to be added to the store and the last processed L1 block.
   * @returns True if the operation is successful.
   */
  addBlocks(blocks: L1Published<L2Block>[]): Promise<boolean> {
    return this.#blockStore.addBlocks(blocks);
  }

  /**
   * Unwinds blocks from the database
   * @param from -  The tip of the chain, passed for verification purposes,
   *                ensuring that we don't end up deleting something we did not intend
   * @param blocksToUnwind - The number of blocks we are to unwind
   * @returns True if the operation is successful
   */
  unwindBlocks(from: number, blocksToUnwind: number): Promise<boolean> {
    return this.#blockStore.unwindBlocks(from, blocksToUnwind);
  }

  /**
   * Gets up to `limit` amount of L2 blocks starting from `from`.
   *
   * @param start - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 blocks
   */
  getBlocks(start: number, limit: number): Promise<L1Published<L2Block>[]> {
    return toArray(this.#blockStore.getBlocks(start, limit));
  }

  /**
   * Gets up to `limit` amount of L2 blocks headers starting from `from`.
   *
   * @param start - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 blocks
   */
  getBlockHeaders(start: number, limit: number): Promise<BlockHeader[]> {
    return toArray(this.#blockStore.getBlockHeaders(start, limit));
  }

  /**
   * Gets a tx effect.
   * @param txHash - The txHash of the tx corresponding to the tx effect.
   * @returns The requested tx effect (or undefined if not found).
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
   * Append new nullifiers to the store's list.
   * @param blocks - The blocks for which to add the nullifiers.
   * @returns True if the operation is successful.
   */
  addNullifiers(blocks: L2Block[]): Promise<boolean> {
    return this.#nullifierStore.addNullifiers(blocks);
  }

  deleteNullifiers(blocks: L2Block[]): Promise<boolean> {
    return this.#nullifierStore.deleteNullifiers(blocks);
  }

  findNullifiersIndexesWithBlock(blockNumber: number, nullifiers: Fr[]): Promise<(InBlock<bigint> | undefined)[]> {
    return this.#nullifierStore.findNullifiersIndexesWithBlock(blockNumber, nullifiers);
  }

  getTotalL1ToL2MessageCount(): Promise<bigint> {
    return this.#messageStore.getTotalL1ToL2MessageCount();
  }

  /**
   * Append L1 to L2 messages to the store.
   * @param messages - The L1 to L2 messages to be added to the store and the last processed L1 block.
   * @returns True if the operation is successful.
   */
  addL1ToL2Messages(messages: DataRetrieval<InboxLeaf>): Promise<boolean> {
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
   * Gets L1 to L2 message (to be) included in a given block.
   * @param blockNumber - L2 block number to get messages for.
   * @returns The L1 to L2 messages/leaves of the messages subtree (throws if not found).
   */
  getL1ToL2Messages(blockNumber: bigint): Promise<Fr[]> {
    return this.#messageStore.getL1ToL2Messages(blockNumber);
  }

  /**
   * Retrieves all private logs from up to `limit` blocks, starting from the block number `from`.
   * @param from - The block number from which to begin retrieving logs.
   * @param limit - The maximum number of blocks to retrieve logs from.
   * @returns An array of private logs from the specified range of blocks.
   */
  getPrivateLogs(from: number, limit: number): Promise<PrivateLog[]> {
    return this.#logStore.getPrivateLogs(from, limit);
  }

  /**
   * Gets all logs that match any of the received tags (i.e. logs with their first field equal to a tag).
   * @param tags - The tags to filter the logs by.
   * @returns For each received tag, an array of matching logs is returned. An empty array implies no logs match
   * that tag.
   */
  getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    try {
      return this.#logStore.getLogsByTags(tags);
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
   * Gets the number of the latest L2 block processed.
   * @returns The number of the latest L2 block processed.
   */
  getSynchedL2BlockNumber(): Promise<number> {
    return this.#blockStore.getSynchedL2BlockNumber();
  }

  getProvenL2BlockNumber(): Promise<number> {
    return this.#blockStore.getProvenL2BlockNumber();
  }

  getProvenL2EpochNumber(): Promise<number | undefined> {
    return this.#blockStore.getProvenL2EpochNumber();
  }

  async setProvenL2BlockNumber(blockNumber: number) {
    await this.#blockStore.setProvenL2BlockNumber(blockNumber);
  }

  async setProvenL2EpochNumber(epochNumber: number) {
    await this.#blockStore.setProvenL2EpochNumber(epochNumber);
  }

  async setBlockSynchedL1BlockNumber(l1BlockNumber: bigint) {
    await this.#blockStore.setSynchedL1BlockNumber(l1BlockNumber);
  }

  async setMessageSynchedL1BlockNumber(l1BlockNumber: bigint) {
    await this.#messageStore.setSynchedL1BlockNumber(l1BlockNumber);
  }

  /**
   * Gets the last L1 block number processed by the archiver
   */
  async getSynchPoint(): Promise<ArchiverL1SynchPoint> {
    const [blocksSynchedTo, messagesSynchedTo] = await Promise.all([
      this.#blockStore.getSynchedL1BlockNumber(),
      this.#messageStore.getSynchedL1BlockNumber(),
    ]);
    return {
      blocksSynchedTo,
      messagesSynchedTo,
    };
  }

  public estimateSize(): Promise<StoreSize> {
    return this.db.estimateSize();
  }
}
