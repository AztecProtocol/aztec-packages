import type { L1BlockId } from '@aztec/ethereum/l1-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
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
import { type InboxMessagePosition, type InboxMessageRange, updateInboxRollingHash } from '@aztec/stdlib/messaging';

import { InboxMessageRangeNotSyncedError } from '../errors.js';
import { type InboxMessage, deserializeInboxMessage, serializeInboxMessage } from '../structs/inbox_message.js';

/**
 * The position before any message: zero count and zero rolling hash, mirroring the on-chain Inbox base case. Built
 * fresh on every call because positions are plain mutable objects handed out to callers.
 */
function zeroMessagePosition(): InboxMessagePosition {
  return { totalMessageCount: 0n, rollingHash: Fr.ZERO };
}

/** Rejects reversed or negative compact leaf count bounds, which are caller errors rather than sync state. */
function assertValidLeafCountRange(startLeafCount: bigint, endLeafCount: bigint): void {
  if (startLeafCount < 0n || endLeafCount < 0n || startLeafCount > endLeafCount) {
    throw new Error(`Invalid Inbox leaf count range [${startLeafCount}, ${endLeafCount})`);
  }
}

export class MessageStoreError extends Error {
  constructor(
    message: string,
    public readonly inboxMessage: InboxMessage,
  ) {
    super(message);
    this.name = 'MessageStoreError';
  }
}

/** The L1 sync state a batch of messages is committed together with. */
export type MessageSyncState = {
  /** The L1 block through which the Inbox has been synced once the batch is stored. */
  l1Block: L1BlockId;
  /** The L1 finalized block as of this sync, advanced monotonically. */
  finalizedL1Block?: L1BlockId;
};

/**
 * The ordered Inbox message log: one row per message at its compact index, holding the leaf, the cumulative rolling
 * hash and the L1 block the message was observed in. Positions and count ranges derive from the rows alone; no
 * record of L1's bucket partition is kept, since blocks consume message prefixes and only a completed checkpoint's
 * final position has to be a live bucket end, which the proposer resolves against L1 at publication time.
 */
export class MessageStore {
  /** Maps from message index to serialized InboxMessage */
  #l1ToL2Messages: AztecAsyncMap<number, Buffer>;
  /** Maps from hex-stringified message leaf to its index */
  #l1ToL2MessageIndices: AztecAsyncMap<string, bigint>;
  /** Stores L1 block number and hash of the L1 synchpoint */
  #lastSynchedL1Block: AztecAsyncSingleton<Buffer>;
  /** Stores total messages stored */
  #totalMessageCount: AztecAsyncSingleton<bigint>;
  /** Stores the L1 finalized block as of the last successful message sync. */
  #messagesFinalizedL1Block: AztecAsyncSingleton<Buffer>;

  #log = createLogger('archiver:message_store');

