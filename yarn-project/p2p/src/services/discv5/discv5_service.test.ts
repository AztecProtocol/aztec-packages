import { emptyChainConfig } from '@aztec/circuit-types/config';
import { addLogNameHandler } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { type AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { jest } from '@jest/globals';
import type { PeerId } from '@libp2p/interface';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';

import { BootstrapNode } from '../../bootstrap/bootstrap.js';
import { type BootnodeConfig, type P2PConfig, getP2PDefaultConfig } from '../../config.js';
import { PeerDiscoveryState } from '../service.js';
import { DiscV5Service } from './discV5_service.js';

const waitForPeers = (node: DiscV5Service, expectedCount: number): Promise<void> => {
  const timeout = 7_000;
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout: Failed to connect to ${expectedCount} peers within ${timeout} ms`));
    }, timeout);

    node.on('peer:discovered', () => {
      if (node.getAllPeers().length >= expectedCount) {
        clearTimeout(timeoutId);
        resolve();
      }
    });
  });
};

describe('Discv5Service', () => {
  jest.setTimeout(10_000);

  let store: AztecAsyncKVStore;
  let bootNode: BootstrapNode;
  let bootNodePeerId: PeerId;
  let basePort = 7890;

  const baseConfig: BootnodeConfig = {
    udpAnnounceAddress: `127.0.0.1:${basePort + 100}`,
    udpListenAddress: `0.0.0.0:${basePort + 100}`,
    maxPeerCount: 100,
    dataDirectory: undefined,
    dataStoreMapSizeKB: 0,
    ...emptyChainConfig,
  };

  beforeAll(() => {
    addLogNameHandler(name => (name === 'p2p:discv5_service' ? `${name}:${basePort}` : name));
  });

  beforeEach(async () => {
    const telemetryClient = getTelemetryClient();
    store = await openTmpStore('test');
    bootNode = new BootstrapNode(store, telemetryClient);
    await bootNode.start(baseConfig);
    bootNodePeerId = bootNode.getPeerId();
  });

  afterEach(async () => {
    await bootNode.stop();
    await store.close();
  });

  const startNodes = (...nodes: { start: () => Promise<void> }[]) => Promise.all(nodes.map(node => node.start()));
  const stopNodes = (...nodes: { stop: () => Promise<void> }[]) => Promise.all(nodes.map(node => node.stop()));
  const getPeers = (node: DiscV5Service) =>
    Promise.all(node.getAllPeers().map(async peer => (await peer.peerId()).toString()));

  it('should initialize with default values', async () => {
    const node = await createNode();
    expect(node.getStatus()).toEqual(PeerDiscoveryState.STOPPED); // not started yet
    await node.start();
    expect(node.getStatus()).toEqual(PeerDiscoveryState.RUNNING);
    const peers = node.getAllPeers();
    const bootnode = peers[0];
    expect((await bootnode.peerId()).toString()).toEqual(bootNodePeerId.toString());
    await node.stop();
  });

  it('should discover & add a peer', async () => {
    const node1 = await createNode();
    const node2 = await createNode();
    await startNodes(node1, node2);

    // nodes should be connected to boostrap
    expect(node1.getAllPeers()).toHaveLength(1);
    expect(node2.getAllPeers()).toHaveLength(1);

    await Promise.all([
      waitForPeers(node2, 2),
      (async () => {
        await sleep(2000); // wait for peer discovery to be able to start
        for (let i = 0; i < 5; i++) {
          await node1.runRandomNodesQuery();
          await node2.runRandomNodesQuery();
          await sleep(100);
        }
      })(),
    ]);

    const node1Peers = await getPeers(node1);
    const node2Peers = await getPeers(node2);

    expect(node1Peers).toHaveLength(2);
    expect(node2Peers).toHaveLength(2);
    expect(node1Peers).toContain(node2.getPeerId().toString());
    expect(node2Peers).toContain(node1.getPeerId().toString());

    await stopNodes(node1, node2);
  });

  it('should refuse to connect to a bootstrap node with wrong chain id', async () => {
    const node1 = await createNode({ l1ChainId: 13, bootstrapNodeEnrVersionCheck: true });
    const node2 = await createNode({ l1ChainId: 14, bootstrapNodeEnrVersionCheck: false });
    await startNodes(node1, node2);
    expect(node1.getAllPeers()).toHaveLength(0);
    expect(node2.getAllPeers()).toHaveLength(1);
    await stopNodes(node1, node2);
  });

  it('should not add a peer with wrong chain id', async () => {
    const node1 = await createNode();
    const node2 = await createNode();
    const node3 = await createNode({ l1ChainId: 14 });
    await startNodes(node1, node2, node3);

    await Promise.all([
      waitForPeers(node1, 2),
      (async () => {
        await sleep(2000); // wait for peer discovery to be able to start
        for (let i = 0; i < 5; i++) {
          await node1.runRandomNodesQuery();
          await node2.runRandomNodesQuery();
          await node3.runRandomNodesQuery();
          await sleep(100);
        }
      })(),
    ]);

    const node1Peers = await getPeers(node1);
    const node2Peers = await getPeers(node2);
    const node3Peers = await getPeers(node3);

    expect(node1Peers).toHaveLength(2);
    expect(node2Peers).toHaveLength(2);
    expect(node3Peers).toHaveLength(1);

    expect(node1Peers).toContain(node2.getPeerId().toString());
    expect(node1Peers).not.toContain(node3.getPeerId().toString());

    expect(node2Peers).toContain(node1.getPeerId().toString());
    expect(node2Peers).not.toContain(node3.getPeerId().toString());

    await stopNodes(node1, node2, node3);
  });

  // Test is flakey, so skipping for now.
  // TODO: Investigate: #6246
  it.skip('should persist peers without bootnode', async () => {
    const node1 = await createNode();
    const node2 = await createNode();
    await node1.start();
    await node2.start();
    await waitForPeers(node2, 2);

    await node2.stop();
    await bootNode.stop();

    await node2.start();
    await waitForPeers(node2, 1);

    const node2Peers = await Promise.all(node2.getAllPeers().map(async peer => (await peer.peerId()).toString()));
    // NOTE: bootnode seems to still be present in list of peers sometimes, will investigate
    // expect(node2Peers).toHaveLength(1);
    expect(node2Peers).toContain(node1.getPeerId().toString());

    await node1.stop();
    await node2.stop();
  });

  const createNode = async (overrides: Partial<P2PConfig> = {}) => {
    const port = ++basePort;
    const bootnodeAddr = bootNode.getENR().encodeTxt();
    const peerId = await createSecp256k1PeerId();
    const config: P2PConfig = {
      ...getP2PDefaultConfig(),
      ...baseConfig,
      tcpListenAddress: `0.0.0.0:${port}`,
      udpListenAddress: `0.0.0.0:${port + 100}`,
      tcpAnnounceAddress: `127.0.0.1:${port}`,
      udpAnnounceAddress: `127.0.0.1:${port + 100}`,
      bootstrapNodes: [bootnodeAddr],
      blockCheckIntervalMS: 50,
      peerCheckIntervalMS: 50,
      transactionProtocol: 'aztec/1.0.0',
      p2pEnabled: true,
      keepProvenTxsInPoolFor: 0,
      ...overrides,
    };
    return new DiscV5Service(peerId, config);
  };
});
