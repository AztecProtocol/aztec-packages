import { type FunctionCall } from '@aztec/circuit-types';
import { type AztecAddress, Fr, FunctionSelector } from '@aztec/circuits.js';
import { FunctionType } from '@aztec/foundation/abi';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { FeeJuicePaymentMethod } from './fee_juice_payment_method.js';

/**
 * Pay fee directly with Fee Juice claimed on the same tx.
 */
export class FeeJuicePaymentMethodWithClaim extends FeeJuicePaymentMethod {
  constructor(sender: AztecAddress, private claimAmount: bigint | Fr, private claimSecret: Fr) {
    super(sender);
  }

  /**
   * Creates a function call to pay the fee in Fee Juice.
   * @returns A function call
   */
  override getFunctionCalls(): Promise<FunctionCall[]> {
    return Promise.resolve([
      {
        to: ProtocolContractAddress.FeeJuice,
        name: 'claim',
        selector: FunctionSelector.fromSignature('claim((Field),Field,Field)'),
        isStatic: false,
        args: [this.sender, new Fr(this.claimAmount), this.claimSecret],
        returnTypes: [],
        type: FunctionType.PRIVATE,
      },
    ]);
  }
}
