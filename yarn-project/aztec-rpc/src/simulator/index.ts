import { AcirSimulator } from '@aztec/acir-simulator';
import { ContractNoteHashProvider, DataNoteHashProvider, KeyStore, L1ToL2MessageProvider } from '@aztec/types';

import { ContractDataOracle } from '../contract_data_oracle/index.js';
import { Database } from '../database/database.js';
import { SimulatorOracle } from '../simulator_oracle/index.js';

/**
 * Helper method to create an instance of the acir simulator.
 */
export function getAcirSimulator(
  db: Database,
  contractNoteHashProvider: ContractNoteHashProvider,
  l1ToL2MessageProvider: L1ToL2MessageProvider,
  dataNoteHashProvider: DataNoteHashProvider,
  keyStore: KeyStore,
  contractDataOracle?: ContractDataOracle,
) {
  const simulatorOracle = new SimulatorOracle(
    contractDataOracle ?? new ContractDataOracle(db, contractNoteHashProvider),
    db,
    keyStore,
    l1ToL2MessageProvider,
    dataNoteHashProvider,
  );
  return new AcirSimulator(simulatorOracle);
}
