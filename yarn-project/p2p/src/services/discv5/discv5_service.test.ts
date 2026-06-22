import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { emptyChainConfig } from '@aztec/stdlib/config';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { jest } from '@jest/globals';
import type { PeerId } from '@libp2p/interface';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';
import type { IDiscv5CreateOptions } from '@nethermindeth/discv5';

import { BootstrapNode } from '../../bootstrap/bootstrap.js';
import { type BootnodeConfig, DEFAULT_PUBLIC_IP_SERVICES, type P2PConfig, getP2PDefaultConfig } from '../../config.js';
import { AZTEC_ENR_CLIENT_VERSION_KEY } from '../../types/index.js';
import { PeerDiscoveryState } from '../service.js';
import { DiscV5Service } from './discV5_service.js';
import { PersistedEnrStore } from './persisted_enr_store.js';

/**
 * Runs discovery queries on all nodes until the condition is met or timeout expires.
 * This is more resilient than fixed iteration loops as it adapts to varying DHT propagation times.
 */
const runDiscoveryUntil = async (nodes: DiscV5Service[], condition: () => boolean, timeout = 60, interval = 0.2) => {
  await retryUntil(
    async () => {
      await Promise.all(nodes.map(n => n.runRandomNodesQuery()));
      return condition() || undefined;
    },
    'Peer discovery',
    timeout,
    interval,
  );
};

