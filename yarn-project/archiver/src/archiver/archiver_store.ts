import { MaxHeap } from '@datastructures-js/heap';
import {
  ContractPublicData,
  L2Block,
  UnverifiedData,
  INITIAL_L2_BLOCK_NUM,
  ContractData,
  L1ToL2Message,
} from '@aztec/types';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';

/**
 * Interface describing a data store to be used by the archiver to store all its relevant data
 * (blocks, unverified data, aztec contract public data).
 */
export interface ArchiverDataStore {
  addL2Blocks(blocks: L2Block[]): Promise<boolean>;
  getL2Blocks(from: number, take: number): Promise<L2Block[]>;
  addUnverifiedData(data: UnverifiedData[]): Promise<boolean>;
  addPendingL1ToL2Messages(messageKeyToMessage: Map<Fr, L1ToL2Message>): Promise<boolean>;
  consumePendingL1ToL2Messages(take?: number): Promise<Fr[]>;
  reinsertPendingL1ToL2MessagesUponBlockFailure(messageKeys: Fr[]): Promise<boolean>;
  getL1ToL2Message(messageKey: Fr): Promise<L1ToL2Message>;
  getUnverifiedData(from: number, take: number): Promise<UnverifiedData[]>;
  addL2ContractPublicData(data: ContractPublicData[], blockNum: number): Promise<boolean>;
  getL2ContractPublicData(contractAddress: AztecAddress): Promise<ContractPublicData | undefined>;
  getL2ContractPublicDataInBlock(blockNum: number): Promise<ContractPublicData[]>;
  getL2ContractInfo(contractAddress: AztecAddress): Promise<ContractData | undefined>;
  getL2ContractInfoInBlock(l2BlockNum: number): Promise<ContractData[] | undefined>;
  getBlockHeight(): Promise<number>;
  getBlocksLength(): number;
  getLatestUnverifiedDataBlockNum(): Promise<number>;
}

/**
 * Smaller L1ToL2Message data type to store data in the max heap
 * Max heap only requires the message key and the fee (to sort messages by the fee)
 */
type L1ToL2MessageKeyAndFee = {
  /**
   * The message key (hash of the L1 to L2 message).
   */
  messageKey: Fr;
  /**
   * The fee for the message as recorded by the Inbox contract.
   */
  fee: number;
};

/**
 * Simple, in-memory implementation of an archiver data store.
 */
export class MemoryArchiverStore implements ArchiverDataStore {
  /**
   * An array containing all the L2 blocks that have been fetched so far.
   */
  private l2Blocks: L2Block[] = [];

  /**
   * An array containing all the `unverifiedData` that have been fetched so far.
   * Note: Index in the "outer" array equals to (corresponding L2 block's number - INITIAL_L2_BLOCK_NUM).
   */
  private unverifiedData: UnverifiedData[] = [];

  /**
   * A sparse array containing all the contract data that have been fetched so far.
   */
  private contractPublicData: (ContractPublicData[] | undefined)[] = [];

  /**
   * A map containing the message key to the corresponding L1 to L2 messages that have ever been sent.
   */
  private allMessageKeysToL1ToL2Messages: Map<Fr, L1ToL2Message> = new Map();

  /**
   * A max heap containing the pending L1 to L2 messages, sorted by message.fee.
   */
  private pendingL1ToL2Messages: MaxHeap<L1ToL2MessageKeyAndFee> = new MaxHeap<L1ToL2MessageKeyAndFee>(
    value => value.fee,
  );

  constructor() {}

  /**
   * Append new blocks to the store's list.
   * @param blocks - The L2 blocks to be added to the store.
   * @returns True if the operation is successful (always in this implementation).
   */
  public addL2Blocks(blocks: L2Block[]): Promise<boolean> {
    this.l2Blocks.push(...blocks);
    return Promise.resolve(true);
  }

  /**
   * Append new Unverified data to the store's list.
   * @param data - The Unverified Data to be added to the store.
   * @returns True if the operation is successful (always in this implementation).
   */
  public addUnverifiedData(data: UnverifiedData[]): Promise<boolean> {
    this.unverifiedData.push(...data);
    return Promise.resolve(true);
  }

