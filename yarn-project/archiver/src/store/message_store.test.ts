import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { Checkpoint, type PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { updateInboxRollingHash } from '@aztec/stdlib/messaging';
import '@aztec/stdlib/testing/jest';

import { InboxBucketNotSyncedError, InboxMessageRangeNotSyncedError } from '../errors.js';
import type { InboxMessage } from '../structs/inbox_message.js';
import {
  makeInboxMessage,
  makeInboxMessages,
  makeInboxMessagesWithFullBlocks,
  makeL1BlockHash,
  makeL1BlockNumberForBucket,
  makePublishedCheckpoint,
  makeStateForBlock,
} from '../test/mock_structs.js';
import { BlockStore } from './block_store.js';
import { type ArchiverL1SynchPoint, getArchiverSynchPoint } from './data_stores.js';
import { MessageStore, MessageStoreError } from './message_store.js';

describe('MessageStore', () => {
  let db: AztecAsyncKVStore;
  let blockStore: BlockStore;
  let messageStore: MessageStore;
  let publishedCheckpoints: PublishedCheckpoint[];

  // Helper that mirrors the legacy `getSynchPoint` API by calling the helper that takes the bundle.
  const getSynchPoint = (block: BlockStore, message: MessageStore) =>
    getArchiverSynchPoint({
      db: undefined as never,
      blocks: block,
      logs: undefined as never,
      messages: message,
      contractClasses: undefined as never,
      contractInstances: undefined as never,
      functionNames: undefined as never,
    });

  beforeEach(async () => {
    db = await openTmpStore('message_store_test');
    blockStore = new BlockStore(db);
    messageStore = new MessageStore(db);
    // Create checkpoints sequentially to ensure archive roots are chained properly.
    publishedCheckpoints = [];
    const txsPerBlock = 4;
    for (let i = 0; i < 10; i++) {
      const blockNumber = i + 1;
      const previousArchive = i > 0 ? publishedCheckpoints[i - 1].checkpoint.blocks[0].archive : undefined;
      const checkpoint = await Checkpoint.random(CheckpointNumber(i + 1), {
        numBlocks: 1,
        startBlockNumber: blockNumber,
        previousArchive,
        txsPerBlock,
        state: makeStateForBlock(blockNumber, txsPerBlock),
        txOptions: { numPublicCallsPerTx: 2, numPublicLogsPerCall: 2 },
      });
      publishedCheckpoints.push(makePublishedCheckpoint(checkpoint, i + 10));
    }
  });

  describe('getSynchPoint', () => {
    it('returns undefined if no blocks have been added', async () => {
      await expect(getSynchPoint(blockStore, messageStore)).resolves.toEqual({
        blocksSynchedTo: undefined,
        messagesSynchedTo: undefined,
      } satisfies ArchiverL1SynchPoint);
    });

    it('returns the L1 block number in which the most recent L2 block was published', async () => {
      await blockStore.addCheckpoints(publishedCheckpoints);
      await expect(getSynchPoint(blockStore, messageStore)).resolves.toEqual({
        blocksSynchedTo: 19n,
        messagesSynchedTo: undefined,
      } satisfies ArchiverL1SynchPoint);
    });

    it('returns the L1 block set via setMessageSyncState', async () => {
      const l1BlockHash = Buffer32.random();
      const l1BlockNumber = 10n;
      await messageStore.setMessageSyncState({ l1BlockNumber, l1BlockHash });
      await messageStore.addL1ToL2MessageBuckets([
        makeInboxMessage(Fr.ZERO, { l1BlockNumber: 5n, l1BlockHash: Buffer32.random() }),
      ]);
      await expect(getSynchPoint(blockStore, messageStore)).resolves.toEqual({
        blocksSynchedTo: undefined,
        messagesSynchedTo: { l1BlockHash, l1BlockNumber },
      } satisfies ArchiverL1SynchPoint);
    });
  });

  describe('L1 to L2 Messages', () => {
    const checkMessages = async (msgs: InboxMessage[]) => {
      expect(await messageStore.getLastMessage()).toEqual(msgs.at(-1));
      expect(await toArray(messageStore.iterateL1ToL2Messages())).toEqual(msgs);
      expect(await messageStore.getTotalL1ToL2MessageCount()).toEqual(BigInt(msgs.length));
    };

    it('stores first message ever', async () => {
      const msg = makeInboxMessage(Fr.ZERO, { index: 0n });
      await messageStore.addL1ToL2MessageBuckets([msg]);

      await checkMessages([msg]);
    });

    it('stores and returns messages across different blocks', async () => {
      const msgs = makeInboxMessages(5);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      await checkMessages(msgs);
    });

    it('stores the same messages again', async () => {
      const msgs = makeInboxMessages(5);
      await messageStore.addL1ToL2MessageBuckets(msgs);
      await messageStore.addL1ToL2MessageBuckets(msgs.slice(2));

      await checkMessages(msgs);
    });

    it('stores messages added in two chained batches', async () => {
      const msgs1 = makeInboxMessages(3);
      const msgs2 = makeInboxMessages(3, {
        initialInboxHash: msgs1.at(-1)!.inboxRollingHash,
        initialIndex: BigInt(msgs1.length),
      });

      await messageStore.addL1ToL2MessageBuckets(msgs1);
      await messageStore.addL1ToL2MessageBuckets(msgs2);

      await checkMessages([...msgs1, ...msgs2]);
    });

    it('stores and returns messages with block numbers larger than a byte', async () => {
      const msgs = makeInboxMessages(5, { overrideFn: (msg, i) => ({ ...msg, l1BlockNumber: BigInt(1000 + i) }) });
      await messageStore.addL1ToL2MessageBuckets(msgs);

      await checkMessages(msgs);
    });

    it('stores and returns multiple messages per block', async () => {
      const msgs = makeInboxMessagesWithFullBlocks(4);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      await checkMessages(msgs);
    });

    it('stores messages in multiple operations', async () => {
      const msgs = makeInboxMessages(20);
      await messageStore.addL1ToL2MessageBuckets(msgs.slice(0, 10));
      await messageStore.addL1ToL2MessageBuckets(msgs.slice(10, 20));

      await checkMessages(msgs);
    });

    it('iterates over messages from start index', async () => {
      const msgs = makeInboxMessages(10);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      const iterated = await toArray(messageStore.iterateL1ToL2Messages({ start: msgs[3].index }));
      expect(iterated).toEqual(msgs.slice(3));
    });

    it('iterates over messages in reverse', async () => {
      const msgs = makeInboxMessages(10);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      const iterated = await toArray(messageStore.iterateL1ToL2Messages({ reverse: true, end: msgs[3].index }));
      expect(iterated).toEqual(msgs.slice(0, 4).reverse());
    });

    it('throws if messages are added out of order', async () => {
      const msgs = makeInboxMessages(5, { overrideFn: (msg, i) => ({ ...msg, index: BigInt(10 - i) }) });
      await expect(messageStore.addL1ToL2MessageBuckets(msgs)).rejects.toThrow(MessageStoreError);
    });

    it('throws if index is not contiguous with the previous message', async () => {
      const msgs = makeInboxMessages(5);
      msgs.at(-1)!.index += 100n;
      await expect(messageStore.addL1ToL2MessageBuckets(msgs)).rejects.toThrow(MessageStoreError);
    });

    it('throws if there is a gap in the indices', async () => {
      const msgs = makeInboxMessages(4);
      msgs[2].index++;
      await expect(messageStore.addL1ToL2MessageBuckets(msgs)).rejects.toThrow(MessageStoreError);
    });

    it('throws if the first index of a batch does not follow the last stored message', async () => {
      const msgs = makeInboxMessages(4);
      await messageStore.addL1ToL2MessageBuckets(msgs.slice(0, 2));
      msgs[2].index++;
      await expect(messageStore.addL1ToL2MessageBuckets(msgs.slice(2, 4))).rejects.toThrow(MessageStoreError);
    });

    it('throws if the consensus rolling hash is not correct', async () => {
      const msgs = makeInboxMessages(5);
      msgs[1].inboxRollingHash = Fr.random();
      await expect(messageStore.addL1ToL2MessageBuckets(msgs)).rejects.toThrow(MessageStoreError);
    });

    it('removes messages inserted after a given L1 block', async () => {
      // Two messages per L1 block: [100, 100, 101, 101, 102, 102].
      const msgs = makeInboxMessages(6, {
        overrideFn: (msg, i) => ({ ...msg, l1BlockNumber: BigInt(100 + Math.floor(i / 2)) }),
      });
      await messageStore.addL1ToL2MessageBuckets(msgs);
      await checkMessages(msgs);

      await messageStore.rollbackL1ToL2MessagesAfterL1Block(101n);

      // Only the messages inserted at or before L1 block 101 survive.
      await checkMessages(msgs.slice(0, 4));
    });

    it('removes messages starting with the given index', async () => {
      const msgs = makeInboxMessagesWithFullBlocks(4);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      await messageStore.removeL1ToL2Messages(msgs[13].index);
      await checkMessages(msgs.slice(0, 13));
    });
  });

  describe('Inbox buckets', () => {
    // Builds `count` consecutive valid messages, then reassigns their bucket sequence and timestamp per the given
    // per-message spec so we can exercise multi-message and rollover buckets.
    const makeBucketedMessages = (
      spec: { seq: bigint; timestamp: bigint; l1BlockNumber?: bigint }[],
    ): InboxMessage[] => {
      const msgs = makeInboxMessages(spec.length);
      msgs.forEach((msg, i) => {
        msg.bucketSeq = spec[i].seq;
        msg.bucketTimestamp = spec[i].timestamp;
        // Buckets opened at the same L1 timestamp are rollover siblings within one L1 block, so derive the block
        // from the timestamp rather than from the bucket sequence.
        msg.l1BlockNumber = spec[i].l1BlockNumber ?? makeL1BlockNumberForBucket(spec[i].timestamp);
        msg.l1BlockHash = makeL1BlockHash(msg.l1BlockNumber);
      });
      return msgs;
    };

    // Builds a valid message continuing the chain after `previous`, absorbed into the given bucket.
    const makeNextMessage = (previous: InboxMessage, bucket: { seq: bigint; timestamp: bigint }): InboxMessage => {
      const leaf = Fr.random();
      return {
        ...previous,
        leaf,
        index: previous.index + 1n,
        inboxRollingHash: updateInboxRollingHash(previous.inboxRollingHash, leaf),
        bucketSeq: bucket.seq,
        bucketTimestamp: bucket.timestamp,
      };
    };

    // Three buckets over six messages: bucket 1 = [0,1,2], bucket 2 = [3,4], bucket 3 = [5].
    const threeBucketSpec = [
      { seq: 1n, timestamp: 100n },
      { seq: 1n, timestamp: 100n },
      { seq: 1n, timestamp: 100n },
      { seq: 2n, timestamp: 200n },
      { seq: 2n, timestamp: 200n },
      { seq: 3n, timestamp: 300n },
    ];

    it('snapshots buckets as messages are inserted', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      expect(await messageStore.getInboxBucket(1n)).toEqual({
        seq: 1n,
        inboxRollingHash: msgs[2].inboxRollingHash,
        totalMsgCount: 3n,
        timestamp: 100n,
        msgCount: 3,
        lastMessageIndex: msgs[2].index,
        l1BlockNumber: msgs[0].l1BlockNumber,
        l1BlockHash: msgs[0].l1BlockHash,
      });
      expect(await messageStore.getInboxBucket(2n)).toEqual({
        seq: 2n,
        inboxRollingHash: msgs[4].inboxRollingHash,
        totalMsgCount: 5n,
        timestamp: 200n,
        msgCount: 2,
        lastMessageIndex: msgs[4].index,
        l1BlockNumber: msgs[3].l1BlockNumber,
        l1BlockHash: msgs[3].l1BlockHash,
      });
      expect(await messageStore.getInboxBucket(3n)).toEqual({
        seq: 3n,
        inboxRollingHash: msgs[5].inboxRollingHash,
        totalMsgCount: 6n,
        timestamp: 300n,
        msgCount: 1,
        lastMessageIndex: msgs[5].index,
        l1BlockNumber: msgs[5].l1BlockNumber,
        l1BlockHash: msgs[5].l1BlockHash,
      });
      expect(await messageStore.getInboxBucket(4n)).toBeUndefined();
    });

    it('resolves a bucket by its cumulative message total', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      // Each bucket boundary (cumulative totals 3, 5, 6) resolves to its bucket.
      expect((await messageStore.getInboxBucketByTotalMsgCount(3n))?.seq).toEqual(1n);
      expect((await messageStore.getInboxBucketByTotalMsgCount(5n))?.seq).toEqual(2n);
      expect((await messageStore.getInboxBucketByTotalMsgCount(6n))?.seq).toEqual(3n);
      // A total inside a bucket (not on a boundary) does not resolve.
      expect(await messageStore.getInboxBucketByTotalMsgCount(4n)).toBeUndefined();
      // A total past the last synced bucket does not resolve.
      expect(await messageStore.getInboxBucketByTotalMsgCount(7n)).toBeUndefined();
    });

    it('synthesizes the genesis sentinel bucket (sequence 0, total 0) which is never ingested', async () => {
      // With real messages present but no ingested sequence-0 snapshot, both lookups still resolve genesis.
      await messageStore.addL1ToL2MessageBuckets(makeBucketedMessages(threeBucketSpec));

      expect(await messageStore.getInboxBucket(0n)).toMatchObject({ seq: 0n, totalMsgCount: 0n, msgCount: 0 });
      expect(await messageStore.getInboxBucketByTotalMsgCount(0n)).toMatchObject({ seq: 0n, totalMsgCount: 0n });
    });

    it('rejects a bucket delivered without the messages already stored for it', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec);
      await messageStore.addL1ToL2MessageBuckets(msgs.slice(0, 2));

      // The second batch continues bucket 1 from its third message, so its snapshot would undercount the bucket.
      await expect(messageStore.addL1ToL2MessageBuckets(msgs.slice(2))).rejects.toThrow(/Incomplete Inbox bucket 1/);
    });

    it('rebuilds a stored bucket re-delivered in full with a replaced tail', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec);
      await messageStore.addL1ToL2MessageBuckets(msgs.slice(0, 3));
      // An L1 reorg drops bucket 1's last message; the re-sync replays the whole L1 block it lives in.
      await messageStore.removeL1ToL2Messages(msgs[2].index);
      const replacement = makeNextMessage(msgs[1], { seq: 1n, timestamp: 100n });
      await messageStore.addL1ToL2MessageBuckets([msgs[0], msgs[1], replacement]);

      expect(await messageStore.getInboxBucket(1n)).toEqual({
        seq: 1n,
        inboxRollingHash: replacement.inboxRollingHash,
        totalMsgCount: 3n,
        timestamp: 100n,
        msgCount: 3,
        lastMessageIndex: replacement.index,
        l1BlockNumber: msgs[0].l1BlockNumber,
        l1BlockHash: msgs[0].l1BlockHash,
      });
      expect(await messageStore.getTotalL1ToL2MessageCount()).toEqual(3n);
    });

    it('records the L1 block a bucket is re-delivered in after a rollback', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec).slice(0, 3);
      await messageStore.addL1ToL2MessageBuckets(msgs);
      expect(await messageStore.getInboxBucket(1n)).toMatchObject({
        l1BlockNumber: msgs[0].l1BlockNumber,
        l1BlockHash: msgs[0].l1BlockHash,
      });

      // The L1 block holding bucket 1 was reorged out and re-mined with the same messages under a different hash.
      await messageStore.rollbackL1ToL2MessagesAfterL1Block(0n);
      const replayed = msgs.map(msg => ({ ...msg, l1BlockHash: makeL1BlockHash(99n) }));
      await messageStore.addL1ToL2MessageBuckets(replayed);

      expect(await messageStore.getInboxBucket(1n)).toMatchObject({
        msgCount: 3,
        l1BlockNumber: msgs[0].l1BlockNumber,
        l1BlockHash: makeL1BlockHash(99n),
      });
    });

    it('records the L1 block a bucket is re-delivered in without a rollback', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec).slice(0, 3);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      // The same messages are seen again under a different L1 block hash, and are reinserted in place.
      const replayed = msgs.map(msg => ({ ...msg, l1BlockHash: makeL1BlockHash(99n) }));
      await messageStore.addL1ToL2MessageBuckets(replayed);

      expect(await messageStore.getInboxBucket(1n)).toMatchObject({
        msgCount: 3,
        totalMsgCount: 3n,
        l1BlockNumber: msgs[0].l1BlockNumber,
        l1BlockHash: makeL1BlockHash(99n),
      });
      expect(await messageStore.getTotalL1ToL2MessageCount()).toEqual(3n);
    });

    it('records the opening L1 block of a bucket spanning co-timestamped L1 blocks', async () => {
      // Chains that allow consecutive blocks to share a timestamp (anvil with manual mining) can spread one
      // bucket over several L1 blocks; the snapshot keeps the block the bucket was opened in.
      const msgs = makeBucketedMessages(threeBucketSpec);
      msgs[2].l1BlockNumber = msgs[0].l1BlockNumber + 1n;
      msgs[2].l1BlockHash = makeL1BlockHash(msgs[2].l1BlockNumber);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      expect(await messageStore.getInboxBucket(1n)).toMatchObject({
        msgCount: 3,
        l1BlockNumber: msgs[0].l1BlockNumber,
        l1BlockHash: msgs[0].l1BlockHash,
      });
    });

    it('rejects a message opening a bucket older than the newest stored one', async () => {
      const msgs = makeBucketedMessages([
        { seq: 1n, timestamp: 100n },
        { seq: 2n, timestamp: 200n },
        { seq: 4n, timestamp: 400n },
      ]);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      const stale = makeNextMessage(msgs[2], { seq: 3n, timestamp: 300n });
      await expect(messageStore.addL1ToL2MessageBuckets([stale])).rejects.toThrow(/Cannot open Inbox bucket 3/);
    });

    it('throws if the consensus rolling hash is not correct', async () => {
      const msgs = makeInboxMessages(5);
      msgs[1].inboxRollingHash = Fr.random();
      await expect(messageStore.addL1ToL2MessageBuckets(msgs)).rejects.toThrow(MessageStoreError);
    });

    it('resolves the latest bucket at or before a timestamp', async () => {
      await messageStore.addL1ToL2MessageBuckets(makeBucketedMessages(threeBucketSpec));

      expect((await messageStore.getLatestInboxBucketAtOrBefore(100n))!.seq).toEqual(1n);
      expect((await messageStore.getLatestInboxBucketAtOrBefore(150n))!.seq).toEqual(1n);
      expect((await messageStore.getLatestInboxBucketAtOrBefore(300n))!.seq).toEqual(3n);
      expect((await messageStore.getLatestInboxBucketAtOrBefore(10_000n))!.seq).toEqual(3n);
      expect(await messageStore.getLatestInboxBucketAtOrBefore(99n)).toBeUndefined();
    });

    it('resolves rollover buckets that share a timestamp to the highest sequence', async () => {
      // Buckets 2 and 3 share timestamp 200 (a full bucket rolling over within the same L1 block).
      const msgs = makeBucketedMessages([
        { seq: 1n, timestamp: 100n },
        { seq: 2n, timestamp: 200n },
        { seq: 3n, timestamp: 200n },
      ]);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      expect((await messageStore.getLatestInboxBucketAtOrBefore(200n))!.seq).toEqual(3n);
    });

    it('returns messages between buckets in insertion order', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec);
      await messageStore.addL1ToL2MessageBuckets(msgs);
      const leaves = msgs.map(m => m.leaf);

      expect(await messageStore.getL1ToL2MessagesBetweenBuckets(0n, 3n)).toEqual(leaves);
      expect(await messageStore.getL1ToL2MessagesBetweenBuckets(1n, 2n)).toEqual(leaves.slice(3, 5));
      expect(await messageStore.getL1ToL2MessagesBetweenBuckets(2n, 3n)).toEqual(leaves.slice(5));
      // An empty (fromExclusive, toInclusive] range yields no messages.
      expect(await messageStore.getL1ToL2MessagesBetweenBuckets(3n, 3n)).toEqual([]);
    });

    it('throws when a bucket bound has not been synced', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      // An unsynced bound is reported rather than collapsing into an empty range.
      await expect(messageStore.getL1ToL2MessagesBetweenBuckets(0n, 9n)).rejects.toThrow(InboxBucketNotSyncedError);
      await expect(messageStore.getL1ToL2MessagesBetweenBuckets(9n, 12n)).rejects.toThrow(InboxBucketNotSyncedError);
      // A nonzero lower bound is never treated as genesis.
      await expect(messageStore.getL1ToL2MessagesBetweenBuckets(4n, 5n)).rejects.toThrow(InboxBucketNotSyncedError);
      await expect(messageStore.getL1ToL2MessagesBetweenBuckets(4n, 3n)).rejects.toThrow(/Invalid Inbox bucket range/);
    });

    it('returns messages between cumulative leaf counts', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec);
      await messageStore.addL1ToL2MessageBuckets(msgs);
      const leaves = msgs.map(m => m.leaf);

      // Bucket boundaries sit at cumulative counts 0 (genesis), 3, 5 and 6.
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(0n, 6n)).toEqual(leaves);
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(0n, 3n)).toEqual(leaves.slice(0, 3));
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(3n, 5n)).toEqual(leaves.slice(3, 5));
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(5n, 6n)).toEqual(leaves.slice(5));
      // An empty range consumes nothing, at a bucket boundary or at genesis.
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(5n, 5n)).toEqual([]);
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(0n, 0n)).toEqual([]);
    });

    it('returns messages between leaf counts interior to the bucket partition', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec);
      await messageStore.addL1ToL2MessageBuckets(msgs);
      const leaves = msgs.map(m => m.leaf);

      // Counts 1, 2 and 4 sit inside a bucket. A published block commits to a leaf count, and a reorg can merge away
      // the bucket that ended there, so the range is addressed by message index alone.
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(1n, 6n)).toEqual(leaves.slice(1));
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(0n, 4n)).toEqual(leaves.slice(0, 4));
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(1n, 4n)).toEqual(leaves.slice(1, 4));
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(4n, 6n)).toEqual(leaves.slice(4));
      // An empty range at an interior count consumes nothing rather than failing.
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(4n, 4n)).toEqual([]);
    });

    it('throws on an invalid or unsynced leaf count range', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      // Ranges reaching past the synced tip fail rather than returning a partial range, empty ones included.
      await expect(messageStore.getL1ToL2MessagesBetweenLeafCounts(3n, 9n)).rejects.toThrow(
        InboxMessageRangeNotSyncedError,
      );
      await expect(messageStore.getL1ToL2MessagesBetweenLeafCounts(7n, 7n)).rejects.toThrow(
        InboxMessageRangeNotSyncedError,
      );
      // Reversed and negative bounds are caller errors, reported like every other failure of this API: as a
      // rejection, so remote callers behind the archiver RPC see them the same way.
      await expect(messageStore.getL1ToL2MessagesBetweenLeafCounts(5n, 3n)).rejects.toThrow(
        /Invalid Inbox leaf count range/,
      );
      await expect(messageStore.getL1ToL2MessagesBetweenLeafCounts(-1n, 3n)).rejects.toThrow(
        /Invalid Inbox leaf count range/,
      );
      await expect(messageStore.getL1ToL2MessagesBetweenLeafCounts(0n, -1n)).rejects.toThrow(
        /Invalid Inbox leaf count range/,
      );
    });

    it('throws when the leaf count range has a hole', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      // Defense in depth: insertion is contiguity-checked and removal only ever drops a suffix, so no caller can put
      // a hole in the middle of the log. Punch one straight into the map to prove a short read is never returned.
      await db.openMap<number, Buffer>('archiver_l1_to_l2_messages').delete(2);

      await expect(messageStore.getL1ToL2MessagesBetweenLeafCounts(0n, 6n)).rejects.toThrow(
        InboxMessageRangeNotSyncedError,
      );
      await expect(messageStore.getL1ToL2MessagesBetweenLeafCounts(2n, 3n)).rejects.toThrow(
        InboxMessageRangeNotSyncedError,
      );
      // Ranges that do not cover the hole are unaffected.
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(3n, 6n)).toEqual(msgs.slice(3).map(m => m.leaf));
    });

    it('rewinds buckets when messages are removed', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      // Remove the last two messages (msgs[4] in bucket 2, msgs[5] in bucket 3), splitting bucket 2.
      await messageStore.removeL1ToL2Messages(msgs[4].index);

      expect(await messageStore.getInboxBucket(3n)).toBeUndefined();
      expect(await messageStore.getInboxBucket(2n)).toEqual({
        seq: 2n,
        inboxRollingHash: msgs[3].inboxRollingHash,
        totalMsgCount: 4n,
        timestamp: 200n,
        msgCount: 1,
        lastMessageIndex: msgs[3].index,
        l1BlockNumber: msgs[3].l1BlockNumber,
        l1BlockHash: msgs[3].l1BlockHash,
      });
      expect(await messageStore.getInboxBucket(1n)).toMatchObject({ msgCount: 3, totalMsgCount: 3n });

      // Bucket 3's timestamp index entry is gone, so an at-or-before lookup falls back to bucket 2.
      expect((await messageStore.getLatestInboxBucketAtOrBefore(300n))!.seq).toEqual(2n);
    });

    it('rewinds a rollover bucket sharing a timestamp with the surviving boundary', async () => {
      const msgs = makeBucketedMessages([
        { seq: 1n, timestamp: 100n },
        { seq: 2n, timestamp: 200n },
        { seq: 3n, timestamp: 200n },
      ]);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      // Removing the last message deletes bucket 3, whose timestamp (200) is shared with the surviving bucket 2.
      await messageStore.removeL1ToL2Messages(msgs[2].index);

      expect(await messageStore.getInboxBucket(3n)).toBeUndefined();
      expect((await messageStore.getLatestInboxBucketAtOrBefore(200n))!.seq).toEqual(2n);
    });

    it('keeps rollover siblings indexed when a bucket sharing their timestamp is removed', async () => {
      // Three buckets rolling over within one L1 block, so all three share timestamp 100.
      const msgs = makeBucketedMessages([
        { seq: 1n, timestamp: 100n },
        { seq: 2n, timestamp: 100n },
        { seq: 3n, timestamp: 100n },
      ]);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      await messageStore.removeL1ToL2Messages(msgs[2].index);

      expect(await messageStore.getInboxBucket(3n)).toBeUndefined();
      expect(await messageStore.getInboxBucket(1n)).toMatchObject({ msgCount: 1, totalMsgCount: 1n });
      expect((await messageStore.getLatestInboxBucketAtOrBefore(100n))!.seq).toEqual(2n);
    });

    it('reindexes a bucket re-delivered from an L1 block with a different timestamp', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec);
      await messageStore.addL1ToL2MessageBuckets(msgs.slice(0, 3));
      await messageStore.removeL1ToL2Messages(msgs[2].index);

      // The reorged L1 block holding bucket 1 was re-mined at a later timestamp.
      const replayed = [msgs[0], msgs[1], makeNextMessage(msgs[1], { seq: 1n, timestamp: 100n })].map(msg => ({
        ...msg,
        bucketTimestamp: 150n,
      }));
      await messageStore.addL1ToL2MessageBuckets(replayed);

      expect(await messageStore.getInboxBucket(1n)).toMatchObject({ timestamp: 150n, msgCount: 3 });
      expect(await messageStore.getLatestInboxBucketAtOrBefore(100n)).toBeUndefined();
      expect((await messageStore.getLatestInboxBucketAtOrBefore(150n))!.seq).toEqual(1n);
    });

    it('rolls back whole buckets past an L1 block', async () => {
      // Bucket 1 fills L1 block 100, bucket 2 fills L1 block 101 and bucket 3 fills L1 block 102.
      const msgs = makeBucketedMessages([
        { seq: 1n, timestamp: 100n, l1BlockNumber: 100n },
        { seq: 1n, timestamp: 100n, l1BlockNumber: 100n },
        { seq: 1n, timestamp: 100n, l1BlockNumber: 100n },
        { seq: 2n, timestamp: 200n, l1BlockNumber: 101n },
        { seq: 2n, timestamp: 200n, l1BlockNumber: 101n },
        { seq: 3n, timestamp: 300n, l1BlockNumber: 102n },
      ]);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      await messageStore.rollbackL1ToL2MessagesAfterL1Block(100n);

      expect(await toArray(messageStore.iterateL1ToL2Messages())).toEqual(msgs.slice(0, 3));
      expect(await messageStore.getInboxBucket(2n)).toBeUndefined();
      expect(await messageStore.getInboxBucket(3n)).toBeUndefined();
      expect(await messageStore.getInboxBucket(1n)).toMatchObject({ msgCount: 3, totalMsgCount: 3n });
      expect((await messageStore.getLatestInboxBucketAtOrBefore(300n))!.seq).toEqual(1n);
    });

    it('clears all buckets when every message is removed', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      await messageStore.removeL1ToL2Messages(msgs[0].index);

      expect(await messageStore.getInboxBucket(1n)).toBeUndefined();
      expect(await messageStore.getLatestInboxBucketAtOrBefore(300n)).toBeUndefined();
    });
  });
});
