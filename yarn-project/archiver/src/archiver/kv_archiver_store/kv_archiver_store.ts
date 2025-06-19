import type { L1BlockId } from '@aztec/ethereum';
import type { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, CustomRange, StoreSize } from '@aztec/kv-store';
import { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2Block } from '@aztec/stdlib/block';
import type {
  ContractClassPublic,
  ContractDataSource,
  ContractInstanceUpdateWithAddress,
  ContractInstanceWithAddress,
  ExecutablePrivateFunctionWithMembershipProof,
  UtilityFunctionWithMembershipProof,
} from '@aztec/stdlib/contract';
import type { GetContractClassLogsResponse, GetPublicLogsResponse } from '@aztec/stdlib/interfaces/client';
import { type LogFilter, PrivateLog, type TxScopedL2Log } from '@aztec/stdlib/logs';
import type { BlockHeader, TxHash, TxReceipt } from '@aztec/stdlib/tx';

import { join } from 'path';

import type { ArchiverDataStore, ArchiverL1SynchPoint } from '../archiver_store.js';
import type { InboxMessage } from '../structs/inbox_message.js';
import type { PublishedL2Block } from '../structs/published.js';
import { BlockStore } from './block_store.js';
import { ContractClassStore } from './contract_class_store.js';
import { ContractInstanceStore } from './contract_instance_store.js';
import { LogStore } from './log_store.js';
import { MessageStore } from './message_store.js';

export const ARCHIVER_DB_VERSION = 3;
export const MAX_FUNCTION_SIGNATURES = 1000;
export const MAX_FUNCTION_NAME_LEN = 256;

/**
 * LMDB implementation of the ArchiverDataStore interface.
 */
export class KVArchiverDataStore implements ArchiverDataStore, ContractDataSource {
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
  ) {
    this.#blockStore = new BlockStore(db);
    this.#logStore = new LogStore(db, this.#blockStore, logsMaxPageSize);
    this.#messageStore = new MessageStore(db);
    this.#contractClassStore = new ContractClassStore(db);
    this.#contractInstanceStore = new ContractInstanceStore(db);
  }

  public transactionAsync<T>(callback: () => Promise<T>): Promise<T> {
    return this.db.transactionAsync(callback);
  }

  public getBlockNumber(): Promise<number> {
    return this.getSynchedL2BlockNumber();
  }

  public async getContract(
    address: AztecAddress,
    blockNumber?: number,
  ): Promise<ContractInstanceWithAddress | undefined> {
    return this.getContractInstance(address, blockNumber ?? (await this.getBlockNumber()));
  }

  public async backupTo(path: string, compress = true): Promise<string> {
    await this.db.backupTo(path, compress);
    return join(path, 'data.mdb');
  }

  public close() {
    return this.db.close();
  }

  getDebugFunctionName(_address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    return Promise.resolve(this.functionNames.get(selector.toString()));
  }

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

  getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.#contractClassStore.getContractClass(id);
  }

  getContractClassIds(): Promise<Fr[]> {
    return this.#contractClassStore.getContractClassIds();
  }

  getContractInstance(address: AztecAddress, blockNumber: number): Promise<ContractInstanceWithAddress | undefined> {
    return this.#contractInstanceStore.getContractInstance(address, blockNumber);
  }

  getContractInstanceDeploymentBlockNumber(address: AztecAddress): Promise<number | undefined> {
    return this.#contractInstanceStore.getContractInstanceDeploymentBlockNumber(address);
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
    utilityFunctions: UtilityFunctionWithMembershipProof[],
  ): Promise<boolean> {
    return this.#contractClassStore.addFunctions(contractClassId, privateFunctions, utilityFunctions);
  }

  async addContractInstances(data: ContractInstanceWithAddress[], blockNumber: number): Promise<boolean> {
    return (await Promise.all(data.map(c => this.#contractInstanceStore.addContractInstance(c, blockNumber)))).every(
      Boolean,
    );
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
  addBlocks(blocks: PublishedL2Block[], opts: { force?: boolean } = {}): Promise<boolean> {
    return this.#blockStore.addBlocks(blocks, opts);
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

  getPublishedBlock(number: number): Promise<PublishedL2Block | undefined> {
    return this.#blockStore.getBlock(number);
  }

  /**
   * Gets up to `limit` amount of L2 blocks starting from `from`.
   *
   * @param start - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 blocks
   */
  getPublishedBlocks(start: number, limit: number): Promise<PublishedL2Block[]> {
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

  getTotalL1ToL2MessageCount(): Promise<bigint> {
    return this.#messageStore.getTotalL1ToL2MessageCount();
  }

  getLastL1ToL2Message(): Promise<InboxMessage | undefined> {
    return this.#messageStore.getLastMessage();
  }

  /**
   * Append L1 to L2 messages to the store.
   * @param messages - The L1 to L2 messages to be added to the store.
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
   * Gets L1 to L2 message (to be) included in a given block.
   * @param blockNumber - L2 block number to get messages for.
   * @returns The L1 to L2 messages/leaves of the messages subtree (throws if not found).
   */
  getL1ToL2Messages(blockNumber: number): Promise<Fr[]> {
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
   * @param logsPerTag - How many logs to return per tag. Default returns everything
   * @returns For each received tag, an array of matching logs is returned. An empty array implies no logs match
   * that tag.
   */
  getLogsByTags(tags: Fr[], logsPerTag?: number): Promise<TxScopedL2Log[][]> {
    try {
      return this.#logStore.getLogsByTags(tags, logsPerTag);
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

  async setProvenL2BlockNumber(blockNumber: number) {
    await this.#blockStore.setProvenL2BlockNumber(blockNumber);
  }

  async setBlockSynchedL1BlockNumber(l1BlockNumber: bigint) {
    await this.#blockStore.setSynchedL1BlockNumber(l1BlockNumber);
  }

  async setMessageSynchedL1Block(l1Block: L1BlockId) {
    await this.#messageStore.setSynchedL1Block(l1Block);
  }

  /**
   * Gets the last L1 block number processed by the archiver
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

  public estimateSize(): Promise<StoreSize> {
    return this.db.estimateSize();
  }

  public rollbackL1ToL2MessagesToL2Block(targetBlockNumber: number): Promise<void> {
    return this.#messageStore.rollbackL1ToL2MessagesToL2Block(targetBlockNumber);
  }

  public iterateL1ToL2Messages(range: CustomRange<bigint> = {}): AsyncIterableIterator<InboxMessage> {
    return this.#messageStore.iterateL1ToL2Messages(range);
  }

  public removeL1ToL2Messages(startIndex: bigint): Promise<void> {
    return this.#messageStore.removeL1ToL2Messages(startIndex);
  }
}
