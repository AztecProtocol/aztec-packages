import { type FunctionCall } from '@aztec/circuit-types';
import { type GasSettings } from '@aztec/circuits.js';
import { FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';

import { type Wallet } from '../account/wallet.js';
import { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import { SignerlessWallet } from '../wallet/signerless_wallet.js';
import { type FeePaymentMethod } from './fee_payment_method.js';

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
        name: 'setup_refund',
        args: [this.feeRecipient.toField(), this.wallet.getAddress().toField(), maxFee, nonce],
        selector: FunctionSelector.fromSignature('setup_refund((Field),(Field),Field,Field)'),
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
        selector: FunctionSelector.fromSignature('fee_entrypoint_private(Field,Field)'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        args: [maxFee, nonce],
        returnTypes: [],
      },
    ];
  }
}
