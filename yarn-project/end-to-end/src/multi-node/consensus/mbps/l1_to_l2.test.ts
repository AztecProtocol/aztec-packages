import { EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import { isL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import { timesAsync } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';
import { executeTimeout } from '@aztec/foundation/timer';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { sendL1ToL2Message } from '../../../fixtures/l1_to_l2_messaging.js';
import { waitForTxs } from '../../../fixtures/wait_helpers.js';
import { proveInteraction } from '../../../test-wallet/utils.js';
import { type MbpsFixture, assertMultipleBlocksPerSlot, jest, setupMbps, waitForProvenCheckpoint } from './setup.js';

describe('multi-node/consensus/mbps/l1_to_l2', () => {
  let fixture: MbpsFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  // Seeds L1→L2 messages, sends filler txs to advance the chain so messages become ready, then
  // pre-proves and sends consume txs. Verifies all consume txs are mined, a MBPS checkpoint exists,
  // and that checkpoint is proven.
  it('builds multiple blocks per slot with L1 to L2 messages', async () => {
    // L1→L2 messages only become ready once the chain advances `inboxLag` checkpoints past where they
    // were inboxed, and a checkpoint only advances when a block is built in a new slot. With
    // skipInitialSequencer the chain won't move on its own, and a one-shot burst of filler txs lands
    // within a single checkpoint — so let the sequencer keep building (empty) blocks each slot to drive
    // the chain forward until the messages are ready.
    fixture = await setupMbps({
      syncChainTip: 'proposed',
      minTxsPerBlock: 0,
      maxTxsPerBlock: 1,
      buildCheckpointIfEmpty: true,
    });
    const { test, context, logger, nodes, contract, wallet, from } = fixture;

    // Start sequencers first, then deploy cross-chain contract (needs running sequencer to mine).
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    logger.warn(`Deploying cross-chain test contract`);
    const { contract: crossChainContract } = await TestContract.deploy(wallet).send({ from });
    logger.warn(`Cross-chain test contract deployed at ${crossChainContract.address}`);

    const L1_TO_L2_COUNT = 4;
    const FILLER_TX_COUNT = 5; // Enough txs to advance the chain so messages become ready

    // Seed all L1→L2 messages at the beginning
    logger.warn(`Seeding ${L1_TO_L2_COUNT} L1→L2 messages`);
    const l1ToL2Messages = await timesAsync(L1_TO_L2_COUNT, async i => {
      const [secret, secretHash] = await generateClaimSecret();
      const content = Fr.random();
      const message = { recipient: crossChainContract.address, content, secretHash };

      const { msgHash, globalLeafIndex } = await sendL1ToL2Message(message, {
        l1Client: context.deployL1ContractsValues.l1Client,
        l1ContractAddresses: context.deployL1ContractsValues.l1ContractAddresses,
      });
      logger.warn(`L1→L2 message ${i + 1} sent with hash ${msgHash} and index ${globalLeafIndex}`);

      return { content, secret, msgHash, globalLeafIndex };
    });
    logger.warn(`Seeded ${l1ToL2Messages.length} L1→L2 messages`);

    // Pre-prove filler txs (using unique nullifiers to avoid conflicts)
    logger.warn(`Pre-proving ${FILLER_TX_COUNT} filler txs to advance the chain`);
    const fillerTxs = await timesAsync(FILLER_TX_COUNT, i =>
      proveInteraction(wallet, contract.methods.emit_nullifier(new Fr(1000 + i)), { from }),
    );
    logger.warn(`Pre-proved ${fillerTxs.length} filler txs`);

    // Send all filler txs at once (without waiting for them to be mined)
    const fillerTxHashes = await Promise.all(fillerTxs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${fillerTxHashes.length} filler txs`);

    // Wait for filler txs to be mined first - this ensures the chain has advanced enough for messages to be ready
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    await executeTimeout(() => waitForTxs(context.aztecNode, fillerTxHashes, { timeout }), timeout * 1000);
    logger.warn(`All filler txs have been mined`);

    // Wait for all messages to be ready in parallel (chain has advanced, messages should be available)
    const ethAccount = EthAddress.fromString(context.deployL1ContractsValues.l1Client.account.address);
    await Promise.all(
      l1ToL2Messages.map(async ({ msgHash }, i) => {
        logger.warn(`Waiting for L1→L2 message ${i + 1} to be ready`);
        await retryUntil(
          () => isL1ToL2MessageReady(context.aztecNode, msgHash),
          `L1→L2 message ${i + 1} ready`,
          test.L2_SLOT_DURATION_IN_S * 5,
        );
        logger.warn(`L1→L2 message ${i + 1} is ready`);
      }),
    );
    logger.warn(`All ${l1ToL2Messages.length} L1→L2 messages are ready`);

    // Pre-prove all consume transactions (to avoid nonce conflicts when sending in parallel)
    logger.warn(`Pre-proving ${l1ToL2Messages.length} consume transactions`);
    const consumeTxs = await timesAsync(l1ToL2Messages.length, i => {
      const { content, secret, globalLeafIndex } = l1ToL2Messages[i];
      return proveInteraction(
        wallet,
        crossChainContract.methods.consume_message_from_arbitrary_sender_public(
          content,
          secret,
          ethAccount,
          globalLeafIndex,
        ),
        { from },
      );
    });
    logger.warn(`Pre-proved ${consumeTxs.length} consume transactions`);

    // Send all consume transactions at once
    const consumeTxHashes = await Promise.all(consumeTxs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${consumeTxHashes.length} consume transactions`);

    // Wait for all consume txs to be mined
    await waitForTxs(context.aztecNode, consumeTxHashes, { timeout });
    logger.warn(`All ${consumeTxHashes.length} L1→L2 messages consumed`);

    const multiBlockCheckpoint = await assertMultipleBlocksPerSlot(fixture, 2);
    await waitForProvenCheckpoint(fixture, multiBlockCheckpoint);
  });
});
