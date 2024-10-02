
import { type AztecNodeService } from '@aztec/aztec-node';
import { sleep } from '@aztec/aztec.js';

import fs from 'fs';

import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';
import { submitComplexTxsTo } from './shared.js';
import { afterEach, beforeAll, describe, it } from '@jest/globals';
import { RollupAbi } from '@aztec/l1-artifacts';
import { getContract } from 'viem';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 4;
const NUM_TXS_PER_NODE = 1;
const BOOT_NODE_UDP_PORT = 41000;

const DATA_DIR = './data/re-ex';

describe('e2e_p2p_reex', () => {
  let t: P2PNetworkTest;
  // We hardcode a bootstrap node private key, such that the key recovered from node config ( the node that has deployed the contract )
  // Can find the bootstrap node and connect to the other peers we create
  // This is a unique requirement for this test as we store a contract that points to a node we cache in setup.
  // - we just need this cached node to know where to find the bootstrap node once it comes online
  const BOOTSTRAP_NODE_PRIVATE_KEY: Uint8Array = new Uint8Array([
    8,   2,  18,  32, 173, 104, 140, 243,
    166, 150, 169,  63,  45, 233, 242, 106,
     59,  18, 136, 215,  18, 148,  98,   2,
    219,  17,  61, 127, 100, 160, 122, 188,
    255,  52,  17, 196
  ]);

  beforeAll(async () => {

    t = await P2PNetworkTest.create('e2e_p2p_reex', NUM_NODES, BOOT_NODE_UDP_PORT, BOOTSTRAP_NODE_PRIVATE_KEY);
    t.logger.verbose('Setup account');
    await t.setupAccount();
    t.logger.verbose('Deploy spam contract');
    await t.deploySpamContract();
    t.logger.verbose('Apply base snapshots');
    await t.applyBaseSnapshots();
    t.logger.verbose('Setup nodes');
    await t.setup();
  });

  afterAll(async () => {
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

    // TODO(md): make this part of a snapshot


    // Check the validators in the l1 contract
    // TODO: this block is temp
    const rollup = getContract({
      address: t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
      abi: RollupAbi,
      client: t.ctx.deployL1ContractsValues.publicClient,
    });
    const validators = await rollup.read.getValidators();
    const committee = await rollup.read.getCurrentEpochCommittee();
    const slot = await rollup.read.getCurrentSlot();
    const validatorCount = await rollup.read.getValidatorCount();
    console.log("at the beginning")
    console.log('Validators length:', validators.length);
    console.log('Committee length:', committee.length);
    console.log('Slot:', slot);
    console.log('Validator count:', validatorCount);

    t.logger.verbose(`Validators: ${validators.map(v => v.toString()).join(', ')}`);

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
    nodes.forEach(node => {
      node.getSequencer()?.updateSequencerConfig( {
        minTxsPerBlock: NUM_TXS_PER_NODE,
        maxTxsPerBlock: NUM_TXS_PER_NODE,
      });
    });
    const txs = await submitComplexTxsTo(t.logger, t.spamContract!, NUM_TXS_PER_NODE);

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

