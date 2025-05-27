import { addLogNameHandler } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { emptyChainConfig } from '@aztec/stdlib/config';
import { getTelemetryClient } from '@aztec/telemetry-client';

import type { IDiscv5CreateOptions } from '@chainsafe/discv5';
import { jest } from '@jest/globals';
import type { PeerId } from '@libp2p/interface';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';

import { BootstrapNode } from '../../bootstrap/bootstrap.js';
import { type BootnodeConfig, type P2PConfig, getP2PDefaultConfig } from '../../config.js';
import { AZTEC_ENR_CLIENT_VERSION_KEY } from '../../types/index.js';
import { PeerDiscoveryState } from '../service.js';
import { DiscV5Service } from './discV5_service.js';

const waitForPeers = (node: DiscV5Service, expectedCount: number, timeout = 15_000): Promise<void> => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout: Failed to connect to ${expectedCount} peers within ${timeout} ms`));
    }, timeout);

    node.on('peer:discovered', () => {
      if (node.getKadValues().length >= expectedCount) {
        clearTimeout(timeoutId);
        resolve();
      }
    });
  });
};

describe('Discv5Service', () => {
  jest.setTimeout(20_000);

  let store: AztecAsyncKVStore;
  let bootNode: BootstrapNode;
  let bootNodePeerId: PeerId;
  let basePort = 7890;

  const bootnodeConfig: BootnodeConfig = {
    p2pIp: '127.0.0.1',
    p2pPort: basePort + 100,
    listenAddress: '127.0.0.1',
    dataDirectory: undefined,
    dataStoreMapSizeKB: 0,
    bootstrapNodes: [],
    ...emptyChainConfig,
  };

  beforeAll(() => {
    addLogNameHandler(name => (name === 'p2p:discv5_service' ? `${name}:${basePort}` : name));
  });

  beforeEach(async () => {
    const telemetryClient = getTelemetryClient();
    store = await openTmpStore('test');
    bootNode = new BootstrapNode(store, telemetryClient);
    await bootNode.start(bootnodeConfig);
    bootNodePeerId = bootNode.getPeerId();
  });

  afterEach(async () => {
    await bootNode.stop();
    await store.close();
  });

  const startNodes = (...nodes: { start: () => Promise<void> }[]) => Promise.all(nodes.map(node => node.start()));
  const stopNodes = (...nodes: { stop: () => Promise<void> }[]) => Promise.all(nodes.map(node => node.stop()));
  const getPeers = (node: DiscV5Service) =>
    Promise.all(node.getKadValues().map(async peer => (await peer.peerId()).toString()));

  it('should initialize with default values', async () => {
    const node = await createNode();
    expect(node.getStatus()).toEqual(PeerDiscoveryState.STOPPED); // not started yet
    await node.start();
    expect(node.getStatus()).toEqual(PeerDiscoveryState.RUNNING);
    const kadValues = node.getKadValues();
    const bootnode = kadValues[0];
    expect((await bootnode.peerId()).toString()).toEqual(bootNodePeerId.toString());
    await node.stop();
  });

  it('should allow broadcast port to be set', async () => {
    const broadcastPort = 7891;
    const node = await createNode({ p2pBroadcastPort: broadcastPort });
    const enr = node.getEnr();
    expect(enr.ip).toEqual('127.0.0.1');
    expect(enr.udp).toEqual(broadcastPort);
    expect(enr.tcp).toEqual(broadcastPort);
  });

  it('should discover & add a peer', async () => {
    const node1 = await createNode();
    const node2 = await createNode();
    await startNodes(node1, node2);

    // nodes should be connected to boostrap
    expect(node1.getKadValues()).toHaveLength(1);
    expect(node2.getKadValues()).toHaveLength(1);

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

  it('should automatically resolve p2p ip if not set', async () => {
    const extraNodes = 3;
    const nodes: DiscV5Service[] = [];

    // Create a node with no p2pIp
    const node = await createNode({ p2pIp: undefined, config: { addrVotesToUpdateEnr: 1, pingInterval: 200 } });
    await node.start();
    nodes.push(node);

    // Create a number of normal nodes
    for (let i = 1; i < extraNodes; i++) {
      const node = await createNode({ config: { pingInterval: 200 } });
      await node.start();
      nodes.push(node);
    }

    expect(node.getStatus()).toEqual(PeerDiscoveryState.RUNNING);
    for (const n of nodes) {
      expect(n.getStatus()).toEqual(PeerDiscoveryState.RUNNING);
    }

    expect(node.getEnr().ip).toEqual(undefined);
    await Promise.allSettled([
      waitForPeers(node, extraNodes),
      (async () => {
        await sleep(2000); // wait for peer discovery to be able to start
        for (let i = 0; i < extraNodes; i++) {
          await node.runRandomNodesQuery();
          for (const n of nodes) {
            await n.runRandomNodesQuery();
          }
          await sleep(100);
        }
      })(),
    ]);

    // Expect it's IP has been updated, and that the tcp and udp ports are the same
    expect(node.getEnr().ip).not.toEqual(undefined);
    expect(node.getEnr().tcp).not.toEqual(undefined);
    expect(node.getEnr().tcp).toEqual(node.getEnr().udp);

    await stopNodes(...nodes);
  });

  it('should refuse to connect to a bootstrap node with wrong chain id', async () => {
    const node1 = await createNode({ l1ChainId: 13, bootstrapNodeEnrVersionCheck: true });
    const node2 = await createNode({ l1ChainId: 14, bootstrapNodeEnrVersionCheck: false });
    await startNodes(node1, node2);
    expect(node1.getKadValues()).toHaveLength(0);
    expect(node2.getKadValues()).toHaveLength(1);
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

    const node2Peers = await Promise.all(node2.getKadValues().map(async peer => (await peer.peerId()).toString()));
    // NOTE: bootnode seems to still be present in list of peers sometimes, will investigate
    // expect(node2Peers).toHaveLength(1);
    expect(node2Peers).toContain(node1.getPeerId().toString());

    await node1.stop();
    await node2.stop();
  });

  it('should use trusted peers for discovery', async () => {
    const node1 = await createNode({}, false);
    const trustedNode = await createNode({}, false);
    const trustedEnr = trustedNode.getEnr().encodeTxt();

    const node2 = await createNode(
      {
        trustedPeers: [trustedEnr],
        privatePeers: [],
      },
      false,
    );
    const node3 = await createNode(
      {
        trustedPeers: [trustedEnr],
        privatePeers: [],
      },
      false,
    );

    await startNodes(node1, node2, node3, trustedNode);

    expect(node1.getKadValues()).toHaveLength(0);
    expect(trustedNode.getKadValues()).toHaveLength(0);

    // Verify node2 and node3 are connected to the trusted peer
    expect(node2.getKadValues().length).toBe(1);
    expect(node3.getKadValues().length).toBe(1);
    expect(await getPeers(node2)).toContain(trustedNode.getPeerId().toString());
    expect(await getPeers(node3)).toContain(trustedNode.getPeerId().toString());

    await Promise.all([
      waitForPeers(node2, 2),
      waitForPeers(node3, 2),
      (async () => {
        await sleep(2000); // wait for peer discovery to be able to start
        for (let i = 0; i < 5; i++) {
          await node1.runRandomNodesQuery();
          await node2.runRandomNodesQuery();
          await node3.runRandomNodesQuery();
          await trustedNode.runRandomNodesQuery();
          await sleep(100);
        }
      })(),
    ]);

    expect(node1.getKadValues()).toHaveLength(0);

    // Verify node2 and node3 discovered each other through the trusted peer
    const node2Peers = await getPeers(node2);
    expect(node2Peers).toHaveLength(2);
    expect(node2Peers).toContain(node3.getPeerId().toString());
    const node3Peers = await getPeers(node3);
    expect(node3Peers).toHaveLength(2);
    expect(node3Peers).toContain(node2.getPeerId().toString());
    const trustedNodePeers = await getPeers(trustedNode);
    expect(trustedNodePeers).toHaveLength(2);
    expect(trustedNodePeers).toContain(node2.getPeerId().toString());
    expect(trustedNodePeers).toContain(node3.getPeerId().toString());

    await stopNodes(node1, node2, node3, trustedNode);
  });

  it('should not use private peers or peers marked as both trusted and private for discovery', async () => {
    const node1 = await createNode({}, false);
    const privateNode = await createNode({}, false);
    const privateEnr = privateNode.getEnr().encodeTxt();

    const node2 = await createNode(
      {
        trustedPeers: [],
        privatePeers: [privateEnr],
      },
      false,
    );
    const node3 = await createNode(
      {
        trustedPeers: [privateEnr],
        privatePeers: [privateEnr],
      },
      false,
    );

    await startNodes(node1, node2, node3, privateNode);

    expect(node1.getKadValues()).toHaveLength(0);
    expect(node2.getKadValues()).toHaveLength(0);
    expect(node3.getKadValues()).toHaveLength(0);
    expect(privateNode.getKadValues()).toHaveLength(0);

    await sleep(2000); // wait for peer discovery to be able to start
    for (let i = 0; i < 3; i++) {
      await node1.runRandomNodesQuery();
      await node2.runRandomNodesQuery();
      await node3.runRandomNodesQuery();
      await privateNode.runRandomNodesQuery();
      await sleep(100);
    }

    expect(node1.getKadValues()).toHaveLength(0);
    expect(node2.getKadValues()).toHaveLength(0);
    expect(node3.getKadValues()).toHaveLength(0);
    expect(privateNode.getKadValues()).toHaveLength(0);

    await stopNodes(node1, node2, node3, privateNode);
  }, 30_000);

  it('should set client version to ENR', async () => {
    const node = await createNode();
    const enr = node.getEnr();
    expect(enr.kvs.get(AZTEC_ENR_CLIENT_VERSION_KEY)?.toString()).toEqual(testPackageVersion);
  });

  const testPackageVersion = 'test-discv5-service';
  const createNode = async (overrides: Partial<P2PConfig & IDiscv5CreateOptions> = {}, useBootnode = true) => {
    const port = ++basePort;
    const bootnodeAddr = bootNode.getENR().encodeTxt();
    const peerId = await createSecp256k1PeerId();
    const config: P2PConfig = {
      ...getP2PDefaultConfig(),
      ...emptyChainConfig,
      p2pIp: `127.0.0.1`,
      listenAddress: `127.0.0.1`,
      p2pPort: port,
      bootstrapNodes: useBootnode ? [bootnodeAddr] : [],
      blockCheckIntervalMS: 50,
      peerCheckIntervalMS: 50,
      p2pEnabled: true,
      l2QueueSize: 100,
      ...overrides,
    };
    return new DiscV5Service(peerId, config, testPackageVersion, undefined, undefined, overrides);
  };
});
