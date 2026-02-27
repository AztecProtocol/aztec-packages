import type { FeePaymentMethod } from '@aztec/aztec.js/fee';
import { FunctionCall, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';
import { ExecutionPayload } from '@aztec/stdlib/tx';

/**
 * A fee payment method that uses a contract that blindly sponsors transactions.
 * This contract is expected to be prefunded in testing environments.
 */
export class SponsoredFeePaymentMethod implements FeePaymentMethod {
  constructor(private paymentContract: AztecAddress) {}

  getAsset(): Promise<AztecAddress> {
    throw new Error('Asset is not required for sponsored fpc.');
  }

  getFeePayer() {
    return Promise.resolve(this.paymentContract);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        FunctionCall.from({
          name: 'sponsor_unconditionally',
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature('sponsor_unconditionally()'),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [],
          returnTypes: [],
        }),
      ],
      [],
      [],
      [],
      this.paymentContract, // feePayer
    );
  }

  getGasSettings(): GasSettings | undefined {
    return;
  }
}
