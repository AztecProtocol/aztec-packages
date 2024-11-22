import { type AztecNodeService } from '@aztec/aztec-node';
import { sleep } from '@aztec/aztec.js';

import fs from 'fs';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { type NodeContext, createNode, createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';
import { createPXEServiceAndSubmitTransactions } from './shared.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 4;
const NUM_TXS_PER_NODE = 2;
const BOOT_NODE_UDP_PORT = 40400;

const DATA_DIR = './data/rediscovery';

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
    });
    await t.applyBaseSnapshots();
    await t.setup();

    // We remove the initial node such that it will no longer attempt to build blocks / be in the sequencing set
    await t.removeInitialNode();
  });

  afterEach(async () => {
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true });
    }
  });

  it('should re-discover stored peers without bootstrap node', async () => {
    const contexts: NodeContext[] = [];
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.peerIdPrivateKeys,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up`
      shouldCollectMetrics(),
    );

    // wait a bit for peers to discover each other
    await sleep(3000);

    // stop bootstrap node
    await t.bootstrapNode.stop();

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
        t.peerIdPrivateKeys[i],
        i + 1 + BOOT_NODE_UDP_PORT,
        undefined,
        i,
        `${DATA_DIR}-${i}`,
      );
      t.logger.info(`Node ${i} restarted`);
      newNodes.push(newNode);
    }
    nodes = newNodes;

    // wait a bit for peers to discover each other
    await sleep(2000);

    for (const node of newNodes) {
      const context = await createPXEServiceAndSubmitTransactions(t.logger, node, NUM_TXS_PER_NODE);
      contexts.push(context);
    }

    // now ensure that all txs were successfully mined

    await Promise.all(
      contexts.flatMap((context, i) =>
        context.txs.map(async (tx, j) => {
          t.logger.info(`Waiting for tx ${i}-${j}: ${await tx.getTxHash()} to be mined`);
          return tx.wait({ timeout: WAIT_FOR_TX_TIMEOUT });
        }),
      ),
    );
  });
});
