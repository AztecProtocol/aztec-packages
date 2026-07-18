import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { Checkpoint, type PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { updateInboxRollingHash } from '@aztec/stdlib/messaging';
import '@aztec/stdlib/testing/jest';

import { InboxBucketNotSyncedError, L1ToL2MessagesNotReadyError } from '../errors.js';
import { type InboxMessage, updateRollingHash } from '../structs/inbox_message.js';
import {
  makeInboxMessage,
  makeInboxMessages,
  makeInboxMessagesWithFullBlocks,
  makePublishedCheckpoint,
  makeStateForBlock,
} from '../test/mock_structs.js';
import { BlockStore } from './block_store.js';
import { type ArchiverL1SynchPoint, getArchiverSynchPoint } from './data_stores.js';
import { MessageStore, MessageStoreError } from './message_store.js';

describe('MessageStore', () => {
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
    const db = await openTmpStore('message_store_test');
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
      await messageStore.setMessageSyncState({ l1BlockNumber, l1BlockHash }, 1n);
      await messageStore.addL1ToL2MessageBuckets([
        makeInboxMessage(Buffer16.ZERO, { l1BlockNumber: 5n, l1BlockHash: Buffer32.random() }),
      ]);
      await expect(getSynchPoint(blockStore, messageStore)).resolves.toEqual({
        blocksSynchedTo: undefined,
        messagesSynchedTo: { l1BlockHash, l1BlockNumber },
      } satisfies ArchiverL1SynchPoint);
    });
  });

  describe('L1 to L2 Messages', () => {
    const initialCheckpointNumber = CheckpointNumber(13);

    const checkMessages = async (msgs: InboxMessage[]) => {
      expect(await messageStore.getLastMessage()).toEqual(msgs.at(-1));
      expect(await toArray(messageStore.iterateL1ToL2Messages())).toEqual(msgs);
      expect(await messageStore.getTotalL1ToL2MessageCount()).toEqual(BigInt(msgs.length));
    };

    it('stores first message ever', async () => {
      const msg = makeInboxMessage(Buffer16.ZERO, { index: 0n, checkpointNumber: CheckpointNumber(1) });
      await messageStore.addL1ToL2MessageBuckets([msg]);

      await checkMessages([msg]);
      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(1))).toEqual([msg.leaf]);
    });

    it('stores single message', async () => {
      const msg = makeInboxMessage(Buffer16.ZERO, { checkpointNumber: CheckpointNumber(2) });
      await messageStore.addL1ToL2MessageBuckets([msg]);

      await checkMessages([msg]);
      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(2))).toEqual([msg.leaf]);
    });

    it('stores and returns messages across different blocks', async () => {
      const msgs = makeInboxMessages(5, { initialCheckpointNumber });
      await messageStore.addL1ToL2MessageBuckets(msgs);

      await checkMessages(msgs);
      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(initialCheckpointNumber + 2))).toEqual(
        [msgs[2]].map(m => m.leaf),
      );
    });

    it('stores the same messages again', async () => {
      const msgs = makeInboxMessages(5, { initialCheckpointNumber });
      await messageStore.addL1ToL2MessageBuckets(msgs);
      await messageStore.addL1ToL2MessageBuckets(msgs.slice(2));

      await checkMessages(msgs);
    });

    it('stores and returns messages across different blocks with gaps', async () => {
      const msgs1 = makeInboxMessages(3, { initialCheckpointNumber: CheckpointNumber(1) });
      const msgs2 = makeInboxMessages(3, {
        initialCheckpointNumber: CheckpointNumber(20),
        initialHash: msgs1.at(-1)!.rollingHash,
        initialInboxHash: msgs1.at(-1)!.inboxRollingHash,
      });

      await messageStore.addL1ToL2MessageBuckets(msgs1);
      await messageStore.addL1ToL2MessageBuckets(msgs2);

      await checkMessages([...msgs1, ...msgs2]);

      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(1))).toEqual([msgs1[0].leaf]);
      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(4))).toEqual([]);
      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(20))).toEqual([msgs2[0].leaf]);
      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(24))).toEqual([]);
    });

    it('stores and returns messages with block numbers larger than a byte', async () => {
      const msgs = makeInboxMessages(5, { initialCheckpointNumber: CheckpointNumber(1000) });
      await messageStore.addL1ToL2MessageBuckets(msgs);

      await checkMessages(msgs);
      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(1002))).toEqual([msgs[2]].map(m => m.leaf));
    });

    it('stores and returns multiple messages per block', async () => {
      const msgs = makeInboxMessagesWithFullBlocks(4);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      await checkMessages(msgs);
      const blockMessages = await messageStore.getL1ToL2Messages(CheckpointNumber(initialCheckpointNumber + 1));
      expect(blockMessages).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
      expect(blockMessages).toEqual(
        msgs.slice(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * 2).map(m => m.leaf),
      );
    });

    it('stores messages in multiple operations', async () => {
      const msgs = makeInboxMessages(20, { initialCheckpointNumber });
      await messageStore.addL1ToL2MessageBuckets(msgs.slice(0, 10));
      await messageStore.addL1ToL2MessageBuckets(msgs.slice(10, 20));

      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(initialCheckpointNumber + 2))).toEqual(
        [msgs[2]].map(m => m.leaf),
      );
      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(initialCheckpointNumber + 12))).toEqual(
        [msgs[12]].map(m => m.leaf),
      );
      await checkMessages(msgs);
    });

    it('iterates over messages from start index', async () => {
      const msgs = makeInboxMessages(10, { initialCheckpointNumber });
      await messageStore.addL1ToL2MessageBuckets(msgs);

      const iterated = await toArray(messageStore.iterateL1ToL2Messages({ start: msgs[3].index }));
      expect(iterated).toEqual(msgs.slice(3));
    });

    it('iterates over messages in reverse', async () => {
      const msgs = makeInboxMessages(10, { initialCheckpointNumber });
      await messageStore.addL1ToL2MessageBuckets(msgs);

      const iterated = await toArray(messageStore.iterateL1ToL2Messages({ reverse: true, end: msgs[3].index }));
      expect(iterated).toEqual(msgs.slice(0, 4).reverse());
    });

    it('throws if messages are added out of order', async () => {
      const msgs = makeInboxMessages(5, { overrideFn: (msg, i) => ({ ...msg, index: BigInt(10 - i) }) });
      await expect(messageStore.addL1ToL2MessageBuckets(msgs)).rejects.toThrow(MessageStoreError);
    });

    it('throws if block number for the first message is out of order', async () => {
      const msgs = makeInboxMessages(4, { initialCheckpointNumber });
      msgs[2].checkpointNumber = CheckpointNumber(initialCheckpointNumber - 1);
      await messageStore.addL1ToL2MessageBuckets(msgs.slice(0, 2));
      await expect(messageStore.addL1ToL2MessageBuckets(msgs.slice(2, 4))).rejects.toThrow(MessageStoreError);
    });

    it('throws if rolling hash is not correct', async () => {
      const msgs = makeInboxMessages(5);
      msgs[1].rollingHash = Buffer16.random();
      await expect(messageStore.addL1ToL2MessageBuckets(msgs)).rejects.toThrow(MessageStoreError);
    });

    it('throws if rolling hash for first message is not correct', async () => {
      const msgs = makeInboxMessages(4);
      msgs[2].rollingHash = Buffer16.random();
      await messageStore.addL1ToL2MessageBuckets(msgs.slice(0, CheckpointNumber(2)));
      await expect(messageStore.addL1ToL2MessageBuckets(msgs.slice(2, 4))).rejects.toThrow(MessageStoreError);
    });

    it('throws if index is not in the correct range', async () => {
      const msgs = makeInboxMessages(5, { initialCheckpointNumber });
      msgs.at(-1)!.index += 100n;
      await expect(messageStore.addL1ToL2MessageBuckets(msgs)).rejects.toThrow(MessageStoreError);
    });

    it('throws if first index in block has gaps', async () => {
      const msgs = makeInboxMessages(4, { initialCheckpointNumber });
      msgs[2].index++;
      await expect(messageStore.addL1ToL2MessageBuckets(msgs)).rejects.toThrow(MessageStoreError);
    });

    it('throws if index does not follow previous one', async () => {
      const msgs = makeInboxMessages(2, {
        initialCheckpointNumber,
        overrideFn: (msg, i) => ({
          ...msg,
          checkpointNumber: CheckpointNumber(2),
          index: BigInt(i + NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * 2),
        }),
      });
      msgs[1].index++;
      await expect(messageStore.addL1ToL2MessageBuckets(msgs)).rejects.toThrow(MessageStoreError);
    });

    it('removes messages up to the given block number', async () => {
      const msgs = makeInboxMessagesWithFullBlocks(4, { initialCheckpointNumber: CheckpointNumber(1) });

      await messageStore.addL1ToL2MessageBuckets(msgs);
      await checkMessages(msgs);

      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(1))).toHaveLength(
        NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      );
      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(2))).toHaveLength(
        NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      );
      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(3))).toHaveLength(
        NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      );
      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(4))).toHaveLength(
        NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      );

      await messageStore.rollbackL1ToL2MessagesToCheckpoint(CheckpointNumber(2));

      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(1))).toHaveLength(
        NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      );
      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(2))).toHaveLength(
        NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      );
      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(3))).toHaveLength(0);
      expect(await messageStore.getL1ToL2Messages(CheckpointNumber(4))).toHaveLength(0);

      await checkMessages(msgs.slice(0, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * 2));
    });

    it('removes messages starting with the given index', async () => {
      const msgs = makeInboxMessagesWithFullBlocks(4, { initialCheckpointNumber: CheckpointNumber(1) });
      await messageStore.addL1ToL2MessageBuckets(msgs);

      await messageStore.removeL1ToL2Messages(msgs[13].index);
      await checkMessages(msgs.slice(0, 13));
    });

    describe('inbox tree in progress guard', () => {
      it('throws when checkpointNumber >= treeInProgress', async () => {
        const msgs = makeInboxMessages(3, { initialCheckpointNumber: CheckpointNumber(5) });
        await messageStore.addL1ToL2MessageBuckets(msgs);

        // Set treeInProgress to 7, meaning checkpoints 5 and 6 are sealed, 7+ are not
        await messageStore.setMessageSyncState({ l1BlockNumber: 1n, l1BlockHash: Buffer32.random() }, 7n);

        // Sealed checkpoint should succeed
        await expect(messageStore.getL1ToL2Messages(CheckpointNumber(5))).resolves.toEqual([msgs[0].leaf]);

        // Unsealed checkpoint (== treeInProgress) should throw
        await expect(messageStore.getL1ToL2Messages(CheckpointNumber(7))).rejects.toThrow(L1ToL2MessagesNotReadyError);

        // Future checkpoint should also throw
        await expect(messageStore.getL1ToL2Messages(CheckpointNumber(8))).rejects.toThrow(L1ToL2MessagesNotReadyError);
      });

      it('returns messages when checkpointNumber < treeInProgress', async () => {
        const msgs = makeInboxMessages(3, { initialCheckpointNumber: CheckpointNumber(10) });
        await messageStore.addL1ToL2MessageBuckets(msgs);

        await messageStore.setMessageSyncState({ l1BlockNumber: 1n, l1BlockHash: Buffer32.random() }, 13n);

        await expect(messageStore.getL1ToL2Messages(CheckpointNumber(10))).resolves.toEqual([msgs[0].leaf]);
        await expect(messageStore.getL1ToL2Messages(CheckpointNumber(11))).resolves.toEqual([msgs[1].leaf]);
      });

      it('skips guard when treeInProgress is not set', async () => {
        const msgs = makeInboxMessages(2, { initialCheckpointNumber: CheckpointNumber(1) });
        await messageStore.addL1ToL2MessageBuckets(msgs);

        // No setMessageSyncState call — guard should be permissive
        await expect(messageStore.getL1ToL2Messages(CheckpointNumber(1))).resolves.toEqual([msgs[0].leaf]);
      });
    });
  });

  describe('Inbox buckets', () => {
    // Builds `count` consecutive valid messages in a single checkpoint, then reassigns their bucket sequence and
    // timestamp per the given per-message spec so we can exercise multi-message and rollover buckets.
    const makeBucketedMessages = (spec: { seq: bigint; timestamp: bigint }[]): InboxMessage[] => {
      const msgs = makeInboxMessages(spec.length, {
        initialCheckpointNumber: CheckpointNumber(1),
        messagesPerCheckpoint: spec.length,
      });
      msgs.forEach((msg, i) => {
        msg.bucketSeq = spec[i].seq;
        msg.bucketTimestamp = spec[i].timestamp;
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
        rollingHash: updateRollingHash(previous.rollingHash, leaf),
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
      });
      expect(await messageStore.getInboxBucket(2n)).toEqual({
        seq: 2n,
        inboxRollingHash: msgs[4].inboxRollingHash,
        totalMsgCount: 5n,
        timestamp: 200n,
        msgCount: 2,
        lastMessageIndex: msgs[4].index,
      });
      expect(await messageStore.getInboxBucket(3n)).toEqual({
        seq: 3n,
        inboxRollingHash: msgs[5].inboxRollingHash,
        totalMsgCount: 6n,
        timestamp: 300n,
        msgCount: 1,
        lastMessageIndex: msgs[5].index,
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
      });
      expect(await messageStore.getTotalL1ToL2MessageCount()).toEqual(3n);
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

    it('clears all buckets when every message is removed', async () => {
      const msgs = makeBucketedMessages(threeBucketSpec);
      await messageStore.addL1ToL2MessageBuckets(msgs);

      await messageStore.removeL1ToL2Messages(msgs[0].index);

      expect(await messageStore.getInboxBucket(1n)).toBeUndefined();
      expect(await messageStore.getLatestInboxBucketAtOrBefore(300n)).toBeUndefined();
    });
  });
});
