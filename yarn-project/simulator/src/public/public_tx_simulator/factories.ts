import type { LoggerBindings } from '@aztec/foundation/log';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import type { GlobalVariables } from '@aztec/stdlib/tx';
import type { TelemetryClient } from '@aztec/telemetry-client';

import type { PublicContractsDB } from '../public_db_sources.js';
import { DumpingPublicTxSimulator } from './dumping_public_tx_simulator.js';
import { TelemetryPublicTxSimulator } from './public_tx_simulator.js';

/**
 * Creates a public tx simulator for block building.
 * Uses DumpingPublicTxSimulator if DUMP_AVM_INPUTS_TO_DIR env var is set (for CI/testing avm circuit),
 * otherwise uses TelemetryPublicTxSimulator (for production).
 */
export function createPublicTxSimulatorForBlockBuilding(
  merkleTree: MerkleTreeWriteOperations,
  contractsDB: PublicContractsDB,
  globalVariables: GlobalVariables,
  telemetryClient: TelemetryClient,
  bindings?: LoggerBindings,
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
    return new DumpingPublicTxSimulator(merkleTree, contractsDB, globalVariables, dumpingConfig, dumpDir, bindings);
  }
  return new TelemetryPublicTxSimulator(merkleTree, contractsDB, globalVariables, telemetryClient, config, bindings);
}
