import { EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { waitForBlockNumber, waitForTxs } from '../../../fixtures/wait_helpers.js';
import { proveInteraction } from '../../../test-wallet/utils.js';
import { type MbpsFixture, assertMultipleBlocksPerSlot, jest, setupMbps, waitForProvenCheckpoint } from './setup.js';

const TX_COUNT = 10;

describe('multi-node/consensus/mbps/l2_to_l1', () => {
  let fixture: MbpsFixture;

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture?.test?.teardown();
  });

  // Deploys a cross-chain TestContract, pre-proves TX_COUNT L2→L1 message txs, sends them all, waits
  // for all to be mined, then asserts the total L2→L1 message count across all blocks ≥ TX_COUNT,
  // a MBPS checkpoint exists, and that checkpoint is proven.
  it('builds multiple blocks per slot with L2 to L1 messages', async () => {
    fixture = await setupMbps({ syncChainTip: 'proposed', minTxsPerBlock: 1, maxTxsPerBlock: 2 });
    const { test, context, logger, archiver, nodes, wallet, from } = fixture;

    // Start sequencers first, then deploy cross-chain contract (needs running sequencer to mine).
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));
    logger.warn(`Started all sequencers`);

    logger.warn(`Deploying cross-chain test contract`);
    const { contract: crossChainContract } = await TestContract.deploy(wallet).send({ from });
    logger.warn(`Cross-chain test contract deployed at ${crossChainContract.address}`);

    // Pre-prove all L2→L1 message transactions
    const l2ToL1Recipient = EthAddress.fromString(context.deployL1ContractsValues.l1Client.account.address);
    logger.warn(`Pre-proving ${TX_COUNT} L2→L1 message transactions`);
    const txs = await timesAsync(TX_COUNT, () =>
      proveInteraction(
        wallet,
        crossChainContract.methods.create_l2_to_l1_message_arbitrary_recipient_public(Fr.random(), l2ToL1Recipient),
        { from },
      ),
    );
    logger.warn(`Pre-proved ${txs.length} L2→L1 message transactions`);

    // Send all transactions at once
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} L2→L1 message transactions`);

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * 5;
    const receipts = await waitForTxs(context.aztecNode, txHashes, { timeout });
    logger.warn(`All L2→L1 message txs have been mined`);

    // wait for the other node to synch (nodes[0]'s block source is `archiver`)
    const maxBlockNumber = Math.max(...receipts.map(r => r.blockNumber!));
    await waitForBlockNumber(nodes[0], maxBlockNumber, {
      tag: 'checkpointed',
      timeout: test.L2_SLOT_DURATION_IN_S * 3,
      interval: 0.1,
    });

    // Mirror the sibling MBPS tests: we may lose one sub-slot to pipelined overhead, so accept >= 2
    // blocks per checkpoint rather than the legacy 3-block expectation.
    const multiBlockCheckpoint = await assertMultipleBlocksPerSlot(fixture, 2);

    // Verify L2→L1 messages are in the blocks
    const checkpoints = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 50 });
    const allBlocks = checkpoints.flatMap(pc => pc.checkpoint.blocks);
    const allL2ToL1Messages = allBlocks.flatMap(block => block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs));
    logger.warn(`Found ${allL2ToL1Messages.length} L2→L1 message(s) across all blocks`, { allL2ToL1Messages });
    expect(allL2ToL1Messages.length).toBeGreaterThanOrEqual(TX_COUNT);
    await waitForProvenCheckpoint(fixture, multiBlockCheckpoint);
  });
});
