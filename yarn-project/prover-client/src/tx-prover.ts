import { L2Block, ProcessedTx } from '@aztec/circuit-types';
import { ProverClient } from '@aztec/circuit-types/interfaces';
import { Fr, GlobalVariables, Proof } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { NativeACVMSimulator, SimulationProvider, WASMSimulator } from '@aztec/simulator';
import { WorldStateSynchronizer } from '@aztec/world-state';

import * as fs from 'fs/promises';

import { SoloBlockBuilder } from './block_builder/solo_block_builder.js';
import { ProverConfig } from './config.js';
import { getVerificationKeys } from './mocks/verification_keys.js';
import { EmptyRollupProver } from './prover/empty.js';
import { RealRollupCircuitSimulator } from './simulator/rollup.js';

const logger = createDebugLogger('aztec:prover-client');

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
  constructor(private worldStateSynchronizer: WorldStateSynchronizer, private simulationProvider: SimulationProvider) {}

  /**
   * Starts the prover instance
   */
  public async start() {
    return await Promise.resolve();
  }

  /**
   * Stops the prover instance
   */
  public async stop() {}

  /**
   *
   * @param config - The prover configuration.
   * @param worldStateSynchronizer - An instance of the world state
   * @returns An instance of the prover, constructed and started.
   */
  public static async new(config: ProverConfig, worldStateSynchronizer: WorldStateSynchronizer) {
    const prover = new TxProver(worldStateSynchronizer, await getSimulationProvider(config));
    await prover.start();
    return prover;
  }

  public async proveBlock(
    globalVariables: GlobalVariables,
    txs: ProcessedTx[],
    newModelL1ToL2Messages: Fr[], // TODO(#4492): Rename this when purging the old inbox
    newL1ToL2Messages: Fr[], // TODO(#4492): Nuke this when purging the old inbox
  ): Promise<[L2Block, Proof]> {
    const blockBuilder = new SoloBlockBuilder(
      this.worldStateSynchronizer.getLatest(),
      getVerificationKeys(),
      new RealRollupCircuitSimulator(this.simulationProvider),
      new EmptyRollupProver(),
    );
    return await blockBuilder.buildL2Block(globalVariables, txs, newModelL1ToL2Messages, newL1ToL2Messages);
  }
}
