import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { ProtocolContractsList } from '@aztec/protocol-contracts';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import type { GlobalVariables, ProtocolContracts, Tx } from '@aztec/stdlib/tx';

import type { PublicContractsDB } from '../public_db_sources.js';

/**
 * Shared base for public tx simulators. Holds the common configuration, world-state and contract DB
 * handles, logger, and the tx-hash helper. Concrete simulators (e.g. the C++ simulator) extend this
 * and implement `simulate`.
 */
export abstract class PublicTxSimulatorBase {
  protected log: Logger;
  protected readonly config: PublicSimulatorConfig;
  protected readonly bindings?: LoggerBindings;

  constructor(
    protected merkleTree: MerkleTreeWriteOperations,
    protected contractsDB: PublicContractsDB,
    protected globalVariables: GlobalVariables,
    config?: Partial<PublicSimulatorConfig>,
    protected protocolContracts: ProtocolContracts = ProtocolContractsList,
    bindings?: LoggerBindings,
  ) {
    this.config = PublicSimulatorConfig.from(config ?? {});
    this.bindings = bindings;
    this.log = createLogger(`simulator:public_tx_simulator`, bindings);
  }

  protected computeTxHash(tx: Tx) {
    return tx.getTxHash();
  }
}
