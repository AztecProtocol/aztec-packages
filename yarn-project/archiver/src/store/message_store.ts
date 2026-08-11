import type { L1BlockId } from '@aztec/ethereum/l1-types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
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
import { InboxLeaf } from '@aztec/stdlib/messaging';

import { L1ToL2MessagesNotReadyError } from '../errors.js';
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
  /** Stores the checkpoint number whose message tree is currently being filled on L1. */
  #inboxTreeInProgress: AztecAsyncSingleton<bigint>;
  /** Stores the L1 finalized block as of the last successful message sync. */
  #messagesFinalizedL1Block: AztecAsyncSingleton<Buffer>;
  /** Highest checkpoint whose messages were replicated from an upstream node. Only written by the RPC-sync archiver. */
  #messagesSyncedToCheckpoint: AztecAsyncSingleton<number>;

  #log = createLogger('archiver:message_store');

  constructor(private db: AztecAsyncKVStore) {
    this.#l1ToL2Messages = db.openMap('archiver_l1_to_l2_messages');
    this.#l1ToL2MessageIndices = db.openMap('archiver_l1_to_l2_message_indices');
    this.#lastSynchedL1Block = db.openSingleton('archiver_last_l1_block_id');
    this.#totalMessageCount = db.openSingleton('archiver_l1_to_l2_message_count');
    this.#inboxTreeInProgress = db.openSingleton('archiver_inbox_tree_in_progress');
    this.#messagesFinalizedL1Block = db.openSingleton('archiver_messages_finalized_l1_block');
    this.#messagesSyncedToCheckpoint = db.openSingleton('archiver_messages_synced_to_checkpoint');
  }

  /**
   * Highest checkpoint whose L1-to-L2 messages have been replicated from an upstream node, or 0 if none.
   * Used by the RPC-sync archiver as its replication cursor: unlike the L1 sync point, it distinguishes
   * "checkpoint fetched and it had no messages" from "checkpoint never fetched". When the cursor was never
   * written (a store bootstrapped by an L1-syncing archiver, e.g. from a snapshot) it is derived from what that
   * archiver left behind, so the follower does not re-fetch the whole message history.
   */
  public async getMessagesSyncedToCheckpoint(): Promise<CheckpointNumber> {
    const stored = await this.#messagesSyncedToCheckpoint.getAsync();
    if (stored !== undefined) {
      return CheckpointNumber(stored);
    }
    const treeInProgress = await this.#inboxTreeInProgress.getAsync();
    if (treeInProgress !== undefined) {
      // The tree in progress is not sealed on L1 yet, so its leaves may be an incomplete prefix no matter how
      // many of them are stored. The last checkpoint known to be complete is therefore the one before it, and
      // the follower re-fetches the in-progress one from its upstream.
      return CheckpointNumber(Math.max(Number(treeInProgress) - 1, 0));
    }
    const lastMessage = await this.getLastMessage();
    return lastMessage?.checkpointNumber ?? CheckpointNumber.ZERO;
  }

  /**
   * Persists the L1-to-L2 message leaves of a single checkpoint as reported by an upstream node, reconstructing
   * the index and rolling-hash bookkeeping that an L1-syncing archiver would have read from the inbox. Callers
   * must supply checkpoints in ascending order with no gaps, otherwise the reconstructed rolling hash diverges
   * from the canonical one and the insert is rejected. Leaves, cursor and tree-in-progress marker are written
   * atomically, so an interrupted replication never leaves the cursor ahead of the messages it points at.
   * @param checkpointNumber - Checkpoint the leaves belong to.
   * @param leaves - Message leaves for the checkpoint, in insertion order.
   */
  public addL1ToL2MessagesForCheckpoint(checkpointNumber: CheckpointNumber, leaves: Fr[]): Promise<void> {
    return this.db.transactionAsync(async () => {
      const startIndex = InboxLeaf.smallestIndexForCheckpoint(checkpointNumber);

      // A store bootstrapped from a snapshot can already hold a partially filled tree for this checkpoint (the
      // tree the upstream was still filling when the snapshot was taken). Drop those leaves so the rolling hash
      // is rebuilt from the last message of the preceding checkpoint instead of from a partial prefix of this one.
      const stale = await this.getLastMessage();
      if (stale && stale.index >= startIndex) {
        this.#log.debug(`Dropping partial message tree for checkpoint ${checkpointNumber} before replicating it`);
        await this.removeL1ToL2Messages(startIndex);
      }

      const lastMessage = await this.getLastMessage();
      let rollingHash = lastMessage?.rollingHash ?? Buffer16.ZERO;
      const messages: InboxMessage[] = [];
      for (const [position, leaf] of leaves.entries()) {
        rollingHash = updateRollingHash(rollingHash, leaf);
        messages.push({
          index: startIndex + BigInt(position),
          leaf,
          checkpointNumber,
          // The follower never reads the inbox, so it has no L1 provenance for these messages.
          l1BlockNumber: 0n,
          l1BlockHash: Buffer32.ZERO,
          rollingHash,
        });
      }
      await this.addL1ToL2Messages(messages);
      await this.#messagesSyncedToCheckpoint.set(checkpointNumber);
      // The follower has no inbox to read, so it maintains the tree-in-progress marker itself: every checkpoint
      // up to and including this one is now complete, so the tree still being filled is the next one. Without
      // this, a store inherited from an L1-syncing archiver would keep that archiver's frozen marker and
      // `getL1ToL2Messages` would reject every checkpoint at or above it forever.
      await this.#inboxTreeInProgress.set(BigInt(checkpointNumber) + 1n);
    });
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

        // Check index corresponds to the checkpoint number.
        const [expectedStart, expectedEnd] = InboxLeaf.indexRangeForCheckpoint(message.checkpointNumber);
        if (message.index < expectedStart || message.index >= expectedEnd) {
          throw new MessageStoreError(
            `Invalid index ${message.index} for incoming L1 to L2 message ${message.leaf.toString()} ` +
              `at checkpoint ${message.checkpointNumber} (expected value in range [${expectedStart}, ${expectedEnd}))`,
            message,
          );
        }

        // Check there are no gaps in the indices within the same checkpoint.
        if (
          lastMessage &&
          message.checkpointNumber === lastMessage.checkpointNumber &&
          message.index !== lastMessage.index + 1n
        ) {
          throw new MessageStoreError(
            `Missing prior message for incoming L1 to L2 message ${message.leaf.toString()} ` +
              `with index ${message.index}`,
            message,
          );
        }

        // Check the first message in a checkpoint has the correct index.
        if (
          (!lastMessage || message.checkpointNumber > lastMessage.checkpointNumber) &&
          message.index !== expectedStart
        ) {
          throw new MessageStoreError(
            `Message ${message.leaf.toString()} for checkpoint ${message.checkpointNumber} has wrong index ` +
              `${message.index} (expected ${expectedStart})`,
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

  /** Returns the inbox tree-in-progress checkpoint number from L1, or undefined if not yet set. */
  public getInboxTreeInProgress(): Promise<bigint | undefined> {
    return this.#inboxTreeInProgress.getAsync();
  }

  /**
   * Atomically updates the message sync state: the L1 sync point, the inbox tree-in-progress marker, and
   * (optionally) the L1 finalized block as of this sync. The finalized block is advanced monotonically.
   */
  public setMessageSyncState(
    l1Block: L1BlockId,
    treeInProgress: bigint | undefined,
    finalizedL1Block?: L1BlockId,
  ): Promise<void> {
    return this.db.transactionAsync(async () => {
      await this.setSynchedL1Block(l1Block);
      if (treeInProgress !== undefined) {
        await this.#inboxTreeInProgress.set(treeInProgress);
      } else {
        await this.#inboxTreeInProgress.delete();
      }
      if (finalizedL1Block !== undefined) {
        await this.maybeAdvanceFinalizedL1Block(finalizedL1Block);
      }
    });
  }

  public async getL1ToL2Messages(checkpointNumber: CheckpointNumber): Promise<Fr[]> {
    const treeInProgress = await this.#inboxTreeInProgress.getAsync();
    if (treeInProgress !== undefined && BigInt(checkpointNumber) >= treeInProgress) {
      throw new L1ToL2MessagesNotReadyError(checkpointNumber, treeInProgress);
    }

    const messages: Fr[] = [];

    const [startIndex, endIndex] = InboxLeaf.indexRangeForCheckpoint(checkpointNumber);
    let lastIndex = startIndex - 1n;

    for await (const msgBuffer of this.#l1ToL2Messages.valuesAsync({
      start: this.indexToKey(startIndex),
      end: this.indexToKey(endIndex),
    })) {
      const msg = deserializeInboxMessage(msgBuffer);
      if (msg.checkpointNumber !== checkpointNumber) {
        throw new Error(
          `L1 to L2 message with index ${msg.index} has invalid checkpoint number ${msg.checkpointNumber}`,
        );
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
      if (deleteCount > 0) {
        this.#log.warn(`Deleted ${deleteCount} L1 to L2 messages from index ${startIndex} from the store`);
      }
    });
  }

  /**
   * Deletes every L1-to-L2 message above `targetCheckpointNumber` and, on a follower store, rewinds the
   * replication cursor and tree-in-progress marker along with them, atomically: a crash between the deletion and
   * the cursor write would otherwise leave the cursor claiming messages that are no longer there.
   */
  public rollbackL1ToL2MessagesToCheckpoint(targetCheckpointNumber: CheckpointNumber): Promise<void> {
    this.#log.debug(`Deleting L1 to L2 messages up to target checkpoint ${targetCheckpointNumber}`);
    const startIndex = InboxLeaf.smallestIndexForCheckpoint(CheckpointNumber(targetCheckpointNumber + 1));
    return this.db.transactionAsync(async () => {
      await this.removeL1ToL2Messages(startIndex);
      // Keep the replication cursor consistent with what is left in the store, so a follower re-fetches the
      // messages of any checkpoint it rolled back. Only touched when the cursor exists, i.e. on a follower store:
      // an L1-syncing archiver owns the marker itself and reads it back from the inbox contract.
      const syncedTo = await this.#messagesSyncedToCheckpoint.getAsync();
      if (syncedTo !== undefined && syncedTo > targetCheckpointNumber) {
        await this.#messagesSyncedToCheckpoint.set(targetCheckpointNumber);
        await this.#inboxTreeInProgress.set(BigInt(targetCheckpointNumber) + 1n);
      }
    });
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
