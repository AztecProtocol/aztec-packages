import type { FeePaymentMethod } from '@aztec/aztec.js/fee';
import type { ExecutionPayload, ExecutionRequestInit } from '@aztec/entrypoints/interfaces';
import { FunctionCall, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
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
    return {
      calls: [
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
      authWitnesses: [],
      capsules: [],
    };
  }
}
