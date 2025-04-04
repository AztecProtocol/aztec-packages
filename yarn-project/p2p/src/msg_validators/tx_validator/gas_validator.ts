import { createLogger } from '@aztec/foundation/log';
import { computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import { getCallRequestsWithCalldataByPhase } from '@aztec/simulator/server';
import { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasFees } from '@aztec/stdlib/gas';
import type { PublicStateSource } from '@aztec/stdlib/trees';
import { type Tx, TxExecutionPhase, type TxValidationResult, type TxValidator } from '@aztec/stdlib/tx';

export class GasTxValidator implements TxValidator<Tx> {
  #log = createLogger('sequencer:tx_validator:tx_gas');
  #publicDataSource: PublicStateSource;
  #feeJuiceAddress: AztecAddress;
  #gasFees: GasFees;

  constructor(publicDataSource: PublicStateSource, feeJuiceAddress: AztecAddress, gasFees: GasFees) {
    this.#publicDataSource = publicDataSource;
    this.#feeJuiceAddress = feeJuiceAddress;
    this.#gasFees = gasFees;
  }

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    if (await this.#shouldSkip(tx)) {
      return Promise.resolve({ result: 'skipped', reason: ['Insufficient fee per gas'] });
    }
    return this.#validateTxFee(tx);
  }

  /**
   * Check whether the tx's max fees are valid for the current block, and skip if not.
   * We skip instead of invalidating since the tx may become eligible later.
   * Note that circuits check max fees even if fee payer is unset, so we
   * keep this validation even if the tx does not pay fees.
   */
  async #shouldSkip(tx: Tx): Promise<boolean> {
    const gasSettings = tx.data.constants.txContext.gasSettings;

    // Skip the tx if its max fees are not enough for the current block's gas fees.
    const maxFeesPerGas = gasSettings.maxFeesPerGas;
    const notEnoughMaxFees =
      maxFeesPerGas.feePerDaGas.lt(this.#gasFees.feePerDaGas) ||
      maxFeesPerGas.feePerL2Gas.lt(this.#gasFees.feePerL2Gas);

    if (notEnoughMaxFees) {
      this.#log.warn(`Skipping transaction ${await tx.getTxHash()} due to insufficient fee per gas`, {
        txMaxFeesPerGas: maxFeesPerGas.toInspect(),
        currentGasFees: this.#gasFees.toInspect(),
      });
    }
    return notEnoughMaxFees;
  }

  async #validateTxFee(tx: Tx): Promise<TxValidationResult> {
    const feePayer = tx.data.feePayer;

    // Compute the maximum fee that this tx may pay, based on its gasLimits and maxFeePerGas
    const feeLimit = tx.data.constants.txContext.gasSettings.getFeeLimit();

    // Read current balance of the feePayer
    const initialBalance = await this.#publicDataSource.storageRead(
      this.#feeJuiceAddress,
      await computeFeePayerBalanceStorageSlot(feePayer),
    );

    // If there is a claim in this tx that increases the fee payer balance in Fee Juice, add it to balance
    const setupFns = getCallRequestsWithCalldataByPhase(tx, TxExecutionPhase.SETUP);
    const increasePublicBalanceSelector = await FunctionSelector.fromSignature(
      '_increase_public_balance((Field),u128)',
    );

    // Arguments of the claim function call:
    // - args[0]: Amount recipient.
    // - args[1]: Amount being claimed.
    const claimFunctionCall = setupFns.find(
      fn =>
        fn.request.contractAddress.equals(this.#feeJuiceAddress) &&
        fn.request.msgSender.equals(this.#feeJuiceAddress) &&
        fn.calldata.length > 2 &&
        fn.functionSelector.equals(increasePublicBalanceSelector) &&
        fn.args[0].equals(feePayer.toField()) &&
        !fn.request.isStaticCall,
    );

    const balance = claimFunctionCall ? initialBalance.add(claimFunctionCall.args[1]) : initialBalance;
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
