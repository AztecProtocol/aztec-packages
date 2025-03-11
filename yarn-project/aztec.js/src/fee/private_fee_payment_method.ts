import { Fr } from '@aztec/foundation/fields';
import { type FunctionCall, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';

import type { Wallet } from '../account/wallet.js';
import { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import { SignerlessWallet } from '../wallet/signerless_wallet.js';
import type { FeePaymentMethod } from './fee_payment_method.js';

/**
 * Holds information about how the fee for a transaction is to be paid.
 */
export class PrivateFeePaymentMethod implements FeePaymentMethod {
  private assetPromise: Promise<AztecAddress> | null = null;

  constructor(
    /**
     * Address which will hold the fee payment.
     */
    private paymentContract: AztecAddress,

    /**
     * An auth witness provider to authorize fee payments
     */
    private wallet: Wallet,

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
  getAsset(): Promise<AztecAddress> {
    if (!this.assetPromise) {
      // We use signer-less wallet because this function could be triggered before the associated account is deployed.
      const signerlessWallet = new SignerlessWallet(this.wallet);

      const interaction = new ContractFunctionInteraction(
        signerlessWallet,
        this.paymentContract,
        {
          name: 'get_accepted_asset',
          functionType: FunctionType.PRIVATE,
          isInternal: false,
          isStatic: false,
          parameters: [],
          returnTypes: [
            {
              kind: 'struct',
              path: 'authwit::aztec::protocol_types::address::aztec_address::AztecAddress',
              fields: [
                {
                  name: 'inner',
                  type: {
                    kind: 'field',
                  },
                },
              ],
            },
          ],
          errorTypes: {},
          isInitializer: false,
        },
        [],
      );

      this.assetPromise = interaction.simulate();
    }
    return this.assetPromise!;
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
        name: 'transfer_to_public',
        args: [this.wallet.getAddress().toField(), this.paymentContract.toField(), maxFee, nonce],
        selector: await FunctionSelector.fromSignature('transfer_to_public((Field),(Field),u128,Field)'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        to: await this.getAsset(),
        returnTypes: [],
      },
    });

    return [
      {
        name: 'fee_entrypoint_private',
        to: this.paymentContract,
        selector: await FunctionSelector.fromSignature('fee_entrypoint_private(u128,Field)'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        args: [maxFee, nonce],
        returnTypes: [],
      },
    ];
  }
}
