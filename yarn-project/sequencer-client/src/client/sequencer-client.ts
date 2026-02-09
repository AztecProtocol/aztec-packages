import type { BlobClientInterface } from '@aztec/blob-client/client';
import { EpochCache } from '@aztec/epoch-cache';
import { isAnvilTestChain } from '@aztec/ethereum/chain';
import { getPublicClient } from '@aztec/ethereum/client';
import { GovernanceProposerContract, RollupContract } from '@aztec/ethereum/contracts';
import type { Delayer } from '@aztec/ethereum/l1-tx-utils';
import { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { PublisherManager } from '@aztec/ethereum/publisher-manager';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { KeystoreManager } from '@aztec/node-keystore';
import type { P2P } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import type { L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import type { ValidatorClientFullConfig, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { L1Metrics, type TelemetryClient } from '@aztec/telemetry-client';
import { FullNodeCheckpointsBuilder, NodeKeystoreAdapter, type ValidatorClient } from '@aztec/validator-client';

import type { SequencerClientConfig } from '../config.js';
import { GlobalVariableBuilder } from '../global_variable_builder/index.js';
import { SequencerPublisherFactory } from '../publisher/sequencer-publisher-factory.js';
import { Sequencer, type SequencerConfig } from '../sequencer/index.js';

/**
 * Encapsulates the full sequencer and publisher.
 */
export class SequencerClient {
  constructor(
    protected publisherManager: PublisherManager<L1TxUtilsWithBlobs>,
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
      l2BlockSource: L2BlockSource & L2BlockSink;
      l1ToL2MessageSource: L1ToL2MessageSource;
      telemetry: TelemetryClient;
      publisherFactory?: SequencerPublisherFactory;
      blobClient: BlobClientInterface;
      dateProvider: DateProvider;
      epochCache?: EpochCache;
      l1TxUtils: L1TxUtilsWithBlobs[];
      nodeKeyStore: KeystoreManager;
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
    const publisherManager = new PublisherManager(l1TxUtils, config, log.getBindings());
    const rollupContract = new RollupContract(publicClient, config.l1Contracts.rollupAddress.toString());
    const [l1GenesisTime, slotDuration, rollupVersion, rollupManaLimit] = await Promise.all([
      rollupContract.getL1GenesisTime(),
      rollupContract.getSlotDuration(),
      rollupContract.getVersion(),
      rollupContract.getManaLimit().then(Number),
    ] as const);

    const governanceProposerContract = new GovernanceProposerContract(
      publicClient,
      config.l1Contracts.governanceProposerAddress.toString(),
    );
    const epochCache =
      deps.epochCache ??
      (await EpochCache.create(
        config.l1Contracts.rollupAddress,
        {
          l1RpcUrls: rpcUrls,
          l1ChainId: chainId,
          viemPollingIntervalMS: config.viemPollingIntervalMS,
          ethereumSlotDuration: config.ethereumSlotDuration,
        },
        { dateProvider: deps.dateProvider },
      ));

    const slashFactoryContract = new SlashFactoryContract(
      publicClient,
      config.l1Contracts.slashFactoryAddress?.toString() ?? EthAddress.ZERO.toString(),
    );

    const publisherFactory =
      deps.publisherFactory ??
      new SequencerPublisherFactory(config, {
        telemetry: telemetryClient,
        blobClient: deps.blobClient,
        epochCache,
        governanceProposerContract,
        slashFactoryContract,
        rollupContract,
        dateProvider: deps.dateProvider,
        publisherManager,
        nodeKeyStore: NodeKeystoreAdapter.fromKeyStoreManager(deps.nodeKeyStore),
        logger: log,
      });

    const ethereumSlotDuration = config.ethereumSlotDuration;
    const l1Constants = { l1GenesisTime, slotDuration: Number(slotDuration), ethereumSlotDuration };

    const globalsBuilder = new GlobalVariableBuilder({ ...config, ...l1Constants, rollupVersion });

    let sequencerManaLimit = config.maxL2BlockGas ?? rollupManaLimit;
    if (sequencerManaLimit > rollupManaLimit) {
      log.warn(
        `Provided maxL2BlockGas ${sequencerManaLimit} is greater than the max allowed by L1. Setting limit to ${rollupManaLimit}.`,
      );
      sequencerManaLimit = rollupManaLimit;
    }

    // When running in anvil, assume we can post a tx up until one second before the end of an L1 slot.
    // Otherwise, we need the full L1 slot duration for publishing to ensure inclusion.
    // In theory, the L1 slot has an initial 4s phase where the block is propagated, so we could
    // reduce the publishing time allowance. However, we prefer being conservative.
    // See https://www.blocknative.com/blog/anatomy-of-a-slot#7 for more info.
    const l1PublishingTimeBasedOnChain = isAnvilTestChain(config.l1ChainId) ? 1 : ethereumSlotDuration;
    const l1PublishingTime = config.l1PublishingTime ?? l1PublishingTimeBasedOnChain;

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
      { ...config, l1PublishingTime, maxL2BlockGas: sequencerManaLimit },
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
    await this.publisherManager.loadState();
  }

  /**
   * Stops the sequencer from processing new txs.
   */
  public async stop() {
    await this.sequencer.stop();
    await this.validatorClient?.stop();
    this.publisherManager.interrupt();
    this.l1Metrics?.stop();
  }

  public getSequencer(): Sequencer {
    return this.sequencer;
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
