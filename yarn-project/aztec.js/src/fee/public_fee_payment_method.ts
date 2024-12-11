import { type FunctionCall } from '@aztec/circuit-types';
import { type GasSettings } from '@aztec/circuits.js';
import { FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';

import { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import { type AccountWallet } from '../wallet/account_wallet.js';
import { type FeePaymentMethod } from './fee_payment_method.js';

/**
 * Holds information about how the fee for a transaction is to be paid.
 */
export class PublicFeePaymentMethod implements FeePaymentMethod {
  private assetPromise: Promise<AztecAddress> | null = null;

  constructor(
    /**
     * Address which will hold the fee payment.
     */
    protected paymentContract: AztecAddress,
    /**
     * An auth witness provider to authorize fee payments
     */
    protected wallet: AccountWallet,
  ) {}

  /**
   * The asset used to pay the fee.
   * @returns The asset used to pay the fee.
   */
  getAsset(): Promise<AztecAddress> {
    if (!this.assetPromise) {
      const interaction = new ContractFunctionInteraction(
        this.wallet,
        this.paymentContract,
        {
          name: 'get_accepted_asset',
          functionType: FunctionType.PUBLIC,
          isInternal: false,
          isStatic: true,
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
    const nonce = Fr.random();
    const maxFee = gasSettings.getFeeLimit();

    return Promise.resolve([
      this.wallet
        .setPublicAuthWit(
          {
            caller: this.paymentContract,
            action: {
              name: 'transfer_in_public',
              args: [this.wallet.getAddress().toField(), this.paymentContract.toField(), maxFee, nonce],
              selector: FunctionSelector.fromSignature('transfer_in_public((Field),(Field),Field,Field)'),
              type: FunctionType.PUBLIC,
              isStatic: false,
              to: await this.getAsset(),
              returnTypes: [],
            },
          },
          true,
        )
        .request(),
      {
        name: 'fee_entrypoint_public',
        to: this.paymentContract,
        selector: FunctionSelector.fromSignature('fee_entrypoint_public(Field,Field)'),
        type: FunctionType.PRIVATE,
        isStatic: false,
        args: [maxFee, nonce],
        returnTypes: [],
      },
    ]);
  }
}
