import type { BlobSinkClientInterface } from '@aztec/blob-sink/client';
import { EpochCache } from '@aztec/epoch-cache';
import {
  GovernanceProposerContract,
  PublisherManager,
  RollupContract,
  SlashingProposerContract,
  createEthereumChain,
  createExtendedL1Client,
  getPublicClient,
  isAnvilTestChain,
} from '@aztec/ethereum';
import { L1TxUtilsWithBlobs, createL1TxUtilsWithBlobsFromViemWallet } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { P2P } from '@aztec/p2p';
import type { SlasherClient } from '@aztec/slasher';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { IFullNodeBlockBuilder, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { L1Metrics, type TelemetryClient } from '@aztec/telemetry-client';
import type { ValidatorClient } from '@aztec/validator-client';

import type { SequencerClientConfig } from '../config.js';
import { GlobalVariableBuilder } from '../global_variable_builder/index.js';
import { SequencerPublisherFactory } from '../publisher/sequencer-publisher-factory.js';
import { Sequencer, type SequencerConfig, type SequencerContracts } from '../sequencer/index.js';

/**
 * Encapsulates the full sequencer and publisher.
 */
export class SequencerClient {
  constructor(
    protected publisherManager: PublisherManager<L1TxUtilsWithBlobs>,
    protected sequencer: Sequencer,
    protected validatorClient?: ValidatorClient,
    private l1Metrics?: L1Metrics,
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
      validatorClient: ValidatorClient | undefined; // allowed to be undefined while we migrate
      p2pClient: P2P;
      worldStateSynchronizer: WorldStateSynchronizer;
      slasherClient: SlasherClient;
      blockBuilder: IFullNodeBlockBuilder;
      l2BlockSource: L2BlockSource;
      l1ToL2MessageSource: L1ToL2MessageSource;
      telemetry: TelemetryClient;
      publisherFactory?: SequencerPublisherFactory;
      blobSinkClient?: BlobSinkClientInterface;
      dateProvider: DateProvider;
      epochCache?: EpochCache;
      l1TxUtils?: L1TxUtilsWithBlobs[];
    },
  ) {
    const {
      validatorClient,
      p2pClient,
      worldStateSynchronizer,
      slasherClient,
      blockBuilder,
      l2BlockSource,
      l1ToL2MessageSource,
      telemetry: telemetryClient,
    } = deps;
    const { l1RpcUrls: rpcUrls, l1ChainId: chainId, publisherPrivateKey, publisherPrivateKeys } = config;
    const firstKey = publisherPrivateKeys.length > 0 ? publisherPrivateKeys[0] : publisherPrivateKey;
    const chain = createEthereumChain(rpcUrls, chainId);
    const log = createLogger('sequencer-client');
    const publicClient = getPublicClient(config);
    const l1Client = createExtendedL1Client(rpcUrls, firstKey.getValue(), chain.chainInfo);
    const l1TxUtils = deps.l1TxUtils ?? [
      createL1TxUtilsWithBlobsFromViemWallet(l1Client, log, deps.dateProvider, config),
    ];
    const l1Metrics = new L1Metrics(
      telemetryClient.getMeter('L1PublisherMetrics'),
      publicClient,
      l1TxUtils.map(x => x.getSenderAddress()),
    );
    const publisherManager = new PublisherManager(l1TxUtils);
    const rollupContract = new RollupContract(l1Client, config.l1Contracts.rollupAddress.toString());
    const [l1GenesisTime, slotDuration] = await Promise.all([
      rollupContract.getL1GenesisTime(),
      rollupContract.getSlotDuration(),
    ] as const);

    const governanceProposerContract = new GovernanceProposerContract(
      l1Client,
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
          aztecSlotDuration: config.aztecSlotDuration,
          ethereumSlotDuration: config.ethereumSlotDuration,
          aztecEpochDuration: config.aztecEpochDuration,
        },
        { dateProvider: deps.dateProvider },
      ));

    const l1Contracts: SequencerContracts = {
      rollupContract,
      governanceProposerContract,
    };

    const publisherFactory =
      deps.publisherFactory ??
      new SequencerPublisherFactory(config, {
        telemetry: telemetryClient,
        blobSinkClient: deps.blobSinkClient,
        epochCache,
        l1Contracts,
        dateProvider: deps.dateProvider,
        publisherManager,
      });
    const globalsBuilder = new GlobalVariableBuilder(config);

    const ethereumSlotDuration = config.ethereumSlotDuration;

    const rollupManaLimit = Number(await rollupContract.getManaLimit());
    let sequencerManaLimit = config.maxL2BlockGas ?? rollupManaLimit;
    if (sequencerManaLimit > rollupManaLimit) {
      log.warn(
        `Provided maxL2BlockGas of ${sequencerManaLimit} is greater than the maximum allowed by the L1 (${rollupManaLimit}), setting limit to ${rollupManaLimit}`,
      );
      sequencerManaLimit = rollupManaLimit;
    }

    // When running in anvil, assume we can post a tx up until one second before the end of an L1 slot.
    // Otherwise, assume we must have broadcasted the tx before the slot started (we use a default
    // maxL1TxInclusionTimeIntoSlot of zero) to get the tx into that L1 slot.
    // In theory, the L1 slot has an initial 4s phase where the block is propagated, so we could
    // make it with a propagation time into slot equal to 4s. However, we prefer being conservative.
    // See https://www.blocknative.com/blog/anatomy-of-a-slot#7 for more info.
    const maxL1TxInclusionTimeIntoSlot =
      (config.maxL1TxInclusionTimeIntoSlot ?? isAnvilTestChain(config.l1ChainId)) ? ethereumSlotDuration - 1 : 0;

    const l1Constants = {
      l1GenesisTime,
      slotDuration: Number(slotDuration),
      ethereumSlotDuration,
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
      blockBuilder,
      l1Constants,
      deps.dateProvider,
      epochCache,
      l1Contracts,
      { ...config, maxL1TxInclusionTimeIntoSlot, maxL2BlockGas: sequencerManaLimit },
      telemetryClient,
    );

    await sequencer.init();

    return new SequencerClient(publisherManager, sequencer, validatorClient, l1Metrics);
  }

  /**
   * Updates sequencer config.
   * @param config - New parameters.
   */
  public updateSequencerConfig(config: SequencerConfig) {
    return this.sequencer.updateConfig(config);
  }

  /** Starts the sequencer. */
  public async start() {
    await this.validatorClient?.start();
    this.sequencer.start();
    this.l1Metrics?.start();
  }

  /**
   * Stops the sequencer from processing new txs.
   */
  public async stop() {
    await this.sequencer.stop();
    this.publisherManager.interrupt();
    this.l1Metrics?.stop();
  }

  public getSequencer(): Sequencer {
    return this.sequencer;
  }

  get validatorAddresses(): EthAddress[] | undefined {
    return this.sequencer.getValidatorAddresses();
  }

  get maxL2BlockGas(): number | undefined {
    return this.sequencer.maxL2BlockGas;
  }
}
