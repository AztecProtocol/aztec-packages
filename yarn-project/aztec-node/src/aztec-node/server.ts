import { Archiver, createArchiver } from '@aztec/archiver';
import { BBCircuitVerifier, BatchChonkVerifier, QueuedIVCVerifier } from '@aztec/bb-prover';
import { TestCircuitVerifier } from '@aztec/bb-prover/test';
import { type BlobClientInterface, createBlobClientWithFileStores } from '@aztec/blob-client/client';
import { Blob } from '@aztec/blob-lib';
import { ARCHIVE_HEIGHT, type L1_TO_L2_MSG_TREE_HEIGHT, type NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import { EpochCache, type EpochCacheInterface } from '@aztec/epoch-cache';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { getPublicClient, makeL1HttpTransport } from '@aztec/ethereum/client';
import { RegistryContract, RollupContract } from '@aztec/ethereum/contracts';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { chunkBy, compactArray, pick, unique } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { count } from '@aztec/foundation/string';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import { MembershipWitness, SiblingPath } from '@aztec/foundation/trees';
import { type KeyStore, KeystoreManager, loadKeystores, mergeKeystores } from '@aztec/node-keystore';
import { trySnapshotSync, uploadSnapshot } from '@aztec/node-lib/actions';
import { createForwarderL1TxUtilsFromSigners, createL1TxUtilsFromSigners } from '@aztec/node-lib/factories';
import {
  type P2P,
  type P2PClientDeps,
  createP2PClient,
  createTxValidatorForAcceptingTxsOverRPC,
  getDefaultAllowedSetupFunctions,
} from '@aztec/p2p';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { type ProverNode, type ProverNodeDeps, createProverNode } from '@aztec/prover-node';
import { createKeyStoreForProver } from '@aztec/prover-node/config';
import { GlobalVariableBuilder, SequencerClient, type SequencerPublisher } from '@aztec/sequencer-client';
import { PublicProcessorFactory } from '@aztec/simulator/server';
import {
  AttestationsBlockWatcher,
  EpochPruneWatcher,
  type SlasherClientInterface,
  type Watcher,
  createSlasher,
} from '@aztec/slasher';
import { CollectionLimitsConfig, PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type BlockData,
  BlockHash,
  type BlockParameter,
  type DataInBlock,
  L2Block,
  type L2BlockSource,
} from '@aztec/stdlib/block';
import type { PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type {
  ContractClassPublic,
  ContractDataSource,
  ContractInstanceWithAddress,
  NodeInfo,
  ProtocolContractAddresses,
} from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import {
  type AztecNode,
  type AztecNodeAdmin,
  type AztecNodeAdminConfig,
  AztecNodeAdminConfigSchema,
  type GetContractClassLogsResponse,
  type GetPublicLogsResponse,
} from '@aztec/stdlib/interfaces/client';
import {
  type AllowedElement,
  type ClientProtocolCircuitVerifier,
  type L2LogsSource,
  type Service,
  type WorldStateSyncStatus,
  type WorldStateSynchronizer,
  tryStop,
} from '@aztec/stdlib/interfaces/server';
import type { DebugLogStore, LogFilter, SiloedTag, Tag, TxScopedL2Log } from '@aztec/stdlib/logs';
import { InMemoryDebugLogStore, NullDebugLogStore } from '@aztec/stdlib/logs';
import { InboxLeaf, type L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { Offense, SlashPayloadRound } from '@aztec/stdlib/slashing';
import type { NullifierLeafPreimage, PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import { MerkleTreeId, NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import {
  type BlockHeader,
  type GlobalVariableBuilder as GlobalVariableBuilderInterface,
  type IndexedTxEffect,
  PublicSimulationOutput,
  Tx,
  type TxHash,
  TxReceipt,
  TxStatus,
  type TxValidationResult,
} from '@aztec/stdlib/tx';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import type { SingleValidatorStats, ValidatorsStats } from '@aztec/stdlib/validators';
import {
  Attributes,
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';
import {
  FullNodeCheckpointsBuilder as CheckpointsBuilder,
  FullNodeCheckpointsBuilder,
  NodeKeystoreAdapter,
  ValidatorClient,
  createBlockProposalHandler,
  createValidatorClient,
} from '@aztec/validator-client';
import type { SlashingProtectionDatabase } from '@aztec/validator-ha-signer/types';
import { createWorldStateSynchronizer } from '@aztec/world-state';

import { createPublicClient } from 'viem';

import { createSentinel } from '../sentinel/factory.js';
import { Sentinel } from '../sentinel/sentinel.js';
import { type AztecNodeConfig, createKeyStoreForValidator } from './config.js';
import { NodeMetrics } from './node_metrics.js';

/**
 * The aztec node.
 */
export class AztecNodeService implements AztecNode, AztecNodeAdmin, Traceable {
  private metrics: NodeMetrics;
  private initialHeaderHashPromise: Promise<BlockHash> | undefined = undefined;

  // Prevent two snapshot operations to happen simultaneously
  private isUploadingSnapshot = false;

  public readonly tracer: Tracer;

  constructor(
    protected config: AztecNodeConfig,
    protected readonly p2pClient: P2P,
    protected readonly blockSource: L2BlockSource & Partial<Service>,
    protected readonly logsSource: L2LogsSource,
    protected readonly contractDataSource: ContractDataSource,
    protected readonly l1ToL2MessageSource: L1ToL2MessageSource,
    protected readonly worldStateSynchronizer: WorldStateSynchronizer,
    protected readonly sequencer: SequencerClient | undefined,
    protected readonly proverNode: ProverNode | undefined,
    protected readonly slasherClient: SlasherClientInterface | undefined,
    protected readonly validatorsSentinel: Sentinel | undefined,
    protected readonly epochPruneWatcher: EpochPruneWatcher | undefined,
    protected readonly l1ChainId: number,
    protected readonly version: number,
    protected readonly globalVariableBuilder: GlobalVariableBuilderInterface,
    protected readonly epochCache: EpochCacheInterface,
    protected readonly packageVersion: string,
    private peerProofVerifier: ClientProtocolCircuitVerifier,
    private rpcProofVerifier: ClientProtocolCircuitVerifier,
    private telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('node'),
    private blobClient?: BlobClientInterface,
    private validatorClient?: ValidatorClient,
    private keyStoreManager?: KeystoreManager,
    private debugLogStore: DebugLogStore = new NullDebugLogStore(),
  ) {
    this.metrics = new NodeMetrics(telemetry, 'AztecNodeService');
    this.tracer = telemetry.getTracer('AztecNodeService');

    this.log.info(`Aztec Node version: ${this.packageVersion}`);
    this.log.info(`Aztec Node started on chain 0x${l1ChainId.toString(16)}`, config.l1Contracts);

    // A defensive check that protects us against introducing a bug in the complex `createAndSync` function. We must
    // never have debugLogStore enabled when not in test mode because then we would be accumulating debug logs in
    // memory which could be a DoS vector on the sequencer (since no fees are paid for debug logs).
    if (debugLogStore.isEnabled && config.realProofs) {
      throw new Error('debugLogStore should never be enabled when realProofs are set');
    }
  }

  /** @internal Exposed for testing — returns the RPC proof verifier. */
  public getProofVerifier(): ClientProtocolCircuitVerifier {
    return this.rpcProofVerifier;
  }

  public async getWorldStateSyncStatus(): Promise<WorldStateSyncStatus> {
    const status = await this.worldStateSynchronizer.status();
    return status.syncSummary;
  }

  public getL2Tips() {
    return this.blockSource.getL2Tips();
  }

  /**
   * initializes the Aztec Node, wait for component to sync.
   * @param config - The configuration to be used by the aztec node.
   * @returns - A fully synced Aztec Node for use in development/testing.
   */
  public static async createAndSync(
    inputConfig: AztecNodeConfig,
    deps: {
      telemetry?: TelemetryClient;
      logger?: Logger;
      publisher?: SequencerPublisher;
      dateProvider?: DateProvider;
      p2pClientDeps?: P2PClientDeps;
      proverNodeDeps?: Partial<ProverNodeDeps>;
      slashingProtectionDb?: SlashingProtectionDatabase;
    } = {},
    options: {
      prefilledPublicData?: PublicDataTreeLeaf[];
      dontStartSequencer?: boolean;
      dontStartProverNode?: boolean;
    } = {},
  ): Promise<AztecNodeService> {
    const config = { ...inputConfig }; // Copy the config so we dont mutate the input object
    const log = deps.logger ?? createLogger('node');
    const packageVersion = getPackageVersion() ?? '';
    const telemetry = deps.telemetry ?? getTelemetryClient();
    const dateProvider = deps.dateProvider ?? new DateProvider();
    const ethereumChain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);

    // Build a key store from file if given or from environment otherwise.
    // We keep the raw KeyStore available so we can merge with prover keys if enableProverNode is set.
    let keyStoreManager: KeystoreManager | undefined;
    const keyStoreProvided = config.keyStoreDirectory !== undefined && config.keyStoreDirectory.length > 0;
    if (keyStoreProvided) {
      const keyStores = loadKeystores(config.keyStoreDirectory!);
      keyStoreManager = new KeystoreManager(mergeKeystores(keyStores));
    } else {
      const rawKeyStores: KeyStore[] = [];
      const validatorKeyStore = createKeyStoreForValidator(config);
      if (validatorKeyStore) {
        rawKeyStores.push(validatorKeyStore);
      }
      if (config.enableProverNode) {
        const proverKeyStore = createKeyStoreForProver(config);
        if (proverKeyStore) {
          rawKeyStores.push(proverKeyStore);
        }
      }
      if (rawKeyStores.length > 0) {
        keyStoreManager = new KeystoreManager(
          rawKeyStores.length === 1 ? rawKeyStores[0] : mergeKeystores(rawKeyStores),
        );
      }
    }

    await keyStoreManager?.validateSigners();

    // If we are a validator, verify our configuration before doing too much more.
    if (!config.disableValidator) {
      if (keyStoreManager === undefined) {
        throw new Error('Failed to create key store, a requirement for running a validator');
      }
      if (!keyStoreProvided && process.env.NODE_ENV !== 'test') {
        log.warn("Keystore created from env: it's recommended to use a file-based key store for production");
      }
      ValidatorClient.validateKeyStoreConfiguration(keyStoreManager, log);
    }

    // validate that the actual chain id matches that specified in configuration
    if (config.l1ChainId !== ethereumChain.chainInfo.id) {
      throw new Error(
        `RPC URL configured for chain id ${ethereumChain.chainInfo.id} but expected id ${config.l1ChainId}`,
      );
    }

    const publicClient = createPublicClient({
      chain: ethereumChain.chainInfo,
      transport: makeL1HttpTransport(config.l1RpcUrls, { timeout: config.l1HttpTimeoutMS }),
      pollingInterval: config.viemPollingIntervalMS,
    });

    const l1ContractsAddresses = await RegistryContract.collectAddresses(
      publicClient,
      config.l1Contracts.registryAddress,
      config.rollupVersion ?? 'canonical',
    );

    // Overwrite the passed in vars.
    config.l1Contracts = { ...config.l1Contracts, ...l1ContractsAddresses };

    const rollupContract = new RollupContract(publicClient, config.l1Contracts.rollupAddress.toString());
    const [l1GenesisTime, slotDuration, rollupVersionFromRollup, rollupManaLimit] = await Promise.all([
      rollupContract.getL1GenesisTime(),
      rollupContract.getSlotDuration(),
      rollupContract.getVersion(),
      rollupContract.getManaLimit().then(Number),
    ] as const);

    config.rollupVersion ??= Number(rollupVersionFromRollup);

    if (config.rollupVersion !== Number(rollupVersionFromRollup)) {
      log.warn(
        `Registry looked up and returned a rollup with version (${config.rollupVersion}), but this does not match with version detected from the rollup directly: (${rollupVersionFromRollup}).`,
      );
    }

    const blobClient = await createBlobClientWithFileStores(config, log.createChild('blob-client'));

    // attempt snapshot sync if possible
    await trySnapshotSync(config, log);

    const epochCache = await EpochCache.create(config.l1Contracts.rollupAddress, config, { dateProvider });

    const archiver = await createArchiver(
      config,
      { blobClient, epochCache, telemetry, dateProvider },
      { blockUntilSync: !config.skipArchiverInitialSync },
    );

    // now create the merkle trees and the world state synchronizer
    const worldStateSynchronizer = await createWorldStateSynchronizer(
      config,
      archiver,
      options.prefilledPublicData,
      telemetry,
    );
    const useRealVerifiers = config.realProofs || config.debugForceTxProofVerification;
    let peerProofVerifier: ClientProtocolCircuitVerifier;
    let rpcProofVerifier: ClientProtocolCircuitVerifier;
    if (useRealVerifiers) {
      peerProofVerifier = await BatchChonkVerifier.new(config, config.bbChonkVerifyMaxBatch, 'peer');
      const rpcVerifier = await BBCircuitVerifier.new(config);
      rpcProofVerifier = new QueuedIVCVerifier(rpcVerifier, config.numConcurrentIVCVerifiers);
    } else {
      peerProofVerifier = new TestCircuitVerifier(config.proverTestVerificationDelayMs);
      rpcProofVerifier = new TestCircuitVerifier(config.proverTestVerificationDelayMs);
    }

    let debugLogStore: DebugLogStore;
    if (!config.realProofs) {
      log.warn(`Aztec node is accepting fake proofs`);

      debugLogStore = new InMemoryDebugLogStore();
      log.info(
        'Aztec node started in test mode (realProofs set to false) hence debug logs from public functions will be collected and served',
      );
    } else {
      debugLogStore = new NullDebugLogStore();
    }

    const proverOnly = config.enableProverNode && config.disableValidator;
    if (proverOnly) {
      log.info('Starting in prover-only mode: skipping validator, sequencer, sentinel, and slasher subsystems');
    }

    // create the tx pool and the p2p client, which will need the l2 block source
    const p2pClient = await createP2PClient(
      config,
      archiver,
      peerProofVerifier,
      worldStateSynchronizer,
      epochCache,
      packageVersion,
      dateProvider,
      telemetry,
      deps.p2pClientDeps,
    );

    // We'll accumulate sentinel watchers here
    const watchers: Watcher[] = [];

    // Create FullNodeCheckpointsBuilder for block proposal handling and tx validation.
    // Override maxTxsPerCheckpoint with the validator-specific limit if set.
    const validatorCheckpointsBuilder = new FullNodeCheckpointsBuilder(
      {
        ...config,
        l1GenesisTime,
        slotDuration: Number(slotDuration),
        rollupManaLimit,
        maxTxsPerCheckpoint: config.validateMaxTxsPerCheckpoint,
      },
      worldStateSynchronizer,
      archiver,
      dateProvider,
      telemetry,
    );

    let validatorClient: ValidatorClient | undefined;

    if (!proverOnly) {
      // Create validator client if required
      validatorClient = await createValidatorClient(config, {
        checkpointsBuilder: validatorCheckpointsBuilder,
        worldState: worldStateSynchronizer,
        p2pClient,
        telemetry,
        dateProvider,
        epochCache,
        blockSource: archiver,
        l1ToL2MessageSource: archiver,
        keyStoreManager,
        blobClient,
        slashingProtectionDb: deps.slashingProtectionDb,
      });

      // If we have a validator client, register it as a source of offenses for the slasher,
      // and have it register callbacks on the p2p client *before* we start it, otherwise messages
      // like attestations or auths will fail.
      if (validatorClient) {
        watchers.push(validatorClient);
        if (!options.dontStartSequencer) {
          await validatorClient.registerHandlers();
        }
      }
    }

    // If there's no validator client, create a BlockProposalHandler to handle block proposals
    // for monitoring or reexecution. Reexecution (default) allows us to follow the pending chain,
    // while non-reexecution is used for validating the proposals and collecting their txs.
    if (!validatorClient) {
      const reexecute = !!config.alwaysReexecuteBlockProposals;
      log.info(`Setting up block proposal handler` + (reexecute ? ' with reexecution of proposals' : ''));
      createBlockProposalHandler(config, {
        checkpointsBuilder: validatorCheckpointsBuilder,
        worldState: worldStateSynchronizer,
        epochCache,
        blockSource: archiver,
        l1ToL2MessageSource: archiver,
        p2pClient,
        dateProvider,
        telemetry,
      }).register(p2pClient, reexecute);
    }

    // Start world state and wait for it to sync to the archiver.
    await worldStateSynchronizer.start();

    // Start p2p. Note that it depends on world state to be running.
    await p2pClient.start();

    let validatorsSentinel: Awaited<ReturnType<typeof createSentinel>> | undefined;
    let epochPruneWatcher: EpochPruneWatcher | undefined;
    let attestationsBlockWatcher: AttestationsBlockWatcher | undefined;

    if (!proverOnly) {
      validatorsSentinel = await createSentinel(epochCache, archiver, p2pClient, config);
      if (validatorsSentinel && config.slashInactivityPenalty > 0n) {
        watchers.push(validatorsSentinel);
      }

      if (config.slashPrunePenalty > 0n || config.slashDataWithholdingPenalty > 0n) {
        epochPruneWatcher = new EpochPruneWatcher(
          archiver,
          archiver,
          epochCache,
          p2pClient.getTxProvider(),
          validatorCheckpointsBuilder,
          config,
        );
        watchers.push(epochPruneWatcher);
      }

      // We assume we want to slash for invalid attestations unless all max penalties are set to 0
      if (config.slashProposeInvalidAttestationsPenalty > 0n || config.slashAttestDescendantOfInvalidPenalty > 0n) {
        attestationsBlockWatcher = new AttestationsBlockWatcher(archiver, epochCache, config);
        watchers.push(attestationsBlockWatcher);
      }
    }

    // Start p2p-related services once the archiver has completed sync
    void archiver
      .waitForInitialSync()
      .then(async () => {
        await p2pClient.start();
        await validatorsSentinel?.start();
        await epochPruneWatcher?.start();
        await attestationsBlockWatcher?.start();
        log.info(`All p2p services started`);
      })
      .catch(err => log.error('Failed to start p2p services after archiver sync', err));

    const globalVariableBuilder = new GlobalVariableBuilder(dateProvider, publicClient, {
      l1Contracts: config.l1Contracts,
      ethereumSlotDuration: config.ethereumSlotDuration,
      rollupVersion: BigInt(config.rollupVersion),
      l1GenesisTime,
      slotDuration: Number(slotDuration),
    });

    // Validator enabled, create/start relevant service
    let sequencer: SequencerClient | undefined;
    let slasherClient: SlasherClientInterface | undefined;
    if (!config.disableValidator && validatorClient) {
      // We create a slasher only if we have a sequencer, since all slashing actions go through the sequencer publisher
      // as they are executed when the node is selected as proposer.
      const validatorAddresses = keyStoreManager
        ? NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager).getAddresses()
        : [];

      slasherClient = await createSlasher(
        config,
        config.l1Contracts,
        getPublicClient(config),
        watchers,
        dateProvider,
        epochCache,
        validatorAddresses,
        undefined, // logger
      );
      await slasherClient.start();

      const l1TxUtils = config.sequencerPublisherForwarderAddress
        ? await createForwarderL1TxUtilsFromSigners(
            publicClient,
            keyStoreManager!.createAllValidatorPublisherSigners(),
            config.sequencerPublisherForwarderAddress,
            { ...config, scope: 'sequencer' },
            { telemetry, logger: log.createChild('l1-tx-utils'), dateProvider, kzg: Blob.getViemKzgInstance() },
          )
        : await createL1TxUtilsFromSigners(
            publicClient,
            keyStoreManager!.createAllValidatorPublisherSigners(),
            { ...config, scope: 'sequencer' },
            { telemetry, logger: log.createChild('l1-tx-utils'), dateProvider, kzg: Blob.getViemKzgInstance() },
          );

      // Create a funder L1TxUtils from the keystore funding account (if configured)
      const fundingSigner = keyStoreManager?.createFundingSigner();
      let funderL1TxUtils: L1TxUtils | undefined;
      if (fundingSigner) {
        const [funder] = await createL1TxUtilsFromSigners(
          publicClient,
          [fundingSigner],
          { ...config, scope: 'sequencer' },
          { telemetry, logger: log.createChild('l1-tx-utils:funder'), dateProvider },
        );
        funderL1TxUtils = funder;
      }

      // Create and start the sequencer client
      const checkpointsBuilder = new CheckpointsBuilder(
        { ...config, l1GenesisTime, slotDuration: Number(slotDuration), rollupManaLimit },
        worldStateSynchronizer,
        archiver,
        dateProvider,
        telemetry,
        debugLogStore,
      );

      sequencer = await SequencerClient.new(config, {
        ...deps,
        epochCache,
        l1TxUtils,
        funderL1TxUtils,
        validatorClient,
        p2pClient,
        worldStateSynchronizer,
        slasherClient,
        checkpointsBuilder,
        l2BlockSource: archiver,
        l1ToL2MessageSource: archiver,
        telemetry,
        dateProvider,
        blobClient,
        nodeKeyStore: keyStoreManager!,
        globalVariableBuilder,
      });
    }

    if (!options.dontStartSequencer && sequencer) {
      await sequencer.start();
      log.verbose(`Sequencer started`);
    } else if (sequencer) {
      log.warn(`Sequencer created but not started`);
    }

    // Create prover node subsystem if enabled
    let proverNode: ProverNode | undefined;
    if (config.enableProverNode) {
      proverNode = await createProverNode(config, {
        ...deps.proverNodeDeps,
        telemetry,
        dateProvider,
        archiver,
        worldStateSynchronizer,
        p2pClient,
        epochCache,
        blobClient,
        keyStoreManager,
      });

      if (!options.dontStartProverNode) {
        await proverNode.start();
        log.info(`Prover node subsystem started`);
      } else {
        log.info(`Prover node subsystem created but not started`);
      }
    }

    const node = new AztecNodeService(
      config,
      p2pClient,
      archiver,
      archiver,
      archiver,
      archiver,
      worldStateSynchronizer,
      sequencer,
      proverNode,
      slasherClient,
      validatorsSentinel,
      epochPruneWatcher,
      ethereumChain.chainInfo.id,
      config.rollupVersion,
      globalVariableBuilder,
      epochCache,
      packageVersion,
      peerProofVerifier,
      rpcProofVerifier,
      telemetry,
      log,
      blobClient,
      validatorClient,
      keyStoreManager,
      debugLogStore,
    );

    return node;
  }

  /**
   * Returns the sequencer client instance.
   * @returns The sequencer client instance.
   */
  public getSequencer(): SequencerClient | undefined {
    return this.sequencer;
  }

  /** Returns the prover node subsystem, if enabled. */
  public getProverNode(): ProverNode | undefined {
    return this.proverNode;
  }

  public getBlockSource(): L2BlockSource {
    return this.blockSource;
  }

  public getContractDataSource(): ContractDataSource {
    return this.contractDataSource;
  }

  public getP2P(): P2P {
    return this.p2pClient;
  }

  /**
   * Method to return the currently deployed L1 contract addresses.
   * @returns - The currently deployed L1 contract addresses.
   */
  public getL1ContractAddresses(): Promise<L1ContractAddresses> {
    return Promise.resolve(this.config.l1Contracts);
  }

  public getEncodedEnr(): Promise<string | undefined> {
    return Promise.resolve(this.p2pClient.getEnr()?.encodeTxt());
  }

  public async getAllowedPublicSetup(): Promise<AllowedElement[]> {
    return [...(await getDefaultAllowedSetupFunctions()), ...(this.config.txPublicSetupAllowListExtend ?? [])];
  }

  /**
   * Method to determine if the node is ready to accept transactions.
   * @returns - Flag indicating the readiness for tx submission.
   */
  public isReady() {
    return Promise.resolve(this.p2pClient.isReady() ?? false);
  }

  public async getNodeInfo(): Promise<NodeInfo> {
    const [nodeVersion, rollupVersion, chainId, enr, contractAddresses, protocolContractAddresses] = await Promise.all([
      this.getNodeVersion(),
      this.getVersion(),
      this.getChainId(),
      this.getEncodedEnr(),
      this.getL1ContractAddresses(),
      this.getProtocolContractAddresses(),
    ]);

    const nodeInfo: NodeInfo = {
      nodeVersion,
      l1ChainId: chainId,
      rollupVersion,
      enr,
      l1ContractAddresses: contractAddresses,
      protocolContractAddresses: protocolContractAddresses,
      realProofs: !!this.config.realProofs,
    };

    return nodeInfo;
  }

  /**
   * Get a block specified by its block number, block hash, or 'latest'.
   * @param block - The block parameter (block number, block hash, or 'latest').
   * @returns The requested block.
   */
  public async getBlock(block: BlockParameter): Promise<L2Block | undefined> {
    if (BlockHash.isBlockHash(block)) {
      return this.getBlockByHash(block);
    }
    const blockNumber = block === 'latest' ? await this.getBlockNumber() : (block as BlockNumber);
    if (blockNumber === BlockNumber.ZERO) {
      return this.buildInitialBlock();
    }
    return await this.blockSource.getL2Block(blockNumber);
  }

  /**
   * Get a block specified by its hash.
   * @param blockHash - The block hash being requested.
   * @returns The requested block.
   */
  public async getBlockByHash(blockHash: BlockHash): Promise<L2Block | undefined> {
    const initialBlockHash = await this.#getInitialHeaderHash();
    if (blockHash.equals(initialBlockHash)) {
      return this.buildInitialBlock();
    }
    return await this.blockSource.getL2BlockByHash(blockHash);
  }

  private buildInitialBlock(): L2Block {
    const initialHeader = this.worldStateSynchronizer.getCommitted().getInitialHeader();
    return L2Block.empty(initialHeader);
  }

  /**
   * Get a block specified by its archive root.
   * @param archive - The archive root being requested.
   * @returns The requested block.
   */
  public async getBlockByArchive(archive: Fr): Promise<L2Block | undefined> {
    return await this.blockSource.getL2BlockByArchive(archive);
  }

  /**
   * Method to request blocks. Will attempt to return all requested blocks but will return only those available.
   * @param from - The start of the range of blocks to return.
   * @param limit - The maximum number of blocks to obtain.
   * @returns The blocks requested.
   */
  public async getBlocks(from: BlockNumber, limit: number): Promise<L2Block[]> {
    return (await this.blockSource.getBlocks(from, BlockNumber(limit))) ?? [];
  }

  public async getCheckpoints(from: CheckpointNumber, limit: number): Promise<PublishedCheckpoint[]> {
    return (await this.blockSource.getCheckpoints(from, limit)) ?? [];
  }

  public async getCheckpointedBlocks(from: BlockNumber, limit: number) {
    return (await this.blockSource.getCheckpointedBlocks(from, limit)) ?? [];
  }

  public getCheckpointsDataForEpoch(epochNumber: EpochNumber) {
    return this.blockSource.getCheckpointsDataForEpoch(epochNumber);
  }

  /**
   * Method to fetch the current min L2 fees.
   * @returns The current min L2 fees.
   */
  public async getCurrentMinFees(): Promise<GasFees> {
    return await this.globalVariableBuilder.getCurrentMinFees();
  }

  public async getMaxPriorityFees(): Promise<GasFees> {
    for await (const tx of this.p2pClient.iteratePendingTxs()) {
      return tx.getGasSettings().maxPriorityFeesPerGas;
    }

    return GasFees.from({ feePerDaGas: 0n, feePerL2Gas: 0n });
  }

  /**
   * Method to fetch the latest block number synchronized by the node.
   * @returns The block number.
   */
  public async getBlockNumber(): Promise<BlockNumber> {
    return await this.blockSource.getBlockNumber();
  }

  public async getProvenBlockNumber(): Promise<BlockNumber> {
    return await this.blockSource.getProvenBlockNumber();
  }

  public async getCheckpointedBlockNumber(): Promise<BlockNumber> {
    return await this.blockSource.getCheckpointedL2BlockNumber();
  }

  public getCheckpointNumber(): Promise<CheckpointNumber> {
    return this.blockSource.getCheckpointNumber();
  }

  /**
   * Method to fetch the version of the package.
   * @returns The node package version
   */
  public getNodeVersion(): Promise<string> {
    return Promise.resolve(this.packageVersion);
  }

  /**
   * Method to fetch the version of the rollup the node is connected to.
   * @returns The rollup version.
   */
  public getVersion(): Promise<number> {
    return Promise.resolve(this.version);
  }

  /**
   * Method to fetch the chain id of the base-layer for the rollup.
   * @returns The chain id.
   */
  public getChainId(): Promise<number> {
    return Promise.resolve(this.l1ChainId);
  }

  public getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.contractDataSource.getContractClass(id);
  }

  public getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return this.contractDataSource.getContract(address);
  }

  public async getPrivateLogsByTags(
    tags: SiloedTag[],
    page?: number,
    referenceBlock?: BlockHash,
  ): Promise<TxScopedL2Log[][]> {
    let upToBlockNumber: BlockNumber | undefined;
    if (referenceBlock) {
      const initialBlockHash = await this.#getInitialHeaderHash();
      if (referenceBlock.equals(initialBlockHash)) {
        upToBlockNumber = BlockNumber(0);
      } else {
        const header = await this.blockSource.getBlockHeaderByHash(referenceBlock);
        if (!header) {
          throw new Error(
            `Block ${referenceBlock.toString()} not found in the node. This might indicate a reorg has occurred.`,
          );
        }
        upToBlockNumber = header.globalVariables.blockNumber;
      }
    }
    return this.logsSource.getPrivateLogsByTags(tags, page, upToBlockNumber);
  }

  public async getPublicLogsByTagsFromContract(
    contractAddress: AztecAddress,
    tags: Tag[],
    page?: number,
    referenceBlock?: BlockHash,
  ): Promise<TxScopedL2Log[][]> {
    let upToBlockNumber: BlockNumber | undefined;
    if (referenceBlock) {
      const initialBlockHash = await this.#getInitialHeaderHash();
      if (referenceBlock.equals(initialBlockHash)) {
        upToBlockNumber = BlockNumber(0);
      } else {
        const header = await this.blockSource.getBlockHeaderByHash(referenceBlock);
        if (!header) {
          throw new Error(
            `Block ${referenceBlock.toString()} not found in the node. This might indicate a reorg has occurred.`,
          );
        }
        upToBlockNumber = header.globalVariables.blockNumber;
      }
    }
    return this.logsSource.getPublicLogsByTagsFromContract(contractAddress, tags, page, upToBlockNumber);
  }

  /**
   * Gets public logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    return this.logsSource.getPublicLogs(filter);
  }

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    return this.logsSource.getContractClassLogs(filter);
  }

  /**
   * Method to submit a transaction to the p2p pool.
   * @param tx - The transaction to be submitted.
   */
  public async sendTx(tx: Tx) {
    await this.#sendTx(tx);
  }

  async #sendTx(tx: Tx) {
    const timer = new Timer();
    const txHash = tx.getTxHash().toString();

    const valid = await this.isValidTx(tx);
    if (valid.result !== 'valid') {
      const reason = valid.reason.join(', ');
      this.metrics.receivedTx(timer.ms(), false);
      this.log.warn(`Received invalid tx ${txHash}: ${reason}`, { txHash });
      throw new Error(`Invalid tx: ${reason}`);
    }

    await this.p2pClient!.sendTx(tx);
    const duration = timer.ms();
    this.metrics.receivedTx(duration, true);
    this.log.info(`Received tx ${txHash} in ${duration}ms`, { txHash });
  }

  public async getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    // Check the tx pool status first. If the tx is known to the pool (pending or mined), we'll use that
    // as a fallback if we don't find a settled receipt in the archiver.
    const txPoolStatus = await this.p2pClient.getTxStatus(txHash);
    const isKnownToPool = txPoolStatus === 'pending' || txPoolStatus === 'mined';

    // Then get the actual tx from the archiver, which tracks every tx in a mined block.
    const settledTxReceipt = await this.blockSource.getSettledTxReceipt(txHash);

    let receipt: TxReceipt;
    if (settledTxReceipt) {
      receipt = settledTxReceipt;
    } else if (isKnownToPool) {
      // If the tx is in the pool but not in the archiver, it's pending.
      // This handles race conditions between archiver and p2p, where the archiver
      // has pruned the block in which a tx was mined, but p2p has not caught up yet.
      receipt = new TxReceipt(txHash, TxStatus.PENDING, undefined, undefined);
    } else {
      // Otherwise, if we don't know the tx, we consider it dropped.
      receipt = new TxReceipt(txHash, TxStatus.DROPPED, undefined, 'Tx dropped by P2P node');
    }

    this.debugLogStore.decorateReceiptWithLogs(txHash.toString(), receipt);

    return receipt;
  }

  public getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    return this.blockSource.getTxEffect(txHash);
  }

  /**
   * Method to stop the aztec node.
   */
  public async stop() {
    this.log.info(`Stopping Aztec Node`);
    await tryStop(this.validatorsSentinel);
    await tryStop(this.epochPruneWatcher);
    await tryStop(this.slasherClient);
    await Promise.all([tryStop(this.peerProofVerifier), tryStop(this.rpcProofVerifier)]);
    await tryStop(this.sequencer);
    await tryStop(this.proverNode);
    await tryStop(this.p2pClient);
    await tryStop(this.worldStateSynchronizer);
    await tryStop(this.blockSource);
    await tryStop(this.blobClient);
    await tryStop(this.telemetry);
    this.log.info(`Stopped Aztec Node`);
  }

  /**
   * Returns the blob client used by this node.
   * @internal - Exposed for testing purposes only.
   */
  public getBlobClient(): BlobClientInterface | undefined {
    return this.blobClient;
  }

  /**
   * Method to retrieve pending txs.
   * @param limit - The number of items to returns
   * @param after - The last known pending tx. Used for pagination
   * @returns - The pending txs.
   */
  public getPendingTxs(limit?: number, after?: TxHash): Promise<Tx[]> {
    return this.p2pClient!.getPendingTxs(limit, after);
  }

  public getPendingTxCount(): Promise<number> {
    return this.p2pClient!.getPendingTxCount();
  }

  /**
   * Method to retrieve a single tx from the mempool or unfinalized chain.
   * @param txHash - The transaction hash to return.
   * @returns - The tx if it exists.
   */
  public getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    return Promise.resolve(this.p2pClient!.getTxByHashFromPool(txHash));
  }

  /**
   * Method to retrieve txs from the mempool or unfinalized chain.
   * @param txHash - The transaction hash to return.
   * @returns - The txs if it exists.
   */
  public async getTxsByHash(txHashes: TxHash[]): Promise<Tx[]> {
    return compactArray(await Promise.all(txHashes.map(txHash => this.getTxByHash(txHash))));
  }

  public async findLeavesIndexes(
    referenceBlock: BlockParameter,
    treeId: MerkleTreeId,
    leafValues: Fr[],
  ): Promise<(DataInBlock<bigint> | undefined)[]> {
    const committedDb = await this.getWorldState(referenceBlock);
    const maybeIndices = await committedDb.findLeafIndices(
      treeId,
      leafValues.map(x => x.toBuffer()),
    );
    // Filter out undefined values to query block numbers only for found leaves
    const definedIndices = maybeIndices.filter(x => x !== undefined);

    // Now we find the block numbers for the defined indices
    const blockNumbers = await committedDb.getBlockNumbersForLeafIndices(treeId, definedIndices);

    // Build a map from leaf index to block number
    const indexToBlockNumber = new Map<bigint, BlockNumber>();
    for (let i = 0; i < definedIndices.length; i++) {
      const blockNumber = blockNumbers[i];
      if (blockNumber === undefined) {
        throw new Error(
          `Block number is undefined for leaf index ${definedIndices[i]} in tree ${MerkleTreeId[treeId]}`,
        );
      }
      indexToBlockNumber.set(definedIndices[i], blockNumber);
    }

    // Get unique block numbers in order to optimize num calls to getLeafValue function.
    const uniqueBlockNumbers = [...new Set(indexToBlockNumber.values())];

    // Now we obtain the block hashes from the archive tree (block number = leaf index in archive tree).
    const blockHashes = await Promise.all(
      uniqueBlockNumbers.map(blockNumber => {
        return committedDb.getLeafValue(MerkleTreeId.ARCHIVE, BigInt(blockNumber));
      }),
    );

    // Build a map from block number to block hash
    const blockNumberToHash = new Map<BlockNumber, Fr>();
    for (let i = 0; i < uniqueBlockNumbers.length; i++) {
      const blockHash = blockHashes[i];
      if (blockHash === undefined) {
        throw new Error(`Block hash is undefined for block number ${uniqueBlockNumbers[i]}`);
      }
      blockNumberToHash.set(uniqueBlockNumbers[i], blockHash);
    }

    // Create DataInBlock objects by combining indices, blockNumbers and blockHashes and return them.
    return maybeIndices.map(index => {
      if (index === undefined) {
        return undefined;
      }
      const blockNumber = indexToBlockNumber.get(index);
      if (blockNumber === undefined) {
        throw new Error(`Block number not found for leaf index ${index} in tree ${MerkleTreeId[treeId]}`);
      }
      const blockHash = blockNumberToHash.get(blockNumber);
      if (blockHash === undefined) {
        throw new Error(`Block hash not found for block number ${blockNumber}`);
      }
      return {
        l2BlockNumber: blockNumber,
        l2BlockHash: new BlockHash(blockHash),
        data: index,
      };
    });
  }

  public async getBlockHashMembershipWitness(
    referenceBlock: BlockParameter,
    blockHash: BlockHash,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined> {
    // The Noir circuit checks the archive membership proof against `anchor_block_header.last_archive.root`,
    // which is the archive tree root BEFORE the anchor block was added (i.e. the state after block N-1).
    // So we need the world state at block N-1, not block N, to produce a sibling path matching that root.
    const referenceBlockNumber = await this.resolveBlockNumber(referenceBlock);
    if (referenceBlockNumber === BlockNumber.ZERO) {
      // Block 0 (the initial block) has an empty archive, so no membership witness can exist.
      return undefined;
    }
    const committedDb = await this.getWorldState(BlockNumber(referenceBlockNumber - 1));
    const [pathAndIndex] = await committedDb.findSiblingPaths<MerkleTreeId.ARCHIVE>(MerkleTreeId.ARCHIVE, [blockHash]);
    return pathAndIndex === undefined
      ? undefined
      : MembershipWitness.fromSiblingPath(pathAndIndex.index, pathAndIndex.path);
  }

  public async getNoteHashMembershipWitness(
    referenceBlock: BlockParameter,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined> {
    const committedDb = await this.getWorldState(referenceBlock);
    const [pathAndIndex] = await committedDb.findSiblingPaths<MerkleTreeId.NOTE_HASH_TREE>(
      MerkleTreeId.NOTE_HASH_TREE,
      [noteHash],
    );
    return pathAndIndex === undefined
      ? undefined
      : MembershipWitness.fromSiblingPath(pathAndIndex.index, pathAndIndex.path);
  }

  public async getL1ToL2MessageMembershipWitness(
    referenceBlock: BlockParameter,
    l1ToL2Message: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>] | undefined> {
    const db = await this.getWorldState(referenceBlock);
    const [witness] = await db.findSiblingPaths(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, [l1ToL2Message]);
    if (!witness) {
      return undefined;
    }

    // REFACTOR: Return a MembershipWitness object
    return [witness.index, witness.path];
  }

  public async getL1ToL2MessageCheckpoint(l1ToL2Message: Fr): Promise<CheckpointNumber | undefined> {
    const messageIndex = await this.l1ToL2MessageSource.getL1ToL2MessageIndex(l1ToL2Message);
    return messageIndex ? InboxLeaf.checkpointNumberFromIndex(messageIndex) : undefined;
  }

  /**
   * Returns whether an L1 to L2 message is synced by archiver and if it's ready to be included in a block.
   * @param l1ToL2Message - The L1 to L2 message to check.
   * @returns Whether the message is synced and ready to be included in a block.
   */
  public async isL1ToL2MessageSynced(l1ToL2Message: Fr): Promise<boolean> {
    const messageIndex = await this.l1ToL2MessageSource.getL1ToL2MessageIndex(l1ToL2Message);
    return messageIndex !== undefined;
  }

  /**
   * Returns all the L2 to L1 messages in an epoch.
   * @param epoch - The epoch at which to get the data.
   * @returns The L2 to L1 messages (empty array if the epoch is not found).
   */
  public async getL2ToL1Messages(epoch: EpochNumber): Promise<Fr[][][][]> {
    // Assumes `getCheckpointedBlocksForEpoch` returns blocks in ascending order of block number.
    const checkpointedBlocks = await this.blockSource.getCheckpointedBlocksForEpoch(epoch);
    const blocksInCheckpoints = chunkBy(checkpointedBlocks, cb => cb.block.header.globalVariables.slotNumber).map(
      group => group.map(cb => cb.block),
    );
    return blocksInCheckpoints.map(blocks =>
      blocks.map(block => block.body.txEffects.map(txEffect => txEffect.l2ToL1Msgs)),
    );
  }

  public async getNullifierMembershipWitness(
    referenceBlock: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const db = await this.getWorldState(referenceBlock);
    const [witness] = await db.findSiblingPaths(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]);
    if (!witness) {
      return undefined;
    }

    const { index, path } = witness;
    const leafPreimage = await db.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, index);
    if (!leafPreimage) {
      return undefined;
    }

    return new NullifierMembershipWitness(index, leafPreimage as NullifierLeafPreimage, path);
  }

  public async getLowNullifierMembershipWitness(
    referenceBlock: BlockParameter,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const committedDb = await this.getWorldState(referenceBlock);
    const findResult = await committedDb.getPreviousValueIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBigInt());
    if (!findResult) {
      return undefined;
    }
    const { index, alreadyPresent } = findResult;
    if (alreadyPresent) {
      throw new Error(
        `Cannot prove nullifier non-inclusion: nullifier ${nullifier.toBigInt()} already exists in the tree`,
      );
    }
    const preimageData = (await committedDb.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, index))!;

    const siblingPath = await committedDb.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, BigInt(index));
    return new NullifierMembershipWitness(BigInt(index), preimageData as NullifierLeafPreimage, siblingPath);
  }

  async getPublicDataWitness(referenceBlock: BlockParameter, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    const committedDb = await this.getWorldState(referenceBlock);
    const lowLeafResult = await committedDb.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot.toBigInt());
    if (!lowLeafResult) {
      return undefined;
    } else {
      const preimage = (await committedDb.getLeafPreimage(
        MerkleTreeId.PUBLIC_DATA_TREE,
        lowLeafResult.index,
      )) as PublicDataTreeLeafPreimage;
      const path = await committedDb.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, lowLeafResult.index);
      return new PublicDataWitness(lowLeafResult.index, preimage, path);
    }
  }

  public async getPublicStorageAt(referenceBlock: BlockParameter, contract: AztecAddress, slot: Fr): Promise<Fr> {
    const committedDb = await this.getWorldState(referenceBlock);
    const leafSlot = await computePublicDataTreeLeafSlot(contract, slot);

    const lowLeafResult = await committedDb.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot.toBigInt());
    if (!lowLeafResult || !lowLeafResult.alreadyPresent) {
      return Fr.ZERO;
    }
    const preimage = (await committedDb.getLeafPreimage(
      MerkleTreeId.PUBLIC_DATA_TREE,
      lowLeafResult.index,
    )) as PublicDataTreeLeafPreimage;
    return preimage.leaf.value;
  }

  public async getBlockHeader(block: BlockParameter = 'latest'): Promise<BlockHeader | undefined> {
    if (BlockHash.isBlockHash(block)) {
      const initialBlockHash = await this.#getInitialHeaderHash();
      if (block.equals(initialBlockHash)) {
        // Block source doesn't handle initial header so we need to handle the case separately.
        return this.worldStateSynchronizer.getCommitted().getInitialHeader();
      }
      return this.blockSource.getBlockHeaderByHash(block);
    } else {
      // Block source doesn't handle initial header so we need to handle the case separately.
      const blockNumber = block === 'latest' ? await this.getBlockNumber() : (block as BlockNumber);
      if (blockNumber === BlockNumber.ZERO) {
        return this.worldStateSynchronizer.getCommitted().getInitialHeader();
      }
      return this.blockSource.getBlockHeader(block);
    }
  }

  /**
   * Get a block header specified by its archive root.
   * @param archive - The archive root being requested.
   * @returns The requested block header.
   */
  public async getBlockHeaderByArchive(archive: Fr): Promise<BlockHeader | undefined> {
    return await this.blockSource.getBlockHeaderByArchive(archive);
  }

  public getBlockData(number: BlockNumber): Promise<BlockData | undefined> {
    return this.blockSource.getBlockData(number);
  }

  public getBlockDataByArchive(archive: Fr): Promise<BlockData | undefined> {
    return this.blockSource.getBlockDataByArchive(archive);
  }

  /**
   * Simulates the public part of a transaction with the current state.
   * @param tx - The transaction to simulate.
   **/
  @trackSpan('AztecNodeService.simulatePublicCalls', (tx: Tx) => ({
    [Attributes.TX_HASH]: tx.getTxHash().toString(),
  }))
  public async simulatePublicCalls(tx: Tx, skipFeeEnforcement = false): Promise<PublicSimulationOutput> {
    // Check total gas limit for simulation
    const gasSettings = tx.data.constants.txContext.gasSettings;
    const txGasLimit = gasSettings.gasLimits.l2Gas;
    const teardownGasLimit = gasSettings.teardownGasLimits.l2Gas;
    if (txGasLimit + teardownGasLimit > this.config.rpcSimulatePublicMaxGasLimit) {
      throw new BadRequestError(
        `Transaction total gas limit ${
          txGasLimit + teardownGasLimit
        } (${txGasLimit} + ${teardownGasLimit}) exceeds maximum gas limit ${
          this.config.rpcSimulatePublicMaxGasLimit
        } for simulation`,
      );
    }

    const txHash = tx.getTxHash();
    const latestBlockNumber = await this.blockSource.getBlockNumber();
    const blockNumber = BlockNumber.add(latestBlockNumber, 1);

    // If sequencer is not initialized, we just set these values to zero for simulation.
    const coinbase = EthAddress.ZERO;
    const feeRecipient = AztecAddress.ZERO;

    const newGlobalVariables = await this.globalVariableBuilder.buildGlobalVariables(
      blockNumber,
      coinbase,
      feeRecipient,
    );
    const publicProcessorFactory = new PublicProcessorFactory(
      this.contractDataSource,
      new DateProvider(),
      this.telemetry,
      this.log.getBindings(),
    );

    this.log.verbose(`Simulating public calls for tx ${txHash}`, {
      globalVariables: newGlobalVariables.toInspect(),
      txHash,
      blockNumber,
    });

    // Ensure world-state has caught up with the latest block we loaded from the archiver
    await this.worldStateSynchronizer.syncImmediate(latestBlockNumber);
    const merkleTreeFork = await this.worldStateSynchronizer.fork();
    try {
      const config = PublicSimulatorConfig.from({
        skipFeeEnforcement,
        collectDebugLogs: true,
        collectHints: false,
        collectCallMetadata: true,
        collectStatistics: false,
        collectionLimits: CollectionLimitsConfig.from({
          maxDebugLogMemoryReads: this.config.rpcSimulatePublicMaxDebugLogMemoryReads,
        }),
      });
      const processor = publicProcessorFactory.create(merkleTreeFork, newGlobalVariables, config);

      // REFACTOR: Consider merging ProcessReturnValues into ProcessedTx
      const [processedTxs, failedTxs, _usedTxs, returns, debugLogs] = await processor.process([tx]);
      // REFACTOR: Consider returning the error rather than throwing
      if (failedTxs.length) {
        this.log.warn(`Simulated tx ${txHash} fails: ${failedTxs[0].error}`, { txHash });
        throw failedTxs[0].error;
      }

      const [processedTx] = processedTxs;
      return new PublicSimulationOutput(
        processedTx.revertReason,
        processedTx.globalVariables,
        processedTx.txEffect,
        returns,
        processedTx.gasUsed,
        debugLogs,
      );
    } finally {
      await merkleTreeFork.close();
    }
  }

  public async isValidTx(
    tx: Tx,
    { isSimulation, skipFeeEnforcement }: { isSimulation?: boolean; skipFeeEnforcement?: boolean } = {},
  ): Promise<TxValidationResult> {
    const db = this.worldStateSynchronizer.getCommitted();
    const verifier = isSimulation ? undefined : this.rpcProofVerifier;

    // We accept transactions if they are not expired by the next slot (checked based on the ExpirationTimestamp field)
    const { ts: nextSlotTimestamp } = this.epochCache.getEpochAndSlotInNextL1Slot();
    const blockNumber = BlockNumber((await this.blockSource.getBlockNumber()) + 1);
    const l1Constants = await this.blockSource.getL1Constants();
    const validator = createTxValidatorForAcceptingTxsOverRPC(
      db,
      this.contractDataSource,
      verifier,
      {
        timestamp: nextSlotTimestamp,
        blockNumber,
        l1ChainId: this.l1ChainId,
        rollupVersion: this.version,
        setupAllowList: [
          ...(await getDefaultAllowedSetupFunctions()),
          ...(this.config.txPublicSetupAllowListExtend ?? []),
        ],
        gasFees: await this.getCurrentMinFees(),
        skipFeeEnforcement,
        txsPermitted: !this.config.disableTransactions,
        rollupManaLimit: l1Constants.rollupManaLimit,
        maxBlockL2Gas: this.config.validateMaxL2BlockGas,
        maxBlockDAGas: this.config.validateMaxDABlockGas,
      },
      this.log.getBindings(),
    );

    return await validator.validateTx(tx);
  }

  public getConfig(): Promise<AztecNodeAdminConfig> {
    const schema = AztecNodeAdminConfigSchema;
    const keys = schema.keyof().options;
    return Promise.resolve(pick(this.config, ...keys));
  }

  public async setConfig(config: Partial<AztecNodeAdminConfig>): Promise<void> {
    const newConfig = { ...this.config, ...config };
    this.sequencer?.updateConfig(config);
    this.slasherClient?.updateConfig(config);
    this.validatorsSentinel?.updateConfig(config);
    await this.p2pClient.updateP2PConfig(config);
    const archiver = this.blockSource as Archiver;
    if ('updateConfig' in archiver) {
      archiver.updateConfig(config);
    }
    if (newConfig.realProofs !== this.config.realProofs) {
      await Promise.all([tryStop(this.peerProofVerifier), tryStop(this.rpcProofVerifier)]);
      if (newConfig.realProofs) {
        this.peerProofVerifier = await BatchChonkVerifier.new(newConfig, newConfig.bbChonkVerifyMaxBatch, 'peer');
        const rpcVerifier = await BBCircuitVerifier.new(newConfig);
        this.rpcProofVerifier = new QueuedIVCVerifier(rpcVerifier, newConfig.numConcurrentIVCVerifiers);
      } else {
        this.peerProofVerifier = new TestCircuitVerifier();
        this.rpcProofVerifier = new TestCircuitVerifier();
      }
    }

    this.config = newConfig;
  }

  public getProtocolContractAddresses(): Promise<ProtocolContractAddresses> {
    return Promise.resolve({
      classRegistry: ProtocolContractAddress.ContractClassRegistry,
      feeJuice: ProtocolContractAddress.FeeJuice,
      instanceRegistry: ProtocolContractAddress.ContractInstanceRegistry,
      multiCallEntrypoint: ProtocolContractAddress.MultiCallEntrypoint,
    });
  }

  public registerContractFunctionSignatures(signatures: string[]): Promise<void> {
    return this.contractDataSource.registerContractFunctionSignatures(signatures);
  }

  public getValidatorsStats(): Promise<ValidatorsStats> {
    return this.validatorsSentinel?.computeStats() ?? Promise.resolve({ stats: {}, slotWindow: 0 });
  }

  public getValidatorStats(
    validatorAddress: EthAddress,
    fromSlot?: SlotNumber,
    toSlot?: SlotNumber,
  ): Promise<SingleValidatorStats | undefined> {
    return this.validatorsSentinel?.getValidatorStats(validatorAddress, fromSlot, toSlot) ?? Promise.resolve(undefined);
  }

  public async startSnapshotUpload(location: string): Promise<void> {
    // Note that we are forcefully casting the blocksource as an archiver
    // We break support for archiver running remotely to the node
    const archiver = this.blockSource as Archiver;
    if (!('backupTo' in archiver)) {
      this.metrics.recordSnapshotError();
      throw new Error('Archiver implementation does not support backups. Cannot generate snapshot.');
    }

    // Test that the archiver has done an initial sync.
    if (!archiver.isInitialSyncComplete()) {
      this.metrics.recordSnapshotError();
      throw new Error(`Archiver initial sync not complete. Cannot start snapshot.`);
    }

    // And it has an L2 block hash
    const l2BlockHash = await archiver.getL2Tips().then(tips => tips.proposed.hash);
    if (!l2BlockHash) {
      this.metrics.recordSnapshotError();
      throw new Error(`Archiver has no latest L2 block hash downloaded. Cannot start snapshot.`);
    }

    if (this.isUploadingSnapshot) {
      this.metrics.recordSnapshotError();
      throw new Error(`Snapshot upload already in progress. Cannot start another one until complete.`);
    }

    // Do not wait for the upload to be complete to return to the caller, but flag that an operation is in progress
    this.isUploadingSnapshot = true;
    const timer = new Timer();
    void uploadSnapshot(location, this.blockSource as Archiver, this.worldStateSynchronizer, this.config, this.log)
      .then(() => {
        this.isUploadingSnapshot = false;
        this.metrics.recordSnapshot(timer.ms());
      })
      .catch(err => {
        this.isUploadingSnapshot = false;
        this.metrics.recordSnapshotError();
        this.log.error(`Error uploading snapshot: ${err}`);
      });

    return Promise.resolve();
  }

  public async rollbackTo(targetBlock: BlockNumber, force?: boolean): Promise<void> {
    const archiver = this.blockSource as Archiver;
    if (!('rollbackTo' in archiver)) {
      throw new Error('Archiver implementation does not support rollbacks.');
    }

    const finalizedBlock = await archiver.getL2Tips().then(tips => tips.finalized.block.number);
    if (targetBlock < finalizedBlock) {
      if (force) {
        this.log.warn(`Clearing world state database to allow rolling back behind finalized block ${finalizedBlock}`);
        await this.worldStateSynchronizer.clear();
        await this.p2pClient.clear();
      } else {
        throw new Error(`Cannot rollback to block ${targetBlock} as it is before finalized ${finalizedBlock}`);
      }
    }

    try {
      this.log.info(`Pausing archiver and world state sync to start rollback`);
      await archiver.stop();
      await this.worldStateSynchronizer.stopSync();
      const currentBlock = await archiver.getBlockNumber();
      const blocksToUnwind = currentBlock - targetBlock;
      this.log.info(`Unwinding ${count(blocksToUnwind, 'block')} from L2 block ${currentBlock} to ${targetBlock}`);
      await archiver.rollbackTo(targetBlock);
      this.log.info(`Unwinding complete.`);
    } catch (err) {
      this.log.error(`Error during rollback`, err);
      throw err;
    } finally {
      this.log.info(`Resuming world state and archiver sync.`);
      this.worldStateSynchronizer.resumeSync();
      archiver.resume();
    }
  }

  public async pauseSync(): Promise<void> {
    this.log.info(`Pausing archiver and world state sync`);
    await (this.blockSource as Archiver).stop();
    await this.worldStateSynchronizer.stopSync();
  }

  public resumeSync(): Promise<void> {
    this.log.info(`Resuming world state and archiver sync.`);
    this.worldStateSynchronizer.resumeSync();
    (this.blockSource as Archiver).resume();
    return Promise.resolve();
  }

  public getSlashPayloads(): Promise<SlashPayloadRound[]> {
    if (!this.slasherClient) {
      throw new Error(`Slasher client not enabled`);
    }
    return this.slasherClient.getSlashPayloads();
  }

  public getSlashOffenses(round: bigint | 'all' | 'current'): Promise<Offense[]> {
    if (!this.slasherClient) {
      throw new Error(`Slasher client not enabled`);
    }
    if (round === 'all') {
      return this.slasherClient.getPendingOffenses();
    } else {
      return this.slasherClient.gatherOffensesForRound(round === 'current' ? undefined : BigInt(round));
    }
  }

  public async reloadKeystore(): Promise<void> {
    if (!this.config.keyStoreDirectory?.length) {
      throw new BadRequestError(
        'Cannot reload keystore: node is not using a file-based keystore. ' +
          'Set KEY_STORE_DIRECTORY to use file-based keystores.',
      );
    }
    if (!this.validatorClient) {
      throw new BadRequestError('Cannot reload keystore: validator is not enabled.');
    }

    this.log.info('Reloading keystore from disk');

    // Re-read and validate keystore files
    const keyStores = loadKeystores(this.config.keyStoreDirectory);
    const newManager = new KeystoreManager(mergeKeystores(keyStores));
    await newManager.validateSigners();
    ValidatorClient.validateKeyStoreConfiguration(newManager, this.log);

    // Validate that every validator's publisher keys overlap with the L1 signers
    // that were initialized at startup. Publishers cannot be hot-reloaded, so a
    // validator with a publisher key that doesn't match any existing L1 signer
    // would silently fail on every proposer slot.
    if (this.keyStoreManager && this.sequencer) {
      const oldAdapter = NodeKeystoreAdapter.fromKeyStoreManager(this.keyStoreManager);
      const availablePublishers = new Set(
        oldAdapter
          .getAttesterAddresses()
          .flatMap(a => oldAdapter.getPublisherAddresses(a).map(p => p.toString().toLowerCase())),
      );

      const newAdapter = NodeKeystoreAdapter.fromKeyStoreManager(newManager);
      for (const attester of newAdapter.getAttesterAddresses()) {
        const pubs = newAdapter.getPublisherAddresses(attester);
        if (pubs.length > 0 && !pubs.some(p => availablePublishers.has(p.toString().toLowerCase()))) {
          throw new BadRequestError(
            `Cannot reload keystore: validator ${attester} has publisher keys ` +
              `[${pubs.map(p => p.toString()).join(', ')}] but none match the L1 signers initialized at startup ` +
              `[${[...availablePublishers].join(', ')}]. Publishers cannot be hot-reloaded — ` +
              `use an existing publisher key or restart the node.`,
          );
        }
      }
    }

    // Build adapters for old and new keystores to compute diff
    const newAdapter = NodeKeystoreAdapter.fromKeyStoreManager(newManager);
    const newAddresses = newAdapter.getAttesterAddresses();
    const oldAddresses = this.keyStoreManager
      ? NodeKeystoreAdapter.fromKeyStoreManager(this.keyStoreManager).getAttesterAddresses()
      : [];

    const oldSet = new Set(oldAddresses.map(a => a.toString()));
    const newSet = new Set(newAddresses.map(a => a.toString()));
    const added = newAddresses.filter(a => !oldSet.has(a.toString()));
    const removed = oldAddresses.filter(a => !newSet.has(a.toString()));

    if (added.length > 0) {
      this.log.info(`Keystore reload: adding attester keys: ${added.map(a => a.toString()).join(', ')}`);
    }
    if (removed.length > 0) {
      this.log.info(`Keystore reload: removing attester keys: ${removed.map(a => a.toString()).join(', ')}`);
    }
    if (added.length === 0 && removed.length === 0) {
      this.log.info('Keystore reload: attester keys unchanged');
    }

    // Update the validator client (coinbase, feeRecipient, attester keys)
    this.validatorClient.reloadKeystore(newManager);

    // Update the publisher factory's keystore so newly-added validators
    // can be matched to existing publisher keys when proposing blocks.
    if (this.sequencer) {
      this.sequencer.updatePublisherNodeKeyStore(newAdapter);
    }

    // Update slasher's "don't-slash-self" list with new validator addresses
    if (this.slasherClient && !this.config.slashSelfAllowed) {
      const slashValidatorsNever = unique(
        [...(this.config.slashValidatorsNever ?? []), ...newAddresses].map(a => a.toString()),
      ).map(EthAddress.fromString);
      this.slasherClient.updateConfig({ slashValidatorsNever });
    }

    this.keyStoreManager = newManager;
    this.log.info('Keystore reloaded: coinbase, feeRecipient, and attester keys updated');
  }

  #getInitialHeaderHash(): Promise<BlockHash> {
    if (!this.initialHeaderHashPromise) {
      this.initialHeaderHashPromise = this.worldStateSynchronizer.getCommitted().getInitialHeader().hash();
    }
    return this.initialHeaderHashPromise;
  }

  /**
   * Returns an instance of MerkleTreeOperations having first ensured the world state is fully synched
   * @param block - The block parameter (block number, block hash, or 'latest') at which to get the data.
   * @returns An instance of a committed MerkleTreeOperations
   */
  protected async getWorldState(block: BlockParameter) {
    let blockSyncedTo: BlockNumber = BlockNumber.ZERO;
    try {
      // Attempt to sync the world state if necessary
      blockSyncedTo = await this.#syncWorldState();
    } catch (err) {
      this.log.error(`Error getting world state: ${err}`);
    }

    if (block === 'latest') {
      this.log.debug(`Using committed db for block 'latest', world state synced upto ${blockSyncedTo}`);
      return this.worldStateSynchronizer.getCommitted();
    }

    // Get the block number, either directly from the parameter or by quering the archiver with the block hash
    let blockNumber: BlockNumber;
    if (BlockHash.isBlockHash(block)) {
      const initialBlockHash = await this.#getInitialHeaderHash();
      if (block.equals(initialBlockHash)) {
        // Block source doesn't handle initial header so we need to handle the case separately.
        return this.worldStateSynchronizer.getSnapshot(BlockNumber.ZERO);
      }

      const header = await this.blockSource.getBlockHeaderByHash(block);
      if (!header) {
        throw new Error(
          `Block hash ${block.toString()} not found when querying world state. If the node API has been queried with anchor block hash possibly a reorg has occurred.`,
        );
      }

      blockNumber = header.getBlockNumber();
    } else {
      blockNumber = block as BlockNumber;
    }

    // Check it's within world state sync range
    if (blockNumber > blockSyncedTo) {
      throw new Error(`Queried block ${block} not yet synced by the node (node is synced upto ${blockSyncedTo}).`);
    }
    this.log.debug(`Using snapshot for block ${blockNumber}, world state synced upto ${blockSyncedTo}`);

    const snapshot = this.worldStateSynchronizer.getSnapshot(blockNumber);

    // Double-check world-state synced to the same block hash as was requested
    if (BlockHash.isBlockHash(block)) {
      const blockHash = await snapshot.getLeafValue(MerkleTreeId.ARCHIVE, BigInt(blockNumber));
      if (!blockHash || !new BlockHash(blockHash).equals(block)) {
        throw new Error(
          `Block hash ${block.toString()} not found in world state at block number ${blockNumber}. If the node API has been queried with anchor block hash possibly a reorg has occurred.`,
        );
      }
    }

    return snapshot;
  }

  /** Resolves a block parameter to a block number. */
  protected async resolveBlockNumber(block: BlockParameter): Promise<BlockNumber> {
    if (block === 'latest') {
      return BlockNumber(await this.blockSource.getBlockNumber());
    }
    if (BlockHash.isBlockHash(block)) {
      const initialBlockHash = await this.#getInitialHeaderHash();
      if (block.equals(initialBlockHash)) {
        return BlockNumber.ZERO;
      }
      const header = await this.blockSource.getBlockHeaderByHash(block);
      if (!header) {
        throw new Error(`Block hash ${block.toString()} not found.`);
      }
      return header.getBlockNumber();
    }
    return block as BlockNumber;
  }

  /**
   * Ensure we fully sync the world state
   * @returns A promise that fulfils once the world state is synced
   */
  async #syncWorldState(): Promise<BlockNumber> {
    const blockSourceHeight = await this.blockSource.getBlockNumber();
    return await this.worldStateSynchronizer.syncImmediate(blockSourceHeight);
  }
}
