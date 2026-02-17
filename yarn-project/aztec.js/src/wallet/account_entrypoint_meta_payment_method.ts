import { AccountFeePaymentMethodOptions } from '@aztec/entrypoints/account';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';
import { ExecutionPayload } from '@aztec/stdlib/tx';

import type { Account } from '../account/account.js';
import type { FeePaymentMethod } from '../fee/fee_payment_method.js';

/**
 * Fee payment method that allows an account contract to pay for its own deployment
 * It works by rerouting the provided fee payment method through the account's entrypoint,
 * which sets itself as fee payer. If no payment method is provided, it is assumed the
 * account will pay with its own fee juice balance.
 *
 * Usually, in order to pay fees it is necessary to obtain an ExecutionPayload that encodes the necessary information
 * that is sent to the user's account entrypoint, that has plumbing to handle it.
 * If there's no account contract yet (it's being deployed) a MultiCallContract is used, which doesn't have a concept of fees or
 * how to handle this payload.
 * HOWEVER, the account contract's entrypoint does, so this method reshapes that fee payload into a call to the account contract entrypoint
 * being deployed with the original fee payload.
 *
 * This class can be seen in action in DeployAccountMethod.ts#getSelfPaymentMethod
 */
export class AccountEntrypointMetaPaymentMethod implements FeePaymentMethod {
  constructor(
    private account: Account,
    private paymentMethod?: FeePaymentMethod,
    private feeEntrypointOptions?: any,
  ) {}

  getAsset(): Promise<AztecAddress> {
    return this.paymentMethod?.getAsset() ?? Promise.resolve(ProtocolContractAddress.FeeJuice);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    // Get the execution payload for the fee
    const innerPayload = (await this.paymentMethod?.getExecutionPayload()) ?? ExecutionPayload.empty();

    // If no fee entrypoint options were provided, compute them based on the wrapped payment method
    // This mimics how the actual account contract works when invoked directly:
    // - If we are the fee payer, are there calls in the inner payload? In that case, those calls can
    //   only be claiming fee juice, so we use FEE_JUICE_WITH_CLAIM
    // - If we are the fee payer, but there are no calls, then we assume the account already has
    //   fee juice and can pay directly with PREEXISTING_FEE_JUICE
    // - If we are not the fee payer, then EXTERNAL is used
    let options = this.feeEntrypointOptions;
    if (!options) {
      const feePayer = (await this.paymentMethod?.getFeePayer()) ?? this.account.getAddress();
      const isFeePayer = feePayer.equals(this.account.getAddress());

      let accountFeePaymentMethodOptions = AccountFeePaymentMethodOptions.EXTERNAL;
      if (isFeePayer) {
        accountFeePaymentMethodOptions =
          innerPayload.calls.length === 0
            ? AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE
            : AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM;
      }

      options = { feePaymentMethodOptions: accountFeePaymentMethodOptions };
    }

    // Use the generic wrapping mechanism from the account interface
    return this.account.wrapExecutionPayload(innerPayload, options);
  }

  getFeePayer(): Promise<AztecAddress> {
    return this.paymentMethod?.getFeePayer() ?? Promise.resolve(this.account.getAddress());
  }

  getGasSettings(): GasSettings | undefined {
    return this.paymentMethod?.getGasSettings();
  }
}
