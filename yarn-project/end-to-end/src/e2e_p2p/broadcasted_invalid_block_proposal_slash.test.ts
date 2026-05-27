import type { AztecNodeService } from '@aztec/aztec-node';
import type { TestAztecNodeService } from '@aztec/aztec-node/test';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { OffenseType } from '@aztec/slasher';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';
import { advanceToEpochBeforeProposer, awaitCommitteeExists, awaitOffenseDetected } from './shared.js';

const TEST_TIMEOUT = 1_000_000;

jest.setTimeout(TEST_TIMEOUT);

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_VALIDATORS = 4;
const BOOT_NODE_UDP_PORT = 4500;
const COMMITTEE_SIZE = NUM_VALIDATORS;
const ETHEREUM_SLOT_DURATION = 4;
const AZTEC_SLOT_DURATION = ETHEREUM_SLOT_DURATION * 2;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'broadcasted-invalid-block-proposal-slash-'));

/**
 * Test that slashing occurs when a validator broadcasts an invalid block proposal via p2p.
 *
 * The setup of the test is as follows:
 * 1. Create 4 validator nodes
 * 2. Configure one node to broadcast invalid block proposals
 * 3. Set a non-zero slashing amount for BROADCASTED_INVALID_BLOCK_PROPOSAL
 * 4. Wait for the committee to be formed
 * 5. Send a transaction that will trigger a block proposal
 * 6. Expect that the invalid proposer gets slashed
 */
