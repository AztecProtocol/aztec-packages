import type { FeePaymentMethod } from '@aztec/entrypoints/interfaces';
import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import { FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasSettings } from '@aztec/stdlib/gas';

import type { AccountWallet } from '../wallet/account_wallet.js';
import { simulateWithoutSignature } from './utils.js';

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
      // We use the utility method to avoid a signature because this function could be triggered
      // before the associated account is deployed.
      this.assetPromise = simulateWithoutSignature(
        this.wallet,
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
      ) as Promise<AztecAddress>;
    }
    return this.assetPromise!;
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.paymentContract);
  }

  /**
   * Creates an execution payload to pay the fee using a public function through an FPC in the desired asset
   * @param gasSettings - The gas settings.
   * @returns An execution payload that contains the required function calls.
   */
  async getExecutionPayload(gasSettings: GasSettings): Promise<ExecutionPayload> {
    const txNonce = Fr.random();
    const maxFee = gasSettings.getFeeLimit();

    const setPublicAuthWitInteraction = await this.wallet.setPublicAuthWit(
      {
        caller: this.paymentContract,
        action: {
          name: 'transfer_in_public',
          args: [this.wallet.getAddress().toField(), this.paymentContract.toField(), maxFee, txNonce],
          selector: await FunctionSelector.fromSignature('transfer_in_public((Field),(Field),u128,Field)'),
          type: FunctionType.PUBLIC,
          isStatic: false,
          to: await this.getAsset(),
          returnTypes: [],
        },
      },
      true,
    );

    return new ExecutionPayload(
      [
        ...(await setPublicAuthWitInteraction.request()).calls,
        {
          name: 'fee_entrypoint_public',
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature('fee_entrypoint_public(u128,Field)'),
          type: FunctionType.PRIVATE,
          isStatic: false,
          args: [maxFee, txNonce],
          returnTypes: [],
        },
      ],
      [],
      [],
    );
  }
}
