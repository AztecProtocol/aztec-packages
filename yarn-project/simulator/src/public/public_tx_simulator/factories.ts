import type { LoggerBindings } from '@aztec/foundation/log';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import type { GlobalVariables } from '@aztec/stdlib/tx';
import type { TelemetryClient } from '@aztec/telemetry-client';

import type { PublicContractsDB } from '../public_db_sources.js';
import { TelemetryCppPublicTxSimulator } from './cpp_public_tx_simulator.js';
import { DumpingCppPublicTxSimulator } from './dumping_cpp_public_tx_simulator.js';

/**
 * Creates a public tx simulator for block building.
 * Uses DumpingCppPublicTxSimulator if DUMP_AVM_INPUTS_TO_DIR env var is set (for CI/testing avm circuit),
 * otherwise uses TelemetryCppPublicTxSimulator (for production).
 */
export function createPublicTxSimulatorForBlockBuilding(
  merkleTree: MerkleTreeWriteOperations,
  contractsDB: PublicContractsDB,
  globalVariables: GlobalVariables,
  telemetryClient: TelemetryClient,
  bindings?: LoggerBindings,
) {
  const config = PublicSimulatorConfig.from({
    skipFeeEnforcement: false,
    collectDebugLogs: false,
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
    return new DumpingCppPublicTxSimulator(merkleTree, contractsDB, globalVariables, dumpingConfig, dumpDir, bindings);
  }
  return new TelemetryCppPublicTxSimulator(merkleTree, contractsDB, globalVariables, telemetryClient, config, bindings);
}
