import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import { maxBy, merge } from '@aztec/foundation/collection';
import { type Logger, createLibp2pComponentLogger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { Timer } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { EthAddress, L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { type BlockMinFeesProvider, GasFees } from '@aztec/stdlib/gas';
import type { ClientProtocolCircuitVerifier, PeerInfo, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import {
  BlockProposal,
  CheckpointAttestation,
  CheckpointProposal,
  type CheckpointProposalCore,
  type Gossipable,
  P2PMessage,
  PeerErrorSeverity,
  PeerErrorSeverityByHarshness,
  TopicType,
  createTopicString,
  getTopicsForConfig,
  metricsTopicStrToLabels,
} from '@aztec/stdlib/p2p';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { Tx, type TxValidationResult } from '@aztec/stdlib/tx';
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
import { CheckpointProposalReceivedCallbackNotRegisteredError } from '../../errors/p2p-service.error.js';
import type { MemPools } from '../../mem_pools/interface.js';
import {
  BlockProposalValidator,
  CheckpointAttestationValidator,
  CheckpointProposalValidator,
  DoubleSpendTxValidator,
  FishermanAttestationValidator,
  getDefaultAllowedSetupFunctions,
} from '../../msg_validators/index.js';
import { MessageSeenValidator } from '../../msg_validators/msg_seen_validator/msg_seen_validator.js';
import {
  type TransactionValidator,
  createFirstStageTxValidationsForGossipedTransactions,
  createSecondStageTxValidationsForGossipedTransactions,
  createTxValidatorForBlockProposalReceivedTxs,
} from '../../msg_validators/tx_validator/factory.js';
import { TxValidationCache } from '../../msg_validators/tx_validator/tx_validation_cache.js';
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
  BlockTxsRequest,
  BlockTxsResponse,
  type ReqRespInterface,
  type ReqRespResponse,
  ReqRespSubProtocol,
  type ReqRespSubProtocolHandler,
  type ReqRespSubProtocolHandlers,
  StatusMessage,
  ValidationError,
  pingHandler,
  reqGoodbyeHandler,
  reqRespBlockTxsHandler,
  reqRespStatusHandler,
  reqRespTxHandler,
} from '../reqresp/index.js';
import { ReqResp } from '../reqresp/reqresp.js';
import type {
  P2PBlockReceivedCallback,
  P2PCheckpointAttestationCallback,
  P2PCheckpointReceivedCallback,
  P2PDuplicateAttestationCallback,
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
  | { obj?: T; result: TopicValidatorResult.Reject; metadata?: M; severity: PeerErrorSeverity };

/**
 * Lib P2P implementation of the P2PService interface.
 */
export class LibP2PService extends WithTracer implements P2PService {
  private discoveryRunningPromise?: RunningPromise;
  private msgIdSeenValidators: Record<TopicType, MessageSeenValidator> = {} as Record<TopicType, MessageSeenValidator>;

  // Message validators
  private blockProposalValidator: BlockProposalValidator;
  private checkpointProposalValidator: CheckpointProposalValidator;
  private checkpointAttestationValidator: CheckpointAttestationValidator;

  private protocolVersion = '';
  private topicStrings: Record<TopicType, string> = {} as Record<TopicType, string>;

  /** Callback invoked when a duplicate proposal is detected (triggers slashing). */
  private duplicateProposalCallback?: (info: {
    slot: SlotNumber;
    proposer: EthAddress;
    type: 'checkpoint' | 'block';
  }) => void;

  /** Callback invoked when a duplicate attestation is detected (triggers slashing). */
  private duplicateAttestationCallback?: P2PDuplicateAttestationCallback;

  /** Callback invoked when a valid checkpoint attestation is accepted into the pool. */
  private checkpointAttestationCallback?: P2PCheckpointAttestationCallback;

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
  private allNodesCheckpointReceivedCallback: P2PCheckpointReceivedCallback;
  /**
   * Callback for when a checkpoint proposal is received - specifically for validators - from a peer.
   * @param checkpoint - The checkpoint proposal received from the peer.
   * @returns The attestations for the checkpoint, if any.
   */
  private validatorCheckpointReceivedCallback: P2PCheckpointReceivedCallback;

  private gossipSubEventHandler: (e: CustomEvent<GossipsubMessage>) => void;

  private ipChangedHandler?: (ip: string) => void;
  private discoveredP2pIp?: string;

  private instrumentation: P2PInstrumentation;

  private telemetry: TelemetryClient;

  protected logger: Logger;

  constructor(
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
    private blockMinFeesProvider: BlockMinFeesProvider,
    telemetry: TelemetryClient,
    logger: Logger = createLogger('p2p:libp2p_service'),
    private txValidationCache?: TxValidationCache,
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

    const p2pPropagationTime = config.attestationPropagationTime;
    const proposalValidatorOpts = {
      txsPermitted: !config.disableTransactions,
      maxTxsPerBlock: config.validateMaxTxsPerBlock ?? config.validateMaxTxsPerCheckpoint,
      maxBlocksPerCheckpoint: config.maxBlocksPerCheckpoint,
      p2pPropagationTime,
      skipSlotValidation: config.skipProposalSlotValidation,
      signatureContext: {
        chainId: config.l1ChainId,
        rollupAddress: config.rollupAddress,
      },
    };
    this.blockProposalValidator = new BlockProposalValidator(epochCache, proposalValidatorOpts);
    this.checkpointProposalValidator = new CheckpointProposalValidator(epochCache, proposalValidatorOpts);
    const attestationValidatorOpts = {
      l1PublishingTime: config.l1PublishingTime,
      p2pPropagationTime,
      signatureContext: proposalValidatorOpts.signatureContext,
    };
    this.checkpointAttestationValidator = config.fishermanMode
      ? new FishermanAttestationValidator(epochCache, mempools.attestationPool, telemetry, attestationValidatorOpts)
      : new CheckpointAttestationValidator(epochCache, attestationValidatorOpts);

    this.gossipSubEventHandler = this.handleGossipSubEvent.bind(this);

    this.blockReceivedCallback = async (block: BlockProposal): Promise<boolean> => {
      this.logger.warn(
        `Handler for block received not yet registered on P2P service. Received block ${block.blockNumber} for slot ${block.slotNumber} from peer.`,
        { p2pMessageIdentifier: await block.p2pMessageLoggingIdentifier() },
      );
      return true;
    };

    this.allNodesCheckpointReceivedCallback = (
      _checkpoint: CheckpointProposalCore,
    ): Promise<CheckpointAttestation[] | undefined> => {
      throw new CheckpointProposalReceivedCallbackNotRegisteredError();
    };

    this.validatorCheckpointReceivedCallback = (
      _checkpoint: CheckpointProposalCore,
    ): Promise<CheckpointAttestation[] | undefined> => {
      return Promise.resolve(undefined);
    };
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
      mempools: MemPools;
      l2BlockSource: L2BlockSource & ContractDataSource;
      epochCache: EpochCacheInterface;
      proofVerifier: ClientProtocolCircuitVerifier;
      worldStateSynchronizer: WorldStateSynchronizer;
      peerStore: AztecAsyncKVStore;
      blockMinFeesProvider: BlockMinFeesProvider;
      telemetry: TelemetryClient;
      logger: Logger;
      packageVersion: string;
      txValidationCache?: TxValidationCache;
    },
  ) {
    const {
      worldStateSynchronizer,
      epochCache,
      l2BlockSource,
      mempools,
      proofVerifier,
      peerStore,
      blockMinFeesProvider,
      telemetry,
      logger,
      packageVersion,
      txValidationCache,
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

    return new LibP2PService(
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
      blockMinFeesProvider,
      telemetry,
      logger,
      txValidationCache,
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

    const { p2pIp, p2pPort } = this.config;
    if (!p2pIp && !this.config.queryForIp) {
      throw new Error('Announce address not provided and queryForIp is not enabled.');
    }
    const announceTcpMultiaddr = p2pIp ? convertToMultiaddr(p2pIp, p2pPort, 'tcp') : undefined;

    // Create request response protocol handlers
    const txHandler = reqRespTxHandler(this.mempools);
    const goodbyeHandler = reqGoodbyeHandler(this.peerManager);
    const statusHandler = reqRespStatusHandler(this.protocolVersion, this.worldStateSynchronizer, this.logger);

    const requestResponseHandlers: Partial<ReqRespSubProtocolHandlers> = {
      [ReqRespSubProtocol.PING]: pingHandler,
      [ReqRespSubProtocol.STATUS]: statusHandler.bind(this),
      [ReqRespSubProtocol.GOODBYE]: goodbyeHandler.bind(this),
    };

    if (!this.config.disableTransactions) {
      const blockTxsHandler = reqRespBlockTxsHandler(
        this.mempools.attestationPool,
        this.archiver,
        this.mempools.txPool,
      );
      requestResponseHandlers[ReqRespSubProtocol.BLOCK_TXS] = blockTxsHandler.bind(this);
    }

    if (!this.config.disableTransactions) {
      requestResponseHandlers[ReqRespSubProtocol.TX] = txHandler.bind(this);
    }

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

  public registerBlockReceivedCallback(callback: P2PBlockReceivedCallback) {
    this.blockReceivedCallback = callback;
  }

  public registerValidatorCheckpointReceivedCallback(callback: P2PCheckpointReceivedCallback) {
    this.validatorCheckpointReceivedCallback = callback;
  }

  public registerAllNodesCheckpointReceivedCallback(callback: P2PCheckpointReceivedCallback) {
    this.allNodesCheckpointReceivedCallback = callback;
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
   * Registers a callback to be invoked when a duplicate attestation is detected.
   * A validator signing attestations for different proposals at the same slot.
   * This callback is triggered on the first duplicate (when count goes from 1 to 2).
   */
  public registerDuplicateAttestationCallback(callback: P2PDuplicateAttestationCallback): void {
    this.duplicateAttestationCallback = callback;
  }

  public registerCheckpointAttestationCallback(callback: P2PCheckpointAttestationCallback): void {
    this.checkpointAttestationCallback = callback;
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
    const validationFunc: () => Promise<ReceivedMessageValidationResult<Tx>> = async () => {
      const tx = this.tryDeserialize(() => Tx.fromBuffer(payloadData), msgId, source);
      if (!tx) {
        return { result: TopicValidatorResult.Reject, severity: PeerErrorSeverity.LowToleranceError };
      }

      const currentBlockNumber = await this.archiver.getBlockNumber();
      const { ts: nextSlotTimestamp } = this.epochCache.getEpochAndSlotInNextL1Slot();

      // Stage 1: fast validators (metadata, data, timestamps, double-spend, gas, phases, block header)
      const firstStageValidators = await this.createFirstStageMessageValidators(currentBlockNumber, nextSlotTimestamp);
      const firstStageOutcome = await this.runValidations(tx, firstStageValidators);
      if (!firstStageOutcome.allPassed) {
        const { name } = firstStageOutcome.failure;
        let { severity } = firstStageOutcome.failure;

        // Double spend validator has a special case handler. We perform more detailed examination
        // as to how recently the nullifier was entered into the tree and if the transaction should
        // have 'known' the nullifier existed. This determines the severity of the penalty applied to the peer.
        if (name === 'doubleSpendValidator') {
          const txBlockNumber = BlockNumber(currentBlockNumber + 1);
          severity = await this.handleDoubleSpendFailure(tx, txBlockNumber);
        }

        this.logger.verbose(`Rejecting gossiped tx ${tx.getTxHash().toString()}: stage 1 validation failed`, {
          validator: name,
          severity,
          source: source.toString(),
        });
        return { result: TopicValidatorResult.Reject, severity };
      }

      // Pool pre-check: see if the pool would accept this tx before doing expensive proof verification
      const canAdd = await this.mempools.txPool.canAddPendingTx(tx);
      if (canAdd === 'ignored') {
        this.logger.verbose(`Ignoring gossiped tx ${tx.getTxHash().toString()}: pool pre-check returned ignored`, {
          source: source.toString(),
        });
        return { result: TopicValidatorResult.Ignore, obj: tx };
      }

      // Stage 2: expensive proof verification
      const secondStageValidators = this.createSecondStageMessageValidators();
      const secondStageOutcome = await this.runValidations(tx, secondStageValidators);
      if (!secondStageOutcome.allPassed) {
        const { severity, name } = secondStageOutcome.failure;
        this.logger.verbose(`Rejecting gossiped tx ${tx.getTxHash().toString()}: stage 2 validation failed`, {
          validator: name,
          severity,
          source: source.toString(),
        });
        return { result: TopicValidatorResult.Reject, severity };
      }

      // Pool add: persist the tx
      const txHash = tx.getTxHash();
      const addResult = await this.mempools.txPool.addPendingTxs([tx], { source: 'gossip' });

      const wasAccepted = addResult.accepted.some(h => h.equals(txHash));
      const wasIgnored = addResult.ignored.some(h => h.equals(txHash));

      this.logger.verbose(`Validate propagated tx ${txHash.toString()}`, {
        wasAccepted,
        wasIgnored,
        [Attributes.P2P_ID]: source.toString(),
      });

      if (wasAccepted) {
        return { result: TopicValidatorResult.Accept, obj: tx };
      } else if (wasIgnored) {
        return { result: TopicValidatorResult.Ignore, obj: tx };
      } else {
        this.logger.warn(`Gossiped tx ${txHash.toString()} unexpectedly rejected by pool`, {
          source: source.toString(),
          txHash: txHash.toString(),
        });
        return { result: TopicValidatorResult.Reject, severity: PeerErrorSeverity.HighToleranceError };
      }
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
        return this.validateAndStoreCheckpointAttestation(source, attestation);
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
      return { result: TopicValidatorResult.Reject, severity: validationResult.severity };
    }

    if (validationResult.result === 'ignore') {
      return { result: TopicValidatorResult.Ignore, obj: attestation };
    }

    // Try to add the attestation: this handles existence check, cap check, and adding in one call
    // count is the number of attestations by this signer for this slot (for duplicate detection)
    const slot = attestation.payload.header.slotNumber;
    const { added, alreadyExists, count } =
      await this.mempools.attestationPool.tryAddCheckpointAttestation(attestation);

    this.logger.trace(`Validate propagated checkpoint attestation`, {
      added,
      alreadyExists,
      count,
      [Attributes.SLOT_NUMBER]: slot.toString(),
      [Attributes.P2P_ID]: peerId.toString(),
    });

    // Exact same attestation received, no need to re-broadcast
    if (alreadyExists) {
      return { result: TopicValidatorResult.Ignore, obj: attestation };
    }

    // Could not add (cap reached for signer), penalize and do not re-broadcast
    if (!added) {
      this.logger.warn(`Rejecting checkpoint attestation due to cap`, {
        slot: slot.toString(),
        archive: attestation.archive.toString(),
        source: peerId.toString(),
        attester: attestation.getSender()?.toString(),
        count,
      });
      return { result: TopicValidatorResult.Reject, severity: PeerErrorSeverity.HighToleranceError };
    }

    // Check if this is a duplicate attestation (signer attested to a different proposal at the same slot)
    // count is the number of attestations by this signer for this slot
    if (count === 2) {
      const attester = attestation.getSender();
      if (attester) {
        this.logger.warn(`Detected duplicate attestation (equivocation) at slot ${slot}`, {
          slot: slot.toString(),
          archive: attestation.archive.toString(),
          source: peerId.toString(),
          attester: attester.toString(),
        });
        this.duplicateAttestationCallback?.({ slot, attester });
      }
    }

    // Attestation was added successfully - accept it so other nodes can also detect the equivocation
    this.checkpointAttestationCallback?.(attestation);
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
      return { result: TopicValidatorResult.Reject, severity: validationResult.severity };
    }

    if (validationResult.result === 'ignore') {
      return { result: TopicValidatorResult.Ignore, obj: block };
    }

    // Try to add the proposal: this handles existence check, cap check, and adding in one call
    const { added, alreadyExists, count } = await this.mempools.attestationPool.tryAddBlockProposal(block);
    const isEquivocated = count !== undefined && count > 1;

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
      this.logger.warn(`Penalizing peer for block proposal exceeding per-position cap`, {
        ...block.toBlockInfo(),
        indexWithinCheckpoint: block.indexWithinCheckpoint,
        count,
        proposer: block.getSender()?.toString(),
        source: peerId.toString(),
      });
      return {
        result: TopicValidatorResult.Reject,
        metadata: { isEquivocated },
        severity: PeerErrorSeverity.HighToleranceError,
      };
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
      if (proposer && count === 2) {
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

    // Mark the txs in this proposal as protected
    await this.mempools.txPool.protectTxs(block.txHashes, block.blockHeader);

    // Call the block received callback to validate the proposal.
    // Note: Validators do NOT attest to individual blocks, only to checkpoint proposals.
    const isValid = await this.blockReceivedCallback(block, sender);
    if (!isValid) {
      this.logger.info(`Block proposal validation failed for block ${block.blockNumber}`, block.toBlockInfo());
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

    // Process checkpoint proposal if valid and not equivocated.
    const processCheckpointFn = () =>
      result === TopicValidatorResult.Accept && checkpoint && !isEquivocated
        ? this.processValidCheckpointProposal(checkpoint.toCore(), source)
        : Promise.resolve();

    // If the checkpoint contained a valid last block, we process it even if the checkpoint itself is to be rejected
    // TODO(palla/mbps): Is this ok? Should we be considering a block from a checkpoint that was equivocated?
    const processBlockFn = () =>
      processBlock && checkpoint && checkpoint.getBlockProposal()
        ? this.processValidBlockProposal(checkpoint.getBlockProposal()!, source)
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
      return { result: TopicValidatorResult.Reject, severity: validationResult.severity };
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
      const blockProposalResult = await this.validateAndStoreBlockProposal(peerId, blockProposal);
      const { obj, metadata: { isEquivocated } = {} } = blockProposalResult;
      if (blockProposalResult.result === TopicValidatorResult.Reject || !obj || isEquivocated) {
        this.logger.debug(`Rejecting checkpoint due to invalid last block proposal`, {
          [Attributes.SLOT_NUMBER]: checkpoint.slotNumber.toString(),
          [Attributes.P2P_ID]: peerId.toString(),
          isEquivocated,
          result: blockProposalResult.result,
        });
        return {
          result: TopicValidatorResult.Reject,
          severity:
            'severity' in blockProposalResult ? blockProposalResult.severity : PeerErrorSeverity.MidToleranceError,
        };
      } else if (blockProposalResult.result === TopicValidatorResult.Accept && obj && !isEquivocated) {
        processBlock = true;
      }
    }

    // Try to add the checkpoint proposal core: this handles existence check, cap check, and adding in one call
    const checkpointCore = checkpoint.toCore();
    const tryAddResult = await this.mempools.attestationPool.tryAddCheckpointProposal(checkpointCore);
    const { added, alreadyExists, count } = tryAddResult;
    const isEquivocated = count !== undefined && count > 1;

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
      this.logger.warn(`Penalizing peer for checkpoint proposal exceeding per-slot cap`, {
        ...checkpoint.toCheckpointInfo(),
        count,
        source: peerId.toString(),
      });
      return {
        result: TopicValidatorResult.Reject,
        obj: checkpoint,
        metadata: { isEquivocated, processBlock },
        severity: PeerErrorSeverity.HighToleranceError,
      };
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
      if (proposer && count === 2) {
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

    await this.allNodesCheckpointReceivedCallback(checkpoint, sender);

    // Call the checkpoint received callback with the core version (without lastBlock)
    // to validate and potentially generate attestations
    const attestations = await this.validatorCheckpointReceivedCallback(checkpoint, sender);
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
   * Validate the requested block transactions request-response consistency.
   * It does NOT validate the transactions themselves.
   * @param request - The block transactions request.
   * @param response - The block transactions response.
   * @param peerId - The ID of the peer that made the request.
   * @returns True if the request-response is consistent, false otherwise.
   */
  @trackSpan('Libp2pService.validateRequestedBlockTxsConsistency', request => ({
    [Attributes.BLOCK_ARCHIVE]: request.archiveRoot.toString(),
  }))
  protected async validateRequestedBlockTxsConsistency(
    request: BlockTxsRequest,
    response: BlockTxsResponse,
    peerId: PeerId,
  ): Promise<boolean> {
    try {
      // A response with archiveRoot=Fr.zero is the documented "I don't have the block" signal from
      // reqRespBlockTxsHandler (block_txs_handler.ts:54-58): the peer lacked the block in its
      // attestation pool and archiver, but matched the requested hashes against its tx pool and
      // shipped what it found. This is legitimate behaviour, not misbehaviour — we just can't verify
      // membership/order without the block, so we drop the response without penalising the peer.
      if (response.archiveRoot.isZero()) {
        this.logger.debug(`Peer ${peerId.toString()} signalled missing block with Fr.zero archive root`);
        return false;
      }

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

      // To verify membership/order of the returned txs we need the canonical tx hash list for the
      // block. Prefer the block proposal (held while a block is in flight), but fall back to the
      // archiver for blocks we only know as mined — e.g. a prover collecting txs to prove a block it
      // never received a proposal for. This mirrors the responder side (reqRespBlockTxsHandler),
      // which serves from proposal-or-archiver.
      const proposal = await this.mempools.attestationPool.getBlockProposalByArchive(request.archiveRoot.toString());
      const blockTxHashes =
        proposal?.txHashes ??
        (await this.archiver.getBlock({ archive: request.archiveRoot }))?.body.txEffects.map(e => e.txHash);

      if (blockTxHashes) {
        // Build intersected indices
        const intersectIdx = request.txIndices.getTrueIndices().filter(i => response.txIndices.isSet(i));

        // Enforce subset membership and preserve increasing order by index.
        const hashToIndexInBlock = new Map<string, number>(
          blockTxHashes.map((h, i) => [h.toString(), i] as [string, number]),
        );
        const allowedIndexSet = new Set(intersectIdx);
        const indices = returnedHashes.map(h => hashToIndexInBlock.get(h));
        const allAllowed = indices.every(idx => idx !== undefined && allowedIndexSet.has(idx));
        const strictlyIncreasing = indices.every((idx, i) => (i === 0 ? idx !== undefined : idx! > indices[i - 1]!));
        if (!allAllowed || !strictlyIncreasing) {
          this.peerManager.penalizePeer(peerId, PeerErrorSeverity.LowToleranceError);
          throw new ValidationError('Returned txs do not match expected subset/order for requested indices');
        }
      } else {
        // Neither a local proposal nor an archived block: we cannot verify membership/order of the
        // returned txs. This is a local-state gap, not a peer fault, so we do not penalize.
        this.logger.warn(
          `Block ${request.archiveRoot.toString()} not found in attestation pool or archiver; cannot validate membership/order of returned txs`,
        );
        return false;
      }

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

  private getGasFees(): Promise<GasFees> {
    return this.blockMinFeesProvider.getCurrentMinFees();
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
        txValidationCache: this.txValidationCache,
      },
      peerScoring: this.peerManager,
      validateRequestedBlockTxsConsistency: this.validateRequestedBlockTxsConsistency.bind(this),
    };
  }

  public async validateTxsReceivedInBlockProposal(txs: Tx[]): Promise<void> {
    const validator = createTxValidatorForBlockProposalReceivedTxs(
      this.proofVerifier,
      { l1ChainId: this.config.l1ChainId, rollupVersion: this.config.rollupVersion },
      this.logger.getBindings(),
      this.txValidationCache,
    );

    const results = await Promise.all(
      txs.map(async tx => {
        const result = await validator.validateTx(tx);
        return result.result !== 'invalid';
      }),
    );
    if (results.some(value => value === false)) {
      throw new Error('Invalid tx detected');
    }
  }

  /** Creates the first stage (fast) validators for gossiped transactions. */
  protected async createFirstStageMessageValidators(
    currentBlockNumber: BlockNumber,
    nextSlotTimestamp: UInt64,
  ): Promise<Record<string, TransactionValidator>> {
    const gasFees = await this.getGasFees();
    const allowedInSetup = [
      ...(await getDefaultAllowedSetupFunctions()),
      ...(this.config.txPublicSetupAllowListExtend ?? []),
    ];
    const blockNumber = BlockNumber(currentBlockNumber + 1);
    const l1Constants = await this.archiver.getL1Constants();

    return createFirstStageTxValidationsForGossipedTransactions(
      nextSlotTimestamp,
      blockNumber,
      this.worldStateSynchronizer,
      gasFees,
      this.config.l1ChainId,
      this.config.rollupVersion,
      protocolContractsHash,
      this.archiver,
      !this.config.disableTransactions,
      allowedInSetup,
      this.logger.getBindings(),
      {
        rollupManaLimit: l1Constants.rollupManaLimit,
        maxBlockL2Gas: this.config.validateMaxL2BlockGas,
        maxBlockDAGas: this.config.validateMaxDABlockGas,
      },
    );
  }

  /** Creates the second stage (expensive proof verification) validators for gossiped transactions. */
  protected createSecondStageMessageValidators(): Record<string, TransactionValidator> {
    return createSecondStageTxValidationsForGossipedTransactions(this.proofVerifier, this.logger.getBindings());
  }

  /**
   * Run validations on a tx.
   * @param tx - The tx to validate.
   * @param messageValidators - The message validators to run.
   * @returns The validation outcome.
   */
  private async runValidations(
    tx: Tx,
    messageValidators: Record<string, TransactionValidator>,
  ): Promise<ValidationOutcome> {
    const validationPromises = Object.entries(messageValidators).map(async ([name, { validator, severity }]) => {
      const { result } = await validator.validateTx(tx);
      return { name, isValid: result !== 'invalid', severity };
    });

    // A promise that resolves when all validations have been run
    const allValidations = await Promise.all(validationPromises);
    const failures = allValidations.filter(x => !x.isValid);
    if (failures.length > 0) {
      // Pick the most severe failure (lowest tolerance = harshest penalty)
      const failed = maxBy(failures, f => PeerErrorSeverityByHarshness.indexOf(f.severity))!;
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