  /**
   * Append new pending L1 to L2 messages to the store.
   * @param messageKeyToMessage - A map of the message key to the corresponding L1 to L2 messages
   * @returns True if the operation is successful (always in this implementation).
   */
  public addPendingL1ToL2Messages(messageKeyToMessage: Map<Fr, L1ToL2Message>): Promise<boolean> {
    for (const [messageKey, message] of messageKeyToMessage) {
      // add to map and the heap
      this.allMessageKeysToL1ToL2Messages.set(messageKey, message);
      this.pendingL1ToL2Messages.push({ messageKey, fee: message.fee });
    }
    return Promise.resolve(true);
  }

  /**
   * Store new Contract Public Data from an L2 block to the store's list.
   * @param data - List of contracts' data to be added.
   * @param blockNum - Number of the L2 block the contract data was deployed in.
   * @returns True if the operation is successful (always in this implementation).
   */
  public addL2ContractPublicData(data: ContractPublicData[], blockNum: number): Promise<boolean> {
    this.contractPublicData[blockNum] = data;
    return Promise.resolve(true);
  }

  /**
   * Gets the `take` amount of L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param take - The number of blocks to return.
   * @returns The requested L2 blocks.
   */
  public getL2Blocks(from: number, take: number): Promise<L2Block[]> {
    if (from < INITIAL_L2_BLOCK_NUM) {
      throw new Error(`Invalid block range ${from}`);
    }
    if (from > this.l2Blocks.length) {
      return Promise.resolve([]);
    }
    const startIndex = from - INITIAL_L2_BLOCK_NUM;
    const endIndex = from + take;
    return Promise.resolve(this.l2Blocks.slice(startIndex, endIndex));
  }

  /**
   * Consumes upto `take` amount of pending L1 to L2 messages, sorted by fee.
   * Note - this is called by the L1ToL2MessageConsumer interface,
   * typically the sequencer - to queue messages for the next rollup block.
   * If publishing this L2 block fails, then the sequencer calls
   * `reinsertPendingL1ToL2MessagesUponBlockFailure()` to reinsert the messages back into the heap.
   * @param take - The number of messages to return (by default NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).
   * @returns Array of the top L1 to L2 message keys sorted by fee
   * (of maximum size `take` - smaller if not enough messages)
   */
  public consumePendingL1ToL2Messages(take: number = NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP): Promise<Fr[]> {
    const messageKeys: Fr[] = [];
    while (take > 0 && !this.pendingL1ToL2Messages.isEmpty()) {
      // extract top most item in the heap (i.e. item with the highest fee)
      messageKeys.push(this.pendingL1ToL2Messages.pop().messageKey);
      take--;
    }
    return Promise.resolve(messageKeys);
  }

  /**
   * Typically called by the L1ToL2MessageConsumer to reinsert messages back into the heap
   * if publishing of the L2 block fails (this is the list of keys that were first popped
   * from the max heap, in `consumePendingL1ToL2Messages()` to be included in the block,
   * but block publishing failed).
   * @param messageKeys - The message keys to reinsert back into the heap.
   * @returns True if the operation is successful (always in this implementation).
   */
  public reinsertPendingL1ToL2MessagesUponBlockFailure(messageKeys: Fr[]): Promise<boolean> {
    messageKeys.forEach(messageKey => {
      const message = this.allMessageKeysToL1ToL2Messages.get(messageKey);
      if (message) {
        this.pendingL1ToL2Messages.push({ messageKey, fee: message.fee });
      }
      // skip if message not found (shouldn't happen).
    });
    return Promise.resolve(true);
  }

  /**
   * Gets the L1 to L2 message corresponding to the given message key.
   * @param messageKey - The message key to lookup.
   * @returns the message or throws if not found.
   */
  public getL1ToL2Message(messageKey: Fr): Promise<L1ToL2Message> {
    const message = this.allMessageKeysToL1ToL2Messages.get(messageKey);
    if (!message) {
      throw new Error(`Message not found for key ${messageKey}`);
    }
    return Promise.resolve(message);
  }

