import { Fr } from '@aztec/foundation/fields';
import { L1ToL2Message } from '@aztec/types';

/**
 * A simple in-memory implementation of an L1 to L2 message store
 * that handles message duplication.
 */
export class L1ToL2MessageStore {
  /**
   * A map containing the message key to the corresponding L1 to L2
   * messages (and the number of times the message has been seen).
   */
  private store: Map<string, L1ToL2MessageAndCount> = new Map();

  constructor() {}

  addMessage(messageKey: Fr, msg: L1ToL2Message) {
    const messageKeyStr = messageKey.toString();
    if (this.store.has(messageKeyStr)) {
      this.store.get(messageKeyStr)!.count++;
    } else {
      this.store.set(messageKeyStr, { message: msg, count: 1 });
    }
  }

  removeMessage(messageKey: Fr) {
    const messageKeyStr = messageKey.toString();
    if (!this.store.has(messageKeyStr)) {
      return;
    }
    const count = this.store.get(messageKeyStr)!.count;
    if (count > 1) {
      this.store.get(messageKeyStr)!.count--;
    } else {
      this.store.delete(messageKeyStr);
    }
  }

  getMessage(messageKey: Fr): L1ToL2Message | undefined {
    return this.store.get(messageKey.toString())?.message;
  }

  getMessageAndCount(messageKey: Fr): L1ToL2MessageAndCount | undefined {
    return this.store.get(messageKey.toString());
  }

  getMessages(take: number): L1ToL2Message[] {
    if (take < 1) {
      return [];
    }
    // fetch `take` number of messages from the store with the highest fee.
    // Note the store has multiple of the same message. So if a message has count 2, include both of them in the result:
    const messages: L1ToL2Message[] = [];
    const sortedMessages = Array.from(this.store.values()).sort((a, b) => b.message.fee - a.message.fee);
    for (const messageAndCount of sortedMessages) {
      for (let i = 0; i < messageAndCount.count; i++) {
        messages.push(messageAndCount.message);
        if (messages.length === take) {
          return messages;
        }
      }
    }
    return messages;
  }
}

/**
 * Useful to keep track of the number of times a message has been seen.
 */
type L1ToL2MessageAndCount = {
  /**
   * The message.
   */
  message: L1ToL2Message;
  /**
   * The number of times the message has been seen.
   */
  count: number;
};