describe('e2e_p2p_broadcasted_invalid_block_proposal_slash', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  const slashingUnit = BigInt(1e18);
  const slashingQuorum = 3;
  const slashingRoundSize = 4;
  const aztecEpochDuration = 2;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_broadcasted_invalid_block_proposal_slash',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        anvilSlotsInAnEpoch: 4,
        listenAddress: '127.0.0.1',
        aztecEpochDuration,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        aztecTargetCommitteeSize: COMMITTEE_SIZE,
        enableProposerPipelining: true,
        inboxLag: 2,
        aztecProofSubmissionEpochs: 1024, // effectively do not reorg
        slashInactivityConsecutiveEpochThreshold: 32, // effectively do not slash for inactivity
        minTxsPerBlock: 0, // always be building
        mockGossipSubNetwork: true, // do not worry about p2p connectivity issues
        slashingQuorum,
        slashingRoundSizeInEpochs: slashingRoundSize / aztecEpochDuration,
        slashAmountSmall: slashingUnit,
        slashAmountMedium: slashingUnit * 2n,
        slashAmountLarge: slashingUnit * 3n,
      },
    });

    await t.setup();
    await t.applyBaseSetup();
  });

  afterEach(async () => {
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  const debugRollup = async () => {
    await t.ctx.cheatCodes.rollup.debugRollup();
  };

  it('slashes validator who broadcasts invalid block proposal', async () => {
    const { rollup } = await t.getContracts();

    // Jump forward to an epoch in the future such that the validator set is not empty
    await t.ctx.cheatCodes.rollup.advanceToEpoch(EpochNumber(4));
    await debugRollup();

    const [activationThreshold, ejectionThreshold, localEjectionThreshold] = await Promise.all([
      rollup.getActivationThreshold(),
      rollup.getEjectionThreshold(),
      rollup.getLocalEjectionThreshold(),
    ]);

    // Slashing amount should be enough to kick validators out
    const slashingAmount = slashingUnit * 3n;
    const biggestEjection = ejectionThreshold > localEjectionThreshold ? ejectionThreshold : localEjectionThreshold;
    expect(activationThreshold - slashingAmount).toBeLessThan(biggestEjection);

    t.ctx.aztecNodeConfig.slashBroadcastedInvalidBlockPenalty = slashingAmount;

    t.logger.warn('Creating nodes');

    // Create first node that broadcasts invalid proposals. Keep its sequencer stopped until
    // every node has joined the P2P mesh; otherwise (under proposer pipelining) the invalid
    // proposer can publish its sole bad block to slot N before the honest nodes are connected,
    // and they will reject the proposal as "invalid slot number" instead of slashing it.
    const invalidProposerConfig = {
      ...t.ctx.aztecNodeConfig,
      broadcastInvalidBlockProposal: true,
      dontStartSequencer: true,
    };
    const invalidProposerNodes = await createNodes(
      invalidProposerConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      1,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
      shouldCollectMetrics(),
      0,
    );

    const invalidProposerAddress = invalidProposerNodes[0].getSequencer()!.validatorAddresses![0];
    t.logger.warn(`Invalid proposer address: ${invalidProposerAddress.toString()}`);

    // Create remaining honest nodes, also with sequencers stopped, for the same reason.
    const honestNodes = await createNodes(
      { ...t.ctx.aztecNodeConfig, dontStartSequencer: true },
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS - 1,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
      shouldCollectMetrics(),
      1,
    );

    nodes = [...invalidProposerNodes, ...honestNodes];

    // Wait for P2P mesh to be fully formed before starting sequencers
    await t.waitForP2PMeshConnectivity(nodes, NUM_VALIDATORS);

    await awaitCommitteeExists({ rollup, logger: t.logger });

    // Find an epoch where the invalid proposer is selected, stopping one epoch before so
    // we have time to start sequencers before the target epoch arrives.
    const epochCache = (honestNodes[0] as TestAztecNodeService).epochCache;
    const { targetEpoch } = await advanceToEpochBeforeProposer({
      epochCache,
      cheatCodes: t.ctx.cheatCodes.rollup,
      targetProposer: invalidProposerAddress,
      logger: t.logger,
    });

    // Start all sequencers while still one epoch before the target
    t.logger.warn('Starting all sequencers');
    await Promise.all(nodes.map(n => n.getSequencer()!.start()));

    // Now warp to one slot before the target epoch — sequencers are already running.
    // Under proposer pipelining, the invalid proposer begins building for the first slot
    // of the target epoch one slot earlier; warping to the start of the epoch would force
    // the bad proposal to serialize past the slot boundary, after which honest receivers
    // reject it as late.
    t.logger.warn(`Advancing to one slot before target epoch ${targetEpoch}`);
    await t.ctx.cheatCodes.rollup.advanceToEpoch(targetEpoch, { offset: -AZTEC_SLOT_DURATION });

    // Wait for offense to be detected. Under proposer pipelining, the invalid block proposal is
    // broadcast at the slot boundary while a receiver's wall clock may have already advanced
    // past the build slot — when that happens, the honest node rejects the gossip with "invalid
    // slot number" before slashing logic runs. Collect offenses from every node so we catch
    // whichever node managed to process the proposal while still in the build slot.
    await awaitOffenseDetected({
      epochDuration: t.ctx.aztecNodeConfig.aztecEpochDuration,
      logger: t.logger,
      nodeAdmin: nodes[1], // Use honest node to check for offenses
      slashingRoundSize,
      waitUntilOffenseCount: 1,
      timeoutSeconds: AZTEC_SLOT_DURATION * 16,
    });

    const invalidBlockOffenses = await retryUntil(
      async () => {
        const allOffenses = (await Promise.all(nodes.map(n => n.getSlashOffenses('all')))).flat();
        const filtered = allOffenses.filter(o => o.offenseType === OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL);
        if (filtered.length > 0) {
          return filtered;
        }
      },
      'broadcasted invalid block proposal offense',
      AZTEC_SLOT_DURATION * 4,
    );

    t.logger.warn(`Collected broadcasted invalid block proposal offenses`, { invalidBlockOffenses });
    expect(invalidBlockOffenses.length).toBeGreaterThan(0);
    for (const offense of invalidBlockOffenses) {
      expect(offense.validator.toString()).toEqual(invalidProposerAddress.toString());
    }

    // Check slash is recorded on chain
    const slashPromise = promiseWithResolvers<{ amount: bigint; attester: EthAddress }>();
    rollup.listenToSlash(args => {
      t.logger.warn(`Slashed ${args.attester.toString()}`);
      slashPromise.resolve(args);
    });
    const { amount, attester } = await slashPromise.promise;
    expect(invalidProposerAddress.toString()).toEqual(attester.toString());
    expect(amount).toEqual(slashingAmount);
  });
});
