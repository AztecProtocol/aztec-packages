import {
  type ContractClass2BlockL2Logs,
  ExtendedUnencryptedL2Log,
  type GetUnencryptedLogsResponse,
  type InBlock,
  type InboxLeaf,
  type L2Block,
  L2BlockHash,
  type LogFilter,
  LogId,
  type TxEffect,
  type TxHash,
  TxReceipt,
  TxScopedL2Log,
  type UnencryptedL2BlockL2Logs,
  wrapInBlock,
} from '@aztec/circuit-types';
import {
  type BlockHeader,
  type ContractClassPublic,
  type ContractClassPublicWithBlockNumber,
  type ContractInstanceWithAddress,
  type ExecutablePrivateFunctionWithMembershipProof,
  Fr,
  INITIAL_L2_BLOCK_NUM,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  type PrivateLog,
  type UnconstrainedFunctionWithMembershipProof,
} from '@aztec/circuits.js';
import { type ContractArtifact, FunctionSelector } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { createLogger } from '@aztec/foundation/log';

import { type ArchiverDataStore, type ArchiverL1SynchPoint } from '../archiver_store.js';
import { type DataRetrieval } from '../structs/data_retrieval.js';
import { type L1Published } from '../structs/published.js';
import { L1ToL2MessageStore } from './l1_to_l2_message_store.js';

/**
 * Simple, in-memory implementation of an archiver data store.
 */
export class MemoryArchiverStore implements ArchiverDataStore {
  /**
   * An array containing all the L2 blocks that have been fetched so far.
   */
  private l2Blocks: L1Published<L2Block>[] = [];

  /**
   * An array containing all the tx effects in the L2 blocks that have been fetched so far.
   */
  private txEffects: InBlock<TxEffect>[] = [];

  private taggedLogs: Map<string, TxScopedL2Log[]> = new Map();

  private logTagsPerBlock: Map<number, Fr[]> = new Map();

  private privateLogsPerBlock: Map<number, PrivateLog[]> = new Map();

  private unencryptedLogsPerBlock: Map<number, UnencryptedL2BlockL2Logs> = new Map();

  private contractClassLogsPerBlock: Map<number, ContractClass2BlockL2Logs> = new Map();

  private blockScopedNullifiers: Map<string, { blockNumber: number; blockHash: string; index: bigint }> = new Map();

  /**
   * Contains all L1 to L2 messages.
   */
  private l1ToL2Messages = new L1ToL2MessageStore();

  private contractArtifacts: Map<string, ContractArtifact> = new Map();

  private contractClasses: Map<string, ContractClassPublicWithBlockNumber> = new Map();

  private bytecodeCommitments: Map<string, Fr> = new Map();

  private privateFunctions: Map<string, ExecutablePrivateFunctionWithMembershipProof[]> = new Map();

  private unconstrainedFunctions: Map<string, UnconstrainedFunctionWithMembershipProof[]> = new Map();

  private contractInstances: Map<string, ContractInstanceWithAddress> = new Map();

  private lastL1BlockNewBlocks: bigint | undefined = undefined;
  private lastL1BlockNewMessages: bigint | undefined = undefined;

  private lastProvenL2BlockNumber: number = 0;
  private lastProvenL2EpochNumber: number = 0;

  #log = createLogger('archiver:data-store');

  constructor(
    /** The max number of logs that can be obtained in 1 "getUnencryptedLogs" call. */
    public readonly maxLogs: number,
  ) {}

