import type { AztecNodeService } from '@aztec/aztec-node';
import { sleep } from '@aztec/aztec.js';

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
const BOOT_NODE_UDP_PORT = 4500;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'valid-epoch-pruned-'));

/**
 * Test that we slash the committee when the pruned epoch could have been proven.
 *
 * Note, we don't need to do anything special for this test other than to run it without a prover node
 * (which is the default), and this will produce pruned epochs that could have been proven.
 */
describe('e2e_p2p_valid_epoch_pruned', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  const slashingQuorum = 3;
  const slashingRoundSize = 4;
  const aztecSlotDuration = 8;
  const slashingUnit = BigInt(1e18);

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_valid_epoch_pruned',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        listenAddress: '127.0.0.1',
        aztecEpochDuration: 2,
        ethereumSlotDuration: 4,
        aztecSlotDuration,
        aztecProofSubmissionEpochs: 0, // reorg as soon as epoch ends
        slashingQuorum,
        slashingRoundSizeInEpochs: slashingRoundSize / 2,
        slashSelfAllowed: true,
        slashAmountSmall: slashingUnit,
        slashAmountMedium: slashingUnit * 2n,
        slashAmountLarge: slashingUnit * 3n,
      },
    });

    await t.applyBaseSnapshots();
    await t.setup();
    await t.removeInitialNode();
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
    t.ctx.aztecNodeConfig.minTxsPerBlock = 0;

    // Jump forward to an epoch in the future such that the validator set is not empty
    await t.ctx.cheatCodes.rollup.advanceToEpoch(4n);

    // create our network of nodes and submit txs into each of them
    // the number of txs per node and the number of txs per rollup
    // should be set so that the only way for rollups to be built
    // is if the txs are successfully gossiped around the nodes.
    t.logger.info('Creating nodes');
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
    const committee = await awaitCommitteeExists({ rollup, logger: t.logger });
    await debugRollup();

    // Wait for epoch to be pruned and the offense to be detected
    const _offenses = await awaitOffenseDetected({
      logger: t.logger,
      nodeAdmin: nodes[0],
      slashingRoundSize,
      epochDuration: t.ctx.aztecNodeConfig.aztecEpochDuration,
    });

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
      dateProvider: t.ctx.dateProvider,
    });
  });
});
