import type { BlobClientInterface } from '@aztec/blob-client/client';
import { MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT } from '@aztec/constants';
import { EpochCache } from '@aztec/epoch-cache';
import { getPublicClient } from '@aztec/ethereum/client';
import { GovernanceProposerContract, RollupContract } from '@aztec/ethereum/contracts';
import { type Delayer, L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { PublisherManager } from '@aztec/ethereum/publisher-manager';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { KeystoreManager } from '@aztec/node-keystore';
import type { P2P } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import type { L2BlockSink, L2BlockSource, ProposedCheckpointSink } from '@aztec/stdlib/block';
import type { ValidatorClientFullConfig, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { L1Metrics, type TelemetryClient } from '@aztec/telemetry-client';
import { FullNodeCheckpointsBuilder, NodeKeystoreAdapter, type ValidatorClient } from '@aztec/validator-client';

import { type SequencerClientConfig, getPublisherConfigFromSequencerConfig } from '../config.js';
import type { GlobalVariableBuilder } from '../global_variable_builder/index.js';
import { SequencerPublisherFactory } from '../publisher/sequencer-publisher-factory.js';
import { Sequencer, type SequencerConfig } from '../sequencer/index.js';

/**
 * Encapsulates the full sequencer and publisher.
 */
export class SequencerClient {
  constructor(
    protected publisherManager: PublisherManager<L1TxUtils>,
    protected sequencer: Sequencer,
    protected checkpointsBuilder: FullNodeCheckpointsBuilder,
    protected validatorClient?: ValidatorClient,
    private l1Metrics?: L1Metrics,
    private delayer_?: Delayer,
  ) {}

  /**
   * Initializes a new instance.
   * @param config - Configuration for the sequencer, publisher, and L1 tx sender.
   * @param p2pClient - P2P client that provides the txs to be sequenced.
   * @param validatorClient - Validator client performs attestation duties when rotating proposers.
   * @param worldStateSynchronizer - Provides access to world state.
   * @param contractDataSource - Provides access to contract bytecode for public executions.
   * @param l2BlockSource - Provides information about the previously published blocks.
   * @param l1ToL2MessageSource - Provides access to L1 to L2 messages.
   * @param prover - An instance of a block prover
   * @returns A new running instance.
   */
  public static async new(
    config: SequencerClientConfig,
    deps: {
      validatorClient: ValidatorClient;
      p2pClient: P2P;
      worldStateSynchronizer: WorldStateSynchronizer;
      slasherClient: SlasherClientInterface | undefined;
      checkpointsBuilder: FullNodeCheckpointsBuilder;
      l2BlockSource: L2BlockSource & L2BlockSink & ProposedCheckpointSink;
      l1ToL2MessageSource: L1ToL2MessageSource;
      telemetry: TelemetryClient;
      publisherFactory?: SequencerPublisherFactory;
      blobClient: BlobClientInterface;
      dateProvider: DateProvider;
      epochCache?: EpochCache;
      l1TxUtils: L1TxUtils[];
      funderL1TxUtils?: L1TxUtils;
      nodeKeyStore: KeystoreManager;
      globalVariableBuilder: GlobalVariableBuilder;
    },
  ) {
    const {
      validatorClient,
      p2pClient,
      worldStateSynchronizer,
      slasherClient,
      checkpointsBuilder,
      l2BlockSource,
      l1ToL2MessageSource,
      telemetry: telemetryClient,
    } = deps;
    const { l1RpcUrls: rpcUrls, l1ChainId: chainId } = config;
    const log = createLogger('sequencer');
    const publicClient = getPublicClient(config);
    const l1TxUtils = deps.l1TxUtils;
    const l1Metrics = new L1Metrics(
      telemetryClient.getMeter('L1PublisherMetrics'),
      publicClient,
      l1TxUtils.map(x => x.getSenderAddress()),
    );
    const publisherManager = new PublisherManager(l1TxUtils, getPublisherConfigFromSequencerConfig(config), {
      bindings: log.getBindings(),
      funder: deps.funderL1TxUtils,
    });
    const rollupContract = new RollupContract(publicClient, config.rollupAddress.toString());
    const [l1GenesisTime, slotDuration, rollupManaLimit] = await Promise.all([
      rollupContract.getL1GenesisTime(),
      rollupContract.getSlotDuration(),
      rollupContract.getManaLimit().then(Number),
    ] as const);

    const governanceProposerContract = new GovernanceProposerContract(
      publicClient,
      config.governanceProposerAddress.toString(),
    );
    const epochCache =
      deps.epochCache ??
      (await EpochCache.create(
        config.rollupAddress,
        {
          l1RpcUrls: rpcUrls,
          l1ChainId: chainId,
          viemPollingIntervalMS: config.viemPollingIntervalMS,
          ethereumSlotDuration: config.ethereumSlotDuration,
        },
        { dateProvider: deps.dateProvider },
      ));

    const publisherFactory =
      deps.publisherFactory ??
      new SequencerPublisherFactory(config, {
        telemetry: telemetryClient,
        blobClient: deps.blobClient,
        epochCache,
        governanceProposerContract,
        rollupContract,
        dateProvider: deps.dateProvider,
        publisherManager,
        nodeKeyStore: NodeKeystoreAdapter.fromKeyStoreManager(deps.nodeKeyStore),
        logger: log,
      });

    const ethereumSlotDuration = config.ethereumSlotDuration;

    const globalsBuilder = deps.globalVariableBuilder;

    const { maxL2BlockGas, maxDABlockGas, maxTxsPerBlock } = capPerBlockLimits(config, rollupManaLimit, log);

    const l1Constants = {
      l1GenesisTime,
      slotDuration: Number(slotDuration),
      ethereumSlotDuration,
      rollupManaLimit,
      epochDuration: config.aztecEpochDuration,
    };

    const sequencer = new Sequencer(
      publisherFactory,
      validatorClient,
      globalsBuilder,
      p2pClient,
      worldStateSynchronizer,
      slasherClient,
      l2BlockSource,
      l1ToL2MessageSource,
      checkpointsBuilder,
      l1Constants,
      deps.dateProvider,
      epochCache,
      rollupContract,
      { ...config, maxL2BlockGas, maxDABlockGas, maxTxsPerBlock },
      telemetryClient,
      log,
    );

    sequencer.init();

    // Extract the shared delayer from the first L1TxUtils instance (all instances share the same delayer)
    const delayer = l1TxUtils[0]?.delayer;

    return new SequencerClient(publisherManager, sequencer, checkpointsBuilder, validatorClient, l1Metrics, delayer);
  }

  /**
   * Updates sequencer and validator client config.
   * @param config - New parameters.
   */
  public updateConfig(config: SequencerConfig & Partial<ValidatorClientFullConfig>) {
    this.sequencer.updateConfig(config);
    this.checkpointsBuilder.updateConfig(config);
    this.validatorClient?.updateConfig(config);
  }

  /** Starts the sequencer. */
  public async start() {
    await this.validatorClient?.start();
    this.sequencer.start();
    this.l1Metrics?.start();
    await this.publisherManager.start();
  }

  /**
   * Stops the sequencer from processing new txs.
   */
  public async stop() {
    await this.sequencer.stop();
    await this.validatorClient?.stop();
    await this.publisherManager.stop();
    this.l1Metrics?.stop();
  }

  /** Triggers an immediate run of the sequencer, bypassing the polling interval. */
  public trigger() {
    return this.sequencer.trigger();
  }

  public getSequencer(): Sequencer {
    return this.sequencer;
  }

  /** Updates the publisher factory's node keystore adapter after a keystore reload. */
  public updatePublisherNodeKeyStore(adapter: NodeKeystoreAdapter): void {
    this.sequencer.updatePublisherNodeKeyStore(adapter);
  }

  /** Returns the shared tx delayer for sequencer L1 txs, if enabled. Test-only. */
  getDelayer(): Delayer | undefined {
    return this.delayer_;
  }

  get validatorAddresses(): EthAddress[] | undefined {
    return this.sequencer.getValidatorAddresses();
  }

  get maxL2BlockGas(): number | undefined {
    return this.sequencer.maxL2BlockGas;
  }
}

/**
 * Caps operator-provided per-block limits at checkpoint-level limits.
 * Returns undefined for any limit the operator didn't set — the checkpoint builder handles redistribution.
 */
function capPerBlockLimits(
  config: SequencerClientConfig,
  rollupManaLimit: number,
  log: ReturnType<typeof createLogger>,
): { maxL2BlockGas: number | undefined; maxDABlockGas: number | undefined; maxTxsPerBlock: number | undefined } {
  let maxL2BlockGas = config.maxL2BlockGas;
  if (maxL2BlockGas !== undefined && maxL2BlockGas > rollupManaLimit) {
    log.warn(`Provided MAX_L2_BLOCK_GAS ${maxL2BlockGas} exceeds rollup mana limit ${rollupManaLimit} (capping)`);
    maxL2BlockGas = rollupManaLimit;
  }

  let maxDABlockGas = config.maxDABlockGas;
  if (maxDABlockGas !== undefined && maxDABlockGas > MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT) {
    log.warn(
      `Provided MAX_DA_BLOCK_GAS ${maxDABlockGas} exceeds DA checkpoint limit ${MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT} (capping)`,
    );
    maxDABlockGas = MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT;
  }

  let maxTxsPerBlock = config.maxTxsPerBlock;
  if (
    maxTxsPerBlock !== undefined &&
    config.maxTxsPerCheckpoint !== undefined &&
    maxTxsPerBlock > config.maxTxsPerCheckpoint
  ) {
    log.warn(
      `Provided MAX_TX_PER_BLOCK ${maxTxsPerBlock} exceeds MAX_TX_PER_CHECKPOINT ${config.maxTxsPerCheckpoint} (capping)`,
    );
    maxTxsPerBlock = config.maxTxsPerCheckpoint;
  }

  return { maxL2BlockGas, maxDABlockGas, maxTxsPerBlock };
}
