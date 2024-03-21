import { ProcessedTx } from '@aztec/circuit-types';
import { ProverClient, ProvingTicket } from '@aztec/circuit-types/interfaces';
import { Fr, GlobalVariables } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { NativeACVMSimulator, SimulationProvider, WASMSimulator } from '@aztec/simulator';
import { WorldStateSynchronizer } from '@aztec/world-state';

import * as fs from 'fs/promises';

import { ProverConfig } from '../config.js';
import { VerificationKeys, getVerificationKeys } from '../mocks/verification_keys.js';
import { ProvingOrchestrator } from '../orchestrator/orchestrator.js';
import { EmptyRollupProver } from '../prover/empty.js';

const logger = createDebugLogger('aztec:prover:tx-prover');

/**
 * Factory function to create a simulation provider. Will attempt to use native binary simulation falling back to WASM if unavailable.
 * @param config - The provided sequencer client configuration
 * @returns The constructed simulation provider
 */
async function getSimulationProvider(config: ProverConfig): Promise<SimulationProvider> {
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
 * A prover accepting individual transaction requests
 */
export class TxProver implements ProverClient {
  private orchestrator: ProvingOrchestrator;
  constructor(
    worldStateSynchronizer: WorldStateSynchronizer,
    simulationProvider: SimulationProvider,
    protected vks: VerificationKeys,
  ) {
    this.orchestrator = new ProvingOrchestrator(
      worldStateSynchronizer.getLatest(),
      simulationProvider,
      getVerificationKeys(),
      new EmptyRollupProver(),
    );
  }

  /**
   * Starts the prover instance
   */
  public start() {
    this.orchestrator.start();
    return Promise.resolve();
  }

  /**
   * Stops the prover instance
   */
  public async stop() {
    await this.orchestrator.stop();
  }

  /**
   *
   * @param config - The prover configuration.
   * @param worldStateSynchronizer - An instance of the world state
   * @returns An instance of the prover, constructed and started.
   */
  public static async new(config: ProverConfig, worldStateSynchronizer: WorldStateSynchronizer) {
    const prover = new TxProver(worldStateSynchronizer, await getSimulationProvider(config), getVerificationKeys());
    await prover.start();
    return prover;
  }

  public startNewBlock(
    numTxs: number,
    globalVariables: GlobalVariables,
    newL1ToL2Messages: Fr[],
    emptyTx: ProcessedTx,
  ): Promise<ProvingTicket> {
    return this.orchestrator.startNewBlock(numTxs, globalVariables, newL1ToL2Messages, emptyTx);
  }

  public addNewTx(tx: ProcessedTx): Promise<void> {
    return this.orchestrator.addNewTx(tx);
  }
}
