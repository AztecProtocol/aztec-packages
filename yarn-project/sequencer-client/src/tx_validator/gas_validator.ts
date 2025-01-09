import { type Tx, TxExecutionPhase, type TxValidationResult, type TxValidator } from '@aztec/circuit-types';
import { type AztecAddress, type Fr, FunctionSelector, type GasFees } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { computeFeePayerBalanceStorageSlot, getExecutionRequestsByPhase } from '@aztec/simulator';

/** Provides a view into public contract state */
export interface PublicStateSource {
  storageRead: (contractAddress: AztecAddress, slot: Fr) => Promise<Fr>;
}

export class GasTxValidator implements TxValidator<Tx> {
  #log = createLogger('sequencer:tx_validator:tx_gas');
  #publicDataSource: PublicStateSource;
  #feeJuiceAddress: AztecAddress;
  #enforceFees: boolean;
  #gasFees: GasFees;

  constructor(
    publicDataSource: PublicStateSource,
    feeJuiceAddress: AztecAddress,
    enforceFees: boolean,
    gasFees: GasFees,
  ) {
    this.#publicDataSource = publicDataSource;
    this.#feeJuiceAddress = feeJuiceAddress;
    this.#enforceFees = enforceFees;
    this.#gasFees = gasFees;
  }

  validateTx(tx: Tx): Promise<TxValidationResult> {
    if (this.#shouldSkip(tx)) {
      return Promise.resolve({ result: 'skipped', reason: ['Insufficient fee per gas'] });
    }
    return this.#validateTxFee(tx);
  }

  #shouldSkip(tx: Tx): boolean {
    const gasSettings = tx.data.constants.txContext.gasSettings;

    // Skip the tx if its max fees are not enough for the current block's gas fees.
    const maxFeesPerGas = gasSettings.maxFeesPerGas;
    const notEnoughMaxFees =
      maxFeesPerGas.feePerDaGas.lt(this.#gasFees.feePerDaGas) ||
      maxFeesPerGas.feePerL2Gas.lt(this.#gasFees.feePerL2Gas);

    if (notEnoughMaxFees) {
      this.#log.warn(`Skipping transaction ${tx.getTxHash()} due to insufficient fee per gas`);
    }
    return notEnoughMaxFees;
  }

  async #validateTxFee(tx: Tx): Promise<TxValidationResult> {
    const feePayer = tx.data.feePayer;
    // TODO(@spalladino) Eventually remove the is_zero condition as we should always charge fees to every tx
    if (feePayer.isZero()) {
      if (this.#enforceFees) {
        this.#log.warn(`Rejecting transaction ${tx.getTxHash()} due to missing fee payer`);
        return { result: 'invalid', reason: ['Missing fee payer'] };
      } else {
        return { result: 'valid' };
      }
    }

    // Compute the maximum fee that this tx may pay, based on its gasLimits and maxFeePerGas
    const feeLimit = tx.data.constants.txContext.gasSettings.getFeeLimit();

    // Read current balance of the feePayer
    const initialBalance = await this.#publicDataSource.storageRead(
      this.#feeJuiceAddress,
      computeFeePayerBalanceStorageSlot(feePayer),
    );

    // If there is a claim in this tx that increases the fee payer balance in Fee Juice, add it to balance
    const setupFns = getExecutionRequestsByPhase(tx, TxExecutionPhase.SETUP);
    const claimFunctionCall = setupFns.find(
      fn =>
        fn.callContext.contractAddress.equals(this.#feeJuiceAddress) &&
        fn.callContext.msgSender.equals(this.#feeJuiceAddress) &&
        fn.args.length > 2 &&
        // Public functions get routed through the dispatch function, whose first argument is the target function selector.
        fn.args[0].equals(FunctionSelector.fromSignature('_increase_public_balance((Field),Field)').toField()) &&
        fn.args[1].equals(feePayer.toField()) &&
        !fn.callContext.isStaticCall,
    );

    const balance = claimFunctionCall ? initialBalance.add(claimFunctionCall.args[2]) : initialBalance;
    if (balance.lt(feeLimit)) {
      this.#log.warn(`Rejecting transaction due to not enough fee payer balance`, {
        feePayer,
        balance: balance.toBigInt(),
        feeLimit: feeLimit.toBigInt(),
      });
      return { result: 'invalid', reason: ['Insufficient fee payer balance'] };
    }
    return { result: 'valid' };
  }
}
