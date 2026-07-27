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

import { InboxBucketNotSyncedError, L1ToL2MessagesNotReadyError } from '../errors.js';
import {
  type InboxMessage,
  deserializeInboxMessage,
  serializeInboxMessage,
  updateRollingHash,
} from '../structs/inbox_message.js';

/**
 * Persisted snapshot of an Inbox rolling-hash bucket. Mirrors the fields the on-chain Inbox tracks per bucket, plus
 * the L1 block the bucket was opened in and the index span of its messages, so rollbacks and range queries can work
 * off bucket records alone without scanning messages.
 */
type BucketSnapshot = {
  inboxRollingHash: Fr;
  totalMsgCount: bigint;
  timestamp: bigint;
  l1BlockNumber: bigint;
  msgCount: number;
  firstMessageIndex: bigint;
  lastMessageIndex: bigint;
};

function serializeBucketSnapshot(snapshot: BucketSnapshot): Buffer {
  return serializeToBuffer([
    snapshot.inboxRollingHash,
    bigintToUInt64BE(snapshot.totalMsgCount),
    bigintToUInt64BE(snapshot.timestamp),
    bigintToUInt64BE(snapshot.l1BlockNumber),
    numToUInt32BE(snapshot.msgCount),
    bigintToUInt64BE(snapshot.firstMessageIndex),
    bigintToUInt64BE(snapshot.lastMessageIndex),
  ]);
}

function deserializeBucketSnapshot(buffer: Buffer): BucketSnapshot {
  const reader = BufferReader.asReader(buffer);
  const inboxRollingHash = reader.readObject(Fr);
  const totalMsgCount = reader.readUInt64();
  const timestamp = reader.readUInt64();
  const l1BlockNumber = reader.readUInt64();
  const msgCount = reader.readNumber();
  const firstMessageIndex = reader.readUInt64();
  const lastMessageIndex = reader.readUInt64();
  return { inboxRollingHash, totalMsgCount, timestamp, l1BlockNumber, msgCount, firstMessageIndex, lastMessageIndex };
}

/** The messages of a single Inbox bucket within an incoming batch, in insertion order. */
type IncomingBucket = {
  seq: bigint;
  messages: InboxMessage[];
};

/**
 * Splits an incoming batch of messages into per-bucket groups, in delivery order. Messages arrive ordered by index
 * and a bucket's messages are contiguous within that order, so a group ends as soon as the bucket sequence changes.
 */
