import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { Checkpoint, type PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import '@aztec/stdlib/testing/jest';

import { InboxMessageRangeNotSyncedError } from '../errors.js';
import type { InboxMessage } from '../structs/inbox_message.js';
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
      await messageStore.setMessageSyncState({ l1Block: { l1BlockNumber, l1BlockHash }, authenticated: true });
      await messageStore.addL1ToL2Messages([makeInboxMessage(Fr.ZERO, { l1BlockNumber: 5n })]);
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
      await messageStore.addL1ToL2Messages([msg]);

      await checkMessages([msg]);
    });

    it('stores and returns messages across different blocks', async () => {
      const msgs = makeInboxMessages(5);
      await messageStore.addL1ToL2Messages(msgs);

      await checkMessages(msgs);
    });

    it('stores the same messages again', async () => {
      const msgs = makeInboxMessages(5);
      await messageStore.addL1ToL2Messages(msgs);
      await messageStore.addL1ToL2Messages(msgs.slice(2));

      await checkMessages(msgs);
    });

    it('stores messages added in two chained batches', async () => {
      const msgs1 = makeInboxMessages(3);
      const msgs2 = makeInboxMessages(3, {
        initialInboxHash: msgs1.at(-1)!.inboxRollingHash,
        initialIndex: BigInt(msgs1.length),
      });

      await messageStore.addL1ToL2Messages(msgs1);
      await messageStore.addL1ToL2Messages(msgs2);

      await checkMessages([...msgs1, ...msgs2]);
    });

    it('stores and returns messages with block numbers larger than a byte', async () => {
      const msgs = makeInboxMessages(5, { overrideFn: (msg, i) => ({ ...msg, l1BlockNumber: BigInt(1000 + i) }) });
      await messageStore.addL1ToL2Messages(msgs);

      await checkMessages(msgs);
    });

    it('stores and returns multiple messages per block', async () => {
      const msgs = makeInboxMessagesWithFullBlocks(4);
      await messageStore.addL1ToL2Messages(msgs);

      await checkMessages(msgs);
    });

    it('stores messages in multiple operations', async () => {
      const msgs = makeInboxMessages(20);
      await messageStore.addL1ToL2Messages(msgs.slice(0, 10));
      await messageStore.addL1ToL2Messages(msgs.slice(10, 20));

      await checkMessages(msgs);
    });

    it('iterates over messages from start index', async () => {
      const msgs = makeInboxMessages(10);
      await messageStore.addL1ToL2Messages(msgs);

      const iterated = await toArray(messageStore.iterateL1ToL2Messages({ start: msgs[3].index }));
      expect(iterated).toEqual(msgs.slice(3));
    });

    it('iterates over messages in reverse', async () => {
      const msgs = makeInboxMessages(10);
      await messageStore.addL1ToL2Messages(msgs);

      const iterated = await toArray(messageStore.iterateL1ToL2Messages({ reverse: true, end: msgs[3].index }));
      expect(iterated).toEqual(msgs.slice(0, 4).reverse());
    });

    it('throws if messages are added out of order', async () => {
      const msgs = makeInboxMessages(5, { overrideFn: (msg, i) => ({ ...msg, index: BigInt(10 - i) }) });
      await expect(messageStore.addL1ToL2Messages(msgs)).rejects.toThrow(MessageStoreError);
    });

    it('throws if index is not contiguous with the previous message', async () => {
      const msgs = makeInboxMessages(5);
      msgs.at(-1)!.index += 100n;
      await expect(messageStore.addL1ToL2Messages(msgs)).rejects.toThrow(MessageStoreError);
    });

    it('throws if there is a gap in the indices', async () => {
      const msgs = makeInboxMessages(4);
      msgs[2].index++;
      await expect(messageStore.addL1ToL2Messages(msgs)).rejects.toThrow(MessageStoreError);
    });

    it('throws if the first index of a batch does not follow the last stored message', async () => {
      const msgs = makeInboxMessages(4);
      await messageStore.addL1ToL2Messages(msgs.slice(0, 2));
      msgs[2].index++;
      await expect(messageStore.addL1ToL2Messages(msgs.slice(2, 4))).rejects.toThrow(MessageStoreError);
    });

    it('throws if the consensus rolling hash is not correct', async () => {
      const msgs = makeInboxMessages(5);
      msgs[1].inboxRollingHash = Fr.random();
      await expect(messageStore.addL1ToL2Messages(msgs)).rejects.toThrow(MessageStoreError);
    });

    it('removes messages inserted after a given L1 block', async () => {
      // Two messages per L1 block: [100, 100, 101, 101, 102, 102].
      const msgs = makeInboxMessages(6, {
        overrideFn: (msg, i) => ({ ...msg, l1BlockNumber: BigInt(100 + Math.floor(i / 2)) }),
      });
      await messageStore.addL1ToL2Messages(msgs);
      await checkMessages(msgs);

      await messageStore.rollbackL1ToL2MessagesAfterL1Block(101n);

      // Only the messages inserted at or before L1 block 101 survive.
      await checkMessages(msgs.slice(0, 4));
    });

    it('removes messages starting with the given index', async () => {
      const msgs = makeInboxMessagesWithFullBlocks(4);
      await messageStore.addL1ToL2Messages(msgs);

      await messageStore.removeL1ToL2Messages(msgs[13].index);
      await checkMessages(msgs.slice(0, 13));
    });
  });

  describe('iterateL1ToL2Messages', () => {
    it('honours zero range bounds', async () => {
      const msgs = makeInboxMessages(3);
      await messageStore.addL1ToL2Messages(msgs);

      // Zero is a valid compact index, so an exclusive end of zero selects nothing rather than everything.
      expect(await toArray(messageStore.iterateL1ToL2Messages({ end: 0n }))).toEqual([]);
      expect(await toArray(messageStore.iterateL1ToL2Messages({ start: 0n, end: 2n }))).toEqual(msgs.slice(0, 2));
      expect(await toArray(messageStore.iterateL1ToL2Messages({ start: 0n }))).toEqual(msgs);
    });
  });

  describe('message positions', () => {
    const zeroPosition = { totalMessageCount: 0n, rollingHash: Fr.ZERO };
    const positionAfter = (msg: InboxMessage) => ({
      totalMessageCount: msg.index + 1n,
      rollingHash: msg.inboxRollingHash,
    });

    it('resolves the position at a synced message count', async () => {
      const msgs = makeInboxMessages(6);
      await messageStore.addL1ToL2Messages(msgs);

      // Position zero always resolves; every other count resolves to the hash stored with the message before it.
      expect(await messageStore.getMessagePosition(0n)).toEqual(zeroPosition);
      expect(await messageStore.getMessagePosition(1n)).toEqual(positionAfter(msgs[0]));
      expect(await messageStore.getMessagePosition(4n)).toEqual(positionAfter(msgs[3]));
      expect(await messageStore.getMessagePosition(6n)).toEqual(positionAfter(msgs[5]));
      // Past the synced tip there is no position yet.
      expect(await messageStore.getMessagePosition(7n)).toBeUndefined();
      await expect(messageStore.getMessagePosition(-1n)).rejects.toThrow(/Invalid Inbox message count/);
    });

    it('resolves position zero on an empty store', async () => {
      expect(await messageStore.getMessagePosition(0n)).toEqual(zeroPosition);
      expect(await messageStore.getMessagePosition(1n)).toBeUndefined();
      expect(await messageStore.getSyncedMessagePosition()).toEqual(zeroPosition);
    });

    it('hands out positions a caller can mutate without affecting later reads', async () => {
      const position = (await messageStore.getMessagePosition(0n))!;
      position.rollingHash = new Fr(99);
      position.totalMessageCount = 99n;

      expect(await messageStore.getMessagePosition(0n)).toEqual(zeroPosition);
      expect((await messageStore.getL1ToL2MessageRange(0n, 0n)).start).toEqual(zeroPosition);
    });

    it('tracks the synced position through appends and removals', async () => {
      const msgs = makeInboxMessages(6);
      await messageStore.addL1ToL2Messages(msgs.slice(0, 4));
      expect(await messageStore.getSyncedMessagePosition()).toEqual(positionAfter(msgs[3]));

      await messageStore.addL1ToL2Messages(msgs.slice(4));
      expect(await messageStore.getSyncedMessagePosition()).toEqual(positionAfter(msgs[5]));

      await messageStore.removeL1ToL2Messages(2n);
      expect(await messageStore.getSyncedMessagePosition()).toEqual(positionAfter(msgs[1]));
      // The removed suffix no longer has positions.
      expect(await messageStore.getMessagePosition(3n)).toBeUndefined();
    });

    it('reads a message range together with the positions at both bounds', async () => {
      const msgs = makeInboxMessages(6);
      await messageStore.addL1ToL2Messages(msgs);
      const leaves = msgs.map(m => m.leaf);

      expect(await messageStore.getL1ToL2MessageRange(0n, 6n)).toEqual({
        messages: leaves,
        start: zeroPosition,
        end: positionAfter(msgs[5]),
      });
      expect(await messageStore.getL1ToL2MessageRange(1n, 4n)).toEqual({
        messages: leaves.slice(1, 4),
        start: positionAfter(msgs[0]),
        end: positionAfter(msgs[3]),
      });
      // An empty range is valid at any synced count and returns equal positions.
      expect(await messageStore.getL1ToL2MessageRange(3n, 3n)).toEqual({
        messages: [],
        start: positionAfter(msgs[2]),
        end: positionAfter(msgs[2]),
      });
      expect(await messageStore.getL1ToL2MessageRange(6n, 6n)).toEqual({
        messages: [],
        start: positionAfter(msgs[5]),
        end: positionAfter(msgs[5]),
      });
    });

    it('reads the messages and the ending position from one snapshot under a concurrent removal', async () => {
      const msgs = makeInboxMessages(6);
      await messageStore.addL1ToL2Messages(msgs);

      // Both operations are queued without awaiting: the read runs as one store transaction, so it sees either the
      // full sequence or the truncated one, never the leaves of one with the ending hash of the other.
      const rangePromise = messageStore.getL1ToL2MessageRange(0n, 6n);
      const removalPromise = messageStore.removeL1ToL2Messages(3n);
      const [range] = await Promise.all([rangePromise, removalPromise]);

      expect(range.messages).toEqual(msgs.map(m => m.leaf));
      expect(range.end).toEqual(positionAfter(msgs[5]));
      expect(await messageStore.getSyncedMessagePosition()).toEqual(positionAfter(msgs[2]));
      await expect(messageStore.getL1ToL2MessageRange(0n, 6n)).rejects.toThrow(InboxMessageRangeNotSyncedError);
    });

    it('reads the empty range at position zero on an empty store', async () => {
      expect(await messageStore.getL1ToL2MessageRange(0n, 0n)).toEqual({
        messages: [],
        start: zeroPosition,
        end: zeroPosition,
      });
    });

    it('throws on an invalid or unsynced message range', async () => {
      const msgs = makeInboxMessages(6);
      await messageStore.addL1ToL2Messages(msgs);

      await expect(messageStore.getL1ToL2MessageRange(3n, 9n)).rejects.toThrow(InboxMessageRangeNotSyncedError);
      await expect(messageStore.getL1ToL2MessageRange(7n, 7n)).rejects.toThrow(InboxMessageRangeNotSyncedError);
      await expect(messageStore.getL1ToL2MessageRange(5n, 3n)).rejects.toThrow(/Invalid Inbox leaf count range/);
      await expect(messageStore.getL1ToL2MessageRange(-1n, 3n)).rejects.toThrow(/Invalid Inbox leaf count range/);
    });

    it('throws when the range or its starting position has a hole', async () => {
      const msgs = makeInboxMessages(6);
      await messageStore.addL1ToL2Messages(msgs);
      await db.openMap<number, Buffer>('archiver_l1_to_l2_messages').delete(2);

      // Index 2 is missing: ranges over it are short, and a range starting at count 3 has no starting position.
      await expect(messageStore.getL1ToL2MessageRange(0n, 6n)).rejects.toThrow(InboxMessageRangeNotSyncedError);
      await expect(messageStore.getL1ToL2MessageRange(3n, 6n)).rejects.toThrow(/missing the message at index 2/);
      // Ranges that need neither the hole nor a position at it are unaffected.
      expect(await messageStore.getL1ToL2MessageRange(4n, 6n)).toEqual({
        messages: msgs.slice(4).map(m => m.leaf),
        start: positionAfter(msgs[3]),
        end: positionAfter(msgs[5]),
      });
    });
  });

  describe('leaf count ranges', () => {
    // Six messages over three L1 blocks: block 100 = [0,1,2], block 101 = [3,4], block 102 = [5].
    const l1Blocks = [100n, 100n, 100n, 101n, 101n, 102n];
    const makeMessagesAcrossL1Blocks = () =>
      makeInboxMessages(l1Blocks.length, { overrideFn: (msg, i) => ({ ...msg, l1BlockNumber: l1Blocks[i] }) });

    it('returns messages between cumulative leaf counts', async () => {
      const msgs = makeMessagesAcrossL1Blocks();
      await messageStore.addL1ToL2Messages(msgs);
      const leaves = msgs.map(m => m.leaf);

      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(0n, 6n)).toEqual(leaves);
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(0n, 3n)).toEqual(leaves.slice(0, 3));
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(3n, 5n)).toEqual(leaves.slice(3, 5));
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(5n, 6n)).toEqual(leaves.slice(5));
      // Counts interior to an L1 block's messages are addressed like any other: the log knows no partition.
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(1n, 4n)).toEqual(leaves.slice(1, 4));
      // An empty range consumes nothing, anywhere in the log.
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(5n, 5n)).toEqual([]);
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(4n, 4n)).toEqual([]);
      expect(await messageStore.getL1ToL2MessagesBetweenLeafCounts(0n, 0n)).toEqual([]);
    });

    it('throws on an invalid or unsynced leaf count range', async () => {
      await messageStore.addL1ToL2Messages(makeMessagesAcrossL1Blocks());

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
      const msgs = makeMessagesAcrossL1Blocks();
      await messageStore.addL1ToL2Messages(msgs);

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

    it('reads a stored message by index', async () => {
      const msgs = makeMessagesAcrossL1Blocks();
      await messageStore.addL1ToL2Messages(msgs);

      expect(await messageStore.getL1ToL2Message(0n)).toEqual(msgs[0]);
      expect(await messageStore.getL1ToL2Message(5n)).toEqual(msgs[5]);
      expect(await messageStore.getL1ToL2Message(6n)).toBeUndefined();
    });

    it('rolls back the messages observed after an L1 block', async () => {
      const msgs = makeMessagesAcrossL1Blocks();
      await messageStore.addL1ToL2Messages(msgs);

      await messageStore.rollbackL1ToL2MessagesAfterL1Block(100n);

      expect(await toArray(messageStore.iterateL1ToL2Messages())).toEqual(msgs.slice(0, 3));
      expect(await messageStore.getTotalL1ToL2MessageCount()).toEqual(3n);
      expect(await messageStore.getMessagePosition(3n)).toEqual({
        totalMessageCount: 3n,
        rollingHash: msgs[2].inboxRollingHash,
      });
      expect(await messageStore.getMessagePosition(4n)).toBeUndefined();
    });

    it('keeps every message when the rollback block is at or past the last observed one', async () => {
      const msgs = makeMessagesAcrossL1Blocks();
      await messageStore.addL1ToL2Messages(msgs);

      await messageStore.rollbackL1ToL2MessagesAfterL1Block(102n);
      await messageStore.rollbackL1ToL2MessagesAfterL1Block(500n);

      expect(await toArray(messageStore.iterateL1ToL2Messages())).toEqual(msgs);
    });

    it('clears every message when the rollback block precedes the first observed one', async () => {
      const msgs = makeMessagesAcrossL1Blocks();
      await messageStore.addL1ToL2Messages(msgs);

      await messageStore.rollbackL1ToL2MessagesAfterL1Block(99n);

      expect(await toArray(messageStore.iterateL1ToL2Messages())).toEqual([]);
      expect(await messageStore.getSyncedMessagePosition()).toEqual({ totalMessageCount: 0n, rollingHash: Fr.ZERO });
    });
  });

  describe('sync state', () => {
    it('commits a batch together with the sync point covering it', async () => {
      const msgs = makeInboxMessages(3);
      const l1Block = { l1BlockNumber: 12n, l1BlockHash: Buffer32.random() };
      const finalizedL1Block = { l1BlockNumber: 7n, l1BlockHash: Buffer32.random() };

      await messageStore.addL1ToL2Messages(msgs, { l1Block, authenticated: true, finalizedL1Block });

      expect(await toArray(messageStore.iterateL1ToL2Messages())).toEqual(msgs);
      expect(await messageStore.getSynchedL1Block()).toEqual(l1Block);
      expect(await messageStore.getMessagesFinalizedL1Block()).toEqual(finalizedL1Block);
    });

    it('commits neither the batch nor the sync point when the batch is rejected', async () => {
      const before = { l1BlockNumber: 5n, l1BlockHash: Buffer32.random() };
      await messageStore.setMessageSyncState({ l1Block: before, authenticated: true });
      const msgs = makeInboxMessages(3);
      msgs[2].inboxRollingHash = Fr.random();

      await expect(
        messageStore.addL1ToL2Messages(msgs, {
          l1Block: { l1BlockNumber: 12n, l1BlockHash: Buffer32.random() },
          authenticated: true,
        }),
      ).rejects.toThrow(MessageStoreError);

      expect(await toArray(messageStore.iterateL1ToL2Messages())).toEqual([]);
      expect(await messageStore.getSynchedL1Block()).toEqual(before);
    });

    it('moves the sync point on an empty authenticated batch', async () => {
      const l1Block = { l1BlockNumber: 12n, l1BlockHash: Buffer32.random() };
      await messageStore.addL1ToL2Messages([], { l1Block, authenticated: true });
      expect(await messageStore.getSynchedL1Block()).toEqual(l1Block);
      expect(await messageStore.getScannedL1Block()).toEqual(l1Block);
    });

    it('moves only the scanned cursor for a batch that was not compared with the Inbox', async () => {
      const synced = { l1BlockNumber: 5n, l1BlockHash: Buffer32.random() };
      await messageStore.setMessageSyncState({ l1Block: synced, authenticated: true });
      const l1Block = { l1BlockNumber: 12n, l1BlockHash: Buffer32.random() };

      await messageStore.addL1ToL2Messages(makeInboxMessages(2), { l1Block, authenticated: false });

      expect(await messageStore.getScannedL1Block()).toEqual(l1Block);
      expect(await messageStore.getSynchedL1Block()).toBeUndefined();
    });

    it('refreshes the L1 block hint of a message re-delivered with the same content', async () => {
      const msgs = makeInboxMessages(3);
      await messageStore.addL1ToL2Messages(msgs);

      const moved = { ...msgs[1], l1BlockNumber: msgs[1].l1BlockNumber + 7n };
      await messageStore.addL1ToL2Messages([moved]);

      expect(await messageStore.getL1ToL2Message(1n)).toEqual(moved);
      expect(await messageStore.getTotalL1ToL2MessageCount()).toEqual(3n);
    });
  });
});
