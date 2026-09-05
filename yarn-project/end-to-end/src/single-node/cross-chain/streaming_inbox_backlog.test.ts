import type { Archiver } from '@aztec/archiver';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { MAX_L1_TO_L2_MSGS_PER_BLOCK, MAX_L1_TO_L2_MSGS_PER_CHECKPOINT } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { getSlotAtTimestamp, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';

import { L1_DIRECT_WRITE_ACCOUNT_INDEX, PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { waitForNodeCheckpoint } from '../../fixtures/wait_helpers.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';
import { createL1ToL2MessageHelpers } from './message_test_helpers.js';

jest.setTimeout(900_000);

// Streaming Inbox coverage of message backlogs larger than one block or one checkpoint may consume. Messages are
// sent in Multicall3 batches so a backlog of over a thousand fits in a handful of L1 blocks. Same environment as
// streaming_inbox.test.ts (36s slots / 6s blocks, up to 4 blocks per checkpoint, message-only blocks allowed); the
// proven tip is kept moving by the harness's epoch settler.
describe('single-node/cross-chain/streaming_inbox_backlog', () => {
  let t: CrossChainMessagingTest;

  let log: Logger;
  let aztecNode: AztecNode;
  let archiver: Archiver;
  let wallet: Wallet;
  let user1Address: AztecAddress;
  let recipient: AztecAddress;

  let sendMessageBatch: ReturnType<typeof createL1ToL2MessageHelpers>['sendMessageBatch'];
  let advanceBlock: ReturnType<typeof createL1ToL2MessageHelpers>['advanceBlock'];

  const BATCH_SIZE = 220;
  const BATCHES = 5;
  /** Block sub-slot duration in seconds, matching `blockDurationMs` below. */
  const BLOCK_DURATION = 6;
  /** Sub-slots per checkpoint the 36s/6s profile yields, which is also the configured `maxBlocksPerCheckpoint`. */
  const MAX_BLOCKS_PER_CHECKPOINT = 4;
  /**
   * Buckets of the full backlog whose consumption is mandatory once they are all older than the slot's Inbox cutoff:
   * the fifth ends 1100 messages past the parent, over the per-checkpoint cap, so it is the only bucket the cap
   * escape covers and the fourth (880 messages, four blocks' worth) is the one endpoint a checkpoint may publish at.
   * Consuming nothing fails the censorship assert just as consuming less does, so a proposer that cannot reach it has
   * to give up the slot.
   */
  const MANDATORY_BUCKETS = 4;

  type NodeBlock = NonNullable<Awaited<ReturnType<AztecNode['getBlock']>>>;

  beforeAll(async () => {
    t = new CrossChainMessagingTest(
      'streaming_inbox_backlog',
      { ...PIPELINING_SETUP_OPTS, aztecSlotDuration: 36, blockDurationMs: 6000, minTxsPerBlock: 0 },
      { aztecProofSubmissionEpochs: 2, aztecEpochDuration: 4 },
      { syncChainTip: 'checkpointed' },
      { l1HarnessAccountIndex: L1_DIRECT_WRITE_ACCOUNT_INDEX, deployTokenBridge: false },
    );
    await t.setup();

    ({ logger: log, wallet, user1Address, aztecNode } = t);
    archiver = t.context.aztecNodeService.getBlockSource() as Archiver;
    recipient = await AztecAddress.random();

    ({ sendMessageBatch, advanceBlock } = createL1ToL2MessageHelpers({
      t,
      aztecNode,
      wallet,
      user1Address,
      log,
      markAsProven: () => t.cheatCodes.rollup.markAsProven(),
    }));
  }, 600_000);

  afterAll(async () => {
    await t.teardown();
  });

  /** The cumulative message count the L2 chain has consumed through `blockNumber`. */
  const consumedThrough = async (blockNumber: BlockNumber) =>
    BigInt((await aztecNode.getBlock(blockNumber))!.header.state.l1ToL2MessageTree.nextAvailableLeafIndex);

  /** Sends the backlog in batches (one L1 block, hence one bucket, each) and returns the Inbox total after it. */
  const sendBacklog = async (batches = BATCHES) => {
    const bucketEnds: bigint[] = [];
    for (let i = 0; i < batches; i++) {
      const { messages } = await sendMessageBatch(BATCH_SIZE, recipient);
      bucketEnds.push(messages.at(-1)!.index + 1n);
    }
    const inboxTotal = (await t.inbox.getState()).totalMessagesInserted;
    expect(inboxTotal).toEqual(bucketEnds.at(-1));
    return { inboxTotal, bucketEnds };
  };

  /** Waits until the chain has consumed every Inbox message, returning the first block past `fromBlock` that did. */
  const waitForBacklogDrained = (inboxTotal: bigint, fromBlock: BlockNumber) =>
    retryUntil(
      async () => {
        const tip = await aztecNode.getBlockNumber();
        return tip > fromBlock && (await consumedThrough(tip)) >= inboxTotal ? tip : undefined;
      },
      `chain consumes all ${inboxTotal} Inbox messages`,
      t.constants.slotDuration * 8,
      1,
    );

  /** Every block in `[from, to]`, in order. */
  const getBlocks = async (from: BlockNumber, to: BlockNumber): Promise<NodeBlock[]> => {
    const blocks: NodeBlock[] = [];
    for (let n = from; n <= to; n = BlockNumber(n + 1)) {
      blocks.push((await aztecNode.getBlock(n))!);
    }
    return blocks;
  };

  /**
   * Runs `fn` while a background loop feeds empty txs so checkpoints keep building blocks in every sub-slot; the
   * feeder also marks epochs proven so the proof window does not expire mid-test.
   */
  const withBackgroundFeeder = async <T>(fn: () => Promise<T>): Promise<T> => {
    let feeding = true;
    const feeder = (async () => {
      while (feeding) {
        try {
          await advanceBlock();
        } catch (err) {
          log.warn(`Feeder tx failed: ${(err as Error).message}`);
        }
      }
    })();
    try {
      return await fn();
    } finally {
      feeding = false;
      await feeder;
    }
  };

  /** Waits until the node's archiver holds the whole Inbox backlog, so a proposer can consume all of it. */
  const waitForArchiverToObserve = (inboxTotal: bigint) =>
    retryUntil(
      async () => (await archiver.getSyncedMessagePosition()).totalMessageCount >= inboxTotal,
      `archiver observes ${inboxTotal} Inbox messages`,
      t.constants.ethereumSlotDuration * 6,
      0.5,
    );

  /** The checkpoint published for `slot`, once it shows up on the node. */
  const waitForCheckpointAtSlot = (slot: SlotNumber) =>
    retryUntil(
      async () => {
        const tip = await aztecNode.getCheckpointNumber();
        const recent = await aztecNode.getCheckpoints(CheckpointNumber(Math.max(1, tip - 3)), 4, {
          includeBlocks: true,
        });
        return recent.find(c => c.header.slotNumber === slot);
      },
      `checkpoint for slot ${slot} published`,
      t.constants.slotDuration * 2,
      0.5,
    );

  /** Whether any of the last few checkpoints was published for `slot`. */
  const hasCheckpointAtSlot = async (slot: SlotNumber) => {
    const tip = await aztecNode.getCheckpointNumber();
    const recent = await aztecNode.getCheckpoints(CheckpointNumber(Math.max(1, tip - 4)), 5);
    return recent.some(c => c.header.slotNumber === slot);
  };

  /**
   * Pauses block production, sends `batches` message batches (one L1 bucket each) while nothing consumes them, and
   * waits until `subslotsIntoFrame` sub-slots into the build frame of a slot whose frame has not opened yet. The
   * caller starts the sequencer, which then proposes for that slot with only its remaining sub-slots to build in.
   */
  const pauseAndFillUntilLateInto = async (opts: { batches: number; subslotsIntoFrame: number }) => {
    const sequencer = t.context.aztecNodeService.getSequencer()!;
    const { slotDuration, ethereumSlotDuration } = t.constants;
    // The pending tip is proven before the pause so the proof window cannot expire while nothing is built.
    await t.cheatCodes.rollup.markAsProven();
    await sequencer.pause();
    const blockBefore = await aztecNode.getBlockNumber();
    const consumedBefore = await consumedThrough(blockBefore);
    const { inboxTotal, bucketEnds } = await sendBacklog(opts.batches);
    await waitForArchiverToObserve(inboxTotal);

    const currentSlot = getSlotAtTimestamp(BigInt(await t.cheatCodes.eth.lastBlockTimestamp()), t.constants);
    const targetSlot = SlotNumber(Number(currentSlot) + 3);
    const buildFrameStart = Number(getTimestampForSlot(targetSlot, t.constants)) - slotDuration - ethereumSlotDuration;
    const lateStart = buildFrameStart + opts.subslotsIntoFrame * BLOCK_DURATION + 1;
    log.warn(`Waiting to resume ${opts.subslotsIntoFrame} sub-slots into the build frame of slot ${targetSlot}`, {
      targetSlot,
      buildFrameStart,
      lateStart,
      inboxTotal,
      consumedBefore,
    });
    await t.monitor.waitUntilL1Timestamp(lateStart);
    return { sequencer, targetSlot, blockBefore, consumedBefore, inboxTotal, bucketEnds };
  };

  // A backlog above the per-checkpoint cap drains over successive checkpoints, each publishing at a live bucket end
  // within the caps, rather than one checkpoint aborting on the cap and the next one repeating the abort.
  it('keeps publishing checkpoints within the caps under a sustained message backlog', async () => {
    const sequencer = t.context.aztecNodeService.getSequencer()!;
    // Production is paused while the batches are sent, so the demand measured here is the demand the first
    // checkpoint after the resume faces: a running sequencer consumes part of the backlog while the L1 sends land,
    // which would leave the outstanding backlog below the cap this test is about.
    await t.cheatCodes.rollup.markAsProven();
    await sequencer.pause();
    const blockBefore = await aztecNode.getBlockNumber();
    const consumedBefore = await consumedThrough(blockBefore);
    const { inboxTotal, bucketEnds } = await sendBacklog();
    await waitForArchiverToObserve(inboxTotal);
    expect(inboxTotal - consumedBefore).toBeGreaterThan(BigInt(MAX_L1_TO_L2_MSGS_PER_CHECKPOINT));

    // Resuming at a slot boundary gives the proposer that faces the backlog its whole build frame.
    await t.monitor.waitUntilNextL2Slot();
    await sequencer.start();

    const drainedAt = await withBackgroundFeeder(() => waitForBacklogDrained(inboxTotal, blockBefore));
    const blocks = await getBlocks(BlockNumber(blockBefore + 1), drainedAt);
    const consuming = blocks.filter((block, i) => {
      const parent =
        i === 0 ? consumedBefore : BigInt(blocks[i - 1].header.state.l1ToL2MessageTree.nextAvailableLeafIndex);
      return BigInt(block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex) > parent;
    });
    log.warn(`Backlog of ${inboxTotal - consumedBefore} messages drained`, {
      blocks: consuming.map(b => ({
        number: b.number,
        checkpoint: b.checkpointNumber,
        consumedThrough: b.header.state.l1ToL2MessageTree.nextAvailableLeafIndex,
      })),
    });

    // Per-block and per-checkpoint caps hold, and every checkpoint ends at a bucket end (the batch totals).
    let previous = consumedBefore;
    const perCheckpoint = new Map<number, bigint>();
    for (const block of blocks) {
      const end = BigInt(block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex);
      expect(end - previous).toBeLessThanOrEqual(BigInt(MAX_L1_TO_L2_MSGS_PER_BLOCK));
      perCheckpoint.set(block.checkpointNumber, (perCheckpoint.get(block.checkpointNumber) ?? 0n) + (end - previous));
      previous = end;
    }
    for (const consumed of perCheckpoint.values()) {
      expect(consumed).toBeLessThanOrEqual(BigInt(MAX_L1_TO_L2_MSGS_PER_CHECKPOINT));
    }
    const lastCheckpoint = blocks.at(-1)!.checkpointNumber;
    await waitForNodeCheckpoint(aztecNode, lastCheckpoint, { timeout: t.constants.slotDuration * 3 });
    for (const checkpointNumber of perCheckpoint.keys()) {
      const [checkpoint] = await aztecNode.getCheckpoints(CheckpointNumber(checkpointNumber), 1, {
        includeBlocks: true,
      });
      const lastBlock = checkpoint.blocks.at(-1)!;
      const endsAt = BigInt(lastBlock.header.state.l1ToL2MessageTree.nextAvailableLeafIndex);
      expect([consumedBefore, ...bucketEnds]).toContain(endsAt);
    }
    // The drain needed more than one checkpoint, and no checkpoint in between went without consuming.
    const checkpointsSpanned = [...perCheckpoint.keys()];
    expect(checkpointsSpanned.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...checkpointsSpanned) - Math.min(...checkpointsSpanned) + 1).toEqual(checkpointsSpanned.length);
  });

  // A proposer that starts its checkpoint late has fewer sub-slots left, so its completion target has to come from
  // the blocks it can still build. With a backlog that those blocks can carry whole and no older bucket left behind
  // it, the late checkpoint publishes at that bucket end instead of giving up the slot.
  it('publishes a late checkpoint at the bucket end its remaining sub-slots can carry', async () => {
    // Two buckets, 440 messages: more than one block may consume and less than the remaining sub-slots can, and
    // the endpoint is the newest bucket, so no aged bucket is left unconsumed behind it.
    const { sequencer, targetSlot, consumedBefore, inboxTotal, bucketEnds } = await pauseAndFillUntilLateInto({
      batches: 2,
      subslotsIntoFrame: 1,
    });
    await sequencer.start();

    const checkpoint = await waitForCheckpointAtSlot(targetSlot);
    const consumed = BigInt(checkpoint.blocks.at(-1)!.header.state.l1ToL2MessageTree.nextAvailableLeafIndex);
    log.warn(`Late checkpoint ${checkpoint.number} built ${checkpoint.blocks.length} blocks`, {
      blocks: checkpoint.blocks.length,
      consumedBefore,
      consumedThrough: consumed,
    });

    expect(checkpoint.blocks.length).toBeLessThan(MAX_BLOCKS_PER_CHECKPOINT);
    // The newest bucket end, which is the whole backlog.
    expect(consumed).toEqual(inboxTotal);
    expect(bucketEnds).toContain(consumed);
    // More than one block's worth, so the checkpoint did consume toward its endpoint across the sub-slots it had.
    expect(consumed - consumedBefore).toBeGreaterThan(BigInt(MAX_L1_TO_L2_MSGS_PER_BLOCK));
    expect(consumed - consumedBefore).toBeLessThanOrEqual(
      BigInt(checkpoint.blocks.length * MAX_L1_TO_L2_MSGS_PER_BLOCK),
    );
  });

  // The same late start against an aged backlog whose mandatory prefix its remaining sub-slots cannot carry. L1
  // requires consuming through the fourth bucket (the fifth is the first endpoint the cap escape covers) and that
  // needs four blocks, so the checkpoint cannot be published at all: the proposer's own pre-broadcast preflight
  // rejects it and the slot is given up, and the following checkpoints, which have their whole build frame, consume
  // the mandatory prefix and then the rest.
  it('gives up a late slot whose aged backlog needs more blocks than it has left, then recovers', async () => {
    const { sequencer, targetSlot, blockBefore, consumedBefore, inboxTotal, bucketEnds } =
      await pauseAndFillUntilLateInto({ batches: BATCHES, subslotsIntoFrame: 2 });
    // The mandatory prefix needs more than the two sub-slots left, sits within the per-checkpoint cap, and the
    // bucket after it is past the cap, so it is the only endpoint the cap escape covers.
    const mandatoryEnd = bucketEnds[MANDATORY_BUCKETS - 1];
    expect(mandatoryEnd - consumedBefore).toBeGreaterThan(BigInt(2 * MAX_L1_TO_L2_MSGS_PER_BLOCK));
    expect(mandatoryEnd - consumedBefore).toBeLessThanOrEqual(BigInt(MAX_L1_TO_L2_MSGS_PER_CHECKPOINT));
    expect(inboxTotal - consumedBefore).toBeGreaterThan(BigInt(MAX_L1_TO_L2_MSGS_PER_CHECKPOINT));

    // Armed before the sequencer starts so the rejection cannot fire before anyone is listening.
    const rejection = t.waitForSequencerEvent(
      sequencer.getSequencer(),
      'header-validation-failed',
      args => args.slot === targetSlot,
      { timeout: t.constants.slotDuration * 3 * 1000 },
    );
    await sequencer.start();

    const { reason } = await rejection;
    log.warn(`Late checkpoint for slot ${targetSlot} was rejected before broadcast`, { reason });
    expect(reason).toContain('UnconsumedInboxMessages');

    await t.monitor.waitUntilL2Slot(SlotNumber(targetSlot + 1));
    expect(await hasCheckpointAtSlot(targetSlot)).toBe(false);

    const drainedAt = await withBackgroundFeeder(() => waitForBacklogDrained(inboxTotal, blockBefore));
    // The drain is only recovered once the consuming blocks are published, so the totals are read from the
    // checkpoints L1 holds rather than from the proposed tip.
    const firstCheckpoint = (await aztecNode.getBlock(BlockNumber(blockBefore + 1)))!.checkpointNumber;
    const lastCheckpoint = (await aztecNode.getBlock(drainedAt))!.checkpointNumber;
    await waitForNodeCheckpoint(aztecNode, CheckpointNumber(lastCheckpoint), {
      timeout: t.constants.slotDuration * 3,
    });
    const published = await aztecNode.getCheckpoints(
      CheckpointNumber(firstCheckpoint),
      lastCheckpoint - firstCheckpoint + 1,
      { includeBlocks: true },
    );
    const ends = published.map(c => BigInt(c.blocks.at(-1)!.header.state.l1ToL2MessageTree.nextAvailableLeafIndex));
    log.warn(`Backlog of ${inboxTotal - consumedBefore} messages drained after the late slot was given up`, {
      firstCheckpoint,
      lastCheckpoint,
      ends,
    });

    // Every checkpoint published while the aged backlog was outstanding ended at a bucket end the censorship assert
    // allows, which is the mandatory prefix and then the rest.
    for (const end of ends) {
      expect(bucketEnds).toContain(end);
    }
    expect(ends).toContain(mandatoryEnd);
    expect(ends).toContain(inboxTotal);
  });
});
