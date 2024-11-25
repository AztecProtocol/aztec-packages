import { type AztecNodeService } from '@aztec/aztec-node';
import { sleep } from '@aztec/aztec.js';
import { RollupAbi } from '@aztec/l1-artifacts';

import { jest } from '@jest/globals';
import fs from 'fs';
import { getContract } from 'viem';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { type NodeContext, createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';
import { createPXEServiceAndSubmitTransactions } from './shared.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 6;
const NUM_TXS_PER_NODE = 2;
const BOOT_NODE_UDP_PORT = 40800;

const DATA_DIR = './data/data-reqresp';

describe('e2e_p2p_reqresp_tx', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_reqresp_tx',
      numberOfNodes: NUM_NODES,
      basePort: BOOT_NODE_UDP_PORT,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up`
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
      shouldCollectMetrics(),
    );

    // wait a bit for peers to discover each other
    await sleep(4000);

    const { proposerIndexes, nodesToTurnOffTxGossip } = await getProposerIndexes();

    t.logger.info(`Turning off tx gossip for nodes: ${nodesToTurnOffTxGossip}`);
    t.logger.info(`Sending txs to proposer nodes: ${proposerIndexes}`);

    // Replace the p2p node implementation of some of the nodes with a spy such that it does not store transactions that are gossiped to it
    // Original implementation of `processTxFromPeer` will store received transactions in the tx pool.
    // We chose the first 2 nodes that will be the proposers for the next few slots
    for (const nodeIndex of nodesToTurnOffTxGossip) {
      jest
        .spyOn((nodes[nodeIndex] as any).p2pClient.p2pService, 'processTxFromPeer')
        .mockImplementation((): Promise<void> => {
          return Promise.resolve();
        });
    }

    t.logger.info('Submitting transactions');

    for (const nodeIndex of proposerIndexes.slice(0, 2)) {
      const context = await createPXEServiceAndSubmitTransactions(t.logger, nodes[nodeIndex], NUM_TXS_PER_NODE);
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

  /**
   * Get the indexes in the nodes array that will produce the next few blocks
   */
  async function getProposerIndexes() {
    // Get the nodes for the next set of slots
    const rollupContract = getContract({
      address: t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
      abi: RollupAbi,
      client: t.ctx.deployL1ContractsValues.publicClient,
    });

    const currentTime = await t.ctx.cheatCodes.eth.timestamp();
    const slotDuration = await rollupContract.read.SLOT_DURATION();

    const proposers = [];

    for (let i = 0; i < 3; i++) {
      const nextSlot = BigInt(currentTime) + BigInt(i) * BigInt(slotDuration);
      const proposer = await rollupContract.read.getProposerAt([nextSlot]);
      proposers.push(proposer);
    }

    // Get the indexes of the nodes that are responsible for the next two slots
    const proposerIndexes = proposers.map(proposer => t.nodePublicKeys.indexOf(proposer));
    const nodesToTurnOffTxGossip = Array.from({ length: NUM_NODES }, (_, i) => i).filter(
      i => !proposerIndexes.includes(i),
    );
    return { proposerIndexes, nodesToTurnOffTxGossip };
  }
});
