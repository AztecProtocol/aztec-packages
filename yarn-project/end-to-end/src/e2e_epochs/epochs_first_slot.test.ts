import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress, type Logger, getTimestampRangeForEpoch, sleep } from '@aztec/aztec.js';
import type { Operator } from '@aztec/ethereum';
import { asyncMap } from '@aztec/foundation/async-map';
import { times, timesAsync } from '@aztec/foundation/collection';
import { bufferToHex } from '@aztec/foundation/string';
import { executeTimeout } from '@aztec/foundation/timer';
import type { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

const NODE_COUNT = 8;
const COMMITTEE_SIZE = 3;
const TX_COUNT = 2;
const EPOCH = 3n;

// Spawns NODE_COUNT validator nodes, connected via a mocked gossip sub network, but sets
// committee size to 3. Warps to immediately before the beginning of an epoch, and checks
// that the first slot of the epoch is mined without any errors.
// Regression test for https://github.com/AztecProtocol/aztec-packages/issues/15414
describe('e2e_epochs/epochs_first_slot', () => {
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
      aztecEpochDuration: 32,
      startProverNode: false,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      enforceTimeTable: true,
      minTxsPerBlock: 1,
      maxTxsPerBlock: 1,
      attestationPropagationTime: 0.5,
      maxL1TxInclusionTimeIntoSlot: 0,
    });

    ({ context, logger } = test);

    // Halt block building in initial aztec node, which was not set up as a validator.
    logger.warn(`Stopping sequencer in initial aztec node.`);
    await context.sequencer!.stop();

    // Start the validator nodes
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

  it('builds blocks on the first two slots of the epoch', async () => {
    // Create and submit txs for the first two slots of the epoch
    // We set maxTxsPerBlock to 1, so two txs mean two consecutive blocks
    const txs = await timesAsync(TX_COUNT, i => contract.methods.spam(i, 1n, false).prove());
    const sentTxs = await Promise.all(txs.map(tx => tx.send()));
    logger.warn(`Sent ${sentTxs.length} transactions`, {
      txs: await Promise.all(sentTxs.map(tx => tx.getTxHash())),
    });

    const sequencers = nodes.map(node => node.getSequencer()!);
    const { failEvents } = test.watchSequencerEvents(sequencers, i => ({ validator: validators[i].attester }));

    // Warp to before the first slot of an epoch, so that the sequencers are ready to build blocks.
    const [epochStart] = getTimestampRangeForEpoch(EPOCH, test.constants);
    await test.context.cheatCodes.eth.warp(Number(epochStart) - test.L1_BLOCK_TIME_IN_S, {
      resetBlockInterval: true,
      updateDateProvider: test.context.dateProvider,
    });

    // Start the sequencers
    await Promise.all(sequencers.map(sequencer => sequencer.start()));
    logger.warn(`Started all sequencers`);

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * (TX_COUNT * 2 + 1) * 1000;
    await executeTimeout(() => Promise.all(sentTxs.map(tx => tx.wait())), timeout);
    logger.warn(`All txs have been mined`);
    await sleep(1000);

    // Check that the first two slots of the epoch have a block
    const blocks = await nodes[0].getBlocks(1, 10);
    const slots = blocks.map(block => block.header.getSlot());
    const [firstSlot] = getSlotRangeForEpoch(EPOCH, test.constants);
    expect(slots).toContain(firstSlot);
    expect(slots).toContain(firstSlot + 1n);

    // Expect no failures from sequencers during block building.
    // The following error is marked as a flake on the test ignore patterns,
    // so we can have this test run for a while before it breaks CI on a recoverable error.
    if (failEvents.length > 0) {
      logger.error(`Failed events from sequencers`, failEvents);
    }
    expect(failEvents).toEqual([]);
  });
});
