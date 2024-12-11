import { type AztecNode } from '@aztec/circuit-types';
import { type KeyStore } from '@aztec/key-store';
import { AcirSimulator } from '@aztec/simulator/client';

import { ContractDataOracle } from '../contract_data_oracle/index.js';
import { type PxeDatabase } from '../database/pxe_database.js';
import { SimulatorOracle } from '../simulator_oracle/index.js';
import { type Synchronizer } from '../synchronizer/synchronizer.js';

/**
 * Helper method to create an instance of the acir simulator.
 */
export function getAcirSimulator(
  synchronizer: Synchronizer,
  db: PxeDatabase,
  aztecNode: AztecNode,
  keyStore: KeyStore,
  contractDataOracle?: ContractDataOracle,
) {
  const simulatorOracle = new SimulatorOracle(
    synchronizer,
    contractDataOracle ?? new ContractDataOracle(db),
    db,
    keyStore,
    aztecNode,
  );
  return new AcirSimulator(simulatorOracle, aztecNode);
}
