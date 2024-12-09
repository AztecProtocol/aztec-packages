import { type AztecNodeService } from '@aztec/aztec-node';
import { sleep } from '@aztec/aztec.js';

import fs from 'fs';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { type NodeContext, createNodes } from '../fixtures/setup_p2p_test.js';
import { AlertChecker, type AlertConfig } from '../quality_of_service/alert_checker.js';
import { P2PNetworkTest, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';
import { createPXEServiceAndSubmitTransactions } from './shared.js';

const CHECK_ALERTS = process.env.CHECK_ALERTS === 'true';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 4;
const NUM_TXS_PER_NODE = 2;
const BOOT_NODE_UDP_PORT = 40600;

const DATA_DIR = './data/gossip';

const qosAlerts: AlertConfig[] = [
  {
    alert: 'SequencerTimeToCollectAttestations',
    expr: 'aztec_sequencer_time_to_collect_attestations > 3500',
    labels: { severity: 'error' },
    for: '10m',
    annotations: {},
  },
];

describe('e2e_p2p_network', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_network',
      numberOfNodes: NUM_NODES,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
    });

    await t.applyBaseSnapshots();
    await t.setup();
    await t.removeInitialNode();
  });

  afterEach(async () => {
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    if (CHECK_ALERTS) {
      const checker = new AlertChecker(t.logger);
      await checker.runAlertCheck(qosAlerts);
    }
  });

  it('should rollup txs from all peers', async () => {
    // create the bootstrap node for the network
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    t.ctx.aztecNodeConfig.validatorReexecute = true;

    // create our network of nodes and submit txs into each of them
    // the number of txs per node and the number of txs per rollup
    // should be set so that the only way for rollups to be built
    // is if the txs are successfully gossiped around the nodes.
    const contexts: NodeContext[] = [];
    t.logger.info('Creating nodes');
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
    );

    // wait a bit for peers to discover each other
    await sleep(4000);

    t.logger.info('Submitting transactions');
    for (const node of nodes) {
      const context = await createPXEServiceAndSubmitTransactions(t.logger, node, NUM_TXS_PER_NODE);
      contexts.push(context);
    }

    t.logger.info('Waiting for transactions to be mined');
    // now ensure that all txs were successfully mined
    await Promise.all(
      contexts.flatMap((context, i) =>
        context.txs.map(async (tx, j) => {
          t.logger.info(`Waiting for tx ${i}-${j}: ${await tx.getTxHash()} to be mined`);
          return tx.wait({ timeout: WAIT_FOR_TX_TIMEOUT });
        }),
      ),
    );
    t.logger.info('All transactions mined');
  });
});
