import { Fr } from '@aztec/foundation/fields';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { FunctionCall } from '@aztec/stdlib/abi';
import { FunctionSelector, FunctionType } from '@aztec/stdlib/abi';

import type { L2AmountClaim } from '../api/ethereum/portal_manager.js';
import { getFeeJuice } from '../contract/protocol_contracts.js';
import type { Wallet } from '../wallet/index.js';
import { FeeJuicePaymentMethod } from './fee_juice_payment_method.js';

/**
 * Pay fee directly with Fee Juice claimed on the same tx.
 */
export class FeeJuicePaymentMethodWithClaim extends FeeJuicePaymentMethod {
  constructor(
    private senderWallet: Wallet,
    private claim: Pick<L2AmountClaim, 'claimAmount' | 'claimSecret' | 'messageLeafIndex'>,
  ) {
    super(senderWallet.getAddress());
  }

  /**
   * Creates a function call to pay the fee in Fee Juice.
   * @returns A function call
   */
  override async getFunctionCalls(): Promise<FunctionCall[]> {
    const canonicalFeeJuice = await getFeeJuice(this.senderWallet);
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
          this.senderWallet.getAddress().toField(),
          new Fr(this.claim.claimAmount),
          this.claim.claimSecret,
          new Fr(this.claim.messageLeafIndex),
        ],
        returnTypes: [],
        type: FunctionType.PRIVATE,
      },
    ]);
  }
}