  /**
   * Gets the `take` amount of unverified data starting from `from`.
   * @param from - Number of the L2 block to which corresponds the first `unverifiedData` to be returned.
   * @param take - The number of `unverifiedData` to return.
   * @returns The requested `unverifiedData`.
   */
  public getUnverifiedData(from: number, take: number): Promise<UnverifiedData[]> {
    if (from < INITIAL_L2_BLOCK_NUM) {
      throw new Error(`Invalid block range ${from}`);
    }
    if (from > this.unverifiedData.length) {
      return Promise.resolve([]);
    }
    const startIndex = from - INITIAL_L2_BLOCK_NUM;
    const endIndex = from + take;
    return Promise.resolve(this.unverifiedData.slice(startIndex, endIndex));
  }

  /**
   * Lookup the L2 contract data for a contract address.
   * @param contractAddress - The contract data address.
   * @returns The contract's public data.
   */
  public getL2ContractPublicData(contractAddress: AztecAddress): Promise<ContractPublicData | undefined> {
    let result;
    for (let i = INITIAL_L2_BLOCK_NUM; i < this.contractPublicData.length; i++) {
      const contracts = this.contractPublicData[i];
      const contract = contracts?.find(c => c.contractData.contractAddress.equals(contractAddress));
      if (contract) {
        result = contract;
        break;
      }
    }
    return Promise.resolve(result);
  }

  /**
   * Lookup all contract data in an L2 block.
   * @param blockNum - The block number to get all contract data from.
   * @returns All contract public data in the block (if found).
   */
  public getL2ContractPublicDataInBlock(blockNum: number): Promise<ContractPublicData[]> {
    if (blockNum > this.l2Blocks.length) {
      return Promise.resolve([]);
    }
    return Promise.resolve(this.contractPublicData[blockNum] || []);
  }

  /**
   * Get basic info for an L2 contract.
   * Contains contract address & the ethereum portal address.
   * @param contractAddress - The contract data address.
   * @returns ContractData with the portal address (if we didn't throw an error).
   */
  public getL2ContractInfo(contractAddress: AztecAddress): Promise<ContractData | undefined> {
    for (const block of this.l2Blocks) {
      for (const contractData of block.newContractData) {
        if (contractData.contractAddress.equals(contractAddress)) {
          return Promise.resolve(contractData);
        }
      }
    }
    return Promise.resolve(undefined);
  }

  /**
   * Get basic info for an all L2 contracts deployed in a block.
   * Contains contract address & the ethereum portal address.
   * @param l2BlockNum - Number of the L2 block where contracts were deployed.
   * @returns ContractData with the portal address (if we didn't throw an error).
   */
  public getL2ContractInfoInBlock(l2BlockNum: number): Promise<ContractData[] | undefined> {
    if (l2BlockNum > this.l2Blocks.length) {
      return Promise.resolve([]);
    }
    const block = this.l2Blocks[l2BlockNum];
    return Promise.resolve(block.newContractData);
  }

  /**
   * Gets the number of the latest L2 block processed.
   * @returns The number of the latest L2 block processed.
   */
  public getBlockHeight(): Promise<number> {
    if (this.l2Blocks.length === 0) return Promise.resolve(INITIAL_L2_BLOCK_NUM - 1);
    return Promise.resolve(this.l2Blocks[this.l2Blocks.length - 1].number);
  }

  /**
   * Gets the L2 block number associated with the latest unverified data.
   * @returns The L2 block number associated with the latest unverified data.
   */
  public getLatestUnverifiedDataBlockNum(): Promise<number> {
    if (this.unverifiedData.length === 0) return Promise.resolve(INITIAL_L2_BLOCK_NUM - 1);
    return Promise.resolve(this.unverifiedData.length + INITIAL_L2_BLOCK_NUM - 1);
  }

  /**
   * Gets the length of L2 blocks in store.
   * @returns The length of L2 Blocks array.
   */
  public getBlocksLength(): number {
    return this.l2Blocks.length;
  }
}
