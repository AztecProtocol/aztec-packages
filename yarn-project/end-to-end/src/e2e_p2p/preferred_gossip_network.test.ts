import type { AztecNodeConfig } from '@aztec/aztec-node';
import { waitForTx } from '@aztec/aztec.js/node';
import { TxHash } from '@aztec/aztec.js/tx';
import { Signature } from '@aztec/foundation/eth-signature';
import { retryUntil } from '@aztec/foundation/retry';
import { ENR } from '@aztec/p2p';
import { CheckpointAttestation, ConsensusPayload } from '@aztec/stdlib/p2p';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { type AlertConfig, GrafanaClient } from '../quality_of_service/grafana_client.js';
import {
  P2PNetworkTest,
  type P2PTestNode,
  SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
  WAIT_FOR_TX_TIMEOUT,
} from './p2p_network.js';
import { submitTransactions } from './shared.js';
import type { WorkerAztecNode } from './worker_node.js';

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
  let nodes: WorkerAztecNode[];
  let validators: WorkerAztecNode[];
  let preferredNodes: WorkerAztecNode[];

  const waitForNodeToAcquirePeers = async (
    node: P2PTestNode,
    numRequiredPeers: number,
    timeout: number,
    identifier: string,
  ) => {
    return await retryUntil(
      async () => {
        const peers = await node.getP2P().getPeers();
        if (peers.length !== numRequiredPeers) {
          t.logger.warn(`Got ${peers.length}, expected ${numRequiredPeers} for ${identifier}`);
        }

        return peers.length === numRequiredPeers;
      },
      'Wait for peers',
      timeout,
    );
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
        aztecSlotDuration: 24,
        aztecEpochDuration: 4,
        listenAddress: '127.0.0.1',
        p2pDisableStatusHandshake: false,
        // Allow many failed auth attempts so that localhost-shared-IP bans don't cascade across
        // validators and non-validators. Peer gating still works because non-validators fail auth
        // on connection attempts to preferred nodes — they just don't get banned for retrying.
        p2pMaxFailedAuthAttemptsAllowed: Number.MAX_SAFE_INTEGER,
      },
    });

    await t.setup();
    await t.applyBaseSetup();
  });

  afterEach(async () => {
    await t.teardown();
    const workerNodes: P2PTestNode[] = [...nodes, ...validators, ...preferredNodes];
    await t.stopNodes(workerNodes);
    for (let i = 0; i < NUM_NODES + NUM_VALIDATORS + NUM_PREFERRED_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  afterAll(async () => {
    if (CHECK_ALERTS) {
      const checker = new GrafanaClient(t.logger);
      await checker.runAlertCheck(qosAlerts);
    }
  });

  it('should rollup txs from all peers', async () => {
    // create the bootstrap node for the network
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

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
    const txsSentViaDifferentNodes: TxHash[][] = [];
    let indexOffset = 0;

    t.logger.info('Creating preferred nodes');

    preferredNodes = await createNodes(
      preferredNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_PREFERRED_NODES,
      BOOT_NODE_UDP_PORT,
      t.genesis,
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
      t.genesis,
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
      t.genesis,
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
      t.genesis,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
      indexOffset,
    );

    // Register all worker nodes so DateProvider setTime broadcasts reach them.
    t.registerWorkerNodes([...preferredNodes, ...nodes, ...validators, ...noDiscoveryValidators]);

    // The initial node has P2P disabled (skipInitialSequencer), so exclude it from peer expectations.
    const allNodes = [...nodes, ...preferredNodes, ...validators, ...noDiscoveryValidators];
    const identifiers = nodes
      .map((_, i) => `Node ${i + 1}`)
      .concat(preferredNodes.map((_, i) => `Preferred Node ${i + 1}`))
      .concat(validators.map((_, i) => `Validator ${i + 1}`))
      .concat(noDiscoveryValidators.map((_, i) => `Picky Validator ${i + 1}`));
    t.logger.warn(`All nodes initialized: ${identifiers.join(', ')}`);

    const validatorsUsingDiscovery = validators.length;
    const totalNumValidators = validators.length + noDiscoveryValidators.length;
    const expectedPeerCounts = nodes
      .map(() => nodes.length - 1 + validatorsUsingDiscovery) // Regular nodes connect to other regular nodes and validators with discovery
      .concat(preferredNodes.map(() => totalNumValidators)) // Preferred nodes only connect to validators (all of them)
      .concat(validators.map(() => nodes.length + preferredNodes.length + validatorsUsingDiscovery - 1)) // Validators connect to all nodes, preferred nodes, and other validators with discovery
      .concat(noDiscoveryValidators.map(() => preferredNodes.length)); // The no-discovery validators ONLY connect to preferred nodes (no discovery)
    for (let i = 0; i < allNodes.length; i++) {
      const peerResult = await waitForNodeToAcquirePeers(allNodes[i], expectedPeerCounts[i], 300, identifiers[i]);
      expect(peerResult).toBeTruthy();
    }
    t.logger.warn(
      `All node peer connections established: ${identifiers.map((id, i) => `${id} (${expectedPeerCounts[i]})`).join(', ')}`,
    );

    // Wait for gossipsub mesh to form before proceeding. TCP connections alone are not
    // sufficient — gossipsub needs heartbeat cycles to GRAFT peers into the mesh.
    // Without this, validators may miss proposals/attestations via gossip.
    //
    // We skip the mesh check for preferred nodes and no-discovery validators because gossipsub's
    // `directPeers` mechanism prevents them from ever forming mesh links:
    // - Preferred nodes (indices 2,3): validators have them as directPeers, so when the preferred
    //   node tries to GRAFT a validator, the validator rejects with PRUNE (gossipsub never GRAFTs
    //   to/from directPeers). The PRUNE triggers a 60s backoff, creating an infinite cycle.
    // - Picky validator (index 6): ALL its peers are its own directPeers, and gossipsub excludes
    //   directPeers from mesh candidacy during heartbeats.
    // Message delivery still works for these nodes via gossipsub's directPeers relay path, which
    // always sends messages to directPeers regardless of mesh membership.
    const preferredNodeStartIndex = nodes.length;
    const pickyValidatorIndex = nodes.length + preferredNodes.length + validators.length;
    const skipMeshCheck = new Set<number>();
    for (let i = 0; i < preferredNodes.length; i++) {
      skipMeshCheck.add(preferredNodeStartIndex + i);
    }
    for (let i = 0; i < noDiscoveryValidators.length; i++) {
      skipMeshCheck.add(pickyValidatorIndex + i);
    }
    await t.waitForGossipSubMesh(allNodes, undefined, undefined, undefined, skipMeshCheck);

    validators.push(...noDiscoveryValidators);

    // Install gossip source observers in the workers so we can assert that nodes that restrict
    // who they connect to only receive gossip from the expected peers. Replaces the inline
    // `monitorP2PTraffic` monkey-patch that the pre-worker-thread version of this test used.
    const preferredNodePeerIds = preferredNodeEnrs.map(enr => ENR.decodeTxt(enr!).peerId.toString());
    const validatorEnrs = await Promise.all(validators.map(v => v.getEncodedEnr()));
    const validatorPeerIds = validatorEnrs.map(enr => ENR.decodeTxt(enr!).peerId.toString());

    // No-discovery validators should only receive P2P gossip from preferred nodes, as those are
    // the only peers they connect to.
    await Promise.all(noDiscoveryValidators.map(v => v.startGossipSourceRecording()));
    // Preferred nodes should only receive P2P gossip from validators (incl. the picky one).
    await Promise.all(preferredNodes.map(n => n.startGossipSourceRecording()));

    // Advance to a fresh slot so the proposer gets a clean window for block building.
    const [timestamp] = await t.ctx.cheatCodes.rollup.advanceToNextSlot();
    t.ctx.dateProvider.setTime(Number(timestamp) * 1000);

    // We need to `createNodes` before we setup account, because
    // those nodes actually form the committee, and so we cannot build
    // blocks without them (since targetCommitteeSize is set to the number of nodes)
    await t.setupAccount();

    // Send the required number of transactions to each node
    t.logger.info('Submitting transactions');
    for (const node of nodes) {
      const txs = await submitTransactions(t.logger, node, NUM_TXS_PER_NODE, t.fundedAccount);
      txsSentViaDifferentNodes.push(txs);
    }

    t.logger.info('Waiting for transactions to be mined');
    // now ensure that all txs were successfully mined
    const receipts = await Promise.all(
      txsSentViaDifferentNodes.flatMap((txs, i) =>
        txs.map((txHash, j) => {
          t.logger.info(`Waiting for tx ${i}-${j}: ${txHash.toString()} to be mined`);
          return waitForTx(nodes[0], txHash, { timeout: WAIT_FOR_TX_TIMEOUT });
        }),
      ),
    );
    t.logger.info('All transactions mined');

    // Gather signers from attestations downloaded from L1
    const blockNumber = receipts[0].blockNumber!;
    const [checkpointedBlock] = await nodes[0].getCheckpointedBlocks(blockNumber, 1);
    const [publishedCheckpoint] = await nodes[0].getCheckpoints(checkpointedBlock.checkpointNumber, 1);
    const payload = ConsensusPayload.fromCheckpoint(publishedCheckpoint.checkpoint);
    const attestations = publishedCheckpoint.attestations
      .filter(a => !a.signature.isEmpty())
      .map(a => new CheckpointAttestation(payload, a.signature, Signature.empty()));
    const signers = await Promise.all(attestations.map(att => att.getSender()!.toString()));
    t.logger.info(`Attestation signers`, { signers });

    expect(signers.length).toEqual(validators.length);

    // Check that the signers found are part of the proposer nodes to ensure the archiver fetched them right
    const validatorAddressesPerNode = await Promise.all(validators.map(node => node.getValidatorAddresses()));
    const validatorAddresses = validatorAddressesPerNode.flatMap(addrs => addrs?.map(a => a.toString()) ?? []);
    t.logger.info(`Validator addresses`, { addresses: validatorAddresses });
    for (const signer of signers) {
      expect(validatorAddresses).toContain(signer);
    }

    // Assert each recording node only received gossip from its allowed peer set. This is the
    // worker-thread equivalent of the old `monitorP2PTraffic` spies — proves that libp2p v2's
    // peer gating is actually rejecting gossip from non-allowed peers rather than relying on the
    // peer-count assertion alone.
    const assertSourcesIn = async (node: WorkerAztecNode, allowed: string[], label: string) => {
      const records = await node.getGossipSources();
      t.logger.info(`Gossip sources for ${label}`, {
        total: records.length,
        byTopic: records.reduce<Record<string, number>>((acc, r) => {
          acc[r.topic] = (acc[r.topic] ?? 0) + 1;
          return acc;
        }, {}),
      });
      expect(records.length).toBeGreaterThan(0);
      for (const record of records) {
        expect(allowed).toContain(record.source);
      }
    };
    for (let i = 0; i < noDiscoveryValidators.length; i++) {
      await assertSourcesIn(noDiscoveryValidators[i], preferredNodePeerIds, `Picky Validator ${i + 1}`);
    }
    for (let i = 0; i < preferredNodes.length; i++) {
      await assertSourcesIn(preferredNodes[i], validatorPeerIds, `Preferred Node ${i + 1}`);
    }
  });
});
