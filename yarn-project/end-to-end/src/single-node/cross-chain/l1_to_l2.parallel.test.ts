import { AztecAddress } from '@aztec/aztec.js/addresses';
import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { isL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import type { AztecNode } from '@aztec/aztec.js/node';
import { TxExecutionResult } from '@aztec/aztec.js/tx';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { ExecutionPayload } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { L1_DIRECT_WRITE_ACCOUNT_INDEX, PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { sendL1ToL2Message } from '../../fixtures/l1_to_l2_messaging.js';
import { waitForBlockNumber } from '../../fixtures/wait_helpers.js';
import type { CrossChainTestHarness } from '../../shared/cross_chain_test_harness.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

jest.setTimeout(300_000);

// L1→L2 messaging via Inbox: message readiness, duplicate messages, and inbox drift after a rollup
// reorg. Uses CrossChainMessagingTest (prod sequencer, pipelining preset: ethSlot=4s, aztecSlot=12s,
// inboxLag=2, minTxsPerBlock=1, aztecProofSubmissionEpochs=2, aztecEpochDuration=4) with
// EpochTestSettler for auto-proving and CrossChainTestHarness for L1↔L2 token portal bridging.
// Each it is run as an independent CI job (*.parallel.test.ts convention).
describe('single-node/cross-chain/l1_to_l2', () => {
  let t: CrossChainMessagingTest;
  let log: Logger;
  let crossChainTestHarness: CrossChainTestHarness;
  let aztecNode: AztecNode;
  let wallet: Wallet;
  let user1Address: AztecAddress;
  let testContract: TestContract;

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

  beforeEach(async () => {
    markProvenEnabled = true;
    t = new CrossChainMessagingTest(
      'l1_to_l2',
      // PIPELINING_SETUP_OPTS sets minTxsPerBlock=0; this test needs minTxsPerBlock=1 because it
      // manually mines blocks one tx at a time via advanceBlock() and counts checkpoints, so empty
      // pipelined checkpoints interleaving between txs would break the exact block-number assertions.
      { ...PIPELINING_SETUP_OPTS, minTxsPerBlock: 1 },
      { aztecProofSubmissionEpochs: 2, aztecEpochDuration: 4 },
      // Anchor PXE to the checkpointed chain so that a proposed-chain invalidation cascade
      // (e.g. a missed checkpoint publish that prunes the pipelined proposed chain) doesn't
      // drop the wallet's in-flight tx via handlePrunedBlocks.
      { syncChainTip: 'checkpointed' },
      L1_DIRECT_WRITE_ACCOUNT_INDEX,
    );
    await t.setup();

    ({ logger: log, crossChainTestHarness, wallet, user1Address, aztecNode } = t);
    ({ contract: testContract } = await TestContract.deploy(wallet).send({ from: user1Address }));
  }, 300_000);

  afterEach(async () => {
    await t.teardown();
  });

  const getConsumeMethod = (scope: 'private' | 'public') =>
    scope === 'private'
      ? testContract.methods.consume_message_from_arbitrary_sender_private
      : testContract.methods.consume_message_from_arbitrary_sender_public;

  // Sends a tx to L2 to advance the block number by 1
  const advanceBlock = async () => {
    const block = await aztecNode.getBlockNumber();
    log.warn(`Sending noop tx at block ${block}`);
    await wallet.sendTx(ExecutionPayload.empty(), { from: user1Address });
    const newBlock = await aztecNode.getBlockNumber();
    log.warn(`Advanced to block ${newBlock}`);
    if (newBlock === block) {
      throw new Error(`Failed to advance block ${block}`);
    }
    // Keep the proof window from expiring mid-test (see `markAsProven` above). No-op once the drift
    // scenario disables proving.
    await markAsProven();
    return newBlock;
  };

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

  // Same as above but ignores errors. Useful if we expect a prune.
  const tryAdvanceBlock = async () => {
    try {
      await advanceBlock();
    } catch (err) {
      log.warn(`Failed to advance block: ${(err as Error).message}`);
    }
  };

  // Waits until the message is fetched by the archiver of the node and returns the msg target checkpoint
  // REFACTOR: hand-rolled retryUntil loop that also advances blocks on each retry; replace with a
  // waitForL1ToL2MessageIndexed(node, msgHash, advanceBlock) helper in the e2e fixture or harness.
  const waitForMessageFetched = async (msgHash: Fr) => {
    log.warn(`Waiting until the message is fetched by the node`);
    return await retryUntil(
      async () => {
        const checkpoint = await aztecNode.getL1ToL2MessageCheckpoint(msgHash);
        if (checkpoint !== undefined) {
          return checkpoint;
        }
        await advanceBlock();
        return undefined;
      },
      'get msg checkpoint',
      60,
    );
  };

  // Waits until the message is ready to be consumed on L2 as it's been added to the world state
  const waitForMessageReady = async (
    msgHash: Fr,
    scope: 'private' | 'public',
    onNotReady?: (blockNumber: BlockNumber) => Promise<void>,
  ) => {
    const msgCheckpoint = await waitForMessageFetched(msgHash);
    log.warn(
      `Waiting until L2 reaches the first block of msg checkpoint ${msgCheckpoint} (current is ${await aztecNode.getCheckpointNumber()})`,
    );
    await retryUntil(
      async () => {
        const [blockNumber, checkpointNumber] = await Promise.all([
          aztecNode.getBlockNumber(),
          aztecNode.getCheckpointNumber(),
        ]);
        const witness = await aztecNode.getL1ToL2MessageMembershipWitness('latest', msgHash);
        const isReady = await isL1ToL2MessageReady(aztecNode, msgHash);
        log.info(
          `Block is ${blockNumber}, checkpoint is ${checkpointNumber}. Message checkpoint is ${msgCheckpoint}. Witness ${!!witness}. Ready ${isReady}.`,
        );
        if (!isReady) {
          await (onNotReady ? onNotReady(blockNumber) : advanceBlock());
        }
        return isReady;
      },
      `wait for rollup to reach msg checkpoint ${msgCheckpoint}`,
      240,
    );
  };

  // We register one portal address when deploying contract but that address is no-longer the only address
  // allowed to send messages to the given contract. In the following test we'll test that it's really the case.
  // We'll also test that we can send the same message content across the bridge multiple times.
  const canSendMessageFromNonRegisteredPortal = async (scope: 'private' | 'public') => {
    // Generate and send the message to the L1 contract
    const [secret, secretHash] = await generateClaimSecret();
    const message = { recipient: testContract.address, content: Fr.random(), secretHash };
    const { msgHash: message1Hash, globalLeafIndex: actualMessage1Index } = await sendL1ToL2Message(
      message,
      crossChainTestHarness,
    );

    await waitForMessageReady(message1Hash, scope);

    const [message1Index] = (await aztecNode.getL1ToL2MessageMembershipWitness('latest', message1Hash))!;
    expect(actualMessage1Index.toBigInt()).toBe(message1Index);

    const sendConsumeMsgTx = async (index: Fr) => {
      const call = getConsumeMethod(scope)(message.content, secret, crossChainTestHarness.ethAccount, index);
      if (scope === 'public') {
        await call.simulate({ from: user1Address });
      }
      await call.send({ from: user1Address });
    };

    // We consume the L1 to L2 message using the test contract either from private or public
    await sendConsumeMsgTx(actualMessage1Index);

    // We send and consume the exact same message the second time to test that oracles correctly return the new
    // non-nullified message
    const { msgHash: message2Hash, globalLeafIndex: actualMessage2Index } = await sendL1ToL2Message(
      message,
      crossChainTestHarness,
    );

    // We check that the duplicate message was correctly inserted by checking that its message index is defined
    await waitForMessageReady(message2Hash, scope);

    const [message2Index] = (await aztecNode.getL1ToL2MessageMembershipWitness('latest', message2Hash))!;
    expect(message2Index).toBeDefined();
    expect(message2Index).toBeGreaterThan(actualMessage1Index.toBigInt());
    expect(actualMessage2Index.toBigInt()).toBe(message2Index);

    // Now we consume the message again. Everything should pass because oracle should return the duplicate message
    // which is not nullified
    await sendConsumeMsgTx(actualMessage2Index);
  };

  // Sends the same L1→L2 message content twice via a non-registered portal, waits for each to be
  // ready, and consumes both from private. Verifies duplicate messages are indexed correctly and
  // the second consumption uses the non-nullified duplicate leaf.
  it('can send an L1 to L2 message from a non-registered portal address consumed from private repeatedly', async () => {
    await canSendMessageFromNonRegisteredPortal('private');
  });

  // Same as above but the message is consumed from public state. Verifies the public consumption
  // path handles duplicate messages and the oracle returns the correct non-nullified leaf index.
  it('can send an L1 to L2 message from a non-registered portal address consumed from public repeatedly', async () => {
    await canSendMessageFromNonRegisteredPortal('public');
  });

  // Inbox checkpoint number can drift on two scenarios: if the rollup reorgs and rolls back its own
  // checkpoint number, or if the inbox receives too many messages and they are inserted faster than
  // they are consumed. In this test, we mine several checkpoints without marking them as proven until
  // we can trigger a reorg, and then wait until the message can be processed to consume it.
  const canConsumeMessageAfterInboxDrift = async (scope: 'private' | 'public') => {
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
    const { msgHash, globalLeafIndex } = await sendL1ToL2Message(message, crossChainTestHarness);

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
    const consume = () =>
      getConsumeMethod(scope)(message.content, secret, crossChainTestHarness.ethAccount, globalLeafIndex);

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
  // triggers a rollup prune back to the pre-drift block. Verifies the message can be consumed from
  // private only after the chain re-syncs to the message's checkpoint, not before.
  it('can consume L1 to L2 message in private after inbox drifts away from the rollup', async () => {
    await canConsumeMessageAfterInboxDrift('private');
  });

  // Same drift scenario but consuming from public. Uses a send+dontThrowOnRevert loop to probe when
  // the message becomes consumable, then verifies the successful tx is in the message's checkpoint.
  it('can consume L1 to L2 message in public after inbox drifts away from the rollup', async () => {
    await canConsumeMessageAfterInboxDrift('public');
  });
});
