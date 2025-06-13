import type { AztecNodeService } from '@aztec/aztec-node';
import { SentTx, Tx, createLogger, sleep } from '@aztec/aztec.js';
import { RollupContract } from '@aztec/ethereum';
import { timesAsync } from '@aztec/foundation/collection';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';
import { createPXEServiceAndPrepareTransactions } from './shared.js';

// TODO: DELETE THIS FILE
// This is a temporary copy of reqresp.test.ts with status handshake disabled
// Delete this file once we have settled on the cause of the reqresp flakes.

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 6;
const NUM_TXS_PER_NODE = 2;
const BOOT_NODE_UDP_PORT = 4500;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'reqresp-'));

describe('e2e_p2p_reqresp_tx_no_handshake', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_reqresp_tx',
      numberOfNodes: NUM_NODES,
      basePort: BOOT_NODE_UDP_PORT,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up`
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        ...SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
        p2pDisableStatusHandshake: true, // DIFFERENCE FROM reqresp.test.ts
        listenAddress: '127.0.0.1',
        aztecEpochDuration: 64, // stable committee
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

  const getNodePort = (nodeIndex: number) => BOOT_NODE_UDP_PORT + 1 + nodeIndex;

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

    t.logger.info('Preparing transactions to send');
    const contexts = await timesAsync(2, () =>
      createPXEServiceAndPrepareTransactions(t.logger, t.ctx.aztecNode, NUM_TXS_PER_NODE, t.fundedAccount),
    );

    t.logger.info('Removing initial node');
    await t.removeInitialNode();

    t.logger.info('Creating nodes');
    nodes = await createNodes(
      { ...t.ctx.aztecNodeConfig, p2pDisableStatusHandshake: true }, // DIFFERENCE FROM reqresp.test.ts
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      shouldCollectMetrics(),
    );

    t.logger.info('Sleeping to allow nodes to connect');
    await sleep(4000);

    t.logger.info('Starting fresh slot');
    const [timestamp] = await t.ctx.cheatCodes.rollup.advanceToNextSlot();
    t.ctx.dateProvider.setTime(Number(timestamp) * 1000);

    const { proposerIndexes, nodesToTurnOffTxGossip } = await getProposerIndexes();
    t.logger.info(`Turning off tx gossip for nodes: ${nodesToTurnOffTxGossip.map(getNodePort)}`);
    t.logger.info(`Sending txs to proposer nodes: ${proposerIndexes.map(getNodePort)}`);

    // Replace the p2p node implementation of some of the nodes with a spy such that it does not store transactions that are gossiped to it
    // Original implementation of `handleGossipedTx` will store received transactions in the tx pool.
    // We chose the first 2 nodes that will be the proposers for the next few slots
    for (const nodeIndex of nodesToTurnOffTxGossip) {
      const logger = createLogger(`p2p:${getNodePort(nodeIndex)}`);
      jest.spyOn((nodes[nodeIndex] as any).p2pClient.p2pService, 'handleGossipedTx').mockImplementation((async (
        payloadData: Buffer,
      ) => {
        const txHash = await Tx.fromBuffer(payloadData).getTxHash();
        logger.info(`Skipping storage of gossiped transaction ${txHash.toString()}`);
        return Promise.resolve();
      }) as any);
    }

    // We send the tx to the proposer nodes directly, ignoring the pxe and node in each context
    // We cannot just call tx.send since they were created using a pxe wired to the first node which is now stopped
    t.logger.info('Sending transactions through proposer nodes');
    const sentTxs = contexts.map((c, i) =>
      c.txs.map(tx => {
        const node = nodes[proposerIndexes[i]];
        void node.sendTx(tx).catch(err => t.logger.error(`Error sending tx: ${err}`));
        return new SentTx(node, () => tx.getTxHash());
      }),
    );

    t.logger.info('Waiting for all transactions to be mined');
    await Promise.all(
      sentTxs.flatMap((txs, i) =>
        txs.map(async (tx, j) => {
          t.logger.info(`Waiting for tx ${i}-${j} ${await tx.getTxHash()} to be mined`);
          await tx.wait({ timeout: WAIT_FOR_TX_TIMEOUT * 1.5 }); // more transactions in this test so allow more time
          t.logger.info(`Tx ${i}-${j} ${await tx.getTxHash()} has been mined`);
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
    const rollupContract = new RollupContract(
      t.ctx.deployL1ContractsValues.l1Client,
      t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    );

    const attesters = await rollupContract.getAttesters();

    const currentTime = await t.ctx.cheatCodes.eth.timestamp();
    const slotDuration = await rollupContract.getSlotDuration();

    const proposers = [];

    for (let i = 0; i < 3; i++) {
      const nextSlot = BigInt(currentTime) + BigInt(i) * BigInt(slotDuration);
      const proposer = await rollupContract.getProposerAt(nextSlot);
      proposers.push(proposer);
    }
    // Get the indexes of the nodes that are responsible for the next two slots
    const proposerIndexes = proposers.map(proposer => attesters.indexOf(proposer as `0x${string}`));

    if (proposerIndexes.some(i => i === -1)) {
      throw new Error(
        `Proposer index not found for proposer ` +
          `(proposers=${proposers.join(',')}, indices=${proposerIndexes.join(',')})`,
      );
    }

    const nodesToTurnOffTxGossip = Array.from({ length: NUM_NODES }, (_, i) => i).filter(
      i => !proposerIndexes.includes(i),
    );
    return { proposerIndexes, nodesToTurnOffTxGossip };
  }
});
