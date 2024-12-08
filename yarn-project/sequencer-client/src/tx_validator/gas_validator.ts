import { type Tx, TxExecutionPhase, type TxValidator } from '@aztec/circuit-types';
import { type AztecAddress, type Fr, FunctionSelector } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { computeFeePayerBalanceStorageSlot, getExecutionRequestsByPhase } from '@aztec/simulator';

/** Provides a view into public contract state */
export interface PublicStateSource {
  storageRead: (contractAddress: AztecAddress, slot: Fr) => Promise<Fr>;
}

export class GasTxValidator implements TxValidator<Tx> {
  #log = createDebugLogger('aztec:sequencer:tx_validator:tx_gas');
  #publicDataSource: PublicStateSource;
  #feeJuiceAddress: AztecAddress;

  constructor(publicDataSource: PublicStateSource, feeJuiceAddress: AztecAddress, public enforceFees: boolean) {
    this.#publicDataSource = publicDataSource;
    this.#feeJuiceAddress = feeJuiceAddress;
  }

  async validateTxs(txs: Tx[]): Promise<[validTxs: Tx[], invalidTxs: Tx[]]> {
    const validTxs: Tx[] = [];
    const invalidTxs: Tx[] = [];

    for (const tx of txs) {
      if (await this.#validateTxFee(tx)) {
        validTxs.push(tx);
      } else {
        invalidTxs.push(tx);
      }
    }

    return [validTxs, invalidTxs];
  }

  validateTx(tx: Tx): Promise<boolean> {
    return this.#validateTxFee(tx);
  }

  async #validateTxFee(tx: Tx): Promise<boolean> {
    const feePayer = tx.data.feePayer;
    // TODO(@spalladino) Eventually remove the is_zero condition as we should always charge fees to every tx
    if (feePayer.isZero()) {
      if (this.enforceFees) {
        this.#log.warn(`Rejecting transaction ${tx.getTxHash()} due to missing fee payer`);
      } else {
        return true;
      }
    }

    // Compute the maximum fee that this tx may pay, based on its gasLimits and maxFeePerGas
    const feeLimit = tx.data.constants.txContext.gasSettings.getFeeLimit();

    // Read current balance of the feePayer
    const initialBalance = await this.#publicDataSource.storageRead(
      this.#feeJuiceAddress,
      await computeFeePayerBalanceStorageSlot(feePayer),
    );

    // If there is a claim in this tx that increases the fee payer balance in Fee Juice, add it to balance
    const setupFns = getExecutionRequestsByPhase(tx, TxExecutionPhase.SETUP);
    const claimFunctionCall = (
      await Promise.all(
        setupFns.map(async fn => {
          const found =
            fn.callContext.contractAddress.equals(this.#feeJuiceAddress) &&
            fn.callContext.msgSender.equals(this.#feeJuiceAddress) &&
            fn.args.length > 2 &&
            // Public functions get routed through the dispatch function, whose first argument is the target function selector.
            fn.args[0].equals(
              (await FunctionSelector.fromSignature('_increase_public_balance((Field),Field)')).toField(),
            ) &&
            fn.args[1].equals(feePayer.toField()) &&
            !fn.callContext.isStaticCall;
          return found ? fn : undefined;
        }),
      )
    ).find(fn => !!fn);

    const balance = claimFunctionCall ? initialBalance.add(claimFunctionCall.args[2]) : initialBalance;
    if (balance.lt(feeLimit)) {
      this.#log.info(`Rejecting transaction due to not enough fee payer balance`, {
        feePayer,
        balance: balance.toBigInt(),
        feeLimit: feeLimit.toBigInt(),
      });
      return false;
    }
    return true;
  }
}
