import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { TxExecutionResult } from '@aztec/aztec.js/tx';
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

// L1→L2 messaging via Inbox: inbox checkpoint drift after a rollup reorg. Uses CrossChainMessagingTest
// (prod sequencer, pipelining preset: ethSlot=4s, aztecSlot=12s, inboxLag=2, minTxsPerBlock=1,
// aztecProofSubmissionEpochs=2, aztecEpochDuration=4) with EpochTestSettler for auto-proving and
// CrossChainTestHarness for L1↔L2 token portal bridging. The drift scenario runs over private and
// public scope via it.each, all sharing one node stood up once in beforeAll.
describe('single-node/cross-chain/l1_to_l2_inbox_drift', () => {
  let t: CrossChainMessagingTest;

  let log: Logger;
  let aztecNode: AztecNode;
  let wallet: Wallet;
  let user1Address: AztecAddress;
  let testContract: TestContract;

  let sendMessageToL2: ReturnType<typeof createL1ToL2MessageHelpers>['sendMessageToL2'];
  let advanceBlock: ReturnType<typeof createL1ToL2MessageHelpers>['advanceBlock'];
  let waitForMessageFetched: ReturnType<typeof createL1ToL2MessageHelpers>['waitForMessageFetched'];
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

    ({ sendMessageToL2, advanceBlock, waitForMessageFetched, waitForMessageReady } = createL1ToL2MessageHelpers({
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

  // Inbox checkpoint number can drift on two scenarios: if the rollup reorgs and rolls back its own
  // checkpoint number, or if the inbox receives too many messages and they are inserted faster than
  // they are consumed. In this test, we mine several checkpoints without marking them as proven until
  // we can trigger a reorg, and then wait until the message can be processed to consume it.
  const canConsumeMessageAfterInboxDrift = async (scope: L1ToL2MessageScope) => {
    // Stop the background epoch test settler so the drift scenario below can proceed without
    // an auto-prover racing it.
    await t.epochTestSettler?.stop();

    // Reset the L1 proof window by marking the current pending tip as proven, so L1's prune
    // deadline doesn't fire mid-test before we finish mining the 4 drift checkpoints below.
    await markAsProven();

    // Stop proving
    const lastProven = await aztecNode.getBlockNumber();
    const [checkpointedProvenBlock] = await aztecNode.getBlocks(lastProven, 1, {
      includeL1PublishInfo: true,
      includeAttestations: true,
      onlyCheckpointed: true,
    });
    log.warn(`Stopping proof submission at checkpoint ${checkpointedProvenBlock.checkpointNumber} to allow drift`);
    markProvenEnabled = false;

    // Mine several checkpoints to ensure drift
    log.warn(`Mining blocks to allow drift`);
    await timesAsync(4, advanceCheckpoint);

    // Generate and send the message to the L1 contract
    log.warn(`Sending L1 to L2 message`);
    const [secret, secretHash] = await generateClaimSecret();
    const message = { recipient: testContract.address, content: Fr.random(), secretHash };
    const { msgHash, globalLeafIndex } = await sendMessageToL2(message);

    // Wait until the Aztec node has synced it
    const msgCheckpointNumber = await waitForMessageFetched(msgHash);
    log.warn(`Message synced for checkpoint ${msgCheckpointNumber}`);
    expect(checkpointedProvenBlock.checkpointNumber + 4).toBeLessThan(msgCheckpointNumber);

    // And keep mining until we prune back to the original block number. Now the "waiting for two blocks"
    // strategy for the message to be ready to use shouldn't work, since the lastProven block is more than
    // two blocks behind the message block. This is the scenario we want to test.
    log.warn(`Waiting until we prune back to ${lastProven}`);
    await retryUntil(
      async () =>
        (await aztecNode.getBlockNumber().then(b => b === lastProven || b === lastProven + 1)) ||
        (await tryAdvanceBlock()),
      'wait for prune',
      180,
    );
    // The drift condition has been established. Re-enable explicit proving so the catch-up blocks
    // below are not pruned a second time before the message checkpoint becomes ready.
    markProvenEnabled = true;
    await markAsProven();

    // Check that there is no witness yet
    expect(await aztecNode.getL1ToL2MessageMembershipWitness('latest', msgHash)).toBeUndefined();

    // Define L2 function to consume the message
    const consume = () => getConsumeMethod(scope)(message.content, secret, t.ethAccount, globalLeafIndex);

    // Wait until the message is ready to be consumed, checking that it cannot be consumed beforehand
    await waitForMessageReady(msgHash, scope, async () => {
      if (scope === 'private') {
        // On private, we simulate the tx locally and check that we get a missing message error, then we advance to the next block
        await expect(() => consume().simulate({ from: user1Address })).rejects.toThrow(/No L1 to L2 message found/);
        await tryAdvanceBlock();
      } else {
        // In public it is harder to determine when a message becomes consumable.
        // We send a transaction, this advances the chain and the message MIGHT be consumed in the new block.
        // If it does get consumed then we check that the block contains the message.
        // If it fails we check that the block doesn't contain the message
        const { receipt } = await consume().send({ from: user1Address, wait: { dontThrowOnRevert: true } });
        if (receipt.executionResult === TxExecutionResult.SUCCESS) {
          // The consume tx must not succeed before the message checkpoint. It can land in a later
          // checkpoint if the node catches up between the readiness poll and the tx being built.
          const block = await aztecNode.getBlock(receipt.blockNumber!);
          expect(block).toBeDefined();
          expect(block!.checkpointNumber).toBeGreaterThanOrEqual(msgCheckpointNumber);
        } else {
          expect(receipt.executionResult).toEqual(TxExecutionResult.REVERTED);
        }
      }
      await markAsProven();
    });

    // Verify the membership witness is available for creating the tx (private-land only)
    if (scope === 'private') {
      const [messageIndex] = (await aztecNode.getL1ToL2MessageMembershipWitness('latest', msgHash))!;
      expect(messageIndex).toEqual(globalLeafIndex.toBigInt());
      // And consume the message for private, public was already consumed.
      await consume().send({ from: user1Address });
    }
  };

  // Mines four checkpoints without proving, inserting an L1→L2 message after the drift, then
  // triggers a rollup prune back to the pre-drift block. Verifies the message can be consumed only
  // after the chain re-syncs to the message's checkpoint, not before, from both private and public
  // scope (public uses a send+dontThrowOnRevert loop to probe when the message becomes consumable).
  it.each(['private', 'public'] as const)(
    'can consume L1 to L2 message in %s after inbox drifts away from the rollup',
    async scope => {
      await canConsumeMessageAfterInboxDrift(scope);
    },
  );
});
