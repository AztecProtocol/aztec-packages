
import { type AztecNodeService } from '@aztec/aztec-node';
import {
  sleep,
} from '@aztec/aztec.js';

import fs from 'fs';

import {
  type NodeContext,
  createNodes,
} from '../fixtures/setup_p2p_test.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 4;
const NUM_TXS_PER_NODE = 2;

import { P2PNetworkTest } from './p2p_network.js';
import { createPXEServiceAndSubmitTransactions } from './shared.js';

describe('e2e_p2p_network', () => {
  let t: P2PNetworkTest;

  beforeEach(async () => {
    t = await P2PNetworkTest.create('e2e_p2p_network', NUM_NODES);
    await t.applyBaseSnapshots();
    await t.setup();
  });

  afterEach(async () => await t.teardown());

  afterAll(() => {
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`./data-${i}`, { recursive: true, force: true });
    }
  });

  it('should rollup txs from all peers', async () => {
    // create the bootstrap node for the network
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }
    // create our network of nodes and submit txs into each of them
    // the number of txs per node and the number of txs per rollup
    // should be set so that the only way for rollups to be built
    // is if the txs are successfully gossiped around the nodes.
    const contexts: NodeContext[] = [];
    const nodes: AztecNodeService[] = await createNodes(
      t.ctx.aztecNodeConfig,
      t.peerIdPrivateKeys,
      t.bootstrapNodeEnr,
      NUM_NODES,
    );

    // wait a bit for peers to discover each other
    await sleep(4000);

    for (const node of nodes) {
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
    await t.stopNodes(nodes);
  });
});
