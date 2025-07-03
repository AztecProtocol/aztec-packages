import type { AztecNodeService } from '@aztec/aztec-node';
import { sleep } from '@aztec/aztec.js';
import { Offense } from '@aztec/slasher';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';
import { awaitCommitteeExists, awaitCommitteeKicked } from './shared.js';

jest.setTimeout(1000000);

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
  const slashingRoundSize = 5;
  const aztecSlotDuration = 12;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_valid_epoch_pruned',
      numberOfNodes: 0,
      numberOfPreferredNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        listenAddress: '127.0.0.1',
        aztecEpochDuration: 1,
        ethereumSlotDuration: 4,
        aztecSlotDuration,
        aztecProofSubmissionEpochs: 0, // reorg as soon as epoch ends
        slashingQuorum,
        slashingRoundSize,
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

    const slashingAmount = (await rollup.getDepositAmount()) - (await rollup.getMinimumStake()) + 1n;
    t.ctx.aztecNodeConfig.slashPruneEnabled = true;
    t.ctx.aztecNodeConfig.slashPrunePenalty = slashingAmount;
    t.ctx.aztecNodeConfig.slashPruneMaxPenalty = slashingAmount;
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

    // wait a bit for peers to discover each other
    await sleep(4000);
    await debugRollup();

    // As noted above, we wait for them to exist...
    const committee = await awaitCommitteeExists({ rollup, logger: t.logger });
    await debugRollup();

    // ... They'll be building blocks in the meantime, since minTxsPerBlock is 0...

    // ...and then we wait for them to be kicked.
    await awaitCommitteeKicked({
      offense: Offense.VALID_EPOCH_PRUNED,
      rollup,
      cheatCodes: t.ctx.cheatCodes.rollup,
      committee,
      slashingAmount,
      slashFactory,
      slashingProposer,
      slashingRoundSize,
      aztecSlotDuration,
      logger: t.logger,
      sendDummyTx: () => t.sendDummyTx().then(() => undefined),
    });
  }, 1_000_000);
});
