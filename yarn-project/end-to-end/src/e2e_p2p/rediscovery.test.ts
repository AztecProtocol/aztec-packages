import type { AztecNodeService } from '@aztec/aztec-node';
import { sleep } from '@aztec/aztec.js';

import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNode, createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES } from './p2p_network.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 4;
const BOOT_NODE_UDP_PORT = 4500;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rediscovery-'));

describe('e2e_p2p_rediscovery', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_rediscovery',
      numberOfNodes: NUM_NODES,
      basePort: BOOT_NODE_UDP_PORT,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        ...SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
        listenAddress: '127.0.0.1',
      },
    });
    await t.setupAccount();
    await t.applyBaseSnapshots();
    await t.setup();

    // We remove the initial node such that it will no longer attempt to build blocks / be in the sequencing set
    await t.removeInitialNode();
  });

  afterEach(async () => {
    t.logger.info('Stopping nodes and cleaning up data directories');
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it('should re-discover stored peers without bootstrap node', async () => {
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up`
      shouldCollectMetrics(),
    );

    // wait a bit for peers to discover each other
    await sleep(3000);

    // stop bootstrap node
    await t.bootstrapNode?.stop();

    // create new nodes from datadir
    const newNodes: AztecNodeService[] = [];

    // stop all nodes
    for (let i = 0; i < NUM_NODES; i++) {
      const node = nodes[i];
      await node.stop();
      t.logger.info(`Node ${i} stopped`);
      await sleep(2500);

      const newNode = await createNode(
        t.ctx.aztecNodeConfig,
        t.ctx.dateProvider,
        i + 1 + BOOT_NODE_UDP_PORT,
        undefined,
        i,
        t.prefilledPublicData,
        `${DATA_DIR}-${i}`,
      );
      t.logger.info(`Node ${i} restarted`);
      newNodes.push(newNode);
    }
    nodes = newNodes;

    // wait a bit for peers to discover each other
    await sleep(2000);

    t.logger.info('All transactions mined successfully');
  });
});
