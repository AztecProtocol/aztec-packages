import { type AztecNodeService } from '@aztec/aztec-node';
import { sleep } from '@aztec/aztec.js';

import fs from 'fs';

import { type NodeContext, createNode, createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';
import { createPXEServiceAndSubmitTransactions } from './shared.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 4;
const NUM_TXS_PER_NODE = 2;
const BOOT_NODE_UDP_PORT = 40400;

describe('e2e_p2p_rediscovery', () => {
  let t: P2PNetworkTest;

  beforeEach(async () => {
    t = await P2PNetworkTest.create('e2e_p2p_rediscovery', NUM_NODES);
    await t.applyBaseSnapshots();
    await t.setup();
  });

  afterEach(async () => await t.teardown());

  afterAll(() => {
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`./data-${i}`, { recursive: true, force: true });
    }
  });

  it('should re-discover stored peers without bootstrap node', async () => {
    const contexts: NodeContext[] = [];
    const nodes: AztecNodeService[] = await createNodes(
      t.ctx.aztecNodeConfig,
      t.peerIdPrivateKeys,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
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
      await sleep(1200);
      // TODO: make a restart nodes function
      const newNode = await createNode(
        t.ctx.aztecNodeConfig,
        t.peerIdPrivateKeys[i],
        i + 1 + BOOT_NODE_UDP_PORT,
        undefined,
        i,
        `./data-${i}`,
      );
      t.logger.info(`Node ${i} restarted`);
      newNodes.push(newNode);
    }

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
          return tx.wait();
        }),
      ),
    );

    // shutdown all nodes.
    await t.stopNodes(newNodes);
  });
});
