import type { L1BlockId } from '@aztec/ethereum';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import {
  type AztecAsyncKVStore,
  type AztecAsyncMap,
  type AztecAsyncSingleton,
  type CustomRange,
  mapRange,
} from '@aztec/kv-store';
import { InboxLeaf } from '@aztec/stdlib/messaging';

import {
  type InboxMessage,
  deserializeInboxMessage,
  serializeInboxMessage,
  updateRollingHash,
} from '../structs/inbox_message.js';

export class MessageStoreError extends Error {
  constructor(
    message: string,
    public readonly inboxMessage: InboxMessage,
  ) {
    super(message);
    this.name = 'MessageStoreError';
  }
}

export class MessageStore {
  /** Maps from message index to serialized InboxMessage */
  #l1ToL2Messages: AztecAsyncMap<number, Buffer>;
  /** Maps from hex-stringified message leaf to its index */
  #l1ToL2MessageIndices: AztecAsyncMap<string, bigint>;
  /** Stores L1 block number and hash of the L1 synchpoint */
  #lastSynchedL1Block: AztecAsyncSingleton<Buffer>;
  /** Stores total messages stored */
  #totalMessageCount: AztecAsyncSingleton<bigint>;

  #log = createLogger('archiver:message_store');

  constructor(private db: AztecAsyncKVStore) {
    this.#l1ToL2Messages = db.openMap('archiver_l1_to_l2_messages');
    this.#l1ToL2MessageIndices = db.openMap('archiver_l1_to_l2_message_indices');
    this.#lastSynchedL1Block = db.openSingleton('archiver_last_l1_block_id');
    this.#totalMessageCount = db.openSingleton('archiver_l1_to_l2_message_count');
  }

