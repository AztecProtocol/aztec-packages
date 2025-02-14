import { type FunctionCall } from '@aztec/circuit-types';
import { type AztecAddress, Fr, FunctionSelector } from '@aztec/circuits.js';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { getCanonicalFeeJuice } from '@aztec/protocol-contracts/fee-juice';
import { FunctionType, U128 } from '@aztec/stdlib/abi';

import { type L2AmountClaim } from '../api/ethereum/portal_manager.js';
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
  override async getFunctionCalls(): Promise<FunctionCall[]> {
    const canonicalFeeJuice = await getCanonicalFeeJuice();
    const selector = await FunctionSelector.fromNameAndParameters(
      canonicalFeeJuice.artifact.functions.find(f => f.name === 'claim')!,
    );

    return Promise.resolve([
      {
        to: ProtocolContractAddress.FeeJuice,
        name: 'claim',
        selector,
        isStatic: false,
        args: [
          this.sender.toField(),
          ...new U128(this.claim.claimAmount).toFields(),
          this.claim.claimSecret,
          new Fr(this.claim.messageLeafIndex),
        ],
        returnTypes: [],
        type: FunctionType.PRIVATE,
      },
    ]);
  }
}
