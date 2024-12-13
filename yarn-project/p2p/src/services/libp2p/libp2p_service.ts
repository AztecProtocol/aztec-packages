import {
  BlockAttestation,
  BlockProposal,
  type ClientProtocolCircuitVerifier,
  EpochProofQuote,
  type Gossipable,
  type L2BlockSource,
  MerkleTreeId,
  type PeerInfo,
  type RawGossipMessage,
  TopicTypeMap,
  Tx,
  TxHash,
  type WorldStateSynchronizer,
  getTopicTypeForClientType,
  metricsTopicStrToLabels,
} from '@aztec/circuit-types';
import { P2PClientType } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { RunningPromise } from '@aztec/foundation/running-promise';
import type { AztecKVStore } from '@aztec/kv-store';
import { Attributes, OtelMetricsAdapter, type TelemetryClient, WithTracer, trackSpan } from '@aztec/telemetry-client';

import { type ENR } from '@chainsafe/enr';
import { type GossipSub, type GossipSubComponents, gossipsub } from '@chainsafe/libp2p-gossipsub';
import { createPeerScoreParams, createTopicScoreParams } from '@chainsafe/libp2p-gossipsub/score';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { Message, PeerId, TopicValidatorResult } from '@libp2p/interface';
import '@libp2p/kad-dht';
import { mplex } from '@libp2p/mplex';
import { tcp } from '@libp2p/tcp';
import { createLibp2p } from 'libp2p';

import { type P2PConfig } from '../../config.js';
import { type MemPools } from '../../mem_pools/interface.js';
import {
  DataTxValidator,
  DoubleSpendTxValidator,
  MetadataTxValidator,
  TxProofValidator,
} from '../../tx_validator/index.js';
import { type PubSubLibp2p, convertToMultiaddr } from '../../util.js';
import { AztecDatastore } from '../data_store.js';
import { SnappyTransform, fastMsgIdFn, getMsgIdFn, msgIdToStrFn } from '../encoding.js';
import { PeerErrorSeverity } from '../peer-scoring/peer_scoring.js';
import { PeerManager } from '../peer_manager.js';
import { pingHandler, statusHandler } from '../reqresp/handlers.js';
import {
  DEFAULT_SUB_PROTOCOL_HANDLERS,
  DEFAULT_SUB_PROTOCOL_VALIDATORS,
  PING_PROTOCOL,
  type ReqRespSubProtocol,
  type ReqRespSubProtocolHandlers,
  STATUS_PROTOCOL,
  type SubProtocolMap,
  TX_REQ_PROTOCOL,
} from '../reqresp/interface.js';
import { ReqResp } from '../reqresp/reqresp.js';
import type { P2PService, PeerDiscoveryService } from '../service.js';
import { Timer } from '@aztec/foundation/timer';

interface MessageValidator {
  validator: {
    validateTx(tx: Tx): Promise<boolean>;
  };
  severity: PeerErrorSeverity;
}

interface ValidationResult {
  name: string;
  isValid: boolean;
  severity: PeerErrorSeverity;
}

type ValidationOutcome =
  | { allPassed: true }
  | { allPassed: false; failure: ValidationResult };

/**
 * Lib P2P implementation of the P2PService interface.
 */
export class LibP2PService<T extends P2PClientType> extends WithTracer implements P2PService {
  private jobQueue: SerialQueue = new SerialQueue();
  private peerManager: PeerManager;
  private discoveryRunningPromise?: RunningPromise;

  // Request and response sub service
  public reqresp: ReqResp;

  /**
   * Callback for when a block is received from a peer.
   * @param block - The block received from the peer.
   * @returns The attestation for the block, if any.
   */
  private blockReceivedCallback: (block: BlockProposal) => Promise<BlockAttestation | undefined>;

