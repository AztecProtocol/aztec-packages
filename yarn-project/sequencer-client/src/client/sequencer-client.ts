import type { BlobSinkClientInterface } from '@aztec/blob-sink/client';
import { EpochCache } from '@aztec/epoch-cache';
import {
  ForwarderContract,
  GovernanceProposerContract,
  RollupContract,
  SlashingProposerContract,
  createEthereumChain,
  createExtendedL1Client,
  isAnvilTestChain,
} from '@aztec/ethereum';
import { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import type { P2P } from '@aztec/p2p';
import type { SlasherClient } from '@aztec/slasher';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { IFullNodeBlockBuilder, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { TelemetryClient } from '@aztec/telemetry-client';
import type { ValidatorClient } from '@aztec/validator-client';

import type { SequencerClientConfig } from '../config.js';
import { GlobalVariableBuilder } from '../global_variable_builder/index.js';
import { SequencerPublisher } from '../publisher/index.js';
import { Sequencer, type SequencerConfig } from '../sequencer/index.js';

/**
 * Encapsulates the full sequencer and publisher.
 */
export class SequencerClient {
  constructor(protected sequencer: Sequencer) {}

  /**
   * Initializes and starts a new instance.
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
      publisher?: SequencerPublisher;
      blobSinkClient?: BlobSinkClientInterface;
      dateProvider: DateProvider;
      epochCache?: EpochCache;
      l1TxUtils?: L1TxUtilsWithBlobs;
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
    const { l1RpcUrls: rpcUrls, l1ChainId: chainId, publisherPrivateKey } = config;
    const chain = createEthereumChain(rpcUrls, chainId);
    const log = createLogger('sequencer-client');
    const l1Client = createExtendedL1Client(rpcUrls, publisherPrivateKey, chain.chainInfo);
    const l1TxUtils = deps.l1TxUtils ?? new L1TxUtilsWithBlobs(l1Client, log, config);
    const rollupContract = new RollupContract(l1Client, config.l1Contracts.rollupAddress.toString());
    const [l1GenesisTime, slotDuration] = await Promise.all([
      rollupContract.getL1GenesisTime(),
      rollupContract.getSlotDuration(),
    ] as const);
    const forwarderContract =
      config.customForwarderContractAddress && config.customForwarderContractAddress !== EthAddress.ZERO
        ? new ForwarderContract(
            l1Client,
            config.customForwarderContractAddress.toString(),
            config.l1Contracts.rollupAddress.toString(),
          )
        : await ForwarderContract.create(l1Client, log, config.l1Contracts.rollupAddress.toString());

    const governanceProposerContract = new GovernanceProposerContract(
      l1Client,
      config.l1Contracts.governanceProposerAddress.toString(),
    );
    const slashingProposerAddress = await rollupContract.getSlashingProposerAddress();
    const slashingProposerContract = new SlashingProposerContract(l1Client, slashingProposerAddress.toString());
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
          aztecProofSubmissionWindow: config.aztecProofSubmissionWindow,
        },
        { dateProvider: deps.dateProvider },
      ));

    const publisher =
      deps.publisher ??
      new SequencerPublisher(config, {
        l1TxUtils,
        telemetry: telemetryClient,
        blobSinkClient: deps.blobSinkClient,
        rollupContract,
        epochCache,
        forwarderContract,
        governanceProposerContract,
        slashingProposerContract,
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

    // When running in anvil, assume we can post a tx up until the very last second of an L1 slot.
    // Otherwise, assume we must have broadcasted the tx before the slot started (we use a default
    // maxL1TxInclusionTimeIntoSlot of zero) to get the tx into that L1 slot.
    // In theory, the L1 slot has an initial 4s phase where the block is propagated, so we could
    // make it with a propagation time into slot equal to 4s. However, we prefer being conservative.
    // See https://www.blocknative.com/blog/anatomy-of-a-slot#7 for more info.
    const maxL1TxInclusionTimeIntoSlot =
      (config.maxL1TxInclusionTimeIntoSlot ?? isAnvilTestChain(config.l1ChainId)) ? ethereumSlotDuration : 0;

    const l1Constants = {
      l1GenesisTime,
      slotDuration: Number(slotDuration),
      ethereumSlotDuration,
    };

    const sequencer = new Sequencer(
      publisher,
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
      { ...config, maxL1TxInclusionTimeIntoSlot, maxL2BlockGas: sequencerManaLimit },
      telemetryClient,
    );
    await validatorClient?.start();
    sequencer.start();
    return new SequencerClient(sequencer);
  }

  /**
   * Updates sequencer config.
   * @param config - New parameters.
   */
  public updateSequencerConfig(config: SequencerConfig) {
    return this.sequencer.updateConfig(config);
  }

  /**
   * Stops the sequencer from processing new txs.
   */
  public async stop() {
    await this.sequencer.stop();
  }

  /** Forces the sequencer to bypass all time and tx count checks for the next block and build anyway. */
  public flush() {
    this.sequencer.flush();
  }

  /**
   * Restarts the sequencer after being stopped.
   */
  public restart() {
    this.sequencer.restart();
  }

  public getSequencer(): Sequencer {
    return this.sequencer;
  }

  get coinbase(): EthAddress {
    return this.sequencer.coinbase;
  }

  get feeRecipient(): AztecAddress {
    return this.sequencer.feeRecipient;
  }

  get forwarderAddress(): EthAddress {
    return this.sequencer.getForwarderAddress();
  }

  get validatorAddresses(): EthAddress[] | undefined {
    return this.sequencer.getValidatorAddresses();
  }

  get maxL2BlockGas(): number | undefined {
    return this.sequencer.maxL2BlockGas;
  }
}
