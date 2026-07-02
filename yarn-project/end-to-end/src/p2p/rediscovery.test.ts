import type { AztecNodeService } from '@aztec/aztec-node';
import { waitForTx } from '@aztec/aztec.js/node';
import { TxHash } from '@aztec/aztec.js/tx';

import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNode, createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';
import { submitTransactions } from './shared.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_VALIDATORS = 4;
const NUM_TXS_PER_NODE = 2;
const BOOT_NODE_UDP_PORT = 4500;
const BLOCK_DURATION_MS = 10_000;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rediscovery-'));

// Tests that nodes can rediscover each other from their stored peer tables after a full restart,
// without a bootstrap node. Uses P2PNetworkTest real libp2p, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES
// (ethSlot=4s, aztecSlot=24s, proofSubEpochs=640), 4 validators, inboxLag=2.
describe('e2e_p2p_rediscovery', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_rediscovery',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        ...SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
        aztecSlotDuration: 24,
        blockDurationMs: BLOCK_DURATION_MS,
        listenAddress: '127.0.0.1',
        inboxLag: 2,
      },
    });
    await t.setup();
    await t.applyBaseSetup();
  });

  afterEach(async () => {
    t.logger.info('Stopping nodes and cleaning up data directories');
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  // Forms an initial 4-node mesh, stops the bootstrap node, then restarts each validator from its data
  // directory without any bootstrap ENR. Submits txs to each restarted node and asserts they mine,
  // proving that discv5 peer-store entries are sufficient for re-discovery.
  // REFACTOR: sequential sleep(2500) between node restarts is hand-rolled; the delay exists to avoid
  // port conflicts but should be replaced with a port-readiness check or staggered createNode calls
  it('should re-discover stored peers without bootstrap node', async () => {
    const txsSentViaDifferentNodes: TxHash[][] = [];
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up`
      shouldCollectMetrics(),
    );

    // Wait for the nodes to form a full mesh before tearing down, so each one persists every peer's
    // ENR to its store. Without this guarantee there would be nothing to rediscover after the restart.
    await t.waitForP2PMeshConnectivity(nodes, NUM_VALIDATORS, 120);

    // We need to `createNodes` before we setup account, because
    // those nodes actually form the committee, and so we cannot build
    // blocks without them (since targetCommitteeSize is set to the number of nodes)
    await t.setupAccount();

    // stop bootstrap node
    await t.bootstrapNode?.stop();

    // Bring the whole network down before bringing any node back up. This is the real test of
    // rediscovery: with every node stopped there are no live peers left to dial the restarted nodes,
    // so they can only rejoin by re-seeding discovery from the peers they persisted to disk.
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      await nodes[i].stop();
      t.logger.info(`Node ${i} stopped`);
    }

    // recreate all nodes from their data dirs, without a bootstrap node
    const newNodes: AztecNodeService[] = [];
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      const newNode = await createNode(
        t.ctx.aztecNodeConfig,
        t.ctx.dateProvider,
        i + 1 + BOOT_NODE_UDP_PORT,
        undefined,
        i,
        t.genesis,
        `${DATA_DIR}-${i}`,
      );
      t.logger.info(`Node ${i} restarted`);
      newNodes.push(newNode);
    }
    nodes = newNodes;

    await t.waitForP2PMeshConnectivity(newNodes, NUM_VALIDATORS, 120);

    for (const node of newNodes) {
      const txs = await submitTransactions(t.logger, node, NUM_TXS_PER_NODE, t.fundedAccount);
      txsSentViaDifferentNodes.push(txs);
    }

    // now ensure that all txs were successfully mined
    await Promise.all(
      txsSentViaDifferentNodes.flatMap((txs, i) =>
        txs.map(async (txHash, j) => {
          t.logger.info(`Waiting for tx ${i}-${j} ${txHash} to be mined`, { txHash: txHash.toString() });
          try {
            await waitForTx(newNodes[0], txHash, { timeout: WAIT_FOR_TX_TIMEOUT });
            t.logger.info(`Tx ${i}-${j} mined successfully`, { txHash: txHash.toString() });
          } catch (err) {
            t.logger.error(`Tx ${i}-${j} failed to mine: ${err}`, { txHash: txHash.toString() });
            throw err;
          }
        }),
      ),
    );

    t.logger.info('All transactions mined successfully');
  });
});
