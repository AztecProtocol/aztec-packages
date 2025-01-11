import { type AztecAddress, Fr, generateClaimSecret } from '@aztec/aztec.js';
import { TestContract } from '@aztec/noir-contracts.js/Test';

import { sendL1ToL2Message } from '../fixtures/l1_to_l2_messaging.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

describe('e2e_cross_chain_messaging l1_to_l2', () => {
  const t = new CrossChainMessagingTest('l1_to_l2');

  let { crossChainTestHarness, aztecNode, user1Wallet } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.setup();
    // Have to destructure again to ensure we have latest refs.
    ({ crossChainTestHarness, user1Wallet } = t);

    aztecNode = crossChainTestHarness.aztecNode;
  }, 300_000);

  afterAll(async () => {
    await t.teardown();
  });

  // Note: We register one portal address when deploying contract but that address is no-longer the only address
  // allowed to send messages to the given contract. In the following test we'll test that it's really the case.
  it.each([true, false])(
    'can send an L1 -> L2 message from a non-registered portal address consumed from private or public and then sends and claims exactly the same message again',
    async (isPrivate: boolean) => {
      const testContract = await TestContract.deploy(user1Wallet).send().deployed();

      const consumeMethod = isPrivate
        ? testContract.methods.consume_message_from_arbitrary_sender_private
        : testContract.methods.consume_message_from_arbitrary_sender_public;

      const [secret, secretHash] = generateClaimSecret();

      const message = { recipient: testContract.address, content: Fr.random(), secretHash };
      const [message1Hash, actualMessage1Index] = await sendL2Message(message);

      const [message1Index] = (await aztecNode.getL1ToL2MessageMembershipWitness('latest', message1Hash))!;
      expect(actualMessage1Index.toBigInt()).toBe(message1Index);

      // Finally, we consume the L1 -> L2 message using the test contract either from private or public
      await consumeMethod(message.content, secret, crossChainTestHarness.ethAccount, message1Index).send().wait();

      // We send and consume the exact same message the second time to test that oracles correctly return the new
      // non-nullified message
      const [message2Hash, actualMessage2Index] = await sendL2Message(message);

      // We check that the duplicate message was correctly inserted by checking that its message index is defined
      const [message2Index] = (await aztecNode.getL1ToL2MessageMembershipWitness('latest', message2Hash))!;

      expect(message2Index).toBeDefined();
      expect(message2Index).toBeGreaterThan(message1Index);
      expect(actualMessage2Index.toBigInt()).toBe(message2Index);

      // Now we consume the message again. Everything should pass because oracle should return the duplicate message
      // which is not nullified
      await consumeMethod(message.content, secret, crossChainTestHarness.ethAccount, message2Index).send().wait();
    },
    120_000,
  );

  const sendL2Message = async (message: { recipient: AztecAddress; content: Fr; secretHash: Fr }) => {
    const [msgHash, globalLeafIndex] = await sendL1ToL2Message(message, crossChainTestHarness);
    await crossChainTestHarness.makeMessageConsumable(msgHash);
    return [msgHash, globalLeafIndex];
  };
});
