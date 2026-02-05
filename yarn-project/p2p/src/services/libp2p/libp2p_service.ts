import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLibp2pComponentLogger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { Timer } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { EthAddress, L2Block, L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import type { ClientProtocolCircuitVerifier, PeerInfo, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import {
  BlockProposal,
  CheckpointAttestation,
  CheckpointProposal,
  type CheckpointProposalCore,
  type Gossipable,
  P2PClientType,
  P2PMessage,
  type ValidationResult as P2PValidationResult,
  PeerErrorSeverity,
  TopicType,
  createTopicString,
  getTopicsForClientAndConfig,
  metricsTopicStrToLabels,
} from '@aztec/stdlib/p2p';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { Tx, type TxHash, type TxValidationResult, type TxValidator } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';
import { compressComponentVersions } from '@aztec/stdlib/versioning';
import {
  Attributes,
  OtelMetricsAdapter,
  SpanStatusCode,
  type TelemetryClient,
  WithTracer,
  trackSpan,
} from '@aztec/telemetry-client';

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
import { type Message, type MultiaddrConnection, type PeerId, TopicValidatorResult } from '@libp2p/interface';
import type { ConnectionManager } from '@libp2p/interface-internal';
import { mplex } from '@libp2p/mplex';
import { tcp } from '@libp2p/tcp';
import { ENR } from '@nethermindeth/enr';
import { createLibp2p } from 'libp2p';

import type { P2PConfig } from '../../config.js';
import type { MemPools } from '../../mem_pools/interface.js';
import {
  BlockProposalValidator,
  CheckpointAttestationValidator,
  CheckpointProposalValidator,
  FishermanAttestationValidator,
} from '../../msg_validators/index.js';
import { MessageSeenValidator } from '../../msg_validators/msg_seen_validator/msg_seen_validator.js';
import { getDefaultAllowedSetupFunctions } from '../../msg_validators/tx_validator/allowed_public_setup.js';
import {
  type MessageValidator,
  createTxMessageValidators,
  createTxReqRespValidator,
} from '../../msg_validators/tx_validator/factory.js';
import { DoubleSpendTxValidator } from '../../msg_validators/tx_validator/index.js';
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
import type { BatchTxRequesterLibP2PService } from '../reqresp/batch-tx-requester/interface.js';
import type { P2PReqRespConfig } from '../reqresp/config.js';
import {
  DEFAULT_SUB_PROTOCOL_VALIDATORS,
  type ReqRespInterface,
  type ReqRespResponse,
  ReqRespSubProtocol,
  type ReqRespSubProtocolHandler,
  type ReqRespSubProtocolHandlers,
  type ReqRespSubProtocolValidators,
  type SubProtocolMap,
  ValidationError,
} from '../reqresp/interface.js';
import { reqRespBlockTxsHandler } from '../reqresp/protocols/block_txs/block_txs_handler.js';
import { reqGoodbyeHandler } from '../reqresp/protocols/goodbye.js';
import {
  AuthRequest,
  BlockTxsRequest,
  BlockTxsResponse,
  StatusMessage,
  pingHandler,
  reqRespBlockHandler,
  reqRespStatusHandler,
  reqRespTxHandler,
} from '../reqresp/protocols/index.js';
import { ReqResp } from '../reqresp/reqresp.js';
import type {
  P2PBlockReceivedCallback,
  P2PCheckpointReceivedCallback,
  P2PService,
  PeerDiscoveryService,
} from '../service.js';
import { P2PInstrumentation } from './instrumentation.js';

interface ValidationResult {
  name: string;
  isValid: TxValidationResult;
  severity: PeerErrorSeverity;
}

type ValidationOutcome = { allPassed: true } | { allPassed: false; failure: ValidationResult };

// REFACTOR: Unify with the type above
type ReceivedMessageValidationResult<T, M = undefined> =
  | { obj: T; result: Exclude<TopicValidatorResult, TopicValidatorResult.Reject>; metadata?: M }
  | { obj?: T; result: TopicValidatorResult.Reject; metadata?: M };

/**
 * Lib P2P implementation of the P2PService interface.
 */
export class LibP2PService<T extends P2PClientType = P2PClientType.Full> extends WithTracer implements P2PService {
  private discoveryRunningPromise?: RunningPromise;
  private msgIdSeenValidators: Record<TopicType, MessageSeenValidator> = {} as Record<TopicType, MessageSeenValidator>;

  // Message validators
  private blockProposalValidator: BlockProposalValidator;
  private checkpointProposalValidator: CheckpointProposalValidator;
  private checkpointAttestationValidator: CheckpointAttestationValidator;

  private protocolVersion = '';
  private topicStrings: Record<TopicType, string> = {} as Record<TopicType, string>;

  private feesCache: { blockNumber: BlockNumber; gasFees: GasFees } | undefined;

  /** Callback invoked when a duplicate proposal is detected (triggers slashing). */
  private duplicateProposalCallback?: (info: {
    slot: SlotNumber;
    proposer: EthAddress;
    type: 'checkpoint' | 'block';
  }) => void;

  /**
   * Callback for when a block is received from a peer.
   * @param block - The block received from the peer.
   * @returns The attestation for the block, if any.
   */
  private blockReceivedCallback: P2PBlockReceivedCallback;

  /**
   * Callback for when a checkpoint proposal is received from a peer.
   * @param checkpoint - The checkpoint proposal received from the peer.
   * @returns The attestations for the checkpoint, if any.
   */
  private checkpointReceivedCallback: P2PCheckpointReceivedCallback;

  private gossipSubEventHandler: (e: CustomEvent<GossipsubMessage>) => void;

  private instrumentation: P2PInstrumentation;

  private telemetry: TelemetryClient;

  protected logger: Logger;

  constructor(
    private clientType: T,
    private config: P2PConfig,
    protected node: PubSubLibp2p,
    private peerDiscoveryService: PeerDiscoveryService,
    private reqresp: ReqRespInterface,
    protected peerManager: PeerManagerInterface,
    protected mempools: MemPools,
    protected archiver: L2BlockSource & ContractDataSource,
    private epochCache: EpochCacheInterface,
    private proofVerifier: ClientProtocolCircuitVerifier,
    private worldStateSynchronizer: WorldStateSynchronizer,
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

    this.blockProposalValidator = new BlockProposalValidator(epochCache, { txsPermitted: !config.disableTransactions });
    this.checkpointProposalValidator = new CheckpointProposalValidator(epochCache, {
      txsPermitted: !config.disableTransactions,
    });
    this.checkpointAttestationValidator = config.fishermanMode
      ? new FishermanAttestationValidator(epochCache, mempools.attestationPool, telemetry)
      : new CheckpointAttestationValidator(epochCache);

    this.gossipSubEventHandler = this.handleGossipSubEvent.bind(this);

    this.blockReceivedCallback = async (block: BlockProposal): Promise<boolean> => {
      this.logger.debug(
        `Handler not yet registered: Block received callback not set. Received block for slot ${block.slotNumber} from peer.`,
        { p2pMessageIdentifier: await block.p2pMessageLoggingIdentifier() },
      );
      return false;
    };

    this.checkpointReceivedCallback = (
      checkpoint: CheckpointProposalCore,
    ): Promise<CheckpointAttestation[] | undefined> => {
      this.logger.debug(
        `Handler not yet registered: Checkpoint received callback not set. Received checkpoint for slot ${checkpoint.slotNumber} from peer.`,
      );
      return Promise.resolve(undefined);
    };
  }

  public updateConfig(config: Partial<P2PReqRespConfig>) {
    this.reqresp.updateConfig(config);
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
      mempools: MemPools;
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

    const txTopic = createTopicString(TopicType.tx, protocolVersion);
    const blockProposalTopic = createTopicString(TopicType.block_proposal, protocolVersion);
    const checkpointProposalTopic = createTopicString(TopicType.checkpoint_proposal, protocolVersion);
    const checkpointAttestationTopic = createTopicString(TopicType.checkpoint_attestation, protocolVersion);

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
            topics: {
              [txTopic]: createTopicScoreParams({
                topicWeight: 1,
                invalidMessageDeliveriesWeight: -20,
                invalidMessageDeliveriesDecay: 0.5,
              }),
              [blockProposalTopic]: createTopicScoreParams({
                topicWeight: 1,
                invalidMessageDeliveriesWeight: -20,
                invalidMessageDeliveriesDecay: 0.5,
              }),
              [checkpointProposalTopic]: createTopicScoreParams({
                topicWeight: 1,
                invalidMessageDeliveriesWeight: -20,
                invalidMessageDeliveriesDecay: 0.5,
              }),
              [checkpointAttestationTopic]: createTopicScoreParams({
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

    // Create request response protocol handlers
    const txHandler = reqRespTxHandler(this.mempools);
    const goodbyeHandler = reqGoodbyeHandler(this.peerManager);
    const blockHandler = reqRespBlockHandler(this.archiver);
    const statusHandler = reqRespStatusHandler(this.protocolVersion, this.worldStateSynchronizer, this.logger);

    const requestResponseHandlers: Partial<ReqRespSubProtocolHandlers> = {
      [ReqRespSubProtocol.PING]: pingHandler,
      [ReqRespSubProtocol.STATUS]: statusHandler.bind(this),
      [ReqRespSubProtocol.GOODBYE]: goodbyeHandler.bind(this),
      [ReqRespSubProtocol.BLOCK]: blockHandler.bind(this),
    };

    if (!this.config.disableTransactions) {
      const blockTxsHandler = reqRespBlockTxsHandler(this.mempools.attestationPool, this.mempools.txPool);
      requestResponseHandlers[ReqRespSubProtocol.BLOCK_TXS] = blockTxsHandler.bind(this);
    }

    if (!this.config.disableTransactions) {
      requestResponseHandlers[ReqRespSubProtocol.TX] = txHandler.bind(this);
    }

    // Define the sub protocol validators - This is done within this start() method to gain a callback to the existing validateTx function
    const reqrespSubProtocolValidators = {
      ...DEFAULT_SUB_PROTOCOL_VALIDATORS,
      [ReqRespSubProtocol.TX]: this.validateRequestedTxs.bind(this),
      [ReqRespSubProtocol.BLOCK_TXS]: this.validateRequestedBlockTxs.bind(this),
      [ReqRespSubProtocol.BLOCK]: this.validateRequestedBlock.bind(this),
    };

    await this.peerManager.initializePeers();

    await this.reqresp.start(requestResponseHandlers, reqrespSubProtocolValidators);

    await this.node.start();

    // Subscribe to standard GossipSub topics by default
    for (const topic of getTopicsForClientAndConfig(this.clientType, this.config.disableTransactions)) {
      this.subscribeToTopic(this.topicStrings[topic]);
    }

    // add GossipSub listener
    this.node.services.pubsub.addEventListener(GossipSubEvent.MESSAGE, this.gossipSubEventHandler);

    // Start running promise for peer discovery and metrics collection
    if (!this.config.p2pDiscoveryDisabled) {
      await this.peerDiscoveryService.start();
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

  addReqRespSubProtocol(
    subProtocol: ReqRespSubProtocol,
    handler: ReqRespSubProtocolHandler,
    validator?: ReqRespSubProtocolValidators[ReqRespSubProtocol],
  ): Promise<void> {
    return this.reqresp.addSubProtocol(subProtocol, handler, validator);
  }

  public registerThisValidatorAddresses(address: EthAddress[]): void {
    this.peerManager.registerThisValidatorAddresses(address);
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

  public registerBlockReceivedCallback(callback: P2PBlockReceivedCallback) {
    this.blockReceivedCallback = callback;
  }

  public registerCheckpointReceivedCallback(callback: P2PCheckpointReceivedCallback) {
    this.checkpointReceivedCallback = callback;
  }

  /**
   * Registers a callback to be invoked when a duplicate proposal is detected.
   * This callback is triggered on the first duplicate (when count goes from 1 to 2).
   */
  public registerDuplicateProposalCallback(
    callback: (info: { slot: SlotNumber; proposer: EthAddress; type: 'checkpoint' | 'block' }) => void,
  ): void {
    this.duplicateProposalCallback = callback;
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
      if (msg.topic === this.topicStrings[TopicType.tx]) {
        await this.handleGossipedTx(p2pMessage.payload, msgId, source);
      } else if (msg.topic === this.topicStrings[TopicType.checkpoint_attestation]) {
        if (this.clientType === P2PClientType.Full) {
          await this.processCheckpointAttestationFromPeer(p2pMessage.payload, msgId, source);
        }
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
    let resultAndObj: ReceivedMessageValidationResult<T, M> = { result: TopicValidatorResult.Reject };
    const timer = new Timer();
    try {
      resultAndObj = await validationFunc();
    } catch (err) {
      this.peerManager.penalizePeer(source, PeerErrorSeverity.LowToleranceError);
      this.logger.error(`Error deserializing and validating gossipsub message`, err, {
        msgId,
        source: source.toString(),
        topicType,
      });
    }

    if (resultAndObj.result === TopicValidatorResult.Accept) {
      this.instrumentation.recordMessageValidation(topicType, timer);
    }

    this.node.services.pubsub.reportMessageValidationResult(msgId, source.toString(), resultAndObj.result);
    return resultAndObj;
  }

  protected async handleGossipedTx(payloadData: Buffer, msgId: string, source: PeerId) {
    const validationFunc: () => Promise<ReceivedMessageValidationResult<Tx>> = async () => {
      const tx = Tx.fromBuffer(payloadData);
      const isValid = await this.validatePropagatedTx(tx, source);
      const exists = isValid && (await this.mempools.txPool.hasTx(tx.getTxHash()));

      this.logger.trace(`Validate propagated tx`, {
        isValid,
        exists,
        [Attributes.P2P_ID]: source.toString(),
      });

      if (!isValid) {
        return { result: TopicValidatorResult.Reject };
      } else if (exists) {
        return { result: TopicValidatorResult.Ignore, obj: tx };
      } else {
        return { result: TopicValidatorResult.Accept, obj: tx };
      }
    };

    const { result, obj: tx } = await this.validateReceivedMessage<Tx>(validationFunc, msgId, source, TopicType.tx);
    if (result !== TopicValidatorResult.Accept || !tx) {
      return;
    }

    const txHash = tx.getTxHash();
    const txHashString = txHash.toString();
    this.logger.verbose(`Received tx ${txHashString} from external peer ${source.toString()} via gossip`, {
      source: source.toString(),
      txHash: txHashString,
    });

    if (this.config.dropTransactions && randomInt(1000) < this.config.dropTransactionsProbability * 1000) {
      this.logger.warn(`Intentionally dropping tx ${txHashString} (probability rule)`);
      return;
    }

    this.instrumentation.incrementTxReceived(1);
    await this.mempools.txPool.addTxs([tx]);
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
      () => this.validateAndStoreCheckpointAttestation(source, CheckpointAttestation.fromBuffer(payloadData)),
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

  /** Validates a checkpoint attestation and adds it to the pool. Penalizes the peer if validation fails. */
  @trackSpan('Libp2pService.validateAndStoreCheckpointAttestation', (_peerId, attestation) => ({
    [Attributes.SLOT_NUMBER]: attestation.payload.header.slotNumber.toString(),
  }))
  protected async validateAndStoreCheckpointAttestation(
    peerId: PeerId,
    attestation: CheckpointAttestation,
  ): Promise<ReceivedMessageValidationResult<CheckpointAttestation>> {
    const validationResult = await this.checkpointAttestationValidator.validate(attestation);

    if (validationResult.result === 'reject') {
      this.logger.warn(`Penalizing peer ${peerId} for checkpoint attestation validation failure`);
      this.peerManager.penalizePeer(peerId, validationResult.severity);
      return { result: TopicValidatorResult.Reject };
    }

    if (validationResult.result === 'ignore') {
      return { result: TopicValidatorResult.Ignore, obj: attestation };
    }

    // Get committee size for the attestation's slot
    const slot = attestation.payload.header.slotNumber;
    const { committee } = await this.epochCache.getCommittee(slot);
    const committeeSize = committee?.length ?? 0;

    // Try to add the attestation: this handles existence check, cap check, and adding in one call
    const { added, alreadyExists } = await this.mempools.attestationPool.tryAddCheckpointAttestation(
      attestation,
      committeeSize,
    );

    this.logger.trace(`Validate propagated checkpoint attestation`, {
      added,
      alreadyExists,
      [Attributes.SLOT_NUMBER]: slot.toString(),
      [Attributes.P2P_ID]: peerId.toString(),
    });

    // Duplicate attestation received, no need to re-broadcast
    if (alreadyExists) {
      return { result: TopicValidatorResult.Ignore, obj: attestation };
    }

    // Could not add (cap reached), no need to re-broadcast
    if (!added) {
      this.logger.warn(`Dropping checkpoint attestation due to per-(slot, proposalId) attestation cap`, {
        slot: slot.toString(),
        archive: attestation.archive.toString(),
        source: peerId.toString(),
      });
      return { result: TopicValidatorResult.Ignore, obj: attestation };
    }

    // Attestation was added successfully
    return { result: TopicValidatorResult.Accept, obj: attestation };
  }

  protected async processBlockFromPeer(payloadData: Buffer, msgId: string, source: PeerId): Promise<void> {
    const {
      result,
      obj: block,
      metadata: { isEquivocated } = {},
    } = await this.validateReceivedMessage<BlockProposal, { isEquivocated: boolean }>(
      () => this.validateAndStoreBlockProposal(source, BlockProposal.fromBuffer(payloadData)),
      msgId,
      source,
      TopicType.block_proposal,
    );

    // If not accepted or equivocated, return
    if (result !== TopicValidatorResult.Accept || !block || isEquivocated) {
      return;
    }

    await this.processValidBlockProposal(block, source);
  }

  /** Validates a block proposal. Triggers a penalization to the peer that sent it if invalid. Adds to the mempool if valid. */
  @trackSpan('Libp2pService.validateAndStoreBlockProposal', (_peerId, block) => ({
    [Attributes.BLOCK_NUMBER]: block.blockNumber.toString(),
    [Attributes.SLOT_NUMBER]: block.slotNumber.toString(),
  }))
  protected async validateAndStoreBlockProposal(
    peerId: PeerId,
    block: BlockProposal,
  ): Promise<ReceivedMessageValidationResult<BlockProposal, { isEquivocated: boolean }>> {
    const validationResult = await this.blockProposalValidator.validate(block);

    if (validationResult.result === 'reject') {
      this.logger.warn(`Penalizing peer ${peerId} for block proposal validation failure`);
      this.peerManager.penalizePeer(peerId, validationResult.severity);
      return { result: TopicValidatorResult.Reject };
    }

    if (validationResult.result === 'ignore') {
      return { result: TopicValidatorResult.Ignore, obj: block };
    }

    // Try to add the proposal: this handles existence check, cap check, and adding in one call
    const { added, alreadyExists, totalForPosition } = await this.mempools.attestationPool.tryAddBlockProposal(block);
    const isEquivocated = totalForPosition !== undefined && totalForPosition > 1;

    // Duplicate proposal received, no need to re-broadcast
    if (alreadyExists) {
      this.logger.debug(`Ignoring duplicate block proposal received`, {
        ...block.toBlockInfo(),
        indexWithinCheckpoint: block.indexWithinCheckpoint,
        proposer: block.getSender()?.toString(),
        source: peerId.toString(),
      });
      return { result: TopicValidatorResult.Ignore, obj: block, metadata: { isEquivocated } };
    }

    // Too many blocks received for this slot and index, penalize peer and do not re-broadcast
    if (!added) {
      this.peerManager.penalizePeer(peerId, PeerErrorSeverity.HighToleranceError);
      this.logger.warn(`Penalizing peer for block proposal exceeding per-position cap`, {
        ...block.toBlockInfo(),
        indexWithinCheckpoint: block.indexWithinCheckpoint,
        totalForPosition,
        proposer: block.getSender()?.toString(),
        source: peerId.toString(),
      });
      return { result: TopicValidatorResult.Reject, metadata: { isEquivocated } };
    }

    // If this was a duplicate proposal, do not process it, but do invoke the duplicate callback,
    // and do re-broadcast it so other nodes in the network know to slash the proposer
    if (isEquivocated) {
      const proposer = block.getSender();
      this.logger.warn(`Detected duplicate block proposal (equivocation) at slot ${block.slotNumber}`, {
        ...block.toBlockInfo(),
        source: peerId.toString(),
        proposer: proposer?.toString(),
      });
      // Invoke the duplicate callback on the first duplicate spotted only
      if (proposer && totalForPosition === 2) {
        this.duplicateProposalCallback?.({ slot: block.slotNumber, proposer, type: 'block' });
      }
      return { result: TopicValidatorResult.Accept, obj: block, metadata: { isEquivocated } };
    }

    // Otherwise, we're good to go!
    return { result: TopicValidatorResult.Accept, obj: block };
  }

  // REFACTOR(palla): This method should be moved to the p2p_client or to a separate component,
  // should not be here as it does not deal with p2p networking.
  @trackSpan('Libp2pService.processValidBlockProposal', async block => ({
    [Attributes.SLOT_NUMBER]: block.slotNumber,
    [Attributes.BLOCK_ARCHIVE]: block.archive.toString(),
    [Attributes.P2P_ID]: await block.p2pMessageLoggingIdentifier().then(i => i.toString()),
  }))
  protected async processValidBlockProposal(block: BlockProposal, sender: PeerId) {
    const slot = block.slotNumber;
    this.logger.verbose(`Received block proposal for slot ${slot} from external peer ${sender.toString()}.`, {
      p2pMessageIdentifier: await block.p2pMessageLoggingIdentifier(),
      source: sender.toString(),
      ...block.toBlockInfo(),
    });

    // Mark the txs in this proposal as non-evictable
    await this.mempools.txPool.markTxsAsNonEvictable(block.txHashes);

    // Call the block received callback to validate the proposal.
    // Note: Validators do NOT attest to individual blocks, only to checkpoint proposals.
    const isValid = await this.blockReceivedCallback(block, sender);
    if (!isValid) {
      this.logger.warn(`Block proposal validation failed for block ${block.blockNumber}`, block.toBlockInfo());
    }
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
      () => this.validateAndStoreCheckpointProposal(source, CheckpointProposal.fromBuffer(payloadData)),
      msgId,
      source,
      TopicType.checkpoint_proposal,
    );

    // If the checkpoint contained a valid last block, we process it even if the checkpoint itself is to be rejected
    // TODO(palla/mbps): Is this ok? Should we be considering a block from a checkpoint that was equivocated?
    if (processBlock && checkpoint?.getBlockProposal()) {
      await this.processValidBlockProposal(checkpoint.getBlockProposal()!, source);
    }

    if (result !== TopicValidatorResult.Accept || !checkpoint || isEquivocated) {
      return;
    }

    await this.processValidCheckpointProposal(checkpoint.toCore(), source);
  }

  /**
   * Validates a checkpoint proposal. Penalizes peer if validation fails. Adds the checkpoint and
   * its last block (if present) to the mempool if valid. Triggers equivocation detection on both.
   */
  @trackSpan('Libp2pService.validateAndStoreCheckpointProposal', (_peerId, checkpoint) => ({
    [Attributes.SLOT_NUMBER]: checkpoint.slotNumber.toString(),
  }))
  protected async validateAndStoreCheckpointProposal(
    peerId: PeerId,
    checkpoint: CheckpointProposal,
  ): Promise<ReceivedMessageValidationResult<CheckpointProposal, { isEquivocated: boolean; processBlock: boolean }>> {
    const validationResult = await this.checkpointProposalValidator.validate(checkpoint);

    if (validationResult.result === 'reject') {
      this.logger.warn(`Penalizing peer ${peerId} for checkpoint proposal validation failure`);
      this.peerManager.penalizePeer(peerId, validationResult.severity);
      return { result: TopicValidatorResult.Reject };
    }

    if (validationResult.result === 'ignore') {
      return { result: TopicValidatorResult.Ignore, obj: checkpoint };
    }

    // Extract and try to add the block proposal first if present
    const blockProposal = checkpoint.getBlockProposal();
    let processBlock = false;
    if (blockProposal) {
      this.logger.debug(`Validating block proposal from propagated checkpoint`, {
        [Attributes.SLOT_NUMBER]: checkpoint.slotNumber.toString(),
        [Attributes.P2P_ID]: peerId.toString(),
      });
      const {
        result,
        obj,
        metadata: { isEquivocated } = {},
      } = await this.validateAndStoreBlockProposal(peerId, blockProposal);
      if (result === TopicValidatorResult.Reject || !obj || isEquivocated) {
        this.logger.debug(`Rejecting checkpoint due to invalid last block proposal`, {
          [Attributes.SLOT_NUMBER]: checkpoint.slotNumber.toString(),
          [Attributes.P2P_ID]: peerId.toString(),
          isEquivocated,
          result,
        });
        return { result: TopicValidatorResult.Reject };
      } else if (result === TopicValidatorResult.Accept && obj && !isEquivocated) {
        processBlock = true;
      }
    }

    // Try to add the checkpoint proposal core: this handles existence check, cap check, and adding in one call
    const checkpointCore = checkpoint.toCore();
    const tryAddResult = await this.mempools.attestationPool.tryAddCheckpointProposal(checkpointCore);
    const { added, alreadyExists, totalForPosition } = tryAddResult;
    const isEquivocated = totalForPosition !== undefined && totalForPosition > 1;

    // Duplicate proposal received, do not re-broadcast
    if (alreadyExists) {
      this.logger.debug(`Ignoring duplicate checkpoint proposal received`, {
        ...checkpoint.toCheckpointInfo(),
        source: peerId.toString(),
      });
      return {
        result: TopicValidatorResult.Ignore,
        obj: checkpoint,
        metadata: { isEquivocated, processBlock },
      };
    }

    // Too many checkpoint proposals received for this slot, penalize peer and do not re-broadcast
    // Note: We still return the checkpoint obj so the lastBlock can be processed if valid
    if (!added) {
      this.peerManager.penalizePeer(peerId, PeerErrorSeverity.HighToleranceError);
      this.logger.warn(`Penalizing peer for checkpoint proposal exceeding per-slot cap`, {
        ...checkpoint.toCheckpointInfo(),
        totalForPosition,
        source: peerId.toString(),
      });
      return { result: TopicValidatorResult.Reject, obj: checkpoint, metadata: { isEquivocated, processBlock } };
    }

    // If this was a duplicate proposal, do not process it, but do invoke the duplicate callback,
    // and do re-broadcast it so other nodes in the network know to slash the proposer
    if (isEquivocated) {
      const proposer = checkpoint.getSender();
      this.logger.warn(`Detected duplicate checkpoint proposal (equivocation) at slot ${checkpoint.slotNumber}`, {
        ...checkpoint.toCheckpointInfo(),
        source: peerId.toString(),
        proposer: proposer?.toString(),
      });
      // Invoke the duplicate callback on the first duplicate spotted only
      if (proposer && totalForPosition === 2) {
        this.duplicateProposalCallback?.({ slot: checkpoint.slotNumber, proposer, type: 'checkpoint' });
      }
      return {
        result: TopicValidatorResult.Accept,
        obj: checkpoint,
        metadata: { isEquivocated, processBlock },
      };
    }

    // Otherwise, we're good to go!
    return { result: TopicValidatorResult.Accept, obj: checkpoint, metadata: { processBlock, isEquivocated } };
  }

  /**
   * Process a validated checkpoint proposal.
   * Note: The proposal was already added to the pool by tryAddCheckpointProposal in handleGossipedCheckpointProposal.
   */
  @trackSpan('Libp2pService.processValidCheckpointProposal', async checkpoint => ({
    [Attributes.SLOT_NUMBER]: checkpoint.slotNumber,
    [Attributes.BLOCK_ARCHIVE]: checkpoint.archive.toString(),
    [Attributes.P2P_ID]: await checkpoint.p2pMessageLoggingIdentifier().then(i => i.toString()),
  }))
  protected async processValidCheckpointProposal(checkpoint: CheckpointProposalCore, sender: PeerId) {
    const slot = checkpoint.slotNumber;
    this.logger.verbose(`Received checkpoint proposal for slot ${slot} from external peer ${sender.toString()}.`, {
      p2pMessageIdentifier: await checkpoint.p2pMessageLoggingIdentifier(),
      slot: checkpoint.slotNumber,
      archive: checkpoint.archive.toString(),
      source: sender.toString(),
    });

    // Call the checkpoint received callback with the core version (without lastBlock)
    // to validate and potentially generate attestations
    const attestations = await this.checkpointReceivedCallback(checkpoint, sender);
    if (attestations && attestations.length > 0) {
      // If the callback returned attestations, add them to the pool and propagate them
      await this.mempools.attestationPool.addOwnCheckpointAttestations(attestations);
      for (const attestation of attestations) {
        await this.propagate(attestation);
      }
    }
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
   * Validate the requested block transactions. Allow partial returns.
   * @param request - The block transactions request.
   * @param response - The block transactions response.
   * @param peerId - The ID of the peer that made the request.
   * @returns True if the requested block transactions are valid, false otherwise.
   */
  @trackSpan('Libp2pService.validateRequestedBlockTxs', request => ({
    [Attributes.BLOCK_ARCHIVE]: request.archiveRoot.toString(),
  }))
  protected async validateRequestedBlockTxs(
    request: BlockTxsRequest,
    response: BlockTxsResponse,
    peerId: PeerId,
  ): Promise<boolean> {
    const requestedTxValidator = this.createRequestedTxValidator();

    try {
      if (!response.archiveRoot.equals(request.archiveRoot)) {
        this.peerManager.penalizePeer(peerId, PeerErrorSeverity.MidToleranceError);
        throw new ValidationError(
          `Received block txs for unexpected archive root: expected ${request.archiveRoot.toString()}, got ${response.archiveRoot.toString()}`,
        );
      }

      if (response.txIndices.getLength() !== request.txIndices.getLength()) {
        this.peerManager.penalizePeer(peerId, PeerErrorSeverity.MidToleranceError);
        throw new ValidationError(
          `Received block txs with mismatched bitvector length: expected ${request.txIndices.getLength()}, got ${response.txIndices.getLength()}`,
        );
      }

      // Check no duplicates and not exceeding returnable count
      const requestedIndices = new Set(request.txIndices.getTrueIndices());
      const availableIndices = new Set(response.txIndices.getTrueIndices());
      const maxReturnable = [...requestedIndices].filter(i => availableIndices.has(i)).length;

      const returnedHashes = await Promise.all(response.txs.map(tx => tx.getTxHash().toString()));
      const uniqueReturned = new Set(returnedHashes.map(h => h.toString()));
      if (uniqueReturned.size !== returnedHashes.length) {
        this.peerManager.penalizePeer(peerId, PeerErrorSeverity.MidToleranceError);
        throw new ValidationError(`Received duplicate txs in block txs response`);
      }
      if (response.txs.length > maxReturnable) {
        this.peerManager.penalizePeer(peerId, PeerErrorSeverity.MidToleranceError);
        throw new ValidationError(
          `Received more txs (${response.txs.length}) than requested-and-available (${maxReturnable})`,
        );
      }

      // Given proposal (should have locally), ensure returned txs are valid subset and match request indices
      const proposal = await this.mempools.attestationPool.getBlockProposal(request.archiveRoot.toString());
      if (proposal) {
        // Build intersected indices
        const intersectIdx = request.txIndices.getTrueIndices().filter(i => response.txIndices.isSet(i));

        // Enforce subset membership and preserve increasing order by index.
        const hashToIndexInProposal = new Map<string, number>(
          proposal.txHashes.map((h, i) => [h.toString(), i] as [string, number]),
        );
        const allowedIndexSet = new Set(intersectIdx);
        const indices = returnedHashes.map(h => hashToIndexInProposal.get(h));
        const allAllowed = indices.every(idx => idx !== undefined && allowedIndexSet.has(idx));
        const strictlyIncreasing = indices.every((idx, i) => (i === 0 ? idx !== undefined : idx! > indices[i - 1]!));
        if (!allAllowed || !strictlyIncreasing) {
          this.peerManager.penalizePeer(peerId, PeerErrorSeverity.LowToleranceError);
          throw new ValidationError('Returned txs do not match expected subset/order for requested indices');
        }
      } else {
        // No local proposal, cannot check the membership/order of the returned txs
        this.logger.warn(
          `Block proposal not found for archive root ${request.archiveRoot.toString()}; cannot validate membership/order of returned txs`,
        );
        return false;
      }

      await Promise.all(response.txs.map(tx => this.validateRequestedTx(tx, peerId, requestedTxValidator)));
      return true;
    } catch (e: any) {
      if (e instanceof ValidationError) {
        this.logger.warn(`Failed validation for requested block txs from peer ${peerId.toString()}`);
      } else {
        this.logger.error(`Error during validation of requested block txs`, e);
      }

      return false;
    }
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
   * @param responseTx - The collection of txs that was received as a response to the request.
   * @param peerId - The peer ID of the peer that sent the tx.
   * @returns True if the whole collection of txs is valid, false otherwise.
   */
  @trackSpan('Libp2pService.validateRequestedTx', (requestedTxHash, _responseTx) => ({
    [Attributes.TX_HASH]: requestedTxHash.toString(),
  }))
  private async validateRequestedTxs(requestedTxHash: TxHash[], responseTx: Tx[], peerId: PeerId): Promise<boolean> {
    const requested = new Set(requestedTxHash.map(h => h.toString()));
    const requestedTxValidator = this.createRequestedTxValidator();

    //TODO: (mralj) - this is somewhat naive implementation, if single tx is invalid we consider the whole response invalid.
    // I think we should still extract the valid txs and return them, so that we can still use the response.
    try {
      await Promise.all(responseTx.map(tx => this.validateRequestedTx(tx, peerId, requestedTxValidator, requested)));
      return true;
    } catch (e: any) {
      if (e instanceof ValidationError) {
        this.logger.warn(`Failed to validate requested txs from peer ${peerId.toString()}, reason ${e.message}`);
      } else {
        this.logger.error(`Error during validation of requested txs`, e);
      }

      return false;
    }
  }

  /**
   * Validates a BLOCK response.
   *
   * If a local copy exists, enforces hash equality. If missing, rejects (no penalty) since the hash cannot be verified.
   * Penalizes on block number mismatch or hash mismatch.
   *
   * @param requestedBlockNumber - The requested block number.
   * @param responseBlock - The block returned by the peer.
   * @param peerId - The peer that returned the block.
   * @returns True if the response is valid, false otherwise.
   */
  @trackSpan('Libp2pService.validateRequestedBlock', (requestedBlockNumber, _responseBlock) => ({
    [Attributes.BLOCK_NUMBER]: requestedBlockNumber.toString(),
  }))
  protected async validateRequestedBlock(
    requestedBlockNumber: Fr,
    responseBlock: L2Block,
    peerId: PeerId,
  ): Promise<boolean> {
    try {
      const reqNum = Number(requestedBlockNumber.toString());
      if (responseBlock.number !== reqNum) {
        this.peerManager.penalizePeer(peerId, PeerErrorSeverity.LowToleranceError);
        return false;
      }

      const local = await this.archiver.getBlock(BlockNumber(reqNum));
      if (!local) {
        // We are missing the local block; we cannot verify the hash yet. Reject without penalizing.
        // TODO: Consider extending this validator to accept an expected hash or
        // performing quorum-based checks when using P2P syncing prior to L1 sync.
        this.logger.warn(`Local block ${reqNum} not found; rejecting BLOCK response without hash verification`);
        return false;
      }
      const [localHash, respHash] = await Promise.all([local.hash(), responseBlock.hash()]);
      if (!localHash.equals(respHash)) {
        this.peerManager.penalizePeer(peerId, PeerErrorSeverity.MidToleranceError);
        return false;
      }

      return true;
    } catch (e) {
      this.logger.warn(`Error validating requested block`, e);
      return false;
    }
  }

  protected async validateRequestedTx(
    tx: Tx,
    peerId: PeerId,
    txValidator: TxValidator,
    requested?: Set<`0x${string}`>,
  ) {
    const penalize = (severity: PeerErrorSeverity) => this.peerManager.penalizePeer(peerId, severity);
    if (requested && !requested.has(tx.getTxHash().toString())) {
      penalize(PeerErrorSeverity.MidToleranceError);
      throw new ValidationError(`Received tx with hash ${tx.getTxHash().toString()} that was not requested.`);
    }

    const { result } = await txValidator.validateTx(tx);
    if (result === 'invalid') {
      penalize(PeerErrorSeverity.LowToleranceError);
      throw new ValidationError(`Received tx with hash ${tx.getTxHash().toString()} that is invalid.`);
    }
  }

  protected createRequestedTxValidator(): TxValidator {
    return createTxReqRespValidator(this.proofVerifier, {
      l1ChainId: this.config.l1ChainId,
      rollupVersion: this.config.rollupVersion,
    });
  }

  @trackSpan('Libp2pService.validatePropagatedTx', tx => ({
    [Attributes.TX_HASH]: tx.getTxHash().toString(),
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
        const txBlockNumber = BlockNumber(currentBlockNumber + 1); // tx is expected to be in the next block
        severity = await this.handleDoubleSpendFailure(tx, txBlockNumber);
      }

      this.peerManager.penalizePeer(peerId, severity);
      return false;
    }
    return true;
  }

  private async getGasFees(blockNumber: BlockNumber): Promise<GasFees> {
    if (blockNumber === this.feesCache?.blockNumber) {
      return this.feesCache.gasFees;
    }

    const header = await this.archiver.getBlockHeader(blockNumber);
    const gasFees = header?.globalVariables.gasFees ?? GasFees.empty();
    this.feesCache = { blockNumber, gasFees };
    return gasFees;
  }

  /**
   * Get the BatchTxRequesterLibP2PService dependencies for creating BatchTxRequester instances
   */
  public getBatchTxRequesterService(): BatchTxRequesterLibP2PService {
    return {
      reqResp: this.reqresp,
      connectionSampler: this.reqresp.getConnectionSampler(),
      txValidatorConfig: {
        l1ChainId: this.config.l1ChainId,
        rollupVersion: this.config.rollupVersion,
        proofVerifier: this.proofVerifier,
      },
      peerScoring: this.peerManager,
    };
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
    currentBlockNumber: BlockNumber,
    nextSlotTimestamp: UInt64,
  ): Promise<Record<string, MessageValidator>[]> {
    const gasFees = await this.getGasFees(currentBlockNumber);
    const allowedInSetup = this.config.txPublicSetupAllowList ?? (await getDefaultAllowedSetupFunctions());

    const blockNumberInWhichTheTxIsConsideredToBeIncluded = BlockNumber(currentBlockNumber + 1);

    return createTxMessageValidators(
      nextSlotTimestamp,
      blockNumberInWhichTheTxIsConsideredToBeIncluded,
      this.worldStateSynchronizer,
      gasFees,
      this.config.l1ChainId,
      this.config.rollupVersion,
      protocolContractsHash,
      this.archiver,
      this.proofVerifier,
      !this.config.disableTransactions,
      allowedInSetup,
      this.logger.getBindings(),
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
  private async handleDoubleSpendFailure(tx: Tx, blockNumber: BlockNumber): Promise<PeerErrorSeverity> {
    if (blockNumber <= this.config.doubleSpendSeverePeerPenaltyWindow) {
      return PeerErrorSeverity.HighToleranceError;
    }

    const snapshotValidator = new DoubleSpendTxValidator(
      {
        nullifiersExist: async (nullifiers: Buffer[]) => {
          const merkleTree = this.worldStateSynchronizer.getSnapshot(
            BlockNumber(blockNumber - this.config.doubleSpendSeverePeerPenaltyWindow),
          );
          const indices = await merkleTree.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, nullifiers);
          return indices.map(index => index !== undefined);
        },
      },
      this.logger.getBindings(),
    );

    const validSnapshot = await snapshotValidator.validateTx(tx);
    if (validSnapshot.result !== 'valid') {
      return PeerErrorSeverity.LowToleranceError;
    }

    return PeerErrorSeverity.HighToleranceError;
  }

  /**
   * Validate a checkpoint attestation.
   *
   * @param attestation - The checkpoint attestation to validate.
   * @returns True if the checkpoint attestation is valid, false otherwise.
   */
  @trackSpan('Libp2pService.validateCheckpointAttestation', async (_, attestation) => ({
    [Attributes.SLOT_NUMBER]: attestation.payload.header.slotNumber,
    [Attributes.BLOCK_ARCHIVE]: attestation.archive.toString(),
    [Attributes.P2P_ID]: await attestation.p2pMessageLoggingIdentifier().then(i => i.toString()),
  }))
  public async validateCheckpointAttestation(
    peerId: PeerId,
    attestation: CheckpointAttestation,
  ): Promise<P2PValidationResult> {
    const result = await this.checkpointAttestationValidator.validate(attestation);

    if (result.result === 'reject') {
      this.logger.warn(`Penalizing peer ${peerId} for checkpoint attestation validation failure`);
      this.peerManager.penalizePeer(peerId, result.severity);
    }

    return result;
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
