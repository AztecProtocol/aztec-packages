import type { Archiver } from '@aztec/archiver';
import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { retryUntil, sleep } from '@aztec/aztec.js';
import type { P2PClient } from '@aztec/p2p';
import type { SequencerClient } from '@aztec/sequencer-client';
import { BlockAttestation, ConsensusPayload } from '@aztec/stdlib/p2p';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { type NodeContext, createNodes } from '../fixtures/setup_p2p_test.js';
import { AlertChecker, type AlertConfig } from '../quality_of_service/alert_checker.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';
import { createPXEServiceAndSubmitTransactions } from './shared.js';

const CHECK_ALERTS = process.env.CHECK_ALERTS === 'true';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 1;
const NUM_VALIDATORS = 2;
const NUM_PREFERRED_NODES = 1;
const NUM_TXS_PER_NODE = 2;
const BOOT_NODE_UDP_PORT = 4500;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gossip-'));

jest.setTimeout(1000 * 180 * 10);

const qosAlerts: AlertConfig[] = [
  {
    alert: 'SequencerTimeToCollectAttestations',
    expr: 'aztec_sequencer_time_to_collect_attestations > 3500',
    labels: { severity: 'error' },
    for: '10m',
    annotations: {},
  },
];

describe('e2e_p2p_preferred_network', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let validators: AztecNodeService[];
  let preferredNodes: AztecNodeService[];

  const waitForNodeToAcquirePeers = async (
    node: AztecNodeService,
    numRequiredPeers: number,
    timeout: number,
    identifier: string,
  ) => {
    return await retryUntil(
      async () => {
        const p2pClient = (node as any).p2pClient as P2PClient;
        const peers = await p2pClient.getPeers();
        console.log(`${identifier} has ${peers.length} peers, waiting for ${numRequiredPeers}\n\n\n\n\n`);
        return peers.length >= numRequiredPeers;
      },
      'Wait for peers',
      timeout,
    );
  };

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_preferred_network',
      numberOfNodes: NUM_NODES,
      numberOfValidators: NUM_VALIDATORS,
      numberOfPreferredNodes: NUM_PREFERRED_NODES,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        ...SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
        listenAddress: '127.0.0.1',
        p2pDisableStatusHandshake: false,
      },
    });

    await t.applyBaseSnapshots();
    await t.setup();
  });

  afterEach(async () => {
    await t.stopNodes([t.ctx.aztecNode].concat(nodes).concat(validators).concat(preferredNodes));
    await t.teardown();
    for (let i = 0; i < NUM_NODES + NUM_VALIDATORS + NUM_PREFERRED_NODES; i++) {
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

    const preferredNodeConfig: AztecNodeConfig = {
      ...t.ctx.aztecNodeConfig,
      disableValidator: true,
      // Only permit validators to connect and switch off discovery
      p2pAllowOnlyValidators: true,
      p2pDiscoveryDisabled: true,
    };

    // create our network of nodes and submit txs into each of them
    // the number of txs per node and the number of txs per rollup
    // should be set so that the only way for rollups to be built
    // is if the txs are successfully gossiped around the nodes.
    const contexts: NodeContext[] = [];
    let indexOffset = 0;

    t.logger.info('Creating preferred nodes');

    preferredNodes = await createNodes(
      preferredNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_PREFERRED_NODES,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
      indexOffset,
    );

    indexOffset += NUM_PREFERRED_NODES;

    const preferredNodeEnrs = await Promise.all(preferredNodes.map(node => node.getEncodedEnr()));

    const nodeConfig: AztecNodeConfig = {
      ...t.ctx.aztecNodeConfig,
      disableValidator: true,

      // The regular nodes will attempt to connect to the preferred nodes but they should fail the authentication
      preferredPeers: preferredNodeEnrs.filter(enr => enr !== undefined),
    };

    t.logger.info('Creating nodes');
    nodes = await createNodes(
      nodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
      indexOffset,
    );

    indexOffset += NUM_NODES;

    t.logger.info('Creating validators');

    const validatorConfig: AztecNodeConfig = {
      ...t.ctx.aztecNodeConfig,
      disableValidator: false,
      preferredPeers: preferredNodeEnrs.filter(enr => enr !== undefined),
    };

    validators = await createNodes(
      validatorConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
      indexOffset,
    );

    const allNodes = [...nodes, ...preferredNodes, ...validators, t.ctx.aztecNode];
    const identifiers = nodes
      .map((_, i) => `Node ${i + 1}`)
      .concat(preferredNodes.map((_, i) => `Preferred Node ${i + 1}`))
      .concat(validators.map((_, i) => `Validator ${i + 1}`))
      .concat(['Default Node']);
    const expectedPeerCounts = nodes
      .map(() => nodes.length - 1 + validators.length + 1) // +1 for the Aztec Node
      .concat(preferredNodes.map(() => validators.length)) // Only connect to validators
      .concat(validators.map(() => nodes.length + preferredNodes.length + validators.length - 1 + 1)) // +1 for the Aztec Node
      .concat([nodes.length + validators.length]);
    for (let i = 0; i < allNodes.length; i++) {
      const peerResult = await waitForNodeToAcquirePeers(allNodes[i], expectedPeerCounts[i], 600, identifiers[i]);
      expect(peerResult).toBeTruthy();
    }

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
    const validatorAddresses = validators.flatMap(node =>
      ((node as AztecNodeService).getSequencer() as SequencerClient).validatorAddresses?.map(a => a.toString()),
    );
    t.logger.info(`Validator addresses`, { addresses: validatorAddresses });
    for (const signer of signers) {
      expect(validatorAddresses).toContain(signer);
    }
  });
});
