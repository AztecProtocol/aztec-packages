import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { retryUntil, sleep } from '@aztec/aztec.js';
import type { ProverNode } from '@aztec/prover-node';
import type { SequencerClient } from '@aztec/sequencer-client';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import { BlockAttestation, ConsensusPayload } from '@aztec/stdlib/p2p';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import {
  ATTESTER_PRIVATE_KEYS_START_INDEX,
  type NodeContext,
  createNodes,
  createProverNode,
} from '../fixtures/setup_p2p_test.js';
import { AlertChecker, type AlertConfig } from '../quality_of_service/alert_checker.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';
import { createPXEServiceAndSubmitTransactions } from './shared.js';

const CHECK_ALERTS = process.env.CHECK_ALERTS === 'true';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 4;
const NUM_TXS_PER_NODE = 2;
const BOOT_NODE_UDP_PORT = 4500;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gossip-'));

jest.setTimeout(1000 * 60 * 10);

const qosAlerts: AlertConfig[] = [
  {
    alert: 'SequencerTimeToCollectAttestations',
    expr: 'aztec_sequencer_time_to_collect_attestations > 3500',
    labels: { severity: 'error' },
    for: '10m',
    annotations: {},
  },
];

describe('e2e_p2p_network', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let proverNode: ProverNode;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_network',
      numberOfNodes: NUM_NODES,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      startProverNode: false, // we'll start our own using p2p
      initialConfig: {
        ...SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
        aztecEpochDuration: 4,
        listenAddress: '127.0.0.1',
      },
    });

    await t.applyBaseSnapshots();
    await t.setup();
  });

  afterEach(async () => {
    await tryStop(proverNode);
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  afterAll(async () => {
    if (CHECK_ALERTS) {
      const checker = new AlertChecker(t.logger);
      await checker.runAlertCheck(qosAlerts);
    }
  });

  it('should rollup txs from all peers', async () => {
    // create the bootstrap node for the network
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    t.ctx.aztecNodeConfig.validatorReexecute = true;

    // create our network of nodes and submit txs into each of them
    // the number of txs per node and the number of txs per rollup
    // should be set so that the only way for rollups to be built
    // is if the txs are successfully gossiped around the nodes.
    const contexts: NodeContext[] = [];
    t.logger.info('Creating nodes');
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
    );

    // create a prover node that uses p2p only (not rpc) to gather txs to test prover tx collection
    proverNode = await createProverNode(
      t.ctx.aztecNodeConfig,
      BOOT_NODE_UDP_PORT + NUM_NODES + 1,
      t.bootstrapNodeEnr,
      ATTESTER_PRIVATE_KEYS_START_INDEX + NUM_NODES + 1,
      { dateProvider: t.ctx.dateProvider },
      t.prefilledPublicData,
      `${DATA_DIR}-prover`,
      shouldCollectMetrics(),
    );
    await proverNode.start();

    // wait a bit for peers to discover each other
    await sleep(8000);

    // We need to `createNodes` before we setup account, because
    // those nodes actually form the committee, and so we cannot build
    // blocks without them (since targetCommitteeSize is set to the number of nodes)
    await t.setupAccount();

    t.logger.info('Submitting transactions');
    for (const node of nodes) {
      const context = await createPXEServiceAndSubmitTransactions(t.logger, node, NUM_TXS_PER_NODE, t.fundedAccount);
      contexts.push(context);
    }

    t.logger.info('Waiting for transactions to be mined');
    // now ensure that all txs were successfully mined
    await Promise.all(
      contexts.flatMap((context, i) =>
        context.txs.map(async (tx, j) => {
          t.logger.info(`Waiting for tx ${i}-${j}: ${await tx.getTxHash()} to be mined`);
          return tx.wait({ timeout: WAIT_FOR_TX_TIMEOUT });
        }),
      ),
    );
    t.logger.info('All transactions mined');

    // Gather signers from attestations downloaded from L1
    const blockNumber = await contexts[0].txs[0].getReceipt().then(r => r.blockNumber!);
    const dataStore = ((nodes[0] as AztecNodeService).getBlockSource() as Archiver).dataStore;
    const [block] = await dataStore.getPublishedBlocks(blockNumber, blockNumber);
    const payload = ConsensusPayload.fromBlock(block.block);
    const attestations = block.attestations
      .filter(a => !a.signature.isEmpty())
      .map(a => new BlockAttestation(blockNumber, payload, a.signature));
    const signers = await Promise.all(attestations.map(att => att.getSender().toString()));
    t.logger.info(`Attestation signers`, { signers });

    // Check that the signers found are part of the proposer nodes to ensure the archiver fetched them right
    const validatorAddresses = nodes.flatMap(node =>
      ((node as AztecNodeService).getSequencer() as SequencerClient).validatorAddresses?.map(a => a.toString()),
    );
    t.logger.info(`Validator addresses`, { addresses: validatorAddresses });
    for (const signer of signers) {
      expect(validatorAddresses).toContain(signer);
    }

    // Ensure prover node did its job and collected txs from p2p
    await retryUntil(
      async () => {
        const provenBlock = await nodes[0].getProvenBlockNumber();
        return provenBlock > 0;
      },
      'proven block',
      120,
    );
  });
});
