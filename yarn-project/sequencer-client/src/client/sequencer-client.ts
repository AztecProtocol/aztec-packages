import { type L1ToL2MessageSource, type L2BlockSource, type WorldStateSynchronizer } from '@aztec/circuit-types';
import { type ContractDataSource } from '@aztec/circuits.js';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { type P2P } from '@aztec/p2p';
import { LightweightBlockBuilderFactory } from '@aztec/prover-client/block-builder';
import { PublicProcessorFactory } from '@aztec/simulator';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { type ValidatorClient } from '@aztec/validator-client';

import { type SequencerClientConfig } from '../config.js';
import { GlobalVariableBuilder } from '../global_variable_builder/index.js';
import { L1Publisher } from '../publisher/index.js';
import { Sequencer, type SequencerConfig } from '../sequencer/index.js';
import { type SlasherClient } from '../slasher/index.js';
import { TxValidatorFactory } from '../tx_validator/tx_validator_factory.js';

/**
 * Encapsulates the full sequencer and publisher.
 */
export class SequencerClient {
  constructor(private sequencer: Sequencer) {}

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
    const publisher = deps.publisher ?? new L1Publisher(config, telemetryClient);
    const globalsBuilder = new GlobalVariableBuilder(config);

    const publicProcessorFactory = new PublicProcessorFactory(contractDataSource, telemetryClient);

    const rollup = publisher.getRollupContract();
    const [l1GenesisTime, slotDuration] = await Promise.all([
      rollup.read.GENESIS_TIME(),
      rollup.read.SLOT_DURATION(),
    ] as const);

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
      new TxValidatorFactory(worldStateSynchronizer.getCommitted(), contractDataSource, !!config.enforceFees),
      Number(l1GenesisTime),
      Number(slotDuration),
      telemetryClient,
      config,
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
