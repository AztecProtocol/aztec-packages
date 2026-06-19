import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { waitForL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import { TxExecutionResult } from '@aztec/aztec.js/tx';
import { EthAddress } from '@aztec/foundation/eth-address';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { jest } from '@jest/globals';

import { sendL1ToL2Message } from '../../fixtures/l1_to_l2_messaging.js';
import type { EndToEndContext } from '../../fixtures/utils.js';
import { waitForProvenBlock } from '../../fixtures/wait_helpers.js';
import { SingleNodeTestContext } from '../single_node_test_context.js';

jest.setTimeout(1000 * 60 * 10);

// Proves an epoch that contains txs with public function calls that consume L1 to L2 messages
// Regression for an issue in which the sequencer correctly adds L1-to-L2 messages to its world-state fork
// before processing txs, but the prover node's proving job creates a separate fork without inserting the
// messages first. This causes a block header mismatch (different state roots, fees, mana) when a tx consumes
// a message that was added to the L1-to-L2 message tree in the same block — the prover reverts the tx while
// the sequencer processes it successfully.
//
// SingleNodeTestContext: 1 node + fake prover, prod-seq, interval mining. Timing: all defaults (ethSlot=8s/12s
// CI, aztecSlot=16s/24s, epoch=6, proofSubmissionEpochs=1), minTxsPerBlock=1 (v5: the disableAnvilTestWatcher
// override was removed). Cross-chain: writes to L1 Inbox (sendL1ToL2Message), then claims the message in a
// public L2 function.
describe('multi-node/single-node/proof_public_cross_chain', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let test: SingleNodeTestContext;

  beforeEach(async () => {
    test = await SingleNodeTestContext.setup({
      numberOfAccounts: 1,
      minTxsPerBlock: 1,
      sequencerPublisherAllowInvalidStates: true,
    });
    ({ context, logger } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Sends an L1→L2 message via the Inbox, waits for it to be synced, then sends a public tx
  // consuming the message in the same block it lands. Waits for the epoch proof to cover that
  // block, then confirms the message cannot be consumed a second time.
  it('submits proof with a tx with public l1-to-l2 message claim', async () => {
    // Deploy a contract that consumes L1 to L2 messages
    await context.aztecNodeAdmin.setConfig({ minTxsPerBlock: 0 });
    logger.warn(`Deploying test contract`);
    const { contract: testContract } = await TestContract.deploy(context.wallet).send({ from: context.accounts[0] });
    logger.warn(`Test contract deployed at ${testContract.address}`);

    // Send an l1 to l2 message to be consumed from the contract
    const [secret, secretHash] = await generateClaimSecret();
    const message = { recipient: testContract.address, content: Fr.random(), secretHash };
    logger.warn(`Sending L1 to L2 message ${message.content.toString()} to be consumed by ${testContract.address}`);
    const { msgHash, globalLeafIndex } = await sendL1ToL2Message(message, context.deployL1ContractsValues);

    logger.warn(`Waiting for message ${msgHash} with index ${globalLeafIndex} to be synced`);
    await waitForL1ToL2MessageReady(context.aztecNode, msgHash, {
      timeoutSeconds: test.L2_SLOT_DURATION_IN_S * 6,
    });

    // And we consume the message using the test contract. It's important that we don't wait for the membership witness
    // to be available, since we want to test the scenario where the message becomes available on the same block the tx lands.
    logger.warn(`Consuming message ${message.content.toString()} from the contract at ${testContract.address}`);
    const { receipt: txReceipt } = await testContract.methods
      .consume_message_from_arbitrary_sender_public(
        message.content,
        secret,
        EthAddress.fromString(context.deployL1ContractsValues.l1Client.account.address),
        globalLeafIndex.toBigInt(),
      )
      .send({ from: context.accounts[0] });
    expect(txReceipt.blockNumber).toBeGreaterThan(0);

    // Wait until a proof lands for the transaction
    logger.warn(`Waiting for proof for tx ${txReceipt.txHash} mined at ${txReceipt.blockNumber!}`);
    await waitForProvenBlock(context.aztecNode, txReceipt.blockNumber!, {
      timeout: test.L2_SLOT_DURATION_IN_S * test.epochDuration * 3,
    });

    const provenBlockNumber = await context.aztecNode.getBlockNumber('proven');
    expect(provenBlockNumber).toBeGreaterThanOrEqual(txReceipt.blockNumber!);

    // Should not be able to consume the message again.
    const { receipt: failedReceipt } = await testContract.methods
      .consume_message_from_arbitrary_sender_public(
        message.content,
        secret,
        EthAddress.fromString(context.deployL1ContractsValues.l1Client.account.address),
        globalLeafIndex.toBigInt(),
      )
      .send({ from: context.accounts[0], wait: { dontThrowOnRevert: true } });
    expect(failedReceipt.executionResult).toBe(TxExecutionResult.REVERTED);

    logger.info(`Test succeeded`);
  });
});
