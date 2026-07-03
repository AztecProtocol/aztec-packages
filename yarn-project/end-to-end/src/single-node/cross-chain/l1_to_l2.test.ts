import { AztecAddress } from '@aztec/aztec.js/addresses';
import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { jest } from '@jest/globals';

import { L1_DIRECT_WRITE_ACCOUNT_INDEX, PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';
import { type L1ToL2MessageScope, createL1ToL2MessageHelpers } from './message_test_helpers.js';

jest.setTimeout(300_000);

// L1→L2 messaging via Inbox: message readiness and duplicate messages. Uses CrossChainMessagingTest
// (prod sequencer, pipelining preset: ethSlot=4s, aztecSlot=12s, inboxLag=2, minTxsPerBlock=1,
// aztecProofSubmissionEpochs=2, aztecEpochDuration=4) with EpochTestSettler for auto-proving and
// CrossChainTestHarness for L1↔L2 token portal bridging. The duplicate-message scenario runs over
// private and public scope via it.each, all sharing one node stood up once in beforeAll.
describe('single-node/cross-chain/l1_to_l2', () => {
  let t: CrossChainMessagingTest;

  let log: Logger;
  let aztecNode: AztecNode;
  let wallet: Wallet;
  let user1Address: AztecAddress;
  let testContract: TestContract;

  let sendMessageToL2: ReturnType<typeof createL1ToL2MessageHelpers>['sendMessageToL2'];
  let waitForMessageReady: ReturnType<typeof createL1ToL2MessageHelpers>['waitForMessageReady'];

  // Marks the current pending tip proven on L1. The e2e fixture runs L1 on interval mining and nothing
  // marks blocks proven automatically, so without these explicit calls L1's `aztecProofSubmissionEpochs`
  // window expires mid-test and prunes in-flight wallet txs.
  const markAsProven = () => t.cheatCodes.rollup.markAsProven();

  beforeAll(async () => {
    t = new CrossChainMessagingTest(
      'l1_to_l2',
      // PIPELINING_SETUP_OPTS sets minTxsPerBlock=0; this test needs minTxsPerBlock=1 because it
      // manually mines blocks one tx at a time and counts checkpoints, so empty pipelined checkpoints
      // interleaving between txs would break the exact block-number assertions.
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

    ({ sendMessageToL2, waitForMessageReady } = createL1ToL2MessageHelpers({
      t,
      aztecNode,
      wallet,
      user1Address,
      log,
      markAsProven,
    }));
  }, 300_000);

  afterAll(async () => {
    await t.teardown();
  });

  const getConsumeMethod = (scope: L1ToL2MessageScope) =>
    scope === 'private'
      ? testContract.methods.consume_message_from_arbitrary_sender_private
      : testContract.methods.consume_message_from_arbitrary_sender_public;

  // We register one portal address when deploying contract but that address is no-longer the only address
  // allowed to send messages to the given contract. In the following test we'll test that it's really the case.
  // We'll also test that we can send the same message content across the bridge multiple times.
  const canSendMessageFromNonRegisteredPortal = async (scope: L1ToL2MessageScope) => {
    // Generate and send the message to the L1 contract
    const [secret, secretHash] = await generateClaimSecret();
    const message = { recipient: testContract.address, content: Fr.random(), secretHash };
    const { msgHash: message1Hash, globalLeafIndex: actualMessage1Index } = await sendMessageToL2(message);

    await waitForMessageReady(message1Hash, scope);

    const [message1Index] = (await aztecNode.getL1ToL2MessageMembershipWitness('latest', message1Hash))!;
    expect(actualMessage1Index.toBigInt()).toBe(message1Index);

    const sendConsumeMsgTx = async (index: Fr) => {
      const call = getConsumeMethod(scope)(message.content, secret, t.ethAccount, index);
      if (scope === 'public') {
        await call.simulate({ from: user1Address });
      }
      await call.send({ from: user1Address });
    };

    // We consume the L1 to L2 message using the test contract either from private or public
    await sendConsumeMsgTx(actualMessage1Index);

    // We send and consume the exact same message the second time to test that oracles correctly return the new
    // non-nullified message
    const { msgHash: message2Hash, globalLeafIndex: actualMessage2Index } = await sendMessageToL2(message);

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
  // ready, and consumes both. Verifies duplicate messages are indexed correctly and the second
  // consumption uses the non-nullified duplicate leaf, from both private and public scope.
  it.each(['private', 'public'] as const)(
    'can send an L1 to L2 message from a non-registered portal address consumed from %s repeatedly',
    async scope => {
      await canSendMessageFromNonRegisteredPortal(scope);
    },
  );
});
