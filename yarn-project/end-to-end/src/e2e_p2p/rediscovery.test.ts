import type { AztecNodeService } from '@aztec/aztec-node';
import { sleep } from '@aztec/aztec.js';

import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { type NodeContext, createNode, createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';
import { createPXEServiceAndSubmitTransactions } from './shared.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_VALIDATORS = 4;
const NUM_TXS_PER_NODE = 2;
const BOOT_NODE_UDP_PORT = 4500;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rediscovery-'));

describe('e2e_p2p_rediscovery', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_rediscovery',
      numberOfNodes: 0,
      numberOfPreferredNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        ...SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
        listenAddress: '127.0.0.1',
      },
    });
    await t.applyBaseSnapshots();
    await t.setup();
  });

  afterEach(async () => {
    t.logger.info('Stopping nodes and cleaning up data directories');
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it('should re-discover stored peers without bootstrap node', async () => {
    const contexts: NodeContext[] = [];
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up`
      shouldCollectMetrics(),
    );

    // wait a bit for peers to discover each other
    await sleep(8000);

    // We need to `createNodes` before we setup account, because
    // those nodes actually form the committee, and so we cannot build
    // blocks without them (since targetCommitteeSize is set to the number of nodes)
    await t.setupAccount();

    // stop bootstrap node
    await t.bootstrapNode?.stop();

    // create new nodes from datadir
    const newNodes: AztecNodeService[] = [];

    // stop all nodes
    for (let i = 0; i < NUM_VALIDATORS; i++) {
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

    for (const node of newNodes) {
      const context = await createPXEServiceAndSubmitTransactions(t.logger, node, NUM_TXS_PER_NODE, t.fundedAccount);
      contexts.push(context);
    }

    // now ensure that all txs were successfully mined
    await Promise.all(
      contexts.flatMap((context, i) =>
        context.txs.map(async (tx, j) => {
          const txHash = await tx.getTxHash();
          t.logger.info(`Waiting for tx ${i}-${j} ${txHash} to be mined`, { txHash });
          return tx
            .wait({ timeout: WAIT_FOR_TX_TIMEOUT })
            .then(() => {
              t.logger.info(`Tx ${i}-${j} mined successfully`, { txHash });
            })
            .catch(err => {
              t.logger.error(`Tx ${i}-${j} failed to mine: ${err}`, { txHash });
              throw err;
            });
        }),
      ),
    );

    t.logger.info('All transactions mined successfully');
  });
});
