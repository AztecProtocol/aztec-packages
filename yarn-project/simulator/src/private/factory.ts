import { type Logger, type LoggerBindings, resolveLogger } from '@aztec/foundation/log';

import { AcvmSimulator } from './acvm_simulator.js';
import { WASMSimulator } from './acvm_wasm.js';
import type { CircuitSimulator } from './circuit_simulator.js';

export type SimulatorConfig = {
  acvmBinaryPath?: string;
  acvmWorkingDirectory?: string;
};

export function getSimulatorConfigFromEnv() {
  const { ACVM_BINARY_PATH, ACVM_WORKING_DIRECTORY } = process.env;
  return {
    acvmWorkingDirectory: ACVM_WORKING_DIRECTORY ? ACVM_WORKING_DIRECTORY : undefined,
    acvmBinaryPath: ACVM_BINARY_PATH ? ACVM_BINARY_PATH : undefined,
  };
}

export async function createSimulator(
  _config: SimulatorConfig,
  loggerOrBindings?: Logger | LoggerBindings,
): Promise<CircuitSimulator> {
  const logger = resolveLogger('simulator', loggerOrBindings);
  try {
    const simulator = await AcvmSimulator.create(logger.createChild('acvm'));
    logger.info('Using native acvm-sim simulation');
    return simulator;
  } catch (err) {
    logger.warn(`Failed to start native acvm-sim, falling back to WASM: ${err}`);
  }
  logger.info('Using WASM ACVM simulation');
  return new WASMSimulator(logger.createChild('wasm'));
}
