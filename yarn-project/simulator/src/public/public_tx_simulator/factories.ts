import type { LoggerBindings } from '@aztec/foundation/log';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { GlobalVariables } from '@aztec/stdlib/tx';
import type { TelemetryClient } from '@aztec/telemetry-client';

import type { CdbIpcServer } from '../cdb_ipc_server.js';
import type { PublicContractsDB } from '../public_db_sources.js';
import { type AvmIpcBackend, TelemetryCppPublicTxSimulator } from './cpp_public_tx_simulator.js';

/**
 * Creates an IPC-based public tx simulator for block building.
 * Sends simulation commands to an external aztec-avm process over UDS.
 */
export function createPublicTxSimulatorForBlockBuilding(
  avmBackend: AvmIpcBackend,
  globalVariables: GlobalVariables,
  telemetryClient: TelemetryClient,
  bindings?: LoggerBindings,
  wsdbForkId?: number,
  cdbWiring?: { cdbServer: CdbIpcServer; contractsDB: PublicContractsDB },
) {
  const config = PublicSimulatorConfig.from({
    skipFeeEnforcement: false,
    collectDebugLogs: false,
    collectHints: false,
    collectPublicInputs: false,
    collectStatistics: false,
    collectCallMetadata: false,
  });
  return new TelemetryCppPublicTxSimulator(
    avmBackend,
    globalVariables,
    telemetryClient,
    config,
    bindings,
    wsdbForkId,
    cdbWiring,
  );
}
