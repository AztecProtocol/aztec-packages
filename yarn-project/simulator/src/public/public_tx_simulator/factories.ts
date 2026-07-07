import type { LoggerBindings } from '@aztec/foundation/log';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { GlobalVariables } from '@aztec/stdlib/tx';
import type { TelemetryClient } from '@aztec/telemetry-client';

import type { AvmSimulator } from '../avm_simulator.js';
import { DumpingPublicTxSimulator } from './dumping_public_tx_simulator.js';
import { TelemetryPublicTxSimulator } from './public_tx_simulator.js';

/**
 * Creates an IPC-based public tx simulator for block building.
 * Uses DumpingPublicTxSimulator if DUMP_AVM_INPUTS_TO_DIR env var is set (for CI/testing the AVM circuit),
 * otherwise uses TelemetryPublicTxSimulator (for production).
 */
export function createPublicTxSimulatorForBlockBuilding(
  avmSimulator: AvmSimulator,
  globalVariables: GlobalVariables,
  telemetryClient: TelemetryClient,
  bindings?: LoggerBindings,
  forkId?: number,
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
    // must collect hints and PIs for dumping
    const dumpingConfig = {
      ...config,
      collectHints: true,
      collectPublicInputs: true,
    };
    return new DumpingPublicTxSimulator(avmSimulator, globalVariables, dumpingConfig, dumpDir, bindings, forkId);
  }
  return new TelemetryPublicTxSimulator(avmSimulator, globalVariables, telemetryClient, config, bindings, forkId);
}
