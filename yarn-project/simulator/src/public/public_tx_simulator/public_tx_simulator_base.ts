import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { ProtocolContractsList } from '@aztec/protocol-contracts';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { GlobalVariables, ProtocolContracts, Tx } from '@aztec/stdlib/tx';

import type { AvmSimulator } from '../avm_simulator_pool.js';

/**
 * Shared base for public tx simulators. Holds the common configuration, the AVM IPC backend used to
 * drive the external C++ simulator, the WSDB fork ID for routing, the logger, and the tx-hash helper.
 * Concrete simulators (e.g. the C++ simulator) extend this and implement `simulate`.
 *
 * The C++ AVM runs in an external bb-avm-sim process and reaches world state via WSDB IPC and contract
 * data via CDB IPC; the contract DB is registered on the CDB server by the caller using `wsdbForkId`.
 */
export abstract class PublicTxSimulatorBase {
  protected log: Logger;
  protected readonly config: PublicSimulatorConfig;
  protected readonly bindings?: LoggerBindings;

  constructor(
    protected avmSimulator: AvmSimulator,
    protected globalVariables: GlobalVariables,
    config?: Partial<PublicSimulatorConfig>,
    protected protocolContracts: ProtocolContracts = ProtocolContractsList,
    bindings?: LoggerBindings,
    protected wsdbForkId?: number,
  ) {
    this.config = PublicSimulatorConfig.from(config ?? {});
    this.bindings = bindings;
    this.log = createLogger(`simulator:public_tx_simulator`, bindings);
  }

  protected computeTxHash(tx: Tx) {
    return tx.getTxHash();
  }
}
