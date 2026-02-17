import { Fr } from '@aztec/foundation/curves/bn254';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { FunctionCall, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';
import { ExecutionPayload } from '@aztec/stdlib/tx';

import type { L2AmountClaim } from '../ethereum/portal_manager.js';
import type { FeePaymentMethod } from './fee_payment_method.js';

/**
 * Pay fee directly with Fee Juice claimed in the same tx. Claiming consumes an L1 to L2 message that "contains"
 * the fee juice bridged from L1.
 */
export class FeeJuicePaymentMethodWithClaim implements FeePaymentMethod {
  constructor(
    private sender: AztecAddress,
    private claim: Pick<L2AmountClaim, 'claimAmount' | 'claimSecret' | 'messageLeafIndex'>,
  ) {}

  /**
   * Creates an execution payload to pay the fee in Fee Juice.
   * @returns An execution payload that just contains the `claim_and_end_setup` function call.
   */
  async getExecutionPayload(): Promise<ExecutionPayload> {
    const selector = await FunctionSelector.fromSignature('claim_and_end_setup((Field),u128,Field,Field)');

    return new ExecutionPayload(
      [
        FunctionCall.from({
          name: 'claim_and_end_setup',
          to: ProtocolContractAddress.FeeJuice,
          selector,
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [
            this.sender.toField(),
            new Fr(this.claim.claimAmount),
            this.claim.claimSecret,
            new Fr(this.claim.messageLeafIndex),
          ],
          returnTypes: [],
        }),
      ],
      [],
      [],
      [],
      this.sender, // feePayer
    );
  }

  getAsset() {
    return Promise.resolve(ProtocolContractAddress.FeeJuice);
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.sender);
  }

  getGasSettings(): GasSettings | undefined {
    return;
  }
}
