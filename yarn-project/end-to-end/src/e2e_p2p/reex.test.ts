import { type AztecNodeService } from '@aztec/aztec-node';
import { type SentTx, sleep } from '@aztec/aztec.js';

/* eslint-disable-next-line no-restricted-imports */
import { BlockProposal, SignatureDomainSeperator, getHashedSignaturePayload } from '@aztec/circuit-types';

import { beforeAll, describe, it, jest } from '@jest/globals';
import fs from 'fs';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';
import { submitComplexTxsTo } from './shared.js';

const NUM_NODES = 4;
const NUM_TXS_PER_NODE = 1;
const BOOT_NODE_UDP_PORT = 41000;

const DATA_DIR = './data/re-ex';

describe('e2e_p2p_reex', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  beforeAll(async () => {
    nodes = [];

    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_reex',
      numberOfNodes: NUM_NODES,
      basePort: BOOT_NODE_UDP_PORT,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      metricsPort: shouldCollectMetrics(),
    });

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
    // shutdown all nodes.
    await t.stopNodes(nodes);
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

    t.ctx.aztecNodeConfig.validatorReexecute = true;

    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
    );

    // Hook into the node and intercept re-execution logic, ensuring that it was infact called
    const reExecutionSpies = [];
    for (const node of nodes) {
      // Make sure the nodes submit faulty proposals, in this case a faulty proposal is one where we remove one of the transactions
      // Such that the calculated archive will be different!
      jest.spyOn((node as any).p2pClient, 'broadcastProposal').mockImplementation(async (...args: unknown[]) => {
        // We remove one of the transactions, therefore the block root will be different!
        const proposal = args[0] as BlockProposal;
        const { txHashes } = proposal.payload;

        // We need to mutate the proposal, so we cast to any
        (proposal.payload as any).txHashes = txHashes.slice(0, txHashes.length - 1);

        // We sign over the proposal using the node's signing key
        // Abusing javascript to access the nodes signing key
        const signer = (node as any).sequencer.sequencer.validatorClient.validationService.keyStore;
        const newProposal = new BlockProposal(
          proposal.payload,
          await signer.signMessage(getHashedSignaturePayload(proposal.payload, SignatureDomainSeperator.blockProposal)),
        );

        return (node as any).p2pClient.p2pService.propagate(newProposal);
      });

      // Store re-execution spys       node -> sequencer Client -> seqeuncer -> validator
      const spy = jest.spyOn((node as any).sequencer.sequencer.validatorClient, 'reExecuteTransactions');
      reExecutionSpies.push(spy);
    }

    // wait a bit for peers to discover each other
    await sleep(4000);

    nodes.forEach(node => {
      node.getSequencer()?.updateSequencerConfig({
        minTxsPerBlock: NUM_TXS_PER_NODE,
        maxTxsPerBlock: NUM_TXS_PER_NODE,
      });
    });
    const txs = await submitComplexTxsTo(t.logger, t.spamContract!, NUM_TXS_PER_NODE);

    // We ensure that the transactions are NOT mined
    try {
      await Promise.all(
        txs.map(async (tx: SentTx, i: number) => {
          t.logger.info(`Waiting for tx ${i}: ${await tx.getTxHash()} to be mined`);
          return tx.wait();
        }),
      );
    } catch (e) {
      t.logger.info('Failed to mine all txs, as planned');
    }

    // Expect that all of the re-execution attempts failed with an invalid root
    for (const spy of reExecutionSpies) {
      for (const result of spy.mock.results) {
        await expect(result.value).rejects.toThrow('Validator Error: Re-execution state mismatch');
      }
    }
  });
});
