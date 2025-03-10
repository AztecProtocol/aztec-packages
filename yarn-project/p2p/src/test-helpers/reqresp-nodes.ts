import type { EpochCache } from '@aztec/epoch-cache';
import { timesParallel } from '@aztec/foundation/collection';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { type ChainConfig, emptyChainConfig } from '@aztec/stdlib/config';
import type { ClientProtocolCircuitVerifier, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { P2PClientType } from '@aztec/stdlib/p2p';
import type { Tx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { SignableENR } from '@chainsafe/enr';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { identify } from '@libp2p/identify';
import type { PeerId } from '@libp2p/interface';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';
import { tcp } from '@libp2p/tcp';
import { multiaddr } from '@multiformats/multiaddr';
import getPort from 'get-port';
import { type Libp2p, type Libp2pOptions, createLibp2p } from 'libp2p';

import { BootstrapNode } from '../bootstrap/bootstrap.js';
import type { BootnodeConfig, P2PConfig } from '../config.js';
import type { MemPools } from '../mem_pools/interface.js';
import { DiscV5Service } from '../services/discv5/discV5_service.js';
import { LibP2PService } from '../services/libp2p/libp2p_service.js';
import type { PeerScoring } from '../services/peer-manager/peer_scoring.js';
import type { P2PReqRespConfig } from '../services/reqresp/config.js';
import {
  ReqRespSubProtocol,
  type ReqRespSubProtocolHandlers,
  type ReqRespSubProtocolValidators,
  noopValidator,
} from '../services/reqresp/interface.js';
import { pingHandler, statusHandler } from '../services/reqresp/protocols/index.js';
import { ReqResp } from '../services/reqresp/reqresp.js';
import { type PubSubLibp2p, convertToMultiaddr, createLibP2PPeerIdFromPrivateKey } from '../util.js';

/**
 * Creates a libp2p node, pre configured.
 * @param boostrapAddrs - an optional list of bootstrap addresses
 * @returns Lip2p node
 */
export async function createLibp2pNode(
  boostrapAddrs: string[] = [],
  peerId?: PeerId,
  port?: number,
  enableGossipSub: boolean = false,
  start: boolean = true,
): Promise<Libp2p> {
  port = port ?? (await getPort());
  const options: Libp2pOptions = {
    start,
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${port}`],
      announce: [`/ip4/0.0.0.0/tcp/${port}`],
    },
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    transports: [tcp()],
    services: {
      identify: identify({
        protocolPrefix: 'aztec',
      }),
    },
  };

  if (boostrapAddrs.length > 0) {
    options.peerDiscovery = [
      bootstrap({
        list: boostrapAddrs,
      }),
    ];
  }

  if (peerId) {
    options.peerId = peerId;
  }

  if (enableGossipSub) {
    options.services!.pubsub = gossipsub({
      allowPublishToZeroTopicPeers: true,
    });
  }

  return await createLibp2p(options);
}

/**
 * Test Libp2p service
 * P2P functionality is operational, however everything else is default
 *
 *
 */
export async function createTestLibP2PService<T extends P2PClientType>(
  clientType: T,
  boostrapAddrs: string[] = [],
  l2BlockSource: L2BlockSource,
  worldStateSynchronizer: WorldStateSynchronizer,
  epochCache: EpochCache,
  mempools: MemPools<T>,
  telemetry: TelemetryClient,
  port: number = 0,
  peerId?: PeerId,
  chainConfig: ChainConfig = emptyChainConfig,
) {
  peerId = peerId ?? (await createSecp256k1PeerId());
  const config = {
    tcpAnnounceAddress: `127.0.0.1:${port}`,
    udpAnnounceAddress: `127.0.0.1:${port}`,
    tcpListenAddress: `0.0.0.0:${port}`,
    udpListenAddress: `0.0.0.0:${port}`,
    bootstrapNodes: boostrapAddrs,
    peerCheckIntervalMS: 1000,
    maxPeerCount: 5,
    p2pEnabled: true,
    peerIdPrivateKey: Buffer.from(peerId.privateKey!).toString('hex'),
    bootstrapNodeEnrVersionCheck: false,
    ...chainConfig,
  } as P2PConfig & DataStoreConfig;
  const discoveryService = new DiscV5Service(peerId, config, telemetry);
  const proofVerifier = new AlwaysTrueCircuitVerifier();

  // No bootstrap nodes provided as the libp2p service will register them in the constructor
  const p2pNode = await createLibp2pNode([], peerId, port, /*enable gossip */ true, /**start */ false);

  return new LibP2PService<T>(
    clientType,
    config,
    p2pNode as PubSubLibp2p,
    discoveryService,
    mempools,
    l2BlockSource,
    epochCache,
    proofVerifier,
    worldStateSynchronizer,
    telemetry,
  );
}

/**
 * A p2p / req resp node pairing the req node will always contain the p2p node.
 * they are provided as a pair to allow access the p2p node directly
 */
export type ReqRespNode = {
  p2p: Libp2p;
  req: ReqResp;
};

// Mock sub protocol handlers
export const MOCK_SUB_PROTOCOL_HANDLERS: ReqRespSubProtocolHandlers = {
  [ReqRespSubProtocol.PING]: pingHandler,
  [ReqRespSubProtocol.STATUS]: statusHandler,
  [ReqRespSubProtocol.TX]: (_msg: any) => Promise.resolve(Buffer.from('tx')),
  [ReqRespSubProtocol.GOODBYE]: (_msg: any) => Promise.resolve(Buffer.from('goodbye')),
  [ReqRespSubProtocol.BLOCK]: (_msg: any) => Promise.resolve(Buffer.from('block')),
};

// By default, all requests are valid
// If you want to test an invalid response, you can override the validator
export const MOCK_SUB_PROTOCOL_VALIDATORS: ReqRespSubProtocolValidators = {
  [ReqRespSubProtocol.PING]: noopValidator,
  [ReqRespSubProtocol.STATUS]: noopValidator,
  [ReqRespSubProtocol.TX]: noopValidator,
  [ReqRespSubProtocol.GOODBYE]: noopValidator,
  [ReqRespSubProtocol.BLOCK]: noopValidator,
};

/**
 * @param numberOfNodes - the number of nodes to create
 * @returns An array of the created nodes
 */
export const createNodes = (peerScoring: PeerScoring, numberOfNodes: number): Promise<ReqRespNode[]> => {
  return timesParallel(numberOfNodes, () => createReqResp(peerScoring));
};

export const startNodes = async (
  nodes: ReqRespNode[],
  subProtocolHandlers = MOCK_SUB_PROTOCOL_HANDLERS,
  subProtocolValidators = MOCK_SUB_PROTOCOL_VALIDATORS,
) => {
  for (const node of nodes) {
    await node.req.start(subProtocolHandlers, subProtocolValidators);
  }
};

export const stopNodes = async (nodes: ReqRespNode[]): Promise<void> => {
  const stopPromises = nodes.flatMap(node => [node.req.stop(), node.p2p.stop()]);
  await Promise.all(stopPromises);
};

// Create a req resp node, exposing the underlying p2p node
export const createReqResp = async (peerScoring: PeerScoring): Promise<ReqRespNode> => {
  const p2p = await createLibp2pNode();
  const config: P2PReqRespConfig = {
    overallRequestTimeoutMs: 4000,
    individualRequestTimeoutMs: 2000,
  };
  const req = new ReqResp(config, p2p, peerScoring);
  return {
    p2p,
    req,
  };
};

// Given a node list; hand shake all of the nodes with each other
export const connectToPeers = async (nodes: ReqRespNode[]): Promise<void> => {
  for (const node of nodes) {
    for (const otherNode of nodes) {
      if (node === otherNode) {
        continue;
      }
      const addr = otherNode.p2p.getMultiaddrs()[0];
      await node.p2p.dial(addr);
    }
  }
};

// Mock circuit verifier for testing - reimplementation from bb to avoid dependency
export class AlwaysTrueCircuitVerifier implements ClientProtocolCircuitVerifier {
  verifyProof(_tx: Tx): Promise<boolean> {
    return Promise.resolve(true);
  }
}
export class AlwaysFalseCircuitVerifier implements ClientProtocolCircuitVerifier {
  verifyProof(_tx: Tx): Promise<boolean> {
    return Promise.resolve(false);
  }
}

// Bootnodes
export function createBootstrapNodeConfig(privateKey: string, port: number, chainConfig: ChainConfig): BootnodeConfig {
  return {
    l1ChainId: chainConfig.l1ChainId,
    udpListenAddress: `0.0.0.0:${port}`,
    udpAnnounceAddress: `127.0.0.1:${port}`,
    peerIdPrivateKey: privateKey,
    dataDirectory: undefined,
    dataStoreMapSizeKB: 0,
    bootstrapNodes: [],
  };
}

export function createBootstrapNodeFromPrivateKey(
  privateKey: string,
  port: number,
  telemetry: TelemetryClient = getTelemetryClient(),
  chainConfig: ChainConfig = emptyChainConfig,
): Promise<BootstrapNode> {
  const config = createBootstrapNodeConfig(privateKey, port, chainConfig);
  return startBootstrapNode(config, telemetry);
}

/**
 * Create a bootstrap node ENR
 * @param privateKey - the private key of the bootstrap node
 * @param port - the port of the bootstrap node
 * @returns the bootstrap node ENR
 */
export async function getBootstrapNodeEnr(privateKey: string, port: number) {
  const peerId = await createLibP2PPeerIdFromPrivateKey(privateKey);
  const enr = SignableENR.createFromPeerId(peerId);
  const listenAddrUdp = multiaddr(convertToMultiaddr(`127.0.0.1:${port}`, 'udp'));
  enr.setLocationMultiaddr(listenAddrUdp);

  return enr;
}

export async function createBootstrapNode(
  port: number,
  telemetry: TelemetryClient = getTelemetryClient(),
  chainConfig: ChainConfig = emptyChainConfig,
): Promise<BootstrapNode> {
  const peerId = await createSecp256k1PeerId();
  const config = createBootstrapNodeConfig(Buffer.from(peerId.privateKey!).toString('hex'), port, chainConfig);

  return startBootstrapNode(config, telemetry);
}

async function startBootstrapNode(config: BootnodeConfig, telemetry: TelemetryClient) {
  // Open an ephemeral store that will only exist in memory
  const store = await openTmpStore('bootstrap-node', true);
  const bootstrapNode = new BootstrapNode(store, telemetry);
  await bootstrapNode.start(config);
  return bootstrapNode;
}
