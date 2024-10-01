
import { type AztecNodeService } from '@aztec/aztec-node';
import { sleep } from '@aztec/aztec.js';

import fs from 'fs';

import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';
import { submitComplexTxsTo } from './shared.js';
import { afterEach, beforeAll, describe, it } from '@jest/globals';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 4;
const NUM_TXS_PER_NODE = 4;
const NUM_TXS_PER_BLOCK = 4;
const BOOT_NODE_UDP_PORT = 41000;

const DATA_DIR = './data/re-ex';

describe('e2e_p2p_reex', () => {
  let t: P2PNetworkTest;

  beforeAll(async () => {
    t = await P2PNetworkTest.create('e2e_p2p_reex', NUM_NODES, BOOT_NODE_UDP_PORT);
    await t.applyBaseSnapshots();
    await t.setupAccount();
    await t.deploySpamContract();
    await t.setup();
  });

  afterEach(async () => {
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true });
    }
  });

  it('validators should re-execute transactions before attesting', async () => {
    // create the bootstrap node for the network
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    t.ctx.aztecNodeConfig.validatorReEx = true;

    const nodes: AztecNodeService[] = await createNodes(
      t.ctx.aztecNodeConfig,
      t.peerIdPrivateKeys,
      t.bootstrapNodeEnr,
        NUM_NODES,
        BOOT_NODE_UDP_PORT,
      );

    // wait a bit for peers to discover each other
    await sleep(4000);

    // tODO: use a tx with nested calls
    const txs = await submitComplexTxsTo(t.logger, t.spamContract!, NUM_TXS_PER_NODE);
    nodes.forEach(node => {
      node.getSequencer()?.updateSequencerConfig( {
        minTxsPerBlock: NUM_TXS_PER_BLOCK,
        maxTxsPerBlock: NUM_TXS_PER_BLOCK,
      });
    });

    // now ensure that all txs were successfully mined
    await Promise.all(
      txs.map(async (tx, i) => {
          t.logger.info(`Waiting for tx ${i}: ${await tx.getTxHash()} to be mined`);
          return tx.wait();
        }),
    );

    // shutdown all nodes.
    await t.stopNodes(nodes);
  });
});