  constructor(private db: AztecAsyncKVStore) {
    this.#l1ToL2Messages = db.openMap('archiver_l1_to_l2_messages');
    this.#l1ToL2MessageIndices = db.openMap('archiver_l1_to_l2_message_indices');
    this.#lastSynchedL1Block = db.openSingleton('archiver_last_l1_block_id');
    this.#totalMessageCount = db.openSingleton('archiver_l1_to_l2_message_count');
    this.#messagesFinalizedL1Block = db.openSingleton('archiver_messages_finalized_l1_block');
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

  /** Gets the L1 finalized block as of the last successful message sync. */
  public async getMessagesFinalizedL1Block(): Promise<L1BlockId | undefined> {
    const buffer = await this.#messagesFinalizedL1Block.getAsync();
    if (!buffer) {
      return undefined;
    }
    const reader = BufferReader.asReader(buffer);
    return { l1BlockNumber: reader.readUInt256(), l1BlockHash: Buffer32.fromBuffer(reader.readBytes(Buffer32.SIZE)) };
  }

  /** Monotonically advances the persisted L1 finalized block for message sync. Never regresses. */
  private async maybeAdvanceFinalizedL1Block(l1Block: L1BlockId): Promise<void> {
    const existing = await this.getMessagesFinalizedL1Block();
    if (existing && l1Block.l1BlockNumber <= existing.l1BlockNumber) {
      return;
    }
    const buffer = serializeToBuffer([l1Block.l1BlockNumber, l1Block.l1BlockHash]);
    await this.#messagesFinalizedL1Block.set(buffer);
  }

  /**
   * Atomically updates the message sync state: the L1 sync point and (optionally) the L1 finalized block as of this
   * sync. The finalized block is advanced monotonically.
   */
  public setMessageSyncState(l1Block: L1BlockId, finalizedL1Block?: L1BlockId): Promise<void> {
    return this.db.transactionAsync(async () => {
      await this.setSynchedL1Block(l1Block);
      if (finalizedL1Block !== undefined) {
        await this.maybeAdvanceFinalizedL1Block(finalizedL1Block);
      }
    });
  }

  /**
   * Appends L1 to L2 messages to the store, optionally committing the L1 sync state they were retrieved through in
   * the same transaction, so a batch and the sync point that covers it either both land or neither does.
   *
   * Requires messages to be ordered by index and to continue the stored chain: each index is one past the previous
   * one and each rolling hash extends the previous one by the message's leaf. A message the store already holds with
   * the same rolling hash is rewritten in place, so a re-sync after an L1 reorg that re-mined the same messages in
   * other L1 blocks refreshes their L1 block hints. Throws a `MessageStoreError` if a message arrives out of order,
   * leaves a gap or breaks the rolling hash chain; nothing of the batch is stored in that case.
   */
  public addL1ToL2Messages(messages: InboxMessage[], syncState?: MessageSyncState): Promise<void> {
    if (messages.length === 0 && syncState === undefined) {
      return Promise.resolve();
    }

    return this.db.transactionAsync(async () => {
      let lastMessage = await this.getLastMessage();
      let messageCount = 0;

      for (const message of messages) {
        // Check messages are inserted in increasing order, but allow reinserting messages.
        if (lastMessage && message.index <= lastMessage.index) {
          const existing = await this.getL1ToL2Message(message.index);
          if (existing && existing.inboxRollingHash.equals(message.inboxRollingHash)) {
            this.#log.trace(`Reinserting message with index ${message.index} in the store`);
            await this.#l1ToL2Messages.set(this.indexToKey(message.index), serializeInboxMessage(message));
            continue;
          }

          throw new MessageStoreError(
            `Cannot insert L1 to L2 message with index ${message.index} before last message with index ${lastMessage.index}`,
            message,
          );
        }

        // Check the compact-indexed messages arrive contiguously: the global insertion index of
        // each message is exactly one past the previous one.
        const expectedIndex = lastMessage === undefined ? 0n : lastMessage.index + 1n;
        if (message.index !== expectedIndex) {
          throw new MessageStoreError(
            `Invalid index ${message.index} for incoming L1 to L2 message ${message.leaf.toString()} ` +
              `(expected ${expectedIndex})`,
            message,
          );
        }

        // Check the consensus rolling-hash chain is valid: each message's rolling hash must
        // continue the chain from the previously inserted message.
        const previousInboxRollingHash = lastMessage?.inboxRollingHash ?? Fr.ZERO;
        const expectedInboxRollingHash = updateInboxRollingHash(previousInboxRollingHash, message.leaf);
        if (!expectedInboxRollingHash.equals(message.inboxRollingHash)) {
          throw new MessageStoreError(
            `Invalid inbox rolling hash for incoming L1 to L2 message ${message.leaf.toString()} ` +
              `with index ${message.index} ` +
              `(expected ${expectedInboxRollingHash.toString()} from previous hash ${previousInboxRollingHash.toString()} ` +
              `but got ${message.inboxRollingHash.toString()})`,
            message,
          );
        }

        await this.#l1ToL2Messages.set(this.indexToKey(message.index), serializeInboxMessage(message));
        await this.#l1ToL2MessageIndices.set(this.leafToIndexKey(message.leaf), message.index);
        messageCount++;

        this.#log.trace(`Inserted L1 to L2 message ${message.leaf} with index ${message.index} into the store`);
        lastMessage = message;
      }

      await this.increaseTotalMessageCount(messageCount);

      if (syncState !== undefined) {
        await this.setSynchedL1Block(syncState.l1Block);
        if (syncState.finalizedL1Block !== undefined) {
          await this.maybeAdvanceFinalizedL1Block(syncState.finalizedL1Block);
        }
      }
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

  /** Returns the stored message at the given compact index, if any. */
  public async getL1ToL2Message(index: bigint): Promise<InboxMessage | undefined> {
    const buffer = await this.#l1ToL2Messages.getAsync(this.indexToKey(index));
    return buffer === undefined ? undefined : deserializeInboxMessage(buffer);
  }

  public async getLastMessage(): Promise<InboxMessage | undefined> {
    const [msg] = await toArray(this.#l1ToL2Messages.valuesAsync({ reverse: true, limit: 1 }));
    return msg ? deserializeInboxMessage(msg) : undefined;
  }

  public async *iterateL1ToL2Messages(range: CustomRange<bigint> = {}): AsyncIterableIterator<InboxMessage> {
    const entriesRange = mapRange(range, this.indexToKey);
    for await (const msgBuffer of this.#l1ToL2Messages.valuesAsync(entriesRange)) {
      yield deserializeInboxMessage(msgBuffer);
    }
  }

  /** Removes every stored message from `startIndex` on, so the log ends at `startIndex` messages. */
  public removeL1ToL2Messages(startIndex: bigint): Promise<void> {
    this.#log.debug(`Deleting L1 to L2 messages from index ${startIndex}`);
    let deleteCount = 0;

    return this.db.transactionAsync(async () => {
      for await (const [key, msgBuffer] of this.#l1ToL2Messages.entriesAsync({
        start: this.indexToKey(startIndex),
      })) {
        this.#log.trace(`Deleting L1 to L2 message with index ${key} from the store`);
        await this.#l1ToL2Messages.delete(key);
        await this.#l1ToL2MessageIndices.delete(this.leafToIndexKey(deserializeInboxMessage(msgBuffer).leaf));
        deleteCount++;
      }
      await this.increaseTotalMessageCount(-deleteCount);
      if (deleteCount > 0) {
        this.#log.warn(`Deleted ${deleteCount} L1 to L2 messages from index ${startIndex} from the store`);
      }
    });
  }

  /**
   * Removes every L1 to L2 message observed after the given L1 block, so the message store matches the L1 Inbox state
   * as of that block. Used when rolling the archiver back to an earlier checkpoint, whose L1 block is passed here.
   * Messages are ordered by index and their L1 blocks never decrease along the log, so the cut is found by walking
   * the log backwards to the last message observed at or before the block.
   */
  public async rollbackL1ToL2MessagesAfterL1Block(l1BlockNumber: bigint): Promise<void> {
    this.#log.debug(`Deleting L1 to L2 messages observed after L1 block ${l1BlockNumber}`);
    let removeFromIndex: bigint | undefined;
    for await (const message of this.iterateL1ToL2Messages({ reverse: true })) {
      if (message.l1BlockNumber <= l1BlockNumber) {
        break;
      }
      removeFromIndex = message.index;
    }
    if (removeFromIndex !== undefined) {
      await this.removeL1ToL2Messages(removeFromIndex);
    }
  }

  /**
   * Returns the message leaves in the cumulative Inbox message-count range `[startLeafCount, endLeafCount)`, in
   * insertion order. The bounds are compact L1-to-L2 tree leaf counts, which every block header carries, so consumers
   * can ask for the messages a block or checkpoint consumed without knowing anything about L1's bucket partition.
   * An invalid range, one reaching past the synced tip, or one the store cannot serve whole throws, since a caller
   * asking for a range always expects every message in it.
   */
  public async getL1ToL2MessagesBetweenLeafCounts(startLeafCount: bigint, endLeafCount: bigint): Promise<Fr[]> {
    assertValidLeafCountRange(startLeafCount, endLeafCount);
    // The synced total and the leaves are read together so a concurrent suffix removal cannot land between them and
    // turn a range this store holds whole into a spurious incomplete one.
    return await this.db.transactionAsync(async () => {
      await this.assertLeafCountRangeSynced(startLeafCount, endLeafCount);
      const messages = await this.getMessagesInLeafCountRange(startLeafCount, endLeafCount);
      return messages.map(message => message.leaf);
    });
  }

  /**
   * Returns the position of the Inbox message sequence after `totalMessageCount` messages: that count and the rolling
   * hash over them, which is the rolling hash stored with the message at compact index `totalMessageCount - 1`.
   * Position zero always resolves with a zero hash; a count past the synced tip returns undefined.
   */
  public async getMessagePosition(totalMessageCount: bigint): Promise<InboxMessagePosition | undefined> {
    if (totalMessageCount < 0n) {
      throw new Error(`Invalid Inbox message count ${totalMessageCount}`);
    }
    if (totalMessageCount === 0n) {
      return zeroMessagePosition();
    }
    const message = await this.getL1ToL2Message(totalMessageCount - 1n);
    return message === undefined ? undefined : { totalMessageCount, rollingHash: message.inboxRollingHash };
  }

  /** Returns the position at the synced tip: the total message count and the rolling hash over every stored message. */
  public getSyncedMessagePosition(): Promise<InboxMessagePosition> {
    return this.db.transactionAsync(async () => {
      const syncedTotal = await this.getTotalL1ToL2MessageCount();
      const position = await this.getMessagePosition(syncedTotal);
      if (position === undefined) {
        throw new Error(`Inbox message store holds ${syncedTotal} messages but is missing index ${syncedTotal - 1n}`);
      }
      return position;
    });
  }

  /**
   * Returns the messages in the cumulative Inbox message-count range `[startLeafCount, endLeafCount)` together with
   * the positions at both bounds. Everything is read in one store transaction, so the ending hash authenticates
   * exactly the returned messages appended after the starting position, and a concurrent suffix replacement cannot
   * pair the leaves of one version of the sequence with the hash of another. Follows the range contract of
   * `getL1ToL2MessagesBetweenLeafCounts`, with the starting position also required to be available; an empty range
   * returns equal positions.
   */
  public async getL1ToL2MessageRange(startLeafCount: bigint, endLeafCount: bigint): Promise<InboxMessageRange> {
    assertValidLeafCountRange(startLeafCount, endLeafCount);
    return await this.db.transactionAsync(async () => {
      await this.assertLeafCountRangeSynced(startLeafCount, endLeafCount);
      const start = await this.getMessagePosition(startLeafCount);
      if (start === undefined) {
        throw new InboxMessageRangeNotSyncedError(
          startLeafCount,
          endLeafCount,
          `the store is missing the message at index ${startLeafCount - 1n}`,
        );
      }
      const messages = await this.getMessagesInLeafCountRange(startLeafCount, endLeafCount);
      const lastMessage = messages.at(-1);
      const end =
        lastMessage === undefined
          ? start
          : { totalMessageCount: endLeafCount, rollingHash: lastMessage.inboxRollingHash };
      return { messages: messages.map(message => message.leaf), start, end };
    });
  }

  /** Throws unless every message in `[startLeafCount, endLeafCount)` is within the synced total. Empty ranges included. */
  private async assertLeafCountRangeSynced(startLeafCount: bigint, endLeafCount: bigint): Promise<void> {
    const syncedTotal = await this.getTotalL1ToL2MessageCount();
    if (endLeafCount > syncedTotal) {
      const available = syncedTotal > startLeafCount ? syncedTotal - startLeafCount : 0n;
      throw new InboxMessageRangeNotSyncedError(
        startLeafCount,
        endLeafCount,
        `only ${available} of ${endLeafCount - startLeafCount} messages are synced`,
      );
    }
  }

  /**
   * Reads the messages in the compact index range `[startLeafCount, endLeafCount)`, which the caller has established
   * lies within the synced total. The map holds at most one entry per index, so a short read is the only way a hole
   * inside the range can show up, and the count catches every one of them.
   */
  private async getMessagesInLeafCountRange(startLeafCount: bigint, endLeafCount: bigint): Promise<InboxMessage[]> {
    if (startLeafCount === endLeafCount) {
      return [];
    }
    const messages = await toArray(this.iterateL1ToL2Messages({ start: startLeafCount, end: endLeafCount }));
    if (BigInt(messages.length) !== endLeafCount - startLeafCount) {
      throw new InboxMessageRangeNotSyncedError(
        startLeafCount,
        endLeafCount,
        `the store holds ${messages.length} of ${endLeafCount - startLeafCount} messages`,
      );
    }
    return messages;
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
