import { DebugLogger } from '@aztec/foundation/log';
import { NativeACVMSimulator, SimulationProvider, WASMSimulator } from '@aztec/simulator';

import * as fs from 'fs/promises';

export async function getSimulationProvider(
  acvmBinaryPath?: string,
  acvmWorkingDirectory?: string,
  logger?: DebugLogger,
): Promise<SimulationProvider> {
  if (acvmBinaryPath && acvmWorkingDirectory) {
    try {
      await fs.access(acvmBinaryPath, fs.constants.R_OK);
      await fs.mkdir(acvmWorkingDirectory, { recursive: true });
      logger?.(`Using native ACVM at ${acvmBinaryPath} and working directory ${acvmWorkingDirectory}`);
      return new NativeACVMSimulator(acvmWorkingDirectory, acvmBinaryPath);
    } catch {
      logger?.(`Failed to access ACVM at ${acvmBinaryPath}, falling back to WASM`);
    }
  }
  logger?.('Using WASM ACVM simulation');
  return new WASMSimulator();
}
