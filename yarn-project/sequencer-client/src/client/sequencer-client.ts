import { ContractDataSource, L1ToL2MessageSource, L2BlockSource } from '@aztec/circuit-types';
import { ProverClient } from '@aztec/circuit-types/interfaces';
import { createDebugLogger } from '@aztec/foundation/log';
import { P2P } from '@aztec/p2p';
import { NativeACVMSimulator, SimulationProvider, WASMSimulator } from '@aztec/simulator';
import { WorldStateSynchronizer } from '@aztec/world-state';

import * as fs from 'fs/promises';

import { SequencerClientConfig } from '../config.js';
import { getGlobalVariableBuilder } from '../global_variable_builder/index.js';
import { getL1Publisher } from '../publisher/index.js';
import { Sequencer, SequencerConfig } from '../sequencer/index.js';
import { PublicProcessorFactory } from '../sequencer/public_processor.js';

const logger = createDebugLogger('aztec:sequencer-client');

/**
 * Factory function to create a simulation provider. Will attempt to use native binary simulation falling back to WASM if unavailable.
 * @param config - The provided sequencer client configuration
 * @returns The constructed simulation provider
 */
async function getSimulationProvider(config: SequencerClientConfig): Promise<SimulationProvider> {
  if (config.acvmBinaryPath && config.acvmWorkingDirectory) {
    try {
      await fs.access(config.acvmBinaryPath, fs.constants.R_OK);
      await fs.mkdir(config.acvmWorkingDirectory, { recursive: true });
      logger(`Using native ACVM at ${config.acvmBinaryPath}`);
      return new NativeACVMSimulator(config.acvmWorkingDirectory, config.acvmBinaryPath);
    } catch {
      logger(`Failed to access ACVM at ${config.acvmBinaryPath}, falling back to WASM`);
    }
  }
  logger('Using WASM ACVM simulation');
  return new WASMSimulator();
}

/**
 * Encapsulates the full sequencer and publisher.
 */
export class SequencerClient {
  constructor(private sequencer: Sequencer) {}

  /**
   * Initializes and starts a new instance.
   * @param config - Configuration for the sequencer, publisher, and L1 tx sender.
   * @param p2pClient - P2P client that provides the txs to be sequenced.
   * @param worldStateSynchronizer - Provides access to world state.
   * @param contractDataSource - Provides access to contract bytecode for public executions.
   * @param l2BlockSource - Provides information about the previously published blocks.
   * @param l1ToL2MessageSource - Provides access to L1 to L2 messages.
   * @param prover - An instance of a prover client.
   * @returns A new running instance.
   */
  public static async new(
    config: SequencerClientConfig,
    p2pClient: P2P,
    worldStateSynchronizer: WorldStateSynchronizer,
    contractDataSource: ContractDataSource,
    l2BlockSource: L2BlockSource,
    l1ToL2MessageSource: L1ToL2MessageSource,
    prover: ProverClient,
  ) {
    const publisher = getL1Publisher(config);
    const globalsBuilder = getGlobalVariableBuilder(config);
    const merkleTreeDb = worldStateSynchronizer.getLatest();

    const simulationProvider = await getSimulationProvider(config);

    const publicProcessorFactory = new PublicProcessorFactory(
      merkleTreeDb,
      contractDataSource,
      l1ToL2MessageSource,
      simulationProvider,
    );

    const sequencer = new Sequencer(
      publisher,
      globalsBuilder,
      p2pClient,
      worldStateSynchronizer,
      prover,
      l2BlockSource,
      l1ToL2MessageSource,
      publicProcessorFactory,
      config,
    );

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

  /**
   * Restarts the sequencer after being stopped.
   */
  public restart() {
    this.sequencer.restart();
  }

  get coinbase() {
    return this.sequencer.coinbase;
  }

  get feeRecipient() {
    return this.sequencer.feeRecipient;
  }
}
