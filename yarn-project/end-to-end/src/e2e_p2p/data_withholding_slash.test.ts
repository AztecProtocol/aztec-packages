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
const NUM_NODES = 4;
const BOOT_NODE_UDP_PORT = 4500;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'data-withholding-slash-'));

/**
 * Demonstrate that slashing occurs when the chain is pruned, and we are unable to collect the transactions data post-hoc.
 *
 * The setup of the test is as follows:
 * 1. Create the "initial" node, and 4 other nodes
 * 2. Await the 4 other nodes to form the committee
 * 3. Send a tx to the initial node
 * 4. Stop all the nodes and wipe their data directories
 * 5. Re-create the nodes
 * 6. Expect that a slash payload is deployed with the data withholding offense
 *
 * The reason is that with the data directories wiped, they have no way to get the original transaction data
 * when the chain is pruned. So they slash themselves.
 *
 */
describe('e2e_p2p_data_withholding_slash', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  const slashingQuorum = 3;
  const slashingRoundSize = 5;
  const slashingAmount = 90n ** 18n;
  // This test needs longer slot window to ensure that the client has enough time to submit their txs,
  // and have the nodes get recreated, prior to the reorg.
  const aztecSlotDuration = 20;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_data_withholding_slash',
      numberOfNodes: NUM_NODES,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        listenAddress: '127.0.0.1',
        aztecEpochDuration: 1,
        ethereumSlotDuration: 4,
        aztecSlotDuration,
        aztecProofSubmissionWindow: 1,
        slashingQuorum,
        slashingRoundSize,
        slashPrunePenalty: slashingAmount,
        slashPruneMaxPenalty: slashingAmount,
        minTxsPerBlock: 0,
      },
    });

    await t.setupAccount();
    await t.applyBaseSnapshots();
    await t.setup();
  });

  afterEach(async () => {
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  const debugRollup = async () => {
    await t.ctx.cheatCodes.rollup.debugRollup();
  };

  it('slashes the committee when data is unavailable for the pruned epoch', async () => {
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    const { rollup, slashingProposer, slashFactory } = await t.getContracts();

    // Jump forward to an epoch in the future such that the validator set is not empty
    await t.ctx.cheatCodes.rollup.advanceToEpoch(4n);
    // Send tx
    await t.sendDummyTx();

    t.ctx.aztecNodeConfig.validatorReexecute = false;
    t.ctx.aztecNodeConfig.minTxsPerBlock = 1;

    t.logger.info('Creating nodes');
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
    );

    await debugRollup();
    await sleep(4000);
    await debugRollup();

    const committee = await awaitCommitteeExists({ rollup, logger: t.logger });
    await debugRollup();

    // Jump forward more time to ensure we're at the beginning of an epoch.
    // This should reduce flake, since we need to have the transaction included
    // and the nodes recreated, prior to the reorg.
    // Considering the epoch duration is 1,
    // the proof submission window is 1,
    // and the aztec slot duration is 20,
    // we have ~20 seconds to do this.
    await t.ctx.cheatCodes.rollup.advanceToEpoch(8n);
    // Send L1 tx
    await t.sendDummyTx();

    // Send Aztec txs
    t.logger.info('Setup account');
    await t.setupAccount();
    t.logger.info('Deploy spam contract');
    await t.deploySpamContract();

    t.logger.info('Stopping nodes');
    // Note, we needed to keep the initial node running, as that is the one the txs were sent to.
    await t.removeInitialNode();
    // Now stop the nodes,
    await t.stopNodes(nodes);
    // And remove the data directories (which forms the crux of the "attack")
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }

    // Re-create the nodes.
    // ASSUMING they sync in the middle of the epoch, they will "see" the reorg,
    // and try to slash.
    t.logger.info('Re-creating nodes');
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
    );

    await awaitCommitteeKicked({
      offense: Offense.DATA_WITHHOLDING,
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
  });
});
