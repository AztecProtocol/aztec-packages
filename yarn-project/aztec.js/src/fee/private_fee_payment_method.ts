import { type FunctionCall } from '@aztec/circuit-types';
import { type GasSettings } from '@aztec/circuits.js';
import { FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';

import { type Wallet } from '../account/wallet.js';
import { type FeePaymentMethod } from './fee_payment_method.js';

/**
 * Holds information about how the fee for a transaction is to be paid.
 */
export class PrivateFeePaymentMethod implements FeePaymentMethod {
  constructor(
    /**
     * The asset used to pay the fee.
     */
    private asset: AztecAddress,
    /**
     * Address which will hold the fee payment.
     */
    private paymentContract: AztecAddress,

    /**
     * An auth witness provider to authorize fee payments
     */
    private wallet: Wallet,

    /**
     * Address that the FPC sends notes it receives to.
     */
    private feeRecipient: AztecAddress,

    /**
     * If true, the max fee will be set to 1.
     * TODO(#7694): Remove this param once the lacking feature in TXE is implemented.
     */
    private setMaxFeeToOne = false,
  ) {}

  /**
   * The asset used to pay the fee.
   * @returns The asset used to pay the fee.
   */
  getAsset() {
    return this.asset;
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.paymentContract);
  }

  /**
   * Creates a function call to pay the fee in the given asset.
   * @param gasSettings - The gas settings.
   * @returns The function call to pay the fee.
   */
  async getFunctionCalls(gasSettings: GasSettings): Promise<FunctionCall[]> {
    // We assume 1:1 exchange rate between fee juice and token. But in reality you would need to convert feeLimit
    // (maxFee) to be in token denomination.
    const maxFee = this.setMaxFeeToOne ? Fr.ONE : gasSettings.getFeeLimit();
    const nonce = Fr.random();

    await this.wallet.createAuthWit({
      caller: this.paymentContract,
      action: {
        name: 'setup_refund',
        args: [this.feeRecipient.toField(), this.wallet.getAddress().toField(), maxFee, nonce],
        selector: FunctionSelector.fromSignature('setup_refund((Field),(Field),Field,Field)'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        to: this.asset,
        returnTypes: [],
      },
    });

    return [
      {
        name: 'fee_entrypoint_private',
        to: this.paymentContract,
        selector: FunctionSelector.fromSignature('fee_entrypoint_private(Field,(Field),Field)'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        args: [maxFee, this.asset.toField(), nonce],
        returnTypes: [],
      },
    ];
  }
}
