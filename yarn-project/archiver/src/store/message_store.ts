import type { L1BlockId } from '@aztec/ethereum/l1-types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, bigintToUInt64BE, numToUInt32BE, serializeToBuffer } from '@aztec/foundation/serialize';
import {
  type AztecAsyncKVStore,
  type AztecAsyncMap,
  type AztecAsyncSingleton,
  type CustomRange,
  mapRange,
} from '@aztec/kv-store';
import { type InboxBucket, InboxLeaf, updateInboxRollingHash } from '@aztec/stdlib/messaging';

import { L1ToL2MessagesNotReadyError } from '../errors.js';
import {
  type InboxMessage,
  deserializeInboxMessage,
  serializeInboxMessage,
  updateRollingHash,
} from '../structs/inbox_message.js';

/**
 * Persisted snapshot of an Inbox rolling-hash bucket. Mirrors the fields the on-chain Inbox tracks per bucket,
 * plus the last absorbed message index so the between-buckets query can range-scan messages directly.
 */
type BucketSnapshot = {
  inboxRollingHash: Fr;
  totalMsgCount: bigint;
  timestamp: bigint;
  msgCount: number;
  lastMessageIndex: bigint;
};

function serializeBucketSnapshot(snapshot: BucketSnapshot): Buffer {
  return serializeToBuffer([
    snapshot.inboxRollingHash,
    bigintToUInt64BE(snapshot.totalMsgCount),
    bigintToUInt64BE(snapshot.timestamp),
    numToUInt32BE(snapshot.msgCount),
    bigintToUInt64BE(snapshot.lastMessageIndex),
  ]);
}

