import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { jest } from '@jest/globals';

import { L1_DIRECT_WRITE_ACCOUNT_INDEX, PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { waitForBlockNumber } from '../../fixtures/wait_helpers.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';
import { type L1ToL2MessageScope, createL1ToL2MessageHelpers } from './message_test_helpers.js';

jest.setTimeout(300_000);

// L1→L2 messaging via Inbox: an L1→L2 message survives a rollup prune. Uses CrossChainMessagingTest
// (prod sequencer, pipelining preset: ethSlot=4s, aztecSlot=12s, inboxLag=2, minTxsPerBlock=1,
// aztecProofSubmissionEpochs=2, aztecEpochDuration=4) with EpochTestSettler for auto-proving. Messages
// carry a compact L1-assigned index and stream in by insertion order rather than
// pinning to a checkpoint, so a message inserted while the proposed chain drifts must still be
// re-consumed with a stable index after the chain prunes back. Runs over private and public scope via
// it.each, sharing one node stood up once in beforeAll.
describe('single-node/cross-chain/l1_to_l2_inbox_drift', () => {
  let t: CrossChainMessagingTest;

  let log: Logger;
  let aztecNode: AztecNode;
  let wallet: Wallet;
  let user1Address: AztecAddress;
  let testContract: TestContract;

  let sendMessageToL2: ReturnType<typeof createL1ToL2MessageHelpers>['sendMessageToL2'];
  let advanceBlock: ReturnType<typeof createL1ToL2MessageHelpers>['advanceBlock'];
  let waitForMessageReady: ReturnType<typeof createL1ToL2MessageHelpers>['waitForMessageReady'];

  // Whether explicit mark-as-proven calls are honored. The inbox-drift scenario flips this to
  // false to let the proposed chain drift and prune.
  let markProvenEnabled = true;

  // Marks the current pending tip proven on L1, gated by `markProvenEnabled`. The e2e fixture runs
  // L1 on interval mining and nothing marks blocks proven automatically, so without these explicit
  // calls L1's `aztecProofSubmissionEpochs` window expires mid-test and prunes in-flight wallet txs.
  const markAsProven = async () => {
    if (!markProvenEnabled) {
      return;
    }
    await t.cheatCodes.rollup.markAsProven();
  };

  beforeAll(async () => {
    t = new CrossChainMessagingTest(
      'l1_to_l2_inbox_drift',
      // PIPELINING_SETUP_OPTS sets minTxsPerBlock=0; this test needs minTxsPerBlock=1 because it
      // manually mines blocks one tx at a time via advanceBlock() and counts checkpoints, so empty
      // pipelined checkpoints interleaving between txs would break the exact block-number assertions.
      { ...PIPELINING_SETUP_OPTS, minTxsPerBlock: 1 },
      { aztecProofSubmissionEpochs: 2, aztecEpochDuration: 4 },
      // Anchor PXE to the checkpointed chain so that a proposed-chain invalidation cascade
      // (e.g. a missed checkpoint publish that prunes the pipelined proposed chain) doesn't
      // drop the wallet's in-flight tx via handlePrunedBlocks.
      { syncChainTip: 'checkpointed' },
      // This suite only passes arbitrary L1→L2 messages to its own TestContract; it never bridges
      // tokens, so skip the token+portal+bridge deploy and use the test's L1 handles directly.
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
  }, 300_000);

  // Reset the proving gate before every it so a scenario that disabled it can't leak into the next.
  beforeEach(() => {
    markProvenEnabled = true;
  });

  afterAll(async () => {
    await t.teardown();
  });

  const getConsumeMethod = (scope: L1ToL2MessageScope) =>
    scope === 'private'
      ? testContract.methods.consume_message_from_arbitrary_sender_private
      : testContract.methods.consume_message_from_arbitrary_sender_public;

  const waitForBlockToCheckpoint = async (blockNumber: BlockNumber) => {
    await waitForBlockNumber(aztecNode, blockNumber, { tag: 'checkpointed', timeout: 60 });
    const [checkpointedBlock] = await aztecNode.getBlocks(blockNumber, 1, {
      includeL1PublishInfo: true,
      includeAttestations: true,
      onlyCheckpointed: true,
    });
    return checkpointedBlock.checkpointNumber;
  };

  const advanceCheckpoint = async () => {
    let checkpoint = await aztecNode.getCheckpointNumber();
    const originalCheckpoint = checkpoint;
    log.warn(`Original checkpoint ${originalCheckpoint}`);
    do {
      const newBlock = await advanceBlock();
      checkpoint = await waitForBlockToCheckpoint(newBlock);
    } while (checkpoint <= originalCheckpoint);
    log.warn(`At checkpoint ${checkpoint}`);
  };

  // Same as advanceBlock but ignores errors. Useful if we expect a prune.
  const tryAdvanceBlock = async () => {
    try {
      await advanceBlock();
    } catch (err) {
      log.warn(`Failed to advance block: ${(err as Error).message}`);
    }
  };

  // L1→L2 messages carry a compact, L1-assigned global leaf index and are streamed
  // into the L2 tree in insertion order (subject to inbox lag and per-block/checkpoint caps) rather than
  // being pinned to a fixed checkpoint. This scenario stresses that message state survives an L2 reorg:
  // we let the proposed chain drift by mining several unproven checkpoints, insert a message during the
  // drift, then force the rollup to prune back to the pre-drift block. After the prune, the message must
  // still be re-consumed on the new chain and its witness leaf index must remain the L1-assigned index.
  const canConsumeMessageAfterRollupPrune = async (scope: L1ToL2MessageScope) => {
    // Stop the background epoch test settler so the drift scenario below can proceed without
    // an auto-prover racing it.
    await t.epochTestSettler?.stop();

    // Reset the L1 proof window by marking the current pending tip as proven, so L1's prune
    // deadline doesn't fire mid-test before we finish mining the drift checkpoints below.
    await markAsProven();

    // Snapshot the block we will prune back to, then stop proving so the proposed chain can drift.
    const lastProven = await aztecNode.getBlockNumber();
    log.warn(`Stopping proof submission at block ${lastProven} to allow drift`);
    markProvenEnabled = false;

    // Mine several checkpoints to ensure drift
    log.warn(`Mining blocks to allow drift`);
    await timesAsync(4, advanceCheckpoint);

    // Generate and send the message to the L1 contract during the drift
    log.warn(`Sending L1 to L2 message`);
    const [secret, secretHash] = await generateClaimSecret();
    const message = { recipient: testContract.address, content: Fr.random(), secretHash };
    const { msgHash, globalLeafIndex } = await sendMessageToL2(message);

    // The drift's current L1 pending checkpoint. The node prunes its local view as soon as the proof
    // window lapses, but L1 only commits the prune when the rebuilt chain proposes its first checkpoint
    // on top of the pre-drift block. Wait for that on-chain commit — L1's pending tip dropping back
    // below the drift — before re-enabling proving: marking proven while the drift is still the pending
    // tip would pin the drift proven and wedge the rebuild forever with Rollup__InvalidArchive.
    const driftPendingCheckpoint = (await t.cheatCodes.rollup.getTips()).pending;

    // Keep mining until the rollup prunes the drifted proposed chain back to the pre-drift block. L1's
    // pending tip dropping below the drift is the unambiguous signal that the on-chain prune committed
    // (a new checkpoint was proposed on top of the pre-drift block); the node's faster local prune is
    // not, which is why we gate on L1 here rather than on the node's block number.
    log.warn(`Waiting until we prune back to ${lastProven}`);
    await retryUntil(
      async () => {
        await tryAdvanceBlock();
        return (await t.cheatCodes.rollup.getTips()).pending < driftPendingCheckpoint;
      },
      'wait for prune',
      180,
    );
    // The prune has committed on L1. Re-enable explicit proving so the catch-up chain that re-consumes
    // the message is not pruned a second time before we can consume it — safe now that L1's pending tip
    // is the rebuilt chain rather than the drift.
    markProvenEnabled = true;
    await markAsProven();

    // The invariant under test: the compact-indexed message survives the L2 prune and is re-consumed on the
    // new chain within a reasonable window (its bucket and rolling-hash state must persist across the
    // reorg), becoming consumable from the requested scope.
    await waitForMessageReady(msgHash, scope);

    // The PXE is anchored to the checkpointed tip (syncChainTip: 'checkpointed'), so the re-consumed
    // message only becomes visible to the consume simulation once its block is checkpointed — not merely
    // proposed at 'latest'. Drive the rebuilt chain forward (advanceBlock marks each step proven so it
    // is not pruned again) until the checkpointed tip covers the block that re-consumed the message.
    const messageBlock = await aztecNode.getBlockNumber();
    await retryUntil(
      async () => {
        if ((await aztecNode.getBlockNumber('checkpointed')) >= messageBlock) {
          return true;
        }
        await tryAdvanceBlock();
        return false;
      },
      'wait for message block to be checkpointed',
      180,
    );

    // The witness leaf index is the L1-assigned compact global index and must be stable across the prune.
    const [messageIndex] = (await aztecNode.getL1ToL2MessageMembershipWitness('latest', msgHash))!;
    expect(messageIndex).toEqual(globalLeafIndex.toBigInt());

    // The message is consumable on L2 from the requested scope.
    const consume = () => getConsumeMethod(scope)(message.content, secret, t.ethAccount, globalLeafIndex);
    await consume().send({ from: user1Address });
  };

  // Mines several unproven checkpoints, inserts an L1→L2 message during the drift, then triggers a
  // rollup prune back to the pre-drift block and verifies the message is still re-consumed on the new
  // chain — with its L1-assigned witness index intact — from both private and public scope.
  it.each(['private', 'public'] as const)(
    'consumes an L1 to L2 message after a rollup prune drops the drifted chain (%s)',
    async scope => {
      await canConsumeMessageAfterRollupPrune(scope);
    },
  );
});
