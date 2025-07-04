import type { Archiver } from '@aztec/archiver';
import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { retryUntil } from '@aztec/aztec.js';
import { ENR, type P2PClient, type P2PService, type PeerId } from '@aztec/p2p';
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

/**
 * This test builds a network using preferred nodes (supernodes)
 * It creates a default node as part of the test setup
 * Then creates 2 more regular nodes, 3 validators and 2 preferred nodes
 * The preferred nodes only accept connections from the validators
 * One validator does not start it's discovery service so will not discover other peers and won't be discovered
 * meaning it only connects to the preferred nodes
 * The other validators connect to everyone
 * We check that the submitted transactions are mined and that the block
 * contains attestations from all validators
 */

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 2;
const NUM_VALIDATORS = 3;
const NUM_PREFERRED_NODES = 2;
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
    _identifier: string,
  ) => {
    return await retryUntil(
      async () => {
        const p2pClient = (node as any).p2pClient as P2PClient;
        const peers = await p2pClient.getPeers();
        return peers.length === numRequiredPeers;
      },
      'Wait for peers',
      timeout,
    );
  };

  // Intercepts all P2P gossip and verifies that it is received from one of a set of expect peers
  const monitorP2PTraffic = (node: AztecNodeService, expectedPeers: string[]) => {
    const p2pService = (node.getP2P() as any).p2pService as P2PService;

    // @ts-expect-error - we want to spy on received tx handler
    const oldTxHandler = p2pService.handleGossipedTx.bind(p2pService);
    // Mock the function to just call the old one
    const handleGossipedTxSpy = jest.fn(async (payload: Buffer, msgId: string, source: PeerId) => {
      expect(expectedPeers.includes(source.toString())).toBe(true);
      await oldTxHandler(payload, msgId, source);
    });
    // @ts-expect-error - replace with our own handler
    p2pService.handleGossipedTx = handleGossipedTxSpy;

    // @ts-expect-error - we want to spy on received proposal handler
    const oldProposalHandler = p2pService.processBlockFromPeer.bind(p2pService);

    // Mock the function to just call the old one
    const handleGossipedProposalSpy = jest.fn(async (payload: Buffer, msgId: string, source: PeerId) => {
      expect(expectedPeers.includes(source.toString())).toBe(true);
      await oldProposalHandler(payload, msgId, source);
    });
    // @ts-expect-error - replace with our own handler
    p2pService.processBlockFromPeer = handleGossipedProposalSpy;

    // @ts-expect-error - we want to spy on received attestation handler
    const oldAttestationHandler = p2pService.processAttestationFromPeer.bind(p2pService);

    // Mock the function to just call the old one
    const handleGossipedAttestationSpy = jest.fn(async (payload: Buffer, msgId: string, source: PeerId) => {
      expect(expectedPeers.includes(source.toString())).toBe(true);
      await oldAttestationHandler(payload, msgId, source);
    });
    // @ts-expect-error - replace with our own handler
    p2pService.processAttestationFromPeer = handleGossipedAttestationSpy;
  };

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_preferred_network',
      numberOfNodes: NUM_NODES + NUM_PREFERRED_NODES,
      numberOfValidators: NUM_VALIDATORS,
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

    t.logger.info('Preferred nodes created', {
      preferredNodeEnrs: preferredNodeEnrs.map(enr => enr?.toString()),
    });

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
      NUM_VALIDATORS - 1,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
      indexOffset,
    );

    indexOffset += NUM_VALIDATORS - 1;

    // This last validator disables discovery to avoid connecting to anyone but preferred nodes
    // We do this to test that it receives ALL data via the preferred nodes
    const lastValidatorConfig: AztecNodeConfig = {
      ...t.ctx.aztecNodeConfig,
      p2pDiscoveryDisabled: true,
      disableValidator: false,
      preferredPeers: preferredNodeEnrs.filter(enr => enr !== undefined),
    };

    const noDiscoveryValidators = await createNodes(
      lastValidatorConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      1,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
      indexOffset,
    );

    const allNodes = [...nodes, ...preferredNodes, ...validators, ...noDiscoveryValidators, t.ctx.aztecNode];
    const identifiers = nodes
      .map((_, i) => `Node ${i + 1}`)
      .concat(preferredNodes.map((_, i) => `Preferred Node ${i + 1}`))
      .concat(validators.map((_, i) => `Validator ${i + 1}`))
      .concat(noDiscoveryValidators.map((_, i) => `Picky Validator ${i + 1}`))
      .concat(['Default Node']);

    const validatorsUsingDiscovery = validators.length;
    const totalNumValidators = validators.length + noDiscoveryValidators.length;
    const expectedPeerCounts = nodes
      .map(() => nodes.length - 1 + validatorsUsingDiscovery + 1) // Regular nodes connect to the default node and the validators that have discovery enabled
      .concat(preferredNodes.map(() => totalNumValidators)) // Preferred nodes only connect to validators (all of them)
      .concat(validators.map(() => nodes.length + preferredNodes.length + validatorsUsingDiscovery - 1 + 1)) // Validators connect to all nodes, preferred nodes, validators using discovery and the default node
      .concat(noDiscoveryValidators.map(() => preferredNodes.length)) // The no-discovery validators ONLY connect to preferred nodes (no discovery)
      .concat([nodes.length + validatorsUsingDiscovery]); // The default node connects to other regular nodes and validators using discovery
    for (let i = 0; i < allNodes.length; i++) {
      const peerResult = await waitForNodeToAcquirePeers(allNodes[i], expectedPeerCounts[i], 600, identifiers[i]);
      expect(peerResult).toBeTruthy();
    }
    t.logger.info('All node/validator peer connections established');

    validators.push(...noDiscoveryValidators);

    // We will setup some gossip monitors to ensure that nodes that restrict who they connect to
    // only receive messages from expected peers

    const preferredNodePeerIds = await Promise.all(preferredNodeEnrs.map(x => ENR.decodeTxt(x!).peerId()));
    const validatorEnrs = await Promise.all(validators.map(p => p.getEncodedEnr()));
    const validatorPeerIds = await Promise.all(validatorEnrs.map(x => ENR.decodeTxt(x!).peerId()));

    // No-discovery validators should only receive P2P gossip from preferred nodes, as that is all they connect to
    noDiscoveryValidators.forEach(validator => {
      monitorP2PTraffic(
        validator,
        preferredNodePeerIds.map(x => x.toString()),
      );
    });
    // Preferred nodes should only receive P2P gossip from validators
    preferredNodes.forEach(node => {
      monitorP2PTraffic(
        node,
        validatorPeerIds.map(x => x.toString()),
      );
    });

    // We need to `createNodes` before we setup account, because
    // those nodes actually form the committee, and so we cannot build
    // blocks without them (since targetCommitteeSize is set to the number of nodes)
    await t.setupAccount();

    // Send the required number of transactions to each node
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

    expect(signers.length).toEqual(validators.length);

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
