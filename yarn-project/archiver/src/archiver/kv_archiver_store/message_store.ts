import { InboxLeaf } from '@aztec/circuit-types';
import { Fr, L1_TO_L2_MSG_SUBTREE_HEIGHT } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { type AztecKVStore, type AztecMap, type AztecSingleton } from '@aztec/kv-store';

import { type DataRetrieval } from '../structs/data_retrieval.js';

/**
 * LMDB implementation of the ArchiverDataStore interface.
 */
export class MessageStore {
  #l1ToL2Messages: AztecMap<string, Buffer>;
  #l1ToL2MessageIndices: AztecMap<string, bigint>;
  #lastSynchedL1Block: AztecSingleton<bigint>;
  #totalMessageCount: AztecSingleton<bigint>;

  #log = createLogger('archiver:message_store');

  #l1ToL2MessagesSubtreeSize = 2 ** L1_TO_L2_MSG_SUBTREE_HEIGHT;

  constructor(private db: AztecKVStore) {
    this.#l1ToL2Messages = db.openMap('archiver_l1_to_l2_messages');
    this.#l1ToL2MessageIndices = db.openMap('archiver_l1_to_l2_message_indices');
    this.#lastSynchedL1Block = db.openSingleton('archiver_last_l1_block_new_messages');
    this.#totalMessageCount = db.openSingleton('archiver_l1_to_l2_message_count');
  }

  getTotalL1ToL2MessageCount(): bigint {
    return this.#totalMessageCount.get() ?? 0n;
  }

  /**
   * Gets the last L1 block number that emitted new messages.
   * @returns The last L1 block number processed
   */
  getSynchedL1BlockNumber(): bigint | undefined {
    return this.#lastSynchedL1Block.get();
  }

  setSynchedL1BlockNumber(l1BlockNumber: bigint) {
    void this.#lastSynchedL1Block.set(l1BlockNumber);
  }

  /**
   * Append L1 to L2 messages to the store.
   * @param messages - The L1 to L2 messages to be added to the store and the last processed L1 block.
   * @returns True if the operation is successful.
   */
  addL1ToL2Messages(messages: DataRetrieval<InboxLeaf>): Promise<boolean> {
    return this.db.transaction(() => {
      const lastL1BlockNumber = this.#lastSynchedL1Block.get() ?? 0n;
      if (lastL1BlockNumber >= messages.lastProcessedL1BlockNumber) {
        return false;
      }

      void this.#lastSynchedL1Block.set(messages.lastProcessedL1BlockNumber);

      for (const message of messages.retrievedData) {
        const key = `${message.index}`;
        void this.#l1ToL2Messages.set(key, message.leaf.toBuffer());
        void this.#l1ToL2MessageIndices.set(message.leaf.toString(), message.index);
      }

      const lastTotalMessageCount = this.getTotalL1ToL2MessageCount();
      void this.#totalMessageCount.set(lastTotalMessageCount + BigInt(messages.retrievedData.length));

      return true;
    });
  }

  /**
   * Gets the L1 to L2 message index in the L1 to L2 message tree.
   * @param l1ToL2Message - The L1 to L2 message.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    return Promise.resolve(this.#l1ToL2MessageIndices.get(l1ToL2Message.toString()));
  }

  getL1ToL2Messages(blockNumber: bigint): Fr[] {
    const messages: Fr[] = [];
    let undefinedMessageFound = false;
    const startIndex = Number(InboxLeaf.smallestIndexFromL2Block(blockNumber));
    for (let i = startIndex; i < startIndex + this.#l1ToL2MessagesSubtreeSize; i++) {
      // This is inefficient but probably fine for now.
      const key = `${i}`;
      const message = this.#l1ToL2Messages.get(key);
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
}
