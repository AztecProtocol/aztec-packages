import { type Logger, createLogger } from '@aztec/foundation/log';

import { promises as fs } from 'fs';

import { NativeACVMSimulator } from './acvm_native.js';
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
  config: SimulatorConfig,
  logger: Logger = createLogger('simulator'),
): Promise<CircuitSimulator> {
  if (config.acvmBinaryPath && config.acvmWorkingDirectory) {
    try {
      await fs.access(config.acvmBinaryPath, fs.constants.R_OK);
      await fs.mkdir(config.acvmWorkingDirectory, { recursive: true });
      logger.info(`Using native ACVM at ${config.acvmBinaryPath} and working directory ${config.acvmWorkingDirectory}`);
      return new NativeACVMSimulator(config.acvmWorkingDirectory, config.acvmBinaryPath);
    } catch {
      logger.warn(`Failed to access ACVM at ${config.acvmBinaryPath}, falling back to WASM`);
    }
  }
  logger.info('Using WASM ACVM simulation');
  return new WASMSimulator();
}
