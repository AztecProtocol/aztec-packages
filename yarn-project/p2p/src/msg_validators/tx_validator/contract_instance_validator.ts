import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { ContractInstancePublishedEvent } from '@aztec/protocol-contracts/instance-registry';
import { computeContractAddressFromInstance } from '@aztec/stdlib/contract';
import {
  TX_ERROR_INCORRECT_CONTRACT_ADDRESS,
  TX_ERROR_MALFORMED_CONTRACT_INSTANCE_LOG,
  type Tx,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

/** Validates that contract instance deployment logs contain correct addresses. */
export class ContractInstanceTxValidator implements TxValidator<Tx> {
  #log: Logger;

  constructor(bindings?: LoggerBindings) {
    this.#log = createLogger('p2p:tx_validator:contract_instance', bindings);
  }

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    const reason = await this.#hasCorrectContractInstanceAddresses(tx);
    return reason ? { result: 'invalid', reason: [reason] } : { result: 'valid' };
  }

  async #hasCorrectContractInstanceAddresses(tx: Tx): Promise<string | undefined> {
    const privateLogs = tx.data.getNonEmptyPrivateLogs();
    for (const log of privateLogs) {
      if (!ContractInstancePublishedEvent.isContractInstancePublishedEvent(log)) {
        continue;
      }

      let event;
      try {
        event = ContractInstancePublishedEvent.fromLog(log);
      } catch (e) {
        this.#log.warn(`Rejecting tx ${tx.getTxHash()}: failed to parse contract instance event: ${e}`);
        return TX_ERROR_MALFORMED_CONTRACT_INSTANCE_LOG;
      }

      try {
        const instance = event.toContractInstance();
        const computedAddress = await computeContractAddressFromInstance(instance);
        if (!computedAddress.equals(instance.address)) {
          this.#log.warn(
            `Rejecting tx ${tx.getTxHash()}: contract instance address mismatch. Claimed ${instance.address}, computed ${computedAddress}`,
          );
          return TX_ERROR_INCORRECT_CONTRACT_ADDRESS;
        }
      } catch (e) {
        this.#log.warn(`Rejecting tx ${tx.getTxHash()}: failed to compute contract instance address: ${e}`);
        return TX_ERROR_MALFORMED_CONTRACT_INSTANCE_LOG;
      }
    }
    return undefined;
  }
}
