import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { L2AmountClaim } from '../ethereum/portal_manager.js';
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
   * Creates an execution payload to pay the fee in Fee Juice.
   * @returns An execution payload that just contains the claim function call.
   */
  override async getExecutionPayload(): Promise<ExecutionPayload> {
    const selector = await FunctionSelector.fromSignature('claim((Field),u128,Field,Field)');

    return new ExecutionPayload(
      [
        {
          to: ProtocolContractAddress.FeeJuice,
          name: 'claim',
          selector,
          isStatic: false,
          args: [
            this.sender.toField(),
            new Fr(this.claim.claimAmount),
            this.claim.claimSecret,
            new Fr(this.claim.messageLeafIndex),
          ],
          returnTypes: [],
          type: FunctionType.PRIVATE,
        },
      ],
      [],
      [],
    );
  }
}
