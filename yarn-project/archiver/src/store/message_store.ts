import type { L1BlockId } from '@aztec/ethereum/l1-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, bigintToUInt64BE, numToUInt32BE, serializeToBuffer } from '@aztec/foundation/serialize';
import {
  type AztecAsyncKVStore,
  type AztecAsyncMap,
  type AztecAsyncMultiMap,
  type AztecAsyncSingleton,
  type CustomRange,
  mapRange,
} from '@aztec/kv-store';
import { type InboxBucket, type InboxMessageBundle, updateInboxRollingHash } from '@aztec/stdlib/messaging';

import { InboxBucketBoundaryNotSyncedError, InboxBucketNotSyncedError } from '../errors.js';
import { type InboxMessage, deserializeInboxMessage, serializeInboxMessage } from '../structs/inbox_message.js';

/**
 * Persisted snapshot of an Inbox rolling-hash bucket. Mirrors the fields the on-chain Inbox tracks per bucket, plus
 * the number and hash of the L1 block the bucket was opened in and the index span of its messages, so rollbacks,
 * range queries and canonicality checks can work off bucket records alone without scanning messages.
 *
 * The Inbox keys buckets by `block.timestamp`, so on a chain that allows consecutive blocks to share a timestamp
 * (anvil with manual mining, for instance) a bucket may span several L1 blocks. Only the opening one is recorded.
 */