function deserializeBucketSnapshot(buffer: Buffer): BucketSnapshot {
  const reader = BufferReader.asReader(buffer);
  const inboxRollingHash = reader.readObject(Fr);
  const totalMsgCount = reader.readUInt64();
  const timestamp = reader.readUInt64();
  const msgCount = reader.readNumber();
  const lastMessageIndex = reader.readUInt64();
  return { inboxRollingHash, totalMsgCount, timestamp, msgCount, lastMessageIndex };
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
  /** Maps from Inbox bucket sequence number to its serialized snapshot. */
  #inboxBuckets: AztecAsyncMap<number, Buffer>;
  /** Maps from a bucket's L1 timestamp (key) to the highest bucket sequence number opened at that timestamp. */
  #bucketTimestampToSeq: AztecAsyncMap<number, number>;

  #log = createLogger('archiver:message_store');

  constructor(private db: AztecAsyncKVStore) {
    this.#l1ToL2Messages = db.openMap('archiver_l1_to_l2_messages');
    this.#l1ToL2MessageIndices = db.openMap('archiver_l1_to_l2_message_indices');
    this.#lastSynchedL1Block = db.openSingleton('archiver_last_l1_block_id');
    this.#totalMessageCount = db.openSingleton('archiver_l1_to_l2_message_count');
    this.#inboxTreeInProgress = db.openSingleton('archiver_inbox_tree_in_progress');
    this.#messagesFinalizedL1Block = db.openSingleton('archiver_messages_finalized_l1_block');
    this.#inboxBuckets = db.openMap('archiver_inbox_buckets');
    this.#bucketTimestampToSeq = db.openMap('archiver_inbox_bucket_timestamps');
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

      // Running cumulative message count and in-progress bucket state, threaded across the batch so we can snapshot
      // each Inbox bucket as its messages are inserted. Seeded from the last stored message so a bucket that spans
      // two batches keeps accumulating.
      let cumulativeTotal = await this.getTotalL1ToL2MessageCount();
      let currentBucketSeq: bigint | undefined = lastMessage?.bucketSeq;
      let currentBucketMsgCount =
        currentBucketSeq !== undefined ? ((await this.getBucketSnapshotBySeq(currentBucketSeq))?.msgCount ?? 0) : 0;

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

        // Check the full-width consensus rolling hash is valid (AZIP-22 Fast Inbox). Runs alongside the legacy
        // 128-bit check above until the streaming inbox flips on and the legacy hash is removed.
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

        // Snapshot the bucket this message was absorbed into. A message opens a new bucket whenever its bucket
        // sequence differs from the one currently being accumulated; otherwise it extends the current bucket.
        cumulativeTotal += 1n;
        if (currentBucketSeq === undefined || message.bucketSeq !== currentBucketSeq) {
          currentBucketSeq = message.bucketSeq;
          currentBucketMsgCount = 0;
        }
        currentBucketMsgCount += 1;
        await this.writeBucketSnapshot(message.bucketSeq, {
          inboxRollingHash: message.inboxRollingHash,
          totalMsgCount: cumulativeTotal,
          timestamp: message.bucketTimestamp,
          msgCount: currentBucketMsgCount,
          lastMessageIndex: message.index,
        });

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
      await this.rewindBucketsAfterRemoval();
      this.#log.warn(`Deleted ${deleteCount} L1 to L2 messages from index ${startIndex} from the store`);
    });
  }

  /**
   * Rewinds the Inbox bucket snapshots to match the messages remaining after a removal. Buckets whose messages
   * were all removed are deleted, and the boundary bucket (the one holding the last surviving message) is
   * recomputed from its remaining messages, since a checkpoint-aligned removal can split a bucket. Must run
   * inside the removal transaction, after the total message count has been updated.
   */
  private async rewindBucketsAfterRemoval(): Promise<void> {
    const lastRemaining = await this.getLastMessage();
    const boundarySeq = lastRemaining?.bucketSeq;

    // Delete snapshots (and their timestamp index entries) for buckets entirely past the surviving tip.
    const deleteFromKey = boundarySeq === undefined ? 0 : this.bucketSeqToKey(boundarySeq) + 1;
    for await (const [seqKey, snapBuffer] of this.#inboxBuckets.entriesAsync({ start: deleteFromKey })) {
      const snapshot = deserializeBucketSnapshot(snapBuffer);
      await this.#bucketTimestampToSeq.delete(this.timestampToKey(snapshot.timestamp));
      await this.#inboxBuckets.delete(seqKey);
    }

    // Recompute the boundary bucket from its surviving messages. This also restores its timestamp index entry if a
    // just-deleted rollover bucket shared the timestamp.
    if (lastRemaining !== undefined && boundarySeq !== undefined) {
      let msgCount = 0;
      for await (const msg of this.iterateL1ToL2Messages({ reverse: true })) {
        if (msg.bucketSeq !== boundarySeq) {
          break;
        }
        msgCount += 1;
      }
      await this.writeBucketSnapshot(boundarySeq, {
        inboxRollingHash: lastRemaining.inboxRollingHash,
        totalMsgCount: await this.getTotalL1ToL2MessageCount(),
        timestamp: lastRemaining.bucketTimestamp,
        msgCount,
        lastMessageIndex: lastRemaining.index,
      });
    }
  }

  /**
   * Returns the Inbox bucket with the given sequence number, or undefined if it has not been synced (AZIP-22 Fast
   * Inbox).
   */
  public async getInboxBucket(seq: bigint): Promise<InboxBucket | undefined> {
    const snapshot = await this.getBucketSnapshotBySeq(seq);
    return snapshot && this.toInboxBucket(seq, snapshot);
  }

  /**
   * Returns the latest Inbox bucket opened at or before the given L1 timestamp, or undefined if every synced bucket
   * was opened strictly after it (AZIP-22 Fast Inbox).
   */
  public async getLatestInboxBucketAtOrBefore(timestamp: bigint): Promise<InboxBucket | undefined> {
    // Bucket timestamps are non-decreasing in sequence number, and the index holds the highest sequence per
    // timestamp. A reverse scan bounded above (inclusively) by the requested timestamp yields, first, the value
    // at the largest timestamp at-or-before it — the bucket sequence we want.
    const [seq] = await toArray(
      this.#bucketTimestampToSeq.valuesAsync({ end: this.timestampToKey(timestamp), reverse: true, limit: 1 }),
    );
    return seq === undefined ? undefined : this.getInboxBucket(BigInt(seq));
  }

  /**
   * Returns the message leaves absorbed into buckets in the range `(fromExclusive, toInclusive]`, in insertion
   * order (AZIP-22 Fast Inbox). Returns an empty array if the upper bucket has not been synced.
   */
  public async getL1ToL2MessagesBetweenBuckets(fromExclusive: bigint, toInclusive: bigint): Promise<Fr[]> {
    const toBucket = await this.getBucketSnapshotBySeq(toInclusive);
    if (toBucket === undefined) {
      return [];
    }
    // A nonzero lower bound must reference a synced bucket; otherwise the range is unavailable (rather than
    // defaulting to genesis, which would silently over-return). Sequence 0 is the genesis base case: start from
    // the beginning of the Inbox.
    let startIndex = 0n;
    if (fromExclusive > 0n) {
      const fromBucket = await this.getBucketSnapshotBySeq(fromExclusive);
      if (fromBucket === undefined) {
        return [];
      }
      startIndex = fromBucket.lastMessageIndex + 1n;
    }
    const endIndexExclusive = toBucket.lastMessageIndex + 1n;

    const leaves: Fr[] = [];
    for await (const msgBuffer of this.#l1ToL2Messages.valuesAsync({
      start: this.indexToKey(startIndex),
      end: this.indexToKey(endIndexExclusive),
    })) {
      leaves.push(deserializeInboxMessage(msgBuffer).leaf);
    }
    return leaves;
  }

  private async getBucketSnapshotBySeq(seq: bigint): Promise<BucketSnapshot | undefined> {
    const buffer = await this.#inboxBuckets.getAsync(this.bucketSeqToKey(seq));
    return buffer && deserializeBucketSnapshot(buffer);
  }

  private async writeBucketSnapshot(seq: bigint, snapshot: BucketSnapshot): Promise<void> {
    await this.#inboxBuckets.set(this.bucketSeqToKey(seq), serializeBucketSnapshot(snapshot));
    await this.#bucketTimestampToSeq.set(this.timestampToKey(snapshot.timestamp), this.bucketSeqToKey(seq));
  }

  private async toInboxBucket(seq: bigint, snapshot: BucketSnapshot): Promise<InboxBucket> {
    const lastMessage = await this.getLastMessage();
    return {
      seq,
      inboxRollingHash: snapshot.inboxRollingHash,
      totalMsgCount: snapshot.totalMsgCount,
      timestamp: snapshot.timestamp,
      msgCount: snapshot.msgCount,
      lastMessageIndex: snapshot.lastMessageIndex,
      isOpen: lastMessage?.bucketSeq === seq,
    };
  }

  private bucketSeqToKey(seq: bigint): number {
    return Number(seq);
  }

  private timestampToKey(timestamp: bigint): number {
    return Number(timestamp);
  }

  public rollbackL1ToL2MessagesToCheckpoint(targetCheckpointNumber: CheckpointNumber): Promise<void> {
    this.#log.debug(`Deleting L1 to L2 messages up to target checkpoint ${targetCheckpointNumber}`);
    const startIndex = InboxLeaf.smallestIndexForCheckpoint(CheckpointNumber(targetCheckpointNumber + 1));
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