  public async getTotalL1ToL2MessageCount(): Promise<bigint> {
    return (await this.#totalMessageCount.getAsync()) ?? 0n;
  }

  /** Gets the last L1 block synced. */
  public async getSynchedL1Block(): Promise<L1BlockId | undefined> {
    const buffer = await this.#lastSynchedL1Block.getAsync();
    if (!buffer) {
      return undefined;
    }

    const reader = BufferReader.asReader(buffer);
    return { l1BlockNumber: reader.readUInt256(), l1BlockHash: Buffer32.fromBuffer(reader.readBytes(Buffer32.SIZE)) };
  }

  /** Sets the last L1 block synced */
  public async setSynchedL1Block(l1Block: L1BlockId): Promise<void> {
    const buffer = serializeToBuffer([l1Block.l1BlockNumber, l1Block.l1BlockHash]);
    await this.#lastSynchedL1Block.set(buffer);
  }

  /**
   * Append L1 to L2 messages to the store.
   * Requires new messages to be in order and strictly after the last message added.
   * Throws if out of order messages are added or if the rolling hash is invalid.
   */
  public addL1ToL2Messages(messages: InboxMessage[]): Promise<void> {
    if (messages.length === 0) {
      return Promise.resolve();
    }

    return this.db.transactionAsync(async () => {
      let lastMessage = await this.getLastMessage();
      let messageCount = 0;

      for (const message of messages) {
        // Check messages are inserted in increasing order, but allow reinserting messages.
        if (lastMessage && message.index <= lastMessage.index) {
          const existing = await this.#l1ToL2Messages.getAsync(this.indexToKey(message.index));
          if (existing && deserializeInboxMessage(existing).rollingHash.equals(message.rollingHash)) {
            // We reinsert instead of skipping in case the message was re-orged and got added in a different L1 block.
            this.#log.trace(`Reinserting message with index ${message.index} in the store`);
            await this.#l1ToL2Messages.set(this.indexToKey(message.index), serializeInboxMessage(message));
            continue;
          }

          throw new MessageStoreError(
            `Cannot insert L1 to L2 message with index ${message.index} before last message with index ${lastMessage.index}`,
            message,
          );
        }

        // Check rolling hash is valid.
        const previousRollingHash = lastMessage?.rollingHash ?? Buffer16.ZERO;
        const expectedRollingHash = updateRollingHash(previousRollingHash, message.leaf);
        if (!expectedRollingHash.equals(message.rollingHash)) {
          throw new MessageStoreError(
            `Invalid rolling hash for incoming L1 to L2 message ${message.leaf.toString()} ` +
              `with index ${message.index} ` +
              `(expected ${expectedRollingHash.toString()} from previous hash ${previousRollingHash} but got ${message.rollingHash.toString()})`,
            message,
          );
        }

        // Check index corresponds to the L2 block number.
        const [expectedStart, expectedEnd] = InboxLeaf.indexRangeFromL2Block(message.l2BlockNumber);
        if (message.index < expectedStart || message.index >= expectedEnd) {
          throw new MessageStoreError(
            `Invalid index ${message.index} for incoming L1 to L2 message ${message.leaf.toString()} ` +
              `at block ${message.l2BlockNumber} (expected value in range [${expectedStart}, ${expectedEnd}))`,
            message,
          );
        }

        // Check there are no gaps in the indices within the same block.
        if (
          lastMessage &&
          message.l2BlockNumber === lastMessage.l2BlockNumber &&
          message.index !== lastMessage.index + 1n
        ) {
          throw new MessageStoreError(
            `Missing prior message for incoming L1 to L2 message ${message.leaf.toString()} ` +
              `with index ${message.index}`,
            message,
          );
        }

        // Check the first message in a block has the correct index.
        if (
          (!lastMessage || message.l2BlockNumber > lastMessage.l2BlockNumber) &&
          message.index !== InboxLeaf.smallestIndexFromL2Block(message.l2BlockNumber)
        ) {
          throw new MessageStoreError(
            `Message ${message.leaf.toString()} for L2 block ${message.l2BlockNumber} has wrong index ` +
              `${message.index} (expected ${InboxLeaf.smallestIndexFromL2Block(message.l2BlockNumber)})`,
            message,
          );
        }

        // Perform the insertions.
        await this.#l1ToL2Messages.set(this.indexToKey(message.index), serializeInboxMessage(message));
        await this.#l1ToL2MessageIndices.set(this.leafToIndexKey(message.leaf), message.index);
        messageCount++;
        this.#log.trace(`Inserted L1 to L2 message ${message.leaf} with index ${message.index} into the store`);
        lastMessage = message;
      }

      // Update the L1 sync point to that of the last message added.
      const currentSyncPoint = await this.getSynchedL1Block();
      if (!currentSyncPoint || currentSyncPoint.l1BlockNumber < lastMessage!.l1BlockNumber) {
        await this.setSynchedL1Block({
          l1BlockNumber: lastMessage!.l1BlockNumber,
          l1BlockHash: lastMessage!.l1BlockHash,
        });
      }

      // Update total message count with the number of inserted messages.
      await this.increaseTotalMessageCount(messageCount);
    });
  }

  /**
   * Gets the L1 to L2 message index in the L1 to L2 message tree.
   * @param l1ToL2Message - The L1 to L2 message.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  public getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined> {
    return this.#l1ToL2MessageIndices.getAsync(this.leafToIndexKey(l1ToL2Message));
  }

  public async getLastMessage(): Promise<InboxMessage | undefined> {
    const [msg] = await toArray(this.#l1ToL2Messages.valuesAsync({ reverse: true, limit: 1 }));
    return msg ? deserializeInboxMessage(msg) : undefined;
  }

  public async getL1ToL2Messages(blockNumber: bigint): Promise<Fr[]> {
    const messages: Fr[] = [];

    const [startIndex, endIndex] = InboxLeaf.indexRangeFromL2Block(blockNumber);
    let lastIndex = startIndex - 1n;

    for await (const msgBuffer of this.#l1ToL2Messages.valuesAsync({
      start: this.indexToKey(startIndex),
      end: this.indexToKey(endIndex),
    })) {
      const msg = deserializeInboxMessage(msgBuffer);
      if (msg.l2BlockNumber !== blockNumber) {
        throw new Error(`L1 to L2 message with index ${msg.index} has invalid block number ${msg.l2BlockNumber}`);
      } else if (msg.index !== lastIndex + 1n) {
        throw new Error(`Expected L1 to L2 message with index ${lastIndex + 1n} but got ${msg.index}`);
      }
      lastIndex = msg.index;
      messages.push(msg.leaf);
    }

    return messages;
  }

  public async *iterateL1ToL2Messages(range: CustomRange<bigint> = {}): AsyncIterableIterator<InboxMessage> {
    const entriesRange = mapRange(range, this.indexToKey);
    for await (const msgBuffer of this.#l1ToL2Messages.valuesAsync(entriesRange)) {
      yield deserializeInboxMessage(msgBuffer);
    }
  }

  public removeL1ToL2Messages(startIndex: bigint): Promise<void> {
    this.#log.debug(`Deleting L1 to L2 messages from index ${startIndex}`);
    let deleteCount = 0;

    return this.db.transactionAsync(async () => {
      for await (const [key, msgBuffer] of this.#l1ToL2Messages.entriesAsync({
        start: this.indexToKey(startIndex),
      })) {
        this.#log.trace(`Deleting L1 to L2 message with index ${key - 1} from the store`);
        await this.#l1ToL2Messages.delete(key);
        await this.#l1ToL2MessageIndices.delete(this.leafToIndexKey(deserializeInboxMessage(msgBuffer).leaf));
        deleteCount++;
      }
      await this.increaseTotalMessageCount(-deleteCount);
      this.#log.warn(`Deleted ${deleteCount} L1 to L2 messages from index ${startIndex} from the store`);
    });
  }

  public rollbackL1ToL2MessagesToL2Block(targetBlockNumber: bigint): Promise<void> {
    this.#log.debug(`Deleting L1 to L2 messages up to target L2 block ${targetBlockNumber}`);
    const startIndex = InboxLeaf.smallestIndexFromL2Block(targetBlockNumber + 1n);
    return this.removeL1ToL2Messages(startIndex);
  }

  private indexToKey(index: bigint): number {
    return Number(index);
  }

  private leafToIndexKey(leaf: Fr): string {
    return leaf.toString();
  }

  private async increaseTotalMessageCount(count: bigint | number): Promise<void> {
    if (count === 0) {
      return;
    }
    return await this.db.transactionAsync(async () => {
      const lastTotalMessageCount = await this.getTotalL1ToL2MessageCount();
      await this.#totalMessageCount.set(lastTotalMessageCount + BigInt(count));
    });
  }
}
