import { type FunctionCall } from '@aztec/circuit-types';
import { type AztecAddress, Fr, FunctionSelector } from '@aztec/circuits.js';
import { FunctionType } from '@aztec/foundation/abi';
import { ProtocolContractAddress, ProtocolContractArtifact } from '@aztec/protocol-contracts';

import { type L2AmountClaim } from '../utils/portal_manager.js';
import { FeeJuicePaymentMethod } from './fee_juice_payment_method.js';

/**
 * Pay fee directly with Fee Juice claimed on the same tx.
 */
export class FeeJuicePaymentMethodWithClaim extends FeeJuicePaymentMethod {
  constructor(
    sender: AztecAddress,
    private claim: Pick<L2AmountClaim, 'claimAmount' | 'claimSecret' | 'messageLeafIndex'>,
  ) {
    super(sender);
  }

  /**
   * Creates a function call to pay the fee in Fee Juice.
   * @returns A function call
   */
  override getFunctionCalls(): Promise<FunctionCall[]> {
    const selector = FunctionSelector.fromNameAndParameters(
      ProtocolContractArtifact.FeeJuice.functions.find(f => f.name === 'claim')!,
    );

    return Promise.resolve([
      {
        to: ProtocolContractAddress.FeeJuice,
        name: 'claim',
        selector,
        isStatic: false,
        args: [
          this.sender.toField(),
          this.claim.claimAmount,
          this.claim.claimSecret,
          new Fr(this.claim.messageLeafIndex),
        ],
        returnTypes: [],
        type: FunctionType.PRIVATE,
      },
    ]);
  }
}
