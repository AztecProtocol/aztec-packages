import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { BlockMinFeesProvider } from '@aztec/stdlib/gas';
import type { ClientProtocolCircuitVerifier, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
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
import { DummyPeerDiscoveryService, DummyPeerManager, LibP2PService } from '../services/index.js';
import type { P2PReqRespConfig } from '../services/reqresp/config.js';
import type { ConnectionSampler } from '../services/reqresp/connection-sampler/connection_sampler.js';
import type {
  ReqRespInterface,
  ReqRespResponse,
  ReqRespSubProtocol,
  ReqRespSubProtocolHandler,
  ReqRespSubProtocolHandlers,
} from '../services/reqresp/interface.js';
import { ReqRespStatus } from '../services/reqresp/status.js';
import { GossipSubEvent } from '../types/index.js';
import type { PubSubLibp2p } from '../util.js';

type GossipSubService = PubSubLibp2p['services']['pubsub'];

/**
 * Given a mock gossip sub network, returns a factory function that creates an instance LibP2PService connected to it.
 * Designed to be used in tests in P2PClientDeps.p2pServiceFactory.
 */
export function getMockPubSubP2PServiceFactory(
  network: MockGossipSubNetwork,
): (...args: Parameters<(typeof LibP2PService)['new']>) => Promise<LibP2PService> {
  return (
    config: P2PConfig,
    peerId: PeerId,
    deps: {
      packageVersion: string;
      mempools: MemPools;
      l2BlockSource: L2BlockSource & ContractDataSource;
      epochCache: EpochCacheInterface;
      proofVerifier: ClientProtocolCircuitVerifier;
      worldStateSynchronizer: WorldStateSynchronizer;
      peerStore: AztecAsyncKVStore;
      blockMinFeesProvider: BlockMinFeesProvider;
      telemetry: TelemetryClient;
      logger: Logger;
    },
  ) => {
    deps.logger.verbose('Creating mock PubSub service');
    const libp2p = new MockPubSub(peerId, network);
    const peerManager = new DummyPeerManager(peerId, network);
    const reqresp: ReqRespInterface = new MockReqResp(peerId, network);
    const peerDiscoveryService = new DummyPeerDiscoveryService();
    const service = new LibP2PService(
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
      deps.blockMinFeesProvider,
      deps.telemetry,
      deps.logger,
    );

    return Promise.resolve(service);
  };
}

/**
 * Mock implementation of ReqRespInterface that routes requests to other peers' handlers through the mock network.
 * When a peer calls sendRequestToPeer, the mock looks up the target peer's registered handler for the
 * sub-protocol and invokes it, simulating the request-response protocol without actual libp2p streams.
 */
class MockReqResp implements ReqRespInterface {
  private handlers: Partial<ReqRespSubProtocolHandlers> = {};
  private logger = createLogger('p2p:test:mock-reqresp');

  constructor(
    private peerId: PeerId,
    private network: MockGossipSubNetwork,
  ) {
    network.registerReqRespPeer(this);
  }

  updateConfig(_config: Partial<P2PReqRespConfig>): void {}
  setShouldRejectPeer(): void {}

  start(subProtocolHandlers: Partial<ReqRespSubProtocolHandlers>): Promise<void> {
    Object.assign(this.handlers, subProtocolHandlers);
    return Promise.resolve();
  }

  addSubProtocol(subProtocol: ReqRespSubProtocol, handler: ReqRespSubProtocolHandler): Promise<void> {
    this.handlers[subProtocol] = handler;
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.handlers = {};
    return Promise.resolve();
  }

  getHandler(subProtocol: ReqRespSubProtocol): ReqRespSubProtocolHandler | undefined {
    return this.handlers[subProtocol];
  }

  async sendRequestToPeer(
    peerId: PeerId,
    subProtocol: ReqRespSubProtocol,
    payload: Buffer,
    _dialTimeout?: number,
  ): Promise<ReqRespResponse> {
    const peer = this.network.getReqRespPeers().find(p => p.peerId.equals(peerId));
    const handler = peer?.getHandler(subProtocol);
    if (!handler) {
      return { status: ReqRespStatus.SUCCESS, data: Buffer.from([]) };
    }
    try {
      const delayMs = this.network.getPropagationDelayMs();
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      const data = await handler(this.peerId, payload);

      return { status: ReqRespStatus.SUCCESS, data };
    } catch {
      return { status: ReqRespStatus.FAILURE };
    }
  }

  getConnectionSampler(): Pick<ConnectionSampler, 'getPeerListSortedByConnectionCountAsc'> {
    return {
      getPeerListSortedByConnectionCountAsc: () =>
        this.network
          .getReqRespPeers()
          .filter(p => !p.peerId.equals(this.peerId))
          .map(p => p.peerId),
    };
  }
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
      components: {
        addressManager: {
          addObservedAddr: () => {},
          confirmObservedAddr: () => {},
          removeObservedAddr: () => {},
        },
      },
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
  public readonly direct = new Set<string>();

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

  async publish(topic: TopicStr, data: Uint8Array, _opts?: PublishOpts): Promise<PublishResult> {
    this.logger.debug(`Publishing message on topic ${topic}`, { topic, sender: this.peerId.toString() });
    await this.network.publishToPeers(topic, data, this.peerId);
    return { recipients: this.network.getPeers().filter(peer => !this.peerId.equals(peer)) };
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

  getMeshPeers(topic?: TopicStr): PeerIdStr[] {
    if (topic && !this.subscribedTopics.has(topic)) {
      return [];
    }
    return this.network
      .getPeers()
      .filter(peer => !this.peerId.equals(peer))
      .map(peer => peer.toString());
  }
}

/**
 * Mock gossip sub network used for testing.
 * All instances of MockGossipSubService connected to the same network receive the same messages,
 * optionally delayed by a configurable propagation time.
 */
export class MockGossipSubNetwork {
  private peers: MockGossipSubService[] = [];
  private reqRespPeers: MockReqResp[] = [];
  private nextMsgId = 0;

  private logger = createLogger('p2p:test:mock-gossipsub-network');

  constructor(
    /** Artificial propagation delay in milliseconds applied to each message delivery. */
    private propagationDelayMs: number = 0,
  ) {}

  public getPropagationDelayMs(): number {
    return this.propagationDelayMs;
  }

  public getPeers(): PeerId[] {
    return this.peers.map(peer => peer.peerId);
  }

  public registerPeer(peer: MockGossipSubService): void {
    this.peers.push(peer);
  }

  public registerReqRespPeer(peer: MockReqResp): void {
    this.reqRespPeers.push(peer);
  }

  public getReqRespPeers(): MockReqResp[] {
    return this.reqRespPeers;
  }

  public async publishToPeers(topic: TopicStr, data: Uint8Array, sender: PeerId): Promise<void> {
    const msgId = (this.nextMsgId++).toString();
    this.logger.debug(`Network is distributing message on topic ${topic}`, {
      topic,
      size: data.length,
      sender: sender.toString(),
      msgId,
    });

    if (this.propagationDelayMs > 0) {
      await sleep(this.propagationDelayMs);
    }

    const gossipSubMsg: GossipsubMessage = { msgId, msg: { type: 'unsigned', topic, data }, propagationSource: sender };
    for (const peer of this.peers) {
      if (peer.subscribedTopics.has(topic)) {
        peer.receive(gossipSubMsg);
      }
    }
  }
}
