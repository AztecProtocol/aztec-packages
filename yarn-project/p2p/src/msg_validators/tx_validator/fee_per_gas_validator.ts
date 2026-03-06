import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { GasFees } from '@aztec/stdlib/gas';
import {
  TX_ERROR_INSUFFICIENT_FEE_PER_GAS,
  type Tx,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

/**
 * Validates that a transaction's max fee per gas meets the current block's gas fees.
 *
 * Rejects transactions whose maxFeesPerGas is below the current block's gas fees.
 * This check is only meaningful during block building — a tx with low fee-per-gas
 * should not be included in the current block, but may become eligible in a later
 * block with lower fees.
 *
 * Used by: block building validator only.
 */
export class FeePerGasValidator implements TxValidator<Tx> {
  #log: Logger;
  #gasFees: GasFees;

  constructor(gasFees: GasFees, bindings?: LoggerBindings) {
    this.#log = createLogger('sequencer:tx_validator:fee_per_gas', bindings);
    this.#gasFees = gasFees;
  }

  validateTx(tx: Tx): Promise<TxValidationResult> {
    const maxFeesPerGas = tx.data.constants.txContext.gasSettings.maxFeesPerGas;
    const notEnoughMaxFees =
      maxFeesPerGas.feePerDaGas < this.#gasFees.feePerDaGas || maxFeesPerGas.feePerL2Gas < this.#gasFees.feePerL2Gas;

    if (notEnoughMaxFees) {
      this.#log.verbose(`Rejecting transaction ${tx.getTxHash().toString()} due to insufficient fee per gas`, {
        txMaxFeesPerGas: maxFeesPerGas.toInspect(),
        currentGasFees: this.#gasFees.toInspect(),
      });
      return Promise.resolve({ result: 'invalid', reason: [TX_ERROR_INSUFFICIENT_FEE_PER_GAS] });
    }

    return Promise.resolve({ result: 'valid' });
  }
}
