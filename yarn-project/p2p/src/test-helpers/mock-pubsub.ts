import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { ClientProtocolCircuitVerifier, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { P2PClientType } from '@aztec/stdlib/p2p';
import type { TelemetryClient } from '@aztec/telemetry-client';

import type { GossipsubEvents, GossipsubMessage } from '@chainsafe/libp2p-gossipsub';
import type { MsgIdStr, PeerIdStr, PublishOpts, TopicStr } from '@chainsafe/libp2p-gossipsub/types';
import {
  type Libp2pStatus,
  type PeerId,
  type PublishResult,
  type TopicValidatorResult,
  TypedEventEmitter,
} from '@libp2p/interface';

import type { P2PConfig } from '../config.js';
import type { MemPools } from '../mem_pools/interface.js';
import { DummyPeerDiscoveryService, DummyPeerManager, DummyReqResp, LibP2PService } from '../services/index.js';
import type { ReqRespInterface } from '../services/reqresp/interface.js';
import { GossipSubEvent } from '../types/index.js';
import type { PubSubLibp2p } from '../util.js';

type GossipSubService = PubSubLibp2p['services']['pubsub'];

/**
 * Given a mock gossip sub network, returns a factory function that creates an instance LibP2PService connected to it.
 * Designed to be used in tests in P2PClientDeps.p2pServiceFactory.
 */
export function getMockPubSubP2PServiceFactory<T extends P2PClientType>(
  network: MockGossipSubNetwork,
): (...args: Parameters<(typeof LibP2PService<T>)['new']>) => Promise<LibP2PService<T>> {
  return (
    clientType: P2PClientType,
    config: P2PConfig,
    peerId: PeerId,
    deps: {
      packageVersion: string;
      mempools: MemPools<T>;
      l2BlockSource: L2BlockSource & ContractDataSource;
      epochCache: EpochCacheInterface;
      proofVerifier: ClientProtocolCircuitVerifier;
      worldStateSynchronizer: WorldStateSynchronizer;
      peerStore: AztecAsyncKVStore;
      telemetry: TelemetryClient;
      logger: Logger;
    },
  ) => {
    deps.logger.verbose('Creating mock PubSub service');
    const libp2p = new MockPubSub(peerId, network);
    const peerManager = new DummyPeerManager(peerId, network);
    const reqresp: ReqRespInterface = new DummyReqResp();
    const peerDiscoveryService = new DummyPeerDiscoveryService();
    const service = new LibP2PService<T>(
      clientType as T,
      config,
      libp2p,
      peerDiscoveryService,
      reqresp,
      peerManager,
      deps.mempools,
      deps.l2BlockSource,
      deps.epochCache,
      deps.proofVerifier,
      deps.worldStateSynchronizer,
      deps.telemetry,
      deps.logger,
    );

    return Promise.resolve(service);
  };
}

/**
 * Implementation of PubSub services that relies on a mock gossip sub network.
 * This is used in tests to simulate a gossip sub network without needing a real P2P network.
 * All messages are sent to the mock network which then distributes them to subscribed peers.
 */
export class MockPubSub implements PubSubLibp2p {
  public status: Libp2pStatus = 'stopped';

  private gossipSub: GossipSubService;

  constructor(
    public peerId: PeerId,
    network: MockGossipSubNetwork,
  ) {
    this.gossipSub = new MockGossipSubService(peerId, network);
  }

  get services() {
    return {
      pubsub: this.gossipSub,
    };
  }

  start(): void | Promise<void> {
    this.status = 'started';
    return Promise.resolve();
  }
  stop(): void | Promise<void> {
    this.status = 'stopped';
    return Promise.resolve();
  }
}

class MockGossipSubService extends TypedEventEmitter<GossipsubEvents> implements GossipSubService {
  private logger = createLogger('p2p:test:mock-gossipsub');
  public subscribedTopics: Set<TopicStr> = new Set();

  constructor(
    public peerId: PeerId,
    private network: MockGossipSubNetwork,
  ) {
    super();
    network.registerPeer(this);
  }

  score = {
    score: (_peerId: PeerIdStr) => 0,
  };

  publish(topic: TopicStr, data: Uint8Array, _opts?: PublishOpts): Promise<PublishResult> {
    this.logger.debug(`Publishing message on topic ${topic}`, { topic, sender: this.peerId.toString() });
    this.network.publishToPeers(topic, data, this.peerId);
    return Promise.resolve({ recipients: this.network.getPeers().filter(peer => !this.peerId.equals(peer)) });
  }

  receive(msg: GossipsubMessage) {
    if (msg.propagationSource.equals(this.peerId)) {
      return; // Ignore messages from self
    }
    this.logger.debug(`Received message on topic ${msg.msg.topic}`, { ...msg });
    this.safeDispatchEvent<GossipsubMessage>(GossipSubEvent.MESSAGE, { detail: msg });
  }

  subscribe(topic: TopicStr): void {
    this.logger.debug(`Subscribed to topic ${topic}`, { topic });
    this.subscribedTopics.add(topic);
  }

  reportMessageValidationResult(msgId: MsgIdStr, propagationSource: PeerIdStr, acceptance: TopicValidatorResult): void {
    this.logger.debug(
      `Reported message validation result ${acceptance} for msgId ${msgId} from source ${propagationSource}`,
      { msgId, propagationSource, acceptance },
    );
  }
}

/**
 * Mock gossip sub network used for testing.
 * All instances of MockGossipSubService connected to the same network will instantly receive the same messages.
 */
export class MockGossipSubNetwork {
  private peers: MockGossipSubService[] = [];
  private nextMsgId = 0;

  private logger = createLogger('p2p:test:mock-gossipsub-network');

  public getPeers(): PeerId[] {
    return this.peers.map(peer => peer.peerId);
  }

  public registerPeer(peer: MockGossipSubService): void {
    this.peers.push(peer);
  }

  public publishToPeers(topic: TopicStr, data: Uint8Array, sender: PeerId): void {
    const msgId = (this.nextMsgId++).toString();
    this.logger.debug(`Network is distributing message on topic ${topic}`, {
      topic,
      size: data.length,
      sender: sender.toString(),
      msgId,
    });

    const gossipSubMsg: GossipsubMessage = { msgId, msg: { type: 'unsigned', topic, data }, propagationSource: sender };
    for (const peer of this.peers) {
      if (peer.subscribedTopics.has(topic)) {
        peer.receive(gossipSubMsg);
      }
    }
  }
}