  public getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    const contractClass = this.contractClasses.get(id.toString());
    return Promise.resolve(
      contractClass && {
        ...contractClass,
        privateFunctions: this.privateFunctions.get(id.toString()) ?? [],
        unconstrainedFunctions: this.unconstrainedFunctions.get(id.toString()) ?? [],
      },
    );
  }

  public getContractClassIds(): Promise<Fr[]> {
    return Promise.resolve(Array.from(this.contractClasses.keys()).map(key => Fr.fromString(key)));
  }

  public getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return Promise.resolve(this.contractInstances.get(address.toString()));
  }

  public getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined> {
    return Promise.resolve(this.bytecodeCommitments.get(contractClassId.toString()));
  }

  public addFunctions(
    contractClassId: Fr,
    newPrivateFunctions: ExecutablePrivateFunctionWithMembershipProof[],
    newUnconstrainedFunctions: UnconstrainedFunctionWithMembershipProof[],
  ): Promise<boolean> {
    const privateFunctions = this.privateFunctions.get(contractClassId.toString()) ?? [];
    const unconstrainedFunctions = this.unconstrainedFunctions.get(contractClassId.toString()) ?? [];
    const updatedPrivateFunctions = [
      ...privateFunctions,
      ...newPrivateFunctions.filter(newFn => !privateFunctions.find(f => f.selector.equals(newFn.selector))),
    ];
    const updatedUnconstrainedFunctions = [
      ...unconstrainedFunctions,
      ...newUnconstrainedFunctions.filter(
        newFn => !unconstrainedFunctions.find(f => f.selector.equals(newFn.selector)),
      ),
    ];
    this.privateFunctions.set(contractClassId.toString(), updatedPrivateFunctions);
    this.unconstrainedFunctions.set(contractClassId.toString(), updatedUnconstrainedFunctions);
    return Promise.resolve(true);
  }

  public addContractClasses(
    data: ContractClassPublic[],
    bytecodeCommitments: Fr[],
    blockNumber: number,
  ): Promise<boolean> {
    for (let i = 0; i < data.length; i++) {
      const contractClass = data[i];
      if (!this.contractClasses.has(contractClass.id.toString())) {
        this.contractClasses.set(contractClass.id.toString(), {
          ...contractClass,
          l2BlockNumber: blockNumber,
        });
      }
      if (!this.bytecodeCommitments.has(contractClass.id.toString())) {
        this.bytecodeCommitments.set(contractClass.id.toString(), bytecodeCommitments[i]);
      }
    }
    return Promise.resolve(true);
  }

  public deleteContractClasses(data: ContractClassPublic[], blockNumber: number): Promise<boolean> {
    for (const contractClass of data) {
      const restored = this.contractClasses.get(contractClass.id.toString());
      if (restored && restored.l2BlockNumber >= blockNumber) {
        this.contractClasses.delete(contractClass.id.toString());
        this.bytecodeCommitments.delete(contractClass.id.toString());
      }
    }
    return Promise.resolve(true);
  }

  public addContractInstances(data: ContractInstanceWithAddress[], _blockNumber: number): Promise<boolean> {
    for (const contractInstance of data) {
      this.contractInstances.set(contractInstance.address.toString(), contractInstance);
    }
    return Promise.resolve(true);
  }

  public deleteContractInstances(data: ContractInstanceWithAddress[], _blockNumber: number): Promise<boolean> {
    for (const contractInstance of data) {
      this.contractInstances.delete(contractInstance.address.toString());
    }
    return Promise.resolve(true);
  }

  /**
   * Append new blocks to the store's list.
   * @param blocks - The L2 blocks to be added to the store and the last processed L1 block.
   * @returns True if the operation is successful.
   */
  public addBlocks(blocks: L1Published<L2Block>[]): Promise<boolean> {
    if (blocks.length === 0) {
      return Promise.resolve(true);
    }

    this.lastL1BlockNewBlocks = blocks[blocks.length - 1].l1.blockNumber;
    this.l2Blocks.push(...blocks);
    this.txEffects.push(...blocks.flatMap(b => b.data.body.txEffects.map(txEffect => wrapInBlock(txEffect, b.data))));

    return Promise.resolve(true);
  }

  /**
   * Unwinds blocks from the database
   * @param from -  The tip of the chain, passed for verification purposes,
   *                ensuring that we don't end up deleting something we did not intend
   * @param blocksToUnwind - The number of blocks we are to unwind
   * @returns True if the operation is successful
   */
  public async unwindBlocks(from: number, blocksToUnwind: number): Promise<boolean> {
    const last = await this.getSynchedL2BlockNumber();
    if (from != last) {
      throw new Error(`Can only unwind blocks from the tip (requested ${from} but current tip is ${last})`);
    }

    const stopAt = from - blocksToUnwind;
    while ((await this.getSynchedL2BlockNumber()) > stopAt) {
      const block = this.l2Blocks.pop();
      if (block == undefined) {
        break;
      }
      block.data.body.txEffects.forEach(() => this.txEffects.pop());
    }

    return Promise.resolve(true);
  }

  #storeTaggedLogsFromPrivate(block: L2Block): void {
    const dataStartIndexForBlock =
      block.header.state.partial.noteHashTree.nextAvailableLeafIndex -
      block.body.numberOfTxsIncludingPadded * MAX_NOTE_HASHES_PER_TX;
    block.body.txEffects.forEach((txEffect, txIndex) => {
      const txHash = txEffect.txHash;
      const dataStartIndexForTx = dataStartIndexForBlock + txIndex * MAX_NOTE_HASHES_PER_TX;
      txEffect.privateLogs.forEach(log => {
        const tag = log.fields[0];
        const currentLogs = this.taggedLogs.get(tag.toString()) || [];
        this.taggedLogs.set(tag.toString(), [
          ...currentLogs,
          new TxScopedL2Log(txHash, dataStartIndexForTx, block.number, /* isFromPublic */ false, log.toBuffer()),
        ]);
        const currentTagsInBlock = this.logTagsPerBlock.get(block.number) || [];
        this.logTagsPerBlock.set(block.number, [...currentTagsInBlock, tag]);
      });
    });
  }

  #storeTaggedLogsFromPublic(block: L2Block): void {
    const dataStartIndexForBlock =
      block.header.state.partial.noteHashTree.nextAvailableLeafIndex -
      block.body.numberOfTxsIncludingPadded * MAX_NOTE_HASHES_PER_TX;
    block.body.unencryptedLogs.txLogs.forEach((txLogs, txIndex) => {
      const txHash = block.body.txEffects[txIndex].txHash;
      const dataStartIndexForTx = dataStartIndexForBlock + txIndex * MAX_NOTE_HASHES_PER_TX;
      const logs = txLogs.unrollLogs();
      logs.forEach(log => {
        if (
          // TODO remove when #9835 and #9836 are fixed
          log.data.length <
          32 * 33
        ) {
          this.#log.warn(`Skipping unencrypted log with invalid data length: ${log.data.length}`);
          return;
        }
        try {
          // TODO remove when #9835 and #9836 are fixed. The partial note logs are emitted as bytes, but encoded as Fields.
          // This means that for every 32 bytes of payload, we only have 1 byte of data.
          // Also, the tag is not stored in the first 32 bytes of the log, (that's the length of public fields now) but in the next 32.
          const correctedBuffer = Buffer.alloc(32);
          const initialOffset = 32;
          for (let i = 0; i < 32; i++) {
            const byte = Fr.fromBuffer(
              log.data.subarray(i * 32 + initialOffset, i * 32 + 32 + initialOffset),
            ).toNumber();
            correctedBuffer.writeUInt8(byte, i);
          }
          const tag = new Fr(correctedBuffer);
          this.#log.verbose(`Storing unencrypted tagged log with tag ${tag.toString()} in block ${block.number}`);
          const currentLogs = this.taggedLogs.get(tag.toString()) || [];
          this.taggedLogs.set(tag.toString(), [
            ...currentLogs,
            new TxScopedL2Log(txHash, dataStartIndexForTx, block.number, /* isFromPublic */ true, log.data),
          ]);
          const currentTagsInBlock = this.logTagsPerBlock.get(block.number) || [];
          this.logTagsPerBlock.set(block.number, [...currentTagsInBlock, tag]);
        } catch (err) {
          this.#log.warn(`Failed to add tagged log to store: ${err}`);
        }
      });
    });
  }

  /**
   * Append new logs to the store's list.
   * @param block - The block for which to add the logs.
   * @returns True if the operation is successful.
   */
  addLogs(blocks: L2Block[]): Promise<boolean> {
    blocks.forEach(block => {
      void this.#storeTaggedLogsFromPrivate(block);
      void this.#storeTaggedLogsFromPublic(block);
      this.privateLogsPerBlock.set(block.number, block.body.txEffects.map(txEffect => txEffect.privateLogs).flat());
      this.unencryptedLogsPerBlock.set(block.number, block.body.unencryptedLogs);
      this.contractClassLogsPerBlock.set(block.number, block.body.contractClassLogs);
    });
    return Promise.resolve(true);
  }

  deleteLogs(blocks: L2Block[]): Promise<boolean> {
    const tagsToDelete = blocks.flatMap(block => this.logTagsPerBlock.get(block.number));
    tagsToDelete
      .filter(tag => tag != undefined)
      .forEach(tag => {
        this.taggedLogs.delete(tag!.toString());
      });

    blocks.forEach(block => {
      this.privateLogsPerBlock.delete(block.number);
      this.unencryptedLogsPerBlock.delete(block.number);
      this.logTagsPerBlock.delete(block.number);
      this.contractClassLogsPerBlock.delete(block.number);
    });

    return Promise.resolve(true);
  }

  addNullifiers(blocks: L2Block[]): Promise<boolean> {
    blocks.forEach(block => {
      const dataStartIndexForBlock =
        block.header.state.partial.nullifierTree.nextAvailableLeafIndex -
        block.body.numberOfTxsIncludingPadded * MAX_NULLIFIERS_PER_TX;
      block.body.txEffects.forEach((txEffects, txIndex) => {
        const dataStartIndexForTx = dataStartIndexForBlock + txIndex * MAX_NULLIFIERS_PER_TX;
        txEffects.nullifiers.forEach((nullifier, nullifierIndex) => {
          this.blockScopedNullifiers.set(nullifier.toString(), {
            index: BigInt(dataStartIndexForTx + nullifierIndex),
            blockNumber: block.number,
            blockHash: block.hash().toString(),
          });
        });
      });
    });
    return Promise.resolve(true);
  }

  deleteNullifiers(blocks: L2Block[]): Promise<boolean> {
    blocks.forEach(block => {
      block.body.txEffects.forEach(txEffect => {
        txEffect.nullifiers.forEach(nullifier => {
          this.blockScopedNullifiers.delete(nullifier.toString());
        });
      });
    });
    return Promise.resolve(true);
  }

  findNullifiersIndexesWithBlock(blockNumber: number, nullifiers: Fr[]): Promise<(InBlock<bigint> | undefined)[]> {
    const blockScopedNullifiers = nullifiers.map(nullifier => {
      const nullifierData = this.blockScopedNullifiers.get(nullifier.toString());
      if (nullifierData !== undefined && nullifierData.blockNumber <= blockNumber) {
        return {
          data: nullifierData.index,
          l2BlockHash: nullifierData.blockHash,
          l2BlockNumber: nullifierData.blockNumber,
        } as InBlock<bigint>;
      }
      return undefined;
    });
    return Promise.resolve(blockScopedNullifiers);
  }

  getTotalL1ToL2MessageCount(): Promise<bigint> {
    return Promise.resolve(this.l1ToL2Messages.getTotalL1ToL2MessageCount());
  }

  /**
   * Append L1 to L2 messages to the store.
   * @param messages - The L1 to L2 messages to be added to the store and the last processed L1 block.
   * @returns True if the operation is successful.
   */
  public addL1ToL2Messages(messages: DataRetrieval<InboxLeaf>): Promise<boolean> {
    if (
      typeof this.lastL1BlockNewMessages === 'bigint' &&
      messages.lastProcessedL1BlockNumber <= this.lastL1BlockNewMessages
    ) {
      return Promise.resolve(false);
    }

    this.lastL1BlockNewMessages = messages.lastProcessedL1BlockNumber;
    for (const message of messages.retrievedData) {
      this.l1ToL2Messages.addMessage(message);
    }
    return Promise.resolve(true);
  }

  /**
   * Gets the L1 to L2 message index in the L1 to L2 message tree.
   * @param l1ToL2Message - The L1 to L2 message.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    return Promise.resolve(this.l1ToL2Messages.getMessageIndex(l1ToL2Message));
  }

  /**
   * Gets up to `limit` amount of L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 blocks.
   * @remarks When "from" is smaller than genesis block number, blocks from the beginning are returned.
   */
  public getBlocks(from: number, limit: number): Promise<L1Published<L2Block>[]> {
    if (limit < 1) {
      return Promise.reject(new Error(`Invalid limit: ${limit}`));
    }

    if (from < INITIAL_L2_BLOCK_NUM) {
      return Promise.reject(new Error(`Invalid start: ${from}`));
    }

    const fromIndex = from - INITIAL_L2_BLOCK_NUM;
    if (fromIndex >= this.l2Blocks.length) {
      return Promise.resolve([]);
    }

    const toIndex = fromIndex + limit;
    return Promise.resolve(this.l2Blocks.slice(fromIndex, toIndex));
  }

  public async getBlockHeaders(from: number, limit: number): Promise<BlockHeader[]> {
    const blocks = await this.getBlocks(from, limit);
    return blocks.map(block => block.data.header);
  }

  /**
   * Gets a tx effect.
   * @param txHash - The txHash of the tx effect.
   * @returns The requested tx effect.
   */
  public getTxEffect(txHash: TxHash): Promise<InBlock<TxEffect> | undefined> {
    const txEffect = this.txEffects.find(tx => tx.data.txHash.equals(txHash));
    return Promise.resolve(txEffect);
  }

  /**
   * Gets a receipt of a settled tx.
   * @param txHash - The hash of a tx we try to get the receipt for.
   * @returns The requested tx receipt (or undefined if not found).
   */
  public getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    for (const block of this.l2Blocks) {
      for (const txEffect of block.data.body.txEffects) {
        if (txEffect.txHash.equals(txHash)) {
          return Promise.resolve(
            new TxReceipt(
              txHash,
              TxReceipt.statusFromRevertCode(txEffect.revertCode),
              '',
              txEffect.transactionFee.toBigInt(),
              L2BlockHash.fromField(block.data.hash()),
              block.data.number,
            ),
          );
        }
      }
    }
    return Promise.resolve(undefined);
  }

  /**
   * Gets L1 to L2 message (to be) included in a given block.
   * @param blockNumber - L2 block number to get messages for.
   * @returns The L1 to L2 messages/leaves of the messages subtree (throws if not found).
   */
  getL1ToL2Messages(blockNumber: bigint): Promise<Fr[]> {
    return Promise.resolve(this.l1ToL2Messages.getMessages(blockNumber));
  }

  /**
   * Retrieves all private logs from up to `limit` blocks, starting from the block number `from`.
   * @param from - The block number from which to begin retrieving logs.
   * @param limit - The maximum number of blocks to retrieve logs from.
   * @returns An array of private logs from the specified range of blocks.
   */
  getPrivateLogs(from: number, limit: number): Promise<PrivateLog[]> {
    if (from < INITIAL_L2_BLOCK_NUM || limit < 1) {
      return Promise.resolve([]);
    }

    if (from > this.l2Blocks.length) {
      return Promise.resolve([]);
    }

    const startIndex = from;
    const endIndex = startIndex + limit;
    const upper = Math.min(endIndex, this.l2Blocks.length + INITIAL_L2_BLOCK_NUM);

    const logsInBlocks = [];
    for (let i = startIndex; i < upper; i++) {
      const logs = this.privateLogsPerBlock.get(i);
      if (logs) {
        logsInBlocks.push(logs);
      }
    }

    return Promise.resolve(logsInBlocks.flat());
  }

  /**
   * Gets all logs that match any of the received tags (i.e. logs with their first field equal to a tag).
   * @param tags - The tags to filter the logs by.
   * @returns For each received tag, an array of matching logs is returned. An empty array implies no logs match
   * that tag.
   */
  getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    const noteLogs = tags.map(tag => this.taggedLogs.get(tag.toString()) || []);
    return Promise.resolve(noteLogs);
  }

  /**
   * Gets unencrypted logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   * @remarks Works by doing an intersection of all params in the filter.
   */
  getUnencryptedLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    let txHash: TxHash | undefined;
    let fromBlock = 0;
    let toBlock = this.l2Blocks.length + INITIAL_L2_BLOCK_NUM;
    let txIndexInBlock = 0;
    let logIndexInTx = 0;

    if (filter.afterLog) {
      // Continuation parameter is set --> tx hash is ignored
      if (filter.fromBlock == undefined || filter.fromBlock <= filter.afterLog.blockNumber) {
        fromBlock = filter.afterLog.blockNumber;
        txIndexInBlock = filter.afterLog.txIndex;
        logIndexInTx = filter.afterLog.logIndex + 1; // We want to start from the next log
      } else {
        fromBlock = filter.fromBlock;
      }
    } else {
      txHash = filter.txHash;

      if (filter.fromBlock !== undefined) {
        fromBlock = filter.fromBlock;
      }
    }

    if (filter.toBlock !== undefined) {
      toBlock = filter.toBlock;
    }

    // Ensure the indices are within block array bounds
    fromBlock = Math.max(fromBlock, INITIAL_L2_BLOCK_NUM);
    toBlock = Math.min(toBlock, this.l2Blocks.length + INITIAL_L2_BLOCK_NUM);

    if (fromBlock > this.l2Blocks.length || toBlock < fromBlock || toBlock <= 0) {
      return Promise.resolve({
        logs: [],
        maxLogsHit: false,
      });
    }

    const contractAddress = filter.contractAddress;

    const logs: ExtendedUnencryptedL2Log[] = [];

    for (; fromBlock < toBlock; fromBlock++) {
      const block = this.l2Blocks[fromBlock - INITIAL_L2_BLOCK_NUM];
      const blockLogs = this.unencryptedLogsPerBlock.get(fromBlock);

      if (blockLogs) {
        for (; txIndexInBlock < blockLogs.txLogs.length; txIndexInBlock++) {
          const txLogs = blockLogs.txLogs[txIndexInBlock].unrollLogs();
          for (; logIndexInTx < txLogs.length; logIndexInTx++) {
            const log = txLogs[logIndexInTx];
            if (
              (!txHash || block.data.body.txEffects[txIndexInBlock].txHash.equals(txHash)) &&
              (!contractAddress || log.contractAddress.equals(contractAddress))
            ) {
              logs.push(new ExtendedUnencryptedL2Log(new LogId(block.data.number, txIndexInBlock, logIndexInTx), log));
              if (logs.length === this.maxLogs) {
                return Promise.resolve({
                  logs,
                  maxLogsHit: true,
                });
              }
            }
          }
          logIndexInTx = 0;
        }
      }
      txIndexInBlock = 0;
    }

    return Promise.resolve({
      logs,
      maxLogsHit: false,
    });
  }

  /**
   * Gets contract class logs based on the provided filter.
   * NB: clone of the above fn, but for contract class logs
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   * @remarks Works by doing an intersection of all params in the filter.
   */
  getContractClassLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    let txHash: TxHash | undefined;
    let fromBlock = 0;
    let toBlock = this.l2Blocks.length + INITIAL_L2_BLOCK_NUM;
    let txIndexInBlock = 0;
    let logIndexInTx = 0;

    if (filter.afterLog) {
      // Continuation parameter is set --> tx hash is ignored
      if (filter.fromBlock == undefined || filter.fromBlock <= filter.afterLog.blockNumber) {
        fromBlock = filter.afterLog.blockNumber;
        txIndexInBlock = filter.afterLog.txIndex;
        logIndexInTx = filter.afterLog.logIndex + 1; // We want to start from the next log
      } else {
        fromBlock = filter.fromBlock;
      }
    } else {
      txHash = filter.txHash;

      if (filter.fromBlock !== undefined) {
        fromBlock = filter.fromBlock;
      }
    }

    if (filter.toBlock !== undefined) {
      toBlock = filter.toBlock;
    }

    // Ensure the indices are within block array bounds
    fromBlock = Math.max(fromBlock, INITIAL_L2_BLOCK_NUM);
    toBlock = Math.min(toBlock, this.l2Blocks.length + INITIAL_L2_BLOCK_NUM);

    if (fromBlock > this.l2Blocks.length || toBlock < fromBlock || toBlock <= 0) {
      return Promise.resolve({
        logs: [],
        maxLogsHit: false,
      });
    }

    const contractAddress = filter.contractAddress;

    const logs: ExtendedUnencryptedL2Log[] = [];

    for (; fromBlock < toBlock; fromBlock++) {
      const block = this.l2Blocks[fromBlock - INITIAL_L2_BLOCK_NUM];
      const blockLogs = this.contractClassLogsPerBlock.get(fromBlock);

      if (blockLogs) {
        for (; txIndexInBlock < blockLogs.txLogs.length; txIndexInBlock++) {
          const txLogs = blockLogs.txLogs[txIndexInBlock].unrollLogs();
          for (; logIndexInTx < txLogs.length; logIndexInTx++) {
            const log = txLogs[logIndexInTx];
            if (
              (!txHash || block.data.body.txEffects[txIndexInBlock].txHash.equals(txHash)) &&
              (!contractAddress || log.contractAddress.equals(contractAddress))
            ) {
              logs.push(new ExtendedUnencryptedL2Log(new LogId(block.data.number, txIndexInBlock, logIndexInTx), log));
              if (logs.length === this.maxLogs) {
                return Promise.resolve({
                  logs,
                  maxLogsHit: true,
                });
              }
            }
          }
          logIndexInTx = 0;
        }
      }
      txIndexInBlock = 0;
    }

    return Promise.resolve({
      logs,
      maxLogsHit: false,
    });
  }

  /**
   * Gets the number of the latest L2 block processed.
   * @returns The number of the latest L2 block processed.
   */
  public getSynchedL2BlockNumber(): Promise<number> {
    if (this.l2Blocks.length === 0) {
      return Promise.resolve(INITIAL_L2_BLOCK_NUM - 1);
    }
    return Promise.resolve(this.l2Blocks[this.l2Blocks.length - 1].data.number);
  }

  public getProvenL2BlockNumber(): Promise<number> {
    return Promise.resolve(this.lastProvenL2BlockNumber);
  }

  public getProvenL2EpochNumber(): Promise<number | undefined> {
    return Promise.resolve(this.lastProvenL2EpochNumber);
  }

  public setProvenL2BlockNumber(l2BlockNumber: number): Promise<void> {
    this.lastProvenL2BlockNumber = l2BlockNumber;
    return Promise.resolve();
  }

  public setProvenL2EpochNumber(l2EpochNumber: number): Promise<void> {
    this.lastProvenL2EpochNumber = l2EpochNumber;
    return Promise.resolve();
  }

  setBlockSynchedL1BlockNumber(l1BlockNumber: bigint) {
    this.lastL1BlockNewBlocks = l1BlockNumber;
    return Promise.resolve();
  }

  setMessageSynchedL1BlockNumber(l1BlockNumber: bigint) {
    this.lastL1BlockNewMessages = l1BlockNumber;
    return Promise.resolve();
  }

  public getSynchPoint(): Promise<ArchiverL1SynchPoint> {
    return Promise.resolve({
      blocksSynchedTo: this.lastL1BlockNewBlocks,
      messagesSynchedTo: this.lastL1BlockNewMessages,
    });
  }

  public addContractArtifact(address: AztecAddress, contract: ContractArtifact): Promise<void> {
    this.contractArtifacts.set(address.toString(), contract);
    return Promise.resolve();
  }

  public getContractArtifact(address: AztecAddress): Promise<ContractArtifact | undefined> {
    return Promise.resolve(this.contractArtifacts.get(address.toString()));
  }

  async getContractFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    const artifact = await this.getContractArtifact(address);

    if (!artifact) {
      return undefined;
    }

    const func = artifact.functions.find(f =>
      FunctionSelector.fromNameAndParameters({ name: f.name, parameters: f.parameters }).equals(selector),
    );
    return Promise.resolve(func?.name);
  }

  public estimateSize(): { mappingSize: number; actualSize: number; numItems: number } {
    return { mappingSize: 0, actualSize: 0, numItems: 0 };
  }
}
