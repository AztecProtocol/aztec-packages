export { PublicContractsDB } from './public_db_sources.js';
export { GuardedMerkleTreeOperations } from './public_processor/guarded_merkle_tree.js';
export { PublicProcessor, PublicProcessorFactory } from './public_processor/public_processor.js';
export {
  CppPublicTxSimulator,
  createPublicTxSimulatorForBlockBuilding,
  DumpingCppPublicTxSimulator,
  type PublicTxSimulatorInterface,
  TelemetryCppPublicTxSimulator,
} from './public_tx_simulator/index.js';
export type { PublicTxResult, PublicSimulatorConfig as PublicTxSimulatorConfig } from '@aztec/stdlib/avm';
export { getCallRequestsWithCalldataByPhase } from './utils.js';
