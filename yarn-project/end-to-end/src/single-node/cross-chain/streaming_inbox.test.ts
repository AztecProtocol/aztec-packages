import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { TxExecutionResult } from '@aztec/aztec.js/tx';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { INBOX_LAG_SECONDS } from '@aztec/constants';
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { getSlotAtTimestamp, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';

import { L1_DIRECT_WRITE_ACCOUNT_INDEX, PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';
import { createL1ToL2MessageHelpers } from './message_test_helpers.js';

jest.setTimeout(600_000);

// Streaming Inbox e2e coverage the legacy per-checkpoint suite could not express: when every L1->L2 message
// entered at the first block of the *next* checkpoint, mid-checkpoint inclusion, message-only blocks, and
// per-block streaming latency had no observable surface. Runs the production
// pipelining sequencer via CrossChainMessagingTest with a widened slot (36s / 6s blocks -> up to ~4 blocks
// per checkpoint) so a message can become lag-eligible partway through a checkpoint and land in a non-first
// block. minTxsPerBlock=0 lets a checkpoint carry a zero-tx block whose only content is a streaming bundle.
//
// Grounded on l1_to_l2.test.ts (send/wait helpers, TestContract arbitrary-sender consume) and
// cross_chain_public_message.test.ts (same-block public consume). All cases share one node stood up once.
describe('single-node/cross-chain/streaming_inbox', () => {
  let t: CrossChainMessagingTest;

  let log: Logger;
  let aztecNode: AztecNode;
  let wallet: Wallet;
  let user1Address: AztecAddress;
  let testContract: TestContract;

  let sendMessageToL2: ReturnType<typeof createL1ToL2MessageHelpers>['sendMessageToL2'];
  let advanceBlock: ReturnType<typeof createL1ToL2MessageHelpers>['advanceBlock'];
  let waitForMessageReady: ReturnType<typeof createL1ToL2MessageHelpers>['waitForMessageReady'];

  const markAsProven = () => t.cheatCodes.rollup.markAsProven();

  beforeAll(async () => {
    t = new CrossChainMessagingTest(
      'streaming_inbox',
      // A 36s slot with 6s blocks yields up to ~4 blocks per checkpoint (the pipelining timing model gives
      // maxBlocks = floor((36 - 0.5 - (0.5 + D)) / D) = 4 for D=6), which is what lets a message aged past
      // INBOX_LAG_SECONDS land in a non-first block of the same checkpoint. minTxsPerBlock=0 permits a
      // zero-tx message-only block (the FI-05 relaxation).
      { ...PIPELINING_SETUP_OPTS, aztecSlotDuration: 36, blockDurationMs: 6000, minTxsPerBlock: 0 },
      { aztecProofSubmissionEpochs: 2, aztecEpochDuration: 4 },
      { syncChainTip: 'checkpointed' },
      // Pass arbitrary L1->L2 messages straight to a TestContract; no token bridge needed.
      { l1HarnessAccountIndex: L1_DIRECT_WRITE_ACCOUNT_INDEX, deployTokenBridge: false },
    );
    await t.setup();

    ({ logger: log, wallet, user1Address, aztecNode } = t);
    ({ contract: testContract } = await TestContract.deploy(wallet).send({ from: user1Address }));

    ({ sendMessageToL2, advanceBlock, waitForMessageReady } = createL1ToL2MessageHelpers({
      t,
      aztecNode,
      wallet,
      user1Address,
      log,
      markAsProven,
    }));
  }, 600_000);

  afterAll(async () => {
    await t.teardown();
  });

  /** The L1 block timestamp at which an L1->L2 message was inserted; equals the message's Inbox bucket key. */
  const getMessageL1Timestamp = async (l1BlockNumber: bigint): Promise<bigint> => {
    const block = await t.harnessL1Client.getBlock({ blockNumber: l1BlockNumber });
    return block.timestamp;
  };

  /**
   * Finds the L2 block that inserted `msgHash` into the L1-to-L2 message tree by scanning forward from
   * `fromBlock` for the first block whose committed tree resolves a membership witness. Under the streaming
   * Inbox a message enters the tree at the block that consumes its Inbox bucket, which need not be the first
   * block of a checkpoint. Returns the block-data (checkpoint number + index within checkpoint) of that block.
   */
  const findInsertingBlock = (msgHash: Fr, fromBlock: BlockNumber) => {
    return retryUntil(
      async () => {
        const tip = await aztecNode.getBlockNumber();
        for (let n = fromBlock; n <= tip; n = BlockNumber(n + 1)) {
          const witness = await aztecNode.getL1ToL2MessageMembershipWitness(n, msgHash);
          if (witness !== undefined) {
            const data = await aztecNode.getBlockData(n);
            return { blockNumber: n, checkpointNumber: data!.checkpointNumber, index: data!.indexWithinCheckpoint };
          }
        }
        return undefined;
      },
      `find block inserting message ${msgHash.toString()}`,
      240,
      0.5,
    );
  };

  /**
   * Runs `fn` while a background loop feeds empty txs, so checkpoints build multiple blocks promptly rather
   * than stalling on an empty pool. advanceBlock also refreshes the L1 proof window, keeping the chain from
   * pruning mid-test. Callers must pass a no-op `onNotReady` to any readiness wait so it does not send its own
   * wallet txs concurrently (which would race the feeder on the wallet nonce).
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

  // Test 1 (mid-checkpoint inclusion): a message sent mid-checkpoint becomes available in a *later* block of
  // the same checkpoint (indexWithinCheckpoint > 0), which the legacy first-block-of-next-checkpoint flow
  // could never produce. Feeds a steady tx stream so checkpoints fill to multiple blocks, times the send so
  // the message ages past INBOX_LAG_SECONDS partway through a checkpoint's build, then locates the inserting
  // block. Retries with fresh messages so a message that happens to age exactly at a checkpoint boundary (and
  // lands at index 0) does not fail the run.
  it('includes a message in a non-first block of a checkpoint (mid-checkpoint streaming)', async () => {
    const { slotDuration } = t.constants;

    await withBackgroundFeeder(async () => {
      let inserting: { blockNumber: BlockNumber; checkpointNumber: number; index: number } | undefined;
      let insertedMsgHash: Fr | undefined;

      for (let attempt = 0; attempt < 4 && inserting === undefined; attempt++) {
        // Aim the send so the message ages past the lag partway through a checkpoint's build window. The
        // eligibility instant is T + INBOX_LAG_SECONDS; targeting it a few seconds into an upcoming build
        // window lands it on a non-first block across the ~4-block checkpoint. The eligible window is wide
        // (any block after the first whose build time exceeds T + lag), so exact timing is not required.
        const nowTs = BigInt(await t.cheatCodes.eth.lastBlockTimestamp());
        const currentSlot = getSlotAtTimestamp(nowTs, t.constants);
        const targetSlot = SlotNumber(Number(currentSlot) + 3);
        const sendTargetTs = getTimestampForSlot(targetSlot, t.constants) - BigInt(INBOX_LAG_SECONDS) + 4n;
        log.warn(`Attempt ${attempt}: waiting for L1 to reach ${sendTargetTs} before sending message`, {
          currentSlot,
          targetSlot,
        });
        await retryUntil(
          async () => BigInt(await t.cheatCodes.eth.lastBlockTimestamp()) >= sendTargetTs,
          `L1 reaches ${sendTargetTs}`,
          Number(slotDuration) * 6,
          0.2,
        );

        const blockAtSend = await aztecNode.getBlockNumber();
        const [, secretHash] = await generateClaimSecret();
        const message = { recipient: testContract.address, content: Fr.random(), secretHash };
        const { msgHash } = await sendMessageToL2(message);
        log.warn(`Sent message ${msgHash.toString()} at block ${blockAtSend}`);

        // The background feeder drives block production; findInsertingBlock polls the committed tree without
        // sending its own wallet txs (which would race the feeder on the nonce).
        const found = await findInsertingBlock(msgHash, BlockNumber(blockAtSend + 1));
        log.warn(`Message ${msgHash.toString()} inserted at block ${found.blockNumber}`, {
          checkpointNumber: found.checkpointNumber,
          index: found.index,
        });

        if (found.index > 0) {
          inserting = found;
          insertedMsgHash = msgHash;
        } else {
          log.warn(`Message landed at index 0 (checkpoint boundary); retrying with a fresh message`);
        }
      }

      expect(inserting).toBeDefined();
      // A non-first block of its checkpoint carried the message: streaming placed it mid-checkpoint, which the
      // legacy path (all messages at the first block of the next checkpoint) could never do.
      expect(inserting!.index).toBeGreaterThan(0);
      // The immediately preceding block did not yet have the message, confirming this block is the one that
      // inserted it (rather than the message having been present since an earlier block of the checkpoint).
      const priorWitness = await aztecNode.getL1ToL2MessageMembershipWitness(
        BlockNumber(inserting!.blockNumber - 1),
        insertedMsgHash!,
      );
      expect(priorWitness).toBeUndefined();
    });
  });

  // Test 2 (latency bound): the delay between a message's L1 inclusion and the L2 block that makes it
  // available stays within the streaming bound. Asserted in slot-denominated terms (L1/L2 timestamps, not
  // wall-clock): the including block's timestamp minus the message's L1 timestamp must be at most
  // INBOX_LAG_SECONDS + 2 * slotDuration (lag + a full slot straddle + one slot of CI slack). No lower bound
  // is asserted (eligibility is already enforced by L1 and the validator). The wall-clock latency is logged
  // for information only.
  it('makes a message available within the streaming latency bound', async () => {
    const { slotDuration } = t.constants;
    const maxDelaySeconds = BigInt(INBOX_LAG_SECONDS) + 2n * BigInt(slotDuration);

    await withBackgroundFeeder(async () => {
      const blockAtSend = await aztecNode.getBlockNumber();
      const wallClockAtSend = Date.now();
      const [, secretHash] = await generateClaimSecret();
      const message = { recipient: testContract.address, content: Fr.random(), secretHash };
      const { msgHash, txReceipt } = await sendMessageToL2(message);
      const messageL1Ts = await getMessageL1Timestamp(txReceipt.blockNumber!);
      log.warn(`Sent message ${msgHash.toString()} with L1 timestamp ${messageL1Ts}`);

      // The background feeder drives block production; findInsertingBlock polls the committed tree without
      // sending its own wallet txs (which would race the feeder on the nonce).
      const inserting = await findInsertingBlock(msgHash, BlockNumber(blockAtSend + 1));
      const wallClockLatencyMs = Date.now() - wallClockAtSend;
      const insertingBlock = (await aztecNode.getBlock(inserting.blockNumber))!;
      const includingBlockTs = insertingBlock.header.globalVariables.timestamp;
      const delaySeconds = includingBlockTs - messageL1Ts;

      // Informational only (A-1178 timings style): the wall-clock number flakes under CI load, so it is never
      // asserted on; the slot-denominated bound below is the real check.
      log.warn(`Streaming latency for message ${msgHash.toString()}`, {
        messageL1Ts,
        includingBlockTs,
        delaySeconds: Number(delaySeconds),
        maxDelaySeconds: Number(maxDelaySeconds),
        wallClockLatencyMs,
      });

      expect(delaySeconds).toBeGreaterThan(0n);
      expect(delaySeconds).toBeLessThanOrEqual(maxDelaySeconds);
    });
  });

  // Test 3 (message-only block): on an empty tx pool, the block that consumes a message carries zero txs and a
  // non-empty streaming bundle (the FI-05 shape exercised on a live chain), and the chain keeps proving past
  // it. Drains the pool first, then sends a single message and asserts the inserting block has no tx effects.
  it('produces a message-only block on an empty tx pool and keeps proving', async () => {
    // Let the pool drain so the checkpoint that consumes the message is not padded with unrelated txs.
    await retryUntil(
      async () => !(await aztecNode.getPendingTxCount()),
      'tx pool drains',
      Number(t.constants.slotDuration) * 3,
      0.5,
    );

    const blockAtSend = await aztecNode.getBlockNumber();
    const [, secretHash] = await generateClaimSecret();
    const message = { recipient: testContract.address, content: Fr.random(), secretHash };
    const { msgHash } = await sendMessageToL2(message);
    log.warn(`Sent message ${msgHash.toString()} on an empty pool`);

    // Do not feed txs; the sequencer builds empty checkpoints until the message ages past the lag, at which
    // point a zero-tx block consumes it. findInsertingBlock polls the committed tree without sending txs, so
    // the pool stays empty and the block that consumes the message carries only the bundle.
    const inserting = await findInsertingBlock(msgHash, BlockNumber(blockAtSend + 1));

    const insertingBlock = (await aztecNode.getBlock(inserting.blockNumber, { includeTransactions: true }))!;
    log.warn(`Message ${msgHash.toString()} inserted at block ${inserting.blockNumber}`, {
      checkpointNumber: inserting.checkpointNumber,
      index: inserting.index,
      txCount: insertingBlock.body.txEffects.length,
    });

    // The inserting block carried the message with no txs: a message-only block.
    expect(insertingBlock.body.txEffects.length).toBe(0);
    // The membership witness resolving proves the block's bundle was non-empty (it inserted the message).
    expect(await aztecNode.getL1ToL2MessageMembershipWitness('latest', msgHash)).toBeDefined();

    // The chain keeps proving past the message-only block.
    await markAsProven();
    await retryUntil(
      async () => (await aztecNode.getBlockNumber('proven')) >= inserting.blockNumber,
      `proven tip reaches block ${inserting.blockNumber}`,
      Number(t.constants.slotDuration) * t.epochDuration * 3,
      1,
    );
    expect(await aztecNode.getBlockNumber('proven')).toBeGreaterThanOrEqual(inserting.blockNumber);
  });

  // Test 4 (send-then-consume on the streaming path): a message inserted by the streaming Inbox is consumed by
  // a public L2 tx, passing the compact leaf index, and cannot be consumed twice. Same-block consumption is
  // available post-A-1432 (a block's BlockConstantData.l1_to_l2_tree_snapshot pins to that block's post-bundle
  // root, so the public/AVM read sees the just-inserted message), but which block consumes the message relative
  // to its insertion depends on sequencer timing under the production sequencer; the block relationship is
  // logged for visibility while the robust invariants asserted are the successful compact-index consume and the
  // double-spend revert. Mirrors cross_chain_public_message.test.ts.
  it('consumes a streaming-inserted message by compact index and rejects double-spend', async () => {
    const l1Account = t.ethAccount;
    const blockAtSend = await aztecNode.getBlockNumber();
    const [secret, secretHash] = await generateClaimSecret();
    const message = { recipient: testContract.address, content: Fr.random(), secretHash };
    const { msgHash, globalLeafIndex } = await sendMessageToL2(message);
    log.warn(`Sent message ${msgHash.toString()} with compact index ${globalLeafIndex}`);

    await waitForMessageReady(msgHash, 'public');
    const inserting = await findInsertingBlock(msgHash, BlockNumber(blockAtSend + 1));

    const { receipt: txReceipt } = await testContract.methods
      .consume_message_from_arbitrary_sender_public(message.content, secret, l1Account, globalLeafIndex.toBigInt())
      .send({ from: user1Address });
    expect(txReceipt.blockNumber).toBeGreaterThan(0);
    // The compact leaf index from the Inbox event resolves to the same message the node inserted.
    const [resolvedIndex] = (await aztecNode.getL1ToL2MessageMembershipWitness('latest', msgHash))!;
    expect(resolvedIndex).toBe(globalLeafIndex.toBigInt());
    log.warn(`Consumed message ${msgHash.toString()} in block ${txReceipt.blockNumber}`, {
      insertingBlock: inserting.blockNumber,
      consumeBlock: txReceipt.blockNumber,
      sameBlock: Number(txReceipt.blockNumber) === Number(inserting.blockNumber),
    });

    // The message was inserted and consumed; a second consume must revert (the leaf is nullified).
    const { receipt: failedReceipt } = await testContract.methods
      .consume_message_from_arbitrary_sender_public(message.content, secret, l1Account, globalLeafIndex.toBigInt())
      .send({ from: user1Address, wait: { dontThrowOnRevert: true } });
    expect(failedReceipt.executionResult).toBe(TxExecutionResult.REVERTED);
  });
});
