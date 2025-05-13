import { L1_TO_L2_MSG_SUBTREE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncSingleton } from '@aztec/kv-store';
import { InboxLeaf } from '@aztec/stdlib/messaging';

import type { DataRetrieval } from '../structs/data_retrieval.js';

/**
 * LMDB implementation of the ArchiverDataStore interface.
 */
export class MessageStore {
  #l1ToL2Messages: AztecAsyncMap<string, Buffer>;
  #l1ToL2MessageIndices: AztecAsyncMap<string, bigint>;
  #lastSynchedL1Block: AztecAsyncSingleton<bigint>;
  #totalMessageCount: AztecAsyncSingleton<bigint>;

  #log = createLogger('archiver:message_store');

  #l1ToL2MessagesSubtreeSize = 2 ** L1_TO_L2_MSG_SUBTREE_HEIGHT;

  constructor(private db: AztecAsyncKVStore) {
    this.#l1ToL2Messages = db.openMap('archiver_l1_to_l2_messages');
    this.#l1ToL2MessageIndices = db.openMap('archiver_l1_to_l2_message_indices');
    this.#lastSynchedL1Block = db.openSingleton('archiver_last_l1_block_new_messages');
    this.#totalMessageCount = db.openSingleton('archiver_l1_to_l2_message_count');
  }

  async getTotalL1ToL2MessageCount(): Promise<bigint> {
    return (await this.#totalMessageCount.getAsync()) ?? 0n;
  }

  /**
   * Gets the last L1 block number that emitted new messages.
   * @returns The last L1 block number processed
   */
  getSynchedL1BlockNumber(): Promise<bigint | undefined> {
    return this.#lastSynchedL1Block.getAsync();
  }

  async setSynchedL1BlockNumber(l1BlockNumber: bigint): Promise<void> {
    await this.#lastSynchedL1Block.set(l1BlockNumber);
  }

  /**
   * Append L1 to L2 messages to the store.
   * @param messages - The L1 to L2 messages to be added to the store and the last processed L1 block.
   * @returns True if the operation is successful.
   */
  addL1ToL2Messages(messages: DataRetrieval<InboxLeaf>): Promise<boolean> {
    return this.db.transactionAsync(async () => {
      const lastL1BlockNumber = (await this.#lastSynchedL1Block.getAsync()) ?? 0n;
      if (lastL1BlockNumber >= messages.lastProcessedL1BlockNumber) {
        return false;
      }

      await this.#lastSynchedL1Block.set(messages.lastProcessedL1BlockNumber);

      for (const message of messages.retrievedData) {
        const key = `${message.index}`;
        await this.#l1ToL2Messages.set(key, message.leaf.toBuffer());
        await this.#l1ToL2MessageIndices.set(message.leaf.toString(), message.index);
      }

      const lastTotalMessageCount = await this.getTotalL1ToL2MessageCount();
      await this.#totalMessageCount.set(lastTotalMessageCount + BigInt(messages.retrievedData.length));

      return true;
    });
  }

  /**
   * Gets the L1 to L2 message index in the L1 to L2 message tree.
   * @param l1ToL2Message - The L1 to L2 message.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    return this.#l1ToL2MessageIndices.getAsync(l1ToL2Message.toString());
  }

  async getL1ToL2Messages(blockNumber: bigint): Promise<Fr[]> {
    const messages: Fr[] = [];
    let undefinedMessageFound = false;
    const startIndex = Number(InboxLeaf.smallestIndexFromL2Block(blockNumber));
    for (let i = startIndex; i < startIndex + this.#l1ToL2MessagesSubtreeSize; i++) {
      // This is inefficient but probably fine for now.
      const key = `${i}`;
      const message = await this.#l1ToL2Messages.getAsync(key);
      if (message) {
        if (undefinedMessageFound) {
          throw new Error(`L1 to L2 message gap found in block ${blockNumber}`);
        }
        messages.push(Fr.fromBuffer(message));
      } else {
        undefinedMessageFound = true;
        // We continue iterating over messages here to verify that there are no more messages after the undefined one.
        // --> If this was the case this would imply there is some issue with log fetching.
      }
    }
    return messages;
  }

  public async rollbackL1ToL2MessagesToL2Block(targetBlockNumber: bigint, currentBlock: bigint): Promise<void> {
    if (currentBlock <= targetBlockNumber) {
      this.#log.warn(
        `Skipping rollback of L1 to L2 messages as current block ${currentBlock} is not greater than target block ${targetBlockNumber}`,
      );
      return;
    }

    // Since the key for l1ToL2Messages is a string instead of a number, we cannot properly iterate over them in
    // order with a cursor, since eg message 4 would come in between messages 39 and 40. So we need to manually
    // iterate over all the expect indices.
    for (let i = targetBlockNumber + 1n; i <= currentBlock; i++) {
      const startIndex = Number(InboxLeaf.smallestIndexFromL2Block(i));
      for (let i = startIndex; i < startIndex + this.#l1ToL2MessagesSubtreeSize; i++) {
        const key = `${i}`;
        const msg = await this.#l1ToL2Messages.getAsync(key);
        if (msg) {
          this.#log.trace(`Deleting L1 to L2 message with index ${key} from the store`);
          await this.#l1ToL2Messages.delete(key);
          await this.#l1ToL2MessageIndices.delete(Fr.fromBuffer(msg).toString());
        }
      }
    }
    return;

    // Should we eventually get to change the db schema to use numbers instead of strings, or at least pad them with zeroes,
    // then we should drop the loop above and use the code below instead. That should also let us remove the currentBlock argument.
    const startIndex = Number(InboxLeaf.smallestIndexFromL2Block(targetBlockNumber)) + this.#l1ToL2MessagesSubtreeSize;
    this.#log.debug(`Deleting L1 to L2 messages from index ${startIndex}`);
    for await (const [key, msg] of this.#l1ToL2Messages.entriesAsync({ start: `${startIndex}` })) {
      this.#log.trace(`Deleting L1 to L2 message with index ${key} from the store`);
      await this.#l1ToL2Messages.delete(key);
      await this.#l1ToL2MessageIndices.delete(Fr.fromBuffer(msg).toString());
    }
  }
}
