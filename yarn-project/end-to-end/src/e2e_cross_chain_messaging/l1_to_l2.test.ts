import {
  AztecAddress,
  type AztecNode,
  BatchCall,
  Fr,
  type Logger,
  TxStatus,
  type Wallet,
  generateClaimSecret,
  retryUntil,
} from '@aztec/aztec.js';
import { isL1ToL2MessageReady } from '@aztec/aztec.js';
import { timesAsync } from '@aztec/foundation/collection';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { sendL1ToL2Message } from '../fixtures/l1_to_l2_messaging.js';
import type { CrossChainTestHarness } from '../shared/cross_chain_test_harness.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

describe('e2e_cross_chain_messaging l1_to_l2', () => {
  let t: CrossChainMessagingTest;
  let log: Logger;
  let crossChainTestHarness: CrossChainTestHarness;
  let aztecNode: AztecNode;
  let wallet: Wallet;
  let user1Address: AztecAddress;
  let testContract: TestContract;

  beforeEach(async () => {
    t = new CrossChainMessagingTest(
      'l1_to_l2',
      { minTxsPerBlock: 1 },
      { aztecProofSubmissionEpochs: 2, aztecEpochDuration: 4 },
    );
    await t.applyBaseSnapshots();
    await t.setup();

    ({ logger: log, crossChainTestHarness, wallet, user1Address, aztecNode } = t);
    testContract = await TestContract.deploy(wallet).send({ from: user1Address }).deployed();
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
    await BatchCall.empty(wallet).send({ from: user1Address }).wait();
    const newBlock = await aztecNode.getBlockNumber();
    log.warn(`Advanced to block ${newBlock}`);
    if (newBlock === block) {
      throw new Error(`Failed to advance block ${block}`);
    }
    return undefined;
  };

  // Same as above but ignores errors. Useful if we expect a prune.
  const tryAdvanceBlock = async () => {
    try {
      await advanceBlock();
    } catch (err) {
      log.warn(`Failed to advance block: ${(err as Error).message}`);
    }
  };

  // Waits until the message is fetched by the archiver of the node and returns the msg target block
  const waitForMessageFetched = async (msgHash: Fr) => {
    log.warn(`Waiting until the message is fetched by the node`);
    return await retryUntil(
      async () => (await aztecNode.getL1ToL2MessageBlock(msgHash)) ?? (await advanceBlock()),
      'get msg block',
      60,
    );
  };

  // Waits until the message is ready to be consumed on L2 as it's been added to the world state
  const waitForMessageReady = async (
    msgHash: Fr,
    scope: 'private' | 'public',
    onNotReady?: (blockNumber: number) => Promise<void>,
  ) => {
    const msgBlock = await waitForMessageFetched(msgHash);
    log.warn(`Waiting until L2 reaches msg block ${msgBlock} (current is ${await aztecNode.getBlockNumber()})`);
    await retryUntil(
      async () => {
        const blockNumber = await aztecNode.getBlockNumber();
        const witness = await aztecNode.getL1ToL2MessageMembershipWitness('latest', msgHash);
        const isReady = await isL1ToL2MessageReady(aztecNode, msgHash, { forPublicConsumption: scope === 'public' });
        log.info(`Block is ${blockNumber}. Message block is ${msgBlock}. Witness ${!!witness}. Ready ${isReady}.`);
        if (!isReady) {
          await (onNotReady ? onNotReady(blockNumber) : advanceBlock());
        }
        return isReady;
      },
      `wait for rollup to reach msg block ${msgBlock}`,
      120,
    );
  };

  // We register one portal address when deploying contract but that address is no-longer the only address
  // allowed to send messages to the given contract. In the following test we'll test that it's really the case.
  // We'll also test that we can send the same message content across the bridge multiple times.
  it.each(['private', 'public'] as const)(
    'can send an L1 to L2 message from a non-registered portal address consumed from %s repeatedly',
    async (scope: 'private' | 'public') => {
      // Generate and send the message to the L1 contract
      const [secret, secretHash] = await generateClaimSecret();
      const message = { recipient: testContract.address, content: Fr.random(), secretHash };
      const { msgHash: message1Hash, globalLeafIndex: actualMessage1Index } = await sendL1ToL2Message(
        message,
        crossChainTestHarness,
      );

      await waitForMessageReady(message1Hash, scope);

      // The waitForMessageReady returns true earlier for public-land, so we can only check the membership
      // witness for private-land here.
      if (scope === 'private') {
        const [message1Index] = (await aztecNode.getL1ToL2MessageMembershipWitness('latest', message1Hash))!;
        expect(actualMessage1Index.toBigInt()).toBe(message1Index);
      }

      // We consume the L1 to L2 message using the test contract either from private or public
      await getConsumeMethod(scope)(message.content, secret, crossChainTestHarness.ethAccount, actualMessage1Index)
        .send({ from: user1Address })
        .wait();

      // We send and consume the exact same message the second time to test that oracles correctly return the new
      // non-nullified message
      const { msgHash: message2Hash, globalLeafIndex: actualMessage2Index } = await sendL1ToL2Message(
        message,
        crossChainTestHarness,
      );

      // We check that the duplicate message was correctly inserted by checking that its message index is defined
      await waitForMessageReady(message2Hash, scope);

      if (scope === 'private') {
        const [message2Index] = (await aztecNode.getL1ToL2MessageMembershipWitness('latest', message2Hash))!;
        expect(message2Index).toBeDefined();
        expect(message2Index).toBeGreaterThan(actualMessage1Index.toBigInt());
        expect(actualMessage2Index.toBigInt()).toBe(message2Index);
      }

      // Now we consume the message again. Everything should pass because oracle should return the duplicate message
      // which is not nullified
      await getConsumeMethod(scope)(message.content, secret, crossChainTestHarness.ethAccount, actualMessage2Index)
        .send({ from: user1Address })
        .wait();
    },
    120_000,
  );

  // Inbox block number can drift on two scenarios: if the rollup reorgs and rolls back its own
  // block number, or if the inbox receives too many messages and they are inserted faster than
  // they are consumed. In this test, we mine several blocks without marking them as proven until
  // we can trigger a reorg, and then wait until the message can be processed to consume it.
  it.each(['private', 'public'] as const)(
    'can consume L1 to L2 message in %s after inbox drifts away from the rollup',
    async (scope: 'private' | 'public') => {
      // Stop proving
      const lastProven = await aztecNode.getBlockNumber();
      log.warn(`Stopping proof submission at block ${lastProven} to allow drift`);
      t.ctx.watcher.setIsMarkingAsProven(false);

      // Mine several blocks to ensure drift
      log.warn(`Mining blocks to allow drift`);
      await timesAsync(4, advanceBlock);

      // Generate and send the message to the L1 contract
      log.warn(`Sending L1 to L2 message`);
      const [secret, secretHash] = await generateClaimSecret();
      const message = { recipient: testContract.address, content: Fr.random(), secretHash };
      const { msgHash, globalLeafIndex } = await sendL1ToL2Message(message, crossChainTestHarness);

      // Wait until the Aztec node has synced it
      const msgBlockNumber = await waitForMessageFetched(msgHash);
      log.warn(`Message synced for block ${msgBlockNumber}`);
      expect(lastProven + 4).toBeLessThan(msgBlockNumber);

      // And keep mining until we prune back to the original block number. Now the "waiting for two blocks"
      // strategy for the message to be ready to use shouldn't work, since the lastProven block is more than
      // two blocks behind the message block. This is the scenario we want to test.
      log.warn(`Waiting until we prune back to ${lastProven}`);
      await retryUntil(
        async () =>
          (await aztecNode.getBlockNumber().then(b => b === lastProven || b === lastProven + 1)) ||
          (await tryAdvanceBlock()),
        'wait for prune',
        40,
      );

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
          await t.ctx.watcher.markAsProven();
        } else {
          // On public, we actually send the tx and check that it reverts due to the missing message.
          // This advances the block too as a side-effect. Note that we do not rely on a simulation since the cross chain messages
          // do not get added at the beginning of the block during node_simulatePublicCalls (maybe they should?).
          const { status } = await consume().send({ from: user1Address }).wait({ dontThrowOnRevert: true });
          expect(status).toEqual(TxStatus.APP_LOGIC_REVERTED);
          await t.ctx.watcher.markAsProven();
        }
      });

      // Verify the membership witness is available for creating the tx (private-land only)
      if (scope === 'private') {
        const [messageIndex] = (await aztecNode.getL1ToL2MessageMembershipWitness('latest', msgHash))!;
        expect(messageIndex).toEqual(globalLeafIndex.toBigInt());
      }

      // And consume the message
      await consume().send({ from: user1Address }).wait();
    },
  );
});
