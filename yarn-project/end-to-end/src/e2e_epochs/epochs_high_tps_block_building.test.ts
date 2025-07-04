import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress, type Logger } from '@aztec/aztec.js';
import type { Operator } from '@aztec/ethereum';
import { asyncMap } from '@aztec/foundation/async-map';
import { times, timesAsync } from '@aztec/foundation/collection';
import { bufferToHex } from '@aztec/foundation/string';
import type { SpamContract } from '@aztec/noir-test-contracts.js/Spam';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

const NODE_COUNT = 3;

// We send 10 txs total, each taking 1s to process (see sequencerFakeDelayPerTxMs), with a total
// L2 slot time of 16s, with maxL1TxInclusionTimeIntoSlot set to 0 and attestationPropagationTime of 0.5.
// This leaves us with roughly 2s for executing txs. This test will check that proposers honor the timetable
// and do not try to include more than 2 txs per block. Should we ever implement preemptive block building,
// sequencers will end up with more time, so we'll need to bump the EXPECTED_MAX_TXS_PER_BLOCK value.
const TX_COUNT = 8;
const EXPECTED_MAX_TXS_PER_BLOCK = 3;

// Test that sequencers and validators can handle a large backlog of transactions.
// Spawns NODE_COUNT validator nodes, connected via a mocked gossip sub network.
// Introduces an arbitrary delay to public tx simulation to fake long processing times,
// then spams the network with TX_COUNT transactions. In addition, uses the l1 tx
// delayer to fake long L1 tx inclusion times, so sending a tx immediately before an L1
// block is mined does not get it included, like in an actual network.
describe('e2e_epochs/epochs_high_tps_block_building', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let test: EpochsTestContext;
  let validators: (Operator & { privateKey: `0x${string}` })[];
  let nodes: AztecNodeService[];
  let contract: SpamContract;

  beforeEach(async () => {
    validators = times(NODE_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey };
    });

    // Setup context with the given set of validators, no reorgs, mocked gossip sub network, and no anvil test watcher.
    test = await EpochsTestContext.setup({
      numberOfAccounts: 1,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      disableAnvilTestWatcher: true,
      aztecProofSubmissionEpochs: 1024,
      startProverNode: false,
      enforceTimeTable: true,
      ethereumSlotDuration: 8,
      aztecSlotDuration: 16,
      fakeProcessingDelayPerTxMs: 850,
      attestationPropagationTime: 0.5,
      minTxsPerBlock: 1,
      maxTxsPerBlock: 100,
      maxL1TxInclusionTimeIntoSlot: 0,
    });

    ({ context, logger } = test);

    // Halt block building in initial aztec node, which was not set up as a validator.
    logger.warn(`Stopping sequencer in initial aztec node.`);
    await context.sequencer!.stop();

    // Start the validator nodes. Note the txDelayerMaxInclusionTimeIntoSlot is set to 1s,
    // so the tx delayer will simulate the network not accepting a tx for the next block
    // unless it is sent within the first second of the L1 slot.
    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    nodes = await asyncMap(validators, ({ privateKey }) =>
      test.createValidatorNode([privateKey], { dontStartSequencer: true, txDelayerMaxInclusionTimeIntoSlot: 1 }),
    );
    logger.warn(`Started ${NODE_COUNT} validator nodes.`, { validators: validators.map(v => v.attester.toString()) });

    // Register spam contract for sending txs.
    contract = await test.registerSpamContract(context.wallet);
    logger.warn(`Test setup completed.`, { validators: validators.map(v => v.attester.toString()) });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('builds blocks without any errors', async () => {
    // Create and submit several txs
    const txs = await timesAsync(TX_COUNT, i => contract.methods.spam(i, 1n, false).prove());
    const sentTxs = await Promise.all(txs.map(tx => tx.send()));
    logger.warn(`Sent ${sentTxs.length} transactions`, {
      txs: await Promise.all(sentTxs.map(tx => tx.getTxHash())),
    });

    const sequencers = nodes.map(node => node.getSequencer()!);
    const { failEvents } = test.watchSequencerEvents(sequencers, i => ({ validator: validators[i].attester }));

    // Start the sequencers!
    await Promise.all(sequencers.map(sequencer => sequencer.start()));
    logger.warn(`Started all sequencers`);

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * (TX_COUNT + 3);
    await Promise.all(sentTxs.map(tx => tx.wait({ timeout })));
    logger.warn(`All txs have been mined`);

    // Check all blocks mined by the sequencers have under the expected max number of transactions.
    const blocks = await nodes[0].getPublishedBlocks(1, 50);
    for (const block of blocks) {
      logger.warn(
        `Block ${block.block.number} was mined at L1 ${block.l1.blockNumber} with ${block.block.body.txEffects.length} transactions`,
        { transactions: block.block.body.txEffects.map(tx => tx.txHash) },
      );
    }
    for (const block of blocks) {
      expect(block.block.body.txEffects.length).toBeLessThanOrEqual(EXPECTED_MAX_TXS_PER_BLOCK);
    }

    // Expect no failures from sequencers during block building.
    // The following error is marked as a flake on the test ignore patterns,
    // so we can have this test run for a while before it breaks CI on a recoverable error.
    if (failEvents.length > 0) {
      logger.error(`Failed events from sequencers`, failEvents);
    }
    expect(failEvents).toEqual([]);
  });
});
