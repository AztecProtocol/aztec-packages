export { AvmSimulatorPool, type AvmSimulatorPoolOptions } from './avm_simulator_pool.js';
export type { PublicContractsDBInterface } from './db_interfaces.js';
export { PublicContractsDB } from './public_db_sources.js';
export { GuardedMerkleTreeOperations } from './public_processor/guarded_merkle_tree.js';
export { PublicProcessor, PublicProcessorFactory } from './public_processor/public_processor.js';
export type { AvmContractsDBContext, AvmSimulator } from './avm_simulator.js';
export {
  PublicTxSimulator,
  MeasuredPublicTxSimulator,
  createPublicTxSimulatorForBlockBuilding,
  DumpingPublicTxSimulator,
  type PublicTxSimulatorInterface,
  TelemetryPublicTxSimulator,
} from './public_tx_simulator/index.js';
export type { PublicTxResult, PublicSimulatorConfig as PublicTxSimulatorConfig } from '@aztec/stdlib/avm';
export { getCallRequestsWithCalldataByPhase } from './utils.js';
