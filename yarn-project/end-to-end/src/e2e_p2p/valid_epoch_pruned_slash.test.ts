import type { AztecNodeService } from '@aztec/aztec-node';
import { sleep } from '@aztec/aztec.js';
import { times } from '@aztec/foundation/collection';
import { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { OffenseType } from '@aztec/slasher';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';
import { awaitCommitteeExists, awaitCommitteeKicked, awaitOffenseDetected } from './shared.js';

jest.setTimeout(10 * 60_000); // 10 minutes

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_VALIDATORS = 4;
const COMMITTEE_SIZE = NUM_VALIDATORS;
const BOOT_NODE_UDP_PORT = 4500;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'valid-epoch-pruned-slash-'));

/**
 * Test that we slash the committee when the pruned epoch could have been proven.
 * We don't need to do anything special for this test other than to run it without a prover node
 * (which is the default), and this will produce pruned epochs that could have been proven. But we do
 * need to send a tx to make sure that the slash is due to valid epoch prune and not data withholding.
 */
describe('e2e_p2p_valid_epoch_pruned_slash', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  const slashingQuorum = 3;
  const slashingRoundSize = 4;
  const ethereumSlotDuration = 4;
  const aztecSlotDuration = 8;
  const aztecEpochDuration = 2;
  const initialEpoch = 8;
  const slashingUnit = BigInt(1e18);

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_valid_epoch_pruned',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        cancelTxOnTimeout: false,
        publisherAllowInvalidStates: true,
        listenAddress: '127.0.0.1',
        aztecEpochDuration,
        ethereumSlotDuration,
        aztecSlotDuration,
        aztecProofSubmissionEpochs: 1,
        slashingQuorum,
        slashingRoundSizeInEpochs: slashingRoundSize / aztecEpochDuration,
        slashSelfAllowed: true,
        slashGracePeriodL2Slots: initialEpoch * aztecEpochDuration,
        slashAmountSmall: slashingUnit,
        slashAmountMedium: slashingUnit * 2n,
        slashAmountLarge: slashingUnit * 3n,
        aztecTargetCommitteeSize: COMMITTEE_SIZE,
      },
    });

    await t.applyBaseSnapshots();
    await t.setup();
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

  it('slashes the committee when the pruned epoch could have been proven', async () => {
    // create the bootstrap node for the network
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    const { rollup, slashingProposer, slashFactory } = await t.getContracts();
    const [activationThreshold, ejectionThreshold, localEjectionThreshold] = await Promise.all([
      rollup.getActivationThreshold(),
      rollup.getEjectionThreshold(),
      rollup.getLocalEjectionThreshold(),
    ]);

    // Slashing amount should be enough to kick validators out
    const slashingAmount = slashingUnit * 3n;
    const biggestEjection = ejectionThreshold > localEjectionThreshold ? ejectionThreshold : localEjectionThreshold;
    expect(activationThreshold - slashingAmount).toBeLessThan(biggestEjection);

    t.ctx.aztecNodeConfig.slashPrunePenalty = slashingAmount;
    t.ctx.aztecNodeConfig.validatorReexecute = false;
    t.ctx.aztecNodeConfig.minTxsPerBlock = 1;
    t.ctx.aztecNodeConfig.txPoolDeleteTxsAfterReorg = true;

    t.logger.warn(`Creating ${NUM_VALIDATORS} new nodes`);
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
    );

    // Wait a bit for peers to discover each other
    await sleep(4000);
    await debugRollup();

    // Wait for the committee to exist
    await t.ctx.cheatCodes.rollup.advanceToEpoch(2);
    await t.ctx.cheatCodes.rollup.markAsProven();
    const committee = await awaitCommitteeExists({ rollup, logger: t.logger });
    await debugRollup();

    // Set up a wallet and keep it out of reorgs
    await t.ctx.cheatCodes.rollup.markAsProven();
    await t.setupAccount();
    await t.ctx.cheatCodes.rollup.markAsProven();

    // Warp forward to after the initial grace period
    expect(await rollup.getCurrentEpoch()).toBeLessThan(initialEpoch);
    await t.ctx.cheatCodes.rollup.advanceToEpoch(initialEpoch, { offset: -ethereumSlotDuration });
    await t.ctx.cheatCodes.rollup.markAsProven();

    // Send a tx to deploy a contract so that we have a tx with public function execution in the pruned epoch
    // This allows us to test that the slashed offense is valid epoch prune and not data withholding
    t.logger.warn(`Submitting deployment tx to the network`);
    const _spamContract = await SpamContract.deploy(t.wallet!).send({ from: t.defaultAccountAddress! }).deployed();

    // And send a tx that depends on a tx with public function execution on a contract class that will be reorged out
    // This allows us to test that we handle pruned contract classes correctly
    // TODO(palla/A-51): For this check to actually check what we need, we need to ensure the deployment and the
    // this tx are in different blocks but within the same epoch, so it gets reexecuted by the prune-watcher.
    // This does not always happen in the current test setup.
    // t.logger.warn(`Submitting tx with public function execution to the network`);
    // await spamContract.methods.spam(1, 1, true).send({ from: t.defaultAccountAddress! }).wait();

    // Initial node receives the txs, so we cannot stop it before that one is mined
    // Yes, that means that there are probably two nodes running the same validator key (the initial node and nodes[0])
    // This will come back and haunt us eventually, not just here but in most e2e p2p tests that make the same mistake
    t.logger.warn(`Removing initial node`);
    await t.removeInitialNode();

    // Wait for epoch to be pruned and the offense to be detected
    const offenses = await awaitOffenseDetected({
      logger: t.logger,
      nodeAdmin: nodes[0],
      slashingRoundSize,
      epochDuration: t.ctx.aztecNodeConfig.aztecEpochDuration,
      waitUntilOffenseCount: COMMITTEE_SIZE,
    });

    // Check offenses are correct
    expect(offenses.map(o => o.validator.toChecksumString()).sort()).toEqual(committee.map(a => a.toString()).sort());
    expect(offenses.map(o => o.offenseType)).toEqual(times(COMMITTEE_SIZE, () => OffenseType.VALID_EPOCH_PRUNED));
    const offenseEpoch = Number(offenses[0].epochOrSlot);

    // And then wait for them to be kicked out
    await awaitCommitteeKicked({
      rollup,
      cheatCodes: t.ctx.cheatCodes.rollup,
      committee,
      slashFactory,
      slashingProposer,
      slashingRoundSize,
      aztecSlotDuration,
      logger: t.logger,
      offenseEpoch,
      aztecEpochDuration,
    });
  });
});
