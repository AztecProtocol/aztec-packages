import type { LoggerBindings } from '@aztec/foundation/log';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { GlobalVariables } from '@aztec/stdlib/tx';
import type { TelemetryClient } from '@aztec/telemetry-client';

import type { AvmIpcBackend } from '../avm_simulator_pool.js';
import { TelemetryCppPublicTxSimulator } from './cpp_public_tx_simulator.js';
import { DumpingCppPublicTxSimulator } from './dumping_cpp_public_tx_simulator.js';

/**
 * Creates an IPC-based public tx simulator for block building.
 * Uses DumpingCppPublicTxSimulator if DUMP_AVM_INPUTS_TO_DIR env var is set (for CI/testing AVM circuit),
 * otherwise uses TelemetryCppPublicTxSimulator (for production).
 */
export function createPublicTxSimulatorForBlockBuilding(
  avmBackend: AvmIpcBackend,
  globalVariables: GlobalVariables,
  telemetryClient: TelemetryClient,
  bindings?: LoggerBindings,
  wsdbForkId?: number,
  collectDebugLogs = false,
) {
  const config = PublicSimulatorConfig.from({
    skipFeeEnforcement: false,
    collectDebugLogs,
    collectHints: false,
    collectPublicInputs: false,
    collectStatistics: false,
    collectCallMetadata: false,
  });

  const dumpDir = process.env.DUMP_AVM_INPUTS_TO_DIR;
  if (dumpDir) {
    const dumpingConfig = { ...config, collectHints: true, collectPublicInputs: true };
    return new DumpingCppPublicTxSimulator(avmBackend, globalVariables, dumpingConfig, dumpDir, bindings, wsdbForkId);
  }

  return new TelemetryCppPublicTxSimulator(avmBackend, globalVariables, telemetryClient, config, bindings, wsdbForkId);
}
