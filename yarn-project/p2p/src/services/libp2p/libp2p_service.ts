import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { type Logger, createLibp2pComponentLogger, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { Timer } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import type { ClientProtocolCircuitVerifier, PeerInfo, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import {
  BlockAttestation,
  BlockProposal,
  type Gossipable,
  P2PClientType,
  P2PMessage,
  PeerErrorSeverity,
  TopicType,
  createTopicString,
  getTopicTypeForClientType,
  metricsTopicStrToLabels,
} from '@aztec/stdlib/p2p';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { Tx, type TxHash, type TxValidationResult } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';
import { compressComponentVersions } from '@aztec/stdlib/versioning';
import { Attributes, OtelMetricsAdapter, type TelemetryClient, WithTracer, trackSpan } from '@aztec/telemetry-client';

import { ENR } from '@chainsafe/enr';
import {
  type GossipSub,
  type GossipSubComponents,
  type GossipsubMessage,
  gossipsub,
} from '@chainsafe/libp2p-gossipsub';
import { createPeerScoreParams, createTopicScoreParams } from '@chainsafe/libp2p-gossipsub/score';
import { SignaturePolicy } from '@chainsafe/libp2p-gossipsub/types';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { identify } from '@libp2p/identify';
import { type Message, type PeerId, TopicValidatorResult } from '@libp2p/interface';
import type { ConnectionManager } from '@libp2p/interface-internal';
import '@libp2p/kad-dht';
import { mplex } from '@libp2p/mplex';
import { tcp } from '@libp2p/tcp';
import { createLibp2p } from 'libp2p';

import type { P2PConfig } from '../../config.js';
import type { MemPools } from '../../mem_pools/interface.js';
import { AttestationValidator, BlockProposalValidator } from '../../msg_validators/index.js';
import { MessageSeenValidator } from '../../msg_validators/msg_seen_validator/msg_seen_validator.js';
import { getDefaultAllowedSetupFunctions } from '../../msg_validators/tx_validator/allowed_public_setup.js';
import { type MessageValidator, createTxMessageValidators } from '../../msg_validators/tx_validator/factory.js';
import { DoubleSpendTxValidator, TxProofValidator } from '../../msg_validators/tx_validator/index.js';
import { GossipSubEvent } from '../../types/index.js';
import { type PubSubLibp2p, convertToMultiaddr } from '../../util.js';
import { getVersions } from '../../versioning.js';
import { AztecDatastore } from '../data_store.js';
import { DiscV5Service } from '../discv5/discV5_service.js';
import { SnappyTransform, fastMsgIdFn, getMsgIdFn, msgIdToStrFn } from '../encoding.js';
import { gossipScoreThresholds } from '../gossipsub/scoring.js';
import type { PeerManagerInterface } from '../peer-manager/interface.js';
import { PeerManager } from '../peer-manager/peer_manager.js';
import { PeerScoring } from '../peer-manager/peer_scoring.js';
import {
  DEFAULT_SUB_PROTOCOL_VALIDATORS,
  type ReqRespInterface,
  ReqRespSubProtocol,
  type ReqRespSubProtocolHandler,
  type ReqRespSubProtocolValidators,
  type SubProtocolMap,
  ValidationError,
} from '../reqresp/interface.js';
import { reqGoodbyeHandler } from '../reqresp/protocols/goodbye.js';
import {
  AuthRequest,
  StatusMessage,
  pingHandler,
  reqRespBlockHandler,
  reqRespStatusHandler,
  reqRespTxHandler,
} from '../reqresp/protocols/index.js';
import { ReqResp } from '../reqresp/reqresp.js';
import type { P2PBlockReceivedCallback, P2PService, PeerDiscoveryService } from '../service.js';
import { P2PInstrumentation } from './instrumentation.js';

interface ValidationResult {
  name: string;
  isValid: TxValidationResult;
  severity: PeerErrorSeverity;
}

type ValidationOutcome = { allPassed: true } | { allPassed: false; failure: ValidationResult };

/**
 * Lib P2P implementation of the P2PService interface.
 */
export class LibP2PService<T extends P2PClientType = P2PClientType.Full> extends WithTracer implements P2PService {
  private jobQueue: SerialQueue = new SerialQueue();
  private discoveryRunningPromise?: RunningPromise;
  private msgIdSeenValidators: Record<TopicType, MessageSeenValidator> = {} as Record<TopicType, MessageSeenValidator>;

  // Message validators
  private attestationValidator: AttestationValidator;
  private blockProposalValidator: BlockProposalValidator;

  private protocolVersion = '';
  private topicStrings: Record<TopicType, string> = {} as Record<TopicType, string>;

  private feesCache: { blockNumber: number; gasFees: GasFees } | undefined;

  /**
   * Callback for when a block is received from a peer.
   * @param block - The block received from the peer.
   * @returns The attestation for the block, if any.
   */
  private blockReceivedCallback: P2PBlockReceivedCallback;

  private gossipSubEventHandler: (e: CustomEvent<GossipsubMessage>) => void;

  private instrumentation: P2PInstrumentation;

  constructor(
    private clientType: T,
    private config: P2PConfig,
    protected node: PubSubLibp2p,
    private peerDiscoveryService: PeerDiscoveryService,
    private reqresp: ReqRespInterface,
    private peerManager: PeerManagerInterface,
    protected mempools: MemPools<T>,
    private archiver: L2BlockSource & ContractDataSource,
    private epochCache: EpochCacheInterface,
    private proofVerifier: ClientProtocolCircuitVerifier,
    private worldStateSynchronizer: WorldStateSynchronizer,
    telemetry: TelemetryClient,
    protected logger = createLogger('p2p:libp2p_service'),
  ) {
    super(telemetry, 'LibP2PService');

    this.instrumentation = new P2PInstrumentation(telemetry, 'LibP2PService');

    this.msgIdSeenValidators[TopicType.tx] = new MessageSeenValidator(config.seenMessageCacheSize);
    this.msgIdSeenValidators[TopicType.block_proposal] = new MessageSeenValidator(config.seenMessageCacheSize);
    this.msgIdSeenValidators[TopicType.block_attestation] = new MessageSeenValidator(config.seenMessageCacheSize);

    const versions = getVersions(config);
    this.protocolVersion = compressComponentVersions(versions);
    logger.info(`Started libp2p service with protocol version ${this.protocolVersion}`);

    this.topicStrings[TopicType.tx] = createTopicString(TopicType.tx, this.protocolVersion);
    this.topicStrings[TopicType.block_proposal] = createTopicString(TopicType.block_proposal, this.protocolVersion);
    this.topicStrings[TopicType.block_attestation] = createTopicString(
      TopicType.block_attestation,
      this.protocolVersion,
    );

    this.attestationValidator = new AttestationValidator(epochCache);
    this.blockProposalValidator = new BlockProposalValidator(epochCache);

    this.gossipSubEventHandler = this.handleGossipSubEvent.bind(this);

    this.blockReceivedCallback = async (block: BlockProposal): Promise<BlockAttestation[] | undefined> => {
      this.logger.debug(
        `Handler not yet registered: Block received callback not set. Received block for slot ${block.slotNumber.toNumber()} from peer.`,
        { p2pMessageIdentifier: await block.p2pMessageIdentifier() },
      );
      return undefined;
    };
  }

  /**
   * Creates an instance of the LibP2P service.
   * @param config - The configuration to use when creating the service.
   * @param txPool - The transaction pool to be accessed by the service.
   * @returns The new service.
   */
  public static async new<T extends P2PClientType>(
    clientType: T,
    config: P2PConfig,
    peerId: PeerId,
    deps: {
      mempools: MemPools<T>;
      l2BlockSource: L2BlockSource & ContractDataSource;
      epochCache: EpochCacheInterface;
      proofVerifier: ClientProtocolCircuitVerifier;
      worldStateSynchronizer: WorldStateSynchronizer;
      peerStore: AztecAsyncKVStore;
      telemetry: TelemetryClient;
      logger: Logger;
      packageVersion: string;
    },
  ) {
    const {
      worldStateSynchronizer,
      epochCache,
      l2BlockSource,
      mempools,
      proofVerifier,
      peerStore,
      telemetry,
      logger,
      packageVersion,
    } = deps;
    const { p2pPort, maxPeerCount, listenAddress } = config;
    const bindAddrTcp = convertToMultiaddr(listenAddress, p2pPort, 'tcp');

    const datastore = new AztecDatastore(peerStore);

    const otelMetricsAdapter = new OtelMetricsAdapter(telemetry);

    const peerDiscoveryService = new DiscV5Service(
      peerId,
      config,
      packageVersion,
      telemetry,
      createLogger(`${logger.module}:discv5_service`),
    );

    const bootstrapNodes = peerDiscoveryService.bootstrapNodeEnrs.map(enr => enr.encodeTxt());

    // If trusted peers are provided, also provide them to the p2p service
    bootstrapNodes.push(...config.trustedPeers);

    // If bootstrap nodes are provided, also provide them to the p2p service
    const peerDiscovery = [];
    if (bootstrapNodes.length > 0) {
      peerDiscovery.push(bootstrap({ list: bootstrapNodes }));
    }

    const versions = getVersions(config);
    const protocolVersion = compressComponentVersions(versions);

    const txTopic = createTopicString(TopicType.tx, protocolVersion);
    const blockProposalTopic = createTopicString(TopicType.block_proposal, protocolVersion);
    const blockAttestationTopic = createTopicString(TopicType.block_attestation, protocolVersion);

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

    if (directPeers.length > 0) {
      logger.info(`Setting up direct peer connections to: ${directPeers.map(peer => peer.id.toString()).join(', ')}`);
    }

    const node = await createLibp2p({
      start: false,
      peerId,
      addresses: {
        listen: [bindAddrTcp],
        announce: [], // announce is handled by the peer discovery service
      },
      transports: [
        tcp({
          maxConnections: config.maxPeerCount,
          // socket option: the maximum length of the queue of pending connections
          // https://nodejs.org/dist/latest-v22.x/docs/api/net.html#serverlisten
          // it's not safe if we increase this number
          backlog: 5,
          closeServerOnMaxConnections: {
            closeAbove: maxPeerCount ?? Infinity,
            listenBelow: maxPeerCount ?? Infinity,
          },
        }),
      ],
      datastore,
      peerDiscovery,
      streamMuxers: [yamux(), mplex()],
      connectionEncryption: [noise()],
      connectionManager: {
        minConnections: 0,
        maxParallelDials: 100,
        dialTimeout: 30_000,
        maxPeerAddrsToDial: 5,
        maxIncomingPendingConnections: 5,
      },
      services: {
        identify: identify({
          protocolPrefix: 'aztec',
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
            topics: {
              [txTopic]: createTopicScoreParams({
                topicWeight: 1,
                invalidMessageDeliveriesWeight: -20,
                invalidMessageDeliveriesDecay: 0.5,
              }),
              [blockAttestationTopic]: createTopicScoreParams({
                topicWeight: 1,
                invalidMessageDeliveriesWeight: -20,
                invalidMessageDeliveriesDecay: 0.5,
              }),
              [blockProposalTopic]: createTopicScoreParams({
                topicWeight: 1,
                invalidMessageDeliveriesWeight: -20,
                invalidMessageDeliveriesDecay: 0.5,
              }),
            },
          }),
        }) as (components: GossipSubComponents) => GossipSub,
        components: (components: { connectionManager: ConnectionManager }) => ({
          connectionManager: components.connectionManager,
        }),
      },
      logger: createLibp2pComponentLogger(logger.module),
    });

    const peerScoring = new PeerScoring(config);
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

    // Update gossipsub score params
    node.services.pubsub.score.params.appSpecificWeight = 10;
    node.services.pubsub.score.params.appSpecificScore = (peerId: string) =>
      peerManager.shouldDisableP2PGossip(peerId) ? -Infinity : peerManager.getPeerScore(peerId);

    return new LibP2PService(
      clientType,
      config,
      node,
      peerDiscoveryService,
      reqresp,
      peerManager,
      mempools,
      l2BlockSource,
      epochCache,
      proofVerifier,
      worldStateSynchronizer,
      telemetry,
      logger,
    );
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

    // Get listen & announce addresses for logging
    const { p2pIp, p2pPort } = this.config;
    if (!p2pIp) {
      throw new Error('Announce address not provided.');
    }
    const announceTcpMultiaddr = convertToMultiaddr(p2pIp, p2pPort, 'tcp');

    // Start job queue, peer discovery service and libp2p node
    this.jobQueue.start();

    await this.peerManager.initializePeers();
    if (!this.config.p2pDiscoveryDisabled) {
      await this.peerDiscoveryService.start();
    }
    await this.node.start();

    // Subscribe to standard GossipSub topics by default
    for (const topic of getTopicTypeForClientType(this.clientType)) {
      this.subscribeToTopic(this.topicStrings[topic]);
    }

    // Create request response protocol handlers
    const txHandler = reqRespTxHandler(this.mempools);
    const goodbyeHandler = reqGoodbyeHandler(this.peerManager);
    const blockHandler = reqRespBlockHandler(this.archiver);
    const statusHandler = reqRespStatusHandler(this.protocolVersion, this.worldStateSynchronizer, this.logger);

    const requestResponseHandlers: Partial<Record<ReqRespSubProtocol, ReqRespSubProtocolHandler>> = {
      [ReqRespSubProtocol.PING]: pingHandler,
      [ReqRespSubProtocol.STATUS]: statusHandler.bind(this),
      [ReqRespSubProtocol.TX]: txHandler.bind(this),
      [ReqRespSubProtocol.GOODBYE]: goodbyeHandler.bind(this),
      [ReqRespSubProtocol.BLOCK]: blockHandler.bind(this),
    };

    // add GossipSub listener
    this.node.services.pubsub.addEventListener(GossipSubEvent.MESSAGE, this.gossipSubEventHandler);

    // Start running promise for peer discovery
    this.discoveryRunningPromise = new RunningPromise(
      () => this.peerManager.heartbeat(),
      this.logger,
      this.config.peerCheckIntervalMS,
    );
    this.discoveryRunningPromise.start();

    // Define the sub protocol validators - This is done within this start() method to gain a callback to the existing validateTx function
    const reqrespSubProtocolValidators = {
      ...DEFAULT_SUB_PROTOCOL_VALIDATORS,
      // TODO(#11336): A request validator for blocks
      [ReqRespSubProtocol.TX]: this.validateRequestedTx.bind(this),
    };
    await this.reqresp.start(requestResponseHandlers, reqrespSubProtocolValidators);
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

    // Stop peer manager
    this.logger.debug('Stopping peer manager...');
    await this.peerManager.stop();

    this.logger.debug('Stopping job queue...');
    await this.jobQueue.end();
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

  addReqRespSubProtocol(
    subProtocol: ReqRespSubProtocol,
    handler: ReqRespSubProtocolHandler,
    validator?: ReqRespSubProtocolValidators[ReqRespSubProtocol],
  ): Promise<void> {
    return this.reqresp.addSubProtocol(subProtocol, handler, validator);
  }

  public getPeers(includePending?: boolean): PeerInfo[] {
    return this.peerManager.getPeers(includePending);
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

  /**
   * Send a batch of requests to peers, and return the responses
   * @param protocol - The request response protocol to use
   * @param requests - The requests to send to the peers
   * @returns The responses to the requests
   */
  sendBatchRequest<SubProtocol extends ReqRespSubProtocol>(
    protocol: SubProtocol,
    requests: InstanceType<SubProtocolMap[SubProtocol]['request']>[],
    pinnedPeerId: PeerId | undefined,
  ): Promise<InstanceType<SubProtocolMap[SubProtocol]['response']>[]> {
    return this.reqresp.sendBatchRequest(protocol, requests, pinnedPeerId);
  }

  /**
   * Get the ENR of the node
   * @returns The ENR of the node
   */
  public getEnr(): ENR | undefined {
    return this.peerDiscoveryService.getEnr();
  }

  public registerBlockReceivedCallback(callback: P2PBlockReceivedCallback) {
    this.blockReceivedCallback = callback;
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
    const p2pMessage = await P2PMessage.fromGossipable(message);
    this.logger.debug(`Publishing message`, {
      topic,
      messageId: p2pMessage.id,
    });
    const result = await this.node.services.pubsub.publish(topic, p2pMessage.toMessageData());

    return result.recipients.length;
  }

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
      case this.topicStrings[TopicType.block_attestation]:
        topicType = TopicType.block_attestation;
        break;
      case this.topicStrings[TopicType.block_proposal]:
        topicType = TopicType.block_proposal;
        break;
      default:
        this.logger.error(`Received message on unknown topic: ${msg.topic}`);
        break;
    }

    const validator = topicType ? this.msgIdSeenValidators[topicType] : undefined;

    if (!validator || !validator.addMessage(msgId)) {
      this.instrumentation.incMessagePrevalidationStatus(false, topicType);
      this.node.services.pubsub.reportMessageValidationResult(msgId, source.toString(), TopicValidatorResult.Ignore);
      return { result: false, topicType };
    }

    this.instrumentation.incMessagePrevalidationStatus(true, topicType);

    return { result: true, topicType };
  }

  /**
   * Handles a new gossip message that was received by the client.
   * @param topic - The message's topic.
   * @param data - The message data
   */
  protected async handleNewGossipMessage(msg: Message, msgId: string, source: PeerId) {
    const p2pMessage = P2PMessage.fromMessageData(Buffer.from(msg.data));
    const currentTime = new Date();
    const messageLatency = currentTime.getTime() - p2pMessage.publishTime.getTime();
    this.logger.debug(`Received message`, {
      topic: msg.topic,
      messageId: p2pMessage.id,
      messageLatency,
    });

    const preValidationResult = this.preValidateReceivedMessage(msg, msgId, source);

    if (!preValidationResult.result) {
      return;
    } else if (preValidationResult.topicType !== undefined) {
      // guard against clock skew & DST
      if (messageLatency > 0) {
        this.instrumentation.recordMessageLatency(preValidationResult.topicType, messageLatency);
      }
    }

    if (msg.topic === this.topicStrings[TopicType.tx]) {
      await this.handleGossipedTx(p2pMessage.payload, msgId, source);
    }
    if (msg.topic === this.topicStrings[TopicType.block_attestation] && this.clientType === P2PClientType.Full) {
      await this.processAttestationFromPeer(p2pMessage.payload, msgId, source);
    }
    if (msg.topic === this.topicStrings[TopicType.block_proposal]) {
      await this.processBlockFromPeer(p2pMessage.payload, msgId, source);
    }

    return;
  }

  protected async validateReceivedMessage<T>(
    validationFunc: () => Promise<{ result: boolean; obj: T }>,
    msgId: string,
    source: PeerId,
    topicType: TopicType,
  ): Promise<{ result: boolean; obj: T | undefined }> {
    let resultAndObj: { result: boolean; obj: T | undefined } = { result: false, obj: undefined };
    const timer = new Timer();
    try {
      resultAndObj = await validationFunc();
    } catch (err) {
      this.logger.error(`Error deserialising and validating message `, err);
    }

    if (resultAndObj.result) {
      this.instrumentation.recordMessageValidation(topicType, timer);
    }

    this.node.services.pubsub.reportMessageValidationResult(
      msgId,
      source.toString(),
      resultAndObj.result && resultAndObj.obj ? TopicValidatorResult.Accept : TopicValidatorResult.Reject,
    );
    return resultAndObj;
  }

  protected async handleGossipedTx(payloadData: Buffer, msgId: string, source: PeerId) {
    const validationFunc = async () => {
      const tx = Tx.fromBuffer(payloadData);
      const result = await this.validatePropagatedTx(tx, source);
      return { result, obj: tx };
    };

    const { result, obj: tx } = await this.validateReceivedMessage<Tx>(validationFunc, msgId, source, TopicType.tx);
    if (!result || !tx) {
      return;
    }
    const txHash = await tx.getTxHash();
    const txHashString = txHash.toString();
    this.logger.verbose(`Received tx ${txHashString} from external peer ${source.toString()} via gossip`, {
      source: source.toString(),
      txHash: txHashString,
    });
    await this.mempools.txPool.addTxs([tx]);
  }

  /**
   * Process Attestation From Peer
   * When a proposal is received from a peer, we add it to the attestation pool, so it can be accessed by other services.
   *
   * @param attestation - The attestation to process.
   */
  private async processAttestationFromPeer(payloadData: Buffer, msgId: string, source: PeerId): Promise<void> {
    const validationFunc = async () => {
      const attestation = BlockAttestation.fromBuffer(payloadData);
      const result = await this.validateAttestation(source, attestation);
      this.logger.trace(`validatePropagatedAttestation: ${result}`, {
        [Attributes.SLOT_NUMBER]: attestation.payload.header.slotNumber.toString(),
        [Attributes.P2P_ID]: source.toString(),
      });
      return { result, obj: attestation };
    };

    const { result, obj: attestation } = await this.validateReceivedMessage<BlockAttestation>(
      validationFunc,
      msgId,
      source,
      TopicType.block_attestation,
    );
    if (!result || !attestation) {
      return;
    }
    this.logger.debug(
      `Received attestation for block ${attestation.blockNumber} slot ${attestation.slotNumber.toNumber()} from external peer ${source.toString()}`,
      {
        p2pMessageIdentifier: await attestation.p2pMessageIdentifier(),
        slot: attestation.slotNumber.toNumber(),
        archive: attestation.archive.toString(),
        block: attestation.blockNumber,
        source: source.toString(),
      },
    );
    await this.mempools.attestationPool!.addAttestations([attestation]);
  }

  private async processBlockFromPeer(payloadData: Buffer, msgId: string, source: PeerId): Promise<void> {
    const validationFunc = async () => {
      const block = BlockProposal.fromBuffer(payloadData);
      const result = await this.validateBlockProposal(source, block);
      this.logger.trace(`validatePropagatedBlock: ${result}`, {
        [Attributes.SLOT_NUMBER]: block.payload.header.slotNumber.toString(),
        [Attributes.P2P_ID]: source.toString(),
      });
      return { result, obj: block };
    };

    const { result, obj: block } = await this.validateReceivedMessage<BlockProposal>(
      validationFunc,
      msgId,
      source,
      TopicType.block_proposal,
    );
    if (!result || !block) {
      return;
    }

    await this.processValidBlockProposal(block, source);
  }

  // REVIEW: callback pattern https://github.com/AztecProtocol/aztec-packages/issues/7963
  @trackSpan('Libp2pService.processValidBlockProposal', async block => ({
    [Attributes.BLOCK_NUMBER]: block.blockNumber,
    [Attributes.SLOT_NUMBER]: block.slotNumber.toNumber(),
    [Attributes.BLOCK_ARCHIVE]: block.archive.toString(),
    [Attributes.P2P_ID]: await block.p2pMessageIdentifier().then(i => i.toString()),
  }))
  private async processValidBlockProposal(block: BlockProposal, sender: PeerId) {
    const slot = block.slotNumber.toBigInt();
    const previousSlot = slot - 1n;
    const epoch = slot / 32n;
    this.logger.verbose(
      `Received block ${block.blockNumber} for slot ${slot} epoch ${epoch} from external peer ${sender.toString()}.`,
      {
        p2pMessageIdentifier: await block.p2pMessageIdentifier(),
        slot: block.slotNumber.toNumber(),
        archive: block.archive.toString(),
        block: block.blockNumber,
        source: sender.toString(),
      },
    );
    const attestationsForPreviousSlot = await this.mempools.attestationPool?.getAttestationsForSlot(previousSlot);
    if (attestationsForPreviousSlot !== undefined) {
      this.logger.verbose(`Received ${attestationsForPreviousSlot.length} attestations for slot ${previousSlot}`);
    }

    // Mark the txs in this proposal as non-evictable
    await this.mempools.txPool.markTxsAsNonEvictable(block.txHashes);
    const attestations = await this.blockReceivedCallback(block, sender);

    // TODO: fix up this pattern - the abstraction is not nice
    // The attestation can be undefined if no handler is registered / the validator deems the block invalid
    if (attestations?.length) {
      for (const attestation of attestations) {
        this.logger.verbose(
          `Broadcasting attestation for block ${attestation.blockNumber} slot ${attestation.slotNumber.toNumber()}`,
          {
            p2pMessageIdentifier: await attestation.p2pMessageIdentifier(),
            slot: attestation.slotNumber.toNumber(),
            archive: attestation.archive.toString(),
            block: attestation.blockNumber,
          },
        );
        await this.broadcastAttestation(attestation);
      }
    }
  }

  /**
   * Broadcast an attestation to all peers.
   * @param attestation - The attestation to broadcast.
   */
  @trackSpan('Libp2pService.broadcastAttestation', async attestation => ({
    [Attributes.BLOCK_NUMBER]: attestation.blockNumber,
    [Attributes.SLOT_NUMBER]: attestation.payload.header.slotNumber.toNumber(),
    [Attributes.BLOCK_ARCHIVE]: attestation.archive.toString(),
    [Attributes.P2P_ID]: await attestation.p2pMessageIdentifier().then(i => i.toString()),
  }))
  private async broadcastAttestation(attestation: BlockAttestation) {
    await this.propagate(attestation);
  }

  /**
   * Propagates provided message to peers.
   * @param message - The message to propagate.
   */
  public async propagate<T extends Gossipable>(message: T) {
    const p2pMessageIdentifier = await message.p2pMessageIdentifier();
    this.logger.trace(`Message ${p2pMessageIdentifier} queued`, { p2pMessageIdentifier });
    void this.jobQueue
      .put(async () => {
        await this.sendToPeers(message);
      })
      .catch(error => {
        this.logger.error(`Error propagating message ${p2pMessageIdentifier}`, { error });
      });
  }

  /**
   * Validate a collection of txs that has been requested from a peer.
   *
   * The core component of this validator is that each tx hash MUST match the requested tx hash,
   * In order to perform this check, the tx proof must be verified.
   *
   * Note: This function is called from within `ReqResp.sendRequest` as part of the
   * ReqRespSubProtocol.TX subprotocol validation.
   *
   * @param requestedTxHash - The collection of the txs that was requested.
   * @param responseTx - The collectin of txs that was received as a response to the request.
   * @param peerId - The peer ID of the peer that sent the tx.
   * @returns True if the whole collection of txs is valid, false otherwise.
   */
  //TODO: (mralj) - this is somewhat naive implementation, if single tx is invlid we consider the whole response invalid.
  // I think we should still extract the valid txs and return them, so that we can still use the response.
  @trackSpan('Libp2pService.validateRequestedTx', (requestedTxHash, _responseTx) => ({
    [Attributes.TX_HASH]: requestedTxHash.toString(),
  }))
  private async validateRequestedTx(requestedTxHash: TxHash[], responseTx: Tx[], peerId: PeerId): Promise<boolean> {
    const requested = new Set(requestedTxHash.map(h => h.toString()));

    const proofValidator = new TxProofValidator(this.proofVerifier);

    try {
      await Promise.all(
        responseTx.map(async tx => {
          if (!requested.has((await tx.getTxHash()).toString())) {
            this.peerManager.penalizePeer(peerId, PeerErrorSeverity.MidToleranceError);
            throw new ValidationError(
              `Received tx with hash ${(await tx.getTxHash()).toString()} that was not requested.`,
            );
          }

          const { result } = await proofValidator.validateTx(tx);
          if (result === 'invalid') {
            this.peerManager.penalizePeer(peerId, PeerErrorSeverity.LowToleranceError);
            throw new ValidationError(`Received tx with hash ${(await tx.getTxHash()).toString()} that is invalid.`);
          }
        }),
      );
      return true;
    } catch (e: any) {
      if (e instanceof ValidationError) {
        this.logger.debug(`Failed to validate requested txs from peer ${peerId.toString()}, reason ${e.message}`);
      } else {
        this.logger.warn(`Error during validation of requested txs`, e);
      }

      return false;
    }
  }

  @trackSpan('Libp2pService.validatePropagatedTx', async tx => ({
    [Attributes.TX_HASH]: (await tx.getTxHash()).toString(),
  }))
  private async validatePropagatedTx(tx: Tx, peerId: PeerId): Promise<boolean> {
    const currentBlockNumber = await this.archiver.getBlockNumber();

    // We accept transactions if they are not expired by the next slot (checked based on the IncludeByTimestamp field)
    const { ts: nextSlotTimestamp } = this.epochCache.getEpochAndSlotInNextL1Slot();
    const messageValidators = await this.createMessageValidators(currentBlockNumber, nextSlotTimestamp);

    for (const validator of messageValidators) {
      const outcome = await this.runValidations(tx, validator);

      if (outcome.allPassed) {
        continue;
      }
      const { name } = outcome.failure;
      let { severity } = outcome.failure;

      // Double spend validator has a special case handler
      if (name === 'doubleSpendValidator') {
        const txBlockNumber = currentBlockNumber + 1; // tx is expected to be in the next block
        severity = await this.handleDoubleSpendFailure(tx, txBlockNumber);
      }

      this.peerManager.penalizePeer(peerId, severity);
      return false;
    }
    return true;
  }

  private async getGasFees(blockNumber: number): Promise<GasFees> {
    if (blockNumber === this.feesCache?.blockNumber) {
      return this.feesCache.gasFees;
    }

    const header = await this.archiver.getBlockHeader(blockNumber);
    const gasFees = header?.globalVariables.gasFees ?? GasFees.empty();
    this.feesCache = { blockNumber, gasFees };
    return gasFees;
  }

  public async validate(txs: Tx[]): Promise<void> {
    const currentBlockNumber = await this.archiver.getBlockNumber();

    // We accept transactions if they are not expired by the next slot (checked based on the IncludeByTimestamp field)
    const { ts: nextSlotTimestamp } = this.epochCache.getEpochAndSlotInNextL1Slot();
    const messageValidators = await this.createMessageValidators(currentBlockNumber, nextSlotTimestamp);

    await Promise.all(
      txs.map(async tx => {
        for (const validator of messageValidators) {
          const outcome = await this.runValidations(tx, validator);
          if (!outcome.allPassed) {
            throw new Error('Invalid tx detected', { cause: { outcome } });
          }
        }
      }),
    );
  }

  /**
   * Create message validators for the given block number and timestamp.
   *
   * Each validator is a pair of a validator and a severity.
   * If a validator fails, the peer is penalized with the severity of the validator.
   *
   * @param currentBlockNumber - The current synced block number.
   * @param nextSlotTimestamp - The timestamp of the next slot (used to validate txs are not expired).
   * @returns The message validators.
   */
  private async createMessageValidators(
    currentBlockNumber: number,
    nextSlotTimestamp: UInt64,
  ): Promise<Record<string, MessageValidator>[]> {
    const gasFees = await this.getGasFees(currentBlockNumber);
    const allowedInSetup = this.config.txPublicSetupAllowList ?? (await getDefaultAllowedSetupFunctions());

    const blockNumberInWhichTheTxIsConsideredToBeIncluded = currentBlockNumber + 1;

    return createTxMessageValidators(
      nextSlotTimestamp,
      blockNumberInWhichTheTxIsConsideredToBeIncluded,
      this.worldStateSynchronizer,
      gasFees,
      this.config.l1ChainId,
      this.config.rollupVersion,
      protocolContractTreeRoot,
      this.archiver,
      this.proofVerifier,
      allowedInSetup,
    );
  }

  /**
   * Run validations on a tx.
   * @param tx - The tx to validate.
   * @param messageValidators - The message validators to run.
   * @returns The validation outcome.
   */
  private async runValidations(
    tx: Tx,
    messageValidators: Record<string, MessageValidator>,
  ): Promise<ValidationOutcome> {
    const validationPromises = Object.entries(messageValidators).map(async ([name, { validator, severity }]) => {
      const { result } = await validator.validateTx(tx);
      return { name, isValid: result !== 'invalid', severity };
    });

    // A promise that resolves when all validations have been run
    const allValidations = await Promise.all(validationPromises);
    const failed = allValidations.find(x => !x.isValid);
    if (failed) {
      return {
        allPassed: false,
        failure: {
          isValid: { result: 'invalid' as const, reason: ['Failed validation'] },
          name: failed.name,
          severity: failed.severity,
        },
      };
    } else {
      return {
        allPassed: true,
      };
    }
  }

  /**
   * Handle a double spend failure.
   *
   * Double spend failures are managed on their own because they are a special case.
   * We must check if the double spend is recent or old, if it is past a threshold, then we heavily penalize the peer.
   *
   * @param tx - The tx that failed the double spend validator.
   * @param blockNumber - The block number of the tx.
   * @param peerId - The peer ID of the peer that sent the tx.
   * @returns Severity
   */
  private async handleDoubleSpendFailure(tx: Tx, blockNumber: number): Promise<PeerErrorSeverity> {
    if (blockNumber <= this.config.doubleSpendSeverePeerPenaltyWindow) {
      return PeerErrorSeverity.HighToleranceError;
    }

    const snapshotValidator = new DoubleSpendTxValidator({
      nullifiersExist: async (nullifiers: Buffer[]) => {
        const merkleTree = this.worldStateSynchronizer.getSnapshot(
          blockNumber - this.config.doubleSpendSeverePeerPenaltyWindow,
        );
        const indices = await merkleTree.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, nullifiers);
        return indices.map(index => index !== undefined);
      },
    });

    const validSnapshot = await snapshotValidator.validateTx(tx);
    if (validSnapshot.result !== 'valid') {
      return PeerErrorSeverity.LowToleranceError;
    }

    return PeerErrorSeverity.HighToleranceError;
  }

  /**
   * Validate an attestation.
   *
   * @param attestation - The attestation to validate.
   * @returns True if the attestation is valid, false otherwise.
   */
  @trackSpan('Libp2pService.validateAttestation', async (_, attestation) => ({
    [Attributes.BLOCK_NUMBER]: attestation.blockNumber,
    [Attributes.SLOT_NUMBER]: attestation.payload.header.slotNumber.toNumber(),
    [Attributes.BLOCK_ARCHIVE]: attestation.archive.toString(),
    [Attributes.P2P_ID]: await attestation.p2pMessageIdentifier().then(i => i.toString()),
  }))
  public async validateAttestation(peerId: PeerId, attestation: BlockAttestation): Promise<boolean> {
    const severity = await this.attestationValidator.validate(attestation);
    if (severity) {
      this.peerManager.penalizePeer(peerId, severity);
      return false;
    }

    return true;
  }

  /**
   * Validate a block proposal.
   *
   * @param block - The block proposal to validate.
   * @returns True if the block proposal is valid, false otherwise.
   */
  @trackSpan('Libp2pService.validateBlockProposal', (_peerId, block) => ({
    [Attributes.SLOT_NUMBER]: block.payload.header.slotNumber.toString(),
  }))
  public async validateBlockProposal(peerId: PeerId, block: BlockProposal): Promise<boolean> {
    const severity = await this.blockProposalValidator.validate(block);
    if (severity) {
      this.logger.debug(`Penalizing peer ${peerId} for block proposal validation failure`);
      this.peerManager.penalizePeer(peerId, severity);
      return false;
    }

    return true;
  }

  public getPeerScore(peerId: PeerId): number {
    return this.node.services.pubsub.score.score(peerId.toString());
  }

  public handleAuthRequestFromPeer(authRequest: AuthRequest, peerId: PeerId): Promise<StatusMessage> {
    return this.peerManager.handleAuthRequestFromPeer(authRequest, peerId);
  }

  private async sendToPeers<T extends Gossipable>(message: T) {
    const parent = message.constructor as typeof Gossipable;

    const identifier = await message.p2pMessageIdentifier().then(i => i.toString());
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
