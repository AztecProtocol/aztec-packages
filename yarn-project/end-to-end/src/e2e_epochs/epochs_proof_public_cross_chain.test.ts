import { Fr, type Logger, TxStatus, generateClaimSecret, retryUntil } from '@aztec/aztec.js';
import { EthAddress } from '@aztec/foundation/eth-address';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { jest } from '@jest/globals';

import { sendL1ToL2Message } from '../fixtures/l1_to_l2_messaging.js';
import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

// Proves an epoch that contains txs with public function calls that consume L1 to L2 messages
// Regression for this issue https://aztecprotocol.slack.com/archives/C085C1942HG/p1754400213976059
describe('e2e_epochs/epochs_proof_public_cross_chain', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup({
      numberOfAccounts: 1,
      minTxsPerBlock: 1,
      disableAnvilTestWatcher: true,
      publisherAllowInvalidStates: true,
    });
    ({ context, logger } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('submits proof with a tx with public l1-to-l2 message claim', async () => {
    // Deploy a contract that consumes L1 to L2 messages
    await context.aztecNodeAdmin!.setConfig({ minTxsPerBlock: 0 });
    logger.warn(`Deploying test contract`);
    const testContract = await TestContract.deploy(context.wallet).send({ from: context.accounts[0] }).deployed();
    logger.warn(`Test contract deployed at ${testContract.address}`);

    // Send an l1 to l2 message to be consumed from the contract
    const [secret, secretHash] = await generateClaimSecret();
    const message = { recipient: testContract.address, content: Fr.random(), secretHash };
    logger.warn(`Sending L1 to L2 message ${message.content.toString()} to be consumed by ${testContract.address}`);
    const { msgHash, globalLeafIndex } = await sendL1ToL2Message(message, context.deployL1ContractsValues);

    logger.warn(`Waiting for message ${msgHash} with index ${globalLeafIndex} to be synced`);
    await retryUntil(
      () => context.aztecNode.isL1ToL2MessageSynced(msgHash),
      'message sync',
      test.L2_SLOT_DURATION_IN_S * 4,
    );

    // And we consume the message using the test contract. It's important that we don't wait for the membership witness
    // to be available, since we want to test the scenario where the message becomes available on the same block the tx lands.
    logger.warn(`Consuming message ${message.content.toString()} from the contract at ${testContract.address}`);
    const txReceipt = await testContract.methods
      .consume_message_from_arbitrary_sender_public(
        message.content,
        secret,
        EthAddress.fromString(context.deployL1ContractsValues.l1Client.account.address),
        globalLeafIndex.toBigInt(),
      )
      .send({ from: context.accounts[0] })
      .wait();
    expect(txReceipt.blockNumber).toBeGreaterThan(0);

    // Wait until a proof lands for the transaction
    logger.warn(`Waiting for proof for tx ${txReceipt.txHash} mined at ${txReceipt.blockNumber!}`);
    await retryUntil(
      async () => {
        const provenBlockNumber = await context.aztecNode.getProvenBlockNumber();
        logger.info(`Proven block number is ${provenBlockNumber}`);
        return provenBlockNumber >= txReceipt.blockNumber!;
      },
      'Proof has been submitted',
      test.L2_SLOT_DURATION_IN_S * test.epochDuration * 3,
    );

    const provenBlockNumber = await context.aztecNode.getProvenBlockNumber();
    expect(provenBlockNumber).toBeGreaterThanOrEqual(txReceipt.blockNumber!);

    // Should not be able to consume the message again.
    const failedReceipt = await testContract.methods
      .consume_message_from_arbitrary_sender_public(
        message.content,
        secret,
        EthAddress.fromString(context.deployL1ContractsValues.l1Client.account.address),
        globalLeafIndex.toBigInt(),
      )
      .send({ from: context.accounts[0] })
      .wait({ dontThrowOnRevert: true });
    expect(failedReceipt.status).toBe(TxStatus.APP_LOGIC_REVERTED);

    logger.info(`Test succeeded`);
  });
});