  constructor(
    private clientType: T,
    private config: P2PConfig,
    private node: PubSubLibp2p,
    private peerDiscoveryService: PeerDiscoveryService,
    private mempools: MemPools<T>,
    private l2BlockSource: L2BlockSource,
    private proofVerifier: ClientProtocolCircuitVerifier,
    private worldStateSynchronizer: WorldStateSynchronizer,
    private telemetry: TelemetryClient,
    private requestResponseHandlers: ReqRespSubProtocolHandlers = DEFAULT_SUB_PROTOCOL_HANDLERS,
    private logger = createLogger('p2p:libp2p_service'),
  ) {
    super(telemetry, 'LibP2PService');

    this.peerManager = new PeerManager(node, peerDiscoveryService, config, this.tracer, logger);
    this.node.services.pubsub.score.params.appSpecificScore = (peerId: string) => {
      return this.peerManager.getPeerScore(peerId);
    };
    this.node.services.pubsub.score.params.appSpecificWeight = 10;
    this.reqresp = new ReqResp(config, node, this.peerManager);

    this.blockReceivedCallback = (block: BlockProposal): Promise<BlockAttestation | undefined> => {
      this.logger.verbose(
        `[WARNING] handler not yet registered: Block received callback not set. Received block ${block.p2pMessageIdentifier()} from peer.`,
      );
      return Promise.resolve(undefined);
    };
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
    const { tcpListenAddress, tcpAnnounceAddress } = this.config;
    if (!tcpAnnounceAddress) {
      throw new Error('Announce address not provided.');
    }
    const announceTcpMultiaddr = convertToMultiaddr(tcpAnnounceAddress, 'tcp');

    // Start job queue, peer discovery service and libp2p node
    this.jobQueue.start();
    await this.peerDiscoveryService.start();
    await this.node.start();

    // Subscribe to standard GossipSub topics by default
    for (const topic of getTopicTypeForClientType(this.clientType)) {
      this.subscribeToTopic(TopicTypeMap[topic].p2pTopic);
    }

    // Add p2p topic validators
    this.node.services.pubsub.topicValidators.set(Tx.p2pTopic, this.validatePropagatedTxFromMessage.bind(this));

    // add GossipSub listener
    this.node.services.pubsub.addEventListener('gossipsub:message', async e => {
      const { msg, propagationSource: peerId } = e.detail;
      this.logger.trace(`Received PUBSUB message.`);

      await this.jobQueue.put(() => this.handleNewGossipMessage(msg, peerId));
    });

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
      [TX_REQ_PROTOCOL]: this.validateRequestedTx.bind(this),
    };
    await this.reqresp.start(this.requestResponseHandlers, reqrespSubProtocolValidators);
    this.logger.info(`Started P2P service`, {
      listen: tcpListenAddress,
      announce: announceTcpMultiaddr,
      peerId: this.node.peerId.toString(),
    });
  }

  /**
   * Stops the LibP2P service.
   * @returns An empty promise.
   */
  public async stop() {
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

  /**
   * Creates an instance of the LibP2P service.
   * @param config - The configuration to use when creating the service.
   * @param txPool - The transaction pool to be accessed by the service.
   * @returns The new service.
   */
  public static async new<T extends P2PClientType>(
    clientType: T,
    config: P2PConfig,
    peerDiscoveryService: PeerDiscoveryService,
    peerId: PeerId,
    mempools: MemPools<T>,
    l2BlockSource: L2BlockSource,
    proofVerifier: ClientProtocolCircuitVerifier,
    worldStateSynchronizer: WorldStateSynchronizer,
    store: AztecKVStore,
    telemetry: TelemetryClient,
  ) {
    const { tcpListenAddress, tcpAnnounceAddress, minPeerCount, maxPeerCount } = config;
    const bindAddrTcp = convertToMultiaddr(tcpListenAddress, 'tcp');
    // We know tcpAnnounceAddress cannot be null here because we set it or throw when setting up the service.
    const announceAddrTcp = convertToMultiaddr(tcpAnnounceAddress!, 'tcp');

    const datastore = new AztecDatastore(store);

    const otelMetricsAdapter = new OtelMetricsAdapter(telemetry);

    const node = await createLibp2p({
      start: false,
      peerId,
      addresses: {
        listen: [bindAddrTcp],
        announce: [announceAddrTcp],
      },
      transports: [
        tcp({
          maxConnections: config.maxPeerCount,
          // socket option: the maximum length of the queue of pending connections
          // https://nodejs.org/dist/latest-v18.x/docs/api/net.html#serverlisten
          // it's not safe if we increase this number
          backlog: 5,
          closeServerOnMaxConnections: {
            closeAbove: maxPeerCount ?? Infinity,
            listenBelow: maxPeerCount ?? Infinity,
          },
        }),
      ],
      datastore,
      streamMuxers: [yamux(), mplex()],
      connectionEncryption: [noise()],
      connectionManager: {
        minConnections: minPeerCount,
        maxConnections: maxPeerCount,
      },
      services: {
        identify: identify({
          protocolPrefix: 'aztec',
        }),
        pubsub: gossipsub({
          allowPublishToZeroTopicPeers: true,
          D: config.gossipsubD,
          Dlo: config.gossipsubDlo,
          Dhi: config.gossipsubDhi,
          heartbeatInterval: config.gossipsubInterval,
          mcacheLength: config.gossipsubMcacheLength,
          mcacheGossip: config.gossipsubMcacheGossip,
          msgIdFn: getMsgIdFn,
          msgIdToStrFn: msgIdToStrFn,
          fastMsgIdFn: fastMsgIdFn,
          dataTransform: new SnappyTransform(),
          metricsRegister: otelMetricsAdapter,
          metricsTopicStrToLabel: metricsTopicStrToLabels(),
          asyncValidation: true,
          scoreParams: createPeerScoreParams({
            topics: {
              [Tx.p2pTopic]: createTopicScoreParams({
                topicWeight: 1,
                invalidMessageDeliveriesWeight: -20,
                invalidMessageDeliveriesDecay: 0.5,
              }),
              [BlockAttestation.p2pTopic]: createTopicScoreParams({
                topicWeight: 1,
                invalidMessageDeliveriesWeight: -20,
                invalidMessageDeliveriesDecay: 0.5,
              }),
              [BlockAttestation.p2pTopic]: createTopicScoreParams({
                topicWeight: 1,
                invalidMessageDeliveriesWeight: -20,
                invalidMessageDeliveriesDecay: 0.5,
              }),
              [EpochProofQuote.p2pTopic]: createTopicScoreParams({
                topicWeight: 1,
                invalidMessageDeliveriesWeight: -20,
                invalidMessageDeliveriesDecay: 0.5,
              }),
            },
          }),
        }) as (components: GossipSubComponents) => GossipSub,
      },
    });


    // Create request response protocol handlers
    /**
     * Handler for tx requests
     * @param msg - the tx request message
     * @returns the tx response message
     */
    const txHandler = (msg: Buffer): Promise<Buffer> => {
      const txHash = TxHash.fromBuffer(msg);
      const foundTx = mempools.txPool.getTxByHash(txHash);
      const buf = foundTx ? foundTx.toBuffer() : Buffer.alloc(0);
      return Promise.resolve(buf);
    };

    const requestResponseHandlers = {
      [PING_PROTOCOL]: pingHandler,
      [STATUS_PROTOCOL]: statusHandler,
      [TX_REQ_PROTOCOL]: txHandler,
    };

    return new LibP2PService(
      clientType,
      config,
      node,
      peerDiscoveryService,
      mempools,
      l2BlockSource,
      proofVerifier,
      worldStateSynchronizer,
      telemetry,
      requestResponseHandlers,
    );
  }

  public getPeers(includePending?: boolean): PeerInfo[] {
    return this.peerManager.getPeers(includePending);
  }

  /**
   * Send Request via the ReqResp service
   * The subprotocol defined will determine the request and response types
   *
   * See the subProtocolMap for the mapping of subprotocols to request/response types in `interface.ts`
   *
   * @param protocol The request response protocol to use
   * @param request The request type to send
   * @returns
   */
  sendRequest<SubProtocol extends ReqRespSubProtocol>(
    protocol: SubProtocol,
    request: InstanceType<SubProtocolMap[SubProtocol]['request']>,
  ): Promise<InstanceType<SubProtocolMap[SubProtocol]['response']> | undefined> {
    return this.reqresp.sendRequest(protocol, request);
  }

  /**
   * Get the ENR of the node
   * @returns The ENR of the node
   */
  public getEnr(): ENR | undefined {
    return this.peerDiscoveryService.getEnr();
  }

  public registerBlockReceivedCallback(callback: (block: BlockProposal) => Promise<BlockAttestation | undefined>) {
    this.blockReceivedCallback = callback;
    this.logger.verbose('Block received callback registered');
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
   * @param data - The data to publish.
   * @returns The number of recipients the data was sent to.
   */
  private async publishToTopic(topic: string, data: Uint8Array) {
    if (!this.node.services.pubsub) {
      throw new Error('Pubsub service not available.');
    }
    const result = await this.node.services.pubsub.publish(topic, data);

    return result.recipients.length;
  }

  /**
   * Handles a new gossip message that was received by the client.
   * @param topic - The message's topic.
   * @param data - The message data
   */
  private async handleNewGossipMessage(message: RawGossipMessage, peerId: PeerId) {
    if (message.topic === Tx.p2pTopic) {
      const tx = Tx.fromBuffer(Buffer.from(message.data));
      await this.processTxFromPeer(tx, peerId);
    }
    if (message.topic === BlockAttestation.p2pTopic && this.clientType === P2PClientType.Full) {
      const attestation = BlockAttestation.fromBuffer(Buffer.from(message.data));
      await this.processAttestationFromPeer(attestation);
    }
    if (message.topic == BlockProposal.p2pTopic) {
      const block = BlockProposal.fromBuffer(Buffer.from(message.data));
      await this.processBlockFromPeer(block);
    }
    if (message.topic == EpochProofQuote.p2pTopic) {
      const epochProofQuote = EpochProofQuote.fromBuffer(Buffer.from(message.data));
      this.processEpochProofQuoteFromPeer(epochProofQuote);
    }

    return;
  }

  /**Process Attestation From Peer
   * When a proposal is received from a peer, we add it to the attestation pool, so it can be accessed by other services.
   *
   * @param attestation - The attestation to process.
   */
  @trackSpan('Libp2pService.processAttestationFromPeer', attestation => ({
    [Attributes.BLOCK_NUMBER]: attestation.payload.header.globalVariables.blockNumber.toNumber(),
    [Attributes.SLOT_NUMBER]: attestation.payload.header.globalVariables.slotNumber.toNumber(),
    [Attributes.BLOCK_ARCHIVE]: attestation.archive.toString(),
    [Attributes.P2P_ID]: attestation.p2pMessageIdentifier().toString(),
  }))
  private async processAttestationFromPeer(attestation: BlockAttestation): Promise<void> {
    this.logger.debug(`Received attestation ${attestation.p2pMessageIdentifier()} from external peer.`);
    await this.mempools.attestationPool!.addAttestations([attestation]);
  }

  /**Process block from peer
   *
   * Pass the received block to the validator client
   *
   * @param block - The block to process.
   */
  // REVIEW: callback pattern https://github.com/AztecProtocol/aztec-packages/issues/7963
  @trackSpan('Libp2pService.processBlockFromPeer', block => ({
    [Attributes.BLOCK_NUMBER]: block.payload.header.globalVariables.blockNumber.toNumber(),
    [Attributes.SLOT_NUMBER]: block.payload.header.globalVariables.slotNumber.toNumber(),
    [Attributes.BLOCK_ARCHIVE]: block.archive.toString(),
    [Attributes.P2P_ID]: block.p2pMessageIdentifier().toString(),
  }))
  private async processBlockFromPeer(block: BlockProposal): Promise<void> {
    this.logger.verbose(`Received block ${block.p2pMessageIdentifier()} from external peer.`);
    const attestation = await this.blockReceivedCallback(block);

    // TODO: fix up this pattern - the abstraction is not nice
    // The attestation can be undefined if no handler is registered / the validator deems the block invalid
    if (attestation != undefined) {
      this.logger.verbose(`Broadcasting attestation ${attestation.p2pMessageIdentifier()}`);
      this.broadcastAttestation(attestation);
    }
  }

  /**
   * Broadcast an attestation to all peers.
   * @param attestation - The attestation to broadcast.
   */
  @trackSpan('Libp2pService.broadcastAttestation', attestation => ({
    [Attributes.BLOCK_NUMBER]: attestation.payload.header.globalVariables.blockNumber.toNumber(),
    [Attributes.SLOT_NUMBER]: attestation.payload.header.globalVariables.slotNumber.toNumber(),
    [Attributes.BLOCK_ARCHIVE]: attestation.archive.toString(),
    [Attributes.P2P_ID]: attestation.p2pMessageIdentifier().toString(),
  }))
  private broadcastAttestation(attestation: BlockAttestation): void {
    this.propagate(attestation);
  }

  private processEpochProofQuoteFromPeer(epochProofQuote: EpochProofQuote): void {
    this.logger.verbose(`Received epoch proof quote ${epochProofQuote.p2pMessageIdentifier()} from external peer.`);
    this.mempools.epochProofQuotePool.addQuote(epochProofQuote);
  }

  /**
   * Propagates provided message to peers.
   * @param message - The message to propagate.
   */
  public propagate<T extends Gossipable>(message: T): void {
    this.logger.trace(`[${message.p2pMessageIdentifier()}] queued`);
    void this.jobQueue.put(async () => {
      await this.sendToPeers(message);
    });
  }

  private async processTxFromPeer(tx: Tx, _peerId: PeerId): Promise<void> {
    const txHash = tx.getTxHash();
    const txHashString = txHash.toString();
    this.logger.verbose(`Received tx ${txHashString} from external peer.`);


  }

  /**
   * Validate a tx that has been requested from a peer.
   *
   * The core component of this validator is that the tx hash MUST match the requested tx hash,
   * In order to perform this check, the tx proof must be verified.
   *
   * Note: This function is called from within `ReqResp.sendRequest` as part of the
   * TX_REQ_PROTOCOL subprotocol validation.
   *
   * @param requestedTxHash - The hash of the tx that was requested.
   * @param responseTx - The tx that was received as a response to the request.
   * @param peerId - The peer ID of the peer that sent the tx.
   * @returns True if the tx is valid, false otherwise.
   */
  @trackSpan('Libp2pService.validateRequestedTx', (requestedTxHash, _responseTx) => ({
    [Attributes.TX_HASH]: requestedTxHash.toString(),
  }))
  private async validateRequestedTx(requestedTxHash: TxHash, responseTx: Tx, peerId: PeerId): Promise<boolean> {
    const proofValidator = new TxProofValidator(this.proofVerifier);
    const validProof = await proofValidator.validateTx(responseTx);

    // If the node returns the wrong data, we penalize it
    if (!requestedTxHash.equals(responseTx.getTxHash())) {
      // Returning the wrong data is a low tolerance error
      this.peerManager.penalizePeer(peerId, PeerErrorSeverity.MidToleranceError);
      return false;
    }

    if (!validProof) {
      // If the proof is invalid, but the txHash is correct, then this is an active attack and we severly punish
      this.peerManager.penalizePeer(peerId, PeerErrorSeverity.LowToleranceError);
      return false;
    }

    return true;
  }

  private async validatePropagatedTxFromMessage(propagationSource: PeerId, msg: Message): Promise<TopicValidatorResult> {
    const tx = Tx.fromBuffer(Buffer.from(msg.data));
    const timer = new Timer();
    const isValid = await this.validatePropagatedTx(tx, propagationSource);
    this.logger.info(`\n\n\n validatePropagatedTx took ${timer.ms()}ms \n\n\n`);
    this.logger.trace(`validatePropagatedTx: ${isValid}`, {
      [Attributes.TX_HASH]: tx.getTxHash().toString(),
      [Attributes.P2P_ID]: propagationSource.toString(),
    });
    return isValid ? TopicValidatorResult.Accept : TopicValidatorResult.Reject;
  }

  @trackSpan('Libp2pService.validatePropagatedTx', tx => ({
    [Attributes.TX_HASH]: tx.getTxHash().toString(),
  }))
  private async validatePropagatedTx(tx: Tx, peerId: PeerId): Promise<boolean> {
    const blockNumber = (await this.l2BlockSource.getBlockNumber()) + 1;
    const messageValidators = this.createMessageValidators(blockNumber);
    const outcome = await this.runValidations(tx, messageValidators);

    if (outcome.allPassed) {
      return true;
    }

    const { name, severity } = outcome.failure;

    // Double spend validator has a special case handler
    if (name === 'doubleSpendValidator') {
      const isValid = await this.handleDoubleSpendFailure(tx, blockNumber, peerId);
      if (isValid) return true;
    }

    this.peerManager.penalizePeer(peerId, severity);
    return false;
  }

  /**
   * Create message validators for the given block number.
   *
   * Each validator is a pair of a validator and a severity.
   * If a validator fails, the peer is penalized with the severity of the validator.
   *
   * @param blockNumber - The block number to create validators for.
   * @returns The message validators.
   */
  private createMessageValidators(blockNumber: number): Record<string, MessageValidator> {
    return {
      dataValidator: {
        validator: new DataTxValidator(),
        severity: PeerErrorSeverity.HighToleranceError,
      },
      metadataValidator: {
        validator: new MetadataTxValidator(new Fr(this.config.l1ChainId), new Fr(blockNumber)),
        severity: PeerErrorSeverity.HighToleranceError,
      },
      proofValidator: {
        validator: new TxProofValidator(this.proofVerifier),
        severity: PeerErrorSeverity.MidToleranceError,
      },
      doubleSpendValidator: {
        validator: new DoubleSpendTxValidator({
          getNullifierIndex: async (nullifier: Fr) => {
            const merkleTree = this.worldStateSynchronizer.getCommitted();
            const index = (await merkleTree.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]))[0];
            return index;
          },
        }),
        severity: PeerErrorSeverity.HighToleranceError,
      },
    };
  }

  /**
   * Run validations on a tx.
   * @param tx - The tx to validate.
   * @param messageValidators - The message validators to run.
   * @returns The validation outcome.
   */
  private async runValidations(
    tx: Tx,
    messageValidators: Record<string, MessageValidator>
  ): Promise<ValidationOutcome> {
    const validationPromises = Object.entries(messageValidators).map(async ([name, { validator, severity }]) => {
      const timer = new Timer();
      const isValid = await validator.validateTx(tx);
      this.logger.info(`\n\n\n VALIDATOR: ${name} took ${timer.ms()}ms \n\n\n`);
      return { name, isValid, severity };
    });

    // A promise that resolves when all validations have been run
    const allValidations = Promise.all(validationPromises);

    // A promise that resolves when the first validation fails
    const firstFailure = Promise.race(
      validationPromises.map(async (promise) => {
        const result = await promise;
        return result.isValid ? new Promise(() => {}) : result;
      })
    );

    // Wait for the first validation to fail or all validations to pass
    const result = await Promise.race([
      allValidations.then(() => ({ allPassed: true as const })),
      firstFailure.then(failure => ({ allPassed: false as const, failure: failure as ValidationResult }))
    ]);

    // If all validations pass, allPassed will be true, if failed, then the failure will be the first validation to fail
    return result;
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
   * @returns True if the tx is valid, false otherwise.
   */
  private async handleDoubleSpendFailure(tx: Tx, blockNumber: number, peerId: PeerId): Promise<boolean> {
    if (blockNumber <= this.config.severePeerPenaltyBlockLength) {
      return false;
    }

    const snapshotValidator = new DoubleSpendTxValidator({
      getNullifierIndex: async (nullifier: Fr) => {
        const merkleTree = this.worldStateSynchronizer.getSnapshot(
          blockNumber - this.config.severePeerPenaltyBlockLength,
        );
        const index = (await merkleTree.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]))[0];
        return index;
      },
    });

    const validSnapshot = await snapshotValidator.validateTx(tx);
    if (!validSnapshot) {
      this.peerManager.penalizePeer(peerId, PeerErrorSeverity.LowToleranceError);
      return false;
    }

    return true;
  }

  public getPeerScore(peerId: PeerId): number {
    return this.node.services.pubsub.score.score(peerId.toString());
  }

  private async sendToPeers<T extends Gossipable>(message: T) {
    const parent = message.constructor as typeof Gossipable;

    const identifier = message.p2pMessageIdentifier().toString();
    this.logger.trace(`Sending message ${identifier}`);

    const recipientsNum = await this.publishToTopic(parent.p2pTopic, message.toBuffer());
    this.logger.debug(`Sent message ${identifier} to ${recipientsNum} peers`);
  }

  // Libp2p seems to hang sometimes if new peers are initiating connections.
  private async stopLibP2P() {
    const TIMEOUT_MS = 5000; // 5 seconds timeout
    const timeout = new Promise((resolve, reject) => {
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