type BucketSnapshot = {
  inboxRollingHash: Fr;
  totalMsgCount: bigint;
  timestamp: bigint;
  l1BlockNumber: bigint;
  l1BlockHash: Buffer32;
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
    snapshot.l1BlockHash,
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
  const l1BlockHash = Buffer32.fromBuffer(reader.readBytes(Buffer32.SIZE));
  const msgCount = reader.readNumber();
  const firstMessageIndex = reader.readUInt64();
  const lastMessageIndex = reader.readUInt64();
  return {
    inboxRollingHash,
    totalMsgCount,
    timestamp,
    l1BlockNumber,
    l1BlockHash,
    msgCount,
    firstMessageIndex,
    lastMessageIndex,
  };
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

// The genesis sentinel bucket: sequence 0 with a zero rolling hash and no messages, mirroring the
// on-chain Inbox's base case. The archiver never ingests a snapshot for it (no message is absorbed into sequence 0), so
// it is synthesized on read. Consumers use its sequence number and zero total; its deploy-time timestamp is not tracked
// here and is unused. Its timestamp, L1 block number and L1 block hash are sentinels, not values read from L1:
// consumers must short-circuit on sequence 0 rather than looking any of them up on chain.
const GENESIS_INBOX_BUCKET: InboxBucket = {
  seq: 0n,
  inboxRollingHash: Fr.ZERO,
  totalMsgCount: 0n,
  timestamp: 0n,
  msgCount: 0,
  lastMessageIndex: 0n,
  l1BlockNumber: 0n,
  l1BlockHash: Buffer32.ZERO,
};

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
  /** Stores the L1 finalized block as of the last successful message sync. */
  #messagesFinalizedL1Block: AztecAsyncSingleton<Buffer>;
  /** Maps from Inbox bucket sequence number to its serialized snapshot. */
  #inboxBuckets: AztecAsyncMap<number, Buffer>;
  /**
   * Maps from a bucket's L1 timestamp (key) to the sequence numbers of the buckets opened at that timestamp. Holds
   * several sequences per timestamp when a full bucket rolls over within one L1 block, so that deleting one bucket
   * leaves its rollover siblings indexed.
   */
  #bucketTimestampToSeq: AztecAsyncMultiMap<number, number>;

  #log = createLogger('archiver:message_store');

  constructor(private db: AztecAsyncKVStore) {
    this.#l1ToL2Messages = db.openMap('archiver_l1_to_l2_messages');
    this.#l1ToL2MessageIndices = db.openMap('archiver_l1_to_l2_message_indices');
    this.#lastSynchedL1Block = db.openSingleton('archiver_last_l1_block_id');
    this.#totalMessageCount = db.openSingleton('archiver_l1_to_l2_message_count');
    this.#messagesFinalizedL1Block = db.openSingleton('archiver_messages_finalized_l1_block');
    this.#inboxBuckets = db.openMap('archiver_inbox_buckets');
    this.#bucketTimestampToSeq = db.openMultiMap('archiver_inbox_bucket_timestamps');
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
          if (existing && deserializeInboxMessage(existing).inboxRollingHash.equals(message.inboxRollingHash)) {
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
        // continue the chain from the previously inserted message. A message whose bucket differs from the previous
        // message's is the first of its bucket, so it takes the bucket-start separator.
        const previousInboxRollingHash = lastMessage?.inboxRollingHash ?? Fr.ZERO;
        const opensBucket = message.bucketSeq !== lastMessage?.bucketSeq;
        const expectedInboxRollingHash = updateInboxRollingHash(previousInboxRollingHash, message.leaf, opensBucket);
        if (!expectedInboxRollingHash.equals(message.inboxRollingHash)) {
          throw new MessageStoreError(
            `Invalid inbox rolling hash for incoming L1 to L2 message ${message.leaf.toString()} ` +
              `with index ${message.index} ` +
              `(expected ${expectedInboxRollingHash.toString()} from previous hash ${previousInboxRollingHash.toString()} ` +
              `but got ${message.inboxRollingHash.toString()})`,
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
   * the totals of the buckets after it within the same batch. A bucket always arrives complete from its first message
   * (checked when the batch is validated), so the opening L1 block is read off that first message; a bucket whose
   * later messages come from a co-timestamped L1 block still records the block it was opened in.
   */
  private async writeIncomingBucketSnapshots(incomingBuckets: IncomingBucket[]): Promise<void> {
    let cumulativeTotal = await this.getTotalMsgCountBeforeBucket(incomingBuckets[0].seq);
    for (const { seq, messages } of incomingBuckets) {
      const openingMessage = messages[0];
      const lastInBucket = messages.at(-1)!;
      if (lastInBucket.l1BlockNumber !== openingMessage.l1BlockNumber) {
        this.#log.warn(`Inbox bucket ${seq} spans more than one L1 block`, {
          bucketSeq: seq,
          bucketTimestamp: lastInBucket.bucketTimestamp,
          firstL1BlockNumber: openingMessage.l1BlockNumber,
          lastL1BlockNumber: lastInBucket.l1BlockNumber,
        });
      }
      cumulativeTotal += BigInt(messages.length);
      await this.writeBucketSnapshot(seq, {
        inboxRollingHash: lastInBucket.inboxRollingHash,
        totalMsgCount: cumulativeTotal,
        timestamp: lastInBucket.bucketTimestamp,
        l1BlockNumber: openingMessage.l1BlockNumber,
        l1BlockHash: openingMessage.l1BlockHash,
        msgCount: messages.length,
        firstMessageIndex: openingMessage.index,
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
   * Rewinds the Inbox bucket snapshots to match the messages left after a removal. Each bucket past the surviving tip
   * is deleted together with its own timestamp index entry, leaving the entries of the rollover siblings it shares a
   * timestamp with in place.
   *
   * The bucket holding the last surviving message is rewritten from the messages it has left, because a removal can
   * cut inside a bucket: the synchronizer rolls back to the last message it still shares with L1 after a reorg, and
   * that message need not be the last of its bucket. Must run inside the removal transaction, after the total message
   * count has been updated.
   */
  private async rewindBucketsAfterRemoval(): Promise<void> {
    const lastRemaining = await this.getLastMessage();
    const boundarySeq = lastRemaining?.bucketSeq;

    const deleteFromKey = boundarySeq === undefined ? 0 : this.bucketSeqToKey(boundarySeq) + 1;
    for await (const [seqKey, snapBuffer] of this.#inboxBuckets.entriesAsync({ start: deleteFromKey })) {
      const snapshot = deserializeBucketSnapshot(snapBuffer);
      await this.#bucketTimestampToSeq.deleteValue(this.timestampToKey(snapshot.timestamp), seqKey);
      await this.#inboxBuckets.delete(seqKey);
    }

    if (lastRemaining === undefined || boundarySeq === undefined) {
      return;
    }
    let msgCount = 0;
    for await (const msg of this.iterateL1ToL2Messages({ reverse: true })) {
      if (msg.bucketSeq !== boundarySeq) {
        break;
      }
      msgCount += 1;
    }
    const stored = await this.getSyncedBucketSnapshot(boundarySeq);
    await this.writeBucketSnapshot(boundarySeq, {
      ...stored,
      inboxRollingHash: lastRemaining.inboxRollingHash,
      totalMsgCount: await this.getTotalL1ToL2MessageCount(),
      msgCount,
      lastMessageIndex: lastRemaining.index,
    });
  }

  /**
   * Returns the Inbox bucket with the given sequence number, or undefined if it has not been synced. Sequence 0 is
   * the genesis sentinel: the on-chain Inbox reserves it as the "consumed nothing" base case
   * and never absorbs a message into it, so the archiver ingests no snapshot for it; it is synthesized here (rolling
   * hash 0, total 0) so streaming consumers can resolve a genesis parent or an empty checkpoint's last-consumed bucket.
   */
  public async getInboxBucket(seq: bigint): Promise<InboxBucket | undefined> {
    const snapshot = await this.getBucketSnapshotBySeq(seq);
    if (snapshot !== undefined) {
      return this.toInboxBucket(seq, snapshot);
    }
    return seq === 0n ? GENESIS_INBOX_BUCKET : undefined;
  }

  /**
   * Returns the Inbox bucket whose cumulative message total equals `totalMsgCount`, or undefined if no synced bucket
   * sits on that boundary. Sequence 0 (total 0) is the genesis sentinel base case; otherwise the
   * message at global index `totalMsgCount - 1` is the last message of the bucket with that cumulative total, so its
   * `bucketSeq` resolves the bucket. A total that does not land on a bucket boundary returns undefined.
   */
  public async getInboxBucketByTotalMsgCount(totalMsgCount: bigint): Promise<InboxBucket | undefined> {
    if (totalMsgCount === 0n) {
      return this.getInboxBucket(0n);
    }
    const buffer = await this.#l1ToL2Messages.getAsync(this.indexToKey(totalMsgCount - 1n));
    if (buffer === undefined) {
      return undefined;
    }
    const bucket = await this.getInboxBucket(deserializeInboxMessage(buffer).bucketSeq);
    return bucket !== undefined && bucket.totalMsgCount === totalMsgCount ? bucket : undefined;
  }

  /**
   * Returns the message leaves in the cumulative Inbox message-count range `[startLeafCount, endLeafCount)`, in
   * insertion order. The bounds are compact L1-to-L2 tree leaf counts, which every block header
   * carries, so consumers can ask for the messages a block or checkpoint consumed without resolving buckets
   * themselves. Both bounds must land on a bucket boundary this archiver has synced; it throws otherwise, since a
   * caller asking for a range always expects the messages in it.
   */
  public async getL1ToL2MessagesBetweenLeafCounts(
    startLeafCount: bigint,
    endLeafCount: bigint,
  ): Promise<InboxMessageBundle> {
    if (startLeafCount > endLeafCount) {
      throw new Error(`Invalid Inbox leaf count range [${startLeafCount}, ${endLeafCount})`);
    }
    const startBucket = await this.getBucketAtBoundary(startLeafCount);
    const endBucket = await this.getBucketAtBoundary(endLeafCount);
    return this.getL1ToL2MessagesBetweenBuckets(startBucket.seq, endBucket.seq);
  }

  /** Resolves the bucket ending at the given cumulative message count, failing loudly if there is none. */
  private async getBucketAtBoundary(totalMsgCount: bigint): Promise<InboxBucket> {
    const bucket = await this.getInboxBucketByTotalMsgCount(totalMsgCount);
    if (bucket === undefined) {
      throw new InboxBucketBoundaryNotSyncedError(totalMsgCount);
    }
    return bucket;
  }

  /**
   * Returns the latest Inbox bucket opened at or before the given L1 timestamp, or undefined if every synced bucket
   * was opened strictly after it.
   */
  public async getLatestInboxBucketAtOrBefore(timestamp: bigint): Promise<InboxBucket | undefined> {
    // Bucket timestamps are non-decreasing in sequence number, so the bucket we want is the highest sequence indexed
    // at the largest timestamp at-or-before the requested one. A reverse scan bounded above (inclusively) by that
    // timestamp visits it first; rollover buckets share a timestamp, so keep the highest of its sequences.
    let latestTimestampKey: number | undefined;
    let latestSeqKey: number | undefined;
    for await (const [timestampKey, seqKey] of this.#bucketTimestampToSeq.entriesAsync({
      end: this.timestampToKey(timestamp),
      reverse: true,
    })) {
      if (latestTimestampKey !== undefined && timestampKey !== latestTimestampKey) {
        break;
      }
      latestTimestampKey = timestampKey;
      latestSeqKey = latestSeqKey === undefined ? seqKey : Math.max(latestSeqKey, seqKey);
    }
    return latestSeqKey === undefined ? undefined : this.getInboxBucket(BigInt(latestSeqKey));
  }

  /**
   * Returns the message leaves absorbed into buckets in the range `(fromExclusive, toInclusive]`, in insertion order.
   * Both bounds must name buckets this archiver has synced, so that an empty result means the
   * range holds no messages rather than hiding an unsynced bound; callers route the
   * `InboxBucketNotSyncedError` to their own catch-up handling. Sequence 0 is the genesis base case and always
   * resolves: the range then starts at the first message of the Inbox.
   */
  public async getL1ToL2MessagesBetweenBuckets(
    fromExclusive: bigint,
    toInclusive: bigint,
  ): Promise<InboxMessageBundle> {
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

  /**
   * Collects the message leaves in the global index range `[startIndex, endIndexExclusive)`, in insertion order,
   * grouped per Inbox bucket. A group is only started by a message, so no group is ever empty.
   */
  private async getMessageLeavesInIndexRange(
    startIndex: bigint,
    endIndexExclusive: bigint,
  ): Promise<InboxMessageBundle> {
    const bundle: InboxMessageBundle = [];
    let currentBucketSeq: bigint | undefined;
    for await (const msgBuffer of this.#l1ToL2Messages.valuesAsync({
      start: this.indexToKey(startIndex),
      end: this.indexToKey(endIndexExclusive),
    })) {
      const message = deserializeInboxMessage(msgBuffer);
      if (message.bucketSeq !== currentBucketSeq) {
        bundle.push([]);
        currentBucketSeq = message.bucketSeq;
      }
      bundle.at(-1)!.push(message.leaf);
    }
    return bundle;
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
    // A reorg can re-deliver a bucket from an L1 block mined at a different timestamp, so drop the stale index entry.
    const stored = await this.getBucketSnapshotBySeq(seq);
    if (stored !== undefined && stored.timestamp !== snapshot.timestamp) {
      await this.#bucketTimestampToSeq.deleteValue(this.timestampToKey(stored.timestamp), this.bucketSeqToKey(seq));
    }
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
      l1BlockNumber: snapshot.l1BlockNumber,
      l1BlockHash: snapshot.l1BlockHash,
    };
  }

  private bucketSeqToKey(seq: bigint): number {
    return Number(seq);
  }

  private timestampToKey(timestamp: bigint): number {
    return Number(timestamp);
  }

  /**
   * Removes every L1 to L2 message inserted after the given L1 block, so the message store matches the L1 Inbox state
   * as of that block. Used when rolling the archiver back to an earlier checkpoint, whose L1 block is passed here.
   *
   * The cut is found from the bucket snapshots alone, without reading the messages being removed: a bucket is kept
   * whole when the block it was opened in survives. On a chain with strictly increasing block timestamps a bucket
   * lives entirely within one L1 block, so that is exact; where consecutive blocks may share a timestamp, a bucket
   * opened at or before the cut keeps the messages it absorbed in the co-timestamped blocks after it.
   */
  public async rollbackL1ToL2MessagesAfterL1Block(l1BlockNumber: bigint): Promise<void> {
    this.#log.debug(`Deleting L1 to L2 messages inserted after L1 block ${l1BlockNumber}`);
    let removeFromIndex: bigint | undefined;
    for await (const snapBuffer of this.#inboxBuckets.valuesAsync({ reverse: true })) {
      const snapshot = deserializeBucketSnapshot(snapBuffer);
      if (snapshot.l1BlockNumber <= l1BlockNumber) {
        break;
      }
      removeFromIndex = snapshot.firstMessageIndex;
    }
    if (removeFromIndex !== undefined) {
      await this.removeL1ToL2Messages(removeFromIndex);
    }
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
