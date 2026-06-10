import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { isL1ToL2MessageReady, waitForL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import { TxExecutionResult } from '@aztec/aztec.js/tx';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { retryUntil } from '@aztec/foundation/retry';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { tryStop } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';

import { sendL1ToL2Message } from '../fixtures/l1_to_l2_messaging.js';
import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

// Proves an epoch that contains txs with public function calls that consume L1 to L2 messages
// Regression for an issue in which the sequencer correctly adds L1-to-L2 messages to its world-state fork
// before processing txs, but the prover node's proving job creates a separate fork without inserting the
// messages first. This causes a block header mismatch (different state roots, fees, mana) when a tx consumes
// a message that was added to the L1-to-L2 message tree in the same block — the prover reverts the tx while
// the sequencer processes it successfully.
describe('e2e_epochs/epochs_proof_public_cross_chain', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup({
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
    await retryUntil(
      async () => {
        const provenBlockNumber = await context.aztecNode.getBlockNumber('proven');
        logger.info(`Proven block number is ${provenBlockNumber}`);
        return provenBlockNumber >= txReceipt.blockNumber!;
      },
      'Proof has been submitted',
      test.L2_SLOT_DURATION_IN_S * test.epochDuration * 3,
    );

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

// Asserts that L1-to-L2 message readiness must be evaluated at the same chain tip the consuming PXE syncs to.
// A message can be present at `latest` while the `proven` tip (which the PXE here anchors to) still lags behind,
// in which case the message cannot yet be proven during simulation. This is the invariant the bot relies on to
// avoid considering a fee-juice bridge claim ready before its embedded PXE can consume it.
describe('e2e_epochs/epochs_proof_public_cross_chain readiness at proven tip', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let test: EpochsTestContext;

  beforeEach(async () => {
    // PXE syncs to `proven` so simulation anchors to the proven tip, not latest.
    test = await EpochsTestContext.setup({
      numberOfAccounts: 1,
      minTxsPerBlock: 1,
      sequencerPublisherAllowInvalidStates: true,
      pxeOpts: { syncChainTip: 'proven' },
    });
    ({ context, logger } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('only reports a message ready at the proven tip once proving advances past it', async () => {
    await context.aztecNodeAdmin.setConfig({ minTxsPerBlock: 0 });

    // Deploy the consuming contract while proving runs so the proven-synced PXE has an anchor and the
    // contract is itself proven.
    logger.warn(`Deploying test contract`);
    const { contract: testContract, receipt: deployReceipt } = await TestContract.deploy(context.wallet).send({
      from: context.accounts[0],
    });
    logger.warn(`Test contract deployed at ${testContract.address} in block ${deployReceipt.blockNumber}`);

    // Before freezing proving, wait until the proven tip covers the contract deployment block. That block is
    // at or after the account-deploy block, so this guarantees both the SchnorrAccount and the TestContract are
    // proven and visible to the proven-synced PXE. Otherwise the entrypoint simulation panics because the
    // account's signing-key note is not yet present at the proven tip.
    logger.warn(`Waiting for proven tip to cover deployment block ${deployReceipt.blockNumber}`);
    await test.waitForNodeToSync(BlockNumber(deployReceipt.blockNumber!), 'proven');
    const provenBeforeFreeze = await context.aztecNode.getBlockNumber('proven');
    logger.warn(`Proven tip established at block ${provenBeforeFreeze}`);

    // Freeze proving by stopping the prover node. Proposed/latest keeps advancing, proven stays put.
    logger.warn(`Stopping prover node to freeze the proven tip`);
    await tryStop(context.proverNode, logger);
    context.proverNode = undefined;

    // Seed an L1-to-L2 message and let it land at the latest tip.
    const [secret, secretHash] = await generateClaimSecret();
    const message = { recipient: testContract.address, content: Fr.random(), secretHash };
    logger.warn(`Sending L1 to L2 message ${message.content.toString()}`);
    const { msgHash, globalLeafIndex } = await sendL1ToL2Message(message, context.deployL1ContractsValues);

    logger.warn(`Waiting for message ${msgHash} to be ready at latest`);
    await waitForL1ToL2MessageReady(context.aztecNode, msgHash, {
      timeoutSeconds: test.L2_SLOT_DURATION_IN_S * 6,
      chainTip: 'latest',
    });

    // The message exists at latest but the proven tip has not advanced to include it yet.
    expect(await isL1ToL2MessageReady(context.aztecNode, msgHash, 'latest')).toBe(true);
    expect(await isL1ToL2MessageReady(context.aztecNode, msgHash, 'proven')).toBe(false);

    // Consuming from the proven-synced PXE must fail while the message is not present at the proven tip.
    const consume = () =>
      testContract.methods
        .consume_message_from_arbitrary_sender_public(
          message.content,
          secret,
          EthAddress.fromString(context.deployL1ContractsValues.l1Client.account.address),
          globalLeafIndex.toBigInt(),
        )
        .send({ from: context.accounts[0] });

    logger.warn(`Expecting consume to fail while message is not present at proven tip`);
    await expect(consume()).rejects.toThrow();

    // Advance proving by spinning up a fresh prover node.
    logger.warn(`Starting a new prover node to advance the proven tip`);
    context.proverNode = await test.createProverNode();

    logger.warn(`Waiting for message ${msgHash} to become ready at proven`);
    await waitForL1ToL2MessageReady(context.aztecNode, msgHash, {
      timeoutSeconds: test.L2_SLOT_DURATION_IN_S * test.epochDuration * 4,
      chainTip: 'proven',
    });
    expect(await isL1ToL2MessageReady(context.aztecNode, msgHash, 'proven')).toBe(true);

    // Now the proven-synced PXE can consume the message.
    logger.warn(`Consuming message now that the proven tip includes it`);
    const { receipt } = await consume();
    expect(receipt.blockNumber).toBeGreaterThan(0);

    logger.info(`Test succeeded`);
  });
});
