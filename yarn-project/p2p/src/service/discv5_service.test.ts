// import type { PeerId } from '@libp2p/interface';
import { BootstrapNode } from '../bootstrap/bootstrap.js';
import { DiscV5Service } from './discV5_service.js';
import { createLibP2PPeerId } from './libp2p_service.js';

describe('Discv5Service', () => {
  let bootNode: BootstrapNode;
  let port = 1234;
  const baseConfig = {
    announceHostname: '/ip4/127.0.0.1',
    tcpListenPort: port,
    udpListenIp: '0.0.0.0',
    tcpListenIp: '0.0.0.0',
    udpListenPort: port,
    bootstrapNodes: [],
    p2pEnabled: true,
    p2pBlockCheckIntervalMS: 50,
    p2pL2QueueSize: 100,
    transactionProtocol: 'aztec/1.0.0',
    minPeerCount: 1,
    maxPeerCount: 100,
  };

  beforeAll(async () => {
    bootNode = new BootstrapNode();
    await bootNode.start(baseConfig);
  });

  afterAll(async () => {
    await bootNode.stop();
  });

  it('should initialize with default values', async () => {
    port++;
    const node = await createNode(port);
    const peers = node.getAllPeers();
    expect(peers).toEqual([]);
  });

  it('should discover & add a peer', async () => {
    port++;
    const node1 = await createNode(port);
    const node2 = await createNode(port + 1);
    await node1.start();
    await node2.start();
    const node1Peers = node1.getAllPeers();
    expect(node1Peers).toEqual([]);
  });

  const createNode = async (port: number) => {
    const peerId = await createLibP2PPeerId();
    const config = {
      ...baseConfig,
      bootstrapNodes: [bootNode.getENR().encodeTxt()],
      tcpListenPort: port,
      udpListenPort: port,
      announcePort: port,
    };
    return new DiscV5Service(peerId, config);
  };
});
