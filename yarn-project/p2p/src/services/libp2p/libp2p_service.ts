import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { merge } from '@aztec/foundation/collection';
import { type Logger, createLibp2pComponentLogger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { Timer } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { EthAddress } from '@aztec/stdlib/block';
import type { PeerInfo, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import {
  BlockProposal,
  CheckpointAttestation,
  CheckpointProposal,
  type Gossipable,
  P2PMessage,
  PeerErrorSeverity,
  TopicType,
  createTopicString,
  getTopicsForConfig,
  metricsTopicStrToLabels,
} from '@aztec/stdlib/p2p';
import { Tx } from '@aztec/stdlib/tx';
import { compressComponentVersions } from '@aztec/stdlib/versioning';
import {
  Attributes,
  OtelMetricsAdapter,
  SpanStatusCode,
  type TelemetryClient,
  WithTracer,
} from '@aztec/telemetry-client';

import {
  type GossipSub,
  type GossipSubComponents,
  type GossipsubMessage,
  gossipsub,
} from '@chainsafe/libp2p-gossipsub';
import { createPeerScoreParams } from '@chainsafe/libp2p-gossipsub/score';
import { SignaturePolicy } from '@chainsafe/libp2p-gossipsub/types';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { identify } from '@libp2p/identify';
import { type Message, type MultiaddrConnection, type PeerId, TopicValidatorResult } from '@libp2p/interface';
import type { AddressManager, ConnectionManager } from '@libp2p/interface-internal';
import { mplex } from '@libp2p/mplex';
import { tcp } from '@libp2p/tcp';
import { multiaddr } from '@multiformats/multiaddr';
import { ENR } from '@nethermindeth/enr';
import { createLibp2p } from 'libp2p';

import type { P2PConfig } from '../../config.js';
import { MessageSeenValidator } from '../../msg_validators/msg_seen_validator/msg_seen_validator.js';
import { GossipSubEvent } from '../../types/index.js';
import { type PubSubLibp2p, convertToMultiaddr } from '../../util.js';
import { getVersions } from '../../versioning.js';
import { AztecDatastore } from '../data_store.js';
import { DiscV5Service } from '../discv5/discV5_service.js';
import { SnappyTransform, fastMsgIdFn, getMsgIdFn, msgIdToStrFn } from '../encoding.js';
import { APP_SPECIFIC_WEIGHT, gossipScoreThresholds } from '../gossipsub/scoring.js';
import { createAllTopicScoreParams } from '../gossipsub/topic_score_params.js';
import type { PeerManagerInterface } from '../peer-manager/interface.js';
import { PeerManager } from '../peer-manager/peer_manager.js';
import { PeerScoring } from '../peer-manager/peer_scoring.js';
import type { BatchTxRequesterLibP2PService } from '../reqresp/batch-tx-requester/interface.js';
import type { P2PReqRespConfig } from '../reqresp/config.js';
import {
  AuthRequest,
  type ReqRespInterface,
  type ReqRespResponse,
  ReqRespSubProtocol,
  type ReqRespSubProtocolHandler,
  type ReqRespSubProtocolHandlers,
  StatusMessage,
  pingHandler,
  reqGoodbyeHandler,
} from '../reqresp/index.js';
import { ReqResp } from '../reqresp/reqresp.js';
import type { P2PService, PeerDiscoveryService } from '../service.js';
import { P2PInstrumentation } from './instrumentation.js';
import { P2PMessageProcessor, type ReceivedMessageValidationResult } from './p2p_message_processor.js';

/**
 * Lib P2P implementation of the P2PService interface.
 */
export class LibP2PService extends WithTracer implements P2PService {
  private discoveryRunningPromise?: RunningPromise;
  private msgIdSeenValidators: Record<TopicType, MessageSeenValidator> = {} as Record<TopicType, MessageSeenValidator>;

  private protocolVersion = '';
  private topicStrings: Record<TopicType, string> = {} as Record<TopicType, string>;

  private gossipSubEventHandler: (e: CustomEvent<GossipsubMessage>) => void;

  private ipChangedHandler?: (ip: string) => void;
  private discoveredP2pIp?: string;

  private instrumentation: P2PInstrumentation;

  private telemetry: TelemetryClient;

  protected logger: Logger;

  /** Handles the content of received messages: validation against node state, persistence, and consensus callbacks. */
  protected processor: P2PMessageProcessor;

  constructor(
    private config: P2PConfig,
    protected node: PubSubLibp2p,
    private peerDiscoveryService: PeerDiscoveryService,
    private reqresp: ReqRespInterface,
    protected peerManager: PeerManagerInterface,
    processor: P2PMessageProcessor,
    telemetry: TelemetryClient,
    logger: Logger = createLogger('p2p:libp2p_service'),
  ) {
    super(telemetry, 'LibP2PService');
    this.telemetry = telemetry;

    // Create child logger with fisherman prefix if in fisherman mode
    this.logger = config.fishermanMode ? logger.createChild('[FISHERMAN]') : logger;

    this.instrumentation = new P2PInstrumentation(telemetry, 'LibP2PService');

    this.msgIdSeenValidators[TopicType.tx] = new MessageSeenValidator(config.seenMessageCacheSize);
    this.msgIdSeenValidators[TopicType.block_proposal] = new MessageSeenValidator(config.seenMessageCacheSize);
    this.msgIdSeenValidators[TopicType.checkpoint_proposal] = new MessageSeenValidator(config.seenMessageCacheSize);
    this.msgIdSeenValidators[TopicType.checkpoint_attestation] = new MessageSeenValidator(config.seenMessageCacheSize);

    const versions = getVersions(config);
    this.protocolVersion = compressComponentVersions(versions);
    logger.info(`Started libp2p service with protocol version ${this.protocolVersion}`);

    this.topicStrings[TopicType.tx] = createTopicString(TopicType.tx, this.protocolVersion);
    this.topicStrings[TopicType.block_proposal] = createTopicString(TopicType.block_proposal, this.protocolVersion);
    this.topicStrings[TopicType.checkpoint_proposal] = createTopicString(
      TopicType.checkpoint_proposal,
      this.protocolVersion,
    );
    this.topicStrings[TopicType.checkpoint_attestation] = createTopicString(
      TopicType.checkpoint_attestation,
      this.protocolVersion,
    );

    this.gossipSubEventHandler = this.handleGossipSubEvent.bind(this);

    this.processor = processor;
    this.processor.setNetwork(this);
  }

  public updateConfig(config: Partial<P2PReqRespConfig & Pick<P2PConfig, 'skipIncomingProposals'>>) {
    this.reqresp.updateConfig(config);
    this.config = merge(this.config, config);
  }

  /**
   * Creates an instance of the LibP2P service.
   * @param config - The configuration to use when creating the service.
   * @param txPool - The transaction pool to be accessed by the service.
   * @returns The new service.
   */
  public static async new(
    config: P2PConfig,
    peerId: PeerId,
    deps: {
      processor: P2PMessageProcessor;
      epochCache: EpochCacheInterface;
      worldStateSynchronizer: WorldStateSynchronizer;
      peerStore: AztecAsyncKVStore;
      telemetry: TelemetryClient;
      logger: Logger;
      packageVersion: string;
    },
  ) {
    const { processor, worldStateSynchronizer, epochCache, peerStore, telemetry, logger, packageVersion } = deps;
    const { p2pPort, maxPeerCount, listenAddress } = config;
    const bindAddrTcp = convertToMultiaddr(listenAddress, p2pPort, 'tcp');

    const datastore = new AztecDatastore(peerStore);

    const otelMetricsAdapter = new OtelMetricsAdapter(telemetry, logger.getBindings());

    const peerDiscoveryService = new DiscV5Service(
      peerId,
      config,
      packageVersion,
      telemetry,
      createLogger(`${logger.module}:discv5_service`, logger.getBindings()),
    );

    // Seed libp2p's bootstrap discovery with private and trusted peers
    const bootstrapNodes = [...config.privatePeers, ...config.trustedPeers];

    const peerDiscovery = [];
    if (bootstrapNodes.length > 0) {
      peerDiscovery.push(bootstrap({ list: bootstrapNodes }));
    }

    const versions = getVersions(config);
    const protocolVersion = compressComponentVersions(versions);

    const preferredPeersEnrs: ENR[] = config.preferredPeers.map(enr => ENR.decodeTxt(enr));
    const directPeers = (
      await Promise.all(
        preferredPeersEnrs.map(async enr => {
          const peerId = await enr.peerId();
          const address = enr.getLocationMultiaddr('tcp');
          if (address === undefined) {
            throw new Error(`Direct peer ${peerId.toString()} has no TCP address, ENR: ${enr.encodeTxt()}`);
          }
          return {
            id: peerId,
            addrs: [address],
          };
        }),
      )
    ).filter(peer => peer !== undefined);

    const announceTcpMultiaddr = config.p2pIp ? [convertToMultiaddr(config.p2pIp, p2pPort, 'tcp')] : [];

    // Create dynamic topic score params based on network configuration
    const l1Constants = epochCache.getL1Constants();
    const topicScoreParams = createAllTopicScoreParams(protocolVersion, {
      slotDurationMs: l1Constants.slotDuration * 1000,
      ethereumSlotDuration: l1Constants.ethereumSlotDuration,
      heartbeatIntervalMs: config.gossipsubInterval,
      targetCommitteeSize: l1Constants.targetCommitteeSize,
      blockDurationMs: config.blockDurationMs,
      l1PublishingTime: config.l1PublishingTime,
      p2pPropagationTime: config.attestationPropagationTime,
      expectedBlockProposalsPerSlot: config.expectedBlockProposalsPerSlot,
    });

    const node = await createLibp2p({
      start: false,
      peerId,
      addresses: {
        listen: [bindAddrTcp],
        announce: announceTcpMultiaddr,
      },
      transports: [
        tcp({
          // It's better to have this number a bit higher than our maxPeerCount because it's sets the limit on transport (TCP) layer
          // The connection attempts to the node on TCP layer are not necessarily valid Aztec peers so we want to have a bit of leeway here
          // If we hit the limit, the connection will be temporarily accepted and immediately dropped.
          // Docs: https://nodejs.org/api/net.html#servermaxconnections
          maxConnections: maxPeerCount * 2,
          // socket option: the maximum length of the queue of pending connections
          // https://nodejs.org/dist/latest-v22.x/docs/api/net.html#serverlisten
          // it's not safe if we increase this number
          backlog: 5,
          closeServerOnMaxConnections: {
            // The property `maxConnections` will protect us against the most DDOS attack
            // This property protects us in case of burst of new connections where server is not able to close them quickly enough
            // In case closeAbove is reached, the server stops listening altogether
            // It's important that there is enough difference between closeAbove and listenAbove,
            // otherwise the server.listener will flap between being closed and open potentially degrading perf even more
            closeAbove: maxPeerCount * 3,
            listenBelow: Math.floor(maxPeerCount * 0.9),
          },
        }),
      ],
      datastore,
      peerDiscovery,
      streamMuxers: [yamux(), mplex()],
      connectionEncryption: [noise()],
      connectionManager: {
        minConnections: 0, // Disable libp2p peer dialing, we do it manually
        // We set maxConnections above maxPeerCount because if we hit limit of maxPeerCount
        // libp2p will start aggressively rejecting all new connections, preventing network discovery and crawling.
        maxConnections: maxPeerCount * 2,
        maxParallelDials: 100,
        dialTimeout: 30_000,
        maxPeerAddrsToDial: 5,
        maxIncomingPendingConnections: 5,
      },
      connectionGater: {
        denyInboundConnection: (maConn: MultiaddrConnection) => {
          const allowed = peerManager.isNodeAllowedToConnect(maConn.remoteAddr.nodeAddress().address);
          if (allowed) {
            return false;
          }

          logger.debug(`Connection gater: Denying inbound connection from ${maConn.remoteAddr.toString()}`);
          return true;
        },
        denyInboundEncryptedConnection: (peerId: PeerId, _maConn: MultiaddrConnection) => {
          //NOTE: it is not necessary to check address here because this was already done by
          // denyInboundConnection
          const allowed = peerManager.isNodeAllowedToConnect(peerId);
          if (allowed) {
            return false;
          }

          logger.debug(`Connection gater: Denying inbound encrypted connection from ${peerId.toString()}`);
          return true;
        },
      },
      services: {
        identify: identify({
          protocolPrefix: 'aztec',
          runOnConnectionOpen: true,
        }),
        pubsub: gossipsub({
          directPeers,
          debugName: 'gossipsub',
          globalSignaturePolicy: SignaturePolicy.StrictNoSign,
          allowPublishToZeroTopicPeers: true,
          floodPublish: config.gossipsubFloodPublish,
          D: config.gossipsubD,
          Dlo: config.gossipsubDlo,
          Dhi: config.gossipsubDhi,
          Dlazy: config.gossipsubDLazy,
          heartbeatInterval: config.gossipsubInterval,
          mcacheLength: config.gossipsubMcacheLength,
          mcacheGossip: config.gossipsubMcacheGossip,
          seenTTL: config.gossipsubSeenTTL,
          msgIdFn: getMsgIdFn,
          msgIdToStrFn: msgIdToStrFn,
          fastMsgIdFn: fastMsgIdFn,
          dataTransform: new SnappyTransform(),
          metricsRegister: otelMetricsAdapter,
          metricsTopicStrToLabel: metricsTopicStrToLabels(protocolVersion),
          asyncValidation: true,
          scoreThresholds: gossipScoreThresholds,
          scoreParams: createPeerScoreParams({
            // IPColocation factor can be disabled for local testing - default to -5
            IPColocationFactorWeight: config.debugDisableColocationPenalty ? 0 : -5.0,
            topics: topicScoreParams,
          }),
        }) as (components: GossipSubComponents) => GossipSub,
        components: (components: { connectionManager: ConnectionManager; addressManager: AddressManager }) => ({
          connectionManager: components.connectionManager,
          addressManager: components.addressManager,
        }),
      },
      logger: createLibp2pComponentLogger(logger.module, logger.getBindings()),
    });

    const peerScoring = new PeerScoring(config, telemetry);
    const reqresp = new ReqResp(config, node, peerScoring, createLogger(`${logger.module}:reqresp`));

    const peerManager = new PeerManager(
      node,
      peerDiscoveryService,
      config,
      telemetry,
      createLogger(`${logger.module}:peer_manager`),
      peerScoring,
      reqresp,
      worldStateSynchronizer,
      protocolVersion,
      epochCache,
    );

    // Gate req/resp data protocols for unauthenticated peers when p2pAllowOnlyValidators is enabled
    reqresp.setShouldRejectPeer(peerId => peerManager.shouldDisableP2PGossip(peerId));

    // Configure application-specific scoring for gossipsub.
    // The weight scales app score to align with gossipsub thresholds:
    // - Disconnect (-50) × 10 = -500 = gossipThreshold (stops receiving gossip)
    // - Ban (-100) × 10 = -1000 = publishThreshold (cannot publish)
    // Note: positive topic scores can offset penalties, so alignment is best-effort.
    node.services.pubsub.score.params.appSpecificWeight = APP_SPECIFIC_WEIGHT;
    node.services.pubsub.score.params.appSpecificScore = (peerId: string) =>
      peerManager.shouldDisableP2PGossip(peerId) ? -Infinity : peerManager.getPeerScore(peerId);

    return new LibP2PService(config, node, peerDiscoveryService, reqresp, peerManager, processor, telemetry, logger);
  }

  /**
   * Starts the LibP2P service.
   * @returns An empty promise.
   */
  public async start() {
    // Check if service is already started
    if (this.node.status === 'started') {
      throw new Error('P2P service already started');
    }

    const { p2pIp, p2pPort } = this.config;
    if (!p2pIp && !this.config.queryForIp) {
      throw new Error('Announce address not provided and queryForIp is not enabled.');
    }
    const announceTcpMultiaddr = p2pIp ? convertToMultiaddr(p2pIp, p2pPort, 'tcp') : undefined;

    // Create request response protocol handlers. Handlers that serve data from node state (status, tx,
    // block txs) come from the message processor; lifecycle handlers (ping, goodbye) live here.
    const goodbyeHandler = reqGoodbyeHandler(this.peerManager);

    const requestResponseHandlers: Partial<ReqRespSubProtocolHandlers> = {
      [ReqRespSubProtocol.PING]: pingHandler,
      [ReqRespSubProtocol.GOODBYE]: goodbyeHandler.bind(this),
      ...this.processor.createReqRespDataHandlers(this.protocolVersion),
    };

    await this.peerManager.initializePeers();

    await this.reqresp.start(requestResponseHandlers);

    await this.node.start();

    // Subscribe to standard GossipSub topics by default
    for (const topic of getTopicsForConfig(this.config.disableTransactions)) {
      this.subscribeToTopic(this.topicStrings[topic]);
    }

    // add GossipSub listener
    this.node.services.pubsub.addEventListener(GossipSubEvent.MESSAGE, this.gossipSubEventHandler);

    // Start running promise for peer discovery and metrics collection
    if (!this.config.p2pDiscoveryDisabled) {
      await this.peerDiscoveryService.start();
    }

    // Bridge discv5 IP changes to libp2p's AddressManager so peers see the updated address
    if (this.config.queryForIp) {
      this.discoveredP2pIp = this.config.p2pIp;
      this.logger.info('IP change tracking enabled, bridging discv5 IP updates to libp2p AddressManager');
      this.ipChangedHandler = (ip: string) => {
        const addressManager = this.node.services.components.addressManager;
        const newAddr = multiaddr(convertToMultiaddr(ip, this.config.p2pPort, 'tcp'));
        const previousIp = this.discoveredP2pIp;

        if (previousIp) {
          const oldAddr = multiaddr(convertToMultiaddr(previousIp, this.config.p2pPort, 'tcp'));
          addressManager.removeObservedAddr(oldAddr);
          this.logger.info('Libp2p announce address updated due to IP change', {
            previousIp,
            newIp: ip,
            newMultiaddr: newAddr.toString(),
          });
        } else {
          this.logger.info('Libp2p announce address set from initial discv5 IP discovery', {
            ip,
            multiaddr: newAddr.toString(),
          });
        }

        addressManager.addObservedAddr(newAddr);
        addressManager.confirmObservedAddr(newAddr);
        this.discoveredP2pIp = ip;
      };
      this.peerDiscoveryService.on('ip:changed', this.ipChangedHandler);
    }

    this.discoveryRunningPromise = new RunningPromise(
      async () => {
        await this.peerManager.heartbeat();
      },
      this.logger,
      this.config.peerCheckIntervalMS,
    );
    this.discoveryRunningPromise.start();

    this.logger.info(`Started P2P service`, {
      listen: this.config.listenAddress,
      port: this.config.p2pPort,
      announce: announceTcpMultiaddr,
      peerId: this.node.peerId.toString(),
    });
  }

  /**
   * Stops the LibP2P service.
   * @returns An empty promise.
   */
  public async stop() {
    // Remove gossip sub listener
    this.node.services.pubsub.removeEventListener(GossipSubEvent.MESSAGE, this.gossipSubEventHandler);

    if (this.ipChangedHandler) {
      this.peerDiscoveryService.removeListener('ip:changed', this.ipChangedHandler);
      this.ipChangedHandler = undefined;
    }

    // Stop peer manager
    this.logger.debug('Stopping peer manager...');
    await this.peerManager.stop();
    this.logger.debug('Stopping running promise...');
    await this.discoveryRunningPromise?.stop();
    this.logger.debug('Stopping peer discovery service...');
    await this.peerDiscoveryService.stop();
    this.logger.debug('Request response service stopped...');
    await this.reqresp.stop();
    this.logger.debug('Stopping LibP2P...');
    await this.stopLibP2P();
    this.logger.info('LibP2P service stopped');
  }

  addReqRespSubProtocol(subProtocol: ReqRespSubProtocol, handler: ReqRespSubProtocolHandler): Promise<void> {
    return this.reqresp.addSubProtocol(subProtocol, handler);
  }

  public registerThisValidatorAddresses(address: EthAddress[]): void {
    this.peerManager.registerThisValidatorAddresses(address);
  }

  public getPeers(includePending?: boolean): PeerInfo[] {
    return this.peerManager.getPeers(includePending);
  }

  public getGossipMeshPeerCount(topicType: TopicType): number {
    return this.node.services.pubsub.getMeshPeers(this.topicStrings[topicType]).length;
  }

  private handleGossipSubEvent(e: CustomEvent<GossipsubMessage>) {
    this.logger.trace(`Received PUBSUB message.`);

    const safeJob = async () => {
      try {
        await this.handleNewGossipMessage(e.detail.msg, e.detail.msgId, e.detail.propagationSource);
      } catch (err) {
        this.logger.error(`Error handling gossipsub message: ${err}`);
      }
    };
    setImmediate(() => void safeJob());
  }

  public sendRequestToPeer(
    peerId: PeerId,
    subProtocol: ReqRespSubProtocol,
    payload: Buffer,
    dialTimeout?: number,
  ): Promise<ReqRespResponse> {
    return this.reqresp.sendRequestToPeer(peerId, subProtocol, payload, dialTimeout);
  }

  /**
   * Get the ENR of the node
   * @returns The ENR of the node
   */
  public getEnr(): ENR | undefined {
    return this.peerDiscoveryService.getEnr();
  }

  /**
   * Subscribes to a topic.
   * @param topic - The topic to subscribe to.
   */
  private subscribeToTopic(topic: string) {
    if (!this.node.services.pubsub) {
      throw new Error('Pubsub service not available.');
    }
    void this.node.services.pubsub.subscribe(topic);
  }

  /**
   * Publishes data to a topic.
   * @param topic - The topic to publish to.
   * @param data - The message to publish.
   * @returns The number of recipients the data was sent to.
   */
  private async publishToTopic(topic: string, message: Gossipable) {
    if (!this.node.services.pubsub) {
      throw new Error('Pubsub service not available.');
    }
    const isBlockProposal = topic === this.topicStrings[TopicType.block_proposal];
    const traceContext =
      this.config.debugP2PInstrumentMessages && isBlockProposal ? this.telemetry.getTraceContext() : undefined;
    const p2pMessage = P2PMessage.fromGossipable(message, this.config.debugP2PInstrumentMessages, traceContext);
    const result = await this.node.services.pubsub.publish(topic, p2pMessage.toMessageData());
    return result.recipients.length;
  }

  /**
   * Checks if this message has already been seen, based on its msgId computed from hashing the message data.
   * Note that we do not rely on the seenCache from gossipsub since we want to keep a longer history of seen
   * messages to avoid tx echoes across the network.
   */
  protected preValidateReceivedMessage(
    msg: Message,
    msgId: string,
    source: PeerId,
  ): { result: boolean; topicType?: TopicType } {
    let topicType: TopicType | undefined;

    switch (msg.topic) {
      case this.topicStrings[TopicType.tx]:
        topicType = TopicType.tx;
        break;
      case this.topicStrings[TopicType.block_proposal]:
        topicType = TopicType.block_proposal;
        break;
      case this.topicStrings[TopicType.checkpoint_proposal]:
        topicType = TopicType.checkpoint_proposal;
        break;
      case this.topicStrings[TopicType.checkpoint_attestation]:
        topicType = TopicType.checkpoint_attestation;
        break;
      default:
        this.logger.error(`Received message on unknown topic: ${msg.topic}`);
        break;
    }

    const validator = topicType ? this.msgIdSeenValidators[topicType] : undefined;

    if (!validator || !validator.addMessage(msgId)) {
      this.instrumentation.incMessagePrevalidationStatus(false, topicType);
      this.node.services.pubsub.reportMessageValidationResult(msgId, source.toString(), TopicValidatorResult.Ignore);
      if (topicType === TopicType.tx) {
        this.logger.verbose(`Ignoring already-seen tx gossip message`, { msgId, source: source.toString() });
      }
      return { result: false, topicType };
    }

    this.instrumentation.incMessagePrevalidationStatus(true, topicType);

    return { result: true, topicType };
  }

  /**
   * Safely deserializes a P2PMessage from raw message data.
   * @param msgId - The message ID.
   * @param source - The peer ID of the message source.
   * @param data - The raw message data.
   * @returns The deserialized P2PMessage or undefined if deserialization fails.
   */
  private safelyDeserializeP2PMessage(msgId: string, source: PeerId, data: Uint8Array): P2PMessage | undefined {
    try {
      return P2PMessage.fromMessageData(Buffer.from(data), this.config.debugP2PInstrumentMessages);
    } catch (err) {
      this.logger.error(`Error deserializing P2PMessage`, err, {
        msgId,
        source: source.toString(),
      });
      this.node.services.pubsub.reportMessageValidationResult(msgId, source.toString(), TopicValidatorResult.Reject);
      this.peerManager.penalizePeer(source, PeerErrorSeverity.LowToleranceError);
      return undefined;
    }
  }

  /**
   * Handles a new gossip message that was received by the client.
   * @param topic - The message's topic.
   * @param data - The message data
   */
  protected async handleNewGossipMessage(msg: Message, msgId: string, source: PeerId) {
    const msgReceivedTime = Date.now();
    let topicType: TopicType | undefined;
    const p2pMessage = this.safelyDeserializeP2PMessage(msgId, source, msg.data);
    if (!p2pMessage) {
      return;
    }

    const preValidationResult = this.preValidateReceivedMessage(msg, msgId, source);

    if (!preValidationResult.result) {
      return;
    }

    // Determine topic type for attributes
    if (msg.topic === this.topicStrings[TopicType.tx]) {
      topicType = TopicType.tx;
    } else if (msg.topic === this.topicStrings[TopicType.checkpoint_attestation]) {
      topicType = TopicType.checkpoint_attestation;
    } else if (msg.topic === this.topicStrings[TopicType.block_proposal]) {
      topicType = TopicType.block_proposal;
    } else if (msg.topic === this.topicStrings[TopicType.checkpoint_proposal]) {
      topicType = TopicType.checkpoint_proposal;
    }

    // Process the message, optionally within a linked span for trace propagation
    const processMessage = async () => {
      if (
        this.config.skipIncomingProposals &&
        (msg.topic === this.topicStrings[TopicType.block_proposal] ||
          msg.topic === this.topicStrings[TopicType.checkpoint_proposal])
      ) {
        this.logger.warn(`Ignoring incoming proposal (skipIncomingProposals is set)`, { topic: msg.topic });
        this.node.services.pubsub.reportMessageValidationResult(msgId, source.toString(), TopicValidatorResult.Ignore);
        return;
      }
      if (msg.topic === this.topicStrings[TopicType.tx]) {
        await this.handleGossipedTx(p2pMessage.payload, msgId, source);
      } else if (msg.topic === this.topicStrings[TopicType.checkpoint_attestation]) {
        await this.processCheckpointAttestationFromPeer(p2pMessage.payload, msgId, source);
      } else if (msg.topic === this.topicStrings[TopicType.block_proposal]) {
        await this.processBlockFromPeer(p2pMessage.payload, msgId, source);
      } else if (msg.topic === this.topicStrings[TopicType.checkpoint_proposal]) {
        await this.handleGossipedCheckpointProposal(p2pMessage.payload, msgId, source);
      } else {
        this.logger.error(`Received message on unknown topic: ${msg.topic}`);
      }
    };

    const latency = p2pMessage.timestamp !== undefined ? msgReceivedTime - p2pMessage.timestamp.getTime() : undefined;
    const propagatedContext = p2pMessage.traceContext
      ? this.telemetry.extractPropagatedContext(p2pMessage.traceContext)
      : undefined;

    if (propagatedContext) {
      await this.tracer.startActiveSpan(
        'LibP2PService.processMessage',
        {
          attributes: {
            [Attributes.TOPIC_NAME]: topicType!,
            [Attributes.PEER_ID]: source.toString(),
          },
        },
        propagatedContext,
        async span => {
          try {
            await processMessage();
            span.setStatus({
              code: SpanStatusCode.OK,
            });
          } catch (err) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: String(err),
            });
            if (typeof err === 'string' || (err && err instanceof Error)) {
              span.recordException(err);
            }
            throw err;
          } finally {
            span.end();
          }
        },
      );
    } else {
      await processMessage();
    }

    if (latency !== undefined && topicType !== undefined) {
      this.instrumentation.recordMessageLatency(topicType, latency);
    }

    return;
  }

  protected async validateReceivedMessage<T, M = undefined>(
    validationFunc: () => Promise<ReceivedMessageValidationResult<T, M>>,
    msgId: string,
    source: PeerId,
    topicType: TopicType,
  ): Promise<ReceivedMessageValidationResult<T, M>> {
    // Default to reject result with a penalty if validation function throws an error
    let resultAndObj: ReceivedMessageValidationResult<T, M> = {
      result: TopicValidatorResult.Reject,
      severity: PeerErrorSeverity.MidToleranceError,
    };
    const timer = new Timer();
    try {
      resultAndObj = await validationFunc();
    } catch (err) {
      this.logger.error(`Error validating gossipsub message`, err, { msgId, source: source.toString(), topicType });
    }

    const validationTimeMs = timer.ms();
    const mcacheWindowMs = this.config.gossipsubMcacheLength * this.config.gossipsubInterval;
    if (validationTimeMs > mcacheWindowMs * 0.75) {
      this.instrumentation.incSlowValidation(topicType);
      this.logger.warn(
        `Gossip validation for ${topicType} took ${validationTimeMs}ms, approaching mcache eviction window of ${mcacheWindowMs}ms. ` +
          `Message forwarding may be skipped if validation exceeds the window.`,
        { msgId, source: source.toString(), topicType, validationTimeMs, mcacheWindowMs },
      );
    }

    if (resultAndObj.result === TopicValidatorResult.Accept) {
      this.logger.debug(`Message ${topicType} accepted by validator`, { msgId, source: source.toString(), topicType });
      this.instrumentation.recordMessageValidation(topicType, timer);
    } else if (resultAndObj.result === TopicValidatorResult.Reject) {
      this.logger.warn(`Message ${topicType} rejected by validator with severity ${resultAndObj.severity}`, {
        msgId,
        source: source.toString(),
        topicType,
        severity: resultAndObj.severity,
      });
      this.peerManager.penalizePeer(source, resultAndObj.severity);
    } else {
      this.logger.trace(`Message ${topicType} ignored by validator`, { msgId, source: source.toString(), topicType });
    }

    this.node.services.pubsub.reportMessageValidationResult(msgId, source.toString(), resultAndObj.result);
    return resultAndObj;
  }

  private tryDeserialize<T>(deserializeFunc: () => T, msgId: string, source: PeerId): T | undefined {
    try {
      return deserializeFunc();
    } catch (err) {
      this.logger.warn(`Failed to deserialize gossipsub message from buffer`, {
        err,
        msgId,
        source: source.toString(),
      });
      return undefined;
    }
  }

  protected async handleGossipedTx(payloadData: Buffer, msgId: string, source: PeerId) {
    const validationFunc: () => Promise<ReceivedMessageValidationResult<Tx>> = () => {
      const tx = this.tryDeserialize(() => Tx.fromBuffer(payloadData), msgId, source);
      if (!tx) {
        return Promise.resolve({ result: TopicValidatorResult.Reject, severity: PeerErrorSeverity.LowToleranceError });
      }
      return this.processor.validateAndStoreTx(tx, source);
    };

    const { result, obj: tx } = await this.validateReceivedMessage<Tx>(validationFunc, msgId, source, TopicType.tx);
    if (result !== TopicValidatorResult.Accept || !tx) {
      return;
    }

    // Tx was accepted into pool and will be propagated - just log and record metrics
    const txHash = tx.getTxHash();
    const txHashString = txHash.toString();
    this.logger.verbose(`Received tx ${txHashString} from external peer ${source.toString()} via gossip`, {
      source: source.toString(),
      txHash: txHashString,
    });

    this.instrumentation.incrementTxReceived(1);
  }

  /**
   * Process a checkpoint attestation from a peer.
   * Validates the attestation and adds it to the pool.
   */
  private async processCheckpointAttestationFromPeer(
    payloadData: Buffer,
    msgId: string,
    source: PeerId,
  ): Promise<void> {
    const { result, obj: attestation } = await this.validateReceivedMessage<CheckpointAttestation>(
      () => {
        const attestation = this.tryDeserialize(() => CheckpointAttestation.fromBuffer(payloadData), msgId, source);
        if (!attestation) {
          return Promise.resolve({
            result: TopicValidatorResult.Reject,
            severity: PeerErrorSeverity.LowToleranceError,
          });
        }
        return this.processor.validateAndStoreCheckpointAttestation(source, attestation);
      },
      msgId,
      source,
      TopicType.checkpoint_attestation,
    );

    if (result !== TopicValidatorResult.Accept || !attestation) {
      return;
    }

    this.logger.verbose(
      `Received valid checkpoint attestation for slot ${attestation.slotNumber} from external peer ${source.toString()}`,
      {
        p2pMessageIdentifier: await attestation.p2pMessageLoggingIdentifier(),
        slot: attestation.slotNumber,
        archive: attestation.archive.toString(),
        source: source.toString(),
      },
    );
  }

  protected async processBlockFromPeer(payloadData: Buffer, msgId: string, source: PeerId): Promise<void> {
    const {
      result,
      obj: block,
      metadata: { isEquivocated } = {},
    } = await this.validateReceivedMessage<BlockProposal, { isEquivocated: boolean }>(
      () => this.processor.validateAndStoreBlockProposal(source, BlockProposal.fromBuffer(payloadData)),
      msgId,
      source,
      TopicType.block_proposal,
    );

    // If not accepted or equivocated, return
    if (result !== TopicValidatorResult.Accept || !block || isEquivocated) {
      return;
    }

    await this.processor.processValidBlockProposal(block, source);
  }

  /**
   * Handle a gossiped checkpoint proposal.
   * Validates and processes the checkpoint proposal, then triggers the callback for attestation.
   */
  protected async handleGossipedCheckpointProposal(payloadData: Buffer, msgId: string, source: PeerId): Promise<void> {
    const {
      result,
      obj: checkpoint,
      metadata: { isEquivocated, processBlock } = {},
    } = await this.validateReceivedMessage<CheckpointProposal, { isEquivocated: boolean; processBlock: boolean }>(
      () => this.processor.validateAndStoreCheckpointProposal(source, CheckpointProposal.fromBuffer(payloadData)),
      msgId,
      source,
      TopicType.checkpoint_proposal,
    );

    // Process checkpoint proposal if valid and not equivocated.
    const processCheckpointFn = () =>
      result === TopicValidatorResult.Accept && checkpoint && !isEquivocated
        ? this.processor.processValidCheckpointProposal(checkpoint.toCore(), source)
        : Promise.resolve();

    // If the checkpoint contained a valid last block, we process it even if the checkpoint itself is to be rejected
    // TODO(palla/mbps): Is this ok? Should we be considering a block from a checkpoint that was equivocated?
    const processBlockFn = () =>
      processBlock && checkpoint && checkpoint.getBlockProposal()
        ? this.processor.processValidBlockProposal(checkpoint.getBlockProposal()!, source)
        : Promise.resolve();

    // A node that skips checkpoint validation attests without re-executing the embedded last block, so run
    // the checkpoint callback first: this creates and broadcasts the attestation before the block is
    // processed. Otherwise the block's re-execution — which can stall until the re-execution deadline
    // waiting for a parent that may never arrive — would delay the attestation past the slot's attestation
    // window, after which peers reject it as stale.
    if (this.config.skipCheckpointProposalValidation) {
      await processCheckpointFn();
      await processBlockFn();
      return;
    }

    // Process the block first, since it's required for the checkpoint proposal validation.
    await processBlockFn();
    await processCheckpointFn();
  }

  /**
   * Propagates provided message to peers.
   * @param message - The message to propagate.
   */
  public async propagate<T extends Gossipable>(message: T) {
    const p2pMessageIdentifier = await message.p2pMessageLoggingIdentifier();
    this.logger.trace(`Message ${p2pMessageIdentifier} queued`, { p2pMessageIdentifier });
    void this.sendToPeers(message).catch(error => {
      this.logger.error(`Error propagating message ${p2pMessageIdentifier}`, { error });
    });
  }

  /**
   * Get the BatchTxRequesterLibP2PService dependencies for creating BatchTxRequester instances
   */
  public getBatchTxRequesterService(): BatchTxRequesterLibP2PService {
    return {
      reqResp: this.reqresp,
      connectionSampler: this.reqresp.getConnectionSampler(),
      txValidatorConfig: this.processor.getBatchTxValidatorConfig(),
      peerScoring: this.peerManager,
      validateRequestedBlockTxsConsistency: this.processor.validateRequestedBlockTxsConsistency.bind(this.processor),
    };
  }

  public validateTxsReceivedInBlockProposal(txs: Tx[]): Promise<void> {
    return this.processor.validateTxsReceivedInBlockProposal(txs);
  }

  /** Applies a peer-scoring penalty. Exposed for the message processor to penalize peers during validation. */
  public penalizePeer(peerId: PeerId, severity: PeerErrorSeverity): void {
    this.peerManager.penalizePeer(peerId, severity);
  }

  public getPeerScore(peerId: PeerId): number {
    return this.node.services.pubsub.score.score(peerId.toString());
  }

  public handleAuthRequestFromPeer(authRequest: AuthRequest, peerId: PeerId): Promise<StatusMessage> {
    return this.peerManager.handleAuthRequestFromPeer(authRequest, peerId);
  }

  private async sendToPeers<T extends Gossipable>(message: T) {
    const parent = message.constructor as typeof Gossipable;

    const identifier = await message.p2pMessageLoggingIdentifier().then(i => i.toString());
    this.logger.trace(`Sending message ${identifier}`, { p2pMessageIdentifier: identifier });

    const recipientsNum = await this.publishToTopic(this.topicStrings[parent.p2pTopic], message);
    this.logger.debug(`Sent message ${identifier} to ${recipientsNum} peers`, {
      p2pMessageIdentifier: identifier,
      sourcePeer: this.node.peerId.toString(),
    });
  }

  // Libp2p seems to hang sometimes if new peers are initiating connections.
  private async stopLibP2P() {
    const TIMEOUT_MS = 5000; // 5 seconds timeout
    const timeout = new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error('Timeout during libp2p.stop()')), TIMEOUT_MS);
    });
    try {
      await Promise.race([this.node.stop(), timeout]);
      this.logger.debug('LibP2P stopped');
    } catch (error) {
      this.logger.error('Error during stop or timeout:', error);
    }
  }
}
