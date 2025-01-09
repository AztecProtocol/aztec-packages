import {
  type GetPublicLogsResponse,
  type GetUnencryptedLogsResponse,
  type InBlock,
  type InboxLeaf,
  type L2Block,
  type LogFilter,
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
import { FunctionSelector } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { createLogger } from '@aztec/foundation/log';
import { type AztecKVStore } from '@aztec/kv-store';

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

  constructor(private db: AztecKVStore, logsMaxPageSize: number = 1000) {
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

  registerContractFunctionSignatures(_address: AztecAddress, signatures: string[]): Promise<void> {
    for (const sig of signatures) {
      try {
        const selector = FunctionSelector.fromSignature(sig);
        this.functionNames.set(selector.toString(), sig.slice(0, sig.indexOf('(')));
      } catch {
        this.#log.warn(`Failed to parse signature: ${sig}. Ignoring`);
      }
    }

    return Promise.resolve();
  }

  getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return Promise.resolve(this.#contractClassStore.getContractClass(id));
  }

  getContractClassIds(): Promise<Fr[]> {
    return Promise.resolve(this.#contractClassStore.getContractClassIds());
  }

  getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    const contract = this.#contractInstanceStore.getContractInstance(address);
    return Promise.resolve(contract);
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
    return Promise.resolve(this.#contractClassStore.getBytecodeCommitment(contractClassId));
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
    try {
      return Promise.resolve(Array.from(this.#blockStore.getBlocks(start, limit)));
    } catch (err) {
      // this function is sync so if any errors are thrown we need to make sure they're passed on as rejected Promises
      return Promise.reject(err);
    }
  }

  /**
   * Gets up to `limit` amount of L2 blocks headers starting from `from`.
   *
   * @param start - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 blocks
   */
  getBlockHeaders(start: number, limit: number): Promise<BlockHeader[]> {
    try {
      return Promise.resolve(Array.from(this.#blockStore.getBlockHeaders(start, limit)));
    } catch (err) {
      // this function is sync so if any errors are thrown we need to make sure they're passed on as rejected Promises
      return Promise.reject(err);
    }
  }

  /**
   * Gets a tx effect.
   * @param txHash - The txHash of the tx corresponding to the tx effect.
   * @returns The requested tx effect (or undefined if not found).
   */
  getTxEffect(txHash: TxHash) {
    return Promise.resolve(this.#blockStore.getTxEffect(txHash));
  }

  /**
   * Gets a receipt of a settled tx.
   * @param txHash - The hash of a tx we try to get the receipt for.
   * @returns The requested tx receipt (or undefined if not found).
   */
  getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    return Promise.resolve(this.#blockStore.getSettledTxReceipt(txHash));
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
    return Promise.resolve(this.#messageStore.getTotalL1ToL2MessageCount());
  }

  /**
   * Append L1 to L2 messages to the store.
   * @param messages - The L1 to L2 messages to be added to the store and the last processed L1 block.
   * @returns True if the operation is successful.
   */
  addL1ToL2Messages(messages: DataRetrieval<InboxLeaf>): Promise<boolean> {
    return Promise.resolve(this.#messageStore.addL1ToL2Messages(messages));
  }

  /**
   * Gets the L1 to L2 message index in the L1 to L2 message tree.
   * @param l1ToL2Message - The L1 to L2 message.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    return Promise.resolve(this.#messageStore.getL1ToL2MessageIndex(l1ToL2Message));
  }

  /**
   * Gets L1 to L2 message (to be) included in a given block.
   * @param blockNumber - L2 block number to get messages for.
   * @returns The L1 to L2 messages/leaves of the messages subtree (throws if not found).
   */
  getL1ToL2Messages(blockNumber: bigint): Promise<Fr[]> {
    try {
      return Promise.resolve(this.#messageStore.getL1ToL2Messages(blockNumber));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Retrieves all private logs from up to `limit` blocks, starting from the block number `from`.
   * @param from - The block number from which to begin retrieving logs.
   * @param limit - The maximum number of blocks to retrieve logs from.
   * @returns An array of private logs from the specified range of blocks.
   */
  getPrivateLogs(from: number, limit: number): Promise<PrivateLog[]> {
    try {
      return Promise.resolve(Array.from(this.#logStore.getPrivateLogs(from, limit)));
    } catch (err) {
      return Promise.reject(err);
    }
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
      return Promise.resolve(this.#logStore.getPublicLogs(filter));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    try {
      return Promise.resolve(this.#logStore.getContractClassLogs(filter));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Gets the number of the latest L2 block processed.
   * @returns The number of the latest L2 block processed.
   */
  getSynchedL2BlockNumber(): Promise<number> {
    return Promise.resolve(this.#blockStore.getSynchedL2BlockNumber());
  }

  getProvenL2BlockNumber(): Promise<number> {
    return Promise.resolve(this.#blockStore.getProvenL2BlockNumber());
  }

  getProvenL2EpochNumber(): Promise<number | undefined> {
    return Promise.resolve(this.#blockStore.getProvenL2EpochNumber());
  }

  setProvenL2BlockNumber(blockNumber: number) {
    this.#blockStore.setProvenL2BlockNumber(blockNumber);
    return Promise.resolve();
  }

  setProvenL2EpochNumber(epochNumber: number) {
    this.#blockStore.setProvenL2EpochNumber(epochNumber);
    return Promise.resolve();
  }

  setBlockSynchedL1BlockNumber(l1BlockNumber: bigint) {
    this.#blockStore.setSynchedL1BlockNumber(l1BlockNumber);
    return Promise.resolve();
  }

  setMessageSynchedL1BlockNumber(l1BlockNumber: bigint) {
    this.#messageStore.setSynchedL1BlockNumber(l1BlockNumber);
    return Promise.resolve();
  }

  /**
   * Gets the last L1 block number processed by the archiver
   */
  getSynchPoint(): Promise<ArchiverL1SynchPoint> {
    return Promise.resolve({
      blocksSynchedTo: this.#blockStore.getSynchedL1BlockNumber(),
      messagesSynchedTo: this.#messageStore.getSynchedL1BlockNumber(),
    });
  }

  public estimateSize(): { mappingSize: number; actualSize: number; numItems: number } {
    return this.db.estimateSize();
  }
}
