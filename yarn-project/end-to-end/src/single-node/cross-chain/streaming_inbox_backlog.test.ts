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
  const sendBacklog = async () => {
    const bucketEnds: bigint[] = [];
    for (let i = 0; i < BATCHES; i++) {
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

  // A backlog above the per-checkpoint cap drains over successive checkpoints, each publishing at a live bucket end
  // within the caps, rather than one checkpoint aborting on the cap and the next one repeating the abort.
  it('keeps publishing checkpoints within the caps under a sustained message backlog', async () => {
    const blockBefore = await aztecNode.getBlockNumber();
    const consumedBefore = await consumedThrough(blockBefore);
    const { inboxTotal, bucketEnds } = await sendBacklog();
    expect(inboxTotal - consumedBefore).toBeGreaterThan(BigInt(MAX_L1_TO_L2_MSGS_PER_CHECKPOINT));

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

  // A proposer that starts its checkpoint late has fewer sub-slots left. Its completion target must be derived
  // from the blocks it can still build, not from the full schedule: with a backlog of several buckets, a checkpoint
  // that only has two sub-slots left ends at a live bucket end within two blocks' worth of messages and publishes,
  // instead of targeting a bucket end its remaining blocks cannot carry and aborting on the cap.
  it('derives the completion capacity from the sub-slots left when the proposer starts late', async () => {
    const sequencer = t.context.aztecNodeService.getSequencer()!;
    const { slotDuration, ethereumSlotDuration } = t.constants;
    const blockDuration = 6;

    await sequencer.pause();
    const blockBefore = await aztecNode.getBlockNumber();
    const consumedBefore = await consumedThrough(blockBefore);
    const { inboxTotal, bucketEnds } = await sendBacklog();
    await retryUntil(
      async () => (await archiver.getSyncedMessagePosition()).totalMessageCount >= inboxTotal,
      'archiver observes the whole backlog',
      ethereumSlotDuration * 4,
      0.5,
    );

    // Resume two sub-slots into the build frame of a slot far enough ahead that the frame has not opened yet.
    const currentSlot = getSlotAtTimestamp(BigInt(await t.cheatCodes.eth.lastBlockTimestamp()), t.constants);
    const targetSlot = SlotNumber(Number(currentSlot) + 3);
    const buildFrameStart = Number(getTimestampForSlot(targetSlot, t.constants)) - slotDuration - ethereumSlotDuration;
    const lateStart = buildFrameStart + 2 * blockDuration + 1;
    log.warn(`Resuming the sequencer two sub-slots into the build frame of slot ${targetSlot}`, {
      targetSlot,
      buildFrameStart,
      lateStart,
    });
    await t.monitor.waitUntilL1Timestamp(lateStart);
    await sequencer.start();

    // The late checkpoint publishes with what its remaining sub-slots can carry, ending at a bucket end.
    await t.monitor.waitUntilL2Slot(SlotNumber(targetSlot + 1));
    const checkpoint = await retryUntil(
      async () => {
        const tip = await aztecNode.getCheckpointNumber();
        const recent = await aztecNode.getCheckpoints(CheckpointNumber(Math.max(1, tip - 3)), 4, {
          includeBlocks: true,
        });
        return recent.find(c => c.header.slotNumber === targetSlot);
      },
      `checkpoint for slot ${targetSlot} published`,
      slotDuration * 2,
      0.5,
    );
    const consumed = BigInt(checkpoint.blocks.at(-1)!.header.state.l1ToL2MessageTree.nextAvailableLeafIndex);
    log.warn(`Late checkpoint ${checkpoint.number} built ${checkpoint.blocks.length} blocks`, {
      blocks: checkpoint.blocks.length,
      consumedBefore,
      consumedThrough: consumed,
    });
    expect(checkpoint.blocks.length).toBeLessThan(4);
    expect(consumed).toBeGreaterThan(consumedBefore);
    expect(consumed - consumedBefore).toBeLessThanOrEqual(
      BigInt(checkpoint.blocks.length * MAX_L1_TO_L2_MSGS_PER_BLOCK),
    );
    expect(bucketEnds).toContain(consumed);

    // The rest of the backlog drains in the following checkpoints.
    await withBackgroundFeeder(() => waitForBacklogDrained(inboxTotal, blockBefore));
  });
});
