import type { FeePaymentMethod } from '@aztec/aztec.js/fee';
import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

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
        {
          name: 'sponsor_unconditionally',
          to: this.paymentContract,
          selector: await FunctionSelector.fromSignature('sponsor_unconditionally()'),
          type: FunctionType.PRIVATE,
          isStatic: false,
          args: [],
          returnTypes: [],
        },
      ],
      [],
      [],
    );
  }
}
