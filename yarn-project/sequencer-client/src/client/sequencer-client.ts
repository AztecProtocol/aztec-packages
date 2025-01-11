import { type BlobSinkClientInterface } from '@aztec/blob-sink/client';
import { type L1ToL2MessageSource, type L2BlockSource, type WorldStateSynchronizer } from '@aztec/circuit-types';
import { type ContractDataSource } from '@aztec/circuits.js';
import { isAnvilTestChain } from '@aztec/ethereum';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { type DateProvider } from '@aztec/foundation/timer';
import { type P2P } from '@aztec/p2p';
import { LightweightBlockBuilderFactory } from '@aztec/prover-client/block-builder';
import { PublicProcessorFactory } from '@aztec/simulator/server';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { type ValidatorClient } from '@aztec/validator-client';

import { type SequencerClientConfig } from '../config.js';
import { GlobalVariableBuilder } from '../global_variable_builder/index.js';
import { L1Publisher } from '../publisher/index.js';
import { Sequencer, type SequencerConfig } from '../sequencer/index.js';
import { type SlasherClient } from '../slasher/index.js';

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
   * @param simulationProvider - An instance of a simulation provider
   * @returns A new running instance.
   */
  public static async new(
    config: SequencerClientConfig,
    deps: {
      validatorClient: ValidatorClient | undefined; // allowed to be undefined while we migrate
      p2pClient: P2P;
      worldStateSynchronizer: WorldStateSynchronizer;
      slasherClient: SlasherClient;
      contractDataSource: ContractDataSource;
      l2BlockSource: L2BlockSource;
      l1ToL2MessageSource: L1ToL2MessageSource;
      telemetry: TelemetryClient;
      publisher?: L1Publisher;
      blobSinkClient?: BlobSinkClientInterface;
      dateProvider: DateProvider;
    },
  ) {
    const {
      validatorClient,
      p2pClient,
      worldStateSynchronizer,
      slasherClient,
      contractDataSource,
      l2BlockSource,
      l1ToL2MessageSource,
      telemetry: telemetryClient,
    } = deps;
    const publisher =
      deps.publisher ?? new L1Publisher(config, { telemetry: telemetryClient, blobSinkClient: deps.blobSinkClient });
    const globalsBuilder = new GlobalVariableBuilder(config);

    const publicProcessorFactory = new PublicProcessorFactory(contractDataSource, deps.dateProvider, telemetryClient);

    const rollup = publisher.getRollupContract();
    const [l1GenesisTime, slotDuration] = await Promise.all([
      rollup.read.GENESIS_TIME(),
      rollup.read.SLOT_DURATION(),
    ] as const);

    const ethereumSlotDuration = config.ethereumSlotDuration;

    // When running in anvil, assume we can post a tx up until the very last second of an L1 slot.
    // Otherwise, assume we must have broadcasted the tx before the slot started (we use a default
    // maxL1TxInclusionTimeIntoSlot of zero) to get the tx into that L1 slot.
    // In theory, the L1 slot has an initial 4s phase where the block is propagated, so we could
    // make it with a propagation time into slot equal to 4s. However, we prefer being conservative.
    // See https://www.blocknative.com/blog/anatomy-of-a-slot#7 for more info.
    const maxL1TxInclusionTimeIntoSlot =
      config.maxL1TxInclusionTimeIntoSlot ?? isAnvilTestChain(config.l1ChainId) ? ethereumSlotDuration : 0;

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
      new LightweightBlockBuilderFactory(telemetryClient),
      l2BlockSource,
      l1ToL2MessageSource,
      publicProcessorFactory,
      contractDataSource,
      l1Constants,
      deps.dateProvider,
      telemetryClient,
      { ...config, maxL1TxInclusionTimeIntoSlot },
    );
    await validatorClient?.start();
    await sequencer.start();
    return new SequencerClient(sequencer);
  }

  /**
   * Updates sequencer config.
   * @param config - New parameters.
   */
  public updateSequencerConfig(config: SequencerConfig) {
    this.sequencer.updateConfig(config);
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

  get coinbase(): EthAddress {
    return this.sequencer.coinbase;
  }

  get feeRecipient() {
    return this.sequencer.feeRecipient;
  }
}
