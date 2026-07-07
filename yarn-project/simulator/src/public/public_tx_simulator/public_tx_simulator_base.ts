import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { ProtocolContractsList } from '@aztec/protocol-contracts';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import type { GlobalVariables, ProtocolContracts, Tx } from '@aztec/stdlib/tx';

import type { AvmSimulator } from '../avm_simulator.js';

/**
 * Shared base for public tx simulators: holds the common configuration, the {@link AvmSimulator} used
 * to run the transaction's public calls, the fork id that routes the simulation's contract-data
 * lookups, the logger, and the tx-hash helper. Concrete simulators extend this and implement
 * `simulate`.
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
    protected forkId?: number,
  ) {
    this.config = PublicSimulatorConfig.from(config ?? {});
    this.bindings = bindings;
    this.log = createLogger(`simulator:public_tx_simulator`, bindings);
  }

  protected computeTxHash(tx: Tx) {
    return tx.getTxHash();
  }
}
