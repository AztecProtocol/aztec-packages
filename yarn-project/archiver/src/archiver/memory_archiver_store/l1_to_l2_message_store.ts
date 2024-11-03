import { InboxLeaf } from '@aztec/circuit-types';
import { L1_TO_L2_MSG_SUBTREE_HEIGHT } from '@aztec/circuits.js/constants';
import { type Fr } from '@aztec/foundation/fields';

/**
 * A simple in-memory implementation of an L1 to L2 message store.
 */
export class L1ToL2MessageStore {
  /**
   * A map pointing from a key in a "messageIndex" format to the corresponding L1 to L2 message hash.
   */
  protected store: Map<string, Fr> = new Map();

  #l1ToL2MessagesSubtreeSize = 2 ** L1_TO_L2_MSG_SUBTREE_HEIGHT;

  constructor() {}

  getTotalL1ToL2MessageCount(): bigint {
    return BigInt(this.store.size);
  }

  addMessage(message: InboxLeaf) {
    this.store.set(`${message.index}`, message.leaf);
  }

  getMessages(blockNumber: bigint): Fr[] {
    const messages: Fr[] = [];
    let undefinedMessageFound = false;
    const startIndex = Number(InboxLeaf.smallestIndexFromL2Block(blockNumber));

    for (let i = startIndex; i < startIndex + this.#l1ToL2MessagesSubtreeSize; i++) {
      // This is inefficient but probably fine for now.
      const message = this.store.get(`${i}`);
      if (message) {
        if (undefinedMessageFound) {
          throw new Error(`L1 to L2 message gap found in block ${blockNumber}`);
        }
        messages.push(message);
      } else {
        undefinedMessageFound = true;
        // We continue iterating over messages here to verify that there are no more messages after the undefined one.
        // --> If this was the case this would imply there is some issue with log fetching.
      }
    }
    return messages;
  }

  /**
   * Gets the L1 to L2 message index in the L1 to L2 message tree.
   * @param l1ToL2Message - The L1 to L2 message.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  getMessageIndex(l1ToL2Message: Fr): bigint | undefined {
    for (const [key, message] of this.store.entries()) {
      if (message.equals(l1ToL2Message)) {
        return BigInt(key);
      }
    }
    return undefined;
  }
}