function groupMessagesByBucket(messages: InboxMessage[]): IncomingBucket[] {
  const buckets: IncomingBucket[] = [];
  for (const message of messages) {
    const current = buckets.at(-1);
    if (current !== undefined && current.seq === message.bucketSeq) {
      current.messages.push(message);
    } else {
      buckets.push({ seq: message.bucketSeq, messages: [message] });
    }
  }
  return buckets;
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
   * Appends L1 to L2 messages to the store, one whole Inbox bucket at a time.
   *
   * A bucket is opened and closed within a single L1 block, and callers retrieve Inbox logs in whole-L1-block ranges,
   * so every message of a bucket reaches this method in the same call — including the rollover buckets a full block
   * spills into. The bucket snapshots are derived from that: the batch is split per bucket sequence and each bucket
   * gets a single snapshot built from its complete message set. Delivering only part of a bucket already held in the
   * store is rejected, since the snapshot would then undercount the bucket. Delivering a stored bucket again from its
   * first message is allowed: an L1 reorg can replace a bucket's tail, and the re-sync that follows replays the whole
   * L1 block it lives in.
   *
   * Requires messages to be ordered by index and to continue the stored chain. Throws a `MessageStoreError` if
   * messages arrive out of order, if the rolling hash chain breaks, or if a bucket arrives incomplete.
   */
  public addL1ToL2MessageBuckets(messages: InboxMessage[]): Promise<void> {
    if (messages.length === 0) {
      return Promise.resolve();
    }

    return this.db.transactionAsync(async () => {
      let lastMessage = await this.getLastMessage();
      let messageCount = 0;

      const incomingBuckets = groupMessagesByBucket(messages);
      await this.assertIncomingBucketsAreComplete(incomingBuckets);

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

        this.#log.trace(`Inserted L1 to L2 message ${message.leaf} with index ${message.index} into the store`);
        lastMessage = message;
      }

      await this.writeIncomingBucketSnapshots(incomingBuckets);

      // Update total message count with the number of inserted messages.
      await this.increaseTotalMessageCount(messageCount);
    });
  }

  /**
   * Rejects a batch that delivers an Inbox bucket the store already holds without replaying it from its first message,
   * or that opens a bucket older than the newest one stored. Either would produce a snapshot that disagrees with the
   * messages it covers, since each snapshot is derived from the batch's messages for that bucket alone.
   */
  private async assertIncomingBucketsAreComplete(incomingBuckets: IncomingBucket[]): Promise<void> {
    const newestStoredSeq = await this.getNewestBucketSeq();
    let previousSeq: bigint | undefined;
    for (const bucket of incomingBuckets) {
      if (previousSeq !== undefined && bucket.seq <= previousSeq) {
        throw new MessageStoreError(
          `Inbox bucket ${bucket.seq} arrives after bucket ${previousSeq} in the same batch`,
          bucket.messages[0],
        );
      }
      previousSeq = bucket.seq;

      const stored = await this.getBucketSnapshotBySeq(bucket.seq);
      if (stored === undefined) {
        if (newestStoredSeq !== undefined && bucket.seq <= newestStoredSeq) {
          throw new MessageStoreError(
            `Cannot open Inbox bucket ${bucket.seq} after bucket ${newestStoredSeq} has been stored`,
            bucket.messages[0],
          );
        }
      } else if (stored.firstMessageIndex !== bucket.messages[0].index) {
        throw new MessageStoreError(
          `Incomplete Inbox bucket ${bucket.seq}: stored messages start at index ${stored.firstMessageIndex} ` +
            `but the batch starts at index ${bucket.messages[0].index}`,
          bucket.messages[0],
        );
      }
    }
  }

  /**
   * Writes one snapshot per bucket in the batch, each derived from the bucket's complete message set. Cumulative
   * totals thread forward from the bucket preceding the batch, so a bucket re-delivered with extra messages shifts
   * the totals of the buckets after it within the same batch.
   */
  private async writeIncomingBucketSnapshots(incomingBuckets: IncomingBucket[]): Promise<void> {
    let cumulativeTotal = await this.getTotalMsgCountBeforeBucket(incomingBuckets[0].seq);
    for (const { seq, messages } of incomingBuckets) {
      const lastInBucket = messages.at(-1)!;
      cumulativeTotal += BigInt(messages.length);
      await this.writeBucketSnapshot(seq, {
        inboxRollingHash: lastInBucket.inboxRollingHash,
        totalMsgCount: cumulativeTotal,
        timestamp: lastInBucket.bucketTimestamp,
        l1BlockNumber: lastInBucket.l1BlockNumber,
        msgCount: messages.length,
        firstMessageIndex: messages[0].index,
        lastMessageIndex: lastInBucket.index,
      });
    }
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
      const stored = await this.getBucketSnapshotBySeq(boundarySeq);
      await this.writeBucketSnapshot(boundarySeq, {
        inboxRollingHash: lastRemaining.inboxRollingHash,
        totalMsgCount: await this.getTotalL1ToL2MessageCount(),
        timestamp: lastRemaining.bucketTimestamp,
        l1BlockNumber: stored?.l1BlockNumber ?? lastRemaining.l1BlockNumber,
        msgCount,
        firstMessageIndex: stored?.firstMessageIndex ?? lastRemaining.index - BigInt(msgCount) + 1n,
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
   * Returns the message leaves absorbed into buckets in the range `(fromExclusive, toInclusive]`, in insertion order
   * (AZIP-22 Fast Inbox). Both bounds must name buckets this archiver has synced, so that an empty result means the
   * range holds no messages rather than hiding an unsynced bound; callers route the
   * `InboxBucketNotSyncedError` to their own catch-up handling. Sequence 0 is the genesis base case and always
   * resolves: the range then starts at the first message of the Inbox.
   */
  public async getL1ToL2MessagesBetweenBuckets(fromExclusive: bigint, toInclusive: bigint): Promise<Fr[]> {
    if (fromExclusive > toInclusive) {
      throw new Error(`Invalid Inbox bucket range (${fromExclusive}, ${toInclusive}]`);
    }
    if (toInclusive === 0n) {
      return [];
    }
    const endIndexExclusive = (await this.getSyncedBucketSnapshot(toInclusive)).lastMessageIndex + 1n;
    const startIndex =
      fromExclusive === 0n ? 0n : (await this.getSyncedBucketSnapshot(fromExclusive)).lastMessageIndex + 1n;
    return this.getMessageLeavesInIndexRange(startIndex, endIndexExclusive);
  }

  /** Collects the message leaves in the global index range `[startIndex, endIndexExclusive)`, in insertion order. */
  private async getMessageLeavesInIndexRange(startIndex: bigint, endIndexExclusive: bigint): Promise<Fr[]> {
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

  /** Reads a bucket snapshot, failing loudly if the archiver has not synced that bucket. */
  private async getSyncedBucketSnapshot(seq: bigint): Promise<BucketSnapshot> {
    const snapshot = await this.getBucketSnapshotBySeq(seq);
    if (snapshot === undefined) {
      throw new InboxBucketNotSyncedError(seq);
    }
    return snapshot;
  }

  private async writeBucketSnapshot(seq: bigint, snapshot: BucketSnapshot): Promise<void> {
    await this.#inboxBuckets.set(this.bucketSeqToKey(seq), serializeBucketSnapshot(snapshot));
    await this.#bucketTimestampToSeq.set(this.timestampToKey(snapshot.timestamp), this.bucketSeqToKey(seq));
  }

  /** Returns the sequence number of the newest stored bucket, or undefined if none has been stored yet. */
  private async getNewestBucketSeq(): Promise<bigint | undefined> {
    const [seqKey] = await toArray(this.#inboxBuckets.keysAsync({ reverse: true, limit: 1 }));
    return seqKey === undefined ? undefined : BigInt(seqKey);
  }

  /** Returns the cumulative Inbox message count through the newest stored bucket before the given sequence number. */
  private async getTotalMsgCountBeforeBucket(seq: bigint): Promise<bigint> {
    const [snapBuffer] = await toArray(
      this.#inboxBuckets.valuesAsync({ end: this.bucketSeqToKey(seq) - 1, reverse: true, limit: 1 }),
    );
    return snapBuffer === undefined ? 0n : deserializeBucketSnapshot(snapBuffer).totalMsgCount;
  }

  private toInboxBucket(seq: bigint, snapshot: BucketSnapshot): InboxBucket {
    return {
      seq,
      inboxRollingHash: snapshot.inboxRollingHash,
      totalMsgCount: snapshot.totalMsgCount,
      timestamp: snapshot.timestamp,
      msgCount: snapshot.msgCount,
      lastMessageIndex: snapshot.lastMessageIndex,
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
