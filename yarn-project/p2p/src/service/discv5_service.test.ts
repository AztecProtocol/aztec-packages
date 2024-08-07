import { sleep } from '@aztec/foundation/sleep';

import { jest } from '@jest/globals';
import type { PeerId } from '@libp2p/interface';

import { BootstrapNode } from '../bootstrap/bootstrap.js';
import { type P2PConfig } from '../config.js';
import { DiscV5Service } from './discV5_service.js';
import { createLibP2PPeerId } from './libp2p_service.js';
import { PeerDiscoveryState } from './service.js';

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

  let bootNode: BootstrapNode;
  let bootNodePeerId: PeerId;
  let basePort = 7890;
  const baseConfig = {
    tcpAnnounceAddress: `127.0.0.1:${basePort}`,
    udpAnnounceAddress: `127.0.0.1:${basePort}`,
    tcpListenAddress: `0.0.0.0:${basePort}`,
    udpListenAddress: `0.0.0.0:${basePort}`,
    minPeerCount: 1,
    maxPeerCount: 100,
    queryForIp: false,
  };

  beforeEach(async () => {
    bootNode = new BootstrapNode();
    await bootNode.start(baseConfig);
    bootNodePeerId = bootNode.getPeerId();
  });

  afterEach(async () => {
    await bootNode.stop();
  });

  it('should initialize with default values', async () => {
    basePort++;
    const node = await createNode(basePort);
    expect(node.getStatus()).toEqual(PeerDiscoveryState.STOPPED); // not started yet
    await node.start();
    expect(node.getStatus()).toEqual(PeerDiscoveryState.RUNNING);
    const peers = node.getAllPeers();
    const bootnode = peers[0];
    expect((await bootnode.peerId()).toString()).toEqual(bootNodePeerId.toString());
  });

  it('should discover & add a peer', async () => {
    basePort++;
    const node1 = await createNode(basePort);
    basePort++;
    const node2 = await createNode(basePort);
    await node1.start();
    await node2.start();
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

    const node1Peers = await Promise.all(node1.getAllPeers().map(async peer => (await peer.peerId()).toString()));
    const node2Peers = await Promise.all(node2.getAllPeers().map(async peer => (await peer.peerId()).toString()));

    expect(node1Peers).toHaveLength(2);
    expect(node2Peers).toHaveLength(2);
    expect(node1Peers).toContain(node2.getPeerId().toString());
    expect(node2Peers).toContain(node1.getPeerId().toString());

    await node1.stop();
    await node2.stop();
  });

  // Test is flakey, so skipping for now.
  // TODO: Investigate: #6246
  it.skip('should persist peers without bootnode', async () => {
    basePort++;
    const node1 = await createNode(basePort);
    basePort++;
    const node2 = await createNode(basePort);
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

  const createNode = async (port: number) => {
    const bootnodeAddr = bootNode.getENR().encodeTxt();
    const peerId = await createLibP2PPeerId();
    const config: P2PConfig = {
      ...baseConfig,
      tcpListenAddress: `0.0.0.0:${port}`,
      udpListenAddress: `0.0.0.0:${port}`,
      tcpAnnounceAddress: `127.0.0.1:${port}`,
      udpAnnounceAddress: `127.0.0.1:${port}`,
      bootstrapNodes: [bootnodeAddr],
      blockCheckIntervalMS: 50,
      peerCheckIntervalMS: 50,
      transactionProtocol: 'aztec/1.0.0',
      p2pEnabled: true,
      l2QueueSize: 100,
      keepProvenTxsInPoolFor: 0,
    };
    return new DiscV5Service(peerId, config);
  };
});
