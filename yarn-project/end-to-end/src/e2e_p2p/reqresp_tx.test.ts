import { type AztecNodeService } from '@aztec/aztec-node';
import { sleep } from '@aztec/aztec.js';

import { jest } from '@jest/globals';
import fs from 'fs';

import { type NodeContext, createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';
import { createPXEServiceAndSubmitTransactions } from './shared.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 4;
const NUM_TXS_PER_NODE = 2;
const BOOT_NODE_UDP_PORT = 40800;

const DATA_DIR = './data/data-reqresp';

describe('e2e_p2p_reqresp_tx', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  beforeEach(async () => {
    t = await P2PNetworkTest.create('e2e_p2p_reqresp_tx', NUM_NODES, BOOT_NODE_UDP_PORT);
    await t.applyBaseSnapshots();
    await t.setup();
  });

  afterEach(async () => {
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true });
    }
  });

  // NOTE: If this test fails in a PR where the shuffling algorithm is changed, then it is failing as the node with
  // the mocked p2p layer is being picked as the sequencer, and it does not have any transactions in it's mempool.
  // If this is the case, then we should update the test to switch off the mempool of a different node.
  // adjust `nodeToTurnOffTxGossip` in the test below.
  it('should produce an attestation by requesting tx data over the p2p network', async () => {
    /**
     * Birds eye overview of the test
     * 1. We spin up x nodes
     * 2. We turn off receiving a tx via gossip from two of the nodes
     * 3. We send a transactions and gossip it to other nodes
     * 4. The disabled nodes will receive an attestation that it does not have the data for
     * 5. They will request this data over the p2p layer
     * 6. We receive all of the attestations that we need and we produce the block
     *
     * Note: we do not attempt to let this node produce a block, as it will not have received any transactions
     *       from the other pxes.
     */

    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }
    const contexts: NodeContext[] = [];

    t.logger.info('Creating nodes');
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.peerIdPrivateKeys,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      DATA_DIR,
    );

    // wait a bit for peers to discover each other
    await sleep(4000);

    t.logger.info('Turning off tx gossip');
    // Replace the p2p node implementation of some of the nodes with a spy such that it does not store transactions that are gossiped to it
    // Original implementation of `processTxFromPeer` will store received transactions in the tx pool.
    // We have chosen nodes 0,3 as they do not get chosen to be the sequencer in this test.
    const nodeToTurnOffTxGossip = [0, 3];
    for (const nodeIndex of nodeToTurnOffTxGossip) {
      jest
        .spyOn((nodes[nodeIndex] as any).p2pClient.p2pService, 'processTxFromPeer')
        .mockImplementation((): Promise<void> => {
          return Promise.resolve();
        });
    }

    t.logger.info('Submitting transactions');
    // Only submit transactions to the first two nodes, so that we avoid our sequencer with a mocked p2p layer being picked to produce a block.
    // If the shuffling algorithm changes, then this will need to be updated.
    for (let i = 0; i < 2; i++) {
      const context = await createPXEServiceAndSubmitTransactions(t.logger, nodes[i], NUM_TXS_PER_NODE);
      contexts.push(context);
    }

    t.logger.info('Waiting for transactions to be mined');
    await Promise.all(
      contexts.flatMap((context, i) =>
        context.txs.map(async (tx, j) => {
          t.logger.info(`Waiting for tx ${i}-${j}: ${await tx.getTxHash()} to be mined`);
          await tx.wait({ timeout: WAIT_FOR_TX_TIMEOUT });
          t.logger.info(`Tx ${i}-${j}: ${await tx.getTxHash()} has been mined`);
          return await tx.getTxHash();
        }),
      ),
    );
    t.logger.info('All transactions mined');
  });
});
