import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { getTimestampRangeForEpoch } from '@aztec/aztec.js/block';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/aztec.js/protocol';
import type { Operator } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import { executeTimeout } from '@aztec/foundation/timer';
import type { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { type EndToEndContext, getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { proveInteraction } from '../test-wallet/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

const NODE_COUNT = 8;
const COMMITTEE_SIZE = 3;
const TX_COUNT = 8;

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
  let from: AztecAddress;

  beforeEach(async () => {
    validators = times(NODE_COUNT, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + 3)!);
      const attester = EthAddress.fromString(privateKeyToAccount(privateKey).address);
      return { attester, withdrawer: attester, privateKey, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) };
    });

    // Setup context with the given set of validators, no reorgs, and a mocked gossip sub network.
    // We expect 4 blocks per checkpoint with this config
    test = await EpochsTestContext.setup({
      numberOfAccounts: 0,
      initialValidators: validators,
      mockGossipSubNetwork: true,
      aztecProofSubmissionEpochs: 1024,
      aztecEpochDuration: 32,
      aztecSlotDurationInL1Slots: 3,
      ethereumSlotDuration: 12,
      blockDurationMs: 6000,
      startProverNode: false,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      minTxsPerBlock: 1,
      maxTxsPerBlock: 1,
      attestationPropagationTime: 0.5,
      archiverPollingIntervalMS: 200,
      skipInitialSequencer: true,
      inboxLag: 2,
    });

    ({ context, logger } = test);
    from = context.accounts[0]; // auto-created by setup

    // Start the validator nodes
    logger.warn(`Initial setup complete. Starting ${NODE_COUNT} validator nodes.`);
    nodes = await asyncMap(validators, ({ privateKey }) =>
      test.createValidatorNode([privateKey], {
        dontStartSequencer: true,
        txDelayerMaxInclusionTimeIntoSlot: 2,
        l1PublishingTime: test.L1_BLOCK_TIME_IN_S - 1,
      }),
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
    const txs = await timesAsync(TX_COUNT, i =>
      proveInteraction(context.wallet, contract.methods.spam(i, 1n, false), { from }),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} transactions`, {
      txs: txHashes,
    });

    const sequencers = nodes.map(node => node.getSequencer()!);
    const { failEvents } = test.watchSequencerEvents(sequencers, i => ({ validator: validators[i].attester }));

    // Jump to the beginning of two epochs from now
    const currentEpoch = (await test.monitor.run()).l2EpochNumber;
    const epoch = EpochNumber(currentEpoch + 2);

    // Warp so that the next pipelined build cycle targets the first slot of the epoch. Under
    // proposer pipelining the build window starts one L2 slot earlier than the target slot
    // so we want wall-clock to enter `firstSlot - 1` (the last slot of the previous epoch) before
    // the next L1 block. Subtracting `L2_SLOT_DURATION + L1_BLOCK_TIME` puts us one L1 block before that
    // build slot starts, so the proposer for `firstSlot` gets the full build window available
    // before the epoch boundary is crossed on L1.
    const [epochStart] = getTimestampRangeForEpoch(epoch, test.constants);
    await test.context.cheatCodes.eth.warp(Number(epochStart) - test.L2_SLOT_DURATION_IN_S - test.L1_BLOCK_TIME_IN_S, {
      resetBlockInterval: true,
    });

    // Start the sequencers
    await Promise.all(sequencers.map(sequencer => sequencer.start()));
    logger.warn(`Started all sequencers`);

    // Wait until all txs are mined
    const timeout = test.L2_SLOT_DURATION_IN_S * (TX_COUNT * 2 + 1) * 1000;
    await executeTimeout(() => Promise.all(txHashes.map(hash => waitForTx(context.aztecNode, hash))), timeout);
    logger.warn(`All txs have been mined`);

    // Check that the first two slots of the epoch have a block
    const [firstSlot] = getSlotRangeForEpoch(epoch, test.constants);
    const secondSlot = SlotNumber(firstSlot + 1);
    logger.warn(`Waiting until blocks are synced for slots ${firstSlot} and ${secondSlot}`);
    await retryUntil(
      async () => {
        const blocks = await nodes[0].getBlocks(BlockNumber(INITIAL_L2_BLOCK_NUM), 10);
        const slots = blocks.map(block => block.header.getSlot());
        logger.info(`Fetched blocks ${blocks.map(b => b.number).join(', ')} with slots ${slots.join(', ')}`);
        return slots.includes(firstSlot) && slots.includes(secondSlot);
      },
      'waiting for blocks',
      20,
      1,
    );

    test.assertNoFailuresFromSequencers(failEvents);
  });
});
