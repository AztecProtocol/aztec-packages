import type { Archiver } from '@aztec/archiver';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { InboxAbi } from '@aztec/l1-artifacts';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { ProposedCheckpointData } from '@aztec/stdlib/checkpoint';

import { jest } from '@jest/globals';
import { parseEventLogs } from 'viem';

import { L1_DIRECT_WRITE_ACCOUNT_INDEX, PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { waitForNodeCheckpoint } from '../../fixtures/wait_helpers.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';
import { createL1ToL2MessageHelpers } from './message_test_helpers.js';

jest.setTimeout(900_000);

// Streaming Inbox coverage of what happens at Inbox bucket boundaries. Buckets are keyed by L1 block timestamp,
// and Ethereum's strictly increasing timestamps close a bucket the moment its block is mined, so on a real chain a
// bucket is observed whole. anvil is the exception: two blocks can share a timestamp and therefore a bucket, which
// is the only way a test can make one bucket span two L2 blocks or grow a bucket after a checkpoint selected its end
// as the final endpoint. Both cases here mine such co-timestamped blocks by hand with L1 interval mining paused for
// well under an L2 slot (the sequencer stops building once the archiver's synced slot falls more than one slot behind
// the wall clock).
//
// Same environment as streaming_inbox.test.ts (36s slots / 6s blocks, message-only blocks allowed), plus a prover
// node so the checkpoint containing a split bucket has to be accepted by an actual prover, not just marked proven.
describe('single-node/cross-chain/streaming_inbox_buckets', () => {
  let t: CrossChainMessagingTest;

  let log: Logger;
  let aztecNode: AztecNode;
  let archiver: Archiver;
  let wallet: Wallet;
  let user1Address: AztecAddress;
  let testContract: TestContract;

  let sendMessageToL2: ReturnType<typeof createL1ToL2MessageHelpers>['sendMessageToL2'];

  beforeAll(async () => {
    t = new CrossChainMessagingTest(
      'streaming_inbox_buckets',
      {
        ...PIPELINING_SETUP_OPTS,
        aztecSlotDuration: 36,
        blockDurationMs: 6000,
        minTxsPerBlock: 0,
        startProverNode: true,
      },
      { aztecProofSubmissionEpochs: 2, aztecEpochDuration: 4 },
      { syncChainTip: 'checkpointed' },
      { l1HarnessAccountIndex: L1_DIRECT_WRITE_ACCOUNT_INDEX, deployTokenBridge: false },
    );
    await t.setup();

    ({ logger: log, wallet, user1Address, aztecNode } = t);
    archiver = t.context.aztecNodeService.getBlockSource() as Archiver;
    ({ contract: testContract } = await TestContract.deploy(wallet).send({ from: user1Address }));

    ({ sendMessageToL2 } = createL1ToL2MessageHelpers({
      t,
      aztecNode,
      wallet,
      user1Address,
      log,
      // The prover node proves epochs; nothing is marked proven by hand in this suite.
      markAsProven: () => Promise.resolve(),
    }));
  }, 600_000);

  afterAll(async () => {
    await t.teardown();
  });

  const randomMessage = async () => {
    const [, secretHash] = await generateClaimSecret();
    return { recipient: testContract.address, content: Fr.random(), secretHash };
  };

  /**
   * Mines a message in an L1 block carrying exactly `timestamp`. Only valid with interval mining paused: the send is
   * left pending, the next block's timestamp forced and one block mined. Fails if anvil did not honor the timestamp,
   * since a bumped timestamp would put the message in a fresh bucket and the test would pass for the wrong reason.
   */
  const mineMessageAt = async (timestamp: bigint) => {
    const eth = t.cheatCodes.eth;
    const sent = sendMessageToL2(await randomMessage());
    await retryUntil(async () => (await eth.getTxPoolStatus()).pending > 0, 'message tx pending on L1', 10, 0.1);
    await eth.setNextBlockTimestamp(Number(timestamp));
    await eth.evmMine();
    const { msgHash, globalLeafIndex, txReceipt } = await sent;
    const block = await t.harnessL1Client.getBlock({ blockNumber: txReceipt.blockNumber });
    if (block.timestamp !== timestamp) {
      throw new Error(`anvil mined L1 block ${block.number} at ${block.timestamp}, not at the requested ${timestamp}`);
    }
    const [event] = parseEventLogs({ abi: InboxAbi, eventName: 'MessageSent', logs: txReceipt.logs });
    log.warn(`Mined message ${msgHash.toString()} in L1 block ${block.number} at timestamp ${timestamp}`, {
      index: globalLeafIndex.toBigInt(),
      bucketSeq: event.args.bucketSeq,
    });
    return { msgHash, index: globalLeafIndex.toBigInt(), bucketSeq: event.args.bucketSeq, l1BlockNumber: block.number };
  };

  /** The first L2 block at or after `fromBlock` whose committed message tree holds `msgHash`. */
  const findInsertingBlock = (node: AztecNode, msgHash: Fr, fromBlock: BlockNumber) =>
    retryUntil(
      async () => {
        const tip = await node.getBlockNumber();
        for (let n = fromBlock; n <= tip; n = BlockNumber(n + 1)) {
          if ((await node.getL1ToL2MessageMembershipWitness(n, msgHash)) !== undefined) {
            const data = (await node.getBlockData(n))!;
            return { blockNumber: n, checkpointNumber: data.checkpointNumber, index: data.indexWithinCheckpoint };
          }
        }
        return undefined;
      },
      `find block inserting message ${msgHash.toString()}`,
      t.constants.slotDuration * 3,
      0.5,
    );

  // One bucket split across two L2 blocks: the first message is consumed as soon as it is observed, the second one
  // extends the same bucket in a co-timestamped block and is consumed by a later L2 block. A node syncing from L1
  // afterwards replays the count-addressed ranges and reproduces both blocks, and the prover accepts the checkpoint.
  it('splits one bucket across L2 blocks, replays it on a fresh node and proves the checkpoint', async () => {
    const eth = t.cheatCodes.eth;
    const blockAtStart = await aztecNode.getBlockNumber();

    const { first, second, insertingFirst } = await eth.execWithPausedAnvil(async () => {
      const timestamp = BigInt(await eth.lastBlockTimestamp()) + 1n;
      const first = await mineMessageAt(timestamp);
      // Observed messages enter the next block; nothing waits for a later L1 block.
      const insertingFirst = await findInsertingBlock(aztecNode, first.msgHash, BlockNumber(blockAtStart + 1));
      const second = await mineMessageAt(timestamp);
      return { first, second, insertingFirst };
    });
    expect(second.bucketSeq).toEqual(first.bucketSeq);

    const insertingSecond = await findInsertingBlock(aztecNode, second.msgHash, insertingFirst.blockNumber);
    log.warn(`Bucket ${first.bucketSeq} split across L2 blocks`, { insertingFirst, insertingSecond });
    expect(insertingSecond.blockNumber).toBeGreaterThan(insertingFirst.blockNumber);

    // The checkpoint holding the second half lands and is proven by the prover node.
    const checkpointNumber = insertingSecond.checkpointNumber;
    await waitForNodeCheckpoint(aztecNode, checkpointNumber, { timeout: t.constants.slotDuration * 3 });
    await waitForNodeCheckpoint(aztecNode, checkpointNumber, {
      tag: 'proven',
      timeout: t.constants.slotDuration * t.epochDuration * 3,
    });

    // A node without any of this history rebuilds it from L1 alone: the same blocks, with the bucket split the same way.
    const freshNode = await t.createNonValidatorNode();
    await waitForNodeCheckpoint(freshNode, checkpointNumber, { timeout: t.constants.slotDuration * 3 });
    for (const node of [aztecNode, freshNode]) {
      expect(await node.getL1ToL2MessageMembershipWitness(insertingFirst.blockNumber, first.msgHash)).toBeDefined();
      expect(await node.getL1ToL2MessageMembershipWitness(insertingFirst.blockNumber, second.msgHash)).toBeUndefined();
      expect(await node.getL1ToL2MessageMembershipWitness(insertingSecond.blockNumber, second.msgHash)).toBeDefined();
    }
    const [local, fresh] = await Promise.all(
      [aztecNode, freshNode].map(node => node.getBlockData(insertingSecond.blockNumber)),
    );
    expect(fresh!.blockHash).toEqual(local!.blockHash);
  });

  // A checkpoint selects its final endpoint as the end of the newest bucket and signs it. The bucket then grows in a
  // co-timestamped block, so no bucket ends where the signed checkpoint does: publication must be refused and the
  // slot given up, with nothing re-signed for it. The message log is untouched (every earlier prefix keeps its
  // index), and the next checkpoint consumes through the extended bucket.
  it('abandons a signed checkpoint whose final endpoint vanished and keeps consuming from the preserved prefixes', async () => {
    const eth = t.cheatCodes.eth;
    const sequencer = t.context.aztecNodeService.getSequencer()!.getSequencer();
    const { slotDuration } = t.constants;

    // Send while a checkpoint is early in its build, so the signed proposal that consumes the message arrives within
    // the pause budget: the final block of a 4-block checkpoint is at most three sub-slots away.
    await retryUntil(
      async () => (await aztecNode.getBlockData(await aztecNode.getBlockNumber()))!.indexWithinCheckpoint <= 1,
      'a checkpoint build is in its first half',
      slotDuration * 2,
      0.5,
    );

    let proposed: ProposedCheckpointData;
    const { endpointMsg, extension } = await eth.execWithPausedAnvil(async () => {
      const timestamp = BigInt(await eth.lastBlockTimestamp()) + 1n;
      const endpointMsg = await mineMessageAt(timestamp);

      // The checkpoint being built consumes the message and signs the end of its bucket as the final position.
      proposed = await retryUntil(
        async () => {
          const data = await archiver.getProposedCheckpointData();
          return data !== undefined && data.inboxMsgTotal > endpointMsg.index ? data : undefined;
        },
        'checkpoint consuming the message is signed',
        slotDuration,
        0.2,
      );
      expect(proposed.inboxMsgTotal).toEqual(endpointMsg.index + 1n);

      // Extend the same bucket after signing: the endpoint the checkpoint committed to is no longer a bucket end.
      const extension = await mineMessageAt(timestamp);
      expect(extension.bucketSeq).toEqual(endpointMsg.bucketSeq);
      return { endpointMsg, extension };
    });
    const abandonedSlot = proposed!.header.slotNumber;
    log.warn(`Checkpoint ${proposed!.checkpointNumber} for slot ${abandonedSlot} lost its endpoint`, {
      inboxMsgTotal: proposed!.inboxMsgTotal,
      extensionIndex: extension.index,
    });

    // Publication is refused and the slot given up. The refusal is the send-time L1 bundle simulation, not the
    // pre-publication preflight: the propose is enqueued as soon as the checkpoint is signed, so the preflight runs
    // before the extension exists, and it is the simulation at the target slot that finds no bucket ending at the
    // signed endpoint and reverts with Rollup__InvalidInboxRollingHash.
    await t.waitForSequencerEvent(sequencer, 'checkpoint-publish-failed', args => args.slot === abandonedSlot, {
      timeout: slotDuration * 2 * 1000,
    });

    // Nothing was published for the abandoned slot: the checkpoint number it would have taken went to a later slot.
    // Awaited before the extension is located, because the blocks pipelined on top of the abandoned checkpoint are
    // still local at this point and are only pruned once the slot closes uncheckpointed.
    await waitForNodeCheckpoint(aztecNode, proposed!.checkpointNumber, { timeout: slotDuration * 4 });
    const [republished] = await aztecNode.getCheckpoints(proposed!.checkpointNumber, 1);
    expect(republished.header.slotNumber).toBeGreaterThan(abandonedSlot);
    const published = await aztecNode.getCheckpoints(proposed!.checkpointNumber, 10);
    expect(published.map(c => c.header.slotNumber)).not.toContain(abandonedSlot);

    // The extended bucket is consumed by a later checkpoint, with the earlier messages' prefixes untouched.
    const insertingExtension = await findInsertingBlock(aztecNode, extension.msgHash, BlockNumber(1));
    expect(await archiver.getL1ToL2MessageIndex(endpointMsg.msgHash)).toEqual(endpointMsg.index);
    expect(await archiver.getL1ToL2MessageIndex(extension.msgHash)).toEqual(extension.index);
    expect(
      await aztecNode.getL1ToL2MessageMembershipWitness(insertingExtension.blockNumber, endpointMsg.msgHash),
    ).toBeDefined();
  });
});