describe('Discv5Service', () => {
  jest.setTimeout(120_000);

  let store: AztecAsyncKVStore;
  let bootNode: BootstrapNode;
  let bootNodePeerId: PeerId;
  let basePort = 7890;

  const bootnodeConfig: BootnodeConfig = {
    p2pIp: '127.0.0.1',
    p2pPort: basePort + 100,
    listenAddress: '127.0.0.1',
    dataDirectory: undefined,
    dataStoreMapSizeKb: 0,
    bootstrapNodes: [],
    queryForIp: false,
    publicIpServices: DEFAULT_PUBLIC_IP_SERVICES,
    ...emptyChainConfig,
  };

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

    await runDiscoveryUntil([node1, node2], () => node1.getKadValues().length >= 2 && node2.getKadValues().length >= 2);

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

    await runDiscoveryUntil(nodes, () => node.getEnr().ip !== undefined);

    // Expect it's IP has been updated, and that the tcp and udp ports are the same
    expect(node.getEnr().ip).not.toEqual(undefined);
    expect(node.getEnr().tcp).not.toEqual(undefined);
    expect(node.getEnr().tcp).toEqual(node.getEnr().udp);

    await stopNodes(...nodes);
  });

  it('should correct a wrong initial IP via PONG votes and emit ip:changed', async () => {
    const extraNodes = 3;
    const nodes: DiscV5Service[] = [];

    // Simulate the scenario where getPublicIp() returned a wrong IP at startup (e.g. NAT egress IP).
    // With enrUpdate forced on, PONG votes from peers should correct the ENR to 127.0.0.1.
    const node = await createNode({
      p2pIp: '1.2.3.4',
      config: { enrUpdate: true, addrVotesToUpdateEnr: 1, pingInterval: 200 },
    });
    await node.start();
    nodes.push(node);

    // Track ip:changed events (these are what libp2p_service bridges to its AddressManager)
    const ipChanges: string[] = [];
    node.on('ip:changed', (ip: string) => ipChanges.push(ip));

    expect(node.getEnr().ip).toEqual('1.2.3.4');

    for (let i = 1; i < extraNodes; i++) {
      const n = await createNode({ config: { pingInterval: 200 } });
      await n.start();
      nodes.push(n);
    }

    // Wait for the ENR IP to be corrected by PONG votes
    await runDiscoveryUntil(nodes, () => node.getEnr().ip !== '1.2.3.4');

    // ENR should now reflect the real IP (127.0.0.1) as reported by peers
    expect(node.getEnr().ip).toEqual('127.0.0.1');
    expect(node.getEnr().tcp).toEqual(node.getEnr().udp);

    // ip:changed should have fired with the corrected IP
    expect(ipChanges.length).toBeGreaterThanOrEqual(1);
    expect(ipChanges[ipChanges.length - 1]).toEqual('127.0.0.1');

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

    await runDiscoveryUntil(
      [node1, node2, node3],
      () => node1.getKadValues().length >= 2 && node2.getKadValues().length >= 2,
    );

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

  it('resurrects persisted peers from the store on restart with no bootnode', async () => {
    const peerIdA = await createSecp256k1PeerId();
    const portA = ++basePort;

    // nodeA is backed by the suite's store (the only KV store in play — the bootnode shares it), so it
    // persists the peers it discovers. We can recreate it as a fresh instance with the same identity,
    // port and store to model a process restart. nodeB has no store; it's only a peer for nodeA to find.
    const makeNodeA = (useBootnode: boolean) =>
      new DiscV5Service(
        peerIdA,
        {
          ...getP2PDefaultConfig(),
          ...emptyChainConfig,
          p2pIp: `127.0.0.1`,
          listenAddress: `127.0.0.1`,
          p2pPort: portA,
          bootstrapNodes: useBootnode ? [bootNode.getENR().encodeTxt()] : [],
          blockCheckIntervalMS: 50,
          peerCheckIntervalMS: 50,
          p2pEnabled: true,
          l2QueueSize: 100,
        },
        testPackageVersion,
        undefined,
        undefined,
        store,
      );

    let nodeA = makeNodeA(true);
    const nodeB = await createNode();
    await nodeA.start();
    await nodeB.start();

    // A read-only view of the same store, to assert what nodeA persists.
    const persistedView = new PersistedEnrStore(store, 1000);
    const persistedNodeIds = async () => (await persistedView.load(() => true)).map(enr => enr.nodeId);

    // Drive discovery until nodeA has found nodeB and persisted its ENR — exercising the persist hook
    // for a discovered, non-bootnode peer.
    await retryUntil(
      async () => {
        await Promise.all([nodeA, nodeB].map(n => n.runRandomNodesQuery()));
        return (await persistedNodeIds()).includes(nodeB.getEnr().nodeId) || undefined;
      },
      'nodeB persisted by nodeA',
      30,
      0.2,
    );

    // The bootnode is config-provided, so it must never be persisted.
    expect(await persistedNodeIds()).not.toContain(bootNode.getENR().nodeId);

    // Tear the live network down so nothing can re-teach nodeA about nodeB.
    await nodeA.stop();
    await nodeB.stop();
    await bootNode.stop();

    // Recreate nodeA as a fresh instance on the same store with no bootnode. Its discv5 routing table
    // starts empty, so the only way it can know nodeB is by resurrecting the persisted ENR on start().
    nodeA = makeNodeA(false);
    await nodeA.start();

    const resurrected = await Promise.all(nodeA.getKadValues().map(async enr => (await enr.peerId()).toString()));
    expect(resurrected).toContain(nodeB.getPeerId().toString());
    expect(resurrected).not.toContain(bootNodePeerId.toString());

    await nodeA.stop();
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

    await runDiscoveryUntil(
      [node1, node2, node3, trustedNode],
      () => node2.getKadValues().length >= 2 && node3.getKadValues().length >= 2,
    );

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

    // Run discovery for a bit to ensure no peers are found (negative test)
    for (let i = 0; i < 20; i++) {
      await Promise.all([node1, node2, node3, privateNode].map(n => n.runRandomNodesQuery()));
      await sleep(200);
    }

    expect(node1.getKadValues()).toHaveLength(0);
    expect(node2.getKadValues()).toHaveLength(0);
    expect(node3.getKadValues()).toHaveLength(0);
    expect(privateNode.getKadValues()).toHaveLength(0);

    await stopNodes(node1, node2, node3, privateNode);
  });

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
    return new DiscV5Service(peerId, config, testPackageVersion, undefined, undefined, undefined, overrides);
  };
});
